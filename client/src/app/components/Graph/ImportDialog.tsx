// File: client/src/app/components/Graph/ImportDialog.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { load as loadYaml } from 'js-yaml';
import { AlertCircle, CheckCircle2, Info, Upload, X } from 'lucide-react';

import { Button } from '@/app/components/core/button';
import { Input } from '@/app/components/core/input';
import { showToast } from '@/app/components/core/ToastNotification';
import {
  DomainExportData,
  exportDomainAsJson,
  importDomainBackup,
  importToDomain,
  standardizeImportData,
} from '@/lib/api';

interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  domainId: number;
  domainName: string;
  onSuccess?: () => void;
}

type ImportData = DomainExportData;
type RawImportObject = Record<string, any>;
type ImportTextFormat = 'auto' | 'json' | 'yaml';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  definitionCount: number;
  metaDefinitionCount: number;
  exerciseCount: number;
  metaExerciseCount: number;
  sourceCount: number;
  questCount: number;
  relationCount: number;
  versionCount: number;
  definitionVersionCount: number;
  groupCount: number;
}

interface OverwriteFieldDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

interface OverwriteNodeDiff {
  nodeType: 'metaDefinition' | 'metaExercise' | 'source' | 'quest';
  code: string;
  nodeName: string;
  fieldDiffs: OverwriteFieldDiff[];
}

interface ImportPreparation {
  payload: ImportData | null;
  overwriteNodes: OverwriteNodeDiff[];
  errors: string[];
}

interface NodePosition {
  x: number;
  y: number;
}

const STORAGE_KEY = 'ankidemy.import.onDuplicate';

const DEF_VERSION_FIELDS = [
  'prompt',
  'type',
  'description',
  'notes',
  'references',
  'promptImagePath',
  'descriptionImagePath',
];

const EX_VERSION_FIELDS = [
  'statement',
  'description',
  'hints',
  'verifiable',
  'result',
  'difficulty',
  'notes',
  'statementImagePath',
  'descriptionImagePath',
];

const QUEST_VERSION_FIELDS = [
  'title',
  'descriptionMd',
  'taskList',
  'imagePath',
];

const isPlainObject = (value: unknown): value is Record<string, any> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const hasOwn = (value: unknown, key: string): boolean => (
  isPlainObject(value) && Object.prototype.hasOwnProperty.call(value, key)
);

const normalizeText = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const isFiniteNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value)
);

const cloneImportData = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const normalizeForStableStringify = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(normalizeForStableStringify);
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    Object.keys(value).sort().forEach((key) => {
      out[key] = normalizeForStableStringify(value[key]);
    });
    return out;
  }
  return value;
};

const toStableString = (value: unknown): string => {
  if (typeof value === 'undefined') return 'undefined';
  return JSON.stringify(normalizeForStableStringify(value));
};

const areEqual = (a: unknown, b: unknown): boolean => toStableString(a) === toStableString(b);

const formatPreviewValue = (value: unknown): string => {
  if (value === undefined || value === null) return '(empty)';
  if (typeof value === 'string') return value || '(empty)';
  const rendered = JSON.stringify(normalizeForStableStringify(value), null, 2);
  return rendered || '(empty)';
};

const toRecord = (value: unknown): Record<string, any> => (
  isPlainObject(value) ? value : {}
);

const sanitizeCodeBase = (value: string, fallback: string): string => {
  const base = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return base || fallback;
};

const generateDotSuffixedCode = (base: string, used: Set<string>): string => {
  if (!used.has(base)) return base;
  for (let i = 1; i < 10000; i += 1) {
    const candidate = `${base}.${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}.${Date.now()}`;
};

const generateSequentialCode = (prefix: string, used: Set<string>): string => {
  for (let i = 1; i < 10000; i += 1) {
    const candidate = `${prefix}${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${prefix}${Date.now()}`;
};

const buildRelationIndex = (
  relations: NonNullable<ImportData['relations']> | undefined
): Map<string, string[]> => {
  const idx = new Map<string, Set<string>>();
  if (!Array.isArray(relations)) return new Map<string, string[]>();

  relations.forEach((rel) => {
    const from = normalizeText(rel.fromCode);
    const to = normalizeText(rel.toCode);
    if (!from || !to) return;
    if (!idx.has(from)) idx.set(from, new Set<string>());
    if (!idx.has(to)) idx.set(to, new Set<string>());
    idx.get(from)?.add(to);
    idx.get(to)?.add(from);
  });

  const output = new Map<string, string[]>();
  idx.forEach((value, key) => {
    output.set(key, Array.from(value));
  });
  return output;
};

const registerPosition = (positions: Map<string, NodePosition>, code: string, node: any): void => {
  if (!code) return;
  if (isFiniteNumber(node?.xPosition) && isFiniteNumber(node?.yPosition)) {
    positions.set(code, { x: node.xPosition, y: node.yPosition });
  }
};

const computeFallbackPosition = (positions: Map<string, NodePosition>): NodePosition => {
  if (positions.size === 0) return { x: 0, y: 0 };
  let sumX = 0;
  let sumY = 0;
  positions.forEach((pos) => {
    sumX += pos.x;
    sumY += pos.y;
  });
  return {
    x: sumX / positions.size,
    y: sumY / positions.size,
  };
};

const randomJitter = (): number => (Math.random() - 0.5) * 110;

const chooseAnchorPosition = (linkedCodes: string[], positions: Map<string, NodePosition>): NodePosition | null => {
  for (const linked of linkedCodes) {
    const pos = positions.get(linked);
    if (pos) return pos;
  }
  return null;
};

const uniqueCodes = (codes: string[]): string[] => {
  const out = new Set<string>();
  codes.forEach((code) => {
    const clean = normalizeText(code);
    if (clean) out.add(clean);
  });
  return Array.from(out);
};

const ensureNodePosition = (params: {
  node: any;
  rawNode: unknown;
  code: string;
  linkedCodes: string[];
  knownPositions: Map<string, NodePosition>;
  fallback: NodePosition;
  keepCurrentWhenMissing: boolean;
}) => {
  const {
    node,
    rawNode,
    code,
    linkedCodes,
    knownPositions,
    fallback,
    keepCurrentWhenMissing,
  } = params;

  const hasRawX = hasOwn(rawNode, 'xPosition');
  const hasRawY = hasOwn(rawNode, 'yPosition');
  const currentX = Number(node?.xPosition);
  const currentY = Number(node?.yPosition);
  const hasCurrentX = Number.isFinite(currentX);
  const hasCurrentY = Number.isFinite(currentY);
  const anchor = chooseAnchorPosition(linkedCodes, knownPositions) || fallback;

  if (hasRawX && hasCurrentX) {
    node.xPosition = currentX;
  } else if (!keepCurrentWhenMissing || !hasCurrentX) {
    node.xPosition = anchor.x + randomJitter();
  }

  if (hasRawY && hasCurrentY) {
    node.yPosition = currentY;
  } else if (!keepCurrentWhenMissing || !hasCurrentY) {
    node.yPosition = anchor.y + randomJitter();
  }

  registerPosition(knownPositions, code, node);
};

const mergeFieldFromExisting = (
  node: any,
  existingNode: any,
  rawNode: unknown,
  field: string,
  diffs: OverwriteFieldDiff[]
) => {
  if (hasOwn(rawNode, field)) {
    if (!areEqual(node?.[field], existingNode?.[field])) {
      diffs.push({
        field,
        oldValue: existingNode?.[field],
        newValue: node?.[field],
      });
    }
    return;
  }
  if (typeof existingNode?.[field] !== 'undefined') {
    node[field] = existingNode[field];
  }
};

const mergeVersionList = (
  incoming: unknown,
  existing: unknown,
  rawVersions: unknown,
  fields: string[]
): any[] => {
  const incomingArr = Array.isArray(incoming) ? incoming : [];
  const existingArr = Array.isArray(existing) ? existing : [];
  const rawArr = Array.isArray(rawVersions) ? rawVersions : null;

  if (!rawArr) return existingArr;

  const total = Math.max(incomingArr.length, existingArr.length, rawArr.length);
  const merged: any[] = [];

  for (let i = 0; i < total; i += 1) {
    const incomingVersion = isPlainObject(incomingArr[i]) ? { ...incomingArr[i] } : {};
    const existingVersion = isPlainObject(existingArr[i]) ? existingArr[i] : {};
    const rawVersion = rawArr[i];

    if (!isPlainObject(rawVersion)) {
      if (Object.keys(existingVersion).length > 0) {
        merged.push({ ...existingVersion });
      } else if (Object.keys(incomingVersion).length > 0) {
        merged.push(incomingVersion);
      }
      continue;
    }

    const out = { ...incomingVersion };
    fields.forEach((field) => {
      if (!hasOwn(rawVersion, field) && hasOwn(existingVersion, field)) {
        out[field] = existingVersion[field];
      }
    });
    Object.entries(existingVersion).forEach(([field, value]) => {
      if (!hasOwn(rawVersion, field) && !hasOwn(out, field)) {
        out[field] = value;
      }
    });

    if (Object.keys(out).length > 0) {
      merged.push(out);
    }
  }

  return merged;
};

const toLegacyDefinitionDescription = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeText(entry))
      .filter(Boolean)
      .join('|||');
  }
  if (typeof value === 'string') {
    return normalizeText(value);
  }
  return '';
};

