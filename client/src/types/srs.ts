// src/types/srs.ts
// SRS-specific types for the enhanced application

export type NodeStatus = 'fresh' | 'tackling' | 'grasped' | 'learned';
export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;
export type SessionType = 'definition' | 'exercise' | 'mixed';
export type SessionMode = 'normal' | 'frenzy';
export type SessionOrder = 'impact' | 'foundations';
export type DueView = 'full' | 'compact';
// Exercise solve state derived from solvedUntil/seenCount for UI coloring.
export type ExerciseSolveState = 'unsolved' | 'tried' | 'solved';

// Progress tracking for individual nodes
export interface NodeProgress {
  id: number;
  userId: number;
  nodeId: number;
  nodeType: 'definition' | 'exercise';
  nodeCode?: string;
  nodeName?: string;
  status: NodeStatus;
  easinessFactor: number;
  intervalDays: number;
  repetitions: number;
  lastReview?: string;
  nextReview?: string;
  accumulatedCredit: number;
  creditPostponed: boolean;
  totalReviews: number;
  successfulReviews: number;
  createdAt: string;
  updatedAt: string;
  // Derived fields used in UI — optional
  isDue?: boolean;
  daysUntilReview?: number | null;
  // Exercise-only solve tracking (solved while solvedUntil is in the future)
  solvedUntil?: string | null;
  seenCount?: number;
}

// Prerequisites relationship
export interface NodePrerequisite {
  id: number;
  nodeId: number;
  nodeType: 'definition' | 'exercise';
  prerequisiteId: number;
  prerequisiteType: 'definition' | 'exercise';
  weight: number; // 0.01 to 1.0
  createdAt: string;
}

// Study session tracking
export interface StudySession {
  id: number;
  userId: number;
  domainId: number;
  sessionType: SessionType;
  mode?: SessionMode;
  startTime: string;
  endTime?: string;
  totalReviews: number;
  successfulReviews: number;
  duration?: number; // in seconds
}

// Review submission. Success is derived server-side (quality >= 3).
export interface ReviewRequest {
  nodeId: number;
  nodeType: 'definition' | 'exercise';
  quality: ReviewQuality;
  timeTaken: number; // in seconds
  sessionId?: number;
  versionId?: number; // concrete version shown during the review
}

// Credit flow for animations
export interface CreditUpdate {
  nodeId: number;
  nodeType: 'definition' | 'exercise';
  credit: number;
  type: 'explicit' | 'implicit';
}

// Review response from API. counted=false means the node was not due and the
// grade was recorded as practice only (no SRS state changes).
export interface ReviewResponse {
  success: boolean;
  counted: boolean;
  message: string;
  updatedNodes?: NodeProgress[];
  creditFlow?: CreditUpdate[];
}

// Domain statistics
export interface DomainStats {
  domainId: number;
  totalNodes: number;
  freshNodes: number;
  tacklingNodes: number;
  graspedNodes: number;
  learnedNodes: number;
  dueReviews: number;
  completedToday: number;
  successRate: number;
}

export interface NotificationSummaryDomain {
  domainId: number;
  domainName: string;
  dueCount: number;
}

export interface NotificationSummaryInvite {
  id: number;
  domainId: number;
  domainName: string;
  invitedBy: number;
  invitedByUsername: string;
  role: 'editor' | 'viewer';
  createdAt: string;
}

export interface NotificationSummary {
  domains: NotificationSummaryDomain[];
  invites: NotificationSummaryInvite[];
  totalDue: number;
  inviteCount: number;
  generatedAt: string;
}

// Due review item
export interface DueReview {
  nodeId: number;
  nodeType: 'definition' | 'exercise';
  nodeCode: string;
  nodeName: string;
  status: NodeStatus;
  nextReview?: string;
  isDue: boolean;
  daysUntilReview?: number;
}

// Review queue item for practice/mixed sessions
export interface ReviewQueueItem {
  nodeId: number;
  nodeType: 'definition' | 'exercise';
  nodeCode: string;
  nodeName: string;
  isDue: boolean;
  exerciseMetaId?: number;
  exerciseMetaCode?: string;
  exerciseMetaName?: string;
}

// Review history item
export interface ReviewHistoryItem {
  id: number;
  userId: number;
  nodeId: number;
  nodeType: 'definition' | 'exercise';
  reviewTime: string;
  reviewType: 'explicit' | 'implicit';
  success: boolean;
  quality: ReviewQuality;
  timeTaken: number;
  creditApplied: number;
  easinessFactorBefore?: number;
  easinessFactorAfter?: number;
  intervalBefore?: number;
  intervalAfter?: number;
}

// UI state for animations
export interface CreditFlowAnimation {
  nodeId: string;
  credit: number;
  type: 'positive' | 'negative';
  timestamp: number;
}


// ==========================================================================
// Server-driven session engine
// ==========================================================================

export interface SessionStartRequest {
  domainId: number;
  sessionType: SessionType;
  mode?: SessionMode;
  order?: SessionOrder;
  exercisesPerDefinition?: number;
}

export interface SessionEngineItem {
  done: boolean;
  round: number;
  completed: number;
  correct: number;
  remaining: number;
  totalPlanned: number;
  item?: ReviewQueueItem;
  definitionVersion?: any;
  exerciseVersion?: any;
  lastReview?: ReviewResponse;
}

export interface SessionEngineState {
  session: StudySession;
  item: SessionEngineItem;
}

export interface SessionGradeRequest {
  quality: ReviewQuality;
  skip?: boolean;
  timeTaken?: number;
}

export function exerciseSolveState(progress: Pick<NodeProgress, 'solvedUntil' | 'seenCount'> | null | undefined): ExerciseSolveState {
  if (!progress) return 'unsolved';
  if (progress.solvedUntil && new Date(progress.solvedUntil).getTime() > Date.now()) {
    return 'solved';
  }
  if ((progress.seenCount ?? 0) > 0) {
    return 'tried';
  }
  return 'unsolved';
}
