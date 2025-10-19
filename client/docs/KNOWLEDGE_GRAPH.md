Knowledge Graph Architecture and Maintenance Guide (Effect‑Free)
================================================================

Audience: contributors working on the graph UI, SRS integration, and node CRUD flows.

This document captures critical, non‑negotiable behaviors and patterns that must be preserved when changing the knowledge graph and related components. It also explains the mechanics of how the system works today, and gives practical guardrails for future work to avoid re‑introducing old bugs and regressions.

Contents
- Design Principles (Must‑Keep)
- Architecture Overview
- Orchestration (No useEffect)
- Mechanics and Data Flow
- Positions and Physics (No Drift)
- Links and Weights (No Missing/Defaulted Links)
- Status Propagation (Minimal Updates)
- Node Creation/Editing (Surgical Updates)
- Rendering & Labels (Crisp, No Flicker)
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
Core files and roles (updated):

- `KnowledgeGraph.tsx`
  - Orchestrates data loading and graph lifecycle via a small controller (no `useEffect`).
  - Hooks:
    - `useGraphStructure`: builds `Map<string, GraphNodeCore>` and `Map<string, GraphLinkCore>` from domain data.
    - `useGraphMetadata`: produces `Map<string, NodeMetadata>` (visual/state properties).
    - `useStableGraph`: performs in‑place structural diffs and updates metadata without rebuilding arrays. Exposes `structureVersion` and `requiresPhysicsReset`.
  - Uses `PositionManager` to preserve/apply positions; avoids mass extract/apply on small edits.

- `utils/GraphLifecycle.ts` (new)
  - Centralizes side‑effects (domain load, enrollment checks, focusing freshly created nodes, credit clear), scheduled with `setTimeout(0)` to avoid React’s “setState during render” warnings.

- `utils/GraphContainer.tsx`
  - Effect‑free renderer around `react-force-graph-2d`. Accepts `structureVersion` and only changes `graphData` when real structural diffs occur.
  - Uses a per‑node label bitmap cache and a concurrency‑limited renderer to avoid flicker.

- `utils/PositionManager.ts`
  - Seeds x/y from backend; pins only on user drag; provides saved positions for new nodes.

- `components/CreditFlowOverlay.tsx`
  - Effect‑free overlay lifecycle class that dedupes animations, converts coords, and commits state outside render.

- `SubjectMatterGraph.tsx`
  - Effect‑free small lifecycle for domain list viz (fetch once, measure container with `ResizeObserver`, initial fit/resume).

- Windows & panels: `DetailWindowContent.tsx`, `ReviewWindowContent.tsx`, `NodeCreationModal.tsx`, etc.
  - Continue to call surgical update functions; window opens/focus actions are deferred by `GraphLifecycle`.

Orchestration (No useEffect)
----------------------------
- `GraphLifecycle.tick(snapshot)` runs every render but schedules side‑effects with `setTimeout(0)`:
  - Domain load and enrollment checks are deferred; never call `dispatch`/setState during `KnowledgeGraphInner` render.
  - Newly created node focus (opens detail window via `UIProvider`) is also deferred.
  - Credit‑flow cleanup uses timers managed internally.
- `CreditFlowOverlay` has a tiny class that dedupes animations and defers state commits; no effects.
- `SubjectMatterGraph` uses a small class to fetch domains and attach/detach `ResizeObserver` without `useEffect`.

Mechanics and Data Flow
-----------------------
Initial load
1) Domain data (definitions/exercises) loads (with `prerequisites` and `prerequisiteWeights`).
2) `useGraphStructure` builds a structure map (two‑pass for definitions to ensure endpoints exist).
3) `useGraphMetadata` builds metadata. Hover/selection does not affect metadata version to avoid hover‑triggered updates.
4) `useStableGraph` performs surgical diffs:
   - Always updates metadata in place (no array replacement).
   - On structural diffs, mutates arrays in place: adds/removes only what changed and updates link weights.
   - Increments `structureVersion` so `GraphContainer` digests changes without reheating physics in small edits.
   - Only requests physics reset (`requiresPhysicsReset`) for removals or larger batch additions.

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
- Keep arrays stable; mutate in place. `structureVersion` controls when `graphData` reference changes.
- Never depend on hover/selection in metadata calculations; draw highlights only in the canvas.
- Labels:
  - All labels render via MathJax → SVG → Image at device pixel ratio; concurrency‑limited queue prevents main‑thread stalls.
  - Per‑node label cache (`__labelCache`) avoids transient misses during redraws.
- GraphContainer never uses `useEffect`; it derives memoized inputs and schedules a single RAF refresh when labels finish rendering.

Do’s and Don’ts (Regression Guardrails)
--------------------------------------
Do:
- Maintain the structure/metadata split; update metadata in place.
- Use two‑pass build for definition links and guard both endpoints.
- Keep node code as the only graph ID.
- Seed x/y from backend, but only fix nodes on user drag.
- After create/edit, use the API payload to perform a surgical update.
- Defer any UI/state updates from lifecycle controllers (not inside render).

Don’t:
- Don’t use `useEffect` in the core graph modules; use lifecycle controllers.
- Don’t rebuild `graphData` or reset physics on metadata‑only changes or hover.
- Don’t create links before both endpoints exist.
- Don’t fetch after creation if the payload is already available.
- Don’t convert difficulty to string or code to numeric IDs anywhere in the graph.

