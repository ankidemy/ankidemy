# Authoring Ankidemy Org-roam notebooks

This is the authoring contract for Org-roam content imported by Ankidemy.
For ownership and synchronization behavior, see
[`ORG_ROAM_FIELD_OWNERSHIP.md`](ORG_ROAM_FIELD_OWNERSHIP.md). The executable
source of truth is `integrations/emacs/ankidemy-org-import.el`.

## Notebook boundary

An attached notebook is a directory containing `ankidemy.org`:

```org
#+title: Algorithms
#+ankidemy_notebook_id: 577e24a0-d1ab-46cd-aa7c-f2426a903ed9
#+ankidemy_schema: 1
```

The ID is stable. Creating the manifest declares the directory eligible for
import; attachment and authorization still happen in Ankidemy. A nested
manifest starts a separate notebook boundary.

Every imported entity needs a unique `ID`. Headings without an ID are ordinary
Org structure. An entity is a `source` by default, but generated content should
always set `ANKIDEMY_TYPE` to `source`, `definition`, `exercise`, or `quest`.
Set `ANKIDEMY_IMPORT: nil` to exclude an entity without excluding descendants.
`ANKIDEMY_CODE` is optional; when present it must be unique, begin with an
alphanumeric character, contain only alphanumerics, `.`, `_`, or `-`, and be at
most 80 characters.

For newly generated notebooks, nodes, and versions, use canonical UUIDs from
`org-id-new` or the authoring tool's `new-id`; never derive an `ID` from a title,
filename, or semantic name. `ANKIDEMY_CODE` is only an optional human-facing
alias. Distillation should normally omit it, allowing the importer to derive a
collision-safe `or-UUID` code. When a plan deliberately supplies a semantic
code, it must include a planning-only `codeReason` and still use a UUID `ID`.

A document-level property drawer with an `ID` creates a file-level source whose
name is `#+title` and whose content is the document body. This is convenient for
raw reading notes, but it also means adding a manifest to an existing Org-roam
directory can expose those files as source nodes. Add `ANKIDEMY_IMPORT: nil`
only when intentionally opting them out.

## Relations and hierarchy

Outline nesting is the normal parent relation. A top-level node may instead
use `ANKIDEMY_PARENT` with another entity ID, including `id:` prefix. Do not use
both when they disagree.

For definitions and exercises, an `id:` link means the linked target is a
prerequisite of the node containing the link. Thus this definition depends on
the first one:

```org
* Conditional probability
:PROPERTIES:
:ID: d00c36ec-79a6-418c-8e02-f521ff2f2c4e
:ANKIDEMY_TYPE: definition
:END:
** What is conditional probability? :version:
:PROPERTIES:
:ID: d373f7b6-bdf7-449e-97a8-0c6fc23c997b
:ROAM_EXCLUDE: t
:END:
For events ...

* Bayes' theorem
:PROPERTIES:
:ID: b04f6ee5-81af-4fd6-8619-7512b79f01c6
:ANKIDEMY_TYPE: definition
:END:
Prerequisites: [[id:d00c36ec-79a6-418c-8e02-f521ff2f2c4e][conditional probability]]
** State Bayes' theorem. :version:
...
```

The resulting edge is `d00c36ec-... -> b04f6ee5-...`.
Hierarchy has the same prerequisite-to-dependent direction except for quests.
An exercise may depend on definitions or exercises; a definition may not
depend on an exercise. The managed definition/exercise graph must be acyclic.

Links owned by sources and quests are ordinary outgoing references, not
prerequisites. A source may therefore link the concepts whose narrative it
synthesizes without changing their learning order.

An Ankidemy prerequisite is a direct *pedagogical dependency*, not only a
formal logical precondition. A dependent may build on a prerequisite by:

- requiring its terminology, mechanism, criteria, or skill;
- specializing or refining its general framework;
- applying or instantiating it in a recurring case;
- composing it with other prerequisites into a larger procedure or exercise;
- detaching and deepening a reusable facet first introduced there.

