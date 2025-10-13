"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import { 
  getDomainPrerequisites,
  createPrerequisite,
  updatePrerequisite,
  deletePrerequisite,
} from '@/lib/srs-api';
import { getDomainMetaExercises } from '@/lib/api';

type AvailableItem = { code: string; name: string; numericId: number };

interface Props {
  domainId: number;
  nodeId: number; // numeric node id (definition or pool)
  nodeType: 'definition' | 'meta_exercise';
  availableDefinitions: AvailableItem[];
  // Control which prerequisite kinds can be added
  allowKinds?: Array<'definition' | 'meta_exercise'>;
  onChanged?: () => void; // notify parent to refresh graph
}

const PrerequisitesPanel: React.FC<Props> = ({ domainId, nodeId, nodeType, availableDefinitions, allowKinds = ['definition', 'meta_exercise'], onChanged }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<{ id: number; prerequisiteId: number; weight: number }>>([]);
  const [addingId, setAddingId] = useState<number | ''>('');
  const [addingWeight, setAddingWeight] = useState<number>(1.0);

  const [metaList, setMetaList] = useState<AvailableItem[]>([]);
  const [addKind, setAddKind] = useState<'definition' | 'meta_exercise'>(allowKinds.includes('definition') ? 'definition' : 'meta_exercise');

  const defMap = useMemo(() => {
    const m = new Map<number, AvailableItem>();
    availableDefinitions.forEach(d => { if (typeof d.numericId === 'number') m.set(d.numericId, d); });
    return m;
  }, [availableDefinitions]);

  const metaMap = useMemo(() => {
    const m = new Map<number, AvailableItem>();
    metaList.forEach(d => { if (typeof d.numericId === 'number') m.set(d.numericId, d); });
    return m;
  }, [metaList]);

  const load = async () => {
    try {
      setLoading(true);
      const all = await getDomainPrerequisites(domainId);
      const filtered = all.filter(p => p.nodeId === nodeId && (p.nodeType === nodeType || (nodeType === 'meta_exercise' && p.nodeType === 'exercise')));
      setRows(filtered.map(p => ({ id: p.id, prerequisiteId: p.prerequisiteId, weight: p.weight, /* carry type via separate lookup if needed */ })) as any);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load prerequisites');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [domainId, nodeId]);
  useEffect(() => { (async () => {
    try {
      const metas = await getDomainMetaExercises(domainId);
      setMetaList(metas.map((m: any) => ({ code: m.code, name: m.name, numericId: m.id })));
    } catch {}
  })(); }, [domainId]);

  const availableDefToAdd = availableDefinitions
    .filter(d => !rows.some(r => r.prerequisiteId === d.numericId));
  const availableMetaToAdd = metaList
    .filter(d => d.numericId !== nodeId)
    .filter(d => !rows.some(r => r.prerequisiteId === d.numericId));

  const handleAdd = async () => {
    if (!addingId || typeof addingId !== 'number') return;
    const weight = Math.max(0.01, Math.min(1.0, Number(addingWeight) || 1.0));
    await createPrerequisite({
      nodeId,
      nodeType: nodeType,
      prerequisiteId: addingId,
      prerequisiteType: addKind,
      weight,
      isManual: true,
    });
    setAddingId('');
    setAddingWeight(1.0);
    await load();
    onChanged?.();
  };

  const handleWeightChange = async (rowId: number, newWeight: number) => {
    const w = Math.max(0.01, Math.min(1.0, Number(newWeight) || 1.0));
    await updatePrerequisite(rowId, { weight: w });
    setRows(rows => rows.map(r => r.id === rowId ? { ...r, weight: w } : r));
    onChanged?.();
  };

  const handleRemove = async (rowId: number) => {
    await deletePrerequisite(rowId);
    setRows(rows => rows.filter(r => r.id !== rowId));
    onChanged?.();
  };

  if (loading) return <div className="text-sm text-gray-500">Loading prerequisites…</div>;
  if (error) return <div className="text-sm text-red-600">{error}</div>;

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-xs font-medium text-gray-600 mb-1">Linked Prerequisites</h4>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">No prerequisites linked.</p>
        ) : (
          <div className="space-y-2">
            {rows.map(r => {
              const d = defMap.get(r.prerequisiteId) || metaMap.get(r.prerequisiteId);
              return (
                <div key={r.id} className="flex items-center justify-between p-2 border rounded">
                  <div className="text-sm">
                    {d ? `${d.code}: ${d.name}` : `#${r.prerequisiteId}`}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">Weight</span>
                    <Input
                      type="number"
                      min="0.01"
                      max="1.00"
                      step="0.01"
                      value={String(r.weight)}
                      onChange={(e) => handleWeightChange(r.id, parseFloat(e.target.value))}
                      className="w-20 h-7 text-sm"
                    />
                    <Button size="sm" variant="outline" onClick={() => handleRemove(r.id)}>Remove</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="pt-2 border-t">
        <h4 className="text-xs font-medium text-gray-600 mb-1">Add Prerequisite</h4>
        <div className="flex items-center gap-2">
          {allowKinds.length > 1 ? (
            <select className="border rounded px-2 py-1 text-sm" value={addKind} onChange={(e)=> setAddKind(e.target.value as any)}>
              {allowKinds.includes('definition') && <option value="definition">Definition</option>}
              {allowKinds.includes('meta_exercise') && <option value="meta_exercise">Exercise pool</option>}
            </select>
          ) : (
            <span className="text-xs text-gray-600">{allowKinds[0] === 'definition' ? 'Definition' : 'Exercise pool'}</span>
          )}
          <select className="border rounded px-2 py-1 text-sm flex-1" value={addingId as any} onChange={(e)=> setAddingId(Number(e.target.value))}>
            <option value="">{addKind === 'definition' ? 'Select a definition…' : 'Select a pool…'}</option>
            {(addKind === 'definition' ? availableDefToAdd : availableMetaToAdd).map(d => (
              <option key={d.numericId} value={d.numericId}>{d.code}: {d.name}</option>
            ))}
          </select>
          <span className="text-xs text-gray-600">Weight</span>
          <Input type="number" min="0.01" max="1.00" step="0.01" value={String(addingWeight)} onChange={(e)=> setAddingWeight(parseFloat(e.target.value))} className="w-20 h-7 text-sm" />
          <Button size="sm" onClick={handleAdd} disabled={!addingId}>Add</Button>
        </div>
        <p className="text-xs text-gray-500 mt-1">1.0 = full prerequisite; lower values reduce credit propagation.</p>
      </div>
    </div>
  );
};

export default PrerequisitesPanel;
