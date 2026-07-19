# Org-roam field ownership

An attached Org notebook is the source of truth for learning content and its
portable semantic metadata. Ankidemy remains the source of truth for visual
layout, access policy, learning state, and other application-only state.

## Properties shared by imported node types

| Field | Org representation | Owner |
| --- | --- | --- |
| Stable provider identity | `:ID:` | Org property |
| Node kind | `:ANKIDEMY_TYPE:` (`source`, `definition`, `exercise`, or `quest`) | Org property; source is the default and quest is inferred from TODO/planning syntax |
| Display code | `:ANKIDEMY_CODE:` | Org property; defaults to `or-<ID>` |
| Include/exclude node | `:ANKIDEMY_IMPORT:` (`t` or `nil`) | Org property |
| Explicit parent | `:ANKIDEMY_PARENT:` | Org property; outline nesting is the normal alternative |
| Name/title | Headline text, or `#+title` for a file-level source | Org text |
| Relevant/prerequisite links | `id:` links and outline hierarchy | Org text/structure |
| Media | Org image links | Org text; imported as content-addressed media |
| X/Y position | No Org representation | Ankidemy database; user editable and never overwritten by sync |
| Groups/collapse state | No Org representation | Ankidemy database/user settings |
| SRS progress, flags, review history | No Org representation | Ankidemy per-user state |

## Source nodes

| Field | Representation/owner |
| --- | --- |
| Title and body | Org headline/file title and plain Org body |
| Code, ID, type, import policy, parent | Org properties listed above |
| BibTeX key and local file-path annotation | Ankidemy database (the provider locator is stored separately and is not exposed as node content) |
| Visibility/access policy | Ankidemy database; defaults to private when first imported and survives later syncs |
| X/Y position | Ankidemy database |

## Definition nodes

| Field | Representation/owner |
| --- | --- |
| Definition name | Parent Org headline text |
| Versions | Immediate child headlines tagged `:version:` |
| Version identity | Version headline `:ID:`; version headlines also use `:ROAM_EXCLUDE: t` so org-roam does not expose them as graph nodes |
| Prompt | Version headline text |
| Description | Plain body under the version headline |
| Notes | Immediate `:notes:` child body |
| References | Immediate `:references:` child body |
| Version order | Org outline order |
| Answer type | Currently normalized to `open_ended` by the importer |
| X/Y position | Ankidemy database on the definition pool |

## Exercise nodes

| Field | Representation/owner |
| --- | --- |
| Exercise name | Parent Org headline text |
| Versions and version identity | Immediate `:version:` children with `:ID:` and `:ROAM_EXCLUDE: t` |
| Statement | Version headline text |
| Description | Plain body under the version headline |
| Hints, solution, notes | Immediate `:hints:`, `:solution:`, and `:notes:` child bodies |
| Difficulty | Version property `:ANKIDEMY_DIFFICULTY:` (1–7; default 3) |
| Verifiable | Version property `:ANKIDEMY_VERIFIABLE:` (`t`/`nil`; default `nil`) |
| Version order | Org outline order |
| X/Y position | Ankidemy database on the exercise pool |

## Quest nodes

| Field | Representation/owner |
| --- | --- |
| Quest name | Parent TODO/headline text |
| Versions | Immediate child headlines tagged `:version:`; when absent, the parent headline/body remains one implicit version for backward compatibility |
| Version identity | Version headline `:ID:`; version headlines also use `:ROAM_EXCLUDE: t` so org-roam does not expose them as graph nodes |
| Version title and description | Version headline text and the plain body directly under it |
| Version order | Org outline order |
| Kind and schedule | Active `SCHEDULED`/`DEADLINE` timestamp and its repeater; inferred as one-time `todo`, `daily`, or `habit` |
| Forced habit kind | A local `:habit:` tag on the quest headline forces any repeating timestamp, including an exact daily repeater, to import as `habit` |
| Code, ID, explicit type/import/parent | Org properties listed above |
| Active/deactivated state and completion history | Ankidemy per-user state |
| Visibility/access policy | Ankidemy database; defaults to private and survives later syncs |
| X/Y position | Ankidemy database |

For example, a daily timestamp can be forced to use habit semantics while the
two authored presentations remain stable across synchronization:

```org
* TODO Do Not Overthink :habit:
SCHEDULED: <2026-07-19 Sun 07:00 ++1d>
:PROPERTIES:
:ID: quest-id
:ANKIDEMY_TYPE: quest
:END:
** Notice the urge :version:
:PROPERTIES:
:ID: quest-version-notice
:ROAM_EXCLUDE: t
:END:
Pause before acting.
** Use a timer :version:
:PROPERTIES:
:ID: quest-version-timer
:ROAM_EXCLUDE: t
:END:
Wait two minutes.
```

The quest owns its name and schedule; each version owns its title and body. Once
explicit `:version:` children exist, content in the parent body is ignored with
a diagnostic so there is only one unambiguous owner for versioned content. A
`:habit:` quest still requires a repeating timestamp. The tag changes the
Ankidemy quest kind, not the Org repeater mode: `+`, `++`, and `.+` retain their
strict, catch-up, and from-completion behavior.

With point on a quest, `SPC n r y v` inserts another version. On first use, the
helper preserves the legacy implicit version by moving the existing parent body
under a generated first `:version:` child, then creates the newly requested
second version.

Structural version/field tags (`version`, `notes`, `references`, `hints`, and
`solution`) are content structure, not separate Ankidemy nodes. Database IDs,
timestamps, soft-delete markers, imported content hashes, and provider locators
are internal bookkeeping and are not user-authored fields.
