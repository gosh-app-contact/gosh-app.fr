import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import { useColors, spacing } from '../constants/theme';
import { WeightEntry } from '../types';

interface Props {
  data: WeightEntry[];
  showMovingAverage?: boolean;
}

const W = Dimensions.get('window').width - 64;
const H = 180;
const PAD = { top: 10, bottom: 30, left: 40, right: 10 };

function movingAverage(data: WeightEntry[], n = 5): WeightEntry[] {
  return data.map((entry, i) => {
    const slice = data.slice(Math.max(0, i - n + 1), i + 1);
    const avg = slice.reduce((s, e) => s + e.weight, 0) / slice.length;
    return { ...entry, weight: Math.round(avg * 10) / 10 };
  });
}

export default function WeightChart({ data, showMovingAverage = true }: Props) {
  const colors = useColors();
  const styles = useMemo(() => StyleSheet.create({
    empty: { height: H, alignItems: 'center' as const, justifyContent: 'center' as const },
    emptyText: { color: colors.textSecondary, fontSize: 14 },
    legend: { flexDirection: 'row' as const, gap: spacing.lg, marginTop: spacing.sm },
    legendItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
    legendLine: { width: 20, height: 2 },
    legendText: { color: colors.textSecondary, fontSize: 11 },
  }), [colors]);
  const { points, avgPoints, yMin, yMax, yStep, labels } = useMemo(() => {
    if (data.length === 0) return { points: [], avgPoints: [], yMin: 0, yMax: 100, yStep: 10, labels: [] };
    const weights = data.map((d) => d.weight);
    const rawMin = Math.min(...weights);
    const rawMax = Math.max(...weights);
    const margin = Math.max(1, (rawMax - rawMin) * 0.15);
    const yMin = rawMin - margin;
    const yMax = rawMax + margin;
    const yRange = yMax - yMin || 1;
    const yStep = Math.ceil(yRange / 4 * 10) / 10;

    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;

    const toX = (i: number) => PAD.left + (i / Math.max(1, data.length - 1)) * innerW;
    const toY = (w: number) => PAD.top + innerH - ((w - yMin) / yRange) * innerH;

    const points = data.map((d, i) => ({ x: toX(i), y: toY(d.weight), entry: d }));
    const avg = movingAverage(data);
    const avgPoints = avg.map((d, i) => ({ x: toX(i), y: toY(d.weight) }));

    const step = Math.max(1, Math.floor(data.length / 5));
    const labels = data.filter((_, i) => i % step === 0 || i === data.length - 1).map((d, _, arr) => {
      const idx = data.indexOf(d);
      return { x: toX(idx), label: d.date.slice(5) };
    });

    return { points, avgPoints, yMin, yMax, yStep, labels };
  }, [data]);

  if (data.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Aucune donnée de poids</Text>
      </View>
    );
  }

  const toPath = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  const yLabels = [];
  for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y = Math.round((y + yStep) * 10) / 10) {
    const cy = PAD.top + (H - PAD.top - PAD.bottom) - ((y - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);
    yLabels.push({ y: cy, label: y.toFixed(1) });
  }

  return (
    <View>
      <Svg width={W} height={H}>
        {yLabels.map((l, i) => (
          <React.Fragment key={i}>
            <Line x1={PAD.left} y1={l.y} x2={W - PAD.right} y2={l.y} stroke={colors.border} strokeWidth={1} />
            <SvgText x={PAD.left - 4} y={l.y + 4} fontSize={9} fill={colors.textSecondary} textAnchor="end">{l.label}</SvgText>
          </React.Fragment>
        ))}
        <Path d={toPath(points)} stroke={colors.accent} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {showMovingAverage && avgPoints.length > 0 && (
          <Path d={toPath(avgPoints)} stroke={colors.accentBlue} strokeWidth={1.5} fill="none" strokeDasharray="4 3" />
        )}
        {points.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={3} fill={colors.accent} />
        ))}
        {labels.map((l, i) => (
          <SvgText key={i} x={l.x} y={H - 6} fontSize={9} fill={colors.textSecondary} textAnchor="middle">{l.label}</SvgText>
        ))}
      </Svg>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: colors.accent }]} />
          <Text style={styles.legendText}>Poids</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: colors.accentBlue, borderStyle: 'dashed' }]} />
          <Text style={styles.legendText}>Moy. mobile 5j</Text>
        </View>
      </View>
    </View>
  );
}

