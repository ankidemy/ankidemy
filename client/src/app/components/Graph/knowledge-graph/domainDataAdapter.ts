import type {
  MetaDefinition,
  MetaExercise,
  MetaQuestDTO,
  NodeRelationDTO,
  SourceDTO,
} from '@/lib/api';

import type {
  Definition,
  Exercise,
  GraphData,
  MetaQuest,
  SourceNode,
} from '../utils/types';

export type DomainGraphPayload = {
  metaDefinitions: MetaDefinition[];
  metaExercises: MetaExercise[];
  sources: SourceDTO[];
  quests: MetaQuestDTO[];
  relations: NodeRelationDTO[];
};

export type DomainGraphAdapted = {
  graphData: GraphData;
  codeToNumericIdMap: Map<string, number>;
  nodeDataCache: Map<string, MetaDefinition | MetaExercise>;
  idToCodeByType: Map<string, string>;
};

const defaultPrerequisiteWeights = (
  prerequisites?: string[],
  existing?: Record<string, number>,
): Record<string, number> => {
  if (existing) return existing;
  if (!prerequisites || prerequisites.length === 0) return {};
  return Object.fromEntries(prerequisites.map(code => [code, 1.0]));
};

export const buildRelationEdgesFromDomainRelations = (
  relations: NodeRelationDTO[],
  idToCodeByType: Map<string, string>,
): Array<{ fromCode: string; toCode: string; relationType?: string }> => {
  const relationEdges: Array<{ fromCode: string; toCode: string; relationType?: string }> = [];
  relations.forEach(rel => {
    const fromCode = idToCodeByType.get(`${rel.fromType}:${rel.fromId}`);
    const toCode = idToCodeByType.get(`${rel.toType}:${rel.toId}`);
    if (!fromCode || !toCode) return;
    relationEdges.push({
      fromCode,
      toCode,
      relationType: rel.relationType,
    });
  });
  return relationEdges;
};

export const buildIdToCodeByTypeFromGraphData = (
  graphData: GraphData,
  codeToNumericIdMap?: Map<string, number>,
): Map<string, string> => {
  const idToCodeByType = new Map<string, string>();

  Object.values(graphData.definitions || {}).forEach(def => {
    const id = def.id ?? codeToNumericIdMap?.get(def.code);
    if (typeof id === 'number') {
      idToCodeByType.set(`definition:${id}`, def.code);
    }
  });

  Object.values(graphData.exercises || {}).forEach(ex => {
    const id = ex.id ?? codeToNumericIdMap?.get(ex.code);
    if (typeof id === 'number') {
      idToCodeByType.set(`exercise:${id}`, ex.code);
    }
  });

  Object.values(graphData.sources || {}).forEach(src => {
    if (typeof src.id === 'number') {
      idToCodeByType.set(`source:${src.id}`, src.code);
    }
  });

  Object.values(graphData.quests || {}).forEach(quest => {
    if (typeof quest.id === 'number') {
      idToCodeByType.set(`meta_quest:${quest.id}`, quest.code);
    }
  });

  return idToCodeByType;
};

export const adaptDomainPayloadToGraphData = (payload: DomainGraphPayload): DomainGraphAdapted => {
  const {
    metaDefinitions,
    metaExercises,
    sources,
    quests,
    relations,
  } = payload;

  const codeToNumericIdMap = new Map<string, number>();
  const nodeDataCache = new Map<string, MetaDefinition | MetaExercise>();
  const idToCodeByType = new Map<string, string>();

  metaDefinitions.forEach(metaDef => {
    if (!metaDef?.code || typeof metaDef.id !== 'number') return;
    codeToNumericIdMap.set(metaDef.code, metaDef.id);
    nodeDataCache.set(metaDef.code, metaDef);
    idToCodeByType.set(`definition:${metaDef.id}`, metaDef.code);
  });

  metaExercises.forEach(metaEx => {
    if (!metaEx?.code || typeof metaEx.id !== 'number') return;
    codeToNumericIdMap.set(metaEx.code, metaEx.id);
    nodeDataCache.set(metaEx.code, metaEx);
    idToCodeByType.set(`exercise:${metaEx.id}`, metaEx.code);
  });

  const definitions: Record<string, Definition> = {};
  metaDefinitions.forEach(metaDef => {
    definitions[metaDef.code] = {
      code: metaDef.code,
      name: metaDef.name,
      description: '',
      notes: '',
      references: [],
      prerequisites: metaDef.prerequisites || [],
      prerequisiteWeights: defaultPrerequisiteWeights(metaDef.prerequisites, metaDef.prerequisiteWeights),
      xPosition: metaDef.xPosition,
      yPosition: metaDef.yPosition,
      domainId: metaDef.domainId,
      type: 'definition',
      id: metaDef.id,
    };
  });

  const exercises: Record<string, Exercise> = {};
  metaExercises.forEach(metaEx => {
    exercises[metaEx.code] = {
      code: metaEx.code,
      name: metaEx.name,
      statement: '',
      description: '',
      notes: '',
      hints: '',
      difficulty: undefined,
      domainId: metaEx.domainId,
      verifiable: false,
      result: '',
      prerequisites: metaEx.prerequisites || [],
      prerequisiteWeights: defaultPrerequisiteWeights(metaEx.prerequisites, metaEx.prerequisiteWeights),
      xPosition: metaEx.xPosition,
      yPosition: metaEx.yPosition,
      type: 'exercise',
      id: metaEx.id,
    };
  });

  const sourcesByCode: Record<string, SourceNode> = {};
  sources.forEach(src => {
    if (!src?.code) return;
    sourcesByCode[src.code] = {
      id: src.id,
      code: src.code,
      title: src.title,
      contentMd: src.contentMd,
      bibtexKey: src.bibtexKey ?? null,
      filePath: src.filePath ?? null,
      xPosition: src.xPosition,
      yPosition: src.yPosition,
      domainId: src.domainId,
      ownerId: src.ownerId,
      visibility: src.visibility,
      type: 'source',
    };
    if (typeof src.id === 'number') {
      idToCodeByType.set(`source:${src.id}`, src.code);
    }
  });

  const questsByCode: Record<string, MetaQuest> = {};
  quests.forEach(quest => {
    if (!quest?.code) return;
    questsByCode[quest.code] = {
      id: quest.id,
      code: quest.code,
      name: quest.name,
      kind: quest.kind,
      schedule: quest.schedule,
      xPosition: quest.xPosition,
      yPosition: quest.yPosition,
      domainId: quest.domainId,
      ownerId: quest.ownerId,
      visibility: quest.visibility,
      active: quest.active,
      nextDueAt: quest.nextDueAt,
      versions: quest.versions || [],
      type: 'quest',
    };
    if (typeof quest.id === 'number') {
      idToCodeByType.set(`meta_quest:${quest.id}`, quest.code);
    }
  });

  const relationEdges = buildRelationEdgesFromDomainRelations(relations, idToCodeByType);

  return {
    graphData: {
      definitions,
      exercises,
      sources: sourcesByCode,
      quests: questsByCode,
      relations: relationEdges,
    },
    codeToNumericIdMap,
    nodeDataCache,
    idToCodeByType,
  };
};
