from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

from .utils import env_path


def _find_local_transformers_src(explicit_path: Path | None, *, include_repo_default: bool) -> Path | None:
    candidates: list[Path] = []
    if explicit_path:
        candidates.append(explicit_path)

    env_candidate = env_path("TRANSUNFORMERS_TRANSFORMERS_SRC")
    if env_candidate:
        candidates.append(env_candidate)

    if include_repo_default:
        repo_root = Path(__file__).resolve().parents[2]
        candidates.append(repo_root / "transformers" / "src")

    for candidate in candidates:
        if candidate and (candidate / "transformers").exists():
            return candidate
    return None


def _is_valid_transformers(module: Any) -> bool:
    return hasattr(module, "AutoConfig") and hasattr(module, "__version__")


def import_transformers(explicit_path: str | None = None) -> Any:
    candidate = _find_local_transformers_src(
        Path(explicit_path) if explicit_path else None,
        include_repo_default=False,
    )
    if candidate:
        sys.path.insert(0, str(candidate))

    try:
        import transformers  # type: ignore

        if _is_valid_transformers(transformers):
            return transformers
        sys.modules.pop("transformers", None)
    except Exception:
        pass

    candidate = _find_local_transformers_src(None, include_repo_default=True)
    if candidate:
        sys.path.insert(0, str(candidate))
        import transformers  # type: ignore
        if _is_valid_transformers(transformers):
            return transformers
        sys.modules.pop("transformers", None)

    raise ImportError(
        "Unable to import transformers. Install dependencies or set TRANSUNFORMERS_TRANSFORMERS_SRC."
    )


def import_torch() -> Any:
    try:
        import torch  # type: ignore

        return torch
    except Exception as exc:
        raise ImportError("Unable to import torch. Install torch before parsing models.") from exc
