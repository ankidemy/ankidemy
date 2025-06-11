// src/app/components/Graph/utils/types.ts

// Main types for API objects
export interface Definition {
  id: number;
  code: string;
  name: string;
  description: string | string[];
  notes?: string;
  references?: string[];
  prerequisites?: string[];
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
  prerequisites?: string[];
  xPosition?: number;
  yPosition?: number;
  domainId?: number;
  type?: 'exercise';
}

export interface GraphNode {
  id: string;
  name: string;
  type: 'definition' | 'exercise';
  isRootDefinition?: boolean;
  difficulty?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
  xPosition?: number;
  yPosition?: number;
  domainId?: number;
  prerequisites?: string[];
}

export interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type?: string;
}

export interface GraphData {
  definitions: Record<string, Definition>;
  exercises: Record<string, Exercise>;
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
  graphData: GraphData;
  subjectMatterId: string;
  onBack: () => void;
  onPositionUpdate?: (positions: Record<string, { x: number; y: number }>) => void;
}

// Type definitions for ID conversion functions
export type GetDefinitionIdByCodeFn = (code: string) => Promise<number>;
export type GetExerciseIdByCodeFn = (code: string) => Promise<number>;
