"use client";
import React, { useMemo, useState } from 'react';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import type { MetaExercise, ExerciseVersion } from '@/lib/api';

interface Props {
  meta: MetaExercise;
  onAddVersion?: (v: Partial<ExerciseVersion> & { statement: string }) => Promise<void>;
  onUpdateVersion?: (id: number, v: Partial<ExerciseVersion>) => Promise<void>;
  onDeleteVersion?: (id: number) => Promise<void>;
  onBack?: () => void;
}

const MetaExerciseEditForm: React.FC<Props> = ({ meta, onAddVersion, onUpdateVersion, onDeleteVersion, onBack }) => {
  // active can be a version index or the special string 'new' for an unsaved draft
  const [active, setActive] = useState<number | 'new'>(() => (meta.versions && meta.versions.length > 0 ? 0 : 'new'));
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

  return (
    <div className="space-y-3">
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
        {onBack && (
          <Button size="sm" variant="outline" onClick={onBack}>Back to Details</Button>
        )}
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
