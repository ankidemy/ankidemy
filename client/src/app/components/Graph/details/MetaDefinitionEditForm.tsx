"use client";

import React, { useState } from 'react';
import { Input } from "@/app/components/core/input";
import type { MetaDefinition, DefinitionVersion } from '@/lib/api';
import { uploadNodeImage } from '@/lib/api';
import { showToast } from '@/app/components/core/ToastNotification';
import ImageUploadField from '../components/ImageUploadField';
import MarkdownPreviewField from '../components/MarkdownPreviewField';

interface Props {
  meta: MetaDefinition;
  codeDraft?: string;
  onAddVersion?: (v: Partial<DefinitionVersion> & { prompt: string }) => Promise<void>;
  onUpdateVersion?: (id: number, v: Partial<DefinitionVersion>) => Promise<void>;
  onDeleteVersion?: (id: number) => Promise<void>;
  onUpdateMeta?: (payload: { name?: string; code?: string }) => Promise<void>;
  onBack?: () => void;
  initialActiveIndex?: number;
  onVersionDirtyChange?: (dirty: boolean) => void;
}

export interface MetaDefinitionEditFormRef {
  saveVersion: () => Promise<void>;
}

const MetaDefinitionEditForm = React.forwardRef<MetaDefinitionEditFormRef, Props>(({
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
  const [draft, setDraft] = useState<Partial<DefinitionVersion>>({});
  const [metaDraft, setMetaDraft] = useState({ name: meta.name });

  const val = React.useCallback(<K extends keyof DefinitionVersion>(key: K, fallback: any = ''): any => {
    const d: any = draft;
    if (d[key] !== undefined && d[key] !== null) return d[key];
    const c: any = cur;
    return (c && c[key] !== undefined && c[key] !== null) ? c[key] : fallback;
  }, [cur, draft]);

  const hasVersionChanges = React.useMemo(() => {
    if (!cur) return false;
    const changedKeys = Object.keys(draft) as Array<keyof DefinitionVersion>;
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
      showToast('Concept updated', 'success');
    } catch (error: any) {
      showToast(error.message || 'Failed to update concept', 'error');
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

    let payload: Partial<DefinitionVersion> | null = null;
    if (shouldSaveVersion) {
      const prompt = String(val('prompt', '')).trim();
      if (!prompt) {
        showToast('Prompt is required', 'error');
        return;
      }
      payload = {
        prompt,
        type: val('type', 'open_ended'),
        description: val('description', ''),
        notes: val('notes', ''),
        references: val('references', []),
        promptImagePath: val('promptImagePath', ''),
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

  const promptImagePath = String(val('promptImagePath', '') || '').trim();
  const descriptionImagePath = String(val('descriptionImagePath', '') || '').trim();
  const markdownLabelClass = "text-xs font-medium text-gray-600";
  const markdownTextareaClass = "w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400";
  const markdownPreviewClass = "rounded-md border border-gray-200 bg-gray-50 p-3 text-sm";
  const markdownButtonClass = "h-6 px-1 text-xs";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div>
          <label className="text-xs font-medium text-gray-600">Name</label>
          <Input
            value={metaDraft.name}
            onChange={(e) => setMetaDraft(d => ({ ...d, name: e.target.value }))}
            className="h-8 mt-1"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Type</label>
          <select
            value={val('type', 'open_ended')}
            onChange={(e) => setDraft(d => ({ ...d, type: e.target.value }))}
            className="mt-1 h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
          >
            <option value="open_ended">Open Ended</option>
          </select>
        </div>
      </div>

      {!cur ? (
        <div className="text-xs text-gray-500">No versions available.</div>
      ) : (
        <>
          <div className="rounded-md border border-gray-200 p-3">
            <div className={promptImagePath ? "grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : "grid grid-cols-1"}>
              <div className="min-w-0">
                <MarkdownPreviewField
                  label="Prompt * (Shown during reviews.)"
                  value={val('prompt', '')}
                  onChange={(value) => setDraft(d => ({ ...d, prompt: value }))}
                  rows={4}
                  placeholder="The review question to display..."
                  labelClassName={markdownLabelClass}
                  textareaClassName={markdownTextareaClass}
                  previewClassName={markdownPreviewClass}
                  buttonClassName={markdownButtonClass}
                />
                {!promptImagePath && (
                  <div className="mt-3">
                    <ImageUploadField
                      compact
                      label="Prompt Image"
                      helperText="Optional image for the prompt."
                      imagePath={val('promptImagePath', '')}
                      onUpload={async (file) => {
                        const { imagePath } = await uploadNodeImage({
                          file,
                          domainId: meta.domainId,
                          nodeType: 'definition',
                          field: 'prompt',
                        });
                        return imagePath;
                      }}
                      onChange={(path) => setDraft(d => ({ ...d, promptImagePath: path }))}
                      onClear={() => setDraft(d => ({ ...d, promptImagePath: '' }))}
                    />
                  </div>
                )}
              </div>
              {promptImagePath && (
                <div className="min-w-0 rounded-md border border-gray-200 p-2">
                  <ImageUploadField
                    compact
                    label="Prompt Image"
                    helperText="Optional image for the prompt."
                    imagePath={val('promptImagePath', '')}
                    onUpload={async (file) => {
                      const { imagePath } = await uploadNodeImage({
                        file,
                        domainId: meta.domainId,
                        nodeType: 'definition',
                        field: 'prompt',
                      });
                      return imagePath;
                    }}
                    onChange={(path) => setDraft(d => ({ ...d, promptImagePath: path }))}
                    onClear={() => setDraft(d => ({ ...d, promptImagePath: '' }))}
                  />
                </div>
              )}
            </div>
          </div>

          <div className={descriptionImagePath ? "grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : "grid grid-cols-1"}>
            <div className="min-w-0 rounded-md border border-gray-200 p-3">
              <MarkdownPreviewField
                label="Description (Supports Markdown and LaTeX.)"
                value={val('description', '')}
                onChange={(value) => setDraft(d => ({ ...d, description: value }))}
                rows={5}
                placeholder="Additional context or explanation..."
                labelClassName={markdownLabelClass}
                textareaClassName={markdownTextareaClass}
                previewClassName={markdownPreviewClass}
                buttonClassName={markdownButtonClass}
              />
              {!descriptionImagePath && (
                <div className="mt-3">
                  <ImageUploadField
                    compact
                    label="Description Image"
                    helperText="Optional image beside the description."
                    imagePath={val('descriptionImagePath', '')}
                    onUpload={async (file) => {
                      const { imagePath } = await uploadNodeImage({
                        file,
                        domainId: meta.domainId,
                        nodeType: 'definition',
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
            {descriptionImagePath && (
              <div className="min-w-0 rounded-md border border-gray-200 p-2">
                <ImageUploadField
                  compact
                  label="Description Image"
                  helperText="Optional image beside the description."
                  imagePath={val('descriptionImagePath', '')}
                  onUpload={async (file) => {
                    const { imagePath } = await uploadNodeImage({
                      file,
                      domainId: meta.domainId,
                      nodeType: 'definition',
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
            <MarkdownPreviewField
              label="Notes"
              value={val('notes', '')}
              onChange={(value) => setDraft(d => ({ ...d, notes: value }))}
              rows={3}
              placeholder="Internal notes..."
              labelClassName={markdownLabelClass}
              textareaClassName={markdownTextareaClass}
              previewClassName={markdownPreviewClass}
              buttonClassName={markdownButtonClass}
            />
            <div>
              <label className="text-xs font-medium text-gray-600">References (Comma-separated URLs.)</label>
              <Input
                value={(val('references', []) as string[]).join(', ')}
                onChange={(e) => {
                  const refs = e.target.value.split(',').map(r => r.trim()).filter(r => r);
                  setDraft(d => ({ ...d, references: refs }));
                }}
                placeholder="URL1, URL2, URL3"
                className="h-8 mt-1"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
});

MetaDefinitionEditForm.displayName = 'MetaDefinitionEditForm';

export default MetaDefinitionEditForm;
