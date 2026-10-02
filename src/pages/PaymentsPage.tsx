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
import { MemberSuggest } from '@/components/MemberSuggest';
import { useGymMutation, useMembers, usePayments, usePlans } from '@/hooks/useGymQueries';
import { formatDate, formatINR, todayISODate } from '@/lib/format';
import { displayPaymentId, isRealPayment, paymentBelongsToMember, paymentKpis, paymentMethodLabel, paymentRenewDate, recordPayment } from '@/services/payments';
import type { MemberRow } from '@/services/members';
import { addDays, listPlans } from '@/services/memberships';
import { useConnectionStore } from '@/store/connectionStore';
import { useUiStore } from '@/store/uiStore';
import type { MembershipPlan, Payment } from '@shared/types';

const PAGE_SIZE = 15;

function findPaymentMember(members: MemberRow[] | undefined, payment: Payment) {
  return members?.find((member) => paymentBelongsToMember(payment, member));
}

export function PaymentsPage() {
  const payments = usePayments();
  const members = useMembers({ full: true });
  const plans = usePlans();
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
        description="Every cash, UPI, and Razorpay payment, tied to the member and their plan."
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
          {
            key: 'a',
            header: 'Amount',
            render: (p) => (
              <span title={p.method === 'RAZORPAY' && p.grossAmount && p.feeAmount
                ? `Paid ${formatINR(p.grossAmount)} · Razorpay fee ${formatINR(p.feeAmount)}`
                : undefined}
              >
                {formatINR(p.netAmount ?? p.amount)}
              </span>
            ),
          },
          {
            key: 'r',
            header: 'Renew date',
            render: (p) => formatDate(paymentRenewDate(p, findPaymentMember(members.data, p))),
          },
          { key: 'd', header: 'Date', render: (p) => formatDate(p.date) },
          { key: 'me', header: 'Method', render: (p) => paymentMethodLabel(p.method) },
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
        plans={plans.data ?? []}
        online={online}
        onClose={() => setOpen(false)}
        onSave={async (payload) => {
          const row = await create.mutateAsync(payload);
          toast({
            kind: 'success',
            title: payload.method === 'ONLINE'
              ? 'Subscription link sent to phone and email'
              : payload.method === 'UPI'
                ? 'UPI collection recorded'
                : 'Payment recorded',
            message: row.paymentLinkUrl || row.notes || 'Membership dates update after the first Razorpay subscription payment.',
          });
          setOpen(false);
        }}
      />
    </div>
  );
}

function renewalStart(member?: MemberRow) {
  const current = String(member?.membership?.expiryDate || member?.renewDate || '').slice(0, 10);
  const today = todayISODate();
  return current && current >= today ? current : today;
}

function planEndDate(member: MemberRow | undefined, plan?: MembershipPlan) {
  return addDays(renewalStart(member), Number(plan?.durationDays || 30));
}

