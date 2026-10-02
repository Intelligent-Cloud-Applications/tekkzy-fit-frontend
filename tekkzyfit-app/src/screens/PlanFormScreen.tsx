import { useState } from 'react';
import { Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { savePlan } from '../api';
import { errorMessage } from '../errors';
import { billingLabel, durationFromBilling, formatINR, newId } from '../format';
import { useGym } from '../GymContext';
import type { RootStackParamList } from '../nav';
import { feedbackAdded } from '../feedback';
import { pushToast } from '../toast';
import { AppSheet, FormHint } from '../sheet';
import { useTheme } from '../theme';
import type { Plan } from '../types';
import { ErrorText, Field, FormField, Select } from '../ui';

// Razorpay rejects daily plans shorter than 7 days.
const MIN_DAILY_INTERVAL = 7;

export function PlanFormScreen({ navigation, route }: NativeStackScreenProps<RootStackParamList, 'PlanForm'>) {
  const t = useTheme();
  const { plans, setPlans } = useGym();
  const existing = plans.find((p) => p.id === route.params.planId);
  const [name, setName] = useState(existing?.name || '');
  const [price, setPrice] = useState(existing && Number(existing.price) > 0 ? String(existing.price) : '');
  const [addon, setAddon] = useState(existing && Number(existing.addonAmount) > 0 ? String(existing.addonAmount) : '');
  const [period, setPeriod] = useState<NonNullable<Plan['billingPeriod']>>(existing?.billingPeriod || 'monthly');
  const [interval, setInterval] = useState(String(existing?.billingInterval || 1));
  const [description, setDescription] = useState(existing?.description || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const first = Number(price || 0) + Number(addon || 0);

  async function onSave() {
    if (!name.trim()) {
      setError('Enter a plan name.');
      return;
    }
    const rupees = Number(price);
    if (!rupees) {
      setError('Enter a price.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const every = Math.max(period === 'daily' ? MIN_DAILY_INTERVAL : 1, Number(interval) || 1);
      const days = durationFromBilling(every, period);
      const saved = await savePlan({
        id: existing?.id || newId('plan'),
        name: name.trim(),
        price: rupees,
        addonAmount: Number(addon) || 0,
        durationDays: days,
        durationLabel: billingLabel({ durationDays: days, billingPeriod: period, billingInterval: every }),
        description,
        accessType: existing?.accessType || 'ALL_HOURS',
        billingPeriod: period,
        billingInterval: every,
        status: existing?.status || 'ACTIVE',
        createdAt: existing?.createdAt || new Date().toISOString(),
      });
      setPlans(existing ? plans.map((p) => (p.id === existing.id ? saved : p)) : [saved, ...plans]);
      if (!existing) feedbackAdded();
      pushToast({
        kind: 'success',
        title: existing ? 'Plan saved' : 'Plan added',
      });
      navigation.goBack();
    } catch (err) {
      setError(errorMessage(err, 'Could not save the plan in Razorpay'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppSheet
      title="Plan"
      onClose={() => navigation.goBack()}
      onSave={() => void onSave()}
      busy={busy}
      saveTitle={busy ? 'Saving…' : 'Save'}
    >
      <View style={{ gap: 16 }}>
        <FormField wide label="Name">
          <Field value={name} onChangeText={setName} placeholder="Monthly" />
        </FormField>
        <FormField wide label="Billing frequency">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ color: t.muted, fontSize: 13 }}>Every</Text>
            <Field
              value={interval}
              onChangeText={(next) => setInterval(next.replace(/\D/g, ''))}
              onBlur={() => {
                if (period === 'daily' && (Number(interval) || 0) < MIN_DAILY_INTERVAL) setInterval(String(MIN_DAILY_INTERVAL));
              }}
              keyboardType="number-pad"
              style={{ width: 80 }}
            />
            <View style={{ flex: 1 }}>
              <Select
                title="Billing period"
                value={period}
                onChange={(next) => {
                  setPeriod(next as typeof period);
                  if (next === 'daily' && (Number(interval) || 0) < MIN_DAILY_INTERVAL) setInterval(String(MIN_DAILY_INTERVAL));
                }}
                options={[
                  { value: 'monthly', label: 'Month(s)' },
                  { value: 'yearly', label: 'Year(s)' },
                  { value: 'weekly', label: 'Week(s)' },
                  { value: 'daily', label: 'Day(s)' },
                ]}
              />
            </View>
          </View>
          <View style={{ marginTop: 6 }}>
            <FormHint>
              {period === 'daily'
                ? 'Day billing starts at every 7 days.'
                : 'You can set the billing cycle and trial period later while creating a subscription.'}
            </FormHint>
          </View>
        </FormField>
        <FormField wide label="Billing amount">
          <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: t.line, borderRadius: 12, backgroundColor: t.input, height: 40, overflow: 'hidden' }}>
            <Text style={{ paddingHorizontal: 12, color: t.muted, fontSize: 13, fontWeight: '600' }}>₹</Text>
            <Field value={price} onChangeText={(next) => setPrice(next.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="0" style={{ flex: 1, borderWidth: 0, height: 40, backgroundColor: 'transparent' }} />
            <Text style={{ paddingHorizontal: 12, color: t.muted, fontSize: 12, fontWeight: '600' }}>per unit</Text>
          </View>
          <View style={{ marginTop: 6 }}>
            <FormHint>Recurring fee, for example ₹1,700 every month. This cannot be changed later in Razorpay.</FormHint>
          </View>
        </FormField>
        <FormField wide label="Admission / addon amount">
          <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: t.line, borderRadius: 12, backgroundColor: t.input, height: 40, overflow: 'hidden' }}>
            <Text style={{ paddingHorizontal: 12, color: t.muted, fontSize: 13, fontWeight: '600' }}>₹</Text>
            <Field value={addon} onChangeText={(next) => setAddon(next.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" placeholder="0" style={{ flex: 1, borderWidth: 0, height: 40, backgroundColor: 'transparent' }} />
            <Text style={{ paddingHorizontal: 12, color: t.muted, fontSize: 12, fontWeight: '600' }}>one time</Text>
          </View>
          <View style={{ marginTop: 6 }}>
            <FormHint>
              One-time joining fee, for example ₹2,700. First payment is billing + admission{first > 0 ? ` (${formatINR(first)})` : ''}. Later bills are the billing amount only.
            </FormHint>
          </View>
        </FormField>
        <FormField wide label="Description">
          <Field value={description} onChangeText={setDescription} multiline placeholder="What this plan includes" />
        </FormField>
      </View>
      <ErrorText text={error} />
    </AppSheet>
  );
}
