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
:ID: probability-conditional
:ANKIDEMY_TYPE: definition
:END:
** What is conditional probability? :version:
:PROPERTIES:
:ID: probability-conditional-v1
:ROAM_EXCLUDE: t
:END:
For events ...

* Bayes' theorem
:PROPERTIES:
:ID: probability-bayes
:ANKIDEMY_TYPE: definition
:END:
Prerequisites: [[id:probability-conditional][conditional probability]]
** State Bayes' theorem. :version:
...
```

The resulting edge is `probability-conditional -> probability-bayes`.
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
:ID: source-probability-map
:ANKIDEMY_TYPE: source
:END:
This chapter moves from [[id:probability-conditional][conditional
probability]] to [[id:probability-bayes][Bayes' theorem]].
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
:ID: probability-conditional
:ANKIDEMY_TYPE: definition
:ANKIDEMY_CODE: probability.conditional
:END:
** What is conditional probability? :version:
:PROPERTIES:
:ID: probability-conditional-v1
:ROAM_EXCLUDE: t
:END:
For events $A$ and $B$ with $P(B)>0$,
$P(A\mid B)=P(A\cap B)/P(B)$.

*** Notes :notes:
Conditioning restricts the sample space to $B$.

*** References :references:
Chapter 2, section 1.
```

Definitions require at least one immediate `:version:` child. Its heading is
the prompt and its direct body is the answer/description. Each version needs a
unique `ID` and `ROAM_EXCLUDE: t`. Immediate `:notes:` and `:references:`
children are optional version fields. Version order is display order. The only
currently supported answer type is `open_ended`.

### Exercise

```org
* Compute a conditional probability
:PROPERTIES:
:ID: exercise-conditional-die
:ANKIDEMY_TYPE: exercise
:END:
Prerequisites: [[id:probability-conditional][conditional probability]]
** A fair die was even. What is the probability it was a six? :version:
:PROPERTIES:
:ID: exercise-conditional-die-v1
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
:ID: quest-detach-comparison
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
python3 integrations/emacs/ankidemy_org_tool.py --json render ROOT PLAN.json
```

`init` refuses to overwrite a manifest. `render` preflights generated files in
a temporary copy of the complete notebook and publishes nothing when parsing
or graph validation fails. It refuses existing paths by default. `--replace`
may replace only files carrying the same generated marker and `planId`.

## Distillation plan schema 1

Plans are temporary JSON, not notebook content. The agent supplies all prose,
prompts, solutions, relations, output paths, and stable IDs. Generate IDs with
`new-id --count N`.

```json
{
  "schema": 1,
  "planId": "one-stable-id-for-this-batch",
  "sourceFiles": ["notes/chapter-2.org"],
  "coverage": [
    {
      "source": "notes/chapter-2.org",
      "section": "Conditional probability",
      "disposition": "definition",
      "targets": ["definition-id"]
    }
  ],
  "files": [
    {
      "path": "conditional-probability-graph.org",
      "title": "Conditional Probability Graph",
      "nodes": [
        {
          "id": "definition-id",
          "type": "definition",
          "title": "Conditional probability",
          "rootReason": "This source treats elementary events and probability as prior knowledge, so conditional probability is the local foundation.",
          "singletonReason": "This minimal example intentionally contains one managed node; a real topic bundle should normally extend it.",
          "versions": [
            {
              "id": "version-id",
              "prompt": "What is conditional probability?",
              "description": "The answer.",
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
prerequisite.

- Definition version: `id`, `prompt`, `description`, optional `notes` and
  `references`.
- Exercise version: `id`, `statement`, optional `description`, `hints`,
  `solution`, `notes`, `difficulty` (default 3), and `verifiable` (default
  false).
- Quest: `scheduled`, optional `todoKeyword`, `habit`, `body`, `references`,
  and optional versions containing `id`, `title`, and `description`.

Relations accept either an ID string or `{ "id": ..., "label": ... }`.
Every referenced ID must exist in the current notebook or the same plan.

`sourceFiles` and `coverage` are optional renderer metadata but required by the
distillation workflow. A coverage entry records `source`, `section`, one of
`definition`, `exercise`, `source`, `omit`, or `uncertain`, and any resulting
node `targets`. Omitted and uncertain material also requires `reason`. These
fields support the semantic coverage audit and are not written to Org.

## Validation gate

Before attachment or study, `validate` must report no errors. `analyze` and
`validate` also return `graph` metrics for the managed definition/exercise DAG:
managed nodes and edges, weakly connected components, roots, leaves,
singletons, and maximum prerequisite depth. They warn about singleton nodes,
exercises without linked concepts, excessive fragmentation, and a large but
one-level graph.

Those warnings remain non-fatal at the notebook level because a notebook may
intentionally contain independent topic bundles. For a newly distilled
coherent bundle, however, fragmentation, shallowness, or unexplained
singletons are semantic failures: redesign the dependency backbone or document
the genuine exception. Resolve cycles, invalid type directions, missing
versions/IDs, malformed fields, and importer errors before considering any
batch complete.
