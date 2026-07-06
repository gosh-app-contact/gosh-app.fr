import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import { useColors } from '../constants/theme';

interface Props {
  consumed: number;
  goal: number;
  size?: number;
}

export default function CalorieArc({ consumed, goal, size = 220 }: Props) {
  const colors = useColors();
  const styles = useMemo(() => StyleSheet.create({
    container: { alignItems: 'center' as const },
    textBlock: { position: 'absolute' as const, top: '38%', alignItems: 'center' as const, gap: 2 },
    goalText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' as const },
    consumed: { fontSize: 40, fontWeight: '900' as const, lineHeight: 44 },
    unit: { color: colors.textSecondary, fontSize: 12, fontWeight: '500' as const },
    remaining: { fontSize: 12, fontWeight: '700' as const, marginTop: 2 },
    labelsRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, width: '80%', marginTop: -6 },
    sideLabel: { color: colors.textSecondary, fontSize: 11 },
  }), [colors]);
  const strokeWidth = 14;
  const cx = size / 2;
  const cy = size / 2 + 10; // légèrement décalé vers le bas pour l'arc
  const r = (size - strokeWidth * 2) / 2;

  // Arc de -210° à 30° (soit 240° total, ouvert en bas)
  const startAngle = -210;
  const endAngle = 30;
  const totalAngle = endAngle - startAngle; // 240°

  const pct = goal > 0 ? Math.min(1, consumed / goal) : 0;
  const fillAngle = startAngle + totalAngle * pct;

  function polar(angle: number, radius = r) {
    const rad = (angle * Math.PI) / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }

  function arcPath(from: number, to: number, rad = r) {
    const start = polar(from, rad);
    const end = polar(to, rad);
    const large = to - from > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${rad} ${rad} 0 ${large} 1 ${end.x} ${end.y}`;
  }

  const over = consumed > goal;
  const fillColor = over ? colors.danger : consumed / goal > 0.9 ? colors.accentGreen : colors.accent;
  const remaining = Math.max(0, goal - consumed);

  // Dot de progression
  const dotPos = polar(fillAngle);

  return (
    <View style={styles.container}>
      <Svg width={size} height={size * 0.72}>
        {/* Track de fond */}
        <Path
          d={arcPath(startAngle, endAngle)}
          stroke={colors.surface}
          strokeWidth={strokeWidth + 4}
          fill="none"
          strokeLinecap="round"
        />
        {/* Track intérieur */}
        <Path
          d={arcPath(startAngle, endAngle)}
          stroke={colors.border}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
        />
        {/* Arc rempli */}
        {pct > 0.01 && (
          <Path
            d={arcPath(startAngle, fillAngle)}
            stroke={fillColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
          />
        )}
        {/* Dot de fin */}
        {pct > 0.02 && (
          <Circle cx={dotPos.x} cy={dotPos.y} r={strokeWidth / 2 + 1} fill={fillColor} />
        )}
      </Svg>

      {/* Texte centré */}
      <View style={styles.textBlock}>
        <Text style={[styles.consumed, { color: fillColor }]}>{Math.round(consumed)}</Text>
        <Text style={styles.unit}>kcal consommées</Text>
        <Text style={[styles.remaining, { color: over ? colors.danger : colors.accentGreen }]}>
          {over
            ? `⚠️ +${Math.round(consumed - goal)} kcal`
            : `${Math.round(remaining)} kcal restantes`}
        </Text>
      </View>

      {/* Labels aux extrémités */}
      <View style={styles.labelsRow}>
        <Text style={styles.sideLabel}>0</Text>
        <Text style={styles.sideLabel}>{goal}</Text>
      </View>
    </View>
  );
}

