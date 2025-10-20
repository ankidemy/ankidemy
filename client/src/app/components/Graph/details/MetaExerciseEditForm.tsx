"use client";
import React, { useMemo, useState } from 'react';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import type { MetaExercise, ExerciseVersion } from '@/lib/api';
import { showToast } from '@/app/components/core/ToastNotification';

interface Props {
  meta: MetaExercise;
  onAddVersion?: (v: Partial<ExerciseVersion> & { statement: string }) => Promise<void>;
  onUpdateVersion?: (id: number, v: Partial<ExerciseVersion>) => Promise<void>;
  onDeleteVersion?: (id: number) => Promise<void>;
  onUpdateMeta?: (payload: { name?: string; code?: string; xPosition?: number; yPosition?: number }) => Promise<void>;
  onBack?: () => void;
  initialActiveIndex?: number;
}

const MetaExerciseEditForm: React.FC<Props> = ({
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

  const [draft, setDraft] = useState<Partial<ExerciseVersion>>({});

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
  const val = <K extends keyof ExerciseVersion>(key: K, fallback: any = ''): any => {
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
      const statement = (draft.statement || '').toString().trim();
      if (statement.length === 0) return;
      const difficulty = typeof draft.difficulty === 'number' && draft.difficulty >= 1 && draft.difficulty <= 7 ? draft.difficulty : 3;
      await onAddVersion({
        statement,
        description: draft.description,
        hints: draft.hints,
        notes: draft.notes,
        difficulty,
        verifiable: !!draft.verifiable,
        result: draft.result,
      });
      // Parent will refresh meta; effect above will switch to the new last version
      return;
    }
    if (!cur || !onUpdateVersion) return;
    // Send merged payload to avoid server wiping fields on missing JSON keys
    const payload: Partial<ExerciseVersion> = {
      statement: val('statement',''),
      description: val('description',''),
      hints: val('hints',''),
      notes: val('notes',''),
      difficulty: val('difficulty', 3),
      verifiable: val('verifiable', false),
      result: val('result',''),
    } as Partial<ExerciseVersion>;
    await onUpdateVersion(cur.id, payload);
    setDraft({});
  };

  const startDraft = () => {
    setDraft({ statement: '', description: '', hints: '', notes: '', result: '', difficulty: 3, verifiable: false });
    setActive('new');
  };
  const discardDraft = () => {
    setDraft({});
    setActive(hasVersions ? 0 : 'new');
  };

  const handleDelete = async () => {
    if (!cur || !onDeleteVersion) return;
    await onDeleteVersion(cur.id);
    setActive(0);
  };

  // Meta-level editing
  const [metaDraft, setMetaDraft] = useState({ name: meta.name, code: meta.code });
  const [showCodeConfirm, setShowCodeConfirm] = useState(false);
  const [pendingSavePayload, setPendingSavePayload] = useState<{ name?: string; code?: string } | null>(null);

  const performMetaSave = async (payload: { name?: string; code?: string }) => {
    if (!onUpdateMeta) return;
    try {
      await onUpdateMeta(payload);
      showToast('Meta updated', 'success');
    } catch (error: any) {
      showToast(error.message || 'Failed to update meta', 'error');
    } finally {
      setPendingSavePayload(null);
      setShowCodeConfirm(false);
    }
  };

  const handleMetaSave = async () => {
    if (!onUpdateMeta) return;

    const payload: { name?: string; code?: string } = {};

    if (metaDraft.name.trim() !== meta.name) {
      if (metaDraft.name.trim() === '') {
        showToast('Name cannot be empty', 'error');
        return;
      }
      payload.name = metaDraft.name.trim();
    }

    if (metaDraft.code.trim() !== meta.code) {
      payload.code = metaDraft.code.trim();
    }

    if (Object.keys(payload).length === 0) {
      showToast('No changes to save', 'info');
      return;
    }

    // If code changed, confirm before saving
    if (payload.code && payload.code !== meta.code) {
      setPendingSavePayload(payload);
      setShowCodeConfirm(true);
      return;
    }

    await performMetaSave(payload);
  };

  const handleCodeChange = (newCode: string) => {
    // Allow free editing; confirmation will happen on Save
    setMetaDraft(d => ({ ...d, code: newCode }));
  };

  const confirmCodeChange = async () => {
    if (pendingSavePayload) {
      await performMetaSave(pendingSavePayload);
    } else {
      setShowCodeConfirm(false);
    }
  };

  const cancelCodeChange = () => {
    setPendingSavePayload(null);
    setShowCodeConfirm(false);
  };

  // Update metaDraft when meta changes (e.g., after successful save)
  React.useEffect(() => {
    setMetaDraft({ name: meta.name, code: meta.code });
  }, [meta.name, meta.code]);

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
      {/* Meta Section */}
      {onUpdateMeta && (
        <div className="p-3 border border-blue-200 rounded bg-blue-50">
          <h3 className="text-sm font-semibold mb-2 text-blue-900">Meta-Exercise Details</h3>
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
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-700">
                Code (optional, changes affect references)
              </label>
              <Input
                value={metaDraft.code}
                onChange={(e) => handleCodeChange(e.target.value)}
                placeholder="Exercise code"
                className="text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="default" onClick={handleMetaSave}>
                Save Meta
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setMetaDraft({ name: meta.name, code: meta.code })}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Code Change Confirmation Modal */}
      {showCodeConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-4 rounded shadow-lg max-w-md">
            <h3 className="font-semibold mb-2">Confirm Code Change</h3>
            <p className="text-sm text-gray-600 mb-4">
              Changing the code affects references and prerequisites. Are you sure you want to proceed?
            </p>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={cancelCodeChange}>
                Cancel
              </Button>
              <Button size="sm" variant="default" onClick={confirmCodeChange}>
                Proceed
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Versions Section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {(versions).map((v, idx) => (
            <Button key={v.id} size="sm" variant={idx===active? 'default':'outline'} onClick={()=>{ setActive(idx); setDraft({}); }}>V{idx+1}</Button>
          ))}
          {onAddVersion && (
            <Button size="sm" variant={active==='new' ? 'default':'outline'} onClick={startDraft}>+ New</Button>
          )}
          <span className="text-xs text-gray-500 ml-2">{versions.length} version(s)</span>
        </div>
      </div>

      <div className="p-2 border rounded" key={isDraft ? 'draft' : (cur?.id ?? 'no-version')}>
        <label className="block text-xs font-medium mb-1 text-gray-600">Statement</label>
        <textarea
          rows={4}
          value={val('statement','')}
          onChange={(e)=> setDraft(d=> ({...d, statement: e.target.value}))}
          disabled={!(isDraft ? onAddVersion : onUpdateVersion)}
          className="w-full border rounded px-2 py-1 text-sm"
        />
        <label className="block text-xs font-medium mb-1 mt-2 text-gray-600">Solution</label>
        <textarea
          rows={4}
          value={val('description','')}
          onChange={(e)=> setDraft(d=> ({...d, description: e.target.value}))}
          disabled={!(isDraft ? onAddVersion : onUpdateVersion)}
          className="w-full border rounded px-2 py-1 text-sm"
        />
        <label className="block text-xs font-medium mb-1 mt-2 text-gray-600">Hints</label>
        <textarea
          rows={3}
          value={val('hints','')}
          onChange={(e)=> setDraft(d=> ({...d, hints: e.target.value}))}
          disabled={!(isDraft ? onAddVersion : onUpdateVersion)}
          className="w-full border rounded px-2 py-1 text-sm"
        />
        <label className="block text-xs font-medium mb-1 mt-2 text-gray-600">Notes</label>
        <textarea
          rows={3}
          value={val('notes','')}
          onChange={(e)=> setDraft(d=> ({...d, notes: e.target.value}))}
          disabled={!(isDraft ? onAddVersion : onUpdateVersion)}
          className="w-full border rounded px-2 py-1 text-sm"
        />
        <div className="grid grid-cols-3 gap-2 mt-2">
          <div>
            <label className="block text-xs font-medium mb-1 text-gray-600">Difficulty (1-7)</label>
            <Input
              type="number"
              min={1}
              max={7}
              value={val('difficulty',3)}
              onChange={(e)=> {
                const n = parseInt(e.target.value,10);
                const clamped = isNaN(n) ? 3 : Math.max(1, Math.min(7, n));
                setDraft(d=> ({...d, difficulty: clamped}))
              }}
              disabled={!(isDraft ? onAddVersion : onUpdateVersion)}
            />
          </div>
          <div className="flex items-center mt-5">
            {(() => { const chkId = `verifiable_v_${cur?.id ?? 'new'}`; return (
              <>
                <input
                  id={chkId}
                  type="checkbox"
                  checked={!!val('verifiable', false)}
                  onChange={(e)=> setDraft(d=> ({...d, verifiable: e.target.checked}))}
                  className="mr-2"
                  disabled={!(isDraft ? onAddVersion : onUpdateVersion)}
                />
                <label htmlFor={chkId} className="text-xs text-gray-600">Verifiable</label>
              </>
            ); })()}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-gray-600">Expected Result</label>
            <Input
              value={val('result','')}
              onChange={(e)=> setDraft(d=> ({...d, result: e.target.value}))}
              disabled={!(isDraft ? onAddVersion : onUpdateVersion)}
            />
          </div>
        </div>

        <div className="flex justify-between mt-3">
          <div className="space-x-2">
            {(isDraft ? onAddVersion : onUpdateVersion) && (
              <Button size="sm" variant="default" onClick={handleSave}>{isDraft ? 'Save New Version' : 'Save Version'}</Button>
            )}
            {!isDraft && onDeleteVersion && (
              <Button size="sm" variant="destructive" onClick={handleDelete} disabled={versions.length <= 1}>Delete Version</Button>
            )}
          </div>
          {isDraft ? (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={discardDraft}>Discard</Button>
            </div>
          ) : (
            onAddVersion && <div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={startDraft}>Add Version</Button></div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MetaExerciseEditForm;
