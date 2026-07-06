import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Ellipse } from 'react-native-svg';

type Props = {
  size?: number;
  color: string;
  glowColor: string;
  active?: boolean;
};

const LOGOS: Record<string, any> = {
  '#FF6B35': require('../../assets/images/logo-orange.png'),
  '#FF8C00': require('../../assets/images/logo-orange.png'),
  '#FFB800': require('../../assets/images/logo-gold.png'),
  '#A855F7': require('../../assets/images/logo-purple.png'),
  '#EC4899': require('../../assets/images/logo-pink.png'),
  '#888':    require('../../assets/images/logo-grey.png'),
};

function getLogo(color: string) {
  return LOGOS[color] ?? require('../../assets/images/logo-orange.png');
}

export default function FlameIcon({ size = 44, color, glowColor, active = true }: Props) {
  const glowOpacity = useRef(new Animated.Value(0.6)).current;
  const logoScale   = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) return;

    const aGlowOp = Animated.loop(Animated.sequence([
      Animated.timing(glowOpacity, { toValue: 1,   duration: 600, useNativeDriver: true }),
      Animated.timing(glowOpacity, { toValue: 0.35, duration: 800, useNativeDriver: true }),
    ]));
    const aLogo = Animated.loop(Animated.sequence([
      Animated.timing(logoScale, { toValue: 1.05, duration: 800,  useNativeDriver: true }),
      Animated.timing(logoScale, { toValue: 0.97, duration: 600,  useNativeDriver: true }),
      Animated.timing(logoScale, { toValue: 1,    duration: 500,  useNativeDriver: true }),
    ]));

    aGlowOp.start();
    aLogo.start();
    return () => { aGlowOp.stop(); aLogo.stop(); };
  }, [active]);

  const logo = active ? getLogo(color) : require('../../assets/images/logo-grey.png');
  const glowSize = size * 2.6;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>

      {/* Lueur radiale SVG — dégradé parfait, aucune forme visible */}
      {active && (
        <Animated.View style={{
          position: 'absolute',
          width: glowSize, height: glowSize,
          top: -(glowSize - size) / 2,
          left: -(glowSize - size) / 2,
          opacity: glowOpacity,
        }}>
          <Svg width={glowSize} height={glowSize}>
            <Defs>
              <RadialGradient id={`glow_${color}`} cx="50%" cy="50%" rx="50%" ry="50%">
                <Stop offset="0%"   stopColor={glowColor} stopOpacity="0.65" />
                <Stop offset="35%"  stopColor={glowColor} stopOpacity="0.25" />
                <Stop offset="65%"  stopColor={glowColor} stopOpacity="0.07" />
                <Stop offset="100%" stopColor={glowColor} stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Ellipse
              cx={glowSize / 2} cy={glowSize / 2}
              rx={glowSize / 2} ry={glowSize / 2}
              fill={`url(#glow_${color})`}
            />
          </Svg>
        </Animated.View>
      )}

      {/* Logo */}
      <Animated.Image
        source={logo}
        style={{
          width: size,
          height: size,
          transform: [{ scale: logoScale }],
          opacity: active ? 1 : 0.35,
        }}
        resizeMode="contain"
      />
    </View>
  );
}
