# Quests & Survey Queue — Current Behavior

> Investigated 2026-07-21. This is a descriptive report of the behavior currently
> implemented in the server and client, not a proposed specification. In particular,
> §10 records implementation gaps that a replacement specification should resolve.

---

## 1. Protocol at a glance

`GET /api/survey/domains/:id/queue` builds one user-specific queue for one domain:

```text
visible quests = domain-visible quests + the user's own private quests

regular segment = every active, non-daily quest whose nextDueAt <= now

daily segment = today's persisted random draw, or, if no draw exists:
                shuffle active daily quests outside their cooldown,
                take dailyQuestLimit, persist those IDs in that order

returned queue = regular segment, followed by daily segment
```

The central answers are:

- **Regular quests are not chosen from a pool.** Every visible, active `todo` or
  `habit` whose persisted due time is now or earlier is included.
- **Daily quests are chosen randomly.** Eligible daily quests are shuffled, capped by
  the per-user/per-domain daily limit, and the chosen quest IDs are persisted for the
  user's local calendar day.
- **There is no global priority ordering.** Regular quests retain an unspecified
  database-return order. All regular quests precede all daily quests. The daily
  segment retains the random ID order stored in the day's draw.
- **The quest version is chosen separately and uniformly at random on every queue
  fetch.** Its `displayOrder` does not weight the choice.
- **Pointing to a source, definition, exercise, or another quest has no scheduling
  effect.** Relations only provide navigation links associated with the selected
  presentation/version.

