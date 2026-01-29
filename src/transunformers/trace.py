from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

from .utils import read_json, write_json


def trace_model_forward(model, inputs: dict[str, Any], *, store: str, output_dir: Path) -> dict[str, Any]:
    store = store.lower()
    if store not in {"summary", "full", "both"}:
        raise ValueError("trace store must be one of: summary, full, both")

    with tempfile.TemporaryDirectory() as tmpdir:
        from transformers.model_debugging_utils import model_addition_debugger_context

        with model_addition_debugger_context(model, debug_path=tmpdir, do_prune_layers=False, use_repr=True):
            model(**inputs)

        class_name = model.__class__.__name__
        base = Path(tmpdir) / f"{class_name}_debug_tree"
        summary_src = base.with_name(f"{base.name}_SUMMARY.json")
        full_src = base.with_name(f"{base.name}_FULL_TENSORS.json")

        trace_info: dict[str, Any] = {}
        if store in {"summary", "both"} and summary_src.exists():
            summary_dest = output_dir / "trace_summary.json"
            write_json(summary_dest, read_json(summary_src))
            trace_info["summary_file"] = summary_dest.name

        if store in {"full", "both"} and full_src.exists():
            full_dest = output_dir / "trace_full.json"
            write_json(full_dest, read_json(full_src))
            trace_info["full_file"] = full_dest.name

        return trace_info
