// client/src/app/components/Graph/windows/DetailWindowContent.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/app/components/core/tabs";
import { ArrowLeft, Edit, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { GraphNode, Definition, Exercise, AnswerFeedback } from '../utils/types';
import DefinitionView from '../details/DefinitionView';
import ExerciseView from '../details/ExerciseView';
import NodeEditForm from '../details/NodeEditForm';
import PrerequisitesPanel from '../details/PrerequisitesPanel';
import MetaExerciseEditForm from '../details/MetaExerciseEditForm';
import MetaExerciseVersionsViewer from '../details/MetaExerciseVersionsViewer';
import MetaDefinitionEditForm from '../details/MetaDefinitionEditForm';
import MetaDefinitionVersionsViewer from '../details/MetaDefinitionVersionsViewer';
import { useSRS } from '@/contexts/SRSContext';
import { useUI } from '@/contexts/UIContext';
import { NodeStatus, ReviewHistoryItem as SRSReviewHistoryItem } from '@/types/srs';
import StatusIndicator from '../components/StatusIndicator';
import ProgressDisplay from '../components/ProgressDisplay';
import { getReviewHistory, getDomainPrerequisites } from '@/lib/srs-api';
import { InlineMarkdownKatex } from '@/app/components/core/MarkdownKatex';
import {
  getDefinitionByCode,
  updateDefinition,
  updateExercise,
  getMetaExercise,
  getMetaDefinition,
  getNextMetaExerciseVersion,
  getNextMetaDefinitionVersion,
  addMetaExerciseVersion,
  addMetaDefinitionVersion,
  updateMetaExerciseVersion,
  updateMetaDefinitionVersion,
  deleteMetaExerciseVersion,
  deleteMetaDefinitionVersion,
  updateMetaExercise,
  updateMetaDefinition,
  Definition as ApiDefinition,
  Exercise as ApiExercise,
  MetaExercise,
  MetaDefinition,
  ExerciseVersion,
  DefinitionVersion,
  ExternalPrerequisiteLink,
  GroupData
} from '@/lib/api';
import { showToast } from '@/app/components/core/ToastNotification';

interface DetailWindowContentProps {
  nodeData: GraphNode;
  windowId: string;
  graphData?: any;
  onNavigateToNode?: (nodeId: string) => void;
  codeToNumericIdMap?: Map<string, number>;
  currentUser?: any;
  domainData?: any;
  onUpdateNodeData?: (nodeCode: string, updatedData: ApiDefinition | ApiExercise) => void; // Surgical update
  onRefresh?: () => void; // Fallback full refresh
  externalPrerequisites?: ExternalPrerequisiteLink[];
  onExternalChanged?: () => void;
  groups?: GroupData[];
  groupMembersById?: Map<number, Set<string>>;
  onCreateGroup?: (name: string, seedCodes: string[], isExact: boolean, memberCodes?: string[]) => Promise<GroupData | null>;
  onUpdateGroup?: (groupId: number, payload: { name?: string; isExact?: boolean; seedCodes?: string[]; memberCodes?: string[] }) => Promise<GroupData | null>;
  onDeleteGroup?: (groupId: number) => Promise<void>;
}

export const DetailWindowContent: React.FC<DetailWindowContentProps> = ({
  nodeData: initialNodeData,
  windowId,
  graphData,
  onNavigateToNode,
  codeToNumericIdMap = new Map(),
  currentUser,
  domainData,
  onUpdateNodeData, // NEW: Surgical update callback
  onRefresh, // Fallback refresh
  externalPrerequisites,
  onExternalChanged,
  groups = [],
  groupMembersById = new Map(),
  onCreateGroup,
  onUpdateGroup,
  onDeleteGroup: _onDeleteGroup,
}) => {
  const srs = useSRS();
  const ui = useUI();
  
  // Local state for this window
  const [nodeHistory, setNodeHistory] = useState<GraphNode[]>([]);
  const [currentNode, setCurrentNode] = useState<GraphNode>(initialNodeData);
  const [nodeDetails, setNodeDetails] = useState<Definition | Exercise | null>(null);
  const [metaDetails, setMetaDetails] = useState<MetaExercise | MetaDefinition | null>(null);
  const [currentVersion, setCurrentVersion] = useState<ExerciseVersion | DefinitionVersion | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Definition-specific state
  const [showDefinition, setShowDefinition] = useState(true);
  const [selectedDefinitionIndex, setSelectedDefinitionIndex] = useState(0);
  const [relatedExercises, setRelatedExercises] = useState<string[]>([]);
  
  // Exercise-specific state
  const [showSolution, setShowSolution] = useState(false);
  const [showHints, setShowHints] = useState(false);
  const [userAnswer, setUserAnswer] = useState('');
  const [answerFeedback, setAnswerFeedback] = useState<AnswerFeedback | null>(null);
  const [exerciseAttemptCompleted, setExerciseAttemptCompleted] = useState(false);
  const [selectedVersionIndex, setSelectedVersionIndex] = useState(0);
  const [prereqLookup, setPrereqLookup] = useState<{ definitions: string[]; exercises: string[]; loaded: boolean }>({
    definitions: [],
    exercises: [],
    loaded: false,
  });

  // Review history state
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<SRSReviewHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'versions' | 'prerequisites' | 'srs' | 'groups'>('details');

  // Group UI state
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [groupExactDraft, setGroupExactDraft] = useState(false);
  const [isSavingGroup, setIsSavingGroup] = useState(false);

  const handleCreateGroup = useCallback(async () => {
    if (!onCreateGroup) return;
    const name = groupNameDraft.trim();
    if (!name) {
      showToast('Group name is required.', 'warning');
      return;
    }
    setIsSavingGroup(true);
    try {
      const seedCodes = [currentNode.id];
      const memberCodes = groupExactDraft ? [currentNode.id] : undefined;
      await onCreateGroup(name, seedCodes, groupExactDraft, memberCodes);
      setGroupNameDraft('');
      setGroupExactDraft(false);
      showToast('Group created.', 'success');
    } catch (error) {
      console.error('Failed to create group:', error);
      showToast('Failed to create group.', 'error');
    } finally {
      setIsSavingGroup(false);
    }
  }, [onCreateGroup, groupNameDraft, groupExactDraft, currentNode.id]);

  const handleToggleGroupExact = useCallback(async (group: GroupData, nextExact: boolean) => {
    if (!onUpdateGroup) return;
    const members = groupMembersById.get(group.id) ?? new Set<string>();
    const memberCodes = nextExact ? Array.from(members) : undefined;
    try {
      await onUpdateGroup(group.id, { isExact: nextExact, memberCodes });
      showToast(`Group ${nextExact ? 'pinned' : 'unpinned'}.`, 'success');
    } catch (error) {
      console.error('Failed to update group:', error);
      showToast('Failed to update group.', 'error');
    }
  }, [groupMembersById, onUpdateGroup]);

  const handleAddNodeToGroup = useCallback(async (group: GroupData) => {
    if (!onUpdateGroup) return;
    const nodeCode = currentNode.id;
    if (group.isExact) {
      const existing = (group.members && group.members.length > 0)
        ? group.members.map(member => member.nodeCode)
        : Array.from(groupMembersById.get(group.id) ?? []);
      const memberCodes = Array.from(new Set([...existing, nodeCode]));
      await onUpdateGroup(group.id, { memberCodes });
      return;
    }

    const seedCodes = Array.from(new Set([...(group.seeds || []).map(seed => seed.nodeCode), nodeCode]));
    await onUpdateGroup(group.id, { seedCodes });
  }, [currentNode.id, groupMembersById, onUpdateGroup]);

  const handleRemoveNodeFromGroup = useCallback(async (group: GroupData) => {
    if (!onUpdateGroup) return;
    const nodeCode = currentNode.id;
    if (group.isExact) {
      const existing = (group.members && group.members.length > 0)
        ? group.members.map(member => member.nodeCode)
        : Array.from(groupMembersById.get(group.id) ?? []);
      const memberCodes = existing.filter(code => code !== nodeCode);
      if (memberCodes.length === 0) {
        showToast('Group must contain at least one member.', 'warning');
        return;
      }
      await onUpdateGroup(group.id, { memberCodes });
      return;
    }

    const seedCodes = (group.seeds || []).map(seed => seed.nodeCode).filter(code => code !== nodeCode);
    if (seedCodes.length === 0) {
      showToast('Group must contain at least one seed.', 'warning');
      return;
    }
    await onUpdateGroup(group.id, { seedCodes });
  }, [currentNode.id, groupMembersById, onUpdateGroup]);

  // Load node details
  const loadNodeDetails = useCallback(async (node: GraphNode) => {
    setIsLoading(true);
    try {
      let details;
      if (node.type === 'definition') {
        // Load meta-definition by numeric id and fetch a suggested version
        const mid = codeToNumericIdMap.get(node.id);
        if (!mid) throw new Error('Missing numeric id for meta definition');
        const meta = await getMetaDefinition(mid);
        setMetaDetails(meta);
        const ver = await getNextMetaDefinitionVersion(mid);
        setCurrentVersion(ver as any);
        // If the suggested version exists in the list, align selection index
        if (meta.versions && ver?.id != null) {
          const idx = meta.versions.findIndex(v => v.id === (ver as any).id);
          if (idx >= 0) setSelectedDefinitionIndex(idx);
        }
        details = {
          code: meta.code,
          name: meta.name,
          description: ver.description || '',
          prerequisites: meta.prerequisites || [],
          prerequisiteWeights: meta.prerequisiteWeights || {},
          type: 'definition'
        } as Definition;
      } else {
        // Load meta-exercise by numeric id and fetch a suggested version
        const mid = codeToNumericIdMap.get(node.id);
        if (!mid) throw new Error('Missing numeric id for meta exercise');
        const meta = await getMetaExercise(mid);
        setMetaDetails(meta);
        const ver = await getNextMetaExerciseVersion(mid);
        setCurrentVersion(ver as any);
        details = {
          ...(ver as any),
          id: ver.id,
          code: meta.code,
          name: meta.name,
          prerequisites: meta.prerequisites || [],
          prerequisiteWeights: meta.prerequisiteWeights || {},
          type: 'exercise',
        } as Exercise;
      }
      if (details) {
        setNodeDetails({ ...details, type: node.type } as Definition | Exercise);

        // Set related exercises for definitions
        if (node.type === 'definition' && graphData?.exercises) {
          const related = Object.values(graphData.exercises)
            .filter((ex: any) => ex.prerequisites?.includes(node.id))
            .map((ex: any) => ex.code);
          setRelatedExercises(related);
        }
      }
    } catch (error) {
      console.error('Error loading node details:', error);
      showToast('Failed to load node details', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [graphData, domainData?.id, codeToNumericIdMap]);

  // Initialize with first node
  useEffect(() => {
    loadNodeDetails(currentNode);
  }, [loadNodeDetails, currentNode]);
  useEffect(() => {
    setActiveTab('details');
  }, [currentNode.id]);

  // Navigation within window
  const navigateToNode = useCallback(async (nodeId: string) => {
    // Find node data from graph
    const targetNode = graphData?.definitions?.[nodeId] || graphData?.exercises?.[nodeId];
    if (!targetNode) {
      showToast(`Node ${nodeId} not found`, 'error');
      return;
    }
    
    // Add current node to history
    setNodeHistory(prev => [...prev, currentNode]);
    
    // Create GraphNode object
    const newNode: GraphNode = {
      id: targetNode.code,
      name: targetNode.name,
      type: targetNode.type || (graphData?.definitions?.[nodeId] ? 'definition' : 'exercise'),
    };
    
    // Update current node and load details
    setCurrentNode(newNode);
    await loadNodeDetails(newNode);
    
    // Update window title
    ui.updateWindow(windowId, { 
      title: newNode.name,
      contentProps: { nodeData: newNode }
    });
    
    // Reset states
    setIsEditMode(false);
    setShowDefinition(true);
    setShowSolution(false);
    setShowHints(false);
    setSelectedDefinitionIndex(0);
    setUserAnswer('');
    setAnswerFeedback(null);
    setExerciseAttemptCompleted(false);
  }, [currentNode, graphData, windowId, ui, loadNodeDetails]);

  const navigateBack = useCallback(() => {
    if (nodeHistory.length === 0) return;
    
    const previousNode = nodeHistory[nodeHistory.length - 1];
    setNodeHistory(prev => prev.slice(0, -1));
    
    setCurrentNode(previousNode);
    loadNodeDetails(previousNode);
    
    ui.updateWindow(windowId, { 
      title: previousNode.name,
      contentProps: { nodeData: previousNode }
    });
  }, [nodeHistory, windowId, ui, loadNodeDetails]);

  // Check if content should be hidden (anti-cheat)
  const shouldHideContent = ui.shouldHideNodeContent(currentNode.id);

  // Get node progress
  const numericId = codeToNumericIdMap.get(currentNode.id);
  const nodeProgress = numericId ? srs.getNodeProgress(numericId, currentNode.type) : null;

  // Review handlers
  const handleReviewDefinition = useCallback(async (quality: 'again' | 'hard' | 'good' | 'easy') => {
    if (!numericId) return;
    
    const qualityMap = { again: 0, hard: 1, good: 4, easy: 5 } as const;
    await srs.submitReview({
      nodeId: numericId,
      nodeType: 'meta_definition',
      success: qualityMap[quality] >= 3,
      quality: qualityMap[quality] as any,
      timeTaken: 0,
      sessionId: srs.state.currentSession?.id,
      // Include chosen version id when available
      versionId: currentVersion?.id,
    });
    
    showToast(`Definition reviewed as ${quality}`, 'success');
  }, [numericId, srs, currentVersion?.id]);

  const handleRateExercise = useCallback(async (quality: 'again' | 'hard' | 'good' | 'easy') => {
    if (!numericId) return;
    
    const qualityMap = { again: 0, hard: 1, good: 4, easy: 5 };
    await srs.submitReview({
      nodeId: numericId,
      nodeType: 'exercise',
      success: qualityMap[quality] >= 3,
      quality: qualityMap[quality] as any,
      timeTaken: 0,
      sessionId: srs.state.currentSession?.id,
      versionId: currentVersion?.id,
    });
    
    showToast(`Exercise reviewed as ${quality}`, 'success');
  }, [numericId, srs, currentVersion?.id]);

  // Exercise verification
  const verifyAnswer = useCallback(() => {
    if (!nodeDetails || currentNode.type !== 'exercise') return;
    
    const exercise = nodeDetails as Exercise;
    if (exercise.verifiable && exercise.result) {
      const isCorrect = userAnswer.trim().toLowerCase() === exercise.result.trim().toLowerCase();
      setAnswerFeedback({ 
        correct: isCorrect, 
        message: isCorrect ? 'Correct!' : 'Incorrect.' 
      });
    } else {
      setAnswerFeedback({ 
        correct: false, 
        message: 'This exercise is not automatically verifiable.' 
      });
    }
    
    setExerciseAttemptCompleted(true);
    if (!showSolution) setShowSolution(true);
  }, [nodeDetails, currentNode.type, userAnswer, showSolution]);

  // Get another version (pass)
  const handleAnotherVersion = useCallback(async () => {
    try {
      if (!metaDetails) return;
      const ver = await getNextMetaExerciseVersion(metaDetails.id);
      setCurrentVersion(ver);
      setNodeDetails({ ...(ver as any), id: ver.id, code: metaDetails.code, name: metaDetails.name, type: 'exercise' } as Exercise);
      setUserAnswer(''); setAnswerFeedback(null); setShowSolution(false); setExerciseAttemptCompleted(false);
    } catch (e) {
      showToast('No alternative version available', 'warning');
    }
  }, [metaDetails]);

  // Status change handler
  const handleStatusChange = useCallback(async (status: NodeStatus) => {
    if (!numericId) return;
    
    await srs.updateNodeStatus(numericId, currentNode.type, status);
    showToast(`Status updated to ${status}`, 'success');
  }, [numericId, currentNode.type, srs]);

  // Review history fetching
  const fetchHistory = useCallback(async () => {
    if (!numericId) return;
    
    setHistoryLoading(true);
    try {
      const data = await getReviewHistory(numericId, currentNode.type, 10);
      setHistory(data);
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setHistoryLoading(false);
    }
  }, [numericId, currentNode.type]);

  useEffect(() => {
    if (showHistory && numericId) {
      fetchHistory();
    }
  }, [showHistory, numericId, fetchHistory]);

  const canEdit = useMemo(() => {
    const ownerId = domainData?.ownerId;
    const userId = currentUser?.id;
    if (ownerId == null || userId == null) {
      return false;
    }
    if (Number(ownerId) === Number(userId)) {
      return true;
    }
    if (currentUser?.isAdmin) {
      return true;
    }
    return domainData?.permissionRole === 'editor' || domainData?.permissionRole === 'owner';
  }, [domainData?.ownerId, domainData?.permissionRole, currentUser?.id, currentUser?.isAdmin]);

  // Edit mode toggle
  const toggleEditMode = useCallback(() => {
    if (!canEdit && !isEditMode) {
      showToast('Only domain owners or editors can edit nodes.', 'warning');
      return;
    }
    setIsEditMode(!isEditMode);
  }, [canEdit, isEditMode]);

  // ENHANCED: Surgical edit submission with fallback
  const handleSubmitEdit = useCallback(async () => {
    if (!nodeDetails) return;
    
    // Check domain permissions (client-side hint; server enforces auth)
    if (!canEdit) {
      showToast("You don't have permission to edit nodes in this domain.", "error");
      setIsEditMode(false);
      return;
    }

    const formName = (document.getElementById('name') as HTMLInputElement)?.value || currentNode.name;
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
      let updatedNode: ApiDefinition | ApiExercise;
      
      if (currentNode.type === 'definition') {
        const defDetails = nodeDetails as Definition;
        let formDesc = (document.getElementById('description') as HTMLTextAreaElement)?.value || '';
        
        // Handle multiple descriptions
        if (hasMultipleDescriptions()) {
          const descriptions = (Array.isArray(defDetails.description) ? 
            [...defDetails.description] : 
            String(defDetails.description).split('|||'));
          descriptions[selectedDefinitionIndex] = formDesc;
          formDesc = descriptions.join('|||');
        }
        
        updatedNode = await updateDefinition(defDetails.id!, { 
          name: formName, 
          description: formDesc,
          notes: (document.getElementById('notes') as HTMLTextAreaElement)?.value,
          references: (document.getElementById('references') as HTMLTextAreaElement)?.value
            .split('\n').filter(r => r.trim()),
          prerequisiteIds: selectedPrereqNumericIds, 
          prerequisiteWeights,
        });
      } else { 
        const exDetails = nodeDetails as Exercise;
        updatedNode = await updateExercise(exDetails.id!, {
          name: formName,
          statement: (document.getElementById('statement') as HTMLTextAreaElement)?.value,
          description: (document.getElementById('description') as HTMLTextAreaElement)?.value,
          hints: (document.getElementById('hints') as HTMLTextAreaElement)?.value,
          notes: (document.getElementById('exerciseNotes') as HTMLTextAreaElement)?.value,
          difficulty: (() => { const v = (document.getElementById('difficulty') as HTMLInputElement)?.value; const n = parseInt(v || '', 10); return Number.isFinite(n) ? n : undefined; })(),
          verifiable: (document.getElementById('verifiable') as HTMLInputElement)?.checked,
          result: (document.getElementById('verifiable') as HTMLInputElement)?.checked ? 
            (document.getElementById('result') as HTMLInputElement)?.value : undefined,
          prerequisiteIds: selectedPrereqNumericIds, 
          prerequisiteWeights,
        });
      }

      // NEW: Use surgical update if available, otherwise fall back to refresh
      if (onUpdateNodeData) {
        console.log('Using surgical update for node:', currentNode.id);
        onUpdateNodeData(currentNode.id, updatedNode);
      } else if (onRefresh) {
        console.log('Falling back to full refresh after edit');
        onRefresh();
      }

      // Update local state with new data
      setNodeDetails({ ...updatedNode, type: currentNode.type } as Definition | Exercise);
      
      // Update current node name if it changed
      if (formName !== currentNode.name) {
        const updatedCurrentNode = { ...currentNode, name: formName };
        setCurrentNode(updatedCurrentNode);
        ui.updateWindow(windowId, { 
          title: updatedCurrentNode.name,
          contentProps: { nodeData: updatedCurrentNode }
        });
      }
      
      setIsEditMode(false);
      showToast(`${currentNode.type === 'definition' ? 'Definition' : 'Exercise'} "${currentNode.name}" updated.`, "success");

    } catch (error) {
      console.error("Error updating node:", error);
      showToast(error instanceof Error ? error.message : "Failed to update node.", "error");
    }
  }, [nodeDetails, currentUser, domainData, currentNode, selectedDefinitionIndex, windowId, ui, onUpdateNodeData, onRefresh]);

  // Helper functions for descriptions
  const hasMultipleDescriptions = () => {
    if (currentNode.type === 'definition' && (metaDetails as MetaDefinition | null)?.versions) {
      return ((metaDetails as MetaDefinition).versions?.length || 0) > 1;
    }
    const detail = nodeDetails as Definition;
    if (!detail || !('description' in detail)) return false;
    return (Array.isArray(detail.description) && detail.description.length > 1) ||
      String(detail.description).includes('|||');
  };

  const totalDescriptionsCount = () => {
    if (currentNode.type === 'definition' && (metaDetails as MetaDefinition | null)?.versions) {
      return (metaDetails as MetaDefinition).versions?.length || 0;
    }
    const detail = nodeDetails as Definition;
    if (!detail || !('description' in detail)) return 0;
    if (Array.isArray(detail.description)) return detail.description.length;
    return String(detail.description).split('|||').length;
  };

  const currentDescriptionText = () => {
    if (currentNode.type === 'definition' && (metaDetails as MetaDefinition | null)?.versions) {
      const versions = (metaDetails as MetaDefinition).versions || [];
      const idx = Math.max(0, Math.min(selectedDefinitionIndex, Math.max(0, versions.length - 1)));
      return versions[idx]?.description || '';
    }
    const detail = nodeDetails as Definition;
    if (!detail || !('description' in detail)) return '';
    if (Array.isArray(detail.description)) return detail.description[selectedDefinitionIndex] || '';
    return String(detail.description).split('|||')[selectedDefinitionIndex] || '';
  };

  const currentPromptText = () => {
    if (currentNode.type === 'definition' && (metaDetails as MetaDefinition | null)?.versions) {
      const versions = (metaDetails as MetaDefinition).versions || [];
      const idx = Math.max(0, Math.min(selectedDefinitionIndex, Math.max(0, versions.length - 1)));
      return (versions[idx] as any)?.prompt || '';
    }
    return '';
  };

  const currentPromptImagePath = () => {
    if (currentNode.type === 'definition' && (metaDetails as MetaDefinition | null)?.versions) {
      const versions = (metaDetails as MetaDefinition).versions || [];
      const idx = Math.max(0, Math.min(selectedDefinitionIndex, Math.max(0, versions.length - 1)));
      return (versions[idx] as any)?.promptImagePath || '';
    }
    return (nodeDetails as Definition | null)?.promptImagePath || '';
  };

  const currentDescriptionImagePath = () => {
    if (currentNode.type === 'definition' && (metaDetails as MetaDefinition | null)?.versions) {
      const versions = (metaDetails as MetaDefinition).versions || [];
      const idx = Math.max(0, Math.min(selectedDefinitionIndex, Math.max(0, versions.length - 1)));
      return (versions[idx] as any)?.descriptionImagePath || '';
    }
    return (nodeDetails as Definition | null)?.descriptionImagePath || '';
  };

  const currentNotesText = () => {
    if (currentNode.type === 'definition' && (metaDetails as MetaDefinition | null)?.versions) {
      const versions = (metaDetails as MetaDefinition).versions || [];
      const idx = Math.max(0, Math.min(selectedDefinitionIndex, Math.max(0, versions.length - 1)));
      return (versions[idx] as any)?.notes || '';
    }
    const detail = nodeDetails as Definition;
    return (detail as any)?.notes || '';
  };

  // Keep currentVersion and nodeDetails in sync with selected definition version
  useEffect(() => {
    if (currentNode.type !== 'definition') return;
    const meta = metaDetails as MetaDefinition | null;
    if (!meta || !Array.isArray(meta.versions) || meta.versions.length === 0) return;
    const idx = Math.max(0, Math.min(selectedDefinitionIndex, meta.versions.length - 1));
    const ver = meta.versions[idx];
    if (!ver) return;
    // Update only if different to avoid render loops
    if (!currentVersion || currentVersion.id !== ver.id) {
      setCurrentVersion(ver as any);
      setNodeDetails({
        code: meta.code,
        name: meta.name,
        description: ver.description || '',
        type: 'definition'
      } as Definition);
    }
  }, [selectedDefinitionIndex, metaDetails, currentNode.type]);

  const availableDefinitions = useMemo(() => {
    if (!graphData?.definitions) return [];
    return Object.values(graphData.definitions).map((def: any) => ({
      code: def.code,
      name: def.name,
      numericId: codeToNumericIdMap.get(def.code),
    })).filter((d: any) => d.numericId != null);
  }, [graphData?.definitions, codeToNumericIdMap]);

  const availableExercises = useMemo(() => {
    if (!graphData?.exercises) return [];
    return Object.values(graphData.exercises).map((ex: any) => ({
      code: ex.code,
      name: ex.name,
      numericId: codeToNumericIdMap.get(ex.code),
    })).filter((e: any) => e.numericId != null);
  }, [graphData?.exercises, codeToNumericIdMap]);

  const definitionIdToCodeMap = useMemo(() => {
    const map = new Map<number, string>();
    availableDefinitions.forEach(def => {
      if (typeof def.numericId === 'number') map.set(def.numericId, def.code);
    });
    return map;
  }, [availableDefinitions]);

  const exerciseIdToCodeMap = useMemo(() => {
    const map = new Map<number, string>();
    availableExercises.forEach(ex => {
      if (typeof ex.numericId === 'number') map.set(ex.numericId, ex.code);
    });
    return map;
  }, [availableExercises]);

  useEffect(() => {
    let cancelled = false;
    const loadPrereqs = async () => {
      setPrereqLookup({ definitions: [], exercises: [], loaded: false });
      const nodeId = codeToNumericIdMap.get(currentNode.id);
      const domainId = domainData?.id;
      if (!nodeId || !domainId) return;
      const nodeType = currentNode.type === 'definition' ? 'meta_definition' : 'meta_exercise';
      try {
        const all = await getDomainPrerequisites(domainId);
        if (cancelled) return;
        const filtered = all.filter(p => p.nodeId === nodeId && p.nodeType === nodeType);
        const definitions = filtered
          .filter(p => p.prerequisiteType === 'meta_definition')
          .map(p => definitionIdToCodeMap.get(p.prerequisiteId))
          .filter((code): code is string => Boolean(code));
        const exercises = filtered
          .filter(p => p.prerequisiteType === 'meta_exercise')
          .map(p => exerciseIdToCodeMap.get(p.prerequisiteId))
          .filter((code): code is string => Boolean(code));
        setPrereqLookup({ definitions, exercises, loaded: true });
      } catch (error) {
        if (!cancelled) {
          console.warn('Failed to load prerequisites for detail window:', error);
        }
      }
    };
    loadPrereqs();
    return () => { cancelled = true; };
  }, [currentNode.id, currentNode.type, domainData?.id, codeToNumericIdMap, definitionIdToCodeMap, exerciseIdToCodeMap]);

  const fallbackPrereqCodes = useMemo(() => {
    const raw = (metaDetails as MetaDefinition | MetaExercise | null)?.prerequisites
      || (nodeDetails as Definition | Exercise | null)?.prerequisites
      || [];
    if (!graphData) return raw;
    return raw.filter(code => graphData.definitions?.[code] || graphData.exercises?.[code]);
  }, [metaDetails, nodeDetails, graphData]);

  const fallbackDefinitionPrereqs = useMemo(() => {
    if (!graphData?.definitions) return fallbackPrereqCodes;
    return fallbackPrereqCodes.filter(code => Boolean(graphData.definitions?.[code]));
  }, [fallbackPrereqCodes, graphData]);

  const fallbackExercisePrereqs = useMemo(() => {
    if (!graphData?.exercises) return [];
    return fallbackPrereqCodes.filter(code => Boolean(graphData.exercises?.[code]));
  }, [fallbackPrereqCodes, graphData]);

  const definitionPrereqsForView = prereqLookup.loaded ? prereqLookup.definitions : fallbackDefinitionPrereqs;
  const exercisePrereqsForView = prereqLookup.loaded ? prereqLookup.exercises : fallbackExercisePrereqs;

  const definitionDetailsForView = useMemo(() => {
    if (!nodeDetails || currentNode.type !== 'definition') return nodeDetails;
    return { ...(nodeDetails as Definition), prerequisites: definitionPrereqsForView };
  }, [nodeDetails, currentNode.type, definitionPrereqsForView]);

  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
        <p className="mt-2 text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with navigation */}
      <div className="border-b p-3 flex items-center gap-2">
        {isEditMode ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsEditMode(false)}
            className="h-8 w-8"
            title="Back to details"
          >
            <ArrowLeft size={16} />
          </Button>
        ) : (
          nodeHistory.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={navigateBack}
              className="h-8 w-8"
              title="Go back"
            >
              <ArrowLeft size={16} />
            </Button>
          )
        )}
        <h3 className="flex-1 font-semibold text-base truncate">
          <InlineMarkdownKatex>{currentNode.name}</InlineMarkdownKatex>
        </h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleEditMode}
          disabled={!canEdit && !isEditMode}
          className="h-8 w-8"
          title={
            !canEdit
              ? "Only domain owners or editors can edit nodes"
              : isEditMode
              ? "View Mode"
              : "Edit Mode"
          }
        >
          <Edit size={16} />
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {shouldHideContent && !isEditMode ? (
          <div className="text-center py-10">
            <Eye size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 mb-2">This node is currently being reviewed</p>
            <p className="text-sm text-gray-500">
              Click "Show Answer" in the review window to reveal the content
            </p>
          </div>
        ) : isEditMode ? (
          nodeDetails ? (
            currentNode.type === 'definition' ? (
              <MetaDefinitionEditForm
                meta={metaDetails as MetaDefinition}
                initialActiveIndex={selectedDefinitionIndex}
                onAddVersion={async (v) => {
                  if (!metaDetails) return;
                  await addMetaDefinitionVersion(metaDetails.id, v as any);
                  const fresh = await getMetaDefinition(metaDetails.id);
                  setMetaDetails(fresh);
                  // Initialize Details with the first version if none selected yet
                  if (!currentVersion && fresh.versions && fresh.versions.length > 0) {
                    const ver = fresh.versions[0];
                    setCurrentVersion(ver);
                    setNodeDetails({
                      code: fresh.code,
                      name: fresh.name,
                      description: ver.description || '',
                      type: 'definition'
                    } as Definition);
                  }
                  showToast('Version added', 'success');
                }}
                onUpdateVersion={async (id, v) => {
                  if (!metaDetails) return;
                  await updateMetaDefinitionVersion(metaDetails.id, id, v as any);
                  const fresh = await getMetaDefinition(metaDetails.id);
                  setMetaDetails(fresh);
                  if (currentVersion && currentVersion.id === id) {
                    const updated = (fresh.versions || []).find(x => x.id === id);
                    if (updated) {
                      setCurrentVersion(updated);
                      setNodeDetails({
                        code: fresh.code,
                        name: fresh.name,
                        description: updated.description || '',
                        type: 'definition'
                      } as Definition);
                    }
                  }
                  showToast('Version updated', 'success');
                }}
                onDeleteVersion={async (id) => {
                  if (!metaDetails) return;
                  try {
                    await deleteMetaDefinitionVersion(metaDetails.id, id);
                  } catch (e: any) {
                    showToast(e?.message || 'Cannot delete version', 'error');
                    return;
                  }
                  const fresh = await getMetaDefinition(metaDetails.id);
                  setMetaDetails(fresh);
                  if (currentVersion && currentVersion.id === id) {
                    const fallback = (fresh.versions || [])[0] || null;
                    setCurrentVersion(fallback as any);
                    if (fallback) {
                      setNodeDetails({
                        code: fresh.code,
                        name: fresh.name,
                        description: fallback.description || '',
                        type: 'definition'
                      } as Definition);
                    } else {
                      setNodeDetails({
                        code: fresh.code,
                        name: fresh.name,
                        description: '',
                        type: 'definition'
                      } as Definition);
                    }
                  }
                  showToast('Version deleted', 'success');
                }}
                onUpdateMeta={async (payload) => {
                  if (!metaDetails) return;
                  const prevCode = metaDetails.code;
                  const updated = await updateMetaDefinition(metaDetails.id, payload);

                  // Re-fetch full meta with versions to avoid losing versions in state
                  const fresh = await getMetaDefinition(metaDetails.id);
                  setMetaDetails(fresh);

                  // Update current node identity (code/name) so header and future loads are correct
                  setCurrentNode(prev => ({ ...prev, id: updated.code, name: updated.name }));
                  // Update window title immediately
                  ui.updateWindow(windowId, { title: updated.name });

                  // If code changed, force a full graph refresh to rebuild code-indexed maps and links
                  if (updated.code !== prevCode) {
                    showToast('Concept code updated. Refreshing graph…', 'success');
                    onRefresh?.();
                    return;
                  }

                  // Keep nodeDetails in sync for current view (surgical)
                  setNodeDetails(prev => prev ? { ...prev, code: updated.code, name: updated.name } as any : prev);

                  // Notify parent for surgical update if callback exists
                  onUpdateNodeData?.(updated.code, {
                    code: updated.code,
                    name: updated.name,
                    prerequisites: fresh.prerequisites || [],
                    prerequisiteWeights: fresh.prerequisiteWeights || {},
                    xPosition: fresh.xPosition,
                    yPosition: fresh.yPosition,
                    id: fresh.id,
                    type: 'definition',
                  } as any);

                  showToast('Concept pool updated', 'success');
                }}
                onBack={() => setIsEditMode(false)}
              />
            ) : (
              <MetaExerciseEditForm
                meta={metaDetails as any}
                initialActiveIndex={selectedVersionIndex}
                onAddVersion={async (v)=>{
                  if (!metaDetails) return;
                  await addMetaExerciseVersion(metaDetails.id, v as any);
                  const fresh = await getMetaExercise(metaDetails.id);
                  setMetaDetails(fresh);
                  // Initialize Details with the first version if none selected yet
                  if (!currentVersion && fresh.versions && fresh.versions.length > 0) {
                    const ver = fresh.versions[0];
                    setCurrentVersion(ver);
                    setNodeDetails({ ...(ver as any), id: ver.id, code: fresh.code, name: fresh.name, type: 'exercise' } as Exercise);
                  }
                  showToast('Version added','success');
                }}
                onUpdateVersion={async (id, v)=>{
                  if (!metaDetails) return;
                  await updateMetaExerciseVersion(metaDetails.id, id, v as any);
                  const fresh = await getMetaExercise(metaDetails.id);
                  setMetaDetails(fresh);
                  if (currentVersion && currentVersion.id === id) {
                    const updated = (fresh.versions || []).find(x => x.id === id);
                    if (updated) {
                      setCurrentVersion(updated);
                      setNodeDetails({ ...(updated as any), id: updated.id, code: fresh.code, name: fresh.name, type: 'exercise' } as Exercise);
                    }
                  }
                  showToast('Version updated','success');
                }}
                onDeleteVersion={async (id)=>{
                  if (!metaDetails) return;
                  try {
                    await deleteMetaExerciseVersion(metaDetails.id, id);
                  } catch (e: any) {
                    showToast(e?.message || 'Cannot delete version', 'error');
                    return;
                  }
                  const fresh = await getMetaExercise(metaDetails.id);
                  setMetaDetails(fresh);
                  if (currentVersion && currentVersion.id === id) {
                    const fallback = (fresh.versions || [])[0] || null;
                    setCurrentVersion(fallback as any);
                    if (fallback) {
                      setNodeDetails({ ...(fallback as any), id: fallback.id, code: fresh.code, name: fresh.name, type: 'exercise' } as Exercise);
                    } else {
                      setNodeDetails({ id: 0, code: fresh.code, name: fresh.name, statement: '', description: '', notes: '', hints: '', verifiable: false, type: 'exercise' } as any);
                    }
                  }
                  showToast('Version deleted','success');
                }}
                onUpdateMeta={async (payload) => {
                  if (!metaDetails) return;
                  const updated = await updateMetaExercise(metaDetails.id, payload);

                  // Re-fetch full meta with versions to avoid losing versions in state
                  const fresh = await getMetaExercise(metaDetails.id);
                  setMetaDetails(fresh);

                  // Update current node identity (code/name) so header and future loads are correct
                  setCurrentNode(prev => ({ ...prev, id: updated.code, name: updated.name }));

                  // Update window title immediately
                  ui.updateWindow(windowId, { title: updated.name });

                  // Keep nodeDetails in sync for current view
                  setNodeDetails(prev => prev ? { ...prev, code: updated.code, name: updated.name } as any : prev);

                  // Clamp selected version index to available range
                  const maxIndex = Math.max(0, (fresh.versions?.length || 1) - 1);
                  setSelectedVersionIndex(i => Math.max(0, Math.min(i, maxIndex)));

                  // Full graph refresh to rebuild maps and keys after potential code rename
                  onRefresh?.();
                }}
                onBack={() => setIsEditMode(false)}
              />
            )
          ) : (
            <div className="text-center py-5 text-gray-500">Loading details...</div>
          )
        ) : (
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="w-full">
            <TabsList className="grid w-full grid-cols-5 h-9">
              <TabsTrigger value="details" className="text-sm h-8">Details</TabsTrigger>
              {(currentNode.type === 'exercise' || currentNode.type === 'definition') && (
                <TabsTrigger value="versions" className="text-sm h-8">Versions</TabsTrigger>
              )}
              {currentNode.type === 'exercise' && (
                <TabsTrigger value="prerequisites" className="text-sm h-8">Prerequisites</TabsTrigger>
              )}
              {currentNode.type === 'definition' && (
                <TabsTrigger value="prerequisites" className="text-sm h-8">Prerequisites</TabsTrigger>
              )}
              <TabsTrigger value="srs" className="text-sm h-8">SRS Progress</TabsTrigger>
              <TabsTrigger value="groups" className="text-sm h-8">Groups</TabsTrigger>
            </TabsList>
            {(currentNode.type === 'exercise' || currentNode.type === 'definition') && (
              <TabsContent value="versions" className="mt-3">
                {currentNode.type === 'exercise' ? (
                  metaDetails ? (
                    <MetaExerciseVersionsViewer
                      meta={metaDetails as MetaExercise}
                      activeIndex={selectedVersionIndex}
                      setActiveIndex={setSelectedVersionIndex}
                      isOwner={canEdit}
                      onEditVersion={canEdit ? (index) => {
                        setSelectedVersionIndex(index);
                        setIsEditMode(true);
                      } : undefined}
                    />
                  ) : (
                    <div className="text-center py-5 text-gray-500">Loading versions…</div>
                  )
                ) : (
                  metaDetails ? (
                    <MetaDefinitionVersionsViewer
                      meta={metaDetails as MetaDefinition}
                      activeIndex={selectedDefinitionIndex}
                      setActiveIndex={setSelectedDefinitionIndex}
                      isOwner={canEdit}
                      onEditVersion={canEdit ? (index) => {
                        setSelectedDefinitionIndex(index);
                        setIsEditMode(true);
                      } : undefined}
                    />
                  ) : (
                    <div className="text-center py-5 text-gray-500">Loading versions…</div>
                  )
                )}
              </TabsContent>
            )}
            {currentNode.type === 'exercise' && (
              <TabsContent value="prerequisites" className="mt-3">
                {numericId && domainData?.id ? (
                  <PrerequisitesPanel
                    domainId={domainData.id}
                    nodeId={numericId}
                    nodeType={'meta_exercise'}
                    availableDefinitions={availableDefinitions}
                    canEdit={canEdit}
                    externalLinks={externalPrerequisites}
                    onExternalChanged={onExternalChanged}
                    onChanged={async () => {
                      // Surgical update: fetch fresh meta-exercise and update only this node
                      try {
                        const fresh = await getMetaExercise(numericId);
                        onUpdateNodeData?.(fresh.code, {
                          code: fresh.code,
                          name: fresh.name,
                          prerequisites: fresh.prerequisites || [],
                          prerequisiteWeights: fresh.prerequisiteWeights || {},
                          xPosition: fresh.xPosition,
                          yPosition: fresh.yPosition,
                          id: fresh.id,
                          type: 'exercise',
                        } as any);
                      } catch (e) {
                        console.warn('Failed to fetch updated meta exercise; falling back to refresh.', e);
                        onRefresh?.();
                      }
                    }}
                  />
                ) : (
                  <div className="text-sm text-gray-500">Unavailable (missing IDs)</div>
                )}
              </TabsContent>
            )}
            {currentNode.type === 'definition' && (
              <TabsContent value="prerequisites" className="mt-3">
                {numericId && domainData?.id ? (
                  <PrerequisitesPanel
                    domainId={domainData.id}
                    nodeId={numericId}
                    nodeType={'meta_definition'}
                    availableDefinitions={availableDefinitions}
                    allowKinds={['meta_definition']}
                    canEdit={canEdit}
                    externalLinks={externalPrerequisites}
                    onExternalChanged={onExternalChanged}
                    onChanged={async () => {
                      // Surgical update for concept prerequisites: reload meta-definition and apply its codes/weights
                      try {
                        const fresh = await getMetaDefinition(numericId);
                        const enriched = {
                          code: fresh.code,
                          name: fresh.name,
                          type: 'definition',
                          prerequisites: fresh.prerequisites || [],
                          prerequisiteWeights: fresh.prerequisiteWeights || {},
                          xPosition: fresh.xPosition,
                          yPosition: fresh.yPosition,
                          domainId: fresh.domainId,
                          id: fresh.id,
                        } as Definition;
                        setNodeDetails(enriched);
                        onUpdateNodeData?.(fresh.code, enriched as any);
                      } catch (e) {
                        console.warn('Failed to surgically update concept prerequisites; falling back to refresh.', e);
                        onRefresh?.();
                      }
                    }}
                  />
                ) : (
                  <div className="text-sm text-gray-500">Unavailable (missing IDs)</div>
                )}
              </TabsContent>
            )}
            
            <TabsContent value="details" className="mt-3 space-y-4">
              {currentNode.type === 'definition' ? (
                definitionDetailsForView ? (
                  <DefinitionView
                    definition={definitionDetailsForView as Definition}
                    mode="practice" // Always show content in detail windows
                    showDefinition={showDefinition}
                    onToggleDefinition={() => setShowDefinition(!showDefinition)}
                    selectedDefinitionIndex={selectedDefinitionIndex}
                    totalDescriptions={totalDescriptionsCount()}
                    currentDescription={currentDescriptionText()}
                    currentPrompt={currentPromptText()}
                    currentNotes={currentNotesText()}
                    promptImagePath={currentPromptImagePath()}
                    descriptionImagePath={currentDescriptionImagePath()}
                    onNavigatePrev={() => setSelectedDefinitionIndex(i => Math.max(0, i - 1))}
                    onNavigateNext={() => setSelectedDefinitionIndex(i => Math.min(totalDescriptionsCount() - 1, i + 1))}
                    relatedExercises={relatedExercises}
                    onNavigateToNode={navigateToNode}
                    onReview={handleReviewDefinition}
                    availableDefinitions={availableDefinitions.map((d: any) => ({
                      code: d.code,
                      name: d.name
                    }))}
                    availableExercises={availableExercises.map((e: any) => ({
                      code: e.code,
                      name: e.name
                    }))}
                    srsStatus={nodeProgress?.status}
                  />
                ) : (
                  <div className="text-sm text-gray-500">Definition details unavailable.</div>
                )
              ) : (
                <ExerciseView
                  exercise={nodeDetails as Exercise}
                  showSolution={showSolution}
                  onToggleSolution={() => setShowSolution(!showSolution)}
                  showHints={showHints}
                  onToggleHints={() => setShowHints(!showHints)}
                  userAnswer={userAnswer}
                  onUpdateAnswer={setUserAnswer}
                  answerFeedback={answerFeedback}
                  onVerifyAnswer={verifyAnswer}
                  onRateExercise={handleRateExercise}
                  exerciseAttemptCompleted={exerciseAttemptCompleted}
                  onNavigateToNode={navigateToNode}
                  availableDefinitions={availableDefinitions.map((d: any) => ({
                    code: d.code,
                    name: d.name
                  }))}
                  availableExercises={availableExercises.map((e: any) => ({
                    code: e.code,
                    name: e.name
                  }))}
                  definitionPrerequisites={definitionPrereqsForView}
                  exercisePrerequisites={exercisePrereqsForView}
                  srsStatus={nodeProgress?.status}
                  onAnotherVersion={handleAnotherVersion}
                  statementImagePath={(nodeDetails as Exercise | null)?.statementImagePath}
                  descriptionImagePath={(nodeDetails as Exercise | null)?.descriptionImagePath}
                />
              )}
            </TabsContent>
            
            <TabsContent value="srs" className="mt-3 space-y-3">
              <StatusIndicator
                status={nodeProgress?.status || 'fresh'}
                isDue={nodeProgress?.isDue}
                daysUntilReview={nodeProgress?.daysUntilReview}
                nextReviewDate={nodeProgress?.nextReview}
              />
              
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-600">Set Status:</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['fresh', 'tackling', 'grasped', 'learned'] as NodeStatus[]).map(status => (
                    <Button
                      key={status}
                      variant={nodeProgress?.status === status ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleStatusChange(status)}
                      className="text-xs h-7 capitalize"
                      disabled={srs.state.loading}
                    >
                      {status}
                    </Button>
                  ))}
                </div>
              </div>
              
              <ProgressDisplay progress={nodeProgress} />
              
              {/* Review History */}
              <div className="mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowHistory(!showHistory)}
                  className="w-full flex justify-between items-center text-xs h-7"
                >
                  <span>Review History</span>
                  {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </Button>
                {showHistory && (
                  <div className="mt-2 p-2 border rounded-md bg-gray-50 max-h-48 overflow-y-auto text-xs space-y-1.5">
                    {historyLoading && <p>Loading history...</p>}
                    {!historyLoading && history.length === 0 && <p>No review history found.</p>}
                    {history.map(item => (
                      <div key={item.id} className={`p-1.5 rounded border-l-4 ${
                        item.success ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'
                      }`}>
                        <p>
                          <strong>{new Date(item.reviewTime).toLocaleString()}</strong> - 
                          {item.success ? 'Success' : 'Fail'} (Q: {item.quality})
                        </p>
                        {item.intervalAfter !== undefined && (
                          <p className="text-gray-600">
                            Interval: {item.intervalBefore?.toFixed(1)}d → {item.intervalAfter?.toFixed(1)}d
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="groups" className="mt-3 space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-semibold text-gray-800">Create group</div>
                <div className="flex items-center gap-2">
                  <Input
                    value={groupNameDraft}
                    onChange={(e) => setGroupNameDraft(e.target.value)}
                    placeholder="Group name"
                    className="h-8 text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={handleCreateGroup}
                    disabled={!onCreateGroup || isSavingGroup}
                  >
                    Create
                  </Button>
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={groupExactDraft}
                    onChange={(e) => setGroupExactDraft(e.target.checked)}
                  />
                  Pin exact membership (test)
                </label>
              </div>

              <div className="border-t pt-3 space-y-2">
                <div className="text-sm font-semibold text-gray-800">Groups</div>
                {groups.length === 0 ? (
                  <div className="text-xs text-gray-500">No groups yet.</div>
                ) : (
                  <div className="space-y-2">
                    {groups.map(group => {
                      const members = groupMembersById.get(group.id) ?? new Set<string>();
                      const isMember = members.has(currentNode.id);
                      const isSeed = (group.seeds || []).some(seed => seed.nodeCode === currentNode.id);
                      const isExact = group.isExact;
                      const isDerived = isMember && !isSeed && !isExact;
                      const canRemove = isExact || isSeed;
                      const actionLabel = isMember ? (canRemove ? 'Remove' : 'Derived') : 'Add';

                      return (
                        <div key={group.id} className="flex items-center justify-between gap-3 rounded border px-3 py-2 text-xs">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-800">{group.name}</span>
                              <span className="text-[10px] text-gray-500">{members.size}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] uppercase tracking-wide text-gray-500">
                                {isExact ? 'Exact' : 'Convex'}
                              </span>
                              {isSeed && <span className="text-[10px] text-blue-600">Seed</span>}
                              {isDerived && <span className="text-[10px] text-gray-400">Derived</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {onUpdateGroup && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleToggleGroupExact(group, !group.isExact)}
                              >
                                {group.isExact ? 'Unpin' : 'Pin'}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant={isMember ? 'outline' : 'default'}
                              disabled={isMember && !canRemove}
                              onClick={() => {
                                if (!onUpdateGroup) return;
                                if (isMember) {
                                  handleRemoveNodeFromGroup(group);
                                } else {
                                  handleAddNodeToGroup(group);
                                }
                              }}
                            >
                              {actionLabel}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};
