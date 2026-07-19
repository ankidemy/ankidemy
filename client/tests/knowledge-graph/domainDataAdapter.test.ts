import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adaptDomainPayloadToGraphData,
  buildIdToCodeByTypeFromGraphData,
  buildRelationEdgesFromDomainRelations,
} from '../../src/app/components/Graph/knowledge-graph/domainDataAdapter';

test('adaptDomainPayloadToGraphData maps payload to graph data and ids', () => {
  const adapted = adaptDomainPayloadToGraphData({
    metaDefinitions: [
      {
        id: 1,
        code: 'D1',
        name: 'Def 1',
        domainId: 10,
        ownerId: 5,
        prerequisites: ['D0'],
        xPosition: 11,
        yPosition: 22,
        versionCount: 1,
      },
    ],
    metaExercises: [
      {
        id: 2,
        code: 'E1',
        name: 'Ex 1',
        domainId: 10,
        ownerId: 5,
        prerequisites: ['D1'],
        prerequisiteWeights: { D1: 0.75 },
        versionCount: 1,
      },
    ],
    sources: [
      {
        id: 3,
        code: 'S1',
        title: 'Source 1',
        contentMd: 'content',
        domainId: 10,
        ownerId: 5,
      },
    ],
    quests: [
      {
        id: 4,
        code: 'Q1',
        name: 'Quest 1',
        kind: 'todo',
        schedule: { mode: 'once' },
        domainId: 10,
        ownerId: 5,
      },
    ],
    relations: [
      {
        fromType: 'source',
        fromId: 3,
        toType: 'definition',
        toId: 1,
        relationType: 'relevant',
      },
      {
        fromType: 'quest',
        fromId: 4,
        toType: 'exercise',
        toId: 2,
        relationType: 'relevant',
      },
    ],
  } as any);

  assert.equal(adapted.codeToNumericIdMap.get('D1'), 1);
  assert.equal(adapted.codeToNumericIdMap.get('E1'), 2);

  assert.equal(adapted.graphData.definitions.D1?.type, 'definition');
  assert.equal(adapted.graphData.exercises.E1?.type, 'exercise');
  assert.equal(adapted.graphData.sources?.S1?.type, 'source');
  assert.equal(adapted.graphData.quests?.Q1?.type, 'quest');

  assert.equal(adapted.graphData.definitions.D1?.prerequisiteWeights?.D0, 1.0);
  assert.equal(adapted.graphData.exercises.E1?.prerequisiteWeights?.D1, 0.75);

  assert.deepEqual(adapted.graphData.relations, [
    { fromCode: 'S1', toCode: 'D1', relationType: 'relevant' },
    { fromCode: 'Q1', toCode: 'E1', relationType: 'relevant' },
  ]);
});

test('buildIdToCodeByTypeFromGraphData reconstructs relation lookup ids', () => {
  const graphData = {
    definitions: {
      D1: { id: 10, code: 'D1', name: 'Def', description: '' },
    },
    exercises: {
      E1: { id: 11, code: 'E1', name: 'Ex', statement: '' },
    },
    sources: {
      S1: { id: 12, code: 'S1', title: 'Source' },
    },
    quests: {
      Q1: { id: 13, code: 'Q1', kind: 'todo', schedule: {} },
    },
  } as any;

  const idMap = buildIdToCodeByTypeFromGraphData(graphData);
  assert.equal(idMap.get('definition:10'), 'D1');
  assert.equal(idMap.get('exercise:11'), 'E1');
  assert.equal(idMap.get('source:12'), 'S1');
  assert.equal(idMap.get('quest:13'), 'Q1');
});

test('buildRelationEdgesFromDomainRelations ignores unresolved ids', () => {
  const idToCodeByType = new Map<string, string>([
    ['definition:1', 'D1'],
    ['exercise:2', 'E1'],
  ]);

  const edges = buildRelationEdgesFromDomainRelations([
    { fromType: 'definition', fromId: 1, toType: 'exercise', toId: 2, relationType: 'depends_on' },
    { fromType: 'definition', fromId: 1, toType: 'exercise', toId: 999, relationType: 'depends_on' },
  ] as any, idToCodeByType);

  assert.deepEqual(edges, [
    { fromCode: 'D1', toCode: 'E1', relationType: 'depends_on' },
  ]);
});
