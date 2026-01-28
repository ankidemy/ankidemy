// client/src/app/components/Graph/windows/SourceWindowContent.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import MarkdownPreviewField from '../components/MarkdownPreviewField';
import { showToast } from '@/app/components/core/ToastNotification';
import { createQuest, createRelation, deleteSource, getSource, updateSource, SourceDTO, MetaQuestDTO } from '@/lib/api';
import { useUI } from '@/contexts/UIContext';

interface SourceWindowContentProps {
  windowId: string;
  sourceData: Partial<SourceDTO> & { name?: string };
  domainId: number;
  onUpdateSource?: (updated: SourceDTO) => void;
  onQuestCreated?: (quest: MetaQuestDTO, relation: { fromCode: string; toCode: string; relationType: string }) => void;
}

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
  onUpdateSource,
  onQuestCreated,
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
      const quest = await createQuest(domainId, {
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
  }, [source?.id, source?.title, source?.code, reminderDue, reminderTitle, domainId, onQuestCreated]);

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-semibold text-gray-900">Source</div>
          <div className="text-xs text-gray-500">{source?.code || 'Unsaved'}</div>
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
    </div>
  );
};

export default SourceWindowContent;
