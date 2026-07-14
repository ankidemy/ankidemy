# SRS & Credit System — Current Behavior

> Updated 2026-07-14 after the modernization refactor (legacy removal, canonical
> terminology, server-side session engine, derived exercise status, backend-enforced
> spacing). This replaces the pre-refactor report and describes the behavior as
> implemented, with file references.

---

## 1. Terminology & data model

**Canonical node types are `definition` and `exercise` — everywhere** (DB strings, API,
client). The historical `meta_definition`/`meta_exercise` spellings and the legacy
per-version node system are gone; a startup migration (`server/dao/migrate_modernize.go`)
converts existing databases in place (renames type strings across all tables, remaps or
deletes version-level graph rows, drops the legacy tables `user_definition_progress`,
`user_exercise_progress`, `session_definitions`, `session_exercises`, and the dead
`is_manual` column). Old export/backup files still import: node types are normalized at
parse time (`import_service.go: canonicalImportNodeType`, `backup_archive.go`).

- A **definition** node is a concept with N *versions* (wordings) in the
  `meta_definitions`/`definitions` tables (Go structs keep their `Meta*` names; only the
  node-type vocabulary changed).
- An **exercise** node is an exercise pool with N *versions* (each with `difficulty` ≥ 1)
  in `meta_exercises`/`exercises`.
- The prerequisite graph (`node_prerequisites`) links nodes with a `weight` ∈ (0, 1].
  Valid pairs: definition→definition, exercise→definition, exercise→exercise. No
  self-loops, no cross-domain edges. The `isManual` flag no longer exists.
- Per-user SRS state lives in `user_node_progress`: status, EF, interval, repetitions,
  last/next review, `blockNegativeUntil`, `accumulatedCredit` ∈ [-1, 1],
  `creditPostponed`, review counters.

## 2. Statuses

`fresh → tackling → grasped → learned`, **user-set on definitions only**.

- **grasped** = "add to review rotation". Setting it backpropagates transitively to all
  definition prerequisites that are fresh/tackling (grasping X implies grasping
  everything below it).
- **tackling** = "still learning, don't review yet". Setting it forward-propagates to all
  definition dependents that are fresh/grasped (can't review what builds on an
  un-grasped base). This lets you switch whole subgraphs in/out of review with one click
  (overconfidence correction in either direction).
- **learned** = retire forever, strictly single-node, reversible any time.
- **fresh** = the default null state.

**Exercise status is derived, never set** (`services/srs_status_derivation.go`; the API
returns 422 on attempts). An exercise takes the status of its **nearest parent
definition** — the closest definition ancestor through prerequisite edges, walking
through exercise chains (BFS level order). Ties at the same distance resolve by priority
**tackling > grasped > learned > fresh**. A learned nearest-parent retires the exercise.
Exercises with no definition ancestor stay fresh. Recomputation happens on every
definition status change (same transaction) and on any prerequisite mutation (for every
user with progress in the domain).

**UI**: definitions are colored by status; exercises are colored by solve state —
**unsolved** (slate) / **tried** (amber: seen but not currently solved) / **solved**
(emerald), doubling as a graph-completion indicator
(`types/srs.ts: exerciseSolveState`, `graphStateHooks.ts`).

## 3. Scheduling (SM-2, per-domain tunable)

`CalculateNextInterval` (`srs_algorithms.go`), quality 0–5, success = quality ≥ 3:

- EF: `EF' = max(minEF, EF + 0.1 − (5−q)(0.08 + 0.02(5−q)))` (every review).
- Failure (q < 3): repetitions → 0, interval = `lapseIntervalDays`.
- Success: rep 1 → `firstIntervalDays`, rep 2 → `secondIntervalDays`, then
  `round(interval × EF)`.
- Final interval = `max(1, round(interval × intervalMultiplier))`, **capped at 366 days**
  so everything is reviewed at least once a year.

