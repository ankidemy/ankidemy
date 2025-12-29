// client/src/app/components/Graph/KnowledgeGraph.tsx

"use client";

import React, { useState, useRef, useCallback, useMemo, FC, useEffect } from 'react';
import { MathJaxProvider } from '@/app/components/core/MathJaxWrapper';
import { MarkdownKatex } from '@/app/components/core/MarkdownKatex';
import { UIProvider, useUI } from '@/contexts/UIContext';
import { DraggableWindow } from '@/app/components/core/DraggableWindow';
import { DetailWindowContent } from './windows/DetailWindowContent';
import { ReviewWindowContent } from './windows/ReviewWindowContent';
import { RefreshCw } from 'lucide-react';
import { Button } from "@/app/components/core/button";
import {
  getDefinitionByCode,
  getExerciseByCode,
  Definition as ApiDefinition,
  Exercise as ApiExercise,
  getDomainMetaDefinitions,
  getDomainMetaExercises,
  MetaDefinition,
  MetaExercise,
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
import { getStatusColor, isNodeDue, calculateDaysUntilReview, createPrerequisite, deletePrerequisite, getDomainPrerequisites } from '@/lib/srs-api';
import { NodeStatus, NodePrerequisite } from '../../../types/srs';

import {
  GraphNode,
  GraphLink,
  Definition,
  Exercise,
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
import { PositionManager } from './utils/PositionManager';
import { getNextDotCode as getNextDotCodeFromUtils, getNextExerciseCode as getNextExerciseCodeFromUtils } from './utils/codeGeneration';

// ============================================================================
// TYPE DEFINITIONS FOR TRUE STRUCTURE/METADATA SEPARATION
// ============================================================================

// Structure only contains topology data - no names or visual properties
interface GraphNodeCore {
  id: string;
  type: 'definition' | 'exercise';
  prerequisites?: string[];
  domainId?: number;
  xPosition?: number;
  yPosition?: number;
}

interface GraphLinkCore {
  id: string;
  source: string;
  target: string;
  type: string;
  weight: number;
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
  isRootDefinition?: boolean;
  difficulty?: number;
  status?: NodeStatus;
  isDue?: boolean;
  daysUntilReview?: number | null;
  progress?: any;
  color?: string;
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
  nodeType: 'definition' | 'exercise';
  nodeName: string;
  metaId: number;
  version: DefinitionVersion | ExerciseVersion;
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

// ============================================================================
// HOOKS FOR TRUE STRUCTURE/METADATA SEPARATION
// ============================================================================

// Only tracks true structural changes (topology)
const useGraphStructure = (
  definitions: Record<string, Definition>,
  exercises: Record<string, Exercise>,
  mode: AppMode
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
    
    // FIX: robust version
    const version = hashString([defStructureHash, exStructureHash, defWeightHash, exWeightHash, mode].join('::'));

    // PASS 1: Build nodes for all definitions (structure only)
    Object.values(definitions).forEach(def => {
      if (!def?.code) return;
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

    // Build exercise nodes (pass 1) and links (pass 2) in practice/frenzy mode
    if (mode !== 'study') {
      // PASS 1: create all exercise nodes first so cross-exercise links can attach regardless of iteration order
      Object.values(exercises).forEach(ex => {
        if (!ex?.code) return;
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
    }

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
    mode,
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
  ]);
};

// Tracks all metadata including names
const useGraphMetadata = (
  structureNodes: Map<string, GraphNodeCore>,
  definitions: Record<string, Definition>,
  exercises: Record<string, Exercise>,
  srs: any,
  codeToNumericIdMap: Map<string, number>,
  activeNodeIds: Set<string>,
  selectedNodeIds: Set<string>,
  highlightNodes: Set<string>
): GraphMetadataState => {
  return useMemo(() => {
    const nodeMetadata = new Map<string, NodeMetadata>();
    const linkMetadata = new Map<string, LinkMetadata>();

    // Build metadata for each node
    structureNodes.forEach((nodeCore, nodeId) => {
      const numericId = codeToNumericIdMap.get(nodeId);
      const progress = numericId ? srs.getNodeProgress(numericId, nodeCore.type) : null;
      
      // Get full node data to access metadata properties
      const fullNodeData = definitions[nodeId] || exercises[nodeId];

      // Fallbacks (critical fix): even if full data isn't present yet,
      // produce minimal metadata so the node isn't dropped.
      const isDefinition = nodeCore.type === 'definition';
      const isRoot = (nodeCore.prerequisites || []).length === 0;
      const baseColor = isDefinition ? (isRoot ? '#28a745' : '#007bff') : '#9ccc65';
      const srsColor = progress?.status ? getStatusColor(progress.status) : baseColor;

      nodeMetadata.set(nodeId, {
        name: fullNodeData?.name ?? nodeId,
        isRootDefinition: isDefinition ? isRoot : undefined,
        difficulty: !isDefinition ? ((fullNodeData as ApiExercise | undefined)?.difficulty) : undefined,
        status: (progress?.status as NodeStatus) || 'fresh',
        isDue: progress ? isNodeDue(progress.nextReview) : false,
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
    // IMPORTANT: Recompute when the set of structure nodes changes (e.g., switching to practice mode)
    // This ensures newly materialized exercise nodes receive proper SRS-driven colors instead of gray fallbacks.
    (() => Array.from(structureNodes.keys()).sort().join('|'))(),
    // active/selected/highlight removed to avoid hover-triggered reflow
    codeToNumericIdMap,
    // Track name and other metadata changes
    Object.values(definitions).map(d => d.name).join('|'),
    Object.values(exercises).map(e => e.name).join('|'),
    Object.values(exercises).map(e => String(e.difficulty ?? '')).join('|'),
    // Track positions so we can apply them without a physics reset
    Object.values(definitions).map(d => `${d.code}:${d.xPosition ?? ''}:${d.yPosition ?? ''}`).join('|'),
    Object.values(exercises).map(e => `${e.code}:${e.xPosition ?? ''}:${e.yPosition ?? ''}`).join('|'),
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
      prevLinkIndex.set(`${sid}-${tid}`, i);
    }

    const seen = new Set<string>();
    let addedLinks = 0;
    let removedLinks = 0;

    structure.links.forEach(lc => {
      const id = `${lc.source}-${lc.target}`;
      seen.add(id);
      const idx = prevLinkIndex.get(id);
      if (idx === undefined) {
        prevLinks.push({ source: lc.source, target: lc.target, type: lc.type, weight: lc.weight });
        addedLinks++;
      } else {
        const existing = prevLinks[idx] as any;
        if (existing.weight !== lc.weight) existing.weight = lc.weight;
      }
    });

    for (let i = prevLinks.length - 1; i >= 0; i--) {
      const l = prevLinks[i];
      const sid = typeof l.source === 'object' ? (l.source as any).id : String(l.source);
      const tid = typeof l.target === 'object' ? (l.target as any).id : String(l.target);
      const id = `${sid}-${tid}`;
      if (!seen.has(id)) {
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
  const graphRef = useRef<any>(null);
  const positionManagerRef = useRef(new PositionManager());

  // Core state
  const [mode, setMode] = useState<AppMode>('study');
  const [isProcessingData, setIsProcessingData] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // UI state
  const [showLeftPanel, setShowLeftPanel] = useState(false);
  const [labelDisplayMode, setLabelDisplayMode] = useState<LabelDisplayMode>('names');

  // Multi-selection state
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());

  // Interactive state
  const [highlightNodes, setHighlightNodes] = useState(new Set<string>());
  const [highlightLinks, setHighlightLinks] = useState(new Set<string>());
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredNodeType, setFilteredNodeType] = useState<FilteredNodeType>('all');

  // Data state
  const [currentStructuralGraphData, setCurrentStructuralGraphData] = useState(initialGraphData);
  const [codeToNumericIdMap, setCodeToNumericIdMap] = useState<Map<string, number>>(new Map());
  const [nodeDataCache, setNodeDataCache] = useState<Map<string, ApiDefinition | ApiExercise>>(new Map());

  // Modal and form state
  const [showNodeCreationModal, setShowNodeCreationModal] = useState(false);
  const [nodeCreationType, setNodeCreationType] = useState<'definition' | 'exercise'>('definition');
  const [nodeCreationPosition, setNodeCreationPosition] = useState<{x: number, y: number} | undefined>(undefined);
  const [showEnrollmentModal, setShowEnrollmentModal] = useState(false);

  // Domain state
  const [domainName, setDomainName] = useState<string>(subjectMatterId);
  const [domainData, setDomainData] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const isDomainOwner = !!(currentUser && domainData && domainData.ownerId === currentUser.id);

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
  const [frenzyPrerequisiteMap, setFrenzyPrerequisiteMap] = useState<Map<string, NodePrerequisite>>(new Map());
  const [lastDeletedNode, setLastDeletedNode] = useState<FrenzyDeletedNodeSnapshot | null>(null);

  const frenzyAutoContentRef = useRef<Map<string, string>>(new Map());
  const frenzyAutoPromptRef = useRef<Map<string, string>>(new Map());
  const frenzyClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frenzyLastClickRef = useRef<{ id: string; ts: number } | null>(null);
  const [frenzyNotePosition, setFrenzyNotePosition] = useState<{ x: number; y: number }>({ x: 240, y: 80 });
  const [isDraggingFrenzyNote, setIsDraggingFrenzyNote] = useState(false);
  const frenzyNoteDragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const frenzyPromptImageInputRef = useRef<HTMLInputElement | null>(null);
  const frenzyContentImageInputRef = useRef<HTMLInputElement | null>(null);
  const frenzySolutionImageInputRef = useRef<HTMLInputElement | null>(null);

  // Refs for stable callbacks
  const isInitializedRef = useRef<boolean>(false);
  const pendingFocusNodeIdRef = useRef<string | null>(null);

  // Build graph using architecture with true structure/metadata separation
  const graphStructure = useGraphStructure(
    currentStructuralGraphData.definitions || {},
    currentStructuralGraphData.exercises || {},
    mode
  );

  // Active node IDs from open detail windows
  const activeNodeIds = useMemo(() =>
    new Set(
      ui.state.windows
        .filter(w => w.type === 'detail' && !w.isMinimized)
        .map(w => w.contentProps.nodeData.id)
    ),
    [ui.state.windows]
  );

  // Metadata hook tracks names and visual properties
  const graphMetadata = useGraphMetadata(
    graphStructure.nodes,
    currentStructuralGraphData.definitions || {},
    currentStructuralGraphData.exercises || {},
    srs,
    codeToNumericIdMap,
    activeNodeIds,
    selectedNodeIds,
    highlightNodes
  );

  // Stable graph correctly handles structure vs metadata updates
  const stableGraph = useStableGraph(graphStructure, graphMetadata, positionManagerRef.current);

  const graphHighlightedNodes = useMemo(() => {
    const combined = new Set<string>();
    
    activeNodeIds.forEach(id => combined.add(id));
    selectedNodeIds.forEach(id => combined.add(id));
    highlightNodes.forEach(id => combined.add(id));
    if (pendingLinkSourceId) combined.add(pendingLinkSourceId);
    
    return combined;
  }, [activeNodeIds, selectedNodeIds, highlightNodes, pendingLinkSourceId]);

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

  // Load comprehensive domain data
  const loadComprehensiveDomainData = useCallback(async (domainId: number) => {
    try {
      console.log("Loading comprehensive domain data for:", domainId);

      const [allMetaDefinitions, allMetaExercises] = await Promise.all([
        // Use meta-definitions (concept pools) as definition nodes in the graph
        getDomainMetaDefinitions(domainId).catch(err => { console.warn("Failed to load meta-definitions:", err); return []; }),
        // Use meta-exercises (pools) as exercise nodes in the graph
        getDomainMetaExercises(domainId).catch(err => { console.warn("Failed to load meta-exercises:", err); return []; })
      ]);

      const newCodeToNumericIdMap = new Map<string, number>();
      const newNodeDataCache = new Map<string, MetaDefinition | any>();

      allMetaDefinitions.forEach(metaDef => {
        if (metaDef?.code && typeof metaDef.id === 'number') {
          newCodeToNumericIdMap.set(metaDef.code, metaDef.id);
          newNodeDataCache.set(metaDef.code, metaDef);
        }
      });

      (allMetaExercises as any[]).forEach((ex: any) => {
        if (ex?.code && typeof ex.id === 'number') {
          newCodeToNumericIdMap.set(ex.code, ex.id);
          newNodeDataCache.set(ex.code, ex);
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
      
      setCodeToNumericIdMap(newCodeToNumericIdMap);
      setNodeDataCache(newNodeDataCache);
      setCurrentStructuralGraphData({ definitions: newDefinitions, exercises: newExercises });

      // If the domain loads successfully but has no nodes,
      // stop showing the processing spinner so we can render an empty state.
      const isEmptyDomain = Object.keys(newDefinitions).length === 0 && Object.keys(newExercises).length === 0;
      if (isEmptyDomain) {
        setIsProcessingData(false);
      }
      
    } catch (error) {
      console.error("Error loading comprehensive domain data:", error);
      showToast("Failed to load complete domain data.", "error");
      setCurrentStructuralGraphData({ definitions: {}, exercises: {} });
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

  // Handle node drag end with position manager
  const handleNodeDragEnd = useCallback((node: GraphNode) => {
    if (node?.id && typeof node.x === 'number' && typeof node.y === 'number') {
      positionManagerRef.current.fixPosition(node.id, node.x, node.y);
      setPositionsChanged(true);
      (node as any).fx = node.x;
      (node as any).fy = node.y;
    }
  }, []);

  // Enhanced engine stop handler with initial zoom
  const handleEngineStop = useCallback(() => {
    positionManagerRef.current.markStable();
    
    if (isProcessingData && graphRef.current && stableGraph.nodes.length > 0) {
      setTimeout(() => {
        graphRef.current?.zoomToFit?.(400, 50);
        console.log('Initial zoom-to-fit applied');
      }, 100);
    }
  }, [isProcessingData, stableGraph.nodes.length]);

  // Handle node click
  const handleNodeClick = useCallback(async (nodeOnClick: GraphNode, isRefresh: boolean = false, context: 'click' | 'study' | 'navigation' = 'click') => {
    if (!nodeOnClick?.id) return;
    if (mode === 'frenzy' && isFrenzyEditMode) return;

    const position = {
      x: typeof window !== 'undefined' ? window.innerWidth - 500 : 800,
      y: 100 + (ui.state.windows.filter(w => w.type === 'detail').length * 30)
    };

    ui.openDetailWindow(nodeOnClick.id, nodeOnClick, position);
  }, [ui, mode, isFrenzyEditMode]);
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
      stableGraph.links.forEach(link => {
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
  }, [stableGraph.links]);

  // ======= Surgical create: insert new node without full rerender & keep pan =======

  // Compute spawn near neighbors or viewport center
  const computeSpawnPosition = useCallback((created: Partial<ApiDefinition & ApiExercise>) => {
    const neighbors = new Set<string>([...(created.prerequisites || [])]);
    let spawn = nodeCreationPosition;
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
    if (!spawn) {
      try {
        if (graphRef.current?.canvas) {
          const rect = graphRef.current.canvas().getBoundingClientRect();
          const center = graphRef.current.screen2GraphCoords(rect.width / 2, rect.height / 2);
          spawn = { x: center.x, y: center.y };
        }
      } catch {}
    }
    if (!spawn) spawn = { x: 0, y: 0 };
    return { x: spawn.x + (Math.random() - 0.5) * 40, y: spawn.y + (Math.random() - 0.5) * 40 };
  }, [nodeCreationPosition, stableGraph.nodes]);

  // Create new node with enhanced positioning
  const createNewNode = useCallback((type: 'definition' | 'exercise') => {
    if (!hasAccess) {
      if (domainData && domainData.privacy === 'public') {
        setShowEnrollmentModal(true);
      }
      return;
    }

    let position: {x: number, y: number} = { x: 0, y: 0 };
    if (graphRef.current?.canvas) {
      try {
        const rect = graphRef.current.canvas().getBoundingClientRect();
        const centerScreenX = rect.width / 2;
        const centerScreenY = rect.height / 2;
        const centerGraphCoords = graphRef.current.screen2GraphCoords(centerScreenX, centerScreenY);
        position = { 
          x: centerGraphCoords.x + (Math.random() - 0.5) * 50, 
          y: centerGraphCoords.y + (Math.random() - 0.5) * 50 
        };
      } catch(e) { 
        console.warn("Could not get graph center for new node.", e); 
      }
    }
    
    setNodeCreationType(type);
    setNodeCreationPosition(position);
    setShowNodeCreationModal(true);
  }, [hasAccess, domainData]);

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
    }
  }, [mode, stableGraph.nodes]);

  // Filtered nodes for left panel
  const filteredGraphNodes = useMemo(() => {
    let tempNodes = [...stableGraph.nodes];
    if (filteredNodeType !== 'all') {
      tempNodes = tempNodes.filter(node => node.type === filteredNodeType);
    }
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      tempNodes = tempNodes.filter(node =>
        node.id.toLowerCase().includes(lowerQuery) || 
        node.name.toLowerCase().includes(lowerQuery)
      );
    }
    return tempNodes.sort((a, b) => a.id.localeCompare(b.id));
  }, [stableGraph.nodes, filteredNodeType, searchQuery, srs.state.lastUpdated]);

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
      .filter(node => node.type === 'definition')
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
    return codes;
  }, [currentStructuralGraphData.definitions, currentStructuralGraphData.exercises]);

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

  const getGraphCenter = useCallback(() => {
    let position = { x: 0, y: 0 };
    if (graphRef.current?.canvas) {
      try {
        const rect = graphRef.current.canvas().getBoundingClientRect();
        const centerScreenX = rect.width / 2;
        const centerScreenY = rect.height / 2;
        const centerGraphCoords = graphRef.current.screen2GraphCoords(centerScreenX, centerScreenY);
        position = { x: centerGraphCoords.x, y: centerGraphCoords.y };
      } catch (e) {
        console.warn("Could not get graph center.", e);
      }
    }
    return position;
  }, []);

  const getMetaNodeType = useCallback((nodeType: 'definition' | 'exercise') => (
    nodeType === 'definition' ? 'meta_definition' : 'meta_exercise'
  ), []);

  const getDefaultFrenzyContent = useCallback((nodeType: 'definition' | 'exercise', nodeName: string) => {
    const safeName = nodeName || 'this node';
    return nodeType === 'definition'
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
    if (!isDomainOwner) {
      showToast('Only domain owners can edit nodes.', 'warning');
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
    }
    setIsFrenzyEditMode(prev => !prev);
  }, [isDomainOwner, isFrenzyEditMode, loadFrenzyPrerequisites, ui]);

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

      if (isDefinitionTarget) next.definitions = collection;
      else next.exercises = collection;
      return next;
    });
  }, []);

  const addFrenzyPrerequisite = useCallback(async (source: GraphNode, target: GraphNode) => {
    if (target.type === 'definition' && source.type !== 'definition') {
      showToast('Definitions can only depend on definitions.', 'warning');
      return;
    }
    const sourceId = codeToNumericIdMap.get(source.id);
    const targetId = codeToNumericIdMap.get(target.id);
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
  }, [codeToNumericIdMap, frenzyPrerequisiteMap, getMetaNodeType, applyPrerequisiteUpdate]);

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

  const openFrenzyNote = useCallback(async (node: GraphNode, metaIdOverride?: number) => {
    if (!isDomainOwner) {
      showToast('Only domain owners can edit nodes.', 'warning');
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
      const version = versions[0];
      if (!version) {
        showToast('No version content found for this node.', 'warning');
        return;
      }

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
      setFrenzyNote({
        nodeId: resolvedCode,
        nodeType: node.type,
        nodeName: resolvedName,
        metaId,
        version,
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
    } catch (error) {
      console.error('Failed to load frenzy note:', error);
      showToast('Failed to load node content.', 'error');
    }
  }, [isDomainOwner, codeToNumericIdMap, getDefaultFrenzyContent, getDefaultFrenzyPrompt]);

  const createFrenzyNode = useCallback(async (type: 'definition' | 'exercise') => {
    if (!isDomainOwner) {
      showToast('Only domain owners can create nodes.', 'warning');
      return;
    }
    const domainId = parseInt(subjectMatterId, 10);
    if (isNaN(domainId)) {
      showToast('Invalid domain.', 'error');
      return;
    }

    const code = type === 'exercise' ? getNextExerciseCode() : getNextDotCode();
    const name = type === 'definition' ? `Concept ${code}` : `Exercise ${code}`;
    const center = getGraphCenter();
    const spawn = {
      x: center.x + (Math.random() - 0.5) * 40,
      y: center.y + (Math.random() - 0.5) * 40,
    };

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
        if (isFrenzyEditMode) {
          openFrenzyNote({ id: code, name, type: 'definition' } as GraphNode, (created as any).id);
        }
      } else {
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
        if (isFrenzyEditMode) {
          openFrenzyNote({ id: code, name, type: 'exercise' } as GraphNode, (created as any).id);
        }
      }
      showToast(`${type === 'definition' ? 'Definition' : 'Exercise'} "${code}" created.`, 'success');
    } catch (error) {
      console.error('Failed to create frenzy node:', error);
      showToast('Failed to create node.', 'error');
    }
  }, [
    isDomainOwner,
    subjectMatterId,
    getNextDotCode,
    getNextExerciseCode,
    getGraphCenter,
    getDefaultFrenzyContent,
    getDefaultFrenzyPrompt,
    insertCreatedNode,
    isFrenzyEditMode,
    openFrenzyNote,
  ]);

  const saveFrenzyNote = useCallback(async (draftOverride?: string) => {
    if (!frenzyNote) return;
    const draft = draftOverride ?? frenzyNoteDraft;
    const nameDraft = frenzyNoteNameDraft.trim();
    const codeDraft = frenzyNoteCodeDraft.trim();
    const isDefinition = frenzyNote.nodeType === 'definition';
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
    isFrenzyEditMode,
    loadFrenzyPrerequisites,
    refreshGraphAndSRSData,
    updateMetaDefinition,
    updateMetaDefinitionVersion,
    updateMetaExercise,
    updateMetaExerciseVersion,
    existingCodes,
  ]);

  const uploadFrenzyImage = useCallback(async (file: File, target: 'prompt' | 'content' | 'solution') => {
    if (!frenzyNote) return;
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
    setIsDraggingFrenzyNote(false);
  }, [saveFrenzyNote]);

  const getNodeTypeByCode = useCallback((code: string) => {
    if (currentStructuralGraphData.definitions?.[code]) return 'definition';
    if (currentStructuralGraphData.exercises?.[code]) return 'exercise';
    return null;
  }, [currentStructuralGraphData]);

  const deleteFrenzyNode = useCallback(async (node: GraphNode) => {
    if (!isDomainOwner) {
      showToast('Only domain owners can delete nodes.', 'warning');
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
          exercises: { ...(prev.exercises || {}) }
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
    } catch (error) {
      console.error('Failed to delete node:', error);
      showToast('Failed to delete node.', 'error');
    }
  }, [
    isDomainOwner,
    codeToNumericIdMap,
    currentStructuralGraphData,
    pendingLinkSourceId,
    frenzyNote,
  ]);

  const undoFrenzyDelete = useCallback(async () => {
    if (!lastDeletedNode) return;
    if (!isDomainOwner) {
      showToast('Only domain owners can restore nodes.', 'warning');
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
    } catch (error) {
      console.error('Failed to restore node:', error);
      showToast('Failed to restore node.', 'error');
    }
  }, [
    lastDeletedNode,
    isDomainOwner,
    subjectMatterId,
    getGraphCenter,
    insertCreatedNode,
    codeToNumericIdMap,
    getMetaNodeType,
    getNodeTypeByCode,
    applyPrerequisiteUpdate,
    loadFrenzyPrerequisites,
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
      if (frenzyTool === 'link') {
        await addFrenzyPrerequisite(sourceNode, node);
      } else {
        await removeFrenzyPrerequisite(sourceNode.id, node.id);
      }
    }
  }, [
    frenzyTool,
    pendingLinkSourceId,
    stableGraph.nodes,
    addFrenzyPrerequisite,
    removeFrenzyPrerequisite,
    deleteFrenzyNode,
  ]);

  const handleGraphNodeClick = useCallback((node: GraphNode) => {
    if (mode === 'frenzy' && isFrenzyEditMode) {
      const now = Date.now();
      const last = frenzyLastClickRef.current;
      if (last && last.id === node.id && now - last.ts < 260) {
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
      frenzyClickTimerRef.current = setTimeout(() => {
        frenzyLastClickRef.current = null;
        handleFrenzyNodeAction(node);
      }, 270);
      return;
    }
    handleNodeClick(node, false, 'click');
  }, [mode, isFrenzyEditMode, openFrenzyNote, handleFrenzyNodeAction, handleNodeClick]);

  const handleGraphLinkClick = useCallback((link: GraphLink) => {
    if (!(mode === 'frenzy' && isFrenzyEditMode && frenzyTool === 'unlink')) return;
    const sourceId = typeof link.source === 'object' ? (link.source as GraphNode).id : String(link.source);
    const targetId = typeof link.target === 'object' ? (link.target as GraphNode).id : String(link.target);
    if (!sourceId || !targetId) return;
    removeFrenzyPrerequisite(sourceId, targetId);
  }, [mode, isFrenzyEditMode, frenzyTool, removeFrenzyPrerequisite]);

  const handleGraphBackgroundClick = useCallback(() => {
    if (mode === 'frenzy' && isFrenzyEditMode) {
      setPendingLinkSourceId(null);
      if (frenzyClickTimerRef.current) {
        clearTimeout(frenzyClickTimerRef.current);
        frenzyClickTimerRef.current = null;
      }
    }
  }, [mode, isFrenzyEditMode]);

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
      
      for (const [nodeCode, position] of allPositions.entries()) {
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
        />

        <EnrollmentModal
          isOpen={showEnrollmentModal}
          onClose={() => setShowEnrollmentModal(false)}
          domain={domainData}
          onEnrollmentSuccess={handleEnrollment}
          onContinueWithoutEnrollment={handleContinueWithoutEnrollment}
        />

        {/* Top Controls */}
        <TopControls
          subjectMatterId={domainName}
          mode={mode}
          onModeChange={changeMode}
          onBack={onBack}
          labelDisplayMode={labelDisplayMode}
          onCycleLabelDisplay={cycleLabelDisplay}
          onZoomToFit={() => {
            if (graphRef.current) {
              graphRef.current.zoomToFit(400, 50);
            }
          }}
          onCreateDefinition={() => createNewNode('definition')}
          onCreateExercise={() => createNewNode('exercise')}
          onStartStudy={handleStartStudy}
          positionsChanged={positionsChanged}
          isSavingPositions={isSavingPositions}
          onSavePositions={savePositions}
          
          onEnroll={() => setShowEnrollmentModal(true)}
          currentDomainId={parseInt(subjectMatterId, 10)}
          currentDomainName={domainName}
          isOwner={currentUser && domainData && domainData.ownerId === currentUser.id}
          isEnrolled={hasAccess ?? undefined}
          onDataImported={refreshGraphAndSRSData}
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
          <div className="flex-1 bg-gray-50 overflow-hidden relative">
            {isRefreshing ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                Loading graph data... <RefreshCw className="ml-2 animate-spin" size={18} />
              </div>
            ) : (isProcessingData && stableGraph.nodes.length === 0) ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-gray-600">
                <p className="text-lg">This domain is empty.</p>
                <p className="mt-1 text-sm text-gray-500">Create your first definition or exercise to get started.</p>
                <div className="mt-4 flex items-center gap-2">
                  <Button onClick={() => createNewNode('definition')} size="sm">Create Definition</Button>
                  <Button onClick={() => createNewNode('exercise')} variant="outline" size="sm">Create Exercise</Button>
                </div>
              </div>
            ) : isProcessingData ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                Loading graph data... <RefreshCw className="ml-2 animate-spin" size={18} />
              </div>
            ) : stableGraph.nodes.length > 0 ? (
              <GraphContainer
                graphRef={graphRef}
                graphNodes={stableGraph.nodes}
                graphLinks={stableGraph.links}
                highlightNodes={graphHighlightedNodes}
                highlightLinks={highlightLinks}
                filteredNodeType={filteredNodeType}
                selectedNodeId={null}
                labelDisplayMode={labelDisplayMode}
                onNodeClick={handleGraphNodeClick}
                onNodeHover={handleNodeHover}
                onNodeDragEnd={handleNodeDragEnd}
                onLinkClick={handleGraphLinkClick}
                onBackgroundClick={handleGraphBackgroundClick}
                onEngineStop={handleEngineStop}
                creditFlowAnimations={enhancedCreditFlowAnimations}
                requiresPhysicsReset={stableGraph.requiresPhysicsReset}
                structureVersion={stableGraph.structureVersion}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center text-gray-600">
                <p className="text-lg">No graph data to display for this domain.</p>
                <p className="mt-1 text-sm text-gray-500">Create your first definition or exercise to get started.</p>
                <div className="mt-4 flex items-center gap-2">
                  <Button onClick={() => createNewNode('definition')} size="sm">Create Definition</Button>
                  <Button onClick={() => createNewNode('exercise')} variant="outline" size="sm">Create Exercise</Button>
                </div>
                <Button onClick={refreshGraphAndSRSData} variant="ghost" size="sm" className="mt-3">
                  <RefreshCw size={14} className="mr-1.5" /> Refresh
                </Button>
              </div>
            )}
            
            {!isProcessingData && !isRefreshing && stableGraph.nodes.length > 0 && (
              <GraphLegend mode={mode} hasExercises={stableGraph.nodes.some(n => n.type === 'exercise')} />
            )}

            {mode === 'frenzy' && (
              <div className="absolute top-14 left-3 z-30 flex flex-col items-start gap-2">
                <Button
                  variant={isFrenzyEditMode ? 'default' : 'outline'}
                  size="sm"
                  onClick={toggleFrenzyEditMode}
                  disabled={!isDomainOwner}
                  title={isDomainOwner ? 'Toggle edit tools' : 'Only domain owners can edit'}
                  className="h-8 px-3"
                >
                  {isFrenzyEditMode ? 'Editing' : 'Edit'}
                </Button>

                {isFrenzyEditMode && (
                  <div className="bg-white/95 border border-gray-200 rounded-md shadow-lg p-3 w-60">
                    <div className="text-xs text-gray-500 mb-2">Frenzy tools</div>
                    <div className="flex items-center gap-2 mb-2">
                      <Button size="sm" variant="outline" onClick={() => createFrenzyNode('definition')}>
                        New
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => createFrenzyNode('exercise')}>
                        Exercise
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <Button
                        size="sm"
                        variant={frenzyTool === 'link' ? 'default' : 'outline'}
                        onClick={() => setFrenzyTool('link')}
                      >
                        Link
                      </Button>
                      <Button
                        size="sm"
                        variant={frenzyTool === 'unlink' ? 'default' : 'outline'}
                        onClick={() => setFrenzyTool('unlink')}
                      >
                        Unlink
                      </Button>
                      <Button
                        size="sm"
                        variant={frenzyTool === 'delete' ? 'destructive' : 'outline'}
                        onClick={() => setFrenzyTool('delete')}
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
                      Double-click a node to edit its content.
                    </div>
                  </div>
                )}
              </div>
            )}

            {frenzyNote && (
              <div
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
                <div className="mt-2">
                  <div className="mb-2">
                    <label className="block text-xs text-yellow-800 mb-1">Code</label>
                    <input
                      value={frenzyNoteCodeDraft}
                      onChange={(e) => setFrenzyNoteCodeDraft(e.target.value)}
                      onBlur={() => saveFrenzyNote()}
                      className={`w-full bg-yellow-50 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 ${
                        frenzyCodeConflict
                          ? 'border-red-400 focus:ring-red-200 text-red-700'
                          : 'border-yellow-200 focus:ring-yellow-300 text-gray-800'
                      }`}
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
                      className="w-full bg-yellow-50 border border-yellow-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 text-gray-800"
                    />
                  </div>
                  {frenzyNote.nodeType === 'definition' && (
                    <div className="mb-2">
                      <label className="block text-xs text-yellow-800 mb-1">Review Prompt</label>
                      <input
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
                        className={`w-full bg-yellow-50 border border-yellow-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300 ${
                          frenzyNote.isAutoPrompt && frenzyNotePromptDraft === frenzyNote.defaultPrompt ? 'text-gray-500' : 'text-gray-800'
                        }`}
                      />
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
                      {frenzyNote.nodeType === 'definition' ? 'Definition' : 'Statement'}
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
                />
              )}
              {window.type === 'review' && (
                <ReviewWindowContent
                  domainId={parseInt(subjectMatterId, 10)}
                  onNavigateToNode={navigateToNodeById}
                  windowId={window.id}
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
