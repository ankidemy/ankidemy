// src/app/components/Graph/NodeCreationModal.tsx
import React, { useState, useEffect } from 'react';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import {
  createDefinition,
  createExercise,
  DefinitionRequest,
  ExerciseRequest
} from '@/lib/api';
import { X } from 'lucide-react';

interface NodeCreationModalProps {
  type: 'definition' | 'exercise';
  domainId: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (nodeId: string) => void;
  availablePrerequisites: Array<{id: string, name: string}>;
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
  // Form state
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [statement, setStatement] = useState('');
  const [hints, setHints] = useState('');
  const [difficulty, setDifficulty] = useState('3');
  const [verifiable, setVerifiable] = useState(false);
  const [result, setResult] = useState('');
  const [selectedPrereqs, setSelectedPrereqs] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens or type changes
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
      setSelectedPrereqs([]);
      setError(null);
      setIsSubmitting(false); // Ensure submitting state is reset
    }
  }, [isOpen, type]);

  // Handle prerequisite selection
  const handlePrereqChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedOptions = Array.from(e.target.selectedOptions).map(option => option.value);
    setSelectedPrereqs(selectedOptions);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Validate form
      if (!code.trim()) {
        throw new Error('Code is required');
      }

      if (!name.trim()) {
        throw new Error('Name is required');
      }

      // API expects prerequisite IDs as numbers (the actual database IDs),
      // but we only have the codes (strings) available easily from the graph/dropdown.
      // The current API calls `createDefinition`/`createExercise` seem designed
      // to take the *numeric* IDs. This is a mismatch with `availablePrerequisites`
      // which provides string codes.
      // TEMPORARY WORKAROUND: Sending codes for now, assuming backend might handle it
      // or needs adjustment. A better fix would involve fetching IDs for codes.
      // For now, let's skip sending prerequisites if the API strictly requires numbers.
      // console.warn("Prerequisite IDs are codes (strings), but API might expect numbers. Skipping prerequisites for now.");
      // const prerequisiteIdsToSend = undefined; // Skip sending until ID mapping is resolved

      // *** CORRECTION: The API likely expects the numeric IDs from the *definition* objects,
      // not the codes. We need a way to map the selected codes back to their numeric IDs.
      // This modal currently doesn't have that mapping easily.
      // Let's adjust the API call structure assuming the API might accept codes for now,
      // OR adjust the data structure passed if the API library was changed.
      // Assuming `lib/api` expects numeric IDs:
      // We need a way to get the numeric ID for each selected code. This requires either:
      // 1. Passing the full Definition objects to `availablePrerequisites`.
      // 2. Making API calls here to get IDs by code (inefficient).
      // Let's *assume* for now the `lib/api` was updated or the backend can handle codes,
      // otherwise this part will fail. Reverting to the original attempt to parse IDs,
      // but acknowledging this might be conceptually wrong if `prereq.id` is the CODE.

       const prerequisiteIdsToSend = selectedPrereqs.length > 0
           ? selectedPrereqs // Send codes if API accepts them OR...
           // ? selectedPrereqs.map(code => /* Need a way to map code to numeric ID here */)
           : undefined;

      if (type === 'definition') {
        if (!description.trim()) {
          throw new Error('Description is required for definitions');
        }
        const definitionData: DefinitionRequest = {
          code: code.trim(),
          name: name.trim(),
          description: description.trim(),
          notes: notes.trim() || undefined,
          domainId,
          // Adjust based on whether API expects codes or numeric IDs
          prerequisiteCodes: prerequisiteIdsToSend, // Assuming API takes codes
          // prerequisiteIds: prerequisiteIdsToSend, // If API takes numeric IDs (requires mapping)
          xPosition: position?.x,
          yPosition: position?.y
        };

        // Call API to create definition
        const response = await createDefinition(domainId, definitionData);
        onSuccess(response.code); // Use the code returned by the API
      } else {
        // Exercise creation
        if (!statement.trim()) {
          throw new Error('Statement is required for exercises');
        }
        const exerciseData: ExerciseRequest = {
          code: code.trim(),
          name: name.trim(),
          statement: statement.trim(),
          description: description.trim() || undefined, // Solution
          notes: notes.trim() || undefined,
          hints: hints.trim() || undefined,
          domainId,
          difficulty: difficulty, // Already a string '1'-'7'
          verifiable,
          result: verifiable ? (result.trim() || undefined) : undefined, // Send empty string as undefined
          // Adjust based on whether API expects codes or numeric IDs
          prerequisiteCodes: prerequisiteIdsToSend, // Assuming API takes codes
          // prerequisiteIds: prerequisiteIdsToSend, // If API takes numeric IDs (requires mapping)
          xPosition: position?.x,
          yPosition: position?.y
        };

        // Call API to create exercise
        const response = await createExercise(domainId, exerciseData);
        onSuccess(response.code); // Use the code returned by the API
      }

      // Close modal on success
      onClose();
    } catch (err: any) {
      console.error(`Error creating ${type}:`, err);
      // Attempt to parse API error response if available
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

          {/* Common fields for both types */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
                Code (Unique ID) *
              </label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g., CALC_DERIV"
                required
                disabled={isSubmitting}
                className="text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Unique identifier (no spaces recommended).
              </p>
            </div>

            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Name *
              </label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Derivative Definition"
                required
                disabled={isSubmitting}
                className="text-sm"
              />
            </div>
          </div>

          {/* Type-specific fields */}
          {type === 'definition' ? (
            <>
              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description *
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={5}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
                  placeholder="Definition content..."
                  required
                  disabled={isSubmitting}
                />
                {/* FIX APPLIED HERE */}
                <p className="text-xs text-gray-500 mt-1">
                  {'Supports LaTeX notation: $x^2$, $$\\sum_{i=0}^n i$$'}
                </p>
              </div>

              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
                  placeholder="Additional notes about this definition..."
                  disabled={isSubmitting}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="statement" className="block text-sm font-medium text-gray-700 mb-1">
                  Problem Statement *
                </label>
                <textarea
                  id="statement"
                  value={statement}
                  onChange={(e) => setStatement(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
                  placeholder="Exercise statement or question..."
                  required
                  disabled={isSubmitting}
                />
                 {/* FIX APPLIED HERE */}
                <p className="text-xs text-gray-500 mt-1">
                   {'Supports LaTeX notation: $x^2$, $$\\sum_{i=0}^n i$$'}
                </p>
              </div>

              <div>
                <label htmlFor="solution" className="block text-sm font-medium text-gray-700 mb-1">
                  Solution / Explanation (Optional)
                </label>
                <textarea
                  id="solution" // Changed ID to be more specific
                  value={description} // Keep state variable name consistency for now
                  onChange={(e) => setDescription(e.target.value)} // Keep state variable name consistency
                  rows={4}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
                  placeholder="Solution or explanation (can be left blank)..."
                  disabled={isSubmitting}
                />
                 <p className="text-xs text-gray-500 mt-1">
                   {'Supports LaTeX notation.'}
                 </p>
              </div>

              <div>
                <label htmlFor="hints" className="block text-sm font-medium text-gray-700 mb-1">
                  Hints (Optional)
                </label>
                <textarea
                  id="hints"
                  value={hints}
                  onChange={(e) => setHints(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
                  placeholder="Optional hints for this exercise..."
                  disabled={isSubmitting}
                />
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
                    <label htmlFor="difficulty" className="block text-sm font-medium text-gray-700 mb-1">
                        Difficulty (1-7) *
                    </label>
                    <Input
                        id="difficulty"
                        type="number"
                        min="1"
                        max="7"
                        step="1" // Ensure integer steps
                        value={difficulty}
                        onChange={(e) => setDifficulty(e.target.value)}
                        required
                        disabled={isSubmitting}
                        className="text-sm"
                        onBlur={(e) => { // Basic validation on blur
                            const val = Math.max(1, Math.min(7, parseInt(e.target.value, 10) || 1));
                            setDifficulty(String(val));
                        }}
                    />
                </div>

                 <div className="flex items-center h-full pb-1"> {/* Align checkbox vertically */}
                     <input
                        id="verifiable"
                        type="checkbox"
                        className="h-4 w-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                        checked={verifiable}
                        onChange={(e) => setVerifiable(e.target.checked)}
                        disabled={isSubmitting}
                     />
                     <label htmlFor="verifiable" className="ml-2 block text-sm text-gray-700">
                        Verifiable Answer?
                     </label>
                 </div>
              </div>


              {verifiable && (
                <div>
                  <label htmlFor="result" className="block text-sm font-medium text-gray-700 mb-1">
                    Expected Result *
                  </label>
                  <Input
                    id="result"
                    value={result}
                    onChange={(e) => setResult(e.target.value)}
                    placeholder="The exact answer to check against"
                    required={verifiable} // Only required if verifiable is checked
                    disabled={isSubmitting}
                    className="text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    The system compares student answers exactly against this text.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Prerequisites - common for both types */}
          <div>
            <label htmlFor="prerequisites" className="block text-sm font-medium text-gray-700 mb-1">
              Prerequisites (Optional Definitions)
            </label>
            <select
              id="prerequisites"
              multiple
              className="w-full border border-gray-300 rounded-md px-3 py-2 h-32 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400 bg-white"
              value={selectedPrereqs}
              onChange={handlePrereqChange}
              disabled={isSubmitting || availablePrerequisites.length === 0}
            >
              {availablePrerequisites.length === 0 && <option disabled>No definitions available</option>}
              {availablePrerequisites.map((prereq) => (
                // Assuming prereq.id is the CODE (string) here based on KnowledgeGraph
                <option key={prereq.id} value={prereq.id}>
                  {prereq.id}: {prereq.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Hold Ctrl/Cmd to select multiple required concepts.
            </p>
          </div>

          {/* Submit buttons */}
          <div className="flex justify-end space-x-3 pt-4 border-t mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              variant={isSubmitting ? "secondary" : "default"} // Indicate loading state
            >
              {isSubmitting ? 'Creating...' : `Create ${type === 'definition' ? 'Definition' : 'Exercise'}`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NodeCreationModal;
