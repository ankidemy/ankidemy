// Builds DomainExportData payloads for a selection of node codes.
// Pure data-assembly extracted from KnowledgeGraph.tsx so the component only
// handles UI concerns (file naming, download, clipboard).

import {
  DefinitionVersion,
  DomainExportData,
  ExerciseVersion,
  GroupData,
  QuestVersionDTO,
  getDomainRelations,
  getMetaDefinition,
  getMetaExercise,
  getQuest,
} from '@/lib/api';
import type { GraphData } from '../utils/types';

export const sanitizeFilenamePart = (value: string): string => {
  return value
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
};

export const formatDownloadTimestamp = (date = new Date()): string => {
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
};

const prunePrerequisites = (
  prerequisites: string[] | undefined,
  prerequisiteWeights: Record<string, number> | undefined,
  allowedCodes: Set<string>,
): { prerequisites: string[]; prerequisiteWeights?: Record<string, number> } => {
  const cleanedPrerequisites = (prerequisites || []).filter(code => allowedCodes.has(code));
  if (cleanedPrerequisites.length === 0) {
    return { prerequisites: [] };
  }
  if (!prerequisiteWeights) {
    return { prerequisites: cleanedPrerequisites };
  }
  const cleanedWeights: Record<string, number> = {};
  cleanedPrerequisites.forEach(code => {
    if (typeof prerequisiteWeights[code] === 'number') {
      cleanedWeights[code] = prerequisiteWeights[code];
    }
  });
  if (Object.keys(cleanedWeights).length === 0) {
    return { prerequisites: cleanedPrerequisites };
  }
  return { prerequisites: cleanedPrerequisites, prerequisiteWeights: cleanedWeights };
};

export type ExportBuilderContext = {
  domainId: number;
  graphData: GraphData;
  codeToNumericIdMap: Map<string, number>;
  domainGroups: GroupData[];
};

export type ExportBuildResult = {
  exportData: DomainExportData;
  exportedNodeCount: number;
  orderedExportedCodes: string[];
};

