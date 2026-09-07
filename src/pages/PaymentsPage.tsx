import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/Button';
import { DataTable } from '@/components/DataTable';
import { Field, NativeSelect, TextInput } from '@/components/Field';
import { FilterBar, Select } from '@/components/FilterBar';
import { LoadingState } from '@/components/LoadingState';
import { Modal } from '@/components/Modal';
import { PageHeader } from '@/components/PageHeader';
import { RefreshButton } from '@/components/RefreshButton';
import { SearchInput } from '@/components/SearchInput';
import { StatCard } from '@/components/StatCard';
import { hasUnpaidLink, PaymentLinkCard } from '@/components/PaymentLinkCell';
import { StatusBadge } from '@/components/StatusBadge';
import { useGymMutation, useMembers, usePayments } from '@/hooks/useGymQueries';
import { formatDate, formatINR } from '@/lib/format';
import { displayPaymentId, isRealPayment, paymentBelongsToMember, paymentKpis, paymentRenewDate, recordPayment } from '@/services/payments';
import type { MemberRow } from '@/services/members';
import { useConnectionStore } from '@/store/connectionStore';
import { useUiStore } from '@/store/uiStore';
import type { Payment, PaymentMethod } from '@shared/types';

const PAGE_SIZE = 15;

function findPaymentMember(members: MemberRow[] | undefined, payment: Payment) {
  return members?.find((member) => paymentBelongsToMember(payment, member));
}

export function PaymentsPage() {
  const payments = usePayments();
  const members = useMembers({ full: true });
  const toast = useUiStore((s) => s.pushToast);
  const online = useConnectionStore((s) => s.online);
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const create = useGymMutation(recordPayment);

  useEffect(() => {
    const next = params.get('q') || '';
    if (next) setQ(next);
  }, [params]);

  const rows = useMemo(() => {
    return (payments.data ?? []).filter((p) => {
      if (!isRealPayment(p)) return false;
      const member = findPaymentMember(members.data, p);
      const hay = `${displayPaymentId(p)} ${p.paymentCode} ${member?.name ?? p.memberName ?? ''} ${p.invoiceNumber}`.toLowerCase();
      return hay.includes(q.toLowerCase()) && (status === 'ALL' || p.status === status);
    });
  }, [payments.data, members.data, q, status]);

  if (!payments.data || !members.data) return <LoadingState />;
  const kpis = paymentKpis((payments.data ?? []).filter(isRealPayment));
  const renewalsDue = members.data.filter((m) => m.membership?.status === 'EXPIRING').length;
  const slice = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="flex flex-col lg:min-h-full lg:flex-1">
      <PageHeader
        title="Payment History"
        description="Every cash and Razorpay payment, tied to the member and their plan."
        actions={
          <>
            <RefreshButton />
            <Button onClick={() => setOpen(true)}>Record payment</Button>
          </>
        }
      />
      <div className="mb-3 grid w-full grid-cols-2 gap-2.5 md:grid-cols-5">
        <StatCard label="Today's revenue" value={formatINR(kpis.todayRevenue)} />
        <StatCard label="Monthly revenue" value={formatINR(kpis.monthlyRevenue)} />
        <div className="col-span-2 grid grid-cols-3 gap-2.5 md:col-span-3 md:contents">
          <StatCard label="Pending" value={kpis.pending} tone="warn" />
          <StatCard label="Failed" value={kpis.failed} tone="bad" />
          <StatCard label="Renewals due" value={renewalsDue} tone="warn" />
        </div>
      </div>
      <FilterBar>
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(0); }} className="min-w-0 flex-1 lg:min-w-[16rem]" />
        <Select value={status} onChange={(v) => { setStatus(v); setPage(0); }}>
          <option value="ALL">All</option>
          <option value="PAID">Paid</option>
          <option value="PENDING">Pending</option>
          <option value="FAILED">Failed</option>
          <option value="REFUNDED">Refunded</option>
        </Select>
      </FilterBar>
      <DataTable
        columns={[
          {
            key: 'id',
            header: 'Payment ID',
            render: (p) => (
              <Link className="block truncate text-accent hover:underline" to={`/payments/${p.id}`}>
                {displayPaymentId(p)}
              </Link>
            ),
          },
          {
            key: 'm',
            header: 'Member',
            render: (p) => {
              const member = findPaymentMember(members.data, p);
              const name = member?.name || p.memberName || '—';
              return member ? <Link className="text-accent hover:underline" to={`/members/${member.id}`}>{name}</Link> : name;
            },
          },
          {
            key: 'pl',
            header: 'Plan',
            render: (p) => {
              const plan = findPaymentMember(members.data, p)?.plan;
              return plan ? <Link className="text-accent hover:underline" to="/plans">{plan.name}</Link> : '—';
            },
          },
          { key: 'a', header: 'Amount', render: (p) => formatINR(p.amount) },
          {
            key: 'r',
            header: 'Renew date',
            render: (p) => formatDate(paymentRenewDate(p, findPaymentMember(members.data, p))),
          },
          { key: 'd', header: 'Date', render: (p) => formatDate(p.date) },
          { key: 'me', header: 'Method', render: (p) => p.method },
          { key: 's', header: 'Status', render: (p) => <StatusBadge value={p.status} /> },
          { key: 'i', header: 'Invoice', render: (p) => p.invoiceNumber },
        ]}
        rows={slice}
        rowKey={(p) => p.id}
        page={page}
        pageSize={PAGE_SIZE}
        total={rows.length}
        onPage={setPage}
        rowHoverCard={(p) => hasUnpaidLink(p.paymentLinkUrl, p.status) ? <PaymentLinkCard url={p.paymentLinkUrl!} /> : null}
      />
      <RecordPaymentModal
        open={open}
        members={members.data}
        online={online}
        onClose={() => setOpen(false)}
        onSave={async (payload) => {
          const row = await create.mutateAsync(payload);
          toast({
            kind: 'success',
            title: payload.method === 'RAZORPAY' ? 'Subscription link sent to phone and email' : 'Payment recorded',
            message: row.paymentLinkUrl || row.notes || 'Membership dates update after the first Razorpay subscription payment.',
          });
          setOpen(false);
        }}
      />
    </div>
  );
}

