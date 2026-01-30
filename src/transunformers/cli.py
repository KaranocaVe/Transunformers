from __future__ import annotations

import argparse
from pathlib import Path

from .catalog import parse_all_models
from .chunking import chunk_directory
from .index import build_index
from .parser import error_payload, parse_model
from .utils import read_json, safe_model_dir_name, write_json


def _load_manifest(path: Path) -> list[str]:
    models = []
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        models.append(stripped)
    return models


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="transunformers")
    subparsers = parser.add_subparsers(dest="command", required=True)

    parse_cmd = subparsers.add_parser(
        "parse", help="Parse one or more models into JSON artifacts."
    )
    parse_cmd.add_argument(
        "-m", "--model", action="append", dest="models", help="Model id or local path."
    )
    parse_cmd.add_argument(
        "--manifest", type=Path, help="File with model ids, one per line."
    )
    parse_cmd.add_argument("--out-dir", type=Path, default=Path("data/models"))
    parse_cmd.add_argument(
        "--config-only",
        action="store_true",
        help="Instantiate from config without weights.",
    )
    parse_cmd.add_argument(
        "--auto-class",
        default="auto",
        choices=[
            "auto",
            "base",
            "causal-lm",
            "seq2seq-lm",
            "masked-lm",
            "sequence-classification",
            "token-classification",
            "image-classification",
            "vision2seq",
        ],
    )
    parse_cmd.add_argument("--revision", default=None)
    parse_cmd.add_argument("--trust-remote-code", action="store_true")
    parse_cmd.add_argument("--include-parameter-details", action="store_true")
    parse_cmd.add_argument("--include-buffer-details", action="store_true")
    parse_cmd.add_argument(
        "--no-collapse-layers", dest="collapse_layers", action="store_false"
    )
    parse_cmd.add_argument("--trace", action="store_true")
    parse_cmd.add_argument(
        "--trace-store", default="summary", choices=["summary", "full", "both"]
    )
    parse_cmd.add_argument("--trace-text", default=None)
    parse_cmd.add_argument("--transformers-src", default=None)
    parse_cmd.add_argument("--device", default="cpu")
    parse_cmd.add_argument(
        "--dtype", default="auto", choices=["auto", "float32", "float16", "bfloat16"]
    )
    parse_cmd.add_argument(
        "--compression",
        default="none",
        choices=["none", "gzip", "zstd"],
        help="Compression for model.json output.",
    )
    parse_cmd.add_argument(
        "--compact-json",
        action="store_true",
        help="Write compact JSON without indentation.",
    )
    parse_cmd.add_argument(
        "--index", action="store_true", help="Update data index after parsing."
    )

    index_cmd = subparsers.add_parser(
        "index", help="Build index.json from existing model outputs."
    )
    index_cmd.add_argument("--data-dir", type=Path, default=Path("data/models"))
    index_cmd.add_argument("--out", type=Path, default=None)

    parse_all_cmd = subparsers.add_parser(
        "parse-all",
        help="Parse all model classes available in local Transformers into JSON artifacts.",
    )
    parse_all_cmd.add_argument("--out-dir", type=Path, default=Path("data/models"))
    parse_all_cmd.add_argument("--transformers-src", default=None)
    parse_all_cmd.add_argument(
        "--no-collapse-layers", dest="collapse_layers", action="store_false"
    )
    parse_all_cmd.add_argument("--device", default="cpu")
    parse_all_cmd.add_argument(
        "--dtype", default="auto", choices=["auto", "float32", "float16", "bfloat16"]
    )
    parse_all_cmd.add_argument(
        "--no-empty-weights",
        dest="empty_weights",
        action="store_false",
        help="Instantiate models with real parameters (heavier).",
    )
    parse_all_cmd.add_argument(
        "--allow-non-meta-buffers",
        dest="max_non_meta_buffer_bytes",
        type=int,
        default=5_000_000,
        help="Allow non-meta buffers up to this many bytes when using empty weights.",
    )
    parse_all_cmd.add_argument(
        "--allow-non-meta-params",
        dest="max_non_meta_param_bytes",
        type=int,
        default=1_073_741_824,
        help="Allow non-meta parameters up to this many bytes when using empty weights.",
    )
    parse_all_cmd.add_argument(
        "--allow-real-weights-on-failure",
        dest="strict_empty_weights",
        action="store_false",
        help="Fallback to real weights if empty-weight init fails.",
    )
    parse_all_cmd.add_argument("--max-models", type=int, default=None)
    parse_all_cmd.add_argument(
        "--mapping",
        action="append",
        dest="mapping_filter",
        help="Limit to specific auto mapping names (repeatable).",
    )
    parse_all_cmd.add_argument(
        "--lean",
        action="store_true",
        help="Disable parameter and buffer detail lists to shrink output.",
    )
    parse_all_cmd.add_argument("--no-index", dest="index", action="store_false")
    parse_all_cmd.add_argument(
        "--compression",
        default="none",
        choices=["none", "gzip", "zstd"],
        help="Compression for model.json output.",
    )
    parse_all_cmd.add_argument(
        "--compact-json",
        action="store_true",
        help="Write compact JSON without indentation.",
    )

    compress_cmd = subparsers.add_parser(
        "compress",
        help="Compress existing model.json files losslessly to shrink disk usage.",
    )
    compress_cmd.add_argument("--data-dir", type=Path, default=Path("data/models"))
    compress_cmd.add_argument(
        "--format",
        default="gzip",
        choices=["gzip", "zstd"],
        help="Compression format for model.json outputs.",
    )
    compress_cmd.add_argument(
        "--keep-json", action="store_true", help="Keep original model.json files."
    )
    compress_cmd.add_argument(
        "--overwrite", action="store_true", help="Overwrite existing compressed files."
    )
    compress_cmd.add_argument(
        "--pretty-json",
        action="store_true",
        help="Keep pretty-printed JSON before compression.",
    )
    compress_cmd.add_argument("--no-index", dest="index", action="store_false")

    chunk_cmd = subparsers.add_parser(
        "chunk",
        help="Split model.json into compressed chunks for lazy frontend loading.",
    )
    chunk_cmd.add_argument("--data-dir", type=Path, default=Path("data/models"))
    chunk_cmd.add_argument(
        "--format",
        default="gzip",
        choices=["gzip", "zstd", "none"],
        help="Compression format for chunk files.",
    )
    chunk_cmd.add_argument(
        "--keep-full",
        action="store_true",
        help="Keep the original full model.json file.",
    )
    chunk_cmd.add_argument(
        "--overwrite", action="store_true", help="Overwrite existing chunked outputs."
    )
    chunk_cmd.add_argument(
        "--pretty-json",
        action="store_true",
        help="Keep pretty-printed JSON in chunk files.",
    )
    chunk_cmd.add_argument("--no-index", dest="index", action="store_false")

    return parser.parse_args()


