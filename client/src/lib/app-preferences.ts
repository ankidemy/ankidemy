export type AppNotificationPreferences = {
  surveyQueueSoundEnabled?: boolean;
};

export type AppPreferences = {
  version: 1;
  notifications?: AppNotificationPreferences;
};

export type AppPreferencesPatch = {
  notifications?: AppNotificationPreferences;
};

const STORAGE_KEY = 'ankidemy:app-preferences:v1';

const DEFAULT_APP_PREFERENCES: AppPreferences = {
  version: 1,
  notifications: {
    surveyQueueSoundEnabled: true,
  },
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const mergePrefs = <T extends Record<string, any>>(base: T, patch: Partial<T>): T => {
  const next = { ...base };
  Object.entries(patch).forEach(([key, value]) => {
    if (value === undefined) return;
    if (isPlainObject(value) && isPlainObject((next as any)[key])) {
      (next as any)[key] = mergePrefs((next as any)[key], value);
    } else {
      (next as any)[key] = value;
    }
  });
  return next;
};

export const loadAppPreferences = (): AppPreferences => {
  if (typeof window === 'undefined') return DEFAULT_APP_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APP_PREFERENCES;
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) return DEFAULT_APP_PREFERENCES;
    return mergePrefs(DEFAULT_APP_PREFERENCES, parsed as Partial<AppPreferences>);
  } catch {
    return DEFAULT_APP_PREFERENCES;
  }
};

export const saveAppPreferences = (preferences: AppPreferences) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {}
};

export const updateAppPreferences = (patch: AppPreferencesPatch): AppPreferences => {
  const current = loadAppPreferences();
  const next = mergePrefs(current, patch);
  saveAppPreferences(next);
  return next;
};

export const isSurveyQueueSoundEnabled = (): boolean =>
  loadAppPreferences().notifications?.surveyQueueSoundEnabled !== false;
