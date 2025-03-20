// src/app/components/Graph/KnowledgeGraph.tsx
"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { MathJaxProvider, MathJaxContent } from '@/app/components/core/MathJaxWrapper';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/core/tabs";
import { Card, CardContent } from "@/app/components/core/card";
import { ArrowLeft, Search, Plus, Edit, Eye, EyeOff, ZoomIn, Settings, Book, BarChart, X } from 'lucide-react';
import { 
  reviewDefinition, 
  attemptExercise,
  getDefinitionByCode,
  getExerciseByCode,
  updateDefinition,
  updateExercise,
  GraphData 
} from '@/lib/api';

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
      errorMessage = response.statusText || `HTTP error ${response.status}`;
    }
    console.error(`API Error: ${errorMessage}`, { status: response.status, url: response.url });
    throw new Error(errorMessage);
  }

  if (response.status === 204) {
    return null;
  }

  const data = await response.json();
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
  prerequisites: string[];
  xPosition?: number;
  yPosition?: number;
}

interface Exercise {
  id: number;
  code: string;
  name: string;
  difficulty: string;
  statement: string;
  description: string;
  hints?: string;
  verifiable: boolean;
  result?: string;
  prerequisites: string[];
  xPosition?: number;
  yPosition?: number;
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
}

interface GraphLink {
  source: string;
  target: string;
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
  
  // Track node position changes
  const nodePositions = useRef<Record<string, { x: number; y: number }>>({});

  // Utility function to get definition ID by code
  const getDefinitionIdByCode = async (code) => {
    try {
      const definition = await getDefinitionByCode(code);
      return definition.id;
    } catch (error) {
      console.error('Error getting definition ID by code:', error);
      throw error;
    }
  };
  
  // Utility function to get exercise ID by code
  const getExerciseIdByCode = async (code) => {
    try {
      const exercise = await getExerciseByCode(code);
      return exercise.id;
    } catch (error) {
      console.error('Error getting exercise ID by code:', error);
      throw error;
    }
  };
  
