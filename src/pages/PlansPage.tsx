import { useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/Button';
import { IconAction, RowActions } from '@/components/RowActions';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable } from '@/components/DataTable';
import { Field, NativeSelect, TextArea, TextInput } from '@/components/Field';
import { LoadingState } from '@/components/LoadingState';
import { Modal } from '@/components/Modal';
import { PageHeader } from '@/components/PageHeader';
import { StatusBadge } from '@/components/StatusBadge';
import { Link } from 'react-router-dom';
import { useGymMutation, useMembers, usePlans } from '@/hooks/useGymQueries';
import { formatINR, newId } from '@/lib/format';
import { BILLING_PERIODS, billingFromPlan, billingLabel, durationDaysFromBilling, minBillingInterval } from '@/lib/planBilling';
import { removePlan, savePlan } from '@/services/memberships';
import { useUiStore } from '@/store/uiStore';
import type { BillingPeriod, MembershipPlan } from '@shared/types';

export function PlansPage() {
  const plans = usePlans();
  const members = useMembers({ full: true });
  const toast = useUiStore((s) => s.pushToast);
  const [editing, setEditing] = useState<MembershipPlan | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const save = useGymMutation(savePlan);
  const del = useGymMutation(removePlan);

  if (!plans.data || !members.data) return <LoadingState />;
  const onPlan = (planId: string) => members.data!.filter((m) => m.plan?.id === planId).length;

  return (
    <div className="flex flex-col lg:min-h-full lg:flex-1">
      <PageHeader
        title="Plans"
        description="Saved in Tekkzy Fit and created in Razorpay for subscription links."
        actions={
          <Button
            onClick={() =>
              setEditing({
                id: newId('plan'),
                name: '',
                durationDays: 30,
                durationLabel: billingLabel(1, 'monthly'),
                price: 1700,
                addonAmount: 0,
                description: '',
                accessType: 'ALL_HOURS',
                billingPeriod: 'monthly',
                billingInterval: 1,
                status: 'ACTIVE',
                createdAt: new Date().toISOString(),
              })
            }
          >
            Create plan
          </Button>
        }
      />
      <DataTable
        columns={[
          { key: 'n', header: 'Name', render: (p) => p.name },
          {
            key: 'people',
            header: 'Members',
            render: (p) => (
              <Link className="text-accent hover:underline" to={`/members?plan=${encodeURIComponent(p.id)}`}>
                {onPlan(p.id)}
              </Link>
            ),
          },
          {
            key: 'd',
            header: 'Billing frequency',
            render: (p) => {
              const billing = billingFromPlan(p);
              return billingLabel(billing.interval, billing.period);
            },
          },
          {
            key: 'pr',
            header: 'Billing amount',
            render: (p) => Number(p.addonAmount || 0) > 0
              ? `${formatINR(p.price)} + ${formatINR(Number(p.addonAmount))} admission`
              : formatINR(p.price),
          },
          { key: 'rzp', header: 'Razorpay', render: (p) => p.razorpayPlanId || '—' },
          { key: 'desc', header: 'Description', render: (p) => p.description },
          { key: 's', header: 'Status', render: (p) => <StatusBadge value={p.status} /> },
          {
            key: 'act',
            header: 'Actions',
            render: (p) => (
              <RowActions>
                <IconAction label="Edit" icon={Pencil} onClick={() => setEditing(p)} />
                <IconAction label="Delete" icon={Trash2} variant="danger" onClick={() => setConfirm(p.id)} />
              </RowActions>
            ),
          },
        ]}
        rows={plans.data}
        rowKey={(p) => p.id}
      />
      <PlanModal
        plan={editing}
        onClose={() => setEditing(null)}
        onSave={async (plan) => {
          try {
            const saved = await save.mutateAsync(plan);
            toast({
              kind: 'success',
              title: saved.razorpayPlanId ? 'Plan saved in Razorpay' : 'Plan saved',
              message: saved.razorpayPlanId || undefined,
            });
            setEditing(null);
          } catch (err) {
            toast({
              kind: 'error',
              title: err instanceof Error ? err.message : 'Could not save the plan in Razorpay',
            });
          }
        }}
      />
      <ConfirmDialog
        open={Boolean(confirm)}
        title="Delete plan"
        message="Existing memberships keep their current price. This plan will no longer be offered."
        danger
        confirmLabel="Delete"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) del.mutate(confirm, { onSuccess: () => toast({ kind: 'success', title: 'Plan deleted' }) });
        }}
      />
    </div>
  );
}

