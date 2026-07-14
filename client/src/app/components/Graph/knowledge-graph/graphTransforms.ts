import type { ExternalPrerequisiteLink, GroupData } from '@/lib/api';

import type {
  GraphData,
  GraphLink,
  GraphNode,
} from '../utils/types';

import {
  buildAdjacencyFromLinks,
  buildExternalNodeId,
  buildGroupNodeId,
  computeConvexClosure,
  computeStronglyConnectedComponents,
  getExternalNodeLabel,
  hashString,
} from './graphAlgorithms';
import type {
  CycleGroup,
  ExternalNodeLookupEntry,
  GraphAdjacency,
  GraphLinkCore,
  GraphNodeCore,
  GraphStructureState,
  GroupSummary,
  NodeMetadata,
} from './types';

export const buildExternalNodeLookup = (externalPrerequisites: ExternalPrerequisiteLink[]) => {
  const map = new Map<string, ExternalNodeLookupEntry>();

  const statusRank: Record<ExternalPrerequisiteLink['status'], number> = {
    ok: 0,
    no_access: 1,
    missing_node: 2,
    missing_domain: 3,
  };

  externalPrerequisites.forEach(link => {
    const id = buildExternalNodeId(link);
    const displayId = link.externalNodeName || `Node ${link.externalNodeId}`;
    const entry = map.get(id);
    const next: ExternalNodeLookupEntry = {
      id,
      name: getExternalNodeLabel(link),
      displayId,
      type: (link.externalNodeType === 'exercise' ? 'exercise' : 'definition') as 'definition' | 'exercise',
      status: link.status,
      externalDomainId: link.externalDomainId,
      externalDomainUid: link.externalDomainUid,
      externalNodeId: link.externalNodeId,
      externalNodeType: link.externalNodeType,
      externalDomainName: link.externalDomainName,
      externalNodeName: link.externalNodeName,
    };

    if (!entry) {
      map.set(id, next);
      return;
    }

    if (statusRank[next.status] >= statusRank[entry.status]) {
      map.set(id, { ...entry, ...next });
      return;
    }

    if (!entry.displayId && next.displayId) {
      map.set(id, { ...entry, displayId: next.displayId, name: next.name });
    }
  });

  return map;
};

export const buildLocalAdjacency = (currentStructuralGraphData: GraphData): GraphAdjacency => {
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();

  const addEdge = (source: string, target: string) => {
    if (!source || !target) return;
    if (!outgoing.has(source)) outgoing.set(source, new Set());
    if (!incoming.has(target)) incoming.set(target, new Set());
    outgoing.get(source)?.add(target);
    incoming.get(target)?.add(source);
  };

  Object.values(currentStructuralGraphData.definitions || {}).forEach(def => {
    (def.prerequisites || []).forEach(prereq => {
      addEdge(prereq, def.code);
    });
  });
  Object.values(currentStructuralGraphData.exercises || {}).forEach(ex => {
    (ex.prerequisites || []).forEach(prereq => {
      addEdge(prereq, ex.code);
    });
  });

  return { outgoing, incoming };
};

export const buildGroupMembersById = (
  domainGroups: GroupData[],
  localAdjacency: GraphAdjacency,
) => {
  const map = new Map<number, Set<string>>();
  domainGroups.forEach(group => {
    const seedCodes = (group.seeds || []).map(seed => seed.nodeCode).filter(Boolean);
    let members: Set<string>;
    if (group.isExact) {
      const memberCodes = (group.members && group.members.length > 0 ? group.members : group.seeds)
        .map(member => member.nodeCode)
        .filter(Boolean);
      members = new Set(memberCodes);
    } else {
      members = computeConvexClosure(seedCodes, localAdjacency.outgoing, localAdjacency.incoming);
    }
    map.set(group.id, members);
  });
  return map;
};

export const buildNodeGroupsByCode = (
  domainGroups: GroupData[],
  groupMembersById: Map<number, Set<string>>,
) => {
  const map = new Map<string, string[]>();
  domainGroups.forEach(group => {
    const members = groupMembersById.get(group.id);
    if (!members) return;
    members.forEach(code => {
      const existing = map.get(code) ?? [];
      existing.push(group.name);
      map.set(code, existing);
    });
  });
  return map;
};

export const buildCollapsedGroupIds = (domainGroups: GroupData[]) => {
  return new Set(domainGroups.filter(group => group.collapsed).map(group => group.id));
};

