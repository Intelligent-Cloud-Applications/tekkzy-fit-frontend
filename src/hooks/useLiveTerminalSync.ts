import { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';
import { useGymData } from '@/context/GymDataContext';
import { wakeGymPcHelper } from '@/services/api';
import { startLiveTerminalSync } from '@/services/liveDevice';

export function useLiveTerminalSync() {
  const user = useAuthStore((s) => s.user);
  const { refresh, reloadMembers } = useGymData();

  useEffect(() => {
    if (!user) return undefined;
    wakeGymPcHelper();
    const onFirstClick = () => wakeGymPcHelper();
    window.addEventListener('pointerdown', onFirstClick, { once: true });
    const stop = startLiveTerminalSync((changed) => {
      if (!changed) return;
      void reloadMembers();
      void refresh({ slices: ['attendance', 'events'], quiet: true });
    });
    return () => {
      window.removeEventListener('pointerdown', onFirstClick);
      stop();
    };
  }, [user, refresh, reloadMembers]);
}
