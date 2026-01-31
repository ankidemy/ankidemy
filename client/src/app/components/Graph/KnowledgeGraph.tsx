// client/src/app/components/Graph/KnowledgeGraph.tsx

"use client";

import React, { useState, useRef, useCallback, useMemo, FC, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MathJaxProvider } from '@/app/components/core/MathJaxWrapper';
import { MarkdownKatex } from '@/app/components/core/MarkdownKatex';
import { UIProvider, useUI } from '@/contexts/UIContext';
import { DraggableWindow } from '@/app/components/core/DraggableWindow';
import ContextToolbar, { ToolbarLayout } from './components/ContextToolbar';
import { DetailWindowContent } from './windows/DetailWindowContent';
import { ReviewWindowContent } from './windows/ReviewWindowContent';
import { SourceWindowContent } from './windows/SourceWindowContent';
import { QuestWindowContent } from './windows/QuestWindowContent';
import { SurveyWindowContent } from './windows/SurveyWindowContent';
import { RefreshCw, List, Maximize, Download, Upload, Eye, EyeOff, LifeBuoy, Anchor, RadioTower, Compass, Link2, Unlink, Trash2, Pencil, MousePointer, Undo2, Flag, FlagTriangleLeft, Check, UserPlus, UserMinus, Plus, Minus } from 'lucide-react';
import { Button } from "@/app/components/core/button";
import {
  getDefinitionByCode,
  getExerciseByCode,
  Definition as ApiDefinition,
  Exercise as ApiExercise,
  getDomainMetaDefinitions,
  getDomainMetaExercises,
  getDomainSources,
  getSource,
  getDomainQuests,
  getDomainRelations,
  getQuest,
  getSurveyStats,
  createSource,
  updateSource,
  deleteSource,
  createQuest,
  updateQuest,
  deleteQuest,
  createRelation,
  deleteRelation,
  getExternalPrerequisites,
  updateExternalPrerequisitePositions,
  getDomainGroups,
  createDomainGroup,
  updateGroup,
  deleteGroup,
  updateGroupState,
  updateGroupPositions,
  GroupData,
  GroupNodeRefRequest,
  MetaDefinition,
  MetaExercise,
  ExternalPrerequisiteLink,
  createMetaDefinition,
  createMetaExercise,
  getMetaDefinition,
  getMetaExercise,
  updateMetaDefinition,
  updateMetaExercise,
  updateMetaDefinitionVersion,
  updateMetaExerciseVersion,
  addMetaDefinitionVersion,
  addMetaExerciseVersion,
  deleteMetaDefinition,
  deleteMetaExercise,
  deleteMetaDefinitionVersion,
  deleteMetaExerciseVersion,
  DefinitionVersion,
  ExerciseVersion,
  getDomain,
  enrollInDomain,
  getEnrolledDomains,
  getCurrentUser,
  User,
  uploadNodeImage,
} from '@/lib/api';
import { useSRS } from '../../../contexts/SRSContext';
import { getStatusColor, isNodeDue, calculateDaysUntilReview, createPrerequisite, deletePrerequisite, getDomainPrerequisites, updateNodeStatus } from '@/lib/srs-api';
import { NodeStatus, NodePrerequisite } from '../../../types/srs';

import {
  GraphNode,
  GraphLink,
  Definition,
  Exercise,
  SourceNode,
  MetaQuest,
  NodeRelation,
  AppMode,
  FilteredNodeType,
  KnowledgeGraphProps,
} from './utils/types';
import GraphContainer, { LabelDisplayMode } from './utils/GraphContainer';
import GraphLegend from './utils/GraphLegend';
import { GraphLifecycle } from './utils/GraphLifecycle';
import TopControls from './panels/TopControls';
import LeftPanelToggle from './panels/LeftPanelToggle';
import ZoomableImage from './components/ZoomableImage';
import LeftPanel from './panels/LeftPanel';
import NodeCreationModal from './NodeCreationModal';
import { showToast } from '@/app/components/core/ToastNotification';
import EnrollmentModal from './EnrollmentModal';
import DomainAccessModal from '@/app/components/Domain/DomainAccessModal';
import { PositionManager } from './utils/PositionManager';
import {
  getNextDotCode as getNextDotCodeFromUtils,
  getNextExerciseCode as getNextExerciseCodeFromUtils,
  getNextQuestCode as getNextQuestCodeFromUtils,
  getNextSourceCode as getNextSourceCodeFromUtils,
} from './utils/codeGeneration';

// ============================================================================
// TYPE DEFINITIONS FOR TRUE STRUCTURE/METADATA SEPARATION
// ============================================================================

// Structure only contains topology data - no names or visual properties
interface GraphNodeCore {
  id: string;
  type: 'definition' | 'exercise' | 'source' | 'quest' | 'group';
  prerequisites?: string[];
  domainId?: number;
  xPosition?: number;
  yPosition?: number;
  isExternal?: boolean;
  externalStatus?: ExternalPrerequisiteLink['status'];
  externalDomainId?: number;
  externalDomainUid?: string;
  externalNodeId?: number;
  externalNodeType?: 'meta_definition' | 'meta_exercise';
  groupId?: number;
  groupMemberIds?: string[];
  groupMemberCount?: number;
  groupIsExact?: boolean;
}

interface GraphLinkCore {
  id: string;
  source: string;
  target: string;
  type: string;
  weight: number;
  relationType?: string;
}

interface GraphStructureState {
  nodes: Map<string, GraphNodeCore>;
  links: Map<string, GraphLinkCore>;
  version: number;
  lastStructuralChange: number;
}

// Metadata contains all visual and display properties
interface NodeMetadata {
  name: string;
  displayId?: string;
  isRootDefinition?: boolean;
  difficulty?: number;
  status?: NodeStatus;
  isDue?: boolean;
  daysUntilReview?: number | null;
  progress?: any;
  color?: string;
  isExternal?: boolean;
  externalStatus?: ExternalPrerequisiteLink['status'];
  externalDomainId?: number;
  externalDomainUid?: string;
  externalNodeId?: number;
  externalNodeType?: 'meta_definition' | 'meta_exercise';
  externalDomainName?: string;
  externalNodeName?: string;
  groupId?: number;
  groupMemberIds?: string[];
  groupMemberCount?: number;
  groupIsExact?: boolean;
}

interface LinkMetadata {
  color?: string;
  opacity?: number;
  isHighlighted?: boolean;
}

interface GraphMetadataState {
  nodeMetadata: Map<string, NodeMetadata>;
  linkMetadata: Map<string, LinkMetadata>;
  version: number;
  lastMetadataChange: number;
}

type FrenzyEditTool = 'none' | 'link' | 'unlink' | 'delete';

interface FrenzyNoteState {
  nodeId: string;
  nodeType: 'definition' | 'exercise' | 'source';
  nodeName: string;
  metaId: number;
  version: DefinitionVersion | ExerciseVersion;
  allVersions: (DefinitionVersion | ExerciseVersion)[];
  versionIndex: number;
  prompt: string;
  defaultPrompt: string;
  isAutoPrompt: boolean;
  promptImagePath: string;
  content: string;
  defaultContent: string;
  isAutoContent: boolean;
  contentImagePath: string;
  solution: string;
  solutionImagePath: string;
}

interface FrenzyDeletedNodeSnapshot {
  nodeType: 'definition' | 'exercise';
  code: string;
  name: string;
  xPosition?: number;
  yPosition?: number;
  prerequisites: string[];
  prerequisiteWeights: Record<string, number>;
  versions: DefinitionVersion[] | ExerciseVersion[];
  incoming: Array<{ code: string; type: 'definition' | 'exercise'; weight: number }>;
}

// ============================================================================
// UTILS
// ============================================================================

// Robust string hash for change detection (fixes version collision bug)
function hashString(str: string): number {
  let hash = 5381; // djb2
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Debounce with correct type
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

const FRENZY_DOUBLE_CLICK_MS = 260;
const FRENZY_SINGLE_CLICK_DELAY_MS = 270;
const FRENZY_LINK_SNAP_DISTANCE = 20;

const buildExternalNodeId = (link: ExternalPrerequisiteLink): string => {
  const domainUid = link.externalDomainUid || 'unknown';
  return `ext:${domainUid}:${link.externalNodeType}:${link.externalNodeId}`;
};

const parseExternalNodeId = (nodeId: string): {
  externalDomainUid: string;
  externalNodeType: 'meta_definition' | 'meta_exercise';
  externalNodeId: number;
} | null => {
  if (!nodeId.startsWith('ext:')) return null;
  const parts = nodeId.split(':');
  if (parts.length !== 4) return null;
  const [, domainUid, nodeType, nodeIdStr] = parts;
  if (nodeType !== 'meta_definition' && nodeType !== 'meta_exercise') return null;
  const parsed = parseInt(nodeIdStr, 10);
  if (Number.isNaN(parsed)) return null;
  return {
    externalDomainUid: domainUid,
    externalNodeType: nodeType,
    externalNodeId: parsed,
  };
};

const buildGroupNodeId = (groupId: number) => `group:${groupId}`;

const parseGroupNodeId = (nodeId: string): number | null => {
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

const computeConvexClosure = (
  seeds: string[],
  outgoing: Map<string, Set<string>>,
  incoming: Map<string, Set<string>>
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

const intersects = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 || b.size === 0) return false;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of small) {
    if (large.has(item)) return true;
  }
  return false;
};

type CycleGroup = {
  id: string;
  members: Set<string>;
};

