import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/Button';
import { useRefreshCloud } from '@/hooks/useGymQueries';
import { useUiStore } from '@/store/uiStore';

export function RefreshButton({
  label = 'Refresh',
  size = 'md',
}: {
  label?: string;
  size?: 'sm' | 'md';
}) {
  const { refresh, busy } = useRefreshCloud();
  const toast = useUiStore((s) => s.pushToast);

  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      loading={busy}
      onClick={() => {
        void refresh()
          .then(() => toast({ kind: 'success', title: 'Updated' }))
          .catch((err: unknown) =>
            toast({ kind: 'error', title: err instanceof Error ? err.message : 'Refresh failed' }),
          );
      }}
    >
      {busy ? null : <RefreshCw className="h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}
