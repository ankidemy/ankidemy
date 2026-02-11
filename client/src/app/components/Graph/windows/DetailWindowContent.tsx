// client/src/app/components/Graph/windows/DetailWindowContent.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import { ArrowLeft, Edit, Eye, ChevronDown, ChevronUp, BarChart3, Save, SlidersHorizontal, Copy, RefreshCw } from 'lucide-react';
import { GraphNode, Definition, Exercise, AnswerFeedback } from '../utils/types';
import DefinitionView from '../details/DefinitionView';
import ExerciseView from '../details/ExerciseView';
import PrerequisitesPanel from '../details/PrerequisitesPanel';
import MetaExerciseEditForm, { MetaExerciseEditFormRef } from '../details/MetaExerciseEditForm';
import MetaDefinitionEditForm, { MetaDefinitionEditFormRef } from '../details/MetaDefinitionEditForm';
import VersionHeaderControls from '../components/VersionHeaderControls';
import { useSRS } from '@/contexts/SRSContext';
import { useUI } from '@/contexts/UIContext';
import { NodeStatus, ReviewHistoryItem as SRSReviewHistoryItem } from '@/types/srs';
import ProgressDisplay from '../components/ProgressDisplay';
import { getReviewHistory, getDomainPrerequisites, getStatusColor, formatNextReview, createPrerequisite } from '@/lib/srs-api';
import { InlineMarkdownKatex } from '@/app/components/core/MarkdownKatex';
import {
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
  createMetaDefinition,
  createMetaExercise,
  updateMetaExercise,
  updateMetaDefinition,
  Definition as ApiDefinition,
  Exercise as ApiExercise,
  MetaExercise,
  MetaDefinition,
  ExerciseVersion,
  DefinitionVersion,
  ExternalPrerequisiteLink,
  GroupData,
  createQuest,
  createRelation,
} from '@/lib/api';
import { showToast } from '@/app/components/core/ToastNotification';
import { getAppTimeZone } from '@/lib/app-preferences';
import { getNextQuestCode as getNextQuestCodeFromUtils, getNextDotCode, getNextExerciseCode } from '../utils/codeGeneration';

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
  onInsertNode?: (nodeCode: string, nodeType: 'definition' | 'exercise', createdData?: any, spawnOverride?: { x: number; y: number }) => void;
  externalPrerequisites?: ExternalPrerequisiteLink[];
  onExternalChanged?: () => void;
  groups?: GroupData[];
  groupMembersById?: Map<number, Set<string>>;
  onUpdateGroup?: (groupId: number, payload: { name?: string; isExact?: boolean; seedCodes?: string[]; memberCodes?: string[] }) => Promise<GroupData | null>;
  onDeleteGroup?: (groupId: number) => Promise<void>;
  onQuestCreated?: (quest: { id?: number; code: string }, relation: { fromCode: string; toCode: string; relationType: string }) => void;
  onCopyYaml?: () => void;
  isCopyingYaml?: boolean;
}

