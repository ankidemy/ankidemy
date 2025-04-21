// src/app/components/Graph/KnowledgeGraph.tsx
"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { MathJaxProvider, MathJaxContent } from '@/app/components/core/MathJaxWrapper';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/core/tabs";
import { Card, CardContent } from "@/app/components/core/card";
import { ArrowLeft, Search, Plus, Edit, Eye, EyeOff, ZoomIn, Settings, Book, BarChart, X, Menu } from 'lucide-react';
import {
  reviewDefinition,
  attemptExercise,
  getDefinitionByCode,
  getExerciseByCode,
  updateDefinition,
  updateExercise,
  GraphData
} from '@/lib/api';
// Import the new components at the top of the file
import NodeCreationModal from './NodeCreationModal';
import { ToastContainer, showToast } from '@/app/components/core/ToastNotification';

// Import ForceGraph dynamically to avoid SSR issues
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false
});

// Type definitions for API objects and utility variables
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

const handleResponse = async (response) => {
  if (!response.ok) {
    let errorMessage = 'An error occurred';
    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorMessage;
    } catch (e) {
      // Could not parse JSON, use status text
      errorMessage = response.statusText || `HTTP error ${response.status}`;
    }

    // Add more specific error messages based on status codes from API documentation
    switch (response.status) {
      case 400:
        errorMessage = `Bad Request: ${errorMessage}`;
        break;
      case 401:
        errorMessage = 'Authentication required. Please log in again.';
        break;
      case 403:
        errorMessage = 'You do not have permission to perform this action.';
        break;
      case 404:
        errorMessage = 'The requested resource was not found.';
        break;
      case 409:
        errorMessage = 'This operation could not be completed due to a conflict (resource may already exist).';
        break;
    }

    console.error(`API Error: ${errorMessage}`, { status: response.status, url: response.url });
    throw new Error(errorMessage);
  }

  // For 204 No Content responses
  if (response.status === 204) {
    return null;
  }

  const data = await response.json();

  // For debugging purposes, log the response data
  console.debug(`API Response from ${response.url}:`, data);

  return data;
};

// Define types
interface Definition {
  id: number;
  code: string;
  name: string;
  description: string | string[];
  notes?: string;
  references?: string[];
  prerequisites?: string[]; // Updated: Now optional to match API
  xPosition?: number;
  yPosition?: number;
  domainId?: number;
  type?: 'definition';
}

interface Exercise {
  id: number;
  code: string;
  name: string;
  difficulty: string; // The API expects this as a number between 1-7
  statement: string;
  description: string;
  hints?: string;
  verifiable: boolean;
  result?: string;
  prerequisites?: string[]; // Updated: Now optional to match API
  xPosition?: number;
  yPosition?: number;
  domainId?: number;
  type?: 'exercise';
}

interface GraphNode {
  id: string;
  name: string;
  type: 'definition' | 'exercise';
  isRootDefinition?: boolean;
  difficulty?: string;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number;
  fy?: number;
  xPosition?: number;
  yPosition?: number;
}

interface GraphLink {
  source: string | GraphNode;
  target: string | GraphNode;
  type?: string;
}

// Mode types
type AppMode = 'study' | 'practice';

interface KnowledgeGraphProps {
  graphData: GraphData;
  subjectMatterId: string;
  onBack: () => void;
  onPositionUpdate?: (positions: Record<string, { x: number; y: number }>) => void;
}

