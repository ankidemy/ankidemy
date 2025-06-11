"use client";

import React from 'react';
import { Button } from "@/app/components/core/button";
import { Card, CardContent } from "@/app/components/core/card";
import { MathJaxContent } from '@/app/components/core/MathJaxWrapper';
import { Definition } from '../utils/types';

interface DefinitionViewProps {
  definition: Definition;
  mode: 'study' | 'practice';
  showDefinition: boolean;
  onToggleDefinition: () => void;
  selectedDefinitionIndex: number;
  totalDescriptions: number;
  currentDescription: string;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  relatedExercises: string[];
  onNavigateToNode: (nodeId: string) => void;
  personalNotes: string;
  onUpdateNotes: (notes: string) => void;
  onReview: (result: 'again' | 'hard' | 'good' | 'easy') => void;
  // FIX: Add available definitions to look up prerequisite names
  availableDefinitions?: { code: string; name: string }[];
}

const DefinitionView: React.FC<DefinitionViewProps> = ({
  definition,
  mode,
  showDefinition,
  onToggleDefinition,
  selectedDefinitionIndex,
  totalDescriptions,
  currentDescription,
  onNavigatePrev,
  onNavigateNext,
  relatedExercises,
  onNavigateToNode,
  personalNotes,
  onUpdateNotes,
  onReview,
  availableDefinitions = [], // FIX: Default to empty array
}) => {
  const hasMultipleDescriptions = totalDescriptions > 1;

  // FIX: Helper function to get display text for prerequisites
  const getPrerequisiteDisplayText = (prereqCode: string): string => {
    console.log(`Looking up prerequisite: ${prereqCode}`);
    console.log('Available definitions:', availableDefinitions);
    
    const prereqDef = availableDefinitions.find(def => def.code === prereqCode);
    if (prereqDef) {
      const displayText = `${prereqCode}: ${prereqDef.name}`;
      console.log(`Found prerequisite: ${displayText}`);
      return displayText;
    }
    // Fallback to just the code if name not found
    console.log(`Prerequisite not found, using fallback: ${prereqCode}`);
    return prereqCode;
  };

  return (
    <>
      <div>
        <div className="flex justify-between items-center mb-1">
          <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider">Definition</h4>
          {mode === 'study' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleDefinition}
              className="h-6 text-xs px-1"
            >
              {showDefinition ? 'Hide' : 'Show'}
            </Button>
          )}
        </div>
        {(showDefinition || mode !== 'study') && (
          <Card className="bg-gray-50 border shadow-sm">
            <CardContent className="p-3 text-sm">
              {hasMultipleDescriptions && (
                <div className="flex justify-between items-center mb-2 text-xs border-b pb-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={selectedDefinitionIndex === 0}
                    onClick={onNavigatePrev}
                    className="h-5 px-1 text-xs"
                  >
                    Prev
                  </Button>
                  <span>Ver {selectedDefinitionIndex + 1}/{totalDescriptions}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={selectedDefinitionIndex >= totalDescriptions - 1}
                    onClick={onNavigateNext}
                    className="h-5 px-1 text-xs"
                  >
                    Next
                  </Button>
                </div>
              )}
              <MathJaxContent key={selectedDefinitionIndex}>
                {currentDescription || <span className="text-gray-400 italic">N/A</span>}
              </MathJaxContent>
            </CardContent>
          </Card>
        )}
      </div>

      {definition.notes && (
        <div>
          <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">Official Notes</h4>
          <p className="text-sm text-gray-800 bg-yellow-50 p-2 rounded border border-yellow-200">
            {definition.notes}
          </p>
        </div>
      )}

      <div>
        <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">Prerequisites</h4>
        {definition.prerequisites?.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {definition.prerequisites.map(prereqCode => (
              <Button
                key={prereqCode}
                variant="outline"
                size="sm"
                onClick={() => onNavigateToNode(prereqCode)}
                className="h-6 text-xs px-1.5 bg-blue-50 hover:bg-blue-100 border-blue-200"
                title={`Navigate to ${prereqCode}`} // FIX: Add tooltip with code
              >
                {/* FIX: Display CODE:NAME format */}
                {getPrerequisiteDisplayText(prereqCode)}
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
            {relatedExercises.map(exerciseCode => (
              <Button
                key={exerciseCode}
                variant="outline"
                size="sm"
                onClick={() => onNavigateToNode(exerciseCode)}
                className="h-6 text-xs px-1.5 bg-orange-50 hover:bg-orange-100 border-orange-200"
                title={`Navigate to ${exerciseCode}`} // FIX: Add tooltip
              >
                {exerciseCode}
              </Button>
            ))}
          </div>
        </div>
      )}

      {definition.references?.length > 0 && (
        <div>
          <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">References</h4>
          <ul className="text-sm text-gray-700 list-disc pl-5 space-y-0.5">
            {definition.references.map((ref, i) => (
              <li key={i} className="text-xs">{ref}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider mb-1">Rate Understanding</h4>
        <div className="flex flex-wrap gap-1.5">
          {(['again', 'hard', 'good', 'easy'] as const).map(r => (
            <Button
              key={r}
              variant="outline"
              size="sm"
              className={`h-6 px-2 text-xs ${
                r === 'again' ? 'bg-red-50 hover:bg-red-100 border-red-200' :
                r === 'hard' ? 'bg-orange-50 hover:bg-orange-100 border-orange-200' :
                r === 'good' ? 'bg-green-50 hover:bg-green-100 border-green-200' :
                'bg-blue-50 hover:bg-blue-100 border-blue-200'
              }`}
              onClick={() => onReview(r)}
            >
              {r[0].toUpperCase() + r.slice(1)}
            </Button>
          ))}
        </div>
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

export default DefinitionView;
