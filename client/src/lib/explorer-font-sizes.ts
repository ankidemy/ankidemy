import type { AppPreferences } from '@/lib/app-preferences';
import { loadAppPreferences, updateAppPreferences } from '@/lib/app-preferences';

export type ExplorerFontSizeCategory = 'tags' | 'markdown' | 'ui' | 'toolbar';

export type ExplorerFontSizeSteps = {
  tags: number;
  markdown: number;
  ui: number;
  toolbar: number;
};

const FONT_SCALE_STEP = 0.08;
const FONT_STEP_MIN = -4;
const FONT_STEP_MAX = 8;

const DEFAULT_EXPLORER_FONT_SIZE_STEPS: ExplorerFontSizeSteps = {
  tags: 0,
  markdown: 0,
  ui: 0,
  toolbar: 0,
};

const clampStep = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const rounded = Math.round(parsed);
  return Math.min(FONT_STEP_MAX, Math.max(FONT_STEP_MIN, rounded));
};

export const normalizeExplorerFontSizeSteps = (
  input?: Partial<ExplorerFontSizeSteps> | null
): ExplorerFontSizeSteps => ({
  tags: clampStep(input?.tags),
  markdown: clampStep(input?.markdown),
  ui: clampStep(input?.ui),
  toolbar: clampStep(input?.toolbar),
});

export const getExplorerFontSizeSteps = (preferences?: AppPreferences): ExplorerFontSizeSteps =>
  normalizeExplorerFontSizeSteps(
    preferences?.general?.explorerFontSizeSteps ?? loadAppPreferences().general?.explorerFontSizeSteps
  );

export const updateExplorerFontSizeSteps = (patch: Partial<ExplorerFontSizeSteps>): ExplorerFontSizeSteps => {
  const current = getExplorerFontSizeSteps();
  const next = normalizeExplorerFontSizeSteps({
    ...current,
    ...patch,
  });
  updateAppPreferences({
    general: {
      explorerFontSizeSteps: next,
    },
  });
  return next;
};

export const adjustExplorerFontSizeStep = (
  category: ExplorerFontSizeCategory,
  delta: number
): ExplorerFontSizeSteps => {
  const current = getExplorerFontSizeSteps();
  const nextValue = clampStep(current[category] + delta);
  return updateExplorerFontSizeSteps({ [category]: nextValue });
};

export const explorerFontSizeStepToScale = (step: number): number => {
  const normalized = clampStep(step);
  const scale = 1 + normalized * FONT_SCALE_STEP;
  return Math.max(0.5, Math.min(2, scale));
};

export const explorerFontSizeCssVariables = (steps: ExplorerFontSizeSteps): Record<string, string> => ({
  '--kg-font-scale-tags': `${explorerFontSizeStepToScale(steps.tags)}`,
  '--kg-font-scale-markdown': `${explorerFontSizeStepToScale(steps.markdown)}`,
  '--kg-font-scale-ui': `${explorerFontSizeStepToScale(steps.ui)}`,
  '--kg-font-scale-toolbar': `${explorerFontSizeStepToScale(steps.toolbar)}`,
});

export const formatExplorerFontSizeStep = (step: number): string => {
  const normalized = clampStep(step);
  if (normalized === 0) return 'Default';
  return normalized > 0 ? `+${normalized}` : `${normalized}`;
};

export const EXPLORER_FONT_SIZE_DEFAULTS = DEFAULT_EXPLORER_FONT_SIZE_STEPS;
