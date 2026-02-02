// Local UI preferences for the explorer/graph view.

export type ExplorerToolbarPreferences = {
  displayMode?: 'compact' | 'descriptive';
  position?: { x: number; y: number };
  expandedSections?: Record<string, boolean>;
};

export type ExplorerDagPreferences = {
  enabled?: boolean;
  orientation?: 'td' | 'bu' | 'lr' | 'rl' | 'radialout' | 'radialin';
};

export type ExplorerLabelPreferences = {
  /**
   * Label background rendering mode.
   * - off: no label background image
   * - behind_links: background drawn behind links (links overlay)
   * - behind_text: background drawn above links but behind text (classic/legacy)
   */
  backgroundMode?: 'off' | 'behind_links' | 'behind_text';
  /**
   * Legacy boolean (pre-3-state toggle). Kept for backwards compatibility with
   * older stored preferences.
   */
  backgroundEnabled?: boolean;
};

export type ExplorerUIPreferences = {
  version: 1;
  toolbar?: ExplorerToolbarPreferences;
  dag?: ExplorerDagPreferences;
  labels?: ExplorerLabelPreferences;
};

export type ExplorerUIPreferencesPatch = {
  toolbar?: ExplorerToolbarPreferences;
  dag?: ExplorerDagPreferences;
  labels?: ExplorerLabelPreferences;
};

const STORAGE_PREFIX = 'ankidemy:explorer-ui:v1';

const buildKey = (domainId: number | string) => `${STORAGE_PREFIX}:${domainId}`;

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

export const loadExplorerUIPreferences = (domainId: number | string): ExplorerUIPreferences | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(buildKey(domainId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) return null;
    return mergePrefs({ version: 1 } as ExplorerUIPreferences, parsed as Partial<ExplorerUIPreferences>);
  } catch {
    return null;
  }
};

export const saveExplorerUIPreferences = (domainId: number | string, prefs: ExplorerUIPreferences) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(buildKey(domainId), JSON.stringify(prefs));
  } catch {}
};

export const updateExplorerUIPreferences = (
  domainId: number | string,
  patch: ExplorerUIPreferencesPatch
): ExplorerUIPreferences | null => {
  if (typeof window === 'undefined') return null;
  const current = loadExplorerUIPreferences(domainId) ?? { version: 1 };
  const next = mergePrefs(current, patch);
  saveExplorerUIPreferences(domainId, next);
  return next;
};
