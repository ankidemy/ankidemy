// src/types/srs.ts
// SRS-specific types for the enhanced application

export type NodeStatus = 'fresh' | 'tackling' | 'grasped' | 'learned';
export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;
export type SessionType = 'definition' | 'exercise' | 'mixed';
export type DueView = 'full' | 'compact';

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
}

// Prerequisites relationship
export interface NodePrerequisite {
  id: number;
  nodeId: number;
  nodeType: 'definition' | 'exercise' | 'meta_definition' | 'meta_exercise';
  prerequisiteId: number;
  prerequisiteType: 'definition' | 'exercise' | 'meta_definition' | 'meta_exercise';
  weight: number; // 0.01 to 1.0
  isManual: boolean;
  createdAt: string;
}

// Study session tracking
export interface StudySession {
  id: number;
  userId: number;
  domainId: number;
  sessionType: SessionType;
  startTime: string;
  endTime?: string;
  totalReviews: number;
  successfulReviews: number;
  duration?: number; // in seconds
}

// Review submission
export interface ReviewRequest {
  nodeId: number;
  nodeType: 'meta_definition' | 'exercise';
  success: boolean;
  quality: ReviewQuality;
  timeTaken: number; // in seconds
  sessionId?: number;
  versionId?: number; // for meta-exercise and meta-definition reviews
}

// Credit flow for animations
export interface CreditUpdate {
  nodeId: number;
  nodeType: 'definition' | 'exercise';
  credit: number;
  type: 'explicit' | 'implicit';
}

// Review response from API
export interface ReviewResponse {
  success: boolean;
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

