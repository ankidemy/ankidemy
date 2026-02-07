# SRS Due + Queue Performance Optimization Specification

## Document Metadata

- Owner: Backend/Frontend Platform
- Status: Proposed implementation plan
- Last Updated: 2026-02-07
- Primary audience: Engineers implementing and reviewing performance improvements for SRS endpoints
- Scope: `GET /api/srs/domains/:domainId/due` and `GET /api/srs/domains/:domainId/review-queue`

## 1. Executive Summary

The SRS due endpoint is currently the slowest functional route in regular use, with observed latency around 100-120ms and response payload around 8KB for a single request. The review queue endpoint has additional avoidable latency due to repeated due queries and N+1 style data access patterns.

This specification defines a complete, implementation-ready optimization plan with:

- request shaping (call the heavy endpoints only when needed),
- response shaping (compact payloads for list/preview use cases),
- query/index optimization,
- short-TTL cache with explicit tag invalidation,
- route/stage observability and acceptance criteria,
- phased rollout with risk controls.

The design preserves existing user-facing behavior while reducing total server work, response size, and call frequency.

## 2. Problem Statement

### 2.1 Measured Symptoms

- `GET /api/srs/domains/:domainId/due`:
  - latency: consistently ~100-120ms,
  - payload: around ~8KB,
  - route is frequently called for contexts that only need a count or a lightweight list.
- `GET /api/srs/domains/:domainId/review-queue`:
  - expensive server-side flow caused by repeated calls to due retrieval and per-item lookups.

### 2.2 Why It Happens

1. Heavy payload returned by `/due` even when callers only need badge count or a minimal queue preview.
2. Frontend over-fetching:
   - domain load includes `/due` eagerly,
   - polling refreshes full due list regularly,
   - post-review refresh requests full due list again.
3. Backend queue assembly has avoidable repeated computation:
   - mixed queue calls due retrieval multiple times,
   - per-definition/per-exercise lookups introduce N+1 behavior.
4. No dedicated cache/invalidation strategy yet for `/due` and `/review-queue`.

## 3. Existing System Reference (Current Code Paths)

This section exists so the implementer does not need external context.

### 3.1 Routes

- `GET /api/srs/domains/:domainId/due` -> `srsHandler.GetDueReviews`
  - Route defined in `server/main.go`.
- `GET /api/srs/domains/:domainId/review-queue` -> `srsHandler.GetReviewQueue`
  - Route defined in `server/main.go`.

### 3.2 Backend Call Chain

- Due:
  - Handler: `server/handlers/srs_handler.go` (`GetDueReviews`)
  - Service: `server/services/srs_service.go` (`GetDueReviews`)
  - DAO: `server/dao/srs_dao.go` (`GetDueReviews`)
- Queue:
  - Handler: `server/handlers/srs_handler.go` (`GetReviewQueue`)
  - Service: `server/services/srs_service.go` (`GetReviewQueue`)
  - DAO + helper services:
    - `server/dao/srs_dao.go`
    - `server/services/meta_exercise_service.go`

### 3.3 Relevant Existing Optimization Pattern

A reusable optimization pattern already exists and is documented for notification summaries:

- `server/docs/READ_MODEL_OPTIMIZATION.md`
- `server/services/query_cache.go`
- `server/services/notification_read_model_service.go`
- `server/dao/read_model_event_dao.go`
- `server/dao/user_domain_due_projection_dao.go`

This spec reuses that pattern where appropriate.

### 3.4 Current Frontend Callers

Primary callers that currently trigger full due loads:

- `client/src/contexts/SRSContext.tsx`:
  - domain load flow fetches due list,
  - post-review refresh fetches due list,
  - session start/end refreshes due list.
- `client/src/app/components/Graph/panels/TopControls.tsx`:
  - polling refreshes due list every 60 seconds,
  - opening queue can trigger immediate reload.

Queue consumer:

- `client/src/app/components/Graph/windows/ReviewWindowContent.tsx` uses `getReviewQueue`.

## 4. Goals and Non-Goals

### 4.1 Goals

