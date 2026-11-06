# TP N° 7 — Satellite Tracker (Propagación Orbital SGP4/SDP4)

**Materia:** Programación Móviles - 2026  
**Carrera:** Licenciatura en Sistemas de Información (FCyT - UADER)  
**Tecnología:** React Native (Expo + TypeScript + `satellite.js`)

---

## 1. Descripción del Proyecto

Aplicación móvil desarrollada en React Native que obtiene elementos orbitales reales (formatos **OMM/JSON** y **TLE**) desde fuentes públicas (**CelesTrak**, incluyendo sets suplementarios **SupGP de Starlink**, con soporte de fallback a **Space-Track.org**, **N2YO** y **Where the ISS at?**), calcula localmente en tiempo real la geoposición de satélites artificiales (órbitas **LEO, MEO y GEO**) mediante el algoritmo **SGP4/SDP4**, dibuja su *ground track* (con corte en el antimeridiano), su *footprint* de cobertura y predice las ventanas de visibilidad (**AOS, Máxima Elevación y LOS**) con gráfico polar (**Sky Chart SVG**), modo **Brújula** y **notificaciones locales**.

---

## 2. Cómo Ejecutar y Probar la Aplicación (iPhone con Expo Go o Android Studio)

1. Instalar dependencias (ya instaladas en el proyecto):
   ```bash
   npm install
   ```
2. Iniciar el servidor de desarrollo Metro:
   ```bash
   npx expo start
   ```
3. **Para abrir en tu iPhone:**
   - Descarga la app **Expo Go** desde el App Store.
   - Asegúrate de que tu iPhone y tu PC estén en la misma red Wi-Fi (o usa `npx expo start --tunnel`).
   - Escanea el código QR desde la cámara del iPhone. En iOS el mapa utiliza **Apple Maps** de forma nativa sin requerir API Keys adicionales.
4. **Para abrir en Android Studio:**
   - Con un emulador Android abierto, presiona la tecla `a` en la terminal de Expo.

---

## 3. Cobertura de Requisitos Funcionales (RF-01 a RF-16)

| ID | Requisito Funcional | Módulo / Archivo |
| :--- | :--- | :--- |
| **RF-01** | Búsqueda y selección de satélites por nombre o NORAD ID | `src/screens/CatalogScreen.tsx` |
| **RF-02** | Cálculo local de posición (lat/lon/alt/vel) con SGP4/SDP4 | `src/services/orbitalEngine.ts` (`calculateSubsatellitePosition`) |
| **RF-03** | Cálculo de azimut, elevación y distancia respecto al GPS del usuario | `src/services/orbitalEngine.ts` (`calculateTopocentricPosition`) |
| **RF-04** | Predicción de próximas ventanas de visibilidad (AOS, Max, LOS) por refinamiento (grueso $\rightarrow$ fino) | `src/services/predictionService.ts` (`predictUpcomingPasses`) |
| **RF-05** | Gráfico polar del pase (*Sky Chart* en SVG) | `src/components/SkyChart.tsx` |
| **RF-06** | Notificaciones locales $N$ minutos antes de un pase configurado + botón de test en 3s | `src/services/notificationService.ts` |
| **RF-07** | Modo brújula / orientación asistida indicando hacia dónde girar e inclinar el dispositivo | `src/screens/CompassScreen.tsx` |
| **RF-08** | Filtro de catálogo por constelación (Estaciones/ISS, Starlink SupGP, GPS, Clima/CONAE, GEO) | `src/screens/CatalogScreen.tsx` |
| **RF-09** | Auto-actualización de datos orbitales al superar TTL (12-24 h) respetando rate limits | `src/services/dataOrchestrator.ts` y `src/services/rateLimiter.ts` |
| **RF-10** | Mapa mundial con posición en tiempo real (refresco local cada 2 s) | `src/screens/MapScreen.tsx` |
| **RF-11** | *Ground track* pasado y futuro (órbita completa) con corte en el antimeridiano ($\pm 180^\circ$) | `src/services/orbitalEngine.ts` (`calculateGroundTrackSegments`) |
| **RF-12** | *Footprint* (área de cobertura) según altitud y elevación mínima configurable | `src/services/orbitalEngine.ts` (`calculateFootprintRadiusMeters`) |
| **RF-13** | Capa de constelación Starlink con propagación en lote y límite de marcadores simultáneos | `src/services/orbitalEngine.ts` (`propagateConstellationBatch`) |
| **RF-14** | Abstracción `DataProvider` con caché local (`AsyncStorage`) y fallback automático entre fuentes | `src/services/dataOrchestrator.ts` y `src/services/providers/*` |
| **RF-15** | Modo validación cruzada contra *Where the ISS at?* y *N2YO* mostrando error en km | `src/services/validationService.ts` y `src/screens/ValidationScreen.tsx` |
| **RF-16** | Indicador de antigüedad de los datos orbitales (TLE/OMM) y alerta de obsolescencia | `src/screens/MapScreen.tsx` y `src/screens/CatalogScreen.tsx` |

