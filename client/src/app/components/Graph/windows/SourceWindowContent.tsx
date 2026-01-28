// client/src/app/components/Graph/windows/SourceWindowContent.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import MarkdownPreviewField from '../components/MarkdownPreviewField';
import { showToast } from '@/app/components/core/ToastNotification';
import { createQuest, createRelation, deleteRelation, deleteSource, getDomainRelations, getSource, updateSource, SourceDTO, MetaQuestDTO } from '@/lib/api';
import { useUI } from '@/contexts/UIContext';
import { GraphData } from '../utils/types';
import { getNextQuestCode as getNextQuestCodeFromUtils } from '../utils/codeGeneration';

interface SourceWindowContentProps {
  windowId: string;
  sourceData: Partial<SourceDTO> & { name?: string };
  domainId: number;
  graphData?: GraphData;
  onUpdateSource?: (updated: SourceDTO) => void;
  onQuestCreated?: (quest: MetaQuestDTO, relation: { fromCode: string; toCode: string; relationType: string }) => void;
  onDeleteSource?: (code: string) => void;
  onRelevantLinksUpdated?: () => void | Promise<void>;
}

type RelationDraft = { id?: number; relationType: string; toType: 'meta_definition' | 'meta_exercise'; toCode: string };

const pad2 = (value: number) => String(value).padStart(2, '0');

const toLocalInputValue = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const min = pad2(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};