1. Reduce p95 latency for `/due` from ~100-120ms to <50ms (target), with p50 substantially lower.
2. Reduce `/due` payload size for preview consumers from ~8KB to <=3KB.
3. Reduce unnecessary `/due` call volume by >=70% in normal navigation flows.
4. Reduce `/review-queue` compute/query overhead while preserving queue semantics.
5. Add robust observability to prove improvements and catch regressions.

### 4.2 Non-Goals

1. Changing SRS algorithm logic or learning behavior semantics.
2. Rewriting prerequisite graph logic.
3. Introducing eventual consistency for in-session critical correctness. Cache is short-TTL and explicitly invalidated.

## 5. Functional Requirements

### 5.1 `/due` must support two data views

Add query param:

- `view=full` (default, backward compatible)
- `view=compact` (new)

`view=compact` returns only fields required for queue preview and graph due markers:

- `nodeId`
- `nodeType`
- `nodeCode`
- `nodeName`
- `status`
- `nextReview`
- `isDue`

`view=full` remains existing shape.

### 5.2 Frontend must stop using full `/due` for count-only UI

For due counts/badges, use:

- notification summary domain due counts (preferred),
- fallback to `domainStats.dueReviews` if summary is unavailable.

Full due list retrieval should happen only when:

1. user opens review queue,
2. user starts session,
3. user explicitly requests refresh,
4. logic requires exact ordered list for immediate interaction.

### 5.3 `/review-queue` semantics must remain unchanged

Current due-first and fallback behavior for session types (`definition`, `exercise`, `mixed`) and modes (`normal`, `frenzy`) must be preserved.

Performance changes must be internal (batching, deduping, caching where safe) without altering user-visible queue logic.

## 6. Non-Functional Requirements

### 6.1 Performance Targets

- `/due`:
  - p50 <= 25ms,
  - p95 <= 50ms.
- `/review-queue`:
  - p50 <= 40ms,
  - p95 <= 70ms.
- payload:
  - compact due payload <= 3KB for representative domain sample.

### 6.2 Reliability

- Cache failures must not fail requests.
- On cache miss/failure, load from source and return correct data.

### 6.3 Backward Compatibility

- Existing callers expecting full due shape must keep working.
- Existing route path and response envelope (`{ dueNodes: [...] }`) must remain.

## 7. Detailed Design

## 7.1 Observability First (Phase 0)

Implement before optimization changes to establish baseline and verify improvements.

### Required changes

1. Add DAO/service stage logs for `/due` and `/review-queue`:
   - include `requestId`, route, stage name, and key metadata.
2. Add inline SQL comments for `pg_stat_statements` filtering:
   - `route:/api/srs/domains/:domainId/due stage:<...>`
   - `route:/api/srs/domains/:domainId/review-queue stage:<...>`
3. Extend admin query-stats targeting in `server/handlers/admin_observability_handler.go`:
   - add targets for:
     - `srs_due`
     - `srs_review_queue`

### Suggested stage names

- Due:
  - `fetch_due_rows`
  - `load_prerequisites`
  - `build_graph`
  - `optimize_order`
- Review queue:
  - `load_due_definitions`
  - `load_due_exercises`
  - `load_grasped_fallback`
  - `select_exercises_batch`
  - `assemble_queue`

## 7.2 Frontend Call Governance (Phase 1)

### Current issues to fix

1. Eager due fetch on domain load.
2. periodic full due polling in top controls.
3. repeated full due refresh after each review submission.

### Required behavior changes

1. Domain load should not require full due list unless queue is already visible or active session needs it.
2. Badge count source must be notification summary or domain stats, not `dueReviews.length` from full list.
3. Keep manual refresh action for queue panel, but request compact due view.
4. Keep start-session behavior (must fetch current data), but use compact due if sufficient for UI path.

### Impacted files (expected)

- `client/src/contexts/SRSContext.tsx`
- `client/src/app/components/Graph/panels/TopControls.tsx`
- optionally queue/graph hooks where due list is only used for codes.

