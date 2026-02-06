import assert from 'node:assert/strict';
import test from 'node:test';

import {
  executeFrenzyLinkClick,
  executeFrenzyNodeAction,
  resolveFrenzyLinkTarget,
} from '../../src/app/components/Graph/knowledge-graph/frenzyGraphActions';
import type { GraphNode } from '../../src/app/components/Graph/utils/types';

const makeNode = (id: string, type: GraphNode['type']): GraphNode => ({
  id,
  name: id,
  type,
});

test('resolveFrenzyLinkTarget prioritizes quest/source then prerequisite', () => {
  const def = makeNode('D', 'definition');
  const ex = makeNode('E', 'exercise');
  const quest = makeNode('Q', 'quest');
  const source = makeNode('S', 'source');

  const resolver = {
    isQuest: (node: GraphNode) => node.type === 'quest',
    isSource: (node: GraphNode) => node.type === 'source',
  };

  assert.equal(resolveFrenzyLinkTarget(def, ex, resolver).kind, 'prerequisite');
  assert.equal(resolveFrenzyLinkTarget(quest, ex, resolver).kind, 'quest');
  assert.equal(resolveFrenzyLinkTarget(source, ex, resolver).kind, 'source');
});

test('executeFrenzyNodeAction sets pending source when none selected', async () => {
  const calls: string[] = [];
  let pending: string | null = null;

  await executeFrenzyNodeAction({
    node: makeNode('A', 'definition'),
    frenzyTool: 'link',
    pendingLinkSourceId: null,
    stableNodes: [makeNode('A', 'definition')],
    resolver: {
      isQuest: () => false,
      isSource: () => false,
    },
    prerequisiteMap: new Map(),
    setPendingLinkSourceId: (id) => {
      pending = id;
      calls.push(`set:${String(id)}`);
    },
    showToast: (message) => calls.push(`toast:${message}`),
    handlers: {
      addPrerequisite: async () => { calls.push('addPrerequisite'); },
      removePrerequisite: async () => { calls.push('removePrerequisite'); },
      createQuestRelation: async () => { calls.push('createQuestRelation'); },
      removeQuestRelation: async () => { calls.push('removeQuestRelation'); },
      createSourceRelation: async () => { calls.push('createSourceRelation'); },
      removeSourceRelation: async () => { calls.push('removeSourceRelation'); },
      deleteNode: async () => { calls.push('deleteNode'); },
    },
  });

  assert.equal(pending, 'A');
  assert.deepEqual(calls[0], 'set:A');
  assert.equal(calls.some(c => c.startsWith('toast:Select a target to link from A.')), true);
});

test('executeFrenzyNodeAction routes delete directly', async () => {
  const calls: string[] = [];

  await executeFrenzyNodeAction({
    node: makeNode('A', 'definition'),
    frenzyTool: 'delete',
    pendingLinkSourceId: null,
    stableNodes: [makeNode('A', 'definition')],
    resolver: { isQuest: () => false, isSource: () => false },
    prerequisiteMap: new Map(),
    setPendingLinkSourceId: () => {},
    showToast: () => {},
    handlers: {
      addPrerequisite: async () => { calls.push('addPrerequisite'); },
      removePrerequisite: async () => { calls.push('removePrerequisite'); },
      createQuestRelation: async () => { calls.push('createQuestRelation'); },
      removeQuestRelation: async () => { calls.push('removeQuestRelation'); },
      createSourceRelation: async () => { calls.push('createSourceRelation'); },
      removeSourceRelation: async () => { calls.push('removeSourceRelation'); },
      deleteNode: async () => { calls.push('deleteNode'); },
    },
  });

  assert.deepEqual(calls, ['deleteNode']);
});

test('executeFrenzyNodeAction routes quest/source/prerequisite link and unlink', async () => {
  const baseNodes = [
    makeNode('D1', 'definition'),
    makeNode('D2', 'definition'),
    makeNode('S1', 'source'),
    makeNode('Q1', 'quest'),
  ];

  const run = async (
    sourceId: string,
    targetId: string,
    tool: 'link' | 'unlink',
    prerequisiteMap = new Map<string, unknown>(),
  ) => {
    const calls: string[] = [];
    await executeFrenzyNodeAction({
      node: baseNodes.find(n => n.id === targetId)!,
      frenzyTool: tool,
      pendingLinkSourceId: sourceId,
      stableNodes: baseNodes,
      resolver: {
        isQuest: (node: GraphNode) => node.type === 'quest',
        isSource: (node: GraphNode) => node.type === 'source',
      },
      prerequisiteMap,
      setPendingLinkSourceId: (id) => calls.push(`set:${String(id)}`),
      showToast: (message) => calls.push(`toast:${message}`),
      handlers: {
        addPrerequisite: async () => { calls.push('addPrerequisite'); },
        removePrerequisite: async (s, t) => { calls.push(`removePrerequisite:${s}->${t}`); },
        createQuestRelation: async () => { calls.push('createQuestRelation'); },
        removeQuestRelation: async () => { calls.push('removeQuestRelation'); },
        createSourceRelation: async () => { calls.push('createSourceRelation'); },
        removeSourceRelation: async () => { calls.push('removeSourceRelation'); },
        deleteNode: async () => { calls.push('deleteNode'); },
      },
    });
    return calls;
  };

  assert.equal((await run('Q1', 'D1', 'link')).includes('createQuestRelation'), true);
  assert.equal((await run('Q1', 'D1', 'unlink')).includes('removeQuestRelation'), true);
  assert.equal((await run('S1', 'D1', 'link')).includes('createSourceRelation'), true);
  assert.equal((await run('S1', 'D1', 'unlink')).includes('removeSourceRelation'), true);
  assert.equal((await run('D1', 'D2', 'link')).includes('addPrerequisite'), true);

  const unlinkDirect = await run('D1', 'D2', 'unlink', new Map([['D1-D2', {}]]));
  assert.equal(unlinkDirect.includes('removePrerequisite:D1->D2'), true);

  const unlinkReverse = await run('D1', 'D2', 'unlink', new Map([['D2-D1', {}]]));
  assert.equal(unlinkReverse.includes('removePrerequisite:D2->D1'), true);
});

test('executeFrenzyLinkClick routes unlink by relation kind', async () => {
  const nodes = [
    makeNode('D1', 'definition'),
    makeNode('D2', 'definition'),
    makeNode('Q1', 'quest'),
    makeNode('S1', 'source'),
  ];

  const run = async (sourceId: string, targetId: string) => {
    const calls: string[] = [];
    await executeFrenzyLinkClick({
      sourceId,
      targetId,
      stableNodes: nodes,
      resolver: {
        isQuest: (node: GraphNode) => node.type === 'quest',
        isSource: (node: GraphNode) => node.type === 'source',
      },
      handlers: {
        removePrerequisite: async () => { calls.push('removePrerequisite'); },
        removeQuestRelation: async () => { calls.push('removeQuestRelation'); },
        removeSourceRelation: async () => { calls.push('removeSourceRelation'); },
      },
    });
    return calls;
  };

  assert.equal((await run('Q1', 'D1')).includes('removeQuestRelation'), true);
  assert.equal((await run('S1', 'D1')).includes('removeSourceRelation'), true);
  assert.equal((await run('D1', 'D2')).includes('removePrerequisite'), true);
});
