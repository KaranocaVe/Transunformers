# Transunformers
Parse, catalog, and visualize Transformer architectures. Transunformers turns Hugging Face
models into structured JSON artifacts (module trees, parameter/buffer summaries, optional
forward-call traces) and powers a web UI for exploration.

## Highlights
- Parse one or many models into a normalized JSON schema.
- Config-only parsing to avoid weight downloads.
- Parse-all mode with empty-weight initialization for large model catalogs.
- Optional forward-call tracing for richer visualization.
- Indexing, compression, and chunking for fast web loading.

## Requirements
- Python 3.10+
- Node.js + npm (only for the web UI)

## Install (Python)
Using `uv`:

```bash
uv venv
source .venv/bin/activate
uv pip install -e .
```

Optional: use the local Transformers source in `./transformers`:

```bash
uv pip install -e ./transformers
```

Or point directly at the source tree:

```bash
export TRANSUNFORMERS_TRANSFORMERS_SRC=./transformers/src
```

You can also pass `--transformers-src` to any CLI command.

## Quick Start
Parse a single model without downloading weights:

```bash
transunformers parse --model bert-base-uncased --config-only --index
```

Parse a model and collect a forward-call trace:

```bash
transunformers parse --model bert-base-uncased --trace --trace-text "hello world"
```

Parse multiple models from a manifest (one id per line, `#` comments allowed):

```bash
transunformers parse --manifest models.txt --out-dir data/models
```

Parse every model class available in the local Transformers source:

```bash
transunformers parse-all --out-dir data/models
```

`parse-all` defaults to empty-weight init and fails fast if any model needs real weights.
Relax the limits if needed:

```bash
transunformers parse-all \
  --allow-real-weights-on-failure \
  --allow-non-meta-params 536870912 \
  --allow-non-meta-buffers 5000000
```

Shrink output size:

```bash
transunformers parse-all --lean --out-dir data/models
```

## Compression and Chunking
Lossless compression for existing outputs:

```bash
transunformers compress --data-dir data/models --format gzip
```

Emit compressed outputs directly during parsing:

```bash
transunformers parse-all --compression gzip --out-dir data/models
```

`zstd` requires the `zstandard` Python package.

Chunk outputs for lazy frontend loading (writes a manifest + chunk files):

```bash
transunformers chunk --data-dir data/models --format gzip
```

## Output Layout
Each model is stored under `data/models/<safe_id>/`:

```
data/models/
  index.json
  <safe_id>/
    model.json | model.json.gz | model.json.zst
    trace_summary.json            # when --trace
    trace_full.json               # when --trace-store full|both
    chunks/                       # when chunked
```

The aggregated index lives at `data/models/index.json`. The schema is documented in
`schemas/model_v1.json`.

## Web UI
The frontend lives in `web/` and expects data in `web/public/data/models` (synced from
`data/models`).

```bash
cd web
npm install
npm run dev
```

`npm run dev` runs `sync:data` first; ensure `data/models` exists (run a parse command
beforehand). For large datasets, you can skip the copy and read directly from the repo by
setting:

```bash
VITE_DATA_USE_FS=true npm run dev
```

## Repository Layout
- `src/transunformers`: Parser, tracing, and CLI.
- `schemas/model_v1.json`: Output schema for model artifacts.
- `data/models`: Default output directory for parsed models.
- `web/`: React + Vite frontend.
- `transformers/`: Optional local Hugging Face Transformers source.
