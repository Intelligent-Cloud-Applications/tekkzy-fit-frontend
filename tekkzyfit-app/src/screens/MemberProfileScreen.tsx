import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { attendanceBelongsToMember, countMemberVisits } from '../api';
import { openExternal } from '../errors';
import { displayPaymentId, formatDate, formatDateTime, formatINR, initials, memberDue, methodLabel, paymentBelongsToMember } from '../format';
import { useGym } from '../GymContext';
import { InvoiceShareIcons } from '../InvoiceShareIcons';
import type { RootStackParamList } from '../nav';
import { ActionBar, ActionBtn, ListCard, MetaRow, PageTitle, SectionTitle } from '../page';
import { useTheme } from '../theme';
import { Empty, StatusBadge } from '../ui';

const AVATAR = ['#3a0d0d', '#2a1214', '#1a0a0a', '#4a1010', '#2a0808', '#161012'];

export function MemberProfileScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'MemberProfile'>) {
  const t = useTheme();
  const { members, payments, attendance, plans, refreshMember, loadMemberPayments } = useGym();
  const [reloading, setReloading] = useState(false);
  const member = members.find((m) => m.id === route.params.memberId || m.cognitoId === route.params.memberId);
  const memberKey = member?.cognitoId || member?.id || route.params.memberId;
  useEffect(() => {
    void loadMemberPayments(memberKey).catch(() => undefined);
  }, [memberKey, loadMemberPayments]);
  async function reload() {
    setReloading(true);
    try {
      await refreshMember(memberKey, member);
    } finally {
      setReloading(false);
    }
  }
  if (!member) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, padding: 16 }}>
        <PageTitle>Member not found</PageTitle>
      </View>
    );
  }
  const plan = plans.find((p) => p.id === member.planId || p.id === member.membership?.planId);
  const payRows = payments.filter((p) => paymentBelongsToMember(p, member));
  const visits = attendance.filter((row) => attendanceBelongsToMember(row, member));
  const seed = member.name.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const unpaid = Boolean(member.paymentLinkUrl) && String(member.paymentStatus || '').toUpperCase() !== 'PAID';
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <View style={{ borderRadius: 16, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, padding: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: AVATAR[seed % AVATAR.length], alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: t.accent, fontSize: 14, fontWeight: '800' }}>{initials(member.name)}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: t.text, fontSize: 20, fontWeight: '800' }}>{member.name}</Text>
            <View style={{ marginTop: 6, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              {member.subscriptionStatus
                ? <StatusBadge compact value={String(member.subscriptionStatus).toUpperCase()} />
                : <Text style={{ color: t.muted, fontSize: 10, fontWeight: '800' }}>NO SUB</Text>}
              <StatusBadge compact value={member.paymentStatus || 'PENDING'} />
              <StatusBadge compact value={`${countMemberVisits(member, attendance)} THIS MO`} />
            </View>
            <Text style={{ marginTop: 4, color: t.muted, fontSize: 12 }}>
              {member.memberCode || '—'} · {member.phone || 'No phone'}
            </Text>
          </View>
        </View>
        <ActionBar>
          <ActionBtn title="Refresh" icon="refresh" busy={reloading} onPress={() => void reload()} />
          <ActionBtn title="Edit member" primary onPress={() => navigation.navigate('MemberForm', { memberId: member.id })} />
        </ActionBar>
      </View>

      <View style={{ marginTop: 10, borderRadius: 16, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, paddingHorizontal: 12, paddingVertical: 8 }}>
        <Text style={{ color: t.text, fontSize: 14, fontWeight: '800', marginBottom: 4 }}>Subscription</Text>
        <MetaRow label="Plan" value={plan?.name || member.planName || '—'} />
        <MetaRow label="Status" value={member.subscriptionStatus ? String(member.subscriptionStatus).toUpperCase() : '—'} />
        <MetaRow label="Due date" value={formatDate(memberDue(member))} />
        <MetaRow label="Payment" value={member.paymentStatus || 'PENDING'} />
        {unpaid ? (
          <Text style={{ color: t.accent, fontSize: 12, fontWeight: '800', paddingVertical: 8 }} onPress={() => void openExternal(member.paymentLinkUrl!)}>
            Open pay link
          </Text>
        ) : null}
      </View>

      <View style={{ marginTop: 10, borderRadius: 16, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, paddingHorizontal: 12, paddingVertical: 8 }}>
        <Text style={{ color: t.text, fontSize: 14, fontWeight: '800', marginBottom: 4 }}>Personal</Text>
        <MetaRow label="Gender" value={member.gender || '—'} />
        <MetaRow label="Date of birth" value={formatDate(member.dateOfBirth)} />
        <MetaRow label="Join date" value={formatDate(member.joinDate)} />
      </View>

      <View style={{ marginTop: 10, borderRadius: 16, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, paddingHorizontal: 12, paddingVertical: 8 }}>
        <Text style={{ color: t.text, fontSize: 14, fontWeight: '800', marginBottom: 4 }}>Contact</Text>
        <MetaRow label="Email" value={member.email || '—'} />
        <MetaRow label="Phone" value={member.phone || '—'} />
        {member.addedByName ? <MetaRow label="Added by" value={member.addedByName} /> : null}
      </View>

      <View style={{ marginTop: 10, borderRadius: 16, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, paddingHorizontal: 12, paddingVertical: 8 }}>
        <Text style={{ color: t.text, fontSize: 14, fontWeight: '800', marginBottom: 4 }}>Face</Text>
        <MetaRow label="Face" value={member.faceRegistered ? 'REGISTERED' : 'NOT REGISTERED'} />
        <MetaRow label="Device ID" value={member.deviceEnrollId || '—'} />
        <MetaRow label="Shift" value={member.deviceShift || '—'} />
      </View>

      <SectionTitle>Payments</SectionTitle>
      {payRows.length ? payRows.map((p) => (
        <ListCard key={p.id} onPress={() => navigation.navigate('PaymentDetail', { paymentId: p.id })}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: t.text, fontWeight: '800' }}>{formatINR(p.amount)}</Text>
            <StatusBadge compact value={p.status} />
          </View>
          <View style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, color: t.muted, fontSize: 12 }}>
              {formatDate(p.date)} · {methodLabel(p.method)} · {p.invoiceNumber || displayPaymentId(p)}
            </Text>
            {p.status === 'PAID' ? <InvoiceShareIcons member={member} payment={p} size={32} /> : null}
          </View>
        </ListCard>
      )) : <Empty text="No payments yet." />}

      <SectionTitle>Access history</SectionTitle>
      {visits.length ? visits.slice(0, 20).map((row) => (
        <ListCard key={row.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: t.text, fontWeight: '700' }}>{formatDateTime(row.timestamp)}</Text>
            <StatusBadge compact value={row.status} />
          </View>
          <Text style={{ marginTop: 4, color: t.muted, fontSize: 12 }}>{row.type}</Text>
        </ListCard>
      )) : <Empty text="No visits stored yet." />}
    </ScrollView>
  );
}
