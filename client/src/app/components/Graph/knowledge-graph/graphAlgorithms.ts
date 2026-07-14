import type { ExternalPrerequisiteLink } from '@/lib/api';

import type {
  FrenzyQuestNoteState,
  GraphLinkCore,
} from './types';

export function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export const FRENZY_DOUBLE_CLICK_MS = 260;
export const FRENZY_SINGLE_CLICK_DELAY_MS = 270;
export const FRENZY_LINK_SNAP_DISTANCE = 20;

export const isQuestKindValue = (value: unknown): value is FrenzyQuestNoteState['kind'] =>
  value === 'todo' || value === 'habit' || value === 'daily';

export const isQuestVisibilityValue = (value: unknown): value is FrenzyQuestNoteState['visibility'] =>
  value === 'private' || value === 'domain';

export const buildExternalNodeId = (link: ExternalPrerequisiteLink): string => {
  const domainUid = link.externalDomainUid || 'unknown';
  return `ext:${domainUid}:${link.externalNodeType}:${link.externalNodeId}`;
};

export const parseExternalNodeId = (
  nodeId: string,
): {
  externalDomainUid: string;
  externalNodeType: 'definition' | 'exercise';
  externalNodeId: number;
} | null => {
  if (!nodeId.startsWith('ext:')) return null;
  const parts = nodeId.split(':');
  if (parts.length !== 4) return null;
  const [, domainUid, nodeType, nodeIdStr] = parts;
  if (nodeType !== 'definition' && nodeType !== 'exercise') return null;
  const parsed = parseInt(nodeIdStr, 10);
  if (Number.isNaN(parsed)) return null;
  return {
    externalDomainUid: domainUid,
    externalNodeType: nodeType,
    externalNodeId: parsed,
  };
};

export const buildGroupNodeId = (groupId: number) => `group:${groupId}`;

export const parseGroupNodeId = (nodeId: string): number | null => {
  if (!nodeId.startsWith('group:')) return null;
  const parsed = parseInt(nodeId.slice('group:'.length), 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const collectReachable = (startNodes: string[], adjacency: Map<string, Set<string>>) => {
  const visited = new Set<string>();
  const stack = [...startNodes];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || visited.has(node)) continue;
    visited.add(node);
    const neighbors = adjacency.get(node);
    if (!neighbors) continue;
    neighbors.forEach(next => {
      if (!visited.has(next)) stack.push(next);
    });
  }
  return visited;
};

export const computeConvexClosure = (
  seeds: string[],
  outgoing: Map<string, Set<string>>,
  incoming: Map<string, Set<string>>,
) => {
  if (seeds.length === 0) return new Set<string>();
  const desc = collectReachable(seeds, outgoing);
  const anc = collectReachable(seeds, incoming);
  const closure = new Set<string>();
  desc.forEach(node => {
    if (anc.has(node)) closure.add(node);
  });
  return closure;
};

export const intersects = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 || b.size === 0) return false;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of small) {
    if (large.has(item)) return true;
  }
  return false;
};

export const buildAdjacencyFromLinks = (
  nodes: string[],
  links: Map<string, GraphLinkCore>,
) => {
  const outgoing = new Map<string, Set<string>>();
  const selfLoops = new Set<string>();
  nodes.forEach(nodeId => {
    outgoing.set(nodeId, new Set());
  });
  links.forEach(link => {
    if (!outgoing.has(link.source)) return;
    outgoing.get(link.source)?.add(link.target);
    if (link.source === link.target) {
      selfLoops.add(link.source);
    }
  });
  return { outgoing, selfLoops };
};

export const computeStronglyConnectedComponents = (
  nodes: string[],
  outgoing: Map<string, Set<string>>,
) => {
  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const components: string[][] = [];

  const strongConnect = (nodeId: string) => {
    indices.set(nodeId, index);
    lowlinks.set(nodeId, index);
    index++;
    stack.push(nodeId);
    onStack.add(nodeId);

    const neighbors = outgoing.get(nodeId) || new Set<string>();
    neighbors.forEach(neighbor => {
      if (!indices.has(neighbor)) {
        strongConnect(neighbor);
        const nextLow = Math.min(lowlinks.get(nodeId) ?? 0, lowlinks.get(neighbor) ?? 0);
        lowlinks.set(nodeId, nextLow);
      } else if (onStack.has(neighbor)) {
        const nextLow = Math.min(lowlinks.get(nodeId) ?? 0, indices.get(neighbor) ?? 0);
        lowlinks.set(nodeId, nextLow);
      }
    });

    if (lowlinks.get(nodeId) === indices.get(nodeId)) {
      const component: string[] = [];
      while (stack.length > 0) {
        const w = stack.pop();
        if (!w) break;
        onStack.delete(w);
        component.push(w);
        if (w === nodeId) break;
      }
      components.push(component);
    }
  };

  nodes.forEach(nodeId => {
    if (!indices.has(nodeId)) {
      strongConnect(nodeId);
    }
  });

  return components;
};

export const getExternalNodeLabel = (link: ExternalPrerequisiteLink): string => {
  const nodeLabel = link.externalNodeName || `Node ${link.externalNodeId}`;
  const domainLabel = link.externalDomainName || 'External';
  return `${domainLabel}: ${nodeLabel}`;
};