Safe Change Recipes
-------------------
1) Changing how weights render:
   - Update canvas drawing only (link width/color functions). Do not rebuild arrays; rely on in‑place weight updates.

2) Adding a new node visual property (e.g., tags):
   - Extend `NodeMetadata`; compute it in `useGraphMetadata`; draw it in `GraphContainer`.
   - Keep arrays stable; do not change `graphData` unless topology changes.

3) New import/export fields:
   - Extend backend structs and FE types. Ensure prerequisite weights and positions remain intact.

4) Adjusting positions logic:
   - Do not fix from backend; only fix on drag via `PositionManager.fixPosition`.
   - Avoid writing to positions on hover or metadata changes.

5) Adding new lifecycle side‑effects (e.g., analytics on graph load):
   - Add to `GraphLifecycle` and schedule with `setTimeout(0)`; never call `dispatch`/setState during render.

6) Editing structural updates (create/remove nodes/links):
   - Use surgical mutations in `useStableGraph`; bump `structureVersion` only when topology changes; set `requiresPhysicsReset` for removals or large batches.

Test Checklist (Manual QA)
--------------------------
- Refresh page: nodes appear at saved positions; links show correct weights.
- Hover/unhover any node repeatedly: no node drifts, graphData is not replaced.
- Create a definition and link it: link appears instantly; no refresh needed.
- Edit link weights: link widths/opacity update immediately without layout jump.
- Mark node grasped/tackling: statuses repaint across related nodes; no physics reset.
- Import domain JSON with weights: weights preserved; export reproduces weights.
 - Create a single node or add one link in large graphs: no physics reset; labels do not flash; layout remains stable.

Rendering & Labels (Crisp, No Flicker)
--------------------------------------
- Graph node/canvas labels continue to render via MathJax → SVG → Image at device pixel ratio. This path remains authoritative for label quality and zoom behavior.
- Rendering is concurrency‑limited to prevent blocking; completed labels trigger a single RAF refresh.
- Per‑node label bitmap cache avoids flicker when the canvas redraws (e.g., during hover).

Markdown + KaTeX Rendering (Windows, Panels)
--------------------------------------------
- User‑authored rich text fields (definition descriptions, exercise statements/solutions/hints/notes, review views, panel and window titles) now render as GitHub‑style Markdown with math via KaTeX.
- Implementation:
  - react-markdown + remark-gfm + remark-math + rehype-katex
  - Raw HTML is disabled (safe by default). Code/pre blocks are not math‑processed.
  - External links open in a new tab and use rel="noopener noreferrer".
  - Entry points: `MarkdownKatex` (block) and `InlineMarkdownKatex` (inline) in `src/app/components/core/MarkdownKatex.tsx`.
- Scope of this change: windows and panels. The graph label pipeline remains MathJax→SVG, unchanged.

TeX Macros (Cross‑engine Behavior)
----------------------------------
- “Macros” are TeX command shortcuts (e.g., `\RR` → `\mathbb{R}`). We must keep KaTeX (text) and MathJax (graph labels) in agreement so the same source renders identically.
- Where to configure:
  - KaTeX: pass a `macros` map to rehype-katex (e.g., `{ \\RR: "\\mathbb{R}", \\vect: "\\mathbf{#1}" }`).
  - MathJax: define the same macros in the MathJax config under `tex.macros`.
- Recommendation:
  - Define a single shared macro object in a small module (e.g., `core/texMacros.ts`) and import it in both KaTeX and MathJax setups to avoid drift.
  - Start with common set: `\\NN, \\ZZ, \\QQ, \\RR, \\CC, \\vect{#1} → \\mathbf{#1}, \\abs{#1} → \\left|#1\\right|, \\norm{#1} → \\left\\lVert #1 \\right\\rVert, \\set{#1} → \\left\\{ #1 \\right\\}, \\ceil{#1}, \\floor{#1}`.
  - Prefer KaTeX‑compatible commands where possible; if a macro uses a MathJax‑only package, provide a KaTeX equivalent or avoid it in user content.

Typography (Prose) Theming
--------------------------
- We can enable Tailwind Typography (`@tailwindcss/typography`) to get GitHub‑like defaults and then theme them.
- Controls you can tune:
  - Size variants: `prose-sm`, `prose`, `prose-lg` per container.
  - Colors: `prose-zinc`, `prose-slate`, custom via CSS variables or Tailwind theme extension.
  - Element spacing: override specific selectors (e.g., `.prose p`, `.prose h1`, `.prose pre code`).
  - Code blocks: background, border, font via utility classes on `pre code` wrapper in `MarkdownKatex`.
  - Tables: wrap in `overflow-x-auto`, tune borders/cell padding.
- Current state: prose is optional in `MarkdownKatex` (`prose` prop). We kept minimal styling; enabling typography is a non‑breaking toggle per view.

Interactions With Other Components
----------------------------------
- `UIProvider` windows are opened/focused via `GraphLifecycle` using deferred calls to avoid render‑time updates.
- `SRSContext` provides progress and credit animations; the overlay consumes animations effect‑free and prunes particles.
- `NodeCreationModal`/`DetailWindowContent` perform surgical updates; `useStableGraph` picks them up without full rebuilds.
