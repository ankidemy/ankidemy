// client/src/app/components/Graph/KnowledgeGraph.tsx

"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo, FC } from 'react';
import { MathJaxProvider } from '@/app/components/core/MathJaxWrapper';
import { UIProvider, useUI } from '@/contexts/UIContext';
import { DraggableWindow } from '@/app/components/core/DraggableWindow';
import { DetailWindowContent } from './windows/DetailWindowContent';
import { ReviewWindowContent } from './windows/ReviewWindowContent';
import { RefreshCw } from 'lucide-react';
import { Button } from "@/app/components/core/button";
import {
  getDefinitionByCode,
  getExerciseByCode,
  updateDefinition,
  updateExercise,
  Definition as ApiDefinition,
  Exercise as ApiExercise,
  getDomainDefinitions,
  getDomainExercises,
  getDomain,
  enrollInDomain,
  getEnrolledDomains,
  getCurrentUser,
  User,
} from '@/lib/api';
import { useSRS } from '../../../contexts/SRSContext';
import { getStatusColor, isNodeDue, calculateDaysUntilReview } from '../../../lib/srs-api';
import { NodeStatus } from '../../../types/srs';

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
import TopControls from './panels/TopControls';
import LeftPanelToggle from './panels/LeftPanelToggle';
import LeftPanel from './panels/LeftPanel';
import NodeCreationModal from './NodeCreationModal';
import { showToast } from '@/app/components/core/ToastNotification';
import EnrollmentModal from './EnrollmentModal';
import { PositionManager } from './utils/PositionManager';

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
    
    // FIX: robust version
    const version = hashString([defStructureHash, exStructureHash, mode].join('::'));

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

    // Build nodes from exercises (only in practice mode)
    if (mode === 'practice') {
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

        // Create links from prerequisites to exercises
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
    // Track weight changes without triggering physics reset (version unaffected)
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
        difficulty: !isDefinition ? (fullNodeData?.difficulty as number | undefined) : undefined,
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
    Array.from(activeNodeIds).sort().join(','),
    Array.from(selectedNodeIds).sort().join(','),
    Array.from(highlightNodes).sort().join(','),
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

  return useMemo(() => {
    const structureChanged = structure.version !== lastStructureVersionRef.current;
    
    if (structureChanged) {
      console.log('STRUCTURE CHANGED: Rebuilding nodes/links with physics reset');
      
      // Extract positions from old nodes before rebuilding
      if (stableNodesRef.current.length > 0) {
        positionManager.extractPositions(stableNodesRef.current);
      }
      
      // Build new nodes array from structure + metadata
      const newNodes: GraphNode[] = [];
      const newLinks: GraphLink[] = [];

      structure.nodes.forEach((nodeCore, nodeId) => {
        const nodeMeta = metadata.nodeMetadata.get(nodeId);
        // nodeMeta should always exist now due to fallback in useGraphMetadata
        const mergedNode: GraphNode = {
          ...nodeCore,
          ...(nodeMeta || { name: nodeId, status: 'fresh' as NodeStatus, color: '#999' }),
          // Set initial position from database
          x: nodeCore.xPosition,
          y: nodeCore.yPosition,
        };
        newNodes.push(mergedNode);
      });

      // Build links
      structure.links.forEach(linkCore => {
        newLinks.push({
          source: linkCore.source,
          target: linkCore.target,
          type: linkCore.type,
          weight: linkCore.weight,
        });
      });

      // Apply saved positions to new nodes
      positionManager.applyPositions(newNodes);
      
      stableNodesRef.current = newNodes;
      stableLinksRef.current = newLinks;
      lastStructureVersionRef.current = structure.version;
      
      positionManager.markUnstable();
    } else {
      // Only metadata changed - update in place to preserve physics
      console.log('METADATA ONLY: Updating node properties in-place');
      stableNodesRef.current.forEach(node => {
        const nodeMeta = metadata.nodeMetadata.get(node.id);
        if (nodeMeta) {
          Object.assign(node, nodeMeta);
        }
        // Do not alter x/y or fx/fy here to avoid reheating/drift on hover
      });
      // Sync link weights/opacities without rebuilding links
      const linkCoreById = new Map<string, GraphLinkCore>();
      structure.links.forEach(lc => linkCoreById.set(`${lc.source}-${lc.target}`, lc));
      stableLinksRef.current.forEach(link => {
        const sourceId = typeof link.source === 'object' ? (link.source as any).id : String(link.source);
        const targetId = typeof link.target === 'object' ? (link.target as any).id : String(link.target);
        const id = `${sourceId}-${targetId}`;
        const core = linkCoreById.get(id);
        if (core && core.weight !== link.weight) {
          (link as any).weight = core.weight;
        }
      });
    }

    return {
      nodes: stableNodesRef.current,
      links: stableLinksRef.current,
      requiresPhysicsReset: structureChanged,
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
  const [isEnrolled, setIsEnrolled] = useState<boolean | null>(null);

  // Position saving
  const [positionsChanged, setPositionsChanged] = useState(false);
  const [isSavingPositions, setIsSavingPositions] = useState(false);

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
    
    return combined;
  }, [activeNodeIds, selectedNodeIds, highlightNodes]);

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

  // Handle initial data processing
  useEffect(() => {
    if (stableGraph.nodes.length > 0 && isProcessingData) {
      const timer = setTimeout(() => {
        setIsProcessingData(false);
        console.log('Initial graph processing complete');
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [stableGraph.nodes.length, isProcessingData]);

  // Load comprehensive domain data
  const loadComprehensiveDomainData = useCallback(async (domainId: number) => {
    try {
      console.log("Loading comprehensive domain data for:", domainId);
      
      const [allDefinitions, allExercises] = await Promise.all([
        getDomainDefinitions(domainId).catch(err => { console.warn("Failed to load definitions:", err); return []; }),
        getDomainExercises(domainId).catch(err => { console.warn("Failed to load exercises:", err); return []; })
      ]);
      
      const newCodeToNumericIdMap = new Map<string, number>();
      const newNodeDataCache = new Map<string, ApiDefinition | ApiExercise>();
      
      allDefinitions.forEach(def => {
        if (def?.code && typeof def.id === 'number') {
          newCodeToNumericIdMap.set(def.code, def.id);
          newNodeDataCache.set(def.code, def);
        }
      });
      
      allExercises.forEach(ex => {
        if (ex?.code && typeof ex.id === 'number') {
          newCodeToNumericIdMap.set(ex.code, ex.id);
          newNodeDataCache.set(ex.code, ex);
        }
      });
      
      const newDefinitions: Record<string, Definition> = {};
      const newExercises: Record<string, Exercise> = {};
      
      allDefinitions.forEach(def => {
        newDefinitions[def.code] = { 
          ...def, 
          type: 'definition',
          prerequisiteWeights: def.prerequisiteWeights || 
            (def.prerequisites ? Object.fromEntries(def.prerequisites.map(p => [p, 1.0])) : {})
        };
      });
      
      allExercises.forEach(ex => {
        newExercises[ex.code] = { 
          ...ex, 
          type: 'exercise',
          prerequisiteWeights: ex.prerequisiteWeights || 
            (ex.prerequisites ? Object.fromEntries(ex.prerequisites.map(p => [p, 1.0])) : {})
        };
      });
      
      setCodeToNumericIdMap(newCodeToNumericIdMap);
      setNodeDataCache(newNodeDataCache);
      setCurrentStructuralGraphData({ definitions: newDefinitions, exercises: newExercises });
      
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

  // Initialize domain data
  useEffect(() => {
    const domainId = parseInt(subjectMatterId, 10);
    if (!isNaN(domainId)) {
      loadComprehensiveDomainData(domainId);
    }
  }, [subjectMatterId, loadComprehensiveDomainData]);

  // Check enrollment status
  useEffect(() => {
    const checkUserAndEnrollment = async () => {
      if (!subjectMatterId || isNaN(parseInt(subjectMatterId))) return;
      
      const domainId = parseInt(subjectMatterId);
      
      try {
        const user = await getCurrentUser();
        setCurrentUser(user);
        
        const domain = await getDomain(domainId);
        setDomainData(domain);
        setDomainName(domain.name);
        
        const userOwnsThisDomain = domain.ownerId === user.ID;
        
        if (userOwnsThisDomain) {
          setIsEnrolled(true);
          if (!isInitializedRef.current) {
            srs.setCurrentDomain(domainId);
            isInitializedRef.current = true;
          }
        } else {
          const enrolledDomains = await getEnrolledDomains();
          const isUserEnrolled = enrolledDomains.some((d: any) => d.id === domainId);
          setIsEnrolled(isUserEnrolled);
          
          if (isUserEnrolled) {
            if (!isInitializedRef.current) {
              srs.setCurrentDomain(domainId);
              isInitializedRef.current = true;
            }
          } else if (domain.privacy === 'public') {
            setTimeout(() => {
              if (!isEnrolled) setShowEnrollmentModal(true);
            }, 1500);
          }
        }
      } catch (error) {
        console.error("Error checking enrollment status:", error);
      }
    };
    
    checkUserAndEnrollment();
  }, [subjectMatterId, srs, isEnrolled]);

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

    const position = {
      x: typeof window !== 'undefined' ? window.innerWidth - 500 : 800,
      y: 100 + (ui.state.windows.filter(w => w.type === 'detail').length * 30)
    };

    ui.openDetailWindow(nodeOnClick.id, nodeOnClick, position);
  }, [ui]);

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
    if (!isEnrolled) {
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
  }, [isEnrolled, domainData]);

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
          ? await getDefinitionByCode(nodeCode) 
          : await getExerciseByCode(nodeCode);
        // Some APIs return arrays; normalize
        createdData = Array.isArray(raw) ? raw[0] : raw;
      } catch (e) {
        console.warn('Could not fetch created node details, using minimal payload.', e);
      }
    }

    // Normalize payload to guarantee essential fields
    const payload: any = {
      ...(createdData || {}),
      code: (createdData && createdData.code) ? createdData.code : nodeCode,
      name: (createdData && createdData.name) ? createdData.name : nodeCode,
      prerequisites: (createdData && Array.isArray(createdData.prerequisites)) ? createdData.prerequisites : [],
      prerequisiteWeights: (createdData && createdData.prerequisiteWeights) ? createdData.prerequisiteWeights : {},
      type: nodeCreationType
    };

    // Decide spawn position and pin it so the view doesn't jump
    const spawn = computeSpawnPosition(payload);
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
  }, [nodeCreationType, computeSpawnPosition]);

  // After structure updates, focus newly created node once it materializes
  useEffect(() => {
    const pending = pendingFocusNodeIdRef.current;
    if (!pending) return;
    const node = stableGraph.nodes.find(n => n.id === pending);
    if (node) {
      handleNodeClick(node, false, 'navigation');
      pendingFocusNodeIdRef.current = null;
    }
  }, [stableGraph.nodes, handleNodeClick]);

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
      if (isEnrolled) {
        await srs.refreshDomainData();
      }
      
      showToast("Graph data refreshed!", "success");

    } catch (error) {
      console.error('Failed to refresh graph and SRS data:', error);
      showToast(error instanceof Error ? error.message : "Failed to refresh data.", "error");
    } finally {
      setIsRefreshing(false);
    }
  }, [subjectMatterId, loadComprehensiveDomainData, isEnrolled, srs, stableGraph.nodes]);
  
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
      setIsEnrolled(true);
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
    if (!isEnrolled) {
      if (domainData && domainData.privacy === 'public') {
        setShowEnrollmentModal(true);
      }
      return;
    }
    ui.openReviewWindow();
  }, [isEnrolled, domainData, ui]);

  // Navigation helpers
  const navigateToNodeById = useCallback((nodeId: string, context: 'navigation' | 'study' = 'navigation') => {
    const targetNode = stableGraph.nodes.find(n => n.id === nodeId);
    if (targetNode) {
      handleNodeClick(targetNode, false, context);
    } else if (mode === 'study' && currentStructuralGraphData.exercises?.[nodeId]) {
      showToast("Switching to Practice Mode to view exercise...", "info", 1500);
      changeMode('practice');
      setTimeout(() => {
        const exData = currentStructuralGraphData.exercises[nodeId];
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

  // Available definitions for modals
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

  // Clear animations after extended duration
  useEffect(() => {
    if (enhancedCreditFlowAnimations.length > 0) {
      const timer = setTimeout(() => {
        srs.clearError();
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [enhancedCreditFlowAnimations.length, srs]);

  return (
      <div className="h-full flex flex-col overflow-hidden bg-gray-100">
        {/* Modals */}
        <NodeCreationModal
          type={nodeCreationType}
          domainId={parseInt(subjectMatterId, 10)}
          isOpen={showNodeCreationModal}
          onClose={() => setShowNodeCreationModal(false)}
          onSuccess={handleNodeCreationSuccess}
          availablePrerequisites={availableDefinitionsForModals}
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
          isEnrolled={isEnrolled}
          onEnroll={() => setShowEnrollmentModal(true)}
          currentDomainId={parseInt(subjectMatterId, 10)}
          currentDomainName={domainName}
          isOwner={currentUser && domainData && domainData.ownerId === currentUser.ID}
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
            {(isProcessingData || isRefreshing) ? (
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
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
                onNodeDragEnd={handleNodeDragEnd}
                onEngineStop={handleEngineStop}
                creditFlowAnimations={enhancedCreditFlowAnimations}
                requiresPhysicsReset={stableGraph.requiresPhysicsReset}
                metadataVersion={graphMetadata.version.toString()}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <p>No graph data to display for this domain.</p>
                <Button onClick={refreshGraphAndSRSData} variant="outline" size="sm" className="mt-4">
                  <RefreshCw size={14} className="mr-1.5" /> Refresh Graph
                </Button>
              </div>
            )}
            
            {!isProcessingData && !isRefreshing && stableGraph.nodes.length > 0 && (
              <GraphLegend mode={mode} hasExercises={stableGraph.nodes.some(n => n.type === 'exercise')} />
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
