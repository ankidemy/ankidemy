// KnowledgeGraph.tsx - Fixed version with smart panning behavior
"use client";

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { MathJaxProvider } from '@/app/components/core/MathJaxWrapper';
import { Eye, Clock, AlertTriangle, Play, BookOpen, Brain, RefreshCw } from 'lucide-react';
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
  getDefinitionIdByCode,
  getExerciseIdByCode,
  getDomain,
  enrollInDomain,
  getEnrolledDomains,
  getCurrentUser,
  User,
} from '@/lib/api';
import { useSRS } from '../../../contexts/SRSContext';
import { getStatusColor, isNodeDue, calculateDaysUntilReview, formatNextReview } from '../../../lib/srs-api';
import * as srsApi from '../../../lib/srs-api';
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
// 1. DEBOUNCE UTILITY
// ==============================================================================
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

// FIX 3: Canvas Dimension Tracking Issues
const useCanvasDimensions = (leftPanelOpen: boolean, rightPanelOpen: boolean) => {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0, availableWidth: 0, availableHeight: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const updateDimensions = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      
      // Get actual panel widths from DOM
      const leftPanelEl = document.querySelector('.left-panel-class');
      const rightPanelEl = document.querySelector('.right-panel-class');
      
      const leftPanelWidth = leftPanelOpen && leftPanelEl ? 
        leftPanelEl.getBoundingClientRect().width : 0;
      const rightPanelWidth = rightPanelOpen && rightPanelEl ? 
        rightPanelEl.getBoundingClientRect().width : 0;
      
      // Account for margins and borders (approximately 20px total)
      const margins = 20;
      
      const availableWidth = Math.max(300, rect.width - leftPanelWidth - rightPanelWidth - margins);
      const availableHeight = Math.max(200, rect.height - margins);
      
      setDimensions({
        width: rect.width,
        height: rect.height,
        availableWidth,
        availableHeight
      });
    }
  }, [leftPanelOpen, rightPanelOpen]);


  useEffect(() => {
    updateDimensions();
    
    // Use ResizeObserver for container changes
    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    
    // Also listen to window resize for dev tools scenarios
    window.addEventListener('resize', updateDimensions);
    
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateDimensions);
    };
      }, [updateDimensions]);

  // Update when panels change
  useEffect(() => {
    // Small delay to allow panel transition to complete
    const timer = setTimeout(updateDimensions, 350);
    return () => clearTimeout(timer);
  }, [leftPanelOpen, rightPanelOpen, updateDimensions]);

  return { dimensions, containerRef };
};


// FIX 4 & 5: Smart Graph Control and Fit Improvements
const useSmartGraphControl = (graphRef: React.RefObject<any>, dimensions: any) => {
  const lastFitTimeRef = useRef<number>(0);
  const initialLoadCompleteRef = useRef<boolean>(false);
  const userHasInteractedRef = useRef<boolean>(false);

  // FIX 5: Smart Fit Improvements
  const smartFitToScreen = useCallback((force: boolean = false) => {
    if (!graphRef.current || !dimensions.availableWidth || !dimensions.availableHeight) return;
    
    const now = Date.now();
    // Prevent too frequent fitting (unless forced)
    if (!force && now - lastFitTimeRef.current < 1000) return;
    
    try {
      // Use 10% padding for better visibility
      const padding = Math.min(dimensions.availableWidth, dimensions.availableHeight) * 0.1;
      
      // Get the graph bounds
      const graphBounds = graphRef.current.getGraphBbox();
      if (graphBounds && graphBounds.x[0] !== Infinity) {
        // Calculate zoom to fit within available space
        const graphWidth = graphBounds.x[1] - graphBounds.x[0];
        const graphHeight = graphBounds.y[1] - graphBounds.y[0];
        
        const scaleX = graphWidth > 0 ? (dimensions.availableWidth - 2 * padding) / graphWidth : 20;
        const scaleY = graphHeight > 0 ? (dimensions.availableHeight - 2 * padding) / graphHeight : 20;
        const scale = Math.min(scaleX, scaleY, 5); // Cap at 5x zoom
        
        // Center and zoom
        const centerX = (graphBounds.x[0] + graphBounds.x[1]) / 2;
        const centerY = (graphBounds.y[0] + graphBounds.y[1]) / 2;
        
        graphRef.current.centerAt(centerX, centerY, 400);
        graphRef.current.zoom(scale, 400);
      } else {
        // Fallback to default fit
        graphRef.current.zoomToFit(400, padding);
      }
      
      lastFitTimeRef.current = now;
      console.log('Graph fitted to available space:', dimensions.availableWidth, 'x', dimensions.availableHeight);
    } catch (error) {
      console.error('Error fitting graph:', error);
    }
  }, [graphRef, dimensions]);

  // FIX 4: Zoom Not Working on Node Selection
  const centerOnNode = useCallback((node: any, context: 'click' | 'study' | 'navigation' = 'click') => {
    if (!graphRef.current || typeof node.x !== 'number' || typeof node.y !== 'number') return;
    
    userHasInteractedRef.current = true;
    
    // Increased zoom levels for better focus
    const zoomLevels = {
      click: 3.0,      // Higher zoom for user clicks
      study: 2.5,      // Medium zoom for study mode
      navigation: 2.0  // Lower zoom for navigation
    };
    
    const animationTime = context === 'study' ? 600 : 800;
    
    try {
      // Center first, then zoom
      graphRef.current.centerAt(node.x, node.y, animationTime);
      // Add a small delay before zooming for smoother animation
      setTimeout(() => {
        if (graphRef.current) {
          graphRef.current.zoom(zoomLevels[context], animationTime);
        }
      }, 100);
    } catch (error) {
      console.error('Error centering on node:', error);
    }
  }, [graphRef]);

  // Initial fit (only on first load)
  const handleInitialFit = useCallback((force: boolean = false) => {
    if (!initialLoadCompleteRef.current || force) {
      smartFitToScreen(true);
      initialLoadCompleteRef.current = true;
    }
  }, [smartFitToScreen]);

  return {
    smartFitToScreen,
    centerOnNode,
    handleInitialFit,
    userHasInteracted: () => userHasInteractedRef.current
  };
};

