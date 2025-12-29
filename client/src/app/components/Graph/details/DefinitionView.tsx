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
  srsStatus?: NodeStatus;
}

const DefinitionView: React.FC<DefinitionViewProps> = ({
  definition,
  mode,
  showDefinition,
  onToggleDefinition,
  selectedDefinitionIndex,
  totalDescriptions,
  currentDescription,
  currentPrompt,
  currentNotes,
  promptImagePath,
  descriptionImagePath,
  onNavigatePrev,
  onNavigateNext,
  relatedExercises,
  onNavigateToNode,
  onReview,
  availableDefinitions = [],
  srsStatus,
}) => {
  const hasMultipleDescriptions = totalDescriptions > 1;
  const [showNotes, setShowNotes] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const canReview = srsStatus === 'grasped' || srsStatus === 'learned';

  const getPrerequisiteDisplayText = (prereqCode: string): string => {
    const prereqDef = availableDefinitions.find(def => def.code === prereqCode);
    return prereqDef ? `${prereqCode}: ${prereqDef.name}` : prereqCode;
  };

  // Reset collapsibles when version index changes (hide by default)
  React.useEffect(() => {
    setShowDescription(false);
    setShowNotes(false);
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
              {hasMultipleDescriptions && (
                <div className="flex justify-between items-center mb-2 text-xs border-b pb-1">
                  <Button variant="ghost" size="sm" disabled={selectedDefinitionIndex === 0} onClick={onNavigatePrev} className="h-5 px-1 text-xs">Prev</Button>
                  <span>Ver {selectedDefinitionIndex + 1}/{totalDescriptions}</span>
                  <Button variant="ghost" size="sm" disabled={selectedDefinitionIndex >= totalDescriptions - 1} onClick={onNavigateNext} className="h-5 px-1 text-xs">Next</Button>
                </div>
              )}

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
                title={`Navigate to ${prereqCode}`}
              >
                {/* Render LaTeX inside button label */}
                <span className="truncate max-w-[220px] inline-block align-middle">
                  {/* Using InlineMath to typeset within a button */}
                  {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
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

      {relatedExercises.length > 0 && (
        <div>
          <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">Related Exercises</h4>
          <div className="flex flex-wrap gap-1">
            {relatedExercises.map((exerciseCode) => (
              <Button
                key={exerciseCode}
                variant="outline"
                size="sm"
                onClick={() => onNavigateToNode(exerciseCode)}
                className="h-6 text-xs px-1.5 bg-orange-50 hover:bg-orange-100 border-orange-200"
                title={`Navigate to ${exerciseCode}`}
              >
                {exerciseCode}
              </Button>
            ))}
          </div>
        </div>
      )}

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

      <div>
        <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">Rate Understanding</h4>
        <div className="flex flex-wrap gap-1.5">
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
              } ${!(srsStatus === 'grasped' || srsStatus === 'learned') ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => onReview(r)}
              disabled={!(srsStatus === 'grasped' || srsStatus === 'learned')}
              title={!(srsStatus === 'grasped' || srsStatus === 'learned') ? "Mark as 'Grasped' or 'Learned' to enable review" : `Rate as ${r}`}
            >
              {r[0].toUpperCase() + r.slice(1)}
            </Button>
          ))}
        </div>
      </div>
    </>
  );
};

export default DefinitionView;
