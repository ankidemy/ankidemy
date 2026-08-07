#!/usr/bin/env python3
"""Headless authoring utilities for Ankidemy Org-roam notebooks.

Org parsing stays in ankidemy-org-import.el.  This tool consumes its semantic
snapshot for discovery and graph analysis, and renders a deliberately small
JSON interchange format for agent-authored notes.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
from typing import Any, Iterable


ADAPTER = Path(__file__).with_name("ankidemy-org-import.el")
GENERATED_MARKER = "distill-notes-to-ankidemy/v1"
NODE_TYPES = {"source", "definition", "exercise", "quest"}
MANAGED_TYPES = {"definition", "exercise"}
COVERAGE_DISPOSITIONS = {"definition", "exercise", "source", "omit", "uncertain"}
CODE_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")


class ToolError(RuntimeError):
    """An actionable command or plan error."""


def _emacs_snapshot(root: Path) -> dict[str, Any]:
    root = root.resolve()
    expression = (
        "(progn (require 'ankidemy-org-import) "
        f"(princ (ankidemy-org-snapshot-json {json.dumps(str(root))})))"
    )
    command = [
        os.environ.get("ANKIDEMY_EMACS", "emacs"),
        "--batch",
        "-Q",
        "-L",
        str(ADAPTER.parent),
        "--eval",
        expression,
    ]
    try:
        result = subprocess.run(command, text=True, capture_output=True, check=False)
    except FileNotFoundError as exc:
        raise ToolError(f"cannot run Emacs: {command[0]}") from exc
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip()
        raise ToolError(f"Org adapter failed: {detail}")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise ToolError(f"Org adapter returned invalid JSON: {exc}") from exc


def _nodes(snapshot: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {node["sourceId"]: node for node in snapshot.get("nodes") or []}


def _local_edges(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        edge
        for edge in snapshot.get("edges") or []
        if edge.get("fromSourceId") and edge.get("toSourceId")
    ]


def _diagnostic(
    severity: str,
    code: str,
    message: str,
    source_id: str = "",
    related: Iterable[str] = (),
) -> dict[str, Any]:
    return {
        "severity": severity,
        "code": code,
        "message": message,
        "sourceId": source_id,
        "relatedSourceIds": list(related),
    }


def analyze_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Return importer diagnostics plus authoring-oriented graph diagnostics."""
    nodes = _nodes(snapshot)
    edges = _local_edges(snapshot)
    diagnostics = list(snapshot.get("diagnostics") or [])
    seen_ids: dict[str, str] = {}
    seen_codes: dict[str, str] = {}

    notebook = snapshot.get("notebook") or {}
    if snapshot.get("protocolVersion") != 1:
        diagnostics.append(_diagnostic("error", "protocol.unsupported", "protocolVersion must be 1"))
    if not str(snapshot.get("provider", "")).strip():
        diagnostics.append(_diagnostic("error", "provider.missing", "provider is required"))
    if (
        not str(notebook.get("providerNotebookId", "")).strip()
        or not str(notebook.get("title", "")).strip()
        or not isinstance(notebook.get("schema"), int)
        or notebook.get("schema", 0) < 1
    ):
        diagnostics.append(
            _diagnostic("error", "manifest.invalid", "notebook ID, schema, and title are required")
        )

    def record_id(identifier: Any, role: str, owner_id: str) -> None:
        value = str(identifier or "").strip()
        if not value:
            diagnostics.append(_diagnostic("error", "id.missing", f"{role} ID is required", owner_id))
        elif value in seen_ids:
            diagnostics.append(
                _diagnostic(
                    "error",
                    "id.duplicate",
                    f"ID {value!r} is already used by {seen_ids[value]}",
                    owner_id,
                    (value,),
                )
            )
        else:
            seen_ids[value] = role

    for node_id, node in nodes.items():
        record_id(node_id, node.get("type", "node"), node_id)
        code = str(node.get("code", ""))
        if not CODE_PATTERN.fullmatch(code):
            diagnostics.append(
                _diagnostic("error", "code.invalid", f"invalid code {code!r}", node_id)
            )
        elif code in seen_codes:
            diagnostics.append(
                _diagnostic(
                    "error",
                    "code.duplicate",
                    f"code {code!r} is also used by {seen_codes[code]}",
                    node_id,
                )
            )
        else:
            seen_codes[code] = node_id
        if not str(node.get("name", "")).strip():
            diagnostics.append(_diagnostic("error", "node.name_missing", "node name is required", node_id))

        if node.get("type") == "definition":
            versions = (node.get("definition") or {}).get("versions") or []
            if not versions:
                diagnostics.append(
                    _diagnostic("error", "version.missing", "definition requires a version", node_id)
                )
            for version in versions:
                version_id = version.get("sourceId", "")
                record_id(version_id, "definition_version", node_id)
                if not str(version.get("prompt", "")).strip():
                    diagnostics.append(
                        _diagnostic("error", "version.prompt_missing", "prompt is required", version_id)
                    )
        elif node.get("type") == "exercise":
            versions = (node.get("exercise") or {}).get("versions") or []
            if not versions:
                diagnostics.append(
                    _diagnostic("error", "version.missing", "exercise requires a version", node_id)
                )
            for version in versions:
                version_id = version.get("sourceId", "")
                record_id(version_id, "exercise_version", node_id)
                difficulty = version.get("difficulty")
                if isinstance(difficulty, bool) or not isinstance(difficulty, int) or not 1 <= difficulty <= 7:
                    diagnostics.append(
                        _diagnostic(
                            "error",
                            "field.invalid_value",
                            "exercise difficulty must be between 1 and 7",
                            version_id,
                        )
                    )
                if version.get("verifiable") is True and not str(version.get("solutionMd", "")).strip():
                    diagnostics.append(
                        _diagnostic(
                            "error",
                            "exercise.solution_required",
                            "verifiable exercise requires a solution",
                            version_id,
                        )
                    )
        elif node.get("type") == "quest":
            for version in (node.get("quest") or {}).get("versions") or []:
                version_id = version.get("sourceId", "")
                record_id(version_id, "quest_version", node_id)
                if not str(version.get("title", "")).strip():
                    diagnostics.append(
                        _diagnostic("error", "version.title_missing", "title is required", version_id)
                    )

    managed_ids = {node_id for node_id, node in nodes.items() if node["type"] in MANAGED_TYPES}
    adjacency: dict[str, set[str]] = {node_id: set() for node_id in managed_ids}
    undirected: dict[str, set[str]] = {node_id: set() for node_id in managed_ids}
    in_degree = {node_id: 0 for node_id in managed_ids}
    out_degree = {node_id: 0 for node_id in managed_ids}

    for edge in edges:
        source_id = edge["fromSourceId"]
        target_id = edge["toSourceId"]
        source = nodes.get(source_id)
        target = nodes.get(target_id)
        if not source or not target:
            diagnostics.append(
                _diagnostic(
                    "error",
                    "link.unresolved",
                    f"edge endpoint is missing: {source_id} -> {target_id}",
                    edge.get("ownerSourceId", ""),
                    (source_id, target_id),
                )
            )
            continue
        if source["type"] == "exercise" and target["type"] == "definition":
            diagnostics.append(
                _diagnostic(
                    "error",
                    "link.invalid_type",
                    "exercise cannot be a prerequisite of a definition",
                    edge.get("ownerSourceId", ""),
                    (source_id, target_id),
                )
            )
        if source_id in managed_ids and target_id in managed_ids:
            if target_id not in adjacency[source_id]:
                adjacency[source_id].add(target_id)
                undirected[source_id].add(target_id)
                undirected[target_id].add(source_id)
                out_degree[source_id] += 1
                in_degree[target_id] += 1

    state: dict[str, int] = {}
    stack: list[str] = []
    reported_cycles: set[tuple[str, ...]] = set()

    def visit(node_id: str) -> None:
        state[node_id] = 1
        stack.append(node_id)
        for next_id in adjacency[node_id]:
            if state.get(next_id, 0) == 0:
                visit(next_id)
            elif state.get(next_id) == 1:
                start = stack.index(next_id)
                cycle = tuple(stack[start:] + [next_id])
                canonical = tuple(sorted(set(cycle)))
                if canonical not in reported_cycles:
                    reported_cycles.add(canonical)
                    diagnostics.append(
                        _diagnostic(
                            "error",
                            "graph.cycle",
                            "managed prerequisite graph contains a cycle: "
                            + " -> ".join(cycle),
                            node_id,
                            cycle,
                        )
                    )
        stack.pop()
        state[node_id] = 2

    for node_id in sorted(adjacency):
        if state.get(node_id, 0) == 0:
            visit(node_id)

    singleton_ids = sorted(
        node_id
        for node_id in managed_ids
        if in_degree[node_id] == 0 and out_degree[node_id] == 0
    )
    for node_id in singleton_ids:
        diagnostics.append(
            _diagnostic(
                "warning",
                "graph.singleton",
                f'{nodes[node_id]["type"]} has no managed prerequisite relations',
                node_id,
            )
        )

    exercise_roots = sorted(
        node_id
        for node_id in managed_ids
        if nodes[node_id]["type"] == "exercise" and in_degree[node_id] == 0
    )
    for node_id in exercise_roots:
        diagnostics.append(
            _diagnostic(
                "warning",
                "graph.exercise_without_prerequisite",
                "exercise has no managed prerequisite and therefore tests no linked concept",
                node_id,
            )
        )

    components: list[list[str]] = []
    unvisited = set(managed_ids)
    while unvisited:
        start = min(unvisited)
        component: list[str] = []
        queue = [start]
        unvisited.remove(start)
        while queue:
            current = queue.pop(0)
            component.append(current)
            for neighbor in sorted(undirected[current]):
                if neighbor in unvisited:
                    unvisited.remove(neighbor)
                    queue.append(neighbor)
        components.append(sorted(component))
    components.sort(key=lambda item: (-len(item), item))

    root_ids = sorted(node_id for node_id in managed_ids if in_degree[node_id] == 0)
    leaf_ids = sorted(node_id for node_id in managed_ids if out_degree[node_id] == 0)
    max_depth: int | None = None
    if not reported_cycles:
        remaining_in_degree = dict(in_degree)
        depths = {node_id: 0 for node_id in root_ids}
        queue = list(root_ids)
        while queue:
            current = queue.pop(0)
            for dependent in sorted(adjacency[current]):
                depths[dependent] = max(depths.get(dependent, 0), depths[current] + 1)
                remaining_in_degree[dependent] -= 1
                if remaining_in_degree[dependent] == 0:
                    queue.append(dependent)
        max_depth = max(depths.values(), default=0)

    managed_count = len(managed_ids)
    component_count = len(components)
    if managed_count >= 4 and component_count > max(1, managed_count // 4):
        diagnostics.append(
            _diagnostic(
                "warning",
                "graph.fragmented",
                f"managed graph is split into {component_count} components across {managed_count} nodes",
                related=singleton_ids,
            )
        )
    if managed_count >= 8 and max_depth is not None and max_depth < 2:
        diagnostics.append(
            _diagnostic(
                "warning",
                "graph.shallow",
                f"managed graph maximum prerequisite depth is only {max_depth} across {managed_count} nodes",
                related=root_ids,
            )
        )

    graph = {
        "managedNodeCount": managed_count,
        "managedEdgeCount": sum(out_degree.values()),
        "componentCount": component_count,
        "components": [
            {
                "size": len(component),
                "nodeIds": component,
                "nodeNames": [nodes[node_id]["name"] for node_id in component],
            }
            for component in components
        ],
        "rootCount": len(root_ids),
        "roots": root_ids,
        "leafCount": len(leaf_ids),
        "leaves": leaf_ids,
        "singletonCount": len(singleton_ids),
        "singletons": singleton_ids,
        "maxDepth": max_depth,
    }

    return {
        "complete": snapshot.get("complete") is True
        and not any(item.get("severity") == "error" for item in diagnostics),
        "nodeCount": len(nodes),
        "edgeCount": len(edges),
        "graph": graph,
        "diagnostics": diagnostics,
    }


def _resolve_node(snapshot: dict[str, Any], query: str) -> dict[str, Any]:
    normalized = query.casefold()
    exact = [
        node
        for node in snapshot.get("nodes") or []
        if normalized in {str(node.get(field, "")).casefold() for field in ("sourceId", "code", "name")}
    ]
    if len(exact) == 1:
        return exact[0]
    partial = [
        node
        for node in snapshot.get("nodes") or []
        if any(normalized in str(node.get(field, "")).casefold() for field in ("sourceId", "code", "name"))
    ]
    matches = exact or partial
    if not matches:
        raise ToolError(f"no node matches {query!r}")
    if len(matches) > 1:
        choices = ", ".join(f'{node["name"]} ({node["sourceId"]})' for node in matches)
        raise ToolError(f"ambiguous node {query!r}: {choices}")
    return matches[0]


def inventory(snapshot: dict[str, Any]) -> dict[str, Any]:
    nodes = _nodes(snapshot)
    prerequisites: dict[str, list[str]] = {}
    dependents: dict[str, list[str]] = {}
    references: dict[str, list[str]] = {}
    referenced_by: dict[str, list[str]] = {}
    for edge in _local_edges(snapshot):
        source_id, target_id = edge["fromSourceId"], edge["toSourceId"]
        source = nodes.get(source_id)
        target = nodes.get(target_id)
        if source and target and source["type"] in MANAGED_TYPES and target["type"] in MANAGED_TYPES:
            prerequisites.setdefault(target_id, []).append(source_id)
            dependents.setdefault(source_id, []).append(target_id)
        else:
            references.setdefault(source_id, []).append(target_id)
            referenced_by.setdefault(target_id, []).append(source_id)
    records = []
    for node in snapshot.get("nodes") or []:
        node_id = node["sourceId"]
        records.append(
            {
                "id": node_id,
                "code": node.get("code", ""),
                "type": node["type"],
                "name": node["name"],
                "file": (node.get("location") or {}).get("file", ""),
                "prerequisites": sorted(prerequisites.get(node_id, [])),
                "dependents": sorted(dependents.get(node_id, [])),
                "references": sorted(references.get(node_id, [])),
                "referencedBy": sorted(referenced_by.get(node_id, [])),
            }
        )
    return {"complete": snapshot.get("complete") is True, "nodes": records}


def dependency_view(
    snapshot: dict[str, Any], query: str, direction: str, recursive: bool
) -> dict[str, Any]:
    start = _resolve_node(snapshot, query)
    mapping: dict[str, list[str]] = {}
    nodes = _nodes(snapshot)
    for edge in _local_edges(snapshot):
        source_id, target_id = edge["fromSourceId"], edge["toSourceId"]
        if (
            source_id not in nodes
            or target_id not in nodes
            or nodes[source_id]["type"] not in MANAGED_TYPES
            or nodes[target_id]["type"] not in MANAGED_TYPES
        ):
            continue
        if direction == "prerequisites":
            mapping.setdefault(target_id, []).append(source_id)
        else:
            mapping.setdefault(source_id, []).append(target_id)
    found: list[str] = []
    queue = list(mapping.get(start["sourceId"], []))
    seen = set(queue)
    while queue:
        current = queue.pop(0)
        found.append(current)
        if recursive:
            for next_id in mapping.get(current, []):
                if next_id not in seen:
                    seen.add(next_id)
                    queue.append(next_id)
    return {
        "node": {"id": start["sourceId"], "name": start["name"], "type": start["type"]},
        "direction": direction,
        "recursive": recursive,
        "results": [
            {"id": node_id, "name": nodes[node_id]["name"], "type": nodes[node_id]["type"]}
            for node_id in found
            if node_id in nodes
        ],
    }


def _require_string(value: Any, context: str, allow_empty: bool = False) -> str:
    if not isinstance(value, str) or (not allow_empty and not value.strip()):
        raise ToolError(f"{context} must be a non-empty string")
    return value


def _relations(value: Any, context: str) -> list[dict[str, str]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ToolError(f"{context} must be a list")
    result = []
    for index, item in enumerate(value):
        if isinstance(item, str):
            result.append({"id": _require_string(item, f"{context}[{index}]")})
        elif isinstance(item, dict):
            relation = {"id": _require_string(item.get("id"), f"{context}[{index}].id")}
            if "label" in item:
                relation["label"] = _require_string(item["label"], f"{context}[{index}].label")
            result.append(relation)
        else:
            raise ToolError(f"{context}[{index}] must be an ID or relation object")
    return result


def _validate_plan(
    plan: dict[str, Any],
    snapshot: dict[str, Any],
    root: Path,
    replacing_paths: set[Path] | None = None,
) -> dict[str, Any]:
    if plan.get("schema") != 1:
        raise ToolError("plan.schema must be 1")
    plan_id = _require_string(plan.get("planId"), "plan.planId")
    files = plan.get("files")
    if not isinstance(files, list) or not files:
        raise ToolError("plan.files must be a non-empty list")

    replacing_paths = replacing_paths or set()
    existing = {
        node_id: node
        for node_id, node in _nodes(snapshot).items()
        if Path((node.get("location") or {}).get("file", "")) not in replacing_paths
    }
    known_types = {node_id: node["type"] for node_id, node in existing.items()}
    known_names = {node_id: node["name"] for node_id, node in existing.items()}
    new_ids: set[str] = set()
    normalized_files: list[dict[str, Any]] = []
    output_paths: set[Path] = set()

    for file_index, file_spec in enumerate(files):
        if not isinstance(file_spec, dict):
            raise ToolError(f"plan.files[{file_index}] must be an object")
        relative = Path(_require_string(file_spec.get("path"), f"plan.files[{file_index}].path"))
        if relative.is_absolute() or ".." in relative.parts or relative.suffix.lower() != ".org":
            raise ToolError(f"output path must be a relative .org file: {relative}")
        if relative.name == "ankidemy.org":
            raise ToolError("render cannot replace the notebook manifest")
        destination = (root / relative).resolve()
        try:
            destination.relative_to(root.resolve())
        except ValueError as exc:
            raise ToolError(f"output escapes notebook root: {relative}") from exc
        if relative in output_paths:
            raise ToolError(f"duplicate output path: {relative}")
        output_paths.add(relative)
        title = _require_string(file_spec.get("title"), f"plan.files[{file_index}].title")
        raw_nodes = file_spec.get("nodes")
        if not isinstance(raw_nodes, list) or not raw_nodes:
            raise ToolError(f"plan.files[{file_index}].nodes must be a non-empty list")
        nodes = []
        for node_index, raw_node in enumerate(raw_nodes):
            context = f"plan.files[{file_index}].nodes[{node_index}]"
            if not isinstance(raw_node, dict):
                raise ToolError(f"{context} must be an object")
            node = dict(raw_node)
            node_id = _require_string(node.get("id"), f"{context}.id")
            if node_id in existing or node_id in new_ids:
                raise ToolError(f"duplicate or existing node ID: {node_id}")
            node_type = _require_string(node.get("type"), f"{context}.type")
            if node_type not in NODE_TYPES:
                raise ToolError(f"unsupported node type {node_type!r}")
            _require_string(node.get("title"), f"{context}.title")
            node["prerequisites"] = _relations(node.get("prerequisites"), f"{context}.prerequisites")
            node["references"] = _relations(node.get("references"), f"{context}.references")
            new_ids.add(node_id)
            known_types[node_id] = node_type
            known_names[node_id] = node["title"]
            nodes.append(node)
        normalized_files.append(
            {"path": relative, "destination": destination, "title": title, "nodes": nodes}
        )

    for file_spec in normalized_files:
        file_node_ids = {node["id"] for node in file_spec["nodes"]}
        for node in file_spec["nodes"]:
            context = f'node {node["title"]!r}'
            parent = node.get("parent")
            if parent is not None:
                parent = _require_string(parent, f"{context}.parent")
                if parent == node["id"] or parent not in known_types:
                    raise ToolError(f"{context} has unknown or self parent {parent!r}")
            relation_ids = {item["id"] for item in node["prerequisites"] + node["references"]}
            unknown = sorted(relation_ids - known_types.keys())
            if unknown:
                raise ToolError(f"{context} refers to unknown IDs: {', '.join(unknown)}")
            if node["type"] in MANAGED_TYPES and parent in relation_ids:
                raise ToolError(f"{context} repeats its hierarchy parent as a prerequisite")
            if node["type"] == "definition":
                if parent and known_types[parent] == "exercise":
                    raise ToolError(f"definition {node['title']!r} cannot have an exercise parent")
                for relation in node["prerequisites"]:
                    if known_types[relation["id"]] == "exercise":
                        raise ToolError(f"definition {node['title']!r} cannot depend on an exercise")
            if node["type"] in MANAGED_TYPES:
                versions = node.get("versions")
                if not isinstance(versions, list) or not versions:
                    raise ToolError(f"{context}.versions must be a non-empty list")
                for version_index, version in enumerate(versions):
                    _validate_version(node["type"], version, f"{context}.versions[{version_index}]", new_ids)
            elif node["type"] == "quest":
                scheduled = _require_string(node.get("scheduled"), f"{context}.scheduled")
                if not (scheduled.startswith("<") and scheduled.endswith(">")):
                    raise ToolError(f"{context}.scheduled must be an active Org timestamp")
                versions = node.get("versions")
                if versions is not None:
                    if not isinstance(versions, list) or not versions:
                        raise ToolError(f"{context}.versions must be a non-empty list when present")
                    for version_index, version in enumerate(versions):
                        _validate_version("quest", version, f"{context}.versions[{version_index}]", new_ids)

        local_parents = {
            node["id"]: node.get("parent")
            for node in file_spec["nodes"]
            if node.get("parent") in file_node_ids
        }
        for node_id in local_parents:
            seen: set[str] = set()
            cursor = node_id
            while cursor in local_parents:
                if cursor in seen:
                    raise ToolError(f"outline parent cycle in {file_spec['path']}: {cursor}")
                seen.add(cursor)
                cursor = local_parents[cursor]

    planned_nodes = [node for file_spec in normalized_files for node in file_spec["nodes"]]
    planned_managed_ids = {
        node["id"] for node in planned_nodes if node["type"] in MANAGED_TYPES
    }
    managed_prerequisites: dict[str, set[str]] = {}
    planned_dependents = {node_id: 0 for node_id in planned_managed_ids}
    for node in planned_nodes:
        if node["type"] not in MANAGED_TYPES:
            continue
        prerequisites = {
            relation["id"]
            for relation in node["prerequisites"]
            if known_types[relation["id"]] in MANAGED_TYPES
        }
        parent = node.get("parent")
        if parent and known_types[parent] in MANAGED_TYPES:
            prerequisites.add(parent)
        managed_prerequisites[node["id"]] = prerequisites
        for prerequisite_id in prerequisites:
            if prerequisite_id in planned_dependents:
                planned_dependents[prerequisite_id] += 1

    for node in planned_nodes:
        if node["type"] not in MANAGED_TYPES:
            continue
        prerequisites = managed_prerequisites[node["id"]]
        if node["type"] == "exercise" and not prerequisites:
            raise ToolError(
                f"exercise {node['title']!r} must depend on at least one definition or exercise"
            )
        if node["type"] == "definition" and not prerequisites:
            _require_string(node.get("rootReason"), f"definition {node['title']!r}.rootReason")
            if planned_dependents[node["id"]] == 0:
                _require_string(
                    node.get("singletonReason"),
                    f"definition {node['title']!r}.singletonReason",
                )

    source_files = plan.get("sourceFiles", [])
    if not isinstance(source_files, list) or any(
        not isinstance(item, str) or not item.strip() for item in source_files
    ):
        raise ToolError("plan.sourceFiles must be a list of non-empty strings")
    coverage = plan.get("coverage", [])
    if not isinstance(coverage, list):
        raise ToolError("plan.coverage must be a list")
    for index, item in enumerate(coverage):
        context = f"plan.coverage[{index}]"
        if not isinstance(item, dict):
            raise ToolError(f"{context} must be an object")
        _require_string(item.get("source"), f"{context}.source")
        _require_string(item.get("section"), f"{context}.section")
        disposition = _require_string(item.get("disposition"), f"{context}.disposition")
        if disposition not in COVERAGE_DISPOSITIONS:
            raise ToolError(f"{context}.disposition is unsupported: {disposition!r}")
        targets = item.get("targets", [])
        if not isinstance(targets, list) or any(not isinstance(target, str) for target in targets):
            raise ToolError(f"{context}.targets must be a list of IDs")
        unknown_targets = sorted(set(targets) - known_types.keys())
        if unknown_targets:
            raise ToolError(f"{context} refers to unknown IDs: {', '.join(unknown_targets)}")
        if disposition in {"omit", "uncertain"}:
            _require_string(item.get("reason"), f"{context}.reason")

    return {
        "schema": 1,
        "planId": plan_id,
        "files": normalized_files,
        "knownNames": known_names,
    }


def _validate_version(node_type: str, version: Any, context: str, all_new_ids: set[str]) -> None:
    if not isinstance(version, dict):
        raise ToolError(f"{context} must be an object")
    version_id = _require_string(version.get("id"), f"{context}.id")
    if version_id in all_new_ids:
        raise ToolError(f"duplicate node/version ID: {version_id}")
    all_new_ids.add(version_id)
    title_field = {"definition": "prompt", "exercise": "statement", "quest": "title"}[node_type]
    _require_string(version.get(title_field), f"{context}.{title_field}")
    if node_type == "exercise":
        difficulty = version.get("difficulty", 3)
        if isinstance(difficulty, bool) or not isinstance(difficulty, int) or not 1 <= difficulty <= 7:
            raise ToolError(f"{context}.difficulty must be an integer from 1 to 7")
        verifiable = version.get("verifiable", False)
        if not isinstance(verifiable, bool):
            raise ToolError(f"{context}.verifiable must be a boolean")
        if verifiable and not str(version.get("solution", "")).strip():
            raise ToolError(f"{context}.solution is required when verifiable is true")


def _properties(values: list[tuple[str, str]], level: int) -> list[str]:
    del level
    lines = [":PROPERTIES:"]
    lines.extend(f":{key}: {value}" for key, value in values if value != "")
    lines.append(":END:")
    return lines


def _field(lines: list[str], level: int, title: str, tag: str, content: Any) -> None:
    if content is None or not str(content).strip():
        return
    lines.extend([f'{"*" * level} {title} :{tag}:', str(content).rstrip(), ""])


def _relation_text(relations: list[dict[str, str]], names: dict[str, str]) -> str:
    return ", ".join(
        f'[[id:{item["id"]}][{item.get("label") or names.get(item["id"], item["id"])}]]'
        for item in relations
    )


def _render_node(
    node: dict[str, Any], level: int, local_ids: set[str], names: dict[str, str]
) -> list[str]:
    node_type = node["type"]
    heading = f'{"*" * level} '
    if node_type == "quest":
        heading += f'{node.get("todoKeyword", "TODO")} '
    heading += node["title"]
    if node_type == "quest" and node.get("habit"):
        heading += " :habit:"
    lines = [heading]
    if node_type == "quest":
        lines.append(f'SCHEDULED: {node["scheduled"]}')
    properties = [("ID", node["id"]), ("ANKIDEMY_TYPE", node_type)]
    if node.get("code"):
        properties.append(("ANKIDEMY_CODE", str(node["code"])))
    if node.get("parent") and node["parent"] not in local_ids:
        properties.append(("ANKIDEMY_PARENT", str(node["parent"])))
    lines.extend(_properties(properties, level))

    relation_key = "prerequisites" if node_type in MANAGED_TYPES else "references"
    relations = node.get(relation_key) or []
    if relations:
        label = "Prerequisites" if relation_key == "prerequisites" else "Related"
        lines.extend([f"{label}: {_relation_text(relations, names)}", ""])
    body = node.get("body")
    if body is not None and str(body).strip():
        lines.extend([str(body).rstrip(), ""])

    for version in node.get("versions") or []:
        title_field = {"definition": "prompt", "exercise": "statement", "quest": "title"}[node_type]
        lines.append(f'{"*" * (level + 1)} {version[title_field]} :version:')
        version_properties = [("ID", version["id"]), ("ROAM_EXCLUDE", "t")]
        if node_type == "exercise":
            version_properties.extend(
                [
                    ("ANKIDEMY_DIFFICULTY", str(version.get("difficulty", 3))),
                    ("ANKIDEMY_VERIFIABLE", "t" if version.get("verifiable", False) else "nil"),
                ]
            )
        lines.extend(_properties(version_properties, level + 1))
        description = version.get("description")
        if description is not None and str(description).strip():
            lines.extend([str(description).rstrip(), ""])
        if node_type == "definition":
            _field(lines, level + 2, "Notes", "notes", version.get("notes"))
            _field(lines, level + 2, "References", "references", version.get("references"))
        elif node_type == "exercise":
            _field(lines, level + 2, "Hints", "hints", version.get("hints"))
            _field(lines, level + 2, "Solution", "solution", version.get("solution"))
            _field(lines, level + 2, "Notes", "notes", version.get("notes"))
    return lines


def _render_files(plan: dict[str, Any]) -> dict[Path, str]:
    names = plan["knownNames"]
    rendered: dict[Path, str] = {}
    for file_spec in plan["files"]:
        nodes = file_spec["nodes"]
        local_ids = {node["id"] for node in nodes}
        children: dict[str, list[dict[str, Any]]] = {}
        roots = []
        for node in nodes:
            if node.get("parent") in local_ids:
                children.setdefault(node["parent"], []).append(node)
            else:
                roots.append(node)
        lines = [
            f'#+title: {file_spec["title"]}',
            f"#+ankidemy_generated: {GENERATED_MARKER}",
            f'#+ankidemy_plan_id: {plan["planId"]}',
            "",
        ]

        def append_tree(node: dict[str, Any], level: int) -> None:
            lines.extend(_render_node(node, level, local_ids, names))
            for child in children.get(node["id"], []):
                append_tree(child, level + 1)

        for root_node in roots:
            append_tree(root_node, 1)
        rendered[file_spec["destination"]] = "\n".join(lines).rstrip() + "\n"
    return rendered


def _preflight(root: Path, rendered: dict[Path, str]) -> dict[str, Any]:
    with tempfile.TemporaryDirectory(prefix="ankidemy-render-") as temporary:
        shadow = Path(temporary) / "notebook"
        shutil.copytree(root, shadow, ignore=shutil.ignore_patterns("org-roam.db", ".git"))
        for destination, content in rendered.items():
            relative = destination.relative_to(root)
            shadow_destination = shadow / relative
            shadow_destination.parent.mkdir(parents=True, exist_ok=True)
            shadow_destination.write_text(content, encoding="utf-8")
        snapshot = _emacs_snapshot(shadow)
        analysis = analyze_snapshot(snapshot)
        if not analysis["complete"]:
            errors = [item for item in analysis["diagnostics"] if item.get("severity") == "error"]
            detail = "; ".join(f'{item.get("code")}: {item.get("message")}' for item in errors)
            raise ToolError(f"rendered notebook failed preflight: {detail}")
        return analysis


def _generated_plan_id(path: Path) -> str | None:
    if not path.is_file():
        return None
    marker = None
    plan_id = None
    with path.open(encoding="utf-8") as handle:
        for _ in range(12):
            line = handle.readline()
            if not line:
                break
            lowered = line.lower()
            if lowered.startswith("#+ankidemy_generated:"):
                marker = line.split(":", 1)[1].strip()
            elif lowered.startswith("#+ankidemy_plan_id:"):
                plan_id = line.split(":", 1)[1].strip()
    return plan_id if marker == GENERATED_MARKER else None


def _candidate_outputs(raw_plan: Any, root: Path) -> list[tuple[Path, Path]]:
    if not isinstance(raw_plan, dict) or not isinstance(raw_plan.get("files"), list):
        return []
    outputs: list[tuple[Path, Path]] = []
    for file_spec in raw_plan["files"]:
        if not isinstance(file_spec, dict) or not isinstance(file_spec.get("path"), str):
            continue
        relative = Path(file_spec["path"])
        if relative.is_absolute() or ".." in relative.parts or relative.suffix.lower() != ".org":
            continue
        outputs.append((relative, (root / relative).resolve()))
    return outputs


def render_plan(root: Path, plan_path: Path, replace: bool) -> dict[str, Any]:
    root = root.resolve()
    snapshot = _emacs_snapshot(root)
    if snapshot.get("notebook") is None:
        raise ToolError("destination is not a manifested Ankidemy notebook; run init first")
    try:
        raw_plan = json.loads(plan_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ToolError(f"cannot read plan {plan_path}: {exc}") from exc
    candidate_outputs = _candidate_outputs(raw_plan, root)
    replacing_paths: set[Path] = set()
    for relative, destination in candidate_outputs:
        if not destination.exists():
            continue
        if not replace:
            raise ToolError(f"refusing to overwrite existing output: {destination}")
        existing_plan_id = _generated_plan_id(destination)
        if existing_plan_id != raw_plan.get("planId"):
            raise ToolError(f"refusing to replace non-matching generated output: {destination}")
        replacing_paths.add(relative)

    plan = _validate_plan(raw_plan, snapshot, root, replacing_paths)
    rendered = _render_files(plan)
    replace_destinations = {(root / relative).resolve() for relative in replacing_paths}
    for destination in rendered:
        if destination.exists():
            existing_plan_id = _generated_plan_id(destination)
            if not replace:
                raise ToolError(f"refusing to overwrite existing output: {destination}")
            if existing_plan_id != plan["planId"]:
                raise ToolError(f"refusing to replace non-matching generated output: {destination}")
    analysis = _preflight(root, rendered)

    staged: list[tuple[Path, Path]] = []
    backups: list[tuple[Path, Path]] = []
    published_new: list[Path] = []
    try:
        for destination, content in rendered.items():
            destination.parent.mkdir(parents=True, exist_ok=True)
            descriptor, temporary = tempfile.mkstemp(prefix=".ankidemy-render-", dir=destination.parent)
            temporary_path = Path(temporary)
            with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
                handle.write(content)
            staged.append((temporary_path, destination))
        for temporary_path, destination in staged:
            if destination in replace_destinations:
                if _generated_plan_id(destination) != plan["planId"]:
                    raise ToolError(f"generated output changed during render: {destination}")
                backup_descriptor, backup_name = tempfile.mkstemp(
                    prefix=".ankidemy-backup-", dir=destination.parent
                )
                os.close(backup_descriptor)
                backup_path = Path(backup_name)
                backup_path.unlink()
                os.link(destination, backup_path)
                backups.append((backup_path, destination))
                os.replace(temporary_path, destination)
            else:
                os.link(temporary_path, destination)
                published_new.append(destination)
                temporary_path.unlink()
    except Exception as exc:
        for destination in published_new:
            destination.unlink(missing_ok=True)
        for backup_path, destination in reversed(backups):
            if backup_path.exists():
                os.replace(backup_path, destination)
        if isinstance(exc, ToolError):
            raise
        raise ToolError(f"could not publish rendered files: {exc}") from exc
    finally:
        for temporary_path, _ in staged:
            temporary_path.unlink(missing_ok=True)
        for backup_path, _ in backups:
            backup_path.unlink(missing_ok=True)
    return {
        "complete": True,
        "planId": plan["planId"],
        "files": [str(path.relative_to(root)) for path in rendered],
        "analysis": analysis,
    }


def init_notebook(root: Path, title: str, notebook_id: str | None) -> dict[str, Any]:
    root = root.resolve()
    if not root.is_dir():
        raise ToolError(f"notebook root is not a directory: {root}")
    manifest = root / "ankidemy.org"
    if manifest.exists():
        raise ToolError(f"manifest already exists: {manifest}")
    identifier = notebook_id or str(uuid.uuid4())
    content = (
        f"#+title: {title.strip()}\n"
        f"#+ankidemy_notebook_id: {identifier}\n"
        "#+ankidemy_schema: 1\n"
    )
    try:
        with manifest.open("x", encoding="utf-8") as handle:
            handle.write(content)
    except OSError as exc:
        raise ToolError(f"cannot create manifest: {exc}") from exc
    return {"created": str(manifest), "notebookId": identifier, "title": title.strip()}


def _print_json(value: Any) -> None:
    print(json.dumps(value, indent=2, ensure_ascii=False, sort_keys=False))


def _print_inventory(value: dict[str, Any]) -> None:
    for node in value["nodes"]:
        print(f'{node["type"]:10} {node["id"]}  {node["name"]}  [{node["file"]}]')
        if node["prerequisites"]:
            print("  prerequisites: " + ", ".join(node["prerequisites"]))
        if node["dependents"]:
            print("  dependents: " + ", ".join(node["dependents"]))
        if node["references"]:
            print("  references: " + ", ".join(node["references"]))
        if node["referencedBy"]:
            print("  referenced by: " + ", ".join(node["referencedBy"]))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_parser = subparsers.add_parser("init", help="create a missing notebook manifest")
    init_parser.add_argument("root", type=Path)
    init_parser.add_argument("--title", required=True)
    init_parser.add_argument("--notebook-id")

    ids_parser = subparsers.add_parser("new-id", help="generate stable UUIDs for a plan")
    ids_parser.add_argument("--count", type=int, default=1)

    for name in ("snapshot", "inventory", "analyze", "validate"):
        command_parser = subparsers.add_parser(name)
        command_parser.add_argument("root", type=Path)

    find_parser = subparsers.add_parser("find", help="find nodes by name, code, or ID")
    find_parser.add_argument("root", type=Path)
    find_parser.add_argument("query")

    dependencies_parser = subparsers.add_parser("dependencies")
    dependencies_parser.add_argument("root", type=Path)
    dependencies_parser.add_argument("node")
    dependencies_parser.add_argument(
        "--direction", choices=("prerequisites", "dependents"), default="prerequisites"
    )
    dependencies_parser.add_argument("--recursive", action="store_true")

    render_parser = subparsers.add_parser("render")
    render_parser.add_argument("root", type=Path)
    render_parser.add_argument("plan", type=Path)
    render_parser.add_argument("--replace", action="store_true")

    args = parser.parse_args(argv)
    try:
        if args.command == "init":
            value = init_notebook(args.root, _require_string(args.title, "title"), args.notebook_id)
        elif args.command == "new-id":
            if args.count < 1 or args.count > 1000:
                raise ToolError("--count must be between 1 and 1000")
            value = {"ids": [str(uuid.uuid4()) for _ in range(args.count)]}
        elif args.command == "render":
            value = render_plan(args.root, args.plan, args.replace)
        else:
            snapshot = _emacs_snapshot(args.root)
            if args.command == "snapshot":
                value = snapshot
            elif args.command == "inventory":
                value = inventory(snapshot)
            elif args.command == "find":
                query = args.query.casefold()
                value = {
                    "nodes": [
                        node
                        for node in inventory(snapshot)["nodes"]
                        if any(query in str(node.get(field, "")).casefold() for field in ("id", "code", "name"))
                    ]
                }
            elif args.command == "dependencies":
                value = dependency_view(snapshot, args.node, args.direction, args.recursive)
            else:
                value = analyze_snapshot(snapshot)
        if args.json or args.command not in {"inventory"}:
            _print_json(value)
        else:
            _print_inventory(value)
        if args.command == "validate" and not value["complete"]:
            return 1
        return 0
    except ToolError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
