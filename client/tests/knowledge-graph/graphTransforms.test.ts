import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCollapsedCycleGroups,
  buildDagGraphStructure,
  buildExternalNodeLookup,
  buildGraphHighlightedNodes,
  buildGroupMembersById,
  buildGroupedGraphStructure,
  buildLocalAdjacency,
  buildQuestNodeIds,
  buildRenderGraphLinks,
  buildRenderGraphNodes,
  buildCycleGroups,
} from '../../src/app/components/Graph/knowledge-graph/graphTransforms';
import type {
  GraphStructureState,
} from '../../src/app/components/Graph/knowledge-graph/types';
import type { GraphData, GraphLink, GraphNode } from '../../src/app/components/Graph/utils/types';

function makeBaseStructure(): GraphStructureState {
  return {
    nodes: new Map([
      ['A', { id: 'A', type: 'definition' }],
      ['B', { id: 'B', type: 'definition' }],
      ['C', { id: 'C', type: 'exercise' }],
      ['Q', { id: 'Q', type: 'quest' }],
    ]),
    links: new Map([
      ['A-B', { id: 'A-B', source: 'A', target: 'B', type: 'prerequisite', weight: 0.5 }],
      ['B-C', { id: 'B-C', source: 'B', target: 'C', type: 'prerequisite', weight: 0.8 }],
      ['A-C', { id: 'A-C', source: 'A', target: 'C', type: 'prerequisite', weight: 0.6 }],
      ['Q-C', { id: 'Q-C', source: 'Q', target: 'C', type: 'relation', weight: 1 }],
    ]),
    version: 1,
    lastStructuralChange: 1,
  };
}

test('buildExternalNodeLookup keeps worst status precedence for same external node', () => {
  const links = [
    {
      id: 1,
      domainId: 1,
      nodeId: 11,
      nodeType: 'meta_definition',
      externalDomainUid: 'dom-x',
      externalDomainId: 99,
      externalDomainName: 'Ext',
      externalNodeId: 10,
      externalNodeType: 'meta_definition',
      externalNodeName: 'Node 10',
      status: 'ok',
    },
    {
      id: 2,
      domainId: 1,
      nodeId: 11,
      nodeType: 'meta_definition',
      externalDomainUid: 'dom-x',
      externalDomainId: 99,
      externalDomainName: 'Ext',
      externalNodeId: 10,
      externalNodeType: 'meta_definition',
      externalNodeName: 'Node 10 - stale',
      status: 'missing_node',
    },
  ] as any[];

  const map = buildExternalNodeLookup(links as any);
  const entry = map.get('ext:dom-x:meta_definition:10');
  assert.ok(entry);
  assert.equal(entry?.status, 'missing_node');
});

test('buildGroupMembersById supports exact and convex-closure groups', () => {
  const graphData: GraphData = {
    definitions: {
      A: { code: 'A', name: 'A', description: '', prerequisites: [] },
      B: { code: 'B', name: 'B', description: '', prerequisites: ['A'] },
      C: { code: 'C', name: 'C', description: '', prerequisites: ['B'] },
    },
    exercises: {
      X: { code: 'X', name: 'X', statement: '', prerequisites: ['A'] },
    },
  };
  const adjacency = buildLocalAdjacency(graphData);

  const groups = [
    {
      id: 1,
      domainId: 1,
      name: 'Exact',
      isExact: true,
      seeds: [{ nodeId: 1, nodeType: 'meta_definition', nodeCode: 'A', nodeName: 'A' }],
      members: [
        { nodeId: 1, nodeType: 'meta_definition', nodeCode: 'A', nodeName: 'A' },
        { nodeId: 2, nodeType: 'meta_definition', nodeCode: 'B', nodeName: 'B' },
      ],
    },
    {
      id: 2,
      domainId: 1,
      name: 'Closure',
      isExact: false,
      seeds: [
        { nodeId: 1, nodeType: 'meta_definition', nodeCode: 'A', nodeName: 'A' },
        { nodeId: 3, nodeType: 'meta_definition', nodeCode: 'C', nodeName: 'C' },
      ],
    },
  ] as any[];

  const members = buildGroupMembersById(groups as any, adjacency);
  assert.deepEqual(new Set(Array.from(members.get(1) ?? []).sort()), new Set(['A', 'B']));
  assert.deepEqual(new Set(Array.from(members.get(2) ?? []).sort()), new Set(['A', 'B', 'C']));
});

