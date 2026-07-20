// File: src/app/components/Graph/details/DefinitionView.tsx
"use client";

import React, { useState } from 'react';
import { Button } from "@/app/components/core/button";
import { Card, CardContent } from "@/app/components/core/card";
import { InlineMarkdownKatex, MarkdownKatex } from '@/app/components/core/MarkdownKatex';
import { AppMode, Definition } from '../utils/types';
import ZoomableImage from '../components/ZoomableImage';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { NodeStatus } from '@/types/srs';
import { formatNodeIdForDisplay } from '../utils/nodeIdDisplay';

interface DefinitionViewProps {
  definition: Definition;
  mode: AppMode;
  showDefinition: boolean;
  onToggleDefinition: () => void;
  selectedDefinitionIndex: number;
  totalDescriptions: number;
  currentDescription: string;
  currentPrompt?: string;
  currentNotes?: string;
  promptImagePath?: string;
  descriptionImagePath?: string;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  relatedExercises: string[];
  onNavigateToNode: (nodeId: string) => void;
  onReview: (result: 'again' | 'hard' | 'good' | 'easy') => void;
  availableDefinitions?: { code: string; name: string }[];
  availableExercises?: { code: string; name: string }[];
  srsStatus?: NodeStatus;
}

const DefinitionView: React.FC<DefinitionViewProps> = ({
  definition,
  mode,
  showDefinition,
  onToggleDefinition,
  selectedDefinitionIndex,
  totalDescriptions: _totalDescriptions,
  currentDescription,
  currentPrompt,
  currentNotes,
  promptImagePath,
  descriptionImagePath,
  onNavigatePrev: _onNavigatePrev,
  onNavigateNext: _onNavigateNext,
  relatedExercises,
  onNavigateToNode,
  onReview,
  availableDefinitions = [],
  availableExercises = [],
  srsStatus,
}) => {
  const [showNotes, setShowNotes] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const canReview = srsStatus === 'grasped' || srsStatus === 'learned';

  const getPrerequisiteDisplayText = (prereqCode: string): string => {
    const prereqDef = availableDefinitions.find(def => def.code === prereqCode);
    return prereqDef ? prereqDef.name : formatNodeIdForDisplay(prereqCode);
  };

  const getRelatedExerciseDisplayText = (exerciseCode: string): string => {
    const exercise = availableExercises.find(ex => ex.code === exerciseCode);
    return exercise ? exercise.name : formatNodeIdForDisplay(exerciseCode);
  };

  // Reset collapsibles when version index changes (hide by default)
  React.useEffect(() => {
    setShowDescription(false);
    setShowNotes(false);
    setShowRating(false);
  }, [selectedDefinitionIndex]);

  return (
    <>
      <div>
        <div className="flex justify-between items-center mb-1">
          <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider">Prompt</h4>
          {mode === 'study' && (
            <Button variant="ghost" size="sm" onClick={onToggleDefinition} className="h-6 text-xs px-1">
              {showDefinition ? 'Hide' : 'Show'}
            </Button>
          )}
        </div>
        {(showDefinition || mode !== 'study') && (
          <Card className="bg-gray-50 border shadow-sm">
            <CardContent className="p-3 text-sm">
              {currentPrompt && currentPrompt.trim().length > 0 ? (
                <MarkdownKatex key={`prompt-${selectedDefinitionIndex}`} className="whitespace-pre-wrap">{currentPrompt}</MarkdownKatex>
              ) : (
                <span className="text-gray-400 italic">N/A</span>
              )}
              {promptImagePath && (
                <div className="mt-2">
                  <ZoomableImage src={promptImagePath} alt="Prompt image" />
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Collapsible Description (hidden by default) */}
      {((currentDescription && currentDescription.trim().length > 0) || descriptionImagePath) && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider">Description</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDescription(!showDescription)}
              className="h-6 text-xs px-1 flex items-center"
            >
              {showDescription ? <ChevronUp size={12} className="mr-1" /> : <ChevronDown size={12} className="mr-1" />}
              {showDescription ? 'Hide' : 'Show'}
            </Button>
          </div>
          {showDescription && (
            <>
              <Card className="bg-white border shadow-sm">
                <CardContent className="p-3 text-sm">
                  {currentDescription && currentDescription.trim().length > 0 ? (
                    <MarkdownKatex key={`desc-${selectedDefinitionIndex}`} className="whitespace-pre-wrap">{currentDescription}</MarkdownKatex>
                  ) : (
                    <span className="text-gray-400 italic">N/A</span>
                  )}
                  {descriptionImagePath && (
                    <div className="mt-2">
                      <ZoomableImage src={descriptionImagePath} alt="Description image" />
                    </div>
                  )}
                </CardContent>
              </Card>

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
                    {(['again', 'hard', 'good', 'easy'] as const).map((r) => (
                      <Button
                        key={r}
                        variant="outline"
                        size="sm"
                        className={`h-6 px-2 text-xs ${
                          r === 'again' ? 'bg-red-50 hover:bg-red-100 border-red-200' :
                          r === 'hard' ? 'bg-orange-50 hover:bg-orange-100 border-orange-200' :
                          r === 'good' ? 'bg-green-50 hover:bg-green-100 border-green-200' :
                          'bg-blue-50 hover:bg-blue-100 border-blue-200'
                        } ${!canReview ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={() => onReview(r)}
                        disabled={!canReview}
                        title={!canReview ? "Mark as 'Grasped' or 'Learned' to enable review" : `Rate as ${r}`}
                      >
                        {r[0].toUpperCase() + r.slice(1)}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {definition.notes && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider">Notes</h4>
            <Button variant="ghost" size="sm" onClick={() => setShowNotes(!showNotes)} className="h-6 text-xs px-1 flex items-center">
              {showNotes ? <ChevronUp size={12} className="mr-1" /> : <ChevronDown size={12} className="mr-1" />}
              {showNotes ? 'Hide' : 'Show'}
            </Button>
          </div>
          {showNotes && (
            <Card className="bg-yellow-50 border border-yellow-200 shadow-sm">
              <CardContent className="p-3 text-sm">
                <MarkdownKatex className="whitespace-pre-wrap">{definition.notes}</MarkdownKatex>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Collapsible Version Notes (preferred if provided via props) */}
      {(!definition.notes && currentNotes && currentNotes.trim().length > 0) && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider">Notes</h4>
            <Button variant="ghost" size="sm" onClick={() => setShowNotes(!showNotes)} className="h-6 text-xs px-1 flex items-center">
              {showNotes ? <ChevronUp size={12} className="mr-1" /> : <ChevronDown size={12} className="mr-1" />}
              {showNotes ? 'Hide' : 'Show'}
            </Button>
          </div>
          {showNotes && (
            <Card className="bg-yellow-50 border border-yellow-200 shadow-sm">
              <CardContent className="p-3 text-sm">
                <MarkdownKatex className="whitespace-pre-wrap">{currentNotes}</MarkdownKatex>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">Prerequisites</h4>
          {definition.prerequisites?.length ? (
            <div className="flex flex-wrap gap-1">
              {definition.prerequisites.map((prereqCode) => (
                <Button
                  key={prereqCode}
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigateToNode(prereqCode)}
                  className="h-6 text-xs px-1.5 bg-blue-50 hover:bg-blue-100 border-blue-200"
                  title={`${prereqCode}\nNavigate to ${getPrerequisiteDisplayText(prereqCode)}`}
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
          <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">Related Exercises</h4>
          {relatedExercises.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {relatedExercises.map((exerciseCode) => (
                <Button
                  key={exerciseCode}
                  variant="outline"
                  size="sm"
                  onClick={() => onNavigateToNode(exerciseCode)}
                  className="h-6 text-xs px-1.5 bg-orange-50 hover:bg-orange-100 border-orange-200"
                  title={`${exerciseCode}\nNavigate to ${getRelatedExerciseDisplayText(exerciseCode)}`}
                >
                  <InlineMarkdownKatex className="pointer-events-none">
                    {getRelatedExerciseDisplayText(exerciseCode)}
                  </InlineMarkdownKatex>
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">None</p>
          )}
        </div>
      </div>

      {definition.references?.length ? (
        <div>
          <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">References</h4>
          <ul className="text-sm text-gray-700 list-disc pl-5 space-y-0.5">
            {definition.references.map((ref, i) => (
              <li key={`${ref}-${i}`} className="text-xs">{ref}</li>
            ))}
          </ul>
        </div>
      ) : null}

    </>
  );
};

export default DefinitionView;
