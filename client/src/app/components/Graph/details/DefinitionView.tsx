"use client";

import React, { useState } from 'react';
import { Button } from "@/app/components/core/button";
import { Card, CardContent } from "@/app/components/core/card";
import { MathJaxContent } from '@/app/components/core/MathJaxWrapper';
import { Definition } from '../utils/types';
import { ChevronDown, ChevronUp } from 'lucide-react';

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
  onReview,
  availableDefinitions = [], // FIX: Default to empty array
}) => {
  const hasMultipleDescriptions = totalDescriptions > 1;
  const [showNotes, setShowNotes] = useState(false);

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

      {/* Database Notes Section */}
      {definition.notes && (
        <div>
          <div className="flex justify-between items-center mb-1">
            <h4 className="font-medium text-xs text-gray-500 uppercase tracking-wider">Notes</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowNotes(!showNotes)}
              className="h-6 text-xs px-1 flex items-center"
            >
              {showNotes ? <ChevronUp size={12} className="mr-1" /> : <ChevronDown size={12} className="mr-1" />}
              {showNotes ? 'Hide' : 'Show'}
            </Button>
          </div>
          {showNotes && (
            <Card className="bg-yellow-50 border border-yellow-200 shadow-sm">
              <CardContent className="p-3 text-sm">
                <MathJaxContent>
                  {definition.notes}
                </MathJaxContent>
              </CardContent>
            </Card>
          )}
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
    </>
  );
};

export default DefinitionView;
