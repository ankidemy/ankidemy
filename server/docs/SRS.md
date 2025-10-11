# SRS Credit Mechanics

This document explains how the Advanced SRS credit system works in this project. It is implementation-accurate to the code under `server/services` as of this commit.

## Overview
- Nodes: definitions and exercises connected by weighted prerequisite edges in `node_prerequisites`.
- Progress: per-user in `user_node_progress` with status, SM‑2 parameters, and `accumulatedCredit`.
- Reviews: explicit (user action) and implicit (auto-propagated).

## Propagation Rules
- Direction:
  - Success = true → propagate to prerequisites (upstream).
  - Success = false → propagate to dependents (downstream).
- Traversal: BFS only. Nearest nodes are processed first.
- Single contribution per node per review: if multiple shortest paths reach the same node, apply exactly one contribution (the one with the largest absolute path weight). No intra‑review multi-parent summation.
- Start node: receives only explicit +1.0; never gets implicit, even in cycles.

## Amount per Node
- Each edge has a `weight` (default 1.0). Path weight = product of edge weights along the path.
- Credit per node = `pathWeight / (graphDistance + 1)` where immediate neighbors use denominator 2.
- Sign: negative on failure (downstream propagation).
- Limits: ignore tiny amounts `|credit| < 0.01` and cap BFS at max distance 6.

## Accumulation & Reset
- `accumulatedCredit` is clamped to `[-1.0, +1.0]` and accumulates across multiple reviews within a rolling 12‑hour window.
- Reset policy: if more than 12 hours have elapsed since the last update to that node’s progress, reset `accumulatedCredit` and `creditPostponed` before applying new implicit credit.
- Rationale: prevents long‑term farming while avoiding calendar-day pitfalls for early/late study sessions.

## Threshold Effects
- At `+1.0`: postpone — treat like a correct review for scheduling (compute next review via SM‑2 with a “good” default), and set `creditPostponed = true`.
- At `-1.0`: anticipate — set `nextReview = now` so it becomes due immediately.

## Interaction with SM‑2 and Status
- Explicit reviews update SM‑2 (`easinessFactor`, `intervalDays`, `repetitions`) and set `lastReview`/`nextReview`.
- Implicit credit never changes SM‑2 parameters directly; it only influences scheduling via postpone/anticipate.
- Credits apply only to nodes with status `grasped`.

## Ordering (Optimization)
- When returning due items, the system simulates positive propagation to other due nodes and orders the list by:
  1) Higher total positive impact on other due nodes, 2) tie‑break by distance‑from‑root.

## Data & APIs
- Tables: `node_prerequisites`, `user_node_progress`, `review_history`, `study_sessions`, `session_reviews`.
- Core code: `services/srs_algorithms.go`, `services/srs_service.go`, `services/srs_algorithms_test.go`.
- Endpoints: see `docs/API.md` → Advanced SRS.

## Invariants & Safeguards
- One update per node per review (defensive dedup in service layer).
- Start node never receives implicit credit.
- Clamp credits to `[-1, +1]`; ignore tiny amounts; cap traversal depth.
- BFS assures nearer nodes are credited before farther ones.

## Example Flow
1. User correctly reviews node A (explicit +1.0 to A).
2. BFS propagates to prerequisites: immediate neighbors receive `weight/2`; deeper nodes receive `pathWeight / (distance + 1)`.
3. If a shared ancestor is reachable via multiple shortest paths, it receives a single contribution (largest |pathWeight|), not the sum.
4. `accumulatedCredit` increases within the 12‑hour window; at +1.0 → postpone next review; at −1.0 → due now.
