# **Frontend Specification — Meta Definition Model Integration**

**Purpose:**
Complete frontend specification aligned with the new backend `meta_definition` model and versioned definitions.
This document defines what to change, how screens behave, the API shapes we call, and the edge cases to handle.

---

## **1. Goals**

* Show `meta_definition` pools on the graph as “definition” nodes; versions live under each pool.
* CRUD for pools and their versions in a single edit modal.
* Review queue for definitions pulls a version via `/next-version`, submits reviews with `versionId`.
* Prerequisites attach to pools (concept→concept); exercises attach to concepts (ex→def).
* Import/export uses `metaDefinitions` + `metaExercises` only.

---

## **2. Terminology**

| Term                   | Meaning                                                 |
| ---------------------- | ------------------------------------------------------- |
| **Concept**            | `meta_definition` (graph node, owns versions)           |
| **Definition version** | Row in `definitions` table (has `prompt`, `type`, etc.) |
| **Exercise pool**      | `meta_exercise` (existing)                              |
| **Exercise version**   | Row in `exercises` table (unchanged)                    |

---

## **3. API Client Changes**

### **Endpoints (in `api.ts`)**

```ts
getDomainMetaDefinitions(domainId): Promise<MetaDefinition[]>
createMetaDefinition(domainId, {
  code, name, xPosition?, yPosition?,
  prerequisiteIds?, prerequisiteWeights?,
  initialVersion?
}): Promise<MetaDefinition>
getMetaDefinition(id): Promise<MetaDefinition>
updateMetaDefinition(id, {
  code?, name?, xPosition?, yPosition?,
  cascadeCode?, cascadeName?
}): Promise<MetaDefinition>
addMetaDefinitionVersion(id, {
  prompt, type?, description?, notes?, references?
}): Promise<DefinitionVersion>
updateMetaDefinitionVersion(id, versionId, Partial<DefinitionVersion>): Promise<DefinitionVersion>
deleteMetaDefinitionVersion(id, versionId): Promise<void> // surface 400 if last version
getNextMetaDefinitionVersion(id): Promise<DefinitionVersion>
```

### **Types**

```ts
interface DefinitionVersion {
  id: number
  metaDefinitionId: number
  code: string
  name: string
  prompt: string
  type: 'open_ended' | string
  description?: string
  notes?: string
  references?: string[]
  createdAt?: string
  updatedAt?: string
}

interface MetaDefinition {
  id: number
  code: string
  name: string
  domainId: number
  ownerId: number
  xPosition?: number
  yPosition?: number
  prerequisites?: string[]
  prerequisiteWeights?: Record<string, number>
  versionCount: number
  versions?: DefinitionVersion[]
}
```

### **Migration Notes**

* Mark legacy Definition DTOs as *version-row legacy* where still referenced.
* Stop using legacy `Definition` DTOs as graph nodes.

### **Import/Export DTO Changes**

```ts
DomainExportData.metaDefinitions = {
  code, name, xPosition?, yPosition?,
  prerequisites?: string[],
  prerequisiteWeights?: Record<string, number>,
  versions: Array<{
    prompt: string
    type?: string
    description?: string
    notes?: string
    references?: string[]
  }>
}
```

* Replace `DomainExportData.definitions` with `metaDefinitions`.
* Keep `metaExercises` unchanged.
* Remove legacy exercises from new exports.

### **SRS API (`srs-api.ts`)**

* `submitReview` accepts `nodeType: 'meta_definition' | 'exercise'`.
* Prerequisites endpoints accept `nodeType` and `prerequisiteType` = `'meta_definition'`.
* Due queue still uses normalized `nodeType: 'definition' | 'exercise'`; frontend maps `definition → meta_definition`.

---

## **4. Type System Updates**

**`types/srs.ts`**

* Keep `NodeProgress.nodeType` = `'definition' | 'exercise'`.
* Extend `ReviewRequest.nodeType` to `'meta_definition' | 'exercise'`; add `versionId?: number`.
* Extend `NodePrerequisite` unions to include `'meta_definition'`.
* Keep `DueReview.nodeType` as `'definition' | 'exercise'`.

**`Graph/utils/types.tsx`**

* Keep `Definition` as the concept node shape (`code`, `name`, `x/y`, `domainId`, `prerequisites`, `weights`).
* Add lightweight `MetaDefinitionPreview` and `DefinitionVersion` types for details UI.

---

## **5. Graph Canvas**

### **Loading**

* Replace `getDomainDefinitions()` → `getDomainMetaDefinitions()`.
* Load `meta_exercises` for practice mode.
* Populate `codeToNumericIdMap` for both `meta_definitions` and `meta_exercises`.

### **Node Identity**

* Graph ids remain **node codes**.
* XY positions persist via `/api/domains/:id/graph/positions` using keys `def_<id>` and `ex_<id>`.

### **Edges**

* Concept→Concept: `def → def`.
* Exercise→Concept: `ex → def`.
* Use pool-level `prerequisiteWeights`.

### **Rename Behavior**

* **Cascade rename**: requires full graph refresh.
* **Name-only update**: surgical metadata update.
* **Code conflict (409)**: show toast, keep UI state.

### **Study vs Practice**

* Study = concept network only.
* Practice = includes exercises and both edge types.

---

## **6. Node Creation Modal (Definition Pool)**

**Fields:**

