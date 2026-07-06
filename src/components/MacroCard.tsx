import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors, radius, spacing } from '../constants/theme';

interface Props {
  label: string;
  grams: number;
  kcal: number;
  color: string;
  percentage: number;
}

export default function MacroCard({ label, grams, kcal, color, percentage }: Props) {
  const colors = useColors();
  const styles = useMemo(() => StyleSheet.create({
    card: { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, gap: spacing.md },
    dot: { width: 12, height: 12, borderRadius: 6 },
    info: { flex: 1 },
    label: { color: colors.text, fontSize: 14, fontWeight: '600' as const, marginBottom: 6 },
    bar: { height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' as const },
    barFill: { height: '100%', borderRadius: 2 },
    values: { alignItems: 'flex-end' as const },
    grams: { color: colors.text, fontSize: 16, fontWeight: '700' as const },
    kcal: { color: colors.textSecondary, fontSize: 12 },
  }), [colors]);
  return (
    <View style={styles.card}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <View style={styles.info}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${percentage}%`, backgroundColor: color }]} />
        </View>
      </View>
      <View style={styles.values}>
        <Text style={styles.grams}>{grams}g</Text>
        <Text style={styles.kcal}>{kcal} kcal</Text>
      </View>
    </View>
  );
}

