// File: ./src/app/components/Graph/utils/types.tsx
// src/app/components/Graph/utils/types.ts
import { NodeProgress, NodeStatus } from "@/types/srs"; // Import SRS types

// Main types for API objects
export interface Definition {
  id: number;
  code: string;
  name: string;
  description: string | string[];
  notes?: string;
  references?: string[];
  prerequisites?: string[]; // codes of prerequisite definitions
  prerequisiteWeights?: Record<string, number>; // FIXED: weights for each prerequisite
  xPosition?: number;
  yPosition?: number;
  domainId?: number;
  type?: 'definition';
}

export interface Exercise {
  id: number;
  code: string;
  name: string;
  difficulty: string;
  statement: string;
  description: string;
  hints?: string;
  verifiable: boolean;
  result?: string;
  prerequisites?: string[]; // codes of prerequisite definitions
  prerequisiteWeights?: Record<string, number>; // FIXED: weights for each prerequisite
  xPosition?: number;
  yPosition?: number;
  domainId?: number;
  type?: 'exercise';
}

export interface GraphNode {
  id: string; // This is the node's 'code'
  name: string;
  type: 'definition' | 'exercise';
  isRootDefinition?: boolean;
  difficulty?: string; // For exercises
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
  xPosition?: number; // Initial position from backend
  yPosition?: number; // Initial position from backend

  // SRS additions
  status?: NodeStatus;
  isDue?: boolean;
  daysUntilReview?: number | null; // Allow null for consistency
  progress?: NodeProgress | null; // Allow null if no progress
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type?: string;
  weight?: number; // FIXED: weight for partial prerequisites (0.01 to 1.0)
}

export interface GraphData {
  definitions: Record<string, Definition>; // Keyed by definition CODE
  exercises: Record<string, Exercise>;   // Keyed by exercise CODE
}

// For filtering nodes
export type FilteredNodeType = 'all' | 'definition' | 'exercise';

// Mode types
export type AppMode = 'study' | 'practice';

// Feedback for exercise answers
export interface AnswerFeedback {
  correct: boolean;
  message: string;
}

export interface KnowledgeGraphProps {
  graphData: GraphData; // This will hold definitions and exercises by their codes
  subjectMatterId: string; // This is the domainId
  onBack: () => void;
  onPositionUpdate?: (positions: Record<string, { x: number; y: number }>) => void;
}

// Type definitions for ID conversion functions
export type GetDefinitionIdByCodeFn = (code: string) => Promise<number>;
export type GetExerciseIdByCodeFn = (code: string) => Promise<number>;


// FIXED: Interface for prerequisite with weight
export interface PrerequisiteWithWeight {
  code: string;
  name: string;
  numericId: number;
  weight: number; // 0.01 to 1.0, default 1.0
}

// Updated request interfaces
export interface DefinitionRequest {
  code: string;
  name: string;
  description: string;
  notes?: string;
  references?: string[];
  prerequisiteCodes?: string[];
  prerequisiteWeights?: Record<string, number>; // FIXED: weights for prerequisites
  domainId: number;
  xPosition?: number;
  yPosition?: number;
}

export interface ExerciseRequest {
  code: string;
  name: string;
  statement: string;
  description?: string;
  hints?: string;
  domainId: number;
  verifiable?: boolean;
  result?: string;
  difficulty?: string;
  prerequisiteCodes?: string[];
  prerequisiteWeights?: Record<string, number>; // FIXED: weights for prerequisites
  xPosition?: number;
  yPosition?: number;
}
