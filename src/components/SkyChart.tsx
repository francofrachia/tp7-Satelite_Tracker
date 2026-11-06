import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, {
  Circle,
  Line,
  Path,
  Text as SvgText,
  G,
} from 'react-native-svg';
import type { SatellitePass, TopocentricPosition } from '../types/satellite';

interface SkyChartProps {
  size?: number;
  pass?: SatellitePass | null;
  currentTopo?: TopocentricPosition | null;
  minElevationDeg?: number;
  deviceHeadingDeg?: number;
}

/**
 * Convierte coordenadas polares astronómicas (Azimut [0..360° desde el Norte horario],
 * Elevación [0° en el borde exterior .. 90° en el centro/cénit]) a coordenadas cartesianas SVG (x, y).
 */
function polarToCartesian(
  azimuthDeg: number,
  elevationDeg: number,
  center: number,
  maxRadius: number
): { x: number; y: number } {
  const clampedEl = Math.max(0, Math.min(90, elevationDeg));
  const r = maxRadius * (1 - clampedEl / 90);
  const angleRad = ((azimuthDeg - 90) * Math.PI) / 180;
  return {
    x: center + r * Math.cos(angleRad),
    y: center + r * Math.sin(angleRad),
  };
}

export const SkyChart: React.FC<SkyChartProps> = ({
  size = 270,
  pass,
  currentTopo,
  minElevationDeg = 10,
  deviceHeadingDeg,
}) => {
  const center = size / 2;
  const maxRadius = size / 2 - 26;

  const r30 = maxRadius * (1 - 30 / 90);
  const r60 = maxRadius * (1 - 60 / 90);
  const rMinEl = maxRadius * (1 - Math.max(0, Math.min(85, minElevationDeg)) / 90);

  // Construir el path SVG de la trayectoria del pase seleccionado
  let trajectoryPath = '';
  let aosPoint: { x: number; y: number } | null = null;
  let maxPoint: { x: number; y: number } | null = null;
  let losPoint: { x: number; y: number } | null = null;

  if (pass && pass.trajectory.length > 1) {
    for (let idx = 0; idx < pass.trajectory.length; idx++) {
      const pt = pass.trajectory[idx];
      const { x, y } = polarToCartesian(pt.azimuthDeg, pt.elevationDeg, center, maxRadius);
      if (idx === 0) {
        trajectoryPath = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
        aosPoint = { x, y };
      } else {
        trajectoryPath += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      if (idx === pass.trajectory.length - 1) {
        losPoint = { x, y };
      }
    }

    maxPoint = polarToCartesian(
      pass.maxElAzimuthDeg,
      pass.maxElevationDeg,
      center,
      maxRadius
    );
  }

  // Posición actual en vivo si el satélite está sobre el horizonte (El >= 0°)
  const livePoint =
    currentTopo && currentTopo.elevationDeg >= 0
      ? polarToCartesian(
          currentTopo.azimuthDeg,
          currentTopo.elevationDeg,
          center,
          maxRadius
        )
      : null;

  // Indicador de hacia dónde apunta el teléfono si se pasa deviceHeadingDeg
  const headingPoint =
    deviceHeadingDeg !== undefined
      ? polarToCartesian(deviceHeadingDeg, 0, center, maxRadius + 8)
      : null;

  return (
    <View style={styles.container}>
      <Svg width={size} height={size}>
        {/* Fondo del domo celeste */}
        <Circle
          cx={center}
          cy={center}
          r={maxRadius}
          fill="#0B1528"
          stroke="#334155"
          strokeWidth={1.5}
        />

        {/* Círculos concéntricos de elevación: 30° y 60° */}
        <Circle
          cx={center}
          cy={center}
          r={r30}
          fill="none"
          stroke="#1E293B"
          strokeWidth={1}
        />
        <Circle
          cx={center}
          cy={center}
          r={r60}
          fill="none"
          stroke="#1E293B"
          strokeWidth={1}
        />

        {/* Umbral de elevación mínima configurable (ej. 10°) */}
        <Circle
          cx={center}
          cy={center}
          r={rMinEl}
          fill="none"
          stroke="#0EA5E9"
          strokeWidth={1}
          strokeDasharray="4,4"
          opacity={0.65}
        />

        {/* Ejes cardinales N-S y E-O */}
        <Line
          x1={center}
          y1={center - maxRadius}
          x2={center}
          y2={center + maxRadius}
          stroke="#1E293B"
          strokeWidth={1}
        />
        <Line
          x1={center - maxRadius}
          y1={center}
          x2={center + maxRadius}
          y2={center}
          stroke="#1E293B"
          strokeWidth={1}
        />

        {/* Etiquetas de elevación */}
        <SvgText
          x={center + 4}
          y={center - r30 + 11}
          fill="#64748B"
          fontSize="9"
        >
          30°
        </SvgText>
        <SvgText
          x={center + 4}
          y={center - r60 + 11}
          fill="#64748B"
          fontSize="9"
        >
          60°
        </SvgText>
        <SvgText x={center + 3} y={center - 3} fill="#64748B" fontSize="9">
          90°
        </SvgText>

        {/* Puntos cardinales */}
        <SvgText
          x={center}
          y={15}
          fill="#F8FAFC"
          fontSize="12"
          fontWeight="bold"
          textAnchor="middle"
        >
          N
        </SvgText>
        <SvgText
          x={size - 11}
          y={center + 4}
          fill="#94A3B8"
          fontSize="11"
          fontWeight="bold"
          textAnchor="middle"
        >
          E
        </SvgText>
        <SvgText
          x={center}
          y={size - 6}
          fill="#94A3B8"
          fontSize="11"
          fontWeight="bold"
          textAnchor="middle"
        >
          S
        </SvgText>
        <SvgText
          x={11}
          y={center + 4}
          fill="#94A3B8"
          fontSize="11"
          fontWeight="bold"
          textAnchor="middle"
        >
          O
        </SvgText>

        {/* Trayectoria del pase (AOS -> Max -> LOS) */}
        {trajectoryPath !== '' && (
          <Path
            d={trajectoryPath}
            fill="none"
            stroke="#38BDF8"
            strokeWidth={2.5}
          />
        )}

        {/* Marcador AOS (Acquisition of Signal) */}
        {aosPoint && (
          <G>
            <Circle
              cx={aosPoint.x}
              cy={aosPoint.y}
              r={5}
              fill="#22C55E"
              stroke="#052E16"
              strokeWidth={1.5}
            />
            <SvgText
              x={aosPoint.x}
              y={aosPoint.y - 8}
              fill="#4ADE80"
              fontSize="9"
              fontWeight="bold"
              textAnchor="middle"
            >
              AOS
            </SvgText>
          </G>
        )}

        {/* Marcador Elevación Máxima (TCA) */}
        {maxPoint && (
          <G>
            <Circle
              cx={maxPoint.x}
              cy={maxPoint.y}
              r={5.5}
              fill="#FACC15"
              stroke="#422006"
              strokeWidth={1.5}
            />
            <SvgText
              x={maxPoint.x}
              y={maxPoint.y - 8}
              fill="#FDE047"
              fontSize="9"
              fontWeight="bold"
              textAnchor="middle"
            >
              MAX
            </SvgText>
          </G>
        )}

        {/* Marcador LOS (Loss of Signal) */}
        {losPoint && (
          <G>
            <Circle
              cx={losPoint.x}
              cy={losPoint.y}
              r={5}
              fill="#EF4444"
              stroke="#450A0A"
              strokeWidth={1.5}
            />
            <SvgText
              x={losPoint.x}
              y={losPoint.y + 14}
              fill="#F87171"
              fontSize="9"
              fontWeight="bold"
              textAnchor="middle"
            >
              LOS
            </SvgText>
          </G>
        )}

        {/* Rumbo actual de la brújula del dispositivo */}
        {headingPoint && (
          <G>
            <Line
              x1={center}
              y1={center}
              x2={headingPoint.x}
              y2={headingPoint.y}
              stroke="#A855F7"
              strokeWidth={1.5}
              strokeDasharray="3,3"
            />
            <Circle cx={headingPoint.x} cy={headingPoint.y} r={4} fill="#A855F7" />
          </G>
        )}

        {/* Posición actual en vivo del satélite si está sobre el horizonte */}
        {livePoint && (
          <G>
            <Circle
              cx={livePoint.x}
              cy={livePoint.y}
              r={10}
              fill="rgba(56, 189, 248, 0.25)"
            />
            <Circle
              cx={livePoint.x}
              cy={livePoint.y}
              r={5}
              fill="#38BDF8"
              stroke="#FFFFFF"
              strokeWidth={1.5}
            />
          </G>
        )}
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
