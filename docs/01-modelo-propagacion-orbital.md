# Documento Técnico: Modelo de Propagación Orbital y Cálculos Astronómicos

**Materia:** Programación Móviles - 2026  
**Carrera:** Licenciatura en Sistemas de Información (FCyT - UADER)  
**Trabajo Práctico N° 7:** Satellite Tracker  

---

## 1. Introducción al Modelo SGP4 / SDP4

En el presente trabajo práctico se implementó el cálculo local de posiciones satelitales en tiempo real utilizando el modelo matemático **SGP4** (*Simplified General Perturbations 4*) para satélites de órbita cercana (período orbital $< 225$ minutos, como órbitas LEO) y **SDP4** (*Simplified Deep Space Perturbations 4*) para satélites de espacio profundo (período orbital $\ge 225$ minutos, como órbitas MEO/GPS y GEO).

Para la ejecución en React Native / TypeScript se empleó la librería estándar **`satellite.js`**, la cual es una adaptación directa del código de referencia publicado por David Vallado (*Fundamentals of Astrodynamics and Applications*).

---

## 2. Flujo de Cálculo Orbital

El motor orbital (`src/services/orbitalEngine.ts`) ejecuta la siguiente cadena de transformaciones matemáticas a partir de los elementos orbitales medios (TLE u OMM):

### 2.1. Inicialización del registro satelital (`satrec`)
A partir de las dos líneas de un **TLE** (*Two-Line Element Set*) o de un objeto **OMM** (*Orbit Mean-Elements Message* en formato JSON), se extraen los parámetros keplerianos medios en la época ($t_0$):
- Inclinación ($i$)
- Ascensión recta del nodo ascendente ($\Omega$ / RAAN)
- Excentricidad ($e$)
- Argumento del perigeo ($\omega$)
- Anomalía media ($M_0$)
- Movimiento medio ($n$, en revoluciones por día)
- Coeficiente de arrastre balístico ($B^*$)

### 2.2. Propagación en el marco ECI (Earth-Centered Inertial)
Dado un instante de tiempo objetivo $t$, se calcula el intervalo $\Delta t = t - t_0$ en minutos. El propagador SGP4 evalúa las perturbaciones seculares y periódicas causadas por:
1. **Achatamiento terrestre (armónicos zonales $J_2, J_3, J_4$):** la Tierra no es una esfera perfecta sino un esferoide oblato, lo que produce la regresión nodal y la rotación del apogeo.
2. **Arrastre atmosférico:** modelado mediante una atmósfera estática con decaimiento exponencial de densidad parametrizado por $B^*$.
3. **Efectos gravitacionales lunisolares y resonancia (en SDP4):** relevantes en órbitas MEO y GEO.

El resultado de la propagación es el vector de estado en coordenadas **ECI (TEME - True Equator Mean Equinox)**:
- Vector posición $\vec{r}_{ECI} = (x, y, z)$ en kilómetros.
- Vector velocidad $\vec{v}_{ECI} = (v_x, v_y, v_z)$ en km/s.

### 2.3. Conversión a Coordenadas Geodésicas (Punto Subsatelital)
Dado que el marco ECI no rota con la Tierra, es necesario calcular el **Tiempo Sidéreo de Greenwich (GMST)** para el instante $t$. Con el ángulo GMST ($\theta_{GMST}$) y asumiendo el elipsoide de referencia **WGS-84** ($a = 6378.137\text{ km}$, $f = 1/298.257223563$), se transforma $\vec{r}_{ECI}$ a coordenadas geodésicas:
- **Latitud ($\phi$):** expresada en grados $[-90^\circ, +90^\circ]$.
- **Longitud ($\lambda$):** expresada en grados $[-180^\circ, +180^\circ]$.
- **Altitud ($h$):** altura sobre el elipsoide WGS-84 en kilómetros.

### 2.4. Conversión a Coordenadas Topocéntricas (Azimut, Elevación y Rango)
Para determinar si el satélite es visible desde la posición del usuario $(\phi_{obs}, \lambda_{obs}, h_{obs})$:
1. Se transforma la posición ECI a coordenadas **ECF** (*Earth-Centered Fixed*, que rotan con la Tierra).
2. Se traslada el origen al observador y se rota al sistema local **SEZ** (*South-East-Zenith*).
3. A partir del vector topocéntrico se obtienen los ángulos de observación:
   - **Azimut ($Az$):** ángulo medido en sentido horario desde el Norte geográfico $[0^\circ, 360^\circ)$.
   - **Elevación ($El$):** ángulo sobre el horizonte local $[-90^\circ, +90^\circ]$. Un satélite es geométricamente visible sobre el horizonte cuando $El > 0^\circ$, y operativamente útil en telecomunicaciones cuando supera la elevación mínima configurada (ej. $El \ge 10^\circ$).
   - **Rango (Slant Range):** distancia en línea recta entre el usuario y el satélite en km.

