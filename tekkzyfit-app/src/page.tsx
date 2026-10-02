import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from 'react-native';
import { font } from './fonts';
import { Icon } from './icons';
import { useTheme } from './theme';
import { Field, StatusBadge } from './ui';

export function PageTitle({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text
      style={{
        color: t.text,
        fontFamily: font.display,
        fontSize: 22,
        lineHeight: 24,
        letterSpacing: -0.7,
      }}
    >
      {children}
    </Text>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={{ marginTop: 6, color: t.muted, fontFamily: font.sans, fontSize: 11, lineHeight: 16 }}>{children}</Text>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text style={{ marginTop: 18, marginBottom: 8, color: t.text, fontFamily: font.display, fontSize: 16, letterSpacing: -0.4 }}>
      {children}
    </Text>
  );
}

export function ActionBar({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 8, marginTop: 8 }}>{children}</View>;
}

export function ActionBtn({
  title,
  onPress,
  primary,
  busy,
  icon,
}: {
  title: string;
  onPress: () => void;
  primary?: boolean;
  busy?: boolean;
  icon?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        minHeight: 40,
        borderRadius: 999,
        borderWidth: primary ? 0 : 1,
        borderColor: t.line,
        backgroundColor: primary ? t.accent : t.card,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingHorizontal: 12,
      }}
    >
      {busy ? (
        <ActivityIndicator color={primary ? t.accentInk : t.text} size="small" />
      ) : icon ? (
        <Icon name={icon} color={primary ? t.accentInk : t.text} size={14} />
      ) : null}
      <Text style={{ color: primary ? t.accentInk : t.text, fontSize: 13, fontWeight: '700' }}>{title}</Text>
    </Pressable>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  style?: ViewStyle;
}) {
  const t = useTheme();
  return (
    <View style={[{ position: 'relative' }, style]}>
      <Field
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        style={{ height: 40, borderRadius: 999, paddingLeft: 36, fontSize: 13, backgroundColor: t.card }}
      />
      <View pointerEvents="none" style={{ position: 'absolute', left: 12, top: 0, bottom: 0, justifyContent: 'center' }}>
        <Icon name="search" color={t.muted} size={16} />
      </View>
    </View>
  );
}

export function ListCard({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  const t = useTheme();
  const inner = (
    <View
      style={{
        marginBottom: 10,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: t.line,
        backgroundColor: t.card,
        overflow: 'hidden',
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      {children}
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{inner}</Pressable> : inner;
}

export function MetaRow({ label, value }: { label: string; value?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: t.line }}>
      <Text style={{ color: t.muted, fontSize: 12 }}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' || !value ? (
        <Text style={{ flex: 1, textAlign: 'right', color: t.text, fontSize: 12, fontWeight: '700' }}>{value || '—'}</Text>
      ) : (
        value
      )}
    </View>
  );
}

export function StatTile({ label, value }: { label: string; value: string | number }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, minWidth: '46%', paddingHorizontal: 12, paddingVertical: 12, borderRadius: 16, backgroundColor: t.card, borderWidth: 1, borderColor: t.line }}>
      <Text style={{ color: t.muted, fontSize: 11, fontWeight: '700' }}>{label}</Text>
      <Text style={{ marginTop: 6, color: t.text, fontFamily: font.display, fontSize: 20, letterSpacing: -0.5 }}>{value}</Text>
    </View>
  );
}

export function PaginationBar({
  page,
  pageSize,
  total,
  hasMore,
  onPage,
}: {
  page: number;
  pageSize: number;
  total?: number;
  hasMore?: boolean;
  onPage: (page: number) => void;
}) {
  const t = useTheme();
  const knownTotal = typeof total === 'number' && total > 0;
  if (!knownTotal && !hasMore && page === 0) return null;
  const pages = knownTotal ? Math.max(1, Math.ceil(total / pageSize)) : page + (hasMore ? 2 : 1);
  const start = knownTotal ? (total === 0 ? 0 : page * pageSize + 1) : page * pageSize + 1;
  const end = knownTotal
    ? Math.min(total, (page + 1) * pageSize)
    : start + Math.max(pageSize - 1, 0);
  const canNext = knownTotal ? page < pages - 1 : Boolean(hasMore);
  return (
    <View
      style={{
        marginTop: 4,
        marginBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: t.line,
        backgroundColor: t.card,
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}
    >
      <Text style={{ color: t.muted, fontSize: 12 }}>
        {knownTotal ? `${start}–${end} of ${total}` : hasMore || page > 0 ? `Page ${page + 1}` : `${start}–${end}`}
      </Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <PageBtn title="Prev" disabled={page === 0} onPress={() => onPage(page - 1)} />
        <PageBtn title="Next" disabled={!canNext} onPress={() => onPage(page + 1)} />
      </View>
    </View>
  );
}

function PageBtn({ title, disabled, onPress }: { title: string; disabled?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 32,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: t.line,
        backgroundColor: t.bg,
        paddingHorizontal: 10,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Text style={{ color: t.text, fontSize: 12, fontWeight: '700' }}>{title}</Text>
    </Pressable>
  );
}

export function IconBtn({ name, color, onPress }: { name: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={name} color={color} size={14} />
    </Pressable>
  );
}

export function MenuRow({
  title,
  onPress,
}: {
  title: string;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: t.line,
        backgroundColor: t.card,
      }}
    >
      <Text style={{ color: t.text, fontSize: 14 }}>{title}</Text>
      <Icon name="chevronRight" color={t.muted} size={16} />
    </Pressable>
  );
}

export function FormFooter({
  cancel,
  save,
  busy,
  saveTitle,
}: {
  cancel: () => void;
  save: () => void;
  busy?: boolean;
  saveTitle: string;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
      <ActionBtn title="Cancel" onPress={cancel} />
      <ActionBtn title={saveTitle} primary busy={busy} onPress={save} />
    </View>
  );
}

export function ChipText({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ borderRadius: 999, borderWidth: 1, borderColor: t.line, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ color: t.text, fontSize: 11, fontWeight: '700' }}>{children}</Text>
    </View>
  );
}

export function BadgeRow({ values }: { values: Array<string | undefined | false> }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
      {values.filter(Boolean).map((value) => (
        <StatusBadge key={String(value)} compact value={String(value)} />
      ))}
    </View>
  );
}

export function ScreenPad({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ paddingHorizontal: 16, paddingTop: 8 }, style]}>{children}</View>;
}
