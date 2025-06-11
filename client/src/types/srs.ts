// src/types/srs.ts
// SRS-specific types for the enhanced application

export type NodeStatus = 'fresh' | 'tackling' | 'grasped' | 'learned';
export type ReviewQuality = 0 | 1 | 2 | 3 | 4 | 5;
export type SessionType = 'definition' | 'exercise' | 'mixed';

// Progress tracking for individual nodes
export interface NodeProgress {
  id: number;
  userId: number;
  nodeId: number;
  nodeType: 'definition' | 'exercise';
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
}

// Prerequisites relationship
export interface NodePrerequisite {
  id: number;
  nodeId: number;
  nodeType: 'definition' | 'exercise';
  prerequisiteId: number;
  prerequisiteType: 'definition' | 'exercise';
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
  nodeType: 'definition' | 'exercise';
  success: boolean;
  quality: ReviewQuality;
  timeTaken: number; // in seconds
  sessionId?: number;
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

// Enhanced definition with SRS data
export interface DefinitionWithSRS extends Definition {
  progress?: NodeProgress;
  prerequisites?: number[];
  dependents?: number[];
  isDue: boolean;
  daysUntilReview?: number;
}

// Enhanced exercise with SRS data
export interface ExerciseWithSRS extends Exercise {
  progress?: NodeProgress;
  prerequisites?: number[];
  dependents?: number[];
  isDue: boolean;
  daysUntilReview?: number;
}

// Union type for nodes with SRS
export type NodeWithSRS = DefinitionWithSRS | ExerciseWithSRS;

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

// Study mode statistics
export interface StudyModeStats {
  definitions: number;
  exercises: number;
  mixed: number;
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

// Optimal review order item
export interface OptimalReviewItem {
  nodeId: number;
  nodeType: 'definition' | 'exercise';
  nodeCode: string;
  nodeName: string;
  impact: number;
  distanceFromRoot: number;
}