const prepareImportDataForSubmit = (
  importData: ImportData,
  rawImportData: RawImportObject | null,
  existingDomainData: ImportData | null,
  importAsNewNodes: boolean,
  isLoadingExistingDomainData: boolean
): ImportPreparation => {
  if (!rawImportData) {
    return { payload: importData, overwriteNodes: [], errors: [] };
  }

  const payload = cloneImportData(importData);
  const overwriteNodes: OverwriteNodeDiff[] = [];
  const errors: string[] = [];

  if (!importAsNewNodes && !existingDomainData && !isLoadingExistingDomainData) {
    errors.push('Unable to load current domain data for overwrite preview. Enable "Import as new nodes instead" to continue.');
    return { payload, overwriteNodes, errors };
  }

  // Normalize legacy import shape into pooled shape so merge/diff logic is consistent.
  if ((!payload.metaDefinitions || Object.keys(payload.metaDefinitions).length === 0) && payload.definitions) {
    const convertedMetaDefs: Record<string, any> = {};
    Object.entries(payload.definitions).forEach(([key, definition]) => {
      const code = normalizeText((definition as any).code || key);
      const name = normalizeText((definition as any).name || code);
      const description = toLegacyDefinitionDescription((definition as any).description);
      convertedMetaDefs[key] = {
        code,
        name,
        prerequisites: (definition as any).prerequisites,
        prerequisiteWeights: (definition as any).prerequisiteWeights,
        xPosition: (definition as any).xPosition,
        yPosition: (definition as any).yPosition,
        versions: [{
          prompt: name ? `Define ${name}` : 'Define the concept',
          type: 'open_ended',
          description,
          notes: (definition as any).notes,
          references: (definition as any).references,
        }],
      };
    });
    payload.metaDefinitions = convertedMetaDefs;
    delete payload.definitions;
  }

  if ((!payload.metaExercises || Object.keys(payload.metaExercises).length === 0) && payload.exercises) {
    const convertedMetaExercises: Record<string, any> = {};
    Object.entries(payload.exercises).forEach(([key, exercise]) => {
      const code = normalizeText((exercise as any).code || key);
      const name = normalizeText((exercise as any).name || code);
      convertedMetaExercises[key] = {
        code,
        name,
        prerequisites: (exercise as any).prerequisites,
        prerequisiteWeights: (exercise as any).prerequisiteWeights,
        xPosition: (exercise as any).xPosition,
        yPosition: (exercise as any).yPosition,
        versions: [{
          statement: normalizeText((exercise as any).statement),
          description: (exercise as any).description,
          hints: (exercise as any).hints,
          verifiable: (exercise as any).verifiable,
          result: (exercise as any).result,
          difficulty: (exercise as any).difficulty,
          notes: (exercise as any).notes,
        }],
      };
    });
    payload.metaExercises = convertedMetaExercises;
    delete payload.exercises;
  }

  const existingMetaDefs = new Map<string, any>();
  const existingMetaExercises = new Map<string, any>();
  const existingSources = new Map<string, any>();
  const existingQuests = new Map<string, any>();
  const usedCodes = new Set<string>();
  const knownPositions = new Map<string, NodePosition>();

  Object.entries(existingDomainData?.metaDefinitions || {}).forEach(([key, node]) => {
    const code = normalizeText((node as any).code || key);
    if (!code) return;
    existingMetaDefs.set(code, node);
    usedCodes.add(code);
    registerPosition(knownPositions, code, node);
  });
  Object.entries(existingDomainData?.metaExercises || {}).forEach(([key, node]) => {
    const code = normalizeText((node as any).code || key);
    if (!code) return;
    existingMetaExercises.set(code, node);
    usedCodes.add(code);
    registerPosition(knownPositions, code, node);
  });
  Object.entries(existingDomainData?.sources || {}).forEach(([key, node]) => {
    const code = normalizeText((node as any).code || key);
    if (!code) return;
    existingSources.set(code, node);
    usedCodes.add(code);
    registerPosition(knownPositions, code, node);
  });
  Object.entries(existingDomainData?.quests || {}).forEach(([key, node]) => {
    const code = normalizeText((node as any).code || key);
    if (!code) return;
    existingQuests.set(code, node);
    usedCodes.add(code);
    registerPosition(knownPositions, code, node);
  });

  const ensureMapCodes = (
    nodeMap: Record<string, any> | undefined,
    defaultBase: string,
    mode: 'dot' | 'source' | 'quest'
  ) => {
    if (!nodeMap) return;
    Object.entries(nodeMap).forEach(([key, node]) => {
      let code = normalizeText(node?.code || key);
      if (!code) {
        if (mode === 'source') {
          code = generateSequentialCode('S', usedCodes);
        } else if (mode === 'quest') {
          code = generateSequentialCode('Q', usedCodes);
        } else {
          const base = sanitizeCodeBase(node?.name || defaultBase, defaultBase);
          code = generateDotSuffixedCode(base, usedCodes);
        }
      }
      node.code = code;
      usedCodes.add(code);
    });
  };

  ensureMapCodes(payload.metaDefinitions as Record<string, any> | undefined, 'concept', 'dot');
  ensureMapCodes(payload.metaExercises as Record<string, any> | undefined, 'exercise', 'dot');
  ensureMapCodes(payload.sources as Record<string, any> | undefined, 'source', 'source');
  ensureMapCodes(payload.quests as Record<string, any> | undefined, 'quest', 'quest');

  let rawMetaDefs = toRecord(rawImportData.metaDefinitions);
  if (Object.keys(rawMetaDefs).length === 0) {
    const rawDefinitions = toRecord(rawImportData.definitions);
    const convertedRawMetaDefs: Record<string, any> = {};
    Object.entries(rawDefinitions).forEach(([key, definition]) => {
      const rawNode: Record<string, any> = {};
      if (hasOwn(definition, 'code')) rawNode.code = (definition as any).code;
      if (hasOwn(definition, 'name')) rawNode.name = (definition as any).name;
      if (hasOwn(definition, 'prerequisites')) rawNode.prerequisites = (definition as any).prerequisites;
      if (hasOwn(definition, 'prerequisiteWeights')) rawNode.prerequisiteWeights = (definition as any).prerequisiteWeights;
      if (hasOwn(definition, 'xPosition')) rawNode.xPosition = (definition as any).xPosition;
      if (hasOwn(definition, 'yPosition')) rawNode.yPosition = (definition as any).yPosition;

      const versionRaw: Record<string, any> = {};
      if (hasOwn(definition, 'description')) {
        versionRaw.description = (definition as any).description;
      }
      if (hasOwn(definition, 'notes')) {
        versionRaw.notes = (definition as any).notes;
      }
      if (hasOwn(definition, 'references')) {
        versionRaw.references = (definition as any).references;
      }
      if (Object.keys(versionRaw).length > 0) {
        rawNode.versions = [versionRaw];
      }

      convertedRawMetaDefs[key] = rawNode;
    });
    rawMetaDefs = convertedRawMetaDefs;
  }

  let rawMetaExercises = toRecord(rawImportData.metaExercises);
  if (Object.keys(rawMetaExercises).length === 0) {
    const rawExercises = toRecord(rawImportData.exercises);
    const convertedRawMetaExercises: Record<string, any> = {};
    Object.entries(rawExercises).forEach(([key, exercise]) => {
      const rawNode: Record<string, any> = {};
      if (hasOwn(exercise, 'code')) rawNode.code = (exercise as any).code;
      if (hasOwn(exercise, 'name')) rawNode.name = (exercise as any).name;
      if (hasOwn(exercise, 'prerequisites')) rawNode.prerequisites = (exercise as any).prerequisites;
      if (hasOwn(exercise, 'prerequisiteWeights')) rawNode.prerequisiteWeights = (exercise as any).prerequisiteWeights;
      if (hasOwn(exercise, 'xPosition')) rawNode.xPosition = (exercise as any).xPosition;
      if (hasOwn(exercise, 'yPosition')) rawNode.yPosition = (exercise as any).yPosition;

      const versionRaw: Record<string, any> = {};
      if (hasOwn(exercise, 'statement')) versionRaw.statement = (exercise as any).statement;
      if (hasOwn(exercise, 'description')) versionRaw.description = (exercise as any).description;
      if (hasOwn(exercise, 'hints')) versionRaw.hints = (exercise as any).hints;
      if (hasOwn(exercise, 'verifiable')) versionRaw.verifiable = (exercise as any).verifiable;
      if (hasOwn(exercise, 'result')) versionRaw.result = (exercise as any).result;
      if (hasOwn(exercise, 'difficulty')) versionRaw.difficulty = (exercise as any).difficulty;
      if (hasOwn(exercise, 'notes')) versionRaw.notes = (exercise as any).notes;
      if (Object.keys(versionRaw).length > 0) {
        rawNode.versions = [versionRaw];
      }

      convertedRawMetaExercises[key] = rawNode;
    });
    rawMetaExercises = convertedRawMetaExercises;
  }

  const rawSources = toRecord(rawImportData.sources);
  const rawQuests = toRecord(rawImportData.quests);
  const relationIndex = buildRelationIndex(payload.relations);
  const fallback = computeFallbackPosition(knownPositions);

  Object.entries(payload.metaDefinitions || {}).forEach(([key, node]) => {
    const metaDef = node as any;
    const code = normalizeText(metaDef.code || key);
    const rawNode = rawMetaDefs[key];
    const existingNode = existingMetaDefs.get(code);
    const linkedCodes = uniqueCodes([
      ...(Array.isArray(metaDef.prerequisites) ? metaDef.prerequisites : []),
      ...(relationIndex.get(code) || []),
    ]);

    if (existingNode && !importAsNewNodes) {
      const diffs: OverwriteFieldDiff[] = [];
      mergeFieldFromExisting(metaDef, existingNode, rawNode, 'name', diffs);
      mergeFieldFromExisting(metaDef, existingNode, rawNode, 'prerequisites', diffs);
      mergeFieldFromExisting(metaDef, existingNode, rawNode, 'prerequisiteWeights', diffs);
      mergeFieldFromExisting(metaDef, existingNode, rawNode, 'xPosition', diffs);
      mergeFieldFromExisting(metaDef, existingNode, rawNode, 'yPosition', diffs);

      if (!hasOwn(rawNode, 'versions')) {
        metaDef.versions = existingNode.versions;
      } else {
        metaDef.versions = mergeVersionList(metaDef.versions, existingNode.versions, rawNode?.versions, DEF_VERSION_FIELDS);
        if (!areEqual(metaDef.versions, existingNode.versions)) {
          diffs.push({
            field: 'versions',
            oldValue: existingNode.versions,
            newValue: metaDef.versions,
          });
        }
      }

      if (diffs.length > 0) {
        overwriteNodes.push({
          nodeType: 'metaDefinition',
          code,
          nodeName: normalizeText(metaDef.name) || normalizeText(existingNode?.name) || code,
          fieldDiffs: diffs,
        });
      }

      ensureNodePosition({
        node: metaDef,
        rawNode,
        code,
        linkedCodes,
        knownPositions,
        fallback,
        keepCurrentWhenMissing: true,
      });
      return;
    }

    if (!normalizeText(metaDef.name)) {
      errors.push(`New concept "${code}" is missing a name.`);
    }
    const rawVersions = Array.isArray(rawNode?.versions) ? rawNode.versions : null;
    if (!rawVersions || rawVersions.length === 0 || !rawVersions.some((v: any) => normalizeText(v?.prompt) || normalizeText(v?.description))) {
      errors.push(`New concept "${code}" should include at least one version with prompt/description.`);
    }

    ensureNodePosition({
      node: metaDef,
      rawNode,
      code,
      linkedCodes,
      knownPositions,
      fallback,
      keepCurrentWhenMissing: false,
    });
  });

  Object.entries(payload.metaExercises || {}).forEach(([key, node]) => {
    const metaExercise = node as any;
    const code = normalizeText(metaExercise.code || key);
    const rawNode = rawMetaExercises[key];
    const existingNode = existingMetaExercises.get(code);
    const linkedCodes = uniqueCodes([
      ...(Array.isArray(metaExercise.prerequisites) ? metaExercise.prerequisites : []),
      ...(relationIndex.get(code) || []),
    ]);

    if (existingNode && !importAsNewNodes) {
      const diffs: OverwriteFieldDiff[] = [];
      mergeFieldFromExisting(metaExercise, existingNode, rawNode, 'name', diffs);
      mergeFieldFromExisting(metaExercise, existingNode, rawNode, 'prerequisites', diffs);
      mergeFieldFromExisting(metaExercise, existingNode, rawNode, 'prerequisiteWeights', diffs);
      mergeFieldFromExisting(metaExercise, existingNode, rawNode, 'xPosition', diffs);
      mergeFieldFromExisting(metaExercise, existingNode, rawNode, 'yPosition', diffs);

      if (!hasOwn(rawNode, 'versions')) {
        metaExercise.versions = existingNode.versions;
      } else {
        metaExercise.versions = mergeVersionList(metaExercise.versions, existingNode.versions, rawNode?.versions, EX_VERSION_FIELDS);
        if (!areEqual(metaExercise.versions, existingNode.versions)) {
          diffs.push({
            field: 'versions',
            oldValue: existingNode.versions,
            newValue: metaExercise.versions,
          });
        }
      }

      if (diffs.length > 0) {
        overwriteNodes.push({
          nodeType: 'metaExercise',
          code,
          nodeName: normalizeText(metaExercise.name) || normalizeText(existingNode?.name) || code,
          fieldDiffs: diffs,
        });
      }

      ensureNodePosition({
        node: metaExercise,
        rawNode,
        code,
        linkedCodes,
        knownPositions,
        fallback,
        keepCurrentWhenMissing: true,
      });
      return;
    }

    if (!normalizeText(metaExercise.name)) {
      errors.push(`New exercise "${code}" is missing a name.`);
    }
    const rawVersions = Array.isArray(rawNode?.versions) ? rawNode.versions : null;
    if (!rawVersions || rawVersions.length === 0 || !rawVersions.some((v: any) => normalizeText(v?.statement) || normalizeText(v?.description))) {
      errors.push(`New exercise "${code}" should include at least one version with statement/description.`);
    }

    ensureNodePosition({
      node: metaExercise,
      rawNode,
      code,
      linkedCodes,
      knownPositions,
      fallback,
      keepCurrentWhenMissing: false,
    });
  });

  Object.entries(payload.sources || {}).forEach(([key, node]) => {
    const source = node as any;
    const code = normalizeText(source.code || key);
    const rawNode = rawSources[key];
    const existingNode = existingSources.get(code);
    const linkedCodes = uniqueCodes(relationIndex.get(code) || []);

    if (existingNode && !importAsNewNodes) {
      const diffs: OverwriteFieldDiff[] = [];
      mergeFieldFromExisting(source, existingNode, rawNode, 'title', diffs);
      mergeFieldFromExisting(source, existingNode, rawNode, 'contentMd', diffs);
      mergeFieldFromExisting(source, existingNode, rawNode, 'bibtexKey', diffs);
      mergeFieldFromExisting(source, existingNode, rawNode, 'filePath', diffs);
      mergeFieldFromExisting(source, existingNode, rawNode, 'xPosition', diffs);
      mergeFieldFromExisting(source, existingNode, rawNode, 'yPosition', diffs);

      if (diffs.length > 0) {
        overwriteNodes.push({
          nodeType: 'source',
          code,
          nodeName: normalizeText(source.title) || normalizeText(existingNode?.title) || code,
          fieldDiffs: diffs,
        });
      }

      ensureNodePosition({
        node: source,
        rawNode,
        code,
        linkedCodes,
        knownPositions,
        fallback,
        keepCurrentWhenMissing: true,
      });
      return;
    }

    if (!normalizeText(source.title)) {
      errors.push(`New source "${code}" is missing a title.`);
    }

    ensureNodePosition({
      node: source,
      rawNode,
      code,
      linkedCodes,
      knownPositions,
      fallback,
      keepCurrentWhenMissing: false,
    });
  });

  Object.entries(payload.quests || {}).forEach(([key, node]) => {
    const quest = node as any;
    const code = normalizeText(quest.code || key);
    const rawNode = rawQuests[key];
    const existingNode = existingQuests.get(code);
    const linkedCodes = uniqueCodes(relationIndex.get(code) || []);

    if (existingNode && !importAsNewNodes) {
      const diffs: OverwriteFieldDiff[] = [];
      mergeFieldFromExisting(quest, existingNode, rawNode, 'name', diffs);
      mergeFieldFromExisting(quest, existingNode, rawNode, 'kind', diffs);
      mergeFieldFromExisting(quest, existingNode, rawNode, 'schedule', diffs);
      mergeFieldFromExisting(quest, existingNode, rawNode, 'xPosition', diffs);
      mergeFieldFromExisting(quest, existingNode, rawNode, 'yPosition', diffs);

      if (!hasOwn(rawNode, 'versions')) {
        quest.versions = existingNode.versions;
      } else {
        quest.versions = mergeVersionList(quest.versions, existingNode.versions, rawNode?.versions, QUEST_VERSION_FIELDS);
        if (!areEqual(quest.versions, existingNode.versions)) {
          diffs.push({
            field: 'versions',
            oldValue: existingNode.versions,
            newValue: quest.versions,
          });
        }
      }

      if (diffs.length > 0) {
        overwriteNodes.push({
          nodeType: 'quest',
          code,
          nodeName: normalizeText(quest.name) || normalizeText(existingNode?.name) || code,
          fieldDiffs: diffs,
        });
      }

      ensureNodePosition({
        node: quest,
        rawNode,
        code,
        linkedCodes,
        knownPositions,
        fallback,
        keepCurrentWhenMissing: true,
      });
      return;
    }

    if (!normalizeText(quest.kind)) {
      errors.push(`New quest "${code}" is missing kind.`);
    }
    if (typeof quest.schedule === 'undefined') {
      errors.push(`New quest "${code}" is missing schedule.`);
    }
    const rawVersions = Array.isArray(rawNode?.versions) ? rawNode.versions : null;
    if (!rawVersions || rawVersions.length === 0 || !rawVersions.some((v: any) => normalizeText(v?.title) || normalizeText(v?.descriptionMd))) {
      errors.push(`New quest "${code}" should include at least one version with title/description.`);
    }

    ensureNodePosition({
      node: quest,
      rawNode,
      code,
      linkedCodes,
      knownPositions,
      fallback,
      keepCurrentWhenMissing: false,
    });
  });

  return { payload, overwriteNodes, errors };
};