* `code`, `name`, `xPosition`, `yPosition`.
* Prerequisites with weights (0.01–1.0).
* Optional initial version: `prompt`, `type`, `description`, `notes`, `references`.

**Submit:**

* `POST /api/domains/:id/meta-definitions`.
* Update graph topology surgically; refresh `codeToNumericIdMap`.

**Validation:**

* Unique code across meta_definitions + meta_exercises.
* Require `code`, `name`; if initial version, require `prompt`.
* Clamp weights `(0,1]`.

---

## **7. Node Edit Modal**

**Data load:** `GET /api/meta-definitions/:id`.

**Pool fields:**

* Editable `code`, `name`, `x/y`, cascade toggles (`cascadeCode`, `cascadeName`).
* CascadeCode → full graph refresh; CascadeName → in-place update.

**Prerequisites panel:**

* CRUD via `/api/srs/prerequisites` (`nodeType=meta_definition`).
* Editable weights; chip-style UI for dependencies.

**Versions tab:**

* CRUD for definition versions (`POST`, `PUT`, `DELETE`).
* Handle 400 for last-version delete gracefully.
* Quick “active version” preview panel.
* No graph refresh required.

---

## **8. Review UI (Definitions)**

**Queue:**

* `getDueReviews(domainId, 'definition')` returns concept nodes.
* `nodeId` = `meta_definition.id`.

**Rendering:**

* Fetch version via `/next-version`.
* Display `prompt`, `description`, `notes`, `references`.
* Handle `type='open_ended'` (future-proof layout).

**Submit:**

```ts
POST /api/srs/reviews {
  nodeType: 'meta_definition',
  nodeId: <poolId>,
  versionId: <versionId>,
  success,
  quality,
  timeTaken,
  sessionId?
}
```

**Exercises:** unchanged.

---

## **9. SRS Context & Helpers**

* `SRSContext.submitReview`: pass `'meta_definition'` when queue item type is `'definition'`.
* `getNodeProgress` and `getReviewHistory` keep normalized `'definition' | 'exercise'`.

---

## **10. Prerequisite Management**

* Concept→Concept: use `/api/srs/prerequisites` with both sides `'meta_definition'`.
* Exercise→Concept: existing behavior with `prerequisiteType='meta_definition'`.

---

## **11. Import/Export**

**Export:**

* Include `metaDefinitions` and `metaExercises`.
* Preserve positions, edges, and versions.

**Import:**

* Validate JSON includes non-empty `code`, `name`, ≥1 version.
* Display concept/exercise counts.
* Refresh domain and restore positions.

---

## **12. Error Handling**

* **400 last version delete:** inline message.
* **409 code conflict:** toast with type + conflicting code.
* **401 auth:** reuse `handleResponse` logic.
* **Position persistence:** maintain XY; only rebuild on cascade rename.

---

## **13. UX Details**

* Canvas labels = pool `code`/`name` only.
* Prefill prompt = `Define <Name>`.
* “Another version” button refetches `/next-version`.
* Accessibility: aria-invalid + toast announcements.

---

## **14. File-Level Change Plan**

| File                        | Key Change                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `client/src/lib/api.ts`     | Add `meta_definition` DTOs + endpoints; migrate `definitions` to `meta-definitions`; update `DomainExportData`. |
| `client/src/lib/srs-api.ts` | Accept `'meta_definition'` in submitReview + prerequisites.                                                     |
| `client/src/types/srs.ts`   | Extend `nodeType` unions and `ReviewRequest`.                                                                   |
| `KnowledgeGraph.tsx`        | Replace `getDomainDefinitions` → `getDomainMetaDefinitions`; remap edges.                                       |
| `NodeCreationModal.tsx`     | Use `createMetaDefinition`; show version form.                                                                  |
| `DetailWindowContent.tsx`   | Load `getMetaDefinition`; use `MetaDefinitionEditForm`.                                                         |
| `ReviewWindowContent.tsx`   | Use `getNextMetaDefinitionVersion`; submit review with versionId.                                               |
| `Graph/details/*`           | Add `MetaDefinitionEditForm.tsx` + optional shared `VersionsEditor`.                                            |
| `ImportDialog.tsx`          | Validate `metaDefinitions` + `metaExercises`; stop legacy `definitions`.                                        |
| `docs/KNOWLEDGE_GRAPH.md`   | Update terminology and import/export flow.                                                                      |

---

## **15. Acceptance Criteria Mapping**

* ✅ Create concept with versions and handle deletion (400 case).
* ✅ Graph shows concept pools, edges, and weights; positions persist.
* ✅ Review queue uses `/next-version` with `versionId`.
* ✅ Export/import round-trip reproduces identical topology.
* ✅ Cascade rename refreshes graph; name-only is surgical.

---

## **16. Manual Test Plan**

**Graph**

* Load, drag, refresh — positions persist.
* Cascade rename refresh behavior verified.

**Prerequisites**

* Add/edit/delete concept→concept weights; verify link rendering.
* Add ex→def prerequisites in practice mode.

**Versions**

* CRUD operations live update list; handle 400 on last delete.

**Reviews**

* Test review session (definitions + exercises).

**Import/Export**

* Verify round-trip integrity for topology, weights, and versions.

---

## **17. Non-Goals / Notes**

* Legacy `/definitions` endpoints remain temporarily supported but deprecated.
* No requirement to import legacy “definitions”; optional conversion tool behind feature flag.

