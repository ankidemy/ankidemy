// File: ./src/app/components/Graph/panels/RightPanel.tsx
"use client";

import React, { useState, useEffect } from 'react';
import { Button } from "@/app/components/core/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/app/components/core/tabs";
import { ArrowLeft, Edit, X, Eye, History, ChevronDown, ChevronUp } from 'lucide-react';
import { GraphNode, Definition, Exercise, AnswerFeedback } from '../utils/types';
import DefinitionView from '../details/DefinitionView';
import ExerciseView from '../details/ExerciseView';
import NodeEditForm from '../details/NodeEditForm';
import { useSRS } from '@/contexts/SRSContext';
import { NodeStatus, ReviewHistoryItem as SRSReviewHistoryItem, Quality } from '@/types/srs';
import StatusIndicator from '../components/StatusIndicator';
import ProgressDisplay from '../components/ProgressDisplay';
import { getReviewHistory } from '@/lib/srs-api';

interface AvailableDefinitionOptionForEdit {
  code: string;
  name: string;
  numericId: number;
}

interface RightPanelProps {
  isVisible: boolean;
  onToggle: () => void;
  selectedNode: GraphNode | null;
  selectedNodeDetails: Definition | Exercise | null;
  isEditMode: boolean;
  onToggleEditMode: () => void;
  mode: 'study' | 'practice';
  nodeHistory: string[];
  onNavigateBack: () => void;
  onNavigateToNode: (nodeId: string) => void;
  
  showDefinition: boolean;
  onToggleDefinition: () => void;
  hasMultipleDescriptions: boolean;
  totalDescriptions: number;
  selectedDefinitionIndex: number;
  currentDescription: string;
  onNavigatePrevDescription: () => void;
  onNavigateNextDescription: () => void;
  relatedExercises: string[];
  onReviewDefinition: (result: 'again' | 'hard' | 'good' | 'easy') => void;
  
  showSolution: boolean;
  onToggleSolution: () => void;
  showHints: boolean;
  onToggleHints: () => void;
  userAnswer: string;
  onUpdateAnswer: (answer: string) => void;
  answerFeedback: AnswerFeedback | null;
  onVerifyAnswer: () => void;
  onRateExercise: (qualityInput: 'again' | 'hard' | 'good' | 'easy') => void;
  exerciseAttemptCompleted: boolean;

  
  availableDefinitionsForEdit: AvailableDefinitionOptionForEdit[];
  onSubmitEdit: () => void;
  onStatusChange: (nodeId: string, status: NodeStatus) => Promise<void>;
  
  availableDefinitions: { code: string; name: string }[];
}

