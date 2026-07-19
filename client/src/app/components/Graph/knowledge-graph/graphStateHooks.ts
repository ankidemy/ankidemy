import { useMemo, useRef } from 'react';

import type {
  Exercise as ApiExercise,
  ExternalPrerequisiteLink,
} from '@/lib/api';
import { calculateDaysUntilReview, getExerciseSolveColor, getStatusColor, isNodeDue } from '@/lib/srs-api';
import { NodeStatus, exerciseSolveState } from '../../../../types/srs';
import type {
  Definition,
  Exercise,
  GraphLink,
  GraphNode,
  Quest,
  SourceNode,
} from '../utils/types';
import { PositionManager } from '../utils/PositionManager';

import { buildExternalNodeId, hashString } from './graphAlgorithms';
import type {
  ExternalNodeLookupEntry,
  GraphMetadataState,
  GraphNodeCore,
  GraphStructureState,
  NodeMetadata,
} from './types';

export const buildGraphStructureState = (
  definitions: Record<string, Definition>,
  exercises: Record<string, Exercise>,
  sources: Record<string, SourceNode>,
  quests: Record<string, Quest>,
  relations: Array<{ fromCode: string; toCode: string; relationType?: string }>,
  externalLinks: ExternalPrerequisiteLink[],
): GraphStructureState => {
  const nodes = new Map<string, GraphNodeCore>();
  const links = new Map<string, {
    id: string;
    source: string;
    target: string;
    type: string;
    relationType?: string;
    weight: number;
  }>();

  const defStructureHash = Object.values(definitions)
    .map(d => `${d.code}:${(d.prerequisites || []).sort().join(',')}`)
    .sort()
    .join('|');

  const exStructureHash = Object.values(exercises)
    .map(e => `${e.code}:${(e.prerequisites || []).sort().join(',')}`)
    .sort()
    .join('|');

  const defWeightHash = Object.values(definitions)
    .map(d => {
      const weights = Object.fromEntries(Object.entries(d.prerequisiteWeights || {}).sort());
      return `${d.code}:${JSON.stringify(weights)}`;
    })
    .sort()
    .join('|');

  const exWeightHash = Object.values(exercises)
    .map(e => {
      const weights = Object.fromEntries(Object.entries(e.prerequisiteWeights || {}).sort());
      return `${e.code}:${JSON.stringify(weights)}`;
    })
    .sort()
    .join('|');

  const sourceStructureHash = Object.values(sources)
    .map(s => s.code)
    .sort()
    .join('|');

  const questStructureHash = Object.values(quests)
    .map(q => q.code)
    .sort()
    .join('|');

  const relationHash = relations
    .map(r => `${r.fromCode}->${r.toCode}:${r.relationType ?? ''}`)
    .sort()
    .join('|');

  const externalLinkHash = externalLinks
    .map(link => `${link.nodeId}:${link.nodeType}:${link.externalDomainUid}:${link.externalNodeType}:${link.externalNodeId}:${link.status}:${link.xPosition ?? ''}:${link.yPosition ?? ''}`)
    .sort()
    .join('|');

  const version = hashString([
    defStructureHash,
    exStructureHash,
    defWeightHash,
    exWeightHash,
    sourceStructureHash,
    questStructureHash,
    relationHash,
    externalLinkHash,
  ].join('::'));

  const numericIdToCode = new Map<number, string>();

  Object.values(definitions).forEach(def => {
    if (!def?.code) return;
    if (typeof def.id === 'number') {
      numericIdToCode.set(def.id, def.code);
    }
    nodes.set(def.code, {
      id: def.code,
      type: 'definition',
      prerequisites: def.prerequisites,
      domainId: def.domainId,
      xPosition: def.xPosition,
      yPosition: def.yPosition,
    });
  });

  Object.values(definitions).forEach(def => {
    if (!def?.code) return;
    (def.prerequisites || []).forEach(prereqCode => {
      if (!nodes.has(prereqCode) || !nodes.has(def.code)) return;
      const linkId = `${prereqCode}-${def.code}`;
      links.set(linkId, {
        id: linkId,
        source: prereqCode,
        target: def.code,
        type: 'prerequisite',
        weight: def.prerequisiteWeights?.[prereqCode] ?? 1.0,
      });
    });
  });

  Object.values(exercises).forEach(ex => {
    if (!ex?.code) return;
    if (typeof ex.id === 'number') {
      numericIdToCode.set(ex.id, ex.code);
    }
    nodes.set(ex.code, {
      id: ex.code,
      type: 'exercise',
      prerequisites: ex.prerequisites,
      domainId: ex.domainId,
      xPosition: ex.xPosition,
      yPosition: ex.yPosition,
    });
  });

  Object.values(exercises).forEach(ex => {
    if (!ex?.code) return;
    (ex.prerequisites || []).forEach(prereqCode => {
      if (!nodes.has(prereqCode) || !nodes.has(ex.code)) return;
      const linkId = `${prereqCode}-${ex.code}`;
      links.set(linkId, {
        id: linkId,
        source: prereqCode,
        target: ex.code,
        type: 'prerequisite',
        weight: ex.prerequisiteWeights?.[prereqCode] ?? 1.0,
      });
    });
  });

  Object.values(sources).forEach(src => {
    if (!src?.code) return;
    nodes.set(src.code, {
      id: src.code,
      type: 'source',
      domainId: src.domainId,
      xPosition: src.xPosition,
      yPosition: src.yPosition,
    });
  });

  Object.values(quests).forEach(q => {
    if (!q?.code) return;
    nodes.set(q.code, {
      id: q.code,
      type: 'quest',
      domainId: q.domainId,
      xPosition: q.xPosition,
      yPosition: q.yPosition,
    });
  });

  relations.forEach(rel => {
    if (!nodes.has(rel.fromCode) || !nodes.has(rel.toCode)) return;
    const linkId = `${rel.fromCode}-${rel.toCode}-${rel.relationType ?? 'relation'}`;
    links.set(linkId, {
      id: linkId,
      source: rel.fromCode,
      target: rel.toCode,
      type: 'relation',
      relationType: rel.relationType,
      weight: 1.0,
    });
  });

  externalLinks.forEach(link => {
    const targetCode = numericIdToCode.get(link.nodeId);
    if (!targetCode || !nodes.has(targetCode)) return;

    const externalNodeId = buildExternalNodeId(link);
    const linkX = typeof link.xPosition === 'number' ? link.xPosition : undefined;
    const linkY = typeof link.yPosition === 'number' ? link.yPosition : undefined;
    if (!nodes.has(externalNodeId)) {
      nodes.set(externalNodeId, {
        id: externalNodeId,
        type: link.externalNodeType === 'exercise' ? 'exercise' : 'definition',
        isExternal: true,
        externalStatus: link.status,
        externalDomainId: link.externalDomainId,
        externalDomainUid: link.externalDomainUid,
        externalNodeId: link.externalNodeId,
        externalNodeType: link.externalNodeType,
        xPosition: linkX,
        yPosition: linkY,
      });
    } else {
      const existing = nodes.get(externalNodeId);
      if (existing && (existing.xPosition === undefined || existing.yPosition === undefined) && linkX !== undefined && linkY !== undefined) {
        existing.xPosition = linkX;
        existing.yPosition = linkY;
      }
    }

    const linkId = `${externalNodeId}-${targetCode}`;
    links.set(linkId, {
      id: linkId,
      source: externalNodeId,
      target: targetCode,
      type: 'external',
      weight: 1.0,
    });
  });

  return {
    nodes,
    links,
    version,
    lastStructuralChange: Date.now(),
  };
};