The dependent prompt or task must make that use visible. Narrative order,
co-occurrence, shared subject, and “these cards feel related” do not justify an
edge. Prefer the smallest set of nearest direct dependencies; do not repeat a
hierarchy parent as an ID-link prerequisite or add an edge already implied
transitively.

## Node formats

### Source

```org
* Conditional probability reading map
:PROPERTIES:
:ID: e41a2002-a02c-4c3f-8bb8-60d0d69785a9
:ANKIDEMY_TYPE: source
:END:
This chapter moves from [[id:d00c36ec-79a6-418c-8e02-f521ff2f2c4e][conditional
probability]] to [[id:b04f6ee5-81af-4fd6-8619-7512b79f01c6][Bayes' theorem]].
```

A source owns its direct body. Use it for compact narrative, provenance, and
relationships that aid navigation but are not prerequisites. It need not
restate the definitions it links.

Normal Org inline/display TeX is exported to Markdown math. Image links must
resolve to readable image files inside the notebook root; Ankidemy imports them
as content-addressed media owned by the body or version field containing the
link.

### Definition

```org
* Conditional probability
:PROPERTIES:
:ID: d00c36ec-79a6-418c-8e02-f521ff2f2c4e
:ANKIDEMY_TYPE: definition
:ANKIDEMY_CODE: probability.conditional
:END:
** What is conditional probability? :version:
:PROPERTIES:
:ID: d373f7b6-bdf7-449e-97a8-0c6fc23c997b
:ROAM_EXCLUDE: t
:END:
For events $A$ and $B$ with $P(B)>0$,
$P(A\mid B)=P(A\cap B)/P(B)$.

*** Notes :notes:
Conditioning restricts the sample space to $B$.

*** References :references:
Chapter 2, section 1.

** Under what condition is conditional probability defined? :version:
:PROPERTIES:
:ID: 2da9b05b-e035-47b0-9961-93459424a2b7
:ROAM_EXCLUDE: t
:END:
The conditioning event must have positive probability: $P(B)>0$.
```

Definitions require at least one immediate `:version:` child. Its heading is
the prompt and its direct body is the answer/description. Each version needs a
unique `ID` and `ROAM_EXCLUDE: t`. Immediate `:notes:` and `:references:`
children are optional version fields. Version order is display order. The only
currently supported answer type is `open_ended`.

Versions are separate review cards for one stable definition concept. Use them
for complementary retrieval targets such as meaning, components, use
conditions, rationale, contrast, failure modes, or a focused subpart that would
make the primary answer too long. Do not create a new definition merely because
a second prompt is useful; detach a new node only when the facet needs different
prerequisites, has its own dependents, or is independently reusable as a graph
concept.

### Exercise

```org
* Compute a conditional probability
:PROPERTIES:
:ID: 82825c6d-7c16-4d36-8bdf-dbbdb2e330f2
:ANKIDEMY_TYPE: exercise
:END:
Prerequisites: [[id:d00c36ec-79a6-418c-8e02-f521ff2f2c4e][conditional probability]]
** A fair die was even. What is the probability it was a six? :version:
:PROPERTIES:
:ID: 11e4e5ee-1bd7-47c3-9828-74e51bc3a9c9
:ROAM_EXCLUDE: t
:ANKIDEMY_DIFFICULTY: 2
:ANKIDEMY_VERIFIABLE: t
:END:
Give a reduced fraction.

*** Hints :hints:
Restrict the sample space to the even outcomes.

*** Solution :solution:
1/3

*** Notes :notes:
This tests application rather than recall of the formula.
```

Exercises require one or more immediate `:version:` children. Their headings
are statements and their bodies are descriptions. Difficulty is an integer
from 1 through 7 and defaults to 3. A verifiable exercise must have non-empty
`:solution:` content. `:hints:`, `:solution:`, and `:notes:` are optional
immediate version fields.

### Quest

```org
* TODO Detach the comparison prompt
SCHEDULED: <2026-08-07 Fri 09:00>
:PROPERTIES:
:ID: 616e6fd8-869a-438c-a807-b290a04d4c89
:ANKIDEMY_TYPE: quest
:END:
Move the comparison version into a reusable definition.
```

