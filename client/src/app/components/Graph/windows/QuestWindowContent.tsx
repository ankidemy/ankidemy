// client/src/app/components/Graph/windows/QuestWindowContent.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/core/tabs";
import MarkdownPreviewField from '../components/MarkdownPreviewField';
import { showToast } from '@/app/components/core/ToastNotification';
import {
  MetaQuestDTO,
  QuestVersionDTO,
  addQuestVersion,
  deleteQuest,
  deleteQuestVersion,
  getDomainRelations,
  getQuest,
  updateQuest,
  updateQuestRelevantLinks,
  updateQuestVersion,
} from '@/lib/api';
import { GraphData } from '../utils/types';
import { useUI } from '@/contexts/UIContext';

interface QuestWindowContentProps {
  windowId: string;
  questData: Partial<MetaQuestDTO>;
  domainId: number;
  graphData?: GraphData;
  onUpdateQuest?: (updated: MetaQuestDTO) => void;
  onDeleteQuest?: (code: string) => void;
  onRelevantLinksUpdated?: () => void | Promise<void>;
}

type RelationDraft = { relationType: string; toType: 'meta_definition' | 'meta_exercise' | 'source' | 'meta_quest'; toCode: string };

const pad2 = (value: number) => String(value).padStart(2, '0');

const toLocalInputValue = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const min = pad2(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

const deriveSimpleDue = (schedule: any) => {
  if (!schedule || schedule.type !== 'rrule') return null;
  const rrule = typeof schedule.rrule === 'string' ? schedule.rrule : '';
  if (!rrule.includes('COUNT=1')) return null;
  if (!schedule.dtstart) return null;
  return {
    due: schedule.dtstart,
    timezone: schedule.timezone,
    defaultSnoozeMinutes: schedule.defaultSnoozeMinutes,
  };
};

const buildOneOffSchedule = (localValue: string, timezone: string, defaultSnoozeMinutes?: number) => {
  const due = localValue ? new Date(localValue) : new Date();
  return {
    type: 'rrule',
    timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    dtstart: due.toISOString(),
    rrule: 'FREQ=DAILY;COUNT=1',
    exdate: [],
    rdate: [],
    defaultSnoozeMinutes: typeof defaultSnoozeMinutes === 'number' ? defaultSnoozeMinutes : 120,
  };
};

export const QuestWindowContent: React.FC<QuestWindowContentProps> = ({
  windowId,
  questData,
  domainId,
  graphData,
  onUpdateQuest,
  onDeleteQuest,
  onRelevantLinksUpdated,
}) => {
  const ui = useUI();
  const [quest, setQuest] = useState<MetaQuestDTO | null>(null);
  const [versions, setVersions] = useState<QuestVersionDTO[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'versions' | 'relations'>('details');
  const [scheduleDraft, setScheduleDraft] = useState('');
  const [simpleDueDraft, setSimpleDueDraft] = useState('');
  const [showAdvancedSchedule, setShowAdvancedSchedule] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [codeDraft, setCodeDraft] = useState('');
  const [kindDraft, setKindDraft] = useState<'todo' | 'habit' | 'daily'>('todo');
  const [visibilityDraft, setVisibilityDraft] = useState<'private' | 'domain'>('private');
  const [activeDraft, setActiveDraft] = useState(true);
  const [versionDrafts, setVersionDrafts] = useState<Record<number, { title: string; descriptionMd: string }>>({});
  const [newVersionTitle, setNewVersionTitle] = useState('');
  const [newVersionDescription, setNewVersionDescription] = useState('');
  const [showAddVersionForm, setShowAddVersionForm] = useState(false);
  const [relevantLinks, setRelevantLinks] = useState<RelationDraft[]>([]);
  const [newRelation, setNewRelation] = useState<RelationDraft>({
    relationType: 'relevant',
    toType: 'meta_definition',
    toCode: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const codeLookup = useMemo(() => {
    const map = new Map<string, string>();
    Object.values(graphData?.definitions || {}).forEach(def => {
      if (def.id) map.set(`meta_definition:${def.id}`, def.code);
    });
    Object.values(graphData?.exercises || {}).forEach(ex => {
      if (ex.id) map.set(`meta_exercise:${ex.id}`, ex.code);
    });
    Object.values(graphData?.sources || {}).forEach(src => {
      if (src.id) map.set(`source:${src.id}`, src.code);
    });
    Object.values(graphData?.quests || {}).forEach(q => {
      if (q.id) map.set(`meta_quest:${q.id}`, q.code);
    });
    return map;
  }, [graphData]);

  const loadQuest = useCallback(async () => {
    if (!questData?.id) return;
    setIsLoading(true);
    try {
      const fresh = await getQuest(questData.id);
      setQuest(fresh);
      setVersions(fresh.versions || []);
      setSelectedVersionId(fresh.versions?.[0]?.id ?? null);
      setNameDraft(fresh.name || fresh.versions?.[0]?.title || '');
      setCodeDraft(fresh.code || '');
      setKindDraft(fresh.kind || 'todo');
      setVisibilityDraft(fresh.visibility || 'private');
      setActiveDraft(fresh.active ?? true);
      setActiveTab('details');
      setShowAddVersionForm(false);
      const scheduleText = fresh.schedule ? JSON.stringify(fresh.schedule, null, 2) : '';
      setScheduleDraft(scheduleText);
      const simple = deriveSimpleDue(fresh.schedule);
      if (simple?.due) {
        setSimpleDueDraft(toLocalInputValue(new Date(simple.due)));
        setShowAdvancedSchedule(false);
      } else {
        setSimpleDueDraft('');
        setShowAdvancedSchedule(true);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to load quest.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [questData?.id]);

  useEffect(() => {
    if (questData?.id) {
      loadQuest();
    } else if (questData?.code) {
      const fallback = questData as MetaQuestDTO;
      setQuest(fallback);
      setVersions(fallback.versions || []);
      setSelectedVersionId(fallback.versions?.[0]?.id ?? null);
      setNameDraft(fallback.name || fallback.versions?.[0]?.title || '');
      setCodeDraft(fallback.code || '');
      setKindDraft(fallback.kind || 'todo');
      setVisibilityDraft(fallback.visibility || 'private');
      setActiveDraft(fallback.active ?? true);
      setActiveTab('details');
      setShowAddVersionForm(false);
      setScheduleDraft(fallback.schedule ? JSON.stringify(fallback.schedule, null, 2) : '');
      const simple = deriveSimpleDue(fallback.schedule);
      if (simple?.due) {
        setSimpleDueDraft(toLocalInputValue(new Date(simple.due)));
        setShowAdvancedSchedule(false);
      } else {
        setSimpleDueDraft('');
        setShowAdvancedSchedule(true);
      }
    }
  }, [questData?.id, questData?.code, loadQuest]);

  useEffect(() => {
    const drafts: Record<number, { title: string; descriptionMd: string }> = {};
    versions.forEach(v => {
      if (!v.id) return;
      drafts[v.id] = {
        title: v.title || '',
        descriptionMd: v.descriptionMd || '',
      };
    });
    setVersionDrafts(drafts);
  }, [versions]);

  useEffect(() => {
    if (kindDraft !== 'todo') {
      setShowAdvancedSchedule(true);
    }
  }, [kindDraft]);

  const loadRelevantLinks = useCallback(async (versionId: number | null) => {
    if (!quest?.id || !versionId) {
      setRelevantLinks([]);
      return;
    }
    try {
      const relations = await getDomainRelations(domainId);
      const filtered = relations.filter(rel =>
        rel.fromType === 'meta_quest' &&
        rel.fromId === quest.id &&
        (rel.contextKey || '') === `quest_version:${versionId}`
      );
      const mapped = filtered
        .map(rel => {
          const code = codeLookup.get(`${rel.toType}:${rel.toId}`);
          if (!code) return null;
          return {
            relationType: rel.relationType,
            toType: rel.toType,
            toCode: code,
          } as RelationDraft;
        })
        .filter((item): item is RelationDraft => !!item);
      setRelevantLinks(mapped);
    } catch (err) {
      console.warn('Failed to load relevant links:', err);
      setRelevantLinks([]);
    }
  }, [quest?.id, domainId, codeLookup]);

  useEffect(() => {
    loadRelevantLinks(selectedVersionId);
  }, [selectedVersionId, loadRelevantLinks]);

  const handleSaveQuest = useCallback(async () => {
    if (!quest?.id) return;
    if (nameDraft.trim().length === 0) {
      showToast('Quest name is required.', 'warning');
      return;
    }
    setIsSaving(true);
    try {
      let parsedSchedule: any = null;
      if (!showAdvancedSchedule && simpleDueDraft) {
        let existing: any = null;
        try { existing = scheduleDraft.trim().length > 0 ? JSON.parse(scheduleDraft) : null; } catch {}
        const timezone = existing?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
        parsedSchedule = buildOneOffSchedule(simpleDueDraft, timezone, existing?.defaultSnoozeMinutes);
      } else if (scheduleDraft.trim().length > 0) {
        parsedSchedule = JSON.parse(scheduleDraft);
      }
      const payload: Partial<MetaQuestDTO> & { active?: boolean } = {
        name: nameDraft.trim(),
        code: codeDraft.trim(),
        kind: kindDraft,
        schedule: parsedSchedule ?? quest.schedule,
        visibility: visibilityDraft,
        active: activeDraft,
      };
      const updated = await updateQuest(quest.id, payload);
      setQuest(updated);
      if (updated.name) {
        setNameDraft(updated.name);
      }
      onUpdateQuest?.(updated);
      showToast('Quest updated.', 'success');
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        showToast('Schedule JSON is invalid.', 'error');
      } else if (err?.message?.includes('409') || err?.message?.includes('conflict')) {
        showToast('Quest code already exists in this domain.', 'error');
      } else {
        showToast(err instanceof Error ? err.message : 'Failed to update quest.', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    quest?.id,
    nameDraft,
    scheduleDraft,
    simpleDueDraft,
    showAdvancedSchedule,
    codeDraft,
    kindDraft,
    visibilityDraft,
    activeDraft,
    onUpdateQuest,
    quest?.schedule,
  ]);

  const handleSaveVersion = useCallback(async (versionId: number) => {
    if (!quest?.id) return;
    const draft = versionDrafts[versionId];
    if (!draft || draft.title.trim().length === 0) {
      showToast('Version title is required.', 'warning');
      return;
    }
    try {
      const updated = await updateQuestVersion(quest.id, versionId, {
        title: draft.title.trim(),
        descriptionMd: draft.descriptionMd || '',
      });
      setVersions(prev => prev.map(v => (v.id === versionId ? { ...v, ...updated } : v)));
      showToast('Version updated.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update version.', 'error');
    }
  }, [quest?.id, versionDrafts]);

  const handleAddVersion = useCallback(async () => {
    if (!quest?.id) return;
    if (newVersionTitle.trim().length === 0) {
      showToast('Version title is required.', 'warning');
      return;
    }
    try {
      const created = await addQuestVersion(quest.id, {
        title: newVersionTitle.trim(),
        descriptionMd: newVersionDescription || '',
      });
      setVersions(prev => [...prev, created]);
      setNewVersionTitle('');
      setNewVersionDescription('');
      setSelectedVersionId(created.id || null);
      setShowAddVersionForm(false);
      showToast('Version added.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add version.', 'error');
    }
  }, [quest?.id, newVersionTitle, newVersionDescription]);

  const handleDeleteVersion = useCallback(async (versionId: number) => {
    if (!quest?.id) return;
    if (versions.length <= 1) {
      showToast('A quest must have at least one version.', 'warning');
      return;
    }
    if (!confirm('Delete this version?')) return;
    try {
      await deleteQuestVersion(quest.id, versionId);
      setVersions(prev => prev.filter(v => v.id !== versionId));
      if (selectedVersionId === versionId) {
        const next = versions.find(v => v.id !== versionId)?.id ?? null;
        setSelectedVersionId(next);
      }
      showToast('Version deleted.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete version.', 'error');
    }
  }, [quest?.id, versions, selectedVersionId]);

  const handleDeleteQuest = useCallback(async () => {
    if (!quest?.id) return;
    if (!confirm('Delete this quest? This cannot be undone.')) return;
    setIsDeleting(true);
    try {
      await deleteQuest(quest.id);
      showToast('Quest deleted.', 'success');
      if (quest.code) onDeleteQuest?.(quest.code);
      ui.closeWindow(windowId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete quest.', 'error');
    } finally {
      setIsDeleting(false);
    }
  }, [quest?.id, ui, windowId]);

  const handleSaveRelevantLinks = useCallback(async () => {
    if (!quest?.id || !selectedVersionId) return;
    try {
      const payload = relevantLinks
        .filter(link => link.toCode.trim().length > 0)
        .map(link => ({
          relationType: link.relationType || 'relevant',
          toType: link.toType,
          toCode: link.toCode.trim(),
        }));
      await updateQuestRelevantLinks(quest.id, selectedVersionId, payload);
      showToast('Relevant links updated.', 'success');
      await onRelevantLinksUpdated?.();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update relevant links.', 'error');
    }
  }, [quest?.id, selectedVersionId, relevantLinks, onRelevantLinksUpdated]);

  const handleAddRelevantLink = useCallback(() => {
    if (!newRelation.toCode.trim()) return;
    setRelevantLinks(prev => [...prev, { ...newRelation, toCode: newRelation.toCode.trim() }]);
    setNewRelation(prev => ({ ...prev, toCode: '' }));
  }, [newRelation]);

  return (
    <div className="flex flex-col gap-4 text-sm p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-semibold text-gray-900">
            {quest?.name?.trim() || questData.name?.trim() || 'Quest'}
          </div>
          {(quest?.code || questData.code) && (
            <div className="text-xs text-gray-500">Code: {quest?.code || questData.code}</div>
          )}
        </div>
        {isLoading && <span className="text-xs text-gray-500">Loading…</span>}
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as 'details' | 'versions' | 'relations')}
        className="w-full"
      >
        <TabsList className="w-full justify-start">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="versions">Versions</TabsTrigger>
          <TabsTrigger value="relations">Relevant Links</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600">Name</label>
              <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className="h-8 mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Code</label>
              <Input value={codeDraft} onChange={(e) => setCodeDraft(e.target.value)} className="h-8 mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Kind</label>
              <select
                value={kindDraft}
                onChange={(e) => setKindDraft(e.target.value as any)}
                className="mt-1 h-8 w-full rounded border border-gray-300 bg-white px-2 text-xs text-gray-700"
              >
                <option value="todo">Todo</option>
                <option value="habit">Habit</option>
                <option value="daily">Daily</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Visibility</label>
              <select
                value={visibilityDraft}
                onChange={(e) => setVisibilityDraft(e.target.value as any)}
                className="mt-1 h-8 w-full rounded border border-gray-300 bg-white px-2 text-xs text-gray-700"
              >
                <option value="private">Private</option>
                <option value="domain">Domain</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600">Active</label>
              <input
                type="checkbox"
                checked={activeDraft}
                onChange={(e) => setActiveDraft(e.target.checked)}
                className="h-4 w-4"
              />
              {quest?.nextDueAt && (
                <span className="text-xs text-gray-500">Next due: {new Date(quest.nextDueAt).toLocaleString()}</span>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Schedule</label>
              {kindDraft === 'todo' && simpleDueDraft ? (
                <div className="mt-1 space-y-2">
                  <Input
                    type="datetime-local"
                    value={simpleDueDraft}
                    onChange={(e) => setSimpleDueDraft(e.target.value)}
                    className="h-8"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowAdvancedSchedule(prev => !prev)}
                    className="px-2 text-xs"
                  >
                    {showAdvancedSchedule ? 'Hide Advanced' : 'Advanced JSON'}
                  </Button>
                </div>
              ) : (
                <div className="mt-1 space-y-2">
                  <div className="text-xs text-gray-500">
                    Schedule editor is available for one-off reminders. Use Advanced JSON for this quest.
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowAdvancedSchedule(prev => !prev)}
                    className="px-2 text-xs"
                  >
                    {showAdvancedSchedule ? 'Hide Advanced' : 'Advanced JSON'}
                  </Button>
                </div>
              )}
              {showAdvancedSchedule && (
                <textarea
                  value={scheduleDraft}
                  onChange={(e) => setScheduleDraft(e.target.value)}
                  rows={5}
                  className="mt-2 w-full rounded border border-gray-300 px-2 py-2 text-xs font-mono"
                />
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSaveQuest} disabled={isSaving || !quest?.id}>
              {isSaving ? 'Saving…' : 'Save Quest'}
            </Button>
            <Button size="sm" variant="destructive" onClick={handleDeleteQuest} disabled={!quest?.id || isDeleting}>
              {isDeleting ? 'Deleting…' : 'Delete Quest'}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="versions" className="mt-3 space-y-3">
          {versions.length === 0 && <div className="text-xs text-gray-500">No versions yet.</div>}
          {versions.map((version, index) => {
            const draft = versionDrafts[version.id || 0] || { title: version.title || '', descriptionMd: version.descriptionMd || '' };
            return (
              <div key={version.id} className="rounded-md border border-gray-200 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-gray-700">Version {index + 1}</div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => handleSaveVersion(version.id || 0)} disabled={!version.id}>
                      Save
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => handleDeleteVersion(version.id || 0)} disabled={!version.id || versions.length <= 1}>
                      Delete
                    </Button>
                  </div>
                </div>
                <Input
                  value={draft.title}
                  onChange={(e) => {
                    const value = e.target.value;
                    setVersionDrafts(prev => ({ ...prev, [version.id || 0]: { ...draft, title: value } }));
                  }}
                  className="h-8"
                  placeholder="Version title"
                />
                <MarkdownPreviewField
                  label="Description (Markdown)"
                  value={draft.descriptionMd}
                  onChange={(value) => {
                    setVersionDrafts(prev => ({ ...prev, [version.id || 0]: { ...draft, descriptionMd: value } }));
                  }}
                  rows={4}
                />
              </div>
            );
          })}

          {showAddVersionForm ? (
            <div className="rounded-md border border-dashed border-gray-200 p-3 space-y-2">
              <div className="text-xs font-semibold text-gray-700">Add New Version</div>
              <Input
                value={newVersionTitle}
                onChange={(e) => setNewVersionTitle(e.target.value)}
                className="h-8"
                placeholder="Version title"
              />
              <MarkdownPreviewField
                label="Description (Markdown)"
                value={newVersionDescription}
                onChange={(value) => setNewVersionDescription(value)}
                rows={3}
              />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleAddVersion} disabled={!quest?.id}>
                  Add Version
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAddVersionForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setShowAddVersionForm(true)}>
              Add New Version
            </Button>
          )}
        </TabsContent>

        <TabsContent value="relations" className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-gray-700">Relevant Links</div>
            <select
              value={selectedVersionId ?? ''}
              onChange={(e) => setSelectedVersionId(Number(e.target.value))}
              className="h-7 rounded border border-gray-200 bg-white px-2 text-xs text-gray-700"
            >
              {versions.map((v, idx) => (
                <option key={v.id} value={v.id}>{v.title || `Version ${idx + 1}`}</option>
              ))}
            </select>
          </div>
          {relevantLinks.length === 0 && (
            <div className="text-xs text-gray-500">No relevant links for this version.</div>
          )}
          {relevantLinks.map((link, idx) => (
            <div key={`${link.toCode}-${idx}`} className="flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">{link.relationType}</span>
              <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">{link.toType}</span>
              <span className="text-gray-800">{link.toCode}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setRelevantLinks(prev => prev.filter((_, i) => i !== idx))}
              >
                Remove
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input
              value={newRelation.relationType}
              onChange={(e) => setNewRelation(prev => ({ ...prev, relationType: e.target.value }))}
              className="h-7 text-xs"
              placeholder="relation type"
            />
            <select
              value={newRelation.toType}
              onChange={(e) => setNewRelation(prev => ({ ...prev, toType: e.target.value as any }))}
              className="h-7 rounded border border-gray-200 bg-white px-2 text-xs text-gray-700"
            >
              <option value="meta_definition">Definition</option>
              <option value="meta_exercise">Exercise</option>
              <option value="source">Source</option>
              <option value="meta_quest">Quest</option>
            </select>
            <Input
              value={newRelation.toCode}
              onChange={(e) => setNewRelation(prev => ({ ...prev, toCode: e.target.value }))}
              className="h-7 text-xs"
              placeholder="Target code"
            />
            <Button size="sm" variant="outline" onClick={handleAddRelevantLink}>
              Add
            </Button>
            <Button size="sm" onClick={handleSaveRelevantLinks} disabled={!quest?.id || !selectedVersionId}>
              Save Links
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default QuestWindowContent;
