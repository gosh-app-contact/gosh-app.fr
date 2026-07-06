import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';
import { useColors } from '../../constants/theme';

interface Props {
  size?: number;
  onPress: () => void;
}

export default function UserPlusIcon({ size = 36, onPress }: Props) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name="person-add" size={size * 0.5} color="#fff" />
    </TouchableOpacity>
  );
}
