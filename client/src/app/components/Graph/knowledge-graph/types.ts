import type { DefinitionVersion, ExerciseVersion, ExternalPrerequisiteLink } from '@/lib/api';
import type { NodeStatus } from '../../../../types/srs';

export interface GraphNodeCore {
  id: string;
  type: 'definition' | 'exercise' | 'source' | 'quest' | 'group';
  prerequisites?: string[];
  domainId?: number;
  xPosition?: number;
  yPosition?: number;
  isExternal?: boolean;
  externalStatus?: ExternalPrerequisiteLink['status'];
  externalDomainId?: number;
  externalDomainUid?: string;
  externalNodeId?: number;
  externalNodeType?: 'meta_definition' | 'meta_exercise';
  groupId?: number;
  groupMemberIds?: string[];
  groupMemberCount?: number;
  groupIsExact?: boolean;
}

export interface GraphLinkCore {
  id: string;
  source: string;
  target: string;
  type: string;
  weight: number;
  relationType?: string;
}

export interface GraphStructureState {
  nodes: Map<string, GraphNodeCore>;
  links: Map<string, GraphLinkCore>;
  version: number;
  lastStructuralChange: number;
}

export interface NodeMetadata {
  name: string;
  displayId?: string;
  isRootDefinition?: boolean;
  difficulty?: number;
  status?: NodeStatus;
  isDue?: boolean;
  daysUntilReview?: number | null;
  progress?: any;
  color?: string;
  isExternal?: boolean;
  externalStatus?: ExternalPrerequisiteLink['status'];
  externalDomainId?: number;
  externalDomainUid?: string;
  externalNodeId?: number;
  externalNodeType?: 'meta_definition' | 'meta_exercise';
  externalDomainName?: string;
  externalNodeName?: string;
  groupId?: number;
  groupMemberIds?: string[];
  groupMemberCount?: number;
  groupIsExact?: boolean;
}

export interface LinkMetadata {
  color?: string;
  opacity?: number;
  isHighlighted?: boolean;
}

export interface GraphMetadataState {
  nodeMetadata: Map<string, NodeMetadata>;
  linkMetadata: Map<string, LinkMetadata>;
  version: number;
  lastMetadataChange: number;
}

export type CycleGroup = {
  id: string;
  members: Set<string>;
};

export type FrenzyEditTool = 'none' | 'link' | 'unlink' | 'delete';

export interface FrenzyNoteState {
  nodeId: string;
  nodeType: 'definition' | 'exercise' | 'source';
  nodeName: string;
  metaId: number;
  version: DefinitionVersion | ExerciseVersion;
  allVersions: (DefinitionVersion | ExerciseVersion)[];
  versionIndex: number;
  prompt: string;
  defaultPrompt: string;
  isAutoPrompt: boolean;
  promptImagePath: string;
  content: string;
  defaultContent: string;
  isAutoContent: boolean;
  contentImagePath: string;
  solution: string;
  solutionImagePath: string;
}

export interface FrenzyQuestNoteState {
  nodeId: string;
  questId: number;
  nodeName: string;
  kind: 'todo' | 'habit' | 'daily';
  visibility: 'private' | 'domain';
  active: boolean;
  schedule: unknown;
}

export interface FrenzyDeletedNodeSnapshot {
  nodeType: 'definition' | 'exercise';
  code: string;
  name: string;
  xPosition?: number;
  yPosition?: number;
  prerequisites: string[];
  prerequisiteWeights: Record<string, number>;
  versions: DefinitionVersion[] | ExerciseVersion[];
  incoming: Array<{ code: string; type: 'definition' | 'exercise'; weight: number }>;
}

export interface ExternalNodeLookupEntry {
  id: string;
  name: string;
  displayId?: string;
  type: 'definition' | 'exercise';
  status: ExternalPrerequisiteLink['status'];
  externalDomainId?: number;
  externalDomainUid?: string;
  externalNodeId?: number;
  externalNodeType?: 'meta_definition' | 'meta_exercise';
  externalDomainName?: string;
  externalNodeName?: string;
}

export interface GraphAdjacency {
  outgoing: Map<string, Set<string>>;
  incoming: Map<string, Set<string>>;
}

export interface GroupSummary {
  id: number;
  name: string;
  collapsed: boolean;
  isExact: boolean;
  memberCount: number;
}
