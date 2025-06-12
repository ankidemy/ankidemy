// File: ./src/app/components/Graph/NodeCreationModal.tsx
import React, { useState, useEffect } from 'react';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import {
  createDefinition,
  createExercise,
  DefinitionRequest, // These types from lib/api expect prerequisiteIds: number[]
  ExerciseRequest
} from '@/lib/api';
import { X } from 'lucide-react';

interface PrerequisiteOption {
  code: string; // The string code for display and internal graph use
  name: string;
  numericId: number; // The numeric database ID for API calls
}

interface NodeCreationModalProps {
  type: 'definition' | 'exercise';
  domainId: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (nodeCode: string) => void; // Return code for UI consistency
  availablePrerequisites: PrerequisiteOption[]; // Updated type
  position?: {x: number, y: number};
}

const NodeCreationModal: React.FC<NodeCreationModalProps> = ({
  type,
  domainId,
  isOpen,
  onClose,
  onSuccess,
  availablePrerequisites,
  position
}) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [statement, setStatement] = useState('');
  const [hints, setHints] = useState('');
  const [difficulty, setDifficulty] = useState('3');
  const [verifiable, setVerifiable] = useState(false);
  const [result, setResult] = useState('');
  const [selectedPrereqNumericIds, setSelectedPrereqNumericIds] = useState<number[]>([]); // Store numeric IDs
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prerequisiteWeights, setPrerequisiteWeights] = useState<Record<number, number>>({}); // NEW: weights for prerequisites

  useEffect(() => {
    if (isOpen) {
      setCode('');
      setName('');
      setDescription('');
      setNotes('');
      setStatement('');
      setHints('');
      setDifficulty('3');
      setVerifiable(false);
      setResult('');
      setSelectedPrereqNumericIds([]); // Reset to numeric IDs array
      setError(null);
      setIsSubmitting(false);
      setPrerequisiteWeights({}); // Reset weights
    }
  }, [isOpen, type]);

  // fix for the handlePrereqChange function to prevent duplicates:
  const handlePrereqChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedOptions = Array.from(e.target.selectedOptions)
      .map(option => parseInt(option.value, 10)) // Values are now numeric IDs
      .filter(id => !isNaN(id));
    
    // FIX: Remove duplicates using Set
    const uniqueSelectedOptions = [...new Set(selectedOptions)];
    setSelectedPrereqNumericIds(uniqueSelectedOptions);
    
    // Initialize weights for newly selected prerequisites
    const newWeights: Record<number, number> = {};
    uniqueSelectedOptions.forEach(id => {
      newWeights[id] = prerequisiteWeights[id] || 1.0; // Default to 1.0
    });
    setPrerequisiteWeights(newWeights);
  };

  const handleWeightChange = (prereqId: number, weight: string) => {
    const numWeight = parseFloat(weight) || 1.0;
    const clampedWeight = Math.max(0.01, Math.min(1.0, numWeight)); // Clamp between 0.01 and 1.0
    setPrerequisiteWeights(prev => ({
      ...prev,
      [prereqId]: clampedWeight
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (!code.trim() || !name.trim()) {
        throw new Error('Code and Name are required');
      }

      // Prepare prerequisite data with weights
      const prerequisiteIdsToSend = selectedPrereqNumericIds.length > 0 ? selectedPrereqNumericIds : undefined;
      const prerequisiteWeightsToSend = selectedPrereqNumericIds.length > 0 ? prerequisiteWeights : undefined;

      if (type === 'definition') {
        if (!description.trim()) throw new Error('Description is required for definitions');
        const definitionData: DefinitionRequest = {
          code: code.trim(),
          name: name.trim(),
          description: description.trim(),
          notes: notes.trim() || undefined,
          domainId,
          prerequisiteIds: prerequisiteIdsToSend,
          prerequisiteWeights: prerequisiteWeightsToSend, // NEW: include weights
          xPosition: position?.x,
          yPosition: position?.y
        };
        const response = await createDefinition(domainId, definitionData);
        onSuccess(response.code);
      } else {
        if (!statement.trim()) throw new Error('Statement is required for exercises');
        const exerciseData: ExerciseRequest = {
          code: code.trim(),
          name: name.trim(),
          statement: statement.trim(),
          description: description.trim() || undefined, // Solution
          notes: notes.trim() || undefined,
          hints: hints.trim() || undefined,
          domainId,
          difficulty: difficulty,
          verifiable,
          result: verifiable ? (result.trim() || undefined) : undefined,
          prerequisiteIds: selectedPrereqNumericIds,
          prerequisiteWeights: prerequisiteWeightsToSend,
          xPosition: position?.x,
          yPosition: position?.y
        };
        const response = await createExercise(domainId, exerciseData);
        onSuccess(response.code);
      }
      onClose();
    } catch (err: any) {
      console.error(`Error creating ${type}:`, err);
      let errorMessage = `Failed to create ${type}.`;
      if (err.response && typeof err.response.data === 'object' && err.response.data.error) {
          errorMessage = `API Error: ${err.response.data.error}`;
      } else if (err.message) {
          errorMessage = err.message;
      }
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center border-b p-4">
          <h2 className="text-xl font-bold">
            Create New {type === 'definition' ? 'Definition' : 'Exercise'}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={isSubmitting}>
            <X size={18} />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
               <strong className="font-bold">Error: </strong>
               <span className="block sm:inline">{error}</span>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
              <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g., CALC_DERIV" required disabled={isSubmitting} className="text-sm"/>
              <p className="text-xs text-gray-500 mt-1">Unique identifier (no spaces recommended).</p>
            </div>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Derivative Definition" required disabled={isSubmitting} className="text-sm"/>
            </div>
          </div>

          {type === 'definition' ? (
            <>
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={5} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400" placeholder="Definition content..." required disabled={isSubmitting}/>
                <p className="text-xs text-gray-500 mt-1">{'Supports LaTeX notation: $x^2$, $$\\sum_{i=0}^n i$$'}</p>
              </div>
              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
                <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400" placeholder="Additional notes..." disabled={isSubmitting}/>
              </div>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="statement" className="block text-sm font-medium text-gray-700 mb-1">Problem Statement *</label>
                <textarea id="statement" value={statement} onChange={(e) => setStatement(e.target.value)} rows={4} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400" placeholder="Exercise statement..." required disabled={isSubmitting}/>
                <p className="text-xs text-gray-500 mt-1">{'Supports LaTeX notation: $x^2$, $$\\sum_{i=0}^n i$$'}</p>
              </div>
              <div>
                <label htmlFor="solution" className="block text-sm font-medium text-gray-700 mb-1">Solution / Explanation (Optional)</label>
                <textarea id="solution" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400" placeholder="Solution details..." disabled={isSubmitting}/>
                 <p className="text-xs text-gray-500 mt-1">{'Supports LaTeX notation.'}</p>
              </div>
              <div>
                <label htmlFor="hints" className="block text-sm font-medium text-gray-700 mb-1">Hints (Optional)</label>
                <textarea id="hints" value={hints} onChange={(e) => setHints(e.target.value)} rows={2} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400" placeholder="Optional hints..." disabled={isSubmitting}/>
              </div>
              <div>
                <label htmlFor="exerciseNotes" className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  id="exerciseNotes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
                  placeholder="Additional notes about this exercise..."
                  disabled={isSubmitting}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                 <div>
                    <label htmlFor="difficulty" className="block text-sm font-medium text-gray-700 mb-1">Difficulty (1-7) *</label>
                    <Input id="difficulty" type="number" min="1" max="7" step="1" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} required disabled={isSubmitting} className="text-sm" onBlur={(e) => { const val = Math.max(1, Math.min(7, parseInt(e.target.value, 10) || 1)); setDifficulty(String(val)); }}/>
                </div>
                 <div className="flex items-center h-full pb-1">
                     <input id="verifiable" type="checkbox" className="h-4 w-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500" checked={verifiable} onChange={(e) => setVerifiable(e.target.checked)} disabled={isSubmitting}/>
                     <label htmlFor="verifiable" className="ml-2 block text-sm text-gray-700">Verifiable Answer?</label>
                 </div>
              </div>
              {verifiable && (
                <div>
                  <label htmlFor="result" className="block text-sm font-medium text-gray-700 mb-1">Expected Result *</label>
                  <Input id="result" value={result} onChange={(e) => setResult(e.target.value)} placeholder="The exact answer to check against" required={verifiable} disabled={isSubmitting} className="text-sm"/>
                  <p className="text-xs text-gray-500 mt-1">Exact text match for student answers.</p>
                </div>
              )}
            </>
          )}

          <div>
            <label htmlFor="prerequisites" className="block text-sm font-medium text-gray-700 mb-1">Prerequisites (Optional Definitions)</label>
            <select
              id="prerequisites"
              multiple
              className="w-full border border-gray-300 rounded-md px-3 py-2 h-32 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400 bg-white"
              value={selectedPrereqNumericIds.map(String)} // Select expects string values
              onChange={handlePrereqChange}
              disabled={isSubmitting || availablePrerequisites.length === 0}
            >
              {availablePrerequisites.length === 0 && <option disabled>No definitions available</option>}
              {availablePrerequisites.map((prereq) => (
                <option key={prereq.numericId} value={String(prereq.numericId)}> {/* Value is numericId */}
                  {prereq.code}: {prereq.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple.</p>

          {/* NEW: Weight inputs for selected prerequisites */}
          {selectedPrereqNumericIds.length > 0 && (
            <div className="mt-3 p-3 border rounded-md bg-gray-50">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Prerequisite Weights (0.01 - 1.00)</h4>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {/* FIX: Remove duplicates and ensure unique keys */}
                {[...new Set(selectedPrereqNumericIds)] // Remove duplicates
                  .map(prereqId => {
                    const prereq = availablePrerequisites.find(p => p.numericId === prereqId);
                    if (!prereq) return null;
                    
                    return (
                      <div key={`prereq-weight-${prereqId}`} className="flex items-center justify-between text-xs">
                        <span className="truncate flex-1 mr-2" title={`${prereq.code}: ${prereq.name}`}>
                          {prereq.code}
                        </span>
                        <input
                          type="number"
                          min="0.01"
                          max="1.00"
                          step="0.01"
                          value={prerequisiteWeights[prereqId] || 1.0}
                          onChange={(e) => handleWeightChange(prereqId, e.target.value)}
                          disabled={isSubmitting}
                          className="w-16 px-1 py-0.5 border border-gray-300 rounded text-xs"
                          title="Weight for credit propagation (1.0 = full, 0.01 = minimal)"
                        />
                      </div>
                    );
                  })
                  .filter(Boolean)} {/* Remove null entries */}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                1.0 = Full prerequisite (solid line), &lt; 1.0 = Partial prerequisite (dotted line)
              </p>
            </div>
          )}
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t mt-6">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting} variant={isSubmitting ? "secondary" : "default"}>
              {isSubmitting ? 'Creating...' : `Create ${type === 'definition' ? 'Definition' : 'Exercise'}`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NodeCreationModal;