export const useGraphStructure = (
  definitions: Record<string, Definition>,
  exercises: Record<string, Exercise>,
  sources: Record<string, SourceNode>,
  quests: Record<string, Quest>,
  relations: Array<{ fromCode: string; toCode: string; relationType?: string }>,
  externalLinks: ExternalPrerequisiteLink[],
): GraphStructureState => {
  return useMemo(
    () => buildGraphStructureState(definitions, exercises, sources, quests, relations, externalLinks),
    [definitions, exercises, sources, quests, relations, externalLinks],
  );
};

export const buildGraphMetadataState = (
  structureNodes: Map<string, GraphNodeCore>,
  definitions: Record<string, Definition>,
  exercises: Record<string, Exercise>,
  sources: Record<string, SourceNode>,
  quests: Record<string, Quest>,
  srs: any,
  codeToNumericIdMap: Map<string, number>,
  groupNodeMetadata: Map<string, NodeMetadata>,
  externalNodeLookup: Map<string, ExternalNodeLookupEntry>,
  surveyDueQuestCodes: Set<string> = new Set<string>(),
  hasSurveyQueueSnapshot = false,
): GraphMetadataState => {
  const nodeMetadata = new Map<string, NodeMetadata>();
  const linkMetadata = new Map<string, {
    color?: string;
    opacity?: number;
    isHighlighted?: boolean;
  }>();
  const dueNodeCodes = new Set(
    (srs.state.dueReviews || [])
      .map((review: any) => review?.nodeCode)
      .filter(Boolean),
  );

  structureNodes.forEach((nodeCore, nodeId) => {
    const groupMeta = groupNodeMetadata.get(nodeId);
    if (groupMeta) {
      nodeMetadata.set(nodeId, groupMeta);
      return;
    }

    const externalInfo = externalNodeLookup.get(nodeId);
    if (externalInfo) {
      const isExercise = externalInfo.type === 'exercise';
      const isMissing = externalInfo.status !== 'ok';
      const color = isMissing
        ? 'rgba(248, 113, 113, 0.45)'
        : (isExercise ? 'rgba(251, 146, 60, 0.28)' : 'rgba(59, 130, 246, 0.28)');

      nodeMetadata.set(nodeId, {
        name: externalInfo.name,
        displayId: externalInfo.displayId,
        isExternal: true,
        externalStatus: externalInfo.status,
        externalDomainId: externalInfo.externalDomainId,
        externalDomainUid: externalInfo.externalDomainUid,
        externalNodeId: externalInfo.externalNodeId,
        externalNodeType: externalInfo.externalNodeType,
        externalDomainName: externalInfo.externalDomainName,
        externalNodeName: externalInfo.externalNodeName,
        color,
        isDue: false,
        daysUntilReview: null,
        progress: null,
      });
      return;
    }

    if (nodeCore.type === 'source') {
      const source = sources[nodeId];
      nodeMetadata.set(nodeId, {
        name: source?.title?.trim() ? source.title : 'Source',
        color: 'rgba(16, 185, 129, 0.35)',
        isDue: false,
        daysUntilReview: null,
        progress: null,
      });
      return;
    }

    if (nodeCore.type === 'quest') {
      const quest = quests[nodeId];
      const title = quest?.name?.trim() || 'Quest';
      const dueAtMs = quest?.nextDueAt ? Date.parse(quest.nextDueAt) : NaN;
      const isQuestDueFromSchedule = (quest?.active !== false) && Number.isFinite(dueAtMs) && dueAtMs <= Date.now();
      const isQuestDue = hasSurveyQueueSnapshot
        ? surveyDueQuestCodes.has(nodeId)
        : isQuestDueFromSchedule;
      nodeMetadata.set(nodeId, {
        name: title,
        color: 'rgba(245, 158, 11, 0.35)',
        isDue: isQuestDue,
        daysUntilReview: null,
        progress: null,
      });
      return;
    }

    const numericId = codeToNumericIdMap.get(nodeId);
    const progress = numericId ? srs.getNodeProgress(numericId, nodeCore.type) : null;

    const fullNodeData = definitions[nodeId] || exercises[nodeId];
    const isDefinition = nodeCore.type === 'definition';
    const isRoot = (nodeCore.prerequisites || []).length === 0;
    const status = (progress?.status as NodeStatus) || 'fresh';
    // Definitions are colored by their SRS status; exercises by solve state
    // (unsolved / tried / solved) since their status is derived.
    const srsColor = isDefinition
      ? getStatusColor(status)
      : getExerciseSolveColor(exerciseSolveState(progress));
    // Keep frontend due highlighting aligned with backend queue/review rules:
    // only grasped nodes are eligible to be due.
    const isReviewEligible = status === 'grasped';
    const isDue = isReviewEligible && (
      (progress ? isNodeDue(progress.nextReview) : false) || dueNodeCodes.has(nodeId)
    );

    nodeMetadata.set(nodeId, {
      name: fullNodeData?.name ?? nodeId,
      isRootDefinition: isDefinition ? isRoot : undefined,
      difficulty: !isDefinition ? ((fullNodeData as ApiExercise | undefined)?.difficulty) : undefined,
      status,
      isDue,
      daysUntilReview: progress ? calculateDaysUntilReview(progress.nextReview) : null,
      progress: progress || null,
      color: srsColor,
    });
  });

  const signature = Array.from(nodeMetadata.entries())
    .map(([id, meta]) => {
      const status = meta.status ?? '';
      const isDue = meta.isDue ? '1' : '0';
      const color = meta.color ?? '';
      const ext = meta.externalStatus ?? '';
      const difficulty = meta.difficulty ?? '';
      const groupCount = meta.groupMemberCount ?? '';
      return `${id}:${meta.name}:${status}:${isDue}:${color}:${ext}:${difficulty}:${groupCount}`;
    })
    .sort()
    .join('|');

  return {
    nodeMetadata,
    linkMetadata,
    version: hashString(signature),
    lastMetadataChange: Date.now(),
  };
};

