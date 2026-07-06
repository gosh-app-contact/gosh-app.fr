import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useColors } from '../constants/theme';

interface Props {
  progress: number; // 0-1
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
  sublabel?: string;
}

export default function CircularProgress({ progress, size = 100, strokeWidth = 8, color, label, sublabel }: Props) {
  const colors = useColors();
  const resolvedColor = color ?? colors.accent;
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const clamp = Math.min(1, Math.max(0, progress));
  const dash = clamp * circumference;

  const styles = useMemo(() => StyleSheet.create({
    container: { position: 'relative' as const, alignItems: 'center' as const, justifyContent: 'center' as const },
    svg: {},
    labelContainer: { position: 'absolute' as const, alignItems: 'center' as const, justifyContent: 'center' as const },
    label: { color: colors.text, fontSize: 16, fontWeight: '700' as const },
    sublabel: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  }), [colors]);

  return (
    <View style={styles.container}>
      <Svg width={size} height={size} style={styles.svg}>
        <Circle cx={cx} cy={cy} r={r} stroke={colors.border} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={cx} cy={cy} r={r}
          stroke={resolvedColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </Svg>
      {label && (
        <View style={[styles.labelContainer, { width: size, height: size }]}>
          <Text style={styles.label}>{label}</Text>
          {sublabel && <Text style={styles.sublabel}>{sublabel}</Text>}
        </View>
      )}
    </View>
  );
}

