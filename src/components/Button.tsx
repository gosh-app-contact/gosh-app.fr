import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, ViewStyle } from 'react-native';
import { useColors, radius, spacing } from '../constants/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export default function Button({
  label, onPress, variant = 'primary', size = 'md',
  loading = false, disabled = false, fullWidth = true, style,
}: Props) {
  const colors = useColors();

  const pad: Record<Size, { paddingVertical: number; paddingHorizontal: number }> = {
    sm: { paddingVertical: 8,  paddingHorizontal: 14 },
    md: { paddingVertical: 13, paddingHorizontal: 20 },
    lg: { paddingVertical: 16, paddingHorizontal: 24 },
  };

  const fontSize: Record<Size, number> = { sm: 13, md: 15, lg: 16 };

  const bg: Record<Variant, string> = {
    primary:   colors.accent,
    secondary: 'transparent',
    ghost:     'transparent',
    danger:    '#FF3B3015',
  };

  const border: Record<Variant, string | undefined> = {
    primary:   undefined,
    secondary: colors.accent,
    ghost:     undefined,
    danger:    '#FF3B30',
  };

  const textColor: Record<Variant, string> = {
    primary:   '#fff',
    secondary: colors.accent,
    ghost:     colors.textSecondary,
    danger:    '#FF3B30',
  };

  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      style={[
        {
          backgroundColor: bg[variant],
          borderRadius: radius.md,
          borderWidth: border[variant] ? 1.5 : 0,
          borderColor: border[variant],
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
          flexDirection: 'row' as const,
          alignSelf: fullWidth ? undefined : 'flex-start' as const,
          opacity: isDisabled ? 0.45 : 1,
          ...pad[size],
        },
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator color={textColor[variant]} size="small" />
        : <Text style={{ color: textColor[variant], fontSize: fontSize[size], fontWeight: '700' }}>{label}</Text>
      }
    </TouchableOpacity>
  );
}
