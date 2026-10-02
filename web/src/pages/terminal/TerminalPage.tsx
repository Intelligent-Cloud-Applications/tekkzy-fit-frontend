import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { cn } from '@/lib/cn';
import type { LiveUser } from '@/services/liveDevice';
import { HomePanel } from './HomePanel';
import { AddUserPanel } from './AddUserPanel';
import { UsersPanel } from './UsersPanel';
import { ScheduleHub } from './SchedulePanels';
import { LogsHub } from './LogsPanels';
import { SetupHub } from './SetupPanels';

const tabs = [
  { id: 'status', label: 'Status' },
  { id: 'people', label: 'People' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'logs', label: 'Logs' },
  { id: 'setup', label: 'Setup' },
] as const;

type TabId = (typeof tabs)[number]['id'];

function isTab(value: string | null): value is TabId {
  return tabs.some((tab) => tab.id === value);
}

export function ChipTabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: ReadonlyArray<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="-mx-4 mb-4 overflow-x-auto px-4 no-scrollbar lg:mx-0 lg:overflow-visible lg:px-0">
      <div className="flex w-max min-w-full rounded-2xl border border-line bg-panel p-1 lg:w-full">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              'tap min-w-[4.5rem] flex-1 rounded-xl px-3 py-2 text-center text-[12px] font-semibold',
              value === item.id ? 'bg-accent text-white' : 'text-ink-soft hover:bg-[var(--hover-fill)] hover:text-ink',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TerminalPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: TabId = isTab(requested) ? requested : 'status';
  const [editUser, setEditUser] = useState<LiveUser | null | undefined>(undefined);

  function setTab(next: TabId) {
    setEditUser(undefined);
    const nextParams = new URLSearchParams(params);
    if (next === 'status') nextParams.delete('tab');
    else nextParams.set('tab', next);
    setParams(nextParams, { replace: true });
  }

  return (
    <div className="flex w-full flex-col lg:min-h-full lg:flex-1">
      <PageHeader title="Terminal" description="The face device at the door. Open it, add people, or check who scanned." />
      <ChipTabs items={tabs} value={tab} onChange={setTab} />
      {tab === 'status' ? <HomePanel /> : null}
      {tab === 'people' ? (
        editUser !== undefined ? (
          <AddUserPanel
            key={editUser?.id ?? 'new'}
            seed={editUser}
            onCancel={() => setEditUser(undefined)}
            onSaved={() => setEditUser(undefined)}
          />
        ) : (
          <UsersPanel
            onAdd={(user) => setEditUser(user ?? null)}
          />
        )
      ) : null}
      {tab === 'schedule' ? <ScheduleHub /> : null}
      {tab === 'logs' ? <LogsHub /> : null}
      {tab === 'setup' ? <SetupHub /> : null}
    </div>
  );
}
