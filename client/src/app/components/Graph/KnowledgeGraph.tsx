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

  // FIX: Add refs to prevent infinite loops
  const lastProcessedDataKey = useRef<string>('');
  const refreshTimeoutRef = useRef<NodeJS.Timeout>();
  const isInitializedRef = useRef<boolean>(false);

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

  const changeMode = useCallback((newMode: AppMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    setSelectedNode(null);
    setSelectedNodeDetails(null);
    setShowRightPanel(false);
    setHighlightNodes(new Set());
    setHighlightLinks(new Set()); 
    setExerciseAttemptCompleted(false);
  }, [mode]);

  const handleNodeClick = useCallback(async (nodeOnClick: GraphNode, isRefresh: boolean = false) => {
    if (!nodeOnClick || !nodeOnClick.id) return;

    // following two lines are quite important do not delete
    // they open the right panel after you click the node
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
      let apiDetails: ApiDefinition | ApiExercise | null = null;
      const code = nodeOnClick.id;

      // Check cache first
      apiDetails = nodeDataCache.get(code) || null;
      
      // If not in cache, fetch from the API
      if (!apiDetails) {
        if (nodeOnClick.type === 'definition') {
          const res = await getDefinitionByCode(code);
          apiDetails = Array.isArray(res) ? res[0] : res;
        } else {
          const res = await getExerciseByCode(code);
          apiDetails = Array.isArray(res) ? res[0] : res;
        }
        
        if (apiDetails) {
          // Update cache for next time
          setNodeDataCache(prev => new Map(prev).set(code, apiDetails!));
          setCodeToNumericIdMap(prev => new Map(prev).set(code, apiDetails!.id));
        }
      }

      // Convert API details to local format and set the state for the RightPanel
      if (apiDetails) {
        setSelectedNodeDetails({
          ...apiDetails,
          type: nodeOnClick.type,
        } as Definition | Exercise);

        // Reset UI state for the panel
        setShowDefinition(mode !== 'study' || nodeOnClick.type !== 'definition');
        setShowSolution(false);
        setShowHints(false);
        setSelectedDefinitionIndex(0);

        // Find and set related exercises for the definition
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
      if (graphRef.current && typeof nodeOnClick.x === 'number' && typeof nodeOnClick.y === 'number') {
        graphRef.current.centerAt(nodeOnClick.x, nodeOnClick.y, 800);
        graphRef.current.zoom(2.5, 800);
      }
    }
  }, [selectedNode, mode, currentStructuralGraphData.exercises, nodeDataCache]);

  const refreshGraphAndSRSData = useCallback(async () => {
    setIsProcessingData(true);
    setIsRefreshing(true);
    showToast("Refreshing graph data...", "info", 2000);
    try {
      const domainIdNum = parseInt(subjectMatterId, 10);
      if (isNaN(domainIdNum)) throw new Error("Invalid domain ID for refresh.");

      await loadComprehensiveDomainData(domainIdNum);
      // Only refresh SRS data if user is enrolled
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

  // Build graph data effect
  useEffect(() => {
    try {
      // Create stable data key to prevent unnecessary re-processing
      const dataKey = `${Object.keys(currentStructuralGraphData.definitions || {}).length}-${Object.keys(currentStructuralGraphData.exercises || {}).length}-${mode}-${srs.state.lastUpdated}`;
      
      if (lastProcessedDataKey.current === dataKey) {
        console.log("Skipping graph processing - data unchanged:", dataKey);
        return; // Skip if data hasn't actually changed
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
        
        // Create links with weights
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
          
          // Create links with weights for exercises
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
      
      console.log(`Generated ${nodes.length} nodes and ${links.length} links for data key: ${dataKey}`);
      
      setGraphNodes(nodes);
      setGraphLinks(links);
      
      // Always set processing to false at the end
      setIsProcessingData(false);
      
    } catch (error) {
      console.error("Error processing graph data:", error);
      setIsProcessingData(false); // Ensure we clear loading state on error
      showToast("Error processing graph data", "error");
    }
  }, [currentStructuralGraphData, mode, srs.state.lastUpdated, codeToNumericIdMap, srs]);

  useEffect(() => {
    if (!isProcessingData && graphRef.current && graphNodes.length > 0) {
      setTimeout(() => {
        if (graphRef.current) graphRef.current.zoomToFit(400, 50);
      }, 300);
    }
  }, [isProcessingData, graphNodes.length]);

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

  // Debounced node refresh
  const refreshNodeAfterReview = useCallback(
    debounce(async (nodeToRefresh: GraphNode) => {
      if (nodeToRefresh && nodeToRefresh.id) {
        console.log("Refreshing node after review:", nodeToRefresh.id);
        await handleNodeClick(nodeToRefresh, true);
      }
    }, 300),
    [handleNodeClick]
  );

  // Updated review definition handler
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

  // Updated exercise rating handler  
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

  // Updated status change handler
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
          handleNodeClick(newlyCreatedNode);
      } else {
        console.warn(`Node ${nodeCode} not immediately found in graphNodes state after creation. Details might appear on next interaction or full refresh selection.`);
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

  const handleSubmitEdit = async () => {
    if (!selectedNode || !selectedNodeDetails) return;
    
    // ... (The existing code to get data from the form remains the same)
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
      let updatedNode; // Variable to hold the response from the API

      if (selectedNode.type === 'definition') {
        const defDetails = selectedNodeDetails as Definition;
        let formDesc = (document.getElementById('description') as HTMLTextAreaElement)?.value || '';
        
        if (hasMultipleDescriptions()) {
          const descriptions = (typeof defDetails.description === 'string' && defDetails.description.includes('|||'))
                               ? defDetails.description.split('|||')
                               : (Array.isArray(defDetails.description) ? [...defDetails.description] : [String(defDetails.description)]);
          descriptions[selectedDefinitionIndex] = formDesc;
          formDesc = descriptions.join('|||');
        }
        
        const formNotes = (document.getElementById('notes') as HTMLTextAreaElement)?.value;
        const formRefs = (document.getElementById('references') as HTMLTextAreaElement)?.value.split('\n').filter(r => r.trim());

        // CAPTURE the response from the API call
        updatedNode = await updateDefinition(defDetails.id, { 
          name: formName, 
          description: formDesc,
          notes: formNotes,
          references: formRefs,
          prerequisiteIds: selectedPrereqNumericIds,
          prerequisiteWeights: prerequisiteWeights,
        });
        showToast(`Definition "${selectedNode.name}" updated.`, "success");
      } else { 
        const exDetails = selectedNodeDetails as Exercise;
        const formStatement = (document.getElementById('statement') as HTMLTextAreaElement)?.value;
        const formSolution = (document.getElementById('description') as HTMLTextAreaElement)?.value;
        const formHints = (document.getElementById('hints') as HTMLTextAreaElement)?.value;
        const formDifficulty = (document.getElementById('difficulty') as HTMLInputElement)?.value;
        const formVerifiable = (document.getElementById('verifiable') as HTMLInputElement)?.checked;
        const formResult = (document.getElementById('result') as HTMLInputElement)?.value;
        const formNotes = (document.getElementById('exerciseNotes') as HTMLTextAreaElement)?.value;

        // CAPTURE the response from the API call
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
        showToast(`Exercise "${selectedNode.name}" updated.`, "success");
      }
      
      // ---- NEW REFRESH LOGIC ----

      // 1. Immediately update the right panel's details
      setSelectedNodeDetails({ ...updatedNode, type: selectedNode.type });

      // 2. Update the node in the main graph data structure
      setCurrentStructuralGraphData(prevData => {
        const newData = { ...prevData };
        const nodeCode = updatedNode.code;

        if (selectedNode.type === 'definition') {
          newData.definitions[nodeCode] = { ...newData.definitions[nodeCode], ...updatedNode };
        } else {
          newData.exercises[nodeCode] = { ...newData.exercises[nodeCode], ...updatedNode };
        }
        return newData;
      });

      // 3. Update the cache to prevent stale data on re-click
      setNodeDataCache(prevCache => new Map(prevCache).set(updatedNode.code, updatedNode));
      
      // 4. Switch back to view mode
      setIsEditMode(false);

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

  const navigateToNodeById = useCallback((nodeId: string) => {
    const targetNodeInCurrentGraph = graphNodes.find(n => n.id === nodeId);
  
    if (targetNodeInCurrentGraph) {
      // Node exists in current graph
      let nodeForClick = targetNodeInCurrentGraph;
      if (graphRef.current && graphRef.current.graphData) {
        const d3Nodes = graphRef.current.graphData().nodes;
        const d3Node = d3Nodes.find((n: any) => n.id === nodeId);
        if (d3Node) nodeForClick = d3Node;
      }
      handleNodeClick(nodeForClick);
    } else if (mode === 'study' && currentStructuralGraphData.exercises?.[nodeId]) {
      // Target is an exercise, and we are in study mode. Switch to practice mode.
      showToast("Switching to Practice Mode to view exercise...", "info", 1500);
      changeMode('practice');
      
      // Wait for mode change and graphNodes to update
      setTimeout(() => {
        // We must re-read graphNodes from state inside the timeout
        setGraphNodes(currentNodes => {
          const exerciseNode = currentNodes.find(n => n.id === nodeId);
          if (exerciseNode) {
              handleNodeClick(exerciseNode);
          } else {
            // This can happen if the component re-renders faster than state update.
            // We can try to build the node from the structural data.
            const exData = currentStructuralGraphData.exercises[nodeId];
            if (exData) {
              handleNodeClick({ id: exData.code, name: exData.name, type: 'exercise' });
            } else {
              console.warn(`Exercise node ${nodeId} not found after switching to practice mode.`);
              showToast(`Could not navigate to exercise ${nodeId}.`, "error");
            }
          }
          return currentNodes;
        });
      }, 300); // A small delay to allow react to re-render with the new mode
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
        />
        <TopControls
          subjectMatterId={domainName}
          mode={mode}
          onModeChange={changeMode}
          onBack={onBack}
          labelDisplayMode={labelDisplayMode}
          onCycleLabelDisplay={cycleLabelDisplay}
          onZoomToFit={() => graphRef.current?.zoomToFit(400)}
          onCreateDefinition={() => isEnrolled ? createNewNode('definition') : handlePromptEnrollment()}
          onCreateExercise={() => isEnrolled ? createNewNode('exercise') : handlePromptEnrollment()}
          onStartStudy={() => isEnrolled ? setShowStudyModeModal(true) : handlePromptEnrollment()}
          positionsChanged={positionsChanged}
          isSavingPositions={isSavingPositions}
          onSavePositions={savePositions}
          isEnrolled={isEnrolled}
          onEnroll={handlePromptEnrollment}
        />
        <div className="flex flex-1 overflow-hidden relative">
          <div className={`absolute top-0 left-0 h-full z-20 bg-white border-r shadow-lg transition-transform duration-300 ease-in-out ${showLeftPanel ? 'translate-x-0 w-64' : '-translate-x-full w-64'}`}>
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
          <div className={`absolute top-0 right-0 h-full z-20 bg-white border-l shadow-lg transition-transform duration-300 ease-in-out ${showRightPanel && selectedNode ? 'translate-x-0 w-80 md:w-96' : 'translate-x-full w-80 md:w-96'}`}>
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
