// FILE: src/lib/api.ts
// Complete API client for Ankidemy with standardized import/export handling

import { observedFetch, type RequestObservabilityMeta } from './http-observability';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8765';

// Centralized auth redirect helper
const redirectToLogin = () => {
  if (typeof window === 'undefined') return;
  try {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    if (!window.location.pathname.startsWith('/login')) {
      window.location.replace(`/login?next=${next}`);
    }
  } catch {}
};

// Types
export interface AuthResponse {
  token: string;
  user: User;
  expiresAt: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  level: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  isAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

// Normalize server user payloads to consistent casing (id, createdAt, ...)
const normalizeUser = (u: any): User => {
  if (!u) return u as any;
  const id = typeof u.id !== 'undefined' ? u.id : u.ID;
  return {
    id: Number(id),
    username: u.username,
    email: u.email,
    level: u.level,
    firstName: u.firstName,
    lastName: u.lastName,
    isActive: Boolean(u.isActive),
    isAdmin: Boolean(u.isAdmin),
    createdAt: u.createdAt ?? u.CreatedAt ?? u.created_at ?? '',
    updatedAt: u.updatedAt ?? u.UpdatedAt ?? u.updated_at ?? '',
    deletedAt: u.deletedAt ?? u.DeletedAt ?? u.deleted_at,
  };
};

export interface Domain {
  id: number;
  name: string;
  privacy: string;
  ownerId: number;
  description: string;
  createdAt: string;
  updatedAt: string;
  domainUid?: string;
  copiedFromDomainId?: number;
  copiedFromUserId?: number;
  permissionRole?: 'owner' | 'editor' | 'viewer';
  // Optional aggregate counts used by graph UIs
  nodeCount?: number;
  exerciseCount?: number;
  definitions?: Definition[];
  exercises?: Exercise[];
}

export interface DomainReviewPreferences {
  exercisesPerDefinition?: number;
  srs?: DomainSRSPreferences;
}

export interface DomainSRSPreferences {
  intervalMultiplier?: number;
  firstIntervalDays?: number;
  secondIntervalDays?: number;
  lapseIntervalDays?: number;
  minEasinessFactor?: number;
}

export interface DomainUserPreferences {
  review?: DomainReviewPreferences;
}

export interface UserDomainSettings {
  id: number;
  userId: number;
  domainId: number;
  timezone: string;
  dailyQuestLimit: number;
  dailyQuestCooldownDays: number;
  preferences?: DomainUserPreferences;
  createdAt: string;
  updatedAt: string;
}

export interface UserDomainSettingsUpdate {
  timezone?: string;
  dailyQuestLimit?: number;
  dailyQuestCooldownDays?: number;
  preferences?: DomainUserPreferences;
}

export interface DomainPermissionInfo {
  userId: number;
  username: string;
  role: 'editor' | 'viewer';
  createdAt: string;
}

export interface DomainPermissionList {
  owner: {
    userId: number;
    username: string;
  };
  permissions: DomainPermissionInfo[];
}

export interface DomainInvite {
  id: number;
  domainId: number;
  domainName: string;
  invitedBy: number;
  invitedByUsername: string;
  role: 'editor' | 'viewer';
  status: 'pending' | 'accepted' | 'declined';
  createdAt: string;
}

export interface AccessibleDomain {
  id: number;
  domainUid: string;
  name: string;
  privacy: string;
  ownerId: number;
  ownerUsername: string;
}

// NEW: Domain network link types
export interface DomainLink {
  id: number;
  domainAId: number;
  domainBId: number;
  createdBy: number;
  createdAt: string;
}

export interface ExternalPrerequisiteLink {
  id: number;
  domainId: number;
  nodeId: number;
  nodeType: 'meta_definition' | 'meta_exercise';
  externalDomainUid: string;
  externalDomainId?: number;
  externalDomainName?: string;
  externalNodeId: number;
  externalNodeType: 'meta_definition' | 'meta_exercise';
  externalNodeCode?: string;
  externalNodeName?: string;
  xPosition?: number;
  yPosition?: number;
  status: 'ok' | 'missing_domain' | 'missing_node' | 'no_access';
}

// FIXED: Added prerequisiteWeights to Definition interface
export interface Definition {
  id: number;
  code: string;
  name: string;
  description: string;
  notes?: string;
  promptImagePath?: string;
  descriptionImagePath?: string;
  domainId: number;
  ownerId: number;
  xPosition?: number;
  yPosition?: number;
  createdAt: string;
  updatedAt: string;
  references?: string[];
  prerequisites?: string[];
  prerequisiteWeights?: Record<string, number>; // ADDED: weights for each prerequisite
}

// FIXED: Added prerequisiteWeights to Exercise interface
export interface Exercise {
  id: number;
  code: string;
  name: string;
  statement: string;
  description: string;
  notes?: string;
  hints?: string;
  statementImagePath?: string;
  descriptionImagePath?: string;
  domainId: number;
  ownerId: number;
  verifiable: boolean;
  result?: string;
  difficulty?: number;
  xPosition?: number;
  yPosition?: number;
  createdAt: string;
  updatedAt: string;
  prerequisites?: string[];
  prerequisiteWeights?: Record<string, number>; // ADDED: weights for each prerequisite
}

// New: Meta-exercise (pool) and version types
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

// NEW: Meta-definition (concept pool) and version types
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

// Updated DefinitionRequest interface
export interface DefinitionRequest {
  code: string;
  name: string;
  description: string;
  notes?: string;
  references?: string[];
  promptImagePath?: string;
  descriptionImagePath?: string;
  prerequisiteIds?: number[];
  prerequisiteWeights?: Record<number, number>; // NEW: weights for each prerequisite ID
  domainId: number;
  xPosition?: number;
  yPosition?: number;
}

// Updated ExerciseRequest interface  
export interface ExerciseRequest {
  code: string;
  name: string;
  statement: string;
  description?: string;
  notes?: string;
  hints?: string;
  statementImagePath?: string;
  descriptionImagePath?: string;
  domainId: number;
  verifiable?: boolean;
  result?: string;
  difficulty?: number;
  prerequisiteIds?: number[];
  prerequisiteWeights?: Record<number, number>; // NEW: weights for each prerequisite ID
  xPosition?: number;
  yPosition?: number;
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
  taskList?: any;
  imagePath?: string | null;
}

export interface MetaQuestDTO {
  id?: number;
  domainId?: number;
  ownerId?: number;
  code: string;
  name?: string;
  kind: 'todo' | 'habit' | 'daily';
  schedule: any;
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
  fromType: 'meta_definition' | 'meta_exercise' | 'source' | 'meta_quest';
  fromId: number;
  toType: 'meta_definition' | 'meta_exercise' | 'source' | 'meta_quest';
  toId: number;
  relationType: string;
  contextKey?: string;
  createdBy?: number;
}

export interface SurveyQueueItem {
  questId: number;
  questCode: string;
  questName?: string;
  questKind: 'todo' | 'habit' | 'daily';
  selectedVersionId: number;
  versions: QuestVersionDTO[];
  nextDueAt?: string | null;
  active: boolean;
  visibility: 'private' | 'domain';
  isOverdue: boolean;
  relevantNodes?: Array<{ nodeType: string; nodeId: number; code: string }>;
}

export interface SurveyEventRequest {
  metaQuestId: number;
  eventType: 'completed' | 'skipped' | 'snoozed' | 'deactivated' | 'reactivated' | 'version_swapped';
  questVersionId?: number;
  happenedAt?: string;
  note?: string;
  payload?: any;
}

export interface ReviewRequest {
  definitionId: number;
  result: 'again' | 'hard' | 'good' | 'easy';
  timeTaken: number;
}

export interface ExerciseAttemptRequest {
  exerciseId: number;
  answer: string;
  timeTaken: number;
}

export interface VisualGraph {
  nodes: {
    id: string;
    type: 'definition' | 'exercise' | 'source' | 'quest';
    name: string;
    code: string;
    x?: number;
    y?: number;
    prerequisites?: string[];
  }[];
  links: {
    source: string;
    target: string;
    type?: string;
    relationType?: string;
  }[];
}

export interface GroupNodeRef {
  nodeId: number;
  nodeType: 'meta_definition' | 'meta_exercise';
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

export interface GroupNodeRefRequest {
  nodeId: number;
  nodeType: 'meta_definition' | 'meta_exercise';
}

export interface GroupCreateRequest {
  name: string;
  isExact?: boolean;
  xPosition?: number;
  yPosition?: number;
  seeds: GroupNodeRefRequest[];
  members?: GroupNodeRefRequest[];
}

export interface GroupUpdateRequest {
  name?: string;
  isExact?: boolean;
  xPosition?: number;
  yPosition?: number;
  seeds?: GroupNodeRefRequest[];
  members?: GroupNodeRefRequest[];
}

export interface GraphData {
  definitions: Record<string, {
    code: string;
    name: string;
    description: string;
    notes?: string;
    references?: string[];
    prerequisites?: string[];
    prerequisiteWeights?: Record<string, number>; // ADDED: weights
    xPosition?: number;
    yPosition?: number;
    domainId?: number;
  }>;
  exercises: Record<string, {
    code: string;
    name: string;
    statement: string;
    description?: string;
    notes?: string;
    hints?: string;
    verifiable?: boolean;
    result?: string;
    difficulty?: number;
    prerequisites?: string[];
    prerequisiteWeights?: Record<string, number>; // ADDED: weights
    xPosition?: number;
    yPosition?: number;
    domainId?: number;
  }>;
  groups?: Array<{
    name: string;
    isExact: boolean;
    xPosition?: number;
    yPosition?: number;
    seeds: Array<{ nodeType: 'meta_definition' | 'meta_exercise'; code: string }>;
    members?: Array<{ nodeType: 'meta_definition' | 'meta_exercise'; code: string }>;
  }>;
}

// UPDATED: Standardized Import/Export Data Types
export interface DomainExportData {
  // LEGACY: definitions will be deprecated in favor of metaDefinitions
  definitions?: {
    [key: string]: {
      code: string;
      name: string;
      description: string[]; // STANDARDIZED: Always array for definitions
      notes?: string;
      references?: string[];
      prerequisites?: string[];
      prerequisiteWeights?: Record<string, number>;
      xPosition?: number;
      yPosition?: number;
    };
  };
  // NEW: metaDefinitions (concept pools with versions)
  metaDefinitions?: {
    [key: string]: {
      code: string;
      name: string;
      prerequisites?: string[];
      prerequisiteWeights?: Record<string, number>;
      xPosition?: number;
      yPosition?: number;
      versions: Array<{
        prompt: string;
        type?: string;
        description?: string;
        notes?: string;
        references?: string[];
        promptImagePath?: string;
        descriptionImagePath?: string;
      }>;
    };
  };
  // LEGACY: exercises will be deprecated in favor of metaExercises
  exercises?: {
    [key: string]: {
      code: string;
      name: string;
      statement: string;
      description?: string; // Exercises keep single string
      hints?: string;
      difficulty?: number; // Standardized as number
      verifiable?: boolean;
      result?: string;
      prerequisites?: string[];
      prerequisiteWeights?: Record<string, number>;
      xPosition?: number;
      yPosition?: number;
    };
  };
  metaExercises?: {
    [key: string]: {
      code: string;
      name: string;
      prerequisites?: string[];
      prerequisiteWeights?: Record<string, number>;
      xPosition?: number;
      yPosition?: number;
      versions: Array<{
        statement: string;
        description?: string;
        hints?: string;
        verifiable?: boolean;
        result?: string;
        difficulty?: number;
        notes?: string;
        statementImagePath?: string;
        descriptionImagePath?: string;
      }>;
    };
  };
  sources?: {
    [key: string]: {
      code: string;
      title: string;
      contentMd?: string;
      bibtexKey?: string | null;
      filePath?: string | null;
      xPosition?: number;
      yPosition?: number;
    };
  };
  metaQuests?: {
    [key: string]: {
      code: string;
      name?: string;
      kind: string;
      schedule: any;
      xPosition?: number;
      yPosition?: number;
      versions: Array<{
        title: string;
        descriptionMd?: string;
        taskList?: any;
        imagePath?: string;
      }>;
    };
  };
  relations?: Array<{
    fromType: string;
    fromCode: string;
    toType: string;
    toCode: string;
    relationType: string;
    contextKey?: string;
  }>;
  groups?: Array<{
    name: string;
    isExact: boolean;
    xPosition?: number;
    yPosition?: number;
    seeds: Array<{ nodeType: 'meta_definition' | 'meta_exercise'; code: string }>;
    members?: Array<{ nodeType: 'meta_definition' | 'meta_exercise'; code: string }>;
  }>;
}

export interface CreateDomainWithImportRequest {
  name: string;
  privacy: 'public' | 'private';
  description?: string;
  importData?: DomainExportData;
}

const normalizeImportText = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const normalizeImportCode = (value: unknown, fallback: string): string => {
  const code = normalizeImportText(value);
  if (code) return code;
  return normalizeImportText(fallback);
};

const normalizeImportName = (value: unknown, fallback: string): string => {
  const name = normalizeImportText(value);
  if (name) return name;
  const fallbackName = normalizeImportText(fallback);
  if (fallbackName) return fallbackName;
  return 'Unnamed';
};

const fallbackDefinitionPrompt = (name: string): string => {
  const clean = normalizeImportText(name);
  return clean ? `Define ${clean}` : 'Define the concept';
};

const fallbackExerciseStatement = (name: string): string => {
  const clean = normalizeImportText(name);
  return clean ? `Solve: ${clean}` : 'No statement';
};

const clampDifficulty = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 7) {
    return parsed;
  }
  return 3;
};

