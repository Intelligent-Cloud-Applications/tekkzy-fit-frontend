import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Keyboard,
  LayoutAnimation,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './icons';
import { useTheme } from './theme';

export const formScreenOptions = {
  presentation: 'transparentModal' as const,
  animation: 'slide_from_bottom' as const,
  headerShown: false,
  gestureEnabled: true,
  contentStyle: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
};

export function AppSheet({
  title,
  onClose,
  onSave,
  saveTitle,
  busy,
  children,
}: {
  title: string;
  onClose: () => void;
  onSave?: () => void;
  saveTitle?: string;
  busy?: boolean;
  children: ReactNode;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const [kb, setKb] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const drag = useRef(new Animated.Value(0)).current;
  const startY = useRef(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => {
      LayoutAnimation.configureNext(LayoutAnimation.create(220, 'easeInEaseOut', 'opacity'));
      setKb(Math.round(e.endCoordinates.height || 0));
    });
    const hide = Keyboard.addListener(hideEvt, () => {
      LayoutAnimation.configureNext(LayoutAnimation.create(180, 'easeInEaseOut', 'opacity'));
      setKb(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: () => {
      drag.stopAnimation((value) => {
        startY.current = typeof value === 'number' ? value : 0;
      });
    },
    onPanResponderMove: (_, gesture) => {
      const next = startY.current + gesture.dy;
      drag.setValue(next < 0 ? next * 0.22 : next);
    },
    onPanResponderRelease: (_, gesture) => {
      const next = Math.max(0, startY.current + gesture.dy);
      if (next > 140 || gesture.vy > 1.05) {
        Animated.timing(drag, { toValue: winH, duration: 180, useNativeDriver: true }).start(() => closeRef.current());
        return;
      }
      Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 3, speed: 16 }).start();
    },
  }), [drag, winH]);

  const backdrop = drag.interpolate({
    inputRange: [0, winH],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const screenH = Dimensions.get('screen').height;
  const windowAlreadyResized = kb > 0 && screenH - winH > Math.max(100, kb * 0.4);
  const lift = kb && !windowAlreadyResized ? kb : 0;
  const maxSheet = Math.min(winH * 0.92, 832, Math.max(260, winH - lift - 8));
  const footerPad = kb ? 10 : Math.max(insets.bottom, 12);

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 100, elevation: 100, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdrop }]}>
        <Pressable style={{ flex: 1 }} onPress={() => { Keyboard.dismiss(); onClose(); }} />
      </Animated.View>
      <Animated.View style={{ transform: [{ translateY: drag }], marginBottom: lift, width: '100%' }}>
        <View
          style={{
            maxHeight: maxSheet,
            backgroundColor: t.card,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOpacity: 0.5,
            shadowRadius: 40,
            shadowOffset: { width: 0, height: -8 },
            elevation: 24,
          }}
        >
          <View {...pan.panHandlers}>
            <View style={{ alignItems: 'center', paddingTop: 8 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.line }} />
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: t.line,
              }}
            >
              <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 16, fontWeight: '700', letterSpacing: -0.3 }}>
                {title}
              </Text>
              <Pressable
                onPress={onClose}
                hitSlop={10}
                style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="x" color={t.muted} size={16} />
              </Pressable>
            </View>
          </View>
          <ScrollView
            ref={scrollRef}
            style={{ maxHeight: Math.max(140, maxSheet - 148 - footerPad) }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: kb ? 28 : 16 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            automaticallyAdjustKeyboardInsets
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: footerPad,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: t.line,
              backgroundColor: t.card,
            }}
          >
            <Pressable
              onPress={onClose}
              style={{
                flex: 1,
                minHeight: 40,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: t.line,
                backgroundColor: t.name === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: t.text, fontSize: 13, fontWeight: '600' }}>{onSave ? 'Cancel' : 'Close'}</Text>
            </Pressable>
            {onSave ? <Pressable
              onPress={onSave}
              disabled={busy}
              style={{
                flex: 1,
                minHeight: 40,
                borderRadius: 999,
                backgroundColor: t.accent,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: busy ? 0.4 : 1,
              }}
            >
              {busy ? (
                <ActivityIndicator color={t.accentInk} />
              ) : (
                <Text style={{ color: t.accentInk, fontSize: 13, fontWeight: '600' }}>{saveTitle}</Text>
              )}
            </Pressable> : null}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

export function FormGroup({ title, children }: { title?: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ marginTop: 18 }}>
      {title ? (
        <Text style={{ marginBottom: 8, marginLeft: 6, color: t.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' }}>
          {title}
        </Text>
      ) : null}
      <View style={{ borderRadius: 18, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, overflow: 'hidden' }}>
        {children}
      </View>
    </View>
  );
}

export function FormRow({
  label,
  last,
  stack,
  children,
}: {
  label: string;
  last?: boolean;
  stack?: boolean;
  children: ReactNode;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        minHeight: 48,
        paddingHorizontal: 14,
        paddingVertical: stack ? 10 : 0,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: t.line,
        flexDirection: stack ? 'column' : 'row',
        alignItems: stack ? 'stretch' : 'center',
        gap: stack ? 6 : 10,
      }}
    >
      <Text style={{ width: stack ? undefined : 102, color: t.muted, fontSize: 14 }}>{label}</Text>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

export function FormHint({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.muted, fontSize: 11, lineHeight: 16 }}>{children}</Text>;
}
