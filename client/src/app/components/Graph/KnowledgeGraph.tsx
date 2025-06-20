// KnowledgeGraph.tsx - Redesigned with Separated Concerns Architecture
"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { MathJaxProvider } from '@/app/components/core/MathJaxWrapper';
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
import LeftPanel from './panels/LeftPanel';
import LeftPanelToggle from './panels/LeftPanelToggle';
import RightPanel from './panels/RightPanel';
import NodeCreationModal from './NodeCreationModal';
import StudyModeModal from './StudyModeModal';
import { showToast } from '@/app/components/core/ToastNotification';
import EnrollmentModal from './EnrollmentModal';

// ==============================================================================
// SEPARATED CONCERNS ARCHITECTURE
// ==============================================================================

// 1. GRAPH STRUCTURE STATE (rarely changes - only on add/remove nodes)
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
  // Stable position references
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

// 2. GRAPH METADATA STATE (frequently changes - SRS progress, colors, etc.)
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

// 3. POSITION MANAGEMENT
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

  // Apply positions to nodes without creating new objects
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

  // Extract positions from existing nodes
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
    // Auto-mark as stable after 5 seconds of no structure changes
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

// 4. GRAPH STRUCTURE MANAGER
const useGraphStructure = (
  definitions: Record<string, Definition>,
  exercises: Record<string, Exercise>,
  mode: AppMode
): GraphStructureState => {
  return useMemo(() => {
    const nodes = new Map<string, GraphNodeCore>();
    const links = new Map<string, GraphLinkCore>();

    // Create stable structure hash for change detection
    const defHash = Object.keys(definitions).sort().join(',');
    const exHash = Object.keys(exercises).sort().join(',');
    const prerequisiteHash = [
      ...Object.values(definitions).map(d => `${d.code}:${(d.prerequisites || []).sort().join(',')}`),
      ...Object.values(exercises).map(e => `${e.code}:${(e.prerequisites || []).sort().join(',')}`),
    ].join('|');

    const version = [defHash, exHash, mode, prerequisiteHash].join('::').length;

    // Build nodes
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

      // Build prerequisite links
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

    // Build exercise nodes (only in practice mode)
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

        // Build prerequisite links
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
    // Only structural dependencies
    Object.keys(definitions).sort().join(','),
    Object.keys(exercises).sort().join(','),
    mode,
    // Hash of prerequisite relationships to detect structural changes
    JSON.stringify(Object.fromEntries(
      Object.values(definitions).map(d => [d.code, (d.prerequisites || []).sort()])
    )),
    JSON.stringify(Object.fromEntries(
      Object.values(exercises).map(e => [e.code, (e.prerequisites || []).sort()])
    )),
  ]);
};