export const standardizeImportData = (rawData: any): DomainExportData => {
  if (!rawData || typeof rawData !== 'object') {
    throw new Error('Invalid JSON format: expected an object');
  }

  const hasDefs = rawData.definitions && typeof rawData.definitions === 'object';
  const hasMetaDefs = rawData.metaDefinitions && typeof rawData.metaDefinitions === 'object';
  const hasEx = rawData.exercises && typeof rawData.exercises === 'object';
  const hasMetaEx = rawData.metaExercises && typeof rawData.metaExercises === 'object';
  const hasSources = rawData.sources && typeof rawData.sources === 'object';
  const hasQuests = rawData.metaQuests && typeof rawData.metaQuests === 'object';
  if ((!hasDefs && !hasMetaDefs) && (!hasEx && !hasMetaEx) && !hasSources && !hasQuests) {
    throw new Error('Invalid JSON format: missing definitions/exercises and sources/quests');
  }

  const standardized: DomainExportData = {
    definitions: undefined,
    metaDefinitions: undefined,
    exercises: undefined,
    metaExercises: undefined,
    sources: undefined,
    metaQuests: undefined,
    relations: Array.isArray(rawData.relations) ? rawData.relations : undefined,
    groups: Array.isArray(rawData.groups) ? rawData.groups : undefined,
  };

  if (hasMetaDefs) {
    standardized.metaDefinitions = {};
    for (const [key, md] of Object.entries(rawData.metaDefinitions || {})) {
      const node = md as any;
      const code = normalizeImportCode(node.code, key);
      const name = normalizeImportName(node.name, code);
      const rawVersions = Array.isArray(node.versions) ? node.versions : [];
      const versions = (rawVersions.length > 0 ? rawVersions : [{}]).map((v: any) => ({
        prompt: normalizeImportText(v.prompt) || fallbackDefinitionPrompt(name),
        type: normalizeImportText(v.type) || 'open_ended',
        description: normalizeImportText(v.description),
        notes: normalizeImportText(v.notes),
        references: Array.isArray(v.references) ? v.references : [],
        promptImagePath: normalizeImportText(v.promptImagePath) || undefined,
        descriptionImagePath: normalizeImportText(v.descriptionImagePath) || undefined,
      }));
      (standardized.metaDefinitions as any)[key] = {
        code,
        name,
        prerequisites: Array.isArray(node.prerequisites) ? node.prerequisites : [],
        prerequisiteWeights: (node.prerequisiteWeights && typeof node.prerequisiteWeights === 'object') ? node.prerequisiteWeights : undefined,
        xPosition: Number(node.xPosition) || 0,
        yPosition: Number(node.yPosition) || 0,
        versions,
      };
    }
  } else if (hasDefs) {
    standardized.definitions = {};
    for (const [key, def] of Object.entries(rawData.definitions || {})) {
      const definition = def as any;
      const code = normalizeImportCode(definition.code, key);
      const name = normalizeImportName(definition.name, code);
      let descriptions: string[] = [];

      if (Array.isArray(definition.description)) {
        descriptions = definition.description.map((item: any) => normalizeImportText(item)).filter(Boolean);
      } else if (typeof definition.description === 'string') {
        if (definition.description.includes('|||')) {
          descriptions = definition.description.split('|||').map((item: string) => item.trim()).filter(Boolean);
        } else {
          const desc = normalizeImportText(definition.description);
          if (desc) descriptions = [desc];
        }
      }
      if (descriptions.length === 0) {
        descriptions = ['No description'];
      }

      const defWeights = (definition.prerequisiteWeights && typeof definition.prerequisiteWeights === 'object') ? definition.prerequisiteWeights as Record<string, number> : undefined;
      (standardized.definitions as any)[key] = {
        code,
        name,
        description: descriptions,
        notes: normalizeImportText(definition.notes),
        references: Array.isArray(definition.references) ? definition.references : [],
        prerequisites: Array.isArray(definition.prerequisites) ? definition.prerequisites : [],
        prerequisiteWeights: defWeights,
        xPosition: Number(definition.xPosition) || 0,
        yPosition: Number(definition.yPosition) || 0,
      };
    }
  }

  if (hasMetaEx) {
    standardized.metaExercises = {};
    for (const [key, me] of Object.entries(rawData.metaExercises || {})) {
      const node = me as any;
      const code = normalizeImportCode(node.code, key);
      const name = normalizeImportName(node.name, code);
      const rawVersions = Array.isArray(node.versions) ? node.versions : [];
      const versions = (rawVersions.length > 0 ? rawVersions : [{}]).map((vv: any) => ({
        statement: normalizeImportText(vv.statement) || fallbackExerciseStatement(name),
        description: normalizeImportText(vv.description),
        hints: normalizeImportText(vv.hints),
        verifiable: Boolean(vv.verifiable),
        result: normalizeImportText(vv.result),
        difficulty: clampDifficulty(vv.difficulty),
        notes: normalizeImportText(vv.notes),
        statementImagePath: normalizeImportText(vv.statementImagePath) || undefined,
        descriptionImagePath: normalizeImportText(vv.descriptionImagePath) || undefined,
      }));
      (standardized.metaExercises as any)[key] = {
        code,
        name,
        prerequisites: Array.isArray(node.prerequisites) ? node.prerequisites : [],
        prerequisiteWeights: (node.prerequisiteWeights && typeof node.prerequisiteWeights === 'object') ? node.prerequisiteWeights : undefined,
        xPosition: Number(node.xPosition) || 0,
        yPosition: Number(node.yPosition) || 0,
        versions,
      };
    }
  } else if (hasEx) {
    standardized.exercises = {};
    for (const [key, ex] of Object.entries(rawData.exercises || {})) {
      const exercise = ex as any;
      const code = normalizeImportCode(exercise.code, key);
      const name = normalizeImportName(exercise.name, code);
      const exWeights = (exercise.prerequisiteWeights && typeof exercise.prerequisiteWeights === 'object') ? exercise.prerequisiteWeights as Record<string, number> : undefined;
      (standardized.exercises as any)[key] = {
        code,
        name,
        statement: normalizeImportText(exercise.statement) || fallbackExerciseStatement(name),
        description: normalizeImportText(exercise.description),
        hints: normalizeImportText(exercise.hints),
        difficulty: clampDifficulty(exercise.difficulty),
        verifiable: Boolean(exercise.verifiable),
        result: normalizeImportText(exercise.result),
        prerequisites: Array.isArray(exercise.prerequisites) ? exercise.prerequisites : [],
        prerequisiteWeights: exWeights,
        xPosition: Number(exercise.xPosition) || 0,
        yPosition: Number(exercise.yPosition) || 0,
      };
    }
  }

  if (rawData.sources && typeof rawData.sources === 'object') {
    standardized.sources = {};
    for (const [key, src] of Object.entries(rawData.sources || {})) {
      const node = src as any;
      const code = normalizeImportCode(node.code, key);
      const title = normalizeImportText(node.title) || code;
      const contentMd = normalizeImportText(node.contentMd);
      const bibtexKey = normalizeImportText(node.bibtexKey);
      const filePath = normalizeImportText(node.filePath);
      (standardized.sources as any)[key] = {
        code,
        title,
        contentMd: contentMd || undefined,
        bibtexKey: bibtexKey || undefined,
        filePath: filePath || undefined,
        xPosition: Number(node.xPosition) || 0,
        yPosition: Number(node.yPosition) || 0,
      };
    }
  }

  if (rawData.metaQuests && typeof rawData.metaQuests === 'object') {
    standardized.metaQuests = {};
    for (const [key, mq] of Object.entries(rawData.metaQuests || {})) {
      const node = mq as any;
      const code = normalizeImportCode(node.code, key);
      let name = normalizeImportName(node.name, code);
      const rawVersions = Array.isArray(node.versions) ? node.versions : [];
      const versions = (rawVersions.length > 0 ? rawVersions : [{}]).map((v: any) => {
        const title = normalizeImportText(v.title);
        return {
          title: title || name || code,
          descriptionMd: normalizeImportText(v.descriptionMd) || undefined,
          taskList: v.taskList,
          imagePath: normalizeImportText(v.imagePath) || undefined,
        };
      });
      if (name === code && versions.length > 0) {
        const firstTitle = normalizeImportText(versions[0].title);
        if (firstTitle) name = firstTitle;
      }
      const kind = normalizeImportText(node.kind) || 'todo';
      (standardized.metaQuests as any)[key] = {
        code,
        name,
        kind,
        schedule: node.schedule,
        xPosition: Number(node.xPosition) || 0,
        yPosition: Number(node.yPosition) || 0,
        versions,
      };
    }
  }

  return standardized;
};

