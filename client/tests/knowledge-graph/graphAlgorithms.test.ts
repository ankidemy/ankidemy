import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAdjacencyFromLinks,
  buildExternalNodeId,
  computeConvexClosure,
  computeStronglyConnectedComponents,
  hashString,
  intersects,
  parseExternalNodeId,
} from '../../src/app/components/Graph/knowledge-graph/graphAlgorithms';
import type { GraphLinkCore } from '../../src/app/components/Graph/knowledge-graph/types';

test('hashString is deterministic and non-negative', () => {
  const a = hashString('abc:def');
  const b = hashString('abc:def');
  const c = hashString('abc:xyz');

  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(Number.isInteger(a), true);
  assert.equal(a >= 0, true);
});

test('external node id build/parse round-trip', () => {
  const link = {
    externalDomainUid: 'dom-123',
    externalNodeType: 'definition',
    externalNodeId: 55,
  } as const;

  const id = buildExternalNodeId(link as any);
  assert.equal(id, 'ext:dom-123:definition:55');

  const parsed = parseExternalNodeId(id);
  assert.deepEqual(parsed, {
    externalDomainUid: 'dom-123',
    externalNodeType: 'definition',
    externalNodeId: 55,
  });
});

test('parseExternalNodeId rejects invalid values', () => {
  assert.equal(parseExternalNodeId('node:1'), null);
  assert.equal(parseExternalNodeId('ext:dom:bad:1'), null);
  assert.equal(parseExternalNodeId('ext:dom:definition:not-a-number'), null);
  assert.equal(parseExternalNodeId('ext:dom:definition'), null);
});

test('computeConvexClosure returns closure between seeds using incoming/outgoing graphs', () => {
  const outgoing = new Map<string, Set<string>>([
    ['A', new Set(['B', 'D'])],
    ['B', new Set(['C'])],
    ['D', new Set(['C'])],
    ['C', new Set()],
  ]);
  const incoming = new Map<string, Set<string>>([
    ['A', new Set()],
    ['B', new Set(['A'])],
    ['D', new Set(['A'])],
    ['C', new Set(['B', 'D'])],
  ]);

  const closure = computeConvexClosure(['A', 'C'], outgoing, incoming);
  assert.deepEqual(new Set(Array.from(closure).sort()), new Set(['A', 'B', 'C', 'D']));
});

test('intersects checks set intersection correctly', () => {
  assert.equal(intersects(new Set(['A', 'B']), new Set(['C'])), false);
  assert.equal(intersects(new Set(['A', 'B']), new Set(['B', 'C'])), true);
  assert.equal(intersects(new Set(), new Set(['B'])), false);
});

test('buildAdjacencyFromLinks + SCC finds cycle and self-loop components', () => {
  const links = new Map<string, GraphLinkCore>([
    ['A-B', { id: 'A-B', source: 'A', target: 'B', type: 'prerequisite', weight: 1 }],
    ['B-A', { id: 'B-A', source: 'B', target: 'A', type: 'prerequisite', weight: 1 }],
    ['C-C', { id: 'C-C', source: 'C', target: 'C', type: 'prerequisite', weight: 1 }],
  ]);

  const nodes = ['A', 'B', 'C', 'D'];
  const { outgoing, selfLoops } = buildAdjacencyFromLinks(nodes, links);
  const components = computeStronglyConnectedComponents(nodes, outgoing)
    .map(component => component.slice().sort().join(','))
    .sort();

  assert.equal(selfLoops.has('C'), true);
  assert.deepEqual(components, ['A,B', 'C', 'D']);
});
