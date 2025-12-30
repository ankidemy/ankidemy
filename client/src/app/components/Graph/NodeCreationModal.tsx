// File: ./src/app/components/Graph/NodeCreationModal.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import {
  createDefinition,
  createMetaDefinition,
  createMetaExercise,
  addMetaDefinitionVersion,
  addMetaExerciseVersion,
  getMetaDefinition,
  getMetaExercise,
  uploadNodeImage,
  DefinitionRequest, // These types from lib/api expect prerequisiteIds: number[]
  Definition as ApiDefinition,
  Exercise as ApiExercise,
  MetaDefinition
} from '@/lib/api';
import { X } from 'lucide-react';
import ImageUploadField from './components/ImageUploadField';
import MarkdownPreviewField from './components/MarkdownPreviewField';
import { getNextDotCode, getNextExerciseCode } from './utils/codeGeneration';

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
  onSuccess: (nodeCode: string, created?: ApiDefinition | ApiExercise) => void; // Return code and payload for surgical insert
  availableDefinitionPrerequisites: PrerequisiteOption[];
  availableExercisePrerequisites?: PrerequisiteOption[];
  existingCodes: Set<string>;
  position?: {x: number, y: number};
  getGraphCenter?: () => {x: number, y: number};
}

const NodeCreationModal: React.FC<NodeCreationModalProps> = ({
  type,
  domainId,
  isOpen,
  onClose,
  onSuccess,
  availableDefinitionPrerequisites,
  availableExercisePrerequisites = [],
  existingCodes,
  position,
  getGraphCenter
}) => {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [statement, setStatement] = useState('');
  const [hints, setHints] = useState('');
  const [statementImagePath, setStatementImagePath] = useState('');
  const [solutionImagePath, setSolutionImagePath] = useState('');
  const [difficulty, setDifficulty] = useState('3');
  const [verifiable, setVerifiable] = useState(false);
  const [result, setResult] = useState('');
  // For meta-definition initial version
  const [prompt, setPrompt] = useState('');
  const [versionType, setVersionType] = useState('open_ended');
  const [references, setReferences] = useState('');
  const [promptImagePath, setPromptImagePath] = useState('');
  const [descriptionImagePath, setDescriptionImagePath] = useState('');
  // Additional versions for meta-exercise creation
  const [extraVersions, setExtraVersions] = useState<Array<{ statement: string; description?: string; hints?: string; notes?: string; difficulty?: number; verifiable?: boolean; result?: string; statementImagePath?: string; descriptionImagePath?: string }>>([]);
  // Additional versions for meta-definition creation
  const [extraDefVersions, setExtraDefVersions] = useState<Array<{ prompt: string; description?: string; notes?: string; references?: string; type?: string; promptImagePath?: string; descriptionImagePath?: string }>>([]);
  const [selectedDefPrereqIds, setSelectedDefPrereqIds] = useState<number[]>([]);
  const [selectedExPrereqIds, setSelectedExPrereqIds] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [defPrereqWeights, setDefPrereqWeights] = useState<Record<number, number>>({});
  const [exPrereqWeights, setExPrereqWeights] = useState<Record<number, number>>({});
  const [searchDef, setSearchDef] = useState('');
  const [searchEx, setSearchEx] = useState('');
  const hasInitializedRef = useRef(false);
  const lastTypeRef = useRef(type);

  useEffect(() => {
    if (!isOpen) {
      hasInitializedRef.current = false;
      lastTypeRef.current = type;
      return;
    }

    const typeChanged = lastTypeRef.current !== type;
    if (hasInitializedRef.current && !typeChanged) return;

    const defaultCode = type === 'exercise'
      ? getNextExerciseCode(existingCodes)
      : getNextDotCode(existingCodes);

    setCode(defaultCode);
    setName('');
    setDescription('');
    setNotes('');
    setStatement('');
    setHints('');
    setStatementImagePath('');
    setSolutionImagePath('');
    setDifficulty('3');
    setVerifiable(false);
    setResult('');
    setPrompt('');
    setVersionType('open_ended');
    setReferences('');
    setPromptImagePath('');
    setDescriptionImagePath('');
    setExtraDefVersions([]);
    setSelectedDefPrereqIds([]);
    setSelectedExPrereqIds([]);
    setError(null);
    setCodeError(null);
    setIsSubmitting(false);
    setDefPrereqWeights({});
    setExPrereqWeights({});
    setSearchDef('');
    setSearchEx('');
    hasInitializedRef.current = true;
    lastTypeRef.current = type;
  }, [isOpen, type, existingCodes]);

  // Check for duplicate code
  useEffect(() => {
    if (!code.trim()) {
      setCodeError(null);
      return;
    }

    if (existingCodes.has(code.trim())) {
      setCodeError('Code already exists in this domain. Please choose a different code.');
    } else {
      setCodeError(null);
    }
  }, [code, existingCodes]);

  // fix for the handlePrereqChange function to prevent duplicates:
  const handleDefPrereqChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedOptions = Array.from(e.target.selectedOptions)
      .map(option => parseInt(option.value, 10)) // Values are now numeric IDs
      .filter(id => !isNaN(id));
    
    // FIX: Remove duplicates using Set
    const uniqueSelectedOptions = [...new Set(selectedOptions)];
    setSelectedDefPrereqIds(uniqueSelectedOptions);
    
    // Initialize weights for newly selected prerequisites
    const newWeights: Record<number, number> = {};
    uniqueSelectedOptions.forEach(id => {
      newWeights[id] = defPrereqWeights[id] || 1.0; // Default to 1.0
    });
    setDefPrereqWeights(newWeights);
  };

  const handleDefWeightChange = (prereqId: number, weight: string) => {
    const numWeight = parseFloat(weight) || 1.0;
    const clampedWeight = Math.max(0.01, Math.min(1.0, numWeight)); // Clamp between 0.01 and 1.0
    setDefPrereqWeights(prev => ({
      ...prev,
      [prereqId]: clampedWeight
    }));
  };

  const handleExPrereqChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedOptions = Array.from(e.target.selectedOptions)
      .map(option => parseInt(option.value, 10))
      .filter(id => !isNaN(id));
    const unique = [...new Set(selectedOptions)];
    setSelectedExPrereqIds(unique);
    const newW: Record<number, number> = {};
    unique.forEach(id => { newW[id] = exPrereqWeights[id] || 1.0; });
    setExPrereqWeights(newW);
  };

  const handleExWeightChange = (prereqId: number, weight: string) => {
    const numWeight = parseFloat(weight) || 1.0;
    const clampedWeight = Math.max(0.01, Math.min(1.0, numWeight));
    setExPrereqWeights(prev => ({ ...prev, [prereqId]: clampedWeight }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (!code.trim() || !name.trim()) {
        throw new Error('Code and Name are required');
      }

      // Check for duplicate code before submitting
      if (existingCodes.has(code.trim())) {
        throw new Error('Code already exists in this domain. Please choose a different code.');
      }

      const currentCenter = getGraphCenter ? getGraphCenter() : position;
      const spawnPosition = currentCenter && (currentCenter.x !== 0 || currentCenter.y !== 0)
        ? currentCenter
        : position;

      if (type === 'definition') {
        // Use createMetaDefinition instead of legacy createDefinition
        const metaDefData: any = {
          code: code.trim(),
          name: name.trim(),
          xPosition: spawnPosition?.x,
          yPosition: spawnPosition?.y,
          // Concept prerequisites will be attached via SRS API after creation
        };
        // Include initial version only if user provided any fields; default prompt to "Define <Name>" if needed
        const anyVersionField = [prompt, description, notes, references, promptImagePath, descriptionImagePath]
          .some(v => (v || '').trim().length > 0);
        if (anyVersionField) {
          const effectivePrompt = (prompt || '').trim() || (name.trim() ? `Define ${name.trim()}` : 'Define the concept');
          metaDefData.initialVersion = {
            prompt: effectivePrompt,
            type: versionType,
            description: description.trim() || undefined,
            notes: notes.trim() || undefined,
            references: references.trim() ? references.split(',').map(r => r.trim()).filter(r => r) : undefined,
            promptImagePath: promptImagePath || undefined,
            descriptionImagePath: descriptionImagePath || undefined,
          };
        }
        const response = await createMetaDefinition(domainId, metaDefData);
        // Attach concept prerequisites (meta_definition -> meta_definition) via SRS API
        if (selectedDefPrereqIds.length > 0) {
          const { createPrerequisite } = await import('@/lib/srs-api');
          for (const defId of selectedDefPrereqIds) {
            await createPrerequisite({
              nodeId: (response as any).id,
              nodeType: 'meta_definition',
              prerequisiteId: defId,
              prerequisiteType: 'meta_definition',
              weight: defPrereqWeights[defId] ?? 1.0,
              isManual: true,
            });
          }
        }
        // Add extra definition versions, if any
        for (const v of extraDefVersions) {
          const effPrompt = (v.prompt || '').trim();
          if (!effPrompt) continue;
          const payload: any = {
            prompt: effPrompt,
            type: v.type || 'open_ended',
            description: v.description?.trim() || undefined,
            notes: v.notes?.trim() || undefined,
            references: v.references?.split(',').map(r => r.trim()).filter(Boolean) || undefined,
            promptImagePath: v.promptImagePath || undefined,
            descriptionImagePath: v.descriptionImagePath || undefined,
          };
          await addMetaDefinitionVersion((response as any).id, payload);
        }
        // Fetch fresh meta-definition including new prerequisites and versions for surgical insert
        let enriched = response as any;
        try {
          enriched = await getMetaDefinition((response as any).id);
        } catch (e) {
          console.warn('Could not fetch fresh meta-definition; using original response.');
        }
        onSuccess(enriched.code, enriched as any);
      } else {
        if (!statement.trim()) throw new Error('Statement is required for the initial version');
        const response = await createMetaExercise(domainId, {
          code: code.trim(),
          name: name.trim(),
          xPosition: spawnPosition?.x,
          yPosition: spawnPosition?.y,
          // Prerequisites will be attached via SRS API after creation
          initialVersion: {
            statement: statement.trim(),
            description: description.trim() || undefined,
            notes: notes.trim() || undefined,
            hints: hints.trim() || undefined,
            difficulty: parseInt(difficulty, 10) || 3,
            verifiable,
            result: verifiable ? (result.trim() || undefined) : undefined,
            statementImagePath: statementImagePath || undefined,
            descriptionImagePath: solutionImagePath || undefined,
          }
        });
        // Attach concept prerequisites (meta_exercise -> meta_definition) via SRS API
        if (selectedDefPrereqIds.length > 0) {
          const { createPrerequisite } = await import('@/lib/srs-api');
          for (const defId of selectedDefPrereqIds) {
            await createPrerequisite({
              nodeId: (response as any).id,
              nodeType: 'meta_exercise',
              prerequisiteId: defId,
              prerequisiteType: 'meta_definition',
              weight: defPrereqWeights[defId] ?? 1.0,
              isManual: true,
            });
          }
        }
        // Attach exercise prerequisites (meta_exercise -> meta_exercise) via SRS API
        if (selectedExPrereqIds.length > 0) {
          const { createPrerequisite } = await import('@/lib/srs-api');
          for (const exId of selectedExPrereqIds) {
            await createPrerequisite({
              nodeId: (response as any).id,
              nodeType: 'meta_exercise',
              prerequisiteId: exId,
              prerequisiteType: 'meta_exercise',
              weight: exPrereqWeights[exId] ?? 1.0,
              isManual: true,
            });
          }
        }
        // Add extra versions, if any
        for (const v of extraVersions) {
          const payload = {
            ...v,
            difficulty: typeof v.difficulty === 'number' && v.difficulty >= 1 && v.difficulty <= 7 ? v.difficulty : 3,
          };
          await addMetaExerciseVersion((response as any).id, payload);
        }
        // Fetch the fresh meta-exercise including new exercise prerequisites for surgical insert
        let enriched = response as any;
        try {
          enriched = await getMetaExercise((response as any).id);
        } catch (e) {
          // fallback to original response if fetch fails
          console.warn('Could not fetch fresh meta after creating prerequisites; using original response.');
        }
        onSuccess(enriched.code, enriched);
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
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g., CALC_DERIV"
                required
                disabled={isSubmitting}
                className={`text-sm ${codeError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
                aria-invalid={!!codeError}
              />
              {codeError ? (
                <p className="text-xs text-red-600 mt-1">{codeError}</p>
              ) : (
                <p className="text-xs text-gray-500 mt-1">Unique identifier (no spaces recommended).</p>
              )}
            </div>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Derivative Definition" required disabled={isSubmitting} className="text-sm"/>
            </div>
          </div>
          {type === 'exercise' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">Additional Versions</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setExtraVersions(v => [...v, { statement: '', difficulty: 3 }])}
                  disabled={isSubmitting}
                >
                  Add Another Version
                </Button>
              </div>
              {extraVersions.map((v, idx) => (
                <div key={`extra-v-${idx}`} className="p-2 border rounded">
                  <MarkdownPreviewField
                    id={`extra-ex-statement-${idx}`}
                    label="Statement"
                    value={v.statement}
                    onChange={(value) => setExtraVersions(arr => {
                      const copy = [...arr];
                      copy[idx] = { ...copy[idx], statement: value };
                      return copy;
                    })}
                    rows={3}
                    labelClassName="text-xs font-medium text-gray-600"
                    textareaClassName="w-full border rounded px-2 py-1 text-sm"
                    previewClassName="p-2 border rounded bg-gray-50 text-sm"
                    buttonClassName="h-5 text-[10px] px-1"
                  />
                  <div className="mt-2">
                    <ImageUploadField
                      label="Statement Image"
                      imagePath={v.statementImagePath}
                      disabled={isSubmitting}
                      onUpload={async (file) => {
                        const { imagePath } = await uploadNodeImage({
                          file,
                          domainId,
                          nodeType: 'exercise',
                          field: 'statement',
                        });
                        return imagePath;
                      }}
                      onChange={(path) => setExtraVersions(arr => {
                        const copy = [...arr];
                        copy[idx] = { ...copy[idx], statementImagePath: path };
                        return copy;
                      })}
                      onClear={() => setExtraVersions(arr => {
                        const copy = [...arr];
                        copy[idx] = { ...copy[idx], statementImagePath: '' };
                        return copy;
                      })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div>
                      <MarkdownPreviewField
                        id={`extra-ex-solution-${idx}`}
                        label="Solution"
                        value={v.description || ''}
                        onChange={(value) => setExtraVersions(arr => {
                          const copy = [...arr];
                          copy[idx] = { ...copy[idx], description: value };
                          return copy;
                        })}
                        rows={2}
                        labelClassName="text-xs font-medium text-gray-600"
                        textareaClassName="w-full border rounded px-2 py-1 text-sm"
                        previewClassName="p-2 border rounded bg-gray-50 text-sm"
                        buttonClassName="h-5 text-[10px] px-1"
                      />
                    </div>
                    <div>
                      <MarkdownPreviewField
                        id={`extra-ex-hints-${idx}`}
                        label="Hints"
                        value={v.hints || ''}
                        onChange={(value) => setExtraVersions(arr => {
                          const copy = [...arr];
                          copy[idx] = { ...copy[idx], hints: value };
                          return copy;
                        })}
                        rows={2}
                        labelClassName="text-xs font-medium text-gray-600"
                        textareaClassName="w-full border rounded px-2 py-1 text-sm"
                        previewClassName="p-2 border rounded bg-gray-50 text-sm"
                        buttonClassName="h-5 text-[10px] px-1"
                      />
                    </div>
                  </div>
                  <div className="mt-2">
                    <ImageUploadField
                      label="Solution Image"
                      imagePath={v.descriptionImagePath}
                      disabled={isSubmitting}
                      onUpload={async (file) => {
                        const { imagePath } = await uploadNodeImage({
                          file,
                          domainId,
                          nodeType: 'exercise',
                          field: 'description',
                        });
                        return imagePath;
                      }}
                      onChange={(path) => setExtraVersions(arr => {
                        const copy = [...arr];
                        copy[idx] = { ...copy[idx], descriptionImagePath: path };
                        return copy;
                      })}
                      onClear={() => setExtraVersions(arr => {
                        const copy = [...arr];
                        copy[idx] = { ...copy[idx], descriptionImagePath: '' };
                        return copy;
                      })}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    <div>
                      <label className="block text-xs font-medium mb-1 text-gray-600">Difficulty</label>
                      <Input type="number" min={1} max={7} value={String(v.difficulty ?? 3)} onChange={e => setExtraVersions(arr => { const copy = [...arr]; copy[idx] = { ...copy[idx], difficulty: parseInt(e.target.value,10) || 3 }; return copy; })} />
                    </div>
                    <div className="flex items-center mt-5">
                      <input type="checkbox" className="mr-2" checked={!!v.verifiable} onChange={e => setExtraVersions(arr => { const copy = [...arr]; copy[idx] = { ...copy[idx], verifiable: e.target.checked }; return copy; })} />
                      <span className="text-xs text-gray-600">Verifiable</span>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1 text-gray-600">Expected Result</label>
                      <Input value={v.result || ''} onChange={e => setExtraVersions(arr => { const copy = [...arr]; copy[idx] = { ...copy[idx], result: e.target.value }; return copy; })} />
                    </div>
                  </div>
                  <div className="text-right mt-2">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setExtraVersions(arr => arr.filter((_, i) => i !== idx))}>Remove</Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {type === 'definition' ? (
            <>
              <MarkdownPreviewField
                id="prompt"
                label="Prompt"
                value={prompt}
                onChange={setPrompt}
                rows={3}
                placeholder={`Define ${name || 'the concept'}`}
                disabled={isSubmitting}
                helperText="The question/prompt to display during reviews"
              />
              <ImageUploadField
                label="Prompt Image"
                helperText="Supports one image per prompt."
                imagePath={promptImagePath}
                disabled={isSubmitting}
                onUpload={async (file) => {
                  const { imagePath } = await uploadNodeImage({
                    file,
                    domainId,
                    nodeType: 'definition',
                    field: 'prompt',
                  });
                  return imagePath;
                }}
                onChange={setPromptImagePath}
                onClear={() => setPromptImagePath('')}
              />
              <div>
                <label htmlFor="versionType" className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  id="versionType"
                  value={versionType}
                  onChange={(e) => setVersionType(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
                  disabled={isSubmitting}
                >
                  <option value="open_ended">Open Ended</option>
                </select>
              </div>
              <MarkdownPreviewField
                id="description"
                label="Description (Optional)"
                value={description}
                onChange={setDescription}
                rows={4}
                placeholder="Additional context or explanation..."
                disabled={isSubmitting}
                helperText={'Supports LaTeX notation: $x^2$, $$\\sum_{i=0}^n i$$'}
              />
              <ImageUploadField
                label="Description Image"
                helperText="Supports one image per description."
                imagePath={descriptionImagePath}
                disabled={isSubmitting}
                onUpload={async (file) => {
                  const { imagePath } = await uploadNodeImage({
                    file,
                    domainId,
                    nodeType: 'definition',
                    field: 'description',
                  });
                  return imagePath;
                }}
                onChange={setDescriptionImagePath}
                onClear={() => setDescriptionImagePath('')}
              />
              <MarkdownPreviewField
                id="notes"
                label="Notes (Optional)"
                value={notes}
                onChange={setNotes}
                rows={2}
                placeholder="Internal notes..."
                disabled={isSubmitting}
              />
              <div>
                <label htmlFor="references" className="block text-sm font-medium text-gray-700 mb-1">References (Optional)</label>
                <Input
                  id="references"
                  value={references}
                  onChange={(e) => setReferences(e.target.value)}
                  placeholder="URL1, URL2, URL3"
                  disabled={isSubmitting}
                  className="text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">Comma-separated URLs or references</p>
              </div>
              {/* Additional definition versions */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Additional Versions</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setExtraDefVersions(v => [...v, { prompt: '' }])}
                    disabled={isSubmitting}
                  >
                    Add Another Version
                  </Button>
                </div>
                {extraDefVersions.map((v, idx) => (
                  <div key={`extra-def-v-${idx}`} className="p-2 border rounded">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <MarkdownPreviewField
                          id={`extra-def-prompt-${idx}`}
                          label="Prompt *"
                          value={v.prompt}
                          onChange={(value) => setExtraDefVersions(arr => {
                            const copy = [...arr];
                            copy[idx] = { ...copy[idx], prompt: value };
                            return copy;
                          })}
                          rows={2}
                          labelClassName="text-xs font-medium text-gray-600"
                          textareaClassName="w-full border rounded px-2 py-1 text-sm"
                          previewClassName="p-2 border rounded bg-gray-50 text-sm"
                          buttonClassName="h-5 text-[10px] px-1"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1 text-gray-600">Type</label>
                        <select
                          className="w-full border rounded px-2 py-1 text-sm"
                          value={v.type || 'open_ended'}
                          onChange={e => setExtraDefVersions(arr => { const copy = [...arr]; copy[idx] = { ...copy[idx], type: e.target.value }; return copy; })}
                        >
                          <option value="open_ended">Open Ended</option>
                        </select>
                      </div>
                    </div>
                    <div className="mt-2">
                      <ImageUploadField
                        label="Prompt Image"
                        imagePath={v.promptImagePath}
                        disabled={isSubmitting}
                        onUpload={async (file) => {
                          const { imagePath } = await uploadNodeImage({
                            file,
                            domainId,
                            nodeType: 'definition',
                            field: 'prompt',
                          });
                          return imagePath;
                        }}
                        onChange={(path) => setExtraDefVersions(arr => {
                          const copy = [...arr];
                          copy[idx] = { ...copy[idx], promptImagePath: path };
                          return copy;
                        })}
                        onClear={() => setExtraDefVersions(arr => {
                          const copy = [...arr];
                          copy[idx] = { ...copy[idx], promptImagePath: '' };
                          return copy;
                        })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <div>
                        <MarkdownPreviewField
                          id={`extra-def-description-${idx}`}
                          label="Definition (Description)"
                          value={v.description || ''}
                          onChange={(value) => setExtraDefVersions(arr => {
                            const copy = [...arr];
                            copy[idx] = { ...copy[idx], description: value };
                            return copy;
                          })}
                          rows={3}
                          labelClassName="text-xs font-medium text-gray-600"
                          textareaClassName="w-full border rounded px-2 py-1 text-sm"
                          previewClassName="p-2 border rounded bg-gray-50 text-sm"
                          buttonClassName="h-5 text-[10px] px-1"
                        />
                      </div>
                      <div>
                        <MarkdownPreviewField
                          id={`extra-def-notes-${idx}`}
                          label="Notes"
                          value={v.notes || ''}
                          onChange={(value) => setExtraDefVersions(arr => {
                            const copy = [...arr];
                            copy[idx] = { ...copy[idx], notes: value };
                            return copy;
                          })}
                          rows={3}
                          labelClassName="text-xs font-medium text-gray-600"
                          textareaClassName="w-full border rounded px-2 py-1 text-sm"
                          previewClassName="p-2 border rounded bg-gray-50 text-sm"
                          buttonClassName="h-5 text-[10px] px-1"
                        />
                      </div>
                    </div>
                    <div className="mt-2">
                      <ImageUploadField
                        label="Description Image"
                        imagePath={v.descriptionImagePath}
                        disabled={isSubmitting}
                        onUpload={async (file) => {
                          const { imagePath } = await uploadNodeImage({
                            file,
                            domainId,
                            nodeType: 'definition',
                            field: 'description',
                          });
                          return imagePath;
                        }}
                        onChange={(path) => setExtraDefVersions(arr => {
                          const copy = [...arr];
                          copy[idx] = { ...copy[idx], descriptionImagePath: path };
                          return copy;
                        })}
                        onClear={() => setExtraDefVersions(arr => {
                          const copy = [...arr];
                          copy[idx] = { ...copy[idx], descriptionImagePath: '' };
                          return copy;
                        })}
                      />
                    </div>
                    <div className="mt-1">
                      <label className="block text-xs font-medium mb-1 text-gray-600">References (comma-separated)</label>
                      <Input className="text-sm" value={v.references || ''} onChange={e => setExtraDefVersions(arr => { const copy = [...arr]; copy[idx] = { ...copy[idx], references: e.target.value }; return copy; })} />
                    </div>
                    <div className="text-right mt-2">
                      <Button type="button" size="sm" variant="ghost" onClick={() => setExtraDefVersions(arr => arr.filter((_, i) => i !== idx))}>Remove</Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <MarkdownPreviewField
                id="statement"
                label="Problem Statement *"
                value={statement}
                onChange={setStatement}
                rows={4}
                placeholder="Exercise statement..."
                required
                disabled={isSubmitting}
                helperText={'Supports LaTeX notation: $x^2$, $$\\sum_{i=0}^n i$$'}
              />
              <ImageUploadField
                label="Statement Image"
                helperText="Supports one image per statement."
                imagePath={statementImagePath}
                disabled={isSubmitting}
                onUpload={async (file) => {
                  const { imagePath } = await uploadNodeImage({
                    file,
                    domainId,
                    nodeType: 'exercise',
                    field: 'statement',
                  });
                  return imagePath;
                }}
                onChange={setStatementImagePath}
                onClear={() => setStatementImagePath('')}
              />
              <MarkdownPreviewField
                id="solution"
                label="Solution / Explanation (Optional)"
                value={description}
                onChange={setDescription}
                rows={4}
                placeholder="Solution details..."
                disabled={isSubmitting}
                helperText="Supports LaTeX notation."
              />
              <ImageUploadField
                label="Solution Image"
                helperText="Supports one image per solution."
                imagePath={solutionImagePath}
                disabled={isSubmitting}
                onUpload={async (file) => {
                  const { imagePath } = await uploadNodeImage({
                    file,
                    domainId,
                    nodeType: 'exercise',
                    field: 'description',
                  });
                  return imagePath;
                }}
                onChange={setSolutionImagePath}
                onClear={() => setSolutionImagePath('')}
              />
              <MarkdownPreviewField
                id="hints"
                label="Hints (Optional)"
                value={hints}
                onChange={setHints}
                rows={2}
                placeholder="Optional hints..."
                disabled={isSubmitting}
              />
              <MarkdownPreviewField
                id="exerciseNotes"
                label="Notes (Optional)"
                value={notes}
                onChange={setNotes}
                rows={3}
                placeholder="Additional notes about this exercise..."
                disabled={isSubmitting}
              />
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

          {/* Prerequisites with search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prerequisites</label>
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-600">Definitions</span>
                <Input placeholder="Search definitions..." value={searchDef} onChange={(e)=> setSearchDef(e.target.value)} className="h-8 text-sm w-48" />
              </div>
              <select
                id="prerequisites_defs"
                multiple
                className="w-full border border-gray-300 rounded-md px-3 py-2 h-28 text-sm bg-white"
                value={selectedDefPrereqIds.map(String)}
                onChange={handleDefPrereqChange}
                disabled={isSubmitting || availableDefinitionPrerequisites.length === 0}
              >
                {availableDefinitionPrerequisites
                  .filter(p => (p.code + ' ' + p.name).toLowerCase().includes(searchDef.toLowerCase()))
                  .map((prereq) => (
                    <option key={`def-${prereq.code}`} value={String(prereq.numericId)}>
                      {prereq.code}: {prereq.name}
                    </option>
                  ))}
              </select>
              {selectedDefPrereqIds.length > 0 && (
                <div className="mt-2 p-2 border rounded bg-gray-50">
                  <div className="space-y-2 max-h-28 overflow-y-auto">
                    {[...new Set(selectedDefPrereqIds)].map(id => {
                      const item = availableDefinitionPrerequisites.find(p => p.numericId === id);
                      if (!item) return null;
                      return (
                        <div key={`defw-${item.code}`} className="flex items-center justify-between text-xs">
                          <span className="truncate mr-2">{item.code}</span>
                          <input type="number" min="0.01" max="1.00" step="0.01" value={defPrereqWeights[id] || 1.0} onChange={(e)=> handleDefWeightChange(id, e.target.value)} className="w-16 px-1 py-0.5 border rounded" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            {type === 'exercise' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600">Exercises</span>
                  <Input placeholder="Search exercises..." value={searchEx} onChange={(e)=> setSearchEx(e.target.value)} className="h-8 text-sm w-48" />
                </div>
                <select
                  id="prerequisites_exercises"
                  multiple
                  className="w-full border border-gray-300 rounded-md px-3 py-2 h-28 text-sm bg-white"
                  value={selectedExPrereqIds.map(String)}
                  onChange={handleExPrereqChange}
                  disabled={isSubmitting || (availableExercisePrerequisites?.length || 0) === 0}
                >
                  {(availableExercisePrerequisites || [])
                    .filter(p => (p.code + ' ' + p.name).toLowerCase().includes(searchEx.toLowerCase()))
                    .map((prereq) => (
                      <option key={`ex-${prereq.code}`} value={String(prereq.numericId)}>
                        {prereq.code}: {prereq.name}
                      </option>
                    ))}
                </select>
                {selectedExPrereqIds.length > 0 && (
                  <div className="mt-2 p-2 border rounded bg-gray-50">
                    <div className="space-y-2 max-h-28 overflow-y-auto">
                      {[...new Set(selectedExPrereqIds)].map(id => {
                        const item = (availableExercisePrerequisites || []).find(p => p.numericId === id);
                        if (!item) return null;
                        return (
                          <div key={`exw-${item.code}`} className="flex items-center justify-between text-xs">
                            <span className="truncate mr-2">{item.code}</span>
                            <input type="number" min="0.01" max="1.00" step="0.01" value={exPrereqWeights[id] || 1.0} onChange={(e)=> handleExWeightChange(id, e.target.value)} className="w-16 px-1 py-0.5 border rounded" />
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Exercise prerequisites are linked after creation.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t mt-6">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting || !!codeError} variant={isSubmitting ? "secondary" : "default"}>
              {isSubmitting ? 'Creating...' : `Create ${type === 'definition' ? 'Definition' : 'Exercise'}`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NodeCreationModal;
