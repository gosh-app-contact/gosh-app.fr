import React, { useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors, spacing, radius } from '../constants/theme';
import { sendReport, blockUser, REPORT_REASONS, ReportReason } from '../utils/reportUser';

type Props = {
  visible: boolean;
  onClose: () => void;
  reportedUid: string;
  contentType: 'post' | 'message' | 'user' | 'club' | 'coach';
  contentId?: string;
  contentText?: string;
  reportedPseudo?: string;
  clubId?: string;
  onBlocked?: () => void;
};

export default function ReportModal({ visible, onClose, reportedUid, contentType, contentId, contentText, reportedPseudo, clubId, onBlocked }: Props) {
  const colors = useColors();
  const [step, setStep] = useState<'reason' | 'confirm' | 'done'>('reason');
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null);
  const [loading, setLoading] = useState(false);
  const [withBlock, setWithBlock] = useState(false);

  const reset = () => { setStep('reason'); setSelectedReason(null); setLoading(false); setWithBlock(false); };
  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!selectedReason) return;
    setLoading(true);
    try {
      await sendReport({ reportedUid, contentType, contentId, contentText, reportedPseudo, clubId, reason: selectedReason });
      if (withBlock) await blockUser(reportedUid);
      setStep('done');
    } catch (e: any) {
      if (e?.message === 'daily_limit_reached') {
        Alert.alert('Limite atteinte', 'Tu as atteint la limite de 5 signalements par jour. Réessaie demain.');
      } else {
        Alert.alert('Erreur', 'Impossible d\'envoyer le signalement.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDone = () => {
    if (withBlock) onBlocked?.();
    handleClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
        activeOpacity={1}
        onPress={step === 'done' ? handleDone : handleClose}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34 }}>

            {/* Handle */}
            <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 8 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
            </View>

            {step === 'done' ? (
              <View style={{ alignItems: 'center', padding: spacing.xl, gap: 12 }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accentGreen + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="checkmark-circle" size={30} color={colors.accentGreen} />
                </View>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center' }}>Signalement envoyé</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
                  Merci pour ton signalement. Notre équipe l'examinera sous 24h et prendra les mesures nécessaires.
                  {withBlock ? '\n\nCet utilisateur a été bloqué et ne pourra plus interagir avec toi.' : ''}
                </Text>
                <TouchableOpacity
                  onPress={handleDone}
                  style={{ backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 13, paddingHorizontal: 32, marginTop: 4 }}
                >
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>Fermer</Text>
                </TouchableOpacity>
              </View>
            ) : step === 'confirm' ? (
              <View style={{ padding: spacing.lg, gap: spacing.md }}>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>Confirmer le signalement</Text>
                <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 2 }}>Motif sélectionné</Text>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>
                    {REPORT_REASONS.find((r) => r.key === selectedReason)?.label}
                  </Text>
                </View>

                {/* Option bloquer */}
                <TouchableOpacity
                  onPress={() => setWithBlock((v) => !v)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: withBlock ? colors.accent + '15' : colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: withBlock ? colors.accent + '50' : colors.border }}
                  activeOpacity={0.8}
                >
                  <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: withBlock ? colors.accent : colors.border, backgroundColor: withBlock ? colors.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {withBlock && <Ionicons name="checkmark" size={13} color="#fff" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>Bloquer cet utilisateur</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>Il ne pourra plus voir tes contenus ni t'envoyer de messages</Text>
                  </View>
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border }}>
                  <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
                  <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1, lineHeight: 17 }}>
                    Notre équipe examinera ce signalement sous 24h.
                  </Text>
                </View>

                <View style={{ gap: 8, marginTop: 4 }}>
                  <TouchableOpacity
                    onPress={handleSubmit}
                    disabled={loading}
                    style={{ backgroundColor: '#FF3B30', borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                    activeOpacity={0.85}
                  >
                    {loading
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <><Ionicons name="flag" size={16} color="#fff" /><Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Envoyer le signalement</Text></>}
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setStep('reason')} disabled={loading} style={{ paddingVertical: 12, alignItems: 'center' }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Retour</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={{ padding: spacing.lg, gap: spacing.md }}>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>Pourquoi signales-tu ce contenu ?</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 18 }}>
                  Ton signalement est anonyme. Nous l'examinerons et prendrons les mesures nécessaires.
                </Text>
                <View style={{ gap: 8 }}>
                  {REPORT_REASONS.map((reason) => (
                    <TouchableOpacity
                      key={reason.key}
                      onPress={() => { setSelectedReason(reason.key); setStep('confirm'); }}
                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: 12 }}
                      activeOpacity={0.8}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{reason.label}</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1 }}>{reason.description}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
