// File: ./src/app/components/Graph/details/NodeEditForm.tsx
"use client";

import React, { useState, useEffect } from 'react';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import { Definition, Exercise, GraphNode } from '../utils/types';

interface AvailableDefinitionOption {
  code: string;
  name: string;
  numericId: number;
}

interface NodeEditFormProps {
  selectedNode: GraphNode;
  selectedNodeDetails: (Definition | Exercise | null) & { 
    prerequisites?: string[];
    prerequisiteWeights?: Record<string, number>;
  };
  availableDefinitionsForEdit: AvailableDefinitionOption[];
  hasMultipleDescriptions: boolean;
  currentDescription: string;
  totalDescriptions: number;
  selectedDefinitionIndex: number;
  onCancel: () => void;
  onSubmit: () => void;
}

const NodeEditForm: React.FC<NodeEditFormProps> = ({
  selectedNode,
  selectedNodeDetails,
  availableDefinitionsForEdit,
  hasMultipleDescriptions,
  currentDescription,
  totalDescriptions,
  selectedDefinitionIndex,
  onCancel,
  onSubmit
}) => {
  const [prerequisiteWeights, setPrerequisiteWeights] = useState<Record<number, number>>({});

  useEffect(() => {
    if (selectedNodeDetails?.prerequisites) {
      const weights: Record<number, number> = {};
      selectedNodeDetails.prerequisites.forEach(prereqCode => {
        const foundDef = availableDefinitionsForEdit.find(def => def.code === prereqCode);
        if (foundDef) {
          weights[foundDef.numericId] = selectedNodeDetails.prerequisiteWeights?.[prereqCode] || 1.0;
        }
      });
      setPrerequisiteWeights(weights);
    } else {
      setPrerequisiteWeights({});
    }
  }, [selectedNodeDetails, availableDefinitionsForEdit]);

  const handlePrereqSelectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedOptions = Array.from(e.target.selectedOptions);
    const newWeights: Record<number, number> = {};
    
    selectedOptions.forEach(option => {
      const numericId = parseInt(option.value, 10);
      if (!isNaN(numericId)) {
        newWeights[numericId] = prerequisiteWeights[numericId] || 1.0;
      }
    });
    
    setPrerequisiteWeights(newWeights);
  };

  const handleWeightChange = (prereqId: number, weight: string) => {
    const numWeight = parseFloat(weight);
    const clampedWeight = isNaN(numWeight) ? 1.0 : Math.max(0.01, Math.min(1.0, numWeight));
    setPrerequisiteWeights(prev => ({
      ...prev,
      [prereqId]: clampedWeight
    }));
  };

  const getSelectedPrereqIds = (): number[] => {
    return Object.keys(prerequisiteWeights).map(id => parseInt(id, 10)).filter(id => !isNaN(id));
  };

  if (!selectedNodeDetails) return null;

  const isDefinition = selectedNode.type === 'definition';
  const selectedPrereqIds = getSelectedPrereqIds();

  return (
    <div className="space-y-4 text-sm">
      <div>
        <label className="block text-xs font-medium mb-1 text-gray-600">Code (ID)</label>
        <Input value={selectedNode.id} disabled className="h-8 text-sm bg-gray-100"/>
      </div>
      
      <div>
        <label htmlFor="name" className="block text-xs font-medium mb-1 text-gray-600">Name</label>
        <Input id="name" defaultValue={selectedNode.name} className="h-8 text-sm"/>
      </div>

      {isDefinition ? (
        <>
          <div>
            <label htmlFor="description" className="block text-xs font-medium mb-1 text-gray-600">Description</label>
            {hasMultipleDescriptions && (
              <div className="text-xs text-gray-500 mb-1">
                Editing version {selectedDefinitionIndex + 1}/{totalDescriptions}
              </div>
            )}
            <textarea
              id="description"
              rows={6}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
              defaultValue={currentDescription}
              placeholder="Enter definition..."
            />
          </div>
          
          <div>
            <label htmlFor="notes" className="block text-xs font-medium mb-1 text-gray-600">Notes</label>
            <textarea
              id="notes"
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
              defaultValue={(selectedNodeDetails as Definition)?.notes || ''}
              placeholder="Additional notes..."
            />
          </div>
          
          <div>
            <label htmlFor="references" className="block text-xs font-medium mb-1 text-gray-600">References (one per line)</label>
            <textarea
              id="references"
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
              defaultValue={(selectedNodeDetails as Definition)?.references?.join('\n') || ''}
              placeholder="e.g., Book Title, Chapter 3"
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <label htmlFor="statement" className="block text-xs font-medium mb-1 text-gray-600">Statement</label>
            <textarea
              id="statement"
              rows={4}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
              defaultValue={(selectedNodeDetails as Exercise)?.statement}
              placeholder="Exercise statement..."
            />
          </div>
          
          <div>
            <label htmlFor="description" className="block text-xs font-medium mb-1 text-gray-600">Solution</label>
            <textarea
              id="description"
              rows={5}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
              defaultValue={(selectedNodeDetails as Exercise)?.description}
              placeholder="Solution details..."
            />
          </div>
          
          <div>
            <label htmlFor="hints" className="block text-xs font-medium mb-1 text-gray-600">Hints</label>
            <textarea
              id="hints"
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
              defaultValue={(selectedNodeDetails as Exercise)?.hints || ''}
              placeholder="Hints..."
            />
          </div>
          
          <div className="flex space-x-4 items-end">
            <div>
              <label htmlFor="difficulty" className="block text-xs font-medium mb-1 text-gray-600">Difficulty (1-7)</label>
              <Input
                id="difficulty"
                type="number"
                min="1"
                max="7"
                defaultValue={(selectedNodeDetails as Exercise)?.difficulty || '3'}
                className="w-20 h-8 text-sm"
              />
            </div>
            <div className="flex items-center pb-1">
              <input
                id="verifiable"
                type="checkbox"
                defaultChecked={(selectedNodeDetails as Exercise)?.verifiable}
                className="h-4 w-4 mr-1.5"
              />
              <label htmlFor="verifiable" className="text-xs font-medium text-gray-600">Verifiable?</label>
            </div>
          </div>
          
          <div>
            <label htmlFor="result" className="block text-xs font-medium mb-1 text-gray-600">Expected Result (if verifiable)</label>
            <Input
              id="result"
              defaultValue={(selectedNodeDetails as Exercise)?.result || ''}
              placeholder="Expected answer"
              className="h-8 text-sm"
            />
          </div>
        </>
      )}

      <div>
        <label htmlFor="prerequisites" className="block text-xs font-medium mb-1 text-gray-600">Prerequisites (Definitions)</label>
        <select
          id="prerequisites"
          multiple
          className="w-full border border-gray-300 rounded p-2 h-24 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
          value={selectedPrereqIds.map(String)}
          onChange={handlePrereqSelectionChange}
        >
          {availableDefinitionsForEdit
            .filter(def => def.code !== selectedNode.id)
            .sort((a,b) => a.code.localeCompare(b.code))
            .map(def => (
              <option key={def.numericId} value={String(def.numericId)}>
                {def.code}: {def.name}
              </option>
            ))
          }
        </select>
        <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple</p>

        {selectedPrereqIds.length > 0 && (
          <div className="mt-3 p-3 border rounded-md bg-gray-50">
            <h4 className="text-xs font-medium text-gray-700 mb-2">Prerequisite Weights (0.01 - 1.00)</h4>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {selectedPrereqIds
                .map(prereqId => availableDefinitionsForEdit.find(p => p.numericId === prereqId))
                .filter(Boolean)
                .sort((a, b) => (a?.code || '').localeCompare(b?.code || ''))
                .map(prereq => {
                  if (!prereq) return null;
                  
                  return (
                    <div key={prereq.numericId} className="flex items-center justify-between text-xs">
                      <span className="truncate flex-1 mr-2" title={`${prereq.code}: ${prereq.name}`}>
                        {prereq.code}
                      </span>
                      <Input
                        type="number"
                        min="0.01"
                        max="1.00"
                        step="0.01"
                        value={prerequisiteWeights[prereq.numericId] || 1.0}
                        onChange={(e) => handleWeightChange(prereq.numericId, e.target.value)}
                        className="w-16 px-1 py-0.5 border border-gray-300 rounded text-xs h-6"
                        title="Weight for credit propagation (1.0 = full, 0.01 = minimal)"
                      />
                    </div>
                  );
                })}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              1.0 = Full prerequisite (solid line), &lt; 1.0 = Partial prerequisite (dotted line)
            </p>
          </div>
        )}
      </div>

      <div className="flex justify-end space-x-2 pt-2 border-t mt-4">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button 
          size="sm" 
          onClick={() => {
            const form = document.querySelector('form') as HTMLFormElement;
            if (form) {
              const existingWeightsInput = form.querySelector('input[name="prerequisiteWeights"]');
              if (existingWeightsInput) {
                existingWeightsInput.remove();
              }

              const weightsInput = document.createElement('input');
              weightsInput.type = 'hidden';
              weightsInput.name = 'prerequisiteWeights';
              weightsInput.value = JSON.stringify(prerequisiteWeights);
              form.appendChild(weightsInput);
            }
            onSubmit();
          }}
        >
          Save Changes
        </Button>
      </div>
    </div>
  );
};

export default NodeEditForm;
