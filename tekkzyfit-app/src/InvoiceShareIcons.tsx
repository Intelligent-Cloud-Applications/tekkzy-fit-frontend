import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { errorMessage } from './errors';
import { useGym } from './GymContext';
import { Icon } from './icons';
import { buildPaymentInvoiceData, emailInvoice, shareInvoiceFile, shareInvoiceWhatsApp } from './invoice';
import { useTheme } from './theme';
import { pushToast } from './toast';
import type { Member, Payment } from './types';

type Kind = 'wa' | 'mail' | 'share';

const BUTTONS: Array<{ kind: Kind; icon: string; label: string }> = [
  { kind: 'wa', icon: 'whatsapp', label: 'Send invoice on WhatsApp' },
  { kind: 'mail', icon: 'mail', label: 'Email invoice' },
  { kind: 'share', icon: 'share', label: 'Share invoice PDF' },
];

export function InvoiceShareIcons({ member, payment, size = 34 }: { member?: Member; payment: Payment; size?: number }) {
  const t = useTheme();
  const { plans, settings } = useGym();
  const [sending, setSending] = useState<Kind | ''>('');

  async function send(kind: Kind) {
    if (sending) return;
    if (!member) {
      pushToast({ kind: 'error', title: 'Member not found', message: 'Open this payment from the member profile to send the invoice.' });
      return;
    }
    if (kind === 'wa' && !member.phone) pushToast({ kind: 'info', title: 'No phone saved', message: 'Pick the chat in WhatsApp.' });
    if (kind === 'mail' && !member.email) pushToast({ kind: 'info', title: 'No email saved', message: 'Enter the address in your mail app.' });
    setSending(kind);
    try {
      const data = buildPaymentInvoiceData(member, payment, plans, settings);
      if (kind === 'wa') await shareInvoiceWhatsApp(data, settings);
      else if (kind === 'mail') await emailInvoice(data, settings);
      else await shareInvoiceFile(data, settings);
    } catch (err) {
      pushToast({ kind: 'error', title: 'Could not share invoice', message: errorMessage(err) });
    } finally {
      setSending('');
    }
  }

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {BUTTONS.map((b) => (
        <Pressable
          key={b.kind}
          accessibilityLabel={b.label}
          hitSlop={4}
          onPress={() => void send(b.kind)}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 1,
            borderColor: b.kind === 'wa' ? t.accent : t.line,
            backgroundColor: b.kind === 'wa' ? t.accentSoft : t.card,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {sending === b.kind
            ? <ActivityIndicator size="small" color={t.accent} />
            : <Icon name={b.icon} size={Math.round(size * 0.47)} color={b.kind === 'wa' ? t.accent : t.text} />}
        </Pressable>
      ))}
    </View>
  );
}