const buildAdjacencyFromLinks = (
  nodes: string[],
  links: Map<string, GraphLinkCore>
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

const computeStronglyConnectedComponents = (
  nodes: string[],
  outgoing: Map<string, Set<string>>
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

const getExternalNodeLabel = (link: ExternalPrerequisiteLink): string => {
  const nodeLabel = link.externalNodeName || `Node ${link.externalNodeId}`;
  const domainLabel = link.externalDomainName || 'External';
  return `${domainLabel}: ${nodeLabel}`;
};

// ============================================================================
// HOOKS FOR TRUE STRUCTURE/METADATA SEPARATION
// ============================================================================

// Only tracks true structural changes (topology)
const useGraphStructure = (
  definitions: Record<string, Definition>,
  exercises: Record<string, Exercise>,
  sources: Record<string, SourceNode>,
  quests: Record<string, MetaQuest>,
  relations: Array<{ fromCode: string; toCode: string; relationType?: string }>,
  externalLinks: ExternalPrerequisiteLink[]
): GraphStructureState => {
  return useMemo(() => {
    const nodes = new Map<string, GraphNodeCore>();
    const links = new Map<string, GraphLinkCore>();

    // Hash only includes structural data (IDs and prerequisites)
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
    
    // FIX: robust version
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

    // PASS 1: Build nodes for all definitions (structure only)
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

    // PASS 2: Build links between definitions
    Object.values(definitions).forEach(def => {
      if (!def?.code) return;
      (def.prerequisites || []).forEach(prereqCode => {
        // Guard: only create link if both endpoints exist (prevents d3 error)
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

    // PASS 1: create all exercise nodes first so cross-exercise links can attach regardless of iteration order
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

    // PASS 2: add links from prerequisites (definitions or other exercises) to each exercise
    Object.values(exercises).forEach(ex => {
      if (!ex?.code) return;
      (ex.prerequisites || []).forEach(prereqCode => {
        if (nodes.has(prereqCode) && nodes.has(ex.code)) {
          const linkId = `${prereqCode}-${ex.code}`;
          links.set(linkId, {
            id: linkId,
            source: prereqCode,
            target: ex.code,
            type: 'prerequisite',
            weight: ex.prerequisiteWeights?.[prereqCode] ?? 1.0,
          });
        }
      });
    });

    // Source nodes
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

    // Quest nodes
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

    // Relations links
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

    // External prerequisite links
    externalLinks.forEach(link => {
      const targetCode = numericIdToCode.get(link.nodeId);
      if (!targetCode || !nodes.has(targetCode)) return;

      const externalNodeId = buildExternalNodeId(link);
      const linkX = typeof link.xPosition === 'number' ? link.xPosition : undefined;
      const linkY = typeof link.yPosition === 'number' ? link.yPosition : undefined;
      if (!nodes.has(externalNodeId)) {
        nodes.set(externalNodeId, {
          id: externalNodeId,
          type: link.externalNodeType === 'meta_exercise' ? 'exercise' : 'definition',
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

    console.log(`Graph structure: ${nodes.size} nodes, ${links.size} links, version ${version}`);
    
    return {
      nodes,
      links,
      version,
      lastStructuralChange: Date.now(),
    };
  }, [
    // Dependencies only track structural changes
    Object.keys(definitions).sort().join(','),
    Object.keys(exercises).sort().join(','),
    Object.keys(sources).sort().join(','),
    Object.keys(quests).sort().join(','),
    // Track prerequisite structure changes
    JSON.stringify(Object.fromEntries(
      Object.values(definitions).map(d => [d.code, (d.prerequisites || []).sort()])
    )),
    JSON.stringify(Object.fromEntries(
      Object.values(exercises).map(e => [e.code, (e.prerequisites || []).sort()])
    )),
    // Track weight changes so link labels update without a physics reset
    JSON.stringify(Object.fromEntries(
      Object.values(definitions).map(d => [d.code, d.prerequisiteWeights || {}])
    )),
    JSON.stringify(Object.fromEntries(
      Object.values(exercises).map(e => [e.code, e.prerequisiteWeights || {}])
    )),
    JSON.stringify((relations || []).map(r => `${r.fromCode}->${r.toCode}:${r.relationType ?? ''}`).sort()),
    externalLinks
      .map(link => `${link.nodeId}:${link.nodeType}:${link.externalDomainUid}:${link.externalNodeType}:${link.externalNodeId}:${link.status}:${link.xPosition ?? ''}:${link.yPosition ?? ''}`)
      .sort()
      .join('|'),
  ]);
};

// Tracks all metadata including names
const useGraphMetadata = (
  structureNodes: Map<string, GraphNodeCore>,
  definitions: Record<string, Definition>,
  exercises: Record<string, Exercise>,
  sources: Record<string, SourceNode>,
  quests: Record<string, MetaQuest>,
  srs: any,
  codeToNumericIdMap: Map<string, number>,
  activeNodeIds: Set<string>,
  selectedNodeIds: Set<string>,
  highlightNodes: Set<string>,
  groupNodeMetadata: Map<string, NodeMetadata>,
  externalNodeLookup: Map<string, {
    id: string;
    name: string;
    displayId?: string;
    type: 'definition' | 'exercise';
    status: ExternalPrerequisiteLink['status'];
    externalDomainId?: number;
    externalDomainUid?: string;
    externalNodeId?: number;
    externalNodeType?: 'meta_definition' | 'meta_exercise';
    externalDomainName?: string;
    externalNodeName?: string;
  }>
): GraphMetadataState => {
  return useMemo(() => {
    const nodeMetadata = new Map<string, NodeMetadata>();
    const linkMetadata = new Map<string, LinkMetadata>();
    const dueNodeCodes = new Set(
      (srs.state.dueReviews || [])
        .map((review: any) => review?.nodeCode)
        .filter(Boolean)
    );

    // Build metadata for each node
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
        nodeMetadata.set(nodeId, {
          name: title,
          color: 'rgba(245, 158, 11, 0.35)',
          isDue: false,
          daysUntilReview: null,
          progress: null,
        });
        return;
      }

      const numericId = codeToNumericIdMap.get(nodeId);
      const progress = numericId ? srs.getNodeProgress(numericId, nodeCore.type) : null;
      
      // Get full node data to access metadata properties
      const fullNodeData = definitions[nodeId] || exercises[nodeId];

      // Fallbacks (critical fix): even if full data isn't present yet,
      // produce minimal metadata so the node isn't dropped.
      const isDefinition = nodeCore.type === 'definition';
      const isRoot = (nodeCore.prerequisites || []).length === 0;
      const status = (progress?.status as NodeStatus) || 'fresh';
      const srsColor = getStatusColor(status);
      const isDue = (progress ? (isNodeDue(progress.nextReview) && status !== 'learned') : false) || dueNodeCodes.has(nodeId);

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

    return {
      nodeMetadata,
      linkMetadata,
      version: Date.now(),
      lastMetadataChange: Date.now(),
    };
  }, [
    // Dependencies track metadata changes
    srs.state.domainProgress,
    srs.state.lastUpdated,
    srs.state.dueReviews,
    // IMPORTANT: Recompute when the set of structure nodes changes
    // This ensures newly materialized nodes receive proper SRS-driven colors instead of gray fallbacks.
    (() => Array.from(structureNodes.keys()).sort().join('|'))(),
    // active/selected/highlight removed to avoid hover-triggered reflow
    codeToNumericIdMap,
    // Track name and other metadata changes
    Object.values(definitions).map(d => d.name).join('|'),
    Object.values(exercises).map(e => e.name).join('|'),
    Object.values(sources).map(s => s.title).join('|'),
    Object.values(quests).map(q => `${q.code}:${q.name ?? ''}`).join('|'),
    Object.values(exercises).map(e => String(e.difficulty ?? '')).join('|'),
    // Track positions so we can apply them without a physics reset
    Object.values(definitions).map(d => `${d.code}:${d.xPosition ?? ''}:${d.yPosition ?? ''}`).join('|'),
    Object.values(exercises).map(e => `${e.code}:${e.xPosition ?? ''}:${e.yPosition ?? ''}`).join('|'),
    Object.values(sources).map(s => `${s.code}:${s.xPosition ?? ''}:${s.yPosition ?? ''}`).join('|'),
    Object.values(quests).map(q => `${q.code}:${q.xPosition ?? ''}:${q.yPosition ?? ''}`).join('|'),
    Array.from(groupNodeMetadata.entries())
      .map(([id, meta]) => `${id}:${meta.name}:${meta.groupMemberCount ?? ''}:${meta.groupIsExact ? '1' : '0'}`)
      .sort()
      .join('|'),
    Array.from(externalNodeLookup.values())
      .map(node => `${node.id}:${node.status}:${node.name}:${node.displayId ?? ''}`)
      .sort()
      .join('|'),
  ]);
};

// This hook correctly handles structure vs metadata updates
const useStableGraph = (
  structure: GraphStructureState,
  metadata: GraphMetadataState,
  positionManager: PositionManager
) => {
  const stableNodesRef = useRef<GraphNode[]>([]);
  const stableLinksRef = useRef<GraphLink[]>([]);
  const lastStructureVersionRef = useRef<number>(-1);
  const structureNonceRef = useRef<number>(0);

  return useMemo(() => {
    const structureChanged = structure.version !== lastStructureVersionRef.current;

    // Always update metadata in place; never touch x/y here
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

    // DIFF structure -> mutate arrays in place
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
        if (saved) { created.x = saved.x; created.y = saved.y; }
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

    // Links diff
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
  }, [structure.version, metadata.version, positionManager]);
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const KnowledgeGraph: FC<KnowledgeGraphProps> = (props) => {
  return (
    <UIProvider>
      <KnowledgeGraphInner {...props} />
    </UIProvider>
  );
};

const KnowledgeGraphInner: React.FC<KnowledgeGraphProps> = ({
  graphData: initialGraphData,
  subjectMatterId,
  onBack,
  onPositionUpdate
}) => {
  const ui = useUI();
  const srs = useSRS();
  const router = useRouter();
  const graphRef = useRef<any>(null);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const positionManagerRef = useRef(new PositionManager());

  // Core state
  const [mode, setMode] = useState<AppMode>('study');
  const [isProcessingData, setIsProcessingData] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // UI state
  const [showLeftPanel, setShowLeftPanel] = useState(false);
  const [labelDisplayMode, setLabelDisplayMode] = useState<LabelDisplayMode>('names');
  const [dagModeEnabled, setDagModeEnabled] = useState(false);
  const [dagOrientation, setDagOrientation] = useState<'td' | 'bu' | 'lr' | 'rl' | 'radialout' | 'radialin'>('td');
  const [expandedCycleIds, setExpandedCycleIds] = useState<Set<string>>(new Set());
  const [questVisibilityMode, setQuestVisibilityMode] = useState<'on' | 'nodes' | 'off'>('on');
  const [toolbarDisplayMode, setToolbarDisplayMode] = useState<'compact' | 'descriptive'>('compact');
  const [toolbarGroupId, setToolbarGroupId] = useState<number | null>(null);
  const [toolbarGroupAction, setToolbarGroupAction] = useState<'create' | 'delete' | null>(null);
  const [toolbarGroupNameDraft, setToolbarGroupNameDraft] = useState('');

  // Multi-selection state
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
  const [selectionTool, setSelectionTool] = useState<'none' | 'add' | 'remove'>('none');
  const [newlyCreatedNodeId, setNewlyCreatedNodeId] = useState<string | null>(null);

  // Interactive state
  const [highlightNodes, setHighlightNodes] = useState(new Set<string>());
  const [highlightLinks, setHighlightLinks] = useState(new Set<string>());
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredNodeType, setFilteredNodeType] = useState<FilteredNodeType>('all');
  const [surveyDueCount, setSurveyDueCount] = useState(0);

  // Data state
  const [currentStructuralGraphData, setCurrentStructuralGraphData] = useState(initialGraphData);
  const [codeToNumericIdMap, setCodeToNumericIdMap] = useState<Map<string, number>>(new Map());
  const [nodeDataCache, setNodeDataCache] = useState<Map<string, ApiDefinition | ApiExercise>>(new Map());
  const [externalPrerequisites, setExternalPrerequisites] = useState<ExternalPrerequisiteLink[]>([]);
  const [domainGroups, setDomainGroups] = useState<GroupData[]>([]);

  // Modal and form state
  const [showNodeCreationModal, setShowNodeCreationModal] = useState(false);
  const [nodeCreationType, setNodeCreationType] = useState<'definition' | 'exercise'>('definition');
  const [nodeCreationPosition, setNodeCreationPosition] = useState<{x: number, y: number} | undefined>(undefined);
  const [showEnrollmentModal, setShowEnrollmentModal] = useState(false);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [graphSize, setGraphSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Domain state
  const [domainName, setDomainName] = useState<string>(subjectMatterId);
  const [domainData, setDomainData] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const isDomainOwner = !!(currentUser && domainData && domainData.ownerId === currentUser.id);
  const canEdit = !!(
    currentUser &&
    domainData &&
    (currentUser.isAdmin || isDomainOwner || domainData.permissionRole === 'editor' || domainData.permissionRole === 'owner')
  );

  useEffect(() => {
    setShowAccessModal(false);
  }, [domainData?.id]);

  useEffect(() => {
    if (!graphRef.current) return;
    positionManagerRef.current.markUnstable();
    graphRef.current?.d3ReheatSimulation?.();
  }, [dagModeEnabled, dagOrientation]);

  type ManualLayoutSnapshot = { x: number; y: number; fx?: number; fy?: number };
  const manualLayoutSnapshotRef = useRef<Map<string, ManualLayoutSnapshot>>(new Map());

  const snapshotManualLayout = useCallback(() => {
    const nodes = stableGraphRef.current?.nodes;
    if (!nodes || nodes.length === 0) {
      manualLayoutSnapshotRef.current = new Map();
      return;
    }

    const snapshot = new Map<string, ManualLayoutSnapshot>();
    nodes.forEach(node => {
      const x = typeof node.x === 'number' ? node.x : node.xPosition;
      const y = typeof node.y === 'number' ? node.y : node.yPosition;
      if (typeof x !== 'number' || typeof y !== 'number') return;
      snapshot.set(node.id, { x, y, fx: node.fx, fy: node.fy });
    });

    manualLayoutSnapshotRef.current = snapshot;
  }, []);

  const restoreManualLayout = useCallback(() => {
    const nodes = stableGraphRef.current?.nodes;
    const snapshot = manualLayoutSnapshotRef.current;
    if (!nodes || nodes.length === 0) return;
    if (!snapshot || snapshot.size === 0) return;

    nodes.forEach(node => {
      const saved = snapshot.get(node.id);
      if (!saved) return;
      node.x = saved.x;
      node.y = saved.y;
      if (typeof saved.fx === 'number') (node as any).fx = saved.fx;
      else delete (node as any).fx;
      if (typeof saved.fy === 'number') (node as any).fy = saved.fy;
      else delete (node as any).fy;
    });

    try { graphRef.current?.refresh?.(); } catch {}
  }, []);

  const clearDagConstraints = useCallback(() => {
    const nodes = stableGraphRef.current?.nodes;
    if (!nodes || nodes.length === 0) return;
    nodes.forEach(node => {
      // Prevent stale axis constraints from previous DAG modes (react-force-graph-2d doesn't clear them on mode swap).
      delete (node as any).fx;
      delete (node as any).fy;
    });
  }, []);

  const handleToggleDagMode = useCallback(() => {
    if (!dagModeEnabled) {
      // Entering DAG: snapshot manual layout so it can be restored on exit.
      snapshotManualLayout();
      clearDagConstraints();
      setDagModeEnabled(true);
      return;
    }

    // Exiting DAG: disable first (library clears constraints on dagMode=null), then restore snapshot after update.
    setDagModeEnabled(false);
    setTimeout(() => {
      restoreManualLayout();
    }, 0);
  }, [clearDagConstraints, dagModeEnabled, restoreManualLayout, snapshotManualLayout]);

  const handleDagOrientationChange = useCallback((orientation: 'td' | 'bu' | 'lr' | 'rl' | 'radialout' | 'radialin') => {
    if (orientation === dagOrientation) return;
    // Clear constraints *before* the library applies the new DAG mode.
    clearDagConstraints();
    setDagOrientation(orientation);
  }, [clearDagConstraints, dagOrientation]);

  useEffect(() => {
    const el = graphContainerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (!rect) return;
      const nextWidth = Math.round(rect.width);
      const nextHeight = Math.round(rect.height);
      setGraphSize(prev => {
        if (prev.width === nextWidth && prev.height === nextHeight) return prev;
        return { width: nextWidth, height: nextHeight };
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!dagModeEnabled) {
      setExpandedCycleIds(new Set());
    }
  }, [dagModeEnabled]);

  useEffect(() => {
    return () => {
      if (toolbarTransientTimerRef.current) {
        clearTimeout(toolbarTransientTimerRef.current);
        toolbarTransientTimerRef.current = null;
      }
    };
  }, []);

  // Position saving
  const [positionsChanged, setPositionsChanged] = useState(false);
  const [isSavingPositions, setIsSavingPositions] = useState(false);

  // Frenzy edit mode state
  const [isFrenzyEditMode, setIsFrenzyEditMode] = useState(false);
  const [frenzyTool, setFrenzyTool] = useState<FrenzyEditTool>('none');
  const [pendingLinkSourceId, setPendingLinkSourceId] = useState<string | null>(null);
  const [frenzyNote, setFrenzyNote] = useState<FrenzyNoteState | null>(null);
  const [frenzyNoteCodeDraft, setFrenzyNoteCodeDraft] = useState('');
  const [frenzyNoteDraft, setFrenzyNoteDraft] = useState('');
  const [frenzyNoteNameDraft, setFrenzyNoteNameDraft] = useState('');
  const [frenzyNotePromptDraft, setFrenzyNotePromptDraft] = useState('');
  const [frenzyNotePromptImagePath, setFrenzyNotePromptImagePath] = useState('');
  const [frenzyNoteContentImagePath, setFrenzyNoteContentImagePath] = useState('');
  const [frenzyNoteSolutionDraft, setFrenzyNoteSolutionDraft] = useState('');
  const [frenzyNoteSolutionImagePath, setFrenzyNoteSolutionImagePath] = useState('');
  const [showFrenzySolution, setShowFrenzySolution] = useState(false);
  const [frenzyNotePreview, setFrenzyNotePreview] = useState(false);
  const [isSavingFrenzyNote, setIsSavingFrenzyNote] = useState(false);
  const [frenzyNoteIsNewVersion, setFrenzyNoteIsNewVersion] = useState(false);
  const [frenzyPrerequisiteMap, setFrenzyPrerequisiteMap] = useState<Map<string, NodePrerequisite>>(new Map());
  const [lastDeletedNode, setLastDeletedNode] = useState<FrenzyDeletedNodeSnapshot | null>(null);
  const [toolbarTransientMessage, setToolbarTransientMessage] = useState<string | null>(null);

  const frenzyAutoContentRef = useRef<Map<string, string>>(new Map());
  const frenzyAutoPromptRef = useRef<Map<string, string>>(new Map());
  const frenzyClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frenzyLastClickRef = useRef<{ id: string; ts: number } | null>(null);
  const frenzyBackgroundClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frenzyLastBackgroundClickRef = useRef<{ ts: number } | null>(null);
  const frenzyPendingLinkRef = useRef<Set<string>>(new Set());
  const frenzyDragLinkThrottleRef = useRef<number>(0);
  const frenzyNoteRef = useRef<HTMLDivElement>(null);
  const toolbarTransientTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [frenzyNotePosition, setFrenzyNotePosition] = useState<{ x: number; y: number }>({ x: 240, y: 80 });
  const [isDraggingFrenzyNote, setIsDraggingFrenzyNote] = useState(false);
  const frenzyNoteDragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const frenzyPromptImageInputRef = useRef<HTMLInputElement | null>(null);
  const frenzyContentImageInputRef = useRef<HTMLInputElement | null>(null);
  const frenzySolutionImageInputRef = useRef<HTMLInputElement | null>(null);

  // Refs for stable callbacks
  const isInitializedRef = useRef<boolean>(false);
  const pendingFocusNodeIdRef = useRef<string | null>(null);

  const externalNodeLookup = useMemo(() => {
    const map = new Map<string, {
      id: string;
      name: string;
      displayId?: string;
      type: 'definition' | 'exercise';
      status: ExternalPrerequisiteLink['status'];
      externalDomainId?: number;
      externalDomainUid?: string;
      externalNodeId?: number;
      externalNodeType?: 'meta_definition' | 'meta_exercise';
      externalDomainName?: string;
      externalNodeName?: string;
    }>();

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
      const next = {
        id,
        name: getExternalNodeLabel(link),
        displayId,
        type: (link.externalNodeType === 'meta_exercise' ? 'exercise' : 'definition') as 'definition' | 'exercise',
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
  }, [externalPrerequisites]);

  const localAdjacency = useMemo(() => {
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
  }, [currentStructuralGraphData]);

  const definitionCodes = useMemo(() => (
    new Set(Object.keys(currentStructuralGraphData.definitions || {}))
  ), [currentStructuralGraphData.definitions]);

  const exerciseCodes = useMemo(() => (
    new Set(Object.keys(currentStructuralGraphData.exercises || {}))
  ), [currentStructuralGraphData.exercises]);

  const groupMembersById = useMemo(() => {
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
  }, [domainGroups, localAdjacency]);

  const collapsedGroupIds = useMemo(() => {
    return new Set(domainGroups.filter(group => group.collapsed).map(group => group.id));
  }, [domainGroups, updateGroupState]);

  const groupNodeMetadata = useMemo(() => {
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
  }, [domainGroups, groupMembersById]);

  const groupSummaries = useMemo(() => {
    return domainGroups.map(group => ({
      id: group.id,
      name: group.name,
      collapsed: !!group.collapsed,
      isExact: group.isExact,
      memberCount: groupMembersById.get(group.id)?.size ?? 0,
    }));
  }, [domainGroups, groupMembersById]);

  useEffect(() => {
    if (toolbarGroupId && !groupSummaries.some(group => group.id === toolbarGroupId)) {
      setToolbarGroupId(null);
    }
  }, [groupSummaries, toolbarGroupId]);

  // Build graph using architecture with true structure/metadata separation
  const baseGraphStructure = useGraphStructure(
    currentStructuralGraphData.definitions || {},
    currentStructuralGraphData.exercises || {},
    currentStructuralGraphData.sources || {},
    currentStructuralGraphData.quests || {},
    currentStructuralGraphData.relations || [],
    externalPrerequisites
  );

  const groupedGraphStructure = useMemo(() => {
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
  }, [baseGraphStructure, collapsedGroupIds, domainGroups, groupMembersById]);

  const cycleGroups = useMemo(() => {
    if (!dagModeEnabled) return [] as CycleGroup[];
    const nodeIds = Array.from(groupedGraphStructure.nodes.keys());
    if (nodeIds.length === 0) return [] as CycleGroup[];
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
  }, [dagModeEnabled, groupedGraphStructure]);

  const collapsedCycleGroups = useMemo(() => {
    if (expandedCycleIds.size === 0) return cycleGroups;
    return cycleGroups.filter(group => !expandedCycleIds.has(group.id));
  }, [cycleGroups, expandedCycleIds]);

  const cycleNodeMetadata = useMemo(() => {
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
  }, [collapsedCycleGroups]);

  const combinedGroupNodeMetadata = useMemo(() => {
    return new Map<string, NodeMetadata>([...groupNodeMetadata, ...cycleNodeMetadata]);
  }, [cycleNodeMetadata, groupNodeMetadata]);

  const dagGraphStructure = useMemo(() => {
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
  }, [collapsedCycleGroups, dagModeEnabled, groupedGraphStructure]);

  // Active node IDs from open detail windows
  const activeNodeIds = useMemo(() =>
    new Set(
      ui.state.windows
        .filter(w => (w.type === 'detail' || w.type === 'source' || w.type === 'quest') && !w.isMinimized)
        .map(w => (
          w.contentProps?.nodeData?.id
          || w.contentProps?.sourceData?.code
          || w.contentProps?.questData?.code
        ))
        .filter(Boolean)
    ),
    [ui.state.windows]
  );

  // Metadata hook tracks names and visual properties
  const graphMetadata = useGraphMetadata(
    dagGraphStructure.nodes,
    currentStructuralGraphData.definitions || {},
    currentStructuralGraphData.exercises || {},
    currentStructuralGraphData.sources || {},
    currentStructuralGraphData.quests || {},
    srs,
    codeToNumericIdMap,
    activeNodeIds,
    selectedNodeIds,
    highlightNodes,
    combinedGroupNodeMetadata,
    externalNodeLookup
  );

  // Stable graph correctly handles structure vs metadata updates
  const stableGraph = useStableGraph(dagGraphStructure, graphMetadata, positionManagerRef.current);
  const stableGraphRef = useRef<typeof stableGraph | null>(null);
  stableGraphRef.current = stableGraph;

  const handleDagError = useCallback((loop: (string | number)[]) => {
    console.warn('DAG layout error (cycle detected):', loop);
  }, []);

  const dagMode = dagModeEnabled && expandedCycleIds.size === 0 ? dagOrientation : null;
  const collapseAllCycles = useCallback(() => {
    setExpandedCycleIds(new Set());
  }, []);

  const graphHighlightedNodes = useMemo(() => {
    const combined = new Set<string>();
    
    activeNodeIds.forEach(id => combined.add(id));
    highlightNodes.forEach(id => combined.add(id));
    if (pendingLinkSourceId) combined.add(pendingLinkSourceId);
    
    return combined;
  }, [activeNodeIds, highlightNodes, pendingLinkSourceId]);

  const questNodeIds = useMemo(() => {
    if (questVisibilityMode === 'on') return new Set<string>();
    const ids = new Set<string>();
    stableGraph.nodes.forEach(node => {
      if (node.type === 'quest') ids.add(node.id);
    });
    return ids;
  }, [stableGraph.nodes, questVisibilityMode]);

  const renderGraphNodes = useMemo(() => {
    if (questVisibilityMode === 'off') {
      return stableGraph.nodes.filter(node => node.type !== 'quest');
    }
    return stableGraph.nodes;
  }, [stableGraph.nodes, questVisibilityMode]);

  const renderGraphLinks = useMemo(() => {
    if (questVisibilityMode === 'on') return stableGraph.links;
    if (questNodeIds.size === 0) return stableGraph.links;
    return stableGraph.links.filter(link => {
      const sourceId = typeof link.source === 'object' ? (link.source as GraphNode).id : String(link.source);
      const targetId = typeof link.target === 'object' ? (link.target as GraphNode).id : String(link.target);
      return !questNodeIds.has(sourceId) && !questNodeIds.has(targetId);
    });
  }, [stableGraph.links, questNodeIds, questVisibilityMode]);

  const isNodeVisibleInGraph = useCallback((node: GraphNode) => {
    if (mode === 'study' && node.type === 'exercise') return false;
    if (questVisibilityMode === 'off' && node.type === 'quest') return false;
    if (filteredNodeType === 'all') return true;
    if (node.type === filteredNodeType) return true;
    return selectedNodeIds.has(node.id) || graphHighlightedNodes.has(node.id);
  }, [filteredNodeType, graphHighlightedNodes, mode, questVisibilityMode, selectedNodeIds]);

  const hasVisibleNodesForFit = useMemo(() => {
    return stableGraph.nodes.some(node => isNodeVisibleInGraph(node));
  }, [stableGraph.nodes, isNodeVisibleInGraph]);

  const getZoomToFitPadding = useCallback(() => {
    const fallbackRect = graphContainerRef.current?.getBoundingClientRect();
    const width = graphSize.width || fallbackRect?.width || 0;
    const height = graphSize.height || fallbackRect?.height || 0;
    const minSize = Math.min(width, height);
    const scaled = Math.round(minSize * 0.15);
    if (!Number.isFinite(scaled) || scaled <= 0) return 72;
    return Math.max(48, Math.min(220, scaled));
  }, [graphSize.height, graphSize.width]);

  const zoomToFitVisibleNodes = useCallback((duration = 400) => {
    const graph = graphRef.current;
    if (!graph || !hasVisibleNodesForFit) return;
    const padding = getZoomToFitPadding();
    graph.zoomToFit(duration, padding, (node: GraphNode) => isNodeVisibleInGraph(node));
  }, [getZoomToFitPadding, hasVisibleNodesForFit, isNodeVisibleInGraph]);

  const primarySelectedNodeId = useMemo(() => {
    for (const id of selectedNodeIds) return id;
    return null;
  }, [selectedNodeIds]);

  const handleNodeSelect = useCallback((nodeId: string, isSelected: boolean) => {
    setSelectedNodeIds(prev => {
      const newSet = new Set(prev);
      if (isSelected) newSet.add(nodeId);
      else newSet.delete(nodeId);
      return newSet;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedNodeIds(new Set());
  }, []);

  const toggleSelectionTool = useCallback((next: 'add' | 'remove') => {
    setSelectionTool(prev => (prev === next ? 'none' : next));
  }, []);

  useEffect(() => {
    if (isFrenzyEditMode) {
      setSelectionTool('none');
    }
  }, [isFrenzyEditMode]);

  const refreshExternalPrerequisites = useCallback(async (domainId?: number) => {
    const resolvedId = domainId ?? parseInt(subjectMatterId, 10);
    if (Number.isNaN(resolvedId)) return;
    try {
      const links = await getExternalPrerequisites(resolvedId);
      setExternalPrerequisites(Array.isArray(links) ? links : []);
    } catch (error) {
      console.warn("Failed to load external prerequisites:", error);
      setExternalPrerequisites([]);
    }
  }, [subjectMatterId]);

  const resolveGroupNodeRef = useCallback((nodeCode: string): GroupNodeRefRequest | null => {
    const numericId = codeToNumericIdMap.get(nodeCode);
    if (!numericId) return null;
    if (currentStructuralGraphData.definitions?.[nodeCode]) {
      return { nodeId: numericId, nodeType: 'meta_definition' };
    }
    if (currentStructuralGraphData.exercises?.[nodeCode]) {
      return { nodeId: numericId, nodeType: 'meta_exercise' };
    }
    return null;
  }, [codeToNumericIdMap, currentStructuralGraphData]);

  const updateGroupLocal = useCallback((updated: GroupData) => {
    setDomainGroups(prev => {
      const exists = prev.some(group => group.id === updated.id);
      if (!exists) return [...prev, updated];
      return prev.map(group => (group.id === updated.id ? { ...group, ...updated } : group));
    });
  }, []);

  const createGroupFromNodes = useCallback(async (name: string, seedCodes: string[], isExact: boolean, memberCodes?: string[]) => {
    const seeds = seedCodes
      .map(code => resolveGroupNodeRef(code))
      .filter((ref): ref is GroupNodeRefRequest => !!ref);
    if (seeds.length === 0) {
      showToast('Group seeds are missing node IDs.', 'error');
      return null;
    }

    const members = memberCodes
      ? memberCodes
          .map(code => resolveGroupNodeRef(code))
          .filter((ref): ref is GroupNodeRefRequest => !!ref)
      : undefined;

    const created = await createDomainGroup(parseInt(subjectMatterId, 10), {
      name,
      isExact,
      seeds,
      members,
    });
    updateGroupLocal(created);
    return created;
  }, [resolveGroupNodeRef, subjectMatterId, updateGroupLocal]);

  const updateGroupData = useCallback(async (groupId: number, payload: { name?: string; isExact?: boolean; seedCodes?: string[]; memberCodes?: string[]; xPosition?: number; yPosition?: number }) => {
    const updatePayload: any = {};
    if (payload.name !== undefined) updatePayload.name = payload.name;
    if (payload.isExact !== undefined) updatePayload.isExact = payload.isExact;
    if (payload.xPosition !== undefined) updatePayload.xPosition = payload.xPosition;
    if (payload.yPosition !== undefined) updatePayload.yPosition = payload.yPosition;
    if (payload.seedCodes) {
      const seeds = payload.seedCodes
        .map(code => resolveGroupNodeRef(code))
        .filter((ref): ref is GroupNodeRefRequest => !!ref);
      if (seeds.length === 0) {
        showToast('Group seeds are missing node IDs.', 'error');
        return null;
      }
      updatePayload.seeds = seeds;
    }
    if (payload.memberCodes) {
      const members = payload.memberCodes
        .map(code => resolveGroupNodeRef(code))
        .filter((ref): ref is GroupNodeRefRequest => !!ref);
      if (members.length === 0) {
        showToast('Group members are missing node IDs.', 'error');
        return null;
      }
      updatePayload.members = members;
    }

    const updated = await updateGroup(groupId, updatePayload);
    updateGroupLocal(updated);
    return updated;
  }, [resolveGroupNodeRef, updateGroupLocal]);

  const deleteGroupById = useCallback(async (groupId: number) => {
    const existing = domainGroups.find(group => group.id === groupId);
    if (existing?.collapsed) {
      setDomainGroups(prev => prev.map(group => (
        group.id === groupId ? { ...group, collapsed: false } : group
      )));
      await updateGroupState(groupId, false).catch(err => {
        console.warn('Failed to uncollapse group before delete:', err);
      });
    }
    await deleteGroup(groupId);
    setDomainGroups(prev => prev.filter(group => group.id !== groupId));
  }, [domainGroups]);

  const toggleGroupCollapse = useCallback(async (groupId: number, nextCollapsed: boolean) => {
    const targetMembers = groupMembersById.get(groupId) ?? new Set<string>();
    const updates: Array<{ id: number; collapsed: boolean }> = [{ id: groupId, collapsed: nextCollapsed }];

    if (nextCollapsed) {
      domainGroups.forEach(group => {
        if (group.id === groupId || !group.collapsed) return;
        const members = groupMembersById.get(group.id);
        if (members && intersects(members, targetMembers)) {
          updates.push({ id: group.id, collapsed: false });
        }
      });
    }

    setDomainGroups(prev =>
      prev.map(group => {
        const update = updates.find(next => next.id === group.id);
        if (!update) return group;
        return { ...group, collapsed: update.collapsed };
      })
    );

    await Promise.all(
      updates.map(update => updateGroupState(update.id, update.collapsed).catch(err => {
        console.warn('Failed to update group state:', err);
      }))
    );
  }, [domainGroups, groupMembersById]);

  const refreshSurveyStats = useCallback(async () => {
    const domainId = parseInt(subjectMatterId, 10);
    if (Number.isNaN(domainId)) return;
    try {
      const stats = await getSurveyStats(domainId);
      setSurveyDueCount(stats?.dueQuests ?? 0);
    } catch (error) {
      console.warn('Failed to load survey stats:', error);
      setSurveyDueCount(0);
    }
  }, [subjectMatterId]);

  const buildRelationEdgesFromDomain = useCallback((relationsRaw: any[]) => {
    const idToCodeByType = new Map<string, string>();
    Object.values(currentStructuralGraphData.definitions || {}).forEach(def => {
      if (typeof def.id === 'number') idToCodeByType.set(`meta_definition:${def.id}`, def.code);
    });
    Object.values(currentStructuralGraphData.exercises || {}).forEach(ex => {
      if (typeof ex.id === 'number') idToCodeByType.set(`meta_exercise:${ex.id}`, ex.code);
    });
    Object.values(currentStructuralGraphData.sources || {}).forEach(src => {
      if (typeof src.id === 'number') idToCodeByType.set(`source:${src.id}`, src.code);
    });
    Object.values(currentStructuralGraphData.quests || {}).forEach(q => {
      if (typeof q.id === 'number') idToCodeByType.set(`meta_quest:${q.id}`, q.code);
    });

    const relationEdges: Array<{ fromCode: string; toCode: string; relationType?: string }> = [];
    (relationsRaw || []).forEach((rel: any) => {
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
  }, [
    currentStructuralGraphData.definitions,
    currentStructuralGraphData.exercises,
    currentStructuralGraphData.sources,
    currentStructuralGraphData.quests,
  ]);

  const refreshDomainRelations = useCallback(async () => {
    const domainId = parseInt(subjectMatterId, 10);
    if (Number.isNaN(domainId)) return;
    try {
      const relations = await getDomainRelations(domainId);
      const relationEdges = buildRelationEdgesFromDomain(relations);
      setCurrentStructuralGraphData(prev => ({ ...prev, relations: relationEdges }));
    } catch (error) {
      console.warn('Failed to refresh relations:', error);
    }
  }, [subjectMatterId, buildRelationEdgesFromDomain]);

  // Load comprehensive domain data
  const loadComprehensiveDomainData = useCallback(async (domainId: number) => {
    try {
      console.log("Loading comprehensive domain data for:", domainId);

      const [allMetaDefinitions, allMetaExercises, externalLinks, groups, sources, quests, relations] = await Promise.all([
        // Use meta-definitions (concept pools) as definition nodes in the graph
        getDomainMetaDefinitions(domainId).catch(err => { console.warn("Failed to load meta-definitions:", err); return []; }),
        // Use meta-exercises (pools) as exercise nodes in the graph
        getDomainMetaExercises(domainId).catch(err => { console.warn("Failed to load meta-exercises:", err); return []; }),
        getExternalPrerequisites(domainId).catch(err => { console.warn("Failed to load external prerequisites:", err); return []; }),
        getDomainGroups(domainId).catch(err => { console.warn("Failed to load groups:", err); return []; }),
        getDomainSources(domainId).catch(err => { console.warn("Failed to load sources:", err); return []; }),
        getDomainQuests(domainId).catch(err => { console.warn("Failed to load quests:", err); return []; }),
        getDomainRelations(domainId).catch(err => { console.warn("Failed to load relations:", err); return []; }),
      ]);

      const newCodeToNumericIdMap = new Map<string, number>();
      const newNodeDataCache = new Map<string, MetaDefinition | any>();
      const idToCodeByType = new Map<string, string>();

      allMetaDefinitions.forEach(metaDef => {
        if (metaDef?.code && typeof metaDef.id === 'number') {
          newCodeToNumericIdMap.set(metaDef.code, metaDef.id);
          newNodeDataCache.set(metaDef.code, metaDef);
          idToCodeByType.set(`meta_definition:${metaDef.id}`, metaDef.code);
        }
      });

      (allMetaExercises as any[]).forEach((ex: any) => {
        if (ex?.code && typeof ex.id === 'number') {
          newCodeToNumericIdMap.set(ex.code, ex.id);
          newNodeDataCache.set(ex.code, ex);
          idToCodeByType.set(`meta_exercise:${ex.id}`, ex.code);
        }
      });

      const newDefinitions: Record<string, Definition> = {};
      const newExercises: Record<string, Exercise> = {};

      // Convert MetaDefinitions to Definition format for graph display
      allMetaDefinitions.forEach(metaDef => {
        newDefinitions[metaDef.code] = {
          code: metaDef.code,
          name: metaDef.name,
          description: '', // MetaDefinitions don't have a single description, versions do
          notes: '',
          references: [],
          prerequisites: metaDef.prerequisites || [],
          prerequisiteWeights: metaDef.prerequisiteWeights ||
            (metaDef.prerequisites ? Object.fromEntries(metaDef.prerequisites.map(p => [p, 1.0])) : {}),
          xPosition: metaDef.xPosition,
          yPosition: metaDef.yPosition,
          domainId: metaDef.domainId,
          type: 'definition',
          id: metaDef.id,
        };
      });
      
      (allMetaExercises as any[]).forEach((ex: any) => {
        newExercises[ex.code] = {
          code: ex.code,
          name: ex.name,
          statement: '',
          description: '',
          notes: '',
          hints: '',
          difficulty: undefined,
          domainId: ex.domainId,
          verifiable: false,
          result: '',
          prerequisites: ex.prerequisites || [],
          prerequisiteWeights: ex.prerequisiteWeights || (ex.prerequisites ? Object.fromEntries(ex.prerequisites.map((p: string) => [p, 1.0])) : {}),
          xPosition: ex.xPosition,
          yPosition: ex.yPosition,
          type: 'exercise',
          id: ex.id,
        } as any;
      });

      const newSources: Record<string, SourceNode> = {};
      (sources as any[]).forEach((src: any) => {
        if (!src?.code) return;
        newSources[src.code] = {
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

      const newQuests: Record<string, MetaQuest> = {};
      (quests as any[]).forEach((q: any) => {
        if (!q?.code) return;
        newQuests[q.code] = {
          id: q.id,
          code: q.code,
          name: q.name,
          kind: q.kind,
          schedule: q.schedule,
          xPosition: q.xPosition,
          yPosition: q.yPosition,
          domainId: q.domainId,
          ownerId: q.ownerId,
          visibility: q.visibility,
          active: q.active,
          nextDueAt: q.nextDueAt,
          versions: q.versions || [],
          type: 'quest',
        };
        if (typeof q.id === 'number') {
          idToCodeByType.set(`meta_quest:${q.id}`, q.code);
        }
      });

      const relationEdges: Array<{ fromCode: string; toCode: string; relationType?: string }> = [];
      (relations as any[]).forEach((rel: any) => {
        const fromCode = idToCodeByType.get(`${rel.fromType}:${rel.fromId}`);
        const toCode = idToCodeByType.get(`${rel.toType}:${rel.toId}`);
        if (!fromCode || !toCode) return;
        relationEdges.push({
          fromCode,
          toCode,
          relationType: rel.relationType,
        });
      });
      
      setCodeToNumericIdMap(newCodeToNumericIdMap);
      setNodeDataCache(newNodeDataCache);
      setCurrentStructuralGraphData({
        definitions: newDefinitions,
        exercises: newExercises,
        sources: newSources,
        quests: newQuests,
        relations: relationEdges,
      });
      setExternalPrerequisites(Array.isArray(externalLinks) ? externalLinks : []);
      setDomainGroups(Array.isArray(groups) ? groups : []);

      // If the domain loads successfully but has no nodes,
      // stop showing the processing spinner so we can render an empty state.
      const isEmptyDomain = Object.keys(newDefinitions).length === 0 && Object.keys(newExercises).length === 0;
      if (isEmptyDomain) {
        setIsProcessingData(false);
      }

      refreshSurveyStats();
      
    } catch (error) {
      console.error("Error loading comprehensive domain data:", error);
      showToast("Failed to load complete domain data.", "error");
      setCurrentStructuralGraphData({ definitions: {}, exercises: {}, sources: {}, quests: {}, relations: [] });
      setExternalPrerequisites([]);
    }
  }, []);

  // NEW SURGICAL UPDATE FUNCTIONS
  const surgicallyUpdateDefinition = useCallback((nodeCode: string, updatedData: ApiDefinition) => {
    console.log('Performing surgical update for definition:', nodeCode);
    
    
    setNodeDataCache(prevCache => {
      const newCache = new Map(prevCache);
      newCache.set(nodeCode, updatedData);
      return newCache;
    });
    
    setCodeToNumericIdMap(prevMap => {
      const newMap = new Map(prevMap);
      if (updatedData.id && !newMap.has(nodeCode)) {
        newMap.set(nodeCode, updatedData.id);
      }
      return newMap;
    });
    
    setCurrentStructuralGraphData(prevData => {
      const newDefinitions = { ...prevData.definitions };
      if (newDefinitions[nodeCode]) {
        newDefinitions[nodeCode] = { 
          ...newDefinitions[nodeCode],
          ...updatedData,
          type: 'definition',
          prerequisiteWeights: updatedData.prerequisiteWeights || 
            (updatedData.prerequisites ? Object.fromEntries(updatedData.prerequisites.map(p => [p, 1.0])) : {})
        };
      }
      return { ...prevData, definitions: newDefinitions };
    });
  }, []);

  const surgicallyUpdateExercise = useCallback((nodeCode: string, updatedData: ApiExercise) => {
    console.log('Performing surgical update for exercise:', nodeCode);
    
    
    setNodeDataCache(prevCache => {
      const newCache = new Map(prevCache);
      newCache.set(nodeCode, updatedData);
      return newCache;
    });
    
    setCodeToNumericIdMap(prevMap => {
      const newMap = new Map(prevMap);
      if (updatedData.id && !newMap.has(nodeCode)) {
        newMap.set(nodeCode, updatedData.id);
      }
      return newMap;
    });
    
    setCurrentStructuralGraphData(prevData => {
      const newExercises = { ...prevData.exercises };
      if (newExercises[nodeCode]) {
        newExercises[nodeCode] = { 
          ...newExercises[nodeCode],
          ...updatedData,
          type: 'exercise',
          prerequisiteWeights: updatedData.prerequisiteWeights || 
            (updatedData.prerequisites ? Object.fromEntries(updatedData.prerequisites.map(p => [p, 1.0])) : {})
        };
      }
      return { ...prevData, exercises: newExercises };
    });
  }, []);

  // Combined surgical update function
  const handleSurgicalNodeUpdate = useCallback((nodeCode: string, updatedData: ApiDefinition | ApiExercise) => {
    const nodeType = (updatedData as any).type || 
      (currentStructuralGraphData.definitions?.[nodeCode] ? 'definition' : 'exercise');
    
    if (nodeType === 'definition') {
      surgicallyUpdateDefinition(nodeCode, updatedData as ApiDefinition);
    } else {
      surgicallyUpdateExercise(nodeCode, updatedData as ApiExercise);
    }
  }, [surgicallyUpdateDefinition, surgicallyUpdateExercise, currentStructuralGraphData]);

  // Enrollment and user/domain bootstrap (moved out of useEffect)
  const checkAndInitEnrollment = useCallback(async (domainId: number) => {
    try {
      const user = await getCurrentUser();
      setCurrentUser(user);

      const domain = await getDomain(domainId);
      setDomainData(domain);
      setDomainName(domain.name);

      const userOwnsThisDomain = domain.ownerId === user.id;

      if (userOwnsThisDomain) {
        // Owner has access
        setHasAccess(true);
        if (!isInitializedRef.current) {
          srs.setCurrentDomain(domainId);
          isInitializedRef.current = true;
        }
      } else {
        // Check if enrolled
        const enrolledDomains = await getEnrolledDomains();
        const isUserEnrolled = enrolledDomains.some((d: any) => d.id === domainId);
        setHasAccess(isUserEnrolled);

        if (isUserEnrolled) {
          if (!isInitializedRef.current) {
            srs.setCurrentDomain(domainId);
            isInitializedRef.current = true;
          }
        } else if (domain.privacy === 'public') {
          setTimeout(() => {
            if (!hasAccess) setShowEnrollmentModal(true);
          }, 1500);
        }
      }
    } catch (error) {
      console.error("Error checking enrollment status:", error);
    }
  }, [srs, hasAccess]);

  // Enhanced engine stop handler with initial zoom
  const handleEngineStop = useCallback(() => {
    positionManagerRef.current.markStable();

    if (isProcessingData && graphRef.current && stableGraph.nodes.length > 0) {
      setTimeout(() => {
        zoomToFitVisibleNodes(400);
        console.log('Initial zoom-to-fit applied');
      }, 100);
    }
  }, [isProcessingData, stableGraph.nodes.length, zoomToFitVisibleNodes]);

  // Calculate smart placement for detail windows (opposite side of clicked node, with boundary checks)
  const getDetailWindowPlacement = useCallback((node: GraphNode, windowCount: number) => {
    // Detail window dimensions (must match UIContext: width: 545, height: 600)
    const windowWidth = 545;
    const windowHeight = 600;
    const margin = 16;

    // Default fallback position
    const defaultPosition = {
      x: typeof window !== 'undefined' ? window.innerWidth - windowWidth - margin : 800,
      y: 100 + (windowCount * 30)
    };

    // Try to get graph container bounds
    const rect =
      graphContainerRef.current?.getBoundingClientRect()
      || graphRef.current?.canvas?.()?.getBoundingClientRect();
    if (!rect) return defaultPosition;

    // Get node's screen coordinates
    let anchorX = rect.width / 2;
    let anchorY = rect.height / 2;

    if (node && typeof node.x === 'number' && typeof node.y === 'number' && typeof graphRef.current?.graph2ScreenCoords === 'function') {
      const screen = graphRef.current.graph2ScreenCoords(node.x, node.y);
      if (screen && Number.isFinite(screen.x) && Number.isFinite(screen.y)) {
        anchorX = screen.x;
        anchorY = screen.y;
      }
    }

    // Place window on opposite side of where the node is
    const placeRight = anchorX < rect.width / 2;

    // Calculate X position
    let x: number;
    if (placeRight) {
      // Node is on left, place window on right
      x = Math.max(rect.width - windowWidth - margin, margin);
    } else {
      // Node is on right, place window on left
      x = margin;
    }

    // Ensure window doesn't go beyond screen boundaries
    const maxX = Math.max(margin, window.innerWidth - windowWidth - margin);
    x = Math.min(Math.max(x, margin), maxX);

    // Calculate Y position with cascading offset for multiple windows
    const baseY = 100;
    const y = Math.min(baseY + (windowCount * 30), window.innerHeight - windowHeight - margin);

    return { x, y };
  }, []);

  // Handle node click
  const handleNodeClick = useCallback(async (
    nodeOnClick: GraphNode,
    isRefresh: boolean = false,
    context: 'click' | 'study' | 'navigation' = 'click',
    event?: MouseEvent
  ) => {
    if (!nodeOnClick?.id) return;
    if (mode === 'frenzy' && isFrenzyEditMode) return;

    if (nodeOnClick.isExternal) {
      if (nodeOnClick.externalDomainId) {
        router.push(`/main/domains/${nodeOnClick.externalDomainId}/study`);
      } else {
        const message = nodeOnClick.externalStatus === 'no_access'
          ? 'Access to this external domain is no longer available.'
          : 'External domain is unavailable.';
        showToast(message, 'warning');
      }
      return;
    }

    const isModifierClick = !!event && (event.ctrlKey || event.metaKey);
    const shouldRemove = context === 'click' && selectionTool === 'remove';
    const shouldAdd = context === 'click' && (selectionTool === 'add' || isModifierClick);

    if (shouldRemove) {
      setSelectedNodeIds(prev => {
        if (!prev.has(nodeOnClick.id)) return prev;
        const next = new Set(prev);
        next.delete(nodeOnClick.id);
        return next;
      });
      return;
    }

    if (shouldAdd) {
      setSelectedNodeIds(prev => {
        const next = new Set(prev);
        next.add(nodeOnClick.id);
        return next;
      });
      return;
    }

    setSelectedNodeIds(new Set([nodeOnClick.id]));

    const position = getDetailWindowPlacement(nodeOnClick, ui.state.windows.length);

    if (nodeOnClick.type === 'source') {
      const sourceData = currentStructuralGraphData.sources?.[nodeOnClick.id] || nodeOnClick;
      ui.openSourceWindow(nodeOnClick.id, sourceData, position);
      return;
    }
    if (nodeOnClick.type === 'quest') {
      const questData = currentStructuralGraphData.quests?.[nodeOnClick.id] || nodeOnClick;
      ui.openQuestWindow(nodeOnClick.id, questData, position);
      return;
    }

    ui.openDetailWindow(nodeOnClick.id, nodeOnClick, position);
  }, [ui, mode, isFrenzyEditMode, router, getDetailWindowPlacement, currentStructuralGraphData, selectionTool]);
  const handleNodeClickRef = useRef(handleNodeClick);

  useEffect(() => {
    handleNodeClickRef.current = handleNodeClick;
  }, [handleNodeClick]);

  // Enhanced node hover with proper highlighting
  const handleNodeHover = useCallback((node: GraphNode | null) => {
    const newHighlightNodes = new Set<string>();
    const newHighlightLinks = new Set<string>();
    
    if (node?.id) {
      newHighlightNodes.add(node.id);
      renderGraphLinks.forEach(link => {
        const sourceId = typeof link.source === 'object' ? (link.source as GraphNode).id : String(link.source);
        const targetId = typeof link.target === 'object' ? (link.target as GraphNode).id : String(link.target);
        
        if (sourceId === node.id) {
          if (targetId) newHighlightNodes.add(targetId);
          if (sourceId && targetId) newHighlightLinks.add(`${sourceId}-${targetId}`);
        } else if (targetId === node.id) {
          if (sourceId) newHighlightNodes.add(sourceId);
          if (sourceId && targetId) newHighlightLinks.add(`${sourceId}-${targetId}`);
        }
      });
    }
    
    setHighlightNodes(newHighlightNodes);
    setHighlightLinks(newHighlightLinks);
  }, [renderGraphLinks]);

  // ======= Surgical create: insert new node without full rerender & keep pan =======

  // Get the current viewport center in graph coordinates
  const getGraphCenter = useCallback(() => {
    let position = { x: 0, y: 0 };

    if (graphRef.current?.screen2GraphCoords) {
      try {
        let canvasWidth = 800;
        let canvasHeight = 600;

        if (graphContainerRef.current) {
          const rect = graphContainerRef.current.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            canvasWidth = rect.width;
            canvasHeight = rect.height;
          }
        } else if (typeof graphRef.current.canvas === 'function') {
          const canvasEl = graphRef.current.canvas();
          if (canvasEl) {
            const rect = canvasEl.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              canvasWidth = rect.width;
              canvasHeight = rect.height;
            }
          }
        }

        const centerScreenX = canvasWidth / 2;
        const centerScreenY = canvasHeight / 2;
        const centerGraphCoords = graphRef.current.screen2GraphCoords(centerScreenX, centerScreenY);
        position = { x: centerGraphCoords.x, y: centerGraphCoords.y };
      } catch (e) {
        console.warn('[getGraphCenter] Could not calculate graph center:', e);
      }
    }

    return position;
  }, []);

  const getGraphCoordsFromEvent = useCallback((event?: MouseEvent) => {
    if (!event || !graphRef.current?.screen2GraphCoords) return null;
    const rect =
      graphContainerRef.current?.getBoundingClientRect()
      || graphRef.current?.canvas?.()?.getBoundingClientRect();
    if (!rect) return null;
    try {
      const rawEvent = (event as any).sourceEvent ?? event;
      let x: number | undefined;
      let y: number | undefined;

      if (typeof (rawEvent as MouseEvent & { layerX?: number }).layerX === 'number') {
        x = (rawEvent as MouseEvent & { layerX?: number }).layerX;
        y = (rawEvent as MouseEvent & { layerY?: number }).layerY;
      } else if (typeof (rawEvent as MouseEvent).offsetX === 'number') {
        x = (rawEvent as MouseEvent).offsetX;
        y = (rawEvent as MouseEvent).offsetY;
      } else if (typeof (rawEvent as MouseEvent).clientX === 'number') {
        x = (rawEvent as MouseEvent).clientX - rect.left;
        y = (rawEvent as MouseEvent).clientY - rect.top;
      }

      if (typeof x !== 'number' || typeof y !== 'number') return null;
      const coords = graphRef.current.screen2GraphCoords(x, y);
      if (!coords || !Number.isFinite(coords.x) || !Number.isFinite(coords.y)) return null;
      return { x: coords.x, y: coords.y };
    } catch (error) {
      console.warn('Could not map background click to graph coords.', error);
      return null;
    }
  }, []);

  const getFrenzyNotePlacement = useCallback((anchorGraph?: { x: number; y: number }) => {
    const rect =
      graphContainerRef.current?.getBoundingClientRect()
      || graphRef.current?.canvas?.()?.getBoundingClientRect();
    if (!rect) return null;

    const noteRect = frenzyNoteRef.current?.getBoundingClientRect();
    const noteWidth = noteRect?.width ?? 320;
    const noteHeight = noteRect?.height ?? 320;
    const margin = 16;

    let anchorX = rect.width / 2;
    let anchorY = rect.height / 2;

    if (anchorGraph && typeof graphRef.current?.graph2ScreenCoords === 'function') {
      const screen = graphRef.current.graph2ScreenCoords(anchorGraph.x, anchorGraph.y);
      if (screen && Number.isFinite(screen.x) && Number.isFinite(screen.y)) {
        anchorX = screen.x;
        anchorY = screen.y;
      }
    }

    const placeRight = anchorX < rect.width / 2;
    const targetCenterX = rect.width * (placeRight ? 0.7 : 0.3);
    const maxX = Math.max(margin, rect.width - noteWidth - margin);
    const x = Math.min(Math.max(targetCenterX - noteWidth / 2, margin), maxX);
    const maxY = Math.max(margin, rect.height - noteHeight - margin);
    const y = Math.min(Math.max(anchorY - noteHeight / 2, margin), maxY);

    return { x, y };
  }, []);

  // Compute spawn near neighbors or viewport center
  const computeSpawnPosition = useCallback((created: Partial<ApiDefinition & ApiExercise>) => {
    const neighbors = new Set<string>([...(created.prerequisites || [])]);
    let spawn: { x: number; y: number } | undefined = undefined;

    // First priority: spawn near prerequisites if they exist
    if (neighbors.size > 0 && stableGraph.nodes.length > 0) {
      let sx = 0, sy = 0, c = 0;
      for (const n of stableGraph.nodes) {
        if (neighbors.has(n.id) && typeof (n as any).x === 'number' && typeof (n as any).y === 'number') {
          sx += (n as any).x as number;
          sy += (n as any).y as number;
          c++;
        }
      }
      if (c > 0) spawn = { x: sx / c, y: sy / c };
    }

    // Second priority: use stored nodeCreationPosition if it's valid (not at origin)
    if (!spawn && nodeCreationPosition && (nodeCreationPosition.x !== 0 || nodeCreationPosition.y !== 0)) {
      spawn = nodeCreationPosition;
    }

    // Third priority: calculate current viewport center using getGraphCenter
    if (!spawn) {
      const center = getGraphCenter();
      if (center.x !== 0 || center.y !== 0) {
        spawn = center;
      }
    }

    // Final fallback: origin (should rarely happen)
    if (!spawn) spawn = { x: 0, y: 0 };

    return { x: spawn.x + (Math.random() - 0.5) * 40, y: spawn.y + (Math.random() - 0.5) * 40 };
  }, [nodeCreationPosition, stableGraph.nodes, getGraphCenter]);

  // Create new node with enhanced positioning
  const createNewNode = useCallback((type: 'definition' | 'exercise') => {
    if (!canEdit) {
      showToast('Only domain owners or editors can create nodes.', 'warning');
      return;
    }

    const center = getGraphCenter();
    const position = (center.x !== 0 || center.y !== 0) ? center : undefined;

    setNodeCreationType(type);
    setNodeCreationPosition(position);
    setShowNodeCreationModal(true);
  }, [canEdit, getGraphCenter]);

  const insertCreatedNode = useCallback((
    nodeCode: string,
    type: 'definition' | 'exercise',
    createdData?: any,
    spawnOverride?: { x: number; y: number }
  ) => {
    // Normalize payload to guarantee essential fields
    const payload: any = {
      ...(createdData || {}),
      code: (createdData && createdData.code) ? createdData.code : nodeCode,
      name: (createdData && createdData.name) ? createdData.name : nodeCode,
      prerequisites: (createdData && Array.isArray(createdData.prerequisites)) ? createdData.prerequisites : [],
      prerequisiteWeights: (createdData && createdData.prerequisiteWeights) ? createdData.prerequisiteWeights : {},
      type
    };

    // Decide spawn position and pin it so the view doesn't jump
    const spawn = spawnOverride || computeSpawnPosition(payload);
    positionManagerRef.current.fixPosition(nodeCode, spawn.x, spawn.y);

    // Update maps/cache
    if (typeof payload.id === 'number') {
      setCodeToNumericIdMap(m => new Map(m).set(nodeCode, payload.id));
    }
    setNodeDataCache(c => new Map(c).set(nodeCode, payload));
    setNewlyCreatedNodeId(nodeCode);

    // Insert surgically into structure state (only the new node & its links)
    setCurrentStructuralGraphData(prev => {
      const next = { ...prev };
      if (payload.type === 'definition') {
        next.definitions = { ...(next.definitions || {}) };
        next.definitions[nodeCode] = {
          ...(next.definitions?.[nodeCode] || {}),
          ...payload,
          type: 'definition',
          xPosition: spawn.x,
          yPosition: spawn.y,
          prerequisiteWeights: payload.prerequisiteWeights || Object.fromEntries((payload.prerequisites || []).map((p: string) => [p, 1.0]))
        };
      } else {
        next.exercises = { ...(next.exercises || {}) };
        next.exercises[nodeCode] = {
          ...(next.exercises?.[nodeCode] || {}),
          ...payload,
          type: 'exercise',
          xPosition: spawn.x,
          yPosition: spawn.y,
          prerequisiteWeights: payload.prerequisiteWeights || Object.fromEntries((payload.prerequisites || []).map((p: string) => [p, 1.0]))
        };
      }
      return next;
    });

    // Set a pending focus that will occur once the node appears in stableGraph
    pendingFocusNodeIdRef.current = nodeCode;
  }, [computeSpawnPosition]);

  // SURGICAL INSERT ON CREATE (no full refresh)
  const handleNodeCreationSuccess = useCallback(async (nodeCode: string, created?: any) => {
    setShowNodeCreationModal(false);
    showToast(`${nodeCreationType === 'definition' ? 'Definition' : 'Exercise'} "${nodeCode}" created.`, 'success');

    // Fetch only the created node (avoid full reload)
    let createdData: any = null;
    if (created) {
      createdData = created;
    } else {
      try {
        const raw = nodeCreationType === 'definition' 
          ? await getDefinitionByCode(nodeCode, { domainId: domainData?.id }) 
          : await getExerciseByCode(nodeCode, { domainId: domainData?.id });
        // Some APIs return arrays; normalize
        createdData = Array.isArray(raw) ? raw[0] : raw;
      } catch (e) {
        console.warn('Could not fetch created node details, using minimal payload.', e);
      }
    }

    insertCreatedNode(nodeCode, nodeCreationType, createdData);
  }, [nodeCreationType, domainData?.id, insertCreatedNode]);

  // Focus newly created node handled by GraphLifecycle

  // Refresh function with position preservation
  const refreshGraphAndSRSData = useCallback(async () => {
    setIsRefreshing(true);
    showToast("Refreshing graph data...", "info", 2000);
    
    try {
      const domainIdNum = parseInt(subjectMatterId, 10);
      if (isNaN(domainIdNum)) throw new Error("Invalid domain ID for refresh.");

      if (stableGraph.nodes.length > 0) {
        positionManagerRef.current.extractPositions(stableGraph.nodes);
      }

      await loadComprehensiveDomainData(domainIdNum);
      if (hasAccess) {
        await srs.refreshDomainData();
      }

      showToast("Graph data refreshed!", "success");

    } catch (error) {
      console.error('Failed to refresh graph and SRS data:', error);
      showToast(error instanceof Error ? error.message : "Failed to refresh data.", "error");
    } finally {
      setIsRefreshing(false);
    }
  }, [subjectMatterId, loadComprehensiveDomainData, hasAccess, srs, stableGraph.nodes]);
  
  // Mode change with position preservation
  const changeMode = useCallback((newMode: AppMode) => {
    if (newMode === mode) return;
    if (stableGraph.nodes.length > 0) {
      positionManagerRef.current.extractPositions(stableGraph.nodes);
    }
    setMode(newMode);
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
    setSelectedNodeIds(new Set());
    if (newMode !== 'frenzy') {
      setIsFrenzyEditMode(false);
      setFrenzyTool('none');
      setPendingLinkSourceId(null);
      setFrenzyNote(null);
      setFrenzyNoteCodeDraft('');
      setFrenzyNoteDraft('');
      setFrenzyNoteNameDraft('');
      setFrenzyNotePromptDraft('');
      setFrenzyNotePreview(false);
      setIsDraggingFrenzyNote(false);
      if (frenzyClickTimerRef.current) {
        clearTimeout(frenzyClickTimerRef.current);
        frenzyClickTimerRef.current = null;
      }
      if (frenzyBackgroundClickTimerRef.current) {
        clearTimeout(frenzyBackgroundClickTimerRef.current);
        frenzyBackgroundClickTimerRef.current = null;
      }
      frenzyLastClickRef.current = null;
      frenzyLastBackgroundClickRef.current = null;
    }
  }, [mode, stableGraph.nodes]);

  // Filtered nodes for left panel
  const filteredGraphNodes = useMemo(() => {
    let tempNodes = stableGraph.nodes.filter(node => node.type !== 'group');
    if (questVisibilityMode === 'off') {
      tempNodes = tempNodes.filter(node => node.type !== 'quest');
    }
    if (mode === 'study') {
      tempNodes = tempNodes.filter(node => node.type !== 'exercise');
    }
    if (filteredNodeType !== 'all') {
      tempNodes = tempNodes.filter(node => node.type === filteredNodeType);
    }
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      tempNodes = tempNodes.filter(node =>
        (node.displayId ?? node.id).toLowerCase().includes(lowerQuery) || 
        node.name.toLowerCase().includes(lowerQuery)
      );
    }
    return tempNodes.sort((a, b) => (a.displayId ?? a.id).localeCompare(b.displayId ?? b.id));
  }, [mode, stableGraph.nodes, filteredNodeType, searchQuery, srs.state.lastUpdated, questVisibilityMode]);

  // Basic handlers
  const toggleLeftPanel = useCallback(() => setShowLeftPanel(prev => !prev), []);

  const cycleLabelDisplay = useCallback(() => {
    setLabelDisplayMode(prev => prev === 'names' ? 'codes' : prev === 'codes' ? 'off' : 'names');
  }, []);

  // Additional helper functions
  const handleEnrollment = useCallback(async () => {
    if (!domainData || !currentUser) {
      showToast("Please log in to enroll in domains", "error");
      return;
    }

    try {
      await enrollInDomain(domainData.id);
      setHasAccess(true);
      setShowEnrollmentModal(false);

      const domainId = parseInt(subjectMatterId);
      if (!isInitializedRef.current) {
        srs.setCurrentDomain(domainId);
        isInitializedRef.current = true;
      }

      showToast(`Successfully enrolled in "${domainData.name}"`, "success");
    } catch (error) {
      console.error("Error enrolling in domain:", error);
      showToast("Failed to enroll in domain", "error");
    }
  }, [domainData, currentUser, subjectMatterId, srs]);

  const handleContinueWithoutEnrollment = useCallback(() => {
    setShowEnrollmentModal(false);
    showToast("Browsing in limited access mode. Enroll to unlock all features.", "info");
  }, []);

  const handleStartStudy = useCallback(() => {
    if (!hasAccess) {
      if (domainData && domainData.privacy === 'public') {
        setShowEnrollmentModal(true);
      }
      return;
    }
    ui.openReviewWindow();
  }, [hasAccess, domainData, ui]);

  // Navigation helpers
  const navigateToNodeById = useCallback((nodeId: string, context: 'navigation' | 'study' = 'navigation') => {
    const targetNode = stableGraph.nodes.find(n => n.id === nodeId);
    if (targetNode) {
      if (mode === 'study' && targetNode.type === 'exercise') {
        showToast("Switching to Practice Mode to view exercise...", "info", 1500);
        changeMode('practice');
        setTimeout(() => {
          handleNodeClick(targetNode, false, context);
        }, 300);
        return;
      }
      handleNodeClick(targetNode, false, context);
    } else if (mode === 'study' && currentStructuralGraphData.exercises?.[nodeId]) {
      showToast("Switching to Practice Mode to view exercise...", "info", 1500);
      changeMode('practice');
      setTimeout(() => {
        // Use optional access to satisfy strict builds when exercises may be undefined
        const exData = currentStructuralGraphData.exercises?.[nodeId];
        if (exData) { 
          handleNodeClick({ id: exData.code, name: exData.name, type: 'exercise' } as GraphNode, false, context); 
        } else { 
          showToast(`Could not navigate to exercise ${nodeId}.`, "error"); 
        }
      }, 300);
    } else {
      showToast(`Node ${nodeId} not found in the current view.`, "warning");
    }
  }, [stableGraph.nodes, handleNodeClick, mode, currentStructuralGraphData, changeMode]);

  // Available definitions for modals (as prerequisite candidates)
  const availableDefinitionsForModals = useMemo(() => {
    return stableGraph.nodes
      .filter(node => node.type === 'definition' && !node.isExternal)
      .map(node => ({ 
        code: node.id, 
        name: node.name, 
        numericId: codeToNumericIdMap.get(node.id) 
      }))
      .filter(node => node.numericId != null)
      .sort((a, b) => a.code.localeCompare(b.code)) as { code: string; name: string; numericId: number; }[];
  }, [stableGraph.nodes, codeToNumericIdMap]);

  // Available meta-exercises for modals (as prerequisite candidates for exercises)
  // IMPORTANT: build exercise prerequisites list from loaded domain data,
  // not from the visible graph nodes (which hide exercises in 'study' mode).
  const availableMetaExercisesForModals = useMemo(() => {
    return Object.values(currentStructuralGraphData.exercises || {})
      .map(ex => ({
        code: ex.code,
        name: ex.name,
        numericId: codeToNumericIdMap.get(ex.code)
      }))
      .filter(item => item.numericId != null)
      .sort((a, b) => a.code.localeCompare(b.code)) as { code: string; name: string; numericId: number; }[];
  }, [currentStructuralGraphData.exercises, codeToNumericIdMap]);

  // Existing codes for duplicate checking in node creation modal
  const existingCodes = useMemo(() => {
    const codes = new Set<string>();
    Object.keys(currentStructuralGraphData.definitions || {}).forEach(code => codes.add(code));
    Object.keys(currentStructuralGraphData.exercises || {}).forEach(code => codes.add(code));
    Object.keys(currentStructuralGraphData.sources || {}).forEach(code => codes.add(code));
    Object.keys(currentStructuralGraphData.quests || {}).forEach(code => codes.add(code));
    return codes;
  }, [currentStructuralGraphData.definitions, currentStructuralGraphData.exercises, currentStructuralGraphData.sources, currentStructuralGraphData.quests]);

  const frenzyCodeConflict = !!frenzyNote
    && frenzyNoteCodeDraft.trim().length > 0
    && frenzyNoteCodeDraft.trim() !== frenzyNote.nodeId
    && existingCodes.has(frenzyNoteCodeDraft.trim());

  const numericIdToCodeMap = useMemo(() => {
    const map = new Map<number, string>();
    codeToNumericIdMap.forEach((id, code) => {
      if (typeof id === 'number') map.set(id, code);
    });
    return map;
  }, [codeToNumericIdMap]);

  const getMetaNodeType = useCallback((nodeType: 'definition' | 'exercise') => (
    nodeType === 'definition' ? 'meta_definition' : 'meta_exercise'
  ), []);

  const getDefaultFrenzyContent = useCallback((nodeType: 'definition' | 'exercise' | 'source', nodeName: string) => {
    const safeName = nodeName || 'this node';
    return nodeType === 'definition' || nodeType === 'source'
      ? `Add details about ${safeName}.`
      : `Solve: ${safeName}.`;
  }, []);

  const getDefaultFrenzyPrompt = useCallback((nodeName: string) => {
    const safeName = nodeName || 'this concept';
    return `Define ${safeName}`;
  }, []);

  const getNextDotCode = useCallback(() => (
    getNextDotCodeFromUtils(existingCodes)
  ), [existingCodes]);

  const getNextExerciseCode = useCallback(() => (
    getNextExerciseCodeFromUtils(existingCodes)
  ), [existingCodes]);

  const getNextSourceCode = useCallback(() => (
    getNextSourceCodeFromUtils(existingCodes)
  ), [existingCodes]);

  const getNextQuestCode = useCallback(() => (
    getNextQuestCodeFromUtils(existingCodes)
  ), [existingCodes]);

  const loadFrenzyPrerequisites = useCallback(async () => {
    const domainId = parseInt(subjectMatterId, 10);
    if (isNaN(domainId)) return;
    try {
      const prereqs = await getDomainPrerequisites(domainId);
      const map = new Map<string, NodePrerequisite>();
      prereqs.forEach(row => {
        if (!row || row.nodeType.indexOf('meta_') !== 0 || row.prerequisiteType.indexOf('meta_') !== 0) return;
        const sourceCode = numericIdToCodeMap.get(row.prerequisiteId);
        const targetCode = numericIdToCodeMap.get(row.nodeId);
        if (!sourceCode || !targetCode) return;
        map.set(`${sourceCode}-${targetCode}`, row);
      });
      setFrenzyPrerequisiteMap(map);
    } catch (error) {
      console.error('Failed to load prerequisites:', error);
      showToast('Failed to load prerequisites for edit mode.', 'error');
    }
  }, [subjectMatterId, numericIdToCodeMap]);

  const toggleFrenzyEditMode = useCallback(async () => {
    if (!canEdit) {
      showToast('Only domain owners or editors can edit nodes.', 'warning');
      return;
    }
    if (!isFrenzyEditMode) {
      ui.closeAllWindows();
      await loadFrenzyPrerequisites();
    } else {
      setFrenzyTool('none');
      setPendingLinkSourceId(null);
      setFrenzyNote(null);
      setFrenzyNoteCodeDraft('');
      setFrenzyNoteDraft('');
      setFrenzyNoteNameDraft('');
      setFrenzyNotePromptDraft('');
      setFrenzyNotePreview(false);
      setIsDraggingFrenzyNote(false);
      if (frenzyClickTimerRef.current) {
        clearTimeout(frenzyClickTimerRef.current);
        frenzyClickTimerRef.current = null;
      }
      if (frenzyBackgroundClickTimerRef.current) {
        clearTimeout(frenzyBackgroundClickTimerRef.current);
        frenzyBackgroundClickTimerRef.current = null;
      }
      frenzyLastClickRef.current = null;
      frenzyLastBackgroundClickRef.current = null;
    }
    setIsFrenzyEditMode(prev => !prev);
  }, [canEdit, isFrenzyEditMode, loadFrenzyPrerequisites, ui]);

  const applyPrerequisiteUpdate = useCallback((
    sourceCode: string,
    targetCode: string,
    action: 'add' | 'remove',
    weight: number = 1.0
  ) => {
    setCurrentStructuralGraphData(prev => {
      const next = { ...prev };
      const isDefinitionTarget = !!next.definitions?.[targetCode];
      const collection = isDefinitionTarget
        ? { ...(next.definitions || {}) }
        : { ...(next.exercises || {}) };
      const target = collection[targetCode];
      if (!target) return prev;

      const prereqs = new Set(target.prerequisites || []);
      if (action === 'add') prereqs.add(sourceCode);
      else prereqs.delete(sourceCode);

      const weights = { ...(target.prerequisiteWeights || {}) };
      if (action === 'add') weights[sourceCode] = weight;
      else delete weights[sourceCode];

      collection[targetCode] = {
        ...target,
        prerequisites: Array.from(prereqs),
        prerequisiteWeights: weights,
      };

      if (isDefinitionTarget) next.definitions = collection as Record<string, Definition>;
      else next.exercises = collection as Record<string, Exercise>;
      return next;
    });
  }, []);

  const addFrenzyPrerequisite = useCallback(async (
    source: GraphNode,
    target: GraphNode,
    idOverrides?: { sourceId?: number; targetId?: number }
  ) => {
    if (source.type === 'quest' || target.type === 'quest' || currentStructuralGraphData.quests?.[source.id] || currentStructuralGraphData.quests?.[target.id]) {
      return;
    }
    if (source.type === 'group' || target.type === 'group') {
      showToast('Groups cannot be used in prerequisite relationships.', 'warning');
      return;
    }
    if (source.type !== 'definition' && source.type !== 'exercise') {
      showToast('Only definitions and exercises can be linked in Frenzy mode.', 'warning');
      return;
    }
    if (target.type !== 'definition' && target.type !== 'exercise') {
      showToast('Only definitions and exercises can be linked in Frenzy mode.', 'warning');
      return;
    }
    if (target.type === 'definition' && source.type !== 'definition') {
      showToast('Definitions can only depend on definitions.', 'warning');
      return;
    }
    const sourceId = idOverrides?.sourceId ?? codeToNumericIdMap.get(source.id);
    const targetId = idOverrides?.targetId ?? codeToNumericIdMap.get(target.id);
    if (!sourceId || !targetId) {
      showToast('Missing node identifiers for linking.', 'error');
      return;
    }
    const key = `${source.id}-${target.id}`;
    if (frenzyPrerequisiteMap.has(key)) {
      showToast('These nodes are already linked.', 'info');
      return;
    }

    try {
      const created = await createPrerequisite({
        nodeId: targetId,
        nodeType: getMetaNodeType(target.type),
        prerequisiteId: sourceId,
        prerequisiteType: getMetaNodeType(source.type),
        weight: 1.0,
        isManual: true,
      });
      setFrenzyPrerequisiteMap(prev => {
        const next = new Map(prev);
        next.set(key, created);
        return next;
      });
      applyPrerequisiteUpdate(source.id, target.id, 'add', created.weight || 1.0);
      showToast(`Linked ${source.id} -> ${target.id}`, 'success', 1200);
    } catch (error) {
      console.error('Failed to create prerequisite:', error);
      showToast('Failed to create link.', 'error');
    }
  }, [
    codeToNumericIdMap,
    frenzyPrerequisiteMap,
    getMetaNodeType,
    applyPrerequisiteUpdate,
    currentStructuralGraphData.quests,
  ]);

  const resolveRelationTarget = useCallback((node: GraphNode): { type: 'meta_definition' | 'meta_exercise' | 'source' | 'meta_quest'; id: number; code: string } | null => {
    if (node.type === 'definition') {
      const id = codeToNumericIdMap.get(node.id);
      if (!id) return null;
      return { type: 'meta_definition', id, code: node.id };
    }
    if (node.type === 'exercise') {
      const id = codeToNumericIdMap.get(node.id);
      if (!id) return null;
      return { type: 'meta_exercise', id, code: node.id };
    }
    if (node.type === 'source') {
      const src = currentStructuralGraphData.sources?.[node.id];
      if (!src?.id) return null;
      return { type: 'source', id: src.id, code: src.code };
    }
    if (node.type === 'quest') {
      const quest = currentStructuralGraphData.quests?.[node.id];
      if (!quest?.id) return null;
      return { type: 'meta_quest', id: quest.id, code: quest.code };
    }
    return null;
  }, [codeToNumericIdMap, currentStructuralGraphData.sources, currentStructuralGraphData.quests]);

  const resolveQuestVersionId = useCallback(async (questCode: string, questId: number): Promise<number | null> => {
    const questData = currentStructuralGraphData.quests?.[questCode];
    const existingId = questData?.versions?.[0]?.id;
    if (existingId) return existingId;
    try {
      const fresh = await getQuest(questId);
      const versionId = fresh.versions?.[0]?.id ?? null;
      if (versionId) {
        setCurrentStructuralGraphData(prev => {
          const nextQuests = { ...(prev.quests || {}) };
          const existing = nextQuests[questCode];
          if (!existing) return prev;
          nextQuests[questCode] = { ...existing, versions: fresh.versions || [] };
          return { ...prev, quests: nextQuests };
        });
      }
      return versionId;
    } catch (err) {
      console.warn('Failed to load quest versions:', err);
      return null;
    }
  }, [currentStructuralGraphData.quests]);

  const createSourceRelevantRelation = useCallback(async (sourceNode: GraphNode, otherNode: GraphNode) => {
    const domainId = parseInt(subjectMatterId, 10);
    if (Number.isNaN(domainId)) {
      showToast('Invalid domain.', 'error');
      return;
    }
    const sourceInfo = resolveRelationTarget(sourceNode);
    const otherInfo = resolveRelationTarget(otherNode);
    if (!sourceInfo || !otherInfo) {
      showToast('Missing node identifiers for linking.', 'error');
      return;
    }
    if (sourceInfo.type !== 'source') {
      showToast('Source links must start from a source node.', 'warning');
      return;
    }
    if (otherInfo.type !== 'meta_definition' && otherInfo.type !== 'meta_exercise') {
      showToast('Sources can only be linked to definitions or exercises.', 'warning');
      return;
    }
    const exists = (currentStructuralGraphData.relations || []).some(rel =>
      rel.fromCode === sourceInfo.code && rel.toCode === otherInfo.code && (rel.relationType || 'relevant') === 'relevant'
    );
    if (exists) {
      showToast('These nodes are already linked.', 'info');
      return;
    }
    try {
      await createRelation(domainId, {
        fromType: 'source',
        fromId: sourceInfo.id,
        toType: otherInfo.type,
        toId: otherInfo.id,
        relationType: 'relevant',
      });
      setCurrentStructuralGraphData(prev => {
        const nextRelations = [...(prev.relations || [])];
        nextRelations.push({ fromCode: sourceInfo.code, toCode: otherInfo.code, relationType: 'relevant' });
        return { ...prev, relations: nextRelations };
      });
      showToast(`Linked ${sourceInfo.code} -> ${otherInfo.code}`, 'success', 1200);
    } catch (error) {
      console.error('Failed to create source relation:', error);
      showToast('Failed to create link.', 'error');
    }
  }, [
    subjectMatterId,
    resolveRelationTarget,
    currentStructuralGraphData.relations,
  ]);

  const createQuestRelevantRelation = useCallback(async (questNode: GraphNode, otherNode: GraphNode) => {
    const domainId = parseInt(subjectMatterId, 10);
    if (Number.isNaN(domainId)) {
      showToast('Invalid domain.', 'error');
      return;
    }
    const questInfo = resolveRelationTarget(questNode);
    const otherInfo = resolveRelationTarget(otherNode);
    if (!questInfo || !otherInfo) {
      showToast('Missing node identifiers for linking.', 'error');
      return;
    }
    if (otherInfo.type === 'meta_quest') {
      showToast('Quests cannot be linked to other quests in Frenzy mode.', 'warning');
      return;
    }
    const versionId = await resolveQuestVersionId(questInfo.code, questInfo.id);
    if (!versionId) {
      showToast('Quest has no version to attach links to.', 'warning');
      return;
    }
    const exists = (currentStructuralGraphData.relations || []).some(rel =>
      rel.fromCode === questInfo.code && rel.toCode === otherInfo.code && (rel.relationType || 'relevant') === 'relevant'
    );
    if (exists) {
      showToast('These nodes are already linked.', 'info');
      return;
    }
    try {
      await createRelation(domainId, {
        fromType: 'meta_quest',
        fromId: questInfo.id,
        toType: otherInfo.type,
        toId: otherInfo.id,
        relationType: 'relevant',
        contextKey: `quest_version:${versionId}`,
      });
      setCurrentStructuralGraphData(prev => {
        const nextRelations = [...(prev.relations || [])];
        nextRelations.push({ fromCode: questInfo.code, toCode: otherInfo.code, relationType: 'relevant' });
        return { ...prev, relations: nextRelations };
      });
      showToast(`Linked ${questInfo.code} -> ${otherInfo.code}`, 'success', 1200);
    } catch (error) {
      console.error('Failed to create quest relation:', error);
      showToast('Failed to create link.', 'error');
    }
  }, [
    subjectMatterId,
    resolveRelationTarget,
    resolveQuestVersionId,
    currentStructuralGraphData.relations,
  ]);

  const removeSourceRelevantRelation = useCallback(async (sourceNode: GraphNode, otherNode: GraphNode) => {
    const domainId = parseInt(subjectMatterId, 10);
    if (Number.isNaN(domainId)) {
      showToast('Invalid domain.', 'error');
      return;
    }
    const sourceInfo = resolveRelationTarget(sourceNode);
    const otherInfo = resolveRelationTarget(otherNode);
    if (!sourceInfo || !otherInfo) {
      showToast('Missing node identifiers for unlinking.', 'error');
      return;
    }
    if (sourceInfo.type !== 'source') {
      showToast('Source links must start from a source node.', 'warning');
      return;
    }
    try {
      const relations = await getDomainRelations(domainId);
      const toDelete = relations.filter(rel =>
        rel.fromType === 'source' &&
        rel.fromId === sourceInfo.id &&
        rel.toType === otherInfo.type &&
        rel.toId === otherInfo.id &&
        rel.relationType === 'relevant'
      );
      if (toDelete.length === 0) {
        showToast('Link not found.', 'warning');
        return;
      }
      await Promise.all(toDelete.map(rel => rel.id ? deleteRelation(rel.id) : Promise.resolve()));
      setCurrentStructuralGraphData(prev => {
        const nextRelations = (prev.relations || []).filter(rel =>
          !(rel.fromCode === sourceInfo.code && rel.toCode === otherInfo.code && (rel.relationType || 'relevant') === 'relevant')
        );
        return { ...prev, relations: nextRelations };
      });
      showToast(`Unlinked ${sourceInfo.code} -> ${otherInfo.code}`, 'success', 1200);
    } catch (error) {
      console.error('Failed to remove source relation:', error);
      showToast('Failed to remove link.', 'error');
    }
  }, [subjectMatterId, resolveRelationTarget]);

  const removeQuestRelevantRelation = useCallback(async (questNode: GraphNode, otherNode: GraphNode) => {
    const domainId = parseInt(subjectMatterId, 10);
    if (Number.isNaN(domainId)) {
      showToast('Invalid domain.', 'error');
      return;
    }
    const questInfo = resolveRelationTarget(questNode);
    const otherInfo = resolveRelationTarget(otherNode);
    if (!questInfo || !otherInfo) {
      showToast('Missing node identifiers for unlinking.', 'error');
      return;
    }
    try {
      const relations = await getDomainRelations(domainId);
      const toDelete = relations.filter(rel =>
        rel.fromType === 'meta_quest' &&
        rel.fromId === questInfo.id &&
        rel.toType === otherInfo.type &&
        rel.toId === otherInfo.id &&
        rel.relationType === 'relevant'
      );
      await Promise.all(toDelete.map(rel => rel.id ? deleteRelation(rel.id) : Promise.resolve()));
      setCurrentStructuralGraphData(prev => {
        const nextRelations = (prev.relations || []).filter(rel =>
          !(rel.fromCode === questInfo.code && rel.toCode === otherInfo.code && (rel.relationType || 'relevant') === 'relevant')
        );
        return { ...prev, relations: nextRelations };
      });
      showToast(`Unlinked ${questInfo.code} -> ${otherInfo.code}`, 'success', 1200);
    } catch (error) {
      console.error('Failed to remove quest relation:', error);
      showToast('Failed to remove link.', 'error');
    }
  }, [subjectMatterId, resolveRelationTarget]);

  const removeFrenzyPrerequisite = useCallback(async (sourceCode: string, targetCode: string) => {
    const key = `${sourceCode}-${targetCode}`;
    const existing = frenzyPrerequisiteMap.get(key);
    if (!existing) {
      showToast('Link not found.', 'warning');
      return;
    }

    try {
      await deletePrerequisite(existing.id);
      setFrenzyPrerequisiteMap(prev => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
      applyPrerequisiteUpdate(sourceCode, targetCode, 'remove');
      showToast(`Unlinked ${sourceCode} -> ${targetCode}`, 'success', 1200);
    } catch (error) {
      console.error('Failed to delete prerequisite:', error);
      showToast('Failed to remove link.', 'error');
    }
  }, [frenzyPrerequisiteMap, applyPrerequisiteUpdate]);

  const maybeCreateFrenzyDragLink = useCallback(async (sourceNode: GraphNode) => {
    if (mode !== 'frenzy' || !isFrenzyEditMode || !canEdit) return;
    if (frenzyTool !== 'none') return;
    if (sourceNode.type === 'group' || sourceNode.isExternal) return;
    if (typeof sourceNode.x !== 'number' || typeof sourceNode.y !== 'number') return;

    const candidates = stableGraphRef.current?.nodes ?? [];
    let closest: GraphNode | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of candidates) {
      if (candidate.id === sourceNode.id) continue;
      if (candidate.type === 'group' || candidate.isExternal) continue;
      if (typeof candidate.x !== 'number' || typeof candidate.y !== 'number') continue;
      const distance = Math.hypot(sourceNode.x - candidate.x, sourceNode.y - candidate.y);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = candidate;
      }
    }

    if (!closest || closestDistance > FRENZY_LINK_SNAP_DISTANCE) return;
    if (closest.type === 'quest' || sourceNode.type === 'quest') {
      const questNode = closest.type === 'quest' ? closest : sourceNode;
      const otherNode = closest.type === 'quest' ? sourceNode : closest;
      if (frenzyPendingLinkRef.current.has(`${questNode.id}-${otherNode.id}`)) return;
      frenzyPendingLinkRef.current.add(`${questNode.id}-${otherNode.id}`);
      try {
        await createQuestRelevantRelation(questNode, otherNode);
      } finally {
        frenzyPendingLinkRef.current.delete(`${questNode.id}-${otherNode.id}`);
      }
      return;
    }
    if (closest.type === 'source' || sourceNode.type === 'source') {
      const sourceRelNode = closest.type === 'source' ? closest : sourceNode;
      const otherNode = closest.type === 'source' ? sourceNode : closest;
      if (otherNode.type !== 'definition' && otherNode.type !== 'exercise') return;
      const key = `source:${sourceRelNode.id}->${otherNode.id}`;
      if (frenzyPendingLinkRef.current.has(key)) return;
      frenzyPendingLinkRef.current.add(key);
      try {
        await createSourceRelevantRelation(sourceRelNode, otherNode);
      } finally {
        frenzyPendingLinkRef.current.delete(key);
      }
      return;
    }
    if (closest.type !== 'definition' && closest.type !== 'exercise') return;
    if (sourceNode.type !== 'definition' && sourceNode.type !== 'exercise') return;
    const key = `${closest.id}-${sourceNode.id}`;
    if (frenzyPrerequisiteMap.has(key) || frenzyPendingLinkRef.current.has(key)) return;
    frenzyPendingLinkRef.current.add(key);
    try {
      await addFrenzyPrerequisite(closest, sourceNode);
    } finally {
      frenzyPendingLinkRef.current.delete(key);
    }
  }, [
    mode,
    isFrenzyEditMode,
    canEdit,
    frenzyTool,
    frenzyPrerequisiteMap,
    addFrenzyPrerequisite,
    createQuestRelevantRelation,
    createSourceRelevantRelation,
  ]);

  // Handle node drag end with position manager
  const handleNodeDragEnd = useCallback((node: GraphNode) => {
    if (!node?.id || typeof node.x !== 'number' || typeof node.y !== 'number') return;

    const groupId = node.groupId ?? parseGroupNodeId(node.id);
    if (groupId) {
      const previous = positionManagerRef.current.getPosition(node.id);
      const prevX = previous?.x ?? (node.xPosition ?? node.x);
      const prevY = previous?.y ?? (node.yPosition ?? node.y);
      const dx = node.x - prevX;
      const dy = node.y - prevY;
      const members = groupMembersById.get(groupId);

      if (members && (dx !== 0 || dy !== 0)) {
        const stableNodes = stableGraphRef.current?.nodes ?? [];
        const stableNodeMap = new Map(stableNodes.map(member => [member.id, member]));

        const getStoredPosition = (memberId: string) => {
          const saved = positionManagerRef.current.getPosition(memberId);
          if (saved) return saved;
          const def = currentStructuralGraphData.definitions?.[memberId];
          if (def && typeof def.xPosition === 'number' && typeof def.yPosition === 'number') {
            return { x: def.xPosition, y: def.yPosition };
          }
          const ex = currentStructuralGraphData.exercises?.[memberId];
          if (ex && typeof ex.xPosition === 'number' && typeof ex.yPosition === 'number') {
            return { x: ex.xPosition, y: ex.yPosition };
          }
          return null;
        };

        members.forEach(memberId => {
          const memberNode = stableNodeMap.get(memberId);
          let baseX = memberNode ? (typeof memberNode.x === 'number' ? memberNode.x : memberNode.xPosition) : undefined;
          let baseY = memberNode ? (typeof memberNode.y === 'number' ? memberNode.y : memberNode.yPosition) : undefined;

          if (typeof baseX !== 'number' || typeof baseY !== 'number') {
            const stored = getStoredPosition(memberId);
            if (!stored) return;
            baseX = stored.x;
            baseY = stored.y;
          }

          const nextX = baseX + dx;
          const nextY = baseY + dy;
          if (memberNode) {
            memberNode.x = nextX;
            memberNode.y = nextY;
            memberNode.fx = nextX;
            memberNode.fy = nextY;
          }
          positionManagerRef.current.fixPosition(memberId, nextX, nextY);
        });
      }
    }

    positionManagerRef.current.fixPosition(node.id, node.x, node.y);
    setPositionsChanged(true);
    (node as any).fx = node.x;
    (node as any).fy = node.y;
    void maybeCreateFrenzyDragLink(node);
  }, [currentStructuralGraphData, groupMembersById, maybeCreateFrenzyDragLink]);

  const openFrenzyNote = useCallback(async (
    node: GraphNode,
    metaIdOverride?: number,
    anchorGraph?: { x: number; y: number }
  ) => {
    if (!canEdit && node.type !== 'source') {
      showToast('Only domain owners or editors can edit nodes.', 'warning');
      return;
    }
    if (node.type === 'group') {
      showToast('Cannot edit group nodes.', 'warning');
      return;
    }
    if (node.type === 'source') {
      const sourceData = currentStructuralGraphData.sources?.[node.id];
      const sourceId = metaIdOverride ?? sourceData?.id;
      if (!sourceId) {
        showToast('Missing source metadata.', 'error');
        return;
      }
      try {
        const source = await getSource(sourceId);
        const isOwner = !!(currentUser && source?.ownerId === currentUser.id);
        if (!isOwner && !currentUser?.isAdmin) {
          showToast('Only the owner can edit this source.', 'warning');
          return;
        }
        const resolvedName = source.title || node.name;
        const resolvedCode = source.code || node.id;
        const autoContentHint = frenzyAutoContentRef.current.get(resolvedCode);
        const defaultContent = autoContentHint || getDefaultFrenzyContent('source', resolvedName);
        const content = source.contentMd || '';
        const isAutoContent = !!autoContentHint && (content.trim().length === 0 || content === autoContentHint);
        const effectiveContent = content.trim().length > 0 ? content : defaultContent;
        const anchor = anchorGraph
          || (typeof node.x === 'number' && typeof node.y === 'number'
            ? { x: node.x, y: node.y }
            : (typeof node.xPosition === 'number' && typeof node.yPosition === 'number'
              ? { x: node.xPosition, y: node.yPosition }
              : undefined));
        const notePosition = getFrenzyNotePlacement(anchor);
        if (notePosition) {
          setFrenzyNotePosition(notePosition);
        }
        const pseudoVersion: DefinitionVersion = {
          id: source.id || 0,
          metaDefinitionId: source.id || 0,
          code: source.code || resolvedCode,
          name: source.title || resolvedName,
          prompt: '',
          type: 'open_ended',
          description: content,
          notes: '',
          references: [],
          promptImagePath: '',
          descriptionImagePath: '',
        };
        setFrenzyNote({
          nodeId: resolvedCode,
          nodeType: 'source',
          nodeName: resolvedName,
          metaId: sourceId,
          version: pseudoVersion,
          allVersions: [pseudoVersion],
          versionIndex: 0,
          prompt: '',
          defaultPrompt: '',
          isAutoPrompt: false,
          promptImagePath: '',
          content: effectiveContent,
          defaultContent,
          isAutoContent,
          contentImagePath: '',
          solution: '',
          solutionImagePath: '',
        });
        setFrenzyNoteCodeDraft(resolvedCode);
        setFrenzyNoteDraft(effectiveContent);
        setFrenzyNoteNameDraft(resolvedName);
        setFrenzyNotePromptDraft('');
        setFrenzyNotePromptImagePath('');
        setFrenzyNoteContentImagePath('');
        setFrenzyNoteSolutionDraft('');
        setFrenzyNoteSolutionImagePath('');
        setShowFrenzySolution(false);
        setFrenzyNotePreview(false);
        setFrenzyNoteIsNewVersion(false);
        if (anchor) {
          requestAnimationFrame(() => {
            const adjusted = getFrenzyNotePlacement(anchor);
            if (adjusted) {
              setFrenzyNotePosition(adjusted);
            }
          });
        }
      } catch (error) {
        console.error('Failed to load source note:', error);
        showToast('Failed to load source content.', 'error');
      }
      return;
    }
    if (node.type === 'quest') {
      const questData = currentStructuralGraphData.quests?.[node.id];
      const isOwner = !!(currentUser && questData?.ownerId === currentUser.id);
      if (!isOwner && !currentUser?.isAdmin) {
        showToast('Only the owner can edit this quest.', 'warning');
        return;
      }
      const questId = metaIdOverride ?? questData?.id;
      if (!questId) {
        showToast('Missing quest metadata.', 'error');
        return;
      }
      const position = getDetailWindowPlacement(node, ui.state.windows.length);
      ui.openQuestWindow(node.id, questData || node, position);
      return;
    }
    const metaId = metaIdOverride ?? codeToNumericIdMap.get(node.id);
    if (!metaId) {
      showToast('Missing node metadata.', 'error');
      return;
    }

    try {
      const meta = node.type === 'definition'
        ? await getMetaDefinition(metaId)
        : await getMetaExercise(metaId);
      const versions = (meta as MetaDefinition | MetaExercise).versions || [];
      if (versions.length === 0) {
        showToast('No version content found for this node.', 'warning');
        return;
      }
      const versionIndex = 0;
      const version = versions[versionIndex];

      const resolvedName = (meta as MetaDefinition | MetaExercise).name || node.name;
      const resolvedCode = (meta as MetaDefinition | MetaExercise).code || node.id;
      const autoContentHint = frenzyAutoContentRef.current.get(resolvedCode);
      const defaultContent = autoContentHint
        || getDefaultFrenzyContent(node.type, resolvedName);
      const content = node.type === 'definition'
        ? ((version as DefinitionVersion).description || '')
        : ((version as ExerciseVersion).statement || '');
      const isAutoContent = !!autoContentHint && (content.trim().length === 0 || content === autoContentHint);
      const effectiveContent = content.trim().length > 0 ? content : defaultContent;

      const rawPrompt = node.type === 'definition'
        ? ((version as DefinitionVersion).prompt || '')
        : '';
      const autoPromptHint = node.type === 'definition'
        ? frenzyAutoPromptRef.current.get(resolvedCode)
        : undefined;
      const defaultPrompt = node.type === 'definition'
        ? (autoPromptHint || getDefaultFrenzyPrompt(resolvedName))
        : '';
      const isAutoPrompt = node.type === 'definition' && !!autoPromptHint
        && (rawPrompt.trim().length === 0 || rawPrompt === autoPromptHint);
      const effectivePrompt = node.type === 'definition'
        ? (rawPrompt.trim().length > 0 ? rawPrompt : defaultPrompt)
        : '';
      const promptImagePath = node.type === 'definition'
        ? ((version as DefinitionVersion).promptImagePath || '')
        : '';
      const contentImagePath = node.type === 'definition'
        ? ((version as DefinitionVersion).descriptionImagePath || '')
        : ((version as ExerciseVersion).statementImagePath || '');
      const solutionText = node.type === 'exercise'
        ? ((version as ExerciseVersion).description || '')
        : '';
      const solutionImagePath = node.type === 'exercise'
        ? ((version as ExerciseVersion).descriptionImagePath || '')
        : '';
      const anchor = anchorGraph
        || (typeof node.x === 'number' && typeof node.y === 'number'
          ? { x: node.x, y: node.y }
          : (typeof node.xPosition === 'number' && typeof node.yPosition === 'number'
            ? { x: node.xPosition, y: node.yPosition }
            : undefined));
      const notePosition = getFrenzyNotePlacement(anchor);
      if (notePosition) {
        setFrenzyNotePosition(notePosition);
      }

      setFrenzyNote({
        nodeId: resolvedCode,
        nodeType: node.type,
        nodeName: resolvedName,
        metaId,
        version,
        allVersions: versions,
        versionIndex,
        prompt: effectivePrompt,
        defaultPrompt,
        isAutoPrompt,
        promptImagePath,
        content: effectiveContent,
        defaultContent,
        isAutoContent,
        contentImagePath,
        solution: solutionText,
        solutionImagePath,
      });
      setFrenzyNoteCodeDraft(resolvedCode);
      setFrenzyNoteDraft(effectiveContent);
      setFrenzyNoteNameDraft(resolvedName);
      setFrenzyNotePromptDraft(effectivePrompt);
      setFrenzyNotePromptImagePath(promptImagePath);
      setFrenzyNoteContentImagePath(contentImagePath);
      setFrenzyNoteSolutionDraft(solutionText);
      setFrenzyNoteSolutionImagePath(solutionImagePath);
      setShowFrenzySolution(false);
      setFrenzyNotePreview(false);
      setFrenzyNoteIsNewVersion(false);
      if (anchor) {
        requestAnimationFrame(() => {
          const adjusted = getFrenzyNotePlacement(anchor);
          if (adjusted) {
            setFrenzyNotePosition(adjusted);
          }
        });
      }
    } catch (error) {
      console.error('Failed to load frenzy note:', error);
      showToast('Failed to load node content.', 'error');
    }
  }, [
    canEdit,
    codeToNumericIdMap,
    getDefaultFrenzyContent,
    getDefaultFrenzyPrompt,
    getFrenzyNotePlacement,
    getDetailWindowPlacement,
    currentStructuralGraphData.sources,
    currentStructuralGraphData.quests,
    currentUser,
    ui,
  ]);

  const removeAuxNodeFromGraph = useCallback((nodeType: 'source' | 'quest', code: string) => {
    setCurrentStructuralGraphData(prev => {
      const next = { ...prev };
      if (nodeType === 'source') {
        const nextSources = { ...(prev.sources || {}) };
        delete nextSources[code];
        next.sources = nextSources;
      } else {
        const nextQuests = { ...(prev.quests || {}) };
        delete nextQuests[code];
        next.quests = nextQuests;
      }
      next.relations = (prev.relations || []).filter(rel => rel.fromCode !== code && rel.toCode !== code);
      return next;
    });

    positionManagerRef.current.removePosition(code);
    if (pendingLinkSourceId === code) setPendingLinkSourceId(null);
    setSelectedNodeIds(prev => {
      if (!prev.has(code)) return prev;
      const next = new Set(prev);
      next.delete(code);
      return next;
    });
    setNewlyCreatedNodeId(prev => (prev === code ? null : prev));
    if (frenzyNote?.nodeId === code) {
      setFrenzyNote(null);
      setFrenzyNoteCodeDraft('');
      setFrenzyNoteDraft('');
      setFrenzyNoteNameDraft('');
      setFrenzyNotePromptDraft('');
      setFrenzyNotePreview(false);
      setIsDraggingFrenzyNote(false);
    }
  }, [pendingLinkSourceId, frenzyNote]);

  const switchFrenzyNoteVersion = useCallback((newIndex: number) => {
    if (!frenzyNote) return;
    if (frenzyNote.nodeType === 'source') return;
    if (newIndex < 0 || newIndex >= frenzyNote.allVersions.length) return;

    const version = frenzyNote.allVersions[newIndex];
    const resolvedName = frenzyNote.nodeName;
    const autoContentHint = frenzyAutoContentRef.current.get(frenzyNote.nodeId);
    const defaultContent = autoContentHint || getDefaultFrenzyContent(frenzyNote.nodeType, resolvedName);

    const content = frenzyNote.nodeType === 'definition'
      ? ((version as DefinitionVersion).description || '')
      : ((version as ExerciseVersion).statement || '');
    const isAutoContent = !!autoContentHint && (content.trim().length === 0 || content === autoContentHint);
    const effectiveContent = content.trim().length > 0 ? content : defaultContent;

    const rawPrompt = frenzyNote.nodeType === 'definition'
      ? ((version as DefinitionVersion).prompt || '')
      : '';
    const autoPromptHint = frenzyNote.nodeType === 'definition'
      ? frenzyAutoPromptRef.current.get(frenzyNote.nodeId)
      : undefined;
    const defaultPrompt = frenzyNote.nodeType === 'definition'
      ? (autoPromptHint || getDefaultFrenzyPrompt(resolvedName))
      : '';
    const isAutoPrompt = frenzyNote.nodeType === 'definition' && !!autoPromptHint
      && (rawPrompt.trim().length === 0 || rawPrompt === autoPromptHint);
    const effectivePrompt = frenzyNote.nodeType === 'definition'
      ? (rawPrompt.trim().length > 0 ? rawPrompt : defaultPrompt)
      : '';
    const promptImagePath = frenzyNote.nodeType === 'definition'
      ? ((version as DefinitionVersion).promptImagePath || '')
      : '';
    const contentImagePath = frenzyNote.nodeType === 'definition'
      ? ((version as DefinitionVersion).descriptionImagePath || '')
      : ((version as ExerciseVersion).statementImagePath || '');
    const solutionText = frenzyNote.nodeType === 'exercise'
      ? ((version as ExerciseVersion).description || '')
      : '';
    const solutionImagePath = frenzyNote.nodeType === 'exercise'
      ? ((version as ExerciseVersion).descriptionImagePath || '')
      : '';

    setFrenzyNote({
      ...frenzyNote,
      version,
      versionIndex: newIndex,
      prompt: effectivePrompt,
      defaultPrompt,
      isAutoPrompt,
      promptImagePath,
      content: effectiveContent,
      defaultContent,
      isAutoContent,
      contentImagePath,
      solution: solutionText,
      solutionImagePath,
    });
    setFrenzyNoteDraft(effectiveContent);
    setFrenzyNotePromptDraft(effectivePrompt);
    setFrenzyNotePromptImagePath(promptImagePath);
    setFrenzyNoteContentImagePath(contentImagePath);
    setFrenzyNoteSolutionDraft(solutionText);
    setFrenzyNoteSolutionImagePath(solutionImagePath);
    setShowFrenzySolution(false);
    setFrenzyNotePreview(false);
    setFrenzyNoteIsNewVersion(false);
  }, [frenzyNote, getDefaultFrenzyContent, getDefaultFrenzyPrompt]);

  const startFrenzyNewVersion = useCallback(() => {
    if (!frenzyNote) return;

    // Reset all draft fields to empty for new version
    setFrenzyNoteDraft('');
    setFrenzyNotePromptDraft('');
    setFrenzyNotePromptImagePath('');
    setFrenzyNoteContentImagePath('');
    setFrenzyNoteSolutionDraft('');
    setFrenzyNoteSolutionImagePath('');
    setFrenzyNoteIsNewVersion(true);
    setShowFrenzySolution(false);
    setFrenzyNotePreview(false);
  }, [frenzyNote]);

  const cancelFrenzyNewVersion = useCallback(() => {
    if (!frenzyNote) return;

    // Restore the current version's data
    setFrenzyNoteDraft(frenzyNote.content);
    setFrenzyNotePromptDraft(frenzyNote.prompt);
    setFrenzyNotePromptImagePath(frenzyNote.promptImagePath);
    setFrenzyNoteContentImagePath(frenzyNote.contentImagePath);
    setFrenzyNoteSolutionDraft(frenzyNote.solution);
    setFrenzyNoteSolutionImagePath(frenzyNote.solutionImagePath);
    setFrenzyNoteIsNewVersion(false);
  }, [frenzyNote]);

  const deleteFrenzyNoteVersion = useCallback(async () => {
    if (!frenzyNote) return;
    if (frenzyNote.nodeType === 'source') {
      showToast('Sources do not have versions.', 'warning');
      return;
    }
    if (frenzyNote.allVersions.length <= 1) {
      showToast('Cannot delete the last version.', 'warning');
      return;
    }

    const versionToDelete = frenzyNote.version;
    const isDefinition = frenzyNote.nodeType === 'definition';

    setIsSavingFrenzyNote(true);
    try {
      if (isDefinition) {
        await deleteMetaDefinitionVersion(frenzyNote.metaId, versionToDelete.id);
      } else {
        await deleteMetaExerciseVersion(frenzyNote.metaId, versionToDelete.id);
      }

      // Reload the meta to get updated versions
      const meta = isDefinition
        ? await getMetaDefinition(frenzyNote.metaId)
        : await getMetaExercise(frenzyNote.metaId);
      const versions = (meta as MetaDefinition | MetaExercise).versions || [];

      if (versions.length === 0) {
        showToast('No versions left. This should not happen.', 'error');
        return;
      }

      // Switch to version 0 after deletion
      const newVersionIndex = 0;
      const newVersion = versions[newVersionIndex];

      const resolvedName = frenzyNote.nodeName;
      const content = isDefinition
        ? ((newVersion as DefinitionVersion).description || '')
        : ((newVersion as ExerciseVersion).statement || '');
      const rawPrompt = isDefinition
        ? ((newVersion as DefinitionVersion).prompt || '')
        : '';
      const promptImagePath = isDefinition
        ? ((newVersion as DefinitionVersion).promptImagePath || '')
        : '';
      const contentImagePath = isDefinition
        ? ((newVersion as DefinitionVersion).descriptionImagePath || '')
        : ((newVersion as ExerciseVersion).statementImagePath || '');
      const solutionText = !isDefinition
        ? ((newVersion as ExerciseVersion).description || '')
        : '';
      const solutionImagePath = !isDefinition
        ? ((newVersion as ExerciseVersion).descriptionImagePath || '')
        : '';

      setFrenzyNote(prev => prev ? {
        ...prev,
        version: newVersion,
        allVersions: versions,
        versionIndex: newVersionIndex,
        prompt: rawPrompt,
        content,
        promptImagePath,
        contentImagePath,
        solution: solutionText,
        solutionImagePath,
      } : prev);

      setFrenzyNoteDraft(content);
      setFrenzyNotePromptDraft(rawPrompt);
      setFrenzyNotePromptImagePath(promptImagePath);
      setFrenzyNoteContentImagePath(contentImagePath);
      setFrenzyNoteSolutionDraft(solutionText);
      setFrenzyNoteSolutionImagePath(solutionImagePath);

      showToast('Version deleted successfully.', 'success');
    } catch (error) {
      console.error('Failed to delete version:', error);
      showToast('Failed to delete version.', 'error');
    } finally {
      setIsSavingFrenzyNote(false);
    }
  }, [frenzyNote]);

  const createFrenzyNode = useCallback(async (
    type: 'definition' | 'exercise' | 'source' | 'quest',
    spawnOverride?: { x: number; y: number }
  ) => {
    if (!canEdit) {
      showToast('Only domain owners or editors can create nodes.', 'warning');
      return;
    }
    const domainId = parseInt(subjectMatterId, 10);
    if (isNaN(domainId)) {
      showToast('Invalid domain.', 'error');
      return;
    }

    const code = type === 'exercise'
      ? getNextExerciseCode()
      : type === 'definition'
        ? getNextDotCode()
        : type === 'source'
          ? getNextSourceCode()
          : getNextQuestCode();
    const name = type === 'definition'
      ? `Concept ${code}`
      : type === 'exercise'
        ? `Exercise ${code}`
        : type === 'source'
          ? (code.startsWith('S') ? `Source ${code.slice(1)}` : 'Source')
          : (code.startsWith('Q') ? `Quest ${code.slice(1)}` : 'Quest');
    const basePosition = (spawnOverride && Number.isFinite(spawnOverride.x) && Number.isFinite(spawnOverride.y))
      ? spawnOverride
      : getGraphCenter();
    const spawn = spawnOverride ? basePosition : {
      x: basePosition.x + (Math.random() - 0.5) * 40,
      y: basePosition.y + (Math.random() - 0.5) * 40,
    };

    const selectedNode = primarySelectedNodeId
      ? stableGraph.nodes.find(n => n.id === primarySelectedNodeId)
      : null;

    try {
      if (type === 'definition') {
        const defaultContent = getDefaultFrenzyContent('definition', name);
        const defaultPrompt = getDefaultFrenzyPrompt(name);
        const created = await createMetaDefinition(domainId, {
          code,
          name,
          xPosition: spawn.x,
          yPosition: spawn.y,
          initialVersion: {
            prompt: defaultPrompt,
            type: 'open_ended',
            description: defaultContent,
            notes: '',
            references: [],
          }
        });
        frenzyAutoContentRef.current.set(code, defaultContent);
        frenzyAutoPromptRef.current.set(code, defaultPrompt);
        insertCreatedNode(code, 'definition', created, spawn);
        if (selectedNode) {
          await addFrenzyPrerequisite(
            selectedNode,
            { id: code, name, type: 'definition' } as GraphNode,
            { targetId: (created as any).id }
          );
        }
        if (isFrenzyEditMode) {
          openFrenzyNote({ id: code, name, type: 'definition' } as GraphNode, (created as any).id, spawn);
        }
      } else if (type === 'exercise') {
        const defaultContent = getDefaultFrenzyContent('exercise', name);
        const created = await createMetaExercise(domainId, {
          code,
          name,
          xPosition: spawn.x,
          yPosition: spawn.y,
          initialVersion: {
            statement: defaultContent,
            description: '',
            notes: '',
            hints: '',
            verifiable: false,
            result: '',
            difficulty: 3,
          }
        });
        frenzyAutoContentRef.current.set(code, defaultContent);
        insertCreatedNode(code, 'exercise', created, spawn);
        if (selectedNode) {
          await addFrenzyPrerequisite(
            selectedNode,
            { id: code, name, type: 'exercise' } as GraphNode,
            { targetId: (created as any).id }
          );
        }
        if (isFrenzyEditMode) {
          openFrenzyNote({ id: code, name, type: 'exercise' } as GraphNode, (created as any).id, spawn);
        }
      } else if (type === 'source') {
        const created = await createSource(domainId, {
          code,
          title: name,
          contentMd: '',
          visibility: 'private',
          xPosition: spawn.x,
          yPosition: spawn.y,
        });
        positionManagerRef.current.fixPosition(created.code, spawn.x, spawn.y);
        setNewlyCreatedNodeId(created.code);
        setCurrentStructuralGraphData(prev => {
          const nextSources = { ...(prev.sources || {}) };
          nextSources[created.code] = {
            ...(nextSources[created.code] || {}),
            ...created,
            type: 'source',
            xPosition: spawn.x,
            yPosition: spawn.y,
          };
          return { ...prev, sources: nextSources };
        });
        pendingFocusNodeIdRef.current = created.code;
        if (isFrenzyEditMode) {
          openFrenzyNote({ id: created.code, name: created.title, type: 'source' } as GraphNode, created.id, spawn);
        }
      } else {
        const schedule = {
          type: 'rrule',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          dtstart: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          rrule: 'FREQ=DAILY;COUNT=1',
          exdate: [],
          rdate: [],
          defaultSnoozeMinutes: 120,
        };
        const created = await createQuest(domainId, {
          code,
          name,
          kind: 'todo',
          schedule,
          visibility: 'private',
          xPosition: spawn.x,
          yPosition: spawn.y,
          initialVersion: {
            title: name,
            descriptionMd: '',
          },
        });
        positionManagerRef.current.fixPosition(created.code, spawn.x, spawn.y);
        setNewlyCreatedNodeId(created.code);
        setCurrentStructuralGraphData(prev => {
          const nextQuests = { ...(prev.quests || {}) };
          nextQuests[created.code] = {
            ...(nextQuests[created.code] || {}),
            ...created,
            type: 'quest',
            xPosition: spawn.x,
            yPosition: spawn.y,
          };
          return { ...prev, quests: nextQuests };
        });
        pendingFocusNodeIdRef.current = created.code;
        if (isFrenzyEditMode) {
          const position = getDetailWindowPlacement({ id: created.code, type: 'quest', name: created.code, x: spawn.x, y: spawn.y } as GraphNode, ui.state.windows.length);
          ui.openQuestWindow(created.code, created, position);
        }
      }
      const label = type === 'definition'
        ? 'Definition'
        : type === 'exercise'
          ? 'Exercise'
          : type === 'source'
            ? 'Source'
            : 'Quest';
      showToast(`${label} "${code}" created.`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('Sources API is not available') || message.includes('Quests API is not available')) {
        showToast(message, 'warning');
        return;
      }
      console.error('Failed to create frenzy node:', error);
      showToast('Failed to create node.', 'error');
    }
  }, [
    canEdit,
    subjectMatterId,
    getNextDotCode,
    getNextExerciseCode,
    getNextSourceCode,
    getNextQuestCode,
    getGraphCenter,
    getDefaultFrenzyContent,
    getDefaultFrenzyPrompt,
    insertCreatedNode,
    primarySelectedNodeId,
    stableGraph.nodes,
    addFrenzyPrerequisite,
    isFrenzyEditMode,
    openFrenzyNote,
    ui,
    getDetailWindowPlacement,
  ]);

  const saveFrenzyNote = useCallback(async (draftOverride?: string) => {
    if (!frenzyNote) return;
    if (isSavingFrenzyNote) return; // Prevent concurrent saves
    const draft = draftOverride ?? frenzyNoteDraft;
    const nameDraft = frenzyNoteNameDraft.trim();
    const codeDraft = frenzyNoteCodeDraft.trim();
    const isDefinition = frenzyNote.nodeType === 'definition';

    if (frenzyNote.nodeType === 'source') {
      const nameChanged = nameDraft.length > 0 && nameDraft !== frenzyNote.nodeName;
      const codeChanged = codeDraft.length > 0 && codeDraft !== frenzyNote.nodeId;
      const contentChanged = draft !== frenzyNote.content;
      if (!nameChanged && !codeChanged && !contentChanged) return;

      if (codeChanged && existingCodes.has(codeDraft)) {
        showToast(`Code "${codeDraft}" already exists.`, 'warning');
        return;
      }

      setIsSavingFrenzyNote(true);
      try {
        if (!codeDraft && frenzyNoteCodeDraft.length > 0) {
          showToast('Code cannot be empty.', 'warning');
          return;
        }
        if (!nameDraft && frenzyNoteNameDraft.length > 0) {
          showToast('Name cannot be empty.', 'warning');
          return;
        }

        const previousCode = frenzyNote.nodeId;
        const updated = await updateSource(frenzyNote.metaId, {
          code: codeDraft,
          title: nameDraft,
          contentMd: draft,
        });

        setFrenzyNote(prev => prev ? {
          ...prev,
          nodeId: updated.code,
          nodeName: updated.title,
          content: updated.contentMd || '',
        } : prev);
        setFrenzyNoteCodeDraft(updated.code);
        setFrenzyNoteNameDraft(updated.title);
        setFrenzyNoteDraft(updated.contentMd || '');

        setCurrentStructuralGraphData(prev => {
          const nextSources = { ...(prev.sources || {}) };
          if (previousCode !== updated.code) {
            delete nextSources[previousCode];
          }
          nextSources[updated.code] = {
            ...(nextSources[previousCode] || {}),
            ...nextSources[updated.code],
            id: updated.id,
            code: updated.code,
            title: updated.title,
            contentMd: updated.contentMd,
            bibtexKey: updated.bibtexKey ?? null,
            filePath: updated.filePath ?? null,
            xPosition: updated.xPosition,
            yPosition: updated.yPosition,
            domainId: updated.domainId,
            ownerId: updated.ownerId,
            visibility: updated.visibility,
            type: 'source',
          };
          return { ...prev, sources: nextSources };
        });

        if (codeChanged && previousCode !== updated.code) {
          await refreshGraphAndSRSData();
        }
      } catch (error) {
        console.error('Failed to save source note:', error);
        showToast('Failed to save source.', 'error');
      } finally {
        setIsSavingFrenzyNote(false);
      }
      return;
    }

    // Handle creating a new version
    if (frenzyNoteIsNewVersion) {
      // Auto-fill empty fields with defaults
      const contentTrimmed = draft.trim();
      const effectiveContent = contentTrimmed.length > 0 ? contentTrimmed : frenzyNote.defaultContent;

      // Skip if even the default content is empty
      if (effectiveContent.trim().length === 0) {
        return;
      }

      const effectivePrompt = isDefinition
        ? (frenzyNotePromptDraft.trim().length > 0 ? frenzyNotePromptDraft : frenzyNote.defaultPrompt)
        : '';

      setIsSavingFrenzyNote(true);
      try {
        if (isDefinition) {
          await addMetaDefinitionVersion(frenzyNote.metaId, {
            prompt: effectivePrompt,
            description: effectiveContent,
            promptImagePath: frenzyNotePromptImagePath,
            descriptionImagePath: frenzyNoteContentImagePath,
          });
        } else {
          await addMetaExerciseVersion(frenzyNote.metaId, {
            statement: effectiveContent,
            description: frenzyNoteSolutionDraft,
            statementImagePath: frenzyNoteContentImagePath,
            descriptionImagePath: frenzyNoteSolutionImagePath,
          });
        }

        // Reload the meta to get updated versions
        const meta = isDefinition
          ? await getMetaDefinition(frenzyNote.metaId)
          : await getMetaExercise(frenzyNote.metaId);
        const versions = (meta as MetaDefinition | MetaExercise).versions || [];
        const newVersionIndex = versions.length - 1;
        const newVersion = versions[newVersionIndex];

        // Update frenzyNote with the new versions array and switch to it
        const resolvedName = frenzyNote.nodeName;
        const content = isDefinition
          ? ((newVersion as DefinitionVersion).description || '')
          : ((newVersion as ExerciseVersion).statement || '');
        const rawPrompt = isDefinition
          ? ((newVersion as DefinitionVersion).prompt || '')
          : '';
        const promptImagePath = isDefinition
          ? ((newVersion as DefinitionVersion).promptImagePath || '')
          : '';
        const contentImagePath = isDefinition
          ? ((newVersion as DefinitionVersion).descriptionImagePath || '')
          : ((newVersion as ExerciseVersion).statementImagePath || '');
        const solutionText = !isDefinition
          ? ((newVersion as ExerciseVersion).description || '')
          : '';
        const solutionImagePath = !isDefinition
          ? ((newVersion as ExerciseVersion).descriptionImagePath || '')
          : '';

        setFrenzyNote(prev => prev ? {
          ...prev,
          version: newVersion,
          allVersions: versions,
          versionIndex: newVersionIndex,
          prompt: rawPrompt,
          content,
          promptImagePath,
          contentImagePath,
          solution: solutionText,
          solutionImagePath,
        } : prev);

        setFrenzyNoteDraft(content);
        setFrenzyNotePromptDraft(rawPrompt);
        setFrenzyNotePromptImagePath(promptImagePath);
        setFrenzyNoteContentImagePath(contentImagePath);
        setFrenzyNoteSolutionDraft(solutionText);
        setFrenzyNoteSolutionImagePath(solutionImagePath);
        setFrenzyNoteIsNewVersion(false);

        showToast('New version created successfully.', 'success');
      } catch (error) {
        console.error('Failed to create new version:', error);
        showToast('Failed to create new version.', 'error');
      } finally {
        setIsSavingFrenzyNote(false);
      }
      return;
    }

    const nameChanged = nameDraft.length > 0 && nameDraft !== frenzyNote.nodeName;
    const codeChanged = codeDraft.length > 0 && codeDraft !== frenzyNote.nodeId;
    const promptChanged = isDefinition && frenzyNotePromptDraft !== frenzyNote.prompt;
    const contentChanged = draft !== frenzyNote.content;
    const promptImageChanged = isDefinition && frenzyNotePromptImagePath !== frenzyNote.promptImagePath;
    const contentImageChanged = frenzyNoteContentImagePath !== frenzyNote.contentImagePath;
    const solutionChanged = !isDefinition && frenzyNoteSolutionDraft !== frenzyNote.solution;
    const solutionImageChanged = !isDefinition && frenzyNoteSolutionImagePath !== frenzyNote.solutionImagePath;
    if (!nameChanged && !codeChanged && !promptChanged && !contentChanged && !promptImageChanged && !contentImageChanged && !solutionChanged && !solutionImageChanged) return;

    if (codeChanged && existingCodes.has(codeDraft)) {
      showToast(`Code "${codeDraft}" already exists.`, 'warning');
      return;
    }

    setIsSavingFrenzyNote(true);
    try {
      if (!codeDraft && frenzyNoteCodeDraft.length > 0) {
        showToast('Code cannot be empty.', 'warning');
      }
      if (!nameDraft && frenzyNoteNameDraft.length > 0) {
        showToast('Name cannot be empty.', 'warning');
      }

      const previousCode = frenzyNote.nodeId;

      if (promptChanged || contentChanged || promptImageChanged || contentImageChanged || solutionChanged || solutionImageChanged) {
        if (frenzyNote.nodeType === 'definition') {
          const current = frenzyNote.version as DefinitionVersion;
          const nextPrompt = promptChanged ? frenzyNotePromptDraft : current.prompt;
          const nextDescription = contentChanged ? draft : (current.description || '');
          const nextPromptImage = promptImageChanged ? frenzyNotePromptImagePath : (current.promptImagePath || '');
          const nextDescriptionImage = contentImageChanged ? frenzyNoteContentImagePath : (current.descriptionImagePath || '');
          await updateMetaDefinitionVersion(frenzyNote.metaId, current.id, {
            prompt: nextPrompt,
            type: current.type,
            description: nextDescription,
            notes: current.notes,
            references: current.references || [],
            promptImagePath: nextPromptImage,
            descriptionImagePath: nextDescriptionImage,
          });
          const updated = { ...current, prompt: nextPrompt, description: nextDescription, promptImagePath: nextPromptImage, descriptionImagePath: nextDescriptionImage };
          setFrenzyNote(prev => prev ? {
            ...prev,
            prompt: nextPrompt,
            content: nextDescription,
            promptImagePath: nextPromptImage,
            contentImagePath: nextDescriptionImage,
            version: updated,
            allVersions: prev.allVersions.map((v, idx) => idx === prev.versionIndex ? updated : v),
            isAutoPrompt: promptChanged ? false : prev.isAutoPrompt,
            isAutoContent: contentChanged ? false : prev.isAutoContent,
          } : prev);
        } else {
          const current = frenzyNote.version as ExerciseVersion;
          const nextStatement = contentChanged ? draft : (current.statement || '');
          const nextSolution = solutionChanged ? frenzyNoteSolutionDraft : (current.description || '');
          const nextStatementImage = contentImageChanged ? frenzyNoteContentImagePath : (current.statementImagePath || '');
          const nextSolutionImage = solutionImageChanged ? frenzyNoteSolutionImagePath : (current.descriptionImagePath || '');
          await updateMetaExerciseVersion(frenzyNote.metaId, current.id, {
            statement: nextStatement,
            description: nextSolution,
            notes: current.notes,
            hints: current.hints,
            verifiable: current.verifiable,
            result: current.result,
            difficulty: current.difficulty,
            statementImagePath: nextStatementImage,
            descriptionImagePath: nextSolutionImage,
          });
          const updated = { ...current, statement: nextStatement, description: nextSolution, statementImagePath: nextStatementImage, descriptionImagePath: nextSolutionImage };
          setFrenzyNote(prev => prev ? {
            ...prev,
            content: nextStatement,
            contentImagePath: nextStatementImage,
            solution: nextSolution,
            solutionImagePath: nextSolutionImage,
            version: updated,
            allVersions: prev.allVersions.map((v, idx) => idx === prev.versionIndex ? updated : v),
            isAutoContent: contentChanged ? false : prev.isAutoContent,
          } : prev);
        }
        if (contentChanged) {
          frenzyAutoContentRef.current.delete(previousCode);
        }
        if (promptChanged) {
          frenzyAutoPromptRef.current.delete(previousCode);
        }
      }

      if (nameChanged || codeChanged) {
        if (frenzyNote.nodeType === 'definition') {
          const updatedMeta = await updateMetaDefinition(frenzyNote.metaId, {
            ...(codeChanged ? { code: codeDraft } : {}),
            ...(nameChanged ? { name: nameDraft } : {}),
          });
          const updatedCode = updatedMeta.code;
          const updatedName = updatedMeta.name;
          const codeWasUpdated = updatedCode !== previousCode;

          if (!codeWasUpdated && nameChanged) {
            setCurrentStructuralGraphData(prev => {
              const next = { ...prev };
              if (next.definitions?.[previousCode]) {
                next.definitions = { ...next.definitions };
                next.definitions[previousCode] = {
                  ...next.definitions[previousCode],
                  name: updatedName,
                };
              }
              return next;
            });
            setNodeDataCache(prev => {
              const next = new Map(prev);
              const cached = next.get(previousCode);
              if (cached) {
                next.set(previousCode, { ...cached, name: updatedName });
              }
              return next;
            });
          }
          setFrenzyNote(prev => prev ? { ...prev, nodeId: updatedCode, nodeName: updatedName } : prev);
          setFrenzyNoteCodeDraft(updatedCode);
          setFrenzyNoteNameDraft(updatedName);

          if (codeWasUpdated) {
            const autoContent = frenzyAutoContentRef.current.get(previousCode);
            if (autoContent) {
              frenzyAutoContentRef.current.set(updatedCode, autoContent);
              frenzyAutoContentRef.current.delete(previousCode);
            }
            const autoPrompt = frenzyAutoPromptRef.current.get(previousCode);
            if (autoPrompt) {
              frenzyAutoPromptRef.current.set(updatedCode, autoPrompt);
              frenzyAutoPromptRef.current.delete(previousCode);
            }
            await refreshGraphAndSRSData();
            if (isFrenzyEditMode) {
              await loadFrenzyPrerequisites();
            }
          }
        } else {
          const updatedMeta = await updateMetaExercise(frenzyNote.metaId, {
            ...(codeChanged ? { code: codeDraft } : {}),
            ...(nameChanged ? { name: nameDraft } : {}),
          });
          const updatedCode = updatedMeta.code;
          const updatedName = updatedMeta.name;
          const codeWasUpdated = updatedCode !== previousCode;

          if (!codeWasUpdated && nameChanged) {
            setCurrentStructuralGraphData(prev => {
              const next = { ...prev };
              if (next.exercises?.[previousCode]) {
                next.exercises = { ...next.exercises };
                next.exercises[previousCode] = {
                  ...next.exercises[previousCode],
                  name: updatedName,
                };
              }
              return next;
            });
            setNodeDataCache(prev => {
              const next = new Map(prev);
              const cached = next.get(previousCode);
              if (cached) {
                next.set(previousCode, { ...cached, name: updatedName });
              }
              return next;
            });
          }
          setFrenzyNote(prev => prev ? { ...prev, nodeId: updatedCode, nodeName: updatedName } : prev);
          setFrenzyNoteCodeDraft(updatedCode);
          setFrenzyNoteNameDraft(updatedName);

          if (codeWasUpdated) {
            const autoContent = frenzyAutoContentRef.current.get(previousCode);
            if (autoContent) {
              frenzyAutoContentRef.current.set(updatedCode, autoContent);
              frenzyAutoContentRef.current.delete(previousCode);
            }
            await refreshGraphAndSRSData();
            if (isFrenzyEditMode) {
              await loadFrenzyPrerequisites();
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to save frenzy note:', error);
      showToast('Failed to save note.', 'error');
    } finally {
      setIsSavingFrenzyNote(false);
    }
  }, [
    frenzyNote,
    frenzyNoteDraft,
    frenzyNoteNameDraft,
    frenzyNotePromptDraft,
    frenzyNotePromptImagePath,
    frenzyNoteContentImagePath,
    frenzyNoteSolutionDraft,
    frenzyNoteSolutionImagePath,
    frenzyNoteCodeDraft,
    frenzyNoteIsNewVersion,
    isSavingFrenzyNote,
    isFrenzyEditMode,
    loadFrenzyPrerequisites,
    refreshGraphAndSRSData,
    updateMetaDefinition,
    updateMetaDefinitionVersion,
    updateMetaExercise,
    updateMetaExerciseVersion,
    updateSource,
    switchFrenzyNoteVersion,
    existingCodes,
  ]);

  const uploadFrenzyImage = useCallback(async (file: File, target: 'prompt' | 'content' | 'solution') => {
    if (!frenzyNote) return;
    if (frenzyNote.nodeType === 'source') {
      showToast('Source images are not supported yet.', 'warning');
      return;
    }
    const domainId = parseInt(subjectMatterId, 10);
    if (isNaN(domainId)) {
      showToast('Missing domain identifier.', 'error');
      return;
    }

    const field = target === 'prompt'
      ? 'prompt'
      : (frenzyNote.nodeType === 'definition' ? 'description' : (target === 'content' ? 'statement' : 'description'));

    try {
      const { imagePath } = await uploadNodeImage({
        file,
        domainId,
        nodeType: frenzyNote.nodeType,
        field,
      });

      if (frenzyNote.nodeType === 'definition') {
        const current = frenzyNote.version as DefinitionVersion;
        const nextPromptImage = target === 'prompt' ? imagePath : (frenzyNotePromptImagePath || current.promptImagePath || '');
        const nextContentImage = target === 'content' ? imagePath : (frenzyNoteContentImagePath || current.descriptionImagePath || '');
        const nextPrompt = (frenzyNote.isAutoPrompt && frenzyNotePromptDraft === frenzyNote.defaultPrompt)
          ? (current.prompt || '')
          : frenzyNotePromptDraft;
        const nextDescription = (frenzyNote.isAutoContent && frenzyNoteDraft === frenzyNote.defaultContent)
          ? (current.description || '')
          : frenzyNoteDraft;
        await updateMetaDefinitionVersion(frenzyNote.metaId, current.id, {
          prompt: nextPrompt,
          type: current.type,
          description: nextDescription,
          notes: current.notes,
          references: current.references || [],
          promptImagePath: nextPromptImage,
          descriptionImagePath: nextContentImage,
        });
        setFrenzyNotePromptImagePath(nextPromptImage);
        setFrenzyNoteContentImagePath(nextContentImage);
        setFrenzyNote(prev => prev ? {
          ...prev,
          promptImagePath: nextPromptImage,
          contentImagePath: nextContentImage,
          version: { ...current, promptImagePath: nextPromptImage, descriptionImagePath: nextContentImage },
        } : prev);
      } else {
        const current = frenzyNote.version as ExerciseVersion;
        const nextStatementImage = target === 'content' ? imagePath : (frenzyNoteContentImagePath || current.statementImagePath || '');
        const nextSolutionImage = target === 'solution' ? imagePath : (frenzyNoteSolutionImagePath || current.descriptionImagePath || '');
        const nextStatement = (frenzyNote.isAutoContent && frenzyNoteDraft === frenzyNote.defaultContent)
          ? (current.statement || '')
          : frenzyNoteDraft;
        const nextSolution = frenzyNoteSolutionDraft;
        await updateMetaExerciseVersion(frenzyNote.metaId, current.id, {
          statement: nextStatement,
          description: nextSolution,
          notes: current.notes,
          hints: current.hints,
          verifiable: current.verifiable,
          result: current.result,
          difficulty: current.difficulty,
          statementImagePath: nextStatementImage,
          descriptionImagePath: nextSolutionImage,
        });
        setFrenzyNoteContentImagePath(nextStatementImage);
        setFrenzyNoteSolutionImagePath(nextSolutionImage);
        setFrenzyNote(prev => prev ? {
          ...prev,
          contentImagePath: nextStatementImage,
          solutionImagePath: nextSolutionImage,
          version: { ...current, statementImagePath: nextStatementImage, descriptionImagePath: nextSolutionImage, description: nextSolution },
        } : prev);
      }
      showToast('Image uploaded.', 'success', 1200);
    } catch (error) {
      console.error('Failed to upload image:', error);
      showToast('Failed to upload image.', 'error');
    }
  }, [
    frenzyNote,
    frenzyNotePromptDraft,
    frenzyNoteDraft,
    frenzyNoteSolutionDraft,
    frenzyNotePromptImagePath,
    frenzyNoteContentImagePath,
    frenzyNoteSolutionImagePath,
    subjectMatterId,
    updateMetaDefinitionVersion,
    updateMetaExerciseVersion,
  ]);

  const handleFrenzyPaste = useCallback((event: React.ClipboardEvent, target: 'prompt' | 'content' | 'solution') => {
    const items = event.clipboardData?.items;
    if (!items) return;
    const imageItem = Array.from(items).find(item => item.type.startsWith('image/'));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    event.preventDefault();
    uploadFrenzyImage(file, target);
  }, [uploadFrenzyImage]);

  const closeFrenzyNote = useCallback(async () => {
    await saveFrenzyNote();
    setFrenzyNote(null);
    setFrenzyNoteCodeDraft('');
    setFrenzyNoteDraft('');
    setFrenzyNoteNameDraft('');
    setFrenzyNotePromptDraft('');
    setFrenzyNotePromptImagePath('');
    setFrenzyNoteContentImagePath('');
    setFrenzyNoteSolutionDraft('');
    setFrenzyNoteSolutionImagePath('');
    setShowFrenzySolution(false);
    setFrenzyNotePreview(false);
    setFrenzyNoteIsNewVersion(false);
    setIsDraggingFrenzyNote(false);
  }, [saveFrenzyNote]);

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (mode !== 'frenzy' || !isFrenzyEditMode) return;
      if (frenzyClickTimerRef.current) {
        clearTimeout(frenzyClickTimerRef.current);
        frenzyClickTimerRef.current = null;
      }
      if (frenzyBackgroundClickTimerRef.current) {
        clearTimeout(frenzyBackgroundClickTimerRef.current);
        frenzyBackgroundClickTimerRef.current = null;
      }
      if (selectedNodeIds.size > 0) {
        setSelectedNodeIds(new Set());
      }
      setPendingLinkSourceId(null);
      if (frenzyNote) {
        void closeFrenzyNote();
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [mode, isFrenzyEditMode, selectedNodeIds, frenzyNote, closeFrenzyNote]);

  const getNodeTypeByCode = useCallback((code: string) => {
    if (currentStructuralGraphData.definitions?.[code]) return 'definition';
    if (currentStructuralGraphData.exercises?.[code]) return 'exercise';
    return null;
  }, [currentStructuralGraphData]);

  const showToolbarTransient = useCallback((message: string, duration: number = 2200) => {
    setToolbarTransientMessage(message);
    if (toolbarTransientTimerRef.current) {
      clearTimeout(toolbarTransientTimerRef.current);
    }
    if (duration > 0) {
      toolbarTransientTimerRef.current = setTimeout(() => {
        setToolbarTransientMessage(null);
        toolbarTransientTimerRef.current = null;
      }, duration);
    }
  }, []);

  const deleteFrenzyNode = useCallback(async (node: GraphNode) => {
    if (node.type === 'group') {
      showToast('Cannot delete group nodes.', 'warning');
      return;
    }
    if (node.type === 'source') {
      const sourceData = currentStructuralGraphData.sources?.[node.id];
      const sourceId = sourceData?.id;
      if (!sourceId) {
        showToast('Missing source metadata.', 'error');
        return;
      }
      const isOwner = !!(currentUser && sourceData?.ownerId === currentUser.id);
      if (!isOwner && !currentUser?.isAdmin) {
        showToast('Only the owner can delete this source.', 'warning');
        return;
      }
      try {
        await deleteSource(sourceId);
        removeAuxNodeFromGraph('source', node.id);
        showToast(`Deleted ${node.id}.`, 'success');
      } catch (error) {
        console.error('Failed to delete source:', error);
        showToast('Failed to delete source.', 'error');
      }
      return;
    }
    if (node.type === 'quest') {
      const questData = currentStructuralGraphData.quests?.[node.id];
      const questId = questData?.id;
      if (!questId) {
        showToast('Missing quest metadata.', 'error');
        return;
      }
      const isOwner = !!(currentUser && questData?.ownerId === currentUser.id);
      const canModerate = !!(currentUser?.isAdmin || (domainData && currentUser && domainData.ownerId === currentUser.id));
      if (!isOwner && !canModerate) {
        showToast('Only the owner can delete this quest.', 'warning');
        return;
      }
      try {
        await deleteQuest(questId);
        removeAuxNodeFromGraph('quest', node.id);
        showToast(`Deleted ${node.id}.`, 'success');
      } catch (error) {
        console.error('Failed to delete quest:', error);
        showToast('Failed to delete quest.', 'error');
      }
      return;
    }
    if (!canEdit) {
      showToast('Only domain owners or editors can delete nodes.', 'warning');
      return;
    }
    const metaId = codeToNumericIdMap.get(node.id);
    if (!metaId) {
      showToast('Missing node metadata.', 'error');
      return;
    }

    try {
      const meta = node.type === 'definition'
        ? await getMetaDefinition(metaId)
        : await getMetaExercise(metaId);
      const versions = (meta as MetaDefinition | MetaExercise).versions || [];

      const incoming: Array<{ code: string; type: 'definition' | 'exercise'; weight: number }> = [];
      Object.values(currentStructuralGraphData.definitions || {}).forEach(def => {
        if (def.prerequisites?.includes(node.id)) {
          incoming.push({
            code: def.code,
            type: 'definition',
            weight: def.prerequisiteWeights?.[node.id] ?? 1.0
          });
        }
      });
      Object.values(currentStructuralGraphData.exercises || {}).forEach(ex => {
        if (ex.prerequisites?.includes(node.id)) {
          incoming.push({
            code: ex.code,
            type: 'exercise',
            weight: ex.prerequisiteWeights?.[node.id] ?? 1.0
          });
        }
      });

      const snapshot: FrenzyDeletedNodeSnapshot = {
        nodeType: node.type,
        code: meta.code,
        name: meta.name,
        xPosition: meta.xPosition,
        yPosition: meta.yPosition,
        prerequisites: meta.prerequisites || [],
        prerequisiteWeights: meta.prerequisiteWeights || {},
        versions,
        incoming,
      };

      if (node.type === 'definition') {
        await deleteMetaDefinition(metaId);
      } else {
        await deleteMetaExercise(metaId);
      }
      setLastDeletedNode(snapshot);

      setCurrentStructuralGraphData(prev => {
        const next = {
          definitions: { ...(prev.definitions || {}) },
          exercises: { ...(prev.exercises || {}) },
          sources: { ...(prev.sources || {}) },
          quests: { ...(prev.quests || {}) },
          relations: [...(prev.relations || [])],
        };
        delete next.definitions[node.id];
        delete next.exercises[node.id];

        Object.values(next.definitions).forEach(def => {
          if (!def.prerequisites) return;
          def.prerequisites = def.prerequisites.filter(code => code !== node.id);
          if (def.prerequisiteWeights) delete def.prerequisiteWeights[node.id];
        });
        Object.values(next.exercises).forEach(ex => {
          if (!ex.prerequisites) return;
          ex.prerequisites = ex.prerequisites.filter(code => code !== node.id);
          if (ex.prerequisiteWeights) delete ex.prerequisiteWeights[node.id];
        });

        if (next.relations.length > 0) {
          next.relations = next.relations.filter(rel => rel.fromCode !== node.id && rel.toCode !== node.id);
        }

        return next;
      });

      setCodeToNumericIdMap(prev => {
        const next = new Map(prev);
        next.delete(node.id);
        return next;
      });
      setNodeDataCache(prev => {
        const next = new Map(prev);
        next.delete(node.id);
        return next;
      });
      setFrenzyPrerequisiteMap(prev => {
        const next = new Map<string, NodePrerequisite>();
        prev.forEach((value, key) => {
          if (key.startsWith(`${node.id}-`) || key.endsWith(`-${node.id}`)) return;
          next.set(key, value);
        });
        return next;
      });
      positionManagerRef.current.removePosition(node.id);
      if (pendingLinkSourceId === node.id) setPendingLinkSourceId(null);
      setSelectedNodeIds(prev => {
        if (!prev.has(node.id)) return prev;
        const next = new Set(prev);
        next.delete(node.id);
        return next;
      });
      setNewlyCreatedNodeId(prev => (prev === node.id ? null : prev));
      if (frenzyNote?.nodeId === node.id) {
        setFrenzyNote(null);
        setFrenzyNoteCodeDraft('');
        setFrenzyNoteDraft('');
        setFrenzyNoteNameDraft('');
        setFrenzyNotePromptDraft('');
        setFrenzyNotePreview(false);
        setIsDraggingFrenzyNote(false);
      }

      showToast(`Deleted ${node.id}. Undo available.`, 'success');
      showToolbarTransient('Node deleted.', 2000);
    } catch (error) {
      console.error('Failed to delete node:', error);
      showToast('Failed to delete node.', 'error');
    }
  }, [
    canEdit,
    codeToNumericIdMap,
    currentStructuralGraphData,
    pendingLinkSourceId,
    frenzyNote,
    currentUser,
    domainData,
    removeAuxNodeFromGraph,
    showToolbarTransient,
  ]);

  const handleFrenzyToolChange = useCallback(async (nextTool: FrenzyEditTool) => {
    const resolvedTool = frenzyTool === nextTool ? 'none' : nextTool;
    setFrenzyTool(resolvedTool);
    if (resolvedTool !== 'link' && resolvedTool !== 'unlink') {
      setPendingLinkSourceId(null);
    }
    if (!primarySelectedNodeId) return;

    if (resolvedTool === 'delete') {
      const selectedNode = stableGraph.nodes.find(n => n.id === primarySelectedNodeId);
      if (selectedNode) {
        await deleteFrenzyNode(selectedNode);
      } else {
        showToast('Selected node not found.', 'warning');
      }
      return;
    }

    if (resolvedTool === 'link' || resolvedTool === 'unlink') {
      setPendingLinkSourceId(primarySelectedNodeId);
      showToast(`Select a target to ${resolvedTool === 'link' ? 'link' : 'unlink'} from ${primarySelectedNodeId}.`, 'info', 1500);
    }
  }, [frenzyTool, primarySelectedNodeId, stableGraph.nodes, deleteFrenzyNode]);

  const flaggableSelection = useMemo(() => {
    if (selectedNodeIds.size === 0) return [];
    const targets: Array<{ id: number; type: 'definition' | 'exercise'; code: string }> = [];
    selectedNodeIds.forEach(code => {
      const nodeType = getNodeTypeByCode(code);
      if (nodeType !== 'definition' && nodeType !== 'exercise') return;
      const numericId = codeToNumericIdMap.get(code);
      if (!numericId) return;
      targets.push({ id: numericId, type: nodeType, code });
    });
    return targets;
  }, [selectedNodeIds, getNodeTypeByCode, codeToNumericIdMap]);

  const handleFlagSelection = useCallback(async (status: NodeStatus, label: string) => {
    if (flaggableSelection.length === 0) {
      showToast('Select at least one definition or exercise.', 'warning');
      return;
    }
    try {
      showToolbarTransient(`Flagging ${flaggableSelection.length} node${flaggableSelection.length > 1 ? 's' : ''}...`, 1200);
      await Promise.all(
        flaggableSelection.map(target => updateNodeStatus(target.id, target.type, status))
      );
      await srs.refreshDomainData();
      showToolbarTransient(`Marked ${flaggableSelection.length} as ${label}.`, 2000);
    } catch (error) {
      console.error('Failed to update node status:', error);
      showToast('Failed to update node status.', 'error');
    }
  }, [flaggableSelection, srs, showToolbarTransient]);

  const selectableGroupCodes = useMemo(() => {
    if (selectedNodeIds.size === 0) return [];
    return Array.from(selectedNodeIds).filter(code => (
      getNodeTypeByCode(code) === 'definition' || getNodeTypeByCode(code) === 'exercise'
    ));
  }, [selectedNodeIds, getNodeTypeByCode]);

  const selectedToolbarGroup = useMemo(() => {
    if (!toolbarGroupId) return null;
    return domainGroups.find(group => group.id === toolbarGroupId) ?? null;
  }, [domainGroups, toolbarGroupId]);

  const handleToolbarGroupSelect = useCallback((value: string) => {
    if (!value) {
      setToolbarGroupId(null);
      setToolbarGroupAction(null);
      return;
    }
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) {
      setToolbarGroupId(parsed);
      setToolbarGroupAction(null);
    }
  }, []);

  const handleAddSelectionToGroup = useCallback(async () => {
    if (!toolbarGroupId || selectableGroupCodes.length === 0) return;
    const group = selectedToolbarGroup;
    if (!group) return;
    try {
      if (group.isExact) {
        const existing: string[] = (group.members && group.members.length > 0)
          ? group.members.map(member => member.nodeCode)
          : Array.from(groupMembersById.get(group.id) ?? []);
        const memberCodes = Array.from(new Set([...existing, ...selectableGroupCodes]));
        await updateGroupData(group.id, { memberCodes });
      } else {
        const existing = (group.seeds || []).map(seed => seed.nodeCode);
        const seedCodes = Array.from(new Set([...existing, ...selectableGroupCodes]));
        await updateGroupData(group.id, { seedCodes });
      }
      showToolbarTransient(`Added ${selectableGroupCodes.length} node${selectableGroupCodes.length > 1 ? 's' : ''} to group.`, 2000);
    } catch (error) {
      console.error('Failed to add nodes to group:', error);
      showToast('Failed to add nodes to group.', 'error');
    }
  }, [toolbarGroupId, selectableGroupCodes, selectedToolbarGroup, groupMembersById, updateGroupData, showToolbarTransient]);

  const handleRemoveSelectionFromGroup = useCallback(async () => {
    if (!toolbarGroupId || selectableGroupCodes.length === 0) return;
    const group = selectedToolbarGroup;
    if (!group) return;
    try {
      if (group.isExact) {
        const existing: string[] = (group.members && group.members.length > 0)
          ? group.members.map(member => member.nodeCode)
          : Array.from(groupMembersById.get(group.id) ?? []);
        const memberCodes = existing.filter(code => !selectableGroupCodes.includes(code));
        if (memberCodes.length === 0) {
          showToast('Group must contain at least one member.', 'warning');
          return;
        }
        await updateGroupData(group.id, { memberCodes });
      } else {
        const seedCodes = (group.seeds || [])
          .map(seed => seed.nodeCode)
          .filter(code => !selectableGroupCodes.includes(code));
        if (seedCodes.length === 0) {
          showToast('Group must contain at least one seed.', 'warning');
          return;
        }
        await updateGroupData(group.id, { seedCodes });
      }
      showToolbarTransient(`Removed ${selectableGroupCodes.length} node${selectableGroupCodes.length > 1 ? 's' : ''} from group.`, 2000);
    } catch (error) {
      console.error('Failed to remove nodes from group:', error);
      showToast('Failed to remove nodes from group.', 'error');
    }
  }, [toolbarGroupId, selectableGroupCodes, selectedToolbarGroup, groupMembersById, updateGroupData, showToolbarTransient]);

  const handleCreateGroupPrompt = useCallback(() => {
    if (selectableGroupCodes.length === 0) {
      showToast('Select at least one node to create a group.', 'warning');
      return;
    }
    setToolbarGroupNameDraft('');
    setToolbarGroupAction('create');
  }, [selectableGroupCodes.length]);

  const handleCreateGroupConfirm = useCallback(async () => {
    const name = toolbarGroupNameDraft.trim();
    if (!name) {
      showToast('Group name is required.', 'warning');
      return;
    }
    const created = await createGroupFromNodes(name, selectableGroupCodes, false);
    if (created) {
      setToolbarGroupId(created.id);
      showToolbarTransient(`Group "${created.name}" created.`, 2000);
    }
    setToolbarGroupAction(null);
    setToolbarGroupNameDraft('');
  }, [toolbarGroupNameDraft, selectableGroupCodes, createGroupFromNodes, showToolbarTransient]);

  const handleDeleteGroupPrompt = useCallback(() => {
    if (!toolbarGroupId) return;
    setToolbarGroupAction('delete');
  }, [toolbarGroupId]);

  const handleDeleteGroupConfirm = useCallback(async () => {
    if (!toolbarGroupId) return;
    const name = selectedToolbarGroup?.name ?? 'group';
    await deleteGroupById(toolbarGroupId);
    setToolbarGroupId(null);
    setToolbarGroupAction(null);
    showToolbarTransient(`Deleted ${name}.`, 2000);
  }, [toolbarGroupId, selectedToolbarGroup, deleteGroupById, showToolbarTransient]);

  const undoFrenzyDelete = useCallback(async () => {
    if (!lastDeletedNode) return;
    if (!canEdit) {
      showToast('Only domain owners or editors can restore nodes.', 'warning');
      return;
    }
    const domainId = parseInt(subjectMatterId, 10);
    if (isNaN(domainId)) {
      showToast('Invalid domain.', 'error');
      return;
    }

    try {
      const snapshot = lastDeletedNode;
      const basePosition = snapshot.xPosition != null && snapshot.yPosition != null
        ? { x: snapshot.xPosition, y: snapshot.yPosition }
        : getGraphCenter();
      let restoredMetaId: number | null = null;

      if (snapshot.nodeType === 'definition') {
        const versions = snapshot.versions as DefinitionVersion[];
        const first = versions[0];
        const created = await createMetaDefinition(domainId, {
          code: snapshot.code,
          name: snapshot.name,
          xPosition: basePosition.x,
          yPosition: basePosition.y,
          initialVersion: {
            prompt: first?.prompt || `Define ${snapshot.name}`,
            type: first?.type || 'open_ended',
            description: first?.description,
            notes: first?.notes,
            references: first?.references || [],
          }
        });
        restoredMetaId = created.id;
        for (const v of versions.slice(1)) {
          await addMetaDefinitionVersion(created.id, {
            prompt: v.prompt,
            type: v.type,
            description: v.description,
            notes: v.notes,
            references: v.references || [],
          });
        }
        insertCreatedNode(snapshot.code, 'definition', created, basePosition);
      } else {
        const versions = snapshot.versions as ExerciseVersion[];
        const first = versions[0];
        const created = await createMetaExercise(domainId, {
          code: snapshot.code,
          name: snapshot.name,
          xPosition: basePosition.x,
          yPosition: basePosition.y,
          initialVersion: {
            statement: first?.statement || `Solve: ${snapshot.name}`,
            description: first?.description,
            notes: first?.notes,
            hints: first?.hints,
            verifiable: first?.verifiable,
            result: first?.result,
            difficulty: first?.difficulty || 3,
          }
        });
        restoredMetaId = created.id;
        for (const v of versions.slice(1)) {
          await addMetaExerciseVersion(created.id, {
            statement: v.statement,
            description: v.description,
            notes: v.notes,
            hints: v.hints,
            verifiable: v.verifiable,
            result: v.result,
            difficulty: v.difficulty,
          });
        }
        insertCreatedNode(snapshot.code, 'exercise', created, basePosition);
      }

      if (restoredMetaId) {
        for (const prereqCode of snapshot.prerequisites) {
          const prereqType = getNodeTypeByCode(prereqCode);
          const prereqId = codeToNumericIdMap.get(prereqCode);
          if (!prereqType || !prereqId) continue;
          await createPrerequisite({
            nodeId: restoredMetaId,
            nodeType: getMetaNodeType(snapshot.nodeType),
            prerequisiteId: prereqId,
            prerequisiteType: getMetaNodeType(prereqType),
            weight: snapshot.prerequisiteWeights?.[prereqCode] ?? 1.0,
            isManual: true,
          });
          applyPrerequisiteUpdate(prereqCode, snapshot.code, 'add', snapshot.prerequisiteWeights?.[prereqCode] ?? 1.0);
        }

        for (const incoming of snapshot.incoming) {
          const targetId = codeToNumericIdMap.get(incoming.code);
          if (!targetId) continue;
          await createPrerequisite({
            nodeId: targetId,
            nodeType: getMetaNodeType(incoming.type),
            prerequisiteId: restoredMetaId,
            prerequisiteType: getMetaNodeType(snapshot.nodeType),
            weight: incoming.weight ?? 1.0,
            isManual: true,
          });
          applyPrerequisiteUpdate(snapshot.code, incoming.code, 'add', incoming.weight ?? 1.0);
        }
      }

      await loadFrenzyPrerequisites();
      setLastDeletedNode(null);
      showToast(`Restored ${snapshot.code}.`, 'success');
      showToolbarTransient('Node restored.', 2000);
    } catch (error) {
      console.error('Failed to restore node:', error);
      showToast('Failed to restore node.', 'error');
    }
  }, [
    lastDeletedNode,
    canEdit,
    subjectMatterId,
    getGraphCenter,
    insertCreatedNode,
    codeToNumericIdMap,
    getMetaNodeType,
    getNodeTypeByCode,
    applyPrerequisiteUpdate,
    loadFrenzyPrerequisites,
    showToolbarTransient,
  ]);

  type ToolboxButtonOptions = {
    variant?: "outline" | "secondary" | "ghost" | "destructive";
    enabled?: boolean;
    onClick?: () => void;
  };

  const toolboxButton = useCallback(
    (label: string, icon: React.ReactNode, options: ToolboxButtonOptions = {}) => {
      const { variant = "outline", enabled = true, onClick } = options;
      const isCompact = toolbarDisplayMode === 'compact';
      return (
        <Button
          variant={variant}
          size="sm"
          title={label}
          aria-label={label}
          disabled={!enabled}
          onClick={enabled ? onClick : undefined}
          className={isCompact ? "h-4 w-4 p-0" : "h-4 px-1.5 py-0 text-[9px] leading-none gap-1"}
        >
          {icon}
          {!isCompact && <span className="text-[9px] font-medium leading-none">{label}</span>}
        </Button>
      );
    },
    [toolbarDisplayMode]
  );

  const handleToolbarModeChange = useCallback((layoutId: string) => {
    if (layoutId === 'edit' && !isFrenzyEditMode) {
      void toggleFrenzyEditMode();
    }
    if (layoutId === 'normal' && isFrenzyEditMode) {
      void toggleFrenzyEditMode();
    }
  }, [isFrenzyEditMode, toggleFrenzyEditMode]);

  const canUseEditTools = canEdit && isFrenzyEditMode;
  const toolbarMode = isFrenzyEditMode ? 'edit' : 'normal';
  const toolInstruction = useMemo(() => {
    if (!isFrenzyEditMode) return null;
    if (frenzyTool === 'link') {
      return pendingLinkSourceId
        ? `Select a target to link from ${pendingLinkSourceId}.`
        : 'Select the first node to link.';
    }
    if (frenzyTool === 'unlink') {
      return pendingLinkSourceId
        ? `Select a target to unlink from ${pendingLinkSourceId}.`
        : 'Select the first node to unlink.';
    }
    if (frenzyTool === 'delete') {
      return 'Select a node to delete.';
    }
    return null;
  }, [isFrenzyEditMode, frenzyTool, pendingLinkSourceId]);
  const groupActionContent = useMemo(() => {
    if (toolbarGroupAction === 'create') {
      return (
        <div className="flex items-center justify-center gap-1 text-[9px] text-gray-600">
          <span className="text-gray-500">Group name</span>
          <input
            value={toolbarGroupNameDraft}
            onChange={(event) => setToolbarGroupNameDraft(event.target.value)}
            placeholder="Name"
            className="h-5 w-28 rounded border border-gray-200 bg-white px-2 text-[10px] text-gray-700"
          />
          <Button size="sm" onClick={handleCreateGroupConfirm} className="h-5 px-2 text-[9px]">
            Create
          </Button>
        </div>
      );
    }
    if (toolbarGroupAction === 'delete') {
      return (
        <div className="flex items-center justify-center gap-1 text-[9px] text-gray-600">
          <span>Delete group</span>
          <span className="font-semibold">{selectedToolbarGroup?.name ?? 'group'}</span>
          <Button size="sm" variant="destructive" onClick={handleDeleteGroupConfirm} className="h-5 px-2 text-[9px]">
            Delete
          </Button>
        </div>
      );
    }
    return null;
  }, [
    toolbarGroupAction,
    toolbarGroupNameDraft,
    handleCreateGroupConfirm,
    handleDeleteGroupConfirm,
    selectedToolbarGroup,
  ]);
  const toolbarInstruction = toolbarTransientMessage ?? toolInstruction ?? undefined;
  const toolbarInstructionContent = groupActionContent ?? (toolbarInstruction ? <span>{toolbarInstruction}</span> : undefined);

  const hasGroups = groupSummaries.length > 0;
  const selectedGroupSummary = toolbarGroupId
    ? groupSummaries.find(group => group.id === toolbarGroupId) ?? null
    : null;
  const canModifyGroup = canEdit && !!toolbarGroupId;
  const canEditGroupSelection = canModifyGroup && selectableGroupCodes.length > 0;
  const groupSelectValue = toolbarGroupId ? String(toolbarGroupId) : '';
  const groupSelectControl = (
    <select
      value={groupSelectValue}
      onChange={(event) => handleToolbarGroupSelect(event.target.value)}
      disabled={!hasGroups}
      className="h-4 rounded border border-gray-200 bg-white px-1 text-[9px] text-gray-700 disabled:bg-gray-100 disabled:text-gray-400"
    >
      <option value="">
        {hasGroups ? 'Select group' : 'No groups'}
      </option>
      {groupSummaries.map(group => (
        <option key={group.id} value={group.id}>
          {group.name}
        </option>
      ))}
    </select>
  );

  const toolboxLayouts: ToolbarLayout[] = useMemo(() => ([
    {
      id: 'edit',
      label: 'Edit',
      handleIcon: <Pencil size={9} />,
      sections: [
        {
          id: 'node-create',
          title: 'Node',
          rows: [
            [
              toolboxButton('Definition', <LifeBuoy size={10} />, {
                onClick: () => void createFrenzyNode('definition'),
                enabled: canUseEditTools,
              }),
              toolboxButton('Exercise', <Anchor size={10} />, {
                onClick: () => void createFrenzyNode('exercise'),
                enabled: canUseEditTools,
                variant: 'secondary',
              }),
            ],
            [
              toolboxButton('Quest', <RadioTower size={10} />, {
                onClick: () => void createFrenzyNode('quest'),
                enabled: canUseEditTools,
                variant: 'ghost',
              }),
              toolboxButton('Source', <Compass size={10} />, {
                onClick: () => void createFrenzyNode('source'),
                enabled: canUseEditTools,
                variant: 'ghost',
              }),
            ],
          ],
        },
        {
          id: 'select',
          title: 'Select',
          rows: [
            [
              toolboxButton('Box Select', <Maximize size={10} />, { enabled: false }),
              toolboxButton('Multi Select', <List size={10} />, { enabled: false, variant: 'ghost' }),
            ],
            [
              toolboxButton('Clear', <EyeOff size={10} />, {
                onClick: handleClearSelection,
                enabled: selectedNodeIds.size > 0,
                variant: 'ghost',
              }),
            ],
          ],
        },
        {
          id: 'graph',
          title: 'Graph',
          rows: [
            [
              toolboxButton('Link', <Link2 size={10} />, {
                onClick: () => void handleFrenzyToolChange('link'),
                enabled: canUseEditTools,
              }),
              toolboxButton('Unlink', <Unlink size={10} />, {
                onClick: () => void handleFrenzyToolChange('unlink'),
                enabled: canUseEditTools,
                variant: 'ghost',
              }),
              toolboxButton('Delete', <Trash2 size={10} />, {
                onClick: () => void handleFrenzyToolChange('delete'),
                enabled: canUseEditTools,
                variant: 'destructive',
              }),
            ],
            ...(lastDeletedNode ? [[
              toolboxButton('Undo delete', <Undo2 size={10} />, {
                onClick: () => void undoFrenzyDelete(),
                enabled: canUseEditTools,
                variant: 'ghost',
              })
            ]] : []),
          ],
        },
      ],
    },
    {
      id: 'normal',
      label: 'Normal',
      handleIcon: <MousePointer size={9} />,
      sections: [
        {
          id: 'select-normal',
          title: 'Select',
          rows: [
            [
              toolboxButton('Click Select', <Eye size={10} />, { enabled: false }),
              toolboxButton('Box Select', <Maximize size={10} />, { enabled: false, variant: 'ghost' }),
            ],
            [
              toolboxButton('Add selection', <Plus size={10} />, {
                onClick: () => toggleSelectionTool('add'),
                variant: selectionTool === 'add' ? 'secondary' : 'outline',
              }),
              toolboxButton('Remove selection', <Minus size={10} />, {
                onClick: () => toggleSelectionTool('remove'),
                variant: selectionTool === 'remove' ? 'secondary' : 'ghost',
              }),
            ],
            [
              toolboxButton('Clear', <EyeOff size={10} />, {
                onClick: handleClearSelection,
                enabled: selectedNodeIds.size > 0,
                variant: 'ghost',
              }),
            ],
          ],
        },
        {
          id: 'flag',
          title: 'Flag',
          rows: [
            [
              toolboxButton('Grasping', <FlagTriangleLeft size={10} />, {
                onClick: () => void handleFlagSelection('grasped', 'Grasping'),
                enabled: flaggableSelection.length > 0,
              }),
              toolboxButton('Tackling', <Flag size={10} />, {
                onClick: () => void handleFlagSelection('tackling', 'Tackling'),
                enabled: flaggableSelection.length > 0,
                variant: 'ghost',
              }),
            ],
            [
              toolboxButton('Learned', <Check size={10} />, {
                onClick: () => void handleFlagSelection('learned', 'Learned'),
                enabled: flaggableSelection.length > 0,
                variant: 'ghost',
              }),
            ],
          ],
        },
        {
          id: 'group',
          title: 'Group',
          rows: [
            [
              groupSelectControl,
            ],
            [
              toolboxButton('Collapse', <EyeOff size={10} />, {
                onClick: () => {
                  if (toolbarGroupId) toggleGroupCollapse(toolbarGroupId, true);
                },
                enabled: canModifyGroup && !selectedGroupSummary?.collapsed,
                variant: 'ghost',
              }),
              toolboxButton('Expand', <Eye size={10} />, {
                onClick: () => {
                  if (toolbarGroupId) toggleGroupCollapse(toolbarGroupId, false);
                },
                enabled: canModifyGroup && !!selectedGroupSummary?.collapsed,
                variant: 'ghost',
              }),
            ],
            [
              toolboxButton('Add selection', <UserPlus size={10} />, {
                onClick: () => void handleAddSelectionToGroup(),
                enabled: canEditGroupSelection,
              }),
              toolboxButton('Remove selection', <UserMinus size={10} />, {
                onClick: () => void handleRemoveSelectionFromGroup(),
                enabled: canEditGroupSelection,
                variant: 'ghost',
              }),
            ],
            [
              toolboxButton('Create group', <Plus size={10} />, {
                onClick: handleCreateGroupPrompt,
                enabled: canEdit && selectableGroupCodes.length > 0,
              }),
              toolboxButton('Delete group', <Trash2 size={10} />, {
                onClick: handleDeleteGroupPrompt,
                enabled: canEdit && !!toolbarGroupId,
                variant: 'destructive',
              }),
            ],
          ],
        },
        {
          id: 'export',
          title: 'Export',
          rows: [
            [
              toolboxButton('PNG', <Download size={10} />, { enabled: false }),
              toolboxButton('JSON', <Download size={10} />, { enabled: false, variant: 'ghost' }),
            ],
            [
              toolboxButton('Share', <Upload size={10} />, { enabled: false, variant: 'ghost' }),
            ],
          ],
        },
      ],
    },
  ]), [
    toolboxButton,
    createFrenzyNode,
    canUseEditTools,
    handleClearSelection,
    handleFrenzyToolChange,
    lastDeletedNode,
    undoFrenzyDelete,
    handleFlagSelection,
    flaggableSelection.length,
    groupSelectControl,
    canModifyGroup,
    selectedGroupSummary?.collapsed,
    handleAddSelectionToGroup,
    handleRemoveSelectionFromGroup,
    handleCreateGroupPrompt,
    handleDeleteGroupPrompt,
    canEdit,
    selectableGroupCodes.length,
    toolbarGroupId,
    selectedNodeIds.size,
    selectionTool,
    toggleSelectionTool,
  ]);

  const handleFrenzyNodeAction = useCallback(async (node: GraphNode) => {
    if (frenzyTool === 'delete') {
      await deleteFrenzyNode(node);
      return;
    }
    if (frenzyTool === 'link' || frenzyTool === 'unlink') {
      if (!pendingLinkSourceId) {
        setPendingLinkSourceId(node.id);
        showToast(`Select a target to ${frenzyTool === 'link' ? 'link' : 'unlink'} from ${node.id}.`, 'info', 1500);
        return;
      }
      if (pendingLinkSourceId === node.id) {
        setPendingLinkSourceId(null);
        showToast('Pick a different target node.', 'warning');
        return;
      }
      const sourceNode = stableGraph.nodes.find(n => n.id === pendingLinkSourceId);
      setPendingLinkSourceId(null);
      if (!sourceNode) {
        showToast('Source node not found.', 'error');
        return;
      }
      const sourceIsQuest = sourceNode.type === 'quest' || !!currentStructuralGraphData.quests?.[sourceNode.id];
      const targetIsQuest = node.type === 'quest' || !!currentStructuralGraphData.quests?.[node.id];
      if (sourceIsQuest || targetIsQuest) {
        const questNode = sourceIsQuest ? { ...sourceNode, type: 'quest' } as GraphNode : { ...node, type: 'quest' } as GraphNode;
        const otherNode = sourceIsQuest ? node : sourceNode;
        if (frenzyTool === 'link') {
          await createQuestRelevantRelation(questNode, otherNode);
        } else {
          await removeQuestRelevantRelation(questNode, otherNode);
        }
        return;
      }
      const sourceIsSource = sourceNode.type === 'source' || !!currentStructuralGraphData.sources?.[sourceNode.id];
      const targetIsSource = node.type === 'source' || !!currentStructuralGraphData.sources?.[node.id];
      if (sourceIsSource || targetIsSource) {
        const sourceRelNode = sourceIsSource ? { ...sourceNode, type: 'source' } as GraphNode : { ...node, type: 'source' } as GraphNode;
        const otherNode = sourceIsSource ? node : sourceNode;
        if (otherNode.type !== 'definition' && otherNode.type !== 'exercise') {
          showToast('Sources can only be linked to definitions or exercises.', 'warning');
          return;
        }
        if (frenzyTool === 'link') {
          await createSourceRelevantRelation(sourceRelNode, otherNode);
        } else {
          await removeSourceRelevantRelation(sourceRelNode, otherNode);
        }
        return;
      }
      if (sourceNode.type !== 'definition' && sourceNode.type !== 'exercise') {
        showToast('Only definitions and exercises can be linked in Frenzy mode.', 'warning');
        return;
      }
      if (node.type !== 'definition' && node.type !== 'exercise') {
        showToast('Only definitions and exercises can be linked in Frenzy mode.', 'warning');
        return;
      }
      if (frenzyTool === 'link') {
        await addFrenzyPrerequisite(sourceNode, node);
      } else {
        const directKey = `${sourceNode.id}-${node.id}`;
        const reverseKey = `${node.id}-${sourceNode.id}`;
        if (frenzyPrerequisiteMap.has(directKey)) {
          await removeFrenzyPrerequisite(sourceNode.id, node.id);
        } else if (frenzyPrerequisiteMap.has(reverseKey)) {
          await removeFrenzyPrerequisite(node.id, sourceNode.id);
        } else {
          showToast('Link not found.', 'warning');
        }
      }
    }
  }, [
    frenzyTool,
    pendingLinkSourceId,
    stableGraph.nodes,
    frenzyPrerequisiteMap,
    addFrenzyPrerequisite,
    removeFrenzyPrerequisite,
    deleteFrenzyNode,
    createQuestRelevantRelation,
    removeQuestRelevantRelation,
    createSourceRelevantRelation,
    removeSourceRelevantRelation,
    currentStructuralGraphData.quests,
    currentStructuralGraphData.sources,
  ]);

  const handleGraphNodeClick = useCallback((node: GraphNode, event?: MouseEvent) => {
    if (node.type === 'group') {
      const groupId = node.groupId ?? parseGroupNodeId(node.id);
      const group = domainGroups.find(entry => entry.id === groupId);
      if (groupId && group) {
        toggleGroupCollapse(groupId, !group.collapsed);
        return;
      }
      if (dagModeEnabled && node.id.startsWith('cycle:')) {
        setExpandedCycleIds(prev => {
          const next = new Set(prev);
          if (next.has(node.id)) {
            next.delete(node.id);
            showToast('Cycle collapsed.', 'info');
          } else {
            next.add(node.id);
            showToast('Cycle expanded. DAG layout paused.', 'info');
          }
          return next;
        });
      }
      return;
    }

    if (node.isExternal && mode === 'frenzy' && isFrenzyEditMode) {
      showToast('External nodes cannot be edited in this domain.', 'warning');
      return;
    }
    if (mode === 'frenzy' && isFrenzyEditMode) {
      if (frenzyBackgroundClickTimerRef.current) {
        clearTimeout(frenzyBackgroundClickTimerRef.current);
        frenzyBackgroundClickTimerRef.current = null;
      }
      frenzyLastBackgroundClickRef.current = null;
      const now = Date.now();
      const last = frenzyLastClickRef.current;
      if (last && last.id === node.id && now - last.ts < FRENZY_DOUBLE_CLICK_MS) {
        if (frenzyClickTimerRef.current) {
          clearTimeout(frenzyClickTimerRef.current);
          frenzyClickTimerRef.current = null;
        }
        frenzyLastClickRef.current = null;
        openFrenzyNote(node);
        return;
      }
      frenzyLastClickRef.current = { id: node.id, ts: now };
      if (frenzyClickTimerRef.current) {
        clearTimeout(frenzyClickTimerRef.current);
      }
      if (frenzyTool === 'none') {
        frenzyClickTimerRef.current = setTimeout(() => {
          frenzyLastClickRef.current = null;
          setSelectedNodeIds(prev => {
            if (prev.size === 1 && prev.has(node.id)) return new Set();
            return new Set([node.id]);
          });
        }, FRENZY_SINGLE_CLICK_DELAY_MS);
        return;
      }
      frenzyClickTimerRef.current = setTimeout(() => {
        frenzyLastClickRef.current = null;
        setSelectedNodeIds(new Set([node.id]));
        handleFrenzyNodeAction(node);
      }, FRENZY_SINGLE_CLICK_DELAY_MS);
      return;
    }
    handleNodeClick(node, false, 'click', event);
  }, [dagModeEnabled, domainGroups, mode, isFrenzyEditMode, frenzyTool, openFrenzyNote, handleFrenzyNodeAction, handleNodeClick, toggleGroupCollapse]);

  const handleGraphLinkClick = useCallback((link: GraphLink) => {
    if (!(mode === 'frenzy' && isFrenzyEditMode && frenzyTool === 'unlink')) return;
    const sourceId = typeof link.source === 'object' ? (link.source as GraphNode).id : String(link.source);
    const targetId = typeof link.target === 'object' ? (link.target as GraphNode).id : String(link.target);
    if (!sourceId || !targetId) return;
    const sourceNode = stableGraph.nodes.find(n => n.id === sourceId);
    const targetNode = stableGraph.nodes.find(n => n.id === targetId);
    if (sourceNode?.type === 'quest' || targetNode?.type === 'quest') {
      const questNode = sourceNode?.type === 'quest' ? sourceNode : targetNode;
      const otherNode = sourceNode?.type === 'quest' ? targetNode : sourceNode;
      if (questNode && otherNode) {
        void removeQuestRelevantRelation(questNode, otherNode);
      }
      return;
    }
    if (sourceNode?.type === 'source' || targetNode?.type === 'source') {
      const sourceRelNode = sourceNode?.type === 'source' ? sourceNode : targetNode;
      const otherNode = sourceNode?.type === 'source' ? targetNode : sourceNode;
      if (sourceRelNode && otherNode && (otherNode.type === 'definition' || otherNode.type === 'exercise')) {
        void removeSourceRelevantRelation(sourceRelNode, otherNode);
      }
      return;
    }
    removeFrenzyPrerequisite(sourceId, targetId);
  }, [
    mode,
    isFrenzyEditMode,
    frenzyTool,
    stableGraph.nodes,
    removeFrenzyPrerequisite,
    removeQuestRelevantRelation,
    removeSourceRelevantRelation,
  ]);

  const handleGraphNodeRightClick = useCallback((node: GraphNode, event?: MouseEvent) => {
    if (!(mode === 'frenzy' && isFrenzyEditMode)) return;
    event?.preventDefault();
    event?.stopPropagation();
    if (frenzyClickTimerRef.current) {
      clearTimeout(frenzyClickTimerRef.current);
      frenzyClickTimerRef.current = null;
    }
    if (frenzyBackgroundClickTimerRef.current) {
      clearTimeout(frenzyBackgroundClickTimerRef.current);
      frenzyBackgroundClickTimerRef.current = null;
    }
    frenzyLastClickRef.current = null;
    frenzyLastBackgroundClickRef.current = null;
    if (node.type === 'group') return;
    if (node.isExternal) {
      showToast('External nodes cannot be edited in this domain.', 'warning');
      return;
    }
    void deleteFrenzyNode(node);
  }, [mode, isFrenzyEditMode, deleteFrenzyNode]);

  const handleGraphLinkRightClick = useCallback((link: GraphLink, event?: MouseEvent) => {
    if (!(mode === 'frenzy' && isFrenzyEditMode)) return;
    event?.preventDefault();
    event?.stopPropagation();
    if (link.type === 'external') {
      showToast('External links cannot be edited in this domain.', 'warning');
      return;
    }
    if (!canEdit) {
      showToast('Only domain owners or editors can remove links.', 'warning');
      return;
    }
    const sourceId = typeof link.source === 'object' ? (link.source as GraphNode).id : String(link.source);
    const targetId = typeof link.target === 'object' ? (link.target as GraphNode).id : String(link.target);
    if (!sourceId || !targetId) return;
    const sourceNode = stableGraph.nodes.find(n => n.id === sourceId);
    const targetNode = stableGraph.nodes.find(n => n.id === targetId);
    if (sourceNode?.type === 'quest' || targetNode?.type === 'quest') {
      const questNode = sourceNode?.type === 'quest' ? sourceNode : targetNode;
      const otherNode = sourceNode?.type === 'quest' ? targetNode : sourceNode;
      if (questNode && otherNode) {
        void removeQuestRelevantRelation(questNode, otherNode);
      }
      return;
    }
    if (sourceNode?.type === 'source' || targetNode?.type === 'source') {
      const sourceRelNode = sourceNode?.type === 'source' ? sourceNode : targetNode;
      const otherNode = sourceNode?.type === 'source' ? targetNode : sourceNode;
      if (sourceRelNode && otherNode && (otherNode.type === 'definition' || otherNode.type === 'exercise')) {
        void removeSourceRelevantRelation(sourceRelNode, otherNode);
      }
      return;
    }
    void removeFrenzyPrerequisite(sourceId, targetId);
  }, [
    mode,
    isFrenzyEditMode,
    canEdit,
    stableGraph.nodes,
    removeFrenzyPrerequisite,
    removeQuestRelevantRelation,
    removeSourceRelevantRelation,
  ]);

  const handleGraphBackgroundClick = useCallback((event?: MouseEvent) => {
    if (mode === 'frenzy' && isFrenzyEditMode) {
      setPendingLinkSourceId(null);
      if (frenzyClickTimerRef.current) {
        clearTimeout(frenzyClickTimerRef.current);
        frenzyClickTimerRef.current = null;
      }
      frenzyLastClickRef.current = null;
      const now = Date.now();
      const last = frenzyLastBackgroundClickRef.current;
      if (last && now - last.ts < FRENZY_DOUBLE_CLICK_MS) {
        if (frenzyBackgroundClickTimerRef.current) {
          clearTimeout(frenzyBackgroundClickTimerRef.current);
          frenzyBackgroundClickTimerRef.current = null;
        }
        frenzyLastBackgroundClickRef.current = null;
        const spawn = getGraphCoordsFromEvent(event) ?? getGraphCenter();
        void createFrenzyNode('definition', spawn);
        return;
      }
      frenzyLastBackgroundClickRef.current = { ts: now };
      if (frenzyBackgroundClickTimerRef.current) {
        clearTimeout(frenzyBackgroundClickTimerRef.current);
      }
      frenzyBackgroundClickTimerRef.current = setTimeout(() => {
        frenzyLastBackgroundClickRef.current = null;
        setSelectedNodeIds(new Set());
      }, FRENZY_SINGLE_CLICK_DELAY_MS);
      return;
    }
    if (selectedNodeIds.size > 0) {
      setSelectedNodeIds(new Set());
    }
  }, [mode, isFrenzyEditMode, getGraphCoordsFromEvent, getGraphCenter, createFrenzyNode, selectedNodeIds]);

  const handleGraphNodeDrag = useCallback((node: GraphNode) => {
    if (mode !== 'frenzy' || !isFrenzyEditMode) return;
    const now = Date.now();
    if (now - frenzyDragLinkThrottleRef.current < 120) return;
    frenzyDragLinkThrottleRef.current = now;
    void maybeCreateFrenzyDragLink(node);
  }, [mode, isFrenzyEditMode, maybeCreateFrenzyDragLink]);

  const handleFrenzyNoteMouseDown = useCallback((event: React.MouseEvent) => {
    if (!frenzyNote) return;
    if ((event.target as HTMLElement).closest('button, textarea, input')) return;
    setIsDraggingFrenzyNote(true);
    frenzyNoteDragOffsetRef.current = {
      x: event.clientX - frenzyNotePosition.x,
      y: event.clientY - frenzyNotePosition.y,
    };
    event.preventDefault();
  }, [frenzyNote, frenzyNotePosition]);

  useEffect(() => {
    if (!isDraggingFrenzyNote) return;
    const handleMove = (event: MouseEvent) => {
      const offset = frenzyNoteDragOffsetRef.current;
      if (!offset) return;
      setFrenzyNotePosition({
        x: Math.max(0, event.clientX - offset.x),
        y: Math.max(0, event.clientY - offset.y),
      });
    };
    const handleUp = () => {
      setIsDraggingFrenzyNote(false);
      frenzyNoteDragOffsetRef.current = null;
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDraggingFrenzyNote]);

  // Position saving
  const savePositions = useCallback(async () => {
    if (!onPositionUpdate || !positionsChanged) return;
    
    setIsSavingPositions(true);
    
    try {
      const allPositions = positionManagerRef.current.getAllPositions();
      const convertedPositions: Record<string, { x: number; y: number }> = {};
      const externalPositions: Array<{
        externalDomainUid: string;
        externalNodeId: number;
        externalNodeType: 'meta_definition' | 'meta_exercise';
        xPosition: number;
        yPosition: number;
      }> = [];
      const groupPositions: Record<string, { x: number; y: number }> = {};
      
      for (const [nodeCode, position] of allPositions.entries()) {
        const externalInfo = parseExternalNodeId(nodeCode);
        if (externalInfo) {
          externalPositions.push({
            externalDomainUid: externalInfo.externalDomainUid,
            externalNodeId: externalInfo.externalNodeId,
            externalNodeType: externalInfo.externalNodeType,
            xPosition: position.x,
            yPosition: position.y,
          });
          continue;
        }

        const groupId = parseGroupNodeId(nodeCode);
        if (groupId !== null) {
          groupPositions[String(groupId)] = { x: position.x, y: position.y };
          continue;
        }

        const sourceNode = currentStructuralGraphData.sources?.[nodeCode];
        if (sourceNode?.id) {
          convertedPositions[`src_${sourceNode.id}`] = { x: position.x, y: position.y };
          continue;
        }

        const questNode = currentStructuralGraphData.quests?.[nodeCode];
        if (questNode?.id) {
          convertedPositions[`quest_${questNode.id}`] = { x: position.x, y: position.y };
          continue;
        }

        const numericId = codeToNumericIdMap.get(nodeCode);
        if (numericId) {
          let nodeType = '';
          if (currentStructuralGraphData.definitions?.[nodeCode]) nodeType = 'def';
          else if (currentStructuralGraphData.exercises?.[nodeCode]) nodeType = 'ex';
          
          if (nodeType) {
            const backendNodeId = `${nodeType}_${numericId}`;
            convertedPositions[backendNodeId] = { x: position.x, y: position.y };
          }
        }
      }
      
      if (Object.keys(convertedPositions).length > 0) {
        await onPositionUpdate(convertedPositions);
      }
      if (externalPositions.length > 0) {
        await updateExternalPrerequisitePositions(parseInt(subjectMatterId, 10), externalPositions);
      }
      if (Object.keys(groupPositions).length > 0) {
        await updateGroupPositions(parseInt(subjectMatterId, 10), groupPositions);
      }
      if (Object.keys(convertedPositions).length > 0 || externalPositions.length > 0 || Object.keys(groupPositions).length > 0) {
        setPositionsChanged(false);
        showToast("Node positions saved.", "success");
      }
    } catch (err) {
      console.error("Failed to save positions:", err);
      showToast(err instanceof Error ? err.message : "Failed to save positions.", "error");
    } finally {
      setIsSavingPositions(false);
    }
  }, [onPositionUpdate, positionsChanged, codeToNumericIdMap, currentStructuralGraphData]);

  // Enhanced credit flow animations
  const enhancedCreditFlowAnimations = useMemo(() => {
    return srs.state.creditFlowAnimations.map((animation: any) => ({
      ...animation,
      duration: 4000,
      timestamp: animation.timestamp || Date.now()
    }));
  }, [srs.state.creditFlowAnimations]);

  // Clear animations handled by GraphLifecycle

  // Drive lifecycle (replaces useEffect-based orchestration)
  const lifecycleRef = useRef<GraphLifecycle | null>(null);
  if (!lifecycleRef.current) {
    lifecycleRef.current = new GraphLifecycle({
      loadDomain: async (domainId: number) => {
        await loadComprehensiveDomainData(domainId);
      },
      checkEnrollmentAndInit: async (domainId: number) => {
        await checkAndInitEnrollment(domainId);
      },
      setIsProcessingData: (v: boolean) => setIsProcessingData(v),
      srs,
      getPendingFocusNodeId: () => pendingFocusNodeIdRef.current,
      clearPendingFocusNodeId: () => { pendingFocusNodeIdRef.current = null; },
      focusNodeById: (nodeId: string) => {
        const node = stableGraph.nodes.find(n => n.id === nodeId);
        if (node) handleNodeClickRef.current(node, false, 'navigation');
      }
    });
  }

  useEffect(() => {
    return () => {
      lifecycleRef.current?.dispose();
    };
  }, []);

  lifecycleRef.current.tick({
    subjectMatterId,
    stableGraphNodes: stableGraph.nodes,
    isProcessingData,
    enhancedCreditFlowAnimationsLength: enhancedCreditFlowAnimations.length,
    isEnrolled: hasAccess,
  });

  return (
      <div className="h-full flex flex-col overflow-hidden bg-gray-100">
        {/* Modals */}
        <NodeCreationModal
          type={nodeCreationType}
          domainId={parseInt(subjectMatterId, 10)}
          isOpen={showNodeCreationModal}
          onClose={() => setShowNodeCreationModal(false)}
          onSuccess={handleNodeCreationSuccess}
          availableDefinitionPrerequisites={availableDefinitionsForModals}
          availableExercisePrerequisites={availableMetaExercisesForModals}
          existingCodes={existingCodes}
          position={nodeCreationPosition}
          getGraphCenter={getGraphCenter}
        />

        <EnrollmentModal
          isOpen={showEnrollmentModal}
          onClose={() => setShowEnrollmentModal(false)}
          domain={domainData}
          onEnrollmentSuccess={handleEnrollment}
          onContinueWithoutEnrollment={handleContinueWithoutEnrollment}
        />

        {domainData && (
          <DomainAccessModal
            isOpen={showAccessModal}
            domainId={domainData.id}
            domainName={domainData.name}
            onClose={() => setShowAccessModal(false)}
          />
        )}

        {/* Top Controls */}
        <TopControls
          subjectMatterId={domainName}
          mode={mode}
          onModeChange={changeMode}
          onBack={onBack}
          labelDisplayMode={labelDisplayMode}
          onCycleLabelDisplay={cycleLabelDisplay}
          onZoomToFit={() => zoomToFitVisibleNodes(400)}
          onCreateDefinition={() => createNewNode('definition')}
          onCreateExercise={() => createNewNode('exercise')}
          onStartStudy={handleStartStudy}
          positionsChanged={positionsChanged}
          isSavingPositions={isSavingPositions}
          onSavePositions={savePositions}
          
          onEnroll={() => setShowEnrollmentModal(true)}
          onOpenSurvey={() => ui.openSurveyWindow()}
          surveyDueCount={surveyDueCount}
          currentDomainId={parseInt(subjectMatterId, 10)}
          currentDomainName={domainName}
          isOwner={currentUser && domainData && domainData.ownerId === currentUser.id}
          canEdit={canEdit}
          isEnrolled={hasAccess ?? undefined}
          onDataImported={refreshGraphAndSRSData}
          onNavigateToNode={(nodeCode) => navigateToNodeById(nodeCode, 'study')}
          onManageAccess={() => setShowAccessModal(true)}
          groups={groupSummaries}
          selectedNodeIds={Array.from(selectedNodeIds)}
          onCreateGroup={async (name, seedCodes, isExact, memberCodes) => {
            await createGroupFromNodes(name, seedCodes, isExact, memberCodes);
          }}
          onToggleGroupCollapse={toggleGroupCollapse}
          onDeleteGroup={async (groupId) => {
            await deleteGroupById(groupId);
          }}
          dagModeEnabled={dagModeEnabled}
          onToggleDagMode={handleToggleDagMode}
          dagOrientation={dagOrientation}
          onDagOrientationChange={handleDagOrientationChange}
          expandedCycleCount={expandedCycleIds.size}
          onCollapseCycles={collapseAllCycles}
          questVisibilityMode={questVisibilityMode}
          onQuestVisibilityChange={setQuestVisibilityMode}
        />

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden relative">
          {/* Left Panel */}
          <div className={`left-panel-class absolute top-0 left-0 h-full z-20 bg-white border-r shadow-lg transition-transform duration-300 ease-in-out ${showLeftPanel ? 'translate-x-0 w-64' : '-translate-x-full w-64'}`}>
            {showLeftPanel && (
              <LeftPanel
                isVisible={showLeftPanel}
                onToggle={toggleLeftPanel}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                filteredNodeType={filteredNodeType}
                onFilterChange={setFilteredNodeType}
                filteredNodes={filteredGraphNodes}
                onNodeClick={handleNodeClick}
                mode={mode}
                activeNodeIds={activeNodeIds}
                selectedNodeIds={selectedNodeIds}
                onNodeSelect={handleNodeSelect}
                onClearSelection={handleClearSelection}
              />
            )}
          </div>
          {!showLeftPanel && <LeftPanelToggle onClick={toggleLeftPanel} />}

          {/* Graph Area */}
          <div ref={graphContainerRef} className="flex-1 bg-gray-50 overflow-hidden relative">
            <ContextToolbar
              id="toolbox-toolbar"
              boundsRef={graphContainerRef}
              layouts={toolboxLayouts}
              activeLayoutId={toolbarMode}
              onLayoutChange={handleToolbarModeChange}
              displayMode={toolbarDisplayMode}
              onDisplayModeChange={setToolbarDisplayMode}
              instructionContent={toolbarInstructionContent}
            />
            {isRefreshing ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                Loading graph data... <RefreshCw className="ml-2 animate-spin" size={18} />
              </div>
            ) : (isProcessingData && stableGraph.nodes.length === 0) ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-gray-600">
                <p className="text-lg">This domain is empty.</p>
                <p className="mt-1 text-sm text-gray-500">Create your first definition or exercise to get started.</p>
                {!canEdit && (
                  <p className="mt-1 text-sm text-gray-400">Only domain owners or editors can create nodes.</p>
                )}
                <div className="mt-4 flex items-center gap-2">
                  <Button
                    onClick={() => createNewNode('definition')}
                    size="sm"
                    disabled={!canEdit}
                    title={!canEdit ? 'Only domain owners or editors can create nodes' : 'Create Definition'}
                  >
                    Create Definition
                  </Button>
                  <Button
                    onClick={() => createNewNode('exercise')}
                    variant="outline"
                    size="sm"
                    disabled={!canEdit}
                    title={!canEdit ? 'Only domain owners or editors can create nodes' : 'Create Exercise'}
                  >
                    Create Exercise
                  </Button>
                </div>
              </div>
            ) : isProcessingData ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                Loading graph data... <RefreshCw className="ml-2 animate-spin" size={18} />
              </div>
            ) : stableGraph.nodes.length > 0 ? (
              <GraphContainer
                graphRef={graphRef}
                graphNodes={renderGraphNodes}
                graphLinks={renderGraphLinks}
                highlightNodes={graphHighlightedNodes}
                highlightLinks={highlightLinks}
                filteredNodeType={filteredNodeType}
                mode={mode}
                width={graphSize.width}
                height={graphSize.height}
                selectedNodeIds={selectedNodeIds}
                newlyCreatedNodeId={newlyCreatedNodeId}
                labelDisplayMode={labelDisplayMode}
                onNodeClick={handleGraphNodeClick}
                onNodeHover={handleNodeHover}
                onNodeDrag={handleGraphNodeDrag}
                onNodeDragEnd={handleNodeDragEnd}
                onLinkClick={handleGraphLinkClick}
                onNodeRightClick={handleGraphNodeRightClick}
                onLinkRightClick={handleGraphLinkRightClick}
                onBackgroundClick={handleGraphBackgroundClick}
                onEngineStop={handleEngineStop}
                creditFlowAnimations={enhancedCreditFlowAnimations}
                requiresPhysicsReset={stableGraph.requiresPhysicsReset}
                structureVersion={stableGraph.structureVersion}
                dagMode={dagMode}
                onDagError={handleDagError}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center text-gray-600">
                <p className="text-lg">No graph data to display for this domain.</p>
                <p className="mt-1 text-sm text-gray-500">Create your first definition or exercise to get started.</p>
                {!canEdit && (
                  <p className="mt-1 text-sm text-gray-400">Only domain owners or editors can create nodes.</p>
                )}
                <div className="mt-4 flex items-center gap-2">
                  <Button
                    onClick={() => createNewNode('definition')}
                    size="sm"
                    disabled={!canEdit}
                    title={!canEdit ? 'Only domain owners or editors can create nodes' : 'Create Definition'}
                  >
                    Create Definition
                  </Button>
                  <Button
                    onClick={() => createNewNode('exercise')}
                    variant="outline"
                    size="sm"
                    disabled={!canEdit}
                    title={!canEdit ? 'Only domain owners or editors can create nodes' : 'Create Exercise'}
                  >
                    Create Exercise
                  </Button>
                </div>
                <Button onClick={refreshGraphAndSRSData} variant="ghost" size="sm" className="mt-3">
                  <RefreshCw size={14} className="mr-1.5" /> Refresh
                </Button>
              </div>
            )}
            
            {!isProcessingData && !isRefreshing && stableGraph.nodes.length > 0 && (
              <GraphLegend mode={mode} hasExercises={mode !== 'study' && stableGraph.nodes.some(n => n.type === 'exercise')} />
            )}

            {mode === 'frenzy' && (
              <div className="absolute top-14 left-3 z-30 flex flex-col items-start gap-2">
                <Button
                  variant={isFrenzyEditMode ? 'default' : 'outline'}
                  size="sm"
                  onClick={toggleFrenzyEditMode}
                  disabled={!canEdit}
                  title={canEdit ? 'Toggle edit tools' : 'Only domain owners or editors can edit'}
                  className="h-8 px-3"
                >
                  {isFrenzyEditMode ? 'Editing' : 'Edit'}
                </Button>

                {isFrenzyEditMode && (
                  <div className="bg-white/95 border border-gray-200 rounded-md shadow-lg p-3 w-60">
                    <div className="text-xs text-gray-500 mb-2">Frenzy tools</div>
                    <div className="flex items-center gap-2 mb-2">
                      <Button size="sm" variant="outline" onClick={() => createFrenzyNode('definition')}>
                        Definition
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => createFrenzyNode('exercise')}>
                        Exercise
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <Button size="sm" variant="outline" onClick={() => createFrenzyNode('source')}>
                        Source
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => createFrenzyNode('quest')}>
                        Quest
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <Button
                        size="sm"
                        variant={frenzyTool === 'link' ? 'default' : 'outline'}
                        onClick={() => handleFrenzyToolChange('link')}
                      >
                        Link
                      </Button>
                      <Button
                        size="sm"
                        variant={frenzyTool === 'unlink' ? 'default' : 'outline'}
                        onClick={() => handleFrenzyToolChange('unlink')}
                      >
                        Unlink
                      </Button>
                      <Button
                        size="sm"
                        variant={frenzyTool === 'delete' ? 'destructive' : 'outline'}
                        onClick={() => handleFrenzyToolChange('delete')}
                      >
                        Delete
                      </Button>
                    </div>
                    {pendingLinkSourceId && (
                      <div className="text-xs text-gray-600 mb-2">
                        From: <span className="font-semibold">{pendingLinkSourceId}</span>
                      </div>
                    )}
                    {lastDeletedNode && (
                      <Button size="sm" variant="ghost" onClick={undoFrenzyDelete} className="w-full justify-center">
                        Undo delete
                      </Button>
                    )}
                    <div className="mt-2 text-[11px] text-gray-500">
                      Click toggles selection. Double-click opens. Double-click empty creates. Drag near to link. Right-click removes.
                    </div>
                  </div>
                )}
              </div>
            )}

            {frenzyNote && (
              <div
                ref={frenzyNoteRef}
                className="absolute z-40 w-80 bg-yellow-100 border border-yellow-300 rounded-md shadow-xl p-3"
                style={{ left: frenzyNotePosition.x, top: frenzyNotePosition.y }}
              >
                <div
                  className="flex items-start justify-between gap-3 cursor-move select-none"
                  onMouseDown={handleFrenzyNoteMouseDown}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-yellow-900 truncate">
                      {frenzyNoteCodeDraft.trim() || frenzyNote.nodeId}
                    </div>
                    <div className="text-xs text-yellow-700 truncate">
                      {frenzyNoteNameDraft.trim() || frenzyNote.nodeName}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={closeFrenzyNote}
                    disabled={isSavingFrenzyNote}
                    className="text-xs"
                  >
                    Close
                  </Button>
                </div>

                {/* Version Navigation */}
                {frenzyNote && frenzyNote.nodeType !== 'source' && frenzyNote.allVersions.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-yellow-300">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={frenzyNoteIsNewVersion || frenzyNote.versionIndex === 0}
                        onClick={() => switchFrenzyNoteVersion(frenzyNote.versionIndex - 1)}
                        className="h-6 px-2 text-[11px]"
                      >
                        Prev
                      </Button>
                      <span className="text-xs font-medium text-yellow-800">
                        {frenzyNoteIsNewVersion ? 'New Version' : `Ver ${frenzyNote.versionIndex + 1}/${frenzyNote.allVersions.length}`}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={frenzyNoteIsNewVersion || frenzyNote.versionIndex >= frenzyNote.allVersions.length - 1}
                        onClick={() => switchFrenzyNoteVersion(frenzyNote.versionIndex + 1)}
                        className="h-6 px-2 text-[11px]"
                      >
                        Next
                      </Button>
                    </div>
                    <div className="flex items-center gap-1 mb-2">
                      <div className="flex flex-wrap gap-1">
                        {frenzyNote.allVersions.map((_, idx) => (
                          <Button
                            key={idx}
                            variant={!frenzyNoteIsNewVersion && idx === frenzyNote.versionIndex ? 'default' : 'outline'}
                            size="sm"
                            disabled={frenzyNoteIsNewVersion}
                            onClick={() => switchFrenzyNoteVersion(idx)}
                            className="h-6 px-2 text-[10px]"
                          >
                            V{idx + 1}
                          </Button>
                        ))}
                        {frenzyNoteIsNewVersion ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={cancelFrenzyNewVersion}
                            className="h-6 px-2 text-[10px] text-red-600"
                          >
                            Cancel
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={startFrenzyNewVersion}
                            className="h-6 px-2 text-[10px]"
                          >
                            + New
                          </Button>
                        )}
                      </div>
                      {!frenzyNoteIsNewVersion && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={frenzyNote.allVersions.length <= 1}
                          onClick={deleteFrenzyNoteVersion}
                          className="h-6 px-2 text-[10px] text-red-600 disabled:opacity-30 ml-auto"
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-2">
                  <div className="mb-2">
                    <label className="block text-xs text-yellow-800 mb-1">Code</label>
                    <input
                      value={frenzyNoteCodeDraft}
                      onChange={(e) => setFrenzyNoteCodeDraft(e.target.value)}
                      onBlur={() => saveFrenzyNote()}
                      disabled={frenzyNoteIsNewVersion}
                      className={`w-full bg-yellow-50 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 ${
                        frenzyCodeConflict
                          ? 'border-red-400 focus:ring-red-200 text-red-700'
                          : 'border-yellow-200 focus:ring-yellow-300 text-gray-800'
                      } ${frenzyNoteIsNewVersion ? 'opacity-50 cursor-not-allowed' : ''}`}
                      aria-invalid={frenzyCodeConflict}
                    />
                    {frenzyCodeConflict && (
                      <div className="mt-1 text-xs text-red-600">
                        Code already exists in this domain.
                      </div>
                    )}
                  </div>
                  <div className="mb-2">
                    <label className="block text-xs text-yellow-800 mb-1">Name</label>
                    <input
                      value={frenzyNoteNameDraft}
                      onChange={(e) => setFrenzyNoteNameDraft(e.target.value)}
                      onBlur={() => saveFrenzyNote()}
                      disabled={frenzyNoteIsNewVersion}
                      className={`w-full bg-yellow-50 border border-yellow-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 text-gray-800 ${frenzyNoteIsNewVersion ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                  </div>
                  {frenzyNote.nodeType === 'definition' && (
                    <div className="mb-2">
                      <label className="block text-xs text-yellow-800 mb-1">Review Prompt</label>
                      {frenzyNotePreview ? (
                        <div className="bg-white border border-yellow-200 rounded p-2 text-sm max-h-32 overflow-y-auto">
                          <MarkdownKatex className="whitespace-pre-wrap">
                            {frenzyNotePromptDraft || frenzyNote.defaultPrompt}
                          </MarkdownKatex>
                        </div>
                      ) : (
                        <textarea
                          value={frenzyNotePromptDraft}
                          onChange={(e) => {
                            const value = e.target.value;
                            setFrenzyNotePromptDraft(value);
                            if (frenzyNote.isAutoPrompt && value !== frenzyNote.defaultPrompt) {
                              setFrenzyNote(prev => prev ? { ...prev, isAutoPrompt: false } : prev);
                            }
                          }}
                          onPaste={(e) => handleFrenzyPaste(e, 'prompt')}
                          onFocus={(e) => {
                            if (frenzyNote.isAutoPrompt && frenzyNotePromptDraft === frenzyNote.defaultPrompt) {
                              e.currentTarget.select();
                            }
                          }}
                          onClick={(e) => {
                            if (frenzyNote.isAutoPrompt && frenzyNotePromptDraft === frenzyNote.defaultPrompt) {
                              e.currentTarget.select();
                            }
                          }}
                          onBlur={() => saveFrenzyNote()}
                          rows={3}
                          className={`w-full bg-yellow-50 border border-yellow-200 rounded p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-yellow-300 ${
                            frenzyNote.isAutoPrompt && frenzyNotePromptDraft === frenzyNote.defaultPrompt ? 'text-gray-500' : 'text-gray-800'
                          }`}
                        />
                      )}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        {frenzyNotePromptImagePath ? (
                          <ZoomableImage src={frenzyNotePromptImagePath} alt="Prompt image" maxHeightClass="max-h-24" className="max-w-[180px]" />
                        ) : (
                          <span className="text-[11px] text-yellow-700">No prompt image</span>
                        )}
                        <div className="flex items-center gap-2">
                          <input
                            ref={frenzyPromptImageInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) uploadFrenzyImage(file, 'prompt');
                              if (e.currentTarget) e.currentTarget.value = '';
                            }}
                          />
                          <Button size="sm" variant="outline" onClick={() => frenzyPromptImageInputRef.current?.click()}>
                            Upload Image
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="mb-2">
                    <label className="block text-xs text-yellow-800 mb-1">
                      {frenzyNote.nodeType === 'definition'
                        ? 'Definition'
                        : frenzyNote.nodeType === 'source'
                          ? 'Source'
                          : 'Statement'}
                    </label>
                  {frenzyNotePreview ? (
                    <div className="bg-white border border-yellow-200 rounded p-2 text-sm max-h-56 overflow-y-auto">
                      <MarkdownKatex className="whitespace-pre-wrap">
                        {frenzyNoteDraft || frenzyNote.defaultContent}
                      </MarkdownKatex>
                    </div>
                  ) : (
                    <textarea
                      value={frenzyNoteDraft}
                      onChange={(e) => {
                        const value = e.target.value;
                        setFrenzyNoteDraft(value);
                        if (frenzyNote.isAutoContent && value !== frenzyNote.defaultContent) {
                          setFrenzyNote(prev => prev ? { ...prev, isAutoContent: false } : prev);
                        }
                      }}
                      onPaste={(e) => handleFrenzyPaste(e, 'content')}
                      onFocus={(e) => {
                        if (frenzyNote.isAutoContent && frenzyNoteDraft === frenzyNote.defaultContent) {
                          e.currentTarget.select();
                        }
                      }}
                      onClick={(e) => {
                        if (frenzyNote.isAutoContent && frenzyNoteDraft === frenzyNote.defaultContent) {
                          e.currentTarget.select();
                        }
                      }}
                      onBlur={() => saveFrenzyNote()}
                      rows={6}
                      placeholder={frenzyNote.defaultContent}
                      className={`w-full bg-yellow-50 border border-yellow-200 rounded p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-yellow-300 ${
                        frenzyNote.isAutoContent && frenzyNoteDraft === frenzyNote.defaultContent ? 'text-gray-500' : 'text-gray-800'
                      }`}
                    />
                  )}
                  {frenzyNote.nodeType !== 'source' && (
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {frenzyNoteContentImagePath ? (
                        <ZoomableImage src={frenzyNoteContentImagePath} alt="Content image" maxHeightClass="max-h-24" className="max-w-[180px]" />
                      ) : (
                        <span className="text-[11px] text-yellow-700">No image attached</span>
                      )}
                      <div className="flex items-center gap-2">
                        <input
                          ref={frenzyContentImageInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadFrenzyImage(file, 'content');
                            if (e.currentTarget) e.currentTarget.value = '';
                          }}
                        />
                        <Button size="sm" variant="outline" onClick={() => frenzyContentImageInputRef.current?.click()}>
                          Upload Image
                        </Button>
                      </div>
                    </div>
                  )}
                  </div>
                </div>
                {frenzyNote.nodeType === 'exercise' && (
                  <div className="mb-2">
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs text-yellow-800">Solution</label>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setShowFrenzySolution(prev => !prev)}
                        className="text-[11px]"
                      >
                        {showFrenzySolution ? 'Hide' : 'Show'}
                      </Button>
                    </div>
                    {showFrenzySolution && (
                      <>
                        {frenzyNotePreview ? (
                          <div className="bg-white border border-yellow-200 rounded p-2 text-sm max-h-40 overflow-y-auto">
                            <MarkdownKatex className="whitespace-pre-wrap">
                              {frenzyNoteSolutionDraft || 'No solution'}
                            </MarkdownKatex>
                          </div>
                        ) : (
                          <textarea
                            value={frenzyNoteSolutionDraft}
                            onChange={(e) => setFrenzyNoteSolutionDraft(e.target.value)}
                            onPaste={(e) => handleFrenzyPaste(e, 'solution')}
                            onBlur={() => saveFrenzyNote()}
                            rows={4}
                            placeholder="Solution or explanation..."
                            className="w-full bg-yellow-50 border border-yellow-200 rounded p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-yellow-300 text-gray-800"
                          />
                        )}
                        <div className="mt-2 flex items-center justify-between gap-2">
                          {frenzyNoteSolutionImagePath ? (
                            <ZoomableImage src={frenzyNoteSolutionImagePath} alt="Solution image" maxHeightClass="max-h-24" className="max-w-[180px]" />
                          ) : (
                            <span className="text-[11px] text-yellow-700">No solution image</span>
                          )}
                          <div className="flex items-center gap-2">
                            <input
                              ref={frenzySolutionImageInputRef}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) uploadFrenzyImage(file, 'solution');
                                if (e.currentTarget) e.currentTarget.value = '';
                              }}
                            />
                            <Button size="sm" variant="outline" onClick={() => frenzySolutionImageInputRef.current?.click()}>
                              Upload Image
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setFrenzyNotePreview(prev => !prev)}
                  >
                    {frenzyNotePreview ? 'Edit' : 'Preview'}
                  </Button>
                  {isSavingFrenzyNote && (
                    <span className="text-xs text-gray-600">Saving...</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Render draggable windows */}
          {ui.state.windows.map(window => (
            <DraggableWindow
              key={window.id}
              id={window.id}
              title={window.title}
              initialPosition={window.position}
              initialSize={window.size}
              onClose={() => ui.closeWindow(window.id)}
              onFocus={() => ui.focusWindow(window.id)}
              zIndex={window.zIndex}
              isMinimized={window.isMinimized}
              onMinimize={() => ui.minimizeWindow(window.id)}
            >
              {window.type === 'detail' && (
                <DetailWindowContent
                  nodeData={window.contentProps.nodeData}
                  windowId={window.id}
                  graphData={currentStructuralGraphData}
                  onNavigateToNode={navigateToNodeById}
                  codeToNumericIdMap={codeToNumericIdMap}
                  currentUser={currentUser}
                  domainData={domainData}
                  onUpdateNodeData={handleSurgicalNodeUpdate}
                  onRefresh={refreshGraphAndSRSData}
                  externalPrerequisites={externalPrerequisites}
                  onExternalChanged={() => refreshExternalPrerequisites(domainData?.id)}
                  groups={domainGroups}
                  groupMembersById={groupMembersById}
                  onCreateGroup={createGroupFromNodes}
                  onUpdateGroup={updateGroupData}
                  onDeleteGroup={deleteGroupById}
                />
              )}
              {window.type === 'review' && (
                <ReviewWindowContent
                  domainId={parseInt(subjectMatterId, 10)}
                  onNavigateToNode={navigateToNodeById}
                  windowId={window.id}
                  reviewMode={mode === 'frenzy' ? 'frenzy' : 'normal'}
                />
              )}
              {window.type === 'source' && (
                <SourceWindowContent
                  windowId={window.id}
                  sourceData={window.contentProps.sourceData || window.contentProps.nodeData}
                  domainId={parseInt(subjectMatterId, 10)}
                  graphData={currentStructuralGraphData}
                  onUpdateSource={(updated) => {
                    setCurrentStructuralGraphData(prev => {
                      const nextSources = { ...(prev.sources || {}) };
                      const existingCode = Object.keys(nextSources).find(code => nextSources[code]?.id === updated.id);
                      if (existingCode && existingCode !== updated.code) {
                        delete nextSources[existingCode];
                      }
                      nextSources[updated.code] = {
                        ...(nextSources[updated.code] || {}),
                        ...updated,
                        type: 'source',
                      };
                      const nextRelations = (prev.relations || []).map(rel => ({
                        ...rel,
                        fromCode: existingCode && rel.fromCode === existingCode ? updated.code : rel.fromCode,
                        toCode: existingCode && rel.toCode === existingCode ? updated.code : rel.toCode,
                      }));
                      return { ...prev, sources: nextSources, relations: nextRelations };
                    });
                  }}
                  onDeleteSource={(code) => {
                    removeAuxNodeFromGraph('source', code);
                  }}
                  onRelevantLinksUpdated={refreshDomainRelations}
                  onQuestCreated={(quest, relation) => {
                    setCurrentStructuralGraphData(prev => {
                      const nextQuests = { ...(prev.quests || {}) };
                      nextQuests[quest.code] = {
                        ...(nextQuests[quest.code] || {}),
                        ...quest,
                        type: 'quest',
                      };
                      const nextRelations = [...(prev.relations || [])];
                      nextRelations.push({
                        fromCode: relation.fromCode,
                        toCode: relation.toCode,
                        relationType: relation.relationType,
                      });
                      return { ...prev, quests: nextQuests, relations: nextRelations };
                    });
                  }}
                />
              )}
              {window.type === 'quest' && (
                <QuestWindowContent
                  windowId={window.id}
                  questData={window.contentProps.questData || window.contentProps.nodeData}
                  domainId={parseInt(subjectMatterId, 10)}
                  graphData={currentStructuralGraphData}
                  onUpdateQuest={(updated) => {
                    setCurrentStructuralGraphData(prev => {
                      const nextQuests = { ...(prev.quests || {}) };
                      const existingCode = Object.keys(nextQuests).find(code => nextQuests[code]?.id === updated.id);
                      if (existingCode && existingCode !== updated.code) {
                        delete nextQuests[existingCode];
                      }
                      nextQuests[updated.code] = {
                        ...(nextQuests[updated.code] || {}),
                        ...updated,
                        type: 'quest',
                      };
                      const nextRelations = (prev.relations || []).map(rel => ({
                        ...rel,
                        fromCode: existingCode && rel.fromCode === existingCode ? updated.code : rel.fromCode,
                        toCode: existingCode && rel.toCode === existingCode ? updated.code : rel.toCode,
                      }));
                      return { ...prev, quests: nextQuests, relations: nextRelations };
                    });
                  }}
                  onDeleteQuest={(code) => {
                    removeAuxNodeFromGraph('quest', code);
                  }}
                  onRelevantLinksUpdated={refreshDomainRelations}
                />
              )}
              {window.type === 'survey' && (
                <SurveyWindowContent
                  domainId={parseInt(subjectMatterId, 10)}
                  graphData={currentStructuralGraphData}
                  onNavigateToNode={navigateToNodeById}
                  onQuestUpdated={(updated) => {
                    setCurrentStructuralGraphData(prev => {
                      const nextQuests = { ...(prev.quests || {}) };
                      const existingCode = Object.keys(nextQuests).find(code => nextQuests[code]?.id === updated.id);
                      if (existingCode && existingCode !== updated.code) {
                        delete nextQuests[existingCode];
                      }
                      nextQuests[updated.code] = {
                        ...(nextQuests[updated.code] || {}),
                        ...updated,
                        type: 'quest',
                      };
                      const nextRelations = (prev.relations || []).map(rel => ({
                        ...rel,
                        fromCode: existingCode && rel.fromCode === existingCode ? updated.code : rel.fromCode,
                        toCode: existingCode && rel.toCode === existingCode ? updated.code : rel.toCode,
                      }));
                      return { ...prev, quests: nextQuests, relations: nextRelations };
                    });
                  }}
                  onStatsUpdated={(count) => setSurveyDueCount(count)}
                />
              )}
            </DraggableWindow>
          ))}
        </div>
      </div>
  );
};

const KnowledgeGraphWrapper: FC<KnowledgeGraphProps> = (props) => (
  <MathJaxProvider>
    <KnowledgeGraph {...props} />
  </MathJaxProvider>
);

export default KnowledgeGraphWrapper;
