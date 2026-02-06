# DB Profiling With `pg_stat_statements`

This project now performs best-effort startup enablement for `pg_stat_statements` and exposes an admin API for top-query inspection.

## 1) PostgreSQL Setup

1. Enable preload library in `postgresql.conf`:
   - `shared_preload_libraries = 'pg_stat_statements'`
2. Restart PostgreSQL.
3. Ensure extension exists (startup also attempts this):
   - `CREATE EXTENSION IF NOT EXISTS pg_stat_statements;`

## 2) API Access (Admin)

- Endpoint: `GET /api/admin/db/query-stats`
- Query params:
  - `target`: `all` | `srs_domain_stats` | `domain_invites`
  - `limit`: integer (default `20`, max `200`)
  - `filter`: optional `ILIKE` filter override

Examples:

- `GET /api/admin/db/query-stats?target=srs_domain_stats&limit=25`
- `GET /api/admin/db/query-stats?target=domain_invites&limit=25`
- `GET /api/admin/db/query-stats?filter=%review_history%&limit=50`

Response fields include:
- `totalExecTimeMs`
- `meanExecTimeMs`
- `p95EstExecTimeMs` (estimated as `mean + 1.645 * stddev`)
- `calls`
- `query`

## 3) Route-Focused Notes

### `/api/srs/domains/:domainId/stats`

The DAO SQL includes inline route/stage comments for filtering:
- `route:/api/srs/domains/:domainId/stats`
- stages: `count_nodes`, `status_counts`, `due_count`, `completed_today`, `success_rate`

### `/api/domain-invites`

Primary query table filter:
- `domain_invites`

## 4) Raw SQL (manual)

```sql
SELECT
  COALESCE(queryid::text, '') AS query_id,
  calls,
  ROUND(total_exec_time::numeric, 3) AS total_exec_time_ms,
  ROUND(mean_exec_time::numeric, 3) AS mean_exec_time_ms,
  ROUND((mean_exec_time + (1.645 * COALESCE(stddev_exec_time, 0)))::numeric, 3) AS p95_est_exec_time_ms,
  rows AS total_rows,
  LEFT(REGEXP_REPLACE(query, '\s+', ' ', 'g'), 1200) AS query
FROM pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
  AND query ILIKE '%domain_invites%'
ORDER BY total_exec_time DESC
LIMIT 25;
```