**UI grading**: Again = 0 (fail), **Hard = 3 (barely passes)**, Good = 4, Easy = 5.
Success is derived server-side from quality; the client no longer sends a success flag.

Config (`preferences.review.srs`, per user per domain, clamped): `intervalMultiplier`
(0.25–4, default 1), `firstIntervalDays` (default 1), `secondIntervalDays` (default 6),
`lapseIntervalDays` (default 1) — each 1–120 — and `minEasinessFactor` (1.1–2.5, default
1.3).

## 4. Credit propagation

Unchanged mechanics (`srs_algorithms.go`): a **counted** explicit review sends credit
1.0 to the reviewed node and implicit credit `pathWeight / (distance+1)` via BFS —
**success flows down to prerequisites**, **failure flows negative credit up to
dependents**. Direct neighbor at weight 1.0 gets ½. Multiple shortest paths don't
accumulate (max |weight| wins); cutoffs: |credit| < 0.01, distance > 6; cycle-safe.

Application (`srs_service.go: applyCredits`):

- Credits only apply to **grasped** nodes with existing progress rows.
- Already-due nodes reset their accumulated credit first.
- Explicit success arms `blockNegativeUntil = nextReview` (immunity to negative implicit
  credit until then); explicit failure clears it.
- Implicit credit accumulates in [-1, 1] with a 12-hour inactivity reset (anti-farming).
- **Reaching +1.0 postpones at the current interval**: `nextReview = now +
  max(1, intervalDays)` — repetitions, interval and EF are untouched. Implicit credit
  buys time like barely passing; only explicit reviews advance the ladder.
- Reaching −1.0 anticipates: `nextReview = now`.

## 5. Backend-enforced spacing

`POST /api/srs/reviews` and the session engine enforce spacing **server-side**
(`srs_service.go: submitReview`):

- Non-grasped target → **422**.
- **Not due** (nextReview in the future) → *practice*: version outcome stats are
  recorded, **no SRS state changes**, response carries `counted: false`. Repeating a
  card fifty times in a day cannot inflate SRS state, regardless of client behavior.
- Due → full SM-2 + credit propagation + history, `counted: true`.

Version outcome stats are written in exactly one place per grade (no more double
recording).

## 6. Due selection & ordering

Due = grasped ∧ (`next_review` null or ≤ now). `GET /srs/domains/:id/due` orders by
**impact**: the node whose successful review would push the most implicit credit onto
other due nodes goes first (minimum-reviews lever); ties (≤ 0.1) break by deepest
prerequisite chain first.

## 7. Sessions — server-driven engine

Sessions run **entirely server-side** (`services/session_engine.go`); the client
(`ReviewWindowContent.tsx`) only renders the current item and posts grades.

