import { useEffect, useState } from 'react';
import { GymDataProvider } from '@/context/GymDataContext';
import { AppRoutes } from '@/routes/AppRoutes';
import { seedLocalDatabase } from '@/providers/database/LocalDatabase';
import { patchMainDeviceRecord } from '@/services/liveDevice';
import { runExpiryReminders } from '@/services/reminders';
import { hydrateSyncClock, startConnectionManager } from '@/services/sync';
import { GymBoot } from '@/components/GymBoot';
import { useAuthStore } from '@/store/authStore';
import { applyTheme, useThemeStore } from '@/store/themeStore';
import { ensureGymSettings } from '@/services/settings';

export function App() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const theme = useThemeStore((s) => s.theme);
  const primary = useThemeStore((s) => s.primary);
  const setPrimary = useThemeStore((s) => s.setPrimary);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    applyTheme(theme, primary);
  }, [theme, primary]);

  useEffect(() => {
    let stop = () => {};
    void (async () => {
      try {
        await seedLocalDatabase();
        const gym = await ensureGymSettings();
        if (gym?.primaryColor) setPrimary(gym.primaryColor);
        await patchMainDeviceRecord();
        await runExpiryReminders();
        hydrate();
        await hydrateSyncClock();
        stop = startConnectionManager();
        setReady(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to start local database');
      }
    })();
    return () => stop();
  }, [hydrate]);

  if (error) {
    return <div className="p-6 text-sm text-bad">{error}</div>;
  }
  if (!ready) {
    return (
      <GymBoot />
    );
  }
  return (
    <GymDataProvider>
      <AppRoutes />
    </GymDataProvider>
  );
}
