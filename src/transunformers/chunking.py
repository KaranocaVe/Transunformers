from __future__ import annotations

from pathlib import Path
from typing import Any

from .utils import ensure_dir, read_json, write_json


def _chunk_suffix(compression: str) -> str:
    if compression == "gzip":
        return ".json.gz"
    if compression == "zstd":
        return ".json.zst"
    if compression == "none":
        return ".json"
    raise ValueError(f"Unsupported compression: {compression}")


def _chunk_filename(key: str, compression: str) -> str:
    safe_key = key.replace("/", "_")
    return f"{safe_key}{_chunk_suffix(compression)}"


def _build_manifest_and_chunks(
    data: dict[str, Any], *, compression: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    manifest: dict[str, Any] = {}
    for key in ("schema_version", "generated_at", "status", "runtime", "warnings"):
        if key in data:
            manifest[key] = data[key]

    model = dict(data.get("model", {}) or {})
    config = model.pop("config", None)
    manifest["model"] = model

    modules = data.get("modules", {}) or {}
    manifest["modules"] = {"module_count": modules.get("module_count")}

    trace = data.get("trace", None)
    if isinstance(trace, dict) and "enabled" in trace:
        manifest["trace"] = {"enabled": trace.get("enabled")}
        if "full_file" in trace:
            manifest["trace"]["full_file"] = trace["full_file"]
        if "summary_file" in trace:
            manifest["trace"]["summary_file"] = trace["summary_file"]
    elif trace is not None:
        manifest["trace"] = {"enabled": False}

    chunks: dict[str, Any] = {}
    if config is not None:
        chunks["model.config"] = config
    if "tree" in modules:
        chunks["modules.tree"] = modules.get("tree")
    if "compact_tree" in modules:
        chunks["modules.compact_tree"] = modules.get("compact_tree")
    if "flat" in modules:
        chunks["modules.flat"] = modules.get("flat")
    if "flat_compact" in modules:
        chunks["modules.flat_compact"] = modules.get("flat_compact")
    if trace is not None:
        chunks["trace"] = trace

    manifest["chunks"] = {
        "layout": "chunked_v1",
        "base_dir": "chunks",
        "compression": compression,
        "items": [],
        "groups": {
            "model": ["model.config"],
            "modules": [
                "modules.tree",
                "modules.compact_tree",
                "modules.flat",
                "modules.flat_compact",
            ],
            "trace": ["trace"],
        },
    }

    return manifest, chunks


def _find_source_file(model_dir: Path) -> Path | None:
    for candidate in ("model.json", "model.json.gz", "model.json.zst"):
        path = model_dir / candidate
        if path.exists():
            return path
    return None


def chunk_model_dir(
    model_dir: Path,
    *,
    compression: str,
    keep_full: bool,
    overwrite: bool,
    compact_json: bool,
) -> bool:
    source = _find_source_file(model_dir)
    if source is None:
        return False

    manifest_path = model_dir / "model.json"
    if manifest_path.exists():
        try:
            existing = read_json(manifest_path)
            if isinstance(existing, dict) and existing.get("chunks") and not overwrite:
                return False
        except Exception:
            pass

    data = read_json(source)
    manifest, chunks = _build_manifest_and_chunks(data, compression=compression)

    chunk_dir = model_dir / "chunks"
    ensure_dir(chunk_dir)

    items = []
    for key, payload in chunks.items():
        if payload is None:
            items.append({"key": key, "present": False})
            continue
        filename = _chunk_filename(key, compression)
        path = chunk_dir / filename
        write_json(path, payload, compact=compact_json)
        size_bytes = path.stat().st_size if path.exists() else 0
        items.append(
            {
                "key": key,
                "path": f"chunks/{filename}",
                "size_bytes": size_bytes,
                "present": True,
            }
        )

    manifest["chunks"]["items"] = items
    write_json(manifest_path, manifest, compact=compact_json)

    if keep_full:
        if source.name == "model.json":
            full_path = model_dir / "model.full.json"
            if full_path.exists() and not overwrite:
                return True
            source.replace(full_path)
    else:
        if source.exists() and source.name != "model.json":
            source.unlink()

    return True


def chunk_directory(
    data_dir: Path,
    *,
    compression: str = "gzip",
    keep_full: bool = False,
    overwrite: bool = False,
    compact_json: bool = True,
) -> int:
    if compression not in {"gzip", "zstd", "none"}:
        raise ValueError(f"Unsupported compression: {compression}")
    count = 0
    for model_dir in sorted(path for path in data_dir.iterdir() if path.is_dir()):
        if chunk_model_dir(
            model_dir,
            compression=compression,
            keep_full=keep_full,
            overwrite=overwrite,
            compact_json=compact_json,
        ):
            count += 1
    return count
