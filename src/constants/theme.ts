import { useColorScheme } from 'react-native';

export const darkColors = {
  bg: '#1C1C1E',
  surface: '#2C2C2E',
  card: '#2C2C2E',
  border: '#3A3A3C',
  text: '#FFFFFF',
  textSecondary: '#8E8E93',
  accent: '#FF6B35',
  accentGreen: '#4CAF50',
  accentBlue: '#3B82F6',
  danger: '#FF3B30',
  warning: '#F59E0B',
};

export const lightColors = {
  bg: '#F2F2F7',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  border: '#C6C6C8',
  text: '#000000',
  textSecondary: '#8E8E93',
  accent: '#FF6B35',
  accentGreen: '#34C759',
  accentBlue: '#007AFF',
  danger: '#FF3B30',
  warning: '#FF9500',
};

export type AppColors = typeof darkColors;

export function useColors(): AppColors {
  const scheme = useColorScheme();
  return scheme === 'light' ? lightColors : darkColors;
}

// Keep `colors` as a named export pointing to dark for non-component usage (will be removed progressively)
export const colors = darkColors;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 9999 };
