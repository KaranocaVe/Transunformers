from __future__ import annotations

import datetime as dt
import json
import os
import re
from pathlib import Path
from typing import Any


def utc_now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def safe_model_dir_name(model_id: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9_.-]+", "__", model_id.strip())
    return slug or "model"


def to_jsonable(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, (list, tuple)):
        return [to_jsonable(item) for item in value]
    if isinstance(value, dict):
        return {str(k): to_jsonable(v) for k, v in value.items()}
    if hasattr(value, "to_dict"):
        return to_jsonable(value.to_dict())
    return str(value)


def write_json(path: Path, data: Any, *, compact: bool = False) -> None:
    ensure_dir(path.parent)
    dump_kwargs = {
        "indent": None if compact else 2,
        "sort_keys": True,
        "ensure_ascii": True,
    }
    if compact:
        dump_kwargs["separators"] = (",", ":")

    if path.suffix == ".gz":
        import gzip

        with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as f:
            json.dump(data, f, **dump_kwargs)
            f.write("\n")
    elif path.suffix == ".zst":
        try:
            import zstandard as zstd
        except Exception as exc:
            raise RuntimeError("zstandard is required to read/write .zst files") from exc
        compressor = zstd.ZstdCompressor(level=10)
        with path.open("wb") as raw:
            with compressor.stream_writer(raw) as writer:
                writer.write(json.dumps(data, **dump_kwargs).encode("utf-8"))
                writer.write(b"\n")
    else:
        with path.open("w", encoding="utf-8") as f:
            json.dump(data, f, **dump_kwargs)
            f.write("\n")


def read_json(path: Path) -> Any:
    if path.suffix == ".gz":
        import gzip

        with gzip.open(path, "rt", encoding="utf-8") as f:
            return json.load(f)
    if path.suffix == ".zst":
        try:
            import zstandard as zstd
        except Exception as exc:
            raise RuntimeError("zstandard is required to read/write .zst files") from exc
        decompressor = zstd.ZstdDecompressor()
        with path.open("rb") as raw:
            with decompressor.stream_reader(raw) as reader:
                payload = reader.read()
        return json.loads(payload.decode("utf-8"))
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def env_path(var_name: str) -> Path | None:
    value = os.getenv(var_name)
    if not value:
        return None
    return Path(value)
