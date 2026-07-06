import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Button from './Button';
import { useColors, spacing, radius } from '../constants/theme';
import { WorkoutSession } from '../types/training';
import { MUSCLE_LABELS } from '../types/training';

interface Props {
  session: WorkoutSession | null;
  time?: string;
  onClose: () => void;
}

export default function SessionDetailModal({ session, time, onClose }: Props) {
  const colors = useColors();
  const styles = useMemo(() => StyleSheet.create({
    overlay: { flex: 1, backgroundColor: '#000000CC', justifyContent: 'flex-end' as const },
    card: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl, maxHeight: '80%', gap: spacing.md },
    header: { flexDirection: 'row' as const, alignItems: 'flex-start' as const },
    title: { color: colors.text, fontSize: 20, fontWeight: '800' as const },
    time: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
    summary: { color: colors.accent, fontSize: 13, fontWeight: '700' as const, marginTop: 4 },
    muscles: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
    closeBtn: { padding: spacing.sm },
    closeBtnText: { color: colors.textSecondary, fontSize: 18 },
    list: { flexGrow: 0 },
    exRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
    exIndex: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accent + '22', alignItems: 'center' as const, justifyContent: 'center' as const },
    exIndexText: { color: colors.accent, fontSize: 13, fontWeight: '700' as const },
    exName: { color: colors.text, fontSize: 14, fontWeight: '600' as const },
    exMuscle: { color: colors.textSecondary, fontSize: 12, marginTop: 1 },
    exSets: { alignItems: 'flex-end' as const },
    exSetsValue: { color: colors.text, fontSize: 15, fontWeight: '800' as const },
    exSetsLabel: { color: colors.textSecondary, fontSize: 10 },
    doneBtn: { backgroundColor: colors.accent, borderRadius: radius.sm, padding: spacing.md, alignItems: 'center' as const },
    doneBtnText: { color: colors.text, fontWeight: '700' as const, fontSize: 15 },
  }), [colors]);

  if (!session) return null;

  const totalSets = session.exercises.reduce((s, e) => s + e.sets, 0);
  const muscles = [...new Set(session.exercises.map((e) => MUSCLE_LABELS[e.muscle]))];

  return (
    <Modal visible={!!session} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{session.name}</Text>
              <Text style={styles.summary}>{session.exercises.length} exercices · {totalSets} séries</Text>
              <Text style={styles.muscles}>{muscles.join(' · ')}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={styles.closeBtnText.color} />
            </TouchableOpacity>
          </View>

          {/* Liste exercices */}
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {session.exercises.map((ex, i) => (
              <View key={ex.id} style={styles.exRow}>
                <View style={styles.exIndex}>
                  <Text style={styles.exIndexText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.exName}>{ex.name}</Text>
                  <Text style={styles.exMuscle}>{MUSCLE_LABELS[ex.muscle]}</Text>
                </View>
                <View style={styles.exSets}>
                  <Text style={styles.exSetsValue}>{ex.sets} × {ex.reps}</Text>
                  <Text style={styles.exSetsLabel}>séries × reps</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <Button label="Fermer" variant="secondary" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

