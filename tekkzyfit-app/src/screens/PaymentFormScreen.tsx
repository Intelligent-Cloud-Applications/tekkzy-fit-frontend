import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { recordPayment } from '../api';
import { errorMessage } from '../errors';
import { addDays, formatDate, formatINR, todayISO } from '../format';
import { useGym } from '../GymContext';
import type { RootStackParamList } from '../nav';
import { AppSheet, FormHint } from '../sheet';
import { pushToast } from '../toast';
import { useTheme } from '../theme';
import { DateField, ErrorText, Field, FormField, Select } from '../ui';

export function PaymentFormScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'PaymentForm'>) {
  const t = useTheme();
  const { members, plans, refreshMember } = useGym();
  const [q, setQ] = useState('');
  const [memberId, setMemberId] = useState(route.params.memberId || '');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [planId, setPlanId] = useState(plans[0]?.id || '');
  const [amount, setAmount] = useState(String(plans[0]?.price || ''));
  const [endDate, setEndDate] = useState('');
  const [method, setMethod] = useState<'CASH' | 'UPI' | 'ONLINE'>('CASH');
  const [renew, setRenew] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const member = members.find((m) => m.id === memberId || m.cognitoId === memberId);
  const plan = plans.find((p) => p.id === planId);
  const desk = method === 'CASH' || method === 'UPI';
  const current = String(member?.renewDate || member?.membership?.expiryDate || '').slice(0, 10);
  const start = current && current >= todayISO() ? current : todayISO();
  const shownEnd = endDate || addDays(start, Number(plan?.durationDays || 30));
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return members
      .filter((m) => `${m.name} ${m.phone || ''} ${m.deviceEnrollId || ''} ${m.memberCode || ''}`.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [members, q]);

  function pickMember(nextId: string) {
    const next = members.find((m) => m.id === nextId);
    if (!next) return;
    const nextPlanId = next.planId || next.membership?.planId || plans[0]?.id || '';
    const nextPlan = plans.find((p) => p.id === nextPlanId);
    setMemberId(next.id);
    setQ(next.name);
    setPhone(next.phone || '');
    setEmail(next.email || '');
    setPlanId(nextPlanId);
    setAmount(String(nextPlan?.price ?? ''));
    setEndDate(addDays(String(next.renewDate || next.membership?.expiryDate || todayISO()).slice(0, 10) >= todayISO()
      ? String(next.renewDate || next.membership?.expiryDate || todayISO()).slice(0, 10)
      : todayISO(), Number(nextPlan?.durationDays || 30)));
  }

  useEffect(() => {
    if (route.params.memberId && member && !phone) pickMember(member.id);
  }, []);

  async function onSave() {
    if (!member) {
      setError('Search and pick a member');
      return;
    }
    if (!phone.trim()) {
      setError('Enter a phone number');
      return;
    }
    if (method === 'ONLINE' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email so the subscription link can be sent');
      return;
    }
    const rupees = Number(amount);
    if (!Number.isFinite(rupees) || rupees <= 0) {
      setError('Enter a valid amount');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const row = await recordPayment({
        memberId: member.cognitoId || member.id,
        planId,
        planName: plan?.name,
        amount: rupees,
        method,
        durationDays: plan?.durationDays,
        renewDate: shownEnd,
        phone: phone.trim(),
        email: email.trim(),
      });
      await refreshMember(member.cognitoId || member.id, member);
      pushToast({
        kind: 'success',
        title: method === 'ONLINE'
          ? 'Subscription link sent to phone and email'
          : method === 'UPI'
            ? 'UPI collection recorded'
            : 'Payment recorded',
        message: row.paymentLinkUrl || 'Membership dates update after payment.',
      });
      navigation.goBack();
    } catch (err) {
      setError(errorMessage(err, 'Could not record payment'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppSheet
      title="Record payment"
      onClose={() => navigation.goBack()}
      onSave={() => void onSave()}
      busy={busy}
      saveTitle={method === 'ONLINE' ? 'Send subscription link' : 'Save'}
    >
      <View style={{ gap: 12 }}>
        <FormField wide label="Member">
          <Field
            value={q || member?.name || ''}
            onChangeText={(value) => { setQ(value); setMemberId(''); }}
            placeholder="Type name, phone or member ID"
          />
          {!memberId && q.trim() ? (
            <View style={{ marginTop: 6, borderRadius: 12, borderWidth: 1, borderColor: t.line, backgroundColor: t.card, overflow: 'hidden' }}>
              {matches.length ? matches.map((m, index) => (
                <Pressable
                  key={m.id}
                  onPress={() => pickMember(m.id)}
                  style={{ paddingHorizontal: 12, paddingVertical: 9, borderTopWidth: index ? 1 : 0, borderTopColor: t.line }}
                >
                  <Text numberOfLines={1} style={{ color: t.text, fontWeight: '700', fontSize: 13 }}>{m.name}</Text>
                  <Text numberOfLines={1} style={{ color: t.muted, fontSize: 12 }}>
                    {[m.phone, m.deviceEnrollId ? `ID ${m.deviceEnrollId}` : ''].filter(Boolean).join(' · ')}
                  </Text>
                </Pressable>
              )) : (
                <Text style={{ paddingHorizontal: 12, paddingVertical: 10, color: t.muted, fontSize: 12 }}>No member matches “{q.trim()}”</Text>
              )}
            </View>
          ) : null}
        </FormField>
        <FormField wide label="Phone">
          <Field value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Phone number" />
        </FormField>
        <FormField wide label={method === 'ONLINE' ? 'Email' : 'Email (optional)'}>
          <Field value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Email" />
        </FormField>
        <FormField wide label="Plan">
          <Select
            title="Plan"
            value={planId}
            onChange={(next) => {
              const found = plans.find((p) => p.id === next);
              setPlanId(next);
              setAmount(String(found?.price ?? ''));
              setEndDate(addDays(start, Number(found?.durationDays || 30)));
            }}
            options={plans.map((p) => ({
              value: p.id,
              label: `${p.name}${p.price != null ? ` · ${formatINR(p.price)}` : ''}${p.durationDays ? ` · ${p.durationDays} days` : ''}`,
            }))}
          />
        </FormField>
        <FormField wide label="Amount (₹)">
          <Field value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        </FormField>
        <FormField wide label="End date">
          <DateField value={shownEnd} onChange={setEndDate} editable={desk} />
        </FormField>
        <FormHint>
          {method === 'ONLINE'
            ? `Online subscriptions follow the plan. Shown end date is ${formatDate(shownEnd)}. Razorpay sets the real date after the first payment.`
            : `Membership ends ${formatDate(shownEnd)}. You can change this for ${method === 'UPI' ? 'UPI' : 'cash'}.`}
        </FormHint>
        <FormField wide label="Method">
          <Select
            title="Payment method"
            value={method}
            onChange={(next) => setMethod(next as 'CASH' | 'UPI' | 'ONLINE')}
            options={[
              { value: 'CASH', label: 'Cash' },
              { value: 'UPI', label: 'UPI' },
              { value: 'ONLINE', label: 'Online' },
            ]}
          />
        </FormField>
        {desk ? (
          <Pressable onPress={() => setRenew((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                borderWidth: 1,
                borderColor: t.line,
                backgroundColor: renew ? t.accent : t.input,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {renew ? <Text style={{ color: t.accentInk, fontSize: 11, fontWeight: '700' }}>✓</Text> : null}
            </View>
            <Text style={{ color: t.text, fontSize: 13 }}>Renew / extend membership after payment</Text>
          </Pressable>
        ) : null}
      </View>
      <ErrorText text={error} />
    </AppSheet>
  );
}
