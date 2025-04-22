"use client";

import React from 'react';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import { Definition, Exercise, GraphNode } from '../utils/types';

interface NodeEditFormProps {
  selectedNode: GraphNode;
  selectedNodeDetails: Definition | Exercise | null;
  availableDefinitions: GraphNode[];
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
  availableDefinitions,
  hasMultipleDescriptions,
  currentDescription,
  totalDescriptions,
  selectedDefinitionIndex,
  onCancel,
  onSubmit
}) => {
  if (!selectedNodeDetails) return null;

  const isDefinition = selectedNode.type === 'definition';
  
  return (
    <div className="space-y-4 text-sm">
      {/* Common Fields */}
      <div>
        <label className="block text-xs font-medium mb-1 text-gray-600">ID</label>
        <Input value={selectedNode.id} disabled className="h-8 text-sm bg-gray-100"/>
      </div>
      <div>
        <label htmlFor="name" className="block text-xs font-medium mb-1 text-gray-600">Name</label>
        <Input id="name" defaultValue={selectedNode.name} className="h-8 text-sm"/>
      </div>

      {/* Type-Specific Fields */}
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

      {/* Prerequisites Select (Common) */}
      <div>
        <label htmlFor="prerequisites" className="block text-xs font-medium mb-1 text-gray-600">Prerequisites (Definitions)</label>
        <select
          id="prerequisites"
          multiple
          className="w-full border border-gray-300 rounded p-2 h-24 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
          defaultValue={selectedNodeDetails?.prerequisites || []}
        >
          {availableDefinitions
            .filter(n => n.id !== selectedNode.id)
            .sort((a,b) => a.id.localeCompare(b.id))
            .map(node => (
              <option key={node.id} value={node.id}>{node.id}: {node.name}</option>
            ))
          }
        </select>
        <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple</p>
      </div>

      {/* Save/Cancel Buttons */}
      <div className="flex justify-end space-x-2 pt-2 border-t mt-4">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={onSubmit}>
          Save Changes
        </Button>
      </div>
    </div>
  );
};

export default NodeEditForm;
