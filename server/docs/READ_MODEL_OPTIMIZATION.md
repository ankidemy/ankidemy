# Read-Model Optimization Pattern (Redis + Projections + Events)

## Goal

Provide a repeatable way to optimize expensive read paths that currently:

- execute N queries per UI refresh (for example one request per domain),
- recompute the same aggregates repeatedly,
- do not share a cache/invalidation strategy across endpoints.

This document describes the pattern implemented for notifications and how to reuse it for other endpoints.

## Pattern Summary

We use four layers:

1. **Projection table (read model)** for precomputed aggregates.
2. **Durable event queue** to update/invalidate read models asynchronously.
3. **Redis query cache** (key + tag invalidation) for final payloads.
4. **Single summary endpoint** returning only what the UI needs.

This avoids fanout requests and avoids full recomputation on each poll.

## Implemented Example: Notifications

### Problem

`NotificationContext` was polling per-domain stats repeatedly and causing:

- one API call per domain,
- expensive duplicate server work,
- poor scalability for users with many domains.

### New Flow

1. Client calls one endpoint: `GET /api/srs/notifications/summary`.
2. Server serves a cached summary (`QueryCacheService`) keyed by user.
3. Summary reads from `user_domain_due_projections`.
4. If projection rows are stale/missing, server computes only missing domains in grouped SQL and upserts.
5. Writes (`SubmitReview`, `UpdateNodeStatus`, invite/domain-access mutations) enqueue read-model events.
6. Worker consumes events:
   - refreshes per-domain due projections, or
   - invalidates summary cache tags.

## Components Added

### Models

- `read_model_events`
  - Durable queue with dedupe key and retry metadata.
- `user_domain_due_projections`
  - Projection for `(user_id, domain_id) -> due_reviews`.

Code: `server/models/read_models.go`

### DAOs

- `ReadModelEventDAO`
  - deduped enqueue, list-ready, reschedule, delete.
- `UserDomainDueProjectionDAO`
  - notification domain selection,
  - grouped due-count compute,
  - projection upserts.

Code:

- `server/dao/read_model_event_dao.go`
- `server/dao/user_domain_due_projection_dao.go`

### Services

- `QueryCacheService`
  - generic `CacheGetOrLoadJSON`,
  - backend contract: `Get`, `Set`, `InvalidateTag`,
  - Redis backend using key/tag sets for invalidation.
- `NotificationReadModelService`
  - summary builder,
  - event worker loop,
  - event handlers (due refresh, summary invalidation).

Code:

- `server/services/query_cache.go`
- `server/services/notification_read_model_service.go`

### API

- `GET /api/srs/notifications/summary`

Code:

- Route: `server/main.go`
- Handler: `server/handlers/srs_handler.go`

### Write-side Event Hooks

- SRS writes:
  - `SubmitReview`
  - `UpdateNodeStatus`
- Access/invite writes:
  - create/update invite
  - accept/decline invite
  - remove permission
  - enrollment / domain creation paths

These emit events instead of forcing synchronous recomputation.

## Redis Usage

### Config

- `REDIS_ADDR`
- `REDIS_PASSWORD`
- `REDIS_DB`
- `REDIS_CACHE_PREFIX`

### Compose

Redis service is added to `docker-compose.yml` and wired into server environment.

## Reuse Recipe (for future heavy endpoints)

Use this checklist:

1. **Define minimal response contract** (only fields UI needs).
2. **Create projection table** for expensive aggregate(s).
3. **Create read-model events** for all write paths that can affect that response.
4. **Implement projection DAO** with grouped compute and upsert methods.
5. **Implement read-model service**:
   - `GetSummary` (cache read-through),
   - `buildSummary` (projection + stale repair),
   - worker `handleEvent`.
6. **Add single summary endpoint** and move client to it.
7. **Invalidate cache by tag** in event handlers (not TTL-only).
8. **Add observability**:
   - cache hit/miss,
   - event backlog size,
   - event retry counts,
   - projection compute latency.

## Operational Notes

- This architecture prefers eventual consistency for read models.
- Projection updates are asynchronous; summaries may be briefly stale.
- `staleAfter` fallback compute protects against missed events.
- Event dedupe keys avoid unbounded duplicate work bursts.

## Why this is preferred over short-term TTL-only caching

TTL-only caching reduces load temporarily but still couples cost to request frequency.
Projection + events moves heavy work to write-time and background processing, which scales better and is reusable across endpoints.