A quest requires an active `SCHEDULED` or `DEADLINE` timestamp. No repeater is
a one-time TODO; an exact daily repeater is a daily quest; other repeaters are
habits. A local `:habit:` tag forces repeating timestamps to habit semantics.
Quests may use immediate `:version:` children with IDs and `ROAM_EXCLUDE: t`;
otherwise the parent title/body is the implicit version.

## Headless authoring tool

Run commands from the Ankidemy repository:

```sh
python3 integrations/emacs/ankidemy_org_tool.py init ROOT --title TITLE
python3 integrations/emacs/ankidemy_org_tool.py inventory ROOT
python3 integrations/emacs/ankidemy_org_tool.py --json find ROOT QUERY
python3 integrations/emacs/ankidemy_org_tool.py --json dependencies ROOT NODE --recursive
python3 integrations/emacs/ankidemy_org_tool.py --json analyze ROOT
python3 integrations/emacs/ankidemy_org_tool.py --json validate ROOT
python3 integrations/emacs/ankidemy_org_tool.py --json outline ROOT notes/chapter-2.org --max-level 2
python3 integrations/emacs/ankidemy_org_tool.py --json render ROOT PLAN.json
python3 integrations/emacs/ankidemy_org_tool.py --json check-plan ROOT PLAN.json
```

`init` refuses to overwrite a manifest. `render` preflights generated files in
a temporary copy of the complete notebook and publishes nothing when parsing
or graph validation fails. It refuses existing paths by default. `--replace`
may replace only files carrying the same generated marker and `planId`.
`inventory` reports each node's `versionCount`; use `analyze` for aggregate
identifier, version-distribution, and graph metrics.
`check-plan` repeats schema, coverage, ownership, and temporary-notebook
preflight checks without publishing files. Run it on the retained plan at final
handoff so later accidental truncation cannot masquerade as a reproducible
render. Unlike notebook-level validation, `check-plan` rejects analyzer
warnings involving nodes owned by the retained plan; a newly distilled bundle
cannot declare itself complete while acknowledging a quality warning.

## Distillation plan schema 1

Plans are temporary JSON, not notebook content. The agent supplies all prose,
prompts, solutions, relations, output paths, and stable IDs. Generate IDs with
`new-id --count N`.
UUID-shaped but obviously handcrafted low-entropy values (for example,
sequential zero-heavy IDs) are rejected. Canonical syntax alone is not proof of
collision-resistant identity; use `new-id`/`org-id-new` for live plans.

```json
{
  "schema": 1,
  "planId": "2a05ac3d-9849-4f3a-9d38-f664887ce8f6",
  "sourceFiles": ["notes/chapter-2.org"],
  "coverageMode": "outline-v1",
  "coverageMaxLevel": 2,
  "coverage": [
    {
      "source": "notes/chapter-2.org",
      "section": "L12: Probability > Conditional probability",
      "sourceEvidence": "given that another event has occurred",
      "headingBodyAudit": "aligned",
      "disposition": "definition",
      "claim": "Conditional probability restricts probability to outcomes compatible with the given event.",
      "targets": ["7177acbf-04bd-49cc-a428-744f2266a66f"]
    }
  ],
  "files": [
    {
      "path": "conditional-probability-graph.org",
      "title": "Conditional Probability Graph",
      "nodes": [
        {
          "id": "60f7a06a-962d-4e73-ae32-a59d4e22cbac",
          "type": "definition",
          "title": "Conditional probability",
          "rootReason": "This source treats elementary events and probability as prior knowledge, so conditional probability is the local foundation.",
          "singletonReason": "This minimal example intentionally contains one managed node; a real topic bundle should normally extend it.",
          "singleVersionReason": "The example intentionally demonstrates one atomic retrieval target.",
          "versions": [
            {
              "id": "7177acbf-04bd-49cc-a428-744f2266a66f",
              "role": "core",
              "prompt": "What is conditional probability?",
              "description": "Conditional probability restricts probability to outcomes compatible with the given event.",
              "notes": "Optional notes.",
              "references": "Optional source citation."
            }
          ]
        }
      ]
    }
  ]
}
```

