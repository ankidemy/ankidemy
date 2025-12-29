"use client";
import React, { useState } from 'react';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import type { MetaDefinition, DefinitionVersion } from '@/lib/api';
import { uploadNodeImage } from '@/lib/api';
import { showToast } from '@/app/components/core/ToastNotification';
import ImageUploadField from '../components/ImageUploadField';

interface Props {
  meta: MetaDefinition;
  onAddVersion?: (v: Partial<DefinitionVersion> & { prompt: string }) => Promise<void>;
  onUpdateVersion?: (id: number, v: Partial<DefinitionVersion>) => Promise<void>;
  onDeleteVersion?: (id: number) => Promise<void>;
  // Only name updates are exposed in the UI now
  onUpdateMeta?: (payload: { name?: string }) => Promise<void>;
  onBack?: () => void;
  initialActiveIndex?: number;
}

const MetaDefinitionEditForm: React.FC<Props> = ({
  meta,
  onAddVersion,
  onUpdateVersion,
  onDeleteVersion,
  onUpdateMeta,
  onBack,
  initialActiveIndex,
}) => {
  // active can be a version index or the special string 'new' for an unsaved draft
  const [active, setActive] = useState<number | 'new'>(() => {
    // Use initialActiveIndex if provided and valid
    if (initialActiveIndex !== undefined && meta.versions && meta.versions.length > 0) {
      const safeIndex = Math.max(0, Math.min(initialActiveIndex, meta.versions.length - 1));
      return safeIndex;
    }
    return (meta.versions && meta.versions.length > 0 ? 0 : 'new');
  });
  const versions = meta.versions || [];
  const hasVersions = versions.length > 0;
  const cur = typeof active === 'number' ? versions[active] : undefined;

  const [draft, setDraft] = useState<Partial<DefinitionVersion>>({});

  // When a new version is added (parent refreshes meta), jump to the last version if we were on draft
  const [prevLen, setPrevLen] = useState<number>(versions.length);
  React.useEffect(() => {
    if (active === 'new' && versions.length > prevLen) {
      setActive(versions.length - 1);
      setDraft({});
    }
    if (typeof active === 'number' && versions.length > 0 && active >= versions.length) {
      setActive(versions.length - 1);
      setDraft({});
    }
    setPrevLen(versions.length);
  }, [versions.length]);

  const isDraft = active === 'new';

  // Helper to read current field value (controlled inputs)
  const val = <K extends keyof DefinitionVersion>(key: K, fallback: any = ''): any => {
    if (isDraft) {
      const d: any = draft as any;
      return (d[key] !== undefined && d[key] !== null) ? d[key] : fallback;
    }
    const d: any = draft as any;
    if (d[key] !== undefined && d[key] !== null) return d[key];
    const c: any = cur as any;
    return (c && c[key] !== undefined && c[key] !== null) ? c[key] : fallback;
  };

  const handleSave = async () => {
    if (isDraft) {
      if (!onAddVersion) return;
      const prompt = (draft.prompt || '').toString().trim();
      if (prompt.length === 0) {
        showToast('Prompt is required', 'error');
        return;
      }
      await onAddVersion({
        prompt,
        type: draft.type || 'open_ended',
        description: draft.description,
        notes: draft.notes,
        references: draft.references,
        promptImagePath: draft.promptImagePath,
        descriptionImagePath: draft.descriptionImagePath,
      });
      // Parent will refresh meta; effect above will switch to the new last version
      return;
    }
    if (!cur || !onUpdateVersion) return;
    // Send merged payload to avoid server wiping fields on missing JSON keys
    const payload: Partial<DefinitionVersion> = {
      prompt: val('prompt', ''),
      type: val('type', 'open_ended'),
      description: val('description', ''),
      notes: val('notes', ''),
      references: val('references', []),
      promptImagePath: val('promptImagePath', ''),
      descriptionImagePath: val('descriptionImagePath', ''),
    } as Partial<DefinitionVersion>;
    await onUpdateVersion(cur.id, payload);
    setDraft({});
  };

  const startDraft = () => {
    setDraft({
      prompt: `Define ${meta.name}`,
      type: 'open_ended',
      description: '',
      notes: '',
      references: [],
      promptImagePath: '',
      descriptionImagePath: '',
    });
    setActive('new');
  };

  const discardDraft = () => {
    setDraft({});
    setActive(hasVersions ? 0 : 'new');
  };

  const handleDelete = async () => {
    if (!cur || !onDeleteVersion) return;
    if (versions.length === 1) {
      showToast('Cannot delete the last version. A concept must have at least one version.', 'error');
      return;
    }
    await onDeleteVersion(cur.id);
    setActive(0);
  };

  // Meta-level editing (name only)
  const [metaDraft, setMetaDraft] = useState({ name: meta.name });
  const [isEditingMeta, setIsEditingMeta] = useState(false);

  const performMetaSave = async (payload: { name?: string }) => {
    if (!onUpdateMeta) return;
    try {
      await onUpdateMeta(payload);
      showToast('Concept updated', 'success');
    } catch (error: any) {
      showToast(error.message || 'Failed to update concept', 'error');
    } finally {
      // no-op
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

  // Update metaDraft when meta changes (e.g., after successful save)
  React.useEffect(() => {
    setMetaDraft({ name: meta.name });
  }, [meta.name]);

  // Apply initialActiveIndex when it changes
  React.useEffect(() => {
    if (initialActiveIndex !== undefined && versions.length > 0) {
      const safeIndex = Math.max(0, Math.min(initialActiveIndex, versions.length - 1));
      setActive(safeIndex);
      setDraft({});
    }
  }, [initialActiveIndex]);

  return (
    <div className="space-y-3">

      {/* Meta fields (Name with Edit→Save flow) */}
      <div className="p-3 border border-blue-200 rounded bg-blue-50">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-blue-900">Edit Concept Pool</h2>
          {!isEditingMeta ? (
            <Button size="sm" variant="outline" onClick={() => setIsEditingMeta(true)}>Edit</Button>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
            <Input
              value={metaDraft.name}
              onChange={(e) => setMetaDraft(d => ({ ...d, name: e.target.value }))}
              className={`text-sm ${!isEditingMeta ? 'bg-gray-100 text-gray-600' : ''}`}
              disabled={!isEditingMeta}
            />
          </div>
        </div>
        {isEditingMeta && (
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={async () => { await handleMetaSave(); setIsEditingMeta(false); }}>
              Save Name
            </Button>
          </div>
        )}
        <p className="text-xs text-gray-500 mt-2">{versions.length} version{versions.length !== 1 ? 's' : ''} total</p>
      </div>

      {/* Code change confirmation removed (code editing disabled) */}

      {/* Version selector */}
      <div className="p-3 border rounded bg-blue-50">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-medium">Versions:</span>
          {versions.map((v, idx) => (
            <Button
              key={v.id}
              size="sm"
              variant={active === idx ? 'default' : 'outline'}
              onClick={() => {
                setActive(idx);
                setDraft({});
              }}
              className="px-2 py-1 text-xs"
            >
              V{idx + 1}
            </Button>
          ))}
          {isDraft && (
            <Button size="sm" variant="default" className="px-2 py-1 text-xs">
              NEW
            </Button>
          )}
          {!isDraft && (
            <Button size="sm" variant="outline" onClick={startDraft} className="px-2 py-1 text-xs">
              + New
            </Button>
          )}
        </div>
        {isDraft && (
          <Button size="sm" variant="ghost" onClick={discardDraft} className="text-xs">
            Discard Draft
          </Button>
        )}
      </div>

      {/* Version editor */}
      <div className="p-4 space-y-3 border rounded">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Prompt *</label>
          <textarea
            value={val('prompt', '')}
            onChange={(e) => setDraft(d => ({ ...d, prompt: e.target.value }))}
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
            placeholder="The review question to display..."
          />
          <p className="text-xs text-gray-500 mt-1">The question shown during reviews</p>
        </div>

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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description (Optional)</label>
          <textarea
            value={val('description', '')}
            onChange={(e) => setDraft(d => ({ ...d, description: e.target.value }))}
            rows={4}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
            placeholder="Additional context or explanation..."
          />
          <p className="text-xs text-gray-500 mt-1">Supports LaTeX notation</p>
        </div>

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

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
          <textarea
            value={val('notes', '')}
            onChange={(e) => setDraft(d => ({ ...d, notes: e.target.value }))}
            rows={2}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm resize-y focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
            placeholder="Internal notes..."
          />
        </div>

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

      {/* Footer actions */}
      <div className="border-t p-4 flex gap-2">
        <Button onClick={handleSave} disabled={!isDraft && Object.keys(draft).length === 0}>
          {isDraft ? 'Add Version' : 'Update Version'}
        </Button>
        {!isDraft && (
          <Button onClick={handleDelete} variant="destructive">
            Delete Version
          </Button>
        )}
      </div>
    </div>
  );
};

export default MetaDefinitionEditForm;
