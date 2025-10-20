// client/src/app/components/Graph/windows/DetailWindowContent.tsx
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/app/components/core/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/app/components/core/tabs";
import { ArrowLeft, Edit, Eye, ChevronDown, ChevronUp } from 'lucide-react';
import { GraphNode, Definition, Exercise, AnswerFeedback } from '../utils/types';
import DefinitionView from '../details/DefinitionView';
import ExerciseView from '../details/ExerciseView';
import NodeEditForm from '../details/NodeEditForm';
import PrerequisitesPanel from '../details/PrerequisitesPanel';
import MetaExerciseEditForm from '../details/MetaExerciseEditForm';
import MetaExerciseVersionsViewer from '../details/MetaExerciseVersionsViewer';
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
  getNextMetaExerciseVersion,
  addMetaExerciseVersion,
  updateMetaExerciseVersion,
  deleteMetaExerciseVersion,
  updateMetaExercise,
  Definition as ApiDefinition,
  Exercise as ApiExercise,
  MetaExercise,
  ExerciseVersion
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
}) => {
  const srs = useSRS();
  const ui = useUI();
  
  // Local state for this window
  const [nodeHistory, setNodeHistory] = useState<GraphNode[]>([]);
  const [currentNode, setCurrentNode] = useState<GraphNode>(initialNodeData);
  const [nodeDetails, setNodeDetails] = useState<Definition | Exercise | null>(null);
  const [metaDetails, setMetaDetails] = useState<MetaExercise | null>(null);
  const [currentVersion, setCurrentVersion] = useState<ExerciseVersion | null>(null);
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

  // Review history state
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<SRSReviewHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Load node details
  const loadNodeDetails = useCallback(async (node: GraphNode) => {
    setIsLoading(true);
    try {
      let details;
      if (node.type === 'definition') {
        const res = await getDefinitionByCode(node.id, { domainId: domainData?.id });
        details = Array.isArray(res) ? res[0] : res;
      } else {
        // Load meta-exercise by numeric id and fetch a suggested version
        const mid = codeToNumericIdMap.get(node.id);
        if (!mid) throw new Error('Missing numeric id for meta exercise');
        const meta = await getMetaExercise(mid);
        setMetaDetails(meta);
        const ver = await getNextMetaExerciseVersion(mid);
        setCurrentVersion(ver as any);
        details = { ...(ver as any), id: ver.id, code: meta.code, name: meta.name, type: 'exercise' } as Exercise;
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
  }, [graphData, domainData?.id]);

  // Initialize with first node
  useEffect(() => {
    loadNodeDetails(currentNode);
  }, [loadNodeDetails, currentNode]);

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
      title: `${newNode.id}: ${newNode.name}`,
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
      title: `${previousNode.id}: ${previousNode.name}`,
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
    
    const qualityMap = { again: 0, hard: 1, good: 4, easy: 5 };
    await srs.submitReview({
      nodeId: numericId,
      nodeType: 'definition',
      success: qualityMap[quality] >= 3,
      quality: qualityMap[quality] as any,
      timeTaken: 0,
      sessionId: srs.state.currentSession?.id,
    });
    
    showToast(`Definition reviewed as ${quality}`, 'success');
  }, [numericId, srs]);

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

  // Robust domain ownership check (handles type mismatches and missing data)
  const isDomainOwner = useCallback(() => {
    const ownerId = domainData?.ownerId;
    const userId = currentUser?.id;
    if (ownerId == null || userId == null) {
      // If we cannot determine yet, don't block UI; server will enforce auth
      return true;
    }
    return Number(ownerId) === Number(userId);
  }, [domainData?.ownerId, currentUser?.id]);

  // Edit mode toggle
  const toggleEditMode = useCallback(() => {
    if (!isDomainOwner()) {
      showToast('You can only edit nodes in domains you own', 'warning');
      return;
    }
    setIsEditMode(!isEditMode);
  }, [isDomainOwner, isEditMode]);

  // ENHANCED: Surgical edit submission with fallback
  const handleSubmitEdit = useCallback(async () => {
    if (!nodeDetails) return;
    
    // Check domain ownership (client-side hint; server enforces auth)
    if (!isDomainOwner()) {
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
          title: `${updatedCurrentNode.id}: ${updatedCurrentNode.name}`,
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
    const detail = nodeDetails as Definition;
    if (!detail || !('description' in detail)) return false;
    return (Array.isArray(detail.description) && detail.description.length > 1) || 
           String(detail.description).includes('|||');
  };

  const totalDescriptionsCount = () => {
    const detail = nodeDetails as Definition;
    if (!detail || !('description' in detail)) return 0;
    if (Array.isArray(detail.description)) return detail.description.length;
    return String(detail.description).split('|||').length;
  };

  const currentDescriptionText = () => {
    const detail = nodeDetails as Definition;
    if (!detail || !('description' in detail)) return '';
    if (Array.isArray(detail.description)) return detail.description[selectedDefinitionIndex] || '';
    return String(detail.description).split('|||')[selectedDefinitionIndex] || '';
  };

  const availableDefinitions = graphData?.definitions ? 
    Object.values(graphData.definitions).map((def: any) => ({
      code: def.code,
      name: def.name,
      numericId: codeToNumericIdMap.get(def.code),
    })).filter((d: any) => d.numericId != null) : [];

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
        {nodeHistory.length > 0 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={navigateBack}
            className="h-8 w-8"
            title="Go back"
          >
            <ArrowLeft size={16} />
          </Button>
        )}
        <h3 className="flex-1 font-semibold text-base truncate">
          <InlineMarkdownKatex>{`${currentNode.id}: ${currentNode.name}`}</InlineMarkdownKatex>
        </h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleEditMode}
          className="h-8 w-8"
          title={isEditMode ? "View Mode" : "Edit Mode"}
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
              <form onSubmit={(e) => { e.preventDefault(); handleSubmitEdit(); }}>
                <NodeEditForm
                  selectedNode={currentNode}
                  selectedNodeDetails={nodeDetails}
                  availableDefinitionsForEdit={availableDefinitions}
                  hasMultipleDescriptions={hasMultipleDescriptions()}
                  currentDescription={currentDescriptionText()}
                  totalDescriptions={totalDescriptionsCount()}
                  selectedDefinitionIndex={selectedDefinitionIndex}
                  onCancel={() => setIsEditMode(false)}
                  onSubmit={handleSubmitEdit}
                />
              </form>
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
                  setMetaDetails(updated);
                  // Update window title and node details
                  setNodeDetails(prev => prev ? { ...prev, code: updated.code, name: updated.name } : prev);
                  ui.updateWindow(windowId, {
                    title: `${updated.code}: ${updated.name}`,
                  });
                  // Surgical update for graph
                  onUpdateNodeData?.(updated.code, {
                    code: updated.code,
                    name: updated.name,
                    prerequisites: updated.prerequisites || [],
                    prerequisiteWeights: updated.prerequisiteWeights || {},
                    xPosition: updated.xPosition,
                    yPosition: updated.yPosition,
                  } as any);
                }}
                onBack={() => setIsEditMode(false)}
              />
            )
          ) : (
            <div className="text-center py-5 text-gray-500">Loading details...</div>
          )
        ) : (
          <Tabs defaultValue="details" className="w-full">
            <TabsList className={`grid w-full ${currentNode.type === 'exercise' ? 'grid-cols-4' : 'grid-cols-3'} h-9`}>
              <TabsTrigger value="details" className="text-sm h-8">Details</TabsTrigger>
              {currentNode.type === 'exercise' && (
                <TabsTrigger value="versions" className="text-sm h-8">Versions</TabsTrigger>
              )}
              {currentNode.type === 'exercise' && (
                <TabsTrigger value="prerequisites" className="text-sm h-8">Prerequisites</TabsTrigger>
              )}
              {currentNode.type === 'definition' && (
                <TabsTrigger value="prerequisites" className="text-sm h-8">Prerequisites</TabsTrigger>
              )}
              <TabsTrigger value="srs" className="text-sm h-8">SRS Progress</TabsTrigger>
            </TabsList>
            {currentNode.type === 'exercise' && (
              <TabsContent value="versions" className="mt-3">
                {metaDetails ? (
                  <MetaExerciseVersionsViewer
                    meta={metaDetails}
                    activeIndex={selectedVersionIndex}
                    setActiveIndex={setSelectedVersionIndex}
                    isOwner={isDomainOwner()}
                    onEditVersion={isDomainOwner() ? (index) => {
                      setSelectedVersionIndex(index);
                      setIsEditMode(true);
                    } : undefined}
                  />
                ) : (
                  <div className="text-center py-5 text-gray-500">Loading versions…</div>
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
                    nodeType={'definition'}
                    availableDefinitions={availableDefinitions}
                    allowKinds={['definition']}
                    onChanged={async () => {
                      // Surgical update for definition prerequisites:
                      // 1) Fetch fresh definition (for name/positions)
                      // 2) Fetch domain prerequisites, filter this node's definition prereqs
                      // 3) Map numeric IDs -> codes and build weights map
                      // 4) Emit onUpdateNodeData with updated prerequisites only (no full refresh)
                      try {
                        const [rawDef, prereqRows] = await Promise.all([
                          getDefinitionByCode(currentNode.id, { domainId: domainData.id }),
                          getDomainPrerequisites(domainData.id),
                        ]);

                        const fresh = Array.isArray(rawDef) ? rawDef[0] : rawDef;
                        if (!fresh) return;

                        // Build numericId -> code map from availableDefinitions (authoritative in UI)
                        const idToCode = new Map<number, string>();
                        availableDefinitions.forEach(d => { if (typeof d.numericId === 'number') idToCode.set(d.numericId, d.code); });

                        // Filter rows for this definition node and prerequisiteType 'definition'
                        const myRows = prereqRows.filter(r => r.nodeId === numericId && r.nodeType === 'definition' && r.prerequisiteType === 'definition');
                        const prerequisiteCodes: string[] = [];
                        const prerequisiteWeights: Record<string, number> = {};
                        myRows.forEach(r => {
                          const code = idToCode.get(r.prerequisiteId);
                          if (code) {
                            prerequisiteCodes.push(code);
                            prerequisiteWeights[code] = r.weight || 1.0;
                          }
                        });

                        const enriched = {
                          ...fresh,
                          type: 'definition',
                          prerequisites: prerequisiteCodes,
                          prerequisiteWeights,
                        } as Definition;

                        setNodeDetails(enriched);
                        onUpdateNodeData?.(fresh.code, enriched as any);
                      } catch (e) {
                        console.warn('Failed to surgically update definition prerequisites; falling back to refresh.', e);
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
                <DefinitionView
                  definition={nodeDetails as Definition}
                  mode="practice" // Always show content in detail windows
                  showDefinition={showDefinition}
                  onToggleDefinition={() => setShowDefinition(!showDefinition)}
                  selectedDefinitionIndex={selectedDefinitionIndex}
                  totalDescriptions={totalDescriptionsCount()}
                  currentDescription={currentDescriptionText()}
                  onNavigatePrev={() => setSelectedDefinitionIndex(i => Math.max(0, i - 1))}
                  onNavigateNext={() => setSelectedDefinitionIndex(i => Math.min(totalDescriptionsCount() - 1, i + 1))}
                  relatedExercises={relatedExercises}
                  onNavigateToNode={navigateToNode}
                  onReview={handleReviewDefinition}
                  availableDefinitions={availableDefinitions.map((d: any) => ({
                    code: d.code,
                    name: d.name
                  }))}
                  srsStatus={nodeProgress?.status}
                />
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
                  srsStatus={nodeProgress?.status}
                  onAnotherVersion={handleAnotherVersion}
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
          </Tabs>
        )}
      </div>
    </div>
  );
};
