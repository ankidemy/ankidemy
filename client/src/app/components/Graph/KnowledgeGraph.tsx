// client/src/app/components/Graph/KnowledgeGraph.tsx
// Enhanced with proper multi-node selection and credit flow animations

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
import { NodeStatus, CreditFlowAnimation, ReviewRequest, Quality } from '../../../types/srs';

import {
  GraphNode,
  GraphLink,
  Definition,
  Exercise,
  AppMode,
  FilteredNodeType,
  KnowledgeGraphProps,
  AnswerFeedback,
} from './utils/types';
import GraphContainer, { LabelDisplayMode } from './utils/GraphContainer';
import GraphLegend from './utils/GraphLegend';
import TopControls from './panels/TopControls';
import LeftPanelToggle from './panels/LeftPanelToggle';
import LeftPanel from './panels/LeftPanel';
import NodeCreationModal from './NodeCreationModal';
import { showToast } from '@/app/components/core/ToastNotification';
import EnrollmentModal from './EnrollmentModal';

interface GraphStructureState {
  nodes: Map<string, GraphNodeCore>;
  links: Map<string, GraphLinkCore>;
  version: number;
  lastStructuralChange: number;
}

interface GraphNodeCore {
  id: string;
  name: string;
  type: 'definition' | 'exercise';
  isRootDefinition?: boolean;
  difficulty?: string;
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

interface GraphMetadataState {
  nodeMetadata: Map<string, NodeMetadata>;
  linkMetadata: Map<string, LinkMetadata>;
  version: number;
  lastMetadataChange: number;
}

interface NodeMetadata {
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

class PositionManager {
  private positions = new Map<string, { x: number; y: number; fx?: number; fy?: number }>();
  private isStable = false;
  private stabilityTimeout: NodeJS.Timeout | null = null;
  private callbacks: Array<() => void> = [];

  savePosition(nodeId: string, x: number, y: number, fixed: boolean = false) {
    const current = this.positions.get(nodeId) || {};
    this.positions.set(nodeId, {
      ...current,
      x,
      y,
      fx: fixed ? x : current.fx,
      fy: fixed ? y : current.fy,
    });
  }

  fixPosition(nodeId: string, x: number, y: number) {
    this.savePosition(nodeId, x, y, true);
  }

  unfixPosition(nodeId: string) {
    const current = this.positions.get(nodeId);
    if (current) {
      this.positions.set(nodeId, {
        ...current,
        fx: undefined,
        fy: undefined,
      });
    }
  }

  getPosition(nodeId: string) {
    return this.positions.get(nodeId);
  }

  getAllPositions() {
    return new Map(this.positions);
  }

  applyPositions(nodes: GraphNode[]) {
    nodes.forEach(node => {
      const savedPos = this.positions.get(node.id);
      if (savedPos) {
        node.x = savedPos.x;
        node.y = savedPos.y;
        if (savedPos.fx !== undefined) node.fx = savedPos.fx;
        if (savedPos.fy !== undefined) node.fy = savedPos.fy;
      }
    });
  }

  extractPositions(nodes: GraphNode[]) {
    nodes.forEach(node => {
      if (typeof node.x === 'number' && typeof node.y === 'number') {
        this.savePosition(node.id, node.x, node.y, node.fx !== undefined);
      }
    });
  }

  markStable() {
    if (!this.isStable) {
      this.isStable = true;
      this.callbacks.forEach(callback => callback());
      console.log('Graph positions marked as stable');
    }
  }

  markUnstable() {
    this.isStable = false;
    if (this.stabilityTimeout) {
      clearTimeout(this.stabilityTimeout);
    }
    this.stabilityTimeout = setTimeout(() => {
      this.markStable();
    }, 5000);
  }

  onStabilityChange(callback: () => void) {
    this.callbacks.push(callback);
    return () => {
      const index = this.callbacks.indexOf(callback);
      if (index > -1) this.callbacks.splice(index, 1);
    };
  }

  isPositionStable() {
    return this.isStable;
  }

