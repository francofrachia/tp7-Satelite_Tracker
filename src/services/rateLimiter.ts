/**
 * Controlador de tasa de peticiones (Rate Limiter) por proveedor y cola de reintentos
 * con backoff exponencial (Sección 4.3 del TP).
 */
export class RateLimiter {
  private requestTimestamps: number[] = [];
  private readonly maxPerMinute: number;
  private readonly maxPerHour: number;
  private readonly providerName: string;

  constructor(providerName: string, maxPerMinute: number, maxPerHour: number) {
    this.providerName = providerName;
    this.maxPerMinute = maxPerMinute;
    this.maxPerHour = maxPerHour;
  }

  private pruneOldRequests(now: number): void {
    const oneHourAgo = now - 3600 * 1000;
    this.requestTimestamps = this.requestTimestamps.filter((ts) => ts > oneHourAgo);
  }

  public canRequest(): { allowed: boolean; waitMs: number } {
    const now = Date.now();
    this.pruneOldRequests(now);

    const oneMinuteAgo = now - 60 * 1000;
    const requestsLastMinute = this.requestTimestamps.filter((ts) => ts > oneMinuteAgo);

    if (this.requestTimestamps.length >= this.maxPerHour) {
      const oldestInHour = this.requestTimestamps[0];
      return { allowed: false, waitMs: Math.max(1000, oldestInHour + 3600 * 1000 - now) };
    }

    if (requestsLastMinute.length >= this.maxPerMinute) {
      const oldestInMinute = requestsLastMinute[0];
      return { allowed: false, waitMs: Math.max(500, oldestInMinute + 60 * 1000 - now) };
    }

    return { allowed: true, waitMs: 0 };
  }

  public recordRequest(): void {
    this.requestTimestamps.push(Date.now());
  }

  public getStats(): { lastMinute: number; lastHour: number; maxPerMinute: number; maxPerHour: number } {
    const now = Date.now();
    this.pruneOldRequests(now);
    const oneMinuteAgo = now - 60 * 1000;
    return {
      lastMinute: this.requestTimestamps.filter((ts) => ts > oneMinuteAgo).length,
      lastHour: this.requestTimestamps.length,
      maxPerMinute: this.maxPerMinute,
      maxPerHour: this.maxPerHour,
    };
  }
}

/**
 * Ejecuta un fetch respetando el RateLimiter del proveedor y aplicando
 * reintentos con backoff exponencial ante fallas de red o HTTP 429/5xx.
 */
export async function fetchWithRetry(
  url: string,
  limiter: RateLimiter,
  options: RequestInit = {},
  maxRetries: number = 2,
  timeoutMs: number = 10000
): Promise<Response> {
  const status = limiter.canRequest();
  if (!status.allowed) {
    throw new Error(`Límite de uso alcanzado. Reintente en ${Math.ceil(status.waitMs / 1000)} s.`);
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      limiter.recordRequest();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (response.ok) {
        return response;
      }

      if (response.status === 429 || response.status >= 500) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        // Backoff exponencial: 800ms, 1600ms...
        const delayMs = 800 * Math.pow(2, attempt);
        await new Promise((res) => setTimeout(res, delayMs));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Error de red al consultar proveedor');
}
