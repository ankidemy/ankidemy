// client/src/app/components/Graph/windows/questScheduleDrafts.ts
import { getAppTimeZone } from '@/lib/app-preferences';

export type RepeatPreset = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly' | 'custom';
export type CustomRepeatPeriod = 'days' | 'weeks' | 'months' | 'years';
export type DurationMode = 'forever' | 'count' | 'until';
export type WeekdayCode = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

const pad2 = (value: number) => String(value).padStart(2, '0');

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const getStringProp = (obj: Record<string, unknown>, key: string) => (typeof obj[key] === 'string' ? (obj[key] as string) : undefined);
const getNumberProp = (obj: Record<string, unknown>, key: string) => (typeof obj[key] === 'number' ? (obj[key] as number) : undefined);
const getStringArrayProp = (obj: Record<string, unknown>, key: string) => {
  const v = obj[key];
  if (!Array.isArray(v)) return undefined;
  if (!v.every(item => typeof item === 'string')) return undefined;
  return v as string[];
};

export const weekdayLabels: Array<{ code: WeekdayCode; label: string }> = [
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

export const coalesceTimezone = (value?: string) => value?.trim() || getAppTimeZone() || 'UTC';

const parseRRule = (rrule: string) => {
  const out: Record<string, string> = {};
  for (const part of (rrule || '').split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [k, v] = trimmed.split('=');
    if (!k || !v) continue;
    out[k.toUpperCase()] = v.trim();
  }
  return out;
};

const buildRRule = (parts: {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval?: number;
  byday?: WeekdayCode[];
  untilIso?: string;
  count?: number;
}) => {
  const tokens: string[] = [];
  tokens.push(`FREQ=${parts.freq}`);
  const interval = parts.interval && parts.interval > 1 ? Math.floor(parts.interval) : 1;
  if (interval > 1) tokens.push(`INTERVAL=${interval}`);
  if (parts.byday && parts.byday.length > 0) tokens.push(`BYDAY=${parts.byday.join(',')}`);
  if (parts.untilIso) tokens.push(`UNTIL=${parts.untilIso}`);
  if (parts.count && parts.count > 0) tokens.push(`COUNT=${Math.floor(parts.count)}`);
  return tokens.join(';');
};

export const scheduleSummary = (schedule: unknown) => {
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

export const parseScheduleToDrafts = (schedule: unknown) => {
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

export const buildQuestSchedulePayload = (args: {
  existingSchedule: unknown;
  kind: 'todo' | 'habit' | 'daily';
  timezone?: string;
  dueDate?: string;
  dueTime?: string;
  repeatEnabled?: boolean;
  preset?: RepeatPreset;
  customEvery?: number;
  customPeriod?: CustomRepeatPeriod;
  customWeekdays?: Set<WeekdayCode>;
  durationMode?: DurationMode;
  durationCount?: number;
  untilDate?: string;
}) => {
  const existing = isRecord(args.existingSchedule) ? args.existingSchedule : {};
  const tz = coalesceTimezone(args.timezone || getStringProp(existing, 'timezone'));
  const date = args.dueDate || toLocalDateInput(new Date());
  const time = args.dueTime || '09:00';
  const dt = new Date(`${date}T${time}`);
  if (Number.isNaN(dt.getTime())) {
    throw new Error('Invalid due date/time.');
  }
  const dtstartIso = dt.toISOString();

  if (args.kind === 'daily') {
    const scheduleType = String(getStringProp(existing, 'type') || '');
    const cooldownDaysOverride = scheduleType === 'daily_pool' ? getNumberProp(existing, 'cooldownDaysOverride') : undefined;
    return {
      type: 'daily_pool',
      timezone: tz,
      cooldownDaysOverride: cooldownDaysOverride ?? null,
    };
  }

  const dtWeekday = weekdayFromDate(dt);
  const repeatEnabled = args.kind === 'habit' ? true : !!args.repeatEnabled;
  const preset = args.preset || 'daily';
  const customEvery = args.customEvery ?? 1;
  const customPeriod = args.customPeriod ?? 'days';
  const customWeekdays = args.customWeekdays ?? new Set<WeekdayCode>([dtWeekday]);
  const durationMode = args.durationMode ?? 'forever';
  const durationCount = args.durationCount ?? 1;
  const untilDate = args.untilDate || '';

  let rrule: string;
  if (!repeatEnabled) {
    rrule = 'FREQ=DAILY;COUNT=1';
  } else {
    let freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' = 'DAILY';
    let interval = 1;
    let byday: WeekdayCode[] | undefined;

    if (preset === 'daily') {
      freq = 'DAILY';
    } else if (preset === 'weekdays') {
      freq = 'WEEKLY';
      byday = ['MO', 'TU', 'WE', 'TH', 'FR'];
    } else if (preset === 'weekly') {
      freq = 'WEEKLY';
      byday = [dtWeekday];
    } else if (preset === 'monthly') {
      freq = 'MONTHLY';
    } else if (preset === 'yearly') {
      freq = 'YEARLY';
    } else {
      interval = Math.max(1, Math.floor(customEvery || 1));
      if (customPeriod === 'days') freq = 'DAILY';
      if (customPeriod === 'weeks') {
        freq = 'WEEKLY';
        const days = sortWeekdayCodes(Array.from(customWeekdays));
        byday = days.length > 0 ? days : [dtWeekday];
      }
      if (customPeriod === 'months') freq = 'MONTHLY';
      if (customPeriod === 'years') freq = 'YEARLY';
    }

    let untilIso: string | undefined;
    let count: number | undefined;
    if (durationMode === 'until') {
      const d = untilDate || date;
      const untilDt = new Date(`${d}T${time}`);
      if (!Number.isNaN(untilDt.getTime())) {
        untilIso = untilDt.toISOString();
      }
    } else if (durationMode === 'count') {
      count = Math.max(1, Math.floor(durationCount || 1));
    }

    rrule = buildRRule({ freq, interval, byday, untilIso, count });
  }

  if (args.kind === 'habit') {
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
};