// Helper functions
const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
};

// Enhance the handleResponse function to better handle API responses
const handleResponse = async (response: Response) => {
  if (!response.ok) {
    let errorMessage = 'An error occurred';
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      // Could not parse JSON, use status text
      errorMessage = response.statusText || `HTTP error ${response.status}`;
    }

    // Add more specific error messages based on status codes from API documentation
    switch (response.status) {
      case 400:
        errorMessage = `Bad Request: ${errorMessage}`;
        break;
      case 401:
        // For login/register endpoints, preserve the server error message (e.g. "Invalid credentials")
        // and don't clear the token or redirect — the caller handles the error.
        if (!response.url.includes('/api/auth/login') && !response.url.includes('/api/auth/register')) {
          errorMessage = 'Authentication required. Please log in again.';
          try { localStorage.removeItem('token'); } catch {}
          // Redirect to login after current microtask
          Promise.resolve().then(redirectToLogin);
          // Downgrade to warn to avoid noisy console errors for expected expiry
          console.warn('Auth expired or missing; redirecting to login', { url: response.url });
        }
        break;
      case 403:
        errorMessage = 'You do not have permission to perform this action.';
        break;
      case 404:
        errorMessage = 'The requested resource was not found.';
        break;
      case 409:
        // Prefer server-provided message if present to surface duplicate code errors
        // (Many endpoints return { error: "..." })
        try {
          const data = await response.clone().json();
          if (data?.error) errorMessage = data.error;
        } catch {}
        if (!errorMessage || errorMessage.toLowerCase().includes('response body')) {
          errorMessage = 'Conflict: the resource already exists or cannot be updated due to a conflict.';
        }
        break;
    }
    
    if (response.status !== 401) {
      console.error(`API Error: ${errorMessage}`, { status: response.status, url: response.url });
    }
    throw new Error(errorMessage);
  }

  // For 204 No Content responses
  if (response.status === 204) {
    return null;
  }

  const data = await response.json();
  
  // For debugging purposes, log the response data
  console.debug(`API Response from ${response.url}:`, data);
  
  return data;
};

