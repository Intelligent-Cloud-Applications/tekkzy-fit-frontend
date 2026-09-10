import { Link, useParams } from 'react-router-dom';
import { Button } from '@/components/Button';
import { ChartCard } from '@/components/ChartCard';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { PaymentLinkHover } from '@/components/PaymentLinkCell';
import { StatusBadge } from '@/components/StatusBadge';
import { useMembers, usePayments } from '@/hooks/useGymQueries';
import { formatDate, formatINR } from '@/lib/format';
import { displayPaymentId, paymentMethodLabel, paymentRenewDate } from '@/services/payments';

export function PaymentDetailPage() {
  const { id = '' } = useParams();
  const payments = usePayments();
  const members = useMembers();
  if (!payments.data || !members.data) return <LoadingState />;
  const payment = payments.data.find((p) =>
    p.id === id || displayPaymentId(p) === id || p.paymentCode === id || p.razorpayPaymentId === id,
  );
  if (!payment) return <ErrorState message="Payment not found." />;
  const member = members.data.find((m) => m.id === payment.memberId);

  return (
    <div className="flex w-full flex-col gap-3 lg:min-h-full lg:flex-1">
      <div className="flex w-full items-center justify-between gap-2">
        <Link to="/payments"><Button variant="secondary">Back</Button></Link>
        <Button variant="secondary" className="hidden sm:inline-flex" onClick={() => window.print()}>Print receipt</Button>
      </div>
      <div className="surface px-4 py-4 lg:hidden">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft">Amount</div>
        <div className="mt-1 font-display text-[2rem] font-bold leading-none">{formatINR(payment.netAmount ?? payment.amount)}</div>
        <div className="mt-2"><StatusBadge value={payment.status} /></div>
      </div>
      <div className="grid w-full flex-1 grid-cols-1 gap-3 lg:grid-cols-2">
        <ChartCard title="Receipt">
          <div className="space-y-1 text-[13px]">
            <Row label="Payment ID" value={displayPaymentId(payment)} />
            <Row label="Invoice" value={payment.invoiceNumber} />
            <Row label="Amount received" value={formatINR(payment.netAmount ?? payment.amount)} />
            {payment.method === 'RAZORPAY' && payment.grossAmount ? (
              <Row label="Member paid" value={formatINR(payment.grossAmount)} />
            ) : null}
            {payment.method === 'RAZORPAY' && payment.feeAmount ? (
              <Row label="Razorpay fee" value={formatINR(payment.feeAmount)} />
            ) : null}
            <Row label="Date" value={formatDate(payment.date)} />
            <Row label="Renew date" value={formatDate(paymentRenewDate(payment, member))} />
            <Row label="Method" value={paymentMethodLabel(payment.method)} />
            <PaymentLinkHover url={payment.paymentLinkUrl} status={payment.status}>
              <div className="flex justify-between py-1">
                <span className="text-ink-soft">Status</span>
                <StatusBadge value={payment.status} />
              </div>
            </PaymentLinkHover>
          </div>
        </ChartCard>
        <ChartCard title="Member">
          <div className="space-y-1 text-[13px]">
            <Row label="Name" value={member?.name ?? '—'} />
            <Row label="Member ID" value={member?.memberCode ?? '—'} />
            <Row label="Phone" value={member?.phone || '—'} />
            <Row label="Plan" value={member?.plan?.name ?? '—'} />
            <Row label="Renew date" value={formatDate(paymentRenewDate(payment, member))} />
            <Row label="Membership" value={member?.membership?.status ?? '—'} />
            <Row label="Access" value={member?.membership?.accessStatus ?? '—'} />
          </div>
        </ChartCard>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-line py-1.5">
      <span className="text-ink-soft">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
