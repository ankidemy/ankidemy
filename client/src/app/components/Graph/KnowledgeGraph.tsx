"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { MathJaxProvider } from '@/app/components/core/MathJaxWrapper';
import { Eye } from 'lucide-react';
import {
  reviewDefinition,
  attemptExercise,
  getDefinitionByCode,
  getExerciseByCode,
  updateDefinition,
  updateExercise,
  getDefinitionIdByCode,
  getExerciseIdByCode
} from '@/lib/api';

// Import utility types and components
import { 
  GraphNode, 
  GraphLink, 
  Definition, 
  Exercise, 
  AppMode, 
  FilteredNodeType,
  KnowledgeGraphProps, 
  AnswerFeedback 
} from './utils/types';
import GraphContainer from './utils/GraphContainer';
import GraphLegend from './utils/GraphLegend';

// Import panel components
import TopControls from './panels/TopControls';
import LeftPanel from './panels/LeftPanel';
import LeftPanelToggle from './panels/LeftPanelToggle';
import RightPanel from './panels/RightPanel';

// Import modal component
import NodeCreationModal from './NodeCreationModal';
import { ToastContainer, showToast } from '@/app/components/core/ToastNotification';

// API utility constants
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    let errorMessage = 'An error occurred';
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch (e) {
      errorMessage = response.statusText || `HTTP error ${response.status}`;
    }

    // Add specific error messages based on status codes
    switch (response.status) {
      case 400: errorMessage = `Bad Request: ${errorMessage}`; break;
      case 401: errorMessage = 'Authentication required. Please log in again.'; break;
      case 403: errorMessage = 'You do not have permission to perform this action.'; break;
      case 404: errorMessage = 'The requested resource was not found.'; break;
      case 409: errorMessage = 'This operation could not be completed due to a conflict.'; break;
    }

    console.error(`API Error: ${errorMessage}`, { status: response.status, url: response.url });
    throw new Error(errorMessage);
  }

  // For 204 No Content responses
  if (response.status === 204) {
    return null;
  }

  const data = await response.json();
  console.debug(`API Response from ${response.url}:`, data);
  return data;
};