---

## 4. Documentación Técnica Entregable (Sección 6 del TP)

Dentro de la carpeta `docs/` se encuentran redactados los tres informes requeridos por la cátedra:

1. [`docs/01-modelo-propagacion-orbital.md`](./docs/01-modelo-propagacion-orbital.md): Explicación matemática del modelo SGP4/SDP4, conversión ECI $\rightarrow$ Geodésico WGS-84 $\rightarrow$ Topocéntrico (Az/El), fórmula del *footprint*, corte en el antimeridiano, búsqueda de pases por refinamiento y limitaciones del modelo.
2. [`docs/02-decisiones-fuentes-datos.md`](./docs/02-decisiones-fuentes-datos.md): Justificación del uso del set suplementario (*SupGP*) de CelesTrak para Starlink, soporte OMM/JSON vs. TLE, tabla de límites de uso (*rate limits*), estrategia de caché/fallback y almacenamiento seguro de credenciales con `expo-secure-store`.
3. [`docs/03-informe-validacion.md`](./docs/03-informe-validacion.md): Tabla de errores experimentales en kilómetros comparando nuestros cálculos con `Where the ISS at?` y `N2YO`, análisis de degradación por antigüedad del TLE y conclusiones.

---

## 5. Guía Paso a Paso para Grabar el Video Demo (Sección 6)

Para cumplir con todos los puntos del video demo en menos de 2 minutos:
1. **Mapa en tiempo real (Pestaña `Mapa`):** Mostrar la **ISS (ZARYA)** moviéndose en tiempo real con su trayectoria pasada (punteada), futura (celeste, mostrando cómo corta limpiamente en el borde del mapa sin cruzar horizontalmente) y el círculo del *Footprint*.
2. **Capa de Constelación Starlink:** Tocar el botón flotante **`Capa Starlink`** a la derecha del mapa para encender los satélites de la constelación Starlink simultáneamente.
3. **Catálogo y Filtros (Pestaña `Catálogo`):** Mostrar el filtro por constelaciones (`Starlink (SupGP)`, `GPS`, `Clima / CONAE`, `GEO`) y el buscador por nombre o NORAD ID.
4. **Próximo Pase, Sky Chart y Notificación (Pestaña `Pases/Sky`):** Mostrar el gráfico polar SVG con los puntos **AOS**, **MAX** y **LOS**, tocar el botón **`🔔 -10m`** en un pase de la lista (o el botón **`🔔 Test Alerta (3s)`**) y esperar 3 segundos para que aparezca el banner de notificación en pantalla.
5. **Brújula y Validación (Pestañas `Brújula` y `Validar/API`):** Mostrar cómo gira la brújula al mover el teléfono y tocar **`Validar ISS (WhereTheISSAt)`** para exhibir el error en kilómetros en vivo.
