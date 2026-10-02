import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { errorMessage } from './errors';
import { font } from './fonts';
import { formatDateShort, maskDateInput, parseDateInput, todayISO } from './format';
import { Icon } from './icons';
import { useTheme } from './theme';

export function ScreenPad({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ flex: 1, paddingHorizontal: 16, paddingTop: 8 }, style]}>{children}</View>;
}

export function Kicker({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text style={{ color: t.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase' }}>
      {children}
    </Text>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.text, fontFamily: font.displayX, fontSize: 26, letterSpacing: -0.6 }}>{children}</Text>;
}

export function Copy({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={{ marginTop: 6, color: t.muted, fontSize: 14, lineHeight: 20 }}>{children}</Text>;
}

export function Label({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text style={{ marginBottom: 6, color: t.muted, fontSize: 12, fontWeight: '600', letterSpacing: -0.2 }}>
      {children}
    </Text>
  );
}

export function FormField({
  label,
  children,
  wide,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <View style={{ flexGrow: 1, flexBasis: wide ? '100%' : '47%', minWidth: wide ? '100%' : 0 }}>
      <Label>{label}</Label>
      {children}
    </View>
  );
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{children}</View>;
}

function dateFromIso(value?: string) {
  const iso = parseDateInput(value) || todayISO();
  return new Date(`${iso}T00:00:00`);
}

function isoFromDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function ThemedCalendar({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (iso: string) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const selected = dateFromIso(value);
  const today = dateFromIso(todayISO());
  const [cursor, setCursor] = useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1));
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [
    ...Array.from({ length: firstDow }, () => 0),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(0);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            backgroundColor: t.card,
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: Math.max(insets.bottom, 16),
          }}
        >
          <View style={{ alignItems: 'center', paddingBottom: 8 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.line }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Pressable
              onPress={() => setCursor(new Date(year, month - 1, 1))}
              style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}
            >
              <Icon name="chevronLeft" color={t.text} size={16} />
            </Pressable>
            <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>
              {cursor.toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
            </Text>
            <Pressable
              onPress={() => setCursor(new Date(year, month + 1, 1))}
              style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}
            >
              <Icon name="chevronRight" color={t.text} size={16} />
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', marginBottom: 6 }}>
            {WEEKDAYS.map((day, i) => (
              <Text key={`${day}-${i}`} style={{ flex: 1, textAlign: 'center', color: t.muted, fontSize: 12, fontWeight: '700' }}>
                {day}
              </Text>
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {cells.map((day, i) => {
              const isSelected = day > 0 && day === selected.getDate() && month === selected.getMonth() && year === selected.getFullYear();
              const isToday = day > 0 && day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
              return (
                <View key={`${year}-${month}-${i}`} style={{ width: '14.285%', alignItems: 'center', paddingVertical: 4 }}>
                  {day ? (
                    <Pressable
                      onPress={() => {
                        onChange(isoFromDate(new Date(year, month, day)));
                        onClose();
                      }}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: isSelected ? t.accent : 'transparent',
                        borderWidth: isToday && !isSelected ? 1 : 0,
                        borderColor: t.accent,
                      }}
                    >
                      <Text style={{ color: isSelected ? t.accentInk : t.text, fontSize: 14, fontWeight: isSelected || isToday ? '700' : '500' }}>
                        {day}
                      </Text>
                    </Pressable>
                  ) : (
                    <View style={{ width: 36, height: 36 }} />
                  )}
                </View>
              );
            })}
          </View>
          <Pressable
            onPress={onClose}
            style={{
              marginTop: 12,
              minHeight: 40,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: t.line,
              backgroundColor: t.bg,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: t.text, fontSize: 13, fontWeight: '600' }}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export function DateField({
  value,
  onChange,
  editable = true,
  bare,
}: {
  value: string;
  onChange: (iso: string) => void;
  editable?: boolean;
  bare?: boolean;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(formatDateShort(value));
  useEffect(() => {
    setText((prev) => {
      if (parseDateInput(prev) === value) return prev;
      return formatDateShort(value);
    });
  }, [value]);

  return (
    <View>
      <View style={{ position: 'relative' }}>
        <Field
          bare={bare}
          value={text}
          editable={editable}
          placeholder="dd/mm/yy"
          keyboardType="number-pad"
          maxLength={8}
          style={{ paddingRight: editable ? 40 : undefined }}
          onChangeText={(next) => {
            const masked = maskDateInput(next);
            setText(masked);
            const iso = parseDateInput(masked);
            if (iso) onChange(iso);
            if (!masked) onChange('');
          }}
        />
        {editable ? (
          <Pressable
            onPress={() => setOpen(true)}
            hitSlop={6}
            style={{
              position: 'absolute',
              right: bare ? 0 : 4,
              top: 0,
              bottom: 0,
              width: 36,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="calendar" color={t.muted} size={16} />
          </Pressable>
        ) : null}
      </View>
      {open ? <ThemedCalendar value={value} onChange={onChange} onClose={() => setOpen(false)} /> : null}
    </View>
  );
}

export function Field({ bare, ...props }: TextInputProps & { bare?: boolean }) {
  const t = useTheme();
  return (
    <TextInput
      placeholderTextColor={t.muted}
      {...props}
      style={[
        {
          height: bare ? 36 : 40,
          borderRadius: bare ? 0 : 12,
          borderWidth: bare ? 0 : 1,
          borderColor: t.line,
          backgroundColor: bare ? 'transparent' : t.input,
          color: t.text,
          paddingHorizontal: bare ? 0 : 12,
          fontSize: 13,
        },
        props.multiline ? { height: 84, textAlignVertical: 'top', paddingTop: 8 } : null,
        props.style,
      ]}
    />
  );
}

export function Btn({
  title,
  onPress,
  busy,
  ghost,
  danger,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  ghost?: boolean;
  danger?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const t = useTheme();
  return (
    <Pressable
      disabled={disabled || busy}
      onPress={onPress}
      style={[
        {
          minHeight: 48,
          borderRadius: 24,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 16,
          backgroundColor: ghost ? 'transparent' : danger ? '#8b1111' : t.accent,
          borderWidth: ghost ? 1 : 0,
          borderColor: t.line,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={ghost ? t.accent : t.accentInk} />
      ) : (
        <Text style={{ color: ghost ? t.text : t.accentInk, fontSize: 15, fontWeight: '800' }}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Card({ children, tone, onPress }: { children: ReactNode; tone?: 'ok' | 'bad' | 'warn'; onPress?: () => void }) {
  const t = useTheme();
  const bg = tone === 'ok' ? t.ok : tone === 'bad' ? t.bad : tone === 'warn' ? t.warn : t.card;
  const inner = (
    <View style={{ marginTop: 10, padding: 14, borderRadius: 16, backgroundColor: bg, borderWidth: 1, borderColor: t.line }}>
      {children}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{inner}</Pressable> : inner;
}

const BADGE: Record<string, { bg: string; fg: string; darkBg: string; darkFg: string }> = {
  ACTIVE: { bg: '#e8f7ef', fg: '#18794e', darkBg: '#163024', darkFg: '#7ee0a8' },
  GRANTED: { bg: '#e8f7ef', fg: '#18794e', darkBg: '#163024', darkFg: '#7ee0a8' },
  PAID: { bg: '#e8f7ef', fg: '#18794e', darkBg: '#163024', darkFg: '#7ee0a8' },
  PENDING: { bg: '#fff4e0', fg: '#b45309', darkBg: '#2c2410', darkFg: '#ffc14d' },
  PAUSED: { bg: '#ece8e8', fg: '#4a4445', darkBg: '#2a2a2a', darkFg: '#d4d4d4' },
  CANCELLED: { bg: '#ffe8e8', fg: '#c81e1e', darkBg: '#2f1719', darkFg: '#ff6b6b' },
  EXPIRED: { bg: '#ffe8e8', fg: '#c81e1e', darkBg: '#2f1719', darkFg: '#ff6b6b' },
  SUSPENDED: { bg: '#ffe8e8', fg: '#c81e1e', darkBg: '#2f1719', darkFg: '#ff6b6b' },
  OFFLINE: { bg: '#f3eeee', fg: '#6f5c5e', darkBg: '#242424', darkFg: '#9a9a9a' },
  ONLINE: { bg: '#e8f7ef', fg: '#18794e', darkBg: '#163024', darkFg: '#7ee0a8' },
  DISCONNECTED: { bg: '#ffe8e8', fg: '#d70015', darkBg: '#3a1215', darkFg: '#ff453a' },
  STAFF: { bg: '#ece8e8', fg: '#4a4445', darkBg: '#2a2a2a', darkFg: '#d4d4d4' },
  UNKNOWN: { bg: '#f3eeee', fg: '#6f5c5e', darkBg: '#242424', darkFg: '#9a9a9a' },
};

/** Small "BY <staff>" chip on member rows that a staff member created. */
export function AddedByTag({ name }: { name: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: 999, backgroundColor: t.accentSoft, paddingHorizontal: 6, paddingVertical: 1 }}>
      <Icon name="users" color={t.accent} size={9} />
      <Text numberOfLines={1} style={{ maxWidth: 110, color: t.accent, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 }}>
        BY {name.split(/\s+/)[0].toUpperCase()}
      </Text>
    </View>
  );
}

export function StatusBadge({ value, compact }: { value?: string; compact?: boolean }) {
  const t = useTheme();
  const raw = String(value || '—').toUpperCase().replaceAll('_', ' ');
  const tone = BADGE[raw] || BADGE.UNKNOWN;
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderRadius: 999,
        paddingHorizontal: compact ? 6 : 8,
        paddingVertical: compact ? 1 : 3,
        backgroundColor: t.name === 'light' ? tone.bg : tone.darkBg,
      }}
    >
      <Text
        style={{
          color: t.name === 'light' ? tone.fg : tone.darkFg,
          fontSize: compact ? 9 : 10,
          fontWeight: '800',
          letterSpacing: 0.5,
        }}
      >
        {raw}
      </Text>
    </View>
  );
}

export function Pill({ value }: { value?: string }) {
  const t = useTheme();
  const raw = String(value || '—').toUpperCase();
  const good = ['PAID', 'ACTIVE', 'PRESENT', 'GRANTED', 'ONLINE'].includes(raw);
  const bad = ['PENDING', 'FAILED', 'SUSPENDED', 'EXPIRED', 'ABSENT', 'DENIED'].includes(raw);
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
        backgroundColor: good ? t.ok : bad ? t.bad : t.card,
        borderWidth: 1,
        borderColor: t.line,
      }}
    >
      <Text style={{ color: t.text, fontSize: 10, fontWeight: '800' }}>{raw}</Text>
    </View>
  );
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, minWidth: '46%', padding: 14, borderRadius: 16, backgroundColor: t.card, borderWidth: 1, borderColor: t.line }}>
      <Text style={{ color: t.muted, fontSize: 11, fontWeight: '700' }}>{label}</Text>
      <Text style={{ marginTop: 6, color: t.text, fontSize: 20, fontWeight: '800' }}>{value}</Text>
    </View>
  );
}

export function Select({
  value,
  onChange,
  options,
  disabled,
  pill,
  bare,
  title,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  pill?: boolean;
  bare?: boolean;
  title?: string;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? options[0];
  return (
    <>
      <Pressable
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={        {
          height: bare ? 36 : 40,
          borderRadius: pill ? 999 : bare ? 0 : 12,
          borderWidth: bare ? 0 : 1,
          borderColor: t.line,
          backgroundColor: bare ? 'transparent' : t.input,
          paddingHorizontal: bare ? 0 : 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          opacity: disabled ? 0.55 : 1,
        }}
      >
        <Text numberOfLines={1} style={{ flex: 1, color: t.text, fontSize: 13 }}>
          {selected?.label || 'Select'}
        </Text>
        <Icon name="chevron" color={t.muted} size={16} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <Pressable style={{ flex: 1 }} onPress={() => setOpen(false)} />
          <View
            style={{
              maxHeight: '70%',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              backgroundColor: t.card,
              paddingBottom: Math.max(insets.bottom, 16),
            }}
          >
            <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: t.line }} />
            </View>
            <Text style={{ textAlign: 'center', color: t.text, fontSize: 15, fontWeight: '700', paddingHorizontal: 16, paddingBottom: 8 }}>
              {title || 'Choose'}
            </Text>
            <ScrollView>
              {options.map((option) => {
                const active = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    style={{
                      minHeight: 52,
                      paddingHorizontal: 20,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      backgroundColor: active ? t.accentSoft : 'transparent',
                    }}
                  >
                    <Text style={{ flex: 1, color: active ? t.accent : t.text, fontSize: 16, fontWeight: active ? '700' : '500' }}>
                      {option.label}
                    </Text>
                    {active ? <Text style={{ color: t.accent, fontSize: 16 }}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              onPress={() => setOpen(false)}
              style={{
                marginTop: 8,
                marginHorizontal: 16,
                minHeight: 48,
                borderRadius: 14,
                backgroundColor: t.bg,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

export function Chip({
  label,
  on,
  onPress,
}: {
  label: string;
  on?: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: on ? t.accent : t.card,
        borderWidth: 1,
        borderColor: on ? t.accent : t.line,
      }}
    >
      <Text style={{ color: on ? t.accentInk : t.text, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ text }: { text: string }) {
  const t = useTheme();
  return <Text style={{ marginTop: 24, color: t.muted, textAlign: 'center', fontSize: 14 }}>{text}</Text>;
}

export function ErrorText({ text }: { text?: string }) {
  if (!text) return null;
  return <Text style={{ marginTop: 10, color: '#ff6b6b', fontSize: 13 }}>{errorMessage(text)}</Text>;
}

export const row = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  split: { flexDirection: 'row', gap: 10 },
});
