export const calculateDaysUntilReview = (nextReview?: string | null): number | null => {
  if (!nextReview) return null;
  const now = Date.now();
  const then = Date.parse(nextReview);
  if (!Number.isFinite(then)) return null;
  return Math.ceil((then - now) / (1000 * 60 * 60 * 24));
};

export const getStatusColor = (status: string): string => {
  if (status === 'learned') return '#10b981';
  if (status === 'grasped') return '#3b82f6';
  if (status === 'tackling') return '#ef4444';
  return '#9ca3af';
};

export const getExerciseSolveColor = (state: 'unsolved' | 'tried' | 'solved'): string => {
  if (state === 'solved') return '#10B981';
  if (state === 'tried') return '#F59E0B';
  return '#94A3B8';
};

export const isNodeDue = (nextReview?: string | null): boolean => {
  if (!nextReview) return false;
  const ts = Date.parse(nextReview);
  if (!Number.isFinite(ts)) return false;
  return ts <= Date.now();
};