export const buildGroupNodeMetadata = (
  domainGroups: GroupData[],
  groupMembersById: Map<number, Set<string>>,
) => {
  const map = new Map<string, NodeMetadata>();
  domainGroups.forEach(group => {
    const members = groupMembersById.get(group.id) ?? new Set<string>();
    const memberCount = members.size;
    const label = memberCount > 0 ? `${group.name} (${memberCount})` : group.name;
    map.set(buildGroupNodeId(group.id), {
      name: label,
      displayId: group.name,
      color: '#111827',
      isDue: false,
      daysUntilReview: null,
      progress: null,
      groupId: group.id,
      groupMemberIds: Array.from(members),
      groupMemberCount: memberCount,
      groupIsExact: group.isExact,
    });
  });
  return map;
};

export const buildGroupSummaries = (
  domainGroups: GroupData[],
  groupMembersById: Map<number, Set<string>>,
): GroupSummary[] => {
  return domainGroups.map(group => ({
    id: group.id,
    name: group.name,
    collapsed: !!group.collapsed,
    isExact: group.isExact,
    memberCount: groupMembersById.get(group.id)?.size ?? 0,
  }));
};

export const buildFullAdjacency = (baseGraphStructure: GraphStructureState): GraphAdjacency => {
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  baseGraphStructure.nodes.forEach((_, id) => {
    outgoing.set(id, new Set());
    incoming.set(id, new Set());
  });
  baseGraphStructure.links.forEach(link => {
    if (!outgoing.has(link.source)) outgoing.set(link.source, new Set());
    if (!incoming.has(link.target)) incoming.set(link.target, new Set());
    outgoing.get(link.source)?.add(link.target);
    incoming.get(link.target)?.add(link.source);
  });
  return { outgoing, incoming };
};

export const buildGroupedGraphStructure = ({
  baseGraphStructure,
  collapsedGroupIds,
  domainGroups,
  groupMembersById,
}: {
  baseGraphStructure: GraphStructureState;
  collapsedGroupIds: Set<number>;
  domainGroups: GroupData[];
  groupMembersById: Map<number, Set<string>>;
}): GraphStructureState => {
  if (collapsedGroupIds.size === 0) {
    return baseGraphStructure;
  }

  const nodes = new Map<string, GraphNodeCore>();
  const links = new Map<string, GraphLinkCore>();
  const nodeToGroup = new Map<string, number>();

  collapsedGroupIds.forEach(groupId => {
    const members = groupMembersById.get(groupId);
    if (!members) return;
    members.forEach(memberId => {
      if (baseGraphStructure.nodes.has(memberId)) {
        nodeToGroup.set(memberId, groupId);
      }
    });
  });

  baseGraphStructure.nodes.forEach((nodeCore, nodeId) => {
    if (nodeToGroup.has(nodeId)) return;
    nodes.set(nodeId, nodeCore);
  });

  collapsedGroupIds.forEach(groupId => {
    const group = domainGroups.find(g => g.id === groupId);
    if (!group) return;
    const members = groupMembersById.get(groupId) ?? new Set<string>();
    const memberIds = Array.from(members).filter(memberId => baseGraphStructure.nodes.has(memberId));
    if (memberIds.length === 0) return;

    let sumX = 0;
    let sumY = 0;
    let count = 0;
    memberIds.forEach(memberId => {
      const nodeCore = baseGraphStructure.nodes.get(memberId);
      if (nodeCore && typeof nodeCore.xPosition === 'number' && typeof nodeCore.yPosition === 'number') {
        sumX += nodeCore.xPosition;
        sumY += nodeCore.yPosition;
        count++;
      }
    });

    const fallbackX = count > 0 ? sumX / count : undefined;
    const fallbackY = count > 0 ? sumY / count : undefined;
    const xPosition = typeof group.xPosition === 'number' ? group.xPosition : fallbackX;
    const yPosition = typeof group.yPosition === 'number' ? group.yPosition : fallbackY;

    const groupNodeId = buildGroupNodeId(groupId);
    nodes.set(groupNodeId, {
      id: groupNodeId,
      type: 'group',
      xPosition,
      yPosition,
      groupId,
      groupMemberIds: memberIds,
      groupMemberCount: memberIds.length,
      groupIsExact: group.isExact,
    });
  });

  const aggregated = new Map<string, GraphLinkCore>();
  baseGraphStructure.links.forEach(link => {
    const sourceGroup = nodeToGroup.get(link.source);
    const targetGroup = nodeToGroup.get(link.target);

    let nextSource = link.source;
    let nextTarget = link.target;
    if (sourceGroup) nextSource = buildGroupNodeId(sourceGroup);
    if (targetGroup) nextTarget = buildGroupNodeId(targetGroup);
    if (sourceGroup && targetGroup && sourceGroup === targetGroup) return;
    if (!nodes.has(nextSource) || !nodes.has(nextTarget)) return;

    const id = `${nextSource}-${nextTarget}`;
    const existing = aggregated.get(id);
    const weight = link.weight ?? 1.0;
    if (existing) {
      if (weight > existing.weight) existing.weight = weight;
    } else {
      aggregated.set(id, {
        id,
        source: nextSource,
        target: nextTarget,
        type: link.type,
        weight,
      });
    }
  });

  aggregated.forEach(link => links.set(link.id, link));

  const groupVersion = Array.from(collapsedGroupIds).sort().join(',');
  const membershipVersion = Array.from(groupMembersById.entries())
    .map(([id, members]) => `${id}:${Array.from(members).sort().join(',')}`)
    .sort()
    .join('|');
  const version = hashString([baseGraphStructure.version, groupVersion, membershipVersion].join('::'));

  return {
    nodes,
    links,
    version,
    lastStructuralChange: Date.now(),
  };
};

