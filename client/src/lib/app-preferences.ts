export type AppNotificationPreferences = {
  surveyQueueSoundEnabled?: boolean;
  dueReviewBatchSoundEnabled?: boolean;
  dueReviewBatchSize?: number;
};

export type AppGeneralPreferences = {
  timezone?: string;
};

export type AppPreferences = {
  version: 1;
  notifications?: AppNotificationPreferences;
  general?: AppGeneralPreferences;
};

export type AppPreferencesPatch = {
  notifications?: AppNotificationPreferences;
  general?: AppGeneralPreferences;
};

const STORAGE_KEY = 'ankidemy:app-preferences:v1';
const DEFAULT_DUE_REVIEW_BATCH_SIZE = 10;

const DEFAULT_APP_PREFERENCES: AppPreferences = {
  version: 1,
  notifications: {
    surveyQueueSoundEnabled: true,
    dueReviewBatchSoundEnabled: true,
    dueReviewBatchSize: DEFAULT_DUE_REVIEW_BATCH_SIZE,
  },
  general: {},
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

export const isDueReviewBatchSoundEnabled = (): boolean =>
  loadAppPreferences().notifications?.dueReviewBatchSoundEnabled !== false;

const normalizeDueReviewBatchSize = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_DUE_REVIEW_BATCH_SIZE;
  const normalized = Math.floor(parsed);
  if (normalized < 1) return DEFAULT_DUE_REVIEW_BATCH_SIZE;
  return normalized;
};

export const getDueReviewBatchSize = (): number =>
  normalizeDueReviewBatchSize(loadAppPreferences().notifications?.dueReviewBatchSize);

export const getBrowserTimeZone = (): string => {
  if (typeof window === 'undefined') return 'UTC';
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export const isValidTimeZone = (value: string): boolean => {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};

export const getSupportedTimeZones = (): string[] => {
  try {
    const intlWithSupportedValues = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    const supported = intlWithSupportedValues.supportedValuesOf?.('timeZone');
    if (Array.isArray(supported) && supported.length > 0) return supported;
  } catch {}
  return [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Phoenix',
    'America/Mexico_City',
    'America/Sao_Paulo',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Europe/Madrid',
    'Europe/Rome',
    'Europe/Amsterdam',
    'Africa/Johannesburg',
    'Asia/Dubai',
    'Asia/Kolkata',
    'Asia/Singapore',
    'Asia/Shanghai',
    'Asia/Tokyo',
    'Asia/Seoul',
    'Australia/Sydney',
    'Pacific/Auckland',
  ];
};

export const getAppTimeZone = (): string => {
  const preferred = (loadAppPreferences().general?.timezone || '').trim();
  if (isValidTimeZone(preferred)) return preferred;
  return getBrowserTimeZone();
};
