// client/src/app/components/Graph/windows/QuestWindowContent.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import MarkdownPreviewField from '../components/MarkdownPreviewField';
import ImageUploadField from '../components/ImageUploadField';
import ZoomableImage from '../components/ZoomableImage';
import { MarkdownKatex } from '@/app/components/core/MarkdownKatex';
import { showToast } from '@/app/components/core/ToastNotification';
import { ArrowLeft, Clock, Edit, Loader2, Save, X, Lock, Unlock, SlidersHorizontal, CheckCircle2, Copy, RefreshCw } from 'lucide-react';
import VersionHeaderControls from '../components/VersionHeaderControls';
import {
  MetaQuestDTO,
  QuestVersionDTO,
  addQuestVersion,
  deleteQuest,
  deleteQuestVersion,
  getDomainRelations,
  getQuest,
  postSurveyEvent,
  uploadNodeImage,
  updateQuest,
  updateQuestRelevantLinks,
  updateQuestVersion,
} from '@/lib/api';
import { GraphData } from '../utils/types';
import { useUI } from '@/contexts/UIContext';
import { formatNextReview } from '@/lib/srs-api';
import {
  buildQuestSchedulePayload,
  coalesceTimezone,
  CustomRepeatPeriod,
  DurationMode,
  parseScheduleToDrafts,
  RepeatPreset,
  scheduleSummary,
  WeekdayCode,
  weekdayLabels,
} from './questScheduleDrafts';

interface QuestWindowContentProps {
  windowId: string;
  questData: Partial<MetaQuestDTO>;
  domainId: number;
  graphData?: GraphData;
  onUpdateQuest?: (updated: MetaQuestDTO) => void;
  onDeleteQuest?: (code: string) => void;
  onRelevantLinksUpdated?: () => void | Promise<void>;
  isFrenzyEditMode?: boolean;
  onNavigateToNode?: (nodeId: string) => void;
  onClose?: () => void;
  onHeaderMouseDown?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onCopyYaml?: () => void;
  isCopyingYaml?: boolean;
  isContentManaged?: boolean;
  liveContentRevision?: string;
}

type RelationDraft = { relationType: string; toType: 'definition' | 'exercise' | 'source' | 'meta_quest'; toCode: string };

type QuestKind = 'todo' | 'habit' | 'daily';
type QuestVisibility = 'private' | 'domain';
type QuestVersionDraft = { title: string; descriptionMd: string; imagePath: string };
const questKindOrder: QuestKind[] = ['todo', 'habit', 'daily'];
const formatQuestKindLabel = (value: QuestKind) => value.charAt(0).toUpperCase() + value.slice(1);

const isQuestKind = (value: string): value is QuestKind => value === 'todo' || value === 'habit' || value === 'daily';
const isQuestVisibility = (value: string): value is QuestVisibility => value === 'private' || value === 'domain';
const isRelationToType = (value: string): value is RelationDraft['toType'] =>
  value === 'definition' || value === 'exercise' || value === 'source' || value === 'meta_quest';

