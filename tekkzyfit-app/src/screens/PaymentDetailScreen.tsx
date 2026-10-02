import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchPaymentById } from '../api';
import type { Payment } from '../types';
import { openExternal } from '../errors';
import { displayPaymentId, formatDate, formatINR, methodLabel, paymentAmount, paymentBelongsToMember } from '../format';
import { useGym } from '../GymContext';
import { InvoiceShareIcons } from '../InvoiceShareIcons';
import type { RootStackParamList } from '../nav';
import { ActionBtn, MetaRow, PageTitle } from '../page';
import { useTheme } from '../theme';
import { StatusBadge } from '../ui';

export function PaymentDetailScreen({ route }: NativeStackScreenProps<RootStackParamList, 'PaymentDetail'>) {
  const t = useTheme();
  const { payments, members } = useGym();
  const cached = payments.find((p) => p.id === route.params.paymentId);
  const [fetched, setFetched] = useState<Payment | null>(null);
  const [looking, setLooking] = useState(!cached);
  useEffect(() => {
    if (cached) return;
    let live = true;
    void fetchPaymentById(route.params.paymentId).then((row) => {
      if (!live) return;
      setFetched(row);
      setLooking(false);
    });
    return () => { live = false; };
  }, [cached, route.params.paymentId]);
  const payment = cached || fetched;
  if (!payment) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, padding: 16 }}>
        {looking ? <ActivityIndicator color={t.accent} style={{ marginTop: 32 }} /> : <PageTitle>Payment not found</PageTitle>}
      </View>
    );
  }
  const member = members.find((m) => paymentBelongsToMember(payment, m) || m.id === payment.memberId || m.cognitoId === payment.memberId);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, padding: 16 }}>
        <Text style={{ color: t.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.8 }}>AMOUNT</Text>
        <Text style={{ marginTop: 6, color: t.text, fontSize: 32, fontWeight: '800' }}>{formatINR(payment.netAmount ?? paymentAmount(payment))}</Text>
        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <StatusBadge value={payment.status} />
          {payment.status === 'PAID' ? <InvoiceShareIcons member={member} payment={payment} size={40} /> : null}
        </View>
      </View>

      <View style={{ marginTop: 10, borderRadius: 16, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, paddingHorizontal: 12, paddingVertical: 8 }}>
        <Text style={{ color: t.text, fontSize: 14, fontWeight: '800', marginBottom: 4 }}>Receipt</Text>
        <MetaRow label="Payment ID" value={displayPaymentId(payment)} />
        <MetaRow label="Invoice" value={payment.invoiceNumber || '—'} />
        <MetaRow label="Amount received" value={formatINR(payment.netAmount ?? paymentAmount(payment))} />
        <MetaRow label="Date" value={formatDate(payment.date)} />
        <MetaRow label="Renew date" value={formatDate(payment.renewDate || member?.renewDate)} />
        <MetaRow label="Method" value={methodLabel(payment.method)} />
        <MetaRow label="Status" value={<StatusBadge compact value={payment.status} />} />
      </View>

      <View style={{ marginTop: 10, borderRadius: 16, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, paddingHorizontal: 12, paddingVertical: 8 }}>
        <Text style={{ color: t.text, fontSize: 14, fontWeight: '800', marginBottom: 4 }}>Member</Text>
        <MetaRow label="Name" value={member?.name || payment.memberName || '—'} />
        <MetaRow label="Member ID" value={member?.memberCode || '—'} />
        <MetaRow label="Phone" value={member?.phone || '—'} />
        <MetaRow label="Plan" value={member?.planName || '—'} />
        <MetaRow label="Renew date" value={formatDate(payment.renewDate || member?.renewDate)} />
        <MetaRow label="Membership" value={member?.membership?.status || member?.subscriptionStatus || '—'} />
      </View>

      {payment.paymentLinkUrl ? (
        <View style={{ marginTop: 14 }}>
          <ActionBtn title="Open pay link" primary onPress={() => void openExternal(payment.paymentLinkUrl!)} />
        </View>
      ) : null}
    </ScrollView>
  );
}
