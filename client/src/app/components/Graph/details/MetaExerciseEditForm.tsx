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
  const [active, setActive] = useState<number>(0);
  const versions = meta.versions || [];
  const cur = versions[active];

  const [draft, setDraft] = useState<Partial<ExerciseVersion>>({});

  const handleSave = async () => {
    if (!cur || !onUpdateVersion) return;
    await onUpdateVersion(cur.id, draft);
  };

  const handleAdd = async () => {
    if (!onAddVersion || !draft.statement || draft.statement.trim().length === 0) return;
    await onAddVersion({ statement: draft.statement, description: draft.description, hints: draft.hints, notes: draft.notes, difficulty: draft.difficulty, verifiable: draft.verifiable, result: draft.result });
    setDraft({});
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
          <span className="text-xs text-gray-500 ml-2">{versions.length} version(s)</span>
        </div>
        {onBack && (
          <Button size="sm" variant="outline" onClick={onBack}>Back to Details</Button>
        )}
      </div>

      <div className="p-2 border rounded">
        <label className="block text-xs font-medium mb-1 text-gray-600">Statement</label>
        <textarea rows={4} defaultValue={cur?.statement} onChange={(e)=> setDraft(d=> ({...d, statement: e.target.value}))} disabled={!onUpdateVersion} className="w-full border rounded px-2 py-1 text-sm" />
        <label className="block text-xs font-medium mb-1 mt-2 text-gray-600">Solution</label>
        <textarea rows={4} defaultValue={cur?.description} onChange={(e)=> setDraft(d=> ({...d, description: e.target.value}))} disabled={!onUpdateVersion} className="w-full border rounded px-2 py-1 text-sm" />
        <label className="block text-xs font-medium mb-1 mt-2 text-gray-600">Hints</label>
        <textarea rows={3} defaultValue={cur?.hints} onChange={(e)=> setDraft(d=> ({...d, hints: e.target.value}))} disabled={!onUpdateVersion} className="w-full border rounded px-2 py-1 text-sm" />
        <div className="grid grid-cols-3 gap-2 mt-2">
          <div>
            <label className="block text-xs font-medium mb-1 text-gray-600">Difficulty (1-7)</label>
            <Input type="number" min={1} max={7} defaultValue={cur?.difficulty ?? 3} onChange={(e)=> setDraft(d=> ({...d, difficulty: parseInt(e.target.value,10)}))} disabled={!onUpdateVersion} />
          </div>
          <div className="flex items-center mt-5">
            <input id="verifiable_v" type="checkbox" defaultChecked={!!cur?.verifiable} onChange={(e)=> setDraft(d=> ({...d, verifiable: e.target.checked}))} className="mr-2" disabled={!onUpdateVersion} />
            <label htmlFor="verifiable_v" className="text-xs text-gray-600">Verifiable</label>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-gray-600">Expected Result</label>
            <Input defaultValue={cur?.result || ''} onChange={(e)=> setDraft(d=> ({...d, result: e.target.value}))} disabled={!onUpdateVersion} />
          </div>
        </div>

        {onUpdateVersion && (
          <div className="flex justify-between mt-3">
            <div className="space-x-2">
              <Button size="sm" variant="default" onClick={handleSave}>Save Version</Button>
              {onDeleteVersion && <Button size="sm" variant="destructive" onClick={handleDelete}>Delete Version</Button>}
            </div>
            {onAddVersion && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Add new:</span>
                <Button size="sm" variant="outline" onClick={handleAdd}>Add Version</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MetaExerciseEditForm;