export const SourceWindowContent: React.FC<SourceWindowContentProps> = ({
  windowId,
  sourceData,
  domainId,
  graphData,
  onUpdateSource,
  onQuestCreated,
  onDeleteSource,
  onRelevantLinksUpdated,
}) => {
  const ui = useUI();
  const [source, setSource] = useState<SourceDTO | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [codeDraft, setCodeDraft] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [contentDraft, setContentDraft] = useState('');
  const [bibtexDraft, setBibtexDraft] = useState('');
  const [visibilityDraft, setVisibilityDraft] = useState<'private' | 'domain'>('private');

  const [showReminderForm, setShowReminderForm] = useState(false);
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDue, setReminderDue] = useState(() => toLocalInputValue(new Date(Date.now() + 2 * 60 * 60 * 1000)));

  const [relevantLinks, setRelevantLinks] = useState<RelationDraft[]>([]);
  const [newRelation, setNewRelation] = useState<RelationDraft>({
    relationType: 'relevant',
    toType: 'meta_definition',
    toCode: '',
  });

  const codeLookup = useMemo(() => {
    const map = new Map<string, string>();
    Object.values(graphData?.definitions || {}).forEach(def => {
      if (def.id) map.set(`meta_definition:${def.id}`, def.code);
    });
    Object.values(graphData?.exercises || {}).forEach(ex => {
      if (ex.id) map.set(`meta_exercise:${ex.id}`, ex.code);
    });
    return map;
  }, [graphData]);

  const existingCodes = useMemo(() => {
    const codes = new Set<string>();
    Object.keys(graphData?.definitions || {}).forEach(code => codes.add(code));
    Object.keys(graphData?.exercises || {}).forEach(code => codes.add(code));
    Object.keys(graphData?.sources || {}).forEach(code => codes.add(code));
    Object.keys(graphData?.quests || {}).forEach(code => codes.add(code));
    return codes;
  }, [graphData]);

  const targetLookup = useMemo(() => {
    const map = new Map<string, { type: 'meta_definition' | 'meta_exercise'; id: number }>();
    Object.values(graphData?.definitions || {}).forEach(def => {
      if (def.id) map.set(def.code, { type: 'meta_definition', id: def.id });
    });
    Object.values(graphData?.exercises || {}).forEach(ex => {
      if (ex.id) map.set(ex.code, { type: 'meta_exercise', id: ex.id });
    });
    return map;
  }, [graphData]);

  useEffect(() => {
    if (!sourceData) return;
    const initial: SourceDTO = {
      id: sourceData.id,
      domainId: sourceData.domainId,
      ownerId: sourceData.ownerId,
      code: sourceData.code || '',
      title: sourceData.title || sourceData.name || '',
      contentMd: sourceData.contentMd || '',
      bibtexKey: sourceData.bibtexKey ?? '',
      filePath: sourceData.filePath ?? null,
      xPosition: sourceData.xPosition,
      yPosition: sourceData.yPosition,
      visibility: sourceData.visibility || 'private',
    };
    setSource(initial);
    setCodeDraft(initial.code);
    setTitleDraft(initial.title);
    setContentDraft(initial.contentMd || '');
    setBibtexDraft(initial.bibtexKey || '');
    setVisibilityDraft(initial.visibility || 'private');
    setIsDirty(false);
  }, [sourceData?.id]);

  useEffect(() => {
    if (!sourceData?.id) return;
    if (sourceData.contentMd && sourceData.title) return;
    setIsLoading(true);
    getSource(sourceData.id)
      .then(fresh => {
        if (isDirty) return;
        setSource(fresh);
        setCodeDraft(fresh.code);
        setTitleDraft(fresh.title);
        setContentDraft(fresh.contentMd || '');
        setBibtexDraft(fresh.bibtexKey || '');
        setVisibilityDraft(fresh.visibility || 'private');
      })
      .catch(err => {
        console.warn('Failed to load source:', err);
      })
      .finally(() => setIsLoading(false));
  }, [sourceData?.id, sourceData?.contentMd, sourceData?.title, isDirty]);

  const loadRelevantLinks = useCallback(async () => {
    if (!source?.id) {
      setRelevantLinks([]);
      return;
    }
    try {
      const relations = await getDomainRelations(domainId);
      const filtered = relations.filter(rel =>
        rel.fromType === 'source' &&
        rel.fromId === source.id &&
        (rel.relationType || 'relevant') === 'relevant'
      );
      const mapped = filtered
        .map(rel => {
          const code = codeLookup.get(`${rel.toType}:${rel.toId}`);
          if (!code) return null;
          if (rel.toType !== 'meta_definition' && rel.toType !== 'meta_exercise') return null;
          return {
            id: rel.id,
            relationType: rel.relationType || 'relevant',
            toType: rel.toType,
            toCode: code,
          } as RelationDraft;
        })
        .filter((item): item is RelationDraft => !!item);
      setRelevantLinks(mapped);
    } catch (err) {
      console.warn('Failed to load source relevant links:', err);
      setRelevantLinks([]);
    }
  }, [source?.id, domainId, codeLookup]);

  useEffect(() => {
    loadRelevantLinks();
  }, [loadRelevantLinks]);

  useEffect(() => {
    if (!source?.title) return;
    if (!reminderTitle) {
      setReminderTitle(`Review source: ${source.title}`);
    }
  }, [source?.title, reminderTitle]);

  const canSave = useMemo(() => {
    if (!source) return false;
    return codeDraft.trim().length > 0 && titleDraft.trim().length > 0;
  }, [codeDraft, titleDraft, source]);

  const handleSave = useCallback(async () => {
    if (!source?.id) return;
    if (!canSave) {
      showToast('Code and title are required.', 'warning');
      return;
    }
    setIsSaving(true);
    try {
      const payload: Partial<SourceDTO> = {
        code: codeDraft.trim(),
        title: titleDraft.trim(),
        contentMd: contentDraft,
        bibtexKey: bibtexDraft.trim().length > 0 ? bibtexDraft.trim() : null,
        visibility: visibilityDraft,
      };
      const updated = await updateSource(source.id, payload);
      setSource(updated);
      setCodeDraft(updated.code);
      setTitleDraft(updated.title);
      setContentDraft(updated.contentMd || '');
      setBibtexDraft(updated.bibtexKey || '');
      setVisibilityDraft(updated.visibility || 'private');
      setIsDirty(false);
      onUpdateSource?.(updated);
      showToast('Source updated.', 'success');
    } catch (err: any) {
      if (err?.message?.includes('409') || err?.message?.includes('conflict')) {
        showToast('Source code already exists in this domain.', 'error');
      } else {
        showToast(err instanceof Error ? err.message : 'Failed to update source.', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  }, [source?.id, codeDraft, titleDraft, contentDraft, bibtexDraft, visibilityDraft, canSave, onUpdateSource]);

  const handleDelete = useCallback(async () => {
    if (!source?.id) return;
    if (!confirm('Delete this source? This cannot be undone.')) return;
    setIsDeleting(true);
    try {
      await deleteSource(source.id);
      showToast('Source deleted.', 'success');
      if (source.code) onDeleteSource?.(source.code);
      ui.closeWindow(windowId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete source.', 'error');
    } finally {
      setIsDeleting(false);
    }
  }, [source?.id, ui, windowId]);

  const handleCreateReminder = useCallback(async () => {
    if (!source?.id || !source.title) {
      showToast('Source must be saved before creating a reminder.', 'warning');
      return;
    }
    const dueDate = reminderDue ? new Date(reminderDue) : new Date(Date.now() + 2 * 60 * 60 * 1000);
    const schedule = {
      type: 'rrule',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      dtstart: dueDate.toISOString(),
      rrule: 'FREQ=DAILY;COUNT=1',
      exdate: [],
      rdate: [],
      defaultSnoozeMinutes: 120,
    };

    try {
      const reminderCode = existingCodes.size > 0 ? getNextQuestCodeFromUtils(existingCodes) : 'Q1';
      const quest = await createQuest(domainId, {
        code: reminderCode,
        kind: 'todo',
        schedule,
        visibility: 'private',
        initialVersion: {
          title: reminderTitle.trim().length > 0 ? reminderTitle.trim() : `Review source: ${source.title}`,
          descriptionMd: '',
        },
      });
      if (!quest.id) throw new Error('Quest created without id.');
      await createRelation(domainId, {
        fromType: 'meta_quest',
        fromId: quest.id,
        toType: 'source',
        toId: source.id,
        relationType: 'reminds_open',
      });
      onQuestCreated?.(quest, { fromCode: quest.code, toCode: source.code, relationType: 'reminds_open' });
      showToast('Reminder quest created.', 'success');
      setShowReminderForm(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create reminder.', 'error');
    }
  }, [source?.id, source?.title, source?.code, reminderDue, reminderTitle, domainId, onQuestCreated, existingCodes]);

  const handleAddRelevantLink = useCallback(async () => {
    if (!source?.id) return;
    const code = newRelation.toCode.trim();
    if (!code) return;
    const target = targetLookup.get(code);
    if (!target || target.type !== newRelation.toType) {
      showToast('Target code not found for selected type.', 'warning');
      return;
    }
    const exists = relevantLinks.some(link => link.toType === newRelation.toType && link.toCode === code);
    if (exists) {
      showToast('These nodes are already linked.', 'info');
      return;
    }
    try {
      const created = await createRelation(domainId, {
        fromType: 'source',
        fromId: source.id,
        toType: newRelation.toType,
        toId: target.id,
        relationType: 'relevant',
      });
      setRelevantLinks(prev => [
        ...prev,
        { id: created.id, relationType: 'relevant', toType: newRelation.toType, toCode: code },
      ]);
      setNewRelation(prev => ({ ...prev, toCode: '' }));
      await onRelevantLinksUpdated?.();
      showToast('Relevant link added.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add relevant link.', 'error');
    }
  }, [source?.id, newRelation, targetLookup, relevantLinks, domainId, onRelevantLinksUpdated]);

  const handleRemoveRelevantLink = useCallback(async (link: RelationDraft) => {
    if (!source?.id) return;
    try {
      if (link.id) {
        await deleteRelation(link.id);
      } else {
        const relations = await getDomainRelations(domainId);
        const match = relations.find(rel =>
          rel.fromType === 'source' &&
          rel.fromId === source.id &&
          rel.toType === link.toType &&
          (rel.relationType || 'relevant') === 'relevant' &&
          codeLookup.get(`${rel.toType}:${rel.toId}`) === link.toCode
        );
        if (match?.id) {
          await deleteRelation(match.id);
        } else {
          showToast('Link not found.', 'warning');
          return;
        }
      }
      setRelevantLinks(prev => prev.filter(item => !(item.toType === link.toType && item.toCode === link.toCode)));
      await onRelevantLinksUpdated?.();
      showToast('Relevant link removed.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to remove relevant link.', 'error');
    }
  }, [source?.id, domainId, codeLookup, onRelevantLinksUpdated]);

  return (
    <div className="flex flex-col gap-4 text-sm p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-semibold text-gray-900">{source?.title?.trim() || 'Source'}</div>
          {source?.code && (
            <div className="text-xs text-gray-500">Code: {source.code}</div>
          )}
        </div>
        {isLoading && <span className="text-xs text-gray-500">Loading…</span>}
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-600">Code</label>
          <Input
            value={codeDraft}
            onChange={(e) => {
              setCodeDraft(e.target.value);
              setIsDirty(true);
            }}
            className="h-8 mt-1"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Title</label>
          <Input
            value={titleDraft}
            onChange={(e) => {
              setTitleDraft(e.target.value);
              setIsDirty(true);
            }}
            className="h-8 mt-1"
          />
        </div>
        <MarkdownPreviewField
          label="Content (Markdown)"
          value={contentDraft}
          onChange={(value) => {
            setContentDraft(value);
            setIsDirty(true);
          }}
          rows={6}
          placeholder="Add source notes, links, citations…"
        />
        <div>
          <label className="text-xs font-medium text-gray-600">BibTeX key</label>
          <Input
            value={bibtexDraft}
            onChange={(e) => {
              setBibtexDraft(e.target.value);
              setIsDirty(true);
            }}
            placeholder="optional"
            className="h-8 mt-1"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600">Visibility</label>
          <select
            value={visibilityDraft}
            onChange={(e) => {
              setVisibilityDraft(e.target.value as 'private' | 'domain');
              setIsDirty(true);
            }}
            className="mt-1 h-8 w-full rounded border border-gray-300 bg-white px-2 text-xs text-gray-700"
          >
            <option value="private">Private</option>
            <option value="domain">Domain</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSave} disabled={!canSave || isSaving}>
          {isSaving ? 'Saving…' : 'Save'}
        </Button>
        <Button size="sm" variant="destructive" onClick={handleDelete} disabled={isDeleting || !source?.id}>
          {isDeleting ? 'Deleting…' : 'Delete'}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowReminderForm(prev => !prev)}
          disabled={!source?.id}
        >
          {showReminderForm ? 'Close Reminder' : 'Create Reminder'}
        </Button>
      </div>

      {showReminderForm && (
        <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3 space-y-2">
          <div className="text-xs font-semibold text-amber-700">Reminder Quest</div>
          <div>
            <label className="text-xs text-gray-600">Title</label>
            <Input
              value={reminderTitle}
              onChange={(e) => setReminderTitle(e.target.value)}
              className="h-8 mt-1"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600">Due at</label>
            <Input
              type="datetime-local"
              value={reminderDue}
              onChange={(e) => setReminderDue(e.target.value)}
              className="h-8 mt-1"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleCreateReminder}>
              Create Todo Quest
            </Button>
          </div>
        </div>
      )}

      <div className="border-t pt-3 space-y-2">
        <div className="text-xs font-semibold text-gray-700">Relevant Links</div>
        {relevantLinks.length === 0 && (
          <div className="text-xs text-gray-500">No relevant links yet.</div>
        )}
        {relevantLinks.map((link, idx) => (
          <div key={`${link.toCode}-${idx}`} className="flex items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">
              {link.toType === 'meta_definition' ? 'Definition' : 'Exercise'}
            </span>
            <span className="text-gray-800">{link.toCode}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleRemoveRelevantLink(link)}
            >
              Remove
            </Button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <select
            value={newRelation.toType}
            onChange={(e) => setNewRelation(prev => ({ ...prev, toType: e.target.value as RelationDraft['toType'] }))}
            className="h-7 rounded border border-gray-200 bg-white px-2 text-xs text-gray-700"
          >
            <option value="meta_definition">Definition</option>
            <option value="meta_exercise">Exercise</option>
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
        </div>
      </div>
    </div>
  );
};

export default SourceWindowContent;
