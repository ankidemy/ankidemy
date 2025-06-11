"use client";

import React from 'react';
import { Button } from "@/app/components/core/button";
import { ArrowLeft, Edit, X, Eye } from 'lucide-react';
import { GraphNode, Definition, Exercise, AnswerFeedback } from '../utils/types';
import DefinitionView from '../details/DefinitionView';
import ExerciseView from '../details/ExerciseView';
import NodeEditForm from '../details/NodeEditForm';

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
  
  // Definition view props
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
  
  // Exercise view props
  showSolution: boolean;
  onToggleSolution: () => void;
  showHints: boolean;
  onToggleHints: () => void;
  userAnswer: string;
  onUpdateAnswer: (answer: string) => void;
  answerFeedback: AnswerFeedback | null;
  onVerifyAnswer: () => void;
  
  // Common props
  personalNotes: Record<string, string>;
  onUpdateNotes: (nodeId: string, notes: string) => void;
  
  // Edit form props
  availableDefinitions: GraphNode[];
  onSubmitEdit: () => void;
}

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
  
  // Definition view props
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
  
  // Exercise view props
  showSolution,
  onToggleSolution,
  showHints,
  onToggleHints,
  userAnswer,
  onUpdateAnswer,
  answerFeedback,
  onVerifyAnswer,
  
  // Common props
  personalNotes,
  onUpdateNotes,
  
  // Edit form props
  availableDefinitions,
  onSubmitEdit
}) => {
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

  return (
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
                onClick={onNavigateBack}
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
              onClick={onToggleEditMode}
              className="h-8 w-8 mr-1"
              title={isEditMode ? "View Mode" : "Edit Mode"}
            >
              <Edit size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
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
          <NodeEditForm
            selectedNode={selectedNode}
            selectedNodeDetails={selectedNodeDetails}
            availableDefinitions={availableDefinitions}
            hasMultipleDescriptions={hasMultipleDescriptions}
            currentDescription={currentDescription}
            totalDescriptions={totalDescriptions}
            selectedDefinitionIndex={selectedDefinitionIndex}
            onCancel={onToggleEditMode}
            onSubmit={onSubmitEdit}
          />
        ) : selectedNodeDetails ? (
          selectedNodeDetails.type === 'definition' ? (
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
              personalNotes={personalNotes[selectedNode.id] || ''}
              onUpdateNotes={(notes) => onUpdateNotes(selectedNode.id, notes)}
              onReview={onReviewDefinition}
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
              onNavigateToNode={onNavigateToNode}
              personalNotes={personalNotes[selectedNode.id] || ''}
              onUpdateNotes={(notes) => onUpdateNotes(selectedNode.id, notes)}
            />
          )
        ) : null}
      </div>
    </div>
  );
};

export default RightPanel;
