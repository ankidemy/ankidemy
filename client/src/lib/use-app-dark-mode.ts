"use client";

import { useEffect, useState } from 'react';
import {
  APP_PREFERENCES_STORAGE_KEY,
  APP_PREFERENCES_UPDATED_EVENT,
  isAppDarkModeEnabled,
} from '@/lib/app-preferences';

export const useAppDarkMode = (): boolean => {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => isAppDarkModeEnabled());

  useEffect(() => {
    const sync = () => {
      setIsDarkMode(isAppDarkModeEnabled());
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== APP_PREFERENCES_STORAGE_KEY) return;
      sync();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(APP_PREFERENCES_UPDATED_EVENT, sync);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(APP_PREFERENCES_UPDATED_EVENT, sync);
    };
  }, []);

  return isDarkMode;
};

