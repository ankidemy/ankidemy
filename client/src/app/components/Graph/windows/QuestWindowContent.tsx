// client/src/app/components/Graph/windows/QuestWindowContent.tsx
"use client";

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from "@/app/components/core/button";
import { Input } from "@/app/components/core/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/core/tabs";
import MarkdownPreviewField from '../components/MarkdownPreviewField';
import { showToast } from '@/app/components/core/ToastNotification';
import { Clock, Edit, Loader2, Save, X } from 'lucide-react';
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
  isFrenzyEditMode?: boolean;
}

type RelationDraft = { relationType: string; toType: 'meta_definition' | 'meta_exercise' | 'source' | 'meta_quest'; toCode: string };

const pad2 = (value: number) => String(value).padStart(2, '0');

type RepeatPreset = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly' | 'custom';
type CustomRepeatPeriod = 'days' | 'weeks' | 'months' | 'years';
type DurationMode = 'forever' | 'count' | 'until';
type WeekdayCode = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';
type QuestKind = 'todo' | 'habit' | 'daily';
type QuestVisibility = 'private' | 'domain';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const getStringProp = (obj: Record<string, unknown>, key: string) => (typeof obj[key] === 'string' ? (obj[key] as string) : undefined);
const getNumberProp = (obj: Record<string, unknown>, key: string) => (typeof obj[key] === 'number' ? (obj[key] as number) : undefined);
const getStringArrayProp = (obj: Record<string, unknown>, key: string) => {
  const v = obj[key];
  if (!Array.isArray(v)) return undefined;
  if (!v.every(item => typeof item === 'string')) return undefined;
  return v as string[];
};

const isQuestKind = (value: string): value is QuestKind => value === 'todo' || value === 'habit' || value === 'daily';
const isQuestVisibility = (value: string): value is QuestVisibility => value === 'private' || value === 'domain';
const isRelationToType = (value: string): value is RelationDraft['toType'] =>
  value === 'meta_definition' || value === 'meta_exercise' || value === 'source' || value === 'meta_quest';

const weekdayLabels: Array<{ code: WeekdayCode; label: string }> = [
  { code: 'MO', label: 'Mon' },
  { code: 'TU', label: 'Tue' },
  { code: 'WE', label: 'Wed' },
  { code: 'TH', label: 'Thu' },
  { code: 'FR', label: 'Fri' },
  { code: 'SA', label: 'Sat' },
  { code: 'SU', label: 'Sun' },
];

const weekdayOrder: Record<WeekdayCode, number> = {
  MO: 0,
  TU: 1,
  WE: 2,
  TH: 3,
  FR: 4,
  SA: 5,
  SU: 6,
};

const sortWeekdayCodes = (codes: WeekdayCode[]) => codes.slice().sort((a, b) => weekdayOrder[a] - weekdayOrder[b]);

const weekdayFromDate = (date: Date): WeekdayCode => {
  switch (date.getDay()) {
    case 1: return 'MO';
    case 2: return 'TU';
    case 3: return 'WE';
    case 4: return 'TH';
    case 5: return 'FR';
    case 6: return 'SA';
    default: return 'SU';
  }
};

const toLocalDateInput = (date: Date) => {
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  return `${yyyy}-${mm}-${dd}`;
};