const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({
  graphData: initialGraphData,
  subjectMatterId,
  onBack,
  onPositionUpdate
}) => {
  const srs = useSRS();
  const graphRef = useRef<any>(null);

  const [mode, setMode] = useState<AppMode>('study');
  const [isProcessingData, setIsProcessingData] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [labelDisplayMode, setLabelDisplayMode] = useState<LabelDisplayMode>('names');

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedNodeDetails, setSelectedNodeDetails] = useState<Definition | Exercise | null>(null);

  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphLinks, setGraphLinks] = useState<GraphLink[]>([]);
  const [nodeHistory, setNodeHistory] = useState<string[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [showDefinition, setShowDefinition] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [highlightNodes, setHighlightNodes] = useState(new Set<string>());
  const [highlightLinks, setHighlightLinks] = useState(new Set<string>());
  const [userAnswer, setUserAnswer] = useState('');
  const [answerFeedback, setAnswerFeedback] = useState<AnswerFeedback | null>(null);
  const [relatedExercises, setRelatedExercises] = useState<string[]>([]);
  const [filteredNodeType, setFilteredNodeType] = useState<FilteredNodeType>('all');
  const [selectedDefinitionIndex, setSelectedDefinitionIndex] = useState(0);

  const [showNodeCreationModal, setShowNodeCreationModal] = useState(false);
  const [nodeCreationType, setNodeCreationType] = useState<'definition' | 'exercise'>('definition');
  const [nodeCreationPosition, setNodeCreationPosition] = useState<{x: number, y: number} | undefined>(undefined);
  const [positionsChanged, setPositionsChanged] = useState(false);
  const [isSavingPositions, setIsSavingPositions] = useState(false);

  const [currentStructuralGraphData, setCurrentStructuralGraphData] = useState(initialGraphData);
  const [domainName, setDomainName] = useState<string>(subjectMatterId); // Store domain name
  const [domainData, setDomainData] = useState<any>(null); // Store domain details
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isEnrolled, setIsEnrolled] = useState<boolean | null>(null); // Start with null to indicate loading
  const [showEnrollmentModal, setShowEnrollmentModal] = useState(false);

  const [codeToNumericIdMap, setCodeToNumericIdMap] = useState<Map<string, number>>(new Map());
  const [nodeDataCache, setNodeDataCache] = useState<Map<string, ApiDefinition | ApiExercise>>(new Map());

  const nodePositions = useRef<Record<string, { x: number; y: number }>>({});
  const [showStudyModeModal, setShowStudyModeModal] = useState(false);

  // State for exercise review flow
  const [exerciseAttemptCompleted, setExerciseAttemptCompleted] = useState(false);
  const [graphRevision, setGraphRevision] = useState(0);

  // FIX: Add refs to prevent infinite loops
  const lastProcessedDataKey = useRef<string>('');
  const refreshTimeoutRef = useRef<NodeJS.Timeout>();
  const isInitializedRef = useRef<boolean>(false);

  // Add canvas dimension tracking
  const { dimensions, containerRef } = useCanvasDimensions(showLeftPanel, showRightPanel);

  // Add smart graph control
  const { smartFitToScreen, centerOnNode, handleInitialFit, userHasInteracted } = useSmartGraphControl(graphRef, dimensions);
  const prevAvailableWidth = useRef(0);
  const prevAvailableHeight = useRef(0);

  // Check user authentication and enrollment status
  useEffect(() => {
    const checkUserAndEnrollment = async () => {
      if (!subjectMatterId || isNaN(parseInt(subjectMatterId))) return;
      
      const domainId = parseInt(subjectMatterId);
      
      try {
        // Get current user
        const user = await getCurrentUser();
        setCurrentUser(user);
        
        // Get domain data
        const domain = await getDomain(domainId);
        setDomainData(domain);
        setDomainName(domain.name);
        
        // Check if user owns the domain or is enrolled
        const userOwnsThisDomain = domain.ownerId === user.id;
        
        if (userOwnsThisDomain) {
          setIsEnrolled(true);
          // Only set current domain in SRS context for owners - SRSContext will handle loading
          if (!isInitializedRef.current) {
            srs.setCurrentDomain(domainId);
            isInitializedRef.current = true;
          }
        } else {
          // Check enrollment for non-owners
          const enrolledDomains = await getEnrolledDomains();
          const isUserEnrolled = enrolledDomains.some(d => d.id === domainId);
          setIsEnrolled(isUserEnrolled);
          
          if (isUserEnrolled) {
            // Only set current domain in SRS context for enrolled users - SRSContext will handle loading
            if (!isInitializedRef.current) {
              srs.setCurrentDomain(domainId);
              isInitializedRef.current = true;
            }
          } else if (domain.privacy === 'public') {
            // For public domains, show enrollment modal after a delay
            setTimeout(() => {
              setShowEnrollmentModal(true);
            }, 1500); // Show modal after user has seen the graph
          }
        }
      } catch (error) {
        console.error("Error checking enrollment status:", error);
        // If user is not authenticated, still try to load public domain
        try {
          const domain = await getDomain(domainId);
          setDomainData(domain);
          setDomainName(domain.name);
          
          if (domain.privacy === 'public') {
            setIsEnrolled(false);
            // Don't set SRS domain for non-authenticated users
          } else {
            showToast("This is a private domain. Please log in to access it.", "error");
          }
        } catch (domainError) {
          console.error("Error loading domain:", domainError);
          showToast("Failed to load domain information.", "error");
        }
      }
    };
    
    checkUserAndEnrollment();
  }, [subjectMatterId]); // REMOVED srs dependency

  useEffect(() => {
    setCurrentStructuralGraphData(initialGraphData);
    setIsProcessingData(true);
    
    // Safety timeout - ensure loading doesn't get stuck
    const timeout = setTimeout(() => {
      console.warn("Graph processing timeout reached, forcing completion");
      setIsProcessingData(false);
    }, 10000); // 10 second timeout
    
    return () => clearTimeout(timeout);
  }, [initialGraphData]);
  
  const loadComprehensiveDomainData = useCallback(async (domainId: number) => {
    try {
      console.log("Loading comprehensive domain data for:", domainId);
      
      const [allDefinitions, allExercises] = await Promise.all([
        getDomainDefinitions(domainId).catch(err => {
          console.warn("Failed to load definitions:", err);
          return [];
        }),
        getDomainExercises(domainId).catch(err => {
          console.warn("Failed to load exercises:", err);
          return [];
        })
      ]);
      
      console.log("Loaded definitions:", allDefinitions.length);
      console.log("Loaded exercises:", allExercises.length);
      
      const newCodeToNumericIdMap = new Map<string, number>();
      const newNodeDataCache = new Map<string, ApiDefinition | ApiExercise>();
      
      allDefinitions.forEach(def => {
        if (def && def.code && typeof def.id === 'number') {
          newCodeToNumericIdMap.set(def.code, def.id);
          newNodeDataCache.set(def.code, def);
          
          if (!def.prerequisiteWeights && def.prerequisites && def.prerequisites.length > 0) {
              def.prerequisiteWeights = Object.fromEntries(def.prerequisites.map(p => [p, 1.0]));
          }
        }
      });
      
      allExercises.forEach(ex => {
        if (ex && ex.code && typeof ex.id === 'number') {
          newCodeToNumericIdMap.set(ex.code, ex.id);
          newNodeDataCache.set(ex.code, ex);
          
          if (!ex.prerequisiteWeights && ex.prerequisites && ex.prerequisites.length > 0) {
              ex.prerequisiteWeights = Object.fromEntries(ex.prerequisites.map(p => [p, 1.0]));
          }
        }
      });
      
      const newDefinitions: Record<string, Definition> = {};
      const newExercises: Record<string, Exercise> = {};
      
      allDefinitions.forEach(def => {
        newDefinitions[def.code] = { 
          ...def, 
          type: 'definition',
          prerequisiteWeights: def.prerequisiteWeights || (def.prerequisites ? 
            Object.fromEntries(def.prerequisites.map(p => [p, 1.0])) : {})
        };
      });
      
      allExercises.forEach(ex => {
        newExercises[ex.code] = { 
          ...ex, 
          type: 'exercise',
          prerequisiteWeights: ex.prerequisiteWeights || (ex.prerequisites ?
            Object.fromEntries(ex.prerequisites.map(p => [p, 1.0])) : {})
        };
      });
      
      setCodeToNumericIdMap(newCodeToNumericIdMap);
      setNodeDataCache(newNodeDataCache);
      setCurrentStructuralGraphData({ definitions: newDefinitions, exercises: newExercises });
      
      console.log("Enhanced data loading completed with weight fallbacks");
      
    } catch (error) {
      console.error("Error loading comprehensive domain data:", error);
      showToast("Failed to load complete domain data.", "error");
      
      // Ensure we don't get stuck in loading state
      setCurrentStructuralGraphData({ definitions: {}, exercises: {} });
    }
  }, []);

  useEffect(() => {
    const domainId = parseInt(subjectMatterId, 10);
    if (!isNaN(domainId)) {
      loadComprehensiveDomainData(domainId);
    }
  }, [subjectMatterId, loadComprehensiveDomainData]);

  useEffect(() => {
    // Only fit on initial load or when specifically needed
    if (!isProcessingData && graphNodes.length > 0 && dimensions.availableWidth > 0) {
      // Fit only if this is initial load or user hasn't interacted much
      if (!userHasInteracted()) {
        setTimeout(() => {
          handleInitialFit();
        }, 300);
      }
    }
  }, [isProcessingData, graphNodes.length, dimensions.availableWidth, handleInitialFit, userHasInteracted]);

  // FIX 6: Fix the dimension change detection threshold
  useEffect(() => {
    if (dimensions.availableWidth > 0 && dimensions.availableHeight > 0) {
        if (prevAvailableWidth.current === 0) { // First run initialization
            prevAvailableWidth.current = dimensions.availableWidth;
            prevAvailableHeight.current = dimensions.availableHeight;
            return;
        }

        const threshold = 0.05; // 5% threshold
        const widthChange = Math.abs(dimensions.availableWidth - prevAvailableWidth.current) / prevAvailableWidth.current;
        const heightChange = Math.abs(dimensions.availableHeight - prevAvailableHeight.current) / prevAvailableHeight.current;

        if (widthChange > threshold || heightChange > threshold) {
            smartFitToScreen();
            prevAvailableWidth.current = dimensions.availableWidth;
            prevAvailableHeight.current = dimensions.availableHeight;
        }
    }
  }, [dimensions, smartFitToScreen]);

  // FIX 2c: When changing modes, replace centering with fitting
  const changeMode = useCallback((newMode: AppMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    setSelectedNode(null);
    setSelectedNodeDetails(null);
    setShowRightPanel(false);
    setHighlightNodes(new Set());
    setHighlightLinks(new Set()); 
    setExerciseAttemptCompleted(false);
    
    // Add smart fit after mode change
    setTimeout(() => {
      smartFitToScreen(true);
    }, 100);
  }, [mode, smartFitToScreen]);

  const handleNodeClick = useCallback(async (nodeOnClick: GraphNode, isRefresh: boolean = false, context: 'click' | 'study' | 'navigation' = 'click') => {
    if (!nodeOnClick || !nodeOnClick.id) return;

    setSelectedNode(nodeOnClick);
    setShowRightPanel(true);

    if (!isRefresh && selectedNode && selectedNode.id !== nodeOnClick.id) {
      setNodeHistory(prev => [...prev, selectedNode.id]);
    }

    setSelectedNode(nodeOnClick);
    setIsEditMode(false);
    setAnswerFeedback(null);
    setUserAnswer('');
    setExerciseAttemptCompleted(false);

    try {
      // ... existing node details fetching logic
      let apiDetails: ApiDefinition | ApiExercise | null = null;
      const code = nodeOnClick.id;

      apiDetails = nodeDataCache.get(code) || null;
      
      if (!apiDetails) {
        if (nodeOnClick.type === 'definition') {
          const res = await getDefinitionByCode(code);
          apiDetails = Array.isArray(res) ? res[0] : res;
        } else {
          const res = await getExerciseByCode(code);
          apiDetails = Array.isArray(res) ? res[0] : res;
        }
        
        if (apiDetails) {
          setNodeDataCache(prev => new Map(prev).set(code, apiDetails!));
          setCodeToNumericIdMap(prev => new Map(prev).set(code, apiDetails!.id));
        }
      }

      if (apiDetails) {
        setSelectedNodeDetails({
          ...apiDetails,
          type: nodeOnClick.type,
        } as Definition | Exercise);

        setShowDefinition(mode !== 'study' || nodeOnClick.type !== 'definition');
        setShowSolution(false);
        setShowHints(false);
        setSelectedDefinitionIndex(0);

        if (nodeOnClick.type === 'definition' && currentStructuralGraphData.exercises) {
          const relEx = Object.values(currentStructuralGraphData.exercises)
            .filter(ex => ex.prerequisites?.includes(code))
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
      showToast(error instanceof Error ? error.message : "Failed to fetch node details.", "error");
      setSelectedNodeDetails(null);
    }

    if (!isRefresh) {
      setShowRightPanel(true);
      // Center on node with appropriate context
      centerOnNode(nodeOnClick, context);
    }
  }, [selectedNode, mode, currentStructuralGraphData.exercises, nodeDataCache, centerOnNode]);

  const refreshGraphAndSRSData = useCallback(async () => {
    setIsProcessingData(true);
    setIsRefreshing(true);
    showToast("Refreshing graph data...", "info", 2000);
    try {
      const domainIdNum = parseInt(subjectMatterId, 10);
      if (isNaN(domainIdNum)) throw new Error("Invalid domain ID for refresh.");

      await loadComprehensiveDomainData(domainIdNum);
      if (isEnrolled) {
        await srs.refreshDomainData();
      }
      
      showToast("Graph data refreshed!", "success");

      if (selectedNode) {
        const refreshedNodeData = nodeDataCache.get(selectedNode.id);
        if (refreshedNodeData) {
            const graphNodeForRefresh: GraphNode = {
                id: refreshedNodeData.code,
                name: refreshedNodeData.name,
                type: selectedNode.type,
                x: selectedNode.x,
                y: selectedNode.y,
            };
            // Pass true for isRefresh to prevent centering
            await handleNodeClick(graphNodeForRefresh, true);
        } else {
            setSelectedNode(null);
            setSelectedNodeDetails(null);
        }
      }
    } catch (error) {
      console.error('Failed to refresh graph and SRS data:', error);
      showToast(error instanceof Error ? error.message : "Failed to refresh data.", "error");
    } finally {
      setIsRefreshing(false); 
    }
  }, [subjectMatterId, selectedNode, handleNodeClick, loadComprehensiveDomainData, nodeDataCache, isEnrolled, srs]);

  // Handle enrollment
  const handleEnrollment = useCallback(async () => {
    if (!domainData || !currentUser) {
      showToast("Please log in to enroll in domains", "error");
      return;
    }

    try {
      await enrollInDomain(domainData.id);
      setIsEnrolled(true);
      setShowEnrollmentModal(false);
      
      // Set up SRS context after enrollment
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

  const handlePromptEnrollment = useCallback(() => {
    if (domainData && domainData.privacy === 'public' && !isEnrolled) {
      setShowEnrollmentModal(true);
    }
  }, [domainData, isEnrolled]);

  const generateDataKey = useCallback(() => {
    const defKeys = Object.keys(currentStructuralGraphData.definitions || {}).sort();
    const exKeys = Object.keys(currentStructuralGraphData.exercises || {}).sort();
    
    const defPrereqs = defKeys.map(key => {
      const def = currentStructuralGraphData.definitions[key];
      return `${key}:${(def.prerequisites || []).sort().join(',')}`;
    }).join('|');
    
    const exPrereqs = exKeys.map(key => {
      const ex = currentStructuralGraphData.exercises[key];
      return `${key}:${(ex.prerequisites || []).sort().join(',')}`;
    }).join('|');
    
    return `${defKeys.length}-${exKeys.length}-${mode}-${srs.state.lastUpdated}-${defPrereqs}-${exPrereqs}`;
  }, [currentStructuralGraphData, mode, srs.state.lastUpdated]);

  // Build graph data effect
  useEffect(() => {
    try {
      const dataKey = generateDataKey();
      
      if (lastProcessedDataKey.current === dataKey) {
        console.log("Skipping graph processing - data unchanged:", dataKey);
        setIsProcessingData(false); // Make sure to turn off processing if we skip
        return;
      }
      
      console.log("Processing graph data with key:", dataKey);
      
      setIsProcessingData(true);
      lastProcessedDataKey.current = dataKey;
      
      const nodes: GraphNode[] = [];
      const links: GraphLink[] = [];
  
      // Process definitions - ALWAYS show definitions regardless of mode
      Object.values(currentStructuralGraphData.definitions || {}).forEach(def => {
        if (!def || !def.code || !def.name) return;
        
        const numericId = codeToNumericIdMap.get(def.code);
        const progress = numericId ? srs.getNodeProgress(numericId, 'definition') : null;
        
        nodes.push({
          id: def.code,
          name: def.name,
          type: 'definition',
          isRootDefinition: !def.prerequisites || def.prerequisites.length === 0,
          xPosition: def.xPosition,
          yPosition: def.yPosition,
          fx: def.xPosition,
          fy: def.yPosition,
          status: progress?.status || 'fresh',
          isDue: progress ? isNodeDue(progress.nextReview) : false,
          daysUntilReview: progress ? calculateDaysUntilReview(progress.nextReview) : null,
          progress: progress || null,
          domainId: def.domainId,
          prerequisites: def.prerequisites
        });
        
        (def.prerequisites || []).forEach(prereqCode => {
          const weight = def.prerequisiteWeights?.[prereqCode] ?? 1.0;
          links.push({ 
            source: prereqCode, 
            target: def.code, 
            type: 'prerequisite',
            weight: weight
          });
        });
      });
  
      // Process exercises (only in practice mode)
      if (mode === 'practice' && currentStructuralGraphData.exercises) {
        Object.values(currentStructuralGraphData.exercises).forEach(ex => {
          if (!ex || !ex.code || !ex.name) return;
          
          const numericId = codeToNumericIdMap.get(ex.code);
          const progress = numericId ? srs.getNodeProgress(numericId, 'exercise') : null;
          
          nodes.push({
            id: ex.code,
            name: ex.name,
            type: 'exercise',
            difficulty: ex.difficulty,
            xPosition: ex.xPosition,
            yPosition: ex.yPosition,
            fx: ex.xPosition,
            fy: ex.yPosition,
            status: progress?.status || 'fresh',
            isDue: progress ? isNodeDue(progress.nextReview) : false,
            daysUntilReview: progress ? calculateDaysUntilReview(progress.nextReview) : null,
            progress: progress || null,
            domainId: ex.domainId,
            prerequisites: ex.prerequisites
          });
          
          (ex.prerequisites || []).forEach(prereqCode => {
            const prereqNode = nodes.find(n => n.id === prereqCode && n.type === 'definition');
            if (prereqNode) {
              const weight = ex.prerequisiteWeights?.[prereqCode] ?? 1.0;
              links.push({ 
                source: prereqCode, 
                target: ex.code, 
                type: 'prerequisite',
                weight: weight
              });
            } else {
              console.warn(`Exercise Link: Prerequisite code ${prereqCode} not found for target ${ex.code}`);
            }
          });
        });
      }
      
      setGraphNodes(nodes);
      setGraphLinks(links);
      setIsProcessingData(false);
      
    } catch (error) {
      console.error("Error processing graph data:", error);
      setIsProcessingData(false); // Ensure we clear loading state on error
      showToast("Error processing graph data", "error");
    }
  }, [generateDataKey, codeToNumericIdMap, srs, graphRevision, mode]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  const savePositions = async () => {
    if (!onPositionUpdate || Object.keys(nodePositions.current).length === 0 || !positionsChanged) return;
    setIsSavingPositions(true);
    try {
      await onPositionUpdate(nodePositions.current);
      setPositionsChanged(false);
      showToast("Node positions saved.", "success");
    } catch (err) {
      console.error("Failed to save positions:", err);
      showToast(err instanceof Error ? err.message : "Failed to save positions.", "error");
    } finally {
      setIsSavingPositions(false);
    }
  };

  const handleNodeDragEnd = useCallback((node: GraphNode) => {
    if (node?.id && typeof node.x === 'number' && typeof node.y === 'number') {
      node.fx = node.x;
      node.fy = node.y;
      nodePositions.current[node.id] = { x: node.x, y: node.y };
      setPositionsChanged(true);
    }
  }, []);

  // FIX 2b: After reviewing a node
  const refreshNodeAfterReview = useCallback(
    debounce(async (nodeToRefresh: GraphNode) => {
      if (nodeToRefresh && nodeToRefresh.id) {
        console.log("Refreshing node after review:", nodeToRefresh.id);
        // Pass true for isRefresh to prevent centering
        await handleNodeClick(nodeToRefresh, true, 'navigation');
      }
    }, 300),
    [handleNodeClick]
  );

  const handleReviewDefinition = useCallback(async (qualityInput: 'again' | 'hard' | 'good' | 'easy') => {
    if (!selectedNode || selectedNode.type !== 'definition' || !selectedNodeDetails) return;
    
    const numericId = codeToNumericIdMap.get(selectedNode.id);
    if (!numericId) {
      showToast("Cannot review: Node ID not found.", "error");
      return;
    }
    
    const progress = srs.getNodeProgress(numericId, 'definition');
    if (progress?.status !== 'grasped' && progress?.status !== 'learned') {
      showToast("This definition needs to be marked as 'Grasped' or 'Learned' before it can be reviewed.", "info");
      return;
    }

    let quality: Quality;
    switch (qualityInput) {
        case 'again': quality = 0; break;
        case 'hard': quality = 1; break;
        case 'good': quality = 4; break;
        case 'easy': quality = 5; break;
        default: quality = 3;
    }
    
    const reviewData: ReviewRequest = {
      nodeId: numericId,
      nodeType: 'definition',
      success: quality >= 3,
      quality: quality,
      timeTaken: 0, 
      sessionId: srs.state.currentSession?.id,
    };
    
    try {
      await srs.submitReview(reviewData);
      showToast(`Definition "${selectedNode.name}" reviewed as ${qualityInput}.`, "success");
      
      const nodeToRefresh = { ...selectedNode };
      refreshNodeAfterReview(nodeToRefresh);
      
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
    if (!numericId) {
      showToast("Cannot rate: Node ID not found.", "error");
      return;
    }
    
    const progress = srs.getNodeProgress(numericId, 'exercise');
    if (progress?.status !== 'grasped' && progress?.status !== 'learned') {
      showToast("This exercise needs to be marked as 'Grasped' or 'Learned' before it can be rated.", "info");
      return;
    }

    let quality: Quality;
    switch (qualityInput) {
        case 'again': quality = 0; break;
        case 'hard': quality = 1; break; 
        case 'good': quality = 4; break;
        case 'easy': quality = 5; break;
        default: quality = 3;
    }
    
    const isSuccessfulAttempt = answerFeedback?.correct ?? (quality >= 3);

    const reviewData: ReviewRequest = {
      nodeId: numericId,
      nodeType: 'exercise',
      success: isSuccessfulAttempt, 
      quality: quality,
      timeTaken: 0, 
      sessionId: srs.state.currentSession?.id,
    };
    
    try {
      await srs.submitReview(reviewData);
      showToast(`Exercise "${selectedNode.name}" reviewed as ${qualityInput}.`, "success");
      setExerciseAttemptCompleted(false);
      setAnswerFeedback(null);
      
      const nodeToRefresh = { ...selectedNode };
      refreshNodeAfterReview(nodeToRefresh);
      
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to submit review.", "error");
    }
  }, [selectedNode, selectedNodeDetails, srs, answerFeedback, codeToNumericIdMap, refreshNodeAfterReview]);

  const handleStatusChange = useCallback(async (nodeDBId: string, status: NodeStatus) => {
    if (!selectedNode) return;
    
    const numericNodeId = codeToNumericIdMap.get(selectedNode.id);
    if (!numericNodeId) {
        showToast(`Cannot update status: No numeric ID found for node ${selectedNode.id}`, "error");
        return;
    }
    
    showToast(`Updating status to ${status}...`, "info", 1000);
    
    try {
      await srs.updateNodeStatus(numericNodeId, selectedNode.type, status);
      
      const nodeToRefresh = { ...selectedNode };
      refreshNodeAfterReview(nodeToRefresh);
      
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to update status", "error");
    }
  }, [selectedNode, srs, codeToNumericIdMap, refreshNodeAfterReview]);
  
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
    setLabelDisplayMode(prev => {
      switch (prev) {
        case 'names': return 'codes';
        case 'codes': return 'off';
        case 'off': return 'names';
        default: return 'names';
      }
    });
  }, []);

  const createNewNode = useCallback((type: 'definition' | 'exercise') => {
    // Check enrollment first
    if (!isEnrolled) {
      handlePromptEnrollment();
      return;
    }

    let position: {x: number, y: number} | undefined = undefined;
    if (graphRef.current) {
        try {
            const graphInstance = graphRef.current;
            
            // Get the canvas element from the graph instance
            const canvas = graphInstance.canvas?.(); // Get the canvas element
            if (canvas) {
              const rect = canvas.getBoundingClientRect();
              const { k: zoom = 1, x: transX = 0, y: transY = 0 } = graphInstance.zoom() || {};
              
              // Calculate center position in graph coordinates
              const centerX = (-transX + rect.width / 2) / zoom;
              const centerY = (-transY + rect.height / 2) / zoom;
              
              // Add small random offset to avoid overlapping
              position = { 
                x: centerX + (Math.random() - 0.5) * 50, 
                y: centerY + (Math.random() - 0.5) * 50 
              };
            } else {
              // Fallback: use default center position
              position = { x: 0, y: 0 };
            }
        } catch(e) { 
          console.warn("Could not get graph center for new node, using default position.", e);
          position = { x: 0, y: 0 };
        }
    }
    setNodeCreationType(type);
    setNodeCreationPosition(position);
    setShowNodeCreationModal(true);
  }, [isEnrolled, handlePromptEnrollment, setNodeCreationType, setNodeCreationPosition, setShowNodeCreationModal]);

  const handleNodeCreationSuccess = useCallback(async (nodeCode: string) => {
    setShowNodeCreationModal(false);
    showToast(`${nodeCreationType === 'definition' ? 'Definition' : 'Exercise'} "${nodeCode}" created! Refreshing...`, 'success');
    await refreshGraphAndSRSData(); 
    setTimeout(() => {
      const newlyCreatedNode = graphNodes.find(n => n.id === nodeCode);
      if (newlyCreatedNode) {
          handleNodeClick(newlyCreatedNode, false, 'navigation');
      }
    }, 700);
  }, [nodeCreationType, refreshGraphAndSRSData, handleNodeClick, graphNodes]);

  const filteredGraphNodes = useCallback(() => {
    let tempFilteredNodes = [...graphNodes];
    if (filteredNodeType !== 'all') {
        tempFilteredNodes = tempFilteredNodes.filter(node => node.type === filteredNodeType);
    }
    if (searchQuery) {
        const lowerQuery = searchQuery.toLowerCase();
        tempFilteredNodes = tempFilteredNodes.filter(node =>
            node.id.toLowerCase().includes(lowerQuery) || node.name.toLowerCase().includes(lowerQuery)
        );
    }
    return tempFilteredNodes.sort((a,b) => a.id.localeCompare(b.id));
  }, [graphNodes, filteredNodeType, searchQuery]);

  // FIX 2a: After editing a node (handleSubmitEdit function)
  const handleSubmitEdit = async () => {
    if (!selectedNode || !selectedNodeDetails) return;

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
      let updatedNode;

      if (selectedNode.type === 'definition') {
        const defDetails = selectedNodeDetails as Definition;
        let formDesc = (document.getElementById('description')as HTMLTextAreaElement)?.value || '';
        
        if (hasMultipleDescriptions()) {
          const descriptions = (typeof defDetails.description === 'string' && defDetails.description.includes('|||'))
                               ? defDetails.description.split('|||')
                               : (Array.isArray(defDetails.description) ? [...defDetails.description] : [String(defDetails.description)]);
          descriptions[selectedDefinitionIndex] = formDesc;
          formDesc = descriptions.join('|||');
        }
        
        const formNotes = (document.getElementById('notes') as HTMLTextAreaElement)?.value;
        const formRefs = (document.getElementById('references') as HTMLTextAreaElement)?.value.split('\n').filter(r => r.trim());

        updatedNode = await updateDefinition(defDetails.id, { 
          name: formName, 
          description: formDesc,
          notes: formNotes,
          references: formRefs,
          prerequisiteIds: selectedPrereqNumericIds,
          prerequisiteWeights: prerequisiteWeights,
        });
      } else { 
        const exDetails = selectedNodeDetails as Exercise;
        const formStatement = (document.getElementById('statement') as HTMLTextAreaElement)?.value;
        const formSolution = (document.getElementById('description') as HTMLTextAreaElement)?.value;
        const formHints = (document.getElementById('hints') as HTMLTextAreaElement)?.value;
        const formDifficulty = (document.getElementById('difficulty') as HTMLInputElement)?.value;
        const formVerifiable = (document.getElementById('verifiable') as HTMLInputElement)?.checked;
        const formResult = (document.getElementById('result') as HTMLInputElement)?.value;
        const formNotes = (document.getElementById('exerciseNotes') as HTMLTextAreaElement)?.value;

        updatedNode = await updateExercise(exDetails.id, {
          name: formName,
          statement: formStatement,
          description: formSolution,
          hints: formHints,
          notes: formNotes,
          difficulty: formDifficulty,
          verifiable: formVerifiable,
          result: formVerifiable ? formResult : undefined,
          prerequisiteIds: selectedPrereqNumericIds,
          prerequisiteWeights: prerequisiteWeights,
        });
      }

      const prerequisiteCodes: string[] = [];
      const prerequisiteWeightsWithCodes: Record<string, number> = {};

      if (updatedNode.prerequisites && Array.isArray(updatedNode.prerequisites)) {
        updatedNode.prerequisites.forEach((prereqCode: string) => {
          prerequisiteCodes.push(prereqCode);
        });
      } else if (selectedPrereqNumericIds.length > 0) {
        selectedPrereqNumericIds.forEach(numId => {
          const code = Array.from(codeToNumericIdMap.entries())
            .find(([_, id]) => id === numId)?.[0];
          if (code) {
            prerequisiteCodes.push(code);
            prerequisiteWeightsWithCodes[code] = prerequisiteWeights[numId] || 1.0;
          }
        });
      }

      const updatedNodeForGraph = {
        ...updatedNode,
        prerequisites: prerequisiteCodes,
        prerequisiteWeights: Object.keys(prerequisiteWeightsWithCodes).length > 0 
          ? prerequisiteWeightsWithCodes 
          : prerequisiteCodes.reduce((acc, code) => ({ ...acc, [code]: 1.0 }), {}),
      };

      setSelectedNodeDetails({ ...updatedNodeForGraph, type: selectedNode.type });

      setCurrentStructuralGraphData(prevData => {
        const newData = { ...prevData };
        const nodeCode = updatedNode.code;

        if (selectedNode.type === 'definition') {
          newData.definitions = {
            ...newData.definitions,
            [nodeCode]: { 
              ...newData.definitions[nodeCode], 
              ...updatedNodeForGraph 
            }
          };
        } else {
          newData.exercises = {
            ...newData.exercises,
            [nodeCode]: { 
              ...newData.exercises[nodeCode], 
              ...updatedNodeForGraph 
            }
          };
        }
        return newData;
      });

      setNodeDataCache(prevCache => new Map(prevCache).set(updatedNode.code, updatedNodeForGraph as ApiDefinition | ApiExercise));
      
      if (updatedNode.id && updatedNode.code) {
        setCodeToNumericIdMap(prevMap => new Map(prevMap).set(updatedNode.code, updatedNode.id));
      }

      setGraphRevision(prev => prev + 1);

      setIsEditMode(false);
      showToast(`${selectedNode.type === 'definition' ? 'Definition' : 'Exercise'} "${selectedNode.name}" updated.`, "success");
      // Remove any graph centering/fitting calls here

    } catch (error) {
      console.error("Error updating node:", error);
      showToast(error instanceof Error ? error.message : "Failed to update node.", "error");
    }
  };

  const currentDescriptionText = useCallback(() => {
    const detail = selectedNodeDetails as Definition;
    if (!detail || !('description' in detail)) return '';
    if (typeof detail.description === 'string') {
      return detail.description.includes('|||') ? detail.description.split('|||')[selectedDefinitionIndex] : detail.description;
    }
    if (Array.isArray(detail.description)) {
      return detail.description[selectedDefinitionIndex] || detail.description[0] || '';
    }
    return String(detail.description);
  }, [selectedNodeDetails, selectedDefinitionIndex]);

  const hasMultipleDescriptions = useCallback(() => {
    const detail = selectedNodeDetails as Definition;
    if (!detail || !('description' in detail)) return false;
    return (typeof detail.description === 'string' && detail.description.includes('|||')) || 
           (Array.isArray(detail.description) && detail.description.length > 1);
  }, [selectedNodeDetails]);

  const totalDescriptionsCount = useCallback(() => {
    const detail = selectedNodeDetails as Definition;
    if (!detail || !('description'in detail)) return 0;
    if (typeof detail.description === 'string') {
      return detail.description.includes('|||') ? detail.description.split('|||').length : 1;
    }
    return Array.isArray(detail.description) ? detail.description.length : 1;
  }, [selectedNodeDetails]);

  const navigateToNodeById = useCallback((nodeId: string, context: 'navigation' | 'study' = 'navigation') => {
    const targetNodeInCurrentGraph = graphNodes.find(n => n.id === nodeId);
  
    if (targetNodeInCurrentGraph) {
      let nodeForClick = targetNodeInCurrentGraph;
      if (graphRef.current && graphRef.current.graphData) {
        const d3Nodes = graphRef.current.graphData().nodes;
        const d3Node = d3Nodes.find((n: any) => n.id === nodeId);
        if (d3Node) nodeForClick = d3Node;
      }
      handleNodeClick(nodeForClick, false, context);
    } else if (mode === 'study' && currentStructuralGraphData.exercises?.[nodeId]) {
      showToast("Switching to Practice Mode to view exercise...", "info", 1500);
      changeMode('practice');
      
      setTimeout(() => {
        setGraphNodes(currentNodes => {
          const exerciseNode = currentNodes.find(n => n.id === nodeId);
          if (exerciseNode) {
              handleNodeClick(exerciseNode, false, context);
          } else {
            const exData = currentStructuralGraphData.exercises[nodeId];
            if (exData) {
              handleNodeClick({ id: exData.code, name: exData.name, type: 'exercise' }, false, context);
            } else {
              console.warn(`Exercise node ${nodeId} not found after switching to practice mode.`);
              showToast(`Could not navigate to exercise ${nodeId}.`, "error");
            }
          }
          return currentNodes;
        });
      }, 300);
    } else {
      console.warn(`Node with ID ${nodeId} not found.`);
      showToast(`Node ${nodeId} not found in the current view.`, "warning");
    }
  }, [graphNodes, handleNodeClick, mode, currentStructuralGraphData, changeMode]);

  // Handle going back to previous node
  const navigateBack = useCallback(() => {
    if (nodeHistory.length === 0) return;

    const newHistory = [...nodeHistory];
    const prevNodeId = newHistory.pop();

    if (prevNodeId) {
      setNodeHistory(newHistory);
      navigateToNodeById(prevNodeId);
    }
  }, [nodeHistory, navigateToNodeById]);

  // Handle node hover
  const handleNodeHover = useCallback((node: GraphNode | null) => {
    const newHighlightNodes = new Set<string>();
    const newHighlightLinks = new Set<string>();
    if (node?.id) {
        newHighlightNodes.add(node.id);
        graphLinks.forEach(link => {
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
  }, [graphLinks]);

  const navigateBackHistory = useCallback(() => {
    if (nodeHistory.length === 0) return;
    const prevNodeId = nodeHistory[nodeHistory.length - 1];
    setNodeHistory(prev => prev.slice(0, -1));
    navigateToNodeById(prevNodeId);
  }, [nodeHistory, navigateToNodeById]);

  const availableDefinitionsForModals = useMemo(() => {
    return graphNodes
      .filter(node => node.type === 'definition') // Prerequisites can only be definitions.
      .map(node => {
          const numericId = codeToNumericIdMap.get(node.id);
          if (!numericId) {
            // This warning can be noisy during initial load, but is useful for debugging.
            // console.warn(`No numeric ID found for definition node code: ${node.id}`);
            return null;
          }
          return {
              code: node.id,
              name: node.name,
              numericId: numericId
          };
      })
      .filter((node): node is NonNullable<typeof node> => node !== null)
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [graphNodes, codeToNumericIdMap]);

  // Memoize credit flow animations to prevent unnecessary re-renders
  const memoizedCreditFlowAnimations = useMemo(() => {
    return srs.state.creditFlowAnimations;
  }, [srs.state.creditFlowAnimations]);

  const handleStartStudyMode = useCallback(() => {
    if (!isEnrolled) {
      handlePromptEnrollment();
      return;
    }
    setShowStudyModeModal(true);
  }, [isEnrolled, handlePromptEnrollment]);

  const handleManualFit = useCallback(() => {
    smartFitToScreen(true); // Force fit
  }, [smartFitToScreen]);

  return (
    <MathJaxProvider>
      <div className="h-full flex flex-col overflow-hidden bg-gray-100">
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
          isOpen={showStudyModeModal && isEnrolled}
          onClose={() => setShowStudyModeModal(false)}
          domainId={parseInt(subjectMatterId, 10)}
          onNavigateToNode={(nodeCode, context) => navigateToNodeById(nodeCode, context)}
        />
        <TopControls
          subjectMatterId={domainName}
          mode={mode}
          onModeChange={changeMode}
          onBack={onBack}
          labelDisplayMode={labelDisplayMode}
          onCycleLabelDisplay={cycleLabelDisplay}
          onZoomToFit={handleManualFit}
          onCreateDefinition={() => isEnrolled ? createNewNode('definition') : handlePromptEnrollment()}
          onCreateExercise={() => isEnrolled ? createNewNode('exercise') : handlePromptEnrollment()}
          onStartStudy={handleStartStudyMode}
          positionsChanged={positionsChanged}
          isSavingPositions={isSavingPositions}
          onSavePositions={savePositions}
          isEnrolled={isEnrolled}
          onEnroll={handlePromptEnrollment}
        />
        <div className="flex flex-1 overflow-hidden relative" ref={containerRef}>
          {/* FIX 6: Add class names to panels for dimension tracking */}
          <div className={`left-panel-class absolute top-0 left-0 h-full z-20 bg-white border-r shadow-lg transition-transform duration-300 ease-in-out ${showLeftPanel ? 'translate-x-0 w-64' : '-translate-x-full w-64'}`}>
            {showLeftPanel && (
              <LeftPanel
                isVisible={showLeftPanel}
                onToggle={toggleLeftPanel}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                filteredNodeType={filteredNodeType}
                onFilterChange={setFilteredNodeType}
                filteredNodes={filteredGraphNodes()}
                selectedNodeId={selectedNode?.id || null}
                onNodeClick={handleNodeClick}
                mode={mode}
              />
            )}
          </div>
          {!showLeftPanel && <LeftPanelToggle onClick={toggleLeftPanel} />}
          <div className="flex-1 bg-gray-50 overflow-hidden relative">
            {(isProcessingData || isRefreshing) ? (
              <div className="flex items-center justify-center h-full text-gray-500">Loading graph data... <RefreshCw className="ml-2 animate-spin" size={18}/></div>
            ) : graphNodes.length > 0 ? (
              <GraphContainer
                graphRef={graphRef}
                graphNodes={graphNodes}
                graphLinks={graphLinks}
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
                <p className="text-xs mt-1">Try creating some nodes or refreshing.</p>
                 <Button onClick={refreshGraphAndSRSData} variant="outline" size="sm" className="mt-4">
                    <RefreshCw size={14} className="mr-1.5"/> Refresh Graph
                 </Button>
              </div>
            )}
            {!isProcessingData && !isRefreshing && graphNodes.length > 0 && <GraphLegend mode={mode} hasExercises={graphNodes.some(n => n.type === 'exercise')} />}
            {/* Only show enrollment modal for public domains when enrollment status is determined */}
            {isEnrolled === false && domainData?.privacy === 'public' && (
              <EnrollmentModal
                isOpen={showEnrollmentModal}
                onClose={() => setShowEnrollmentModal(false)}
                domain={domainData}
                onEnrollmentSuccess={handleEnrollment}
                onContinueWithoutEnrollment={handleContinueWithoutEnrollment}
              />
            )}
          </div>
          {/* FIX 6: Add class names to panels for dimension tracking */}
          <div className={`right-panel-class absolute top-0 right-0 h-full z-20 bg-white border-l shadow-lg transition-transform duration-300 ease-in-out ${showRightPanel && selectedNode ? 'translate-x-0 w-80 md:w-96' : 'translate-x-full w-80 md:w-96'}`}>
            {showRightPanel && selectedNode && ( 
                <RightPanel
                  isVisible={showRightPanel}
                  onToggle={toggleRightPanel}
                  selectedNode={selectedNode}
                  selectedNodeDetails={selectedNodeDetails}
                  isEditMode={isEditMode}
                  onToggleEditMode={() => setIsEditMode(!isEditMode)}
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