---

## 3. Cálculo de Ground Track, Antimeridiano y Footprint

### 3.1. Ground Track y cruce del Antimeridiano ($\pm 180^\circ$)
Para dibujar la trayectoria pasada y futura de al menos una órbita completa (aprox. 95 minutos para LEO, muestreada cada 45 segundos), se propaga la posición en ese intervalo.  
Cuando el satélite cruza el antimeridiano (longitud pasando de $+179^\circ$ a $-179^\circ$ o viceversa), una polilínea simple dibujaría una línea recta horizontal atravesando todo el planisferio. Para resolverlo, el algoritmo detecta cuando $|\lambda_{k} - \lambda_{k-1}| > 180^\circ$ y **divide la polilínea en segmentos independientes**, logrando un renderizado limpio en el mapa.

### 3.2. Footprint (Área de Cobertura)
El radio de cobertura terrestre de un satélite a altitud $h$ para un ángulo de elevación mínima $E_{min}$ se calcula mediante geometría esférica terrestre ($R_E \approx 6371\text{ km}$):

$$\rho = \arcsin\left(\frac{R_E}{R_E + h} \cos(E_{min})\right)$$

$$\theta = 90^\circ - E_{min} - \rho$$

$$d_{cobertura} = R_E \cdot \theta_{\text{rad}}$$

Donde $\theta$ es el ángulo central geocéntrico y $d_{cobertura}$ es el radio del círculo sobre la superficie terrestre en metros, graficado con `Circle` en el mapa.

---

## 4. Algoritmo de Predicción de Pases (Búsqueda Gruesa $\rightarrow$ Fina)

Evaluar SGP4 segundo a segundo durante 24 o 48 horas para encontrar ventanas de visibilidad (AOS/LOS) bloquearía el hilo de JavaScript en el dispositivo móvil. Para optimizar el rendimiento se implementó un **algoritmo de búsqueda en dos etapas**:

1. **Etapa Gruesa (Coarse Search):** se avanza en pasos de $\Delta t_{grueso} = 60\text{ segundos}$ a lo largo de la ventana de predicción (ej. próximas 24 horas). Se detectan los intervalos donde la elevación cruza el umbral mínimo ($El_{min}$, por defecto $10^\circ$).
2. **Etapa de Refinamiento (Fine Search / Bisección):** cuando se detecta una transición (de $El < El_{min}$ a $El \ge El_{min}$ para **AOS**, o viceversa para **LOS**), se refina el intervalo con pasos de $2\text{ segundos}$ (y bisección final) para hallar con alta precisión:
   - **AOS (*Acquisition of Signal*):** instante y azimut de aparición sobre el umbral.
   - **TCA / Max Elevation:** instante de máxima elevación y su ángulo.
   - **LOS (*Loss of Signal*):** instante y azimut de pérdida de señal.
   - **Trayectoria Polar:** puntos $(Az, El)$ muestreados durante el pase para alimentar el gráfico polar SVG (*Sky Chart*).

---

## 5. Supuestos y Limitaciones del Modelo

1. **Ausencia de corrección por refracción atmosférica fina:** el cálculo de elevación topocéntrica es puramente geométrico. En la práctica, cerca del horizonte ($El < 5^\circ$), la refracción troposférica curva las ondas de radio y la luz aparente hasta $\sim 0.5^\circ$.
2. **Degradación temporal de los datos orbitales (TLE/OMM):** SGP4 es un modelo analítico aproximado cuyo error crece con el tiempo desde la época del TLE (aprox. $1\text{ a }3\text{ km}$ por día en órbita LEO debido a variaciones impredecibles de la densidad termosférica por actividad solar). Por ello la app implementa un **TTL de 12-24 horas** y alerta cuando los datos tienen más de 48 horas de antigüedad.
3. **Maniobras de propulsión no modeladas:** satélites con propulsión activa (como la Estación Espacial Internacional cuando realiza *reboosts* o los satélites Starlink que usan propulsores iónicos de efecto Hall para elevar su órbita o esquivar desechos) invalidan un TLE previo a la maniobra.
4. **Visibilidad geométrica vs. visibilidad óptica:** el predictor calcula visibilidad radioeléctrica/geométrica ($El \ge El_{min}$). Para observación a simple vista se requeriría además que el satélite esté iluminado por el Sol y el observador en crepúsculo/noche.
