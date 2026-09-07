import { Link } from 'react-router-dom';
import { ExternalLink, Pause, Pencil, Play, Trash2 } from 'lucide-react';
import { MemberAvatar } from '@/components/MemberAvatar';
import { hasUnpaidLink } from '@/components/PaymentLinkCell';
import { StatusBadge } from '@/components/StatusBadge';
import { formatDate } from '@/lib/format';
import type { MemberRow } from '@/services/members';

export function MemberListCard({
  row,
  deleting,
  holding,
  onEdit,
  onToggleStatus,
  onDelete,
}: {
  row: MemberRow;
  deleting?: boolean;
  holding?: boolean;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
}) {
  const pay = row.paymentStatus ?? row.membership?.paymentStatus ?? 'PENDING';
  const unpaid = hasUnpaidLink(row.paymentLinkUrl, pay);
  const suspended = row.status === 'SUSPENDED';
  const plan = row.plan?.name ?? 'No plan';
  const expiry = row.membership?.expiryDate ? formatDate(row.membership.expiryDate) : 'No expiry';
  const sub = String(row.subscriptionStatus || '').toUpperCase();

  return (
    <article className="relative overflow-hidden rounded-2xl border border-line bg-panel">
      {deleting ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-panel/70 text-[12px] font-semibold text-bad">
          <span className="tf-btn-loader" aria-hidden />
          Deleting
        </div>
      ) : null}
      <div className="flex items-center gap-2.5 px-2.5 py-2">
        <Link to={`/members/${row.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
          <MemberAvatar name={row.name} photoUrl={row.devicePhotoUrl} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="min-w-0 truncate text-[14px] font-bold tracking-tight text-ink">{row.name}</h3>
            </div>
            <p className="truncate text-[11px] text-ink-soft">
              {plan}
              <span aria-hidden> · </span>
              {expiry}
              <span aria-hidden> · </span>
              {row.phone || 'No phone'}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {sub ? <StatusBadge compact value={sub} /> : null}
              <StatusBadge compact value={pay} />
              <StatusBadge compact value={row.todayPresence} />
              {unpaid ? (
                <a
                  href={row.paymentLinkUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-0.5 rounded-full bg-accent-soft px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em] text-accent"
                >
                  Pay
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              ) : null}
            </div>
          </div>
        </Link>
        <div className="flex shrink-0 flex-col gap-0.5">
          <IconBtn label="Edit" icon={Pencil} disabled={deleting} onClick={onEdit} />
          <IconBtn
            label={suspended ? 'Resume subscription' : 'Pause subscription'}
            icon={suspended ? Play : Pause}
            disabled={deleting || holding}
            onClick={onToggleStatus}
          />
          <IconBtn label="Delete" icon={Trash2} danger disabled={deleting} onClick={onDelete} />
        </div>
      </div>
    </article>
  );
}

function IconBtn({
  label,
  icon: Icon,
  onClick,
  danger,
  disabled,
}: {
  label: string;
  icon: typeof Pencil;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`tap grid h-7 w-7 place-items-center rounded-full disabled:opacity-40 ${
        danger ? 'text-bad hover:bg-bad-bg' : 'text-ink-soft hover:bg-[var(--hover-fill)]'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}