const pad2 = (value: number) => String(value).padStart(2, '0');
const toLocalDateInputValue = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  return `${yyyy}-${mm}-${dd}`;
};
const toLocalTimeInputValue = (date: Date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
const getDueDraftFromOffsetMinutes = (offsetMinutes: number) => {
  const date = new Date(Date.now() + offsetMinutes * 60 * 1000);
  return {
    date: toLocalDateInputValue(date),
    time: toLocalTimeInputValue(date),
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
  isFrenzyEditMode = false,
  onNavigateToNode,
  onClose,
  onHeaderMouseDown,
  onCopyYaml,
  isCopyingYaml = false,
  isContentManaged = false,
  liveContentRevision,
}) => {
  const ui = useUI();
  const [quest, setQuest] = useState<MetaQuestDTO | null>(null);
  const [versions, setVersions] = useState<QuestVersionDTO[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [codeDraft, setCodeDraft] = useState('');
  const [kindDraft, setKindDraft] = useState<'todo' | 'habit' | 'daily'>('todo');
  const [visibilityDraft, setVisibilityDraft] = useState<'private' | 'domain'>('private');
  const [activeDraft, setActiveDraft] = useState(true);
  const [timezoneDraft, setTimezoneDraft] = useState(coalesceTimezone());
  const [dueDateDraft, setDueDateDraft] = useState('');
  const [dueTimeDraft, setDueTimeDraft] = useState('');
  const [repeatEnabledDraft, setRepeatEnabledDraft] = useState(false);
  const [repeatPresetDraft, setRepeatPresetDraft] = useState<RepeatPreset>('daily');
  const [customRepeatEveryDraft, setCustomRepeatEveryDraft] = useState(1);
  const [customRepeatPeriodDraft, setCustomRepeatPeriodDraft] = useState<CustomRepeatPeriod>('days');
  const [customRepeatWeekdaysDraft, setCustomRepeatWeekdaysDraft] = useState<Set<WeekdayCode>>(new Set(['MO']));
  const [durationModeDraft, setDurationModeDraft] = useState<DurationMode>('forever');
  const [durationCountDraft, setDurationCountDraft] = useState(10);
  const [untilDateDraft, setUntilDateDraft] = useState('');
  const [versionDrafts, setVersionDrafts] = useState<Record<number, QuestVersionDraft>>({});
  const [relevantLinks, setRelevantLinks] = useState<RelationDraft[]>([]);
  const [newRelation, setNewRelation] = useState<RelationDraft>({
    relationType: 'relevant',
    toType: 'definition',
    toCode: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isVersionSaving, setIsVersionSaving] = useState(false);
  const [isVersionMutating, setIsVersionMutating] = useState(false);
  const [viewMode, setViewMode] = useState<'details' | 'advanced'>('details');
  const [isFrenzyCodeEditing, setIsFrenzyCodeEditing] = useState(false);
  const [isHeaderCodeEditing, setIsHeaderCodeEditing] = useState(false);
  const [isRelevantLinksExpanded, setIsRelevantLinksExpanded] = useState(false);

  const effectiveEditMode = isFrenzyEditMode || isEditMode;

  const activeVersionIndex = useMemo(() => {
    if (versions.length === 0) return 0;
    const idx = versions.findIndex(v => v.id === selectedVersionId);
    return idx >= 0 ? idx : 0;
  }, [versions, selectedVersionId]);

  const activeVersion = useMemo(() => {
    if (versions.length === 0) return null;
    return versions[activeVersionIndex] || versions[0] || null;
  }, [versions, activeVersionIndex]);

  const activeVersionLabel = useMemo(() => {
    if (!activeVersion) return 'No version';
    return activeVersion.title?.trim() || `Version ${activeVersionIndex + 1}`;
  }, [activeVersion, activeVersionIndex]);

  const activeVersionDraft = useMemo(() => {
    if (!activeVersion) return { title: '', descriptionMd: '', imagePath: '' };
    if (!activeVersion.id) {
      return {
        title: activeVersion.title || '',
        descriptionMd: activeVersion.descriptionMd || '',
        imagePath: activeVersion.imagePath || '',
      };
    }
    return versionDrafts[activeVersion.id] || {
      title: activeVersion.title || '',
      descriptionMd: activeVersion.descriptionMd || '',
      imagePath: activeVersion.imagePath || '',
    };
  }, [activeVersion, versionDrafts]);

  const hasActiveVersionChanges = useMemo(() => {
    if (!activeVersion || !activeVersion.id) return false;
    return (
      (activeVersionDraft.title || '') !== (activeVersion.title || '')
      || (activeVersionDraft.descriptionMd || '') !== (activeVersion.descriptionMd || '')
      || (activeVersionDraft.imagePath || '') !== (activeVersion.imagePath || '')
    );
  }, [activeVersion, activeVersionDraft]);

  const hasMetaChanges = useMemo(() => {
    if (!quest) return false;

    const baseScheduleDrafts = parseScheduleToDrafts(quest.schedule);
    const baseKind = isQuestKind(quest.kind) ? quest.kind : 'todo';
    const baseVisibility = quest.visibility && isQuestVisibility(quest.visibility) ? quest.visibility : 'private';
    const currentRepeatEnabled = kindDraft === 'habit' ? true : repeatEnabledDraft;
    const baseRepeatEnabled = baseKind === 'habit' ? true : baseScheduleDrafts.repeatEnabled;
    const currentWeekdays = Array.from(customRepeatWeekdaysDraft).sort().join(',');
    const baseWeekdays = Array.from(baseScheduleDrafts.customWeekdays).sort().join(',');

    return (
      nameDraft.trim() !== (quest.name || quest.versions?.[0]?.title || '').trim()
      || codeDraft.trim() !== (quest.code || '').trim()
      || kindDraft !== baseKind
      || visibilityDraft !== baseVisibility
      || activeDraft !== (quest.active ?? true)
      || dueDateDraft !== baseScheduleDrafts.date
      || dueTimeDraft !== baseScheduleDrafts.time
      || currentRepeatEnabled !== baseRepeatEnabled
      || repeatPresetDraft !== baseScheduleDrafts.preset
      || customRepeatEveryDraft !== baseScheduleDrafts.customEvery
      || customRepeatPeriodDraft !== baseScheduleDrafts.customPeriod
      || currentWeekdays !== baseWeekdays
      || durationModeDraft !== baseScheduleDrafts.durationMode
      || durationCountDraft !== baseScheduleDrafts.durationCount
      || untilDateDraft !== baseScheduleDrafts.untilDate
    );
  }, [
    activeDraft,
    codeDraft,
    customRepeatEveryDraft,
    customRepeatPeriodDraft,
    customRepeatWeekdaysDraft,
    dueDateDraft,
    dueTimeDraft,
    durationCountDraft,
    durationModeDraft,
    kindDraft,
    nameDraft,
    quest,
    repeatEnabledDraft,
    repeatPresetDraft,
    untilDateDraft,
    visibilityDraft,
  ]);

  const hasPendingEditChanges = isEditMode && (hasMetaChanges || hasActiveVersionChanges);

  const kindLabel = useMemo(() => {
    const value = quest?.kind || questData?.kind || 'todo';
    return isQuestKind(value) ? formatQuestKindLabel(value) : formatQuestKindLabel('todo');
  }, [quest?.kind, questData?.kind]);

  const dueLabel = useMemo(() => {
    if (!quest?.nextDueAt) return null;
    return formatNextReview(quest.nextDueAt);
  }, [quest?.nextDueAt]);
  const dueTag = useMemo(() => {
    if (!dueLabel) return null;
    if (dueLabel === 'Due now' || dueLabel === 'Due today') {
      return { label: 'Due', className: 'kg-due-tag-now' };
    }
    if (dueLabel === 'Due tomorrow') {
      return { label: 'Due tomorrow', className: 'kg-due-tag-tomorrow' };
    }
    return { label: dueLabel, className: 'bg-gray-100 text-gray-600' };
  }, [dueLabel]);

  const headerVisibility = useMemo<QuestVisibility>(() => {
    if (isEditMode) return visibilityDraft;
    if (quest?.visibility && isQuestVisibility(quest.visibility)) return quest.visibility;
    if (questData?.visibility && isQuestVisibility(questData.visibility)) return questData.visibility;
    return 'private';
  }, [isEditMode, visibilityDraft, quest?.visibility, questData?.visibility]);

  const showHeaderDraftMeta = !isFrenzyEditMode && isEditMode && viewMode === 'details';

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
      const drafts = parseScheduleToDrafts(fresh.schedule);
      setTimezoneDraft(coalesceTimezone());
      setDueDateDraft(drafts.date);
      setDueTimeDraft(drafts.time);
      setRepeatEnabledDraft(drafts.repeatEnabled);
      setRepeatPresetDraft(drafts.preset);
      setCustomRepeatEveryDraft(drafts.customEvery);
      setCustomRepeatPeriodDraft(drafts.customPeriod);
      setCustomRepeatWeekdaysDraft(drafts.customWeekdays);
      setDurationModeDraft(drafts.durationMode);
      setDurationCountDraft(drafts.durationCount);
      setUntilDateDraft(drafts.untilDate);
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
      const drafts = parseScheduleToDrafts(fallback.schedule);
      setTimezoneDraft(coalesceTimezone());
      setDueDateDraft(drafts.date);
      setDueTimeDraft(drafts.time);
      setRepeatEnabledDraft(drafts.repeatEnabled);
      setRepeatPresetDraft(drafts.preset);
      setCustomRepeatEveryDraft(drafts.customEvery);
      setCustomRepeatPeriodDraft(drafts.customPeriod);
      setCustomRepeatWeekdaysDraft(drafts.customWeekdays);
      setDurationModeDraft(drafts.durationMode);
      setDurationCountDraft(drafts.durationCount);
      setUntilDateDraft(drafts.untilDate);
    }
  }, [questData, questData?.id, questData?.code, loadQuest, liveContentRevision]);

  useEffect(() => {
    const drafts: Record<number, QuestVersionDraft> = {};
    versions.forEach(v => {
      if (!v.id) return;
      drafts[v.id] = {
        title: v.title || '',
        descriptionMd: v.descriptionMd || '',
        imagePath: v.imagePath || '',
      };
    });
    setVersionDrafts(drafts);
  }, [versions]);

  useEffect(() => {
    if (versions.length === 0) {
      if (selectedVersionId !== null) setSelectedVersionId(null);
      return;
    }
    if (!selectedVersionId || !versions.some(v => v.id === selectedVersionId)) {
      setSelectedVersionId(versions[0].id ?? null);
    }
  }, [versions, selectedVersionId]);

  useEffect(() => {
    if (!effectiveEditMode) {
      setViewMode('details');
    }
  }, [effectiveEditMode, quest?.id]);

  const currentWindowTitle = useMemo(() => {
    return ui.state.windows.find(w => w.id === windowId)?.title;
  }, [ui.state.windows, windowId]);

  const nextWindowTitle = useMemo(() => {
    const questPrimaryTitle = quest?.versions?.[0]?.title?.trim();
    const questDataPrimaryTitle = questData?.versions?.[0]?.title?.trim();

    return (
      quest?.name?.trim()
      || questPrimaryTitle
      || questData?.name?.trim()
      || questDataPrimaryTitle
      || quest?.code
      || questData?.code
      || 'Quest'
    );
  }, [
    quest?.name,
    quest?.code,
    quest?.versions,
    questData?.name,
    questData?.code,
    questData?.versions,
  ]);

  useEffect(() => {
    if (isFrenzyEditMode) return;
    if (!nextWindowTitle || nextWindowTitle === currentWindowTitle) return;
    ui.updateWindow(windowId, { title: nextWindowTitle });
  }, [nextWindowTitle, currentWindowTitle, isFrenzyEditMode, ui, windowId]);

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

  const handlePrevVersion = useCallback(() => {
    if (versions.length <= 1) return;
    const nextIndex = Math.max(0, activeVersionIndex - 1);
    setSelectedVersionId(versions[nextIndex]?.id ?? null);
  }, [versions, activeVersionIndex]);

  const handleCompleteQuest = useCallback(async () => {
    if (!quest?.id) return;
    setIsCompleting(true);
    try {
      await postSurveyEvent({
        metaQuestId: quest.id,
        eventType: 'completed',
        questVersionId: selectedVersionId ?? activeVersion?.id,
      });
      const fresh = await getQuest(quest.id);
      setQuest(fresh);
      setVersions(fresh.versions || []);
      if (fresh.versions?.length) {
        const keep = selectedVersionId && fresh.versions.some(v => v.id === selectedVersionId)
          ? selectedVersionId
          : fresh.versions[0].id ?? null;
        setSelectedVersionId(keep);
      }
      onUpdateQuest?.(fresh);
      showToast('Quest marked complete.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to mark quest complete.', 'error');
    } finally {
      setIsCompleting(false);
    }
  }, [quest?.id, selectedVersionId, activeVersion?.id, onUpdateQuest]);

  const handleToggleVisibility = useCallback(async () => {
    if (!quest?.id) return;
    const nextVisibility = quest.visibility === 'domain' ? 'private' : 'domain';
    try {
      const updated = await updateQuest(quest.id, { visibility: nextVisibility });
      setQuest(updated);
      setVisibilityDraft(updated.visibility || nextVisibility);
      onUpdateQuest?.(updated);
      showToast(`Visibility set to ${updated.visibility === 'domain' ? 'Domain' : 'Private'}.`, 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update visibility.', 'error');
    }
  }, [quest?.id, quest?.visibility, onUpdateQuest]);

  const handleCycleKindDraft = useCallback(() => {
    setKindDraft(prev => {
      const idx = questKindOrder.indexOf(prev);
      const nextIdx = idx >= 0 ? (idx + 1) % questKindOrder.length : 0;
      return questKindOrder[nextIdx];
    });
  }, []);

  const getLinkLabel = useCallback((link: RelationDraft): string => {
    if (!graphData) return link.toCode;
    if (link.toType === 'definition') {
      return graphData.definitions?.[link.toCode]?.name || link.toCode;
    }
    if (link.toType === 'exercise') {
      return graphData.exercises?.[link.toCode]?.name || link.toCode;
    }
    if (link.toType === 'source') {
      return graphData.sources?.[link.toCode]?.title || link.toCode;
    }
    if (link.toType === 'meta_quest') {
      return graphData.quests?.[link.toCode]?.name || graphData.quests?.[link.toCode]?.versions?.[0]?.title || link.toCode;
    }
    return link.toCode;
  }, [graphData]);

  const handleNextVersion = useCallback(() => {
    if (versions.length <= 1) return;
    const nextIndex = Math.min(versions.length - 1, activeVersionIndex + 1);
    setSelectedVersionId(versions[nextIndex]?.id ?? null);
  }, [versions, activeVersionIndex]);

  const buildSchedulePayload = useCallback((existingSchedule: unknown) => {
    return buildQuestSchedulePayload({
      existingSchedule,
      kind: kindDraft,
      timezone: timezoneDraft,
      dueDate: dueDateDraft,
      dueTime: dueTimeDraft,
      repeatEnabled: repeatEnabledDraft,
      preset: repeatPresetDraft,
      customEvery: customRepeatEveryDraft,
      customPeriod: customRepeatPeriodDraft,
      customWeekdays: customRepeatWeekdaysDraft,
      durationMode: durationModeDraft,
      durationCount: durationCountDraft,
      untilDate: untilDateDraft,
    });
  }, [
    customRepeatEveryDraft,
    customRepeatPeriodDraft,
    customRepeatWeekdaysDraft,
    dueDateDraft,
    dueTimeDraft,
    durationCountDraft,
    durationModeDraft,
    kindDraft,
    repeatEnabledDraft,
    repeatPresetDraft,
    timezoneDraft,
    untilDateDraft,
  ]);

  const handleSaveQuest = useCallback(async () => {
    if (!quest?.id) return;
    const shouldSaveMeta = hasMetaChanges;
    const shouldSaveVersion = !!activeVersion?.id && hasActiveVersionChanges;

    if (!shouldSaveMeta && !shouldSaveVersion) return;

    if (shouldSaveMeta && nameDraft.trim().length === 0) {
      showToast('Quest name is required.', 'warning');
      return;
    }
    if (shouldSaveVersion && activeVersionDraft.title.trim().length === 0) {
      showToast('Version title is required.', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      let mergedQuest: MetaQuestDTO = quest;
      let mergedVersions: QuestVersionDTO[] = versions;

      if (shouldSaveMeta) {
        const parsedSchedule = buildSchedulePayload(quest.schedule);
        const payload: Partial<MetaQuestDTO> & { active?: boolean } = {
          name: nameDraft.trim(),
          code: codeDraft.trim(),
          kind: kindDraft,
          schedule: parsedSchedule,
          visibility: visibilityDraft,
          active: activeDraft,
        };
        const updatedQuest = await updateQuest(quest.id, payload);
        mergedQuest = { ...mergedQuest, ...updatedQuest };
        if (Array.isArray(updatedQuest.versions)) {
          mergedVersions = updatedQuest.versions;
        }
      }

      if (shouldSaveVersion && activeVersion?.id) {
        const updatedVersion = await updateQuestVersion(quest.id, activeVersion.id, {
          title: activeVersionDraft.title.trim(),
          descriptionMd: activeVersionDraft.descriptionMd || '',
          imagePath: activeVersionDraft.imagePath || '',
        });
        const baseVersions = mergedVersions.length > 0 ? mergedVersions : (mergedQuest.versions || []);
        mergedVersions = baseVersions.map(v => (v.id === activeVersion.id ? { ...v, ...updatedVersion } : v));
      }

      const finalQuest: MetaQuestDTO = {
        ...mergedQuest,
        versions: mergedVersions,
      };

      setQuest(finalQuest);
      setVersions(mergedVersions);
      if (mergedVersions.length > 0) {
        setSelectedVersionId(prev => (
          prev && mergedVersions.some(v => v.id === prev)
            ? prev
            : mergedVersions[0].id ?? null
        ));
      } else {
        setSelectedVersionId(null);
      }

      const scheduleDrafts = parseScheduleToDrafts(finalQuest.schedule);
      setNameDraft(finalQuest.name || finalQuest.versions?.[0]?.title || '');
      setCodeDraft(finalQuest.code || '');
      setKindDraft(isQuestKind(finalQuest.kind) ? finalQuest.kind : 'todo');
      setVisibilityDraft(finalQuest.visibility && isQuestVisibility(finalQuest.visibility) ? finalQuest.visibility : 'private');
      setActiveDraft(finalQuest.active ?? true);
      setTimezoneDraft(coalesceTimezone());
      setDueDateDraft(scheduleDrafts.date);
      setDueTimeDraft(scheduleDrafts.time);
      setRepeatEnabledDraft(scheduleDrafts.repeatEnabled);
      setRepeatPresetDraft(scheduleDrafts.preset);
      setCustomRepeatEveryDraft(scheduleDrafts.customEvery);
      setCustomRepeatPeriodDraft(scheduleDrafts.customPeriod);
      setCustomRepeatWeekdaysDraft(scheduleDrafts.customWeekdays);
      setDurationModeDraft(scheduleDrafts.durationMode);
      setDurationCountDraft(scheduleDrafts.durationCount);
      setUntilDateDraft(scheduleDrafts.untilDate);

      onUpdateQuest?.(finalQuest);
      showToast(
        shouldSaveMeta && shouldSaveVersion
          ? 'Quest and version updated.'
          : shouldSaveMeta
          ? 'Quest updated.'
          : 'Version updated.',
        'success'
      );
      if (!isFrenzyEditMode) setIsEditMode(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('409') || message.includes('conflict')) {
        showToast('Quest code already exists in this domain.', 'error');
      } else {
        showToast(message || 'Failed to update quest.', 'error');
      }
    } finally {
      setIsSaving(false);
    }
  }, [
    nameDraft,
    buildSchedulePayload,
    codeDraft,
    kindDraft,
    visibilityDraft,
    activeDraft,
    activeVersion?.id,
    activeVersionDraft.descriptionMd,
    activeVersionDraft.imagePath,
    activeVersionDraft.title,
    hasActiveVersionChanges,
    hasMetaChanges,
    onUpdateQuest,
    quest,
    isFrenzyEditMode,
    versions,
  ]);

  const getVersionDraftBase = useCallback((versionId: number): QuestVersionDraft => {
    const base = versions.find(v => v.id === versionId);
    return {
      title: base?.title || '',
      descriptionMd: base?.descriptionMd || '',
      imagePath: base?.imagePath || '',
    };
  }, [versions]);

  const patchVersionDraft = useCallback((versionId: number, patch: Partial<QuestVersionDraft>) => {
    setVersionDrafts(prev => {
      const current = prev[versionId] || getVersionDraftBase(versionId);
      return {
        ...prev,
        [versionId]: {
          ...current,
          ...patch,
        },
      };
    });
  }, [getVersionDraftBase]);

  const uploadQuestVersionImage = useCallback(async (file: File): Promise<string> => {
    const { imagePath } = await uploadNodeImage({
      file,
      domainId,
      nodeType: 'quest',
      field: 'description',
    });
    return imagePath;
  }, [domainId]);

  const handleVersionDescriptionPaste = useCallback((event: React.ClipboardEvent<HTMLTextAreaElement>, versionId: number) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    const imageItem = Array.from(items).find(item => item.type.startsWith('image/'));
    if (!imageItem) return;
    const file = imageItem.getAsFile();
    if (!file) return;
    event.preventDefault();
    void uploadQuestVersionImage(file)
      .then((imagePath) => {
        patchVersionDraft(versionId, { imagePath });
        showToast('Image attached.', 'success', 1200);
      })
      .catch((err) => {
        showToast(err instanceof Error ? err.message : 'Failed to upload image.', 'error');
      });
  }, [patchVersionDraft, uploadQuestVersionImage]);

  const handleVersionDescriptionDrop = useCallback((event: React.DragEvent<HTMLTextAreaElement>, versionId: number) => {
    const file = event.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    event.preventDefault();
    void uploadQuestVersionImage(file)
      .then((imagePath) => {
        patchVersionDraft(versionId, { imagePath });
        showToast('Image attached.', 'success', 1200);
      })
      .catch((err) => {
        showToast(err instanceof Error ? err.message : 'Failed to upload image.', 'error');
      });
  }, [patchVersionDraft, uploadQuestVersionImage]);

  const handleSaveVersion = useCallback(async (
    versionId: number,
    options?: { silent?: boolean }
  ): Promise<boolean> => {
    if (!quest?.id) return false;
    if (isVersionSaving) return false;
    const draft = versionDrafts[versionId];
    if (!draft || draft.title.trim().length === 0) {
      if (!options?.silent) {
        showToast('Version title is required.', 'warning');
      }
      return false;
    }
    setIsVersionSaving(true);
    try {
      const updated = await updateQuestVersion(quest.id, versionId, {
        title: draft.title.trim(),
        descriptionMd: draft.descriptionMd || '',
        imagePath: draft.imagePath || '',
      });
      setVersions(prev => prev.map(v => (v.id === versionId ? { ...v, ...updated } : v)));
      if (!options?.silent) {
        showToast('Version updated.', 'success');
      }
      return true;
    } catch (err) {
      if (!options?.silent) {
        showToast(err instanceof Error ? err.message : 'Failed to update version.', 'error');
      }
      return false;
    } finally {
      setIsVersionSaving(false);
    }
  }, [isVersionSaving, quest?.id, versionDrafts]);

  const selectVersionWithAutoSave = useCallback(async (nextIndex: number) => {
    if (versions.length <= 1) return;
    if (nextIndex < 0 || nextIndex >= versions.length) return;
    if (nextIndex === activeVersionIndex) return;
    if (isFrenzyEditMode && activeVersion?.id && hasActiveVersionChanges) {
      const saved = await handleSaveVersion(activeVersion.id, { silent: true });
      if (!saved) return;
    }
    setSelectedVersionId(versions[nextIndex]?.id ?? null);
  }, [
    versions,
    activeVersionIndex,
    isFrenzyEditMode,
    activeVersion?.id,
    hasActiveVersionChanges,
    handleSaveVersion,
  ]);

  const handleFrenzyPrevVersion = useCallback(() => {
    void selectVersionWithAutoSave(Math.max(0, activeVersionIndex - 1));
  }, [activeVersionIndex, selectVersionWithAutoSave]);

  const handleFrenzyNextVersion = useCallback(() => {
    void selectVersionWithAutoSave(Math.min(versions.length - 1, activeVersionIndex + 1));
  }, [versions.length, activeVersionIndex, selectVersionWithAutoSave]);

  const handleAddVersion = useCallback(async () => {
    if (!quest?.id) return;
    if (isVersionMutating) return;
    if (isFrenzyEditMode && activeVersion?.id && hasActiveVersionChanges) {
      const saved = await handleSaveVersion(activeVersion.id, { silent: true });
      if (!saved) return;
    }
    const baseTitle = activeVersion?.title?.trim();
    const nextLabel = `Version ${versions.length + 1}`;
    try {
      setIsVersionMutating(true);
      const created = await addQuestVersion(quest.id, {
        title: baseTitle ? `${baseTitle} (Copy)` : nextLabel,
        descriptionMd: activeVersion?.descriptionMd || '',
        imagePath: activeVersion?.imagePath || '',
      });
      setVersions(prev => [...prev, created]);
      setSelectedVersionId(created.id || null);
      showToast('Version added.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add version.', 'error');
    } finally {
      setIsVersionMutating(false);
    }
  }, [
    activeVersion?.descriptionMd,
    activeVersion?.id,
    activeVersion?.imagePath,
    activeVersion?.title,
    hasActiveVersionChanges,
    isFrenzyEditMode,
    isVersionMutating,
    quest?.id,
    versions.length,
    handleSaveVersion,
  ]);

  const handleDeleteVersion = useCallback(async (versionId: number) => {
    if (!quest?.id) return;
    if (versions.length <= 1) {
      showToast('A quest must have at least one version.', 'warning');
      return;
    }
    if (isVersionMutating) return;
    if (isFrenzyEditMode && activeVersion?.id && hasActiveVersionChanges) {
      const saved = await handleSaveVersion(activeVersion.id, { silent: true });
      if (!saved) return;
    }
    if (!confirm('Delete this version?')) return;
    try {
      setIsVersionMutating(true);
      await deleteQuestVersion(quest.id, versionId);
      const remaining = versions.filter(v => v.id !== versionId);
      setVersions(remaining);
      if (selectedVersionId === versionId) {
        setSelectedVersionId(remaining[0]?.id ?? null);
      }
      setVersionDrafts(prev => {
        const next = { ...prev };
        delete next[versionId];
        return next;
      });
      showToast('Version deleted.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete version.', 'error');
    } finally {
      setIsVersionMutating(false);
    }
  }, [
    isVersionMutating,
    isFrenzyEditMode,
    activeVersion?.id,
    hasActiveVersionChanges,
    handleSaveVersion,
    quest?.id,
    selectedVersionId,
    versions,
  ]);

  const handleDeleteActiveVersion = useCallback(() => {
    if (!selectedVersionId) return;
    void handleDeleteVersion(selectedVersionId);
  }, [handleDeleteVersion, selectedVersionId]);

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
  }, [quest?.id, quest?.code, onDeleteQuest, ui, windowId]);

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

  const handleCancelEdit = useCallback(() => {
    const base = quest ?? (questData as MetaQuestDTO);
    setNameDraft(base.name || base.versions?.[0]?.title || '');
    setCodeDraft(base.code || '');
    setKindDraft(isQuestKind(base.kind) ? base.kind : 'todo');
    setVisibilityDraft(base.visibility && isQuestVisibility(base.visibility) ? base.visibility : 'private');
    setActiveDraft(base.active ?? true);
    const drafts = parseScheduleToDrafts(base.schedule);
    setTimezoneDraft(coalesceTimezone());
    setDueDateDraft(drafts.date);
    setDueTimeDraft(drafts.time);
    setRepeatEnabledDraft(drafts.repeatEnabled);
    setRepeatPresetDraft(drafts.preset);
    setCustomRepeatEveryDraft(drafts.customEvery);
    setCustomRepeatPeriodDraft(drafts.customPeriod);
    setCustomRepeatWeekdaysDraft(drafts.customWeekdays);
    setDurationModeDraft(drafts.durationMode);
    setDurationCountDraft(drafts.durationCount);
    setUntilDateDraft(drafts.untilDate);
    setIsHeaderCodeEditing(false);
    setIsRelevantLinksExpanded(false);
    setIsEditMode(false);
  }, [quest, questData]);

  const handleToggleEditMode = useCallback(() => {
    if (isFrenzyEditMode) return;
    if (isEditMode) {
      handleCancelEdit();
      setViewMode('details');
      return;
    }
    if (isContentManaged) {
      showToast('This node is managed by Org. Edit its file in Emacs.', 'warning');
      return;
    }
    if (!quest?.id) return;
    setViewMode('details');
    setIsHeaderCodeEditing(false);
    setIsRelevantLinksExpanded(false);
    setIsEditMode(true);
  }, [handleCancelEdit, isContentManaged, isEditMode, isFrenzyEditMode, quest?.id]);

  const handleToggleViewMode = useCallback(() => {
    if (isFrenzyEditMode) return;
    if (isEditMode) {
      handleCancelEdit();
    }
    setViewMode(prev => (prev === 'advanced' ? 'details' : 'advanced'));
  }, [handleCancelEdit, isEditMode, isFrenzyEditMode]);

  const handleBack = useCallback(() => {
    if (isFrenzyEditMode) return;
    if (isEditMode) {
      handleCancelEdit();
      setViewMode('details');
      return;
    }
    if (viewMode !== 'details') {
      setViewMode('details');
    }
  }, [handleCancelEdit, isEditMode, isFrenzyEditMode, viewMode]);

  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const lastAutoSavedRef = React.useRef<string>('');

  useEffect(() => {
    if (!isFrenzyEditMode) return;
    lastAutoSavedRef.current = '';
    setAutoSaveStatus('idle');
    setIsFrenzyCodeEditing(false);
  }, [isFrenzyEditMode, quest?.id]);

  useEffect(() => {
    if (isEditMode) return;
    setIsHeaderCodeEditing(false);
  }, [isEditMode, quest?.id]);

  useEffect(() => {
    if (!isFrenzyEditMode) return;
    if (!quest?.id) return;
    if (isLoading) return;
    if (nameDraft.trim().length === 0) return;

    let payload: Partial<MetaQuestDTO> & { active?: boolean };
    try {
      payload = {
        name: nameDraft.trim(),
        code: codeDraft.trim(),
        kind: kindDraft,
        schedule: buildSchedulePayload(quest.schedule),
        visibility: visibilityDraft,
        active: activeDraft,
      };
    } catch {
      return;
    }

    const key = JSON.stringify(payload);
    if (!lastAutoSavedRef.current) {
      lastAutoSavedRef.current = key;
      return;
    }
    if (key === lastAutoSavedRef.current) return;

    setAutoSaveStatus('saving');
    const timer = setTimeout(async () => {
      try {
        const updated = await updateQuest(quest.id!, payload);
        setQuest(updated);
        onUpdateQuest?.(updated);
        lastAutoSavedRef.current = key;
        setAutoSaveStatus('saved');
        setTimeout(() => setAutoSaveStatus(prev => (prev === 'saved' ? 'idle' : prev)), 900);
      } catch (err) {
        console.error('Quest auto-save failed:', err);
        setAutoSaveStatus('error');
      }
    }, 650);

    return () => clearTimeout(timer);
  }, [
    activeDraft,
    buildSchedulePayload,
    codeDraft,
    isFrenzyEditMode,
    isLoading,
    kindDraft,
    nameDraft,
    onUpdateQuest,
    quest?.id,
    quest?.schedule,
    visibilityDraft,
  ]);

  useEffect(() => {
    if (!isFrenzyEditMode) return;
    if (!activeVersion?.id) return;
    if (!hasActiveVersionChanges) return;

    const timer = setTimeout(() => {
      void handleSaveVersion(activeVersion.id || 0, { silent: true });
    }, 650);

    return () => clearTimeout(timer);
  }, [
    isFrenzyEditMode,
    activeVersion?.id,
    activeVersionDraft.title,
    activeVersionDraft.descriptionMd,
    activeVersionDraft.imagePath,
    hasActiveVersionChanges,
    handleSaveVersion,
  ]);

  const renderScheduleEditor = (variant: 'standard' | 'frenzy') => {
    const timeInputId = `${windowId}-quest-time`;
    if (kindDraft === 'daily') {
      return null;
    }
    return (
      <div className={variant === 'frenzy' ? "space-y-2" : "space-y-3"}>
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
              type="button"
              size="sm"
              variant="outline"
              className={variant === 'frenzy' ? "h-7 px-2 text-[11px]" : "h-7 px-2 text-xs"}
              onClick={() => {
                const draft = getDueDraftFromOffsetMinutes(option.minutes);
                setDueDateDraft(draft.date);
                setDueTimeDraft(draft.time);
              }}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-gray-600">Set date</label>
            <Input
              type="date"
              value={dueDateDraft}
              onChange={(e) => setDueDateDraft(e.target.value)}
              className="h-8 mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Set time</label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                id={timeInputId}
                type="time"
                value={dueTimeDraft}
                onChange={(e) => setDueTimeDraft(e.target.value)}
                className="h-8 flex-1"
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={() => {
                  type PickerInput = HTMLInputElement & { showPicker?: () => void };
                  const el = document.getElementById(timeInputId) as PickerInput | null;
                  el?.showPicker?.();
                  el?.focus();
                }}
                title="Pick time"
              >
                <Clock className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-gray-600">Repeat</label>
              <input
                type="checkbox"
                checked={kindDraft === 'habit' ? true : repeatEnabledDraft}
                onChange={(e) => {
                  if (kindDraft === 'habit') return;
                  const next = e.target.checked;
                  setRepeatEnabledDraft(next);
                  if (next && !repeatPresetDraft) setRepeatPresetDraft('daily');
                }}
                disabled={kindDraft === 'habit'}
                className="h-4 w-4"
              />
              {kindDraft === 'habit' && <span className="text-xs text-gray-500">Habits always repeat</span>}
            </div>

            {(kindDraft === 'habit' || repeatEnabledDraft) && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {([
                    { id: 'daily', label: 'Daily' },
                    { id: 'weekdays', label: 'Weekdays' },
                    { id: 'weekly', label: 'Weekly' },
                    { id: 'monthly', label: 'Monthly' },
                    { id: 'yearly', label: 'Yearly' },
                    { id: 'custom', label: 'Custom' },
                  ] as Array<{ id: RepeatPreset; label: string }>).map(opt => (
                    <Button
                      key={opt.id}
                      type="button"
                      size="sm"
                      variant={repeatPresetDraft === opt.id ? "default" : "outline"}
                      className="h-7 px-2 text-xs"
                      onClick={() => setRepeatPresetDraft(opt.id)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>

                {repeatPresetDraft === 'custom' && (
                  <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-700">Repeat every</span>
                      <Input
                        type="number"
                        min={1}
                        value={customRepeatEveryDraft}
                        onChange={(e) => setCustomRepeatEveryDraft(Math.max(1, Number.parseInt(e.target.value || '1', 10) || 1))}
                        className="h-7 w-20 text-xs"
                      />
                      <select
                        value={customRepeatPeriodDraft}
                        onChange={(e) => setCustomRepeatPeriodDraft(e.target.value as CustomRepeatPeriod)}
                        className="h-7 rounded border border-gray-200 bg-white px-2 text-xs text-gray-700"
                      >
                        <option value="days">days</option>
                        <option value="weeks">weeks</option>
                        <option value="months">months</option>
                        <option value="years">years</option>
                      </select>
                    </div>

                    {customRepeatPeriodDraft === 'weeks' && (
                      <div className="space-y-1">
                        <div className="text-xs text-gray-600">Days</div>
                        <div className="flex flex-wrap gap-1">
                          {weekdayLabels.map(d => {
                            const selected = customRepeatWeekdaysDraft.has(d.code);
                            return (
                              <Button
                                key={d.code}
                                type="button"
                                size="sm"
                                variant={selected ? "default" : "outline"}
                                className="h-6 px-2 text-[11px]"
                                onClick={() => {
                                  setCustomRepeatWeekdaysDraft(prev => {
                                    const next = new Set(prev);
                                    if (next.has(d.code)) next.delete(d.code);
                                    else next.add(d.code);
                                    return next;
                                  });
                                }}
                              >
                                {d.label}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-1">
                  <div className="text-xs text-gray-600">Duration</div>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { id: 'forever', label: 'Forever' },
                      { id: 'count', label: 'n times' },
                      { id: 'until', label: 'Until' },
                    ] as Array<{ id: DurationMode; label: string }>).map(opt => (
                      <Button
                        key={opt.id}
                        type="button"
                        size="sm"
                        variant={durationModeDraft === opt.id ? "default" : "outline"}
                        className="h-6 px-2 text-[11px]"
                        onClick={() => setDurationModeDraft(opt.id)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                  {durationModeDraft === 'count' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-700">Repeat</span>
                      <Input
                        type="number"
                        min={1}
                        value={durationCountDraft}
                        onChange={(e) => setDurationCountDraft(Math.max(1, Number.parseInt(e.target.value || '1', 10) || 1))}
                        className="h-7 w-24 text-xs"
                      />
                      <span className="text-xs text-gray-700">times</span>
                    </div>
                  )}
                  {durationModeDraft === 'until' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-700">Until</span>
                      <Input
                        type="date"
                        value={untilDateDraft}
                        onChange={(e) => setUntilDateDraft(e.target.value)}
                        className="h-7 text-xs"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

      </div>
    );
  };

  const renderVersionEditor = (variant: 'standard' | 'frenzy') => {
    const cardClassName = variant === 'frenzy'
      ? 'rounded-md border border-amber-200 bg-white/60 p-3 space-y-2'
      : 'rounded-md border border-gray-200 p-3 space-y-2';
    const headingClassName = variant === 'frenzy'
      ? 'text-xs font-semibold text-amber-800'
      : 'text-xs font-semibold text-gray-700';

    return (
      <div className={cardClassName}>
        <div className="flex items-center justify-between">
          <div className={headingClassName}>Current Version</div>
          <div className={variant === 'frenzy' ? 'text-xs text-amber-700' : 'text-xs text-gray-500'}>
            {activeVersionLabel}
          </div>
        </div>
        {activeVersion ? (
          <>
            <Input
              value={activeVersionDraft.title}
              onChange={(e) => {
                if (!activeVersion.id) return;
                patchVersionDraft(activeVersion.id, { title: e.target.value });
              }}
              className="h-8"
              placeholder="Version title"
              disabled={!activeVersion.id}
            />
            <MarkdownPreviewField
              label="Description (Markdown)"
              value={activeVersionDraft.descriptionMd}
              onChange={(value) => {
                if (!activeVersion.id) return;
                patchVersionDraft(activeVersion.id, { descriptionMd: value });
              }}
              onPaste={(event) => {
                if (!activeVersion.id) return;
                handleVersionDescriptionPaste(event, activeVersion.id);
              }}
              onDrop={(event) => {
                if (!activeVersion.id) return;
                handleVersionDescriptionDrop(event, activeVersion.id);
              }}
              onDragOver={(event) => event.preventDefault()}
              rows={variant === 'frenzy' ? 3 : 4}
            />
            <ImageUploadField
              compact
              label="Description Image"
              helperText="Paste, drop, or upload an image. This updates imagePath only."
              imagePath={activeVersionDraft.imagePath}
              onUpload={uploadQuestVersionImage}
              onChange={(path) => {
                if (!activeVersion.id) return;
                patchVersionDraft(activeVersion.id, { imagePath: path });
              }}
              onClear={() => {
                if (!activeVersion.id) return;
                patchVersionDraft(activeVersion.id, { imagePath: '' });
              }}
              disabled={!activeVersion.id}
            />
          </>
        ) : (
          <div className="text-xs text-gray-500">No versions yet.</div>
        )}
      </div>
    );
  };

  return (
    <div className={isFrenzyEditMode ? "h-full flex flex-col text-sm bg-amber-50/70" : "h-full flex flex-col text-sm"}>
      <div className={isFrenzyEditMode ? "p-3 pb-2 flex flex-col gap-2 border-b border-amber-200/70" : "p-4 pb-2 flex flex-col gap-2"}>
        {isFrenzyEditMode ? (
          <>
            <div
              className="flex items-start justify-between gap-2 cursor-move select-none"
              onMouseDown={onHeaderMouseDown}
            >
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold text-gray-900 truncate">
                  {nameDraft.trim() || quest?.name?.trim() || questData.name?.trim() || 'Quest'}
                </div>
                {isFrenzyCodeEditing ? (
                  <Input
                    value={codeDraft}
                    onChange={(e) => setCodeDraft(e.target.value)}
                    onBlur={() => setIsFrenzyCodeEditing(false)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === 'Escape') {
                        event.preventDefault();
                        setIsFrenzyCodeEditing(false);
                      }
                    }}
                    autoFocus
                    className="h-6 mt-0.5 w-full max-w-[140px] bg-white text-[11px]"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsFrenzyCodeEditing(true)}
                    className="mt-0.5 text-[11px] text-amber-700 truncate hover:underline"
                    title="Click to edit code"
                  >
                    {codeDraft.trim() || quest?.code || questData.code || 'Q?'}
                  </button>
                )}
              </div>
              <div className="flex items-start gap-2">
                {versions.length > 0 && (
                  <VersionHeaderControls
                    index={activeVersionIndex}
                    count={versions.length}
                    onPrevious={handleFrenzyPrevVersion}
                    onNext={handleFrenzyNextVersion}
                    onAdd={handleAddVersion}
                    onDelete={handleDeleteActiveVersion}
                    addDisabled={isVersionMutating || isVersionSaving || !quest?.id}
                    deleteDisabled={isVersionMutating || isVersionSaving || !quest?.id || versions.length <= 1 || !selectedVersionId}
                    compact
                    className="rounded-md border border-amber-300 bg-amber-50/70 px-0.5 py-0"
                  />
                )}
                <span className="text-xs text-amber-700 flex items-center gap-1 h-7 px-1">
                  {autoSaveStatus === 'saving' && (<><Loader2 className="h-3 w-3 animate-spin" /> Saving</>)}
                  {autoSaveStatus === 'saved' && 'Saved'}
                  {autoSaveStatus === 'error' && 'Save failed'}
                </span>
                {onClose && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={onClose}
                    className="h-7 w-7"
                    title="Close"
                  >
                    <X size={14} />
                  </Button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                {!isFrenzyEditMode && (isEditMode || viewMode !== 'details') && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleBack}
                    title="Back"
                  >
                    <ArrowLeft size={14} />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    if (isEditMode) {
                      setVisibilityDraft(prev => (prev === 'domain' ? 'private' : 'domain'));
                      return;
                    }
                    void handleToggleVisibility();
                  }}
                  disabled={!quest?.id}
                  title={
                    isEditMode
                      ? (headerVisibility === 'domain' ? 'Set private' : 'Set domain')
                      : (headerVisibility === 'domain' ? 'Make private' : 'Make public')
                  }
                >
                  {headerVisibility === 'domain' ? <Unlock size={14} /> : <Lock size={14} />}
                </Button>
                <div className="text-base font-semibold text-gray-900 truncate">
                  {quest?.name?.trim() || questData.name?.trim() || 'Quest'}
                </div>
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
              <>
                {!effectiveEditMode && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCompleteQuest}
                    disabled={!quest?.id || isCompleting}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    {isCompleting ? 'Completing…' : 'Done'}
                  </Button>
                )}
                <Button
                  variant={viewMode === 'advanced' ? 'outline' : 'ghost'}
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleToggleViewMode}
                  title="Advanced"
                >
                  <SlidersHorizontal size={16} />
                </Button>
                <Button
                  size="icon"
                  variant={isEditMode ? 'outline' : 'ghost'}
                  onClick={handleToggleEditMode}
                  disabled={!quest?.id}
                  aria-disabled={isContentManaged}
                  className={`h-8 w-8 ${isContentManaged ? 'opacity-50 text-gray-400' : ''}`}
                  title={isContentManaged ? 'Edit this Org-managed node in Emacs' : isEditMode ? 'View Mode' : 'Edit Mode'}
                >
                  <Edit size={16} />
                </Button>
                {isEditMode && (
                  <>
                    <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                      <X className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveQuest} disabled={!hasPendingEditChanges || isSaving || isVersionSaving || !quest?.id}>
                      <Save className="h-4 w-4 mr-1" />
                      {isSaving ? 'Saving…' : 'Save'}
                    </Button>
                  </>
                )}
              </>
            </div>
          </div>
        )}
      {!isFrenzyEditMode && (showHeaderDraftMeta || kindLabel || dueLabel || versions.length > 0) && (
        <div className="flex items-center gap-2 text-xs text-gray-600">
          {showHeaderDraftMeta ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[11px]"
                onClick={handleCycleKindDraft}
                title="Click to cycle kind"
              >
                {formatQuestKindLabel(kindDraft)}
              </Button>
              {isHeaderCodeEditing ? (
                <Input
                  value={codeDraft}
                  onChange={(e) => setCodeDraft(e.target.value)}
                  onBlur={() => setIsHeaderCodeEditing(false)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === 'Escape') {
                      event.preventDefault();
                      setIsHeaderCodeEditing(false);
                    }
                  }}
                  autoFocus
                  className="h-6 w-36 bg-white text-[11px]"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setIsHeaderCodeEditing(true)}
                  className="h-6 rounded border border-gray-300 bg-white px-2 text-[11px] text-gray-700 hover:bg-gray-50"
                  title="Click to edit code"
                >
                  {codeDraft.trim() || quest?.code || questData.code || 'Q?'}
                </button>
              )}
              <span className="text-[11px] text-gray-500">
                {headerVisibility === 'domain' ? 'Domain' : 'Private'}
              </span>
            </>
          ) : (
            <span className="text-[11px] text-gray-500">{kindLabel}</span>
          )}
          {dueTag && (
            <span className={`kg-font-tag px-1.5 py-0.5 rounded text-[11px] font-semibold ${
              dueTag.className
            }`}>
              {dueTag.label}
            </span>
          )}
          {versions.length > 0 && (
            <div className="ml-auto flex items-center gap-1">
              <VersionHeaderControls
                index={activeVersionIndex}
                count={versions.length}
                onPrevious={handlePrevVersion}
                onNext={handleNextVersion}
                onAdd={effectiveEditMode ? handleAddVersion : undefined}
                onDelete={effectiveEditMode ? handleDeleteActiveVersion : undefined}
                addDisabled={isVersionMutating || !quest?.id}
                deleteDisabled={isVersionMutating || !quest?.id || versions.length <= 1 || !selectedVersionId}
              />
            </div>
          )}
        </div>
      )}
      </div>

      <div className={isFrenzyEditMode ? "flex-1 min-h-0 overflow-y-auto p-3 pt-2 pb-4" : "flex-1 min-h-0 overflow-y-auto p-4 pt-3"}>
      {isFrenzyEditMode ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700">Name</label>
              <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className="h-8 mt-1 bg-white" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Active</label>
              <div className="mt-1 flex items-center gap-2 h-8">
                <input
                  type="checkbox"
                  checked={activeDraft}
                  onChange={(e) => setActiveDraft(e.target.checked)}
                  className="h-4 w-4"
                />
                {quest?.nextDueAt && (
                  <span className="text-xs text-gray-700">Next due: {new Date(quest.nextDueAt).toLocaleString()}</span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-700">Kind</label>
                <select
                  value={kindDraft}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (isQuestKind(value)) setKindDraft(value);
                  }}
                  className="mt-1 h-8 w-full rounded border border-amber-200 bg-white px-2 text-xs text-gray-800"
                >
                  <option value="todo">Todo</option>
                  <option value="habit">Habit</option>
                  <option value="daily">Daily</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Visibility</label>
                <select
                  value={visibilityDraft}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (isQuestVisibility(value)) setVisibilityDraft(value);
                  }}
                  className="mt-1 h-8 w-full rounded border border-amber-200 bg-white px-2 text-xs text-gray-800"
                >
                  <option value="private">Private</option>
                  <option value="domain">Domain</option>
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-amber-200 bg-white/60 p-3">
            <div className="text-xs font-semibold text-amber-800">Schedule</div>
            <div className="mt-2">{renderScheduleEditor('frenzy')}</div>
          </div>

          {renderVersionEditor('frenzy')}
        </div>
      ) : effectiveEditMode ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 lg:items-start">
            <div className="lg:col-span-2">
              <label className="text-xs font-medium text-gray-600">Name</label>
              <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className="h-8 mt-1" />
            </div>
            <div className="order-3 lg:order-none lg:col-span-1 lg:row-span-2">
              <label className="text-xs font-medium text-gray-600">Status</label>
              <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1">
                <label className="flex items-center gap-2 text-xs text-gray-700">
                  <input
                    type="checkbox"
                    checked={activeDraft}
                    onChange={(e) => setActiveDraft(e.target.checked)}
                    className="h-4 w-4"
                  />
                  Active
                </label>
                <div className="text-[11px] text-gray-500">
                  {quest?.nextDueAt ? `Next due: ${new Date(quest.nextDueAt).toLocaleString()}` : 'Next due: —'}
                </div>
              </div>
            </div>
            <div className="order-2 lg:order-none lg:col-span-2">
              <label className="text-xs font-medium text-gray-600">Version name</label>
              <Input
                value={activeVersionDraft.title}
                onChange={(e) => {
                  if (!activeVersion?.id) return;
                  patchVersionDraft(activeVersion.id, { title: e.target.value });
                }}
                className="h-8 mt-1"
                placeholder="Version name"
                disabled={!activeVersion?.id}
              />
            </div>
          </div>

          {activeVersion ? (
            <>
              <div className={activeVersionDraft.imagePath?.trim() ? "grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : "grid grid-cols-1"}>
                <div className="min-w-0">
                  <MarkdownPreviewField
                    label="Description (Markdown)"
                    value={activeVersionDraft.descriptionMd}
                    onChange={(value) => {
                      if (!activeVersion.id) return;
                      patchVersionDraft(activeVersion.id, { descriptionMd: value });
                    }}
                    onPaste={(event) => {
                      if (!activeVersion.id) return;
                      handleVersionDescriptionPaste(event, activeVersion.id);
                    }}
                    onDrop={(event) => {
                      if (!activeVersion.id) return;
                      handleVersionDescriptionDrop(event, activeVersion.id);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    rows={6}
                  />
                </div>
                {activeVersionDraft.imagePath?.trim() && (
                  <div className="min-w-0 rounded-md border border-gray-200 p-2">
                    <ImageUploadField
                      compact
                      label="Image"
                      helperText="Shown beside description while attached."
                      imagePath={activeVersionDraft.imagePath}
                      onUpload={uploadQuestVersionImage}
                      onChange={(path) => {
                        if (!activeVersion.id) return;
                        patchVersionDraft(activeVersion.id, { imagePath: path });
                      }}
                      onClear={() => {
                        if (!activeVersion.id) return;
                        patchVersionDraft(activeVersion.id, { imagePath: '' });
                      }}
                      disabled={!activeVersion.id}
                    />
                  </div>
                )}
              </div>
              {!activeVersionDraft.imagePath?.trim() && (
                <div>
                  <ImageUploadField
                    compact
                    label="Image"
                    helperText="Optional. When attached, it appears in a side column."
                    imagePath={activeVersionDraft.imagePath}
                    onUpload={uploadQuestVersionImage}
                    onChange={(path) => {
                      if (!activeVersion.id) return;
                      patchVersionDraft(activeVersion.id, { imagePath: path });
                    }}
                    onClear={() => {
                      if (!activeVersion.id) return;
                      patchVersionDraft(activeVersion.id, { imagePath: '' });
                    }}
                    disabled={!activeVersion.id}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="text-xs text-gray-500">No versions yet.</div>
          )}

          {kindDraft !== 'daily' && (
            <div className="rounded-md border border-gray-200 p-3">
              <div className="text-xs font-semibold text-gray-700">Date & Time</div>
              <div className="mt-2">
                {renderScheduleEditor('standard')}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-xs"
              onClick={() => setIsRelevantLinksExpanded(prev => !prev)}
            >
              {isRelevantLinksExpanded ? 'Hide relevant links' : 'Edit relevant links'}
            </Button>
            {isRelevantLinksExpanded && (
              <div className="text-xs text-gray-500">Version: {activeVersionLabel}</div>
            )}
          </div>

          {isRelevantLinksExpanded && (
            <div className="rounded-md border border-gray-200 p-3 space-y-2">
              {relevantLinks.length === 0 && (
                <div className="text-xs text-gray-500">No relevant links for this version.</div>
              )}
              {relevantLinks.map((link, idx) => (
                <div key={`${link.toCode}-${idx}`} className="flex items-center gap-2 text-xs">
                  <span className="kg-font-tag px-2 py-0.5 rounded bg-gray-100 text-gray-700">{link.relationType}</span>
                  <span className="kg-font-tag px-2 py-0.5 rounded bg-gray-100 text-gray-700">{link.toType}</span>
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
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={newRelation.relationType}
                  onChange={(e) => setNewRelation(prev => ({ ...prev, relationType: e.target.value }))}
                  className="h-7 text-xs sm:w-36"
                  placeholder="relation type"
                />
                <select
                  value={newRelation.toType}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!isRelationToType(value)) return;
                    setNewRelation(prev => ({ ...prev, toType: value }));
                  }}
                  className="h-7 rounded border border-gray-200 bg-white px-2 text-xs text-gray-700"
                >
                  <option value="definition">Definition</option>
                  <option value="exercise">Exercise</option>
                  <option value="source">Source</option>
                  <option value="meta_quest">Quest</option>
                </select>
                <Input
                  value={newRelation.toCode}
                  onChange={(e) => setNewRelation(prev => ({ ...prev, toCode: e.target.value }))}
                  className="h-7 text-xs sm:w-48"
                  placeholder="Target code"
                />
                <Button size="sm" variant="outline" onClick={handleAddRelevantLink}>
                  Add
                </Button>
                <Button size="sm" onClick={handleSaveRelevantLinks} disabled={!quest?.id || !selectedVersionId}>
                  Save Links
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="destructive" onClick={handleDeleteQuest} disabled={!quest?.id || isDeleting}>
              {isDeleting ? 'Deleting…' : 'Delete Quest'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          {viewMode === 'details' && (
            <>
              {versions.length > 0 ? (
                <div className="rounded-md border border-gray-200 p-3 space-y-2">
                  <div className="text-sm text-gray-900">{activeVersion?.title || '—'}</div>
                  {(activeVersion?.descriptionMd?.trim() || activeVersion?.imagePath) ? (
                    <div className="rounded-md border border-gray-100 bg-gray-50 p-2 text-xs text-gray-800 space-y-2">
                      {activeVersion?.descriptionMd?.trim() ? (
                        <MarkdownKatex className="whitespace-pre-wrap">{activeVersion.descriptionMd}</MarkdownKatex>
                      ) : null}
                      {activeVersion?.imagePath ? (
                        <ZoomableImage src={activeVersion.imagePath} alt="Quest image" className="max-w-full" />
                      ) : null}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">No description.</div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-gray-500">No versions yet.</div>
              )}

              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-700">Relevant Links</div>
                {relevantLinks.length === 0 && (
                  <div className="text-xs text-gray-500">No relevant links for this version.</div>
                )}
                {relevantLinks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {relevantLinks.map((link, idx) => {
                      const style =
                        link.toType === 'definition'
                          ? 'bg-blue-50 hover:bg-blue-100 border-blue-200'
                          : link.toType === 'exercise'
                            ? 'bg-orange-50 hover:bg-orange-100 border-orange-200'
                            : link.toType === 'source'
                              ? 'bg-green-50 hover:bg-green-100 border-green-200'
                              : 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200';
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
            </>
          )}

          {viewMode === 'advanced' && (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-gray-800">Details</div>
              <div className="grid grid-cols-2 gap-4 text-xs text-gray-600">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-gray-500">Active</div>
                  <div className="text-sm text-gray-900">{activeDraft ? 'Yes' : 'No'}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-gray-500">Visibility</div>
                  <div className="text-sm text-gray-900">{quest?.visibility === 'domain' ? 'Domain' : 'Private'}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-gray-500">Next due</div>
                  <div className="text-sm text-gray-900">{quest?.nextDueAt ? new Date(quest.nextDueAt).toLocaleString() : '—'}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-gray-500">Schedule</div>
                  <div className="text-sm text-gray-900">{scheduleSummary(quest?.schedule)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
};

export default QuestWindowContent;