test('buildGroupedGraphStructure collapses selected group and aggregates outgoing links', () => {
  const base = makeBaseStructure();
  const domainGroups = [
    {
      id: 7,
      domainId: 1,
      name: 'Collapsed',
      isExact: true,
      collapsed: true,
      seeds: [],
      members: [],
    },
  ] as any[];

  const groupMembersById = new Map<number, Set<string>>([[7, new Set(['A', 'B'])]]);

  const grouped = buildGroupedGraphStructure({
    baseGraphStructure: base,
    collapsedGroupIds: new Set([7]),
    domainGroups: domainGroups as any,
    groupMembersById,
  });

  assert.equal(grouped.nodes.has('group:7'), true);
  assert.equal(grouped.nodes.has('A'), false);
  assert.equal(grouped.nodes.has('B'), false);
  assert.equal(grouped.nodes.has('C'), true);

  const aggregated = grouped.links.get('group:7-C');
  assert.ok(aggregated);
  assert.equal(aggregated?.source, 'group:7');
  assert.equal(aggregated?.target, 'C');
  assert.equal(aggregated?.weight, 0.8);
});

test('cycle collapse projection builds DAG-compatible structure', () => {
  const structure: GraphStructureState = {
    nodes: new Map([
      ['A', { id: 'A', type: 'definition' }],
      ['B', { id: 'B', type: 'exercise' }],
      ['C', { id: 'C', type: 'definition' }],
    ]),
    links: new Map([
      ['A-B', { id: 'A-B', source: 'A', target: 'B', type: 'prerequisite', weight: 1 }],
      ['B-A', { id: 'B-A', source: 'B', target: 'A', type: 'prerequisite', weight: 1 }],
      ['B-C', { id: 'B-C', source: 'B', target: 'C', type: 'prerequisite', weight: 1 }],
    ]),
    version: 101,
    lastStructuralChange: 101,
  };

  const cycleGroups = buildCycleGroups(true, structure);
  assert.equal(cycleGroups.length, 1);
  const collapsed = buildCollapsedCycleGroups(cycleGroups, new Set<string>());
  const dag = buildDagGraphStructure({
    dagModeEnabled: true,
    collapsedCycleGroups: collapsed,
    groupedGraphStructure: structure,
  });

  const cycleNodeId = cycleGroups[0]?.id;
  assert.ok(cycleNodeId);
  assert.equal(dag.nodes.has('A'), false);
  assert.equal(dag.nodes.has('B'), false);
  assert.equal(dag.nodes.has('C'), true);
  assert.equal(dag.nodes.has(cycleNodeId!), true);
  assert.equal(dag.links.has(`${cycleNodeId}-C`), true);
});

test('quest visibility projection hides quest nodes and quest links when off', () => {
  const nodes: GraphNode[] = [
    { id: 'D1', name: 'D1', type: 'definition' },
    { id: 'Q1', name: 'Q1', type: 'quest' },
  ];
  const links: GraphLink[] = [
    { id: 'D1-Q1', source: 'D1', target: 'Q1', type: 'relation' },
    { id: 'D1-D1', source: 'D1', target: 'D1', type: 'prerequisite' },
  ];

  const questIds = buildQuestNodeIds(nodes, 'off');
  assert.equal(questIds.has('Q1'), true);

  const visibleNodes = buildRenderGraphNodes(nodes, 'off');
  assert.deepEqual(visibleNodes.map(n => n.id), ['D1']);

  const visibleLinks = buildRenderGraphLinks(links, questIds, 'off');
  assert.deepEqual(visibleLinks.map(l => l.id), ['D1-D1']);
});

test('highlight union merges active/highlight/pending sets', () => {
  const merged = buildGraphHighlightedNodes(
    new Set(['A', 'B']),
    new Set(['B', 'C']),
    'D',
  );

  assert.deepEqual(new Set(Array.from(merged).sort()), new Set(['A', 'B', 'C', 'D']));
});
