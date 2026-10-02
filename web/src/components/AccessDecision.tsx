import { reasonLabel } from '@shared/access/checkAccess';
import type { AccessOutcome } from '@/services/access';
import { formatDate } from '@/lib/format';
import { MemberAvatar } from './MemberAvatar';
import { StatusBadge } from './StatusBadge';

export function AccessDecisionPanel({
  outcome,
  idle,
}: {
  outcome: AccessOutcome | null;
  idle?: boolean;
}) {
  if (!outcome || idle) {
    return (
      <div className="surface relative grid min-h-[14rem] place-items-center overflow-hidden px-5 py-10 text-center lg:min-h-[28rem] lg:py-16">
        <div>
          <span className="relative mx-auto mb-3 block h-3 w-3 pulse-ring rounded-full bg-accent" />
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-soft">Waiting for scan</div>
          <div className="mt-1 font-display text-xl font-bold">Main gate locked</div>
        </div>
      </div>
    );
  }

  const granted = outcome.result.decision === 'GRANTED';
  const member = outcome.result.member;

  return (
    <div className={`surface px-5 py-5 ${granted ? 'border-ok/40' : 'border-bad/40'}`}>
      <div className="flex items-center gap-3">
        <MemberAvatar name={member?.name ?? 'Unknown Person'} size={48} />
        <div>
          <div className="font-display text-xl font-bold tracking-tight">{member?.name ?? 'Unknown Person'}</div>
          <div className="text-[12px] text-ink-soft">{member?.memberCode ?? '—'}</div>
        </div>
        <div className="ml-auto">
          <StatusBadge value={outcome.result.decision} />
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
        <Row label="Face" value={outcome.event.faceResult} />
        <Row label="Membership" value={outcome.result.membership?.status ?? 'NONE'} />
        <Row label="Expiry" value={formatDate(outcome.result.membership?.expiryDate)} />
        <Row label="Decision" value={outcome.result.decision === 'GRANTED' ? 'ACCESS GRANTED' : 'ACCESS DENIED'} />
        <Row label="Gate" value={outcome.gateState} />
        <Row label="Reason" value={outcome.message || reasonLabel(outcome.result.reason)} />
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-ink-soft">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </>
  );
}
