// client/src/app/components/Graph/windows/SourceWindowContent.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import MarkdownPreviewField from '../components/MarkdownPreviewField';
import { showToast } from '@/app/components/core/ToastNotification';
import { createQuest, createRelation, deleteRelation, deleteSource, getDomainRelations, getSource, updateSource, SourceDTO, MetaQuestDTO } from '@/lib/api';
import { getAppTimeZone } from '@/lib/app-preferences';
import { useUI } from '@/contexts/UIContext';
import { GraphData } from '../utils/types';
import { getNextQuestCode as getNextQuestCodeFromUtils } from '../utils/codeGeneration';
import { ArrowLeft, Edit, Save, X, Lock, Unlock, Copy, RefreshCw } from 'lucide-react';
import { MarkdownKatex } from '@/app/components/core/MarkdownKatex';

interface SourceWindowContentProps {
  windowId: string;
  sourceData: Partial<SourceDTO> & { name?: string };
  domainId: number;
  graphData?: GraphData;
  onUpdateSource?: (updated: SourceDTO) => void;
  onQuestCreated?: (quest: MetaQuestDTO, relation: { fromCode: string; toCode: string; relationType: string }) => void;
  onDeleteSource?: (code: string) => void;
  onRelevantLinksUpdated?: () => void | Promise<void>;
  onNavigateToNode?: (nodeId: string) => void;
  onCopyYaml?: () => void;
  isCopyingYaml?: boolean;
}

type RelationDraft = { id?: number; relationType: string; toType: 'meta_definition' | 'meta_exercise'; toCode: string };

const pad2 = (value: number) => String(value).padStart(2, '0');

const getErrorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
};

const DEFAULT_REMINDER_OFFSET_MINUTES = 60;

const toLocalDateInputValue = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  return `${yyyy}-${mm}-${dd}`;
};

const toLocalTimeInputValue = (date: Date) => {
  const hh = pad2(date.getHours());
  const min = pad2(date.getMinutes());
  return `${hh}:${min}`;
};

const getDefaultReminderDateTime = () => new Date(Date.now() + DEFAULT_REMINDER_OFFSET_MINUTES * 60 * 1000);

const getDefaultReminderDraft = () => {
  const date = getDefaultReminderDateTime();
  return {
    date: toLocalDateInputValue(date),
    time: toLocalTimeInputValue(date),
  };
};

const getReminderDraftFromOffsetMinutes = (offsetMinutes: number) => {
  const date = new Date(Date.now() + offsetMinutes * 60 * 1000);
  return {
    date: toLocalDateInputValue(date),
    time: toLocalTimeInputValue(date),
  };
};

