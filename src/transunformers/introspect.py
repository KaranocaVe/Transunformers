from __future__ import annotations

from copy import deepcopy
from typing import Any


def summarize_named_tensors(named_tensors) -> dict[str, int]:
    count = 0
    trainable = 0
    size_bytes = 0
    for _, tensor in named_tensors:
        numel = tensor.numel()
        count += numel
        if getattr(tensor, "requires_grad", False):
            trainable += numel
        size_bytes += numel * tensor.element_size()
    return {"count": count, "trainable": trainable, "size_bytes": size_bytes}


def tensor_details(named_tensors) -> list[dict[str, Any]]:
    details = []
    for name, tensor in named_tensors:
        details.append(
            {
                "name": name,
                "shape": list(tensor.shape),
                "dtype": str(tensor.dtype),
                "numel": tensor.numel(),
                "trainable": bool(getattr(tensor, "requires_grad", False)),
            }
        )
    return details


def classify_module(class_name: str, path: str) -> list[str]:
    class_lower = class_name.lower()
    path_lower = path.lower()
    tags = set()
    if "embedding" in class_lower or ".embeddings" in path_lower:
        tags.add("embedding")
    if "attention" in class_lower or ".attn" in path_lower:
        tags.add("attention")
    if "mlp" in class_lower or "ffn" in class_lower or "feedforward" in class_lower or ".ffn" in path_lower:
        tags.add("mlp")
    if "norm" in class_lower:
        tags.add("norm")
    if "dropout" in class_lower:
        tags.add("dropout")
    if "conv" in class_lower:
        tags.add("conv")
    if "linear" in class_lower or "dense" in class_lower:
        tags.add("linear")
    if "encoder" in class_lower or ".encoder" in path_lower:
        tags.add("encoder")
    if "decoder" in class_lower or ".decoder" in path_lower:
        tags.add("decoder")
    if "pooler" in class_lower:
        tags.add("pooler")
    if "head" in class_lower or "lm_head" in path_lower or "classifier" in class_lower:
        tags.add("head")
    return sorted(tags)


def build_module_tree(
    module,
    name: str,
    path: str,
    *,
    include_param_details: bool = False,
    include_buffer_details: bool = False,
) -> dict[str, Any]:
    direct_params = list(module.named_parameters(recurse=False))
    direct_buffers = list(module.named_buffers(recurse=False))

    node = {
        "name": name,
        "path": path,
        "class": module.__class__.__name__,
        "index": int(name) if name.isdigit() else None,
        "kind": "container",
        "tags": classify_module(module.__class__.__name__, path),
        "parameters": {
            "self": summarize_named_tensors(direct_params),
            "total": {"count": 0, "trainable": 0, "size_bytes": 0},
        },
        "buffers": {
            "self": summarize_named_tensors(direct_buffers),
            "total": {"count": 0, "trainable": 0, "size_bytes": 0},
        },
        "children": [],
    }

    if include_param_details:
        node["parameter_details"] = tensor_details(direct_params)
    if include_buffer_details:
        node["buffer_details"] = tensor_details(direct_buffers)

    for child_name, child in module.named_children():
        child_path = f"{path}.{child_name}"
        child_node = build_module_tree(
            child,
            child_name,
            child_path,
            include_param_details=include_param_details,
            include_buffer_details=include_buffer_details,
        )
        node["children"].append(child_node)

    if not node["children"]:
        node["kind"] = "leaf"

    totals = node["parameters"]["self"].copy()
    buffer_totals = node["buffers"]["self"].copy()
    for child in node["children"]:
        child_params = child["parameters"]["total"]
        totals["count"] += child_params["count"]
        totals["trainable"] += child_params["trainable"]
        totals["size_bytes"] += child_params["size_bytes"]

        child_buffers = child["buffers"]["total"]
        buffer_totals["count"] += child_buffers["count"]
        buffer_totals["trainable"] += child_buffers["trainable"]
        buffer_totals["size_bytes"] += child_buffers["size_bytes"]

    node["parameters"]["total"] = totals
    node["buffers"]["total"] = buffer_totals
    return node


def _collapse_group(parent_path: str, group: list[dict[str, Any]]) -> dict[str, Any]:
    start = group[0]["index"]
    end = group[-1]["index"]
    class_names = {child["class"] for child in group}
    class_name = group[0]["class"] if len(class_names) == 1 else "MixedModules"

    param_totals = {"count": 0, "trainable": 0, "size_bytes": 0}
    buffer_totals = {"count": 0, "trainable": 0, "size_bytes": 0}
    for child in group:
        child_params = child["parameters"]["total"]
        param_totals["count"] += child_params["count"]
        param_totals["trainable"] += child_params["trainable"]
        param_totals["size_bytes"] += child_params["size_bytes"]

        child_buffers = child["buffers"]["total"]
        buffer_totals["count"] += child_buffers["count"]
        buffer_totals["trainable"] += child_buffers["trainable"]
        buffer_totals["size_bytes"] += child_buffers["size_bytes"]

    return {
        "name": f"{start}..{end}",
        "path": f"{parent_path}.[{start}-{end}]",
        "class": class_name,
        "index": None,
        "kind": "collapsed",
        "collapsed": True,
        "repeat": len(group),
        "index_start": start,
        "index_end": end,
        "tags": sorted({tag for child in group for tag in child.get("tags", [])}),
        "parameters": {"self": param_totals.copy(), "total": param_totals},
        "buffers": {"self": buffer_totals.copy(), "total": buffer_totals},
        "children": [],
    }


def compact_module_tree(tree: dict[str, Any], min_group: int = 4) -> dict[str, Any]:
    tree_copy = deepcopy(tree)

    def walk(node: dict[str, Any]) -> dict[str, Any]:
        children = [walk(child) for child in node.get("children", [])]
        if not children:
            node["children"] = []
            return node

        compacted: list[dict[str, Any]] = []
        i = 0
        while i < len(children):
            child = children[i]
            if child.get("index") is not None:
                j = i
                while j < len(children) and children[j].get("index") is not None:
                    j += 1
                group = children[i:j]
                if len(group) >= min_group:
                    compacted.append(group[0])
                    compacted.append(_collapse_group(node["path"], group[1:-1]))
                    compacted.append(group[-1])
                else:
                    compacted.extend(group)
                i = j
                continue

            compacted.append(child)
            i += 1

        node["children"] = compacted
        return node

    return walk(tree_copy)


def flatten_tree(tree: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, str]] = []

    def walk(node: dict[str, Any], depth: int) -> None:
        children = node.get("children", [])
        node_copy = {k: v for k, v in node.items() if k != "children"}
        node_copy["depth"] = depth
        node_copy["child_ids"] = [child["path"] for child in children]
        nodes.append(node_copy)
        for child in children:
            edges.append({"source": node["path"], "target": child["path"]})
            walk(child, depth + 1)

    walk(tree, 0)
    return {"nodes": nodes, "edges": edges}