const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({
  graphData,
  subjectMatterId,
  onBack,
  onPositionUpdate
}) => {
  // References
  const graphRef = useRef<any>(null);

  // State - App mode and UI
  const [mode, setMode] = useState<AppMode>('study');
  const [isProcessingData, setIsProcessingData] = useState(true);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [showNodeLabels, setShowNodeLabels] = useState(true);
  
  // State - Node data and selection
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedNodeDetails, setSelectedNodeDetails] = useState<Definition | Exercise | null>(null);
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphLinks, setGraphLinks] = useState<GraphLink[]>([]);
  const [nodeHistory, setNodeHistory] = useState<string[]>([]);
  
  // State - Node interaction
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
  
  // State - Node creation and position
  const [showNodeCreationModal, setShowNodeCreationModal] = useState(false);
  const [nodeCreationType, setNodeCreationType] = useState<'definition' | 'exercise'>('definition');
  const [nodeCreationPosition, setNodeCreationPosition] = useState<{x: number, y: number} | undefined>(undefined);
  const [positionsChanged, setPositionsChanged] = useState(false);
  const [isSavingPositions, setIsSavingPositions] = useState(false);
  const [graphDataState, setGraphDataState] = useState(graphData);
  
  // Track node position changes
  const nodePositions = useRef<Record<string, { x: number; y: number }>>({});

  // Update the local state when props change
  useEffect(() => {
    setGraphDataState(graphData);
  }, [graphData]);

  // Refresh graph data after changes
  const refreshGraph = async () => {
    try {
      // Determine domain ID
      const firstDefKey = Object.keys(graphData?.definitions || {})[0];
      let domainId = firstDefKey ? graphData.definitions[firstDefKey]?.domainId : null;

      if (!domainId) {
        console.warn('Domain ID not found in definition, trying exercises...');
        const firstExKey = Object.keys(graphData?.exercises || {})[0];
        domainId = firstExKey ? graphData.exercises[firstExKey]?.domainId : null;
      }

      if (!domainId && /^\d+$/.test(subjectMatterId)) {
        domainId = parseInt(subjectMatterId, 10);
        console.warn(`Using subjectMatterId as fallback: ${domainId}`);
      }

      if (!domainId) {
        console.error('Unable to determine domain ID for refresh');
        alert("Cannot refresh graph: Missing domain information.");
        return;
      }

      const response = await fetch(`${API_URL}/api/domains/${domainId}/graph`, {
        headers: getAuthHeaders(),
      });

      const updatedGraph = await handleResponse(response);
      console.log("Fetched updated graph data:", updatedGraph);

      // Update the graphData state with the new data
      if (updatedGraph && updatedGraph.nodes && updatedGraph.links) {
        // Convert the VisualGraph format to our GraphData format
        const newDefinitions = {};
        const newExercises = {};
        
        updatedGraph.nodes.forEach(node => {
          if (node.type === 'definition') {
            newDefinitions[node.id] = {
              code: node.id,
              name: node.name,
              description: node.description || '',
              prerequisites: node.prerequisites || [],
              xPosition: node.x,
              yPosition: node.y,
              domainId
            };
          } else if (node.type === 'exercise') {
            newExercises[node.id] = {
              code: node.id,
              name: node.name,
              statement: node.statement || '',
              description: node.description || '',
              prerequisites: node.prerequisites || [],
              difficulty: node.difficulty || '3',
              xPosition: node.x,
              yPosition: node.y,
              domainId
            };
          }
        });
        
        const newGraphData = {
          definitions: { ...newDefinitions },
          exercises: { ...newExercises }
        };
        
        setGraphDataState(newGraphData);
        setIsProcessingData(true);
        setTimeout(() => setIsProcessingData(false), 100);
      }

      // Refresh selected node details if needed
      if (selectedNode) {
        let updatedDetails;
        if (selectedNode.type === 'definition') {
          updatedDetails = await getDefinitionByCode(selectedNode.id);
          updatedDetails = Array.isArray(updatedDetails) ? updatedDetails[0] : updatedDetails;
          if (updatedDetails) updatedDetails.type = 'definition';
        } else if (selectedNode.type === 'exercise') {
          updatedDetails = await getExerciseByCode(selectedNode.id);
          updatedDetails = Array.isArray(updatedDetails) ? updatedDetails[0] : updatedDetails;
          if (updatedDetails) updatedDetails.type = 'exercise';
        }

        if (updatedDetails) {
          setSelectedNodeDetails(updatedDetails);
        }
      }
    } catch (error) {
      console.error('Failed to refresh graph:', error);
      alert("Failed to refresh graph data. Please check console.");
    }
  };

  // Save node positions on component unmount or when explicitly requested
  useEffect(() => {
    return () => {
      if (positionsChanged && onPositionUpdate && Object.keys(nodePositions.current).length > 0) {
        onPositionUpdate(nodePositions.current);
      }
    };
  }, [positionsChanged, onPositionUpdate]);

  // Process graph data into nodes and links
  useEffect(() => {
    console.log(`--- Processing Graph Data for Mode: ${mode} ---`);
    setIsProcessingData(true); // Start processing

    // Clear previous data
    setGraphNodes([]);
    setGraphLinks([]);
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());

    // Add safety check for data
    if (!graphData || typeof graphData.definitions !== 'object') {
      console.warn('Graph data definitions missing or invalid', graphData);
      setIsProcessingData(false);
      return;
    }

    // Ensure exercises is an object if it exists
    if (graphData.exercises && typeof graphData.exercises !== 'object') {
      console.warn('Graph data exercises is invalid', graphData.exercises);
      graphData.exercises = {}; // Treat as empty if invalid
    }

    // Log data counts
    console.log("Raw definition data count:", Object.keys(graphData.definitions).length);
    console.log("Raw exercise data count:", graphData.exercises ? Object.keys(graphData.exercises).length : 0);

    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];

    // IMPORTANT: Use a map to track code to node ID mapping
    const codeToId = new Map<string, string>();

    // Process definitions
    Object.entries(graphData.definitions).forEach(([idStr, def]) => {
      if (!def || !def.code || !def.name) {
        console.warn(`Skipping invalid definition data with id ${idStr}:`, def);
        return;
      }

      const nodeId = def.code; // Use code as the node ID
      codeToId.set(nodeId, nodeId); // Map code to itself (as it's the ID)

      nodes.push({
        id: nodeId,
        name: def.name,
        type: 'definition',
        isRootDefinition: !def.prerequisites || def.prerequisites.length === 0,
        xPosition: def.xPosition,
        yPosition: def.yPosition,
        fx: def.xPosition, // Use fixed position if available
        fy: def.yPosition
      });
    });

    // Process definition links using the code map
    Object.entries(graphData.definitions).forEach(([idStr, def]) => {
      if (!def || !def.code) return;
      const targetId = def.code;

      if (def.prerequisites && Array.isArray(def.prerequisites) && def.prerequisites.length > 0) {
        def.prerequisites.forEach(prereqCode => {
          if (typeof prereqCode !== 'string' || !prereqCode) {
            console.warn(`Invalid prerequisite code found for definition ${targetId}:`, prereqCode);
            return;
          }

          const sourceId = codeToId.get(prereqCode);
          if (sourceId) {
            links.push({
              source: sourceId,
              target: targetId,
              type: 'prerequisite'
            });
          } else {
            console.warn(`Definition Link: Prerequisite code ${prereqCode} not found for target ${targetId}`);
          }
        });
      }
    });

    // Process exercises (only if in practice mode)
    if (mode === 'practice' && graphData.exercises) {
      Object.entries(graphData.exercises).forEach(([idStr, exercise]) => {
        if (!exercise || !exercise.code || !exercise.name) {
          console.warn(`Skipping invalid exercise data with id ${idStr}:`, exercise);
          return;
        }

        const nodeId = exercise.code;
        if (codeToId.has(nodeId)) {
          console.error(`Exercise code ${nodeId} conflicts with an existing definition code! Skipping exercise.`);
          return;
        }

        codeToId.set(nodeId, nodeId);

        nodes.push({
          id: nodeId,
          name: exercise.name,
          type: 'exercise',
          difficulty: exercise.difficulty,
          xPosition: exercise.xPosition,
          yPosition: exercise.yPosition,
          fx: exercise.xPosition,
          fy: exercise.yPosition
        });

        // Process exercise links (prerequisites)
        if (exercise.prerequisites && Array.isArray(exercise.prerequisites) && exercise.prerequisites.length > 0) {
          exercise.prerequisites.forEach(prereqCode => {
            if (typeof prereqCode !== 'string' || !prereqCode) {
              console.warn(`Invalid prerequisite code for exercise ${nodeId}:`, prereqCode);
              return;
            }

            // Find the prerequisite
            let sourceId = codeToId.get(prereqCode);

            // Case-insensitive fallback lookup
            if (!sourceId) {
              const matchingKey = Array.from(codeToId.keys()).find(
                k => k.toLowerCase() === prereqCode.toLowerCase()
              );
              if (matchingKey) {
                sourceId = codeToId.get(matchingKey);
                console.log(`Found case-insensitive match for ${prereqCode} -> ${matchingKey}`);
              }
            }

            if (sourceId) {
              // Check if the source is a definition
              const sourceNode = nodes.find(n => n.id === sourceId);
              if (sourceNode?.type === 'definition') {
                links.push({
                  source: sourceId,
                  target: nodeId,
                  type: 'prerequisite'
                });
              } else {
                console.warn(`Exercise Link SKIPPED: Prerequisite ${prereqCode} is not a definition node.`);
              }
            } else {
              console.warn(`Exercise Link: Prerequisite code ${prereqCode} not found for target ${nodeId}`);
            }
          });
        }
      });
    }

    console.log("Final processed graph data:", {
      nodes: nodes.length,
      links: links.length,
      exerciseNodes: nodes.filter(n => n.type === 'exercise').length,
      exerciseLinks: links.filter(link => {
        const targetId = typeof link.target === 'object' ? (link.target as GraphNode).id : link.target;
        const targetNode = nodes.find(n => n.id === targetId);
        return targetNode?.type === 'exercise';
      }).length
    });

    // Set state after all processing is done
    setGraphNodes(nodes);
    setGraphLinks(links);
    setIsProcessingData(false);

  }, [graphData, mode]);

  // Fit graph to view when data changes and processing is complete
  useEffect(() => {
    if (!isProcessingData && graphRef.current && graphNodes.length > 0) {
      setTimeout(() => {
        if (graphRef.current) {
          graphRef.current.zoomToFit(400);
        }
      }, 500);
    }
  }, [isProcessingData, graphNodes.length]);

  // Save positions to backend
  const savePositions = async () => {
    if (!onPositionUpdate || Object.keys(nodePositions.current).length === 0) {
      console.warn("No position update handler or no positions to save");
      return;
    }

    if (!positionsChanged) {
      console.log("No position changes to save.");
      return;
    }

    setIsSavingPositions(true);
    try {
      await onPositionUpdate(nodePositions.current);
      setPositionsChanged(false);
      console.log("Node positions saved successfully.");
    } catch (err) {
      console.error("Failed to save positions:", err);
      alert("Failed to save node positions: " + (err.message || "Unknown error"));
    } finally {
      setIsSavingPositions(false);
    }
  };

  // Current description for display - handles multiple description formats
  const currentDescription = useCallback(() => {
    if (!selectedNodeDetails || !('description' in selectedNodeDetails)) return '';

    // Handle descriptions that might be stored as delimited strings
    if (typeof selectedNodeDetails.description === 'string') {
      if (selectedNodeDetails.description.includes('|||')) {
        const descriptions = selectedNodeDetails.description.split('|||');
        return descriptions[selectedDefinitionIndex % descriptions.length] || descriptions[0] || '';
      }
      return selectedNodeDetails.description;
    }

    // Handle descriptions that might be stored as arrays
    if (Array.isArray(selectedNodeDetails.description)) {
      return selectedNodeDetails.description[selectedDefinitionIndex % selectedNodeDetails.description.length] ||
             selectedNodeDetails.description[0] || '';
    }

    return String(selectedNodeDetails.description);
  }, [selectedNodeDetails, selectedDefinitionIndex]);

  // Check if the definition has multiple descriptions
  const hasMultipleDescriptions = useCallback(() => {
    if (!selectedNodeDetails || !('description' in selectedNodeDetails)) return false;

    if (typeof selectedNodeDetails.description === 'string') {
      return selectedNodeDetails.description.includes('|||');
    }

    return Array.isArray(selectedNodeDetails.description) && selectedNodeDetails.description.length > 1;
  }, [selectedNodeDetails]);

  // Get the total number of descriptions
  const totalDescriptions = useCallback(() => {
    if (!selectedNodeDetails || !('description' in selectedNodeDetails)) return 0;

    if (typeof selectedNodeDetails.description === 'string') {
      if (selectedNodeDetails.description.includes('|||')) {
        return selectedNodeDetails.description.split('|||').length;
      }
      return 1;
    }

    if (Array.isArray(selectedNodeDetails.description)) {
      return selectedNodeDetails.description.length;
    }

    return 1;
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

      if (clickedNodeData.type === 'definition') {
        const response = await getDefinitionByCode(code);
        // Handle array response
        details = Array.isArray(response) ? response[0] : response;
        if (details) {
          details.type = 'definition';
        }
      } else if (clickedNodeData.type === 'exercise') {
        const response = await getExerciseByCode(code);
        // Handle array response
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

        // Find related exercises for definitions
        if (details.type === 'definition' && graphData.exercises) {
          const definitionCode = details.code;
          const relatedExCodes = Object.values(graphData.exercises)
            .filter(ex => ex.prerequisites?.includes(definitionCode))
            .map(ex => ex.code);
          setRelatedExercises(relatedExCodes);
        } else {
          setRelatedExercises([]);
        }
      } else {
        console.warn(`Details not found for node ${code}`);
        setSelectedNodeDetails(null);
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
  }, [selectedNode, nodeHistory, graphData.exercises, mode]);

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
    // Create new sets to avoid reference issues
    const nodesToHighlight = new Set<string>();
    const linksToHighlight = new Set<string>();

    if (node && node.id) {
      nodesToHighlight.add(node.id);

      // Process links
      graphLinks.forEach(link => {
        const sourceId = typeof link.source === 'object' ? (link.source as GraphNode).id : String(link.source);
        const targetId = typeof link.target === 'object' ? (link.target as GraphNode).id : String(link.target);

        if (sourceId && targetId) {
          const linkId = `${sourceId}-${targetId}`;

          if (sourceId === node.id) {
            nodesToHighlight.add(targetId);
            linksToHighlight.add(linkId);
          } else if (targetId === node.id) {
            nodesToHighlight.add(sourceId);
            linksToHighlight.add(linkId);
          }
        }
      });
    }

    // Only update state if changes happened
    if (highlightNodes.size !== nodesToHighlight.size ||
        highlightLinks.size !== linksToHighlight.size ||
        ![...highlightNodes].every(id => nodesToHighlight.has(id)) ||
        ![...highlightLinks].every(id => linksToHighlight.has(id))) {
      setHighlightNodes(nodesToHighlight);
      setHighlightLinks(linksToHighlight);
    }
  }, [graphLinks, highlightNodes, highlightLinks]);

  // Handle node drag end - save the position
  const handleNodeDragEnd = useCallback((node: GraphNode) => {
    if (node && node.id && node.x !== undefined && node.y !== undefined) {
      // Pin the node by setting fixed coordinates
      node.fx = node.x;
      node.fy = node.y;

      // Store position for later saving to API
      nodePositions.current[node.id] = { x: node.x, y: node.y };
      // Flag that positions have changed and need saving
      setPositionsChanged(true);
      console.log(`Node ${node.id} dragged to (${node.x.toFixed(2)}, ${node.y.toFixed(2)}) - position recorded.`);
    }
  }, []);

  // Verify exercise answer
  const verifyAnswer = useCallback(async () => {
    if (!selectedNode || !selectedNodeDetails || selectedNode.type !== 'exercise') return;

    const exercise = selectedNodeDetails as Exercise;
    if (!exercise.verifiable) {
      setAnswerFeedback({
        correct: false,
        message: "This exercise can't be automatically verified."
      });
      return;
    }

    if (!userAnswer.trim()) {
      setAnswerFeedback({
        correct: false,
        message: "Please enter an answer."
      });
      return;
    }

    try {
      // Get the exercise ID
      const exerciseCode = selectedNode.id;
      const exerciseId = await getExerciseIdByCode(exerciseCode);

      // Track the attempt and get verification from API
      const response = await attemptExercise(exerciseId, {
        exerciseId: exerciseId,
        answer: userAnswer,
        timeTaken: 0 // Not tracking time in this implementation
      });

      setAnswerFeedback({
        correct: response.correct,
        message: response.correct ? "Correct! Well done." : (response.message || "Incorrect. Try again or check the solution.")
      });
    } catch (err) {
      console.error("Error verifying answer:", err);
      setAnswerFeedback({
        correct: false,
        message: `Error verifying answer: ${err.message || 'Please try again.'}`
      });
    }
  }, [selectedNode, selectedNodeDetails, userAnswer]);

  // Save personal notes with auto-save
  const saveNotes = useCallback((nodeId: string, notes: string) => {
    // Update state immediately
    setPersonalNotes(prev => {
      const newNotes = {
        ...prev,
        [nodeId]: notes
      };

      // Try to persist to localStorage
      try {
        localStorage.setItem(`notes_${nodeId}`, notes);
        console.log(`Personal notes saved for node ${nodeId}`);
      } catch (e) {
        console.error("Failed to save notes to localStorage:", e);
      }

      return newNotes;
    });
  }, []);

  // Load personal notes from localStorage
  useEffect(() => {
    if (selectedNode?.id) {
      try {
        const savedNotes = localStorage.getItem(`notes_${selectedNode.id}`);
        if (savedNotes) {
          setPersonalNotes(prev => ({
            ...prev,
            [selectedNode.id]: savedNotes
          }));
        }
      } catch (e) {
        console.error("Failed to load notes from localStorage:", e);
      }
    }
  }, [selectedNode?.id]);

  // Toggle panels
  const toggleLeftPanel = useCallback(() => setShowLeftPanel(!showLeftPanel), [showLeftPanel]);
  
  const toggleRightPanel = useCallback(() => {
    setShowRightPanel(prev => {
      const closing = prev;
      if (closing) {
        setSelectedNode(null);
        setSelectedNodeDetails(null);
        setNodeHistory([]);
        setIsEditMode(false);
      }
      return !prev;
    });
  }, []);

  // Switch mode
  const changeMode = useCallback((newMode: AppMode) => {
    if (newMode === mode) return;
    console.log(`Changing mode from ${mode} to ${newMode}`);
    setMode(newMode);
    setSelectedNode(null);
    setSelectedNodeDetails(null);
    setShowRightPanel(false);
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
    setNodeHistory([]);
    setIsEditMode(false);
  }, [mode]);

  // Create new node
  const createNewNode = useCallback((type: 'definition' | 'exercise') => {
    // Get center position of current view for new node placement
    let position: {x: number, y: number} | undefined = undefined;

    if (graphRef.current) {
      // Try to get the center coordinates of the current view
      try {
        const graphInstance = graphRef.current;
        // Get current translation and zoom
        const { k: zoom, x: transX, y: transY } = graphInstance.zoom() || { k: 1, x: 0, y: 0 };
        const { width, height } = graphInstance.getBoundingClientRect() || { width: 800, height: 600 };

        // Calculate center in graph coordinates
        const centerX = (-transX + width / 2) / zoom;
        const centerY = (-transY + height / 2) / zoom;

        // Add small random offset to avoid perfect overlay
        const randomOffsetX = (Math.random() - 0.5) * 100;
        const randomOffsetY = (Math.random() - 0.5) * 100;

        position = {
          x: centerX + randomOffsetX,
          y: centerY + randomOffsetY
        };
        console.log("Calculated center position for new node:", position);
      } catch (err) {
        console.warn("Could not determine graph center position:", err);
      }
    }

    // Update modal state
    setNodeCreationType(type);
    setNodeCreationPosition(position);
    setShowNodeCreationModal(true);
  }, []);

  // Handle node creation success
  const handleNodeCreationSuccess = useCallback(async (nodeId: string) => {
    console.log(`Node created successfully with ID: ${nodeId}`);

    // Hide modal
    setShowNodeCreationModal(false);

    // Show success toast
    showToast(
      `${nodeCreationType === 'definition' ? 'Definition' : 'Exercise'} "${nodeId}" created successfully!`,
      'success'
    );

    // Refresh the graph data
    await refreshGraph();

    // Try to navigate to the new node after a delay for graph update
    setTimeout(() => {
      try {
        // Find the node in the potentially updated graphNodes
        const newNode = graphNodes.find(n => n.id === nodeId);
        if (newNode) {
           navigateToNode(nodeId);
        } else {
          console.warn(`Could not find newly created node ${nodeId} in graphNodes after refresh.`);
        }
      } catch (err) {
        console.error("Could not navigate to new node:", err);
      }
    }, 800);
  }, [refreshGraph, navigateToNode, nodeCreationType, graphNodes]);

  // Zoom graph to fit
  const zoomToFit = useCallback(() => {
    if (graphRef.current) {
      console.log("Zooming to fit graph...");
      graphRef.current.zoomToFit(400, 60);
    }
  }, []);

  // Handle review for definition
  const handleReviewDefinition = useCallback(async (result: 'again' | 'hard' | 'good' | 'easy') => {
    if (!selectedNode || !selectedNodeDetails || selectedNode.type !== 'definition') return;
    console.log(`Submitting review "${result}" for definition ${selectedNode.id}`);

    try {
      // Get the definition ID
      const definitionCode = selectedNode.id;
      const definitionId = await getDefinitionIdByCode(definitionCode);

      // Submit the review
      await reviewDefinition(definitionId, {
        definitionId: definitionId,
        result: result,
        timeTaken: 0 // Not tracking time in this implementation
      });

      alert(`Review recorded: ${result}`);
    } catch (err) {
      console.error("Error submitting review:", err);
      alert(`Failed to record review: ${err.message || 'Please try again.'}`);
    }
  }, [selectedNode, selectedNodeDetails]);

  return (
    <MathJaxProvider>
      <div className="h-full flex flex-col overflow-hidden bg-gray-100">
        {/* Node Creation Modal */}
        <NodeCreationModal
          type={nodeCreationType}
          domainId={parseInt(subjectMatterId, 10)}
          isOpen={showNodeCreationModal}
          onClose={() => setShowNodeCreationModal(false)}
          onSuccess={handleNodeCreationSuccess}
          availablePrerequisites={graphNodes
            .filter(node => node.type === 'definition')
            .map(node => ({ id: node.id, name: node.name }))
          }
          position={nodeCreationPosition}
        />

        {/* Toast notifications */}
        <ToastContainer />

        {/* Top Controls Bar */}
        <TopControls
          subjectMatterId={subjectMatterId}
          mode={mode}
          onModeChange={changeMode}
          onBack={onBack}
          showNodeLabels={showNodeLabels}
          onToggleNodeLabels={() => setShowNodeLabels(!showNodeLabels)}
          onZoomToFit={zoomToFit}
          onCreateDefinition={() => createNewNode('definition')}
          onCreateExercise={() => createNewNode('exercise')}
          positionsChanged={positionsChanged}
          onSavePositions={savePositions}
          isSavingPositions={isSavingPositions}
        />

        {/* Main content area */}
        <div className="flex flex-1 overflow-hidden relative">
          {/* Left Panel (Sliding) */}
          <div className={`absolute top-0 left-0 h-full z-20 bg-white border-r shadow-lg transition-transform duration-300 ease-in-out ${
            showLeftPanel ? 'translate-x-0 w-64' : '-translate-x-full w-64'
          }`}>
            {showLeftPanel && (
              <LeftPanel
                isVisible={showLeftPanel}
                onToggle={toggleLeftPanel}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                filteredNodeType={filteredNodeType}
                onFilterChange={setFilteredNodeType}
                filteredNodes={filteredNodes()}
                selectedNodeId={selectedNode?.id || null}
                onNodeClick={handleNodeClick}
                mode={mode}
              />
            )}
          </div>

          {/* Left Panel Toggle Button */}
          {!showLeftPanel && (
            <LeftPanelToggle onClick={toggleLeftPanel} />
          )}

          {/* Graph Canvas Area */}
          <div className="flex-1 bg-gray-50 overflow-hidden relative">
            {isProcessingData ? (
              <div className="flex items-center justify-center h-full">
                <p>Processing graph data...</p>
              </div>
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
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p>No graph data to display.</p>
              </div>
            )}

            {/* Legend */}
            {!isProcessingData && graphNodes.length > 0 && (
              <GraphLegend 
                mode={mode} 
                hasExercises={graphNodes.some(n => n.type === 'exercise')} 
              />
            )}
          </div>

          {/* Right Panel (Sliding) */}
          <div className={`absolute top-0 right-0 h-full z-20 bg-white border-l shadow-lg transition-transform duration-300 ease-in-out ${
            showRightPanel && selectedNode ? 'translate-x-0 w-80' : 'translate-x-full w-80'
          }`}>
            <RightPanel
              isVisible={showRightPanel}
              onToggle={toggleRightPanel}
              selectedNode={selectedNode}
              selectedNodeDetails={selectedNodeDetails}
              isEditMode={isEditMode}
              onToggleEditMode={() => setIsEditMode(!isEditMode)}
              mode={mode}
              nodeHistory={nodeHistory}
              onNavigateBack={navigateBack}
              onNavigateToNode={navigateToNode}
              
              // Definition view props
              showDefinition={showDefinition}
              onToggleDefinition={() => setShowDefinition(!showDefinition)}
              hasMultipleDescriptions={hasMultipleDescriptions()}
              totalDescriptions={totalDescriptions()}
              selectedDefinitionIndex={selectedDefinitionIndex}
              currentDescription={currentDescription()}
              onNavigatePrevDescription={() => setSelectedDefinitionIndex(i => Math.max(0, i - 1))}
              onNavigateNextDescription={() => setSelectedDefinitionIndex(i => Math.min(totalDescriptions() - 1, i + 1))}
              relatedExercises={relatedExercises}
              onReviewDefinition={handleReviewDefinition}
              
              // Exercise view props
              showSolution={showSolution}
              onToggleSolution={() => setShowSolution(!showSolution)}
              showHints={showHints}
              onToggleHints={() => setShowHints(!showHints)}
              userAnswer={userAnswer}
              onUpdateAnswer={setUserAnswer}
              answerFeedback={answerFeedback}
              onVerifyAnswer={verifyAnswer}
              
              // Common props
              personalNotes={personalNotes}
              onUpdateNotes={saveNotes}
              
              // Edit form props
              availableDefinitions={graphNodes.filter(n => n.type === 'definition')}
              onSubmitEdit={selectedNode?.type === 'definition' ? handleDefinitionEditSubmit : handleExerciseEditSubmit}
            />
          </div>
        </div>
      </div>
    </MathJaxProvider>
  );
};

export default KnowledgeGraph;