const toLocalTimeInput = (date: Date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

const coalesceTimezone = (value?: string) => value?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

const parseRRule = (rrule: string) => {
  const out: Record<string, string> = {};
  for (const part of (rrule || '').split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [k, v] = trimmed.split('=', 2);
    if (!k || v == null) continue;
    out[k.toUpperCase()] = v.trim();
  }
  return out;
};

const buildRRule = (parts: {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval?: number;
  byday?: WeekdayCode[];
  count?: number;
  untilIso?: string;
}) => {
  const tokens: string[] = [`FREQ=${parts.freq}`];
  const interval = parts.interval && parts.interval > 1 ? Math.floor(parts.interval) : 1;
  if (interval > 1) tokens.push(`INTERVAL=${interval}`);
  if (parts.byday && parts.byday.length > 0) tokens.push(`BYDAY=${parts.byday.join(',')}`);
  if (parts.untilIso) tokens.push(`UNTIL=${parts.untilIso}`);
  if (parts.count && parts.count > 0) tokens.push(`COUNT=${Math.floor(parts.count)}`);
  return tokens.join(';');
};

const scheduleSummary = (schedule: unknown) => {
  if (!isRecord(schedule)) return 'No schedule';
  const type = String(getStringProp(schedule, 'type') || '');
  if (type === 'daily_pool') return 'Daily pool';
  const dtstart = getStringProp(schedule, 'dtstart');
  const rrule = getStringProp(schedule, 'rrule');
  if ((type === 'rrule' || type === 'habit') && dtstart && rrule) {
    const dt = new Date(dtstart);
    const r = parseRRule(rrule);
    const freq = (r.FREQ || 'DAILY').toUpperCase();
    const interval = Number.parseInt(r.INTERVAL || '1', 10) || 1;
    const byday = (r.BYDAY || '').trim();
    const count = r.COUNT ? Number.parseInt(r.COUNT, 10) : null;
    const until = r.UNTIL ? new Date(r.UNTIL).toLocaleDateString() : null;
    const base = `${dt.toLocaleString()} (${coalesceTimezone(getStringProp(schedule, 'timezone'))})`;
    if (count === 1 && freq === 'DAILY' && interval === 1 && !byday && !until) return `One-off: ${base}`;
    const dayText = byday ? ` on ${byday.split(',').join(', ')}` : '';
    const intervalText = interval > 1 ? ` every ${interval} ${freq.toLowerCase()}` : ` ${freq.toLowerCase()}`;
    const durationText = until ? ` until ${until}` : count ? ` (${count} times)` : '';
    return `Repeats${intervalText}${dayText}: ${base}${durationText}`;
  }
  return 'Custom schedule';
};

const parseScheduleToDrafts = (schedule: unknown) => {
  const scheduleObj = isRecord(schedule) ? schedule : {};
  const timezone = coalesceTimezone(getStringProp(scheduleObj, 'timezone'));
  const dtstartRaw = getStringProp(scheduleObj, 'dtstart');
  const dtstart = dtstartRaw ? new Date(dtstartRaw) : new Date();
  const date = toLocalDateInput(dtstart);
  const time = toLocalTimeInput(dtstart);

  const scheduleType = String(getStringProp(scheduleObj, 'type') || '');
  const rrule = getStringProp(scheduleObj, 'rrule') || '';
  const dtWeekday = weekdayFromDate(dtstart);

  if (scheduleType === 'daily_pool' || rrule.trim().length === 0) {
    return {
      timezone,
      date,
      time,
      repeatEnabled: false,
      preset: 'daily' as RepeatPreset,
      customEvery: 1,
      customPeriod: 'days' as CustomRepeatPeriod,
      customWeekdays: new Set<WeekdayCode>([dtWeekday]),
      durationMode: 'forever' as DurationMode,
      durationCount: 1,
      untilDate: '',
    };
  }

  const parsed = parseRRule(rrule);
  const freq = (parsed.FREQ || 'DAILY').toUpperCase();
  const interval = Math.max(1, Number.parseInt(parsed.INTERVAL || '1', 10) || 1);
  const byday = sortWeekdayCodes((parsed.BYDAY || '').split(',').map(s => s.trim()).filter(Boolean) as WeekdayCode[]);
  const count = parsed.COUNT ? Math.max(1, Number.parseInt(parsed.COUNT, 10) || 1) : null;
  const until = parsed.UNTIL ? new Date(parsed.UNTIL) : null;

  const isOneOff = freq === 'DAILY' && interval === 1 && byday.length === 0 && count === 1 && !until;
  const repeatEnabled = !isOneOff;

  let preset: RepeatPreset = 'custom';
  if (!repeatEnabled) preset = 'daily';
  else if (freq === 'DAILY' && interval === 1 && byday.length === 0) preset = 'daily';
  else if (freq === 'WEEKLY' && interval === 1 && byday.join(',') === 'MO,TU,WE,TH,FR') preset = 'weekdays';
  else if (freq === 'WEEKLY' && interval === 1 && byday.length === 1 && byday[0] === dtWeekday) preset = 'weekly';
  else if (freq === 'MONTHLY' && interval === 1) preset = 'monthly';
  else if (freq === 'YEARLY' && interval === 1) preset = 'yearly';

  const customPeriod: CustomRepeatPeriod =
    freq === 'WEEKLY' ? 'weeks' : freq === 'MONTHLY' ? 'months' : freq === 'YEARLY' ? 'years' : 'days';
  const customEvery = interval;
  const customWeekdays = new Set<WeekdayCode>(byday.length > 0 ? byday : [dtWeekday]);

  const durationMode: DurationMode = until ? 'until' : count && count > 0 ? 'count' : 'forever';
  const durationCount = count ?? 1;
  const untilDate = until ? toLocalDateInput(until) : '';

  return {
    timezone,
    date,
    time,
    repeatEnabled,
    preset,
    customEvery,
    customPeriod,
    customWeekdays,
    durationMode,
    durationCount,
    untilDate,
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
}) => {
  const ui = useUI();
  const [quest, setQuest] = useState<MetaQuestDTO | null>(null);
  const [versions, setVersions] = useState<QuestVersionDTO[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'versions' | 'relations'>('details');
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

  const effectiveEditMode = isFrenzyEditMode || isEditMode;

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
      const drafts = parseScheduleToDrafts(fresh.schedule);
      setTimezoneDraft(drafts.timezone);
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
      setActiveTab('details');
      setShowAddVersionForm(false);
      const drafts = parseScheduleToDrafts(fallback.schedule);
      setTimezoneDraft(drafts.timezone);
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
  }, [questData, questData?.id, questData?.code, loadQuest]);

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

  const buildSchedulePayload = useCallback((existingSchedule: unknown) => {
    const existing = isRecord(existingSchedule) ? existingSchedule : {};
    const tz = coalesceTimezone(timezoneDraft || getStringProp(existing, 'timezone'));
    const date = dueDateDraft || toLocalDateInput(new Date());
    const time = dueTimeDraft || '09:00';
    const dt = new Date(`${date}T${time}`);
    if (Number.isNaN(dt.getTime())) {
      throw new Error('Invalid due date/time.');
    }
    const dtstartIso = dt.toISOString();

    if (kindDraft === 'daily') {
      const scheduleType = String(getStringProp(existing, 'type') || '');
      const cooldownDaysOverride = scheduleType === 'daily_pool' ? getNumberProp(existing, 'cooldownDaysOverride') : undefined;
      return {
        type: 'daily_pool',
        timezone: tz,
        cooldownDaysOverride: cooldownDaysOverride ?? null,
      };
    }

    const dtWeekday = weekdayFromDate(dt);
    const repeatEnabled = kindDraft === 'habit' ? true : repeatEnabledDraft;
    let rrule: string;

    if (!repeatEnabled) {
      rrule = 'FREQ=DAILY;COUNT=1';
    } else {
      let freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' = 'DAILY';
      let interval = 1;
      let byday: WeekdayCode[] | undefined;

      if (repeatPresetDraft === 'daily') {
        freq = 'DAILY';
      } else if (repeatPresetDraft === 'weekdays') {
        freq = 'WEEKLY';
        byday = ['MO', 'TU', 'WE', 'TH', 'FR'];
      } else if (repeatPresetDraft === 'weekly') {
        freq = 'WEEKLY';
        byday = [dtWeekday];
      } else if (repeatPresetDraft === 'monthly') {
        freq = 'MONTHLY';
      } else if (repeatPresetDraft === 'yearly') {
        freq = 'YEARLY';
      } else {
        interval = Math.max(1, Math.floor(customRepeatEveryDraft || 1));
        if (customRepeatPeriodDraft === 'days') freq = 'DAILY';
        if (customRepeatPeriodDraft === 'weeks') {
          freq = 'WEEKLY';
          const days = sortWeekdayCodes(Array.from(customRepeatWeekdaysDraft));
          byday = days.length > 0 ? days : [dtWeekday];
        }
        if (customRepeatPeriodDraft === 'months') freq = 'MONTHLY';
        if (customRepeatPeriodDraft === 'years') freq = 'YEARLY';
      }

      let untilIso: string | undefined;
      let count: number | undefined;
      if (durationModeDraft === 'until') {
        const untilDate = untilDateDraft || date;
        const untilDt = new Date(`${untilDate}T${time}`);
        if (!Number.isNaN(untilDt.getTime())) {
          untilIso = untilDt.toISOString();
        }
      } else if (durationModeDraft === 'count') {
        count = Math.max(1, Math.floor(durationCountDraft || 1));
      }

      rrule = buildRRule({ freq, interval, byday, untilIso, count });
    }

    if (kindDraft === 'habit') {
      return {
        type: 'habit',
        timezone: tz,
        dtstart: dtstartIso,
        rrule,
        requiredCompletionsPerPeriod: getNumberProp(existing, 'requiredCompletionsPerPeriod') ?? 1,
        period: getStringProp(existing, 'period') ?? 'day',
        consecutivePeriodsToAutoDeactivate: getNumberProp(existing, 'consecutivePeriodsToAutoDeactivate') ?? 0,
      };
    }

    return {
      type: 'rrule',
      timezone: tz,
      dtstart: dtstartIso,
      rrule,
      exdate: getStringArrayProp(existing, 'exdate') ?? [],
      rdate: getStringArrayProp(existing, 'rdate') ?? [],
      defaultSnoozeMinutes: getNumberProp(existing, 'defaultSnoozeMinutes') ?? 120,
    };
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
    if (nameDraft.trim().length === 0) {
      showToast('Quest name is required.', 'warning');
      return;
    }
    setIsSaving(true);
    try {
      const parsedSchedule = buildSchedulePayload(quest.schedule);
      const payload: Partial<MetaQuestDTO> & { active?: boolean } = {
        name: nameDraft.trim(),
        code: codeDraft.trim(),
        kind: kindDraft,
        schedule: parsedSchedule,
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
    quest?.id,
    nameDraft,
    buildSchedulePayload,
    codeDraft,
    kindDraft,
    visibilityDraft,
    activeDraft,
    onUpdateQuest,
    quest?.schedule,
    isFrenzyEditMode,
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
    setTimezoneDraft(drafts.timezone);
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
    setIsEditMode(false);
  }, [quest, questData]);

  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const lastAutoSavedRef = React.useRef<string>('');

  useEffect(() => {
    if (!isFrenzyEditMode) return;
    lastAutoSavedRef.current = '';
    setAutoSaveStatus('idle');
  }, [isFrenzyEditMode, quest?.id]);

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

  const renderScheduleEditor = (variant: 'standard' | 'frenzy') => {
    const timeInputId = `${windowId}-quest-time`;
    if (kindDraft === 'daily') {
      return (
        <div className={variant === 'frenzy' ? "space-y-2" : "space-y-3"}>
          <div className="text-xs text-gray-700">
            Daily quests are drawn from the daily pool. Scheduling is handled by the pool.
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-700">
              Timezone: <span className="font-mono">{timezoneDraft}</span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => setTimezoneDraft(coalesceTimezone())}
            >
              Use local
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className={variant === 'frenzy' ? "space-y-2" : "space-y-3"}>
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

        {kindDraft !== 'daily' && (
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
        )}

        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-700">
            Timezone: <span className="font-mono">{timezoneDraft}</span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => setTimezoneDraft(coalesceTimezone())}
          >
            Use local
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className={isFrenzyEditMode ? "p-3 text-sm bg-amber-50/70" : "flex flex-col gap-4 text-sm p-4"}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-base font-semibold text-gray-900">
            {quest?.name?.trim() || questData.name?.trim() || 'Quest'}
          </div>
          {(quest?.code || questData.code) && (
            <div className="text-xs text-gray-500">Code: {quest?.code || questData.code}</div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isLoading && <span className="text-xs text-gray-500">Loading…</span>}

          {isFrenzyEditMode ? (
            <span className="text-xs text-amber-700 flex items-center gap-1">
              {autoSaveStatus === 'saving' && (<><Loader2 className="h-3 w-3 animate-spin" /> Saving</>)}
              {autoSaveStatus === 'saved' && 'Saved'}
              {autoSaveStatus === 'error' && 'Save failed'}
            </span>
          ) : (
            <>
              {!effectiveEditMode ? (
                <Button size="sm" variant="outline" onClick={() => setIsEditMode(true)}>
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              ) : (
                <>
                  <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                    <X className="h-4 w-4 mr-1" />
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSaveQuest} disabled={isSaving || !quest?.id}>
                    <Save className="h-4 w-4 mr-1" />
                    {isSaving ? 'Saving…' : 'Save'}
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {isFrenzyEditMode ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-700">Name</label>
              <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className="h-8 mt-1 bg-white" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-700">Code</label>
                <Input value={codeDraft} onChange={(e) => setCodeDraft(e.target.value)} className="h-8 mt-1 bg-white" />
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
        </div>
      ) : (
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
            {!effectiveEditMode ? (
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-gray-600">Name</div>
                  <div className="text-sm text-gray-900">{quest?.name || quest?.versions?.[0]?.title || '—'}</div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-gray-600">Kind</div>
                    <div className="text-sm text-gray-900">{quest?.kind || '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600">Visibility</div>
                    <div className="text-sm text-gray-900">{quest?.visibility || 'private'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-gray-600">Active</div>
                    <div className="text-sm text-gray-900">{activeDraft ? 'Yes' : 'No'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-600">Next due</div>
                    <div className="text-sm text-gray-900">{quest?.nextDueAt ? new Date(quest.nextDueAt).toLocaleString() : '—'}</div>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-600">Schedule</div>
                  <div className="text-sm text-gray-900">{scheduleSummary(quest?.schedule)}</div>
                </div>
              </div>
            ) : (
              <>
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
                      onChange={(e) => {
                        const value = e.target.value;
                        if (isQuestKind(value)) setKindDraft(value);
                      }}
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
                      onChange={(e) => {
                        const value = e.target.value;
                        if (isQuestVisibility(value)) setVisibilityDraft(value);
                      }}
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
                </div>

                <div className="rounded-md border border-gray-200 p-3">
                  <div className="text-xs font-semibold text-gray-700">Schedule</div>
                  <div className="mt-2">{renderScheduleEditor('standard')}</div>
                </div>

                <div className="flex items-center gap-2">
                  <Button size="sm" variant="destructive" onClick={handleDeleteQuest} disabled={!quest?.id || isDeleting}>
                    {isDeleting ? 'Deleting…' : 'Delete Quest'}
                  </Button>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="versions" className="mt-3 space-y-3">
            {!effectiveEditMode ? (
              <>
                {versions.length === 0 && <div className="text-xs text-gray-500">No versions yet.</div>}
                {versions.map((version, index) => (
                  <div key={version.id} className="rounded-md border border-gray-200 p-3 space-y-2">
                    <div className="text-xs font-semibold text-gray-700">Version {index + 1}</div>
                    <div className="text-sm text-gray-900">{version.title || '—'}</div>
                    {version.descriptionMd?.trim() ? (
                      <div className="rounded-md border border-gray-100 bg-gray-50 p-2 text-xs text-gray-800 whitespace-pre-wrap">
                        {version.descriptionMd}
                      </div>
                    ) : (
                      <div className="text-xs text-gray-500">No description.</div>
                    )}
                  </div>
                ))}
              </>
            ) : (
              <>
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
              </>
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
                {effectiveEditMode && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setRelevantLinks(prev => prev.filter((_, i) => i !== idx))}
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
            {effectiveEditMode && (
              <div className="flex items-center gap-2">
                <Input
                  value={newRelation.relationType}
                  onChange={(e) => setNewRelation(prev => ({ ...prev, relationType: e.target.value }))}
                  className="h-7 text-xs"
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
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default QuestWindowContent;
