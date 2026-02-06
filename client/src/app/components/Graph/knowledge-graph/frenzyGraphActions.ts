import type { GraphNode } from '../utils/types';

export type FrenzyLinkHandlers = {
  addPrerequisite: (source: GraphNode, target: GraphNode) => Promise<void>;
  removePrerequisite: (sourceCode: string, targetCode: string) => Promise<void>;
  createQuestRelation: (questNode: GraphNode, otherNode: GraphNode) => Promise<void>;
  removeQuestRelation: (questNode: GraphNode, otherNode: GraphNode) => Promise<void>;
  createSourceRelation: (sourceNode: GraphNode, otherNode: GraphNode) => Promise<void>;
  removeSourceRelation: (sourceNode: GraphNode, otherNode: GraphNode) => Promise<void>;
  deleteNode: (node: GraphNode) => Promise<void>;
};

export type ResolveNodeKind = {
  isQuest: (node: GraphNode) => boolean;
  isSource: (node: GraphNode) => boolean;
};

export type LinkResolution =
  | { kind: 'quest'; questNode: GraphNode; otherNode: GraphNode }
  | { kind: 'source'; sourceNode: GraphNode; otherNode: GraphNode }
  | { kind: 'prerequisite'; sourceNode: GraphNode; targetNode: GraphNode };

export const resolveFrenzyLinkTarget = (
  sourceNode: GraphNode,
  targetNode: GraphNode,
  resolver: ResolveNodeKind,
): LinkResolution => {
  const sourceIsQuest = resolver.isQuest(sourceNode);
  const targetIsQuest = resolver.isQuest(targetNode);
  if (sourceIsQuest || targetIsQuest) {
    return {
      kind: 'quest',
      questNode: sourceIsQuest ? { ...sourceNode, type: 'quest' } : { ...targetNode, type: 'quest' },
      otherNode: sourceIsQuest ? targetNode : sourceNode,
    };
  }

  const sourceIsSource = resolver.isSource(sourceNode);
  const targetIsSource = resolver.isSource(targetNode);
  if (sourceIsSource || targetIsSource) {
    return {
      kind: 'source',
      sourceNode: sourceIsSource ? { ...sourceNode, type: 'source' } : { ...targetNode, type: 'source' },
      otherNode: sourceIsSource ? targetNode : sourceNode,
    };
  }

  return {
    kind: 'prerequisite',
    sourceNode,
    targetNode,
  };
};

export const executeFrenzyNodeAction = async (params: {
  node: GraphNode;
  frenzyTool: 'none' | 'link' | 'unlink' | 'delete';
  pendingLinkSourceId: string | null;
  stableNodes: GraphNode[];
  resolver: ResolveNodeKind;
  prerequisiteMap: Map<string, unknown>;
  setPendingLinkSourceId: (id: string | null) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info', duration?: number) => void;
  handlers: FrenzyLinkHandlers;
}): Promise<void> => {
  const {
    node,
    frenzyTool,
    pendingLinkSourceId,
    stableNodes,
    resolver,
    prerequisiteMap,
    setPendingLinkSourceId,
    showToast,
    handlers,
  } = params;

  if (frenzyTool === 'delete') {
    await handlers.deleteNode(node);
    return;
  }

  if (frenzyTool !== 'link' && frenzyTool !== 'unlink') {
    return;
  }

  if (!pendingLinkSourceId) {
    setPendingLinkSourceId(node.id);
    showToast(
      `Select a target to ${frenzyTool === 'link' ? 'link' : 'unlink'} from ${node.id}.`,
      'info',
      1500,
    );
    return;
  }

  if (pendingLinkSourceId === node.id) {
    setPendingLinkSourceId(null);
    showToast('Pick a different target node.', 'warning');
    return;
  }

  const sourceNode = stableNodes.find(candidate => candidate.id === pendingLinkSourceId);
  setPendingLinkSourceId(null);
  if (!sourceNode) {
    showToast('Source node not found.', 'error');
    return;
  }

  const resolved = resolveFrenzyLinkTarget(sourceNode, node, resolver);

  if (resolved.kind === 'quest') {
    if (frenzyTool === 'link') {
      await handlers.createQuestRelation(resolved.questNode, resolved.otherNode);
    } else {
      await handlers.removeQuestRelation(resolved.questNode, resolved.otherNode);
    }
    return;
  }

  if (resolved.kind === 'source') {
    if (resolved.otherNode.type !== 'definition' && resolved.otherNode.type !== 'exercise') {
      showToast('Sources can only be linked to definitions or exercises.', 'warning');
      return;
    }
    if (frenzyTool === 'link') {
      await handlers.createSourceRelation(resolved.sourceNode, resolved.otherNode);
    } else {
      await handlers.removeSourceRelation(resolved.sourceNode, resolved.otherNode);
    }
    return;
  }

  if (resolved.sourceNode.type !== 'definition' && resolved.sourceNode.type !== 'exercise') {
    showToast('Only definitions and exercises can be linked in Frenzy mode.', 'warning');
    return;
  }
  if (resolved.targetNode.type !== 'definition' && resolved.targetNode.type !== 'exercise') {
    showToast('Only definitions and exercises can be linked in Frenzy mode.', 'warning');
    return;
  }

  if (frenzyTool === 'link') {
    await handlers.addPrerequisite(resolved.sourceNode, resolved.targetNode);
    return;
  }

  const directKey = `${resolved.sourceNode.id}-${resolved.targetNode.id}`;
  const reverseKey = `${resolved.targetNode.id}-${resolved.sourceNode.id}`;
  if (prerequisiteMap.has(directKey)) {
    await handlers.removePrerequisite(resolved.sourceNode.id, resolved.targetNode.id);
    return;
  }
  if (prerequisiteMap.has(reverseKey)) {
    await handlers.removePrerequisite(resolved.targetNode.id, resolved.sourceNode.id);
    return;
  }

  showToast('Link not found.', 'warning');
};

export const executeFrenzyLinkClick = async (params: {
  sourceId: string;
  targetId: string;
  stableNodes: GraphNode[];
  resolver: ResolveNodeKind;
  handlers: Pick<FrenzyLinkHandlers, 'removePrerequisite' | 'removeQuestRelation' | 'removeSourceRelation'>;
}): Promise<void> => {
  const { sourceId, targetId, stableNodes, resolver, handlers } = params;
  const sourceNode = stableNodes.find(node => node.id === sourceId);
  const targetNode = stableNodes.find(node => node.id === targetId);
  if (!sourceNode || !targetNode) {
    await handlers.removePrerequisite(sourceId, targetId);
    return;
  }

  const resolved = resolveFrenzyLinkTarget(sourceNode, targetNode, resolver);

  if (resolved.kind === 'quest') {
    await handlers.removeQuestRelation(resolved.questNode, resolved.otherNode);
    return;
  }

  if (resolved.kind === 'source') {
    if (resolved.otherNode.type === 'definition' || resolved.otherNode.type === 'exercise') {
      await handlers.removeSourceRelation(resolved.sourceNode, resolved.otherNode);
    }
    return;
  }

  await handlers.removePrerequisite(sourceId, targetId);
};
