export interface ExternalPrerequisiteLink {
  id: number;
  domainId: number;
  nodeId: number;
  nodeType: 'definition' | 'exercise';
  externalDomainUid: string;
  externalDomainId?: number;
  externalDomainName?: string;
  externalNodeId: number;
  externalNodeType: 'definition' | 'exercise';
  externalNodeCode?: string;
  externalNodeName?: string;
  xPosition?: number;
  yPosition?: number;
  status: 'ok' | 'missing_domain' | 'missing_node' | 'no_access';
}

export interface Exercise {
  id: number;
  code: string;
  name: string;
  statement: string;
  description?: string;
  difficulty?: number;
  prerequisites?: string[];
  prerequisiteWeights?: Record<string, number>;
}

export interface GroupNodeRef {
  nodeId: number;
  nodeType: 'definition' | 'exercise';
  nodeCode: string;
  nodeName: string;
}

export interface GroupData {
  id: number;
  domainId: number;
  name: string;
  isExact: boolean;
  xPosition?: number;
  yPosition?: number;
  seeds: GroupNodeRef[];
  members?: GroupNodeRef[];
  collapsed?: boolean;
}

export interface DefinitionVersion {
  id: number;
  metaDefinitionId: number;
  code: string;
  name: string;
  prompt: string;
  type: 'open_ended' | string;
  description?: string;
  notes?: string;
  references?: string[];
  promptImagePath?: string;
  descriptionImagePath?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExerciseVersion {
  id: number;
  statement: string;
  description?: string;
  notes?: string;
  hints?: string;
  verifiable?: boolean;
  result?: string;
  difficulty?: number;
  statementImagePath?: string;
  descriptionImagePath?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MetaDefinition {
  id: number;
  code: string;
  name: string;
  domainId: number;
  ownerId: number;
  xPosition?: number;
  yPosition?: number;
  prerequisites?: string[];
  prerequisiteWeights?: Record<string, number>;
  versionCount: number;
  versions?: DefinitionVersion[];
}

export interface MetaExercise {
  id: number;
  code: string;
  name: string;
  domainId: number;
  ownerId: number;
  xPosition?: number;
  yPosition?: number;
  prerequisites?: string[];
  prerequisiteWeights?: Record<string, number>;
  versionCount: number;
  versions?: ExerciseVersion[];
}

export interface SourceDTO {
  id?: number;
  domainId?: number;
  ownerId?: number;
  code: string;
  title: string;
  contentMd: string;
  bibtexKey?: string | null;
  filePath?: string | null;
  xPosition?: number;
  yPosition?: number;
  visibility?: 'private' | 'domain';
}

export interface QuestVersionDTO {
  id?: number;
  metaQuestId?: number;
  title: string;
  descriptionMd?: string;
  taskList?: unknown;
  imagePath?: string | null;
}

export interface MetaQuestDTO {
  id?: number;
  domainId?: number;
  ownerId?: number;
  code: string;
  name?: string;
  kind: 'todo' | 'habit' | 'daily';
  schedule: unknown;
  xPosition?: number;
  yPosition?: number;
  visibility?: 'private' | 'domain';
  active?: boolean;
  nextDueAt?: string | null;
  versions?: QuestVersionDTO[];
}

export interface NodeRelationDTO {
  id?: number;
  domainId?: number;
  fromType: 'definition' | 'exercise' | 'source' | 'meta_quest';
  fromId: number;
  toType: 'definition' | 'exercise' | 'source' | 'meta_quest';
  toId: number;
  relationType: string;
  contextKey?: string;
  createdBy?: number;
}
