import { useCallback, useEffect, useState } from 'react';

import {
  getUserSettings,
  saveUserSettings,
  subscribeUserSettings,
  type UserSettings,
} from '@src/storage/userSettings';

interface UseUserSettings {
  settings: UserSettings | null;
  loading: boolean;
  save: (next: UserSettings) => Promise<void>;
  reload: () => Promise<void>;
}

export function useUserSettings(): UseUserSettings {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const s = await getUserSettings();
    setSettings(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
    return subscribeUserSettings((next) => setSettings(next));
  }, [reload]);

  const save = useCallback(async (next: UserSettings) => {
    await saveUserSettings(next);
    setSettings(next);
  }, []);

  return { settings, loading, save, reload };
}
