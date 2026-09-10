import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/Button';
import { ChartCard } from '@/components/ChartCard';
import { DataTable } from '@/components/DataTable';
import { ErrorState } from '@/components/ErrorState';
import { LoadingState } from '@/components/LoadingState';
import { MemberAvatar } from '@/components/MemberAvatar';
import { MemberFormModal } from '@/components/MemberFormModal';
import { RefreshButton } from '@/components/RefreshButton';
import { ThemedSelect } from '@/components/ThemedSelect';
import { hasUnpaidLink, PaymentLinkCard } from '@/components/PaymentLinkCell';
import { StatusBadge } from '@/components/StatusBadge';
import { useAttendance, useGymMutation, useInvalidateGym, useMember, useMembers, usePayments, useAccessEvents, useDevices, usePlans } from '@/hooks/useGymQueries';
import { formatDate, formatDateTime, formatINR } from '@/lib/format';
import { attendanceBelongsToMember } from '@/services/attendance';
import { memberDueDate, registerMemberFace, saveMember } from '@/services/members';
import { backfillMemberAttendance } from '@/services/memberAttendance';
import { paymentBelongsToMember, paymentMethodLabel } from '@/services/payments';
import { startLiveFaceEnroll } from '@/services/liveDevice';
import { useUiStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';
import { hasPermission } from '@shared/auth/permissions';
import type { Payment } from '@shared/types';

export function MemberProfilePage() {
  const canSeePayments = hasPermission(useAuthStore((s) => s.user?.role ?? 'MANAGER'), 'payments.read');
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const member = useMember(id);
  const invalidate = useInvalidateGym();
  const members = useMembers({ full: true });
  const plans = usePlans();
  const [editing, setEditing] = useState(false);
  const attendance = useAttendance();
  const payments = usePayments();
  const events = useAccessEvents();
  const devices = useDevices();
  const toast = useUiStore((s) => s.pushToast);
  const [deviceId, setDeviceId] = useState('dev-entry-01');
  const faceMut = useGymMutation(({ memberId, deviceId: d }: { memberId: string; deviceId: string }) =>
    registerMemberFace(memberId, d),
  );

  const row = member.data;

  useEffect(() => {
    if (!row?.id) return;
    void backfillMemberAttendance(row).then(() => invalidate());
  }, [row?.id, invalidate]);
  const payRows = useMemo(() => {
    if (!row) return [];
    return (payments.data ?? [])
      .filter((p) => paymentBelongsToMember(p, row))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [payments.data, row]);
  const eventRows = useMemo(() => {
    if (!row) return [];
    const fromStore = (events.data ?? []).filter((e) =>
      attendanceBelongsToMember(
        {
          id: e.id,
          memberId: e.memberId || '',
          memberName: e.memberName,
          memberCode: e.memberCode,
          deviceId: e.deviceId,
          deviceName: e.deviceName,
          timestamp: e.timestamp,
          type: e.type,
          status: e.decision === 'GRANTED' ? 'GRANTED' : 'DENIED',
          createdAt: e.timestamp,
        },
        row,
      ),
    );
    const fromVisits = (attendance.data ?? [])
      .filter((r) => attendanceBelongsToMember(r, row))
      .map((r) => ({
        id: `att-${r.id}`,
        memberId: r.memberId,
        memberName: r.memberName,
        memberCode: r.memberCode,
        deviceId: r.deviceId,
        deviceName: r.deviceName,
        timestamp: r.timestamp,
        type: r.type,
        decision: (r.status === 'GRANTED' ? 'GRANTED' : 'DENIED') as 'GRANTED' | 'DENIED',
        reason: r.status === 'GRANTED' ? 'ACCESS_GRANTED' : String(r.status),
        faceResult: 'MATCHED' as const,
        gateAction: (r.status === 'GRANTED' ? 'UNLOCKED' : 'NONE') as 'UNLOCKED' | 'NONE',
      }));
    const seen = new Set<string>();
    return [...fromStore, ...fromVisits]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .filter((e) => {
        const key = `${e.timestamp}|${e.memberCode || e.memberId}|${e.decision}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 20);
  }, [attendance.data, events.data, row]);

  if (member.isLoading) return <LoadingState />;
  if (!row) return <ErrorState message="Member not found." />;

  const address = [row.address, row.city].filter(Boolean).join(', ') || '—';
  const emergency = [row.emergencyContactName, row.emergencyContactPhone].filter(Boolean).join(' · ') || '—';

  return (
    <div className="flex w-full flex-col gap-3 lg:min-h-full lg:flex-1">
      <button
        type="button"
        className="tap inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-ink-soft hover:text-ink"
        onClick={() => navigate('/members')}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to members
      </button>

      <div className="surface flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
        <MemberAvatar name={row.name} size={48} photoUrl={row.devicePhotoUrl} enrollId={row.deviceEnrollId} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-display text-xl font-bold tracking-tight sm:text-2xl">{row.name}</div>
            {row.subscriptionStatus
              ? <StatusBadge value={String(row.subscriptionStatus).toUpperCase()} />
              : <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-soft">No sub</span>}
            {canSeePayments ? (
              <StatusBadge value={row.paymentStatus ?? row.membership?.paymentStatus ?? 'PENDING'} />
            ) : null}
          </div>
          <div className="mt-0.5 text-[12px] text-ink-soft">
            {row.memberCode} · {row.phone || 'No phone'}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <RefreshButton />
          <Button onClick={() => setEditing(true)}>Edit member</Button>
        </div>
      </div>

      <div className="grid w-full grid-cols-1 items-start gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <ChartCard title="Subscription" className="h-auto overflow-visible">
          <Info label="Plan" value={row.plan?.name || '—'} />
          <Info label="Status" value={row.subscriptionStatus ? String(row.subscriptionStatus).toUpperCase() : '—'} />
          <Info label="Due date" value={formatDate(memberDueDate(row) || row.renewDate || row.membership?.expiryDate)} />
          {canSeePayments ? (
            <Info label="Payment" value={row.paymentStatus ?? row.membership?.paymentStatus ?? 'PENDING'} />
          ) : null}
          {canSeePayments && hasUnpaidLink(row.paymentLinkUrl, row.paymentStatus) ? (
            <div className="pt-2">
              <PaymentLinkCard url={row.paymentLinkUrl!} />
            </div>
          ) : null}
        </ChartCard>
        <ChartCard title="Personal" className="h-auto overflow-visible">
          <Info label="Gender" value={row.gender} />
          <Info label="Date of birth" value={formatDate(row.dateOfBirth)} />
          <Info label="Blood group" value={row.bloodGroup ?? '—'} hideEmpty />
          <Info label="Join date" value={formatDate(row.joinDate)} />
          <Info label="Address" value={address} />
        </ChartCard>
        <ChartCard title="Contact" className="h-auto overflow-visible">
          <Info label="Email" value={row.email || '—'} />
          <Info label="Phone" value={row.phone || '—'} />
          <Info label="Emergency" value={emergency} hideEmpty />
        </ChartCard>
        <ChartCard title="Face" className="h-auto overflow-visible">
          <Info label="Face" value={row.faceRegistered ? 'REGISTERED' : 'NOT REGISTERED'} />
          <Info label="Device ID" value={row.deviceEnrollId || '—'} />
          <Info label="Dept." value={row.department || '—'} hideEmpty />
          <Info label="Shift" value={row.deviceShift || '—'} hideEmpty />
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <ThemedSelect pill className="w-full min-w-0 sm:w-auto sm:min-w-[10rem]" value={deviceId} onValue={setDeviceId}>
              {(devices.data ?? []).filter((d) => d.type === 'FACE_TERMINAL').map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </ThemedSelect>
            <Button
              className="w-full sm:w-auto"
              onClick={() => {
                const enroll = row.deviceEnrollId ?? row.memberCode.replace(/\D/g, '');
                if (enroll) {
                  void startLiveFaceEnroll(enroll, row.name, 50, true)
                    .then((r) => toast({ kind: r.ok ? 'success' : 'error', title: r.message }))
                    .catch((e: Error) => toast({ kind: 'error', title: e.message }));
                  return;
                }
                faceMut.mutate(
                  { memberId: row.id, deviceId },
                  { onSuccess: () => toast({ kind: 'success', title: 'Face registered on mock terminal' }) },
                );
              }}
            >
              Register face
            </Button>
          </div>
        </ChartCard>
      </div>

      <ChartCard title="Monthly attendance" className="h-auto overflow-visible">
        {Object.keys(row.attendance || {}).length ? (
          Object.entries(row.attendance || {})
            .sort(([a], [b]) => new Date(`${b.replace('-', ' ')} 1`).getTime() - new Date(`${a.replace('-', ' ')} 1`).getTime())
            .map(([month, total]) => (
              <Info key={month} label={month.replace('-', ' ')} value={String(total)} />
            ))
        ) : (
          <p className="py-2 text-[13px] text-ink-soft">No monthly attendance stored yet.</p>
        )}
      </ChartCard>

      <ChartCard title="Access history" className="h-auto overflow-visible">
        {attendance.isLoading && !events.data ? (
          <p className="py-6 text-center text-[13px] text-ink-soft">Loading access…</p>
        ) : (
          <DataTable
            fit
            columns={[
              { key: 't', header: 'Time', render: (r) => formatDateTime(r.timestamp) },
              { key: 'd', header: 'Decision', render: (r) => <StatusBadge value={r.decision} /> },
              { key: 'r', header: 'Reason', render: (r) => String(r.reason || '').replaceAll('_', ' ') },
              { key: 'g', header: 'Device', render: (r) => r.deviceName || r.gateAction },
            ]}
            rows={eventRows}
            rowKey={(r) => r.id}
            empty="No access yet for this member"
          />
        )}
      </ChartCard>
      {canSeePayments ? (
      <ChartCard
        title="Payment history"
        className="h-auto overflow-visible"
        action={
          <Link className="text-[12px] font-semibold text-accent" to={`/payments?q=${encodeURIComponent(row.name)}`}>
            Open Payment History
          </Link>
        }
      >
        {payments.isLoading ? (
          <p className="py-6 text-center text-[13px] text-ink-soft">Loading payments…</p>
        ) : (
          <DataTable
            fit
            columns={[
              { key: 'd', header: 'Date', render: (p) => paymentLink(p, formatDate(p.date)) },
              { key: 'p', header: 'Plan', render: (p) => {
                const name = plans.data?.find((pl) => pl.id === p.planId)?.name || row.plan?.name || '—';
                return name !== '—' ? <Link className="text-accent hover:underline" to="/plans">{name}</Link> : name;
              } },
              { key: 'amt', header: 'Amount', render: (p) => formatINR(p.amount) },
              { key: 'm', header: 'Method', render: (p) => paymentMethodLabel(p.method) },
              { key: 'r', header: 'Renew date', render: (p) => formatDate(p.renewDate || row.renewDate || row.membership?.expiryDate) },
              { key: 's', header: 'Status', render: (p) => <StatusBadge value={p.status} /> },
              { key: 'i', header: 'Invoice', render: (p) => p.invoiceNumber || '—' },
            ]}
            rows={payRows}
            rowKey={(p) => p.id}
            rowHoverCard={(p) => hasUnpaidLink(p.paymentLinkUrl, p.status) ? <PaymentLinkCard url={p.paymentLinkUrl!} /> : null}
            empty="No payment history for this member"
          />
        )}
      </ChartCard>
      ) : null}
      {row.notes ? (
        <ChartCard title="Notes" className="h-auto overflow-visible">
          <p className="text-[13px]">{row.notes}</p>
        </ChartCard>
      ) : null}
      <MemberFormModal
        open={editing}
        initial={row}
        plans={plans.data ?? []}
        members={members.data ?? []}
        onClose={() => setEditing(false)}
        onSave={async (payload) => {
          await saveMember(payload);
          invalidate();
        }}
      />
    </div>
  );
}

function paymentLink(payment: Payment, label: string) {
  if (payment.id.startsWith('member-')) return <>{label}</>;
  return <Link className="text-accent hover:underline" to={`/payments/${payment.id}`}>{label}</Link>;
}

function Info({ label, value, hideEmpty }: { label: string; value: string; hideEmpty?: boolean }) {
  if (hideEmpty && (!value || value === '—')) return null;
  return (
    <div className="flex justify-between gap-4 border-b border-line py-1 text-[13px] last:border-0">
      <span className="text-ink-soft">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}