  // Refresh graph data after changes
  const refreshGraph = async () => {
    try {
      // Refetch the domain data with the updated information
      const domainId = graphData?.definitions?.[Object.keys(graphData.definitions)[0]]?.domainId;
      
      if (!domainId) {
        console.error('Unable to determine domain ID for refresh');
        return;
      }
      
      const response = await fetch(`${API_URL}/api/domains/${domainId}/graph`, {
        headers: getAuthHeaders(),
      });
      
      const updatedGraph = await handleResponse(response);
      
      // Update nodes and links
      setGraphNodes(updatedGraph.nodes);
      setGraphLinks(updatedGraph.links);
      
      // Refresh selected node details if needed
      if (selectedNode) {
        let updatedDetails;
        if (selectedNode.type === 'definition') {
          updatedDetails = await getDefinitionByCode(selectedNode.id);
        } else if (selectedNode.type === 'exercise') {
          updatedDetails = await getExerciseByCode(selectedNode.id);
        }
        
        if (updatedDetails) {
          setSelectedNodeDetails(updatedDetails);
        }
      }
    } catch (error) {
      console.error('Failed to refresh graph:', error);
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
  
  // Add this safety check at the beginning of your useEffect in KnowledgeGraph.tsx
  useEffect(() => {
    // Add safety check to prevent "can't convert undefined to object" error
    if (!graphData || !graphData.definitions) {
      console.warn('Graph data is missing or incomplete', graphData);
      setGraphNodes([]);
      setGraphLinks([]);
      return;
    }
    
    const nodes: GraphNode[] = [];
    const links: GraphLink[] = [];
    
    // Process definitions
    Object.entries(graphData.definitions).forEach(([id, def]) => {
      nodes.push({
        id,
        name: def.name,
        type: 'definition',
        isRootDefinition: !def.prerequisites || def.prerequisites.length === 0,
        x: def.xPosition,
        y: def.yPosition
      });
      
      // Add links from prerequisites
      if (def.prerequisites) {
        def.prerequisites.forEach(prereqId => {
          links.push({
            source: prereqId,
            target: id,
            type: 'prerequisite'
          });
        });
      }
    });
    
    // Process exercises - with safety check
    if (mode === 'practice' && graphData.exercises) {
      Object.entries(graphData.exercises).forEach(([id, exercise]) => {
        nodes.push({
          id,
          name: exercise.name,
          type: 'exercise',
          difficulty: exercise.difficulty,
          x: exercise.xPosition,
          y: exercise.yPosition
        });
        
        // Add links from prerequisites
        if (exercise.prerequisites) {
          exercise.prerequisites.forEach(prereqId => {
            links.push({
              source: prereqId,
              target: id,
              type: 'prerequisite'
            });
          });
        }
      });
    }
    
    setGraphNodes(nodes);
    setGraphLinks(links);
    
    // Initialize nodePositions ref with existing positions
    nodes.forEach(node => {
      if (node.x !== undefined && node.y !== undefined) {
        nodePositions.current[node.id] = { x: node.x, y: node.y };
      }
    });
  }, [graphData, mode]);
  
  // Fit graph to view when data changes
  useEffect(() => {
    if (graphRef.current && graphNodes.length > 0) {
      setTimeout(() => {
        graphRef.current.zoomToFit(400);
      }, 500);
    }
  }, [graphNodes]);
  
  // Save positions to backend
  const savePositions = async () => {
    if (!onPositionUpdate || Object.keys(nodePositions.current).length === 0) return;
    
    setIsSavingPositions(true);
    try {
      await onPositionUpdate(nodePositions.current);
      setPositionsChanged(false);
    } catch (err) {
      console.error("Failed to save positions:", err);
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
        description = descriptions.join('|||');
      }
      
      const notes = notesInput?.value || '';
      const references = referencesInput?.value.split('\n').filter(r => r.trim() !== '');
      
      // Get selected prerequisites
      const prerequisiteSelectElement = document.getElementById('prerequisites') as HTMLSelectElement;
      const prerequisiteIds = Array.from(prerequisiteSelectElement?.selectedOptions || [])
        .map(option => parseInt(option.value));
      
      // Prepare update data
      const updateData = {
        name,
        description,
        notes,
        references,
        prerequisiteIds
      };
      
      // Get definition ID from node ID if it's a string
      const definitionId = typeof selectedNode.id === 'string' 
        ? await getDefinitionIdByCode(selectedNode.id)
        : parseInt(selectedNode.id);
      
      // Update the definition
      await updateDefinition(definitionId, updateData);
      
      // Refresh data and graph
      await refreshGraph();
      
      // Exit edit mode
      setIsEditMode(false);
    } catch (error) {
      console.error('Failed to update definition:', error);
      alert('Failed to update definition. Please try again.');
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
      const difficulty = difficultyInput?.value || '3';
      const verifiable = verifiableInput?.checked || false;
      const result = resultInput?.value || '';
      
      // Get selected prerequisites
      const prerequisiteSelectElement = document.getElementById('prerequisites') as HTMLSelectElement;
      const prerequisiteIds = Array.from(prerequisiteSelectElement?.selectedOptions || [])
        .map(option => parseInt(option.value));
      
      // Prepare update data
      const updateData = {
        name,
        statement,
        description,
        hints,
        difficulty,
        verifiable,
        result,
        prerequisiteIds
      };
      
      // Get exercise ID from node ID if it's a string
      const exerciseId = typeof selectedNode.id === 'string' 
        ? await getExerciseIdByCode(selectedNode.id)
        : parseInt(selectedNode.id);
      
      // Update the exercise
      await updateExercise(exerciseId, updateData);
      
      // Refresh data and graph
      await refreshGraph();
      
      // Exit edit mode
      setIsEditMode(false);
    } catch (error) {
      console.error('Failed to update exercise:', error);
      alert('Failed to update exercise. Please try again.');
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
    
    return filtered;
  }, [graphNodes, filteredNodeType, searchQuery]);
  
  // Handle node selection
  const handleNodeClick = useCallback((node: GraphNode) => {
    // Store previous node in history
    if (selectedNode) {
      setNodeHistory([...nodeHistory, selectedNode.id]);
    }
    
    // Set new selected node
    setSelectedNode(node);
    
    // Get node details based on type
    const allNodes = getAllNodes();
    const details = allNodes[node.id];
    
    if (details) {
      setSelectedNodeDetails(details);
      
      // Reset view state
      setShowDefinition(mode !== 'study');
      setShowSolution(false);
      setShowHints(false);
      setSelectedDefinitionIndex(0);
      setAnswerFeedback(null);
      
      // Find related exercises for definitions
      if (node.type === 'definition') {
        const relatedExIds = Object.entries(graphData.exercises)
          .filter(([, ex]) => ex.prerequisites && ex.prerequisites.includes(node.id))
          .map(([id]) => id);
        
        setRelatedExercises(relatedExIds);
      } else {
        setRelatedExercises([]);
      }
    }
    
    // Show panel
    setShowRightPanel(true);
    
    // Center view on node
    if (graphRef.current && node.x && node.y) {
      graphRef.current.centerAt(node.x, node.y, 1000);
      graphRef.current.zoom(2, 1000);
    }
  }, [selectedNode, nodeHistory, getAllNodes, graphData, mode]);
  
  // Handle navigating to a specific node
  const navigateToNode = useCallback((nodeId: string) => {
    const node = graphNodes.find(n => n.id === nodeId);
    if (node) {
      handleNodeClick(node);
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
    // Reset highlights
    highlightNodes.clear();
    highlightLinks.clear();
    
    if (node) {
      // Highlight the node
      highlightNodes.add(node.id);
      
      // Highlight prerequisites
      const allNodes = getAllNodes();
      const nodeDetails = allNodes[node.id];
      
      if (nodeDetails && nodeDetails.prerequisites) {
        nodeDetails.prerequisites.forEach(prereqId => {
          highlightNodes.add(prereqId);
        });
      }
      
      // Highlight dependent nodes
      if (node.type === 'definition') {
        // Find exercises that depend on this definition
        Object.entries(graphData.exercises).forEach(([exId, ex]) => {
          if (ex.prerequisites && ex.prerequisites.includes(node.id)) {
            highlightNodes.add(exId);
          }
        });
        
        // Find definitions that depend on this definition
        Object.entries(graphData.definitions).forEach(([defId, def]) => {
          if (def.prerequisites && def.prerequisites.includes(node.id)) {
            highlightNodes.add(defId);
          }
        });
      }
      
      // Highlight all links connected to highlighted nodes
      graphLinks.forEach(link => {
        if (
          highlightNodes.has(link.source as string) && 
          highlightNodes.has(link.target as string)
        ) {
          highlightLinks.add(`${link.source}-${link.target}`);
        }
      });
    }
    
    // Force update of highlight sets
    setHighlightNodes(new Set(highlightNodes));
    setHighlightLinks(new Set(highlightLinks));
  }, [graphLinks, getAllNodes, graphData]);
  
  // Handle node drag end - save the position
  const handleNodeDragEnd = useCallback((node: GraphNode) => {
    if (node.x !== undefined && node.y !== undefined) {
      nodePositions.current[node.id] = { x: node.x, y: node.y };
      setPositionsChanged(true);
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
    
    try {
      // Get the exercise ID
      const exerciseId = typeof selectedNode.id === 'string'
        ? await getExerciseIdByCode(selectedNode.id)
        : parseInt(selectedNode.id);
        
      // Track the attempt and get verification from API
      const response = await attemptExercise(exerciseId, {
        exerciseId: exerciseId,
        answer: userAnswer,
        timeTaken: 0 // We're not tracking time in the UI for now
      });
      
      setAnswerFeedback({
        correct: response.correct,
        message: response.correct ? "Correct! Well done." : "Incorrect. Try again or check the solution."
      });
    } catch (err) {
      console.error("Error verifying answer:", err);
      setAnswerFeedback({
        correct: false,
        message: "Error verifying your answer. Please try again."
      });
    }
  }, [selectedNode, selectedNodeDetails, userAnswer]);
  
  // Save personal notes
  const saveNotes = useCallback((nodeId: string, notes: string) => {
    setPersonalNotes({
      ...personalNotes,
      [nodeId]: notes
    });
    // In a real app, you would store this in a database or localStorage
    localStorage.setItem(`notes_${nodeId}`, notes);
  }, [personalNotes]);
  
  // Load personal notes from localStorage
  useEffect(() => {
    if (selectedNode?.id) {
      const savedNotes = localStorage.getItem(`notes_${selectedNode.id}`);
      if (savedNotes) {
        setPersonalNotes(prev => ({
          ...prev,
          [selectedNode.id]: savedNotes
        }));
      }
    }
  }, [selectedNode]);
  
  // Toggle panels
  const toggleLeftPanel = useCallback(() => {
    setShowLeftPanel(!showLeftPanel);
  }, [showLeftPanel]);
  
  const toggleRightPanel = useCallback(() => {
    setShowRightPanel(!showRightPanel);
  }, [showRightPanel]);
  
  // Switch mode
  const changeMode = useCallback((newMode: AppMode) => {
    setMode(newMode);
    setSelectedNode(null);
    setSelectedNodeDetails(null);
    setShowRightPanel(false);
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
  }, []);
  
  // Create a new node
  const createNewNode = useCallback((type: 'definition' | 'exercise') => {
    // In production, this would open a form or modal
    alert(`Create new ${type} - This would open a form in the real implementation`);
  }, []);
  
  // Zoom graph to fit
  const zoomToFit = useCallback(() => {
    if (graphRef.current) {
      graphRef.current.zoomToFit(400, 40);
    }
  }, []);
  
  // Handle review for definition
  const handleReviewDefinition = useCallback(async (result: 'again' | 'hard' | 'good' | 'easy') => {
    if (!selectedNode || !selectedNodeDetails || selectedNode.type !== 'definition') return;
    
    try {
      // Get the definition ID
      const definitionId = typeof selectedNode.id === 'string'
        ? await getDefinitionIdByCode(selectedNode.id)
        : parseInt(selectedNode.id);
        
      // Submit the review
      await reviewDefinition(definitionId, {
        definitionId: definitionId,
        result: result,
        timeTaken: 0 // We're not tracking time in the UI for now
      });
      
      // Show feedback to the user
      alert(`Review recorded: ${result}`);
    } catch (err) {
      console.error("Error submitting review:", err);
      alert("Failed to record review. Please try again.");
    }
  }, [selectedNode, selectedNodeDetails]);
  
  // Custom node rendering
  const nodeCanvasObject = useCallback((node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const { id, name, type, x, y } = node;
    const fontSize = 12/globalScale;
    const isSelected = selectedNode && selectedNode.id === id;
    const isHighlighted = highlightNodes.has(id);
    
    // Determine node color
    let color;
    if (type === 'definition') {
      color = node.isRootDefinition ? '#34a853' : '#4285f4';
    } else {
      // Exercise color based on difficulty
      const difficultyColors = ['#66bb6a', '#26a69a', '#ffb74d', '#ff7043', '#e53935'];
      const difficultyLevel = parseInt(node.difficulty || '3', 10) - 1;
      color = difficultyColors[Math.max(0, Math.min(4, difficultyLevel))];
    }
    
    // Adjust for selection/highlight
    if (isSelected) {
      color = '#f59e0b'; // Amber color for selection
    } else if (isHighlighted) {
      // Draw highlight ring
      ctx.beginPath();
      ctx.arc(x || 0, y || 0, 8, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fill();
    }
    
    // Draw node
    ctx.beginPath();
    ctx.arc(x || 0, y || 0, isSelected ? 7 : 5, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
    
    // Draw node border
    ctx.strokeStyle = isSelected || isHighlighted ? '#fff' : 'rgba(0,0,0,0.2)';
    ctx.lineWidth = isSelected || isHighlighted ? 2/globalScale : 1/globalScale;
    ctx.stroke();
    
    // Draw label if enabled or node is selected/highlighted
    if (showNodeLabels || isSelected || isHighlighted) {
      // Draw node ID
      ctx.font = `${fontSize}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isSelected ? '#000' : '#333';
      ctx.fillText(id, x || 0, (y || 0) - 12);
      
      // Draw node name (truncated if too long)
      const maxNameLength = 15;
      const displayName = name.length > maxNameLength ? 
        name.substring(0, maxNameLength) + '...' : 
        name;
      
      ctx.font = `${fontSize * 0.9}px Arial`;
      ctx.fillText(displayName, x || 0, (y || 0) + 12);
    }
  }, [selectedNode, highlightNodes, showNodeLabels]);
  
  // Custom link rendering
  const linkColor = useCallback((link: GraphLink) => {
    const linkId = `${link.source}-${link.target}`;
    return highlightLinks.has(linkId) ? '#f59e0b' : '#999';
  }, [highlightLinks]);
  
  return (
    <MathJaxProvider>
      <div className="h-full flex flex-col overflow-hidden">
        {/* Top Controls */}
        <div className="bg-white border-b p-4 flex justify-between items-center">
          <div className="flex items-center">
            <Button variant="ghost" size="icon" onClick={onBack} className="mr-2">
              <ArrowLeft size={18} />
            </Button>
            <h2 className="text-xl font-bold">{subjectMatterId}</h2>
          </div>
          
          <div className="flex space-x-2">
            <Button 
              variant={mode === 'study' ? 'default' : 'outline'} 
              onClick={() => changeMode('study')}
              className="flex items-center"
            >
              <Book size={16} className="mr-2" />
              Study Mode
            </Button>
            <Button 
              variant={mode === 'practice' ? 'default' : 'outline'} 
              onClick={() => changeMode('practice')}
              className="flex items-center"
            >
              <BarChart size={16} className="mr-2" />
              Practice Mode
            </Button>
          </div>
          
          <div className="flex space-x-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowNodeLabels(!showNodeLabels)}
              className="flex items-center"
            >
              {showNodeLabels ? <EyeOff size={16} className="mr-1" /> : <Eye size={16} className="mr-1" />}
              {showNodeLabels ? 'Hide Labels' : 'Show Labels'}
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={zoomToFit}
              className="flex items-center"
            >
              <ZoomIn size={16} className="mr-1" />
              Fit View
            </Button>
            {positionsChanged && (
              <Button 
                variant="outline"
                size="sm"
                onClick={savePositions}
                disabled={isSavingPositions}
                className="flex items-center"
              >
                {isSavingPositions ? "Saving..." : "Save Positions"}
              </Button>
            )}
            <Button 
              onClick={() => createNewNode('definition')}
              className="flex items-center"
            >
              <Plus size={16} className="mr-1" />
              Definition
            </Button>
            {mode === 'practice' && (
              <Button 
                onClick={() => createNewNode('exercise')}
                className="flex items-center"
              >
                <Plus size={16} className="mr-1" />
                Exercise
              </Button>
            )}
          </div>
        </div>
        
        {/* Main content - flexbox layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel - Node browser and search */}
          <div className={`bg-white border-r transition-all duration-300 ${
            showLeftPanel ? 'w-64' : 'w-0'
          } overflow-hidden`}>
            <div className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-lg">Browse Nodes</h3>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={toggleLeftPanel}
                  className="h-8 w-8"
                >
                  <X size={16} />
                </Button>
              </div>
              
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    type="search"
                    placeholder="Search nodes..."
                    className="pl-8"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              
              <Tabs defaultValue="definitions">
                <TabsList className="w-full">
                  <TabsTrigger 
                    value="definitions" 
                    className="flex-1"
                    onClick={() => setFilteredNodeType('definition')}
                  >
                    Definitions
                  </TabsTrigger>
                  <TabsTrigger 
                    value="exercises" 
                    className="flex-1"
                    onClick={() => setFilteredNodeType('exercise')}
                  >
                    Exercises
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="definitions" className="mt-2">
                  {filteredNodes().filter(n => n.type === 'definition').length > 0 ? (
                    <ul className="space-y-1">
                      {filteredNodes()
                        .filter(n => n.type === 'definition')
                        .map(node => (
                          <li 
                            key={node.id}
                            className={`px-2 py-1.5 text-sm rounded cursor-pointer ${
                              selectedNode?.id === node.id 
                                ? 'bg-blue-100 text-blue-800' 
                                : 'hover:bg-gray-100'
                            }`}
                            onClick={() => handleNodeClick(node)}
                          >
                            <div className="font-medium">{node.id}: {node.name}</div>
                          </li>
                        ))
                      }
                    </ul>
                  ) : (
                    <p className="text-gray-500 text-sm p-2">No definitions found.</p>
                  )}
                </TabsContent>
                
                <TabsContent value="exercises" className="mt-2">
                  {filteredNodes().filter(n => n.type === 'exercise').length > 0 ? (
                    <ul className="space-y-1">
                      {filteredNodes()
                        .filter(n => n.type === 'exercise')
                        .map(node => (
                          <li 
                            key={node.id}
                            className={`px-2 py-1.5 text-sm rounded cursor-pointer ${
                              selectedNode?.id === node.id 
                                ? 'bg-red-100 text-red-800' 
                                : 'hover:bg-gray-100'
                            }`}
                            onClick={() => handleNodeClick(node)}
                          >
                            <div className="font-medium">{node.id}: {node.name}</div>
                            <div className="text-xs text-gray-500">
                              Difficulty: {"★".repeat(parseInt(node.difficulty || '1', 10))}
                            </div>
                          </li>
                        ))
                      }
                    </ul>
                  ) : (
                    <p className="text-gray-500 text-sm p-2">No exercises found.</p>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </div>
          
          {/* Toggle button for left panel */}
          {!showLeftPanel && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={toggleLeftPanel}
              className="absolute left-4 top-20 z-10 bg-white shadow-md"
            >
              <Settings size={18} />
            </Button>
          )}
          
          {/* Main Graph Canvas */}
          <div className="flex-1 bg-gray-50 overflow-hidden relative">
            <ForceGraph2D
              ref={graphRef}
              graphData={{ 
                nodes: graphNodes, 
                links: graphLinks 
              }}
              nodeId="id"
              nodeVal={node => node.type === 'definition' ? 20 : 15}
              nodeCanvasObject={nodeCanvasObject}
              linkSource="source"
              linkTarget="target"
              linkColor={linkColor}
              linkWidth={link => {
                const linkId = `${link.source}-${link.target}`;
                return highlightLinks.has(linkId) ? 2 : 1;
              }}
              linkDirectionalArrowLength={3.5}
              linkDirectionalArrowRelPos={1}
              linkCurvature={0.25}
              onNodeClick={handleNodeClick}
              onNodeHover={handleNodeHover}
              onNodeDragEnd={handleNodeDragEnd}
              d3AlphaDecay={0.01}
              d3VelocityDecay={0.3}
              warmupTicks={100}
              cooldownTicks={Infinity}
              cooldownTime={2000}
            />
            
            {/* Legend */}
            <div className="absolute bottom-4 left-4 bg-white p-2 rounded shadow-md text-sm">
              <div className="flex items-center mb-1">
                <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
                <span>Root Definition</span>
              </div>
              <div className="flex items-center mb-1">
                <div className="w-3 h-3 rounded-full bg-blue-500 mr-2"></div>
                <span>Definition</span>
              </div>
              {mode === 'practice' && (
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
                  <span>Exercise</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Right Panel - Node Details */}
          <div className={`bg-white border-l transition-all duration-300 ${
            showRightPanel ? 'w-80' : 'w-0'
          } overflow-hidden`}>
            {selectedNode && selectedNodeDetails ? (
              <div className="h-full flex flex-col">
                <div className="border-b p-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center">
                      {nodeHistory.length > 0 && (
                        <Button variant="ghost" size="icon" onClick={navigateBack} className="mr-2 h-8 w-8">
                          <ArrowLeft size={16} />
                        </Button>
                      )}
                      <h3 className="font-semibold text-lg truncate">
                        {selectedNode.id}: {selectedNode.name}
                      </h3>
                    </div>
                    <div className="flex">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => setIsEditMode(!isEditMode)}
                        className="h-8 w-8 mr-1"
                      >
                        <Edit size={16} />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={toggleRightPanel} 
                        className="h-8 w-8"
                      >
                        <X size={16} />
                      </Button>
                    </div>
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4">
                  {isEditMode ? (
                    // Edit Mode
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">ID</label>
                        <Input value={selectedNode.id} disabled />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">Name</label>
                        <Input id="name" defaultValue={selectedNode.name} />
                      </div>
                      
                      {selectedNode.type === 'definition' ? (
                        // Definition editing
                        <>
                          <div>
                            <label className="block text-sm font-medium mb-1">Description</label>
                            <div className="mb-2">
                              {hasMultipleDescriptions() && (
                                <div className="text-sm text-gray-500 mb-1">
                                  Editing version {selectedDefinitionIndex + 1} of {totalDescriptions()}
                                </div>
                              )}
                            </div>
                            <textarea
                              id="description"
                              className="flex h-40 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                              defaultValue={currentDescription()}
                              placeholder="Enter definition description with LaTeX support (e.g. $\sqrt{2}$)"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mt-3 mb-1">Notes</label>
                            <textarea
                              id="notes"
                              className="flex h-20 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                              defaultValue={(selectedNodeDetails as Definition).notes || ''}
                              placeholder="Additional notes about this definition"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mt-3 mb-1">References</label>
                            <textarea
                              id="references"
                              className="flex h-20 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                              defaultValue={(selectedNodeDetails as Definition).references?.join('\n') || ''}
                              placeholder="One reference per line"
                            />
                          </div>
                        </>
                      ) : (
                        // Exercise editing
                        <>
                          <div>
                            <label className="block text-sm font-medium mb-1">Statement</label>
                            <textarea
                              id="statement"
                              className="flex h-24 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                              defaultValue={(selectedNodeDetails as Exercise).statement}
                              placeholder="Exercise statement with LaTeX support (e.g. $\sqrt{2}$)"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mt-3 mb-1">Solution</label>
                            <textarea
                              id="description"
                              className="flex h-24 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                              defaultValue={(selectedNodeDetails as Exercise).description}
                              placeholder="Solution details with LaTeX support"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mt-3 mb-1">Hints</label>
                            <textarea
                              id="hints"
                              className="flex h-16 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                              defaultValue={(selectedNodeDetails as Exercise).hints || ''}
                              placeholder="Hints for solving the exercise"
                            />
                          </div>
                          <div className="flex space-x-4 mt-3">
                            <div>
                              <label className="block text-sm font-medium mb-1">Difficulty (1-5)</label>
                              <Input
                                id="difficulty" 
                                type="number" 
                                min="1" 
                                max="5" 
                                defaultValue={(selectedNodeDetails as Exercise).difficulty || '3'} 
                                className="w-20"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-1">Verifiable</label>
                              <input
                                id="verifiable"
                                type="checkbox" 
                                defaultChecked={(selectedNodeDetails as Exercise).verifiable}
                                className="h-6 w-6 mt-1"
                              />
                            </div>
                          </div>
                          <div className="mt-3">
                            <label className="block text-sm font-medium mb-1">Expected Result</label>
                            <Input
                              id="result"
                              defaultValue={(selectedNodeDetails as Exercise).result || ''}
                              placeholder="Expected answer for automated verification"
                            />
                          </div>
                        </>
                      )}
                      
                      <div>
                        <label className="block text-sm font-medium mb-1">Prerequisites</label>
                        <select 
                          id="prerequisites" 
                          multiple 
                          className="w-full border rounded p-2 h-28 text-sm"
                        >
                          {graphNodes
                            .filter(node => node.type === 'definition' && node.id !== selectedNode.id)
                            .map(node => (
                              <option 
                                key={node.id} 
                                value={node.id}
                                selected={selectedNodeDetails.prerequisites.includes(node.id)}
                              >
                                {node.id}: {node.name}
                              </option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple</p>
                      </div>
                      
                      <div className="flex justify-between pt-2">
                        <Button 
                          onClick={selectedNode.type === 'definition' ? 
                            handleDefinitionEditSubmit : handleExerciseEditSubmit}
                        >
                          Save Changes
                        </Button>
                        <Button 
                          variant="outline" 
                          onClick={() => setIsEditMode(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // View Mode
                    <div>
                      {selectedNode.type === 'definition' ? (
                        // Definition content
                        <div className="space-y-4">
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <h4 className="font-medium text-sm text-gray-500">DEFINITION</h4>
                              
                              {mode === 'study' && (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  onClick={() => setShowDefinition(!showDefinition)}
                                  className="h-7 text-xs"
                                >
                                  {showDefinition ? 'Hide' : 'Show'}
                                </Button>
                              )}
                            </div>
                            
                            {(showDefinition || mode !== 'study') && (
                              <Card className="bg-gray-50">
                                <CardContent className="p-3">
                                  {hasMultipleDescriptions() && (
                                    <div className="flex justify-between items-center mb-2 text-sm">
                                      <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        disabled={selectedDefinitionIndex === 0}
                                        onClick={() => setSelectedDefinitionIndex(i => Math.max(0, i - 1))}
                                        className="h-6 px-2"
                                      >
                                        Previous
                                      </Button>
                                      <span>Version {selectedDefinitionIndex + 1} of {totalDescriptions()}</span>
                                      <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        disabled={selectedDefinitionIndex >= totalDescriptions() - 1}
                                        onClick={() => setSelectedDefinitionIndex(i => Math.min(totalDescriptions() - 1, i + 1))}
                                        className="h-6 px-2"
                                      >
                                        Next
                                      </Button>
                                    </div>
                                  )}
                                  
                                  <MathJaxContent>
                                    {currentDescription()}
                                  </MathJaxContent>
                                </CardContent>
                              </Card>
                            )}
                          </div>
                          
                          {(selectedNodeDetails as Definition).notes && (
                            <div>
                              <h4 className="font-medium text-sm text-gray-500 mb-2">NOTES</h4>
                              <p className="text-sm text-gray-700">
                                {(selectedNodeDetails as Definition).notes}
                              </p>
                            </div>
                          )}
                          
                          <div>
                            <h4 className="font-medium text-sm text-gray-500 mb-2">PREREQUISITES</h4>
                            {selectedNodeDetails.prerequisites.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {selectedNodeDetails.prerequisites.map(prereqId => (
                                  <Button 
                                    key={prereqId} 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => navigateToNode(prereqId)}
                                    className="h-7 text-xs bg-blue-50 hover:bg-blue-100"
                                  >
                                    {prereqId}
                                  </Button>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500">No prerequisites</p>
                            )}
                          </div>
                          
                          {relatedExercises.length > 0 && (
                            <div>
                              <h4 className="font-medium text-sm text-gray-500 mb-2">RELATED EXERCISES</h4>
                              <div className="flex flex-wrap gap-1">
                                {relatedExercises.map(exId => (
                                  <Button 
                                    key={exId} 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => navigateToNode(exId)}
                                    className="h-7 text-xs bg-red-50 hover:bg-red-100"
                                  >
                                    {exId}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          {(selectedNodeDetails as Definition).references && 
                           (selectedNodeDetails as Definition).references.length > 0 && (
                            <div>
                              <h4 className="font-medium text-sm text-gray-500 mb-2">REFERENCES</h4>
                              <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
                                {(selectedNodeDetails as Definition).references.map((ref, index) => (
                                  <li key={index}>{ref}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          
                          {/* Review buttons */}
                          <div>
                            <h4 className="font-medium text-sm text-gray-500 mb-2">RATE YOUR UNDERSTANDING</h4>
                            <div className="flex flex-wrap gap-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                className="bg-red-50 hover:bg-red-100"
                                onClick={() => handleReviewDefinition('again')}
                              >
                                Again
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                className="bg-orange-50 hover:bg-orange-100"
                                onClick={() => handleReviewDefinition('hard')}
                              >
                                Hard
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                className="bg-green-50 hover:bg-green-100"
                                onClick={() => handleReviewDefinition('good')}
                              >
                                Good
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                className="bg-blue-50 hover:bg-blue-100"
                                onClick={() => handleReviewDefinition('easy')}
                              >
                                Easy
                              </Button>
                            </div>
                          </div>
                          
                          <div>
                            <h4 className="font-medium text-sm text-gray-500 mb-2">PERSONAL NOTES</h4>
                            <textarea 
                              className="w-full border rounded p-2 h-24 text-sm" 
                              placeholder="Add your personal notes here..."
                              value={personalNotes[selectedNode.id] || ''}
                              onChange={(e) => saveNotes(selectedNode.id, e.target.value)}
                            />
                          </div>
                        </div>
                      ) : (
                        // Exercise content
                        <div className="space-y-4">
                          <div>
                            <h4 className="font-medium text-sm text-gray-500 mb-2">PROBLEM STATEMENT</h4>
                            <Card className="bg-gray-50">
                              <CardContent className="p-3">
                                <MathJaxContent>
                                  {(selectedNodeDetails as Exercise).statement}
                                </MathJaxContent>
                              </CardContent>
                            </Card>
                          </div>
                          
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <h4 className="font-medium text-sm text-gray-500">HINTS</h4>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => setShowHints(!showHints)}
                                className="h-7 text-xs"
                              >
                                {showHints ? 'Hide' : 'Show'}
                              </Button>
                            </div>
                            
                            {showHints && (selectedNodeDetails as Exercise).hints && (
                              <Card className="bg-gray-50">
                                <CardContent className="p-3">
                                  <MathJaxContent>
                                    {(selectedNodeDetails as Exercise).hints}
                                  </MathJaxContent>
                                </CardContent>
                              </Card>
                            )}
                          </div>
                          
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <h4 className="font-medium text-sm text-gray-500">SOLUTION</h4>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => setShowSolution(!showSolution)}
                                className="h-7 text-xs"
                              >
                                {showSolution ? 'Hide' : 'Show'}
                              </Button>
                            </div>
                            
                            {showSolution && (
                              <Card className="bg-gray-50">
                                <CardContent className="p-3">
                                  <MathJaxContent>
                                    {(selectedNodeDetails as Exercise).description}
                                  </MathJaxContent>
                                </CardContent>
                              </Card>
                            )}
                          </div>
                          
                          <div>
                            <h4 className="font-medium text-sm text-gray-500 mb-2">YOUR ANSWER</h4>
                            <textarea 
                              className="w-full border rounded p-2 h-20 text-sm" 
                              placeholder="Enter your solution here..."
                              value={userAnswer}
                              onChange={(e) => setUserAnswer(e.target.value)}
                            />
                            
                            {(selectedNodeDetails as Exercise).verifiable && (
                              <div className="mt-2 flex justify-end">
                                <Button 
                                  size="sm" 
                                  onClick={verifyAnswer}
                                  className="h-8"
                                >
                                  Verify Answer
                                </Button>
                              </div>
                            )}
                            
                            {answerFeedback && (
                              <div className={`mt-2 p-2 text-sm rounded ${
                                answerFeedback.correct ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {answerFeedback.message}
                              </div>
                            )}
                          </div>
                          
                          <div>
                            <h4 className="font-medium text-sm text-gray-500 mb-2">RELATED CONCEPTS</h4>
                            {selectedNodeDetails.prerequisites.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {selectedNodeDetails.prerequisites.map(prereqId => (
                                  <Button 
                                    key={prereqId} 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => navigateToNode(prereqId)}
                                    className="h-7 text-xs bg-blue-50 hover:bg-blue-100"
                                  >
                                    {prereqId}
                                  </Button>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500">No related concepts</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center p-4">
                <p className="text-gray-500 text-center">
                  Select a node to view details
                </p>
              </div>
            )}
          </div>
          
          {/* Toggle button for right panel */}
          {!showRightPanel && selectedNode && (
            <Button 
              variant="outline" 
              size="icon" 
              onClick={toggleRightPanel}
              className="absolute right-4 top-20 z-10 bg-white shadow-md"
            >
              <Settings size={18} />
            </Button>
          )}
        </div>
      </div>
    </MathJaxProvider>
  );
};

export default KnowledgeGraph;
