"use client";

import React, { useState } from 'react';
import { Input } from "@/app/components/core/input";
import type { MetaExercise, ExerciseVersion } from '@/lib/api';
import { uploadNodeImage } from '@/lib/api';
import { showToast } from '@/app/components/core/ToastNotification';
import ImageUploadField from '../components/ImageUploadField';
import MarkdownPreviewField from '../components/MarkdownPreviewField';

interface Props {
  meta: MetaExercise;
  codeDraft?: string;
  onAddVersion?: (v: Partial<ExerciseVersion> & { statement: string }) => Promise<void>;
  onUpdateVersion?: (id: number, v: Partial<ExerciseVersion>) => Promise<void>;
  onDeleteVersion?: (id: number) => Promise<void>;
  onUpdateMeta?: (payload: { name?: string; code?: string }) => Promise<void>;
  onBack?: () => void;
  initialActiveIndex?: number;
  onVersionDirtyChange?: (dirty: boolean) => void;
}

export interface MetaExerciseEditFormRef {
  saveVersion: () => Promise<void>;
}

const MetaExerciseEditForm = React.forwardRef<MetaExerciseEditFormRef, Props>(({
  meta,
  codeDraft,
  onAddVersion: _onAddVersion,
  onUpdateVersion,
  onDeleteVersion: _onDeleteVersion,
  onUpdateMeta,
  onBack: _onBack,
  initialActiveIndex,
  onVersionDirtyChange,
}, ref) => {
  const versions = meta.versions || [];
  const [active, setActive] = useState<number>(() => {
    if (versions.length === 0) return 0;
    if (initialActiveIndex === undefined) return 0;
    return Math.max(0, Math.min(initialActiveIndex, versions.length - 1));
  });
  const cur = versions[active];
  const [draft, setDraft] = useState<Partial<ExerciseVersion>>({});
  const [metaDraft, setMetaDraft] = useState({ name: meta.name });

  const val = React.useCallback(<K extends keyof ExerciseVersion>(key: K, fallback: any = ''): any => {
    const d: any = draft;
    if (d[key] !== undefined && d[key] !== null) return d[key];
    const c: any = cur;
    return (c && c[key] !== undefined && c[key] !== null) ? c[key] : fallback;
  }, [cur, draft]);

  const hasVersionChanges = React.useMemo(() => {
    if (!cur) return false;
    const changedKeys = Object.keys(draft) as Array<keyof ExerciseVersion>;
    if (changedKeys.length === 0) return false;
    return changedKeys.some((key) => {
      const nextValue = draft[key];
      const currentValue = cur[key];
      if (Array.isArray(nextValue) || Array.isArray(currentValue)) {
        return JSON.stringify(nextValue ?? []) !== JSON.stringify(currentValue ?? []);
      }
      return (nextValue ?? '') !== (currentValue ?? '');
    });
  }, [cur, draft]);

  const hasMetaChanges = React.useMemo(() => {
    if (!onUpdateMeta) return false;
    const effectiveCodeDraft = (codeDraft ?? meta.code).trim();
    return metaDraft.name.trim() !== meta.name || effectiveCodeDraft !== meta.code;
  }, [codeDraft, meta.code, meta.name, metaDraft.name, onUpdateMeta]);

  const performMetaSave = React.useCallback(async (payload: { name?: string; code?: string }) => {
    if (!onUpdateMeta) return;
    try {
      await onUpdateMeta(payload);
      showToast('Exercise updated', 'success');
    } catch (error: any) {
      showToast(error.message || 'Failed to update exercise', 'error');
      throw error;
    }
  }, [onUpdateMeta]);

  const handleSave = React.useCallback(async () => {
    const trimmedName = metaDraft.name.trim();
    const trimmedCode = (codeDraft ?? meta.code).trim();
    const shouldSaveMeta = !!onUpdateMeta && (trimmedName !== meta.name || trimmedCode !== meta.code);
    const shouldSaveVersion = !!cur && !!onUpdateVersion && hasVersionChanges;

    if (!shouldSaveMeta && !shouldSaveVersion) return;

    if (shouldSaveMeta && trimmedName === '') {
      showToast('Name cannot be empty', 'error');
      return;
    }
    if (shouldSaveMeta && trimmedCode === '') {
      showToast('Code cannot be empty', 'error');
      return;
    }

    let payload: Partial<ExerciseVersion> | null = null;
    if (shouldSaveVersion) {
      const statement = String(val('statement', '')).trim();
      if (!statement) {
        showToast('Statement is required', 'error');
        return;
      }
      payload = {
        statement,
        description: val('description', ''),
        hints: val('hints', ''),
        notes: val('notes', ''),
        difficulty: val('difficulty', 3),
        verifiable: val('verifiable', false),
        result: val('result', ''),
        statementImagePath: val('statementImagePath', ''),
        descriptionImagePath: val('descriptionImagePath', ''),
      };
    }

    if (shouldSaveMeta) {
      await performMetaSave({ name: trimmedName, code: trimmedCode });
    }

    if (shouldSaveVersion && payload && cur && onUpdateVersion) {
      await onUpdateVersion(cur.id, payload);
      setDraft({});
    }
  }, [
    codeDraft,
    cur,
    hasVersionChanges,
    meta.code,
    meta.name,
    metaDraft.name,
    onUpdateMeta,
    onUpdateVersion,
    performMetaSave,
    val,
  ]);

  React.useEffect(() => {
    setMetaDraft({ name: meta.name });
  }, [meta.name]);

  React.useEffect(() => {
    if (versions.length === 0) {
      setActive(0);
      setDraft({});
      return;
    }
    if (initialActiveIndex !== undefined) {
      const safeIndex = Math.max(0, Math.min(initialActiveIndex, versions.length - 1));
      setActive(safeIndex);
      setDraft({});
      return;
    }
    if (active >= versions.length) {
      setActive(versions.length - 1);
      setDraft({});
    }
  }, [active, initialActiveIndex, versions.length]);

  React.useEffect(() => {
    onVersionDirtyChange?.(hasVersionChanges || hasMetaChanges);
  }, [hasMetaChanges, hasVersionChanges, onVersionDirtyChange]);

  React.useImperativeHandle(ref, () => ({
    saveVersion: async () => {
      await handleSave();
    },
  }), [handleSave]);

  const statementImagePath = String(val('statementImagePath', '') || '').trim();
  const solutionImagePath = String(val('descriptionImagePath', '') || '').trim();
  const isVerifiable = !!val('verifiable', false);
  const markdownLabelClass = "text-xs font-medium text-gray-600";
  const markdownTextareaClass = "w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400";
  const markdownPreviewClass = "rounded-md border border-gray-200 bg-gray-50 p-3 text-sm";
  const markdownButtonClass = "h-6 px-1 text-xs";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_82px]">
        <div>
          <label className="text-xs font-medium text-gray-600">Name</label>
          <Input
            value={metaDraft.name}
            onChange={(e) => setMetaDraft(d => ({ ...d, name: e.target.value }))}
            placeholder="Exercise name"
            className="h-8 mt-1 px-2"
          />
        </div>
        <div className="max-w-[82px]">
          <label className="text-xs font-medium text-gray-600">Difficulty</label>
          <Input
            type="number"
            min={1}
            max={7}
            value={String(val('difficulty', 3))}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              const clamped = Number.isNaN(n) ? 3 : Math.max(1, Math.min(7, n));
              setDraft(d => ({ ...d, difficulty: clamped }));
            }}
            disabled={!cur}
            className="h-8 mt-1 px-2"
          />
        </div>
      </div>

      {!cur ? (
        <div className="text-xs text-gray-500">No versions available.</div>
      ) : (
        <>
          <div className={statementImagePath ? "grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : "grid grid-cols-1"}>
            <div className="min-w-0 rounded-md border border-gray-200 p-3">
              <MarkdownPreviewField
                label="Statement *"
                value={val('statement', '')}
                onChange={(value) => setDraft(d => ({ ...d, statement: value }))}
                rows={5}
                placeholder="Describe the exercise prompt..."
                labelClassName={markdownLabelClass}
                textareaClassName={markdownTextareaClass}
                previewClassName={markdownPreviewClass}
                buttonClassName={markdownButtonClass}
              />
              {!statementImagePath && (
                <div className="mt-3">
                  <ImageUploadField
                    compact
                    label="Statement Image"
                    helperText="Optional image for the statement."
                    imagePath={val('statementImagePath', '')}
                    onUpload={async (file) => {
                      const { imagePath } = await uploadNodeImage({
                        file,
                        domainId: meta.domainId,
                        nodeType: 'exercise',
                        field: 'statement',
                      });
                      return imagePath;
                    }}
                    onChange={(path) => setDraft(d => ({ ...d, statementImagePath: path }))}
                    onClear={() => setDraft(d => ({ ...d, statementImagePath: '' }))}
                  />
                </div>
              )}
            </div>
            {statementImagePath && (
              <div className="min-w-0 rounded-md border border-gray-200 p-2">
                <ImageUploadField
                  compact
                  label="Statement Image"
                  helperText="Optional image for the statement."
                  imagePath={val('statementImagePath', '')}
                  onUpload={async (file) => {
                    const { imagePath } = await uploadNodeImage({
                      file,
                      domainId: meta.domainId,
                      nodeType: 'exercise',
                      field: 'statement',
                    });
                    return imagePath;
                  }}
                  onChange={(path) => setDraft(d => ({ ...d, statementImagePath: path }))}
                  onClear={() => setDraft(d => ({ ...d, statementImagePath: '' }))}
                />
              </div>
            )}
          </div>

          <div className={solutionImagePath ? "grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : "grid grid-cols-1"}>
            <div className="min-w-0 rounded-md border border-gray-200 p-3">
              <MarkdownPreviewField
                label="Solution"
                value={val('description', '')}
                onChange={(value) => setDraft(d => ({ ...d, description: value }))}
                rows={5}
                placeholder="Solution walkthrough..."
                labelClassName={markdownLabelClass}
                textareaClassName={markdownTextareaClass}
                previewClassName={markdownPreviewClass}
                buttonClassName={markdownButtonClass}
              />
              {!solutionImagePath && (
                <div className="mt-3">
                  <ImageUploadField
                    compact
                    label="Solution Image"
                    helperText="Optional image for the solution."
                    imagePath={val('descriptionImagePath', '')}
                    onUpload={async (file) => {
                      const { imagePath } = await uploadNodeImage({
                        file,
                        domainId: meta.domainId,
                        nodeType: 'exercise',
                        field: 'description',
                      });
                      return imagePath;
                    }}
                    onChange={(path) => setDraft(d => ({ ...d, descriptionImagePath: path }))}
                    onClear={() => setDraft(d => ({ ...d, descriptionImagePath: '' }))}
                  />
                </div>
              )}
            </div>
            {solutionImagePath && (
              <div className="min-w-0 rounded-md border border-gray-200 p-2">
                <ImageUploadField
                  compact
                  label="Solution Image"
                  helperText="Optional image for the solution."
                  imagePath={val('descriptionImagePath', '')}
                  onUpload={async (file) => {
                    const { imagePath } = await uploadNodeImage({
                      file,
                      domainId: meta.domainId,
                      nodeType: 'exercise',
                      field: 'description',
                    });
                    return imagePath;
                  }}
                  onChange={(path) => setDraft(d => ({ ...d, descriptionImagePath: path }))}
                  onClear={() => setDraft(d => ({ ...d, descriptionImagePath: '' }))}
                />
              </div>
            )}
          </div>

          <div className="rounded-md border border-gray-200 p-3 space-y-3">
            {(() => {
              const chkId = `verifiable_v_${cur.id}`;
              return (
                <label htmlFor={chkId} className="flex items-center gap-2 text-xs font-medium text-gray-700">
                  <input
                    id={chkId}
                    type="checkbox"
                    checked={isVerifiable}
                    onChange={(e) => setDraft(d => ({ ...d, verifiable: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  Verifiable
                </label>
              );
            })()}
            {isVerifiable && (
              <MarkdownPreviewField
                label="Verifiable Answer (Used for automatic answer checking.)"
                value={val('result', '')}
                onChange={(value) => setDraft(d => ({ ...d, result: value }))}
                rows={5}
                placeholder="Exact expected answer for automatic checking..."
                labelClassName={markdownLabelClass}
                textareaClassName={markdownTextareaClass}
                previewClassName={markdownPreviewClass}
                buttonClassName={markdownButtonClass}
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-md border border-gray-200 p-3">
              <MarkdownPreviewField
                label="Hints"
                value={val('hints', '')}
                onChange={(value) => setDraft(d => ({ ...d, hints: value }))}
                rows={4}
                placeholder="Optional hints..."
                labelClassName={markdownLabelClass}
                textareaClassName={markdownTextareaClass}
                previewClassName={markdownPreviewClass}
                buttonClassName={markdownButtonClass}
              />
            </div>
            <div className="rounded-md border border-gray-200 p-3">
              <MarkdownPreviewField
                label="Notes"
                value={val('notes', '')}
                onChange={(value) => setDraft(d => ({ ...d, notes: value }))}
                rows={4}
                placeholder="Internal notes..."
                labelClassName={markdownLabelClass}
                textareaClassName={markdownTextareaClass}
                previewClassName={markdownPreviewClass}
                buttonClassName={markdownButtonClass}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
});

MetaExerciseEditForm.displayName = 'MetaExerciseEditForm';

export default MetaExerciseEditForm;
