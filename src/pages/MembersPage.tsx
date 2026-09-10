import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Pause, Pencil, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/Button';
import { IconAction, RowActions } from '@/components/RowActions';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DataTable } from '@/components/DataTable';
import { FilterBar, Select } from '@/components/FilterBar';
import { LoadingState } from '@/components/LoadingState';
import { MemberAvatar } from '@/components/MemberAvatar';
import { MemberFormModal } from '@/components/MemberFormModal';
import { MemberListCard } from '@/components/MemberListCard';
import { PageHeader } from '@/components/PageHeader';
import { RefreshButton } from '@/components/RefreshButton';
import { SearchInput } from '@/components/SearchInput';
import { hasUnpaidLink, PaymentLinkCard } from '@/components/PaymentLinkCell';
import { StatusBadge } from '@/components/StatusBadge';
import { useGymData } from '@/context/GymDataContext';
import { useGymMutation, useMembers, usePlans } from '@/hooks/useGymQueries';
import { formatDate, formatRelative } from '@/lib/format';
import { peekLiveUsers } from '@/services/liveDevice';
import { removeMember, saveMember, setMemberStatus, type MemberRow } from '@/services/members';
import { useUiStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { hasPermission } from '@shared/auth/permissions';
import type { Member } from '@shared/types';

const PAGE_SIZE = 15;

export function MembersPage() {
  const canSeePayments = hasPermission(useAuthStore((s) => s.user?.role ?? 'MANAGER'), 'payments.read');
  const members = useMembers({ full: true });
  const plans = usePlans();
  const { refresh, reloadMembers } = useGymData();
  const toast = useUiStore((s) => s.pushToast);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Partial<Member> | null>(null);
  const [confirm, setConfirm] = useState<Pick<MemberRow, 'id' | 'name' | 'deviceEnrollId' | 'memberCode'> | null>(null);
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh({
        syncDevice: true,
        slices: ['membersFull', 'attendance'],
        quiet: true,
      });
    }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (params.get('new') !== '1') return;
    setEditing({ firstName: '', lastName: '', status: 'ACTIVE' });
    const next = new URLSearchParams(params);
    next.delete('new');
    setParams(next, { replace: true });
  }, [params, setParams]);
  const del = useGymMutation(removeMember);
  const save = useGymMutation(async (payload: Parameters<typeof saveMember>[0] & { planId?: string }) => {
    const member = await saveMember(payload);
    void reloadMembers();
    if (params.get('plan')) {
      const next = new URLSearchParams(params);
      next.delete('plan');
      setParams(next, { replace: true });
    }
    setQ('');
    setStatus('ALL');
    setPage(0);
    if (member.deviceOk === false) {
      toast({
        kind: 'error',
        title: 'Saved on the website. Terminal did not get the user.',
        message: member.deviceError,
      });
    } else {
      toast({
        kind: 'success',
        title: payload.paymentMethod === 'CASH' || payload.paymentMethod === 'UPI'
          ? 'Member added on the website and the terminal'
          : member.paymentLinkUrl
            ? 'Member added. Payment pending'
            : 'Member saved',
        message: member.paymentLinkUrl
          ? 'The pay link was sent. After they pay, the webhook marks them paid.'
          : payload.paymentMethod === 'CASH' || payload.paymentMethod === 'UPI'
            ? `On the terminal and marked paid by ${payload.paymentMethod === 'UPI' ? 'UPI' : 'cash'} at the desk.`
            : 'On the website and the terminal.',
      });
    }
    return member;
  });
  const statusMut = useGymMutation(async ({ id, status: next }: { id: string; status: Member['status'] }) => {
    const member = await setMemberStatus(id, next);
    const online = Boolean(member.subscriptionId || (member.subscriptionStatus && member.subscriptionStatus !== 'OFFLINE'));
    toast({
      kind: 'success',
      title: next === 'SUSPENDED' ? 'Subscription paused' : 'Subscription resumed',
      message: online
        ? next === 'SUSPENDED'
          ? 'Razorpay will not charge this member until you resume.'
          : 'Razorpay billing is on again.'
        : next === 'SUSPENDED'
          ? 'Desk member held. There is no online subscription to pause.'
          : 'Desk member is active again.',
    });
    return member;
  });

  const planFilter = params.get('plan') || '';
  const filtered = useMemo(() => {
    const rows = members.data ?? [];
    return rows
      .filter((row) => {
        const hay = `${row.name} ${row.phone} ${row.email} ${row.memberCode}`.toLowerCase();
        const matchQ = hay.includes(q.toLowerCase());
        const sub = String(row.subscriptionStatus || '').toUpperCase();
        const matchS = status === 'ALL' || sub === status || (status === 'NONE' && !sub);
        const matchPlan = !planFilter || row.plan?.id === planFilter || row.plan?.name === planFilter;
        return matchQ && matchS && matchPlan;
      })
      .sort((a, b) => (b.createdAt || b.joinDate || '').localeCompare(a.createdAt || a.joinDate || ''));
  }, [members.data, q, status, planFilter]);

  if (!members.data || !plans.data) return <LoadingState />;

  const deviceCount = peekLiveUsers().length;
  const countLabel = deviceCount > filtered.length
    ? `${filtered.length} on the website · ${deviceCount} on the terminal. Press Refresh to pull the rest.`
    : `${filtered.length} people. Add a person, take their face on the terminal, then save.`;
  const slice = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const deletingId = del.isPending
    ? (typeof del.variables === 'string' ? del.variables : del.variables?.id) || ''
    : '';
  const holdingId = statusMut.isPending ? statusMut.variables?.id || '' : '';

  return (
    <div className="flex flex-col lg:min-h-full lg:flex-1">
      <PageHeader
        title="Members"
        description={countLabel}
        actions={
          <>
            <RefreshButton />
            <Button onClick={() => setEditing({ firstName: '', lastName: '', status: 'ACTIVE' })}>Add member</Button>
          </>
        }
      />
      <FilterBar>
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="Name, phone, email, ID" className="w-full min-w-0 sm:flex-1 lg:min-w-[16rem]" />
        <Select value={status} onChange={(v) => { setStatus(v); setPage(0); }}>
          <option value="ALL">All sub statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="PAUSED">Paused</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="PENDING">Pending</option>
          <option value="OFFLINE">Offline</option>
        </Select>
      </FilterBar>
      <DataTable<MemberRow>
        columns={[
          {
            key: 'photo',
            header: 'Photo',
            render: (r) => <MemberAvatar name={r.name} photoUrl={r.devicePhotoUrl} enrollId={r.deviceEnrollId} />,
          },
          {
            key: 'name',
            header: 'Name',
            render: (r) => (
              <Link className="font-medium text-accent hover:underline" to={`/members/${r.id}`}>
                {r.name}
              </Link>
            ),
          },
          { key: 'phone', header: 'Phone', render: (r) => r.phone || '—' },
          {
            key: 'plan',
            header: 'Plan',
            render: (r) => r.plan ? <Link className="text-accent hover:underline" to="/plans">{r.plan.name}</Link> : '—',
          },
          { key: 'exp', header: 'Due date', render: (r) => formatDate(r.renewDate || r.membership?.expiryDate) },
          {
            key: 'st',
            header: 'Sub status',
            render: (r) => r.subscriptionStatus
              ? <StatusBadge value={String(r.subscriptionStatus).toUpperCase()} />
              : <span className="text-ink-soft">—</span>,
          },
          {
            key: 'pay',
            header: 'Payment',
            render: (r) => {
              const badge = <StatusBadge value={r.paymentStatus ?? r.membership?.paymentStatus ?? 'PENDING'} />;
              return canSeePayments ? (
                <Link to={`/payments?q=${encodeURIComponent(r.name)}`}>{badge}</Link>
              ) : badge;
            },
          },
          { key: 'active', header: 'Last active', render: (r) => formatRelative(r.lastVisit) },
          {
            key: 'month',
            header: 'This month',
            render: (r) => (
              <Link className="tabular-nums font-semibold text-accent hover:underline" to={`/attendance?q=${encodeURIComponent(r.name)}`}>
                {r.attendanceCount}
              </Link>
            ),
          },
          {
            key: 'act',
            header: 'Actions',
            render: (r) => {
              const deleting = r.id === deletingId;
              return (
                <RowActions>
                  <IconAction label="Edit" icon={Pencil} disabled={deleting} onClick={() => setEditing(r)} />
                  {canSeePayments && r.status === 'SUSPENDED' ? (
                    <IconAction
                      label="Resume subscription"
                      icon={Play}
                      disabled={deleting}
                      loading={r.id === holdingId}
                      onClick={() => statusMut.mutate({ id: r.id, status: 'ACTIVE' }, {
                        onError: (err) => toast({ kind: 'error', title: err instanceof Error ? err.message : 'Could not resume' }),
                      })}
                    />
                  ) : null}
                  {canSeePayments && r.status !== 'SUSPENDED' ? (
                    <IconAction
                      label="Pause subscription"
                      icon={Pause}
                      disabled={deleting}
                      loading={r.id === holdingId}
                      onClick={() => statusMut.mutate({ id: r.id, status: 'SUSPENDED' }, {
                        onError: (err) => toast({ kind: 'error', title: err instanceof Error ? err.message : 'Could not pause' }),
                      })}
                    />
                  ) : null}
                  <IconAction
                    label={deleting ? 'Deleting' : 'Delete'}
                    icon={Trash2}
                    variant="danger"
                    loading={deleting}
                    onClick={() => setConfirm({ id: r.id, name: r.name, deviceEnrollId: r.deviceEnrollId, memberCode: r.memberCode })}
                  />
                </RowActions>
              );
            },
          },
        ]}
        rows={slice}
        rowKey={(r) => r.id}
        rowClassName={(r) => (r.id === deletingId ? 'tf-row-deleting' : undefined)}
        page={page}
        pageSize={PAGE_SIZE}
        total={filtered.length}
        onPage={setPage}
        rowHoverCard={(r) => {
          if (!canSeePayments) return null;
          const status = r.paymentStatus ?? r.membership?.paymentStatus;
          return hasUnpaidLink(r.paymentLinkUrl, status) ? <PaymentLinkCard url={r.paymentLinkUrl!} /> : null;
        }}
        renderCard={(r) => (
          <MemberListCard
            row={r}
            deleting={r.id === deletingId}
            showPayments={canSeePayments}
            showPaymentStatus
            onEdit={() => setEditing(r)}
            holding={r.id === holdingId}
            onToggleStatus={() =>
              statusMut.mutate(
                { id: r.id, status: r.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED' },
                {
                  onError: (err) =>
                    toast({ kind: 'error', title: err instanceof Error ? err.message : 'Could not update subscription' }),
                },
              )
            }
            onDelete={() => setConfirm({ id: r.id, name: r.name, deviceEnrollId: r.deviceEnrollId, memberCode: r.memberCode })}
          />
        )}
      />

      <MemberFormModal
        open={Boolean(editing)}
        initial={editing}
        plans={plans.data}
        members={members.data}
        onClose={() => setEditing(null)}
        onSave={async (payload) => {
          await save.mutateAsync(payload);
        }}
      />
      <ConfirmDialog
        open={Boolean(confirm)}
        title="Delete member"
        message={`Delete ${confirm?.name} from the gym and the face terminal? Attendance history is kept.`}
        confirmLabel="Delete"
        danger
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          const row = confirm;
          del.mutate(row, {
            onSuccess: async () => {
              await reloadMembers();
              toast({
                kind: 'success',
                title: 'Deleted from the terminal and the website',
              });
            },
            onError: (err) =>
              toast({ kind: 'error', title: err instanceof Error ? err.message : 'Delete failed' }),
          });
        }}
      />
    </div>
  );
}