  clearPositions(nodeIds?: string[]) {
    if (nodeIds) {
      nodeIds.forEach(id => this.positions.delete(id));
    } else {
      this.positions.clear();
    }
    this.isStable = false;
  }
}

// [Previous hook functions remain the same...]
const useGraphStructure = (
  definitions: Record<string, Definition>,
  exercises: Record<string, Exercise>,
  mode: AppMode
): GraphStructureState => {
  return useMemo(() => {
    const nodes = new Map<string, GraphNodeCore>();
    const links = new Map<string, GraphLinkCore>();

    const defHash = Object.keys(definitions).sort().join(',');
    const exHash = Object.keys(exercises).sort().join(',');
    const prerequisiteHash = [
      ...Object.values(definitions).map(d => `${d.code}:${(d.prerequisites || []).sort().join(',')}`),
      ...Object.values(exercises).map(e => `${e.code}:${(e.prerequisites || []).sort().join(',')}`),
    ].join('|');

    const version = [defHash, exHash, mode, prerequisiteHash].join('::').length;

    Object.values(definitions).forEach(def => {
      if (!def?.code || !def?.name) return;
      
      nodes.set(def.code, {
        id: def.code,
        name: def.name,
        type: 'definition',
        isRootDefinition: !def.prerequisites || def.prerequisites.length === 0,
        prerequisites: def.prerequisites,
        domainId: def.domainId,
        xPosition: def.xPosition,
        yPosition: def.yPosition,
      });

      (def.prerequisites || []).forEach(prereqCode => {
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

    if (mode === 'practice') {
      Object.values(exercises).forEach(ex => {
        if (!ex?.code || !ex?.name) return;
        
        nodes.set(ex.code, {
          id: ex.code,
          name: ex.name,
          type: 'exercise',
          difficulty: ex.difficulty,
          prerequisites: ex.prerequisites,
          domainId: ex.domainId,
          xPosition: ex.xPosition,
          yPosition: ex.yPosition,
        });

        (ex.prerequisites || []).forEach(prereqCode => {
          if (nodes.has(prereqCode)) {
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
    Object.keys(definitions).sort().join(','),
    Object.keys(exercises).sort().join(','),
    mode,
    JSON.stringify(Object.fromEntries(
      Object.values(definitions).map(d => [d.code, (d.prerequisites || []).sort()])
    )),
    JSON.stringify(Object.fromEntries(
      Object.values(exercises).map(e => [e.code, (e.prerequisites || []).sort()])
    )),
  ]);
};

// Enhanced metadata manager with better highlighting support
const useGraphMetadata = (
  structureNodes: Map<string, GraphNodeCore>,
  srs: any,
  codeToNumericIdMap: Map<string, number>,
  activeNodeIds: Set<string>,
  selectedNodeIds: Set<string>, 
  highlightNodes: Set<string>
): GraphMetadataState => {
  return useMemo(() => {
    const nodeMetadata = new Map<string, NodeMetadata>();
    const linkMetadata = new Map<string, LinkMetadata>();

    structureNodes.forEach((nodeCore, nodeId) => {
      const numericId = codeToNumericIdMap.get(nodeId);
      const progress = numericId ? srs.getNodeProgress(numericId, nodeCore.type) : null;
      
      let baseColor;
      if (nodeCore.type === 'definition') {
        baseColor = nodeCore.isRootDefinition ? '#28a745' : '#007bff';
      } else {
        const difficultyColors = ['#66bb6a', '#9ccc65', '#d4e157', '#ffee58', '#ffa726', '#ff7043', '#ef5350'];
        let difficultyLevel = 2;
        if (nodeCore.difficulty) {
          const parsedDifficulty = parseInt(nodeCore.difficulty, 10);
          if (!isNaN(parsedDifficulty)) {
            difficultyLevel = Math.max(0, Math.min(6, parsedDifficulty - 1));
          }
        }
        baseColor = difficultyColors[difficultyLevel];
      }
      
      const srsColor = progress?.status ? getStatusColor(progress.status) : baseColor;
      
      nodeMetadata.set(nodeId, {
        status: progress?.status || 'fresh',
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
    srs.state.domainProgress,
    srs.state.lastUpdated,
    Array.from(activeNodeIds).sort().join(','),
    Array.from(selectedNodeIds).sort().join(','), 
    Array.from(highlightNodes).sort().join(','),
    codeToNumericIdMap,
  ]);
};

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
      console.log('Structure changed, rebuilding nodes/links');
      
      if (stableNodesRef.current.length > 0) {
        positionManager.extractPositions(stableNodesRef.current);
      }
      
      const newNodes: GraphNode[] = [];
      const newLinks: GraphLink[] = [];

      structure.nodes.forEach((nodeCore, nodeId) => {
        const nodeMeta = metadata.nodeMetadata.get(nodeId);
        
        const mergedNode: GraphNode = {
          ...nodeCore,
          ...nodeMeta,
          x: nodeCore.xPosition,
          y: nodeCore.yPosition,
          fx: nodeCore.xPosition,
          fy: nodeCore.yPosition,
        };
        
        newNodes.push(mergedNode);
      });

      structure.links.forEach(linkCore => {
        newLinks.push({
          source: linkCore.source,
          target: linkCore.target,
          type: linkCore.type,
          weight: linkCore.weight,
        });
      });

      positionManager.applyPositions(newNodes);
      
      stableNodesRef.current = newNodes;
      stableLinksRef.current = newLinks;
      lastStructureVersionRef.current = structure.version;
      
      positionManager.markUnstable();
    } else {
      stableNodesRef.current.forEach(node => {
        const nodeMeta = metadata.nodeMetadata.get(node.id);
        if (nodeMeta) {
          Object.assign(node, nodeMeta);
        }
      });
    }

    return {
      nodes: stableNodesRef.current,
      links: stableLinksRef.current,
      structureChanged,
    };
  }, [structure.version, metadata.version, positionManager]);
};

function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

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

  // Build graph using new architecture
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

  // Enhanced metadata with multi-selection support
  const graphMetadata = useGraphMetadata(
    graphStructure.nodes,
    srs,
    codeToNumericIdMap,
    activeNodeIds,
    selectedNodeIds,
    highlightNodes
  );

  const stableGraph = useStableGraph(graphStructure, graphMetadata, positionManagerRef.current);

  const graphHighlightedNodes = useMemo(() => {
    const combined = new Set<string>();
    
    // Add active nodes (with open windows) - highest priority
    activeNodeIds.forEach(id => combined.add(id));
    
    // Add selected nodes from left panel
    selectedNodeIds.forEach(id => combined.add(id));
    
    // Add hover highlighted nodes
    highlightNodes.forEach(id => combined.add(id));
    
    return combined;
  }, [activeNodeIds, selectedNodeIds, highlightNodes]);

  const handleNodeSelect = useCallback((nodeId: string, isSelected: boolean) => {
    setSelectedNodeIds(prev => {
      const newSet = new Set(prev);
      if (isSelected) {
        newSet.add(nodeId);
      } else {
        newSet.delete(nodeId);
      }
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
          const isUserEnrolled = enrolledDomains.some(d => d.id === domainId);
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

  // Handle node drag end (position updates) - NO SIMULATION RESTART
  const handleNodeDragEnd = useCallback((node: GraphNode) => {
    if (node?.id && typeof node.x === 'number' && typeof node.y === 'number') {
      positionManagerRef.current.fixPosition(node.id, node.x, node.y);
      setPositionsChanged(true);
      node.fx = node.x;
      node.fy = node.y;
    }
  }, []);

  // Handle node click
  const handleNodeClick = useCallback(async (nodeOnClick: GraphNode, isRefresh: boolean = false, context: 'click' | 'study' | 'navigation' = 'click') => {
    if (!nodeOnClick?.id) return;

    const position = {
      x: window.innerWidth - 500,
      y: 100 + (ui.state.windows.filter(w => w.type === 'detail').length * 30)
    };

    ui.openDetailWindow(nodeOnClick.id, nodeOnClick, position);
  }, [ui]);

  // Refresh function - PRESERVES POSITIONS
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
  
  // Mode change - PRESERVES POSITIONS
  const changeMode = useCallback((newMode: AppMode) => {
    if (newMode === mode) return;
    
    if (stableGraph.nodes.length > 0) {
      positionManagerRef.current.extractPositions(stableGraph.nodes);
    }
    
    setMode(newMode);
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
    
    // Clear selection when changing modes
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

  // Basic handlers
  const toggleLeftPanel = useCallback(() => setShowLeftPanel(prev => !prev), []);

  const cycleLabelDisplay = useCallback(() => {
    setLabelDisplayMode(prev => prev === 'names' ? 'codes' : prev === 'codes' ? 'off' : 'names');
  }, []);

  // Create new node
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
        const { k = 1, x = 0, y = 0 } = graphRef.current.zoom() || {};
        const rect = graphRef.current.canvas().getBoundingClientRect();
        const centerX = (-x + rect.width / 2) / k;
        const centerY = (-y + rect.height / 2) / k;
        position = { x: centerX + (Math.random() - 0.5) * 50, y: centerY + (Math.random() - 0.5) * 50 };
      } catch(e) { console.warn("Could not get graph center for new node.", e); }
    }
    
    setNodeCreationType(type);
    setNodeCreationPosition(position);
    setShowNodeCreationModal(true);
  }, [isEnrolled, domainData]);

  const handleNodeCreationSuccess = useCallback(async (nodeCode: string) => {
    setShowNodeCreationModal(false);
    showToast(`${nodeCreationType === 'definition' ? 'Definition' : 'Exercise'} "${nodeCode}" created! Refreshing...`, 'success');
    
    if (stableGraph.nodes.length > 0) {
      positionManagerRef.current.extractPositions(stableGraph.nodes);
    }
    
    await refreshGraphAndSRSData(); 
    
    setTimeout(() => {
      const newlyCreatedNode = stableGraph.nodes.find(n => n.id === nodeCode);
      if (newlyCreatedNode) {
          handleNodeClick(newlyCreatedNode, false, 'navigation');
      }
    }, 700);
  }, [nodeCreationType, refreshGraphAndSRSData, handleNodeClick, stableGraph.nodes]);

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
    return srs.state.creditFlowAnimations.map(animation => ({
      ...animation,
      duration: 4000, // Extended duration for better visibility
      timestamp: animation.timestamp || Date.now()
    }));
  }, [srs.state.creditFlowAnimations]);

  // Clear animations after extended duration
  useEffect(() => {
    if (enhancedCreditFlowAnimations.length > 0) {
      const timer = setTimeout(() => {
        srs.clearError(); // This will clear animations through the reducer
      }, 5000); // 5 seconds to see animations
      
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
            {isProcessingData || isRefreshing ? (
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
                creditFlowAnimations={enhancedCreditFlowAnimations}
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
