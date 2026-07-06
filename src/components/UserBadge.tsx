import React from 'react';
import { View, Image } from 'react-native';

const COACH_BADGE = require('../../assets/badges/Badge-coach.png');
const VERIF_BADGE = require('../../assets/badges/Badge-verif.png');

interface Props {
  accountType?: string;
  verified?: boolean;
  size?: number;
}

export default function UserBadge({ accountType, verified, size = 16 }: Props) {
  const badges = [];
  if (accountType === 'coach') badges.push({ key: 'coach', src: COACH_BADGE });
  if (verified) badges.push({ key: 'verif', src: VERIF_BADGE });
  if (badges.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      {badges.map((b) => (
        <Image key={b.key} source={b.src} style={{ width: size, height: size }} resizeMode="contain" />
      ))}
    </View>
  );
}