export const uploadNodeImage = async (payload: {
  file: File;
  domainId: number;
  nodeType: 'definition' | 'exercise' | 'quest';
  field: 'prompt' | 'description' | 'statement';
}): Promise<{ imagePath: string }> => {
  const formData = new FormData();
  formData.append('file', payload.file);
  formData.append('domainId', String(payload.domainId));
  formData.append('nodeType', payload.nodeType);
  formData.append('field', payload.field);

  const response = await observedFetch(`${API_URL}/api/media/upload`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
    },
    body: formData,
  });
  return handleResponse(response);
};

// UPDATED: Login now supports email OR username via identifier field
export const loginUser = async (credentials: { identifier: string; password: string }): Promise<AuthResponse> => {
  const response = await observedFetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  
  const data = await handleResponse(response);
  // Normalize user casing if present
  if ((data as any)?.user) {
    (data as any).user = normalizeUser((data as any).user);
  }
  
  if (data.token) {
    localStorage.setItem('token', data.token);
  }
  
  return data;
};

export const registerUser = async (userDetails: {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}): Promise<AuthResponse> => {
  const response = await observedFetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userDetails),
  });

  const data = await handleResponse(response);
  if ((data as any)?.user) {
    (data as any).user = normalizeUser((data as any).user);
  }
  
  if (data.token) {
    localStorage.setItem('token', data.token);
  }
  
  return data;
};

export const refreshToken = async (token: string): Promise<AuthResponse> => {
  const response = await observedFetch(`${API_URL}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });

  const data = await handleResponse(response);
  if ((data as any)?.user) {
    (data as any).user = normalizeUser((data as any).user);
  }
  
  if (data.token) {
    localStorage.setItem('token', data.token);
  }
  
  return data;
};

export const logout = (): void => {
  localStorage.removeItem('token');
};

// UTILITY: Check if user is currently authenticated
export const isAuthenticated = (): boolean => {
  return !!localStorage.getItem('token');
};

// UTILITY: Safe function to check authentication status
export const checkAuthStatus = async (): Promise<{ isAuthenticated: boolean; user?: User }> => {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      return { isAuthenticated: false };
    }
    
    const user = await getCurrentUser();
    return { isAuthenticated: true, user };
  } catch {
    // Token might be expired or invalid
    localStorage.removeItem('token');
    return { isAuthenticated: false };
  }
};

// User API
export const getCurrentUser = async (): Promise<User> => {
  const response = await observedFetch(`${API_URL}/api/users/me`, {
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
  });
  const raw = await handleResponse(response);
  return normalizeUser(raw);
};

export const updateCurrentUser = async (userData: {
  username?: string;
  email?: string;
  password?: string;
  // Some endpoints may require the current password when changing password
  currentPassword?: string;
  firstName?: string;
  lastName?: string;
}): Promise<User> => {
  const response = await observedFetch(`${API_URL}/api/users/me`, {
    method: 'PUT',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(userData),
  });
  
  return handleResponse(response);
};

// Domain API
export const getPublicDomains = async (): Promise<Domain[]> => {
  try {
    const response = await observedFetch(`${API_URL}/api/domains/public`);
    
    if (!response.ok) {
      console.warn(`Failed to fetch public domains: ${response.status}`);
      return [];
    }
    
    const result = await handleResponse(response);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.warn('Error fetching public domains:', error);
    return []; // Return empty array on error
  }
};

export const getAllDomains = async (): Promise<Domain[]> => {
  const response = await observedFetch(`${API_URL}/api/domains`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const getMyDomains = async (): Promise<Domain[]> => {
  try {
    const response = await observedFetch(`${API_URL}/api/domains/my`, {
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      console.warn(`Failed to fetch my domains: ${response.status}`);
      return [];
    }
    
    const result = await handleResponse(response);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.warn('Error fetching my domains:', error);
    return []; // Return empty array on error
  }
};

export const getEnrolledDomains = async (): Promise<Domain[]> => {
  try {
    const response = await observedFetch(`${API_URL}/api/domains/enrolled`, {
      headers: getAuthHeaders(),
    });
    
    if (!response.ok) {
      // Return empty array for errors instead of throwing
      console.warn(`Failed to fetch enrolled domains: ${response.status}`);
      return [];
    }
    
    const result = await handleResponse(response);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.warn('Error fetching enrolled domains:', error);
    return []; // Return empty array on error
  }
};

export const getSharedDomains = async (): Promise<Domain[]> => {
  try {
    const response = await observedFetch(`${API_URL}/api/domains/shared`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      console.warn(`Failed to fetch shared domains: ${response.status}`);
      return [];
    }
    const result = await handleResponse(response);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.warn('Error fetching shared domains:', error);
    return [];
  }
};

export const getAccessibleDomains = async (): Promise<AccessibleDomain[]> => {
  try {
    const response = await observedFetch(`${API_URL}/api/domains/accessible`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) {
      console.warn(`Failed to fetch accessible domains: ${response.status}`);
      return [];
    }
    const result = await handleResponse(response);
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.warn('Error fetching accessible domains:', error);
    return [];
  }
};

export const getDomain = async (id: number): Promise<Domain> => {
  const response = await observedFetch(`${API_URL}/api/domains/${id}`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const getUserDomainSettings = async (domainId: number): Promise<UserDomainSettings> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/user-settings`, {
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const updateUserDomainSettings = async (
  domainId: number,
  updates: UserDomainSettingsUpdate
): Promise<UserDomainSettings> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/user-settings`, {
    method: 'PUT',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });
  return handleResponse(response);
};

export const getExternalPrerequisites = async (domainId: number): Promise<ExternalPrerequisiteLink[]> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/external-prerequisites`, {
    headers: getAuthHeaders(),
  });
  const result = await handleResponse(response);
  return Array.isArray(result) ? result : [];
};

export const createExternalPrerequisite = async (
  domainId: number,
  payload: {
    nodeId: number;
    nodeType: 'meta_definition' | 'meta_exercise';
    externalDomainUid: string;
    externalNodeId: number;
    externalNodeType: 'meta_definition' | 'meta_exercise';
  }
): Promise<ExternalPrerequisiteLink> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/external-prerequisites`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

export const deleteExternalPrerequisite = async (domainId: number, linkId: number): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/external-prerequisites/${linkId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const updateExternalPrerequisitePositions = async (
  domainId: number,
  positions: Array<{
    externalDomainUid: string;
    externalNodeId: number;
    externalNodeType: 'meta_definition' | 'meta_exercise';
    xPosition: number;
    yPosition: number;
  }>
): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/external-prerequisites/positions`, {
    method: 'PUT',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ positions }),
  });
  return handleResponse(response);
};

