# Informe de Validación: Exactitud del Cálculo Orbital SGP4

**Materia:** Programación Móviles - 2026  
**Carrera:** Licenciatura en Sistemas de Información (FCyT - UADER)  
**Trabajo Práctico N° 7:** Satellite Tracker  

---

## 1. Metodología de Validación Cruzada (RF-15)

Para verificar la correctitud matemática de nuestro motor orbital (`src/services/orbitalEngine.ts`, basado en `satellite.js` v7.1.0 con el modelo **SGP4/SDP4** y el elipsoide **WGS-84**), se implementó el módulo de validación (`src/services/validationService.ts`) y la pantalla interactiva **Validar/API**.

### Sincronización Temporal Crítica
Un satélite en órbita terrestre baja (LEO, $h \approx 420 - 550\text{ km}$) se desplaza a una velocidad orbital de aproximadamente **$7.66\text{ km/s}$**. Esto implica que un desfase de apenas $1\text{ segundo}$ entre el reloj de la API externa y la propagación local introduciría un error aparente de $\sim 7.66\text{ km}$ a lo largo de la trayectoria (*along-track*).  
Por este motivo, el servicio de validación extrae el `timestamp` exacto (UTC) reportado por el JSON de la API externa (`Where the ISS at?` o `N2YO`) y evalúa la función `propagate(satrec, new Date(remote.timestamp))` exactamente en ese mismo instante.

### Métricas de Error Calculadas
1. **Error Superficial Geodésico ($\Delta d_{sup}$):** distancia sobre la superficie terrestre entre $(\phi_{local}, \lambda_{local})$ y $(\phi_{remoto}, \lambda_{remoto})$ calculada mediante la fórmula de **Haversine** ($R_E = 6371.0\text{ km}$).
2. **Error de Altitud ($\Delta h$):** diferencia absoluta $|h_{local} - h_{remoto}|$ en kilómetros.
3. **Error Euclidiano 3D Total ($\Delta d_{3D}$):**
   $$\Delta d_{3D} = \sqrt{(\Delta d_{sup})^2 + (\Delta h)^2}$$

---

## 2. Tabla de Resultados de Validación Experimental

Se realizaron pruebas comparativas desde la ubicación del observador en **Concepción del Uruguay, Entre Ríos** ($\phi = -32.4845^\circ$, $\lambda = -58.2321^\circ$, $h = 25\text{ m}$) evaluando satélites en órbitas LEO, MEO y GEO:

| Satélite (NORAD ID) | Órbita | Fuente de Validación | Antigüedad TLE/OMM | Posición Local SGP4 (Lat, Lon, Alt) | Posición Fuente Externa (Lat, Lon, Alt) | Error Superficial (km) | $\Delta$ Altitud (km) | Error 3D Total (km) |
| :--- | :---: | :--- | :---: | :--- | :--- | :---: | :---: | :---: |
| **ISS (ZARYA)** `#25544` *(mismo TLE)* | LEO | Where the ISS at? | $5.1\text{ h}$ | $37.9284^\circ, 166.4942^\circ, 421.05\text{ km}$ | $37.9284^\circ, 166.4942^\circ, 421.05\text{ km}$ | **$0.0004\text{ km}$** | **$0.0019\text{ km}$** | **$0.0020\text{ km}$** |
| **ISS (ZARYA)** `#25544` *(OMM CelesTrak)* | LEO | Where the ISS at? | $9.4\text{ h}$ | $-14.2185^\circ, -42.8112^\circ, 418.62\text{ km}$ | $-14.2131^\circ, -42.8064^\circ, 418.79\text{ km}$ | **$0.79\text{ km}$** | **$0.17\text{ km}$** | **$0.81\text{ km}$** |
| **STARLINK-1007** `#44713` *(SupGP)* | LEO | N2YO REST API | $6.8\text{ h}$ | $-31.8412^\circ, -59.1045^\circ, 549.18\text{ km}$ | $-31.8320^\circ, -59.0941^\circ, 549.42\text{ km}$ | **$1.42\text{ km}$** | **$0.24\text{ km}$** | **$1.44\text{ km}$** |
| **NOAA 19** `#33591` | LEO Polar | N2YO REST API | $11.2\text{ h}$ | $-45.1104^\circ, -63.4810^\circ, 854.12\text{ km}$ | $-45.1062^\circ, -63.4755^\circ, 854.30\text{ km}$ | **$0.64\text{ km}$** | **$0.18\text{ km}$** | **$0.66\text{ km}$** |
| **GPS BIII-1** `#43873` | MEO | N2YO REST API | $14.0\text{ h}$ | $-12.4510^\circ, -71.2208^\circ, 20184.5\text{ km}$ | $-12.4488^\circ, -71.2180^\circ, 20185.1\text{ km}$ | **$0.39\text{ km}$** | **$0.60\text{ km}$** | **$0.72\text{ km}$** |
| **ARSAT-2** `#40946` | GEO | N2YO REST API | $16.5\text{ h}$ | $-0.0180^\circ, -81.0042^\circ, 35786.2\text{ km}$ | $-0.0165^\circ, -81.0018^\circ, 35786.8\text{ km}$ | **$0.31\text{ km}$** | **$0.60\text{ km}$** | **$0.68\text{ km}$** |

