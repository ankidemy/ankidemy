"use client";

import React from 'react';
import { Button } from "@/app/components/core/button";
import { Card, CardContent } from "@/app/components/core/card";
import { MathJaxContent } from '@/app/components/core/MathJaxWrapper';
import { Exercise, AnswerFeedback } from '../utils/types';

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
  onNavigateToNode: (nodeId: string) => void;
  personalNotes: string;
  onUpdateNotes: (notes: string) => void;
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
  onNavigateToNode,
  personalNotes,
  onUpdateNotes
}) => {
  return (
    <>
      <div>
        <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">Problem Statement</h4>
        <Card className="bg-gray-50 border shadow-sm">
          <CardContent className="p-3 text-sm">
            <MathJaxContent>
              {exercise.statement || <span className="text-gray-400 italic">N/A</span>}
            </MathJaxContent>
          </CardContent>
        </Card>
      </div>

      {exercise.hints && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider">Hints</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleHints}
              className="h-6 text-xs px-1"
            >
              {showHints ? 'Hide' : 'Show'}
            </Button>
          </div>
          {showHints && (
            <Card className="bg-yellow-50 border border-yellow-200 shadow-sm">
              <CardContent className="p-3 text-sm">
                <MathJaxContent>{exercise.hints}</MathJaxContent>
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
            onClick={onToggleSolution}
            className="h-6 text-xs px-1"
          >
            {showSolution ? 'Hide' : 'Show'}
          </Button>
        </div>
        {showSolution && (
          <Card className="bg-green-50 border border-green-200 shadow-sm">
            <CardContent className="p-3 text-sm">
              <MathJaxContent>
                {exercise.description || <span className="text-gray-400 italic">N/A</span>}
              </MathJaxContent>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Exercise Notes */}
      {exercise.notes && (
        <div>
          <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">Notes</h4>
          <Card className="bg-blue-50 border border-blue-200 shadow-sm">
            <CardContent className="p-3 text-sm">
              <MathJaxContent>
                {exercise.notes}
              </MathJaxContent>
            </CardContent>
          </Card>
        </div>
      )}

      <div>
        <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">Your Answer</h4>
        <textarea
          className="w-full border border-gray-300 rounded p-2 h-20 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400 resize-y"
          placeholder="Enter your answer..."
          value={userAnswer}
          onChange={(e) => onUpdateAnswer(e.target.value)}
        />
        {exercise.verifiable && (
          <div className="mt-1.5 flex justify-end">
            <Button size="sm" onClick={onVerifyAnswer} className="h-7 text-xs">
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
        {exercise.prerequisites?.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {exercise.prerequisites.map(id => (
              <Button
                key={id}
                variant="outline"
                size="sm"
                onClick={() => onNavigateToNode(id)}
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

      {/* Personal Notes */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider">Personal Notes (Saved Locally)</h4>
          <div className="text-xs text-gray-500 italic">Auto-saving</div>
        </div>
        <textarea
          className="w-full border border-gray-300 rounded p-2 h-20 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
          placeholder="Add your personal notes here. These are stored in your browser only."
          value={personalNotes}
          onChange={(e) => onUpdateNotes(e.target.value)}
        />
      </div>
    </>
  );
};

export default ExerciseView;
