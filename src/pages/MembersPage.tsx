import { useCallback, useEffect, useRef, useState } from 'react';
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
import { listMembersPage, removeMember, saveMember, setMemberStatus, type MemberRow } from '@/services/members';
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
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([null]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Member> | null>(null);
  const [confirm, setConfirm] = useState<Pick<MemberRow, 'id' | 'name' | 'deviceEnrollId' | 'memberCode'> | null>(null);
  const [params, setParams] = useSearchParams();
  const reqId = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [q]);

  const loadPage = useCallback(async (pageIndex: number, stack: (string | null)[], query: string, filter: string) => {
    const id = ++reqId.current;
    setPageLoading(true);
    try {
      const res = await listMembersPage({
        q: query,
        status: filter,
        limit: PAGE_SIZE,
        cursor: stack[pageIndex] || null,
      });
      if (id !== reqId.current) return;
      setRows(res.members);
      setNextCursor(res.cursor);
    } catch (err) {
      if (id !== reqId.current) return;
      setRows([]);
      setNextCursor(null);
      toast({ kind: 'error', title: err instanceof Error ? err.message : 'Could not load members' });
    } finally {
      if (id === reqId.current) setPageLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const stack = [null] as (string | null)[];
    setCursorStack(stack);
    setPage(0);
    void loadPage(0, stack, debouncedQ, status);
  }, [debouncedQ, status, loadPage]);

  function onPage(next: number) {
    if (next === page) return;
    if (next > page) {
      if (!nextCursor) return;
      const stack = [...cursorStack.slice(0, page + 1), nextCursor];
      setCursorStack(stack);
      setPage(next);
      void loadPage(next, stack, debouncedQ, status);
      return;
    }
    setPage(next);
    void loadPage(next, cursorStack, debouncedQ, status);
  }

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
    void loadPage(0, [null], '', 'ALL');
    if (params.get('plan')) {
      const next = new URLSearchParams(params);
      next.delete('plan');
      setParams(next, { replace: true });
    }
    setQ('');
    setDebouncedQ('');
    setStatus('ALL');
    setPage(0);
    setCursorStack([null]);
    if (member.deviceOk === false) {
      toast({
        kind: 'error',
        title: 'Saved on the website. Terminal did not get the user.',
        message: member.deviceError,
      });
    } else {
      toast({
        kind: 'success',
        title: payload.extendDueDate && member.paymentLinkUrl
          ? 'Due date updated. Pay link sent to the member'
          : payload.paymentMethod === 'CASH' || payload.paymentMethod === 'UPI'
          ? 'Member added on the website and the terminal'
          : member.paymentLinkUrl
            ? 'Member added. Payment pending'
            : 'Member saved',
        message: payload.extendDueDate && member.paymentLinkUrl
          ? 'The member was texted the UPI pay link. Gym access stays on until the new due date.'
          : member.paymentLinkUrl
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
          ? 'Razorpay will not charge until you resume. Remaining days are frozen.'
          : 'Due date moved by the paused days. The next charge follows the new due date.'
        : next === 'SUSPENDED'
          ? 'Desk member held. There is no online subscription to pause.'
          : 'Desk member is active again.',
    });
    void loadPage(page, cursorStack, debouncedQ, status);
    return member;
  });

  if (!plans.data) return <LoadingState />;

  const deviceCount = peekLiveUsers().length;
  const countLabel = deviceCount > rows.length
    ? `${rows.length} on this page - ${deviceCount} on the terminal`
    : `${rows.length} on this page. Search uses the cloud.`;
  const deletingId = del.isPending
    ? (typeof del.variables === 'string' ? del.variables : del.variables?.id) || ''
    : '';
  const holdingId = statusMut.isPending ? statusMut.variables?.id || '' : '';
  const formMembers = members.data?.length ? members.data : rows;

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
        <SearchInput value={q} onChange={setQ} placeholder="Name, phone, email, ID" className="w-full min-w-0 sm:flex-1 lg:min-w-[16rem]" />
        <Select value={status} onChange={setStatus}>
          <option value="ALL">All sub statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="EXPIRED">Expired</option>
          <option value="PAUSED">Paused</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="PENDING">Pending</option>
          <option value="OFFLINE">Offline</option>
        </Select>
      </FilterBar>
      {pageLoading && !rows.length ? <LoadingState /> : (
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
          { key: 'phone', header: 'Phone', render: (r) => r.phone || '-' },
          {
            key: 'plan',
            header: 'Plan',
            render: (r) => r.plan ? <Link className="text-accent hover:underline" to="/plans">{r.plan.name}</Link> : '-',
          },
          { key: 'exp', header: 'Due date', render: (r) => formatDate(r.renewDate || r.membership?.expiryDate) },
          {
            key: 'st',
            header: 'Sub status',
            render: (r) => {
              const due = String(r.renewDate || r.membership?.expiryDate || '').slice(0, 10);
              const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
              const suspended = String(r.status || '').toUpperCase() === 'SUSPENDED';
              const raw = String(r.subscriptionStatus || r.membership?.status || r.status || '').toUpperCase();
              const expired = !suspended && Boolean(due && due < today);
              const value = ['PAUSED', 'CANCELLED', 'CANCELED'].includes(raw)
                ? raw
                : suspended
                  ? 'SUSPENDED'
                  : expired || raw === 'EXPIRED'
                    ? 'EXPIRED'
                    : raw;
              return value ? <StatusBadge value={value} /> : <span className="text-ink-soft">-</span>;
            },
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
        rows={rows}
        rowKey={(r) => r.id}
        rowClassName={(r) => (r.id === deletingId ? 'tf-row-deleting' : undefined)}
        page={page}
        pageSize={PAGE_SIZE}
        hasMore={Boolean(nextCursor)}
        onPage={onPage}
        rowHoverCard={(r) => {
          if (!canSeePayments) return null;
          const payStatus = r.paymentStatus ?? r.membership?.paymentStatus;
          return hasUnpaidLink(r.paymentLinkUrl, payStatus) ? <PaymentLinkCard url={r.paymentLinkUrl!} /> : null;
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
      )}

      <MemberFormModal
        open={Boolean(editing)}
        initial={editing}
        plans={plans.data}
        members={formMembers}
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
            onSuccess: async (result) => {
              await reloadMembers();
              void loadPage(page, cursorStack, debouncedQ, status);
              toast({
                kind: 'success',
                title: result?.removedFromDevice === false
                  ? 'Deleted from the website (no terminal enroll id)'
                  : 'Deleted from the terminal and the website',
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