def _resolve_models(args: argparse.Namespace) -> list[str]:
    models: list[str] = []
    if args.models:
        models.extend(args.models)
    if args.manifest:
        models.extend(_load_manifest(args.manifest))
    if not models:
        raise SystemExit("No models specified. Use --model or --manifest.")
    return models


def _run_parse(args: argparse.Namespace) -> None:
    models = _resolve_models(args)
    for model_id in models:
        safe_id = safe_model_dir_name(model_id)
        output_dir = args.out_dir / safe_id
        suffix = "model.json"
        if args.compression == "gzip":
            suffix = "model.json.gz"
        elif args.compression == "zstd":
            suffix = "model.json.zst"
        output_file = output_dir / suffix
        try:
            data = parse_model(
                model_id,
                output_dir=output_dir,
                config_only=args.config_only,
                auto_class=args.auto_class,
                revision=args.revision,
                trust_remote_code=args.trust_remote_code,
                include_param_details=args.include_parameter_details,
                include_buffer_details=args.include_buffer_details,
                collapse_layers=args.collapse_layers,
                trace=args.trace,
                trace_store=args.trace_store,
                trace_text=args.trace_text,
                transformers_src=args.transformers_src,
                device=args.device,
                dtype=args.dtype,
                compression=args.compression,
            )
        except Exception as exc:
            data = error_payload(model_id, exc)
        compact_json = args.compact_json or args.compression != "none"
        write_json(output_file, data, compact=compact_json)
        print(f"Wrote {output_file}")

    if args.index:
        build_index(args.out_dir)


def _run_index(args: argparse.Namespace) -> None:
    build_index(args.data_dir, out_path=args.out)


def _run_parse_all(args: argparse.Namespace) -> None:
    mapping_filter = set(args.mapping_filter) if args.mapping_filter else None
    include_details = not args.lean
    compact_json = args.compact_json or args.compression != "none"
    result = parse_all_models(
        output_dir=args.out_dir,
        transformers_src=args.transformers_src,
        include_param_details=include_details,
        include_buffer_details=include_details,
        collapse_layers=args.collapse_layers,
        device=args.device,
        dtype=args.dtype,
        empty_weights=args.empty_weights,
        strict_empty_weights=args.strict_empty_weights,
        max_non_meta_param_bytes=args.max_non_meta_param_bytes,
        max_non_meta_buffer_bytes=args.max_non_meta_buffer_bytes,
        mapping_filter=mapping_filter,
        max_models=args.max_models,
        write_index=args.index,
        compression=args.compression,
        compact_json=compact_json,
    )
    print(
        f"Parsed: {result['parsed']} | Failed: {result['failed']} | Mapping errors: {result['errors']}"
    )


def _run_compress(args: argparse.Namespace) -> None:
    data_dir = args.data_dir
    if args.format == "gzip":
        suffix = ".json.gz"
    elif args.format == "zstd":
        suffix = ".json.zst"
    else:
        raise SystemExit(f"Unsupported format: {args.format}")

    model_files = sorted(data_dir.glob("*/model.json"))
    for model_file in model_files:
        target = model_file.with_suffix(suffix)
        if target.exists() and not args.overwrite:
            continue
        data = read_json(model_file)
        compact_json = not args.pretty_json
        write_json(target, data, compact=compact_json)
        if not args.keep_json:
            model_file.unlink()

    if args.index:
        build_index(args.data_dir)


def _run_chunk(args: argparse.Namespace) -> None:
    compact_json = not args.pretty_json
    count = chunk_directory(
        args.data_dir,
        compression=args.format,
        keep_full=args.keep_full,
        overwrite=args.overwrite,
        compact_json=compact_json,
    )
    if args.index:
        build_index(args.data_dir)
    print(f"Chunked: {count}")


def main() -> None:
    args = _parse_args()
    if args.command == "parse":
        _run_parse(args)
    elif args.command == "index":
        _run_index(args)
    elif args.command == "parse-all":
        _run_parse_all(args)
    elif args.command == "compress":
        _run_compress(args)
    elif args.command == "chunk":
        _run_chunk(args)


if __name__ == "__main__":
    main()