const pad2 = (value: number) => String(value).padStart(2, '0');
const toLocalDateInputValue = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  return `${yyyy}-${mm}-${dd}`;
};
const toLocalTimeInputValue = (date: Date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
const getDefaultReminderDateTime = () => new Date(Date.now() + 60 * 60 * 1000);
const getDefaultReminderDraft = () => {
  const date = getDefaultReminderDateTime();
  return {
    date: toLocalDateInputValue(date),
    time: toLocalTimeInputValue(date),
  };
};
const getReminderDraftFromOffsetMinutes = (offsetMinutes: number) => {
  const date = new Date(Date.now() + offsetMinutes * 60 * 1000);
  return {
    date: toLocalDateInputValue(date),
    time: toLocalTimeInputValue(date),
  };
};
const buildReminderDateTime = (dateValue: string, timeValue: string) => {
  const fallbackDate = getDefaultReminderDateTime();
  const fallbackDateValue = toLocalDateInputValue(fallbackDate);
  const fallbackTimeValue = toLocalTimeInputValue(fallbackDate);
  const date = dateValue || fallbackDateValue;
  const time = timeValue || fallbackTimeValue;
  const combined = new Date(`${date}T${time}`);
  return Number.isNaN(combined.getTime()) ? fallbackDate : combined;
};

export const DetailWindowContent: React.FC<DetailWindowContentProps> = ({
  nodeData: initialNodeData,
  windowId,
  graphData,
  onNavigateToNode: _onNavigateToNode,
  codeToNumericIdMap = new Map(),
  currentUser,
  domainData,
  onUpdateNodeData, // NEW: Surgical update callback
  onRefresh, // Fallback refresh
  onInsertNode,
  externalPrerequisites,
  onExternalChanged,
  groups = [],
  groupMembersById = new Map(),
  onUpdateGroup,
  onDeleteGroup: _onDeleteGroup,
  onQuestCreated,
  onCopyYaml,
  isCopyingYaml = false,
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
  const [isDetaching, setIsDetaching] = useState(false);
  const [isVersionUpdating, setIsVersionUpdating] = useState(false);
  const [isSavingActiveVersion, setIsSavingActiveVersion] = useState(false);
  const [isActiveVersionDirty, setIsActiveVersionDirty] = useState(false);
  const [codeDraft, setCodeDraft] = useState(initialNodeData.id);
  const [isHeaderCodeEditing, setIsHeaderCodeEditing] = useState(false);
  const definitionEditFormRef = React.useRef<MetaDefinitionEditFormRef | null>(null);
  const exerciseEditFormRef = React.useRef<MetaExerciseEditFormRef | null>(null);
  
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
  const [activeTab, setActiveTab] = useState<'details' | 'advanced' | 'statistics'>('details');
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showReminderForm, setShowReminderForm] = useState(false);
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDraft, setReminderDraft] = useState(() => getDefaultReminderDraft());

  const handleToggleGroupExact = useCallback(async (group: GroupData, nextExact: boolean) => {
    if (!onUpdateGroup) return;
    const members = groupMembersById.get(group.id) ?? new Set<string>();
    const memberCodes: string[] | undefined = nextExact ? Array.from(members) : undefined;
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
      const existing: string[] = (group.members && group.members.length > 0)
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
      const existing: string[] = (group.members && group.members.length > 0)
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
        const fallbackVersion = ver ?? meta.versions?.[0] ?? null;
        if (!fallbackVersion) {
          throw new Error('No definition versions available');
        }
        setCurrentVersion(fallbackVersion as any);
        // If the suggested version exists in the list, align selection index
        if (meta.versions && fallbackVersion?.id != null) {
          const idx = meta.versions.findIndex(v => v.id === fallbackVersion.id);
          if (idx >= 0) setSelectedDefinitionIndex(idx);
        }
        details = {
          code: meta.code,
          name: meta.name,
          description: fallbackVersion.description || '',
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
        const fallbackVersion = ver ?? meta.versions?.[0] ?? null;
        if (!fallbackVersion) {
          throw new Error('No exercise versions available');
        }
        setCurrentVersion(fallbackVersion as any);
        if (meta.versions && fallbackVersion?.id != null) {
          const idx = meta.versions.findIndex(v => v.id === fallbackVersion.id);
          if (idx >= 0) setSelectedVersionIndex(idx);
        }
        details = {
          ...(fallbackVersion as any),
          id: fallbackVersion.id,
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
  }, [graphData, codeToNumericIdMap]);

  // Initialize with first node
  useEffect(() => {
    loadNodeDetails(currentNode);
  }, [loadNodeDetails, currentNode]);
  useEffect(() => {
    setActiveTab('details');
    setShowStatusPicker(false);
    setShowReminderForm(false);
    setReminderDraft(getDefaultReminderDraft());
    setReminderTitle(currentNode?.name ? `Review: ${currentNode.name}` : '');
  }, [currentNode.id, currentNode.name]);
  useEffect(() => {
    setCodeDraft(currentNode.id);
    setIsHeaderCodeEditing(false);
  }, [currentNode.id]);
  useEffect(() => {
    if (!isEditMode) {
      setCodeDraft(currentNode.id);
      setIsHeaderCodeEditing(false);
    }
  }, [currentNode.id, isEditMode]);

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
  const isSrsNodeType = (type: GraphNode['type']): type is 'definition' | 'exercise' =>
    type === 'definition' || type === 'exercise';
  const srsNodeType = isSrsNodeType(currentNode.type) ? currentNode.type : null;
  const nodeProgress = numericId && srsNodeType ? srs.getNodeProgress(numericId, srsNodeType) : null;

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


  // Status change handler
  const handleStatusChange = useCallback(async (status: NodeStatus) => {
    if (!numericId || !srsNodeType) return;

    await srs.updateNodeStatus(numericId, srsNodeType, status);
    showToast(`Status updated to ${status}`, 'success');
    setShowStatusPicker(false);
  }, [numericId, srsNodeType, srs]);

  const existingCodes = useMemo(() => {
    const codes = new Set<string>();
    Object.keys(graphData?.definitions || {}).forEach(code => codes.add(code));
    Object.keys(graphData?.exercises || {}).forEach(code => codes.add(code));
    Object.keys(graphData?.sources || {}).forEach(code => codes.add(code));
    Object.keys(graphData?.quests || {}).forEach(code => codes.add(code));
    return codes;
  }, [graphData]);

  const handleCreateReminder = useCallback(async () => {
    if (!numericId || !domainData?.id) {
      showToast('Node must be saved before creating a reminder.', 'warning');
      return;
    }
    if (currentNode.type !== 'definition' && currentNode.type !== 'exercise') return;
    const dueDate = buildReminderDateTime(reminderDraft.date, reminderDraft.time);
    const schedule = {
      type: 'rrule',
      timezone: getAppTimeZone(),
      dtstart: dueDate.toISOString(),
      rrule: 'FREQ=DAILY;COUNT=1',
      exdate: [],
      rdate: [],
      defaultSnoozeMinutes: 120,
    };
    try {
      const reminderCode = existingCodes.size > 0 ? getNextQuestCodeFromUtils(existingCodes) : 'Q1';
      const title = reminderTitle.trim().length > 0 ? reminderTitle.trim() : `Review: ${currentNode.name}`;
      const quest = await createQuest(domainData.id, {
        code: reminderCode,
        name: title,
        kind: 'todo',
        visibility: 'private',
        schedule,
        initialVersion: {
          title,
          descriptionMd: '',
        },
      });
      if (!quest.id) throw new Error('Quest created without id.');
      await createRelation(domainData.id, {
        fromType: 'meta_quest',
        fromId: quest.id,
        toType: currentNode.type === 'definition' ? 'meta_definition' : 'meta_exercise',
        toId: numericId,
        relationType: 'reminds_open',
      });
      showToast('Reminder quest created.', 'success');
      setShowReminderForm(false);
      onQuestCreated?.(quest, { fromCode: quest.code, toCode: currentNode.id, relationType: 'reminds_open' });
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create reminder.', 'error');
    }
  }, [numericId, domainData?.id, currentNode.id, currentNode.type, currentNode.name, reminderDraft.date, reminderDraft.time, reminderTitle, existingCodes, onQuestCreated]);

  // Review history fetching
  const fetchHistory = useCallback(async () => {
    if (!numericId || !srsNodeType) return;

    setHistoryLoading(true);
    try {
      const data = await getReviewHistory(numericId, srsNodeType, 10);
      setHistory(data);
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setHistoryLoading(false);
    }
  }, [numericId, srsNodeType]);

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
    if (isEditMode) {
      setIsEditMode(false);
      setActiveTab('details');
      return;
    }
    if (!canEdit) {
      showToast('Only domain owners or editors can edit nodes.', 'warning');
      return;
    }
    setActiveTab('details');
    setIsEditMode(true);
  }, [canEdit, isEditMode]);

  const toggleViewTab = useCallback((tab: 'advanced' | 'statistics') => {
    setIsEditMode(false);
    setActiveTab(prev => (prev === tab ? 'details' : tab));
  }, []);

  // ENHANCED: Surgical edit submission with fallback
  const _handleSubmitEdit = useCallback(async () => {
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
        const hasMultipleDefinitionDescriptions =
          ((metaDetails as MetaDefinition | null)?.versions?.length || 0) > 1
          || (Array.isArray(defDetails.description) && defDetails.description.length > 1)
          || String(defDetails.description).includes('|||');
        if (hasMultipleDefinitionDescriptions) {
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
  }, [nodeDetails, canEdit, currentNode, selectedDefinitionIndex, windowId, ui, onUpdateNodeData, onRefresh, metaDetails]);

  // Helper functions for descriptions

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
  }, [selectedDefinitionIndex, metaDetails, currentNode.type, currentVersion]);

  // Keep currentVersion and nodeDetails in sync with selected exercise version
  useEffect(() => {
    if (currentNode.type !== 'exercise') return;
    const meta = metaDetails as MetaExercise | null;
    if (!meta || !Array.isArray(meta.versions) || meta.versions.length === 0) return;
    const idx = Math.max(0, Math.min(selectedVersionIndex, meta.versions.length - 1));
    const ver = meta.versions[idx];
    if (!ver) return;
    if (!currentVersion || currentVersion.id !== ver.id) {
      setCurrentVersion(ver as any);
      setNodeDetails({ ...(ver as any), id: ver.id, code: meta.code, name: meta.name, type: 'exercise' } as Exercise);
      setUserAnswer('');
      setAnswerFeedback(null);
      setShowSolution(false);
      setShowHints(false);
      setExerciseAttemptCompleted(false);
    }
  }, [selectedVersionIndex, metaDetails, currentNode.type, currentVersion]);

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

  const versionCount = useMemo(() => {
    if (currentNode.type === 'definition') {
      return (metaDetails as MetaDefinition | null)?.versions?.length || 0;
    }
    if (currentNode.type === 'exercise') {
      return (metaDetails as MetaExercise | null)?.versions?.length || 0;
    }
    return 0;
  }, [currentNode.type, metaDetails]);

  const versionIndex = useMemo(() => {
    const raw = currentNode.type === 'definition' ? selectedDefinitionIndex : selectedVersionIndex;
    if (versionCount <= 0) return 0;
    return Math.max(0, Math.min(raw, versionCount - 1));
  }, [currentNode.type, selectedDefinitionIndex, selectedVersionIndex, versionCount]);

  useEffect(() => {
    setIsActiveVersionDirty(false);
  }, [currentNode.id, currentNode.type, isEditMode, versionIndex]);

  const handlePrevVersion = useCallback(() => {
    if (versionCount <= 1) return;
    if (currentNode.type === 'definition') {
      setSelectedDefinitionIndex(i => Math.max(0, i - 1));
      return;
    }
    if (currentNode.type === 'exercise') {
      setSelectedVersionIndex(i => Math.max(0, i - 1));
    }
  }, [currentNode.type, versionCount]);

  const handleNextVersion = useCallback(() => {
    if (versionCount <= 1) return;
    if (currentNode.type === 'definition') {
      setSelectedDefinitionIndex(i => Math.min(versionCount - 1, i + 1));
      return;
    }
    if (currentNode.type === 'exercise') {
      setSelectedVersionIndex(i => Math.min(versionCount - 1, i + 1));
    }
  }, [currentNode.type, versionCount]);

  const handleAddVersion = useCallback(async () => {
    if (!canEdit) {
      showToast('Only domain owners or editors can add versions.', 'warning');
      return;
    }
    if (isVersionUpdating) return;
    if (currentNode.type !== 'definition' && currentNode.type !== 'exercise') return;

    setIsVersionUpdating(true);
    try {
      if (currentNode.type === 'definition') {
        const meta = metaDetails as MetaDefinition | null;
        if (!meta) throw new Error('Missing definition metadata.');
        await addMetaDefinitionVersion(meta.id, {
          prompt: `Define ${meta.name}`,
          type: 'open_ended',
          description: '',
          notes: '',
          references: [],
        });
        const fresh = await getMetaDefinition(meta.id);
        setMetaDetails(fresh);
        setSelectedDefinitionIndex(Math.max(0, (fresh.versions?.length || 1) - 1));
      } else {
        const meta = metaDetails as MetaExercise | null;
        if (!meta) throw new Error('Missing exercise metadata.');
        await addMetaExerciseVersion(meta.id, {
          statement: `Solve ${meta.name}`,
          description: '',
          hints: '',
          notes: '',
          difficulty: 3,
          verifiable: false,
          result: '',
        });
        const fresh = await getMetaExercise(meta.id);
        setMetaDetails(fresh);
        setSelectedVersionIndex(Math.max(0, (fresh.versions?.length || 1) - 1));
      }
      showToast('Version added.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to add version.', 'error');
    } finally {
      setIsVersionUpdating(false);
    }
  }, [canEdit, currentNode.type, isVersionUpdating, metaDetails]);

  const handleDeleteActiveVersion = useCallback(async () => {
    if (!canEdit) {
      showToast('Only domain owners or editors can delete versions.', 'warning');
      return;
    }
    if (versionCount <= 1) {
      showToast('At least one version must remain.', 'warning');
      return;
    }
    if (isVersionUpdating) return;
    if (currentNode.type !== 'definition' && currentNode.type !== 'exercise') return;
    if (!confirm('Delete this version?')) return;

    setIsVersionUpdating(true);
    try {
      if (currentNode.type === 'definition') {
        const meta = metaDetails as MetaDefinition | null;
        const versionId = meta?.versions?.[versionIndex]?.id;
        if (!meta || !versionId) throw new Error('Missing definition version.');
        await deleteMetaDefinitionVersion(meta.id, versionId);
        const fresh = await getMetaDefinition(meta.id);
        setMetaDetails(fresh);
        setSelectedDefinitionIndex(Math.min(versionIndex, Math.max(0, (fresh.versions?.length || 1) - 1)));
      } else {
        const meta = metaDetails as MetaExercise | null;
        const versionId = meta?.versions?.[versionIndex]?.id;
        if (!meta || !versionId) throw new Error('Missing exercise version.');
        await deleteMetaExerciseVersion(meta.id, versionId);
        const fresh = await getMetaExercise(meta.id);
        setMetaDetails(fresh);
        setSelectedVersionIndex(Math.min(versionIndex, Math.max(0, (fresh.versions?.length || 1) - 1)));
      }
      showToast('Version deleted.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to delete version.', 'error');
    } finally {
      setIsVersionUpdating(false);
    }
  }, [canEdit, currentNode.type, isVersionUpdating, metaDetails, versionCount, versionIndex]);

  const hasPendingEditChanges = isEditMode
    && (currentNode.type === 'definition' || currentNode.type === 'exercise')
    && isActiveVersionDirty;

  const handleSaveActiveVersion = useCallback(async () => {
    if (!isEditMode || isSavingActiveVersion) return;
    setIsSavingActiveVersion(true);
    try {
      if (currentNode.type === 'definition') {
        await definitionEditFormRef.current?.saveVersion();
        return;
      }
      if (currentNode.type === 'exercise') {
        await exerciseEditFormRef.current?.saveVersion();
      }
    } finally {
      setIsSavingActiveVersion(false);
    }
  }, [currentNode.type, isEditMode, isSavingActiveVersion]);

  const handleDetachVersion = useCallback(async () => {
    if (isDetaching) return;
    if (currentNode.type !== 'definition' && currentNode.type !== 'exercise') return;
    if (versionCount < 2) {
      showToast('At least two versions are required to detach.', 'warning');
      return;
    }
    if (!canEdit) {
      showToast('Only domain owners or editors can detach versions.', 'warning');
      return;
    }
    if (!domainData?.id) {
      showToast('Missing domain context.', 'error');
      return;
    }
    const meta = metaDetails as MetaDefinition | MetaExercise | null;
    const version = currentVersion as DefinitionVersion | ExerciseVersion | null;
    if (!meta || !version || version.id == null) {
      showToast('Missing version data.', 'error');
      return;
    }

    setIsDetaching(true);
    try {
      const nextCode = currentNode.type === 'definition'
        ? getNextDotCode(existingCodes)
        : getNextExerciseCode(existingCodes);
      const nextName = currentNode.type === 'definition'
        ? `Concept ${nextCode}`
        : `Exercise ${nextCode}`;
      const spawnX = typeof meta.xPosition === 'number' ? meta.xPosition + 60 : undefined;
      const spawnY = typeof meta.yPosition === 'number' ? meta.yPosition + 60 : undefined;

      if (currentNode.type === 'definition') {
        const defVersion = version as DefinitionVersion;
        const prompt = (defVersion.prompt || '').trim() || `Define ${nextName}`;
        const created = await createMetaDefinition(domainData.id, {
          code: nextCode,
          name: nextName,
          xPosition: spawnX,
          yPosition: spawnY,
          initialVersion: {
            prompt,
            type: defVersion.type || 'open_ended',
            description: defVersion.description || undefined,
            notes: defVersion.notes || undefined,
            references: defVersion.references || undefined,
            promptImagePath: defVersion.promptImagePath || undefined,
            descriptionImagePath: defVersion.descriptionImagePath || undefined,
          },
        });
        await createPrerequisite({
          nodeId: created.id,
          nodeType: 'meta_definition',
          prerequisiteId: meta.id,
          prerequisiteType: 'meta_definition',
          weight: 1.0,
          isManual: true,
        });
        await deleteMetaDefinitionVersion(meta.id, defVersion.id);
        onInsertNode?.(nextCode, 'definition', {
          ...created,
          prerequisites: [currentNode.id],
          prerequisiteWeights: { [currentNode.id]: 1.0 },
        }, spawnX != null && spawnY != null ? { x: spawnX, y: spawnY } : undefined);
      } else {
        const exVersion = version as ExerciseVersion;
        const statement = (exVersion.statement || '').trim() || `Solve ${nextName}`;
        const created = await createMetaExercise(domainData.id, {
          code: nextCode,
          name: nextName,
          xPosition: spawnX,
          yPosition: spawnY,
          initialVersion: {
            statement,
            description: exVersion.description || undefined,
            notes: exVersion.notes || undefined,
            hints: exVersion.hints || undefined,
            verifiable: exVersion.verifiable ?? undefined,
            result: exVersion.result || undefined,
            difficulty: exVersion.difficulty ?? undefined,
            statementImagePath: exVersion.statementImagePath || undefined,
            descriptionImagePath: exVersion.descriptionImagePath || undefined,
          },
        });
        await createPrerequisite({
          nodeId: created.id,
          nodeType: 'meta_exercise',
          prerequisiteId: meta.id,
          prerequisiteType: 'meta_exercise',
          weight: 1.0,
          isManual: true,
        });
        await deleteMetaExerciseVersion(meta.id, exVersion.id);
        onInsertNode?.(nextCode, 'exercise', {
          ...created,
          prerequisites: [currentNode.id],
          prerequisiteWeights: { [currentNode.id]: 1.0 },
        }, spawnX != null && spawnY != null ? { x: spawnX, y: spawnY } : undefined);
      }

      const nextVersions = (meta.versions || []).filter(v => v.id !== version.id);
      setMetaDetails(prev => prev ? { ...prev, versions: nextVersions, versionCount: nextVersions.length } as any : prev);
      if (currentNode.type === 'definition') {
        setSelectedDefinitionIndex(i => Math.min(i, Math.max(0, nextVersions.length - 1)));
      } else {
        setSelectedVersionIndex(i => Math.min(i, Math.max(0, nextVersions.length - 1)));
      }

      showToast('Version detached into a new node.', 'success');
      if (!onInsertNode) {
        onRefresh?.();
      }
    } catch (error) {
      console.error('Failed to detach version:', error);
      showToast('Failed to detach version.', 'error');
    } finally {
      setIsDetaching(false);
    }
  }, [
    isDetaching,
    currentNode.type,
    currentNode.id,
    versionCount,
    canEdit,
    domainData?.id,
    metaDetails,
    currentVersion,
    existingCodes,
    onInsertNode,
    onRefresh,
  ]);

  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
        <p className="mt-2 text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col text-sm">
      {/* Header with navigation */}
      <div className="p-4 pb-2 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
            {(isEditMode || activeTab !== 'details' || nodeHistory.length > 0) && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  if (isEditMode) {
                    setIsEditMode(false);
                    setActiveTab('details');
                    return;
                  }
                  if (activeTab !== 'details') {
                    setActiveTab('details');
                    return;
                  }
                  if (nodeHistory.length > 0) {
                    navigateBack();
                  }
                }}
                title="Back"
              >
                <ArrowLeft size={14} />
              </Button>
            )}
            <div className="text-base font-semibold text-gray-900 truncate">
              <InlineMarkdownKatex>{currentNode.name}</InlineMarkdownKatex>
            </div>
            {onCopyYaml && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0"
                onClick={onCopyYaml}
                disabled={isCopyingYaml}
                title="Copy node as YAML"
              >
                {isCopyingYaml ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Copy size={14} />
                )}
              </Button>
            )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isEditMode && (currentNode.type === 'definition' || currentNode.type === 'exercise') && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setShowReminderForm(prev => !prev)}
              >
                {showReminderForm ? 'Close Reminder' : 'Remind Me'}
              </Button>
            )}
            {currentNode.type !== 'source' && currentNode.type !== 'quest' && (
              <>
                <Button
                  variant={activeTab === 'advanced' ? 'outline' : 'ghost'}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => toggleViewTab('advanced')}
                  title="Advanced"
                >
                  <SlidersHorizontal size={16} />
                </Button>
                <Button
                  variant={activeTab === 'statistics' ? 'outline' : 'ghost'}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => toggleViewTab('statistics')}
                  title="Statistics"
                >
                  <BarChart3 size={16} />
                </Button>
              </>
            )}
            <Button
              variant={isEditMode ? "outline" : "ghost"}
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
            {isEditMode && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => {
                    setIsEditMode(false);
                    setActiveTab('details');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-8"
                  onClick={handleSaveActiveVersion}
                  disabled={!hasPendingEditChanges || isSavingActiveVersion || isVersionUpdating}
                >
                  <Save size={14} className="mr-1" />
                  {isSavingActiveVersion ? 'Saving…' : 'Save'}
                </Button>
              </>
            )}
          </div>
        </div>
        {(nodeProgress?.nextReview || nodeProgress?.status || showStatusPicker || versionCount > 0 || currentNode.id) && (
          <div className="flex items-center gap-2 text-xs text-gray-600">
            {isEditMode ? (
              isHeaderCodeEditing ? (
                <Input
                  value={codeDraft}
                  onChange={(e) => setCodeDraft(e.target.value)}
                  onBlur={() => setIsHeaderCodeEditing(false)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === 'Escape') {
                      event.preventDefault();
                      setIsHeaderCodeEditing(false);
                    }
                  }}
                  autoFocus
                  className="h-6 w-36 bg-white px-2 text-[11px]"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setIsHeaderCodeEditing(true)}
                  className="h-6 rounded border border-gray-300 bg-white px-2 text-[11px] text-gray-700 hover:bg-gray-50"
                  title="Click to edit code"
                >
                  {codeDraft.trim() || currentNode.id}
                </button>
              )
            ) : (
              <span className="h-6 rounded border border-gray-300 bg-white px-2 text-[11px] text-gray-700">
                {currentNode.id}
              </span>
            )}
            {showStatusPicker ? (
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-gray-500">Select:</span>
                {(['tackling', 'grasped', 'learned'] as NodeStatus[]).map(status => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => handleStatusChange(status)}
                    className="h-4 w-4 rounded-full border border-gray-300"
                    style={{ backgroundColor: getStatusColor(status) }}
                    title={`Set status to ${status}`}
                    aria-label={`Set status to ${status}`}
                  />
                ))}
              </div>
            ) : nodeProgress?.status && nodeProgress.status !== 'fresh' ? (
              <button
                type="button"
                onClick={() => setShowStatusPicker(true)}
                className="flex items-center gap-1 text-[11px] font-semibold text-gray-700 bg-gray-100 rounded px-2 py-0.5"
                title="Change status"
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: getStatusColor(nodeProgress.status) }}
                />
                <span className="capitalize">{nodeProgress.status}</span>
              </button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs px-1"
                onClick={() => setShowStatusPicker(true)}
              >
                Set status
              </Button>
            )}
            {nodeProgress?.nextReview && (
              <span
                className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${nodeProgress.isDue ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-600'}`}
              >
                {formatNextReview(nodeProgress.nextReview)}
              </span>
            )}
            {versionCount > 0 && (
              <div className="ml-auto flex items-center gap-1">
                {!isEditMode && versionCount > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDetachVersion}
                    disabled={isDetaching || versionCount < 2 || !canEdit}
                    className="h-6 px-2 text-[11px]"
                    title={
                      !canEdit
                        ? 'Only domain owners or editors can detach versions'
                        : 'Detach this version into a new node'
                    }
                  >
                    {isDetaching ? 'Detaching…' : 'Detach'}
                  </Button>
                )}
                <VersionHeaderControls
                  index={versionIndex}
                  count={versionCount}
                  onPrevious={handlePrevVersion}
                  onNext={handleNextVersion}
                  onAdd={isEditMode && canEdit ? handleAddVersion : undefined}
                  onDelete={isEditMode && canEdit ? handleDeleteActiveVersion : undefined}
                  addDisabled={isVersionUpdating}
                  deleteDisabled={isVersionUpdating || versionCount <= 1}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 pt-3">
        {shouldHideContent && !isEditMode ? (
          <div className="text-center py-10">
            <Eye size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 mb-2">This node is currently being reviewed</p>
            <p className="text-sm text-gray-500">
              Click &quot;Show Answer&quot; in the review window to reveal the content
            </p>
          </div>
        ) : isEditMode ? (
          nodeDetails ? (
            currentNode.type === 'definition' ? (
              <MetaDefinitionEditForm
                ref={definitionEditFormRef}
                meta={metaDetails as MetaDefinition}
                codeDraft={codeDraft}
                initialActiveIndex={selectedDefinitionIndex}
                onVersionDirtyChange={setIsActiveVersionDirty}
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
                onUpdateMeta={async (payload) => {
                  if (!metaDetails) return;
                  const prevCode = metaDetails.code;
                  const updated = await updateMetaDefinition(metaDetails.id, payload);

                  // Re-fetch full meta with versions to avoid losing versions in state
                  const fresh = await getMetaDefinition(metaDetails.id);
                  setMetaDetails(fresh);

                  // Update current node identity (code/name) so header and future loads are correct
                  const updatedNode = { ...currentNode, id: updated.code, name: updated.name };
                  setCurrentNode(updatedNode);
                  // Update window title immediately (and keep window nodeData in sync)
                  ui.updateWindow(windowId, { title: updated.name, contentProps: { nodeData: updatedNode } });

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
                onBack={() => {
                  setIsEditMode(false);
                  setActiveTab('details');
                }}
              />
            ) : (
              <MetaExerciseEditForm
                ref={exerciseEditFormRef}
                meta={metaDetails as any}
                codeDraft={codeDraft}
                initialActiveIndex={selectedVersionIndex}
                onVersionDirtyChange={setIsActiveVersionDirty}
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
                onUpdateMeta={async (payload) => {
                  if (!metaDetails) return;
                  const prevCode = metaDetails.code;
                  const updated = await updateMetaExercise(metaDetails.id, payload);

                  // Re-fetch full meta with versions to avoid losing versions in state
                  const fresh = await getMetaExercise(metaDetails.id);
                  setMetaDetails(fresh);

                  // Update current node identity (code/name) so header and future loads are correct
                  const updatedNode = { ...currentNode, id: updated.code, name: updated.name };
                  setCurrentNode(updatedNode);

                  // Update window title immediately (and keep window nodeData in sync)
                  ui.updateWindow(windowId, { title: updated.name, contentProps: { nodeData: updatedNode } });

                  // If code changed, force a full graph refresh to rebuild code-indexed maps and links
                  if (updated.code !== prevCode) {
                    showToast('Exercise code updated. Refreshing graph…', 'success');
                    onRefresh?.();
                    return;
                  }

                  // Keep nodeDetails in sync for current view (surgical)
                  setNodeDetails(prev => prev ? { ...prev, code: updated.code, name: updated.name } as any : prev);

                  // Clamp selected version index to available range
                  const maxIndex = Math.max(0, (fresh.versions?.length || 1) - 1);
                  setSelectedVersionIndex(i => Math.max(0, Math.min(i, maxIndex)));

                  // Notify parent for surgical update so labels/left panel update without a full graph rebuild
                  onUpdateNodeData?.(updated.code, {
                    code: updated.code,
                    name: updated.name,
                    prerequisites: fresh.prerequisites || [],
                    prerequisiteWeights: fresh.prerequisiteWeights || {},
                    xPosition: fresh.xPosition,
                    yPosition: fresh.yPosition,
                    domainId: fresh.domainId,
                    id: fresh.id,
                    type: 'exercise',
                  } as any);
                }}
                onBack={() => {
                  setIsEditMode(false);
                  setActiveTab('details');
                }}
              />
            )
          ) : (
            <div className="text-center py-5 text-gray-500">Loading details...</div>
          )
        ) : (
          <>
            {activeTab === 'details' && (
              <div className="mt-3 space-y-4">
                {showReminderForm && (
                  <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 space-y-2">
                    <div className="text-xs font-semibold text-amber-700">Reminder Quest</div>
                    <div>
                      <label className="text-xs text-gray-600">Title</label>
                      <Input
                        value={reminderTitle}
                        onChange={(e) => setReminderTitle(e.target.value)}
                        className="h-8 mt-1"
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-medium text-gray-600">Remind in:</span>
                      {[
                        { label: '15 min', minutes: 15 },
                        { label: '1 hour', minutes: 60 },
                        { label: '6 hours', minutes: 6 * 60 },
                        { label: '1 day', minutes: 24 * 60 },
                        { label: '1 week', minutes: 7 * 24 * 60 },
                      ].map(option => (
                        <Button
                          key={option.label}
                          size="sm"
                          variant="outline"
                          onClick={() => setReminderDraft(getReminderDraftFromOffsetMinutes(option.minutes))}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div>
                        <label className="text-xs text-gray-600">Due date</label>
                        <Input
                          type="date"
                          value={reminderDraft.date}
                          onChange={(e) => setReminderDraft(prev => ({ ...prev, date: e.target.value }))}
                          className="h-8 mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600">Due time</label>
                        <Input
                          type="time"
                          value={reminderDraft.time}
                          onChange={(e) => setReminderDraft(prev => ({ ...prev, time: e.target.value }))}
                          className="h-8 mt-1"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={handleCreateReminder}>
                        Remind Me
                      </Button>
                    </div>
                  </div>
                )}
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
                    statementImagePath={(nodeDetails as Exercise | null)?.statementImagePath}
                    descriptionImagePath={(nodeDetails as Exercise | null)?.descriptionImagePath}
                  />
                )}
              </div>
            )}

            {activeTab === 'advanced' && (
              <div className="mt-3 space-y-4">
                {(currentNode.type === 'exercise' || currentNode.type === 'definition') && (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-gray-800">Prerequisites</div>
                    {currentNode.type === 'exercise' ? (
                      numericId && domainData?.id ? (
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
                      )
                    ) : (
                      numericId && domainData?.id ? (
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
                      )
                    )}
                  </div>
                )}

                <div className="space-y-2">
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
              </div>
            )}

            {activeTab === 'statistics' && (
              <div className="mt-3 space-y-3">
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
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