**API**: `POST /srs/sessions` `{domainId, sessionType, mode, order,
exercisesPerDefinition}` → session + first item (with the selected version's content);
`GET /srs/sessions/:id/item` (re-presenting does not re-count "seen");
`POST /srs/sessions/:id/grade` `{quality, skip?, timeTaken}` → next item;
`PUT /srs/sessions/:id/end`. Grading a finished session → 409. Runtime state persists in
`study_sessions.runtime_state` (jsonb).

**Normal mode** (habitual spaced study): queue = due items (impact-ordered), with
fallbacks for practice material. `order: 'foundations'` sorts prerequisite-heavy nodes
first (building knowledge bottom-up when material is new); `'impact'` (default)
maximizes implicit-credit coverage for minimum reviews. Due items persist real SRS
reviews (once per node per session — and the server re-checks due-ness anyway); non-due
items record practice outcomes only. Ends when the queue empties.

**Frenzy mode** (marathon cramming, e.g. pre-exam): runs in **rounds over all grasped
material** and can go forever. Round 1 is foundations-first; later rounds shuffle. The
engine mirrors credit propagation on a session-local credit map: a node reaching +1
drops out of the round, −1 re-queues it; failed items re-queue at the end; skip advances
without stats. **Session-scoped stats**: version selection reads persistent stats *plus*
a session overlay (seen/correct/difficulty ladder), but repeats never write persistent
stats — cramming does not pollute long-term SRS data. The only persistent writes are the
real SRS reviews of items that were due (first grade per node per session).

## 8. Exercise selection & versions

**Which exercises test a definition** (`meta_exercise_service.go`): the exercise must
list the definition as a prerequisite; all its definition prerequisites must be grasped;
all its exercise prerequisites (recursively) must be **currently solved**. Selection
prefers the easiest difficulty tier containing an unsolved exercise, then unseen, then
least-seen, ties random. `exercisesPerDefinition` (preference, default 1) controls how
many attach per definition.

**Solved state expires**: a successful solve arms `solved_until = now + (90 +
rand(1..90)) days` (`user_meta_exercise_stats.solved_until`; existing solves were
backfilled with staggered expiries). After expiry the exercise counts as unsolved again —
re-eligible for selection, preferred as "unsolved", and its UI color drops back — because
the user has probably forgotten it.

**Version selection**: definitions → min seen → max failures → random; exercises →
difficulty ladder (`lastCorrectDifficulty` ratchets up per user per node) → min seen →
random. In normal sessions this uses persistent stats; in frenzy the session overlay is
added on top without persisting.

## 9. Settings summary

Per user per domain (`user_domain_settings`): `timezone`, `dailyQuestLimit`,
`dailyQuestCooldownDays`, and `preferences` JSONB with `review.srs.*` (§3) and
`review.exercisesPerDefinition`. Per session: type (definition/exercise/mixed), mode
(normal/frenzy), order (impact/foundations). Per edge: `weight`. Env:
`SRS_DUE_CACHE_TTL` (20s), `SRS_QUEUE_CACHE_TTL` (15s), `SRS_QUEUE_CACHE_NORMAL_ONLY`
(true).

## 10. Quests (unchanged)

The quest system (`survey_service.go`) is untouched by this refactor: `rrule`, `habit`
(streaks + auto-deactivate) and `daily` (daily_pool draws honoring cooldown + daily
limit, persisted per day) schedules; events completed/skipped/snoozed/deactivated/
reactivated. Quest node-type strings remain `meta_quest` (no legacy duality existed).

## 11. What was removed in the modernization

- The entire legacy per-version SRS (old `/api/progress/*` review endpoints, legacy
  session detail endpoints, `dao/progress.go` SM-2, Again/Hard/Good/Easy → 0/3/4/5
  mapping, `learned` boolean) — only domain enrollment remains.
- All meta_*/plain type dualities, normalization shims (`toProgressType`/`toGraphType`)
  and graph-key fallbacks.
- `isManual` on prerequisites.
- `ApplyPartialCredit` (dead code).
- Client-side frenzy simulation, client-side stats recording
  (`recordMetaExerciseOutcome` calls), client-side once-per-session persistence rules —
  all replaced by the server engine.
- Version-level graph writes from definition/exercise version CRUD (versions are content,
  not nodes).
- `frontend_spec.md` (stale migration spec).

## 12. Verification (2026-07-14)

- `go build`, `go vet`, full `go test ./...` (in Docker: handlers, services, middleware)
  pass; client `tsc --noEmit`, `npm run test:kg` (25/25) and `next build` pass.
- End-to-end smoke against a fresh Postgres + tutorial domain verified: canonical
  prerequisite payloads; grasped backpropagation; exercise status derivation (grasp defs
  → exercises grasped & due; tackling def → its exercises tackling); 422 on manual
  exercise status and non-grasped reviews; normal session lifecycle with counted due
  reviews + credit flow, then `counted: false` on same-day repeats; 409 grading a
  finished session; frenzy rounds with requeue-on-fail, skip, and round advancement;
  solved state with expiry exposed in domain progress.