function RecordPaymentModal({
  open,
  members,
  online,
  onClose,
  onSave,
}: {
  open: boolean;
  members: { id: string; name: string; membership?: { id: string; planId: string } }[];
  online: boolean;
  onClose: () => void;
  onSave: (payload: Parameters<typeof recordPayment>[0]) => Promise<void>;
}) {
  const [memberId, setMemberId] = useState(members[0]?.id ?? '');
  const member = members.find((m) => m.id === memberId);
  const [amount, setAmount] = useState('2499');
  const [method, setMethod] = useState<PaymentMethod>('UPI');
  const [renew, setRenew] = useState(true);

  return (
    <Modal open={open} title="Record payment" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void onSave({
            memberId,
            planId: member?.membership?.planId ?? 'plan-monthly',
            membershipId: member?.membership?.id,
            amount: Number(amount),
            method,
            renew,
          });
        }}
      >
        <Field label="Member">
          <NativeSelect value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Amount (₹)">
          <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Method">
          <NativeSelect value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="CARD">Card</option>
            <option value="BANK">Bank transfer</option>
            <option value="RAZORPAY">Razorpay subscription (test)</option>
          </NativeSelect>
        </Field>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={renew} onChange={(e) => setRenew(e.target.checked)} />
          Renew / extend membership after payment
        </label>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            disabled={!online || method !== 'RAZORPAY'}
            onClick={() => {
              void onSave({
                memberId,
                planId: member?.membership?.planId ?? 'plan-monthly',
                membershipId: member?.membership?.id,
                amount: Number(amount),
                method: 'RAZORPAY',
                durationDays: 30,
              });
            }}
          >
            {online ? 'Send subscription link' : 'Online payments unavailable offline'}
          </Button>
          <Button type="submit" className="w-full sm:w-auto">Save</Button>
        </div>
      </form>
    </Modal>
  );
}