const ReviewHistory: React.FC<{nodeId: number, nodeType: 'definition' | 'exercise'}> = ({ nodeId, nodeType}) => {
  const [history, setHistory] = useState<SRSReviewHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const fetchHistory = async () => {
    if (!nodeId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getReviewHistory(nodeId, nodeType, 10);
      setHistory(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
      console.error("Error fetching review history:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (showHistory && nodeId) {
      fetchHistory();
    }
     if (!showHistory) {
        setHistory([]);
    }
  }, [showHistory, nodeId, nodeType]);

  return (
    <div className="mt-3">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowHistory(!showHistory)}
        className="w-full flex justify-between items-center text-xs h-7"
      >
        <span>Review History ({history.length > 0 ? history.length : isLoading ? 'Loading...' : '0'})</span>
        {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </Button>
      {showHistory && (
        <div className="mt-2 p-2 border rounded-md bg-gray-50 max-h-48 overflow-y-auto text-xs space-y-1.5">
          {isLoading && <p>Loading history...</p>}
          {error && <p className="text-red-500">{error}</p>}
          {!isLoading && !error && history.length === 0 && <p>No review history found.</p>}
          {history.map(item => (
            <div key={item.id} className={`p-1.5 rounded border-l-4 ${item.success ? 'border-green-400 bg-green-50' : 'border-red-400 bg-red-50'}`}>
              <p><strong>{new Date(item.reviewTime).toLocaleString()}</strong> - {item.success ? 'Success' : 'Fail'} (Q: {item.quality})</p>
              {item.intervalAfter !== undefined && <p className="text-gray-600">Interval: {item.intervalBefore?.toFixed(1)}d → {item.intervalAfter?.toFixed(1)}d</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const RightPanel: React.FC<RightPanelProps> = ({
  isVisible,
  onToggle,
  selectedNode,
  selectedNodeDetails,
  isEditMode,
  onToggleEditMode,
  mode,
  nodeHistory,
  onNavigateBack,
  onNavigateToNode,
  
  showDefinition,
  onToggleDefinition,
  hasMultipleDescriptions,
  totalDescriptions,
  selectedDefinitionIndex,
  currentDescription,
  onNavigatePrevDescription,
  onNavigateNextDescription,
  relatedExercises,
  onReviewDefinition,
  
  showSolution,
  onToggleSolution,
  showHints,
  onToggleHints,
  userAnswer,
  onUpdateAnswer,
  answerFeedback,
  onVerifyAnswer,
  onRateExercise, 
  exerciseAttemptCompleted,
  availableDefinitionsForEdit,
  onSubmitEdit,
  onStatusChange,
  availableDefinitions,
}) => {
  const srs = useSRS();
  const nodeProgress = selectedNode && selectedNodeDetails ? srs.getNodeProgress(selectedNodeDetails.id, selectedNode.type) : null;

  if (!isVisible || !selectedNode) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="text-center text-gray-500">
          <Eye size={24} className="mx-auto mb-2" />
          <p className="text-sm">Select a node to view details</p>
        </div>
      </div>
    );
  }
  
  const handleStatusSelection = async (status: NodeStatus) => {
    if (selectedNode && selectedNodeDetails) {
        await onStatusChange(selectedNodeDetails.id.toString(), status);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="border-b p-3 flex-shrink-0">
        <div className="flex justify-between items-center">
          <div className="flex items-center min-w-0 mr-2">
            {nodeHistory.length > 0 && (
              <Button variant="ghost" size="icon" onClick={onNavigateBack} className="mr-1 h-8 w-8 flex-shrink-0">
                <ArrowLeft size={16} />
              </Button>
            )}
            <h3 className="font-semibold text-base truncate flex-grow" title={`${selectedNode.id}: ${selectedNode.name}`}>
              {selectedNode.id}: {selectedNode.name}
            </h3>
          </div>
          <div className="flex flex-shrink-0">
            <Button variant="ghost" size="icon" onClick={onToggleEditMode} className="h-8 w-8 mr-1" title={isEditMode ? "View Mode" : "Edit Mode"}>
              <Edit size={16} />
            </Button>
            <Button variant="ghost" size="icon" onClick={onToggle} className="h-8 w-8" title="Close Panel">
              <X size={16} />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 text-sm">
        {!selectedNodeDetails && !isEditMode ? (
          <div className="text-center py-5 text-gray-500">Loading details...</div>
        ) : isEditMode ? (
          <NodeEditForm
            selectedNode={selectedNode}
            selectedNodeDetails={selectedNodeDetails}
            availableDefinitionsForEdit={availableDefinitionsForEdit}
            hasMultipleDescriptions={hasMultipleDescriptions}
            currentDescription={currentDescription}
            totalDescriptions={totalDescriptions}
            selectedDefinitionIndex={selectedDefinitionIndex}
            onCancel={onToggleEditMode}
            onSubmit={onSubmitEdit}
          />
        ) : selectedNodeDetails ? (
          <>
            <Tabs defaultValue="details" className="w-full">
              <TabsList className="grid w-full grid-cols-2 h-9">
                <TabsTrigger value="details" className="text-xs h-7">Details</TabsTrigger>
                <TabsTrigger value="srs" className="text-xs h-7">SRS Progress</TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="mt-3 space-y-4">
                {selectedNode.type === 'definition' ? (
                  <DefinitionView
                    definition={selectedNodeDetails as Definition}
                    mode={mode}
                    showDefinition={showDefinition}
                    onToggleDefinition={onToggleDefinition}
                    selectedDefinitionIndex={selectedDefinitionIndex}
                    totalDescriptions={totalDescriptions}
                    currentDescription={currentDescription}
                    onNavigatePrev={onNavigatePrevDescription}
                    onNavigateNext={onNavigateNextDescription}
                    relatedExercises={relatedExercises}
                    onNavigateToNode={onNavigateToNode}
                    onReview={onReviewDefinition}
                    availableDefinitions={availableDefinitions}
                    srsStatus={nodeProgress?.status}
                  />
                ) : (
                  <ExerciseView
                    exercise={selectedNodeDetails as Exercise}
                    showSolution={showSolution}
                    onToggleSolution={onToggleSolution}
                    showHints={showHints}
                    onToggleHints={onToggleHints}
                    userAnswer={userAnswer}
                    onUpdateAnswer={onUpdateAnswer}
                    answerFeedback={answerFeedback}
                    onVerifyAnswer={onVerifyAnswer}
                    onRateExercise={onRateExercise}
                    exerciseAttemptCompleted={exerciseAttemptCompleted}
                    onNavigateToNode={onNavigateToNode}
                    availableDefinitions={availableDefinitions}
                    srsStatus={nodeProgress?.status}
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
                    {(['fresh', 'tackling', 'grasped', 'learned'] as NodeStatus[]).map(statusValue => (
                      <Button
                        key={statusValue}
                        variant={nodeProgress?.status === statusValue ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleStatusSelection(statusValue)}
                        className="text-xs h-7 capitalize"
                        disabled={srs.state.loading}
                      >
                        {statusValue}
                      </Button>
                    ))}
                  </div>
                </div>
                <ProgressDisplay progress={nodeProgress} />
                {selectedNodeDetails?.id && (
                  <ReviewHistory nodeId={selectedNodeDetails.id} nodeType={selectedNode.type} />
                )}
              </TabsContent>
            </Tabs>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default RightPanel;
