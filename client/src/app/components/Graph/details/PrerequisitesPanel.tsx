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
import {
  getDomainMetaDefinitions,
  getDomainMetaExercises,
  getAccessibleDomains,
  createExternalPrerequisite,
  deleteExternalPrerequisite,
  ExternalPrerequisiteLink,
  AccessibleDomain,
} from '@/lib/api';

type AvailableItem = { code: string; name: string; numericId: number };

interface Props {
  domainId: number;
  nodeId: number; // numeric node id (definition or pool)
  nodeType: 'meta_definition' | 'meta_exercise';
  availableDefinitions: AvailableItem[];
  canEdit?: boolean;
  // Control which prerequisite kinds can be added
  allowKinds?: Array<'meta_definition' | 'meta_exercise'>;
  onChanged?: () => void; // notify parent to refresh graph
  externalLinks?: ExternalPrerequisiteLink[];
  onExternalChanged?: () => void;
}

const PrerequisitesPanel: React.FC<Props> = ({
  domainId,
  nodeId,
  nodeType,
  availableDefinitions,
  canEdit = true,
  allowKinds = ['meta_definition', 'meta_exercise'],
  onChanged,
  externalLinks = [],
  onExternalChanged,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<{ id: number; prerequisiteId: number; weight: number; type: 'meta_definition' | 'meta_exercise' }>>([]);
  const [addingDefinitionIds, setAddingDefinitionIds] = useState<number[]>([]);
  const [addingExerciseIds, setAddingExerciseIds] = useState<number[]>([]);
  const [definitionWeights, setDefinitionWeights] = useState<Record<number, number>>({});
  const [exerciseWeights, setExerciseWeights] = useState<Record<number, number>>({});
  const [weightDrafts, setWeightDrafts] = useState<Record<number, string>>({});

  const [metaList, setMetaList] = useState<AvailableItem[]>([]);
  const [selectedKind, setSelectedKind] = useState<'meta_definition' | 'meta_exercise'>(allowKinds.includes('meta_definition') ? 'meta_definition' : 'meta_exercise');
  const [searchDef, setSearchDef] = useState('');
  const [searchMeta, setSearchMeta] = useState('');

  const [externalEnabled, setExternalEnabled] = useState(false);
  const [externalDomains, setExternalDomains] = useState<AccessibleDomain[]>([]);
  const [externalDomainQuery, setExternalDomainQuery] = useState('');
  const [selectedExternalDomainUid, setSelectedExternalDomainUid] = useState<string>('');
  const [externalDefinitions, setExternalDefinitions] = useState<AvailableItem[]>([]);
  const [externalExercises, setExternalExercises] = useState<AvailableItem[]>([]);
  const [externalNodeType, setExternalNodeType] = useState<'meta_definition' | 'meta_exercise'>('meta_definition');
  const [externalNodeQuery, setExternalNodeQuery] = useState('');
  const [selectedExternalNodeId, setSelectedExternalNodeId] = useState<number | ''>('');
  const [externalError, setExternalError] = useState<string | null>(null);
  const [externalLoading, setExternalLoading] = useState(false);

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

  const externalRows = useMemo(() => {
    return externalLinks.filter(link => link.nodeId === nodeId && link.nodeType === nodeType);
  }, [externalLinks, nodeId, nodeType]);

  const selectedExternalDomain = useMemo(() => {
    return externalDomains.find(domain => domain.domainUid === selectedExternalDomainUid) || null;
  }, [externalDomains, selectedExternalDomainUid]);

  const filteredExternalDomains = useMemo(() => {
    const query = externalDomainQuery.trim().toLowerCase();
    return externalDomains
      .filter(domain => domain.id !== domainId)
      .filter(domain => {
        if (!query) return true;
        return `${domain.ownerUsername} ${domain.name}`.toLowerCase().includes(query);
      });
  }, [externalDomains, externalDomainQuery, domainId]);

  const externalNodeOptions = useMemo(() => {
    return externalNodeType === 'meta_definition' ? externalDefinitions : externalExercises;
  }, [externalDefinitions, externalExercises, externalNodeType]);

  const filteredExternalNodeOptions = useMemo(() => {
    const query = externalNodeQuery.trim().toLowerCase();
    const linkedIds = new Set(
      externalRows
        .filter(link => link.externalDomainUid === selectedExternalDomainUid && link.externalNodeType === externalNodeType)
        .map(link => link.externalNodeId)
    );
    return externalNodeOptions.filter(item => {
      if (linkedIds.has(item.numericId)) return false;
      if (!query) return true;
      return `${item.code} ${item.name}`.toLowerCase().includes(query);
    });
  }, [externalNodeOptions, externalNodeQuery, externalRows, selectedExternalDomainUid, externalNodeType]);

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

  useEffect(() => {
    if (!externalEnabled) return;
    if (externalDomains.length > 0) return;
    (async () => {
      try {
        setExternalLoading(true);
        const domains = await getAccessibleDomains();
        setExternalDomains(domains.filter(d => d.domainUid));
        setExternalError(null);
      } catch (e) {
        setExternalError(e instanceof Error ? e.message : 'Failed to load domains');
      } finally {
        setExternalLoading(false);
      }
    })();
  }, [externalEnabled, externalDomains.length]);

  useEffect(() => {
    if (!selectedExternalDomain) {
      setExternalDefinitions([]);
      setExternalExercises([]);
      return;
    }
    (async () => {
      try {
        setExternalLoading(true);
        const [defs, exs] = await Promise.all([
          getDomainMetaDefinitions(selectedExternalDomain.id),
          getDomainMetaExercises(selectedExternalDomain.id),
        ]);
        setExternalDefinitions(defs.map((d: any) => ({ code: d.code, name: d.name, numericId: d.id })));
        setExternalExercises(exs.map((e: any) => ({ code: e.code, name: e.name, numericId: e.id })));
        setExternalError(null);
      } catch (e) {
        setExternalDefinitions([]);
        setExternalExercises([]);
        setExternalError(e instanceof Error ? e.message : 'Failed to load external nodes');
      } finally {
        setExternalLoading(false);
      }
    })();
  }, [selectedExternalDomain]);

  useEffect(() => {
    setSelectedExternalNodeId('');
  }, [selectedExternalDomainUid, externalNodeType]);

  useEffect(() => {
    if (nodeType === 'meta_definition') {
      setExternalNodeType('meta_definition');
    }
  }, [nodeType]);
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

  const externalStatusLabels: Record<ExternalPrerequisiteLink['status'], string> = {
    ok: 'Linked',
    missing_domain: 'Domain missing',
    missing_node: 'Node missing',
    no_access: 'Access removed',
  };

  const handleWeightCommit = async (rowId: number, mode: 'blur' | 'direct', rawValue?: string) => {
    if (!canEdit) return;
    const row = rows.find(r => r.id === rowId);
    if (!row) return;
    const raw = (rawValue ?? weightDrafts[rowId] ?? '').trim();
    const parsed = parseFloat(raw);
    if (Number.isNaN(parsed)) {
      if (mode === 'blur') {
        setWeightDrafts(prev => ({ ...prev, [rowId]: String(row.weight) }));
      }
      return;
    }
    const clamped = Math.max(0.01, Math.min(1.0, parsed));
    if (clamped === row.weight) {
      setWeightDrafts(prev => ({ ...prev, [rowId]: String(row.weight) }));
      return;
    }
    await updatePrerequisite(rowId, { weight: clamped });
    setRows(rows => rows.map(r => r.id === rowId ? { ...r, weight: clamped } : r));
    setWeightDrafts(prev => ({ ...prev, [rowId]: String(clamped) }));
    onChanged?.();
  };

  const handleRemove = async (rowId: number) => {
    if (!canEdit) return;
    await deletePrerequisite(rowId);
    setRows(rows => rows.filter(r => r.id !== rowId));
    onChanged?.();
  };

  const handleAddMultiple = async () => {
    if (!canEdit) return;
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

  const handleAddExternal = async () => {
    if (!canEdit) return;
    if (!selectedExternalDomain) {
      setExternalError('Select an external domain.');
      return;
    }
    const nodeIdValue = typeof selectedExternalNodeId === 'number' ? selectedExternalNodeId : parseInt(String(selectedExternalNodeId), 10);
    if (!nodeIdValue || Number.isNaN(nodeIdValue)) {
      setExternalError('Select an external node.');
      return;
    }

    const exists = externalRows.some(link =>
      link.externalDomainUid === selectedExternalDomain.domainUid &&
      link.externalNodeId === nodeIdValue &&
      link.externalNodeType === externalNodeType
    );
    if (exists) {
      setExternalError('External prerequisite already linked.');
      return;
    }

    try {
      setExternalLoading(true);
      await createExternalPrerequisite(domainId, {
        nodeId,
        nodeType,
        externalDomainUid: selectedExternalDomain.domainUid,
        externalNodeId: nodeIdValue,
        externalNodeType,
      });
      setExternalError(null);
      setSelectedExternalNodeId('');
      setExternalNodeQuery('');
      await onExternalChanged?.();
    } catch (e) {
      setExternalError(e instanceof Error ? e.message : 'Failed to create external prerequisite');
    } finally {
      setExternalLoading(false);
    }
  };

  const handleRemoveExternal = async (linkId: number) => {
    if (!canEdit) return;
    try {
      setExternalLoading(true);
      await deleteExternalPrerequisite(domainId, linkId);
      await onExternalChanged?.();
    } catch (e) {
      setExternalError(e instanceof Error ? e.message : 'Failed to remove external prerequisite');
    } finally {
      setExternalLoading(false);
    }
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
                      disabled={!canEdit}
                      value={weightDrafts[r.id] ?? String(r.weight)}
                      onChange={(e) => setWeightDrafts(prev => ({ ...prev, [r.id]: e.target.value }))}
                      onBlur={async (e) => {
                        await handleWeightCommit(r.id, 'blur', e.currentTarget.value);
                      }}
                      onKeyUp={(e) => {
                        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                          handleWeightCommit(r.id, 'direct', (e.currentTarget as HTMLInputElement).value);
                        }
                      }}
                      onMouseUp={(e) => {
                        handleWeightCommit(r.id, 'direct', (e.currentTarget as HTMLInputElement).value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        }
                      }}
                      className="w-20 h-7 text-sm"
                    />
                    <Button size="sm" variant="outline" onClick={() => handleRemove(r.id)} disabled={!canEdit}>Remove</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="pt-2 border-t">
        <h4 className="text-xs font-medium text-gray-600 mb-1">Add Prerequisite</h4>
        {!canEdit && (
          <div className="text-xs text-gray-500 mb-2">Only domain owners or editors can edit prerequisites.</div>
        )}
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
                  disabled={!canEdit}
                />
              </div>
              <select
                multiple
                className="border rounded px-2 py-1 text-sm w-full h-28 disabled:bg-gray-100"
                value={addingDefinitionIds.map(String)}
                disabled={!canEdit}
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
                        <Input
                          type="number"
                          min="0.01"
                          max="1.00"
                          step="0.01"
                          value={String(definitionWeights[id] ?? 1.0)}
                          onChange={(e)=> setDefinitionWeights(prev => ({ ...prev, [id]: parseFloat(e.target.value) || 1.0 }))}
                          className="w-16 h-6 text-xs"
                          disabled={!canEdit}
                        />
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
                  disabled={!canEdit}
                />
              </div>
              <select
                multiple
                className="border rounded px-2 py-1 text-sm w-full h-28 disabled:bg-gray-100"
                value={addingExerciseIds.map(String)}
                disabled={!canEdit}
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
                        <Input
                          type="number"
                          min="0.01"
                          max="1.00"
                          step="0.01"
                          value={String(exerciseWeights[id] ?? 1.0)}
                          onChange={(e)=> setExerciseWeights(prev => ({ ...prev, [id]: parseFloat(e.target.value) || 1.0 }))}
                          className="w-16 h-6 text-xs"
                          disabled={!canEdit}
                        />
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
                <select
                  className="border rounded px-2 py-1 text-xs disabled:bg-gray-100"
                  value={selectedKind}
                  onChange={(e)=> setSelectedKind(e.target.value as any)}
                  disabled={!canEdit}
                >
                  {allowKinds.includes('meta_definition') && <option value="meta_definition">Concepts</option>}
                  {allowKinds.includes('meta_exercise') && <option value="meta_exercise">Exercises</option>}
                </select>
              </div>
            )}
            <div className="text-xs text-gray-500">1.0 = full prerequisite; lower values reduce credit propagation.</div>
          </div>

          <div className="text-right">
            <Button
              size="sm"
              onClick={handleAddMultiple}
              disabled={
                !canEdit ||
                (selectedKind === 'meta_definition' ? addingDefinitionIds.length : addingExerciseIds.length) === 0
              }
            >
              Add Selected
            </Button>
          </div>
        </div>
      </div>

      <div className="pt-3 border-t space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-medium text-gray-600">External Prerequisites</h4>
          <label className="flex items-center gap-2 text-xs text-gray-500">
            <input
              type="checkbox"
              checked={externalEnabled}
              onChange={(e) => setExternalEnabled(e.target.checked)}
              disabled={!canEdit}
            />
            Enable external
          </label>
        </div>
        {!canEdit && (
          <div className="text-xs text-gray-500">Only domain owners or editors can link external prerequisites.</div>
        )}
        {externalRows.length === 0 ? (
          <p className="text-sm text-gray-500">No external prerequisites linked.</p>
        ) : (
          <div className="space-y-2">
            {externalRows.map(link => {
              const nodeLabel = link.externalNodeCode
                ? `${link.externalNodeCode}${link.externalNodeName ? `: ${link.externalNodeName}` : ''}`
                : (link.externalNodeName || `Node #${link.externalNodeId}`);
              const domainLabel = link.externalDomainName || link.externalDomainUid || 'Unknown domain';
              const statusLabel = externalStatusLabels[link.status];
              const statusClass = link.status === 'ok'
                ? 'bg-green-50 text-green-700'
                : 'bg-amber-50 text-amber-700';
              return (
                <div key={link.id} className="flex items-center justify-between p-2 border rounded">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{nodeLabel}</div>
                    <div className="text-xs text-gray-500">{domainLabel}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded ${statusClass}`}>{statusLabel}</span>
                    <Button size="sm" variant="outline" onClick={() => handleRemoveExternal(link.id)} disabled={!canEdit || externalLoading}>
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {externalError && <div className="text-xs text-red-600">{externalError}</div>}

        {externalEnabled && (
          <div className="space-y-3 pt-2">
            {externalLoading && (
              <div className="text-xs text-gray-500">Loading external data…</div>
            )}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600">Domain</span>
                <Input
                  value={externalDomainQuery}
                  onChange={(e) => setExternalDomainQuery(e.target.value)}
                  placeholder="Search domains..."
                  className="h-7 text-xs w-48"
                  disabled={!canEdit}
                />
              </div>
              <select
                className="border rounded px-2 py-1 text-sm w-full h-9 disabled:bg-gray-100"
                value={selectedExternalDomainUid}
                disabled={!canEdit || externalLoading}
                onChange={(e) => setSelectedExternalDomainUid(e.target.value)}
              >
                <option value="">Select a domain...</option>
                {filteredExternalDomains.map(domain => (
                  <option key={domain.domainUid} value={domain.domainUid}>
                    {domain.ownerUsername} / {domain.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600">Node</span>
                <select
                  className="border rounded px-2 py-1 text-xs disabled:bg-gray-100"
                  value={externalNodeType}
                  onChange={(e) => setExternalNodeType(e.target.value as 'meta_definition' | 'meta_exercise')}
                  disabled={!canEdit || externalLoading || nodeType === 'meta_definition'}
                >
                  <option value="meta_definition">Concept</option>
                  {nodeType === 'meta_exercise' && <option value="meta_exercise">Exercise</option>}
                </select>
              </div>
              <Input
                value={externalNodeQuery}
                onChange={(e) => setExternalNodeQuery(e.target.value)}
                placeholder="Search nodes..."
                className="h-7 text-xs w-full"
                disabled={!canEdit || !selectedExternalDomain || externalLoading}
              />
              <select
                className="border rounded px-2 py-1 text-sm w-full h-28 disabled:bg-gray-100"
                value={selectedExternalNodeId === '' ? '' : String(selectedExternalNodeId)}
                disabled={!canEdit || !selectedExternalDomain || externalLoading}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10);
                  setSelectedExternalNodeId(Number.isNaN(parsed) ? '' : parsed);
                }}
              >
                <option value="">Select a node...</option>
                {filteredExternalNodeOptions.map(node => (
                  <option key={`external-${node.numericId}`} value={node.numericId}>
                    {node.code}: {node.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-right">
              <Button
                size="sm"
                onClick={handleAddExternal}
                disabled={
                  !canEdit ||
                  !selectedExternalDomain ||
                  selectedExternalNodeId === '' ||
                  externalLoading
                }
              >
                Link External
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PrerequisitesPanel;
