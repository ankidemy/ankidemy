"use client";

import React, { useState } from 'react';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import type { MetaDefinition, DefinitionVersion } from '@/lib/api';
import { uploadNodeImage } from '@/lib/api';
import { showToast } from '@/app/components/core/ToastNotification';
import ImageUploadField from '../components/ImageUploadField';
import MarkdownPreviewField from '../components/MarkdownPreviewField';

interface Props {
  meta: MetaDefinition;
  onAddVersion?: (v: Partial<DefinitionVersion> & { prompt: string }) => Promise<void>;
  onUpdateVersion?: (id: number, v: Partial<DefinitionVersion>) => Promise<void>;
  onDeleteVersion?: (id: number) => Promise<void>;
  onUpdateMeta?: (payload: { name?: string }) => Promise<void>;
  onBack?: () => void;
  initialActiveIndex?: number;
  onVersionDirtyChange?: (dirty: boolean) => void;
}

export interface MetaDefinitionEditFormRef {
  saveVersion: () => Promise<void>;
}

const MetaDefinitionEditForm = React.forwardRef<MetaDefinitionEditFormRef, Props>(({
  meta,
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

  const handleSave = React.useCallback(async () => {
    if (!cur || !onUpdateVersion || !hasVersionChanges) return;
    const prompt = String(val('prompt', '')).trim();
    if (!prompt) {
      showToast('Prompt is required', 'error');
      return;
    }
    const payload: Partial<DefinitionVersion> = {
      prompt,
      type: val('type', 'open_ended'),
      description: val('description', ''),
      notes: val('notes', ''),
      references: val('references', []),
      promptImagePath: val('promptImagePath', ''),
      descriptionImagePath: val('descriptionImagePath', ''),
    };
    await onUpdateVersion(cur.id, payload);
    setDraft({});
  }, [cur, hasVersionChanges, onUpdateVersion, val]);

  const [metaDraft, setMetaDraft] = useState({ name: meta.name });

  const performMetaSave = async (payload: { name?: string }) => {
    if (!onUpdateMeta) return;
    try {
      await onUpdateMeta(payload);
      showToast('Concept updated', 'success');
    } catch (error: any) {
      showToast(error.message || 'Failed to update concept', 'error');
    }
  };

  const handleMetaSave = async () => {
    if (!onUpdateMeta) return;

    const payload: { name?: string } = {};
    if (metaDraft.name.trim() !== meta.name) {
      if (metaDraft.name.trim() === '') {
        showToast('Name cannot be empty', 'error');
        return;
      }
      payload.name = metaDraft.name.trim();
    }

    if (Object.keys(payload).length === 0) {
      showToast('No changes to save', 'info');
      return;
    }

    await performMetaSave(payload);
  };

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
    onVersionDirtyChange?.(hasVersionChanges);
  }, [hasVersionChanges, onVersionDirtyChange]);

  React.useImperativeHandle(ref, () => ({
    saveVersion: async () => {
      await handleSave();
    },
  }), [handleSave]);

  return (
    <div className="space-y-3">
      <div className="p-3 border border-blue-200 rounded bg-blue-50">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-blue-900">Edit Concept Pool</h2>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
            <Input
              value={metaDraft.name}
              onChange={(e) => setMetaDraft(d => ({ ...d, name: e.target.value }))}
              className="text-sm"
            />
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={handleMetaSave}>
            Save Name
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          {versions.length} version{versions.length !== 1 ? 's' : ''} total. Use the header arrows to switch versions.
        </p>
      </div>

      {!cur ? (
        <div className="p-4 border rounded text-xs text-gray-500">
          No versions available.
        </div>
      ) : (
        <>
          <div className="p-4 space-y-3 border rounded" key={cur.id}>
            <MarkdownPreviewField
              label="Prompt *"
              value={val('prompt', '')}
              onChange={(value) => setDraft(d => ({ ...d, prompt: value }))}
              rows={3}
              placeholder="The review question to display..."
              helperText="The question shown during reviews"
            />

            <ImageUploadField
              label="Prompt Image"
              helperText="Supports one image per prompt."
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={val('type', 'open_ended')}
                onChange={(e) => setDraft(d => ({ ...d, type: e.target.value }))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
              >
                <option value="open_ended">Open Ended</option>
              </select>
            </div>

            <MarkdownPreviewField
              label="Description (Optional)"
              value={val('description', '')}
              onChange={(value) => setDraft(d => ({ ...d, description: value }))}
              rows={4}
              placeholder="Additional context or explanation..."
              helperText="Supports LaTeX notation"
            />

            <ImageUploadField
              label="Description Image"
              helperText="Supports one image per description."
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

            <MarkdownPreviewField
              label="Notes (Optional)"
              value={val('notes', '')}
              onChange={(value) => setDraft(d => ({ ...d, notes: value }))}
              rows={2}
              placeholder="Internal notes..."
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">References (Optional)</label>
              <Input
                value={(val('references', []) as string[]).join(', ')}
                onChange={(e) => {
                  const refs = e.target.value.split(',').map(r => r.trim()).filter(r => r);
                  setDraft(d => ({ ...d, references: refs }));
                }}
                placeholder="URL1, URL2, URL3"
                className="text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">Comma-separated URLs</p>
            </div>
          </div>

        </>
      )}
    </div>
  );
});

MetaDefinitionEditForm.displayName = 'MetaDefinitionEditForm';

export default MetaDefinitionEditForm;