const buildReminderDateTime = (dateValue: string, timeValue: string) => {
  const fallbackDate = getDefaultReminderDateTime();
  const fallbackDateValue = toLocalDateInputValue(fallbackDate);
  const fallbackTimeValue = toLocalTimeInputValue(fallbackDate);
  const date = dateValue || fallbackDateValue;
  const time = timeValue || fallbackTimeValue;
  const combined = new Date(`${date}T${time}`);
  return Number.isNaN(combined.getTime()) ? fallbackDate : combined;
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
  onNavigateToNode,
  onCopyYaml,
  isCopyingYaml = false,
}) => {
  const ui = useUI();
  const [source, setSource] = useState<SourceDTO | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isHeaderCodeEditing, setIsHeaderCodeEditing] = useState(false);
  const [isRelevantLinksExpanded, setIsRelevantLinksExpanded] = useState(false);

  const [codeDraft, setCodeDraft] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [contentDraft, setContentDraft] = useState('');
  const [bibtexDraft, setBibtexDraft] = useState('');
  const [visibilityDraft, setVisibilityDraft] = useState<'private' | 'domain'>('private');

  const [showReminderForm, setShowReminderForm] = useState(false);
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDraft, setReminderDraft] = useState(() => getDefaultReminderDraft());

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
    setIsEditMode(false);
    setIsHeaderCodeEditing(false);
    setIsRelevantLinksExpanded(false);
    setShowReminderForm(false);
    setReminderDraft(getDefaultReminderDraft());
  }, [sourceData]);

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
        setIsHeaderCodeEditing(false);
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
      ui.updateWindow(windowId, {
        title: updated.title || updated.code || 'Source',
        contentProps: { sourceData: updated },
      });
      showToast('Source updated.', 'success');
      setIsEditMode(false);
      setIsHeaderCodeEditing(false);
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      if (message.includes('409') || message.toLowerCase().includes('conflict')) {
        showToast('Source code already exists in this domain.', 'error');
      } else {
        showToast(message || 'Failed to update source.', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  }, [source?.id, codeDraft, titleDraft, contentDraft, bibtexDraft, visibilityDraft, canSave, onUpdateSource, ui, windowId]);

  const handleCancelEdit = useCallback(() => {
    const base = source;
    if (!base) {
      setIsEditMode(false);
      setIsDirty(false);
      return;
    }
    setCodeDraft(base.code || '');
    setTitleDraft(base.title || '');
    setContentDraft(base.contentMd || '');
    setBibtexDraft(base.bibtexKey || '');
    setVisibilityDraft(base.visibility || 'private');
    setIsDirty(false);
    setIsHeaderCodeEditing(false);
    setIsEditMode(false);
  }, [source]);

  const handleToggleEditMode = useCallback(() => {
    if (isEditMode) {
      handleCancelEdit();
      return;
    }
    if (!source?.id) return;
    setShowReminderForm(false);
    setIsEditMode(true);
    setIsHeaderCodeEditing(false);
    setIsRelevantLinksExpanded(false);
  }, [handleCancelEdit, isEditMode, source?.id]);

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
  }, [source?.id, source?.code, onDeleteSource, ui, windowId]);

  const handleCreateReminder = useCallback(async () => {
    if (!source?.id || !source.title) {
      showToast('Source must be saved before creating a reminder.', 'warning');
      return;
    }
    const dueDate = buildReminderDateTime(reminderDraft.date, reminderDraft.time);
    const schedule = {
      type: 'rrule',
      timezone: getAppTimeZone(),
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
        name: reminderTitle.trim().length > 0 ? reminderTitle.trim() : `Review source: ${source.title}`,
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
  }, [source?.id, source?.title, source?.code, reminderDraft.date, reminderDraft.time, reminderTitle, domainId, onQuestCreated, existingCodes]);

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

  const handleToggleVisibility = useCallback(async () => {
    if (!source?.id) return;
    const nextVisibility = source.visibility === 'domain' ? 'private' : 'domain';
    try {
      const updated = await updateSource(source.id, { visibility: nextVisibility });
      setSource(updated);
      setVisibilityDraft(updated.visibility || nextVisibility);
      onUpdateSource?.(updated);
      showToast(`Visibility set to ${updated.visibility === 'domain' ? 'Domain' : 'Private'}.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update visibility.', 'error');
    }
  }, [source?.id, source?.visibility, onUpdateSource]);

  const handleHeaderVisibilityToggle = useCallback(() => {
    if (isEditMode) {
      setVisibilityDraft(prev => (prev === 'domain' ? 'private' : 'domain'));
      setIsDirty(true);
      return;
    }
    void handleToggleVisibility();
  }, [handleToggleVisibility, isEditMode]);

  const headerVisibility = isEditMode ? visibilityDraft : (source?.visibility || 'private');

  const getLinkLabel = useCallback((link: RelationDraft): string => {
    if (!graphData) return link.toCode;
    if (link.toType === 'meta_definition') {
      return graphData.definitions?.[link.toCode]?.name || link.toCode;
    }
    if (link.toType === 'meta_exercise') {
      return graphData.exercises?.[link.toCode]?.name || link.toCode;
    }
    return link.toCode;
  }, [graphData]);

  return (
    <div className="h-full flex flex-col text-sm">
      <div className="p-4 pb-2 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              {isEditMode && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleCancelEdit}
                  title="Back"
                >
                  <ArrowLeft size={14} />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleHeaderVisibilityToggle}
                disabled={!source?.id}
                title={
                  isEditMode
                    ? (headerVisibility === 'domain' ? 'Set private' : 'Set domain')
                    : (headerVisibility === 'domain' ? 'Make private' : 'Make public')
                }
              >
                {headerVisibility === 'domain' ? <Unlock size={14} /> : <Lock size={14} />}
              </Button>
              <div className="text-base font-semibold text-gray-900 truncate">{source?.title?.trim() || 'Source'}</div>
              {onCopyYaml && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 flex-shrink-0"
                  onClick={onCopyYaml}
                  disabled={isCopyingYaml}
                  title="Copy node as YAML"
                >
                  {isCopyingYaml ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <Copy size={14} />
                  )}
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isLoading && <span className="text-xs text-gray-500">Loading…</span>}
            {!isEditMode && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowReminderForm(prev => !prev)}
                disabled={!source?.id}
              >
                {showReminderForm ? 'Close Reminder' : 'Remind Me'}
              </Button>
            )}
            <Button
              size="icon"
              variant={isEditMode ? 'outline' : 'ghost'}
              onClick={handleToggleEditMode}
              disabled={!source?.id}
              className="h-8 w-8"
              title={isEditMode ? 'View Mode' : 'Edit Mode'}
            >
              <Edit size={16} />
            </Button>
            {isEditMode && (
              <>
                <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={!canSave || isSaving}>
                  <Save className="h-4 w-4 mr-1" />
                  {isSaving ? 'Saving…' : 'Save'}
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-600">
          {isEditMode ? (
            isHeaderCodeEditing ? (
              <Input
                value={codeDraft}
                onChange={(e) => {
                  setCodeDraft(e.target.value);
                  setIsDirty(true);
                }}
                onBlur={() => setIsHeaderCodeEditing(false)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === 'Escape') {
                    event.preventDefault();
                    setIsHeaderCodeEditing(false);
                  }
                }}
                autoFocus
                className="h-6 w-36 bg-white px-2 text-[11px]"
              />
            ) : (
              <button
                type="button"
                onClick={() => setIsHeaderCodeEditing(true)}
                className="h-6 rounded border border-gray-300 bg-white px-2 text-[11px] text-gray-700 hover:bg-gray-50"
                title="Click to edit code"
              >
                {codeDraft.trim() || source?.code || sourceData.code || 'SRC?'}
              </button>
            )
          ) : (
            <span className="h-6 rounded border border-gray-300 bg-white px-2 text-[11px] text-gray-700">
              {source?.code || sourceData.code || 'SRC?'}
            </span>
          )}
          <span className="text-[11px] text-gray-500">{headerVisibility === 'domain' ? 'Domain' : 'Private'}</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4 pt-3 space-y-4">
        {isEditMode && (
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
        )}
        {isEditMode ? (
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
        ) : (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-gray-600">Content</label>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-2 text-sm">
              {(source?.contentMd || '').trim().length > 0 ? (
                <MarkdownKatex className="whitespace-pre-wrap">{source?.contentMd || ''}</MarkdownKatex>
              ) : (
                <span className="text-gray-400 italic">No content</span>
              )}
            </div>
          </div>
        )}
        {isEditMode && (
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
        )}

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
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-gray-600">Remind in:</span>
            {[
              { label: '15 min', minutes: 15 },
              { label: '1 hour', minutes: 60 },
              { label: '6 hours', minutes: 6 * 60 },
              { label: '1 day', minutes: 24 * 60 },
              { label: '1 week', minutes: 7 * 24 * 60 },
            ].map(option => (
              <Button
                key={option.label}
                size="sm"
                variant="outline"
                onClick={() => setReminderDraft(getReminderDraftFromOffsetMinutes(option.minutes))}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="text-xs text-gray-600">Due date</label>
              <Input
                type="date"
                value={reminderDraft.date}
                onChange={(e) => setReminderDraft(prev => ({ ...prev, date: e.target.value }))}
                className="h-8 mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">Due time</label>
              <Input
                type="time"
                value={reminderDraft.time}
                onChange={(e) => setReminderDraft(prev => ({ ...prev, time: e.target.value }))}
                className="h-8 mt-1"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleCreateReminder}>
              Create Todo Quest
            </Button>
          </div>
        </div>
      )}

      {isEditMode ? (
        <>
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-xs"
              onClick={() => setIsRelevantLinksExpanded(prev => !prev)}
            >
              {isRelevantLinksExpanded ? 'Hide relevant links' : 'Edit relevant links'}
            </Button>
          </div>

          {isRelevantLinksExpanded && (
            <div className="rounded-md border border-gray-200 p-3 space-y-2">
              <div className="text-xs font-semibold text-gray-700">Relevant Links</div>
              {relevantLinks.length === 0 && (
                <div className="text-xs text-gray-500">No relevant links yet.</div>
              )}
              {relevantLinks.map((link, idx) => (
                <div key={`${link.toCode}-${idx}`} className="flex items-center gap-2 text-xs">
                  <span className="kg-font-tag px-2 py-0.5 rounded bg-gray-100 text-gray-700">
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
          )}
        </>
      ) : (
        <div className="rounded-md border border-gray-200 p-3 space-y-2">
          <div className="text-xs font-semibold text-gray-700">Relevant Links</div>
          {relevantLinks.length === 0 && (
            <div className="text-xs text-gray-500">No relevant links yet.</div>
          )}
          {relevantLinks.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {relevantLinks.map((link, idx) => {
                const style =
                  link.toType === 'meta_definition'
                    ? 'bg-blue-50 hover:bg-blue-100 border-blue-200'
                    : 'bg-orange-50 hover:bg-orange-100 border-orange-200';
                return (
                  <Button
                    key={`${link.toCode}-${idx}`}
                    variant="outline"
                    size="sm"
                    className={`h-6 text-xs px-1.5 ${style}`}
                    onClick={() => onNavigateToNode?.(link.toCode)}
                  >
                    {getLinkLabel(link)}
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {isEditMode && (
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="destructive" onClick={handleDelete} disabled={isDeleting || !source?.id}>
            {isDeleting ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      )}
      </div>
    </div>
  );
};

export default SourceWindowContent;
