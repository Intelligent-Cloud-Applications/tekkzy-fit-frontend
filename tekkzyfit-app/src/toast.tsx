import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { font } from './fonts';
import { Icon } from './icons';
import { useTheme } from './theme';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';
export type ToastItem = { id: string; kind: ToastKind; title: string; message?: string };

type Listener = (rows: ToastItem[]) => void;
let rows: ToastItem[] = [];
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((fn) => fn(rows));
}

function lifeFor(kind: ToastKind) {
  return kind === 'error' ? 4600 : 3200;
}

export function pushToast(toast: Omit<ToastItem, 'id'>) {
  const item = { ...toast, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
  rows = [...rows, item].slice(-3);
  emit();
  try {
    const type =
      toast.kind === 'error'
        ? Haptics.NotificationFeedbackType.Error
        : toast.kind === 'warning'
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Success;
    void Haptics.notificationAsync(type);
  } catch {
    /* ignore */
  }
  setTimeout(() => dismissToast(item.id), lifeFor(toast.kind));
}

export function dismissToast(id: string) {
  rows = rows.filter((row) => row.id !== id);
  emit();
}

function useToasts() {
  const [toasts, setToasts] = useState(rows);
  useEffect(() => {
    listeners.add(setToasts);
    return () => {
      listeners.delete(setToasts);
    };
  }, []);
  return toasts;
}

const KIND = {
  success: { label: 'DONE', icon: 'check' },
  error: { label: 'FAILED', icon: 'x' },
  warning: { label: 'CHECK', icon: 'alert' },
  info: { label: 'NOTE', icon: 'bell' },
} as const;

export function ToastViewport() {
  const insets = useSafeAreaInsets();
  const toasts = useToasts();
  if (!toasts.length) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, top: insets.top + 10, zIndex: 80, gap: 10 }}>
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </View>
  );
}

function ToastCard({ toast }: { toast: ToastItem }) {
  const t = useTheme();
  const meta = KIND[toast.kind] || KIND.info;
  const slide = useRef(new Animated.Value(-18)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(1)).current;
  const life = lifeFor(toast.kind);
  const mark = toast.kind === 'success' ? '#111111' : toast.kind === 'warning' ? '#111111' : t.accentInk;
  const markBg = toast.kind === 'success' ? '#7cde2a' : toast.kind === 'warning' ? '#f5c400' : t.accent;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slide, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 7 }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(bar, { toValue: 0, duration: life, useNativeDriver: false }),
    ]).start();
  }, [bar, life, opacity, slide]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY: slide }] }}>
      <Pressable
        onPress={() => dismissToast(toast.id)}
        style={{
          overflow: 'hidden',
          borderRadius: 22,
          borderWidth: 1,
          borderColor: t.name === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)',
          backgroundColor: t.name === 'light' ? '#111111' : '#161314',
          paddingHorizontal: 14,
          paddingTop: 13,
          paddingBottom: 12,
          shadowColor: t.accent,
          shadowOpacity: 0.28,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 12,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: markBg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={meta.icon} color={mark} size={16} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                color: t.accent,
                fontFamily: font.brand,
                fontSize: 10,
                letterSpacing: 1.6,
              }}
            >
              {meta.label}
            </Text>
            <Text
              numberOfLines={2}
              style={{
                marginTop: 2,
                color: '#f6f1f1',
                fontFamily: font.display,
                fontSize: 16,
                letterSpacing: -0.4,
              }}
            >
              {toast.title}
            </Text>
            {toast.message ? (
              <Text numberOfLines={2} style={{ marginTop: 3, color: 'rgba(246,241,241,0.62)', fontFamily: font.sans, fontSize: 12, lineHeight: 16 }}>
                {toast.message}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={{ marginTop: 12, height: 2, overflow: 'hidden', borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.08)' }}>
          <Animated.View
            style={{
              height: 2,
              borderRadius: 99,
              backgroundColor: markBg,
              width: bar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
            }}
          />
        </View>
      </Pressable>
    </Animated.View>
  );
}
