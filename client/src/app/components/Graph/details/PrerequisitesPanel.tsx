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
  nodeType: 'meta_definition' | 'meta_exercise';
  availableDefinitions: AvailableItem[];
  // Control which prerequisite kinds can be added
  allowKinds?: Array<'meta_definition' | 'meta_exercise'>;
  onChanged?: () => void; // notify parent to refresh graph
}

const PrerequisitesPanel: React.FC<Props> = ({ domainId, nodeId, nodeType, availableDefinitions, allowKinds = ['meta_definition', 'meta_exercise'], onChanged }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<{ id: number; prerequisiteId: number; weight: number; type: 'meta_definition' | 'meta_exercise' }>>([]);
  const [addingDefinitionIds, setAddingDefinitionIds] = useState<number[]>([]);
  const [addingExerciseIds, setAddingExerciseIds] = useState<number[]>([]);
  const [definitionWeights, setDefinitionWeights] = useState<Record<number, number>>({});
  const [exerciseWeights, setExerciseWeights] = useState<Record<number, number>>({});

  const [metaList, setMetaList] = useState<AvailableItem[]>([]);
  const [selectedKind, setSelectedKind] = useState<'meta_definition' | 'meta_exercise'>(allowKinds.includes('meta_definition') ? 'meta_definition' : 'meta_exercise');
  const [searchDef, setSearchDef] = useState('');
  const [searchMeta, setSearchMeta] = useState('');

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
      // Filter strictly by graph-level types only (no legacy type aliasing)
      const filtered = all.filter(p =>
        p.nodeId === nodeId &&
        p.nodeType === nodeType &&
        (p.prerequisiteType === 'meta_definition' || p.prerequisiteType === 'meta_exercise')
      );
      setRows(filtered.map(p => ({
        id: p.id,
        prerequisiteId: p.prerequisiteId,
        weight: p.weight,
        type: p.prerequisiteType as 'meta_definition' | 'meta_exercise'
      })));
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
    .filter(d => d.numericId !== nodeId)
    .filter(d => !rows.some(r => r.prerequisiteId === d.numericId));
  const availableMetaToAdd = metaList
    .filter(d => d.numericId !== nodeId)
    .filter(d => !rows.some(r => r.prerequisiteId === d.numericId));

  const filteredDefOptions = availableDefToAdd.filter(item => {
    const query = searchDef.trim().toLowerCase();
    if (!query) return true;
    return (`${item.code} ${item.name}`).toLowerCase().includes(query);
  });

  const filteredMetaOptions = availableMetaToAdd.filter(item => {
    const query = searchMeta.trim().toLowerCase();
    if (!query) return true;
    return (`${item.code} ${item.name}`).toLowerCase().includes(query);
  });

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

  const handleAddMultiple = async () => {
    const toProcess: Array<{ id: number; type: 'meta_definition' | 'meta_exercise'; weight: number }> = [];
    if (selectedKind === 'meta_definition') {
      addingDefinitionIds.forEach(id => {
        const weight = Math.max(0.01, Math.min(1.0, definitionWeights[id] ?? 1.0));
        toProcess.push({ id, type: 'meta_definition', weight });
      });
    } else {
      addingExerciseIds.forEach(id => {
        const weight = Math.max(0.01, Math.min(1.0, exerciseWeights[id] ?? 1.0));
        toProcess.push({ id, type: 'meta_exercise', weight });
      });
    }

    for (const item of toProcess) {
      await createPrerequisite({
        nodeId,
        nodeType: nodeType,
        prerequisiteId: item.id,
        prerequisiteType: item.type,
        weight: item.weight,
        isManual: true,
      });
    }

    setAddingDefinitionIds([]);
    setAddingExerciseIds([]);
    setDefinitionWeights({});
    setExerciseWeights({});
    await load();
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
              const d = (r.type === 'meta_definition' ? defMap : metaMap).get(r.prerequisiteId);
              const typeLabel = r.type === 'meta_definition' ? 'Concept' : 'Exercise';
              return (
                <div key={r.id} className="flex items-center justify-between p-2 border rounded">
                  <div className="flex-1">
                    <div className="text-sm font-medium">
                      {d ? `${d.code}: ${d.name}` : `#${r.prerequisiteId}`}
                    </div>
                    <div className="text-xs text-gray-500">{typeLabel}</div>
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
        <div className="space-y-3">
          {allowKinds.includes('meta_definition') && (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600">Concepts</span>
                <Input
                  value={searchDef}
                  onChange={(e)=> setSearchDef(e.target.value)}
                  placeholder="Search concepts..."
                  className="h-7 text-xs w-48"
                />
              </div>
              <select
                multiple
                className="border rounded px-2 py-1 text-sm w-full h-28"
                value={addingDefinitionIds.map(String)}
                onChange={(e)=> {
                  const selected = Array.from(e.target.selectedOptions).map(o => parseInt(o.value, 10)).filter(id => !Number.isNaN(id) && id !== nodeId);
                  setAddingDefinitionIds(selected);
                  const weights: Record<number, number> = {};
                  selected.forEach(id => { weights[id] = definitionWeights[id] || 1.0; });
                  setDefinitionWeights(weights);
                }}
              >
                {filteredDefOptions.map(d => (
                  <option key={`def-${d.numericId}`} value={d.numericId}>{d.code}: {d.name}</option>
                ))}
              </select>
              {addingDefinitionIds.length > 0 && (
                <div className="mt-2 p-2 border rounded bg-gray-50 space-y-2">
                  {addingDefinitionIds.map(id => {
                    const item = filteredDefOptions.find(o => o.numericId === id) || availableDefinitions.find(o => o.numericId === id);
                    if (!item) return null;
                    return (
                      <div key={`def-add-${id}`} className="flex items-center justify-between text-xs">
                        <span className="truncate mr-2">{item.code}</span>
                        <Input type="number" min="0.01" max="1.00" step="0.01" value={String(definitionWeights[id] ?? 1.0)} onChange={(e)=> setDefinitionWeights(prev => ({ ...prev, [id]: parseFloat(e.target.value) || 1.0 }))} className="w-16 h-6 text-xs" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {allowKinds.includes('meta_exercise') && (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600">Exercises</span>
                <Input
                  value={searchMeta}
                  onChange={(e)=> setSearchMeta(e.target.value)}
                  placeholder="Search exercises..."
                  className="h-7 text-xs w-48"
                />
              </div>
              <select
                multiple
                className="border rounded px-2 py-1 text-sm w-full h-28"
                value={addingExerciseIds.map(String)}
                onChange={(e)=> {
                  const selected = Array.from(e.target.selectedOptions).map(o => parseInt(o.value, 10)).filter(id => !Number.isNaN(id) && id !== nodeId);
                  setAddingExerciseIds(selected);
                  const weights: Record<number, number> = {};
                  selected.forEach(id => { weights[id] = exerciseWeights[id] || 1.0; });
                  setExerciseWeights(weights);
                }}
              >
                {filteredMetaOptions.map(d => (
                  <option key={`meta-${d.numericId}`} value={d.numericId}>{d.code}: {d.name}</option>
                ))}
              </select>
              {addingExerciseIds.length > 0 && (
                <div className="mt-2 p-2 border rounded bg-gray-50 space-y-2">
                  {addingExerciseIds.map(id => {
                    const item = filteredMetaOptions.find(o => o.numericId === id) || metaList.find(o => o.numericId === id);
                    if (!item) return null;
                    return (
                      <div key={`meta-add-${id}`} className="flex items-center justify-between text-xs">
                        <span className="truncate mr-2">{item.code}</span>
                        <Input type="number" min="0.01" max="1.00" step="0.01" value={String(exerciseWeights[id] ?? 1.0)} onChange={(e)=> setExerciseWeights(prev => ({ ...prev, [id]: parseFloat(e.target.value) || 1.0 }))} className="w-16 h-6 text-xs" />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            {allowKinds.length > 1 && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>Adding:</span>
                <select className="border rounded px-2 py-1 text-xs" value={selectedKind} onChange={(e)=> setSelectedKind(e.target.value as any)}>
                  {allowKinds.includes('meta_definition') && <option value="meta_definition">Concepts</option>}
                  {allowKinds.includes('meta_exercise') && <option value="meta_exercise">Exercises</option>}
                </select>
              </div>
            )}
            <div className="text-xs text-gray-500">1.0 = full prerequisite; lower values reduce credit propagation.</div>
          </div>

          <div className="text-right">
            <Button size="sm" onClick={handleAddMultiple} disabled={(selectedKind === 'meta_definition' ? addingDefinitionIds.length : addingExerciseIds.length) === 0}>Add Selected</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrerequisitesPanel;
