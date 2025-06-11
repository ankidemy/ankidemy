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
} from './utils/types'; // DefinitionRequest and ExerciseRequest from lib/api are used by NodeCreationModal
import GraphContainer from './utils/GraphContainer';
import GraphLegend from './utils/GraphLegend';
import TopControls from './panels/TopControls';
import LeftPanel from './panels/LeftPanel';
import LeftPanelToggle from './panels/LeftPanelToggle';
import RightPanel from './panels/RightPanel';
import NodeCreationModal from './NodeCreationModal';
import StudyModeModal from './StudyModeModal';
import { showToast } from '@/app/components/core/ToastNotification';

// ==============================================================================
// 1. DEBOUNCE UTILITY - Add this at the top of KnowledgeGraph.tsx
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
  const [showNodeLabels, setShowNodeLabels] = useState(true);
  
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
  const [personalNotes, setPersonalNotes] = useState<Record<string, string>>({});
  const [relatedExercises, setRelatedExercises] = useState<string[]>([]);
  const [filteredNodeType, setFilteredNodeType] = useState<FilteredNodeType>('all');
  const [selectedDefinitionIndex, setSelectedDefinitionIndex] = useState(0);
  
  const [showNodeCreationModal, setShowNodeCreationModal] = useState(false);
  const [nodeCreationType, setNodeCreationType] = useState<'definition' | 'exercise'>('definition');
  const [nodeCreationPosition, setNodeCreationPosition] = useState<{x: number, y: number} | undefined>(undefined);
  const [positionsChanged, setPositionsChanged] = useState(false);
  const [isSavingPositions, setIsSavingPositions] = useState(false);
  
  const [currentStructuralGraphData, setCurrentStructuralGraphData] = useState(initialGraphData);

  const [codeToNumericIdMap, setCodeToNumericIdMap] = useState<Map<string, number>>(new Map());
  const [nodeDataCache, setNodeDataCache] = useState<Map<string, ApiDefinition | ApiExercise>>(new Map());

  const nodePositions = useRef<Record<string, { x: number; y: number }>>({});
  const [showStudyModeModal, setShowStudyModeModal] = useState(false);

  // State for exercise review flow
  const [exerciseAttemptCompleted, setExerciseAttemptCompleted] = useState(false);

  // FIX: Add refs to prevent infinite loops
  const lastProcessedDataKey = useRef<string>('');
  const refreshTimeoutRef = useRef<NodeJS.Timeout>();


  useEffect(() => {
    if (subjectMatterId && !isNaN(parseInt(subjectMatterId))) {
      const domainId = parseInt(subjectMatterId);
      srs.setCurrentDomain(domainId);
      srs.loadDomainData(domainId).then(() => {
         console.log("Initial SRS data loaded for domain:", domainId);
      });
    }
  }, [subjectMatterId, srs.setCurrentDomain, srs.loadDomainData]);

  useEffect(() => {
    setCurrentStructuralGraphData(initialGraphData);
    setIsProcessingData(true);
  }, [initialGraphData]);
  
  const loadComprehensiveDomainData = useCallback(async (domainId: number) => {
    try {
      console.log("Loading comprehensive domain data for:", domainId);
      
      const [allDefinitions, allExercises] = await Promise.all([
        getDomainDefinitions(domainId),
        getDomainExercises(domainId)
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
    }
  }, []);

  useEffect(() => {
    const domainId = parseInt(subjectMatterId, 10);
    if (!isNaN(domainId)) {
      loadComprehensiveDomainData(domainId);
    }
  }, [subjectMatterId, loadComprehensiveDomainData]);

const handleNodeClick = useCallback(async (nodeOnClick: GraphNode, isRefresh: boolean = false) => {
  if (!nodeOnClick || !nodeOnClick.id) return;

  if (!isRefresh && selectedNode && selectedNode.id !== nodeOnClick.id) {
    setNodeHistory(prev => [...prev, selectedNode.id]);
  }

  setSelectedNode(nodeOnClick);
  setIsEditMode(false);
  setAnswerFeedback(null);
  setUserAnswer('');
  setExerciseAttemptCompleted(false);

  try {
    let details: Definition | Exercise | null = null;
    const code = nodeOnClick.id;

    // Check cache first (from HEAD)
    let apiDetails: ApiDefinition | ApiExercise | null = nodeDataCache.get(nodeOnClick.id) || null;
    
    // Determine what to fetch based on mode and node type (from incoming)
    if (mode === 'practice' && nodeOnClick.type === 'definition') {
      // In practice mode, when clicking a definition node, check for related exercises first
      if (currentStructuralGraphData.exercises) { // Use currentStructuralGraphData from HEAD
        const relatedExCodes = Object.values(currentStructuralGraphData.exercises)
          .filter(ex => ex.prerequisites?.includes(code))
          .map(ex => ex.code);
        
        if (relatedExCodes.length > 0) {
          // If there are related exercises, fetch the first one
          const exerciseCode = relatedExCodes[0];
          try {
            apiDetails = nodeDataCache.get(exerciseCode) || null;
            if (!apiDetails) {
              const exerciseResponse = await getExerciseByCode(exerciseCode);
              apiDetails = Array.isArray(exerciseResponse) ? exerciseResponse[0] : exerciseResponse;
              if (apiDetails) {
                setNodeDataCache(prev => new Map(prev).set(exerciseCode, apiDetails!));
                setCodeToNumericIdMap(prev => new Map(prev).set(exerciseCode, apiDetails!.id));
              }
            }
            
            if (apiDetails) {
              console.log(`Showing related exercise ${exerciseCode} instead of definition ${code} in practice mode`);
              // Store related exercises
              setRelatedExercises(relatedExCodes);
            }
          } catch (exerciseError) {
            console.warn(`Could not fetch related exercise for ${code}:`, exerciseError);
            // Fall back to showing the definition
            apiDetails = null;
          }
        }
      }
    }
    
    // If no specific exercise was found or we're not in practice mode, fetch the original node
    if (!apiDetails) {
      if (nodeOnClick.type === 'definition') {
        const res = await getDefinitionByCode(nodeOnClick.id);
        apiDetails = Array.isArray(res) ? res[0] : res;
      } else {
        const res = await getExerciseByCode(nodeOnClick.id);
        apiDetails = Array.isArray(res) ? res[0] : res;
      }
      
      if (apiDetails) {
        setNodeDataCache(prev => new Map(prev).set(nodeOnClick.id, apiDetails!));
        setCodeToNumericIdMap(prev => new Map(prev).set(nodeOnClick.id, apiDetails!.id));
      }
    }

    // Convert API details to local format (from HEAD)
    if (apiDetails) {
      const localDetails: Definition | Exercise = {
        ...apiDetails,
        code: apiDetails.code, 
        name: apiDetails.name,
        type: nodeOnClick.type,
        description: apiDetails.description,
        ...(nodeOnClick.type === 'exercise' && { 
          difficulty: (apiDetails as ApiExercise).difficulty || '3',
          statement: (apiDetails as ApiExercise).statement,
          hints: (apiDetails as ApiExercise).hints,
          verifiable: (apiDetails as ApiExercise).verifiable,
          result: (apiDetails as ApiExercise).result,
        }),
        prerequisites: apiDetails.prerequisites || [],
      };
      setSelectedNodeDetails(localDetails);

      setShowDefinition(mode !== 'study' || nodeOnClick.type !== 'definition');
      setShowSolution(false);
      setShowHints(false);
      setSelectedDefinitionIndex(0);

      // Handle related exercises (adapted from both versions)
      if (nodeOnClick.type === 'definition' && currentStructuralGraphData.exercises && !relatedExercises.length) {
        const defCode = nodeOnClick.id;
        const relEx = Object.values(currentStructuralGraphData.exercises)
          .filter(ex => ex.prerequisites?.includes(defCode))
          .map(ex => ex.code);
        setRelatedExercises(relEx);
      } else if (nodeOnClick.type === 'exercise') {
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
}, [selectedNode, mode, currentStructuralGraphData.exercises, nodeDataCache, relatedExercises.length]);

  const refreshGraphAndSRSData = useCallback(async () => {
    setIsProcessingData(true);
    setIsRefreshing(true);
    showToast("Refreshing graph data...", "info", 2000);
    try {
      const domainIdNum = parseInt(subjectMatterId, 10);
      if (isNaN(domainIdNum)) throw new Error("Invalid domain ID for refresh.");

      await loadComprehensiveDomainData(domainIdNum);
      await srs.refreshDomainData();
      
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
  }, [subjectMatterId, srs, selectedNode, handleNodeClick, loadComprehensiveDomainData, nodeDataCache]);

  // ==============================================================================
  // 5. REPLACE THE GRAPH BUILDING USEEFFECT
  // ==============================================================================

const useEffect(() => {
    // FIX: Create stable data key to prevent unnecessary re-processing
    const dataKey = `${Object.keys(currentStructuralGraphData.definitions || {}).length}-${Object.keys(currentStructuralGraphData.exercises || {}).length}-${mode}-${srs.state.lastUpdated}`;
    
    if (lastProcessedDataKey.current === dataKey) {
      return; // Skip if data hasn't actually changed
    }
    
    console.log("Processing graph data with key:", dataKey);
    setIsProcessingData(true);
    lastProcessedDataKey.current = dataKey;
    
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];

    // Process definitions (combining both approaches)
    Object.values(currentStructuralGraphData.definitions || {}).forEach(def => {
      if (!def || !def.code || !def.name) return;
      
      const numericId = codeToNumericIdMap.get(def.code);
      const progress = numericId ? srs.getNodeProgress(numericId, 'definition') : null;
      
      nodes.push({
        id: def.code, // Use code as ID (from a02e2d1)
        name: def.name,
        type: 'definition',
        isRootDefinition: !def.prerequisites || def.prerequisites.length === 0,
        xPosition: def.xPosition,
        yPosition: def.yPosition,
        fx: def.xPosition,
        fy: def.yPosition,
        // SRS properties from HEAD
        status: progress?.status || 'fresh',
        isDue: progress ? isNodeDue(progress.nextReview) : false,
        daysUntilReview: progress ? calculateDaysUntilReview(progress.nextReview) : null,
        progress: progress || null,
        // Additional properties from a02e2d1
        domainId: def.domainId,
        prerequisites: def.prerequisites
      });
      
      // Create links with weights (from HEAD)
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

    // Process exercises (only in practice mode) - combining both approaches
    if (mode === 'practice' && currentStructuralGraphData.exercises) {
      Object.values(currentStructuralGraphData.exercises).forEach(ex => {
        if (!ex || !ex.code || !ex.name) return;
        
        const numericId = codeToNumericIdMap.get(ex.code);
        const progress = numericId ? srs.getNodeProgress(numericId, 'exercise') : null;
        
        nodes.push({
          id: ex.code, // Use code as ID (from a02e2d1)
          name: ex.name,
          type: 'exercise',
          difficulty: ex.difficulty,
          xPosition: ex.xPosition,
          yPosition: ex.yPosition,
          fx: ex.xPosition,
          fy: ex.yPosition,
          // SRS properties from HEAD
          status: progress?.status || 'fresh',
          isDue: progress ? isNodeDue(progress.nextReview) : false,
          daysUntilReview: progress ? calculateDaysUntilReview(progress.nextReview) : null,
          progress: progress || null,
          // Additional properties from a02e2d1
          domainId: ex.domainId,
          prerequisites: ex.prerequisites
        });
        
        // Create links with weights for exercises (from HEAD with a02e2d1 validation)
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
    
    console.log(`Generated ${links.length} links for data key: ${dataKey}`);
    
    setGraphNodes(nodes);
    setGraphLinks(links);
    setIsProcessingData(false);
  }, [currentStructuralGraphData, mode, srs.state.lastUpdated, codeToNumericIdMap]);

// Handle node click - resolved version
const handleNodeClick = useCallback(async (nodeOnClick: GraphNode, isRefresh: boolean = false) => {
  if (!nodeOnClick || !nodeOnClick.id) return;

  if (!isRefresh && selectedNode && selectedNode.id !== nodeOnClick.id) {
    setNodeHistory(prev => [...prev, selectedNode.id]);
  }

  setSelectedNode(nodeOnClick);
  setIsEditMode(false);
  setAnswerFeedback(null);
  setUserAnswer('');
  setExerciseAttemptCompleted(false);

  try {
    let details: Definition | Exercise | null = null;
    const code = nodeOnClick.id;

    // Check cache first (from HEAD)
    let apiDetails: ApiDefinition | ApiExercise | null = nodeDataCache.get(nodeOnClick.id) || null;
    
    // Determine what to fetch based on mode and node type (combining both approaches)
    if (mode === 'practice' && nodeOnClick.type === 'definition') {
      // In practice mode, when clicking a definition node, check for related exercises first
      if (currentStructuralGraphData.exercises) {
        console.log("Checking for related exercises to definition:", code);
        console.log("Available exercises:", Object.values(currentStructuralGraphData.exercises));
        
        // Fix from a02e2d1: Look for exercises that have this definition as prerequisite
        const relatedExCodes = Object.values(currentStructuralGraphData.exercises)
          .filter(ex => ex.prerequisites?.includes(code))
          .map(ex => ex.code);
        
        console.log("Found related exercises:", relatedExCodes);
        
        if (relatedExCodes.length > 0) {
          console.log("encontre");  
          // If there are related exercises, fetch the first one
          const exerciseCode = relatedExCodes[0];
          try {
            apiDetails = nodeDataCache.get(exerciseCode) || null;
            if (!apiDetails) {
              const exerciseResponse = await getExerciseByCode(exerciseCode);
              apiDetails = Array.isArray(exerciseResponse) ? exerciseResponse[0] : exerciseResponse;
              if (apiDetails) {
                setNodeDataCache(prev => new Map(prev).set(exerciseCode, apiDetails!));
                setCodeToNumericIdMap(prev => new Map(prev).set(exerciseCode, apiDetails!.id));
              }
            }
            
            if (apiDetails) {
              console.log(`Showing related exercise ${exerciseCode} instead of definition ${code} in practice mode`);
              // Store related exercises
              setRelatedExercises(relatedExCodes);
            }
          } catch (exerciseError) {
            console.warn(`Could not fetch related exercise for ${code}:`, exerciseError);
            // Fall back to showing the definition
            apiDetails = null;
          }
        }
      }
    }
    
    // If no specific exercise was found or we're not in practice mode, fetch the original node
    if (!apiDetails) {
      if (nodeOnClick.type === 'definition') {
        const res = await getDefinitionByCode(nodeOnClick.id);
        apiDetails = Array.isArray(res) ? res[0] : res;
      } else {
        const res = await getExerciseByCode(nodeOnClick.id);
        apiDetails = Array.isArray(res) ? res[0] : res;
      }
      
      if (apiDetails) {
        setNodeDataCache(prev => new Map(prev).set(nodeOnClick.id, apiDetails!));
        setCodeToNumericIdMap(prev => new Map(prev).set(nodeOnClick.id, apiDetails!.id));
      }
    }

    // Convert API details to local format (from HEAD)
    if (apiDetails) {
      const localDetails: Definition | Exercise = {
        ...apiDetails,
        code: apiDetails.code, 
        name: apiDetails.name,
        type: nodeOnClick.type,
        description: apiDetails.description,
        ...(nodeOnClick.type === 'exercise' && { 
          difficulty: (apiDetails as ApiExercise).difficulty || '3',
          statement: (apiDetails as ApiExercise).statement,
          hints: (apiDetails as ApiExercise).hints,
          verifiable: (apiDetails as ApiExercise).verifiable,
          result: (apiDetails as ApiExercise).result,
        }),
        prerequisites: apiDetails.prerequisites || [],
      };
      setSelectedNodeDetails(localDetails);

      setShowDefinition(mode !== 'study' || nodeOnClick.type !== 'definition');
      setShowSolution(false);
      setShowHints(false);
      setSelectedDefinitionIndex(0);

      // Handle related exercises (adapted from both versions)
      if (nodeOnClick.type === 'definition' && currentStructuralGraphData.exercises && !relatedExercises.length) {
        const defCode = nodeOnClick.id;
        const relEx = Object.values(currentStructuralGraphData.exercises)
          .filter(ex => ex.prerequisites?.includes(defCode))
          .map(ex => ex.code);
        setRelatedExercises(relEx);
      } else if (nodeOnClick.type === 'exercise') {
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
}, [selectedNode, mode, currentStructuralGraphData.exercises, nodeDataCache, relatedExercises.length]);

  useEffect(() => {
    if (!isProcessingData && graphRef.current && graphNodes.length > 0) {
      setTimeout(() => {
        if (graphRef.current) graphRef.current.zoomToFit(400, 50);
      }, 300);
    }
  }, [isProcessingData, graphNodes.length]);

  // FIX: Add cleanup effect
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

  // Handle definition edit form submission
  const handleDefinitionEditSubmit = async () => {
    if (!selectedNode || !selectedNodeDetails || selectedNode.type !== 'definition') return;

    try {
      // Get form values
      const nameInput = document.getElementById('name') as HTMLInputElement;
      const descriptionInput = document.getElementById('description') as HTMLTextAreaElement;
      const notesInput = document.getElementById('notes') as HTMLTextAreaElement;
      const referencesInput = document.getElementById('references') as HTMLTextAreaElement;

      const name = nameInput?.value || selectedNodeDetails.name;

      // Handle multiple descriptions
      let description = descriptionInput?.value || '';
      // If we're editing a specific version of multiple descriptions
      if (hasMultipleDescriptions()) {
        let descriptions = [];

        if (typeof selectedNodeDetails.description === 'string' && selectedNodeDetails.description.includes('|||')) {
          descriptions = selectedNodeDetails.description.split('|||');
        } else if (Array.isArray(selectedNodeDetails.description)) {
          descriptions = [...selectedNodeDetails.description];
        }

        // Update only the current description
        descriptions[selectedDefinitionIndex] = description;
        description = descriptions.join('|||');  // Join with delimiter for API
      }

      const notes = notesInput?.value || '';
      const references = referencesInput?.value.split('\n').filter(r => r.trim() !== '');

      // Get selected prerequisites
      const prerequisiteSelectElement = document.getElementById('prerequisites') as HTMLSelectElement;
      const selectedPrereqCodes = Array.from(prerequisiteSelectElement?.selectedOptions || [])
        .map(option => option.value);

      console.log("Selected prerequisite codes:", selectedPrereqCodes);

      // Map selected codes to their numeric IDs for the API
      const prerequisiteIds: number[] = [];
      for (const code of selectedPrereqCodes) {
        try {
          const id = await getDefinitionIdByCode(code);
          prerequisiteIds.push(id);
        } catch (error) {
          console.error(`Failed to get ID for prerequisite code ${code}`, error);
          alert(`Error: Could not find prerequisite definition '${code}'. It will not be saved.`);
        }
      }

      // Prepare update data
      const updateData = {
        name,
        description,
        notes,
        references,
        prerequisiteIds
      };

      // Get definition ID from node ID
      const definitionCode = selectedNode.id;
      const definitionId = await getDefinitionIdByCode(definitionCode);

      // Update the definition
      const updatedDef = await updateDefinition(definitionId, updateData);

      // Success message
      console.log("Definition updated successfully:", updatedDef);

      // Refresh the node details immediately
      if (updatedDef) {
        updatedDef.type = 'definition';
        setSelectedNodeDetails(updatedDef);
      } else {
        // If the API doesn't return the updated object, fetch it
        const refreshedDef = await getDefinitionByCode(definitionCode);
        const details = Array.isArray(refreshedDef) ? refreshedDef[0] : refreshedDef;
        if (details) {
          details.type = 'definition';
          setSelectedNodeDetails(details);
        }
      }

      // Refresh graph to update other nodes if needed
      refreshGraph();

      // Exit edit mode
      setIsEditMode(false);
    } catch (error) {
      console.error('Failed to update definition:', error);
      alert(`Failed to update definition: ${error.message || 'Unknown error'}`);
    }
  };

  // Handle exercise edit form submission
  const handleExerciseEditSubmit = async () => {
    if (!selectedNode || !selectedNodeDetails || selectedNode.type !== 'exercise') return;

    try {
      // Get form values
      const nameInput = document.getElementById('name') as HTMLInputElement;
      const statementInput = document.getElementById('statement') as HTMLTextAreaElement;
      const descriptionInput = document.getElementById('description') as HTMLTextAreaElement;
      const hintsInput = document.getElementById('hints') as HTMLTextAreaElement;
      const difficultyInput = document.getElementById('difficulty') as HTMLInputElement;
      const verifiableInput = document.getElementById('verifiable') as HTMLInputElement;
      const resultInput = document.getElementById('result') as HTMLInputElement;

      const name = nameInput?.value || selectedNodeDetails.name;
      const statement = statementInput?.value || '';
      const description = descriptionInput?.value || '';
      const hints = hintsInput?.value || '';

      // Ensure difficulty is a valid number between 1-7
      const rawDifficulty = difficultyInput?.value || '3';
      const validatedDifficulty = Math.min(7, Math.max(1, parseInt(rawDifficulty, 10))).toString();

      const verifiable = verifiableInput?.checked || false;
      const result = verifiable ? (resultInput?.value || '') : undefined;

      // Get selected prerequisites
      const prerequisiteSelectElement = document.getElementById('prerequisites') as HTMLSelectElement;
      const selectedPrereqCodes = Array.from(prerequisiteSelectElement?.selectedOptions || [])
        .map(option => option.value);

      console.log("Selected prerequisite codes:", selectedPrereqCodes);

      // Map selected codes to their numeric IDs for the API
      const prerequisiteIds: number[] = [];
      for (const code of selectedPrereqCodes) {
        try {
          const id = await getDefinitionIdByCode(code);
          prerequisiteIds.push(id);
        } catch (error) {
          console.error(`Failed to get ID for prerequisite code ${code}`, error);
          alert(`Error: Could not find prerequisite definition '${code}'. It will not be saved.`);
        }
      }

      // Prepare update data
      const updateData = {
        name,
        statement,
        description,
        hints,
        difficulty: validatedDifficulty,
        verifiable,
        result,
        prerequisiteIds
      };

      // Get exercise ID from node ID
      const exerciseCode = selectedNode.id;
      const exerciseId = await getExerciseIdByCode(exerciseCode);

      // Update the exercise
      const updatedEx = await updateExercise(exerciseId, updateData);

      // Success message
      console.log("Exercise updated successfully:", updatedEx);

      // Refresh the node details immediately
      if (updatedEx) {
        updatedEx.type = 'exercise';
        setSelectedNodeDetails(updatedEx);
      } else {
        // If the API doesn't return the updated object, fetch it
        const refreshedEx = await getExerciseByCode(exerciseCode);
        const details = Array.isArray(refreshedEx) ? refreshedEx[0] : refreshedEx;
        if (details) {
          details.type = 'exercise';
          setSelectedNodeDetails(details);
        }
      }

      // Refresh graph to update other nodes if needed
      refreshGraph();

      // Exit edit mode
      setIsEditMode(false);
    } catch (error) {
      console.error('Failed to update exercise:', error);
      alert(`Failed to update exercise: ${error.message || 'Unknown error'}`);
    }
  };

  // Calculate filtered nodes based on search and filters
  const filteredNodes = useCallback(() => {
    let filtered = [...graphNodes];

    // Filter by type
    if (filteredNodeType !== 'all') {
      filtered = filtered.filter(node => node.type === filteredNodeType);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(node =>
        node.id.toLowerCase().includes(query) ||
        node.name.toLowerCase().includes(query)
      );
    }

    return filtered.sort((a, b) => a.id.localeCompare(b.id));
  }, [graphNodes, filteredNodeType, searchQuery]);

  // Handle node selection
  const handleNodeClick = useCallback(async (node: GraphNode) => {
    if (!node || !node.id) {
      console.warn("Node click received invalid node object:", node);
      return;
    }

    // Extract core data from node
    const clickedNodeData: GraphNode = {
      id: node.id,
      name: node.name,
      type: node.type,
      isRootDefinition: node.isRootDefinition,
      difficulty: node.difficulty,
      xPosition: node.xPosition ?? node.fx,
      yPosition: node.yPosition ?? node.fy,
    };

    console.log(`Node clicked: ${clickedNodeData.id} (${clickedNodeData.type})`);

    // Store previous node in history
    if (selectedNode && selectedNode.id !== clickedNodeData.id) {
      setNodeHistory([...nodeHistory, selectedNode.id]);
    }

    // Set new selected node
    setSelectedNode(clickedNodeData);

    // Reset view state
    setIsEditMode(false);
    setAnswerFeedback(null);
    setUserAnswer('');

    // Fetch node details
    try {
      let details: Definition | Exercise | null = null;
      const code = clickedNodeData.id;

      // Determine what to fetch based on mode and node type
      if (mode === 'practice' && clickedNodeData.type === 'definition') {
        // In practice mode, when clicking a definition node, check for related exercises first
        if (graphData.exercises) {
	console.log("Checking for related exercises to definition:", code);
	console.log("Available exercises:", Object.values(graphDataState.exercises));
    
	const relatedExCodes = Object.values(graphDataState.exercises)
      	.filter(ex => ex.code === code)
	.map(ex => ex.code);
    
	console.log("Found related exercises:", relatedExCodes);
          if (relatedExCodes.length > 0) {
	    console.log("encontre");  
            // If there are related exercises, fetch the first one
            const exerciseCode = relatedExCodes[0];
            try {
              const exerciseResponse = await getExerciseByCode(exerciseCode);
              const exerciseDetails = Array.isArray(exerciseResponse) ? exerciseResponse[0] : exerciseResponse;
              
              if (exerciseDetails) {
                exerciseDetails.type = 'exercise';
                details = exerciseDetails;
                console.log(`Showing related exercise ${exerciseCode} instead of definition ${code} in practice mode`);
                
                // Store related exercises
                setRelatedExercises(relatedExCodes);
              }
            } catch (exerciseError) {
              console.warn(`Could not fetch related exercise for ${code}:`, exerciseError);
              // Fall back to showing the definition
            }
          }
        }
        // If no related exercise was found or fetched, fall back to showing the definition
        if (!details) {
          const response = await getDefinitionByCode(code);
          details = Array.isArray(response) ? response[0] : response;
          if (details) {
            details.type = 'definition';
          }
        }
      } else if (clickedNodeData.type === 'definition') {
        // In study mode or other cases, show the definition
        const response = await getDefinitionByCode(code);
        details = Array.isArray(response) ? response[0] : response;
        if (details) {
          details.type = 'definition';
        }
      } else if (clickedNodeData.type === 'exercise') {
        // For exercise nodes, always show the exercise
        const response = await getExerciseByCode(code);
        details = Array.isArray(response) ? response[0] : response;
        if (details) {
          details.type = 'exercise';
        }
      }

      if (details) {
        console.log(`Fetched details for ${code}:`, details);
        setSelectedNodeDetails(details);

        // Set view state based on details
        setShowDefinition(mode !== 'study');
        setShowSolution(false);
        setShowHints(false);
        setSelectedDefinitionIndex(0);

        // Find related exercises for definitions if not already set
        if (details.type === 'definition' && graphData.exercises && !relatedExercises.length) {
          const definitionCode = details.code;
          const relatedExCodes = Object.values(graphData.exercises)
            .filter(ex => ex.prerequisites?.includes(definitionCode))
            .map(ex => ex.code);
          setRelatedExercises(relatedExCodes);
        } else if (details.type === 'exercise') {
          setRelatedExercises([]);
        }
      } else {
        console.warn(`Details not found for node ${code}`);
        setSelectedNodeDetails(null);
        setRelatedExercises([]);
      }
    } catch (error) {
      console.error(`Error fetching details for node ${clickedNodeData.id}:`, error);
      setSelectedNodeDetails(null);
      setRelatedExercises([]);
    }

    // Show panel
    setShowRightPanel(true);

    // Center view on node
    if (graphRef.current && node.x !== undefined && node.y !== undefined) {
      graphRef.current.centerAt(node.x, node.y, 1000);
      graphRef.current.zoom(2, 1000);
    }
  }, [selectedNode, nodeHistory, graphData.exercises, mode, relatedExercises.length]);

  // Handle navigating to a specific node
  const navigateToNode = useCallback((nodeId: string) => {
    const node = graphNodes.find(n => n.id === nodeId);
    if (node) {
      // Try to find node in D3 simulation for more accurate coords
      let nodeForClick = node;
      if (graphRef.current && graphRef.current.graphData) {
        const d3Nodes = graphRef.current.graphData().nodes;
        const d3Node = d3Nodes.find((n: any) => n.id === nodeId);
        if (d3Node) {
          nodeForClick = d3Node;
        }
      }
      handleNodeClick(nodeForClick);
    } else {
      console.warn(`Node with ID ${nodeId} not found in graphNodes.`);
    }
  }, [graphNodes, handleNodeClick]);

  // Handle going back to previous node
  const navigateBack = useCallback(() => {
    if (nodeHistory.length === 0) return;

    const newHistory = [...nodeHistory];
    const prevNodeId = newHistory.pop();

    if (prevNodeId) {
      setNodeHistory(newHistory);
      navigateToNode(prevNodeId);
    }
  }, [nodeHistory, navigateToNode]);

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

  const handleNodeDragEnd = useCallback((node: GraphNode) => {
    if (node?.id && typeof node.x === 'number' && typeof node.y === 'number') {
      node.fx = node.x;
      node.fy = node.y;
      nodePositions.current[node.id] = { x: node.x, y: node.y };
      setPositionsChanged(true);
    }
  }, []);

  // ==============================================================================
  // 4. REPLACE THESE CALLBACK FUNCTIONS IN KnowledgeGraph
  // ==============================================================================

  // FIX: Debounced node refresh
  const refreshNodeAfterReview = useCallback(
    debounce(async (nodeToRefresh: GraphNode) => {
      if (nodeToRefresh && nodeToRefresh.id) {
        console.log("Refreshing node after review:", nodeToRefresh.id);
        await handleNodeClick(nodeToRefresh, true);
      }
    }, 300),
    [handleNodeClick]
  );

  // FIX: Updated review definition handler
  const handleReviewDefinition = useCallback(async (qualityInput: 'again' | 'hard' | 'good' | 'easy') => {
    if (!selectedNode || selectedNode.type !== 'definition' || !selectedNodeDetails) return;
    
    const numericId = codeToNumericIdMap.get(selectedNode.id);
    if (!numericId) {
      showToast("Cannot review: Node ID not found.", "error");
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
      
      // FIX: Use debounced refresh
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

  // FIX: Updated exercise rating handler  
  const handleRateExerciseUnderstanding = useCallback(async (qualityInput: 'again' | 'hard' | 'good' | 'easy') => {
    if (!selectedNode || selectedNode.type !== 'exercise' || !selectedNodeDetails) return;
    
    const numericId = codeToNumericIdMap.get(selectedNode.id);
    if (!numericId) {
      showToast("Cannot rate: Node ID not found.", "error");
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
      
      // FIX: Use debounced refresh
      const nodeToRefresh = { ...selectedNode };
      refreshNodeAfterReview(nodeToRefresh);
      
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to submit review.", "error");
    }
  }, [selectedNode, selectedNodeDetails, srs, answerFeedback, codeToNumericIdMap, refreshNodeAfterReview]);

  // FIX: Updated status change handler
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
      
      // FIX: Use debounced refresh
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

  const createNewNode = useCallback((type: 'definition' | 'exercise') => {
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
  }, []);

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

        await updateDefinition(defDetails.id, { 
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

        await updateExercise(exDetails.id, {
          name: formName,
          statement: formStatement,
          description: formSolution,
          hints: formHints,
          difficulty: formDifficulty,
          verifiable: formVerifiable,
          result: formVerifiable ? formResult : undefined,
          prerequisiteIds: selectedPrereqNumericIds,
          prerequisiteWeights: prerequisiteWeights,
        });
        showToast(`Exercise "${selectedNode.name}" updated.`, "success");
      }
      
      setIsEditMode(false);
      await refreshGraphAndSRSData(); 
    } catch (error) {
      console.error("Error updating node:", error);
      showToast(error instanceof Error ? error.message : "Failed to update node.", "error");
    }
  };

  const navigateToNodeById = useCallback((nodeId: string) => {
    const node = graphNodes.find(n => n.id === nodeId);
    if (node) {
      handleNodeClick(node);
    }
  }, [graphNodes, handleNodeClick]);

  const navigateBackHistory = useCallback(() => {
    if (nodeHistory.length === 0) return;
    const prevNodeId = nodeHistory[nodeHistory.length - 1];
    setNodeHistory(prev => prev.slice(0, -1));
    navigateToNodeById(prevNodeId);
  }, [nodeHistory, navigateToNodeById]);

  const savePersonalNote = useCallback((nodeId: string, notes: string) => {
    setPersonalNotes(prev => {
      const newNotes = { ...prev, [nodeId]: notes };
      try {
        localStorage.setItem(`ankidemy_notes_${subjectMatterId}_${nodeId}`, notes);
      } catch (e) {
        console.warn("Failed to save personal notes to localStorage:", e);
        showToast("Could not save notes locally.", "warning");
      }
      return newNotes;
    });
  }, [subjectMatterId]);

  useEffect(() => {
    if (selectedNode?.id) {
      try {
        const savedNotes = localStorage.getItem(`ankidemy_notes_${subjectMatterId}_${selectedNode.id}`);
        if (savedNotes) {
          setPersonalNotes(prev => ({ ...prev, [selectedNode.id]: savedNotes }));
        } else {
           setPersonalNotes(prev => ({ ...prev, [selectedNode.id]: '' }));
        }
      } catch (e) {
        console.warn("Failed to load personal notes from localStorage:", e);
      }
    }
  }, [selectedNode?.id, subjectMatterId]);

  const availableDefinitionsForModal = React.useMemo(() => {
    const availableDefs = graphNodes
      .filter(node => node.type === 'definition')
      .map(node => {
          const numericId = codeToNumericIdMap.get(node.id);
          if (!numericId) {
            console.warn(`No numeric ID found for definition code: ${node.id}`);
            return null;
          }
          return {
              code: node.id,
              name: node.name,
              numericId: numericId
          };
      })
      .filter((def): def is NonNullable<typeof def> => def !== null);
    
    console.log("Available definitions for modal:", availableDefs);
    return availableDefs;
  }, [graphNodes, codeToNumericIdMap]);

  // FIX: Memoize credit flow animations to prevent unnecessary re-renders
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
          availablePrerequisites={availableDefinitionsForModal}
          position={nodeCreationPosition}
        />
        <StudyModeModal
          isOpen={showStudyModeModal}
          onClose={() => setShowStudyModeModal(false)}
          domainId={parseInt(subjectMatterId, 10)}
        />
        <TopControls
          subjectMatterId={subjectMatterId}
          mode={mode}
          onModeChange={changeMode}
          onBack={onBack}
          showNodeLabels={showNodeLabels}
          onToggleNodeLabels={() => setShowNodeLabels(!showNodeLabels)}
          onZoomToFit={() => graphRef.current?.zoomToFit(400)}
          onCreateDefinition={() => createNewNode('definition')}
          onCreateExercise={() => createNewNode('exercise')}
          onStartStudy={() => setShowStudyModeModal(true)}
          positionsChanged={positionsChanged}
          onSavePositions={savePositions}
          isSavingPositions={isSavingPositions}
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
                showNodeLabels={showNodeLabels}
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
                  personalNotes={personalNotes}
                  onUpdateNotes={savePersonalNote}
                  availableDefinitionsForEdit={availableDefinitionsForModal}
                  onSubmitEdit={handleSubmitEdit}
                  onStatusChange={handleStatusChange}
                  availableDefinitions={availableDefinitionsForModal.map(d => ({code: d.code, name: d.name}))}
                />
            )}
          </div>
        </div>
      </div>
    </MathJaxProvider>
  );
};

export default KnowledgeGraph;