export const buildCycleGroups = (
  dagModeEnabled: boolean,
  groupedGraphStructure: GraphStructureState,
): CycleGroup[] => {
  if (!dagModeEnabled) return [];
  const nodeIds = Array.from(groupedGraphStructure.nodes.keys());
  if (nodeIds.length === 0) return [];
  const { outgoing, selfLoops } = buildAdjacencyFromLinks(nodeIds, groupedGraphStructure.links);
  const components = computeStronglyConnectedComponents(nodeIds, outgoing);
  const cycles = components.filter(component => {
    if (component.length > 1) return true;
    return component.length === 1 && selfLoops.has(component[0]);
  });

  const idCounts = new Map<string, number>();
  return cycles
    .map(component => {
      const sorted = [...component].sort();
      const hash = hashString(sorted.join('|'));
      let id = `cycle:${hash}`;
      const count = idCounts.get(id) ?? 0;
      if (count > 0) id = `${id}-${count + 1}`;
      idCounts.set(`cycle:${hash}`, count + 1);
      return { id, members: new Set(sorted) };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
};

export const buildCollapsedCycleGroups = (
  cycleGroups: CycleGroup[],
  expandedCycleIds: Set<string>,
): CycleGroup[] => {
  if (expandedCycleIds.size === 0) return cycleGroups;
  return cycleGroups.filter(group => !expandedCycleIds.has(group.id));
};

export const buildCycleNodeMetadata = (
  collapsedCycleGroups: CycleGroup[],
) => {
  const map = new Map<string, NodeMetadata>();
  collapsedCycleGroups.forEach(group => {
    const memberCount = group.members.size;
    const label = memberCount > 0 ? `Cycle (${memberCount})` : 'Cycle';
    map.set(group.id, {
      name: label,
      displayId: 'Cycle',
      color: '#4b5563',
      isDue: false,
      daysUntilReview: null,
      progress: null,
      groupMemberIds: Array.from(group.members),
      groupMemberCount: memberCount,
      groupIsExact: false,
    });
  });
  return map;
};

export const buildCombinedGroupNodeMetadata = (
  groupNodeMetadata: Map<string, NodeMetadata>,
  cycleNodeMetadata: Map<string, NodeMetadata>,
) => {
  return new Map<string, NodeMetadata>([...groupNodeMetadata, ...cycleNodeMetadata]);
};

export const buildDagGraphStructure = ({
  dagModeEnabled,
  collapsedCycleGroups,
  groupedGraphStructure,
}: {
  dagModeEnabled: boolean;
  collapsedCycleGroups: CycleGroup[];
  groupedGraphStructure: GraphStructureState;
}): GraphStructureState => {
  if (!dagModeEnabled || collapsedCycleGroups.length === 0) {
    return groupedGraphStructure;
  }

  const nodes = new Map<string, GraphNodeCore>();
  const links = new Map<string, GraphLinkCore>();
  const nodeToCycle = new Map<string, string>();

  collapsedCycleGroups.forEach(group => {
    group.members.forEach(memberId => {
      if (groupedGraphStructure.nodes.has(memberId)) {
        nodeToCycle.set(memberId, group.id);
      }
    });
  });

  groupedGraphStructure.nodes.forEach((nodeCore, nodeId) => {
    if (nodeToCycle.has(nodeId)) return;
    nodes.set(nodeId, nodeCore);
  });

  collapsedCycleGroups.forEach(group => {
    const memberIds = Array.from(group.members).filter(memberId => groupedGraphStructure.nodes.has(memberId));
    if (memberIds.length === 0) return;

    let sumX = 0;
    let sumY = 0;
    let count = 0;
    memberIds.forEach(memberId => {
      const nodeCore = groupedGraphStructure.nodes.get(memberId);
      if (nodeCore && typeof nodeCore.xPosition === 'number' && typeof nodeCore.yPosition === 'number') {
        sumX += nodeCore.xPosition;
        sumY += nodeCore.yPosition;
        count++;
      }
    });
    const fallbackX = count > 0 ? sumX / count : undefined;
    const fallbackY = count > 0 ? sumY / count : undefined;

    nodes.set(group.id, {
      id: group.id,
      type: 'group',
      xPosition: fallbackX,
      yPosition: fallbackY,
      groupMemberIds: memberIds,
      groupMemberCount: memberIds.length,
      groupIsExact: false,
    });
  });

  const aggregated = new Map<string, GraphLinkCore>();
  groupedGraphStructure.links.forEach(link => {
    const sourceCycle = nodeToCycle.get(link.source);
    const targetCycle = nodeToCycle.get(link.target);

    let nextSource = link.source;
    let nextTarget = link.target;
    if (sourceCycle) nextSource = sourceCycle;
    if (targetCycle) nextTarget = targetCycle;
    if (nextSource === nextTarget) return;
    if (!nodes.has(nextSource) || !nodes.has(nextTarget)) return;

    const id = `${nextSource}-${nextTarget}`;
    const existing = aggregated.get(id);
    const weight = link.weight ?? 1.0;
    if (existing) {
      if (weight > existing.weight) existing.weight = weight;
    } else {
      aggregated.set(id, {
        id,
        source: nextSource,
        target: nextTarget,
        type: link.type,
        weight,
      });
    }
  });

  aggregated.forEach(link => links.set(link.id, link));

  const cycleVersion = collapsedCycleGroups
    .map(group => `${group.id}:${Array.from(group.members).sort().join(',')}`)
    .sort()
    .join('|');
  const version = hashString([groupedGraphStructure.version, cycleVersion].join('::'));

  return {
    nodes,
    links,
    version,
    lastStructuralChange: Date.now(),
  };
};

export const buildGraphHighlightedNodes = (
  activeNodeIds: Set<string>,
  highlightNodes: Set<string>,
  pendingLinkSourceId: string | null,
) => {
  const combined = new Set<string>();

  activeNodeIds.forEach(id => combined.add(id));
  highlightNodes.forEach(id => combined.add(id));
  if (pendingLinkSourceId) combined.add(pendingLinkSourceId);

  return combined;
};

export const buildQuestNodeIds = (
  stableGraphNodes: GraphNode[],
  questVisibilityMode: 'on' | 'off',
) => {
  if (questVisibilityMode === 'on') return new Set<string>();
  const ids = new Set<string>();
  stableGraphNodes.forEach(node => {
    if (node.type === 'quest') ids.add(node.id);
  });
  return ids;
};

export const buildRenderGraphNodes = (
  stableGraphNodes: GraphNode[],
  questVisibilityMode: 'on' | 'off',
) => {
  if (questVisibilityMode === 'off') {
    return stableGraphNodes.filter(node => node.type !== 'quest');
  }
  return stableGraphNodes;
};

export const buildRenderGraphLinks = (
  stableGraphLinks: GraphLink[],
  questNodeIds: Set<string>,
  questVisibilityMode: 'on' | 'off',
) => {
  if (questVisibilityMode === 'on') return stableGraphLinks;
  if (questNodeIds.size === 0) return stableGraphLinks;
  return stableGraphLinks.filter(link => {
    const sourceId = typeof link.source === 'object' ? (link.source as GraphNode).id : String(link.source);
    const targetId = typeof link.target === 'object' ? (link.target as GraphNode).id : String(link.target);
    return !questNodeIds.has(sourceId) && !questNodeIds.has(targetId);
  });
};

// Counts of all (recursive) prerequisite ancestors per node code. Cycles are
// tolerated: a node currently being visited contributes an empty set.
export const buildRecursivePrereqCounts = (
  definitions: GraphData['definitions'],
  exercises: GraphData['exercises'],
): Map<string, number> => {
  const prereqByCode = new Map<string, string[]>();
  Object.values(definitions || {}).forEach(def => {
    prereqByCode.set(def.code, (def.prerequisites || []).filter(Boolean));
  });
  Object.values(exercises || {}).forEach(ex => {
    prereqByCode.set(ex.code, (ex.prerequisites || []).filter(Boolean));
  });

  const memo = new Map<string, Set<string>>();
  const visiting = new Set<string>();

  const collectAncestors = (code: string): Set<string> => {
    const cached = memo.get(code);
    if (cached) return cached;
    if (visiting.has(code)) return new Set<string>();

    visiting.add(code);
    const result = new Set<string>();
    const prereqs = prereqByCode.get(code) || [];

    prereqs.forEach(prereqCode => {
      if (!prereqCode || prereqCode === code) return;
      result.add(prereqCode);
      const nested = collectAncestors(prereqCode);
      nested.forEach(parentCode => result.add(parentCode));
    });

    visiting.delete(code);
    memo.set(code, result);
    return result;
  };

  prereqByCode.forEach((_, code) => {
    collectAncestors(code);
  });

  const countMap = new Map<string, number>();
  memo.forEach((ancestorSet, code) => {
    countMap.set(code, ancestorSet.size);
  });
  return countMap;
};