Common node fields are `id`, `type`, `title`, optional `code`, and optional
`parent`. A parent planned in the same file becomes outline nesting; other
parents become `ANKIDEMY_PARENT`. Sources use `body` and `references`. Managed
nodes use `prerequisites` and `versions`. A planned definition with no managed
parent or prerequisite is a graph root and must include a non-empty
`rootReason`. If no planned managed node depends on that root, it must also
include `singletonReason`. These planning rationales are checked but are not
written to Org. Every planned exercise must have at least one managed parent or
prerequisite. `planId` and every newly planned node/version `id` must be a
canonical UUID. Supplying optional `code` also requires a planning-only
`codeReason`. A definition with exactly one version requires a planning-only
`singleVersionReason` explaining why the concept has no other supported,
useful retrieval facet.

- Definition version: `id`, `role`, `prompt`, `description`, optional `notes`
  and `references`. `role` is one of `core`, `components`, `use`, `rationale`,
  `contrast`, `constraints`, `failure`, `focused-part`, or `application`. The
  role is planning metadata and is not rendered into Org.
  Every multi-version definition must include at least one `core` or
  `components` role; application/use-only groups are rejected as likely
  source-shaped buckets. Vague prompts such as “What guidance applies to X?”
  are also rejected.
- Exercise version: `id`, `statement`, optional `description`, `hints`,
  `solution`, `notes`, `difficulty` (default 3), and `verifiable` (default
  false).
- Quest: `scheduled`, optional `todoKeyword`, `habit`, `body`, `references`,
  and optional versions containing `id`, `title`, and `description`.

Relations accept either an ID string or `{ "id": ..., "label": ... }`.
Every referenced ID must exist in the current notebook or the same plan.

