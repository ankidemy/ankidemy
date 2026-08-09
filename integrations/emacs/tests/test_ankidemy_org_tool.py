#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import uuid


TOOL_PATH = Path(__file__).parents[1] / "ankidemy_org_tool.py"
SPEC = importlib.util.spec_from_file_location("ankidemy_org_tool", TOOL_PATH)
assert SPEC and SPEC.loader
tool = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(tool)

NOTEBOOK_ID = "d00c36ec-79a6-418c-8e02-f521ff2f2c4e"
PLAN_ID = "d373f7b6-bdf7-449e-97a8-0c6fc23c997b"
SOURCE_ID = "b04f6ee5-81af-4fd6-8619-7512b79f01c6"
ROOT_ID = "e41a2002-a02c-4c3f-8bb8-60d0d69785a9"
ROOT_VERSION_ID = "2da9b05b-e035-47b0-9961-93459424a2b7"
CHILD_ID = "82825c6d-7c16-4d36-8bdf-dbbdb2e330f2"
CHILD_VERSION_ID = "11e4e5ee-1bd7-47c3-9828-74e51bc3a9c9"
EXERCISE_ID = "616e6fd8-869a-438c-a807-b290a04d4c89"
EXERCISE_VERSION_ID = "2a05ac3d-9849-4f3a-9d38-f664887ce8f6"


class AnkidemyOrgToolTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="ankidemy-org-tool-test-")
        self.root = Path(self.temporary.name)
        tool.init_notebook(self.root, "Temporary notebook", NOTEBOOK_ID)
        (self.root / "input.org").write_text(
            "* Root and child concepts\n"
            "Overview.\n"
            "** Root concept\n"
            "Foundation.\n"
            "** Child concept\n"
            "Dependent.\n",
            encoding="utf-8",
        )

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def _write_plan(self, plan: dict) -> Path:
        path = self.root.parent / f"{self.root.name}-plan.json"
        path.write_text(json.dumps(plan), encoding="utf-8")
        self.addCleanup(path.unlink, missing_ok=True)
        return path

    def _valid_plan(self) -> dict:
        return {
            "schema": 1,
            "planId": PLAN_ID,
            "sourceFiles": ["input.org"],
            "coverageMode": "outline-v1",
            "coverageMaxLevel": 2,
            "coverage": [
                {
                    "source": "input.org",
                    "section": "L1: Root and child concepts",
                    "sourceEvidence": "Root concept Foundation.",
                    "headingBodyAudit": "umbrella",
                    "disposition": "source",
                    "reason": "This heading is the narrative umbrella for the two concept sections.",
                    "claim": "A compact map relates the root concept to its dependent child.",
                    "targets": [SOURCE_ID],
                },
                {
                    "source": "input.org",
                    "section": "L3: Root and child concepts > Root concept",
                    "sourceEvidence": "Foundation.",
                    "headingBodyAudit": "aligned",
                    "disposition": "definition",
                    "claim": "The root concept is a foundation.",
                    "targets": [ROOT_VERSION_ID],
                },
                {
                    "source": "input.org",
                    "section": "L5: Root and child concepts > Child concept",
                    "sourceEvidence": "Dependent.",
                    "headingBodyAudit": "aligned",
                    "disposition": "definition",
                    "claim": "The child concept is dependent on the root.",
                    "targets": [CHILD_VERSION_ID],
                }
            ],
            "files": [
                {
                    "path": "topic-map.org",
                    "title": "Topic Map",
                    "nodes": [
                        {
                            "id": SOURCE_ID,
                            "type": "source",
                            "title": "Topic reading map",
                            "body": "A compact map relates the root concept to its dependent child.",
                            "references": [
                                {"id": ROOT_ID, "label": "root"},
                                {"id": CHILD_ID, "label": "child"},
                            ],
                        }
                    ],
                },
                {
                    "path": "topic-graph.org",
                    "title": "Topic Graph",
                    "nodes": [
                        {
                            "id": ROOT_ID,
                            "type": "definition",
                            "title": "Root concept",
                            "rootReason": "This is the foundation introduced by the source.",
                            "singleVersionReason": "The test fixture intentionally models one atomic prompt.",
                            "versions": [
                                {
                                    "id": ROOT_VERSION_ID,
                                    "role": "core",
                                    "prompt": "What is the root concept?",
                                    "description": "The root concept is a foundation.",
                                    "notes": "Keep the answer atomic.",
                                }
                            ],
                        },
                        {
                            "id": CHILD_ID,
                            "type": "definition",
                            "title": "Child concept",
                            "parent": ROOT_ID,
                            "singleVersionReason": "The test fixture intentionally models one atomic prompt.",
                            "versions": [
                                {
                                    "id": CHILD_VERSION_ID,
                                    "role": "core",
                                    "prompt": "What is the child concept?",
                                    "description": "The child concept is dependent on the root.",
                                }
                            ],
                        },
                        {
                            "id": EXERCISE_ID,
                            "type": "exercise",
                            "title": "Apply the child concept",
                            "prerequisites": [CHILD_ID],
                            "versions": [
                                {
                                    "id": EXERCISE_VERSION_ID,
                                    "statement": "Apply the child concept to the given case.",
                                    "description": "Show the relevant step.",
                                    "hints": "Start with the child concept.",
                                    "solution": "A checkable result.",
                                    "difficulty": 2,
                                    "verifiable": True,
                                }
                            ],
                        },
                    ],
                },
            ],
        }

    def test_render_preflights_and_imports_topic_bundle(self) -> None:
        plan_path = self._write_plan(self._valid_plan())
        result = tool.render_plan(self.root, plan_path, False)

        self.assertTrue(result["complete"])
        self.assertEqual(["topic-map.org", "topic-graph.org"], result["files"])
        graph = (self.root / "topic-graph.org").read_text(encoding="utf-8")
        self.assertIn("#+ankidemy_generated: distill-notes-to-ankidemy/v1", graph)
        self.assertIn("** Child concept", graph)
        self.assertIn(f"[[id:{CHILD_ID}][Child concept]]", graph)

        snapshot = tool._emacs_snapshot(self.root)
        analysis = tool.analyze_snapshot(snapshot)
        self.assertTrue(analysis["complete"], analysis["diagnostics"])
        self.assertEqual(4, analysis["nodeCount"])
        self.assertEqual(4, analysis["edgeCount"])
        self.assertEqual(3, analysis["graph"]["managedNodeCount"])
        self.assertEqual(2, analysis["graph"]["managedEdgeCount"])
        self.assertEqual(1, analysis["graph"]["componentCount"])
        self.assertEqual(1, analysis["graph"]["rootCount"])
        self.assertEqual(0, analysis["graph"]["singletonCount"])
        self.assertEqual(2, analysis["graph"]["maxDepth"])
        self.assertEqual(0, analysis["identifiers"]["nonUuidCount"])
        self.assertEqual(2, analysis["versions"]["definitionCount"])
        self.assertEqual(2, analysis["versions"]["definitionVersionCount"])
        self.assertEqual(2, analysis["versions"]["singleVersionDefinitionCount"])

        retained = tool.check_plan(self.root, plan_path)
        self.assertTrue(retained["complete"])
        self.assertEqual(result["files"], retained["files"])

    def test_render_refuses_overwrite_and_replaces_only_same_plan(self) -> None:
        plan = self._valid_plan()
        plan_path = self._write_plan(plan)
        tool.render_plan(self.root, plan_path, False)

        with self.assertRaisesRegex(tool.ToolError, "refusing to overwrite"):
            tool.render_plan(self.root, plan_path, False)

        plan["files"][0]["nodes"][0]["body"] = (
            "A revised narrative relates the root concept."
        )
        plan["coverage"][0]["claim"] = (
            "A revised narrative relates the root concept."
        )
        plan_path.write_text(json.dumps(plan), encoding="utf-8")
        tool.render_plan(self.root, plan_path, True)
        self.assertIn(
            "A revised narrative relates the root concept.",
            (self.root / "topic-map.org").read_text(),
        )

        plan["planId"] = "671e19d5-44ad-4fa9-bcf3-2c55693c6a98"
        plan_path.write_text(json.dumps(plan), encoding="utf-8")
        with self.assertRaisesRegex(tool.ToolError, "non-matching generated output"):
            tool.render_plan(self.root, plan_path, True)

    def test_render_rejects_unsafe_and_invalid_plans_before_writing(self) -> None:
        plan = self._valid_plan()
        plan["files"][0]["path"] = "../escape.org"
        with self.assertRaisesRegex(tool.ToolError, "relative .org"):
            tool.render_plan(self.root, self._write_plan(plan), False)
        self.assertFalse((self.root.parent / "escape.org").exists())

        plan = self._valid_plan()
        definition = plan["files"][1]["nodes"][1]
        definition["prerequisites"] = [EXERCISE_ID]
        with self.assertRaisesRegex(tool.ToolError, "cannot depend on an exercise"):
            tool.render_plan(self.root, self._write_plan(plan), False)
        self.assertFalse((self.root / "topic-map.org").exists())

        plan = self._valid_plan()
        exercise_version = plan["files"][1]["nodes"][2]["versions"][0]
        exercise_version["solution"] = ""
        with self.assertRaisesRegex(tool.ToolError, "solution is required"):
            tool.render_plan(self.root, self._write_plan(plan), False)

    def test_plan_requires_uuid_ids_and_explicit_single_version_or_code_reasons(self) -> None:
        plan = self._valid_plan()
        plan["planId"] = "name-derived-plan"
        with self.assertRaisesRegex(tool.ToolError, "canonical UUID"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        plan = self._valid_plan()
        plan["planId"] = "00000000-0000-4001-8001-000000000001"
        with self.assertRaisesRegex(tool.ToolError, "suspicious low-entropy UUID"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        plan = self._valid_plan()
        plan["files"][1]["nodes"][0]["id"] = "name-derived-node"
        with self.assertRaisesRegex(tool.ToolError, "canonical UUID"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        plan = self._valid_plan()
        del plan["files"][1]["nodes"][1]["singleVersionReason"]
        with self.assertRaisesRegex(tool.ToolError, "singleVersionReason"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        plan = self._valid_plan()
        plan["files"][1]["nodes"][0]["code"] = "human.semantic.code"
        with self.assertRaisesRegex(tool.ToolError, "codeReason"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        plan = self._valid_plan()
        del plan["files"][1]["nodes"][0]["versions"][0]["role"]
        with self.assertRaisesRegex(tool.ToolError, "role"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        plan = self._valid_plan()
        plan["files"][1]["nodes"][0]["versions"][0]["prompt"] = (
            "What guidance applies to: Root concept"
        )
        with self.assertRaisesRegex(tool.ToolError, "vague source-summary prompt"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        plan = self._valid_plan()
        plan["files"][1]["nodes"][0]["versions"][0]["description"] = (
            "Use it when the interviewer asks the question that this response pattern addresses."
        )
        plan["coverage"][1]["claim"] = plan["files"][1]["nodes"][0]["versions"][0]["description"]
        with self.assertRaisesRegex(tool.ToolError, "circular or source-referential"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        plan = self._valid_plan()
        plan["files"][1]["nodes"][0]["versions"][0]["description"] = (
            "Use a prepared, specific response that connects relevant evidence to the role "
            "and emphasizes foundation and concept."
        )
        plan["coverage"][1]["claim"] = plan["files"][1]["nodes"][0]["versions"][0]["description"]
        with self.assertRaisesRegex(tool.ToolError, "circular or source-referential"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        plan = self._valid_plan()
        plan["files"][1]["nodes"][0]["versions"][0]["prompt"] = (
            "How should you handle: A. Root concept?"
        )
        with self.assertRaisesRegex(tool.ToolError, "vague source-summary prompt"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        plan = self._valid_plan()
        root = plan["files"][1]["nodes"][0]
        root.pop("singleVersionReason")
        root["versions"].append(
            {
                "id": "7177acbf-04bd-49cc-a428-744f2266a66f",
                "role": "application",
                "prompt": "How is the root applied?",
                "description": "Apply the root to the case.",
            }
        )
        root["versions"][0]["role"] = "use"
        with self.assertRaisesRegex(tool.ToolError, "core or components"):
            tool.render_plan(self.root, self._write_plan(plan), False)

    def test_outline_coverage_is_exact_and_complete(self) -> None:
        outline = tool.source_outline(self.root, "input.org", 2)
        self.assertEqual(
            [
                "L1: Root and child concepts",
                "L3: Root and child concepts > Root concept",
                "L5: Root and child concepts > Child concept",
            ],
            [section["section"] for section in outline["sections"]],
        )
        self.assertEqual("Foundation.", outline["sections"][1]["bodyPreview"])

        plan = self._valid_plan()
        plan["coverage"].pop()
        with self.assertRaisesRegex(tool.ToolError, "coverage is missing"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        plan = self._valid_plan()
        plan["coverage"][0].pop("reason")
        with self.assertRaisesRegex(tool.ToolError, "reason"):
            tool.render_plan(self.root, self._write_plan(plan), False)

    def test_coverage_requires_section_evidence_and_heading_body_audit(self) -> None:
        plan = self._valid_plan()
        del plan["coverage"][1]["sourceEvidence"]
        with self.assertRaisesRegex(tool.ToolError, "sourceEvidence"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        plan = self._valid_plan()
        plan["coverage"][1]["sourceEvidence"] = "Invented evidence not in the section."
        with self.assertRaisesRegex(tool.ToolError, "exact source section body"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        plan = self._valid_plan()
        plan["coverage"][1]["headingBodyAudit"] = "mismatch"
        with self.assertRaisesRegex(tool.ToolError, "must be 'aligned'"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        plan = self._valid_plan()
        plan["coverage"][0]["headingBodyAudit"] = "aligned"
        with self.assertRaisesRegex(tool.ToolError, "must be 'umbrella'"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        plan = self._valid_plan()
        plan["coverage"][1]["claim"] = "The root concept is important."
        plan["files"][1]["nodes"][0]["versions"][0]["description"] = (
            "The root concept is important."
        )
        with self.assertRaisesRegex(tool.ToolError, "must share at least"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        plan = self._valid_plan()
        plan["files"][0]["nodes"][0]["references"] = []
        with self.assertRaisesRegex(tool.ToolError, "must reference at least two"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        plan = self._valid_plan()
        filler = (
            "This reading-map section organizes the related guidance under root concepts."
        )
        plan["files"][0]["nodes"][0]["body"] = filler
        plan["coverage"][0]["claim"] = filler
        with self.assertRaisesRegex(tool.ToolError, "generic navigation filler"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        plan = self._valid_plan()
        plan["coverage"][0]["claim"] = "A claim absent from the source map."
        with self.assertRaisesRegex(tool.ToolError, "targeted generated source body"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        plan = self._valid_plan()
        plan["coverage"][1]["targets"] = [ROOT_ID]
        with self.assertRaisesRegex(tool.ToolError, "version IDs"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        plan = self._valid_plan()
        plan["coverage"][2]["targets"] = [ROOT_VERSION_ID]
        plan["coverage"][2]["claim"] = "The root concept is a foundation."
        with self.assertRaisesRegex(tool.ToolError, "reuses version"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        plan = self._valid_plan()
        plan["coverage"][1]["claim"] = "A claim absent from the targeted card answer."
        with self.assertRaisesRegex(tool.ToolError, "targeted version answer"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        plan = self._valid_plan()
        plan["coverage"][0] = {
            "source": "input.org",
            "section": "L1: Root and child concepts",
            "sourceEvidence": "Root concept Foundation.",
            "headingBodyAudit": "umbrella",
            "disposition": "source",
            "claim": "A compact map relates the root concept to its dependent child.",
            "targets": [SOURCE_ID],
        }
        with self.assertRaisesRegex(tool.ToolError, "reason"):
            tool.render_plan(self.root, self._write_plan(plan), False)

    def test_plan_rejects_duplicate_definition_prompts_on_one_node(self) -> None:
        plan = self._valid_plan()
        root = plan["files"][1]["nodes"][0]
        root.pop("singleVersionReason")
        root["versions"].append(
            {
                "id": "60f7a06a-962d-4e73-ae32-a59d4e22cbac",
                "role": "contrast",
                "prompt": "  WHAT is the root concept?  ",
                "description": "A deliberately conflicting answer.",
            }
        )
        with self.assertRaisesRegex(tool.ToolError, "duplicates versions"):
            tool.render_plan(self.root, self._write_plan(plan), False)

    def test_render_preflight_rejects_managed_cycle_without_writing(self) -> None:
        plan = self._valid_plan()
        root_definition = plan["files"][1]["nodes"][0]
        root_definition["prerequisites"] = [CHILD_ID]

        with self.assertRaisesRegex(tool.ToolError, "graph.cycle"):
            tool.render_plan(self.root, self._write_plan(plan), False)
        self.assertFalse((self.root / "topic-map.org").exists())
        self.assertFalse((self.root / "topic-graph.org").exists())

    def test_analysis_warns_about_a_source_order_chain(self) -> None:
        plan = self._valid_plan()
        graph_nodes = plan["files"][1]["nodes"][:2]
        previous_id = CHILD_ID
        for index in range(1, 7):
            node_id = str(uuid.uuid4())
            version_id = str(uuid.uuid4())
            graph_nodes.append(
                {
                    "id": node_id,
                    "type": "definition",
                    "title": f"Linear concept {index}",
                    "prerequisites": [previous_id],
                    "singleVersionReason": "Deliberately constructs a chain diagnostic fixture.",
                    "versions": [
                        {
                            "id": version_id,
                            "role": "core",
                            "prompt": f"What is linear concept {index}?",
                            "description": f"At chain step {index}, apply distinct operation {index}.",
                        }
                    ],
                }
            )
            previous_id = node_id
        plan["files"][1]["nodes"] = graph_nodes

        result = tool.render_plan(self.root, self._write_plan(plan), False)
        codes = {item["code"] for item in result["analysis"]["diagnostics"]}
        self.assertIn("graph.chain_like", codes)
        with self.assertRaisesRegex(tool.ToolError, "graph.chain_like"):
            tool.check_plan(self.root, self._write_plan(plan))

    def test_plan_requires_justified_roots_and_linked_exercises(self) -> None:
        plan = self._valid_plan()
        del plan["files"][1]["nodes"][0]["rootReason"]
        with self.assertRaisesRegex(tool.ToolError, "rootReason"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        plan = self._valid_plan()
        plan["files"][1]["nodes"][2]["prerequisites"] = []
        with self.assertRaisesRegex(tool.ToolError, "must depend on at least one"):
            tool.render_plan(self.root, self._write_plan(plan), False)

    def test_plan_requires_a_reason_for_an_isolated_definition_root(self) -> None:
        plan = self._valid_plan()
        root = plan["files"][1]["nodes"][0]
        plan["files"][1]["nodes"] = [root]
        plan["files"] = [plan["files"][1]]
        plan["coverage"][0] = {
            "source": "input.org",
            "section": "L1: Root and child concepts",
            "sourceEvidence": "Root concept Foundation.",
            "headingBodyAudit": "aligned",
            "disposition": "omit",
            "claim": "The root concept is a foundation.",
            "targets": [ROOT_VERSION_ID],
            "reason": "The reduced fixture preserves this umbrella's concept in the root card.",
        }
        plan["coverage"][2] = {
            "source": "input.org",
            "section": "L5: Root and child concepts > Child concept",
            "sourceEvidence": "Dependent.",
            "headingBodyAudit": "aligned",
            "disposition": "omit",
            "claim": "The child concept is dependent on the root.",
            "targets": [ROOT_VERSION_ID],
            "reason": "The reduced fixture treats this removed child claim as a duplicate of the root.",
        }
        plan["files"][1]["nodes"][0]["versions"][0]["description"] += (
            " The child concept is dependent on the root."
        )
        with self.assertRaisesRegex(tool.ToolError, "singletonReason"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        root["singletonReason"] = "This intentionally starts an independent future topic."
        result = tool.render_plan(self.root, self._write_plan(plan), False)
        self.assertTrue(result["complete"])
        self.assertEqual(1, result["analysis"]["graph"]["singletonCount"])
        with self.assertRaisesRegex(tool.ToolError, "unresolved quality warnings"):
            tool.check_plan(self.root, self._write_plan(plan))

    def test_coverage_rejects_source_demotion_and_unverifiable_omission(self) -> None:
        plan = self._valid_plan()
        plan["coverage"][2] = {
            "source": "input.org",
            "section": "L5: Root and child concepts > Child concept",
            "sourceEvidence": "Dependent.",
            "headingBodyAudit": "umbrella",
            "disposition": "source",
            "claim": "Second narrative claim.",
            "targets": [SOURCE_ID],
            "reason": "Deliberately source-heavy fixture.",
        }
        plan["files"][0]["nodes"][0]["body"] += " Second narrative claim."
        with self.assertRaisesRegex(tool.ToolError, "outline leaf"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        plan = self._valid_plan()
        plan["coverage"][2] = {
            "source": "input.org",
            "section": "L5: Root and child concepts > Child concept",
            "sourceEvidence": "Dependent.",
            "headingBodyAudit": "aligned",
            "disposition": "omit",
            "claim": "A supposedly duplicate claim that was never preserved.",
            "targets": [ROOT_VERSION_ID],
            "reason": "Deliberately false duplicate assertion.",
        }
        with self.assertRaisesRegex(tool.ToolError, "already preserving target"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        (self.root / "input.org").write_text(
            "* First umbrella\nFirst.\n"
            "** Root concept\nFoundation.\n"
            "* Second umbrella\nSecond.\n"
            "** Child concept\nDependent.\n",
            encoding="utf-8",
        )
        plan = self._valid_plan()
        plan["coverage"] = [
            {
                "source": "input.org",
                "section": "L1: First umbrella",
                "sourceEvidence": "Root concept Foundation.",
                "headingBodyAudit": "umbrella",
                "disposition": "source",
                "claim": "The first narrative relates the root concept.",
                "targets": [SOURCE_ID],
                "reason": "Narrative umbrella.",
            },
            {
                "source": "input.org",
                "section": "L5: Second umbrella",
                "sourceEvidence": "Child concept Dependent.",
                "headingBodyAudit": "umbrella",
                "disposition": "source",
                "claim": "The second narrative relates the child concept.",
                "targets": [SOURCE_ID],
                "reason": "Narrative umbrella.",
            },
            {
                "source": "input.org",
                "section": "L3: First umbrella > Root concept",
                "sourceEvidence": "Foundation.",
                "headingBodyAudit": "aligned",
                "disposition": "definition",
                "claim": "The root concept is a foundation.",
                "targets": [ROOT_VERSION_ID],
            },
            {
                "source": "input.org",
                "section": "L7: Second umbrella > Child concept",
                "sourceEvidence": "Dependent.",
                "headingBodyAudit": "aligned",
                "disposition": "definition",
                "claim": "The child concept is dependent on the root.",
                "targets": [CHILD_VERSION_ID],
            },
        ]
        plan["files"][0]["nodes"][0]["body"] = (
            "The first narrative relates the root concept. "
            "The second narrative relates the child concept."
        )
        duplicate_plan = json.loads(json.dumps(plan))
        duplicate_plan["coverage"][1]["claim"] = (
            "The first narrative relates the root concept."
        )
        with self.assertRaisesRegex(tool.ToolError, "duplicates the source synthesis"):
            tool.render_plan(self.root, self._write_plan(duplicate_plan), False)

        with self.assertRaisesRegex(tool.ToolError, "above the default minority budget"):
            tool.render_plan(self.root, self._write_plan(plan), False)

    def test_coverage_rejects_preview_copy_named_method_misownership_and_uncertainty_dump(self) -> None:
        long_preview = (
            "This deliberately long source paragraph contains several clauses and examples so "
            "that blindly copying the bounded outline preview would create a mechanical, "
            "non-atomic card instead of a rewritten retrieval target for durable knowledge."
        )
        (self.root / "input.org").write_text(
            "* Root and child concepts\nOverview.\n"
            f"** Root concept\n{long_preview}\n"
            "** Child concept\nDependent.\n",
            encoding="utf-8",
        )
        plan = self._valid_plan()
        plan["coverage"][0]["sourceEvidence"] = "Root concept This deliberately"
        plan["coverage"][1]["sourceEvidence"] = "This deliberately long source paragraph"
        plan["coverage"][1]["claim"] = long_preview
        plan["files"][1]["nodes"][0]["versions"][0]["description"] = long_preview
        with self.assertRaisesRegex(tool.ToolError, "copies the bounded outline bodyPreview"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        (self.root / "input.org").write_text(
            "* Root and child concepts\nOverview.\n"
            "** Root concept\nFoundation.\n"
            "*** First facet\nFirst detail.\n"
            "*** Second facet\nSecond detail.\n"
            "** Child concept\nDependent.\n",
            encoding="utf-8",
        )
        plan = self._valid_plan()
        with self.assertRaisesRegex(tool.ToolError, "rich section to a single-version concept"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        (self.root / "input.org").write_text(
            "* Root and child concepts\nOverview.\n"
            "** Root concept\nFoundation.\n"
            "** A. Named method\nDependent.\n",
            encoding="utf-8",
        )
        plan = self._valid_plan()
        plan["coverage"][2]["section"] = (
            "L5: Root and child concepts > A. Named method"
        )
        with self.assertRaisesRegex(tool.ToolError, "different owner node"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        (self.root / "input.org").write_text(
            "* Root and child concepts\nOverview.\n"
            "** Root concept\nFoundation.\n"
            "** Child concept\nDependent.\n",
            encoding="utf-8",
        )
        plan = self._valid_plan()
        plan["coverage"][1] = {
            "source": "input.org",
            "section": "L3: Root and child concepts > Root concept",
            "sourceEvidence": "Foundation.",
            "headingBodyAudit": "mismatch",
            "disposition": "uncertain",
            "claim": "The root foundation section is ambiguous.",
            "targets": [],
            "reason": "The term has two incompatible meanings in the source.",
        }
        plan["coverage"][2] = {
            "source": "input.org",
            "section": "L5: Root and child concepts > Child concept",
            "sourceEvidence": "Dependent.",
            "headingBodyAudit": "mismatch",
            "disposition": "uncertain",
            "claim": "The dependent child section is ambiguous.",
            "targets": [],
            "reason": "The child statement contradicts its worked example.",
        }
        targeted_uncertainty = json.loads(json.dumps(plan))
        targeted_uncertainty["coverage"][1]["targets"] = [ROOT_VERSION_ID]
        with self.assertRaisesRegex(tool.ToolError, "must be empty for uncertain"):
            tool.render_plan(self.root, self._write_plan(targeted_uncertainty), False)

        with self.assertRaisesRegex(tool.ToolError, "above the review budget"):
            tool.render_plan(self.root, self._write_plan(plan), False)

    def test_render_imports_versioned_quest(self) -> None:
        plan = {
            "schema": 1,
            "planId": "5d3a4f53-b06c-40f5-8f1a-c927f6623bc7",
            "files": [
                {
                    "path": "quest.org",
                    "title": "Quest",
                    "nodes": [
                        {
                            "id": "fda5ac50-c26c-4970-9fe0-26340fa2a9ae",
                            "type": "quest",
                            "title": "Refine this graph",
                            "scheduled": "<2030-01-01 Tue 09:00>",
                            "versions": [
                                {
                                    "id": "71958dea-c1ae-4de3-9019-8af82eea73de",
                                    "title": "Detach the overloaded version",
                                    "description": "Create a reusable child definition.",
                                }
                            ],
                        }
                    ],
                }
            ],
        }

        tool.render_plan(self.root, self._write_plan(plan), False)
        node = tool._nodes(tool._emacs_snapshot(self.root))[
            "fda5ac50-c26c-4970-9fe0-26340fa2a9ae"
        ]
        self.assertEqual("quest", node["type"])
        self.assertEqual("todo", node["quest"]["kind"])
        self.assertEqual("Detach the overloaded version", node["quest"]["versions"][0]["title"])

    def test_inventory_find_and_dependencies_use_adapter_snapshot(self) -> None:
        tool.render_plan(self.root, self._write_plan(self._valid_plan()), False)
        snapshot = tool._emacs_snapshot(self.root)
        records = tool.inventory(snapshot)["nodes"]
        child = next(node for node in records if node["id"] == CHILD_ID)
        self.assertEqual(1, child["versionCount"])
        self.assertEqual([ROOT_ID], child["prerequisites"])
        self.assertEqual([EXERCISE_ID], child["dependents"])
        self.assertEqual(CHILD_ID, tool._resolve_node(snapshot, "Child concept")["sourceId"])

        recursive = tool.dependency_view(snapshot, EXERCISE_ID, "prerequisites", True)
        self.assertEqual(
            [CHILD_ID, ROOT_ID],
            [node["id"] for node in recursive["results"]],
        )

    def test_analysis_reports_cycle_invalid_direction_and_singleton(self) -> None:
        snapshot = {
            "protocolVersion": 1,
            "provider": "org-roam",
            "complete": True,
            "notebook": {
                "providerNotebookId": "test-notebook",
                "schema": 1,
                "title": "Test notebook",
            },
            "diagnostics": [],
            "nodes": [
                {"sourceId": "d1", "code": "d1", "type": "definition", "name": "D1", "definition": {"versions": [{"sourceId": "d1-v1", "prompt": "D1?"}]}},
                {"sourceId": "d2", "code": "d2", "type": "definition", "name": "D2", "definition": {"versions": [{"sourceId": "d2-v1", "prompt": "D2?"}]}},
                {"sourceId": "e1", "code": "e1", "type": "exercise", "name": "E1", "exercise": {"versions": [{"sourceId": "e1-v1", "statement": "E1?", "difficulty": 3, "verifiable": False}]}},
                {"sourceId": "d3", "code": "d3", "type": "definition", "name": "D3", "definition": {"versions": [{"sourceId": "d3-v1", "prompt": "D3?"}]}},
            ],
            "edges": [
                {"fromSourceId": "d1", "toSourceId": "d2", "ownerSourceId": "d2"},
                {"fromSourceId": "d2", "toSourceId": "d1", "ownerSourceId": "d1"},
                {"fromSourceId": "e1", "toSourceId": "d2", "ownerSourceId": "d2"},
            ],
        }

        result = tool.analyze_snapshot(snapshot)
        codes = [item["code"] for item in result["diagnostics"]]
        self.assertFalse(result["complete"])
        self.assertIn("graph.cycle", codes)
        self.assertIn("link.invalid_type", codes)
        self.assertIn("graph.singleton", codes)
        self.assertIn("graph.exercise_without_prerequisite", codes)
        self.assertIn("graph.fragmented", codes)
        self.assertIn("id.non_uuid", codes)
        self.assertEqual(4, result["graph"]["managedNodeCount"])
        self.assertEqual(3, result["graph"]["managedEdgeCount"])
        self.assertEqual(2, result["graph"]["componentCount"])
        self.assertEqual(1, result["graph"]["singletonCount"])
        self.assertIsNone(result["graph"]["maxDepth"])

    def test_analysis_flags_a_large_fragmented_shallow_graph(self) -> None:
        snapshot = {
            "protocolVersion": 1,
            "provider": "org-roam",
            "complete": True,
            "notebook": {"providerNotebookId": "n", "schema": 1, "title": "N"},
            "diagnostics": [],
            "nodes": [
                {
                    "sourceId": f"d{index}",
                    "code": f"d{index}",
                    "type": "definition",
                    "name": f"D{index}",
                    "definition": {
                        "versions": [
                            {"sourceId": f"d{index}-v1", "prompt": f"D{index}?"}
                        ]
                    },
                }
                for index in range(8)
            ],
            "edges": [],
        }

        result = tool.analyze_snapshot(snapshot)
        codes = [item["code"] for item in result["diagnostics"]]
        self.assertTrue(result["complete"])
        self.assertIn("graph.fragmented", codes)
        self.assertIn("graph.shallow", codes)
        self.assertIn("versions.uniform_single", codes)
        self.assertEqual(8, result["graph"]["componentCount"])
        self.assertEqual(8, result["graph"]["rootCount"])
        self.assertEqual(8, result["graph"]["singletonCount"])
        self.assertEqual(0, result["graph"]["maxDepth"])

    def test_analysis_flags_an_artificial_two_version_cap(self) -> None:
        snapshot = {
            "protocolVersion": 1,
            "provider": "org-roam",
            "complete": True,
            "notebook": {"providerNotebookId": "n", "schema": 1, "title": "N"},
            "diagnostics": [],
            "nodes": [
                {
                    "sourceId": f"d{index}",
                    "code": f"d{index}",
                    "type": "definition",
                    "name": f"D{index}",
                    "definition": {
                        "versions": [
                            {"sourceId": f"d{index}-v1", "prompt": f"D{index} core?"},
                            {"sourceId": f"d{index}-v2", "prompt": f"D{index} use?"},
                        ]
                    },
                }
                for index in range(8)
            ],
            "edges": [],
        }

        result = tool.analyze_snapshot(snapshot)
        codes = [item["code"] for item in result["diagnostics"]]
        self.assertIn("versions.two_dominated", codes)
        self.assertNotIn("versions.uniform_single", codes)

    def test_analysis_flags_concentrated_versions_and_leaf_dominance(self) -> None:
        nodes = []
        for index, version_count in enumerate([20, 2, 2, 2, 2, 2, 2, 2]):
            nodes.append(
                {
                    "sourceId": f"d{index}",
                    "code": f"d{index}",
                    "type": "definition",
                    "name": f"D{index}",
                    "definition": {
                        "versions": [
                            {"sourceId": f"d{index}-v{version}", "prompt": "Specific?"}
                            for version in range(version_count)
                        ]
                    },
                }
            )
        snapshot = {
            "protocolVersion": 1,
            "provider": "org-roam",
            "complete": True,
            "notebook": {"providerNotebookId": "n", "schema": 1, "title": "N"},
            "diagnostics": [],
            "nodes": nodes,
            "edges": [
                {"fromSourceId": "d0", "toSourceId": f"d{index}", "ownerSourceId": f"d{index}"}
                for index in range(1, 8)
            ],
        }

        result = tool.analyze_snapshot(snapshot)
        codes = [item["code"] for item in result["diagnostics"]]
        self.assertIn("versions.concentrated", codes)
        self.assertIn("versions.large_node", codes)
        self.assertIn("graph.leaf_dominated", codes)

    def test_analysis_matches_server_level_code_version_and_difficulty_checks(self) -> None:
        snapshot = {
            "protocolVersion": 1,
            "provider": "org-roam",
            "complete": True,
            "notebook": {"providerNotebookId": "n", "schema": 1, "title": "N"},
            "diagnostics": [],
            "nodes": [
                {
                    "sourceId": "d1",
                    "type": "definition",
                    "code": "duplicate",
                    "name": "D1",
                    "definition": {"versions": [{"sourceId": "shared-v", "prompt": "D1?"}]},
                },
                {
                    "sourceId": "e1",
                    "type": "exercise",
                    "code": "duplicate",
                    "name": "E1",
                    "exercise": {
                        "versions": [
                            {
                                "sourceId": "shared-v",
                                "statement": "E1?",
                                "difficulty": 8,
                                "verifiable": True,
                                "solutionMd": "",
                            }
                        ]
                    },
                },
            ],
            "edges": [],
        }

        result = tool.analyze_snapshot(snapshot)
        codes = [item["code"] for item in result["diagnostics"]]
        self.assertFalse(result["complete"])
        self.assertIn("code.duplicate", codes)
        self.assertIn("id.duplicate", codes)
        self.assertIn("field.invalid_value", codes)
        self.assertIn("exercise.solution_required", codes)


if __name__ == "__main__":
    unittest.main()