// 5. GRAPH METADATA MANAGER
const useGraphMetadata = (
  structureNodes: Map<string, GraphNodeCore>,
  srs: any,
  codeToNumericIdMap: Map<string, number>,
  selectedNodeId: string | null,
  highlightNodes: Set<string>
): GraphMetadataState => {
  return useMemo(() => {
    const nodeMetadata = new Map<string, NodeMetadata>();
    const linkMetadata = new Map<string, LinkMetadata>();

    structureNodes.forEach((nodeCore, nodeId) => {
      const numericId = codeToNumericIdMap.get(nodeId);
      const progress = numericId ? srs.getNodeProgress(numericId, nodeCore.type) : null;
      
      // Calculate status color
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
      version: Date.now(), // Timestamp-based version for metadata
      lastMetadataChange: Date.now(),
    };
  }, [
    // Metadata dependencies only
    srs.state.domainProgress,
    srs.state.lastUpdated,
    selectedNodeId,
    Array.from(highlightNodes).sort().join(','),
    codeToNumericIdMap,
  ]);
};

// 6. STABLE GRAPH MERGER (preserves object identity)
const useStableGraph = (
  structure: GraphStructureState,
  metadata: GraphMetadataState,
  positionManager: PositionManager
) => {
  // Keep stable references to avoid unnecessary re-renders
  const stableNodesRef = useRef<GraphNode[]>([]);
  const stableLinksRef = useRef<GraphLink[]>([]);
  const lastStructureVersionRef = useRef<number>(-1);

  return useMemo(() => {
    const structureChanged = structure.version !== lastStructureVersionRef.current;
    
    if (structureChanged) {
      console.log('Structure changed, rebuilding nodes/links');
      
      // Extract positions from existing nodes before rebuilding
      if (stableNodesRef.current.length > 0) {
        positionManager.extractPositions(stableNodesRef.current);
      }
      
      // Rebuild nodes and links
      const newNodes: GraphNode[] = [];
      const newLinks: GraphLink[] = [];

      structure.nodes.forEach((nodeCore, nodeId) => {
        const nodeMeta = metadata.nodeMetadata.get(nodeId);
        
        const mergedNode: GraphNode = {
          ...nodeCore,
          ...nodeMeta,
          // Initial positions from structure
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

      // Apply saved positions
      positionManager.applyPositions(newNodes);
      
      stableNodesRef.current = newNodes;
      stableLinksRef.current = newLinks;
      lastStructureVersionRef.current = structure.version;
      
      // Mark positions as unstable after structure change
      positionManager.markUnstable();
    } else {
      // Structure unchanged, update metadata in-place
      stableNodesRef.current.forEach(node => {
        const nodeMeta = metadata.nodeMetadata.get(node.id);
        if (nodeMeta) {
          // Update metadata without changing object identity
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

// 7. DEBOUNCE UTILITY
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

// ==============================================================================
// MAIN COMPONENT
// ==============================================================================

const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({
  graphData: initialGraphData,
  subjectMatterId,
  onBack,
  onPositionUpdate
}) => {
  const srs = useSRS();
  const graphRef = useRef<any>(null);
  const positionManagerRef = useRef(new PositionManager());

  // Core state
  const [mode, setMode] = useState<AppMode>('study');
  const [isProcessingData, setIsProcessingData] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // UI state
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [labelDisplayMode, setLabelDisplayMode] = useState<LabelDisplayMode>('names');

  // Selection state
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedNodeDetails, setSelectedNodeDetails] = useState<Definition | Exercise | null>(null);
  const [nodeHistory, setNodeHistory] = useState<string[]>([]);

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
  const [showStudyModeModal, setShowStudyModeModal] = useState(false);
  const [showEnrollmentModal, setShowEnrollmentModal] = useState(false);

  // Domain state
  const [domainName, setDomainName] = useState<string>(subjectMatterId);
  const [domainData, setDomainData] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isEnrolled, setIsEnrolled] = useState<boolean | null>(null);

  // Right panel specific state
  const [showDefinition, setShowDefinition] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [userAnswer, setUserAnswer] = useState('');
  const [answerFeedback, setAnswerFeedback] = useState<AnswerFeedback | null>(null);
  const [relatedExercises, setRelatedExercises] = useState<string[]>([]);
  const [selectedDefinitionIndex, setSelectedDefinitionIndex] = useState(0);
  const [exerciseAttemptCompleted, setExerciseAttemptCompleted] = useState(false);

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

  const graphMetadata = useGraphMetadata(
    graphStructure.nodes,
    srs,
    codeToNumericIdMap,
    selectedNode?.id || null,
    highlightNodes
  );

  const stableGraph = useStableGraph(graphStructure, graphMetadata, positionManagerRef.current);

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
      // Update position manager
      positionManagerRef.current.fixPosition(node.id, node.x, node.y);
      setPositionsChanged(true);
      
      // Update the node object in-place (no new objects created)
      node.fx = node.x;
      node.fy = node.y;
    }
  }, []);

  // Handle node click
  const handleNodeClick = useCallback(async (nodeOnClick: GraphNode, isRefresh: boolean = false, context: 'click' | 'study' | 'navigation' = 'click') => {
    if (!nodeOnClick?.id) return;

    if (!isRefresh && selectedNode && selectedNode.id !== nodeOnClick.id) {
      setNodeHistory(prev => [...prev, selectedNode.id]);
    }

    setSelectedNode(nodeOnClick);
    setIsEditMode(false);
    setAnswerFeedback(null);
    setUserAnswer('');
    setExerciseAttemptCompleted(false);

    try {
      let apiDetails = nodeDataCache.get(nodeOnClick.id);
      
      if (!apiDetails) {
        if (nodeOnClick.type === 'definition') {
          const res = await getDefinitionByCode(nodeOnClick.id);
          apiDetails = Array.isArray(res) ? res[0] : res;
        } else {
          const res = await getExerciseByCode(nodeOnClick.id);
          apiDetails = Array.isArray(res) ? res[0] : res;
        }
        
        if (apiDetails) {
          setNodeDataCache(prev => new Map(prev).set(apiDetails!.code, apiDetails!));
          setCodeToNumericIdMap(prev => new Map(prev).set(apiDetails!.code, apiDetails!.id));
        }
      }

      if (apiDetails) {
        setSelectedNodeDetails({ ...apiDetails, type: nodeOnClick.type } as Definition | Exercise);
        setShowDefinition(mode !== 'study' || nodeOnClick.type !== 'definition');
        setShowSolution(false);
        setShowHints(false);
        setSelectedDefinitionIndex(0);

        if (nodeOnClick.type === 'definition' && currentStructuralGraphData.exercises) {
          const relEx = Object.values(currentStructuralGraphData.exercises)
            .filter(ex => ex.prerequisites?.includes(nodeOnClick.id))
            .map(ex => ex.code);
          setRelatedExercises(relEx);
        } else {
          setRelatedExercises([]);
        }
      } else {
        setSelectedNodeDetails(null);
        setRelatedExercises([]);
        showToast(`Could not fetch details for ${nodeOnClick.name}.`, "warning");
      }
    } catch (error) {
      console.error(`Error fetching details for node ${nodeOnClick.id}:`, error);
      showToast("Failed to fetch node details.", "error");
      setSelectedNodeDetails(null);
    }

    setShowRightPanel(true);
  }, [selectedNode, mode, currentStructuralGraphData.exercises, nodeDataCache]);

  // Refresh function - PRESERVES POSITIONS
  const refreshGraphAndSRSData = useCallback(async () => {
    setIsRefreshing(true);
    showToast("Refreshing graph data...", "info", 2000);
    
    try {
      const domainIdNum = parseInt(subjectMatterId, 10);
      if (isNaN(domainIdNum)) throw new Error("Invalid domain ID for refresh.");

      // Extract current positions before refresh
      if (stableGraph.nodes.length > 0) {
        positionManagerRef.current.extractPositions(stableGraph.nodes);
      }

      await loadComprehensiveDomainData(domainIdNum);
      if (isEnrolled) {
        await srs.refreshDomainData();
      }
      
      showToast("Graph data refreshed!", "success");

      // Refresh selected node if it still exists
      if (selectedNode) {
        const refreshedNode = stableGraph.nodes.find(n => n.id === selectedNode.id);
        if (refreshedNode) {
          await handleNodeClick(refreshedNode, true);
        } else {
          setSelectedNode(null);
          setSelectedNodeDetails(null);
          setShowRightPanel(false);
        }
      }
    } catch (error) {
      console.error('Failed to refresh graph and SRS data:', error);
      showToast(error instanceof Error ? error.message : "Failed to refresh data.", "error");
    } finally {
      setIsRefreshing(false);
    }
  }, [subjectMatterId, selectedNode, handleNodeClick, loadComprehensiveDomainData, isEnrolled, srs, stableGraph.nodes]);

  // Mode change - PRESERVES POSITIONS
  const changeMode = useCallback((newMode: AppMode) => {
    if (newMode === mode) return;
    
    // Extract positions before mode change
    if (stableGraph.nodes.length > 0) {
      positionManagerRef.current.extractPositions(stableGraph.nodes);
    }
    
    setMode(newMode);
    setSelectedNode(null);
    setSelectedNodeDetails(null);
    setShowRightPanel(false);
    setHighlightNodes(new Set());
    setHighlightLinks(new Set()); 
    setExerciseAttemptCompleted(false);
  }, [mode, stableGraph.nodes]);

  // Review handlers - NO POSITION LOSS
  const refreshNodeAfterReview = useCallback(
    debounce(async (nodeToRefresh: GraphNode) => {
      if (nodeToRefresh?.id) {
        console.log("Refreshing node after review:", nodeToRefresh.id);
        const latestNodeData = stableGraph.nodes.find(n => n.id === nodeToRefresh.id);
        if (latestNodeData) {
          await handleNodeClick(latestNodeData, true, 'navigation');
        }
      }
    }, 300),
    [handleNodeClick, stableGraph.nodes]
  );

  const handleReviewDefinition = useCallback(async (qualityInput: 'again' | 'hard' | 'good' | 'easy') => {
    if (!selectedNode || selectedNode.type !== 'definition' || !selectedNodeDetails) return;
    
    const numericId = codeToNumericIdMap.get(selectedNode.id);
    if (!numericId) { showToast("Cannot review: Node ID not found.", "error"); return; }
    
    const progress = srs.getNodeProgress(numericId, 'definition');
    if (progress?.status !== 'grasped' && progress?.status !== 'learned') {
      showToast("This definition must be 'Grasped' or 'Learned' before review.", "info");
      return;
    }
    
    const qualityMap = { again: 0, hard: 1, good: 4, easy: 5 };
    const quality: Quality = qualityMap[qualityInput] ?? 3;
    
    const reviewData: ReviewRequest = { 
      nodeId: numericId, 
      nodeType: 'definition', 
      success: quality >= 3, 
      quality, 
      timeTaken: 0, 
      sessionId: srs.state.currentSession?.id 
    };
    
    try {
      await srs.submitReview(reviewData);
      showToast(`Definition "${selectedNode.name}" reviewed as ${qualityInput}.`, "success");
      refreshNodeAfterReview({ ...selectedNode });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to submit review.", "error");
    }
  }, [selectedNode, selectedNodeDetails, srs, codeToNumericIdMap, refreshNodeAfterReview]);

  const verifyAnswer = useCallback(async () => {
    if (!selectedNode || selectedNode.type !== 'exercise' || !selectedNodeDetails) return;
    const exerciseDetails = selectedNodeDetails as Exercise;
    let success = false;
    if (exerciseDetails.verifiable && exerciseDetails.result != null) {
        success = userAnswer.trim().toLowerCase() === exerciseDetails.result.trim().toLowerCase();
        setAnswerFeedback({ correct: success, message: success ? "Correct!" : "Incorrect." });
    } else {
        setAnswerFeedback({ correct: false, message: "This exercise is not automatically verifiable." });
    }
    setExerciseAttemptCompleted(true);
    if(!showSolution) setShowSolution(true);
  }, [selectedNode, selectedNodeDetails, userAnswer, showSolution]);
 
  const handleRateExerciseUnderstanding = useCallback(async (qualityInput: 'again' | 'hard' | 'good' | 'easy') => {
    if (!selectedNode || selectedNode.type !== 'exercise' || !selectedNodeDetails) return;
    
    const numericId = codeToNumericIdMap.get(selectedNode.id);
    if (!numericId) { showToast("Cannot rate: Node ID not found.", "error"); return; }
    
    const progress = srs.getNodeProgress(numericId, 'exercise');
    if (progress?.status !== 'grasped' && progress?.status !== 'learned') {
      showToast("This exercise must be 'Grasped' or 'Learned' before rating.", "info");
      return;
    }
    
    const qualityMap = { again: 0, hard: 1, good: 4, easy: 5 };
    const quality: Quality = qualityMap[qualityInput] ?? 3;
    const isSuccessfulAttempt = answerFeedback?.correct ?? (quality >= 3);
    
    const reviewData: ReviewRequest = { 
      nodeId: numericId, 
      nodeType: 'exercise', 
      success: isSuccessfulAttempt, 
      quality, 
      timeTaken: 0, 
      sessionId: srs.state.currentSession?.id 
    };
    
    try {
      await srs.submitReview(reviewData);
      showToast(`Exercise "${selectedNode.name}" reviewed as ${qualityInput}.`, "success");
      setExerciseAttemptCompleted(false);
      setAnswerFeedback(null);
      refreshNodeAfterReview({ ...selectedNode });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to submit review.", "error");
    }
  }, [selectedNode, selectedNodeDetails, srs, answerFeedback, codeToNumericIdMap, refreshNodeAfterReview]);

  const handleStatusChange = useCallback(async (nodeDBId: string, status: NodeStatus) => {
    if (!selectedNode) return;
    
    const numericNodeId = codeToNumericIdMap.get(selectedNode.id);
    if (!numericNodeId) { showToast(`Cannot update status: No numeric ID found`, "error"); return; }
    
    showToast(`Updating status to ${status}...`, "info", 1000);
    
    try {
      await srs.updateNodeStatus(numericNodeId, selectedNode.type, status);
      refreshNodeAfterReview({ ...selectedNode });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to update status", "error");
    }
  }, [selectedNode, srs, codeToNumericIdMap, refreshNodeAfterReview]);

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
  }, [stableGraph.nodes, filteredNodeType, searchQuery]);

  // Handle node hover
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
  const toggleRightPanel = useCallback(() => {
    setShowRightPanel(prev => {
      if (prev) {
        setSelectedNode(null);
        setSelectedNodeDetails(null);
        setNodeHistory([]);
        setIsEditMode(false);
        setExerciseAttemptCompleted(false);
      }
      return !prev;
    });
  }, []);

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
    
    // Preserve positions during refresh
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
    setShowStudyModeModal(true);
  }, [isEnrolled, domainData]);

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

  const navigateBackHistory = useCallback(() => {
    if (nodeHistory.length === 0) return;
    const prevNodeId = nodeHistory[nodeHistory.length - 1];
    setNodeHistory(prev => prev.slice(0, -1));
    navigateToNodeById(prevNodeId);
  }, [nodeHistory, navigateToNodeById]);

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

  // Right panel helpers
  const currentDescriptionText = useCallback(() => {
    const detail = selectedNodeDetails as Definition;
    if (!detail || !('description' in detail)) return '';
    if (Array.isArray(detail.description)) return detail.description[selectedDefinitionIndex] || '';
    return String(detail.description).split('|||')[selectedDefinitionIndex] || '';
  }, [selectedNodeDetails, selectedDefinitionIndex]);

  const hasMultipleDescriptions = useCallback(() => {
    const detail = selectedNodeDetails as Definition;
    if (!detail || !('description' in detail)) return false;
    return (Array.isArray(detail.description) && detail.description.length > 1) || String(detail.description).includes('|||');
  }, [selectedNodeDetails]);

  const totalDescriptionsCount = useCallback(() => {
    const detail = selectedNodeDetails as Definition;
    if (!detail || !('description' in detail)) return 0;
    if (Array.isArray(detail.description)) return detail.description.length;
    return String(detail.description).split('|||').length;
  }, [selectedNodeDetails]);

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

  // Edit submission - PRESERVES POSITIONS
  const handleSubmitEdit = useCallback(async () => {
    if (!selectedNode || !selectedNodeDetails) return;
    
    // Check domain ownership
    const userOwnsThisDomain = currentUser && domainData && domainData.ownerId === currentUser.ID;
    if (!userOwnsThisDomain) {
      showToast("You don't have permission to edit nodes in this domain.", "error");
      setIsEditMode(false);
      return;
    }

    const formName = (document.getElementById('name') as HTMLInputElement)?.value || selectedNode.name;
    const formPrereqsEl = document.getElementById('prerequisites') as HTMLSelectElement;
    const selectedPrereqNumericIds = Array.from(formPrereqsEl?.selectedOptions || [])
      .map(opt => parseInt(opt.value, 10))
      .filter(id => !isNaN(id));

    let prerequisiteWeights: Record<number, number> = {};
    const weightsInput = document.querySelector('input[name="prerequisiteWeights"]') as HTMLInputElement;
    if (weightsInput?.value) { 
      try { 
        prerequisiteWeights = JSON.parse(weightsInput.value); 
      } catch (e) { 
        console.warn("Failed to parse prerequisite weights:", e); 
      } 
    }

    try {
      // Extract current positions before update
      if (stableGraph.nodes.length > 0) {
        positionManagerRef.current.extractPositions(stableGraph.nodes);
      }

      let updatedNode;
      if (selectedNode.type === 'definition') {
        const defDetails = selectedNodeDetails as Definition;
        let formDesc = (document.getElementById('description') as HTMLTextAreaElement)?.value || '';
        
        if (hasMultipleDescriptions()) {
          const descriptions = (Array.isArray(defDetails.description) ? 
            [...defDetails.description] : 
            String(defDetails.description).split('|||'));
          descriptions[selectedDefinitionIndex] = formDesc;
          formDesc = descriptions.join('|||');
        }
        
        updatedNode = await updateDefinition(defDetails.id, { 
          name: formName, 
          description: formDesc,
          notes: (document.getElementById('notes') as HTMLTextAreaElement)?.value,
          references: (document.getElementById('references') as HTMLTextAreaElement)?.value
            .split('\n').filter(r => r.trim()),
          prerequisiteIds: selectedPrereqNumericIds, 
          prerequisiteWeights,
        });
      } else { 
        const exDetails = selectedNodeDetails as Exercise;
        updatedNode = await updateExercise(exDetails.id, {
          name: formName,
          statement: (document.getElementById('statement') as HTMLTextAreaElement)?.value,
          description: (document.getElementById('description') as HTMLTextAreaElement)?.value,
          hints: (document.getElementById('hints') as HTMLTextAreaElement)?.value,
          notes: (document.getElementById('exerciseNotes') as HTMLTextAreaElement)?.value,
          difficulty: (document.getElementById('difficulty') as HTMLInputElement)?.value,
          verifiable: (document.getElementById('verifiable') as HTMLInputElement)?.checked,
          result: (document.getElementById('verifiable') as HTMLInputElement)?.checked ? 
            (document.getElementById('result') as HTMLInputElement)?.value : undefined,
          prerequisiteIds: selectedPrereqNumericIds, 
          prerequisiteWeights,
        });
      }

      // Refresh data while preserving positions
      await refreshGraphAndSRSData();
      setIsEditMode(false);
      showToast(`${selectedNode.type === 'definition' ? 'Definition' : 'Exercise'} "${selectedNode.name}" updated.`, "success");

    } catch (error) {
      console.error("Error updating node:", error);
      showToast(error instanceof Error ? error.message : "Failed to update node.", "error");
    }
  }, [selectedNode, selectedNodeDetails, currentUser, domainData, hasMultipleDescriptions, selectedDefinitionIndex, stableGraph.nodes, refreshGraphAndSRSData]);

  // Memoized credit flow animations
  const memoizedCreditFlowAnimations = useMemo(() => srs.state.creditFlowAnimations, [srs.state.creditFlowAnimations]);

  return (
    <MathJaxProvider>
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

        <StudyModeModal
          isOpen={showStudyModeModal && !!isEnrolled}
          onClose={() => setShowStudyModeModal(false)}
          domainId={parseInt(subjectMatterId, 10)}
          onNavigateToNode={navigateToNodeById}
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
                selectedNodeId={selectedNode?.id || null}
                onNodeClick={handleNodeClick}
                mode={mode}
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
                highlightNodes={highlightNodes}
                highlightLinks={highlightLinks}
                filteredNodeType={filteredNodeType}
                selectedNodeId={selectedNode?.id || null}
                labelDisplayMode={labelDisplayMode}
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
                onNodeDragEnd={handleNodeDragEnd}
                creditFlowAnimations={memoizedCreditFlowAnimations}
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

          {/* Right Panel */}
          <div className={`right-panel-class absolute top-0 right-0 h-full z-20 bg-white border-l shadow-lg transition-transform duration-300 ease-in-out ${showRightPanel && selectedNode ? 'translate-x-0 w-80 md:w-96' : 'translate-x-full w-80 md:w-96'}`}>
            {showRightPanel && selectedNode && selectedNodeDetails && (
              <RightPanel
                isVisible={showRightPanel}
                onToggle={toggleRightPanel}
                selectedNode={selectedNode}
                selectedNodeDetails={selectedNodeDetails}
                isEditMode={isEditMode}
                onToggleEditMode={() => {
                  const userOwnsThisDomain = currentUser && domainData && domainData.ownerId === currentUser.ID;
                  if (!userOwnsThisDomain) { 
                    showToast("You can only edit nodes in domains you own.", "warning"); 
                    return; 
                  } 
                  setIsEditMode(!isEditMode); 
                }}
                mode={mode}
                nodeHistory={nodeHistory}
                onNavigateBack={navigateBackHistory}
                onNavigateToNode={navigateToNodeById}
                showDefinition={showDefinition}
                onToggleDefinition={() => setShowDefinition(!showDefinition)}
                hasMultipleDescriptions={hasMultipleDescriptions()}
                totalDescriptions={totalDescriptionsCount()}
                selectedDefinitionIndex={selectedDefinitionIndex}
                currentDescription={currentDescriptionText()}
                onNavigatePrevDescription={() => setSelectedDefinitionIndex(i => Math.max(0, i - 1))}
                onNavigateNextDescription={() => setSelectedDefinitionIndex(i => Math.min(totalDescriptionsCount() - 1, i + 1))}
                relatedExercises={relatedExercises}
                onReviewDefinition={handleReviewDefinition}
                showSolution={showSolution}
                onToggleSolution={() => setShowSolution(!showSolution)}
                showHints={showHints}
                onToggleHints={() => setShowHints(!showHints)}
                userAnswer={userAnswer}
                onUpdateAnswer={setUserAnswer}
                answerFeedback={answerFeedback}
                onVerifyAnswer={verifyAnswer}
                onRateExercise={handleRateExerciseUnderstanding}
                exerciseAttemptCompleted={exerciseAttemptCompleted}
                availableDefinitionsForEdit={availableDefinitionsForModals}
                onSubmitEdit={handleSubmitEdit}
                onStatusChange={handleStatusChange}
                availableDefinitions={availableDefinitionsForModals.map(d => ({code: d.code, name: d.name}))}
              />
            )}
          </div>
        </div>
      </div>
    </MathJaxProvider>
  );
};

export default KnowledgeGraph;
