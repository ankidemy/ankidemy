"use client";

import React, { useState } from 'react';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import type { MetaExercise, ExerciseVersion } from '@/lib/api';
import { uploadNodeImage } from '@/lib/api';
import { showToast } from '@/app/components/core/ToastNotification';
import ImageUploadField from '../components/ImageUploadField';
import MarkdownPreviewField from '../components/MarkdownPreviewField';

interface Props {
  meta: MetaExercise;
  onAddVersion?: (v: Partial<ExerciseVersion> & { statement: string }) => Promise<void>;
  onUpdateVersion?: (id: number, v: Partial<ExerciseVersion>) => Promise<void>;
  onDeleteVersion?: (id: number) => Promise<void>;
  onUpdateMeta?: (payload: { name?: string }) => Promise<void>;
  onBack?: () => void;
  initialActiveIndex?: number;
}

const MetaExerciseEditForm: React.FC<Props> = ({
  meta,
  onAddVersion: _onAddVersion,
  onUpdateVersion,
  onDeleteVersion: _onDeleteVersion,
  onUpdateMeta,
  onBack: _onBack,
  initialActiveIndex,
}) => {
  const versions = meta.versions || [];
  const [active, setActive] = useState<number>(() => {
    if (versions.length === 0) return 0;
    if (initialActiveIndex === undefined) return 0;
    return Math.max(0, Math.min(initialActiveIndex, versions.length - 1));
  });
  const cur = versions[active];
  const [draft, setDraft] = useState<Partial<ExerciseVersion>>({});

  const val = <K extends keyof ExerciseVersion>(key: K, fallback: any = ''): any => {
    const d: any = draft;
    if (d[key] !== undefined && d[key] !== null) return d[key];
    const c: any = cur;
    return (c && c[key] !== undefined && c[key] !== null) ? c[key] : fallback;
  };

  const handleSave = async () => {
    if (!cur || !onUpdateVersion) return;
    const statement = String(val('statement', '')).trim();
    if (!statement) {
      showToast('Statement is required', 'error');
      return;
    }
    const payload: Partial<ExerciseVersion> = {
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
    await onUpdateVersion(cur.id, payload);
    setDraft({});
  };

  const [metaDraft, setMetaDraft] = useState({ name: meta.name });

  const performMetaSave = async (payload: { name?: string }) => {
    if (!onUpdateMeta) return;
    try {
      await onUpdateMeta(payload);
      showToast('Meta updated', 'success');
    } catch (error: any) {
      showToast(error.message || 'Failed to update meta', 'error');
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

  return (
    <div className="space-y-3">
      {onUpdateMeta && (
        <div className="p-3 border border-blue-200 rounded bg-blue-50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-blue-900">Meta-Exercise Details</h3>
          </div>
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-700">Name (required)</label>
              <Input
                value={metaDraft.name}
                onChange={(e) => setMetaDraft(d => ({ ...d, name: e.target.value }))}
                placeholder="Exercise name"
                className="text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="default" onClick={handleMetaSave}>
                Save Name
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              {versions.length} version{versions.length !== 1 ? 's' : ''} total. Use the header arrows to switch versions.
            </p>
          </div>
        </div>
      )}

      {!cur ? (
        <div className="p-4 border rounded text-xs text-gray-500">
          No versions available.
        </div>
      ) : (
        <>
          <div className="p-2 border rounded" key={cur.id}>
            <MarkdownPreviewField
              label="Statement"
              value={val('statement', '')}
              onChange={(value) => setDraft(d => ({ ...d, statement: value }))}
              rows={4}
              labelClassName="text-xs font-medium text-gray-600"
              textareaClassName="w-full border rounded px-2 py-1 text-sm"
              previewClassName="p-2 border rounded bg-gray-50 text-sm"
              buttonClassName="h-5 text-[10px] px-1"
            />
            <ImageUploadField
              label="Statement Image"
              helperText="Supports one image per statement."
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
            <div className="mt-2">
              <MarkdownPreviewField
                label="Solution"
                value={val('description', '')}
                onChange={(value) => setDraft(d => ({ ...d, description: value }))}
                rows={4}
                labelClassName="text-xs font-medium text-gray-600"
                textareaClassName="w-full border rounded px-2 py-1 text-sm"
                previewClassName="p-2 border rounded bg-gray-50 text-sm"
                buttonClassName="h-5 text-[10px] px-1"
              />
            </div>
            <ImageUploadField
              label="Solution Image"
              helperText="Supports one image per solution."
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
            <div className="mt-2">
              <MarkdownPreviewField
                label="Hints"
                value={val('hints', '')}
                onChange={(value) => setDraft(d => ({ ...d, hints: value }))}
                rows={3}
                labelClassName="text-xs font-medium text-gray-600"
                textareaClassName="w-full border rounded px-2 py-1 text-sm"
                previewClassName="p-2 border rounded bg-gray-50 text-sm"
                buttonClassName="h-5 text-[10px] px-1"
              />
            </div>
            <div className="mt-2">
              <MarkdownPreviewField
                label="Notes"
                value={val('notes', '')}
                onChange={(value) => setDraft(d => ({ ...d, notes: value }))}
                rows={3}
                labelClassName="text-xs font-medium text-gray-600"
                textareaClassName="w-full border rounded px-2 py-1 text-sm"
                previewClassName="p-2 border rounded bg-gray-50 text-sm"
                buttonClassName="h-5 text-[10px] px-1"
              />
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-600">Difficulty (1-7)</label>
                <Input
                  type="number"
                  min={1}
                  max={7}
                  value={String(val('difficulty', 3))}
                  onChange={(e)=> {
                    const n = parseInt(e.target.value, 10);
                    const clamped = isNaN(n) ? 3 : Math.max(1, Math.min(7, n));
                    setDraft(d=> ({...d, difficulty: clamped}));
                  }}
                />
              </div>
              <div className="flex items-center mt-5">
                {(() => {
                  const chkId = `verifiable_v_${cur.id}`;
                  return (
                    <>
                      <input
                        id={chkId}
                        type="checkbox"
                        checked={!!val('verifiable', false)}
                        onChange={(e)=> setDraft(d=> ({...d, verifiable: e.target.checked}))}
                        className="mr-2"
                      />
                      <label htmlFor={chkId} className="text-xs text-gray-600">Verifiable</label>
                    </>
                  );
                })()}
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-gray-600">Expected Result</label>
                <Input
                  value={val('result', '')}
                  onChange={(e)=> setDraft(d=> ({...d, result: e.target.value}))}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-3">
            <Button size="sm" variant="default" onClick={handleSave} disabled={!cur || Object.keys(draft).length === 0}>
              Save Version
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default MetaExerciseEditForm;
