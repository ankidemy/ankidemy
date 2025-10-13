// File: src/app/components/Graph/details/ExerciseView.tsx
"use client";

import React, { useState } from 'react';
import { Button } from "@/app/components/core/button";
import { Card, CardContent } from "@/app/components/core/card";
import { MathText, InlineMath } from '@/app/components/core/MathJaxWrapper';
import { Exercise, AnswerFeedback } from '../utils/types';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { NodeStatus } from '@/types/srs';

interface ExerciseViewProps {
  exercise: Exercise;
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
  onNavigateToNode: (nodeId: string) => void;
  availableDefinitions?: { code: string; name: string }[];
  srsStatus?: NodeStatus;
  onAnotherVersion?: () => void;
}

const ExerciseView: React.FC<ExerciseViewProps> = ({
  exercise,
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
  onNavigateToNode,
  availableDefinitions = [],
  srsStatus,
  onAnotherVersion,
}) => {
  const [showNotes, setShowNotes] = useState(false);
  const canReview = srsStatus === 'grasped' || srsStatus === 'learned';

  const qualityRatingButtons = [
    { label: 'Again', value: 'again', color: 'bg-red-50 hover:bg-red-100 border-red-200 text-red-700' },
    { label: 'Hard', value: 'hard', color: 'bg-orange-50 hover:bg-orange-100 border-orange-200 text-orange-700' },
    { label: 'Good', value: 'good', color: 'bg-green-50 hover:bg-green-100 border-green-200 text-green-700' },
    { label: 'Easy', value: 'easy', color: 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700' },
  ] as const;

  const getPrerequisiteDisplayText = (prereqCode: string): string => {
    const prereqDef = availableDefinitions.find(def => def.code === prereqCode);
    return prereqDef ? `${prereqCode}: ${prereqDef.name}` : prereqCode;
  };

  return (
    <>
      <div>
        <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">Problem Statement</h4>
        <Card className="bg-gray-50 border shadow-sm">
          <CardContent className="p-3 text-sm">
            {exercise.statement && exercise.statement.trim().length > 0 ? (
              <MathText className="whitespace-pre-wrap" text={exercise.statement} />
            ) : (
              <span className="text-gray-400 italic">N/A</span>
            )}
          </CardContent>
        </Card>
      </div>

      {exercise.hints && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider">Hints</h4>
            <Button variant="ghost" size="sm" onClick={onToggleHints} className="h-6 text-xs px-1">
              {showHints ? 'Hide' : 'Show'}
            </Button>
          </div>
          {showHints && (
            <Card className="bg-yellow-50 border border-yellow-200 shadow-sm">
              <CardContent className="p-3 text-sm">
                <MathText className="whitespace-pre-wrap" text={exercise.hints} />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div>
        <div className="flex justify-between items-center mb-1">
          <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider">Solution</h4>
          <Button variant="ghost" size="sm" onClick={onToggleSolution} className="h-6 text-xs px-1">
            {showSolution ? 'Hide' : 'Show'}
          </Button>
        </div>
        {showSolution && (
          <Card className="bg-green-50 border border-green-200 shadow-sm">
            <CardContent className="p-3 text-sm">
              {exercise.description && exercise.description.trim().length > 0 ? (
                <MathText className="whitespace-pre-wrap" text={exercise.description} />
              ) : (
                <span className="text-gray-400 italic">N/A</span>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {exercise.notes && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider">Notes</h4>
            <Button variant="ghost" size="sm" onClick={() => setShowNotes(!showNotes)} className="h-6 text-xs px-1 flex items-center">
              {showNotes ? <ChevronUp size={12} className="mr-1" /> : <ChevronDown size={12} className="mr-1" />}
              {showNotes ? 'Hide' : 'Show'}
            </Button>
          </div>
          {showNotes && (
            <Card className="bg-blue-50 border border-blue-200 shadow-sm">
              <CardContent className="p-3 text-sm">
                <MathText className="whitespace-pre-wrap" text={exercise.notes} />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div>
        <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">Your Answer</h4>
        <textarea
          className="w-full border border-gray-300 rounded p-2 h-20 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400 resize-y"
          placeholder="Enter your answer..."
          value={userAnswer}
          onChange={(e) => onUpdateAnswer(e.target.value)}
          disabled={exerciseAttemptCompleted && !showSolution}
        />
        {exercise.verifiable && !exerciseAttemptCompleted && (
          <div className="mt-1.5 flex justify-end">
            <Button size="sm" onClick={onVerifyAnswer} className="h-7 text-xs">Verify Answer</Button>
          </div>
        )}
        {answerFeedback && (
          <div className={`mt-2 p-2 text-xs rounded border ${answerFeedback.correct ? 'bg-green-100 text-green-800 border-green-300' : 'bg-red-100 text-red-800 border-red-300'}`}>
            {answerFeedback.message}
          </div>
        )}
      </div>

      {(exerciseAttemptCompleted || showSolution) && (
        <div className="mt-3">
          <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">Rate Your Understanding</h4>
          <div className="grid grid-cols-2 gap-1.5">
            {qualityRatingButtons.map((btn) => (
              <Button
                key={btn.value}
                variant="outline"
                size="sm"
                className={`h-7 px-2 text-xs ${btn.color} ${!canReview ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => onRateExercise(btn.value)}
                disabled={!canReview}
                title={!canReview ? "Mark as 'Grasped' or 'Learned' to enable review" : `Rate as ${btn.label}`}
              >
                {btn.label}
              </Button>
            ))}
          </div>
          {onAnotherVersion && (
            <div className="mt-2 flex justify-end">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onAnotherVersion}>Another problem</Button>
            </div>
          )}
        </div>
      )}

      <div>
        <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1 mt-3">Related Concepts</h4>
        {exercise.prerequisites?.length ? (
          <div className="flex flex-wrap gap-1">
            {exercise.prerequisites.map((prereqCode) => (
              <Button
                key={prereqCode}
                variant="outline"
                size="sm"
                onClick={() => onNavigateToNode(prereqCode)}
                className="h-6 text-xs px-1.5 bg-blue-50 hover:bg-blue-100 border-blue-200"
                title={`Navigate to ${prereqCode}`}
              >
                <span className="truncate max-w-[220px] inline-block align-middle">
                  <InlineMath text={getPrerequisiteDisplayText(prereqCode)} />
                </span>
              </Button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">None</p>
        )}
      </div>
    </>
  );
};

export default ExerciseView;
