// File: client/src/app/components/Graph/ImportDialog.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import { X, Upload, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { importToDomain, importDomainBackup, DomainExportData, standardizeImportData } from '@/lib/api';
import { showToast } from '@/app/components/core/ToastNotification';

interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  domainId: number;
  domainName: string;
  onSuccess?: () => void;
}

// Use the standardized export/import shape used by the API
type ImportData = DomainExportData;

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  definitionCount: number;
  metaDefinitionCount: number;
  exerciseCount: number;
  metaExerciseCount: number;
  sourceCount: number;
  questCount: number;
  relationCount: number;
  versionCount: number;
  definitionVersionCount: number;
  groupCount: number;
}

const STORAGE_KEY = 'ankidemy.import.onDuplicate';

const ImportDialog: React.FC<ImportDialogProps> = ({
  isOpen,
  onClose,
  domainId,
  domainName,
  onSuccess
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importData, setImportData] = useState<ImportData | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [isZipFile, setIsZipFile] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load persisted preference on mount
  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'rename' || saved === 'update') {
        setAllowDuplicates(saved === 'rename');
      }
    }
  }, [isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null);
      setImportData(null);
      setValidation(null);
      setIsValidating(false);
      setIsImporting(false);
      setIsZipFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [isOpen]);

  const validateImportData = (data: ImportData): ValidationResult => {
    const errors: string[] = [];
    let definitionCount = 0;
    let metaDefinitionCount = 0;
    let exerciseCount = 0;
    let metaExerciseCount = 0;
    let sourceCount = 0;
    let questCount = 0;
    let relationCount = 0;
    let versionCount = 0;
    let definitionVersionCount = 0;
    let groupCount = 0;

    // Collect all codes to check for duplicates within the import
    const allCodes = new Map<string, string>();

    // Validate metaDefinitions (preferred) or legacy definitions
    if (data.metaDefinitions && Object.keys(data.metaDefinitions).length > 0) {
      metaDefinitionCount = Object.keys(data.metaDefinitions).length;
      for (const [code, md] of Object.entries(data.metaDefinitions)) {
        if (!md.code) {
          errors.push(`MetaDefinition ${code} has empty code`);
        }
        if (!md.name) {
          errors.push(`MetaDefinition ${code} has empty name`);
        }
        if (!md.versions || md.versions.length === 0) {
          errors.push(`MetaDefinition ${code} has no versions`);
        } else {
          definitionVersionCount += md.versions.length;
          // Validate each version has a prompt
          md.versions.forEach((v, idx) => {
            if (!v.prompt) {
              errors.push(`MetaDefinition ${code} version ${idx} has empty prompt`);
            }
          });
        }

        const existingType = allCodes.get(md.code || code);
        if (existingType) {
          errors.push(`Duplicate code found: ${md.code || code} (${existingType} and metaDefinition)`);
        } else {
          allCodes.set(md.code || code, 'metaDefinition');
        }
      }
    } else if (data.definitions) {
      // Legacy definitions validation
      definitionCount = Object.keys(data.definitions).length;
      for (const [code, def] of Object.entries(data.definitions)) {
        if (!def.code) {
          errors.push(`Definition ${code} has empty code`);
        }
        if (!def.name) {
          errors.push(`Definition ${code} has empty name`);
        }
        if (!def.description || (Array.isArray(def.description) && def.description.length === 0)) {
          errors.push(`Definition ${code} has empty description`);
        }

        const existingType = allCodes.get(def.code || code);
        if (existingType) {
          errors.push(`Duplicate code found: ${def.code || code} (${existingType} and definition)`);
        } else {
          allCodes.set(def.code || code, 'definition');
        }
      }
    }

    // Validate metaExercises or legacy exercises
    if (data.metaExercises && Object.keys(data.metaExercises).length > 0) {
      metaExerciseCount = Object.keys(data.metaExercises).length;
      for (const [code, me] of Object.entries(data.metaExercises)) {
        if (!me.code) {
          errors.push(`MetaExercise ${code} has empty code`);
        }
        if (!me.name) {
          errors.push(`MetaExercise ${code} has empty name`);
        }
        if (!me.versions || me.versions.length === 0) {
          errors.push(`MetaExercise ${code} has no versions`);
        } else {
          versionCount += me.versions.length;
        }

        const existingType = allCodes.get(me.code || code);
        if (existingType) {
          errors.push(`Duplicate code found: ${me.code || code} (${existingType} and metaExercise)`);
        } else {
          allCodes.set(me.code || code, 'metaExercise');
        }
      }
    } else if (data.exercises) {
      exerciseCount = Object.keys(data.exercises).length;
      for (const [code, ex] of Object.entries(data.exercises)) {
        if (!ex.code) {
          errors.push(`Exercise ${code} has empty code`);
        }
        if (!ex.name) {
          errors.push(`Exercise ${code} has empty name`);
        }
        if (!ex.statement) {
          errors.push(`Exercise ${code} has empty statement`);
        }

        const existingType = allCodes.get(ex.code || code);
        if (existingType) {
          errors.push(`Duplicate code found: ${ex.code || code} (${existingType} and exercise)`);
        } else {
          allCodes.set(ex.code || code, 'exercise');
        }
      }
    }

    if (data.sources && Object.keys(data.sources).length > 0) {
      sourceCount = Object.keys(data.sources).length;
      for (const [code, src] of Object.entries(data.sources)) {
        if (!src.code) {
          errors.push(`Source ${code} has empty code`);
        }
        if (!src.title) {
          errors.push(`Source ${code} has empty title`);
        }
        const key = src.code || code;
        const existingType = allCodes.get(key);
        if (existingType) {
          errors.push(`Duplicate code found: ${key} (${existingType} and source)`);
        } else {
          allCodes.set(key, 'source');
        }
      }
    }

    if (data.metaQuests && Object.keys(data.metaQuests).length > 0) {
      questCount = Object.keys(data.metaQuests).length;
      for (const [code, mq] of Object.entries(data.metaQuests)) {
        if (!mq.code) {
          errors.push(`Quest ${code} has empty code`);
        }
        if (!mq.name) {
          errors.push(`Quest ${code} has empty name`);
        }
        if (!mq.versions || mq.versions.length === 0) {
          errors.push(`Quest ${code} has no versions`);
        }
        const key = mq.code || code;
        const existingType = allCodes.get(key);
        if (existingType) {
          errors.push(`Duplicate code found: ${key} (${existingType} and quest)`);
        } else {
          allCodes.set(key, 'quest');
        }
      }
    }

    if (Array.isArray(data.relations)) {
      relationCount = data.relations.length;
      data.relations.forEach((rel, idx) => {
        if (!rel.fromType || !rel.fromCode || !rel.toType || !rel.toCode) {
          errors.push(`Relation ${idx + 1} is missing required fields`);
          return;
        }
        if (!allCodes.has(rel.fromCode)) {
          errors.push(`Relation ${idx + 1} references unknown code ${rel.fromCode}`);
        }
        if (!allCodes.has(rel.toCode)) {
          errors.push(`Relation ${idx + 1} references unknown code ${rel.toCode}`);
        }
      });
    }

    if (Array.isArray(data.groups)) {
      groupCount = data.groups.length;
      data.groups.forEach((group, idx) => {
        if (!group.name) {
          errors.push(`Group ${idx + 1} has empty name`);
        }
        if (!group.seeds || group.seeds.length === 0) {
          errors.push(`Group ${group.name || idx + 1} has no seeds`);
        } else {
          group.seeds.forEach((seed) => {
            if (!seed.code) {
              errors.push(`Group ${group.name || idx + 1} has seed with empty code`);
            } else if (!allCodes.has(seed.code)) {
              errors.push(`Group ${group.name || idx + 1} references unknown code ${seed.code}`);
            }
          });
        }
        (group.members || []).forEach((member) => {
          if (!member.code) {
            errors.push(`Group ${group.name || idx + 1} has member with empty code`);
          } else if (!allCodes.has(member.code)) {
            errors.push(`Group ${group.name || idx + 1} references unknown code ${member.code}`);
          }
        });
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      definitionCount,
      metaDefinitionCount,
      exerciseCount,
      metaExerciseCount,
      sourceCount,
      questCount,
      relationCount,
      versionCount,
      definitionVersionCount,
      groupCount
    };
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      setImportData(null);
      setValidation(null);
      setIsZipFile(false);
      return;
    }

    setSelectedFile(file);
    const isZip = file.name.toLowerCase().endsWith('.zip');
    setIsZipFile(isZip);

    if (isZip) {
      setImportData(null);
      setValidation({
        isValid: true,
        errors: [],
        definitionCount: 0,
        metaDefinitionCount: 0,
        exerciseCount: 0,
        metaExerciseCount: 0,
        sourceCount: 0,
        questCount: 0,
        relationCount: 0,
        versionCount: 0,
        definitionVersionCount: 0,
        groupCount: 0,
      });
      return;
    }

    setIsValidating(true);

    try {
      const text = await file.text();
      const raw = JSON.parse(text) as any;
      const standardized: ImportData = standardizeImportData(raw);
      setImportData(standardized);
      const validationResult = validateImportData(standardized);
      setValidation(validationResult);
    } catch (error) {
      setValidation({
        isValid: false,
        errors: [`Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`],
        definitionCount: 0,
        metaDefinitionCount: 0,
        exerciseCount: 0,
        metaExerciseCount: 0,
        sourceCount: 0,
        questCount: 0,
        relationCount: 0,
        versionCount: 0,
        definitionVersionCount: 0,
        groupCount: 0
      });
      setImportData(null);
    } finally {
      setIsValidating(false);
    }
  };

  const handleImport = async () => {
    if ((!isZipFile && (!importData || !validation?.isValid)) || !selectedFile) return;

    setIsImporting(true);

    try {
      if (isZipFile) {
        await importDomainBackup(domainId, selectedFile);
      } else {
        const strategy = allowDuplicates ? 'rename' : 'update';
        // Save preference
        localStorage.setItem(STORAGE_KEY, strategy);

        await importToDomain(domainId, importData as ImportData, { onDuplicate: strategy });
      }

      showToast(`Successfully imported data into "${domainName}"`, 'success');
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Import failed:', error);
      showToast(
        error instanceof Error ? error.message : 'Failed to import data',
        'error'
      );
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center border-b p-4">
          <h2 className="text-xl font-bold">Import Domain File</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={isImporting}
          >
            <X size={18} />
          </Button>
        </div>

        <div className="p-6 space-y-4">
          {/* File Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select JSON or ZIP File *
            </label>
            <div className="flex items-center gap-2">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".json,.zip"
                onChange={handleFileChange}
                disabled={isImporting}
                className="flex-1"
              />
              {isValidating && (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-900"></div>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Import JSON graph data or a full ZIP backup
            </p>
          </div>

          {/* Validation Summary */}
          {validation && (
            <div className={`p-4 rounded-md ${validation.isValid ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className="flex items-start gap-2">
                {validation.isValid ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1">
                  {validation.isValid ? (
                    <div>
                      <p className="text-sm font-medium text-green-800 mb-2">
                        {isZipFile ? 'ZIP backup ready to import' : 'File is valid and ready to import'}
                      </p>
                      {!isZipFile && (
                        <div className="text-xs text-green-700 space-y-1">
                          {validation.metaDefinitionCount > 0 ? (
                            <>
                              <p>• {validation.metaDefinitionCount} concept pool{validation.metaDefinitionCount !== 1 ? 's' : ''} (meta-definitions)</p>
                              <p>• {validation.definitionVersionCount} definition version{validation.definitionVersionCount !== 1 ? 's' : ''}</p>
                            </>
                          ) : validation.definitionCount > 0 ? (
                            <p>• {validation.definitionCount} definition{validation.definitionCount !== 1 ? 's' : ''} (legacy format)</p>
                          ) : null}
                          {validation.metaExerciseCount > 0 ? (
                            <>
                              <p>• {validation.metaExerciseCount} exercise pool{validation.metaExerciseCount !== 1 ? 's' : ''} (meta-exercises)</p>
                              <p>• {validation.versionCount} exercise version{validation.versionCount !== 1 ? 's' : ''}</p>
                            </>
                          ) : validation.exerciseCount > 0 ? (
                            <p>• {validation.exerciseCount} exercise{validation.exerciseCount !== 1 ? 's' : ''} (legacy format)</p>
                          ) : null}
                          {validation.sourceCount > 0 && (
                            <p>• {validation.sourceCount} source{validation.sourceCount !== 1 ? 's' : ''}</p>
                          )}
                          {validation.questCount > 0 && (
                            <p>• {validation.questCount} quest{validation.questCount !== 1 ? 's' : ''}</p>
                          )}
                          {validation.relationCount > 0 && (
                            <p>• {validation.relationCount} relation{validation.relationCount !== 1 ? 's' : ''}</p>
                          )}
                          {validation.groupCount > 0 && (
                            <p>• {validation.groupCount} group{validation.groupCount !== 1 ? 's' : ''}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium text-red-800 mb-2">Validation errors:</p>
                      <ul className="text-xs text-red-700 space-y-1 list-disc list-inside">
                        {validation.errors.map((error, idx) => (
                          <li key={idx}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Duplicate Strategy Checkbox */}
          {!isZipFile && (
            <div className="border-t pt-4">
              <div className="flex items-start gap-3">
                <input
                  id="allowDuplicates"
                  type="checkbox"
                  checked={allowDuplicates}
                  onChange={(e) => setAllowDuplicates(e.target.checked)}
                  disabled={isImporting}
                  className="mt-1 h-4 w-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <label htmlFor="allowDuplicates" className="text-sm font-medium text-gray-700 cursor-pointer">
                      Allow duplicate codes (auto-rename)
                    </label>
                    <button
                      type="button"
                      onMouseEnter={() => setShowTooltip(true)}
                      onMouseLeave={() => setShowTooltip(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Info size={16} />
                    </button>
                  </div>
                  {showTooltip && (
                    <div className="mt-2 p-3 bg-gray-100 rounded text-xs text-gray-700 space-y-2">
                      <p>
                        <strong>Checked:</strong> Existing nodes keep their content. Imported nodes with the same code are added as new with a numeric suffix (.1, .2, etc.).
                      </p>
                      <p>
                        <strong>Unchecked:</strong> Existing nodes with the same code and type are updated with imported content. If a same-code node of a different type exists, the import is added with a numeric suffix.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 p-4 border-t bg-gray-50">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isImporting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!validation?.isValid || isImporting || !selectedFile}
            className="min-w-[100px]"
          >
            {isImporting ? (
              <span className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Importing...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Upload size={16} />
                Import
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ImportDialog;
