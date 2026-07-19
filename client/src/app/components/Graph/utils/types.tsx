// File: ./src/app/components/Graph/utils/types.tsx
// src/app/components/Graph/utils/types.ts
import { NodeProgress, NodeStatus } from "@/types/srs"; // Import SRS types

// Main types for API objects
export interface Definition {
  // Numeric database id may be absent in export payloads; treat as optional
  id?: number;
  code: string;
  name: string;
  description: string | string[];
  notes?: string;
  promptImagePath?: string;
  descriptionImagePath?: string;
  references?: string[];
  prerequisites?: string[]; // codes of prerequisite definitions
  prerequisiteWeights?: Record<string, number>; // FIXED: weights for each prerequisite
  xPosition?: number;
  yPosition?: number;
  domainId?: number;
  type?: 'definition';
}

// NEW: MetaDefinition types for versioned concepts
export interface MetaDefinitionPreview {
  id: number;
  code: string;
  name: string;
  domainId: number;
  xPosition?: number;
  yPosition?: number;
  prerequisites?: string[];
  prerequisiteWeights?: Record<string, number>;
  versionCount: number;
}

export interface DefinitionVersionPreview {
  id: number;
  prompt: string;
  type: string;
  description?: string;
  notes?: string;
  references?: string[];
  promptImagePath?: string;
  descriptionImagePath?: string;
}

export interface Exercise {
  // Numeric database id may be absent in export payloads; treat as optional
  id?: number;
  code: string;
  name: string;
  // Difficulty is sometimes omitted in export payloads
  difficulty?: number;
  statement: string;
  // Some payloads omit description for exercises
  description?: string;
  statementImagePath?: string;
  descriptionImagePath?: string;
  // Optional metadata fields sometimes present in payloads
  notes?: string;
  hints?: string;
  // Backend may omit verifiable flag in exports
  verifiable?: boolean;
  result?: string;
  prerequisites?: string[]; // codes of prerequisite definitions
  prerequisiteWeights?: Record<string, number>; // FIXED: weights for each prerequisite
  xPosition?: number;
  yPosition?: number;
  domainId?: number;
  type?: 'exercise';
}

export interface SourceNode {
  id?: number;
  code: string;
  title: string;
  contentMd?: string;
  bibtexKey?: string | null;
  filePath?: string | null;
  xPosition?: number;
  yPosition?: number;
  domainId?: number;
  ownerId?: number;
  visibility?: 'private' | 'domain';
  type?: 'source';
}

export interface QuestVersion {
  id?: number;
  questId?: number;
  title: string;
  descriptionMd?: string;
  taskList?: any;
  imagePath?: string | null;
}

export interface Quest {
  id?: number;
  code: string;
  name?: string;
  kind: 'todo' | 'habit' | 'daily';
  schedule: any;
  xPosition?: number;
  yPosition?: number;
  domainId?: number;
  ownerId?: number;
  visibility?: 'private' | 'domain';
  active?: boolean;
  nextDueAt?: string | null;
  versions?: QuestVersion[];
  type?: 'quest';
}

export interface NodeRelation {
  id?: number;
  domainId?: number;
  fromType: 'definition' | 'exercise' | 'source' | 'quest';
  fromId: number;
  toType: 'definition' | 'exercise' | 'source' | 'quest';
  toId: number;
  relationType: string;
  contextKey?: string;
  createdBy?: number;
}

export interface GraphNode {
  id: string; // This is the node's 'code'
  displayId?: string;
  name: string;
  type: 'definition' | 'exercise' | 'source' | 'quest' | 'group';
  isRootDefinition?: boolean;
  difficulty?: number; // For exercises
  color?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
  // Initial position from backend (HEAD)
  xPosition?: number; 
  yPosition?: number; 

  // SRS additions (HEAD)
  status?: NodeStatus;
  isDue?: boolean;
  daysUntilReview?: number | null; // Allow null for consistency
  progress?: NodeProgress | null; // Allow null if no progress
  
  // Working graph properties (a02e2d1)
  domainId?: number;
  prerequisites?: string[];

  // External link metadata
  isExternal?: boolean;
  externalStatus?: 'ok' | 'missing_domain' | 'missing_node' | 'no_access';
  externalDomainId?: number;
  externalDomainUid?: string;
  externalNodeId?: number;
  externalNodeType?: 'definition' | 'exercise';
  externalDomainName?: string;
  externalNodeName?: string;

  // Group metadata (for collapsed nodes)
  groupId?: number;
  groupMemberIds?: string[];
  groupMemberCount?: number;
  groupIsExact?: boolean;
}

export interface GraphLink {
  id?: string;
  source: string | GraphNode;
  target: string | GraphNode;
  type?: string;
  relationType?: string;
  weight?: number; // FIXED: weight for partial prerequisites (0.01 to 1.0)
}

export interface GraphData {
  definitions: Record<string, Definition>; // Keyed by definition CODE
  exercises: Record<string, Exercise>;   // Keyed by exercise CODE
  sources?: Record<string, SourceNode>;
  quests?: Record<string, Quest>;
  relations?: Array<{ fromCode: string; toCode: string; relationType?: string }>;
}

// For filtering nodes
export type FilteredNodeType = 'all' | 'definition' | 'exercise' | 'source' | 'quest' | 'group';

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
  isContentManaged?: boolean;
  livePresenceCode?: string | null;
  liveContentUpdate?: {
    revision?: string;
    changes?: Array<{
      sourceId: string;
      nodeType: 'definition' | 'exercise' | 'source' | 'quest';
      nodeId: number;
      code?: string;
      state: 'active' | 'missing';
      previousNodeType?: 'definition' | 'exercise' | 'source' | 'quest';
      previousNodeId?: number;
    }>;
  } | null;
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
  promptImagePath?: string;
  descriptionImagePath?: string;
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
  statementImagePath?: string;
  descriptionImagePath?: string;
  domainId: number;
  verifiable?: boolean;
  result?: string;
  difficulty?: number;
  prerequisiteCodes?: string[];
  prerequisiteWeights?: Record<string, number>; // FIXED: weights for prerequisites
  xPosition?: number;
  yPosition?: number;
}
