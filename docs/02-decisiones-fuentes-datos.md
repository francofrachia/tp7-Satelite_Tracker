# Documento de Decisiones Arquitectónicas: Fuentes de Datos, Límites y Caso Starlink

**Materia:** Programación Móviles - 2026  
**Carrera:** Licenciatura en Sistemas de Información (FCyT - UADER)  
**Trabajo Práctico N° 7:** Satellite Tracker  

---

## 1. Caso de Estudio: Constelación Starlink y Restricciones de APIs Oficiales

Uno de los objetivos centrales del trabajo práctico es el seguimiento de la constelación **Starlink** de SpaceX como caso real de telecomunicaciones satelitales LEO. Durante el relevamiento técnico se identificaron las siguientes limitaciones en las interfaces oficiales de SpaceX:

1. **Starlink Enterprise APIs:** están orientadas exclusivamente a clientes corporativos/empresariales para gestionar cuentas, terminales de usuario (*dishes*), routers y telemetría de red. Requieren una cuenta *Enterprise* activa y **no exponen efemérides ni posiciones de los satélites de la constelación**.
2. **Space Traffic Coordination (STC) API:** es la interfaz donde SpaceX comparte trayectorias para prevención de colisiones espaciales. Sin embargo, su acceso está **restringido a operadores satelitales y agencias espaciales**, exigiendo autenticación mutua mediante certificados **mTLS firmados por SpaceX**.

### Justificación del uso del Set Suplementario (SupGP) de CelesTrak
Para superar esta limitación sin violar restricciones de acceso, la aplicación consume los **Datos Orbitales Suplementarios (*Supplemental GP / SupGP*)** publicados por CelesTrak (`https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=json` y el grupo general `GROUP=starlink`).
- Estos sets suplementarios son generados por CelesTrak directamente a partir de las **efemérides de alta precisión con covarianza** que SpaceX publica periódicamente para toda su flota activa.
- De esta forma, nuestra aplicación obtiene elementos orbitales actualizados y precisos de Starlink de forma pública, gratuita y legal, tratándolos detrás de nuestra interfaz abstracta `DataProvider`.

---

## 2. Formato OMM (JSON) vs. TLE Tradicional

Históricamente los elementos orbitales se distribuían en formato **TLE de 3 líneas** (nombre + 2 líneas de 69 caracteres con columnas fijas). Sin embargo:
- El formato TLE clásico reserva solo **5 dígitos** para el número de catálogo NORAD (`00001` a `99999`), o bien requiere el esquema alfanumérico *Alpha-5*.
- El estándar moderno recomendado por el CCSDS (*Consultative Committee for Space Data Systems*) y CelesTrak es **OMM (*Orbit Mean-Elements Message*)**, distribuido en formato **JSON**.

En nuestra aplicación:
- El proveedor principal consulta prioritariamente el formato **OMM/JSON** de CelesTrak y convierte/hidrata los elementos para `satellite.js`, manteniendo además soporte completo de TLE de dos líneas para compatibilidad con Space-Track, N2YO y `Where the ISS at?`.

---

## 3. Proveedores de Datos y Límites de Uso (Rate Limits)

Se diseñó una capa de abstracción (`DataProvider`) que desacopla la interfaz de usuario del origen de los datos. A continuación se detallan los proveedores integrados y sus políticas de uso:

| Proveedor | Rol en la Aplicación | Autenticación | Límites de Uso (Rate Limit) | TTL de Caché Configurado |
| :--- | :--- | :--- | :--- | :--- |
| **CelesTrak** | Proveedor primario de catálogos GP, OMM/TLE y SupGP de Starlink | Pública (sin API Key) | Actualiza 1 vez al día. Bloquea IPs que hagan *polling* continuo (máx. recomendado: pocas consultas por hora) | **12 horas** (alerta de obsolescencia a las 48 h) |
| **Space-Track.org** | Proveedor secundario / *Fallback* oficial del 18th SDS | Cuenta (`identity` / `password`) | Máx. **30 requests/minuto** y **300 requests/hora** | **12 horas** |
| **N2YO REST API** | Validación cruzada (cualquier satélite) y *Fallback* de TLE | API Key gratuita | **1.000 transacciones/hora** (TLE y posiciones); **100/hora** (pases) | **12 horas** para TLE; tiempo real bajo demanda en validación |
| **Where the ISS at?** | Validación cruzada inmediata para la ISS (NORAD 25544) y prototipado | Pública (sin API Key) | Máx. **1 request/segundo** | Tiempo real bajo demanda en pantalla de Validación |

---

## 4. Estrategia de Caché Local, Rate Limiting y Fallback Automático

Para cumplir con el requisito **RF-14** y garantizar que la app funcione incluso sin conexión a internet durante un pase satelital en campo:

1. **Cálculo 100% Local en Tiempo Real:** las APIs **jamás** se consultan en el ciclo de refresco del mapa (cada 2 segundos). Las APIs solo entregan los parámetros orbitales iniciales, y toda la propagación temporal se realiza localmente con SGP4.
2. **Caché Persistente con TTL (`AsyncStorage`):**
   - Cada catálogo o satélite descargado se almacena localmente junto con su `fetchedAt` (timestamp de descarga) y el `epoch` propio del elemento orbital.
   - Si los datos en caché tienen menos de **12 horas** (TTL vigente), la app los utiliza instantáneamente sin generar tráfico de red.
   - Si el dispositivo no tiene internet y el TTL expiró, la app utiliza los datos en caché como respaldo offline y muestra un indicador visual de antigüedad (**RF-16**).
3. **Rate Limiter con Backoff Exponencial:**
   - Cada proveedor pasa por un controlador de frecuencia (`RateLimiter`) que registra la ventana deslizante de peticiones por minuto y por hora.
   - Ante errores transitorios de red o códigos HTTP `429 / 5xx`, se aplica un reintento con *exponential backoff* ($1\text{ s}, 2\text{ s}, 4\text{ s}$).
4. **Orquestador con Fallback Automático:**
   - Cuando se solicita el catálogo o los datos de un satélite, el `DataOrchestrator` intenta primero con **CelesTrak**.
   - Si CelesTrak falla o no responde, conmuta automáticamente a **Space-Track** (si el usuario configuró sus credenciales) o a **N2YO**, y finalmente a una semilla local de emergencia (*fallback seed*) con los satélites principales para asegurar operatividad continua.

---

## 5. Manejo Seguro de Credenciales

Siguiendo las buenas prácticas de seguridad móvil:
- Ninguna API Key ni contraseña de Space-Track o N2YO está *hardcodeada* en el código fuente ni expuesta en el repositorio Git.
- La aplicación utiliza **`expo-secure-store`** (que emplea *Keychain* en iOS y *EncryptedSharedPreferences / Keystore* en Android) para almacenar de forma cifrada la API Key de N2YO y las credenciales de Space-Track ingresadas por el usuario desde la pestaña de **Ajustes / APIs**, además de soportar variables de entorno (`EXPO_PUBLIC_...`) durante el desarrollo.