export const copyDomain = async (id: number, payload: {
  name?: string;
  privacy?: 'public' | 'private';
  description?: string;
}): Promise<Domain> => {
  const response = await observedFetch(`${API_URL}/api/domains/${id}/copy`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

// Enhanced createDomain function with better error handling
export const createDomain = async (domain: {
  name: string;
  privacy: 'public' | 'private';
  description?: string;
}): Promise<Domain> => {
  console.log("Creating domain:", domain);
  
  try {
    const response = await observedFetch(`${API_URL}/api/domains`, {
      method: 'POST',
      headers: { 
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(domain),
    });
    
    const data = await handleResponse(response);
    
    // Verify the response has the expected shape
    if (!data || typeof data.id === 'undefined') {
      console.error("Invalid domain response:", data);
      throw new Error("Server returned incomplete domain data");
    }
    
    console.log("Domain created successfully:", data);
    return data as Domain;
  } catch (error) {
    console.error("Error creating domain:", error);
    throw error;
  }
};

export const updateDomain = async (id: number, domain: {
  name?: string;
  privacy?: 'public' | 'private';
  description?: string;
}): Promise<Domain> => {
  const response = await observedFetch(`${API_URL}/api/domains/${id}`, {
    method: 'PUT',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(domain),
  });
  
  return handleResponse(response);
};

export const getDomainPermissions = async (id: number): Promise<DomainPermissionList> => {
  const response = await observedFetch(`${API_URL}/api/domains/${id}/permissions`, {
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const createDomainInvite = async (id: number, payload: {
  username: string;
  role: 'editor' | 'viewer';
}, requestMeta?: RequestObservabilityMeta): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/domains/${id}/invites`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }, requestMeta);
  await handleResponse(response);
};

export const removeDomainPermission = async (id: number, userId: number): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/domains/${id}/permissions/${userId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  await handleResponse(response);
};

export const getPendingDomainInvites = async (
  requestMeta?: RequestObservabilityMeta,
): Promise<DomainInvite[]> => {
  const response = await observedFetch(`${API_URL}/api/domain-invites`, {
    headers: getAuthHeaders(),
  }, requestMeta);
  const result = await handleResponse(response);
  return Array.isArray(result) ? result : [];
};

export const acceptDomainInvite = async (
  inviteId: number,
  requestMeta?: RequestObservabilityMeta,
): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/domain-invites/${inviteId}/accept`, {
    method: 'POST',
    headers: getAuthHeaders(),
  }, requestMeta);
  await handleResponse(response);
};

export const declineDomainInvite = async (
  inviteId: number,
  requestMeta?: RequestObservabilityMeta,
): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/domain-invites/${inviteId}/decline`, {
    method: 'POST',
    headers: getAuthHeaders(),
  }, requestMeta);
  await handleResponse(response);
};

export const deleteDomain = async (id: number): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/domains/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

// Archive domain (soft delete). Alias for deleteDomain for clearer semantics in UI
export const archiveDomain = async (id: number): Promise<void> => {
  return deleteDomain(id);
};

// List archived domains owned by current user
export const getMyArchivedDomains = async (): Promise<Domain[]> => {
  const response = await observedFetch(`${API_URL}/api/domains/archived/my`, {
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

// Restore a soft-deleted domain
export const restoreDomain = async (id: number): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/domains/${id}/restore`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

// Permanently delete a domain and all related data
export const purgeDomain = async (id: number): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/domains/${id}/purge`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const enrollInDomain = async (id: number): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/domains/${id}/enroll`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

// Definition API
export const getDomainDefinitions = async (domainId: number): Promise<Definition[]> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/definitions`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const createDefinition = async (domainId: number, definition: DefinitionRequest): Promise<Definition> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/definitions`, {
    method: 'POST',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(definition),
  });
  
  return handleResponse(response);
};

export const getDefinition = async (id: number): Promise<Definition> => {
  const response = await observedFetch(`${API_URL}/api/definitions/${id}`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

// Utility functions for definition updates
export const updateDefinition = async (id: number, definitionData: {
  name?: string;
  description?: string;
  notes?: string;
  references?: string[];
  promptImagePath?: string;
  descriptionImagePath?: string;
  prerequisiteIds?: number[];
  prerequisiteWeights?: Record<number, number>; // NEW: include weights
  xPosition?: number;
  yPosition?: number;
}): Promise<Definition> => {
  const response = await observedFetch(`${API_URL}/api/definitions/${id}`, {
    method: 'PUT',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(definitionData),
  });
  
  const result = await handleResponse(response);

  // Ensure prerequisites are included as string codes - fallback if API doesn't return them
  if (result && !result.prerequisites && definitionData.prerequisiteIds) {
    result.prerequisites = []; // Handled in calling code by converting IDs to codes
  }

  return result;
};

export const deleteDefinition = async (id: number): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/definitions/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const getDefinitionByCode = async (code: string, opts?: { domainId?: number }): Promise<Definition> => {
  const domainQuery = opts?.domainId ? `?domainId=${opts.domainId}` : '';
  const url = `${API_URL}/api/definitions/code/${encodeURIComponent(code)}${domainQuery}`;
  const response = await observedFetch(url, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

/**
 * Gets the ID of a definition by its code
 * @param code The code of the definition
 * @returns Promise resolving to the ID of the definition
 */
export const getDefinitionIdByCode = async (code: string): Promise<number> => {
  try {
    const response = await getDefinitionByCode(code);
    // Handle array response (API might return array of matching definitions)
    const definition = Array.isArray(response) ? response[0] : response;
    if (!definition || !definition.id) {
      throw new Error(`No definition found with code: ${code}`);
    }
    return definition.id;
  } catch (error) {
    console.error('Error getting definition ID by code:', error);
    throw error;
  }
};

/**
 * Gets the ID of an exercise by its code
 * @param code The code of the exercise
 * @returns Promise resolving to the ID of the exercise
 */
export const getExerciseIdByCode = async (code: string): Promise<number> => {
  try {
    const response = await getExerciseByCode(code);
    // Handle array response (API might return array of matching exercises)
    const exercise = Array.isArray(response) ? response[0] : response;
    if (!exercise || !exercise.id) {
      throw new Error(`No exercise found with code: ${code}`);
    }
    return exercise.id;
  } catch (error) {
    console.error('Error getting exercise ID by code:', error);
    throw error;
  }
};

// =============================================================================
// META DEFINITION API (NEW)
// =============================================================================

/**
 * Get all meta-definitions for a domain
 */
export const getDomainMetaDefinitions = async (domainId: number): Promise<MetaDefinition[]> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/meta-definitions`, {
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

/**
 * Create a new meta-definition (concept pool) with optional initial version
 */
export const createMetaDefinition = async (domainId: number, data: {
  code: string;
  name: string;
  xPosition?: number;
  yPosition?: number;
  prerequisiteIds?: number[];
  prerequisiteWeights?: Record<number, number>;
  initialVersion?: {
    prompt: string;
    type?: string;
    description?: string;
    notes?: string;
    references?: string[];
    promptImagePath?: string;
    descriptionImagePath?: string;
  };
}): Promise<MetaDefinition> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/meta-definitions`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

/**
 * Get a single meta-definition with all its versions
 */
export const getMetaDefinition = async (id: number): Promise<MetaDefinition> => {
  const response = await observedFetch(`${API_URL}/api/meta-definitions/${id}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

/**
 * Update meta-definition pool metadata
 */
export const updateMetaDefinition = async (id: number, data: {
  code?: string;
  name?: string;
  xPosition?: number;
  yPosition?: number;
  cascadeCode?: boolean;
  cascadeName?: boolean;
}): Promise<MetaDefinition> => {
  const response = await observedFetch(`${API_URL}/api/meta-definitions/${id}`, {
    method: 'PUT',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

/**
 * Delete a meta-definition (concept pool) and its versions
 */
export const deleteMetaDefinition = async (id: number): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/meta-definitions/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

/**
 * Add a new version to a meta-definition
 */
export const addMetaDefinitionVersion = async (id: number, version: {
  prompt: string;
  type?: string;
  description?: string;
  notes?: string;
  references?: string[];
  promptImagePath?: string;
  descriptionImagePath?: string;
}): Promise<DefinitionVersion> => {
  const response = await observedFetch(`${API_URL}/api/meta-definitions/${id}/versions`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(version),
  });
  return handleResponse(response);
};

/**
 * Update a specific definition version
 */
export const updateMetaDefinitionVersion = async (
  id: number,
  versionId: number,
  version: Partial<DefinitionVersion>
): Promise<DefinitionVersion> => {
  const response = await observedFetch(`${API_URL}/api/meta-definitions/${id}/versions/${versionId}`, {
    method: 'PUT',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(version),
  });
  return handleResponse(response);
};

/**
 * Delete a definition version (returns 400 if it's the last version)
 */
export const deleteMetaDefinitionVersion = async (id: number, versionId: number): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/meta-definitions/${id}/versions/${versionId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

/**
 * Get next version for review (used by review UI)
 */
export const getNextMetaDefinitionVersion = async (id: number): Promise<DefinitionVersion | null> => {
  const response = await observedFetch(`${API_URL}/api/meta-definitions/${id}/next-version`, {
    headers: getAuthHeaders(),
  });
  if (response.status === 204 || response.status === 404) {
    return null;
  }
  return handleResponse(response);
};

export interface DefinitionExerciseSelection {
  metaExerciseId: number;
  metaExerciseCode: string;
  metaExerciseName: string;
  version: ExerciseVersion;
}

export const getNextMetaDefinitionExercise = async (id: number): Promise<DefinitionExerciseSelection | null> => {
  const response = await observedFetch(`${API_URL}/api/meta-definitions/${id}/next-exercise`, {
    headers: getAuthHeaders(),
  });
  if (response.status === 204) {
    return null;
  }
  return handleResponse(response);
};

// Exercise API
export const getDomainExercises = async (domainId: number): Promise<Exercise[]> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/exercises`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

// New: Meta-exercises API
export const getDomainMetaExercises = async (domainId: number): Promise<MetaExercise[]> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/meta-exercises`, { headers: getAuthHeaders() });
  return handleResponse(response);
};

export const createMetaExercise = async (domainId: number, data: {
  code: string; name: string; xPosition?: number; yPosition?: number;
  prerequisiteIds?: number[]; prerequisiteWeights?: Record<number, number>;
  initialVersion?: { statement: string; description?: string; notes?: string; hints?: string; verifiable?: boolean; result?: string; difficulty?: number; statementImagePath?: string; descriptionImagePath?: string };
}): Promise<MetaExercise> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/meta-exercises`, {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const getMetaExercise = async (id: number): Promise<MetaExercise> => {
  const response = await observedFetch(`${API_URL}/api/meta-exercises/${id}`, { headers: getAuthHeaders() });
  return handleResponse(response);
};

export const updateMetaExercise = async (metaId: number, payload: {
  name?: string;
  code?: string;
  xPosition?: number;
  yPosition?: number;
}): Promise<MetaExercise> => {
  const response = await observedFetch(`${API_URL}/api/meta-exercises/${metaId}`, {
    method: 'PUT',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

/**
 * Delete a meta-exercise (exercise pool) and its versions
 */
export const deleteMetaExercise = async (metaId: number): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/meta-exercises/${metaId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const addMetaExerciseVersion = async (metaId: number, version: {
  statement: string; description?: string; notes?: string; hints?: string; verifiable?: boolean; result?: string; difficulty?: number; statementImagePath?: string; descriptionImagePath?: string;
}): Promise<ExerciseVersion> => {
  const response = await observedFetch(`${API_URL}/api/meta-exercises/${metaId}/versions`, {
    method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(version)
  });
  return handleResponse(response);
};

export const updateMetaExerciseVersion = async (metaId: number, versionId: number, version: Partial<ExerciseVersion>): Promise<ExerciseVersion> => {
  const response = await observedFetch(`${API_URL}/api/meta-exercises/${metaId}/versions/${versionId}`, {
    method: 'PUT', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(version)
  });
  return handleResponse(response);
};

export const deleteMetaExerciseVersion = async (metaId: number, versionId: number): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/meta-exercises/${metaId}/versions/${versionId}`, { method: 'DELETE', headers: getAuthHeaders() });
  return handleResponse(response);
};

export const getNextMetaExerciseVersion = async (metaId: number): Promise<(ExerciseVersion & { code?: string; name?: string }) | null> => {
  const response = await observedFetch(`${API_URL}/api/meta-exercises/${metaId}/next-version`, { headers: getAuthHeaders() });
  if (response.status === 204 || response.status === 404) {
    return null;
  }
  return handleResponse(response);
};

export const recordMetaExerciseOutcome = async (metaId: number, payload: { versionId: number; success: boolean }): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/meta-exercises/${metaId}/record-outcome`, {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await handleResponse(response);
};

export const createExercise = async (domainId: number, exercise: ExerciseRequest): Promise<Exercise> => {
  const exerciseData = { ...exercise };
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/exercises`, {
    method: 'POST',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(exerciseData),
  });
  
  return handleResponse(response);
};

export const getExercise = async (id: number): Promise<Exercise> => {
  const response = await observedFetch(`${API_URL}/api/exercises/${id}`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

// Utility functions for exercise updates
export const updateExercise = async (id: number, exerciseData: {
  name?: string;
  statement?: string;
  description?: string;
  notes?: string;
  hints?: string;
  statementImagePath?: string;
  descriptionImagePath?: string;
  difficulty?: number;
  verifiable?: boolean;
  result?: string;
  prerequisiteIds?: number[];
  prerequisiteWeights?: Record<number, number>; // NEW: include weights
  xPosition?: number;
  yPosition?: number;
}): Promise<Exercise> => {
  const dataToSend = { ...exerciseData };
  const response = await observedFetch(`${API_URL}/api/exercises/${id}`, {
    method: 'PUT',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(dataToSend),
  });
  
  const result = await handleResponse(response);
  
  // Ensure prerequisites are included as string codes - fallback if API doesn't return them
  if (result && !result.prerequisites && exerciseData.prerequisiteIds) {
    result.prerequisites = []; // Handled in calling code by converting IDs to codes
  }

  return result;
};

export const deleteExercise = async (id: number): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/exercises/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const getExerciseByCode = async (code: string, opts?: { domainId?: number }): Promise<Exercise> => {
  const domainQuery = opts?.domainId ? `?domainId=${opts.domainId}` : '';
  const url = `${API_URL}/api/exercises/code/${encodeURIComponent(code)}${domainQuery}`;
  const response = await observedFetch(url, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const verifyExerciseAnswer = async (id: number, answer: string): Promise<{ correct: boolean; message: string }> => {
  const response = await observedFetch(`${API_URL}/api/exercises/${id}/verify`, {
    method: 'POST',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ answer }),
  });
  
  return handleResponse(response);
};

// Progress API
export const getDomainProgress = async (): Promise<any[]> => {
  const response = await observedFetch(`${API_URL}/api/progress/domains`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const getDefinitionProgress = async (domainId: number): Promise<any[]> => {
  const response = await observedFetch(`${API_URL}/api/progress/domains/${domainId}/definitions`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const getExerciseProgress = async (domainId: number): Promise<any[]> => {
  const response = await observedFetch(`${API_URL}/api/progress/domains/${domainId}/exercises`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const reviewDefinition = async (definitionId: number, reviewRequest: ReviewRequest): Promise<any> => {
  const response = await observedFetch(`${API_URL}/api/progress/definitions/${definitionId}/review`, {
    method: 'POST',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(reviewRequest),
  });
  
  return handleResponse(response);
};

export const attemptExercise = async (exerciseId: number, attemptRequest: ExerciseAttemptRequest): Promise<any> => {
  const response = await observedFetch(`${API_URL}/api/progress/exercises/${exerciseId}/attempt`, {
    method: 'POST',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(attemptRequest),
  });
  
  return handleResponse(response);
};

export const getDefinitionsForReview = async (domainId: number, limit?: number): Promise<Definition[]> => {
  const url = limit 
    ? `${API_URL}/api/progress/domains/${domainId}/review?limit=${limit}` 
    : `${API_URL}/api/progress/domains/${domainId}/review`;
    
  const response = await observedFetch(url, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

// Study Session API
export const startSession = async (domainId: number): Promise<any> => {
  const response = await observedFetch(`${API_URL}/api/sessions/start`, {
    method: 'POST',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ domainId }),
  });
  
  return handleResponse(response);
};

export const endSession = async (sessionId: number): Promise<any> => {
  const response = await observedFetch(`${API_URL}/api/sessions/${sessionId}/end`, {
    method: 'PUT',
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const getSessions = async (): Promise<any[]> => {
  const response = await observedFetch(`${API_URL}/api/sessions`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const getSessionDetails = async (sessionId: number): Promise<any> => {
  const response = await observedFetch(`${API_URL}/api/sessions/${sessionId}`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

// Graph API
export const getVisualGraph = async (domainId: number): Promise<VisualGraph> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/graph`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const updateGraphPositions = async (domainId: number, positions: Record<string, { x: number; y: number }>): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/graph/positions`, {
    method: 'PUT',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(positions),
  });
  
  return handleResponse(response);
};

// Sources API
export const getDomainSources = async (domainId: number): Promise<SourceDTO[]> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/sources?scope=visible`, {
    headers: getAuthHeaders(),
  });
  if (response.status === 404) return [];
  return handleResponse(response);
};

export const createSource = async (domainId: number, payload: Partial<SourceDTO>): Promise<SourceDTO> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/sources`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (response.status === 404) {
    throw new Error('Sources API is not available on this server.');
  }
  return handleResponse(response);
};

export const getSource = async (sourceId: number): Promise<SourceDTO> => {
  const response = await observedFetch(`${API_URL}/api/sources/${sourceId}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const updateSource = async (sourceId: number, payload: Partial<SourceDTO>): Promise<SourceDTO> => {
  const response = await observedFetch(`${API_URL}/api/sources/${sourceId}`, {
    method: 'PATCH',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

export const deleteSource = async (sourceId: number): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/sources/${sourceId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

// Quests API
export const getDomainQuests = async (domainId: number): Promise<MetaQuestDTO[]> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/quests?scope=visible`, {
    headers: getAuthHeaders(),
  });
  if (response.status === 404) return [];
  return handleResponse(response);
};

export const createQuest = async (domainId: number, payload: Partial<MetaQuestDTO> & { initialVersion: QuestVersionDTO }): Promise<MetaQuestDTO> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/quests`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (response.status === 404) {
    throw new Error('Quests API is not available on this server.');
  }
  return handleResponse(response);
};

export const getQuest = async (questId: number): Promise<MetaQuestDTO> => {
  const response = await observedFetch(`${API_URL}/api/quests/${questId}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const updateQuest = async (questId: number, payload: Partial<MetaQuestDTO> & { active?: boolean }): Promise<MetaQuestDTO> => {
  const response = await observedFetch(`${API_URL}/api/quests/${questId}`, {
    method: 'PATCH',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

export const deleteQuest = async (questId: number): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/quests/${questId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const addQuestVersion = async (questId: number, payload: QuestVersionDTO): Promise<QuestVersionDTO> => {
  const response = await observedFetch(`${API_URL}/api/quests/${questId}/versions`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

export const updateQuestVersion = async (questId: number, versionId: number, payload: QuestVersionDTO): Promise<QuestVersionDTO> => {
  const response = await observedFetch(`${API_URL}/api/quests/${questId}/versions/${versionId}`, {
    method: 'PATCH',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

export const deleteQuestVersion = async (questId: number, versionId: number): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/quests/${questId}/versions/${versionId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

export const updateQuestRelevantLinks = async (questId: number, versionId: number, payload: Array<{ relationType: string; toType: string; toCode: string }>): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/quests/${questId}/versions/${versionId}/relevant`, {
    method: 'PUT',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

// Relations API
export const getDomainRelations = async (domainId: number): Promise<NodeRelationDTO[]> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/relations?scope=visible`, {
    headers: getAuthHeaders(),
  });
  if (response.status === 404) return [];
  return handleResponse(response);
};

export const createRelation = async (domainId: number, payload: Partial<NodeRelationDTO>): Promise<NodeRelationDTO> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/relations`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

export const deleteRelation = async (relationId: number): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/relations/${relationId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

// Survey API
export const getSurveyQueue = async (domainId: number): Promise<SurveyQueueItem[]> => {
  const response = await observedFetch(`${API_URL}/api/survey/domains/${domainId}/queue`, {
    headers: getAuthHeaders(),
  });
  if (response.status === 404) return [];
  return handleResponse(response);
};

export const getSurveyStats = async (domainId: number): Promise<{ dueQuests: number }> => {
  const response = await observedFetch(`${API_URL}/api/survey/domains/${domainId}/stats`, {
    headers: getAuthHeaders(),
  });
  if (response.status === 404) return { dueQuests: 0 };
  return handleResponse(response);
};

export const postSurveyEvent = async (payload: SurveyEventRequest): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/survey/events`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

// Group API
export const getDomainGroups = async (domainId: number): Promise<GroupData[]> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/groups`, {
    headers: getAuthHeaders(),
  });

  return handleResponse(response);
};

export const createDomainGroup = async (domainId: number, payload: GroupCreateRequest): Promise<GroupData> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/groups`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return handleResponse(response);
};

export const updateGroup = async (groupId: number, payload: GroupUpdateRequest): Promise<GroupData> => {
  const response = await observedFetch(`${API_URL}/api/groups/${groupId}`, {
    method: 'PATCH',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return handleResponse(response);
};

export const deleteGroup = async (groupId: number): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/groups/${groupId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  return handleResponse(response);
};

export const updateGroupState = async (groupId: number, collapsed: boolean): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/groups/${groupId}/state`, {
    method: 'PUT',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ collapsed }),
  });

  return handleResponse(response);
};

export const updateGroupPositions = async (domainId: number, positions: Record<string, { x: number; y: number }>): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/groups/positions`, {
    method: 'PUT',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(positions),
  });

  return handleResponse(response);
};

export const exportDomain = async (domainId: number): Promise<GraphData> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/export`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

export const importDomain = async (domainId: number, graphData: GraphData): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/import`, {
    method: 'POST',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(graphData),
  });
  
  return handleResponse(response);
};

// NEW: Import/Export API Functions

/**
 * Exports a domain in the standardized import/export format
 * @param domainId The ID of the domain to export
 * @returns Promise resolving to the export data
 */
export const exportDomainAsJson = async (domainId: number): Promise<DomainExportData> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/export-data`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

/**
 * Downloads a full domain backup (zip)
 */
export const fetchDomainBackup = async (domainId: number): Promise<Blob> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/backup`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    let errorMessage = 'Failed to download backup';
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch {
      errorMessage = response.statusText || `HTTP error ${response.status}`;
    }
    throw new Error(errorMessage);
  }

  return response.blob();
};

/**
 * Imports a full domain backup from a zip file
 */
export const importDomainBackup = async (domainId: number, file: File): Promise<void> => {
  const formData = new FormData();
  formData.append('file', file);

  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/import-backup`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
    },
    body: formData,
  });

  return handleResponse(response);
};

/**
 * Imports data into an existing domain
 * @param domainId The ID of the domain to import into
 * @param data The import data
 * @param opts Options for the import, including duplicate handling strategy
 * @returns Promise resolving when import is complete
 */
export const importToDomain = async (
  domainId: number,
  data: DomainExportData,
  opts?: { onDuplicate?: 'rename' | 'update' }
): Promise<void> => {
  const url = opts?.onDuplicate
    ? `${API_URL}/api/domains/${domainId}/import?onDuplicate=${opts.onDuplicate}`
    : `${API_URL}/api/domains/${domainId}/import`;

  const response = await observedFetch(url, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  return handleResponse(response);
};

/**
 * Creates a new domain with imported data
 * @param name Domain name
 * @param privacy Domain privacy setting
 * @param description Domain description
 * @param importData The data to import
 * @returns Promise resolving to the created domain
 */
export const createDomainWithImport = async (
  name: string, 
  privacy: 'public' | 'private', 
  description: string, 
  importData: DomainExportData
): Promise<Domain> => {
  const requestData: CreateDomainWithImportRequest = {
    name,
    privacy,
    description,
    importData,
  };

  const response = await observedFetch(`${API_URL}/api/domains`, {
    method: 'POST',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestData),
  });
  
  return handleResponse(response);
};

// NEW: File Handling Utilities

/**
 * Downloads data as a JSON file
 * @param data The data to download
 * @param filename The name of the file (without extension)
 */
export const downloadJsonFile = (data: any, filename: string): void => {
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up the URL object
  URL.revokeObjectURL(url);
};

/**
 * Downloads a binary blob as a file
 */
export const downloadZipFile = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * UPDATED: Enhanced JSON file upload with format standardization
 * @returns Promise resolving to the parsed and standardized JSON data
 */
export const uploadJsonFile = (): Promise<DomainExportData> => {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }
      
      if (!file.name.toLowerCase().endsWith('.json')) {
        reject(new Error('Please select a JSON file'));
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          const rawData = JSON.parse(text);
          
          const standardizedData = standardizeImportData(rawData);
          resolve(standardizedData);
        } catch (error) {
          reject(new Error('Invalid JSON file: ' + (error instanceof Error ? error.message : 'Unknown error')));
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Failed to read file'));
      };
      
      reader.readAsText(file);
    };
    
    input.click();
  });
};

/**
 * UPDATED: Enhanced validation with standardized format support
 * @param data The data to validate
 * @returns Object with isValid boolean and errors array
 */
export const validateImportData = (data: any): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!data || typeof data !== 'object') {
    errors.push('Data must be an object');
    return { isValid: false, errors };
  }

  if ((!data.definitions || typeof data.definitions !== 'object') && (!data.metaDefinitions || typeof data.metaDefinitions !== 'object')) {
    errors.push('Missing or invalid definitions/metaDefinitions object');
  }

  if ((!data.exercises || typeof data.exercises !== 'object') && (!data.metaExercises || typeof data.metaExercises !== 'object')) {
    errors.push('Missing exercises or metaExercises object');
  }
  
  // Validate definitions structure
  if (data.definitions) {
    for (const [key, def] of Object.entries(data.definitions)) {
      const definition = def as any;
      if (!normalizeImportText(definition.code) || !normalizeImportText(definition.name)) {
        errors.push(`Definition ${key} is missing required fields (code, name)`);
      }
      
      // Check description format - should be array in standardized format
      if (!definition.description) {
        errors.push(`Definition ${key} is missing description`);
      } else if (Array.isArray(definition.description)) {
        const cleaned = definition.description.map((item: string) => normalizeImportText(item)).filter(Boolean);
        if (cleaned.length === 0) {
          errors.push(`Definition ${key} has empty description array`);
        }
      } else if (typeof definition.description === 'string') {
        if (!normalizeImportText(definition.description)) {
          errors.push(`Definition ${key} has empty description string`);
        }
      } else {
        errors.push(`Definition ${key} has invalid description format`);
      }
      // Optional: validate prerequisiteWeights if present
      if (definition.prerequisiteWeights && typeof definition.prerequisiteWeights === 'object') {
        for (const [pcode, w] of Object.entries(definition.prerequisiteWeights)) {
          const wn = Number(w);
          if (isNaN(wn) || wn <= 0 || wn > 1) {
            errors.push(`Definition ${key} has invalid weight for prerequisite ${pcode} (must be 0 < w <= 1)`);
          }
        }
      }
    }
  }
  // Validate metaDefinitions structure
  if (data.metaDefinitions) {
    for (const [key, md] of Object.entries(data.metaDefinitions)) {
      const metaDef = md as any;
      if (!normalizeImportText(metaDef.code) || !normalizeImportText(metaDef.name)) {
        errors.push(`Meta-definition ${key} is missing required fields (code, name)`);
      }
      if (!Array.isArray(metaDef.versions) || metaDef.versions.length === 0) {
        errors.push(`Meta-definition ${key} has no versions`);
      } else {
        // Validate each version
        metaDef.versions.forEach((v: any, idx: number) => {
          if (!normalizeImportText(v.prompt)) {
            errors.push(`Meta-definition ${key} version ${idx} is missing prompt`);
          }
        });
      }
      if (metaDef.prerequisiteWeights && typeof metaDef.prerequisiteWeights === 'object') {
        for (const [pcode, w] of Object.entries(metaDef.prerequisiteWeights)) {
          const wn = Number(w);
          if (isNaN(wn) || wn <= 0 || wn > 1) {
            errors.push(`Meta-definition ${key} has invalid weight for prerequisite ${pcode} (must be 0 < w <= 1)`);
          }
        }
      }
    }
  }

  // Build known code sets for cross-reference
  const knownDefCodes = new Set<string>(Object.values<any>(data.definitions || {}).map((d: any) => d.code || ''));
  const knownMetaDefCodes = new Set<string>(Object.values<any>(data.metaDefinitions || {}).map((d: any) => d.code || ''));
  const knownMetaCodes = new Set<string>(Object.values<any>(data.metaExercises || {}).map((m: any) => m.code || ''));
  
  // Validate metaExercises or legacy exercises
  if (data.metaExercises) {
    for (const [key, node] of Object.entries<any>(data.metaExercises)) {
      if (!normalizeImportText(node.code) || !normalizeImportText(node.name)) {
        errors.push(`Meta-exercise ${key} is missing required fields (code, name)`);
      }
      if (!Array.isArray(node.versions) || node.versions.length === 0) {
        errors.push(`Meta-exercise ${key} has no versions`);
      } else {
        node.versions.forEach((v: any, idx: number) => {
          if (!normalizeImportText(v.statement)) {
            errors.push(`Meta-exercise ${key} version ${idx} has empty statement`);
          }
        });
      }
      if (node.prerequisiteWeights && typeof node.prerequisiteWeights === 'object') {
        for (const [pcode, w] of Object.entries(node.prerequisiteWeights)) {
          const wn = Number(w);
          if (isNaN(wn) || wn <= 0 || wn > 1) {
            errors.push(`Meta-exercise ${key} has invalid weight for prerequisite ${pcode} (must be 0 < w <= 1)`);
          }
        }
      }
      // Cross-check prerequisite codes exist in definitions, metaDefinitions, or metaExercises
      const pre: string[] = Array.isArray(node.prerequisites) ? node.prerequisites : [];
      pre.forEach((p) => {
        if (!knownDefCodes.has(p) && !knownMetaDefCodes.has(p) && !knownMetaCodes.has(p)) {
          errors.push(`Meta-exercise ${key} references unknown prerequisite code: ${p}`);
        }
      });
    }
  } else if (data.exercises) {
    for (const [key, ex] of Object.entries(data.exercises)) {
      const exercise = ex as any;
      if (!normalizeImportText(exercise.code) || !normalizeImportText(exercise.name) || !normalizeImportText(exercise.statement)) {
        errors.push(`Exercise ${key} is missing required fields (code, name, statement)`);
      }
      if (exercise.difficulty !== undefined) {
        const difficulty = typeof exercise.difficulty === 'number' ? exercise.difficulty : parseInt(exercise.difficulty, 10);
        if (isNaN(difficulty) || difficulty < 1 || difficulty > 7) {
          errors.push(`Exercise ${key} has invalid difficulty (must be 1-7)`);
        }
      }
      if (exercise.prerequisiteWeights && typeof exercise.prerequisiteWeights === 'object') {
        for (const [pcode, w] of Object.entries(exercise.prerequisiteWeights)) {
          const wn = Number(w);
          if (isNaN(wn) || wn <= 0 || wn > 1) {
            errors.push(`Exercise ${key} has invalid weight for prerequisite ${pcode} (must be 0 < w <= 1)`);
          }
        }
      }
      // Cross-check prerequisite codes exist in definitions (legacy shape only supports defs)
      const pre: string[] = Array.isArray((ex as any).prerequisites) ? (ex as any).prerequisites : [];
      pre.forEach((p) => {
        if (!knownDefCodes.has(p)) {
          errors.push(`Exercise ${key} references unknown prerequisite code: ${p}`);
        }
      });
    }
  }
  
  return { isValid: errors.length === 0, errors };
};

// Health check API
export const checkHealth = async (): Promise<{ status: string }> => {
  const response = await observedFetch(`${API_URL}/health`);
  return handleResponse(response);
};

/**
 * Parses a description string that may contain multiple descriptions separated by '|||'
 * The backend stores descriptions as a single string, but the frontend can display
 * them as multiple alternatives.
 * 
 * @param description Description string potentially containing multiple parts
 * @returns An array of individual description strings
 */
export const parseDescriptions = (description: string): string[] => {
  if (description.includes('|||')) {
    return description.split('|||');
  }
  return [description];
};

/**
 * Fetches updated graph data from the backend
 * This is useful after making updates to ensure the UI reflects the current state
 * 
 * @param domainId The ID of the domain to refresh graph data for
 * @returns Promise resolving to the updated VisualGraph data
 */
export const refreshGraphData = async (domainId: number): Promise<VisualGraph> => {
  const response = await observedFetch(`${API_URL}/api/domains/${domainId}/graph`, {
    headers: getAuthHeaders(),
  });
  
  return handleResponse(response);
};

// DOMAIN NETWORK API

/**
 * Lists user-defined domain links, optionally filtered to certain domain IDs
 */
export const getDomainLinks = async (domainIds?: number[]): Promise<DomainLink[]> => {
  const params = domainIds && domainIds.length > 0 ? `?domainIds=${domainIds.join(',')}` : '';
  const response = await observedFetch(`${API_URL}/api/network/links${params}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};

/**
 * Creates a user-defined link between two domains
 */
export const createDomainLink = async (domainId1: number, domainId2: number): Promise<DomainLink> => {
  const response = await observedFetch(`${API_URL}/api/network/links`, {
    method: 'POST',
    headers: { 
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ domainId1, domainId2 }),
  });
  return handleResponse(response);
};

/**
 * Deletes a user-defined link by ID
 */
export const deleteDomainLink = async (linkId: number): Promise<void> => {
  const response = await observedFetch(`${API_URL}/api/network/links/${linkId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return handleResponse(response);
};
