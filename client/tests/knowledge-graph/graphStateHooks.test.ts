import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGraphMetadataState,
  buildGraphStructureState,
} from '../../src/app/components/Graph/knowledge-graph/graphStateHooks';

test('buildGraphStructureState builds nodes/links and stable version for same structure', () => {
  const definitions = {
    D1: { id: 1, code: 'D1', name: 'Def 1', description: '', prerequisites: [] },
    D2: { id: 2, code: 'D2', name: 'Def 2', description: '', prerequisites: ['D1'] },
  } as any;
  const exercises = {
    E1: { id: 3, code: 'E1', name: 'Ex 1', statement: '', prerequisites: ['D2'], prerequisiteWeights: { D2: 0.5 } },
  } as any;
  const sources = {
    S1: { id: 4, code: 'S1', title: 'Source 1' },
  } as any;
  const quests = {
    Q1: { id: 5, code: 'Q1', kind: 'todo', schedule: {} },
  } as any;

  const relations = [
    { fromCode: 'S1', toCode: 'D1', relationType: 'relevant' },
  ];

  const externalLinks = [
    {
      id: 10,
      domainId: 1,
      nodeId: 1,
      nodeType: 'meta_definition',
      externalDomainUid: 'ext-domain',
      externalNodeId: 20,
      externalNodeType: 'meta_definition',
      status: 'ok',
    },
  ] as any;

  const a = buildGraphStructureState(definitions, exercises, sources, quests, relations, externalLinks);
  const b = buildGraphStructureState(definitions, exercises, sources, quests, relations, externalLinks);

  assert.equal(a.version, b.version);
  assert.equal(a.nodes.has('D1'), true);
  assert.equal(a.nodes.has('E1'), true);
  assert.equal(a.nodes.has('S1'), true);
  assert.equal(a.nodes.has('Q1'), true);
  assert.equal(a.nodes.has('ext:ext-domain:meta_definition:20'), true);

  assert.equal(a.links.has('D1-D2'), true);
  assert.equal(a.links.has('D2-E1'), true);
  assert.equal(a.links.has('S1-D1-relevant'), true);
  assert.equal(a.links.has('ext:ext-domain:meta_definition:20-D1'), true);
});

test('buildGraphMetadataState changes version only when metadata-driving inputs change', () => {
  const structureNodes = new Map([
    ['D1', { id: 'D1', type: 'definition', prerequisites: [] }],
    ['E1', { id: 'E1', type: 'exercise', prerequisites: ['D1'] }],
  ]) as any;

  const definitions = {
    D1: { code: 'D1', name: 'Def 1', description: '', prerequisites: [] },
  } as any;
  const exercises = {
    E1: { code: 'E1', name: 'Ex 1', statement: '', difficulty: 3, prerequisites: ['D1'] },
  } as any;

  const sources = {} as any;
  const quests = {} as any;

  const srs = {
    state: {
      dueReviews: [{ nodeCode: 'D1' }],
      domainProgress: {},
      lastUpdated: 1,
    },
    getNodeProgress: (id: number, type: string) => {
      if (id === 1 && type === 'definition') {
        return { status: 'tackling', nextReview: '2000-01-01T00:00:00.000Z' };
      }
      return { status: 'fresh', nextReview: null };
    },
  };

  const codeToNumericIdMap = new Map<string, number>([
    ['D1', 1],
    ['E1', 2],
  ]);

  const groupNodeMetadata = new Map();
  const externalNodeLookup = new Map();

  const a = buildGraphMetadataState(
    structureNodes,
    definitions,
    exercises,
    sources,
    quests,
    srs,
    codeToNumericIdMap,
    groupNodeMetadata,
    externalNodeLookup,
  );

  const b = buildGraphMetadataState(
    structureNodes,
    definitions,
    exercises,
    sources,
    quests,
    srs,
    codeToNumericIdMap,
    groupNodeMetadata,
    externalNodeLookup,
  );

  assert.equal(a.version, b.version);
  assert.equal(a.nodeMetadata.get('D1')?.isDue, true);
  assert.equal(a.nodeMetadata.get('D1')?.status, 'tackling');

  const renamed = {
    ...definitions,
    D1: {
      ...definitions.D1,
      name: 'Def 1 renamed',
    },
  };

  const c = buildGraphMetadataState(
    structureNodes,
    renamed,
    exercises,
    sources,
    quests,
    srs,
    codeToNumericIdMap,
    groupNodeMetadata,
    externalNodeLookup,
  );

  assert.notEqual(c.version, a.version);
});
