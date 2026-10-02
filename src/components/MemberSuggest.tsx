import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { TextInput } from '@/components/Field';
import type { MemberRow } from '@/services/members';

function haystack(member: MemberRow) {
  return `${member.name} ${member.phone} ${member.email} ${member.memberCode}`.toLowerCase();
}

export function MemberSuggest({
  members,
  query,
  selectedId,
  onQuery,
  onPick,
}: {
  members: MemberRow[];
  query: string;
  selectedId: string;
  onQuery: (value: string) => void;
  onPick: (member: MemberRow) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? members.filter((member) => haystack(member).includes(q))
      : members;
    return rows.slice(0, 8);
  }, [members, query]);

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    setActive(0);
  }, [query]);

  return (
    <div ref={box} className="relative">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
        <TextInput
          value={query}
          placeholder="Name, phone, or email"
          autoComplete="off"
          className="pl-9"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((n) => Math.min(n + 1, Math.max(hits.length - 1, 0)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((n) => Math.max(n - 1, 0));
            } else if (e.key === 'Enter' && open && hits[active]) {
              e.preventDefault();
              onPick(hits[active]);
              setOpen(false);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
      </label>
      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-[var(--panel)] py-1 shadow-lg">
          {hits.length ? hits.map((member, i) => (
            <button
              key={member.id}
              type="button"
              className={`flex w-full flex-col px-3 py-2 text-left ${i === active || member.id === selectedId ? 'bg-accent-soft' : 'hover:bg-[var(--hover-fill)]'}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                onPick(member);
                setOpen(false);
              }}
            >
              <span className="text-[13px] font-semibold text-ink">{member.name}</span>
              <span className="text-[11px] text-ink-soft">
                {[member.phone, member.email].filter(Boolean).join(' · ') || 'No phone or email'}
              </span>
            </button>
          )) : (
            <div className="px-3 py-2 text-[13px] text-ink-soft">No member matches that search.</div>
          )}
        </div>
      )}
    </div>
  );
}