## 7.3 Due Response Shaping (Phase 2)

### API contract

`GET /api/srs/domains/:domainId/due?type=<definition|exercise|mixed>&view=<full|compact>`

Response envelope remains:

```json
{
  "dueNodes": []
}
```

### Compact item shape

```json
{
  "nodeId": 123,
  "nodeType": "definition",
  "nodeCode": "DEF_001",
  "nodeName": "Sample",
  "status": "grasped",
  "nextReview": "2026-02-07T12:00:00Z",
  "isDue": true
}
```

### Implementation notes

1. Keep `view=full` as default for compatibility.
2. For compact mode, avoid selecting all `NodeProgress` columns in SQL.
3. Update TypeScript types to support compact response shape where used.

## 7.4 Query and Index Optimization for `/due` (Phase 3)

### SQL-level improvements

1. Avoid duplicated query blocks for mixed mode when possible.
2. Ensure ordering is deterministic and only applied where needed.
3. Return only required columns for compact mode.

### Indexing plan

Add targeted indexes via migration (prefer `CREATE INDEX CONCURRENTLY` in production):

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_unp_due_definition
ON user_node_progress (user_id, next_review, node_id)
WHERE node_type = 'definition' AND status = 'grasped';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_unp_due_exercise
ON user_node_progress (user_id, next_review, node_id)
WHERE node_type = 'exercise' AND status = 'grasped';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meta_definitions_domain_id
ON meta_definitions (domain_id, id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_meta_exercises_domain_id
ON meta_exercises (domain_id, id);
```

Notes:

1. Validate with `EXPLAIN (ANALYZE, BUFFERS)` before and after.
2. Keep existing general indexes; these are targeted for due filters.

## 7.5 Review Queue Optimization (Phase 4)

### Current inefficiencies

1. Mixed queue calls due retrieval multiple times.
2. Exercise due status checks call progress per item (N+1).
3. Exercise selection per definition can cascade multiple queries.

### Required refactor

1. Fetch due definitions and due exercises once per queue request.
2. Load prerequisites once, build graph once if needed.
3. Batch fetch exercise progress for all relevant exercise meta IDs.
4. Batch exercise selection for definition set where possible.
5. Maintain existing queue semantics and ordering rules.

### Suggested internal API additions

In `SRSDao`:

1. `GetDueReviewsCompact(...)` and/or parameterized select mode.
2. `GetUserProgressByNodeIDs(userID, nodeType, []nodeIDs)` for batch lookup.

In `MetaExerciseService`:

1. Add batch selector variant:
   - `SelectExercisesForDefinitions(userID, definitionIDs, perDefinitionCount)`.

## 7.6 Cache Strategy (Phase 5)

Use existing `QueryCacheService` pattern.

### `/due` cache

- Key:
  - `srs:due:user:{userId}:domain:{domainId}:type:{type}:view:{view}:v1`
- TTL:
  - 15-30 seconds
- Tags:
  - `srs:due:user:{userId}:domain:{domainId}`
  - optional `srs:due:user:{userId}`

### `/review-queue` cache

- Key:
  - `srs:queue:user:{userId}:domain:{domainId}:session:{sessionType}:mode:{mode}:ex:{count}:v1`
- TTL:
  - 10-20 seconds for `mode=normal`
- `mode=frenzy`:
  - no cache (preserve variability)
- Tags:
  - `srs:queue:user:{userId}:domain:{domainId}`

### Invalidation rules

Invalidate due + queue tags on any write that changes due/order state:

1. review submission (`SubmitReview`)
2. status update (`UpdateNodeStatus`)
3. prerequisite create/update/delete
4. domain setting changes affecting queue construction (e.g., exercises per definition)
5. node/content mutations that can affect queue composition

Implementation guidance:

1. Add helper methods in SRS service layer:
   - `invalidateDueCache(userID, domainID)`
   - `invalidateQueueCache(userID, domainID)`
2. Trigger invalidation in the same transactional flow where possible; if not possible, execute immediately after successful commit.

## 7.7 Optional Read Model Extension (Phase 6, optional)

If Phase 1-5 does not meet targets, add projection/read-model for precomputed due node IDs per user/domain/type to reduce request-time joins. This is optional and should only be implemented if metrics prove it is required.

## 8. API Contract Updates

## 8.1 `/due` query params

Add:

- `view` (optional): `full` or `compact`, default `full`.

Keep:

- `type` (existing): `definition`, `exercise`, `mixed` (plus existing normalization behavior).

### Backward compatibility

- Existing clients without `view` receive the same payload as today.

## 8.2 Documentation updates required

Update:

- `server/docs/API.md`
- `server/docs/API-cheatsheet.md`
- `server/docs/DB-PROFILING.md` (new filter targets and route-stage comments)

## 9. Testing Plan

## 9.1 Unit tests

1. Handler parameter validation for `view`.
2. DAO compact/full query branch coverage.
3. Queue builder retains current behavior for:
   - definition session due-first fallback,
   - exercise session due-first fallback,
   - mixed session due-first + independent due exercises.

## 9.2 Integration tests

1. `/due` full and compact response correctness.
2. Cache hit/miss behavior and invalidation on writes.
3. Queue response equivalence against baseline semantics.

## 9.3 Performance tests

1. Baseline and post-change route metrics:
   - p50/p95 latency,
   - response bytes,
   - DB execution times.
2. Request volume changes from frontend flow updates.

## 10. Rollout Plan

## 10.1 Phased rollout

1. Phase 0: observability only.
2. Phase 1: frontend call governance.
3. Phase 2: compact `/due` response.
4. Phase 3: query + indexes.
5. Phase 4: queue batching refactor.
6. Phase 5: cache + invalidation.
7. Phase 6: optional read-model extension.

## 10.2 Feature flags (recommended)

- `SRS_DUE_COMPACT_ENABLED` (default true once stable)
- `SRS_DUE_CACHE_TTL` (duration)
- `SRS_QUEUE_CACHE_TTL` (duration)
- `SRS_QUEUE_CACHE_NORMAL_ONLY` (default true)

## 10.3 Rollback strategy

1. Toggle off new cache paths.
2. Toggle off compact mode usage in client.
3. Retain existing full path as safe fallback.

## 11. Acceptance Criteria

All criteria must be met in staging with representative data:

1. `/due` p95 <= 50ms.
2. `/due` compact payload <= 3KB for representative domain.
3. `/due` request rate reduced >=70% for non-session browsing.
4. `/review-queue` p95 <= 70ms.
5. No functional regression in queue order/contents for all session types.
6. Cache invalidation verified for review submission and status updates.

## 12. Risks and Mitigations

1. Risk: stale cache shows outdated due list.
   - Mitigation: short TTL + explicit tag invalidation on writes.
2. Risk: queue semantics accidentally change during batching refactor.
   - Mitigation: golden tests comparing old/new outputs over fixed fixtures.
3. Risk: index creation impacts production performance.
   - Mitigation: create concurrently, off-peak window, monitor locks.
4. Risk: frontend badge counts diverge from queue list.
   - Mitigation: define count source priority and reconciliation rule.

## 13. Implementation Checklist

1. Add route/stage observability for `/due` and `/review-queue`.
2. Add admin query-stat targets for new route filters.
3. Implement `view=compact` for `/due`.
4. Update frontend to use count-only sources by default.
5. Remove eager/polling full due fetches where not required.
6. Add targeted DB indexes and validate plans.
7. Refactor queue assembly to batch due/progress/exercise selection.
8. Add due/queue cache with tag invalidation hooks.
9. Update API and profiling docs.
10. Execute performance validation and compare against baseline.

## 14. Notes on Endpoint Naming

In this codebase, the queue endpoint is currently:

- `GET /api/srs/domains/:domainId/review-queue`

If product/docs still reference `/api/srs/domains/:domainId/queue`, either:

1. update client/docs to canonical `review-queue`, or
2. add a compatibility alias route returning the same payload.

This decision should be made before frontend rollout to avoid split instrumentation and inconsistent usage.
