// File: src/app/components/Graph/details/ExerciseView.tsx
"use client";

import React, { useState } from 'react';
import { Button } from "@/app/components/core/button";
import { Card, CardContent } from "@/app/components/core/card";
import { MarkdownKatex, InlineMarkdownKatex } from '@/app/components/core/MarkdownKatex';
import { Exercise, AnswerFeedback } from '../utils/types';
import ZoomableImage from '../components/ZoomableImage';
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
  availableExercises?: { code: string; name: string }[];
  definitionPrerequisites?: string[];
  exercisePrerequisites?: string[];
  srsStatus?: NodeStatus;
  statementImagePath?: string;
  descriptionImagePath?: string;
}

const ExerciseViewContent: React.FC<ExerciseViewProps> = ({
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
  availableExercises = [],
  definitionPrerequisites,
  exercisePrerequisites,
  srsStatus,
  statementImagePath,
  descriptionImagePath,
}) => {
  const [showNotes, setShowNotes] = useState(false);
  const [answerPreview, setAnswerPreview] = useState(false);
  const [showAnswerSection, setShowAnswerSection] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const canReview = srsStatus === 'grasped' || srsStatus === 'learned';

  const qualityRatingButtons = [
    { label: 'Again', value: 'again', color: 'bg-red-50 hover:bg-red-100 border-red-200' },
    { label: 'Hard', value: 'hard', color: 'bg-orange-50 hover:bg-orange-100 border-orange-200' },
    { label: 'Good', value: 'good', color: 'bg-green-50 hover:bg-green-100 border-green-200' },
    { label: 'Easy', value: 'easy', color: 'bg-blue-50 hover:bg-blue-100 border-blue-200' },
  ] as const;

  const getPrerequisiteDisplayText = (prereqCode: string): string => {
    const prereqDef = availableDefinitions.find(def => def.code === prereqCode);
    return prereqDef ? prereqDef.name : prereqCode;
  };

  const getExercisePrerequisiteDisplayText = (prereqCode: string): string => {
    const prereqEx = availableExercises.find(ex => ex.code === prereqCode);
    return prereqEx ? prereqEx.name : prereqCode;
  };

  const definitionPrereqs = definitionPrerequisites ?? exercise.prerequisites ?? [];
  const exercisePrereqs = exercisePrerequisites ?? [];

  return (
    <>
      <div>
        <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">Problem Statement</h4>
        <Card className="bg-gray-50 border shadow-sm">
          <CardContent className="p-3 text-sm">
            {exercise.statement && exercise.statement.trim().length > 0 ? (
              <MarkdownKatex className="whitespace-pre-wrap">{exercise.statement}</MarkdownKatex>
            ) : (
              <span className="text-gray-400 italic">N/A</span>
            )}
            {statementImagePath && (
              <div className="mt-2">
                <ZoomableImage src={statementImagePath} alt="Statement image" />
              </div>
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
                <MarkdownKatex className="whitespace-pre-wrap">{exercise.hints}</MarkdownKatex>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1">
          <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider">Try to answer</h4>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-1"
            onClick={() => {
              setShowAnswerSection(v => {
                const next = !v;
                if (!next) setAnswerPreview(false);
                return next;
              });
            }}
          >
            {showAnswerSection ? 'Hide' : 'Show'}
          </Button>
        </div>

        {showAnswerSection && (
          <>
            <div className="flex items-center justify-between mb-1">
              <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider">Write Your Answer</h4>
              {!exercise.verifiable && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs px-1"
                  onClick={() => setAnswerPreview(v => !v)}
                >
                  {answerPreview ? 'Edit' : 'Preview'}
                </Button>
              )}
            </div>

            {(!answerPreview || exercise.verifiable) ? (
              <textarea
                className="w-full border border-gray-300 rounded p-2 h-20 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400 resize-y"
                placeholder="Enter your answer..."
                value={userAnswer}
                onChange={(e) => onUpdateAnswer(e.target.value)}
                disabled={exerciseAttemptCompleted && !showSolution}
              />
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded p-2 text-sm">
                {userAnswer?.trim() ? (
                  <MarkdownKatex className="whitespace-pre-wrap">{userAnswer}</MarkdownKatex>
                ) : (
                  <span className="text-gray-400 italic">Nothing to preview</span>
                )}
              </div>
            )}

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
          </>
        )}
      </div>

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
                  <MarkdownKatex className="whitespace-pre-wrap">{exercise.description}</MarkdownKatex>
                ) : (
                  <span className="text-gray-400 italic">N/A</span>
                )}
                {descriptionImagePath && (
                  <div className="mt-2">
                    <ZoomableImage src={descriptionImagePath} alt="Solution image" />
                  </div>
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
                <MarkdownKatex className="whitespace-pre-wrap">{exercise.notes}</MarkdownKatex>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {(exerciseAttemptCompleted || showSolution) && (
        <div className="mt-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider">Rate Understanding</h4>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs px-1"
              onClick={() => setShowRating(v => !v)}
              disabled={!canReview}
              title={!canReview ? "Mark as 'Grasped' or 'Learned' to enable review" : "Rate your understanding"}
            >
              {showRating ? 'Hide' : 'Rate'}
            </Button>
          </div>
          {showRating && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {qualityRatingButtons.map((btn) => (
                <Button
                  key={btn.value}
                  variant="outline"
                  size="sm"
                  className={`h-6 px-2 text-xs ${btn.color} ${!canReview ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => onRateExercise(btn.value)}
                  disabled={!canReview}
                  title={!canReview ? "Mark as 'Grasped' or 'Learned' to enable review" : `Rate as ${btn.label}`}
                >
                  {btn.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1 mt-3">Prerequisites</h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Definitions</div>
            {definitionPrereqs.length ? (
              <div className="flex flex-wrap gap-1">
                {definitionPrereqs.map((prereqCode) => (
                  <Button
                    key={prereqCode}
                    variant="outline"
                    size="sm"
                    onClick={() => onNavigateToNode(prereqCode)}
                    className="h-6 text-xs px-1.5 bg-blue-50 hover:bg-blue-100 border-blue-200"
                    title={`Navigate to ${getPrerequisiteDisplayText(prereqCode)}`}
                  >
                    <span className="truncate max-w-[220px] inline-block align-middle">
                      <InlineMarkdownKatex className="pointer-events-none">
                        {getPrerequisiteDisplayText(prereqCode)}
                      </InlineMarkdownKatex>
                    </span>
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">None</p>
            )}
          </div>
          <div>
            <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Exercises</div>
            {exercisePrereqs.length ? (
              <div className="flex flex-wrap gap-1">
                {exercisePrereqs.map((prereqCode) => (
                  <Button
                    key={prereqCode}
                    variant="outline"
                    size="sm"
                    onClick={() => onNavigateToNode(prereqCode)}
                    className="h-6 text-xs px-1.5 bg-orange-50 hover:bg-orange-100 border-orange-200"
                    title={`Navigate to ${getExercisePrerequisiteDisplayText(prereqCode)}`}
                  >
                    <span className="truncate max-w-[220px] inline-block align-middle">
                      <InlineMarkdownKatex className="pointer-events-none">
                        {getExercisePrerequisiteDisplayText(prereqCode)}
                      </InlineMarkdownKatex>
                    </span>
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">None</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

const ExerciseView: React.FC<ExerciseViewProps> = (props) => {
  return <ExerciseViewContent key={props.exercise.id} {...props} />;
};

export default ExerciseView;