When `sourceFiles` is non-empty, `coverageMode` must be `outline-v1` and
`coverageMaxLevel` must be 2--6. Run `outline` with that level and copy each
returned `section` key into exactly one coverage row. Each outline item also
includes a bounded `bodyPreview` and line range so claims can be checked against
the section body rather than inferred from its heading. It also reports
`nestedHeadingCount` and `nestedHeadings` beyond the chosen coverage depth. A
long section or one with at least two nested headings must target a concept
with at least two versions, preventing rich methods from being truncated into
one card. Render rejects missing,
duplicate, or invented section keys. A coverage entry records `source`, the
exact outline `section`, a short `sourceEvidence` anchor copied verbatim from
that section's body, a `headingBodyAudit`, one of `definition`, `exercise`,
`source`, `omit`, or `uncertain`, and resulting `targets`. Evidence must contain
at least eight normalized characters and is checked against the exact line
range; it exists to prove that the row was grounded in the body rather than the
heading and must not be recycled as card prose. The tool automatically requires
the rewritten claim to share distinctive content words with that evidence (at
least two for a long section). This lexical bridge does not replace semantic
judgment, but it blocks a heading-derived claim whose cited evidence discusses
something else. Set `headingBodyAudit` to
`aligned` for definition/exercise/omit, `umbrella` for a true source umbrella,
or `mismatch` for uncertain heading/body contradictions. This classification
is an explicit semantic attestation by the authoring agent; the tool checks its
consistency with the disposition, while the evidence check supplies the
deterministic trace back to the source. Definition and exercise rows require a
concise extracted `claim` and must target only matching version IDs, so a broad
node cannot masquerade as preservation of a specific section. The claim must
appear verbatim in the answer-bearing text of at least one targeted version
(`description`, or an exercise's `description`/`solution`); this makes a stale
or semantically unrelated target an executable error rather than a manual-audit
hope. A definition or
exercise version may be assigned to only one coverage row. If another source
section truly repeats the same claim, mark the duplicate occurrence `omit`,
copy that preserved claim verbatim into the row, target the already preserving
version/source, and explain the duplication in `reason`; an empty or unrelated
omit target is rejected.
Source rows target source node IDs and require a `claim` that appears verbatim
in the targeted source node body; a generic map link is not synthesized
coverage. Every newly planned source node must contain relationship-specific
synthesis and reference at least two definitions/exercises whose relationship
it explains.
Source, omitted, and uncertain material also requires `reason`. These
fields support the semantic coverage audit and are not written to Org.
Definition prompts are compared after whitespace/case normalization and must be
unique within their node: two cards with the same cue but different answers are
ambiguous, while identical prompt/answer pairs are redundant.

Coverage claims are distilled audit statements, not pasted excerpts. They are
limited to 280 characters, may not contain raw Org directives, and may not copy
a long bounded `bodyPreview` verbatim. Read the complete section and rewrite an
atomic claim. Generic heading wrappers such as “How should you handle:
HEADING?” or “What interview guidance applies to HEADING?” are rejected as
source-summary prompts. Circular answers that refer to “the scenario this
pattern addresses” or “question types listed in the source” are also rejected.

Source prose is glue, not an escape hatch from card design. With exact outline
coverage, no more than `max(1, floor(section_count / 4))` rows may use the
`source` disposition. This default encodes the distillation workflow's premise
that most selected note content is durable knowledge. A genuinely
source-dominant input needs user-level reconsideration of scope instead of an
agent silently publishing a parallel textbook.
Only narrative umbrella sections that actually have covered child sections may
use the `source` disposition. A level-1 leaf is still substantive and must be
distilled, proven duplicate, or genuinely uncertain.

`uncertain` is reserved for unsupported, contradictory, or ambiguous source
content, not unfinished work. It requires a concise claim and evidence-based
reason. More than `max(1, floor(section_count / 20))` uncertain rows blocks
publication and requires user review. Reasons such as “not rendered,” “compact
batch,” or “out of scope” are rejected. Its target list must remain empty so an
unresolved interpretation cannot silently become a review card.

For an enumerated named-concept heading such as `A. STAR-L`, definition targets
must be versions owned by a node with that normalized concept name. This keeps
stale coverage IDs from assigning one named method to a neighboring method.
Source-umbrella claims must be distinct; repeating one generic map sentence for
several sections is not relationship-specific synthesis.

## Validation gate

Before attachment or study, `validate` must report no errors. `analyze` and
`validate` also return `graph` metrics for the managed definition/exercise DAG:
managed nodes and edges, weakly connected components, roots, leaves,
singletons, and maximum prerequisite depth. They also return `identifiers`
metrics for UUID/non-UUID IDs and `versions` metrics for definition/version
counts and distribution. They warn about non-UUID IDs, singleton nodes,
exercises without linked concepts, excessive fragmentation, a large but
one-level or leaf-dominated graph, a definition set dominated by exactly one or
two versions per node, and a disproportionate concentration of versions in one
likely catch-all node. A definition with more than eight versions also produces a
large-node audit warning; this is a semantic diagnostic, not an automatic split
quota.
An exercise with more than eight direct prerequisites warns as a likely
mega-exercise being used to connect an otherwise weak graph; split the task or
retain only concepts its prompt directly requires.
For a graph with at least eight definitions, having at least 60% single-version
definitions warns as likely over-specific node boundaries; atomic exceptions
remain possible, but the batch must regroup shared referents before final
`check-plan` can pass.
An almost linear graph with one root, one leaf, and depth close to its node
count warns as `graph.chain_like`; it usually encodes source order rather than
prerequisites. Plans with at least 12 outline rows are also rejected when
managed-node count reaches 80% of outline-row count, a strong one-node-per-
heading signal.

Those warnings remain non-fatal at the notebook level because a notebook may
intentionally contain independent topic bundles. For a newly distilled
coherent bundle, however, fragmentation, shallowness, or unexplained
singletons are semantic failures: redesign the dependency backbone or document
the genuine exception. Resolve cycles, invalid type directions, missing
versions/IDs, malformed fields, and importer errors before considering any
batch complete.
