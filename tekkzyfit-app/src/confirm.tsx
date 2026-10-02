import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { font } from './fonts';
import { useTheme } from './theme';

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTheme();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={busy ? undefined : onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.58)', justifyContent: 'center', paddingHorizontal: 22 }}>
        <Pressable style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} onPress={busy ? undefined : onClose} />
        <View
          style={{
            borderRadius: 22,
            borderWidth: 1,
            borderColor: t.line,
            backgroundColor: t.card,
            padding: 18,
          }}
        >
          <Text style={{ color: t.text, fontFamily: font.display, fontSize: 20, letterSpacing: -0.4 }}>{title}</Text>
          <Text style={{ marginTop: 10, color: t.muted, fontFamily: font.sans, fontSize: 13, lineHeight: 20 }}>{message}</Text>
          <View style={{ marginTop: 18, flexDirection: 'row', gap: 8 }}>
            <Pressable
              disabled={busy}
              onPress={onClose}
              style={{
                flex: 1,
                height: 44,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: t.line,
                backgroundColor: t.input,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: t.text, fontFamily: font.sansSemi, fontSize: 13 }}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={onConfirm}
              style={{
                flex: 1,
                height: 44,
                borderRadius: 999,
                backgroundColor: danger ? t.accent : t.text,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {busy ? (
                <ActivityIndicator color={danger ? t.accentInk : t.card} />
              ) : (
                <Text style={{ color: danger ? t.accentInk : t.card, fontFamily: font.sansSemi, fontSize: 13 }}>{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