const KnowledgeGraph: React.FC<KnowledgeGraphProps> = ({
  graphData,
  subjectMatterId,
  onBack,
  onPositionUpdate
}) => {
  // References
  const graphRef = useRef<any>(null);

  // State
  const [mode, setMode] = useState<AppMode>('study');
  const [isProcessingData, setIsProcessingData] = useState(true);
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedNodeDetails, setSelectedNodeDetails] = useState<Definition | Exercise | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [nodeHistory, setNodeHistory] = useState<string[]>([]);
  const [showDefinition, setShowDefinition] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [highlightNodes, setHighlightNodes] = useState(new Set<string>());
  const [highlightLinks, setHighlightLinks] = useState(new Set<string>());
  const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
  const [graphLinks, setGraphLinks] = useState<GraphLink[]>([]);
  const [userAnswer, setUserAnswer] = useState('');
  const [answerFeedback, setAnswerFeedback] = useState<{correct: boolean, message: string} | null>(null);
  const [personalNotes, setPersonalNotes] = useState<Record<string, string>>({});
  const [relatedExercises, setRelatedExercises] = useState<string[]>([]);
  const [filteredNodeType, setFilteredNodeType] = useState<'all' | 'definition' | 'exercise'>('all');
  const [showNodeLabels, setShowNodeLabels] = useState(true);
  const [selectedDefinitionIndex, setSelectedDefinitionIndex] = useState(0);
  const [positionsChanged, setPositionsChanged] = useState(false);
  const [isSavingPositions, setIsSavingPositions] = useState(false);
  const [graphDataState, setGraphDataState] = useState<GraphData>(graphData); // Renamed to avoid conflict

  // Add the node creation state variables to the component
  const [showNodeCreationModal, setShowNodeCreationModal] = useState(false);
  const [nodeCreationType, setNodeCreationType] = useState<'definition' | 'exercise'>('definition');
  const [nodeCreationPosition, setNodeCreationPosition] = useState<{x: number, y: number} | undefined>(undefined);

  // Track node position changes
  const nodePositions = useRef<Record<string, { x: number; y: number }>>({});

  // Add this useEffect to update the local state when props change
  useEffect(() => {
    setGraphDataState(graphData);
  }, [graphData]);

  // Utility function to get definition ID by code
  const getDefinitionIdByCode = async (code) => {
    // First try to get from graphData (to avoid API call if possible)
    const foundDef = Object.values(graphData?.definitions || {}).find(def => def.code === code);
    if (foundDef?.id) {
      return foundDef.id;
    }

    try {
      const response = await getDefinitionByCode(code);
      // Handle array response (API returns array of matching definitions)
      const definition = Array.isArray(response) ? response[0] : response;
      if (!definition || !definition.id) {
        throw new Error(`No definition found with code: ${code}`);
      }
      return definition.id;
    } catch (error) {
      console.error('Error getting definition ID by code:', error);
      throw error;
    }
  };

  // Utility function to get exercise ID by code
  const getExerciseIdByCode = async (code) => {
    // First try to get from graphData (to avoid API call if possible)
    const foundEx = Object.values(graphData?.exercises || {}).find(ex => ex.code === code);
    if (foundEx?.id) {
      return foundEx.id;
    }

    try {
      const response = await getExerciseByCode(code);
      // Handle array response (API returns array of matching exercises)
      const exercise = Array.isArray(response) ? response[0] : response;
      if (!exercise || !exercise.id) {
        throw new Error(`No exercise found with code: ${code}`);
      }
      return exercise.id;
    } catch (error) {
      console.error('Error getting exercise ID by code:', error);
      throw error;
    }
  };

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
        console.warn(`Domain ID not found in graphData, using subjectMatterId as fallback: ${domainId}`);
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
        
        // Create a new graphData object to trigger the useEffect
        const newGraphData = {
          definitions: { ...newDefinitions },
          exercises: { ...newExercises }
        };
        
        // Force a re-render by updating the state that triggers the useEffect
        setGraphDataState(newGraphData);
        
        // Also update the isProcessingData state to trigger a re-render
        setIsProcessingData(true);
        setTimeout(() => setIsProcessingData(false), 100);
      }

      // Refresh selected node details if needed
      if (selectedNode) {
        let updatedDetails;
        if (selectedNode.type === 'definition') {
          updatedDetails = await getDefinitionByCode(selectedNode.id);
          updatedDetails = Array.isArray(updatedDetails) ? updatedDetails[0] : updatedDetails; // Handle array response
          if (updatedDetails) updatedDetails.type = 'definition';
        } else if (selectedNode.type === 'exercise') {
          updatedDetails = await getExerciseByCode(selectedNode.id);
          updatedDetails = Array.isArray(updatedDetails) ? updatedDetails[0] : updatedDetails; // Handle array response
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
    // Save positions when component unmounts
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

    // IMPORTANT FIX: Use a map to track code to node ID mapping
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
            console.warn(`Definition Link: Prerequisite code ${prereqCode} not found in codeToId map for target ${targetId}`);
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
              console.warn(`Invalid prerequisite code found for exercise ${nodeId}:`, prereqCode);
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
                console.warn(`Exercise Link SKIPPED: Prerequisite code ${prereqCode} (maps to ${sourceId}) is not a definition node for target ${nodeId}.`);
              }
            } else {
              console.warn(`Exercise Link: Prerequisite code ${prereqCode} not found in codeToId map for target ${nodeId}`);
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
      // Show success message but without alert to be less intrusive
      console.log("Node positions saved successfully.");
    } catch (err) {
      console.error("Failed to save positions:", err);
      alert("Failed to save node positions: " + (err.message || "Unknown error"));
    } finally {
      setIsSavingPositions(false);
    }
  };

  // Current description for display - handles multiple description formats.
  // The backend API stores descriptions as strings, possibly with '|||' delimiter
  // to represent multiple alternative descriptions.
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
  // Backend stores multiple descriptions as a single string with '|||' delimiter
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
        description = descriptions.join('|||');  // Join with delimiter for API compatibility
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

      // Success message (less intrusive than alert)
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

      // Success message (less intrusive than alert)
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

  // Get combined definitions and exercises
  const getAllNodes = useCallback(() => {
    const allNodeDetails: Record<string, Definition | Exercise> = {
      ...graphData.definitions,
      ...graphData.exercises
    };
    return allNodeDetails;
  }, [graphData]);

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

  // Replace the createNewNode function with this implementation
  const createNewNode = useCallback((type: 'definition' | 'exercise') => {
    // Get center position of current view for new node placement
    let position: {x: number, y: number} | undefined = undefined;

    if (graphRef.current) {
      // Try to get the center coordinates of the current view
      try {
        const graphInstance = graphRef.current;
        // ForceGraph methods might not include centerX/Y directly. Use internal state or zoom/pan methods.
        // Let's try to get the current translation and zoom.
        const { k: zoom, x: transX, y: transY } = graphInstance.zoom() || { k: 1, x: 0, y: 0 };
        const { width, height } = graphInstance.getBoundingClientRect() || { width: 800, height: 600 }; // Fallback dimensions

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
        // Fallback: Use 0,0 or another default if needed
      }
    }

    // Update modal state
    setNodeCreationType(type);
    setNodeCreationPosition(position);
    setShowNodeCreationModal(true);
  }, []); // graphRef is stable

  // Add the handleNodeCreationSuccess function
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
        const newNode = graphNodes.find(n => n.id === nodeId); // Check updated state
        if (newNode) {
           navigateToNode(nodeId);
        } else {
          console.warn(`Could not find newly created node ${nodeId} in graphNodes after refresh. Navigation skipped.`);
        }
      } catch (err) {
        console.error("Could not navigate to new node:", err);
      }
    }, 800); // Increased timeout slightly
  }, [refreshGraph, navigateToNode, nodeCreationType, graphNodes]); // Added graphNodes dependency

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

  // Custom node rendering
  const nodeCanvasObject = useCallback((node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const { id, name, type, x = 0, y = 0 } = node;
    const nodeSizeBase = type === 'definition' ? 6 : 5;
    const nodeSize = nodeSizeBase / Math.sqrt(globalScale);
    const labelOffset = nodeSize + 3 / globalScale;
    const fontSize = Math.max(4, 10 / globalScale);
    const isSelected = selectedNode?.id === id;
    const isHighlighted = highlightNodes.has(id);

    // Colors
    let color;
    if (type === 'definition') {
      color = node.isRootDefinition ? '#28a745' : '#007bff'; // Green root, Blue def
    } else { // Exercise
      const difficultyColors = ['#66bb6a', '#9ccc65', '#ffee58', '#ffa726', '#ff7043', '#ef5350', '#d32f2f'];
      let difficultyLevel = 2;
      if (node.difficulty) {
        const parsedDifficulty = parseInt(node.difficulty, 10);
        if (!isNaN(parsedDifficulty)) {
          difficultyLevel = Math.max(0, Math.min(6, parsedDifficulty - 1));
        }
      }
      color = difficultyColors[difficultyLevel];
    }

    // Selection/Highlight Glow
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(x, y, nodeSize + 4 / globalScale, 0, 2 * Math.PI, false);
      ctx.fillStyle = 'rgba(255, 165, 0, 0.5)';
      ctx.fill();
    } else if (isHighlighted) {
      ctx.beginPath();
      ctx.arc(x, y, nodeSize + 3 / globalScale, 0, 2 * Math.PI, false);
      ctx.fillStyle = 'rgba(0, 123, 255, 0.3)';
      ctx.fill();
    }

    // Draw node circle
    ctx.beginPath();
    ctx.arc(x, y, nodeSize, 0, 2 * Math.PI, false);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 0.5 / globalScale;
    ctx.stroke();

    // Label Rendering
    const labelThreshold = 0.7; // Zoom level to show labels
    if ((showNodeLabels && globalScale > labelThreshold) || isSelected || isHighlighted) {
      const label = `${id}: ${name}`;

      ctx.font = `${fontSize}px Sans-Serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#333';

      // Truncate label if needed
      const truncatedLabel = label.length > 30 ? label.substring(0, 27) + '...' : label;

      // White "halo" for readability
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2 / globalScale;
      ctx.strokeText(truncatedLabel, x, y + labelOffset + fontSize * 0.5);
      ctx.fillText(truncatedLabel, x, y + labelOffset + fontSize * 0.5);
    }
  }, [selectedNode, highlightNodes, showNodeLabels]);

  // Link color
  const linkColor = useCallback((link: GraphLink) => {
    // Handle both string and object references
    const sourceId = typeof link.source === 'object' ? (link.source as GraphNode).id : String(link.source);
    const targetId = typeof link.target === 'object' ? (link.target as GraphNode).id : String(link.target);

    // Check target node type for styling
    const targetNode = graphNodes.find(n => n.id === targetId);
    if (targetNode?.type === 'exercise') {
      return '#ff4500'; // Bright orange-red for exercise links
    }

    // Highlight or default color
    const linkId = `${sourceId}-${targetId}`;
    return highlightLinks.has(linkId) ? '#f59e0b' : '#aaa';
  }, [graphNodes, highlightLinks]);

  // Link width
  const linkWidth = useCallback((link: GraphLink) => {
    const sourceId = typeof link.source === 'object' ? (link.source as GraphNode).id : String(link.source);
    const targetId = typeof link.target === 'object' ? (link.target as GraphNode).id : String(link.target);

    // Thicker exercise links
    const targetNode = graphNodes.find(n => n.id === targetId);
    if (targetNode?.type === 'exercise') {
      return 1.8;
    }

    // Highlight or default width
    const linkId = `${sourceId}-${targetId}`;
    return highlightLinks.has(linkId) ? 2 : 0.8;
  }, [graphNodes, highlightLinks]);

  return (
    <MathJaxProvider>
      <div className="h-full flex flex-col overflow-hidden bg-gray-100">

        {/* Node Creation Modal */}
        <NodeCreationModal
          type={nodeCreationType}
          domainId={parseInt(subjectMatterId, 10)} // Ensure subjectMatterId can be parsed
          isOpen={showNodeCreationModal}
          onClose={() => setShowNodeCreationModal(false)}
          onSuccess={handleNodeCreationSuccess}
          availablePrerequisites={graphNodes
            .filter(node => node.type === 'definition')
            .map(node => ({ id: node.id, name: node.name })) // Pass id (code) and name
          }
          position={nodeCreationPosition}
        />

        {/* Toast notifications */}
        <ToastContainer />

        {/* Top Controls */}
        <div className="bg-white border-b p-3 flex justify-between items-center shadow-sm flex-shrink-0">
          {/* Left: Back Button + Title */}
          <div className="flex items-center flex-shrink-0 mr-4">
            <Button variant="ghost" size="icon" onClick={onBack} className="mr-2 h-9 w-9">
              <ArrowLeft size={18} />
            </Button>
            <h2 className="text-lg font-semibold truncate" title={subjectMatterId}>
              {subjectMatterId || "Knowledge Graph"}
            </h2>
          </div>

          {/* Center: Mode Buttons */}
          <div className="flex space-x-2">
            <Button
              variant={mode === 'study' ? 'default' : 'outline'}
              size="sm"
              onClick={() => changeMode('study')}
              className="flex items-center"
            >
              <Book size={14} className="mr-1" />
              Study
            </Button>
            <Button
              variant={mode === 'practice' ? 'default' : 'outline'}
              size="sm"
              onClick={() => changeMode('practice')}
              className="flex items-center"
            >
              <BarChart size={14} className="mr-1" />
              Practice
            </Button>
          </div>

          {/* Right: View/Action Buttons */}
          <div className="flex items-center space-x-2 flex-shrink-0 ml-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNodeLabels(!showNodeLabels)}
              title={showNodeLabels ? 'Hide Labels' : 'Show Labels'}
              className="flex items-center"
            >
              {showNodeLabels ? <EyeOff size={14} className="mr-1" /> : <Eye size={14} className="mr-1" />} Labels
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={zoomToFit}
              title="Fit Graph"
              className="flex items-center"
            >
              <ZoomIn size={14} className="mr-1" /> Fit
            </Button>
            {positionsChanged && onPositionUpdate && Object.keys(nodePositions.current).length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={savePositions}
                disabled={isSavingPositions}
                title="Save current node positions to server"
                className={`flex items-center ${positionsChanged ? 'bg-blue-50 hover:bg-blue-100' : ''}`}
              >
                {isSavingPositions ? "Saving..." : "Save Layout"}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => createNewNode('definition')}
              title="Add Definition"
              className="flex items-center"
            >
              <Plus size={14} className="mr-1" /> Def
            </Button>
            {mode === 'practice' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => createNewNode('exercise')}
                title="Add Exercise"
                className="flex items-center"
              >
                <Plus size={14} className="mr-1" /> Ex
              </Button>
            )}
          </div>
        </div>

        {/* Main content area */}
        <div className="flex flex-1 overflow-hidden relative">
          {/* Left Panel (Sliding) */}
          <div className={`absolute top-0 left-0 h-full z-20 bg-white border-r shadow-lg transition-transform duration-300 ease-in-out ${
            showLeftPanel ? 'translate-x-0 w-64' : '-translate-x-full w-64'
          }`}>
            {showLeftPanel && (
              <div className="p-4 flex flex-col h-full">
                {/* Header + Close Button */}
                <div className="flex justify-between items-center mb-3 flex-shrink-0">
                  <h3 className="font-semibold text-base">Browse Nodes</h3>
                  <Button variant="ghost" size="icon" onClick={toggleLeftPanel} className="h-7 w-7">
                    <X size={16} />
                  </Button>
                </div>

                {/* Search */}
                <div className="mb-3 flex-shrink-0">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                    <Input
                      type="search"
                      placeholder="Search..."
                      className="pl-8 text-sm h-9"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                {/* Filters */}
                <div className="flex space-x-1 mb-3 flex-shrink-0">
                  <Button
                    size="sm"
                    variant={filteredNodeType === 'all' ? 'secondary' : 'ghost'}
                    className="flex-1 text-xs h-7"
                    onClick={() => setFilteredNodeType('all')}
                  >
                    All
                  </Button>
                  <Button
                    size="sm"
                    variant={filteredNodeType === 'definition' ? 'secondary' : 'ghost'}
                    className="flex-1 text-xs h-7"
                    onClick={() => setFilteredNodeType('definition')}
                  >
                    Defs
                  </Button>
                  {(mode === 'practice' || graphNodes.some(n => n.type === 'exercise')) && (
                    <Button
                      size="sm"
                      variant={filteredNodeType === 'exercise' ? 'secondary' : 'ghost'}
                      className="flex-1 text-xs h-7"
                      onClick={() => setFilteredNodeType('exercise')}
                    >
                      Exer
                    </Button>
                  )}
                </div>

                {/* Node List */}
                <div className="flex-1 overflow-y-auto pr-1 min-h-0">
                  {filteredNodes().length > 0 ? (
                    <ul className="space-y-1">
                      {filteredNodes().map(node => (
                        <li
                          key={node.id}
                          className={`px-2 py-1.5 text-sm rounded cursor-pointer border ${
                            selectedNode?.id === node.id
                              ? (node.type === 'definition'
                                 ? 'bg-blue-100 text-blue-800 border-blue-300'
                                 : 'bg-orange-100 text-orange-800 border-orange-300')
                              : 'border-transparent hover:bg-gray-100'
                          }`}
                          onClick={() => handleNodeClick(node)}
                          title={`${node.id}: ${node.name}`}
                        >
                          <div className="font-medium truncate">{node.id}: {node.name}</div>
                          {node.type === 'exercise' && (
                            <div className="text-xs text-gray-500">
                              Diff: {node.difficulty ? "★".repeat(parseInt(node.difficulty, 10)) : "?"}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-500 text-sm p-4 text-center italic">No matching nodes.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Left Panel Toggle Button */}
          {!showLeftPanel && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleLeftPanel}
              className="absolute left-3 top-3 z-30 bg-white shadow-md rounded-full h-9 w-9"
              title="Show Browser"
            >
              <Menu size={18} />
            </Button>
          )}

          {/* Graph Canvas Area */}
          <div className="flex-1 bg-gray-50 overflow-hidden relative">
            {isProcessingData ? (
              <div className="flex items-center justify-center h-full">
                <p>Processing graph data...</p>
              </div>
            ) : graphNodes.length > 0 ? (
              <ForceGraph2D
                ref={graphRef}
                graphData={{ nodes: graphNodes, links: graphLinks }}
                key={`graph-${mode}-${graphNodes.length}-${graphLinks.length}`} // Update key more reliably on data change
                nodeId="id"
                linkSource="source"
                linkTarget="target"
                nodeVal={node => node.type === 'definition' ? 8 : 6}
                nodeCanvasObject={nodeCanvasObject}
                linkColor={linkColor}
                linkWidth={linkWidth}
                linkDirectionalArrowLength={4}
                linkDirectionalArrowRelPos={1}
                linkCurvature={0.15}
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
                onNodeDragEnd={handleNodeDragEnd}
                d3AlphaDecay={0.02}
                d3VelocityDecay={0.3}
                warmupTicks={50}
                cooldownTicks={0}
                // Assign fixed positions from state if available
                nodeRelSize={1} // Ensure nodeVal is used for size scaling relative to this
                nodeVisibility={node => filteredNodeType === 'all' || node.type === filteredNodeType || (selectedNode?.id === node.id) || highlightNodes.has(node.id)} // Basic filtering visibility
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <p>No graph data to display.</p>
              </div>
            )}

            {/* Legend */}
            {!isProcessingData && graphNodes.length > 0 && (
              <div className="absolute bottom-3 left-3 bg-white p-2 rounded shadow-md text-xs border max-w-[150px] z-10">
                <div className="font-semibold mb-1">Legend</div>
                <div className="flex items-center mb-1">
                  <div className="w-3 h-3 rounded-full bg-[#28a745] mr-1.5 border border-gray-400 flex-shrink-0"></div>
                  <span className="truncate">Root Def.</span>
                </div>
                <div className="flex items-center mb-1">
                  <div className="w-3 h-3 rounded-full bg-[#007bff] mr-1.5 border border-gray-400 flex-shrink-0"></div>
                  <span className="truncate">Definition</span>
                </div>
                {(mode === 'practice' || graphNodes.some(n => n.type === 'exercise')) && (
                  <div className="flex items-center mb-1">
                    <div className="w-3 h-3 rounded-full bg-gradient-to-r from-green-400 via-yellow-400 to-red-500 mr-1.5 border border-gray-400 flex-shrink-0"></div>
                    <span className="truncate">Exercise</span>
                  </div>
                )}
                <div className="flex items-center mt-1 pt-1 border-t">
                  <div style={{width: '12px', height: '2px', backgroundColor: '#aaa', marginRight: '6px', flexShrink: 0}}></div>
                  <span className="truncate">Prereq. Link</span>
                 </div>
                {(mode === 'practice' || graphNodes.some(n => n.type === 'exercise')) && (
                 <div className="flex items-center">
                  <div style={{width: '12px', height: '2px', backgroundColor: '#ff4500', marginRight: '6px', flexShrink: 0}}></div>
                  <span className="truncate">Exercise Link</span>
                 </div>
                )}
              </div>
            )}
          </div>

          {/* Right Panel (Sliding) */}
          <div className={`absolute top-0 right-0 h-full z-20 bg-white border-l shadow-lg transition-transform duration-300 ease-in-out ${
            showRightPanel && selectedNode ? 'translate-x-0 w-80' : 'translate-x-full w-80'
          }`}>
            {selectedNode ? (
              <div className="h-full flex flex-col">
                {/* Panel Header */}
                <div className="border-b p-3 flex-shrink-0">
                  <div className="flex justify-between items-center">
                    {/* Back Button + Title */}
                    <div className="flex items-center min-w-0 mr-2">
                      {nodeHistory.length > 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={navigateBack}
                          className="mr-1 h-8 w-8 flex-shrink-0"
                        >
                          <ArrowLeft size={16} />
                        </Button>
                      )}
                      <h3
                        className="font-semibold text-base truncate flex-grow"
                        title={`${selectedNode.id}: ${selectedNode.name}`}
                      >
                        {selectedNode.id}: {selectedNode.name}
                      </h3>
                    </div>

                    {/* Edit + Close Buttons */}
                    <div className="flex flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsEditMode(!isEditMode)}
                        className="h-8 w-8 mr-1"
                        title={isEditMode ? "View Mode" : "Edit Mode"}
                      >
                        <Edit size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleRightPanel}
                        className="h-8 w-8"
                        title="Close Panel"
                      >
                        <X size={16} />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Panel Body */}
                <div className="flex-1 overflow-y-auto p-4 space-y-5 min-h-0">
                  {!selectedNodeDetails && !isEditMode ? (
                    <div className="text-center py-5 text-gray-500">Loading details...</div>
                  ) : isEditMode ? (
                    /* --- Edit Form --- */
                    <div className="space-y-4 text-sm">
                      {/* Common Fields */}
                      <div>
                        <label className="block text-xs font-medium mb-1 text-gray-600">ID</label>
                        <Input value={selectedNode.id} disabled className="h-8 text-sm bg-gray-100"/>
                      </div>
                      <div>
                        <label htmlFor="name" className="block text-xs font-medium mb-1 text-gray-600">Name</label>
                        <Input id="name" defaultValue={selectedNode.name} className="h-8 text-sm"/>
                      </div>

                      {/* Type-Specific Fields */}
                      {selectedNode.type === 'definition' ? (
                        <>
                          <div>
                            <label htmlFor="description" className="block text-xs font-medium mb-1 text-gray-600">Description</label>
                            {hasMultipleDescriptions() && (
                              <div className="text-xs text-gray-500 mb-1">
                                Editing version {selectedDefinitionIndex + 1}/{totalDescriptions()}
                              </div>
                            )}
                            <textarea
                              id="description"
                              rows={6}
                              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
                              defaultValue={currentDescription()}
                              placeholder="Enter definition..."
                            />
                          </div>
                          <div>
                            <label htmlFor="notes" className="block text-xs font-medium mb-1 text-gray-600">Notes</label>
                            <textarea
                              id="notes"
                              rows={3}
                              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
                              defaultValue={(selectedNodeDetails as Definition)?.notes || ''}
                              placeholder="Additional notes..."
                            />
                          </div>
                          <div>
                            <label htmlFor="references" className="block text-xs font-medium mb-1 text-gray-600">References (one per line)</label>
                            <textarea
                              id="references"
                              rows={3}
                              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
                              defaultValue={(selectedNodeDetails as Definition)?.references?.join('\n') || ''}
                              placeholder="e.g., Book Title, Chapter 3"
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <label htmlFor="statement" className="block text-xs font-medium mb-1 text-gray-600">Statement</label>
                            <textarea
                              id="statement"
                              rows={4}
                              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
                              defaultValue={(selectedNodeDetails as Exercise)?.statement}
                              placeholder="Exercise statement..."
                            />
                          </div>
                          <div>
                            <label htmlFor="description" className="block text-xs font-medium mb-1 text-gray-600">Solution</label>
                            <textarea
                              id="description"
                              rows={5}
                              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
                              defaultValue={(selectedNodeDetails as Exercise)?.description}
                              placeholder="Solution details..."
                            />
                          </div>
                          <div>
                            <label htmlFor="hints" className="block text-xs font-medium mb-1 text-gray-600">Hints</label>
                            <textarea
                              id="hints"
                              rows={3}
                              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
                              defaultValue={(selectedNodeDetails as Exercise)?.hints || ''}
                              placeholder="Hints..."
                            />
                          </div>
                          <div className="flex space-x-4 items-end">
                            <div>
                              <label htmlFor="difficulty" className="block text-xs font-medium mb-1 text-gray-600">Difficulty (1-7)</label>
                              <Input
                                id="difficulty"
                                type="number"
                                min="1"
                                max="7"
                                defaultValue={(selectedNodeDetails as Exercise)?.difficulty || '3'}
                                className="w-20 h-8 text-sm"
                              />
                            </div>
                            <div className="flex items-center pb-1">
                              <input
                                id="verifiable"
                                type="checkbox"
                                defaultChecked={(selectedNodeDetails as Exercise)?.verifiable}
                                className="h-4 w-4 mr-1.5"
                              />
                              <label htmlFor="verifiable" className="text-xs font-medium text-gray-600">Verifiable?</label>
                            </div>
                          </div>
                          <div>
                            <label htmlFor="result" className="block text-xs font-medium mb-1 text-gray-600">Expected Result (if verifiable)</label>
                            <Input
                              id="result"
                              defaultValue={(selectedNodeDetails as Exercise)?.result || ''}
                              placeholder="Expected answer"
                              className="h-8 text-sm"
                            />
                          </div>
                        </>
                      )}

                      {/* Prerequisites Select (Common) */}
                      <div>
                        <label htmlFor="prerequisites" className="block text-xs font-medium mb-1 text-gray-600">Prerequisites (Definitions)</label>
                        <select
                          id="prerequisites"
                          multiple
                          className="w-full border border-gray-300 rounded p-2 h-24 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
                          defaultValue={selectedNodeDetails?.prerequisites || []}
                        >
                          {graphNodes
                            .filter(n => n.type === 'definition' && n.id !== selectedNode.id)
                            .sort((a,b) => a.id.localeCompare(b.id))
                            .map(node => (
                              <option key={node.id} value={node.id}>{node.id}: {node.name}</option>
                            ))
                          }
                        </select>
                        <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple</p>
                      </div>

                      {/* Save/Cancel Buttons */}
                      <div className="flex justify-end space-x-2 pt-2 border-t mt-4">
                        <Button variant="outline" size="sm" onClick={() => setIsEditMode(false)}>Cancel</Button>
                        <Button
                          size="sm"
                          onClick={selectedNode.type === 'definition' ? handleDefinitionEditSubmit : handleExerciseEditSubmit}
                        >
                          Save Changes
                        </Button>
                      </div>
                    </div>
                  ) : selectedNodeDetails ? (
                    <>
                      {selectedNode.type === 'definition' ? (
                        <>
                          {/* Definition View Blocks */}
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider">Definition</h4>
                              {mode === 'study' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setShowDefinition(!showDefinition)}
                                  className="h-6 text-xs px-1"
                                >
                                  {showDefinition ? 'Hide' : 'Show'}
                                </Button>
                              )}
                            </div>
                            {(showDefinition || mode !== 'study') && (
                              <Card className="bg-gray-50 border shadow-sm">
                                <CardContent className="p-3 text-sm">
                                  {hasMultipleDescriptions() && (
                                    <div className="flex justify-between items-center mb-2 text-xs border-b pb-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={selectedDefinitionIndex === 0}
                                        onClick={() => setSelectedDefinitionIndex(i => Math.max(0, i - 1))}
                                        className="h-5 px-1 text-xs"
                                      >
                                        Prev
                                      </Button>
                                      <span>Ver {selectedDefinitionIndex + 1}/{totalDescriptions()}</span>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={selectedDefinitionIndex >= totalDescriptions() - 1}
                                        onClick={() => setSelectedDefinitionIndex(i => Math.min(totalDescriptions() - 1, i + 1))}
                                        className="h-5 px-1 text-xs"
                                      >
                                        Next
                                      </Button>
                                    </div>
                                  )}
                                  <MathJaxContent key={selectedDefinitionIndex}>
                                    {currentDescription() || <span className="text-gray-400 italic">N/A</span>}
                                  </MathJaxContent>
                                </CardContent>
                              </Card>
                            )}
                          </div>
                          {(selectedNodeDetails as Definition).notes && (
                            <div>
                              <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">Official Notes</h4>
                              <p className="text-sm text-gray-800 bg-yellow-50 p-2 rounded border border-yellow-200">
                                {(selectedNodeDetails as Definition).notes}
                              </p>
                            </div>
                          )}
                          <div>
                            <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">Prerequisites</h4>
                            {selectedNodeDetails.prerequisites?.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {selectedNodeDetails.prerequisites.map(id => (
                                  <Button
                                    key={id}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigateToNode(id)}
                                    className="h-6 text-xs px-1.5 bg-blue-50 hover:bg-blue-100 border-blue-200"
                                  >
                                    {id}
                                  </Button>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500 italic">None</p>
                            )}
                          </div>
                          {relatedExercises.length > 0 && (
                            <div>
                              <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">Related Exercises</h4>
                              <div className="flex flex-wrap gap-1">
                                {relatedExercises.map(id => (
                                  <Button
                                    key={id}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigateToNode(id)}
                                    className="h-6 text-xs px-1.5 bg-orange-50 hover:bg-orange-100 border-orange-200"
                                  >
                                    {id}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          )}
                          {(selectedNodeDetails as Definition).references?.length > 0 && (
                            <div>
                              <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">References</h4>
                              <ul className="text-sm text-gray-700 list-disc pl-5 space-y-0.5">
                                {(selectedNodeDetails as Definition).references.map((ref, i) => (
                                  <li key={i} className="text-xs">{ref}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          <div>
                            <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">Rate Understanding</h4>
                            <div className="flex flex-wrap gap-1.5">
                              {(['again', 'hard', 'good', 'easy'] as const).map(r => (
                                <Button
                                  key={r}
                                  variant="outline"
                                  size="sm"
                                  className={`h-6 px-2 text-xs ${
                                    r === 'again' ? 'bg-red-50 hover:bg-red-100 border-red-200' :
                                    r === 'hard' ? 'bg-orange-50 hover:bg-orange-100 border-orange-200' :
                                    r === 'good' ? 'bg-green-50 hover:bg-green-100 border-green-200' :
                                    'bg-blue-50 hover:bg-blue-100 border-blue-200'
                                  }`}
                                  onClick={() => handleReviewDefinition(r)}
                                >
                                  {r[0].toUpperCase() + r.slice(1)}
                                </Button>
                              ))}
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">Problem Statement</h4>
                            <Card className="bg-gray-50 border shadow-sm">
                              <CardContent className="p-3 text-sm">
                                <MathJaxContent>
                                  {(selectedNodeDetails as Exercise).statement || <span className="text-gray-400 italic">N/A</span>}
                                </MathJaxContent>
                              </CardContent>
                            </Card>
                          </div>
                          {(selectedNodeDetails as Exercise).hints && (
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider">Hints</h4>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setShowHints(!showHints)}
                                  className="h-6 text-xs px-1"
                                >
                                  {showHints ? 'Hide' : 'Show'}
                                </Button>
                              </div>
                              {showHints && (
                                <Card className="bg-yellow-50 border border-yellow-200 shadow-sm">
                                  <CardContent className="p-3 text-sm">
                                    <MathJaxContent>{(selectedNodeDetails as Exercise).hints}</MathJaxContent>
                                  </CardContent>
                                </Card>
                              )}
                            </div>
                          )}
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider">Solution</h4>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowSolution(!showSolution)}
                                className="h-6 text-xs px-1"
                              >
                                {showSolution ? 'Hide' : 'Show'}
                              </Button>
                            </div>
                            {showSolution && (
                              <Card className="bg-green-50 border border-green-200 shadow-sm">
                                <CardContent className="p-3 text-sm">
                                  <MathJaxContent>
                                    {(selectedNodeDetails as Exercise).description || <span className="text-gray-400 italic">N/A</span>}
                                  </MathJaxContent>
                                </CardContent>
                              </Card>
                            )}
                          </div>
                          <div>
                            <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">Your Answer</h4>
                            <textarea
                              className="w-full border border-gray-300 rounded p-2 h-20 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400 resize-y"
                              placeholder="Enter your answer..."
                              value={userAnswer}
                              onChange={(e) => setUserAnswer(e.target.value)}
                            />
                            {(selectedNodeDetails as Exercise).verifiable && (
                              <div className="mt-1.5 flex justify-end">
                                <Button size="sm" onClick={verifyAnswer} className="h-7 text-xs">
                                  Verify Answer
                                </Button>
                              </div>
                            )}
                            {answerFeedback && (
                              <div className={`mt-2 p-2 text-xs rounded border ${
                                answerFeedback.correct ? 'bg-green-100 text-green-800 border-green-300' : 'bg-red-100 text-red-800 border-red-300'
                              }`}>
                                {answerFeedback.message}
                              </div>
                            )}
                          </div>
                          <div>
                            <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">Related Concepts</h4>
                            {selectedNodeDetails.prerequisites?.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {selectedNodeDetails.prerequisites.map(id => (
                                  <Button
                                    key={id}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => navigateToNode(id)}
                                    className="h-6 text-xs px-1.5 bg-blue-50 hover:bg-blue-100 border-blue-200"
                                  >
                                    {id}
                                  </Button>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500 italic">None</p>
                            )}
                          </div>
                        </>
                      )}

                      {/* Personal Notes (always present in view mode, with clear explanation) */}
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider">Personal Notes (Saved Locally)</h4>
                          <div className="text-xs text-gray-500 italic">Auto-saving</div>
                        </div>
                        <textarea
                          className="w-full border border-gray-300 rounded p-2 h-20 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
                          placeholder="Add your personal notes here. These are stored in your browser only."
                          value={personalNotes[selectedNode.id] || ''}
                          onChange={(e) => saveNotes(selectedNode.id, e.target.value)}
                        />
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center p-4">
                <div className="text-center text-gray-500">
                  <Eye size={24} className="mx-auto mb-2" />
                  <p className="text-sm">Select a node to view details</p>
                  {!showLeftPanel && (
                    <Button size="sm" variant="link" className="text-xs mt-2" onClick={toggleLeftPanel}>
                      Show Node Browser
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </MathJaxProvider>
  );
};

export default KnowledgeGraph;