const ImportDialog: React.FC<ImportDialogProps> = ({
  isOpen,
  onClose,
  domainId,
  domainName,
  onSuccess,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importData, setImportData] = useState<ImportData | null>(null);
  const [rawImportData, setRawImportData] = useState<RawImportObject | null>(null);
  const [existingDomainData, setExistingDomainData] = useState<ImportData | null>(null);
  const [existingDomainDataError, setExistingDomainDataError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importAsNewNodes, setImportAsNewNodes] = useState(false);
  const [isZipFile, setIsZipFile] = useState(false);
  const [isPasteMode, setIsPasteMode] = useState(false);
  const [isPasteAreaExpanded, setIsPasteAreaExpanded] = useState(false);
  const [isPasteContentLocked, setIsPasteContentLocked] = useState(false);
  const [hasReviewedPastedContent, setHasReviewedPastedContent] = useState(false);
  const [pasteNeedsReview, setPasteNeedsReview] = useState(false);
  const [pastedContent, setPastedContent] = useState('');
  const [pasteFormat, setPasteFormat] = useState<ImportTextFormat>('auto');
  const [showTooltip, setShowTooltip] = useState(false);
  const [isLoadingExistingDomainData, setIsLoadingExistingDomainData] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'rename' || saved === 'update') {
      setImportAsNewNodes(saved === 'rename');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null);
      setImportData(null);
      setRawImportData(null);
      setValidation(null);
      setIsValidating(false);
      setIsImporting(false);
      setIsZipFile(false);
      setIsPasteMode(false);
      setIsPasteAreaExpanded(false);
      setIsPasteContentLocked(false);
      setHasReviewedPastedContent(false);
      setPasteNeedsReview(false);
      setPastedContent('');
      setPasteFormat('auto');
      setShowTooltip(false);
      setExistingDomainData(null);
      setExistingDomainDataError(null);
      setIsLoadingExistingDomainData(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoadingExistingDomainData(true);
    setExistingDomainDataError(null);

    exportDomainAsJson(domainId)
      .then((data) => {
        if (cancelled) return;
        setExistingDomainData(data);
      })
      .catch((error) => {
        if (cancelled) return;
        setExistingDomainData(null);
        const message = error instanceof Error ? error.message : 'Unknown error';
        setExistingDomainDataError(`Failed to load current domain data for overwrite preview: ${message}`);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingExistingDomainData(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [domainId, isOpen]);

  const validateImportData = (data: ImportData): ValidationResult => {
    const errors: string[] = [];
    let definitionCount = 0;
    let metaDefinitionCount = 0;
    let exerciseCount = 0;
    let metaExerciseCount = 0;
    let sourceCount = 0;
    let questCount = 0;
    let relationCount = 0;
    let versionCount = 0;
    let definitionVersionCount = 0;
    let groupCount = 0;

    const allCodes = new Map<string, string>();

    if (data.metaDefinitions && Object.keys(data.metaDefinitions).length > 0) {
      metaDefinitionCount = Object.keys(data.metaDefinitions).length;
      for (const [code, md] of Object.entries(data.metaDefinitions)) {
        if (!md.code) {
          errors.push(`MetaDefinition ${code} has empty code`);
        }
        if (!md.name) {
          errors.push(`MetaDefinition ${code} has empty name`);
        }
        if (!md.versions || md.versions.length === 0) {
          errors.push(`MetaDefinition ${code} has no versions`);
        } else {
          definitionVersionCount += md.versions.length;
          md.versions.forEach((v, idx) => {
            if (!v.prompt) {
              errors.push(`MetaDefinition ${code} version ${idx} has empty prompt`);
            }
          });
        }

        const existingType = allCodes.get(md.code || code);
        if (existingType) {
          errors.push(`Duplicate code found: ${md.code || code} (${existingType} and metaDefinition)`);
        } else {
          allCodes.set(md.code || code, 'metaDefinition');
        }
      }
    } else if (data.definitions) {
      definitionCount = Object.keys(data.definitions).length;
      for (const [code, def] of Object.entries(data.definitions)) {
        if (!def.code) {
          errors.push(`Definition ${code} has empty code`);
        }
        if (!def.name) {
          errors.push(`Definition ${code} has empty name`);
        }
        if (!def.description || (Array.isArray(def.description) && def.description.length === 0)) {
          errors.push(`Definition ${code} has empty description`);
        }

        const existingType = allCodes.get(def.code || code);
        if (existingType) {
          errors.push(`Duplicate code found: ${def.code || code} (${existingType} and definition)`);
        } else {
          allCodes.set(def.code || code, 'definition');
        }
      }
    }

    if (data.metaExercises && Object.keys(data.metaExercises).length > 0) {
      metaExerciseCount = Object.keys(data.metaExercises).length;
      for (const [code, me] of Object.entries(data.metaExercises)) {
        if (!me.code) {
          errors.push(`MetaExercise ${code} has empty code`);
        }
        if (!me.name) {
          errors.push(`MetaExercise ${code} has empty name`);
        }
        if (!me.versions || me.versions.length === 0) {
          errors.push(`MetaExercise ${code} has no versions`);
        } else {
          versionCount += me.versions.length;
        }

        const existingType = allCodes.get(me.code || code);
        if (existingType) {
          errors.push(`Duplicate code found: ${me.code || code} (${existingType} and metaExercise)`);
        } else {
          allCodes.set(me.code || code, 'metaExercise');
        }
      }
    } else if (data.exercises) {
      exerciseCount = Object.keys(data.exercises).length;
      for (const [code, ex] of Object.entries(data.exercises)) {
        if (!ex.code) {
          errors.push(`Exercise ${code} has empty code`);
        }
        if (!ex.name) {
          errors.push(`Exercise ${code} has empty name`);
        }
        if (!ex.statement) {
          errors.push(`Exercise ${code} has empty statement`);
        }

        const existingType = allCodes.get(ex.code || code);
        if (existingType) {
          errors.push(`Duplicate code found: ${ex.code || code} (${existingType} and exercise)`);
        } else {
          allCodes.set(ex.code || code, 'exercise');
        }
      }
    }

    if (data.sources && Object.keys(data.sources).length > 0) {
      sourceCount = Object.keys(data.sources).length;
      for (const [code, src] of Object.entries(data.sources)) {
        if (!src.code) {
          errors.push(`Source ${code} has empty code`);
        }
        if (!src.title) {
          errors.push(`Source ${code} has empty title`);
        }
        const key = src.code || code;
        const existingType = allCodes.get(key);
        if (existingType) {
          errors.push(`Duplicate code found: ${key} (${existingType} and source)`);
        } else {
          allCodes.set(key, 'source');
        }
      }
    }

    if (data.quests && Object.keys(data.quests).length > 0) {
      questCount = Object.keys(data.quests).length;
      for (const [code, mq] of Object.entries(data.quests)) {
        if (!mq.code) {
          errors.push(`Quest ${code} has empty code`);
        }
        if (!mq.name) {
          errors.push(`Quest ${code} has empty name`);
        }
        if (!mq.versions || mq.versions.length === 0) {
          errors.push(`Quest ${code} has no versions`);
        }
        const key = mq.code || code;
        const existingType = allCodes.get(key);
        if (existingType) {
          errors.push(`Duplicate code found: ${key} (${existingType} and quest)`);
        } else {
          allCodes.set(key, 'quest');
        }
      }
    }

    if (Array.isArray(data.relations)) {
      relationCount = data.relations.length;
      data.relations.forEach((rel, idx) => {
        if (!rel.fromType || !rel.fromCode || !rel.toType || !rel.toCode) {
          errors.push(`Relation ${idx + 1} is missing required fields`);
          return;
        }
        if (!allCodes.has(rel.fromCode)) {
          errors.push(`Relation ${idx + 1} references unknown code ${rel.fromCode}`);
        }
        if (!allCodes.has(rel.toCode)) {
          errors.push(`Relation ${idx + 1} references unknown code ${rel.toCode}`);
        }
      });
    }

    if (Array.isArray(data.groups)) {
      groupCount = data.groups.length;
      data.groups.forEach((group, idx) => {
        if (!group.name) {
          errors.push(`Group ${idx + 1} has empty name`);
        }
        if (!group.seeds || group.seeds.length === 0) {
          errors.push(`Group ${group.name || idx + 1} has no seeds`);
        } else {
          group.seeds.forEach((seed) => {
            if (!seed.code) {
              errors.push(`Group ${group.name || idx + 1} has seed with empty code`);
            } else if (!allCodes.has(seed.code)) {
              errors.push(`Group ${group.name || idx + 1} references unknown code ${seed.code}`);
            }
          });
        }
        (group.members || []).forEach((member) => {
          if (!member.code) {
            errors.push(`Group ${group.name || idx + 1} has member with empty code`);
          } else if (!allCodes.has(member.code)) {
            errors.push(`Group ${group.name || idx + 1} references unknown code ${member.code}`);
          }
        });
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      definitionCount,
      metaDefinitionCount,
      exerciseCount,
      metaExerciseCount,
      sourceCount,
      questCount,
      relationCount,
      versionCount,
      definitionVersionCount,
      groupCount,
    };
  };

  const importPreparation = useMemo<ImportPreparation>(() => {
    if (!importData || isZipFile) {
      return { payload: importData, overwriteNodes: [], errors: [] };
    }
    return prepareImportDataForSubmit(
      importData,
      rawImportData,
      existingDomainData,
      importAsNewNodes,
      isLoadingExistingDomainData
    );
  }, [
    existingDomainData,
    importAsNewNodes,
    importData,
    isLoadingExistingDomainData,
    isZipFile,
    rawImportData,
  ]);

  const resolvedValidation = useMemo<ValidationResult | null>(() => {
    if (!validation) return null;
    const mergedErrors = [...validation.errors, ...importPreparation.errors];
    const uniqueErrorList = Array.from(new Set(mergedErrors));
    return {
      ...validation,
      isValid: validation.isValid && uniqueErrorList.length === 0,
      errors: uniqueErrorList,
    };
  }, [importPreparation.errors, validation]);

  const clearParsedImportState = () => {
    setImportData(null);
    setRawImportData(null);
    setValidation(null);
    setIsZipFile(false);
  };

  const parseImportObject = (text: string, format: ImportTextFormat, sourceLabel: string): RawImportObject => {
    const content = text.trim();
    if (!content) {
      throw new Error(`${sourceLabel} is empty`);
    }

    const parseJson = () => JSON.parse(content);
    const parseYaml = () => loadYaml(content);

    let parsed: unknown;

    if (format === 'json') {
      parsed = parseJson();
    } else if (format === 'yaml') {
      parsed = parseYaml();
    } else {
      // Auto-detect: try JSON first, then YAML fallback.
      try {
        parsed = parseJson();
      } catch {
        parsed = parseYaml();
      }
    }

    if (!isPlainObject(parsed)) {
      throw new Error(`Invalid ${sourceLabel}: expected an object at the root`);
    }
    return parsed;
  };

  const parseFileToImportObject = (text: string, filename: string): RawImportObject => {
    const lower = filename.toLowerCase();
    const isYaml = lower.endsWith('.yaml') || lower.endsWith('.yml');
    const isJson = lower.endsWith('.json');

    if (!isYaml && !isJson) {
      throw new Error('Unsupported file extension. Use .json, .yaml, .yml, or .zip');
    }

    return parseImportObject(text, isYaml ? 'yaml' : 'json', 'file content');
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      clearParsedImportState();
      return;
    }

    setIsPasteMode(false);
    setIsPasteAreaExpanded(false);
    setIsPasteContentLocked(false);
    setHasReviewedPastedContent(false);
    setPasteNeedsReview(false);
    setSelectedFile(file);
    const isZip = file.name.toLowerCase().endsWith('.zip');
    setIsZipFile(isZip);

    if (isZip) {
      setImportData(null);
      setRawImportData(null);
      setValidation({
        isValid: true,
        errors: [],
        definitionCount: 0,
        metaDefinitionCount: 0,
        exerciseCount: 0,
        metaExerciseCount: 0,
        sourceCount: 0,
        questCount: 0,
        relationCount: 0,
        versionCount: 0,
        definitionVersionCount: 0,
        groupCount: 0,
      });
      return;
    }

    setIsValidating(true);

    try {
      const text = await file.text();
      const raw = parseFileToImportObject(text, file.name);
      const standardized: ImportData = standardizeImportData(raw);
      setRawImportData(raw);
      setImportData(standardized);
      const validationResult = validateImportData(standardized);
      setValidation(validationResult);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      setValidation({
        isValid: false,
        errors: [detail],
        definitionCount: 0,
        metaDefinitionCount: 0,
        exerciseCount: 0,
        metaExerciseCount: 0,
        sourceCount: 0,
        questCount: 0,
        relationCount: 0,
        versionCount: 0,
        definitionVersionCount: 0,
        groupCount: 0,
      });
      setImportData(null);
      setRawImportData(null);
    } finally {
      setIsValidating(false);
    }
  };

  const handleSwitchToPasteMode = () => {
    setIsPasteMode(true);
    setIsPasteAreaExpanded(true);
    setIsPasteContentLocked(false);
    setHasReviewedPastedContent(false);
    setPasteNeedsReview(false);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    clearParsedImportState();
  };

  const handleSwitchToFileMode = () => {
    setIsPasteMode(false);
    setIsPasteAreaExpanded(false);
    setIsPasteContentLocked(false);
    setHasReviewedPastedContent(false);
    setPasteNeedsReview(false);
    setPastedContent('');
    setPasteFormat('auto');
    clearParsedImportState();
  };

  const handlePastedContentChange = (nextValue: string) => {
    if (isPasteContentLocked) return;
    setPastedContent(nextValue);
    if (hasReviewedPastedContent) {
      setHasReviewedPastedContent(false);
      setPasteNeedsReview(true);
      clearParsedImportState();
    }
  };

  const handleReviewPastedContent = () => {
    if (isPasteContentLocked) return;
    setIsValidating(true);
    try {
      const raw = parseImportObject(pastedContent, pasteFormat, 'pasted content');
      const standardized: ImportData = standardizeImportData(raw);
      setSelectedFile(null);
      setIsZipFile(false);
      setRawImportData(raw);
      setImportData(standardized);
      setValidation(validateImportData(standardized));
      setHasReviewedPastedContent(true);
      setPasteNeedsReview(false);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      setValidation({
        isValid: false,
        errors: [detail],
        definitionCount: 0,
        metaDefinitionCount: 0,
        exerciseCount: 0,
        metaExerciseCount: 0,
        sourceCount: 0,
        questCount: 0,
        relationCount: 0,
        versionCount: 0,
        definitionVersionCount: 0,
        groupCount: 0,
      });
      setImportData(null);
      setRawImportData(null);
      setHasReviewedPastedContent(false);
    } finally {
      setIsValidating(false);
    }
  };

  const handleImport = async () => {
    if (isPasteMode) {
      if (!importData || !resolvedValidation?.isValid || !hasReviewedPastedContent || pasteNeedsReview) {
        return;
      }
    } else if ((!isZipFile && (!importData || !resolvedValidation?.isValid)) || !selectedFile) {
      return;
    }

    setIsImporting(true);

    try {
      if (isPasteMode) {
        // Freeze and collapse paste editor at import time to avoid repeated re-analysis while editing.
        setIsPasteContentLocked(true);
        setIsPasteAreaExpanded(false);
        const strategy = importAsNewNodes ? 'rename' : 'update';
        localStorage.setItem(STORAGE_KEY, strategy);
        const payload = importPreparation.payload || importData;
        await importToDomain(domainId, payload as ImportData, { onDuplicate: strategy });
      } else if (isZipFile) {
        if (!selectedFile) {
          throw new Error('No ZIP file selected');
        }
        await importDomainBackup(domainId, selectedFile);
      } else {
        const strategy = importAsNewNodes ? 'rename' : 'update';
        localStorage.setItem(STORAGE_KEY, strategy);
        const payload = importPreparation.payload || importData;
        await importToDomain(domainId, payload as ImportData, { onDuplicate: strategy });
      }

      showToast(`Successfully imported data into "${domainName}"`, 'success');
      onSuccess?.();
      onClose();
    } catch (error) {
      if (isPasteMode) {
        setIsPasteContentLocked(false);
      }
      console.error('Import failed:', error);
      showToast(
        error instanceof Error ? error.message : 'Failed to import data',
        'error'
      );
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center border-b p-4">
          <h2 className="text-xl font-bold">Import Domain File</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={isImporting}
          >
            <X size={18} />
          </Button>
        </div>

        <div className="p-6 space-y-4">
          {!isPasteMode ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select JSON, YAML, or ZIP File *
              </label>
              <div className="flex items-center gap-2">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.yaml,.yml,.zip"
                  onChange={handleFileChange}
                  disabled={isImporting}
                  className="flex-1"
                />
                {isValidating && (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900"></div>
                )}
              </div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <p className="text-xs text-gray-500">
                  Import JSON/YAML node data or a full ZIP backup
                </p>
                <button
                  type="button"
                  onClick={handleSwitchToPasteMode}
                  disabled={isImporting}
                  className="text-xs text-blue-700 hover:text-blue-800 underline"
                >
                  Paste content instead
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label className="block text-sm font-medium text-gray-700">
                  Paste JSON or YAML Content *
                </label>
                <button
                  type="button"
                  onClick={handleSwitchToFileMode}
                  disabled={isImporting}
                  className="text-xs text-blue-700 hover:text-blue-800 underline"
                >
                  Upload file instead
                </button>
              </div>

              {!isPasteAreaExpanded ? (
                <div className="flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-3 py-2">
                  <p className="text-xs text-gray-600">
                    Pasted content is collapsed.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsPasteAreaExpanded(true)}
                    disabled={isImporting}
                  >
                    Show Pasted Content
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={pastedContent}
                    onChange={(event) => handlePastedContentChange(event.target.value)}
                    readOnly={isPasteContentLocked || isImporting}
                    placeholder="Paste full JSON or YAML content here..."
                    className="w-full min-h-[220px] rounded border border-gray-300 px-3 py-2 text-sm font-mono text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={pasteFormat}
                      disabled={isImporting || isPasteContentLocked}
                      onChange={(event) => {
                        const next = event.target.value as ImportTextFormat;
                        setPasteFormat(next);
                        if (hasReviewedPastedContent) {
                          setHasReviewedPastedContent(false);
                          setPasteNeedsReview(true);
                          clearParsedImportState();
                        }
                      }}
                      className="h-9 rounded border border-gray-300 bg-white px-2 text-sm text-gray-700"
                    >
                      <option value="auto">Auto detect</option>
                      <option value="json">JSON</option>
                      <option value="yaml">YAML</option>
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleReviewPastedContent}
                      disabled={isValidating || isImporting || isPasteContentLocked || !pastedContent.trim()}
                    >
                      Review Pasted Content
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsPasteAreaExpanded(false)}
                      disabled={isImporting}
                    >
                      Collapse
                    </Button>
                    {isValidating && (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    Parsing and overwrite analysis run only when you click &quot;Review Pasted Content&quot;.
                  </p>
                  {pasteNeedsReview && (
                    <p className="text-xs text-amber-700">
                      Pasted content changed. Click &quot;Review Pasted Content&quot; again before importing.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {resolvedValidation && (
            <div className={`p-4 rounded-md ${resolvedValidation.isValid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="flex items-start gap-2">
                {resolvedValidation.isValid ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1">
                  {resolvedValidation.isValid ? (
                    <div>
                      <p className="text-sm font-medium text-green-800 mb-2">
                        {isZipFile ? 'ZIP backup ready to import' : 'File is valid and ready to import'}
                      </p>
                      {!isZipFile && (
                        <div className="text-xs text-green-700 space-y-1">
                          {resolvedValidation.metaDefinitionCount > 0 ? (
                            <>
                              <p>• {resolvedValidation.metaDefinitionCount} concept pool{resolvedValidation.metaDefinitionCount !== 1 ? 's' : ''} (meta-definitions)</p>
                              <p>• {resolvedValidation.definitionVersionCount} definition version{resolvedValidation.definitionVersionCount !== 1 ? 's' : ''}</p>
                            </>
                          ) : resolvedValidation.definitionCount > 0 ? (
                            <p>• {resolvedValidation.definitionCount} definition{resolvedValidation.definitionCount !== 1 ? 's' : ''} (legacy format)</p>
                          ) : null}
                          {resolvedValidation.metaExerciseCount > 0 ? (
                            <>
                              <p>• {resolvedValidation.metaExerciseCount} exercise pool{resolvedValidation.metaExerciseCount !== 1 ? 's' : ''} (meta-exercises)</p>
                              <p>• {resolvedValidation.versionCount} exercise version{resolvedValidation.versionCount !== 1 ? 's' : ''}</p>
                            </>
                          ) : resolvedValidation.exerciseCount > 0 ? (
                            <p>• {resolvedValidation.exerciseCount} exercise{resolvedValidation.exerciseCount !== 1 ? 's' : ''} (legacy format)</p>
                          ) : null}
                          {resolvedValidation.sourceCount > 0 && (
                            <p>• {resolvedValidation.sourceCount} source{resolvedValidation.sourceCount !== 1 ? 's' : ''}</p>
                          )}
                          {resolvedValidation.questCount > 0 && (
                            <p>• {resolvedValidation.questCount} quest{resolvedValidation.questCount !== 1 ? 's' : ''}</p>
                          )}
                          {resolvedValidation.relationCount > 0 && (
                            <p>• {resolvedValidation.relationCount} relation{resolvedValidation.relationCount !== 1 ? 's' : ''}</p>
                          )}
                          {resolvedValidation.groupCount > 0 && (
                            <p>• {resolvedValidation.groupCount} group{resolvedValidation.groupCount !== 1 ? 's' : ''}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium text-red-800 mb-2">Validation errors:</p>
                      <ul className="text-xs text-red-700 space-y-1 list-disc list-inside">
                        {resolvedValidation.errors.map((error, idx) => (
                          <li key={idx}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {!isZipFile && (
            <div className="border-t pt-4 space-y-3">
              <div className="flex items-start gap-3">
                <input
                  id="allowDuplicates"
                  type="checkbox"
                  checked={importAsNewNodes}
                  onChange={(e) => setImportAsNewNodes(e.target.checked)}
                  disabled={isImporting}
                  className="mt-1 h-4 w-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <label htmlFor="allowDuplicates" className="text-sm font-medium text-gray-700 cursor-pointer">
                      Import as new nodes instead
                    </label>
                    <button
                      type="button"
                      onMouseEnter={() => setShowTooltip(true)}
                      onMouseLeave={() => setShowTooltip(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Info size={16} />
                    </button>
                  </div>
                  {showTooltip && (
                    <div className="mt-2 p-3 bg-gray-100 rounded text-xs text-gray-700 space-y-2">
                      <p>
                        <strong>Checked:</strong> Existing nodes are kept. Imported nodes that collide by code are added as new nodes with a numeric suffix.
                      </p>
                      <p>
                        <strong>Unchecked:</strong> Same-type, same-code nodes are updated. Missing fields in the import keep their current values.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {!importAsNewNodes && isLoadingExistingDomainData && (
                <p className="text-xs text-gray-500">Loading current domain data to compute overwrite preview...</p>
              )}

              {!importAsNewNodes && existingDomainDataError && (
                <p className="text-xs text-red-600">{existingDomainDataError}</p>
              )}

              {!importAsNewNodes && importPreparation.overwriteNodes.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-3">
                  <p className="text-sm font-medium text-amber-900">
                    {importPreparation.overwriteNodes.length} node{importPreparation.overwriteNodes.length !== 1 ? 's' : ''} have fields to be overwritten
                  </p>
                  <div className="space-y-2">
                    {importPreparation.overwriteNodes.map((node) => (
                      <details key={`${node.nodeType}:${node.code}`} className="rounded border border-amber-200 bg-white">
                        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-gray-800">
                          {node.nodeName} (code: {node.code})
                        </summary>
                        <div className="border-t px-3 py-3 space-y-3">
                          {node.fieldDiffs.map((fieldDiff) => (
                            <div key={`${node.code}:${fieldDiff.field}`} className="space-y-1">
                              <p className="text-xs font-semibold text-gray-700">{fieldDiff.field}:</p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <div className="rounded border border-gray-200 bg-gray-50 p-2">
                                  <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Old</p>
                                  <pre className="text-xs whitespace-pre-wrap break-words text-gray-700">{formatPreviewValue(fieldDiff.oldValue)}</pre>
                                </div>
                                <div className="rounded border border-gray-200 bg-gray-50 p-2">
                                  <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">New</p>
                                  <pre className="text-xs whitespace-pre-wrap break-words text-gray-700">{formatPreviewValue(fieldDiff.newValue)}</pre>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-4 border-t bg-gray-50">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isImporting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={
              !resolvedValidation?.isValid
              || isImporting
              || (isPasteMode
                ? (!hasReviewedPastedContent || pasteNeedsReview)
                : !selectedFile)
              || (!importAsNewNodes && isLoadingExistingDomainData)
            }
            className="min-w-[100px]"
          >
            {isImporting ? (
              <span className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Importing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Upload size={16} />
                Import
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ImportDialog;