The server implementation is in
[`SurveyService.GetQueue`](../server/services/survey_service.go#L164-L250),
[`buildDailyQueue`](../server/services/survey_service.go#L417-L506), and
[`queueFromDraw`](../server/services/survey_service.go#L508-L534).

## 2. Quest data and ownership

A quest has two layers:

- The shared **quest node** owns its domain, owner, code, name, kind, schedule,
  visibility, and graph position.
- One or more **quest versions** own the presented title, Markdown description, task
  list, and image. Versions have a stable `displayOrder`.

Scheduling state is not shared. Each `(user, quest)` has an independent state row with
`active`, `nextDueAt`, snooze/completion/presentation timestamps, habit counters, and
daily-pool `lastShownAt`. Quest events are appended to a separate event log. Daily
draws are stored per `(user, domain, local-date)` as an ordered JSON array of quest IDs.
See [`models/quest.go`](../server/models/quest.go) and
[`models/user_daily_quest_draw.go`](../server/models/user_daily_quest_draw.go).

The supported kinds and their canonical schedule payload types are:

| Quest kind | Canonical schedule type | Intended role |
| --- | --- | --- |
| `todo` | `rrule` | Normally one occurrence (`COUNT=1`) |
| `habit` | `habit` | Recurring quest with streak/auto-deactivation state |
| `daily` | `daily_pool` | Candidate for a limited daily random draw |

The live Org importer validates this pairing and requires an imported `todo` to have
`COUNT=1` ([`validateContentQuest`](../server/services/content_snapshot.go#L307-L334)).
The ordinary quest create/update HTTP handlers do not perform equivalent semantic
validation: they accept a nonempty kind and raw schedule JSON, leaving the database
kind constraint and later scheduling code to reject or misinterpret mismatches.

Visibility is part of queue eligibility:

- A `domain` quest is visible to users who can view the domain.
- A `private` quest is visible only to its owner.
- A newly encountered visible quest gets a per-user state row lazily, initially
  active.

The backend queue requires domain view access. The current graph UI additionally
disables the Survey button unless the user is enrolled.

## 3. How quests enter the queue

### 3.1 Regular quests (`kind != daily`)

For every visible non-daily quest, the server:

1. Loads or creates the user's state.
2. Excludes it if `active == false`.
3. Initializes or refreshes `nextDueAt` from the schedule when allowed.
4. Includes it only when `nextDueAt` is non-null and `nextDueAt <= now`.

An already-due time is deliberately **sticky**: queue refreshes and schedule edits do
not advance it away. It remains in the queue until an explicit complete, skip, snooze,
or deactivate action changes state. Every queue fetch sets `lastPresentedAt = now` for
each included regular quest; this includes background polling, not just the user
opening a quest.

For a never-completed `rrule` or `habit`, the first persisted due time is exactly the
schedule's `dtstart`, converted to UTC. A `dtstart` in the past therefore enters as
overdue rather than being advanced to the latest recurrence. `daily_pool` schedules do
not use `nextDueAt`.

These rules are implemented by
[`ensureQuestNextDueWithContext`](../server/services/survey_service.go#L72-L162) and the
regular loop in [`GetQueue`](../server/services/survey_service.go#L199-L242).

### 3.2 Daily-pool quests (`kind == daily`)

The user's configured timezone defines the `YYYY-MM-DD` draw key. If no draw exists
for that local day, a daily quest is eligible when:

- it is currently visible;
- its user state is active; and
- the number of local calendar days since `lastShownAt` is at least its cooldown.

The cooldown is `dailyQuestCooldownDays` from user-domain settings (default 7), unless
that quest's `daily_pool` schedule has a `cooldownDaysOverride`. Eligible quests are
randomly shuffled, then truncated to `dailyQuestLimit` (default 1; a nonpositive value
is treated as 1). Selection immediately writes both `lastShownAt` and
`lastPresentedAt`; cooldown is therefore based on being **drawn/shown**, not on being
completed.

There is no upper bound or nonnegative validation on these settings. A limit larger
than the eligible pool selects the whole pool, while a negative cooldown makes every
quest pass the cooldown comparison. If there are no eligible quests, no empty draw is
persisted, so another request later that day may still create a draw if content or
state changes.

The selected ID array and its random order are persisted. Later requests on the same
local day reuse it, so changing the limit/cooldown or adding another eligible daily
quest does not redraw that day. IDs no longer present among the currently visible
daily quests are skipped when reconstructing the queue.

The daily schedule's `dtstart`, `rrule`, `orgRepeaterMode`, and schedule-level timezone
do not participate in selection. Only `cooldownDaysOverride` is read; the user-domain
timezone controls the day boundary.

## 4. Exact queue ordering

| Segment | Membership | Order inside the segment | Stability |
| --- | --- | --- | --- |
| Regular | All due visible active non-daily quests | Whatever order the database returns from `ListVisible`; the query has no `ORDER BY` | Not guaranteed by the protocol or SQL |
| Daily | IDs selected for today's draw | Fisher-Yates shuffle order stored in `quest_ids` | Stable for that local day once successfully persisted |

The server appends the entire daily segment after the regular segment. Neither client
queue view sorts the response; both render array order directly
([full Survey window](../client/src/app/components/Graph/windows/SurveyWindowContent.tsx#L174-L264),
[`TopControls` dropdown](../client/src/app/components/Graph/panels/TopControls.tsx#L786-L848)).

Consequently, none of these currently affect position:

- oldest/most-overdue due time;
- next due time;
- quest kind within the regular segment;
- quest name, code, creation time, or version `displayOrder`;
- relation target type or number of related nodes;
- habit streak or completion count;
- any SRS impact, status, prerequisite, or credit value.

`ListVisible` currently tends to look insertion-like on common databases, but relying
on that would be relying on an unspecified query plan, not an implemented rule
([`QuestDAO.ListVisible`](../server/dao/quest_dao.go#L85-L92)).

## 5. Quest-version selection

Every included item must have at least one version. Versions are fetched in
`display_order ASC, id ASC`, but the selected version is
`versions[rand.Intn(len(versions))]`: a uniform random choice with no use of history,
success, last presentation, or display order
([`buildQueueItem`](../server/services/survey_service.go#L253-L295)).

Important consequences:

- Refreshing or background-fetching the queue can select a different version of the
  same quest, including daily quests whose quest ID was persisted for the day.
- The selected version itself is not persisted in the daily draw or user state.
- The response contains all versions, in display order, so the full Survey window lets
  the user swap presentations. A swap logs `version_swapped` but only changes local UI
  selection; the event produces no scheduling state change. The next refresh chooses
  randomly again.
- Complete/skip/snooze events sent by the UI identify the version the user was looking
  at. The compact dropdown completes the server-selected version directly.

If an eligible quest has no versions, construction returns an error and the entire
queue request fails. Normal create/delete paths prevent this by creating an initial
version and refusing to delete the last one.

## 6. Recurrence and timezone rules

The server uses a small in-repository RRULE implementation rather than a complete
RFC 5545 engine ([`quest_schedule.go`](../server/services/quest_schedule.go)). It reads:

- `FREQ` (`DAILY`, `WEEKLY`, `MONTHLY`, `YEARLY`; missing/unknown acts as daily);
- `INTERVAL`;
- `BYDAY` for weekly schedules;
- `BYHOUR` and `BYMINUTE`;
- `COUNT` and `UNTIL`;
- `EXDATE` and `RDATE` for `rrule` schedules.

For monthly and yearly rules, the original day/month from `dtstart` remains the
anchor. The search is capped at 50 years. More advanced RRULE features are ignored.

Timezone resolution follows this precedence:

1. A named timezone in the quest schedule.
2. The user's per-domain timezone when the schedule says `local` or leaves it empty.
3. UTC as the ultimate fallback.

Due timestamps are persisted in UTC. Daily draw date keys and habit period keys use
the user-domain timezone. Invalid named timezones fail queue construction.

Imported Org repeater modes are preserved when advancing a regular schedule:

| Mode | Current behavior after completion/skip |
| --- | --- |
| `+` | Advance exactly one occurrence from the previous due time. A very overdue quest can remain overdue and require repeated actions to catch up. |
| `++` | Catch up to the first authored occurrence after the action/completion time. |
| `.+` | Add one interval to the completion date while retaining the authored clock time; the original weekday/day-of-month anchor is ignored. |
| absent/other | Same catch-up behavior as `++`. |

The Org bridge maps a nonrepeating active timestamp to `todo`, an exact daily repeater
to the daily pool, and other repeaters to `habit`; a local `:habit:` tag forces habit
semantics. Version children and authored schedule ownership are described in
[`ORG_ROAM_FIELD_OWNERSHIP.md`](ORG_ROAM_FIELD_OWNERSHIP.md#quest-nodes).

## 7. Habit-specific state

Completing a `kind == habit` quest increments the current period count. The streak
increments once when that count first crosses `requiredCompletionsPerPeriod`. If the
streak reaches `consecutivePeriodsToAutoDeactivate > 0`, the quest is deactivated,
`nextDueAt` is cleared, and an additional auto-generated `deactivated` event is
attempted.

On a period-key change, the prior streak resets to zero if the previous period missed
its required count, then the period count resets. Despite the schedule having a
`period` field, the current implementation always uses the user's **calendar day** as
the period key; `period` is not read. Habit completion requirements do not themselves
hold a quest in the queue—the RRULE still controls each due occurrence. Skip does not
increment a count or streak. Reactivation retains existing streak/counter state.

See [`ensureHabitPeriod`](../server/services/survey_service.go#L401-L415) and the habit
completion branch in [`ApplyEvent`](../server/services/survey_service.go#L573-L620).

## 8. Actions and their queue effects

The supported client event names are `completed`, `skipped`, `snoozed`, `deactivated`,
`reactivated`, and `version_swapped`.

| Event | State effect | Effective regular-queue result |
| --- | --- | --- |
| `completed` | Sets `lastCompletedAt`, clears snooze, updates habit state, and computes the next recurrence; a finished one-off gets null due | Removed until the next due time, unless strict `+` advances to another already-overdue occurrence |
| `skipped` | Computes the next recurrence without setting completion or clearing habit state | Normally removed until the next due time; a one-off normally gets null due |
| `snoozed` | If payload contains a valid RFC3339 `snoozedUntil`, sets both snooze and next due to it | Removed until that instant |
| `deactivated` | Sets inactive and clears next due | Removed |
| `reactivated` | Sets active and computes another due time | Returns when that computed time is due |
| `version_swapped` | Event log only | No effect |

`defaultSnoozeMinutes` in an RRULE schedule is not used by the server. The current full
Survey UI always constructs either a 2-hour or 1-day timestamp itself.

An API caller may provide `happenedAt`; scheduling uses that client-supplied timestamp.
The handler verifies domain/quest visibility and verifies that a supplied version
belongs to the quest. Event posting is throttled to 60 requests per minute per abuse
limiter scope ([routes](../server/main.go#L472-L482)). It does not require the quest to
be active, due, or present in the current queue, and there is no idempotency key: every
accepted request appends another event and applies its transition again.

## 9. Relations: source vs. definition vs. exercise vs. quest

There is **no selection, eligibility, ordering, or propagation difference** among the
four possible outgoing target types.

| Quest points to… | Queue effect | Returned behavior |
| --- | --- | --- |
| Source | None | Navigation reference `{nodeType, nodeId, code}` |
| Definition | None; SRS status and due state are not consulted | Same navigation reference |
| Exercise | None; solve state and prerequisites are not consulted | Same navigation reference |
| Another quest | None; no dependency, chaining, activation, completion, or recursive expansion | Same navigation reference |

Only **outgoing** rows with the selected quest as `from` are considered. Incoming links
to a quest are ignored by the survey queue. For the randomly selected version, the
server combines relations with these context keys:

- empty context (quest-global);
- `content-import` (imported and effectively quest-global here); and
- `quest_version:<selectedVersionId>` (version-specific UI-authored links).

The queue returns the target type, numeric ID, and resolved domain code, but omits the
stored `relationType`; the Survey UI displays each as a navigation button. Switching
versions reloads the relevant set for the new version. Relation row order is also
unspecified. See [`ListQuestRelevant`](../server/dao/relation_dao.go#L68-L77) and
[`getRelevantNodes`](../server/services/survey_service.go#L298-L321).

The deduplication key includes `relationType` even though the response omits it, so the
same target can appear more than once when connected by multiple relation types.

## 10. Current implementation gaps and specification decisions

These are observed behaviors, not recommendations silently inferred from names:

1. **No deterministic regular ordering.** There is no explicit tie-breaker or priority
   at all, and regular items always outrank the daily segment merely because of append
   order.
2. **Daily actions do not consume today's item.** Once a daily draw exists,
   `queueFromDraw` does not recheck `active`, `nextDueAt`, snooze, completion, skip, or
   cooldown. Completing, skipping, snoozing, or deactivating a daily item and refreshing
   therefore returns that item again for the rest of the day. It may now have null
   `nextDueAt`, but it remains counted as due.
3. **Daily schedule timing is ignored.** A daily quest can be drawn before its
   `dtstart`; its RRULE, repeater mode, and own timezone do not gate the draw.
4. **Daily draw persistence is best-effort.** The create error is ignored. Concurrent
   first requests can calculate different random selections; the database uniqueness
   constraint preserves at most one row, but a losing request may still return its
   unpersisted selection.
5. **Version choice is not stable.** Queue polling can change the selected version and
   its related-node context without any user action.
6. **`isOverdue` does not distinguish due-now from overdue.** It is true whenever
   `nextDueAt <= time.Now()`, so every scheduled item admitted to the regular queue is
   labeled overdue. Daily items normally have null due and report false.
7. **The queue GET is state-mutating.** It creates settings/state rows, initializes due
   dates, updates `lastPresentedAt`, creates daily draws, updates cooldown timestamps,
   and randomly selects versions. `/survey/.../stats` calls the same routine, so a stats
   read has the same effects. The graph also polls the queue every 60 seconds.
8. **Schedule edits do not move an already-due regular quest.** The sticky-due rule
   preserves the old timestamp until an explicit action. A daily draw likewise does not
   change after a schedule/settings edit that day.
9. **Habit `period` is ignored.** All streak periods are calendar days, regardless of
   the field's value.
10. **Event validation and atomicity are loose.** The server does not whitelist event
    strings; an unknown type is logged with no state transition. Invalid snooze payloads
    are also logged successfully with no transition. The primary event is inserted
    before schedule parsing/state persistence and without a transaction, so a later
    failure can leave an event whose state change did not happen.
11. **RRULE support is intentionally partial.** Unsupported fields are ignored and an
    unknown frequency falls back to daily rather than being rejected.
12. **Kind/schedule consistency depends on the creation path.** Live imports validate
    it; ordinary HTTP create/update does not. Queue branching uses `quest.kind`, while
    due calculation uses `schedule.type`, so mismatched data can behave inconsistently.
13. **First presentation bypasses recurrence exclusions.** A never-completed regular
    quest is initialized directly to `dtstart`; that initialization does not first
    check `EXDATE`, `RDATE`, `COUNT`, or `UNTIL`. Those fields participate only when
    calculating the following occurrence.
14. **Daily settings are not range-validated.** A nonpositive limit unexpectedly means
    one rather than zero, and negative cooldown values make quests immediately
    eligible.

These points should be treated as explicit choices in a new survey-queue specification:
preserve them, replace them, or define migration/compatibility behavior for them.

## 11. Client-visible behavior

- The graph fetches the queue on load and every 60 seconds. A quest node is highlighted
  due when its code is in the latest queue snapshot; this makes daily drawn quests look
  due even though they have no `nextDueAt`.
- A notification sound can play when a quest ID appears that was absent from the prior
  snapshot.
- The badge/count is simply `queue.length`. `/survey/domains/:id/stats` similarly
  returns `{"dueQuests": len(queue)}` rather than independent aggregate state.
- The compact dropdown exposes complete only. The full Survey window exposes complete,
  skip, 2-hour/1-day snooze, deactivate, version swap, and relevant-node navigation.
- Neither UI performs additional eligibility filtering or ordering.

Relevant client paths are
[`KnowledgeGraph.refreshSurveyStats`](../client/src/app/components/Graph/KnowledgeGraph.tsx#L1347-L1375),
[`SurveyWindowContent`](../client/src/app/components/Graph/windows/SurveyWindowContent.tsx),
and the [`TopControls` queue](../client/src/app/components/Graph/panels/TopControls.tsx#L355-L428).

## 12. Implementation map and verification

Primary sources inspected:

- Queue construction and event transitions:
  [`server/services/survey_service.go`](../server/services/survey_service.go)
- RRULE, Org repeater, timezone, and cooldown helpers:
  [`server/services/quest_schedule.go`](../server/services/quest_schedule.go)
- Quest persistence and database query ordering:
  [`server/dao/quest_dao.go`](../server/dao/quest_dao.go)
- Relation contexts:
  [`server/dao/relation_dao.go`](../server/dao/relation_dao.go)
- Models and persisted fields:
  [`server/models/quest.go`](../server/models/quest.go),
  [`server/models/user_daily_quest_draw.go`](../server/models/user_daily_quest_draw.go), and
  [`server/models/user_domain_settings.go`](../server/models/user_domain_settings.go)
- Access and event-version validation:
  [`server/handlers/survey_handler.go`](../server/handlers/survey_handler.go)
- Quest CRUD behavior:
  [`server/handlers/quest_handler.go`](../server/handlers/quest_handler.go)
- Database constraints/defaults:
  [`db/init-scripts/init-sql.sql`](../db/init-scripts/init-sql.sql#L281-L398)

Existing automated coverage is narrow: schedule tests currently verify Org `+`/`++`/`.+`
semantics and timezone fallback; DAO tests verify idempotent user-state creation. There
are no direct tests fixing queue ordering, daily consumption, persisted-draw replay,
version randomness, or relation target behavior as a contractual protocol. Those areas
will need specification-level examples and tests when the new rules are stated.