export const buildExportDataForCodes = async (
  ctx: ExportBuilderContext,
  codes: string[],
): Promise<ExportBuildResult> => {
  const { domainId, graphData, codeToNumericIdMap, domainGroups } = ctx;

  const selectedCodes = Array.from(new Set(codes.filter((code): code is string => typeof code === 'string' && code.trim().length > 0)));
  if (selectedCodes.length === 0) {
    throw new Error('Select at least one node to export.');
  }

  const selectedDefinitionCodes = new Set<string>();
  const selectedExerciseCodes = new Set<string>();
  const selectedSourceCodes = new Set<string>();
  const selectedQuestCodes = new Set<string>();

  selectedCodes.forEach(code => {
    if (graphData.definitions?.[code]) {
      selectedDefinitionCodes.add(code);
      return;
    }
    if (graphData.exercises?.[code]) {
      selectedExerciseCodes.add(code);
      return;
    }
    if (graphData.sources?.[code]) {
      selectedSourceCodes.add(code);
      return;
    }
    if (graphData.quests?.[code]) {
      selectedQuestCodes.add(code);
    }
  });

  const recognizedSelectionCount =
    selectedDefinitionCodes.size +
    selectedExerciseCodes.size +
    selectedSourceCodes.size +
    selectedQuestCodes.size;

  if (recognizedSelectionCount === 0) {
    throw new Error('Select definition, exercise, source, or quest nodes to export.');
  }

  const [metaDefinitionEntries, metaExerciseEntries, metaQuestEntries, domainRelations] = await Promise.all([
    Promise.all(
      Array.from(selectedDefinitionCodes).map(async (code) => {
        const metaId = codeToNumericIdMap.get(code);
        if (!metaId) {
          throw new Error(`Missing metadata for definition "${code}".`);
        }
        const meta = await getMetaDefinition(metaId);
        return [code, meta] as const;
      })
    ),
    Promise.all(
      Array.from(selectedExerciseCodes).map(async (code) => {
        const metaId = codeToNumericIdMap.get(code);
        if (!metaId) {
          throw new Error(`Missing metadata for exercise "${code}".`);
        }
        const meta = await getMetaExercise(metaId);
        return [code, meta] as const;
      })
    ),
    Promise.all(
      Array.from(selectedQuestCodes).map(async (code) => {
        const questId = graphData.quests?.[code]?.id;
        if (!questId) {
          throw new Error(`Missing metadata for quest "${code}".`);
        }
        const metaQuest = await getQuest(questId);
        return [code, metaQuest] as const;
      })
    ),
    getDomainRelations(domainId),
  ]);

  const includedDefinitionCodes = new Set(metaDefinitionEntries.map(([code]) => code));
  const includedExerciseCodes = new Set(metaExerciseEntries.map(([code]) => code));
  const allowedPrerequisiteCodes = new Set([...includedDefinitionCodes, ...includedExerciseCodes]);

  const exportData: DomainExportData = {};

  if (metaDefinitionEntries.length > 0) {
    const metaDefinitions: NonNullable<DomainExportData['metaDefinitions']> = {};
    metaDefinitionEntries.forEach(([code, meta]) => {
      const { prerequisites, prerequisiteWeights } = prunePrerequisites(
        meta.prerequisites,
        meta.prerequisiteWeights,
        allowedPrerequisiteCodes,
      );
      const rawVersions: Array<Partial<DefinitionVersion>> = Array.isArray(meta.versions) && meta.versions.length > 0
        ? meta.versions
        : [{ prompt: `Define ${meta.name || meta.code}`, type: 'open_ended' }];
      metaDefinitions[code] = {
        code: meta.code,
        name: meta.name,
        prerequisites,
        prerequisiteWeights,
        xPosition: meta.xPosition,
        yPosition: meta.yPosition,
        versions: rawVersions.map(version => ({
          prompt: (version.prompt || '').trim() || `Define ${meta.name || meta.code}`,
          type: (version.type || '').trim() || 'open_ended',
          description: version.description || undefined,
          notes: version.notes || undefined,
          references: Array.isArray(version.references) ? version.references : [],
          promptImagePath: version.promptImagePath || undefined,
          descriptionImagePath: version.descriptionImagePath || undefined,
        })),
      };
    });
    exportData.metaDefinitions = metaDefinitions;
  }

  if (metaExerciseEntries.length > 0) {
    const metaExercises: NonNullable<DomainExportData['metaExercises']> = {};
    metaExerciseEntries.forEach(([code, meta]) => {
      const { prerequisites, prerequisiteWeights } = prunePrerequisites(
        meta.prerequisites,
        meta.prerequisiteWeights,
        allowedPrerequisiteCodes,
      );
      const rawVersions: Array<Partial<ExerciseVersion>> = Array.isArray(meta.versions) && meta.versions.length > 0
        ? meta.versions
        : [{ statement: `Solve: ${meta.name || meta.code}`, difficulty: 3 }];
      metaExercises[code] = {
        code: meta.code,
        name: meta.name,
        prerequisites,
        prerequisiteWeights,
        xPosition: meta.xPosition,
        yPosition: meta.yPosition,
        versions: rawVersions.map(version => ({
          statement: (version.statement || '').trim() || `Solve: ${meta.name || meta.code}`,
          description: version.description || undefined,
          hints: version.hints || undefined,
          verifiable: version.verifiable,
          result: version.result || undefined,
          difficulty: typeof version.difficulty === 'number' ? version.difficulty : 3,
          notes: version.notes || undefined,
          statementImagePath: version.statementImagePath || undefined,
          descriptionImagePath: version.descriptionImagePath || undefined,
        })),
      };
    });
    exportData.metaExercises = metaExercises;
  }

  if (selectedSourceCodes.size > 0) {
    const sources: NonNullable<DomainExportData['sources']> = {};
    Array.from(selectedSourceCodes).forEach(code => {
      const source = graphData.sources?.[code];
      if (!source) return;
      sources[code] = {
        code: source.code,
        title: source.title,
        contentMd: source.contentMd,
        bibtexKey: source.bibtexKey ?? null,
        filePath: source.filePath ?? null,
        xPosition: source.xPosition,
        yPosition: source.yPosition,
      };
    });
    if (Object.keys(sources).length > 0) {
      exportData.sources = sources;
    }
  }

  if (metaQuestEntries.length > 0) {
    const metaQuests: NonNullable<DomainExportData['metaQuests']> = {};
    metaQuestEntries.forEach(([code, metaQuest]) => {
      const rawVersions: Array<Partial<QuestVersionDTO>> = Array.isArray(metaQuest.versions) && metaQuest.versions.length > 0
        ? metaQuest.versions
        : [{ title: metaQuest.name || metaQuest.code }];
      metaQuests[code] = {
        code: metaQuest.code,
        name: metaQuest.name,
        kind: metaQuest.kind,
        schedule: metaQuest.schedule,
        xPosition: metaQuest.xPosition,
        yPosition: metaQuest.yPosition,
        versions: rawVersions.map(version => ({
          title: (version.title || '').trim() || metaQuest.name || metaQuest.code,
          descriptionMd: version.descriptionMd || undefined,
          taskList: version.taskList,
          imagePath: version.imagePath || undefined,
        })),
      };
    });
    exportData.metaQuests = metaQuests;
  }

  const selectedCodeByTypedId = new Map<string, string>();
  includedDefinitionCodes.forEach(code => {
    const id = codeToNumericIdMap.get(code);
    if (id) selectedCodeByTypedId.set(`definition:${id}`, code);
  });
  includedExerciseCodes.forEach(code => {
    const id = codeToNumericIdMap.get(code);
    if (id) selectedCodeByTypedId.set(`exercise:${id}`, code);
  });
  Array.from(selectedSourceCodes).forEach(code => {
    const id = graphData.sources?.[code]?.id;
    if (id) selectedCodeByTypedId.set(`source:${id}`, code);
  });
  Array.from(selectedQuestCodes).forEach(code => {
    const id = graphData.quests?.[code]?.id;
    if (id) selectedCodeByTypedId.set(`meta_quest:${id}`, code);
  });

  const relations = domainRelations.reduce<NonNullable<DomainExportData['relations']>>((acc, relation) => {
    const fromCode = selectedCodeByTypedId.get(`${relation.fromType}:${relation.fromId}`);
    const toCode = selectedCodeByTypedId.get(`${relation.toType}:${relation.toId}`);
    if (!fromCode || !toCode) return acc;
    acc.push({
      fromType: relation.fromType,
      fromCode,
      toType: relation.toType,
      toCode,
      relationType: relation.relationType,
      contextKey: relation.contextKey,
    });
    return acc;
  }, []);
  if (relations.length > 0) {
    exportData.relations = relations;
  }

  const selectedGroupCodes = new Set([...includedDefinitionCodes, ...includedExerciseCodes]);
  if (selectedGroupCodes.size > 0 && domainGroups.length > 0) {
    const groups = domainGroups.reduce<NonNullable<DomainExportData['groups']>>((acc, group) => {
      const seeds = (group.seeds || [])
        .filter(seed => selectedGroupCodes.has(seed.nodeCode))
        .map(seed => ({
          nodeType: seed.nodeType,
          code: seed.nodeCode,
        }));
      if (seeds.length === 0) return acc;
      const members = (group.members || [])
        .filter(member => selectedGroupCodes.has(member.nodeCode))
        .map(member => ({
          nodeType: member.nodeType,
          code: member.nodeCode,
        }));
      acc.push({
        name: group.name,
        isExact: group.isExact,
        xPosition: group.xPosition,
        yPosition: group.yPosition,
        seeds,
        members: members.length > 0 ? members : undefined,
      });
      return acc;
    }, []);
    if (groups.length > 0) {
      exportData.groups = groups;
    }
  }

  const exportedNodeCount =
    Object.keys(exportData.metaDefinitions || {}).length +
    Object.keys(exportData.metaExercises || {}).length +
    Object.keys(exportData.sources || {}).length +
    Object.keys(exportData.metaQuests || {}).length;

  if (exportedNodeCount === 0) {
    throw new Error('No exportable nodes were found in the current selection.');
  }

  const orderedExportedCodes = selectedCodes.filter(code => (
    includedDefinitionCodes.has(code) ||
    includedExerciseCodes.has(code) ||
    selectedSourceCodes.has(code) ||
    selectedQuestCodes.has(code)
  ));

  return {
    exportData,
    exportedNodeCount,
    orderedExportedCodes,
  };
};
