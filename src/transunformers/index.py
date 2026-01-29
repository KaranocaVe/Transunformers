from __future__ import annotations

from pathlib import Path
from typing import Any

from .utils import read_json, write_json


def _summarize_model(data: dict[str, Any], relative_path: str) -> dict[str, Any]:
    status = data.get("status", "unknown")
    model = data.get("model", {})
    params = model.get("parameters", {})
    buffers = model.get("buffers", {})
    entry = {
        "id": model.get("id"),
        "safe_id": model.get("safe_id"),
        "source": model.get("source"),
        "auto_class": model.get("auto_class"),
        "config_class": model.get("config_class"),
        "mapping_names": model.get("mapping_names"),
        "status": status,
        "model_type": model.get("model_type"),
        "architectures": model.get("architectures"),
        "parameter_count": params.get("count"),
        "parameter_trainable": params.get("trainable"),
        "parameter_size_bytes": params.get("size_bytes"),
        "buffer_count": buffers.get("count"),
        "buffer_size_bytes": buffers.get("size_bytes"),
        "module_count": data.get("modules", {}).get("module_count"),
        "generated_at": data.get("generated_at"),
        "path": relative_path,
    }

    if status == "error":
        entry["error"] = data.get("error", {}).get("message")
    return entry


def build_index(data_dir: Path, *, out_path: Path | None = None) -> dict[str, Any]:
    data_dir = data_dir.resolve()
    out_path = out_path or data_dir / "index.json"

    entries = []
    for model_dir in sorted(path for path in data_dir.iterdir() if path.is_dir()):
        model_file = None
        for candidate in ("model.json", "model.json.gz", "model.json.zst"):
            path = model_dir / candidate
            if path.exists():
                model_file = path
                break
        if model_file is None:
            continue
        try:
            data = read_json(model_file)
        except Exception:
            continue
        relative_path = str(model_file.relative_to(data_dir))
        entries.append(_summarize_model(data, relative_path))

    index = {"count": len(entries), "models": entries}
    write_json(out_path, index)
    return index
