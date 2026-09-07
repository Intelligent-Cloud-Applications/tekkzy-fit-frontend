import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '@/components/DataTable';
import { FilterBar } from '@/components/FilterBar';
import { LoadingState } from '@/components/LoadingState';
import { PageHeader } from '@/components/PageHeader';
import { RefreshButton } from '@/components/RefreshButton';
import { SearchInput } from '@/components/SearchInput';
import { hasUnpaidLink, PaymentLinkCard } from '@/components/PaymentLinkCell';
import { useMembers, usePayments, usePlans } from '@/hooks/useGymQueries';
import { cn } from '@/lib/cn';
import { formatDate, formatINR } from '@/lib/format';
import type { Payment } from '@shared/types';
import type { MemberRow } from '@/services/members';

const PAGE_SIZE = 8;

const STATUS_TABS = [
  { id: 'ACTIVE', label: 'Active' },
  { id: 'INACTIVE', label: 'Inactive' },
] as const;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function latestPayment(memberId: string, payments?: Payment[]) {
  return (payments ?? [])
    .filter((p) => p.memberId === memberId && Number(p.amount) > 0)
    .sort((a, b) => {
      const rank = (p: Payment) => (p.status === 'PAID' ? 2 : p.status === 'PENDING' ? 1 : 0);
      return rank(b) - rank(a) || b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
    })[0];
}

function paymentMethodOf(member: MemberRow, payment?: Payment) {
  const method = String(payment?.method || '').toUpperCase();
  if (method === 'CASH') return 'Cash';
  if (method === 'RAZORPAY' || method === 'ONLINE' || method === 'UPI' || method === 'CARD' || method === 'BANK') {
    return method === 'RAZORPAY' ? 'Online' : method.charAt(0) + method.slice(1).toLowerCase();
  }
  if (member.paymentLinkUrl) return 'Online';
  if (member.membership?.autoRenewal) return 'Online';
  return '—';
}

function isActive(member: MemberRow) {
  const renew = member.renewDate || member.membership?.expiryDate || '';
  if (renew) return renew >= today();
  const status = String(member.membership?.status || member.status || '').toUpperCase();
  return status === 'ACTIVE' || status === 'EXPIRING';
}

export function MembershipsPage() {
  const members = useMembers();
  const payments = usePayments();
  const plans = usePlans();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [page, setPage] = useState(0);

  const rows = useMemo(() => {
    return (members.data ?? [])
      .map((member) => {
        const payment = latestPayment(member.id, payments.data);
        const plan = member.plan || plans.data?.find((p) => p.id === member.membership?.planId || p.id === payment?.planId);
        return { member, payment, plan };
      })
      .filter((r) => r.member.membership || r.member.plan || r.payment)
      .filter((r) => {
        const hay = `${r.member.name} ${r.member.phone} ${r.member.memberCode} ${r.plan?.name ?? ''}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
        const active = isActive(r.member);
        return status === 'ACTIVE' ? active : !active;
      })
      .sort((a, b) => a.member.name.localeCompare(b.member.name));
  }, [members.data, payments.data, plans.data, q, status]);

  if (!members.data || !payments.data || !plans.data) return <LoadingState />;
  const slice = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="flex flex-col lg:min-h-full lg:flex-1">
      <PageHeader
        title="Memberships"
        description="People with a subscription. Filter by active or inactive."
        actions={<RefreshButton />}
      />
      <FilterBar>
        <div className="flex w-full shrink-0 rounded-full border border-line bg-panel p-1 lg:w-auto lg:rounded-2xl">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => { setStatus(tab.id); setPage(0); }}
              className={cn(
                'tap flex-1 rounded-full px-4 py-2 text-center text-[13px] font-semibold lg:flex-none lg:rounded-xl',
                status === tab.id ? 'bg-accent text-white' : 'text-ink-soft hover:bg-[var(--hover-fill)] hover:text-ink',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <SearchInput value={q} onChange={(v) => { setQ(v); setPage(0); }} className="min-w-0 w-full flex-1 lg:min-w-[16rem]" placeholder="Member, phone, or plan" />
      </FilterBar>
      <DataTable
        columns={[
          {
            key: 'm',
            header: 'Member',
            render: (r) => (
              <Link className="text-accent hover:underline" to={`/members/${r.member.id}`}>
                {r.member.name}
              </Link>
            ),
          },
          { key: 'ph', header: 'Phone', render: (r) => r.member.phone || '—' },
          { key: 'p', header: 'Plan', render: (r) => r.plan?.name ?? '—' },
          {
            key: 'a',
            header: 'Amount',
            render: (r) => formatINR(r.payment?.amount ?? r.member.membership?.price ?? 0),
          },
          { key: 'me', header: 'Payment method', render: (r) => paymentMethodOf(r.member, r.payment) },
          { key: 's', header: 'Start', render: (r) => formatDate(r.member.membership?.startDate || r.member.joinDate) },
          {
            key: 'r',
            header: 'Renew date',
            render: (r) => formatDate(r.member.renewDate || r.payment?.renewDate || r.member.membership?.expiryDate),
          },
        ]}
        rows={slice}
        rowKey={(r) => r.member.id}
        page={page}
        pageSize={PAGE_SIZE}
        total={rows.length}
        onPage={setPage}
        empty="No members with a subscription in this filter"
        rowHoverCard={(r) =>
          hasUnpaidLink(r.member.paymentLinkUrl || r.payment?.paymentLinkUrl, r.member.paymentStatus || r.payment?.status)
            ? <PaymentLinkCard url={(r.member.paymentLinkUrl || r.payment?.paymentLinkUrl)!} />
            : null
        }
      />
    </div>
  );
}
