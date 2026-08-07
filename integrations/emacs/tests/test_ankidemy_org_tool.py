#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


TOOL_PATH = Path(__file__).parents[1] / "ankidemy_org_tool.py"
SPEC = importlib.util.spec_from_file_location("ankidemy_org_tool", TOOL_PATH)
assert SPEC and SPEC.loader
tool = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(tool)


class AnkidemyOrgToolTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory(prefix="ankidemy-org-tool-test-")
        self.root = Path(self.temporary.name)
        tool.init_notebook(self.root, "Temporary notebook", "temporary-notebook")

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
            "planId": "plan-one",
            "sourceFiles": ["input.org"],
            "coverage": [
                {
                    "source": "input.org",
                    "section": "Root and child concepts",
                    "disposition": "definition",
                    "targets": ["definition-root", "definition-child"],
                }
            ],
            "files": [
                {
                    "path": "topic-map.org",
                    "title": "Topic Map",
                    "nodes": [
                        {
                            "id": "source-map",
                            "type": "source",
                            "title": "Topic reading map",
                            "body": "A compact narrative map.",
                            "references": [{"id": "definition-root", "label": "root"}],
                        }
                    ],
                },
                {
                    "path": "topic-graph.org",
                    "title": "Topic Graph",
                    "nodes": [
                        {
                            "id": "definition-root",
                            "type": "definition",
                            "title": "Root concept",
                            "rootReason": "This is the foundation introduced by the source.",
                            "versions": [
                                {
                                    "id": "definition-root-v1",
                                    "prompt": "What is the root concept?",
                                    "description": "The foundational concept.",
                                    "notes": "Keep the answer atomic.",
                                }
                            ],
                        },
                        {
                            "id": "definition-child",
                            "type": "definition",
                            "title": "Child concept",
                            "parent": "definition-root",
                            "versions": [
                                {
                                    "id": "definition-child-v1",
                                    "prompt": "What is the child concept?",
                                    "description": "A concept requiring the root.",
                                }
                            ],
                        },
                        {
                            "id": "exercise-child",
                            "type": "exercise",
                            "title": "Apply the child concept",
                            "prerequisites": ["definition-child"],
                            "versions": [
                                {
                                    "id": "exercise-child-v1",
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
        result = tool.render_plan(self.root, self._write_plan(self._valid_plan()), False)

        self.assertTrue(result["complete"])
        self.assertEqual(["topic-map.org", "topic-graph.org"], result["files"])
        graph = (self.root / "topic-graph.org").read_text(encoding="utf-8")
        self.assertIn("#+ankidemy_generated: distill-notes-to-ankidemy/v1", graph)
        self.assertIn("** Child concept", graph)
        self.assertIn("[[id:definition-child][Child concept]]", graph)

        snapshot = tool._emacs_snapshot(self.root)
        analysis = tool.analyze_snapshot(snapshot)
        self.assertTrue(analysis["complete"], analysis["diagnostics"])
        self.assertEqual(4, analysis["nodeCount"])
        self.assertEqual(3, analysis["edgeCount"])
        self.assertEqual(3, analysis["graph"]["managedNodeCount"])
        self.assertEqual(2, analysis["graph"]["managedEdgeCount"])
        self.assertEqual(1, analysis["graph"]["componentCount"])
        self.assertEqual(1, analysis["graph"]["rootCount"])
        self.assertEqual(0, analysis["graph"]["singletonCount"])
        self.assertEqual(2, analysis["graph"]["maxDepth"])

    def test_render_refuses_overwrite_and_replaces_only_same_plan(self) -> None:
        plan = self._valid_plan()
        plan_path = self._write_plan(plan)
        tool.render_plan(self.root, plan_path, False)

        with self.assertRaisesRegex(tool.ToolError, "refusing to overwrite"):
            tool.render_plan(self.root, plan_path, False)

        plan["files"][0]["nodes"][0]["body"] = "Revised narrative."
        plan_path.write_text(json.dumps(plan), encoding="utf-8")
        tool.render_plan(self.root, plan_path, True)
        self.assertIn("Revised narrative.", (self.root / "topic-map.org").read_text())

        plan["planId"] = "different-plan"
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
        definition["prerequisites"] = ["exercise-child"]
        with self.assertRaisesRegex(tool.ToolError, "cannot depend on an exercise"):
            tool.render_plan(self.root, self._write_plan(plan), False)
        self.assertFalse((self.root / "topic-map.org").exists())

        plan = self._valid_plan()
        exercise_version = plan["files"][1]["nodes"][2]["versions"][0]
        exercise_version["solution"] = ""
        with self.assertRaisesRegex(tool.ToolError, "solution is required"):
            tool.render_plan(self.root, self._write_plan(plan), False)

    def test_render_preflight_rejects_managed_cycle_without_writing(self) -> None:
        plan = self._valid_plan()
        root_definition = plan["files"][1]["nodes"][0]
        root_definition["prerequisites"] = ["definition-child"]

        with self.assertRaisesRegex(tool.ToolError, "graph.cycle"):
            tool.render_plan(self.root, self._write_plan(plan), False)
        self.assertFalse((self.root / "topic-map.org").exists())
        self.assertFalse((self.root / "topic-graph.org").exists())

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
        plan["coverage"][0]["targets"] = ["definition-root"]
        with self.assertRaisesRegex(tool.ToolError, "singletonReason"):
            tool.render_plan(self.root, self._write_plan(plan), False)

        root["singletonReason"] = "This intentionally starts an independent future topic."
        result = tool.render_plan(self.root, self._write_plan(plan), False)
        self.assertTrue(result["complete"])
        self.assertEqual(1, result["analysis"]["graph"]["singletonCount"])

    def test_render_imports_versioned_quest(self) -> None:
        plan = {
            "schema": 1,
            "planId": "quest-plan",
            "files": [
                {
                    "path": "quest.org",
                    "title": "Quest",
                    "nodes": [
                        {
                            "id": "quest-id",
                            "type": "quest",
                            "title": "Refine this graph",
                            "scheduled": "<2030-01-01 Tue 09:00>",
                            "versions": [
                                {
                                    "id": "quest-v1",
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
        node = tool._nodes(tool._emacs_snapshot(self.root))["quest-id"]
        self.assertEqual("quest", node["type"])
        self.assertEqual("todo", node["quest"]["kind"])
        self.assertEqual("Detach the overloaded version", node["quest"]["versions"][0]["title"])

    def test_inventory_find_and_dependencies_use_adapter_snapshot(self) -> None:
        tool.render_plan(self.root, self._write_plan(self._valid_plan()), False)
        snapshot = tool._emacs_snapshot(self.root)
        records = tool.inventory(snapshot)["nodes"]
        child = next(node for node in records if node["id"] == "definition-child")
        self.assertEqual(["definition-root"], child["prerequisites"])
        self.assertEqual(["exercise-child"], child["dependents"])
        self.assertEqual("definition-child", tool._resolve_node(snapshot, "Child concept")["sourceId"])

        recursive = tool.dependency_view(snapshot, "exercise-child", "prerequisites", True)
        self.assertEqual(
            ["definition-child", "definition-root"],
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
        self.assertEqual(8, result["graph"]["componentCount"])
        self.assertEqual(8, result["graph"]["rootCount"])
        self.assertEqual(8, result["graph"]["singletonCount"])
        self.assertEqual(0, result["graph"]["maxDepth"])

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