function PlanModal({
  plan,
  onClose,
  onSave,
}: {
  plan: MembershipPlan | null;
  onClose: () => void;
  onSave: (plan: MembershipPlan) => Promise<void>;
}) {
  const [draft, setDraft] = useState<MembershipPlan | null>(plan);
  const [intervalText, setIntervalText] = useState('');
  const [priceText, setPriceText] = useState('');
  const [addonText, setAddonText] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setDraft(plan);
    setSaving(false);
    const billing = plan ? billingFromPlan(plan) : null;
    const interval = billing ? Math.max(minBillingInterval(billing.period), billing.interval) : '';
    setIntervalText(interval === '' ? '' : String(interval));
    setPriceText(plan && Number(plan.price) > 0 ? String(plan.price) : '');
    setAddonText(plan && Number(plan.addonAmount) > 0 ? String(plan.addonAmount) : '');
  }, [plan]);
  if (!plan || !draft) {
    return null;
  }
  const billing = billingFromPlan(draft);
  const minInterval = minBillingInterval(billing.period);

  function applyBilling(interval: number, period: BillingPeriod) {
    if (!draft) return;
    const next = Math.max(minBillingInterval(period), interval);
    const days = durationDaysFromBilling(next, period);
    setDraft({
      ...draft,
      billingInterval: next,
      billingPeriod: period,
      durationDays: days,
      durationLabel: billingLabel(next, period),
    });
  }

  return (
    <Modal
      open={Boolean(plan)}
      title="Plan"
      onClose={onClose}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" className="w-full" disabled={saving} onClick={onClose}>Cancel</Button>
          <Button type="submit" form="plan-form" className="w-full" loading={saving} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      }
    >
      <form
        id="plan-form"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (saving) return;
          const interval = Math.max(minInterval, Number(intervalText) || minInterval);
          setSaving(true);
          void onSave({
            ...draft,
            accessType: 'ALL_HOURS',
            billingInterval: interval,
            billingPeriod: billing.period,
            durationDays: durationDaysFromBilling(interval, billing.period),
            durationLabel: billingLabel(interval, billing.period),
            price: Number(priceText) || 0,
            addonAmount: Number(addonText) || 0,
          }).finally(() => setSaving(false));
        }}
      >
        <Field label="Name">
          <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
        </Field>
        <Field label="Billing frequency">
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-ink-soft">Every</span>
            <input
              type="text"
              inputMode="numeric"
              value={intervalText}
              onChange={(e) => {
                const next = e.target.value.replace(/\D/g, '');
                setIntervalText(next);
                if (next) applyBilling(Number(next), billing.period);
              }}
              onBlur={() => {
                const interval = Math.max(minInterval, Number(intervalText) || minInterval);
                setIntervalText(String(interval));
                applyBilling(interval, billing.period);
              }}
              className="h-10 w-20 rounded-[12px] border border-line bg-[var(--input-bg)] px-3 text-[13px] text-ink outline-none focus:border-accent/70 focus:ring-2 focus:ring-accent/15"
            />
            <NativeSelect
              className="min-w-0 flex-1"
              value={billing.period}
              onChange={(e) => {
                const period = e.target.value as BillingPeriod;
                const min = minBillingInterval(period);
                const interval = Math.max(min, Number(intervalText) || min);
                setIntervalText(String(interval));
                applyBilling(interval, period);
              }}
            >
              {BILLING_PERIODS.map((row) => (
                <option key={row.value} value={row.value}>{row.label}</option>
              ))}
            </NativeSelect>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">
            {billing.period === 'daily'
              ? 'Day billing starts at every 7 days.'
              : 'You can set the billing cycle and trial period later while creating a subscription.'}
          </p>
        </Field>
        <Field label="Billing amount">
          <div className="flex h-10 overflow-hidden rounded-[12px] border border-line bg-[var(--input-bg)] focus-within:border-accent/70 focus-within:ring-2 focus-within:ring-accent/15">
            <span className="grid place-items-center px-3 text-[13px] font-semibold text-ink-soft">₹</span>
            <input
              type="text"
              inputMode="decimal"
              required
              value={priceText}
              onChange={(e) => {
                const next = e.target.value.replace(/[^\d.]/g, '');
                setPriceText(next);
                if (next !== '') setDraft({ ...draft, price: Number(next) || 0 });
              }}
              onBlur={() => {
                const amount = Number(priceText);
                if (!priceText || !Number.isFinite(amount) || amount <= 0) {
                  setPriceText('');
                  setDraft({ ...draft, price: 0 });
                  return;
                }
                setPriceText(String(amount));
                setDraft({ ...draft, price: amount });
              }}
              className="min-w-0 flex-1 bg-transparent px-1 text-[13px] text-ink outline-none"
            />
            <span className="grid place-items-center px-3 text-[12px] font-semibold text-ink-soft">per unit</span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">
            Recurring fee, for example ₹1,700 every month. This cannot be changed later in Razorpay.
          </p>
        </Field>
        <Field label="Admission / addon amount">
          <div className="flex h-10 overflow-hidden rounded-[12px] border border-line bg-[var(--input-bg)] focus-within:border-accent/70 focus-within:ring-2 focus-within:ring-accent/15">
            <span className="grid place-items-center px-3 text-[13px] font-semibold text-ink-soft">₹</span>
            <input
              type="text"
              inputMode="decimal"
              value={addonText}
              placeholder="0"
              onChange={(e) => {
                const next = e.target.value.replace(/[^\d.]/g, '');
                setAddonText(next);
                setDraft({ ...draft, addonAmount: next === '' ? 0 : Number(next) || 0 });
              }}
              onBlur={() => {
                if (addonText === '') {
                  setDraft({ ...draft, addonAmount: 0 });
                  return;
                }
                const amount = Number(addonText) || 0;
                setAddonText(amount > 0 ? String(amount) : '');
                setDraft({ ...draft, addonAmount: amount });
              }}
              className="min-w-0 flex-1 bg-transparent px-1 text-[13px] text-ink outline-none"
            />
            <span className="grid place-items-center px-3 text-[12px] font-semibold text-ink-soft">one time</span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">
            One-time joining fee, for example ₹2,700. First payment is billing + admission
            {Number(draft.price || 0) + Number(draft.addonAmount || 0) > 0
              ? ` (${formatINR(Number(draft.price || 0) + Number(draft.addonAmount || 0))})`
              : ''}
            . Later bills are the billing amount only.
          </p>
        </Field>
        <Field label="Description">
          <TextArea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </Field>
      </form>
    </Modal>
  );
}