---

## 3. Análisis del Impacto de la Antigüedad del TLE

Se evaluó además la sensibilidad del error de posición de la **ISS (#25544)** en función de la antigüedad del elemento orbital utilizado:

| Antigüedad del TLE ($\Delta t$ desde Epoch) | Error Superficial Promedio (km) | Error en Azimut / Elevación (Observador) | Estado en la App (RF-09 / RF-16) |
| :--- | :---: | :---: | :--- |
| **$0\text{ a }12\text{ horas}$** | $< 1.0\text{ km}$ | $< 0.15^\circ$ | ✅ Óptimo (Dentro del TTL de caché) |
| **$12\text{ a }24\text{ horas}$** | $1.0\text{ a }2.5\text{ km}$ | $\sim 0.25^\circ$ | 🔄 Se dispara auto-refresco silencioso |
| **$24\text{ a }72\text{ horas}$** | $2.5\text{ a }8.0\text{ km}$ | $0.5^\circ\text{ a }1.2^\circ$ | ⚠️ Alerta visual de datos desactualizados |
| **$> 7\text{ días}$** | $> 25\text{ km}$ | $> 3.5^\circ$ | ❌ No apto para apuntado fino de antena |

---

## 4. Conclusiones

1. **Equivalencia algorítmica verificada:** cuando nuestra aplicación propaga exactamente el mismo TLE que utiliza `Where the ISS at?` en el mismo timestamp UTC, la discrepancia es menor a **$2\text{ metros}$ ($0.002\text{ km}$)**, atribuible únicamente a diferencias de redondeo en punto flotante y constantes del elipsoide entre implementaciones de SGP4.
2. **Impacto del set suplementario (SupGP) en Starlink:** al comparar el catálogo **SupGP** de CelesTrak contra el TLE general de N2YO para satélites Starlink, se observa una diferencia de $\sim 1.4\text{ km}$. Esto se debe a que SupGP proviene de las efemérides operativas directas de SpaceX, mientras que N2YO utiliza el TLE estándar de US Space Force con una época ligeramente distinta.
3. **Suficiencia para enlaces y seguimiento móvil:** un error de posición de $\sim 1\text{ km}$ a una distancia oblicua de $600\text{ km}$ equivale a un error angular de apenas $\arctan(1/600) \approx 0.095^\circ$, valor muy inferior al ancho de haz (*beamwidth*) de antenas satelitales portátiles y totalmente imperceptible en el modo brújula o en el *Sky Chart* polar.
