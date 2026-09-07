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
import { removePlan, savePlan } from '@/services/memberships';
import { useUiStore } from '@/store/uiStore';
import type { MembershipPlan } from '@shared/types';

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
        description="Prices used when you add a member or record a payment."
        actions={
          <Button
            onClick={() =>
              setEditing({
                id: newId('plan'),
                name: '',
                durationDays: 30,
                durationLabel: '30 days',
                price: 2499,
                description: '',
                accessType: 'ALL_HOURS',
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
          { key: 'd', header: 'Duration', render: (p) => p.durationLabel },
          { key: 'pr', header: 'Price', render: (p) => formatINR(p.price) },
          { key: 'desc', header: 'Description', render: (p) => p.description },
          { key: 'a', header: 'Access type', render: (p) => p.accessType.replaceAll('_', ' ') },
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
          await save.mutateAsync({ ...plan, durationLabel: `${plan.durationDays} days` });
          toast({ kind: 'success', title: 'Plan saved' });
          setEditing(null);
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
  useEffect(() => {
    setDraft(plan);
  }, [plan]);
  if (!plan || !draft) {
    return null;
  }
  return (
    <Modal
      open={Boolean(plan)}
      title="Plan"
      onClose={onClose}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" className="w-full" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="plan-form" className="w-full">Save</Button>
        </div>
      }
    >
      <form
        id="plan-form"
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(draft);
        }}
      >
        <Field label="Name"><TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required /></Field>
        <Field label="Duration (days)">
          <TextInput type="number" value={draft.durationDays} onChange={(e) => setDraft({ ...draft, durationDays: Number(e.target.value) })} />
        </Field>
        <Field label="Price (₹)">
          <TextInput type="number" value={draft.price} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} />
        </Field>
        <Field label="Access type">
          <NativeSelect value={draft.accessType} onChange={(e) => setDraft({ ...draft, accessType: e.target.value as MembershipPlan['accessType'] })}>
            <option value="ALL_HOURS">All hours</option>
            <option value="PEAK">Peak</option>
            <option value="OFF_PEAK">Off peak</option>
          </NativeSelect>
        </Field>
        <Field label="Description">
          <TextArea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </Field>
      </form>
    </Modal>
  );
}
