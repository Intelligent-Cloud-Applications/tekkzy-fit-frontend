import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const easeOut = Easing.bezier(0.22, 1, 0.36, 1);

export function LoadingScreen({
  exiting,
  onExited,
}: {
  exiting?: boolean;
  onExited?: () => void;
}) {
  const curtain = useRef(new Animated.Value(1)).current;
  const mark = useRef(new Animated.Value(0)).current;
  const spinA = useRef(new Animated.Value(0)).current;
  const spinB = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(mark, { toValue: 1, duration: 700, easing: easeOut, useNativeDriver: true }).start();
    const loopA = Animated.loop(
      Animated.timing(spinA, { toValue: 1, duration: 1100, easing: Easing.bezier(0.55, 0.15, 0.35, 0.9), useNativeDriver: true }),
    );
    const loopB = Animated.loop(
      Animated.timing(spinB, { toValue: 1, duration: 1700, easing: Easing.bezier(0.55, 0.15, 0.35, 0.9), useNativeDriver: true }),
    );
    loopA.start();
    loopB.start();
    return () => {
      loopA.stop();
      loopB.stop();
    };
  }, [mark, spinA, spinB]);

  useEffect(() => {
    if (!exiting) return;
    Animated.timing(curtain, {
      toValue: 0,
      duration: 380,
      easing: Easing.bezier(0.4, 0, 0.2, 1),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onExited?.();
    });
  }, [curtain, exiting, onExited]);

  return (
    <Animated.View style={{ flex: 1, backgroundColor: '#0a0a0a', opacity: curtain }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View
          style={{
            opacity: mark,
            transform: [{ scale: mark.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }],
          }}
        >
          <Image
            source={require('../assets/splash.png')}
            resizeMode="contain"
            style={{ width: 268, height: 268 }}
          />
        </Animated.View>

        <View style={{ marginTop: 28, width: 40, height: 40 }}>
          <Animated.View
            style={{
              position: 'absolute',
              transform: [{ rotate: spinA.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
            }}
          >
            <Svg width={40} height={40} viewBox="0 0 40 40">
              <Circle cx={20} cy={20} r={16} stroke="rgba(255,255,255,0.1)" strokeWidth={1.6} fill="none" />
              <Circle
                cx={20}
                cy={20}
                r={16}
                stroke="#e10600"
                strokeWidth={1.6}
                fill="none"
                strokeLinecap="round"
                strokeDasharray="22 78"
              />
            </Svg>
          </Animated.View>
          <Animated.View
            style={{
              position: 'absolute',
              transform: [{ rotate: spinB.interpolate({ inputRange: [0, 1], outputRange: ['360deg', '0deg'] }) }],
            }}
          >
            <Svg width={40} height={40} viewBox="0 0 40 40">
              <Circle
                cx={20}
                cy={20}
                r={11}
                stroke="rgba(225,6,0,0.45)"
                strokeWidth={1.4}
                fill="none"
                strokeLinecap="round"
                strokeDasharray="12 58"
              />
            </Svg>
          </Animated.View>
        </View>
      </View>
    </Animated.View>
  );
}