function RecordPaymentModal({
  open,
  members,
  plans,
  online,
  onClose,
  onSave,
}: {
  open: boolean;
  members: MemberRow[];
  plans: MembershipPlan[];
  online: boolean;
  onClose: () => void;
  onSave: (payload: Parameters<typeof recordPayment>[0]) => Promise<void>;
}) {
  const toast = useUiStore((s) => s.pushToast);
  const [query, setQuery] = useState('');
  const [memberId, setMemberId] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [planId, setPlanId] = useState(plans[0]?.id ?? '');
  const [amount, setAmount] = useState(String(plans[0]?.price ?? ''));
  const [endDate, setEndDate] = useState('');
  const [method, setMethod] = useState<'CASH' | 'UPI' | 'ONLINE'>('CASH');
  const deskPay = method === 'CASH' || method === 'UPI';
  const [renew, setRenew] = useState(true);
  const [busy, setBusy] = useState(false);
  const [planRows, setPlanRows] = useState<MembershipPlan[]>(plans);
  const member = members.find((row) => row.id === memberId);
  const plan = planRows.find((row) => row.id === planId);
  const shownEnd = endDate || planEndDate(member, plan);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setMemberId('');
    setPhone('');
    setEmail('');
    setMethod('CASH');
    setRenew(true);
    setBusy(false);
    setPlanRows(plans);
    setPlanId(plans[0]?.id ?? '');
    setAmount(String(plans[0]?.price ?? ''));
    setEndDate('');
    let cancelled = false;
    void listPlans().then((rows) => {
      if (cancelled || !rows.length) return;
      setPlanRows(rows);
      setPlanId((current) => {
        const id = current && rows.some((row) => row.id === current) ? current : rows[0].id;
        const row = rows.find((item) => item.id === id) || rows[0];
        setAmount((value) => value || String(row.price ?? ''));
        return id;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [open, plans]);

  function pickMember(next: MemberRow) {
    const nextPlanId = next.plan?.id
      || next.membership?.planId
      || String((next as MemberRow & { planId?: string }).planId || '')
      || planRows[0]?.id
      || '';
    const nextPlan = planRows.find((row) => row.id === nextPlanId);
    setMemberId(next.id);
    setQuery(next.name);
    setPhone(next.phone || '');
    setEmail(next.email || '');
    setPlanId(nextPlanId);
    setAmount(String(nextPlan?.price ?? next.plan?.price ?? ''));
    setEndDate(planEndDate(next, nextPlan || planRows[0]));
  }

  function applyPlan(nextPlanId: string) {
    const nextPlan = planRows.find((row) => row.id === nextPlanId);
    setPlanId(nextPlanId);
    setAmount(String(nextPlan?.price ?? ''));
    setEndDate(planEndDate(member, nextPlan));
  }

  async function submit() {
    if (!member) {
      toast({ kind: 'error', title: 'Search and pick a member' });
      return;
    }
    if (!phone.trim()) {
      toast({ kind: 'error', title: 'Enter a phone number' });
      return;
    }
    if (method === 'ONLINE' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast({ kind: 'error', title: 'Enter a valid email so the subscription link can be sent' });
      return;
    }
    if (method === 'ONLINE' && !online) {
      toast({ kind: 'error', title: 'Online payments need the internet' });
      return;
    }
    const rupees = Number(amount);
    if (!Number.isFinite(rupees) || rupees <= 0) {
      toast({ kind: 'error', title: 'Enter a valid amount' });
      return;
    }
    setBusy(true);
    try {
      await onSave({
        memberId: member.cognitoId || member.id,
        planId: planId || member.membership?.planId || planRows[0]?.id || '',
        planName: plan?.name,
        membershipId: member.membership?.id,
        amount: rupees,
        method,
        renew: deskPay ? renew : false,
        durationDays: plan?.durationDays,
        renewDate: shownEnd,
        phone: phone.trim(),
        email: email.trim(),
      });
    } catch (err) {
      toast({ kind: 'error', title: err instanceof Error ? err.message : 'Could not record payment' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Record payment" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Member">
          <MemberSuggest
            members={members}
            query={query}
            selectedId={memberId}
            onQuery={(value) => {
              setQuery(value);
              if (member && value !== member.name) setMemberId('');
            }}
            onPick={pickMember}
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Phone">
            <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Phone number" />
          </Field>
          <Field label={method === 'ONLINE' ? 'Email' : 'Email (optional)'}>
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required={method === 'ONLINE'} />
          </Field>
        </div>
        <Field label="Plan">
          <NativeSelect value={planId} onChange={(e) => applyPlan(e.target.value)} disabled={!planRows.length}>
            {!planRows.length ? <option value="">Loading plans…</option> : null}
            {planRows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
                {row.price != null ? ` · ${formatINR(row.price)}` : ''}
                {row.durationDays ? ` · ${row.durationDays} days` : ''}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Amount (₹)">
            <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </Field>
          <Field label="End date">
            <TextInput
              type="date"
              min={todayISODate()}
              value={shownEnd}
              readOnly={!deskPay}
              disabled={!deskPay}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </Field>
        </div>
        <p className="text-[11px] text-ink-soft">
          {method === 'ONLINE'
            ? `Online subscriptions follow the plan. Shown end date is ${formatDate(shownEnd)}. Razorpay sets the real date after the first payment.`
            : `Membership ends ${formatDate(shownEnd)}. You can change this for ${method === 'UPI' ? 'UPI' : 'cash'}.`}
        </p>
        <Field label="Method">
          <NativeSelect value={method} onChange={(e) => setMethod(e.target.value as 'CASH' | 'UPI' | 'ONLINE')}>
            <option value="CASH">Cash</option>
            <option value="UPI">UPI</option>
            <option value="ONLINE">Online</option>
          </NativeSelect>
        </Field>
        {deskPay ? (
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={renew} onChange={(e) => setRenew(e.target.checked)} />
            Renew / extend membership after payment
          </label>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" className="w-full sm:w-auto" loading={busy}>
            {method === 'ONLINE' ? 'Send subscription link' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
