Knowledge Graph Architecture and Maintenance Guide
=================================================

Audience: contributors working on the graph UI, SRS integration, and node CRUD flows.

This document captures critical, non‑negotiable behaviors and patterns that must be preserved when changing the knowledge graph and related components. It also explains the mechanics of how the system works today, and gives practical guardrails for future work to avoid re‑introducing old bugs and regressions.

Contents
- Design Principles (Must‑Keep)
- Architecture Overview
- Mechanics and Data Flow
- Positions and Physics (No Drift)
- Links and Weights (No Missing/Defaulted Links)
- Status Propagation (Minimal Updates)
- Node Creation/Editing (Surgical Updates)
- Type Invariants (code, difficulty, weights)
- Import/Export (with weights)
- Performance and React/d3 Interop
- Do’s and Don’ts (Regression Guardrails)
- Safe Change Recipes
- Test Checklist (Manual QA)

Design Principles (Must‑Keep)
-----------------------------
1) Minimal structural updates
   - Only rebuild the underlying graph when topology changes (nodes/links added/removed or endpoints change).
   - All other updates (status, name, color, weight, position application) must update in place, not via a full rebuild.

2) Structure vs. metadata separation
   - Structure: the set of nodes and links (their IDs and endpoints).
   - Metadata: visual and state properties (status, colors, names, weights, positions).
   - Structure changes reset physics; metadata changes never reheat the simulation.

3) Codes are IDs
   - Node identifiers in the graph are the node codes (human‑readable strings). Never use database numeric IDs as graph IDs.

4) No hover drift
   - Hovering must not move nodes. The simulation must not be re‑initialized on hover or any metadata‑only update.

5) Immediate, surgical feedback
   - After creating or editing nodes/links, changes should appear instantly without a full page refresh.

Architecture Overview
---------------------
Core files and roles:

- KnowledgeGraph.tsx
  - Orchestrates data loading, separates structure vs metadata, wires SRS context, and provides “surgical” updates.
  - Hooks:
    - useGraphStructure: builds Map<string, GraphNodeCore> and Map<string, GraphLinkCore> from domain data.
    - useGraphMetadata: produces Map<string, NodeMetadata> for visual & state properties.
    - useStableGraph: merges structure + metadata into stable arrays and applies updates in place.
  - Uses PositionManager to preserve/apply positions across rebuilds.

- utils/GraphContainer.tsx
  - Pure renderer around react‑force‑graph‑2d with memoized rendering and custom canvas drawing.
  - Must not replace graphData for metadata‑only changes (prevents reheats on hover).

- utils/PositionManager.ts
  - Extracts/saves positions and applies them back after structural rebuilds.
  - Only the user’s drag should fix nodes (fx/fy). Backend positions seed x/y only (no pinning).

- windows/DetailWindowContent.tsx, details/NodeEditForm.tsx, NodeCreationModal.tsx
  - Editing/creation UIs that must post data in a way that allows immediate surgical updates without full reloads.

Mechanics and Data Flow
-----------------------
Initial load
1) Domain data (definitions/exercises) is loaded (with prerequisites and prerequisiteWeights).
2) useGraphStructure builds a structure map:
   - Definitions: first add all nodes, then add links (requires both endpoints to exist).
   - Exercises: add nodes (practice mode only) then links from definition prerequisites.
   - Structure.version changes only when topology changes; weight changes are tracked but do not bump version.
3) useGraphMetadata builds metadata (status, colors, names, positions) and bumps a metadata version.
4) useStableGraph
   - If structure.version changed: rebuild arrays, apply saved positions, mark unstable.
   - Else: update node/links in place (no physics reset).

Positions and Physics (No Drift)
--------------------------------
- Backend positions (xPosition, yPosition) are seeds for x/y ONLY. Never set fx/fy from backend.
- Nodes become fixed ONLY after a user drag (PositionManager.fixPosition).
- GraphContainer must not replace graphData when only metadata changes; doing so reheats the sim and causes drift.
- Hover should not change array references or pinning; labels and highlights are drawn without perturbing positions.

Links and Weights (No Missing/Defaulted Links)
---------------------------------------------
- Always add definition nodes before creating definition links (two‑pass build) and guard with “both endpoints exist”.
- Exercise links are guarded the same way.
- Link weights come from prerequisiteWeights; when only weights change:
  - useGraphStructure updates weight values but does not bump structure.version.
  - useStableGraph copies new weights into existing links in place.

Status Propagation (Minimal Updates)
-----------------------------------
- The SRS backend propagates statuses (e.g., grasped upstream, tackling downstream).
- On status change, SRSContext reloads domain progress; useGraphMetadata changes; useStableGraph updates nodes in place.
- No structural reset, no layout jump, no hover drift.

Node Creation/Editing (Surgical Updates)
---------------------------------------
- NodeCreationModal forwards the created API payload to KnowledgeGraph (avoid an extra fetch).
- KnowledgeGraph inserts only the new node and its links into the current structure state.
- Node edit (detail window) updates only the edited node; structure/metadata hooks pick up changes and apply them in place.

Type Invariants (code, difficulty, weights)
-------------------------------------------
- code: string (graph IDs)
- difficulty: number (1–7) everywhere between FE/BE
- prerequisiteWeights: number in (0, 1], clamped server‑side

Import/Export (with weights)
----------------------------
- Domain export/import must include prerequisiteWeights for definitions and exercises.
- When importing, code→ID mapping is used to apply weights; values are clamped to [0.01, 1.0].

Performance and React/d3 Interop
--------------------------------
- Keep structure arrays stable between topology changes; update metadata in place.
- Avoid re‑creating large arrays and objects unnecessarily.
- Only trigger Kapsule’s digest on structural changes (graphNodes/graphLinks array reference changes).

Do’s and Don’ts (Regression Guardrails)
--------------------------------------
Do:
- Maintain the structure/metadata split and update in place for metadata changes.
- Use two‑pass build for definition links and guard both endpoints.
- Keep node code as the only graph ID.
- Seed x/y from backend, but only fix nodes on user drag.
- After create/edit, use the API payload to perform a surgical update.

Don’t:
- Don’t set fx/fy from backend positions (causes “pursuing node” drift bugs).
- Don’t rebuild graphData on hover or metadata‑only changes (reheats simulation).
- Don’t create links before both endpoints are in the node map.
- Don’t fetch after creation if the payload is already available (causes link delays/races).
- Don’t convert difficulty to string or code to numeric IDs anywhere in the graph.

Safe Change Recipes
-------------------
1) Changing how weights render:
   - Update canvas drawing only. Ensure link.weight is respected; do not rebuild arrays.

2) Adding a new node visual property (e.g., tags):
   - Extend NodeMetadata. Update useGraphMetadata to compute it. Update canvas drawing to use it.
   - Ensure GraphContainer does not replace graphData for this change.

3) New import/export fields:
   - Extend server export/import structs and routes; extend DomainExportData; keep weights and positions intact.

4) Adjusting positions logic:
   - If you change how positions are applied, keep the rule: no fx/fy from backend, only on user drag.
   - Verify hover does not trigger any position writes.

Test Checklist (Manual QA)
--------------------------
- Refresh page: nodes appear at saved positions; links show correct weights.
- Hover/unhover any node repeatedly: no node drifts, graphData is not replaced.
- Create a definition and link it: link appears instantly; no refresh needed.
- Edit link weights: link widths/opacity update immediately without layout jump.
- Mark node grasped/tackling: statuses repaint across related nodes; no physics reset.
- Import domain JSON with weights: weights preserved; export reproduces weights.

