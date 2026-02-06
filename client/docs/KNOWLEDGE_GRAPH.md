# Knowledge Graph Architecture

This document describes the current architecture after modularizing `client/src/app/components/Graph/KnowledgeGraph.tsx` into smaller, concern-focused files.

## Goal of This Iteration

This iteration is intentionally about **separation of concerns**, not deep behavioral refactors.

What changed:
- Moved graph model types, low-level graph algorithms, and graph derivation logic out of the monolith component.
- Kept runtime behavior and public UI surface intact.
- Preserved all existing callbacks and feature paths so future refactors can be done incrementally with tests.

## File Map

### Main Orchestrator
- `client/src/app/components/Graph/KnowledgeGraph.tsx`

Responsibility:
- Owns UI state, mode switching, windows, tool actions, CRUD handlers, and event wiring.
- Coordinates data loading and user-driven updates.
- Calls extracted modules for graph-state construction and derived graph projections.

### New Architecture Modules

- `client/src/app/components/Graph/knowledge-graph/types.ts`

Responsibility:
- Internal graph architecture types used by the graph pipeline.
- Structural graph types (`GraphNodeCore`, `GraphLinkCore`, `GraphStructureState`).
- Metadata graph types (`NodeMetadata`, `GraphMetadataState`).
- Frenzy-related local state types.

- `client/src/app/components/Graph/knowledge-graph/graphAlgorithms.ts`

Responsibility:
- Stateless, reusable primitives and identifiers.
- String hashing, SCC utilities, set intersection helpers.
- External/group node id build/parse helpers.
- Frenzy interaction constants and quest type guards.

- `client/src/app/components/Graph/knowledge-graph/graphStateHooks.ts`

Responsibility:
- Core graph pipeline hooks:
  - `useGraphStructure`: builds structural node/link maps from domain data.
  - `useGraphMetadata`: computes display metadata (SRS color/status/name/etc.).
  - `useStableGraph`: performs in-place structural diffing and metadata patching to keep rendering stable.

- `client/src/app/components/Graph/knowledge-graph/graphTransforms.ts`

Responsibility:
- Pure transformation layer used by the orchestrator:
  - external node lookup construction
  - local/full adjacency maps
  - group membership and group summaries
  - grouped graph collapse projection
  - cycle collapse projection for DAG mode
  - quest visibility and highlight projections

- `client/src/app/components/Graph/knowledge-graph/domainDataAdapter.ts`

Responsibility:
- Domain API payload adaptation into graph-ready `GraphData`.
- Relation edge mapping by typed node-id to code lookup.

- `client/src/app/components/Graph/knowledge-graph/frenzyGraphActions.ts`

Responsibility:
- Frenzy node/link action routing logic (link/unlink/delete dispatch).
- Relation-kind resolution (quest/source/prerequisite) for graph interactions.

- `client/src/app/components/Graph/knowledge-graph/helpTopics.ts`
- `client/src/app/components/Graph/knowledge-graph/toolbarUiConfig.ts`

Responsibility:
- Static help topic definitions and selected-topic projection.
- Toolbar label/instruction derivation helpers.

## High-Level Data Flow

1. **Domain payload state** lives in `KnowledgeGraph.tsx` (`currentStructuralGraphData`, groups, external prereqs, etc.).
2. `useGraphStructure(...)` converts payload into structural maps (topology only).
3. `graphTransforms` derives intermediate projections:
   - group collapse
   - cycle collapse
   - final DAG-oriented structure candidate
4. `useGraphMetadata(...)` computes visual metadata from structure + SRS + UI context.
5. `useStableGraph(...)` merges structure + metadata into stable arrays for force graph rendering.
6. Render filters (quest visibility, highlights, selection-aware visibility) are applied before `GraphContainer`.
7. UI actions mutate source state; pipeline recalculates via memoized hooks/functions.
8. Domain payload adaptation and relation reconciliation are handled by `domainDataAdapter` before state hydration.

## Separation Boundaries

### Structural vs Metadata

Structural concerns:
- Node/link existence
- Endpoints, edge kinds, weights
- Group/cycle collapse topology

Metadata concerns:
- Labels, status color, due flags
- Difficulty/name display
- Group label text/count

This separation is enforced by:
- `useGraphStructure` and `graphTransforms` for structure.
- `useGraphMetadata` for display metadata.
- `useStableGraph` for stable in-place application.

### UI/Interaction vs Graph Math

UI/interaction concerns stay in `KnowledgeGraph.tsx`:
- Click/double-click handling
- Frenzy editor and window logic
- Modal/open/close flows
- CRUD operations and toasts

Graph math and topology transforms are now isolated in:
- `graphAlgorithms.ts`
- `graphTransforms.ts`

## Why This Helps Future Refactors

With these boundaries, future work can target smaller areas:

- Graph algorithm changes: `graphAlgorithms.ts` / `graphTransforms.ts`
- Topology construction bugs: `graphStateHooks.ts` (`useGraphStructure`)
- Rendering drift/physics issues: `useStableGraph`
- Metadata/status rendering bugs: `useGraphMetadata`
- UI behavior bugs: `KnowledgeGraph.tsx` handlers and windows

This avoids editing unrelated logic in a single 8k+ file for every change.

## Practical Change Guide

### Add a new structural edge type

Update in order:
1. `useGraphStructure` edge creation
2. Group/cycle aggregation in `graphTransforms` (if collapse should include it)
3. Any UI affordance in `KnowledgeGraph.tsx`

### Change group or cycle collapse behavior

Update in order:
1. `buildGroupMembersById` / `buildGroupedGraphStructure`
2. `buildCycleGroups` / `buildDagGraphStructure`
3. Validate UI interactions still map to underlying node ids correctly

### Change node visual metadata

Update in order:
1. `NodeMetadata` type in `types.ts`
2. `useGraphMetadata`
3. Any renderer usage in `GraphContainer` / tool panels

## Verified in This Iteration

- TypeScript compilation succeeded with:

```bash
cd client
npx tsc --noEmit
```

- KnowledgeGraph regression harness succeeded with:

```bash
cd client
npm run test:kg
```

## Notes

- `next lint` currently reports many pre-existing repository-wide issues unrelated to this extraction.
- This iteration deliberately avoids broad lint cleanup or functional rewrites to reduce regression risk.