export const useGraphMetadata = (
  structureNodes: Map<string, GraphNodeCore>,
  definitions: Record<string, Definition>,
  exercises: Record<string, Exercise>,
  sources: Record<string, SourceNode>,
  quests: Record<string, Quest>,
  srs: any,
  codeToNumericIdMap: Map<string, number>,
  groupNodeMetadata: Map<string, NodeMetadata>,
  externalNodeLookup: Map<string, ExternalNodeLookupEntry>,
  surveyDueQuestCodes: Set<string> = new Set<string>(),
  hasSurveyQueueSnapshot = false,
): GraphMetadataState => {
  return useMemo(
    () => buildGraphMetadataState(
      structureNodes,
      definitions,
      exercises,
      sources,
      quests,
      srs,
      codeToNumericIdMap,
      groupNodeMetadata,
      externalNodeLookup,
      surveyDueQuestCodes,
      hasSurveyQueueSnapshot,
    ),
    [
      structureNodes,
      definitions,
      exercises,
      sources,
      quests,
      srs,
      codeToNumericIdMap,
      groupNodeMetadata,
      externalNodeLookup,
      surveyDueQuestCodes,
      hasSurveyQueueSnapshot,
    ],
  );
};

export const useStableGraph = (
  structure: GraphStructureState,
  metadata: GraphMetadataState,
  positionManager: PositionManager,
) => {
  const stableNodesRef = useRef<GraphNode[]>([]);
  const stableLinksRef = useRef<GraphLink[]>([]);
  const lastStructureVersionRef = useRef<number>(-1);
  const structureNonceRef = useRef<number>(0);

  return useMemo(() => {
    const structureChanged = structure.version !== lastStructureVersionRef.current;

    stableNodesRef.current.forEach(node => {
      const nodeMeta = metadata.nodeMetadata.get(node.id);
      if (nodeMeta) Object.assign(node, nodeMeta);
    });

    if (!structureChanged) {
      return {
        nodes: stableNodesRef.current,
        links: stableLinksRef.current,
        requiresPhysicsReset: false,
        structureVersion: structureNonceRef.current,
      };
    }

    const prevNodes = stableNodesRef.current;
    const prevIndexById = new Map<string, number>();
    prevNodes.forEach((n, i) => prevIndexById.set(n.id, i));

    const nextIds = new Set<string>();
    let addedNodes = 0;
    let removedNodes = 0;

    structure.nodes.forEach((nodeCore, nodeId) => {
      nextIds.add(nodeId);
      const idx = prevIndexById.get(nodeId);
      if (idx === undefined) {
        const nodeMeta = metadata.nodeMetadata.get(nodeId);
        const created: GraphNode = {
          ...nodeCore,
          ...(nodeMeta || { name: nodeId, status: 'fresh' as NodeStatus, color: '#999' }),
          x: nodeCore.xPosition,
          y: nodeCore.yPosition,
        };
        const saved = positionManager.getPosition(nodeId);
        if (saved) {
          created.x = saved.x;
          created.y = saved.y;
        }
        prevNodes.push(created);
        addedNodes++;
      }
    });

    for (let i = prevNodes.length - 1; i >= 0; i--) {
      const n = prevNodes[i];
      if (!nextIds.has(n.id)) {
        prevNodes.splice(i, 1);
        removedNodes++;
      }
    }

    const prevLinks = stableLinksRef.current;
    const prevLinkIndex = new Map<string, number>();
    for (let i = 0; i < prevLinks.length; i++) {
      const l = prevLinks[i];
      const sid = typeof l.source === 'object' ? (l.source as any).id : String(l.source);
      const tid = typeof l.target === 'object' ? (l.target as any).id : String(l.target);
      const key = l.id ?? `${sid}-${tid}`;
      prevLinkIndex.set(key, i);
    }

    const seen = new Set<string>();
    let addedLinks = 0;
    let removedLinks = 0;

    structure.links.forEach(lc => {
      const key = lc.id || `${lc.source}-${lc.target}`;
      seen.add(key);
      const idx = prevLinkIndex.get(key);
      if (idx === undefined) {
        prevLinks.push({
          id: lc.id,
          source: lc.source,
          target: lc.target,
          type: lc.type,
          relationType: lc.relationType,
          weight: lc.weight,
        });
        addedLinks++;
      } else {
        const existing = prevLinks[idx] as any;
        existing.id = lc.id;
        if (existing.weight !== lc.weight) existing.weight = lc.weight;
        if (existing.type !== lc.type) existing.type = lc.type;
        if (existing.relationType !== lc.relationType) existing.relationType = lc.relationType;
      }
    });

    for (let i = prevLinks.length - 1; i >= 0; i--) {
      const l = prevLinks[i];
      const sid = typeof l.source === 'object' ? (l.source as any).id : String(l.source);
      const tid = typeof l.target === 'object' ? (l.target as any).id : String(l.target);
      const key = l.id ?? `${sid}-${tid}`;
      if (!seen.has(key)) {
        prevLinks.splice(i, 1);
        removedLinks++;
      }
    }

    structureNonceRef.current++;
    lastStructureVersionRef.current = structure.version;

    const requiresReset = removedNodes > 0 || removedLinks > 0 || (addedNodes + addedLinks) > 8;
    if (requiresReset) positionManager.markUnstable();

    return {
      nodes: prevNodes,
      links: prevLinks,
      requiresPhysicsReset: requiresReset,
      structureVersion: structureNonceRef.current,
    };
  }, [metadata.nodeMetadata, positionManager, structure.links, structure.nodes, structure.version]);
};
