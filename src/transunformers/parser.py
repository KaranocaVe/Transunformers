from __future__ import annotations

import gc
import platform
import sys
import traceback
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from .hf_compat import import_torch, import_transformers
from .inputs import build_dummy_inputs
from .introspect import (
    build_module_tree,
    compact_module_tree,
    flatten_tree,
    summarize_named_tensors,
)
from .trace import trace_model_forward
from .utils import ensure_dir, safe_model_dir_name, to_jsonable, utc_now_iso


AUTO_CLASS_MAP = {
    "base": "AutoModel",
    "causal-lm": "AutoModelForCausalLM",
    "seq2seq-lm": "AutoModelForSeq2SeqLM",
    "masked-lm": "AutoModelForMaskedLM",
    "sequence-classification": "AutoModelForSequenceClassification",
    "token-classification": "AutoModelForTokenClassification",
    "image-classification": "AutoModelForImageClassification",
    "vision2seq": "AutoModelForVision2Seq",
}


def _resolve_model_class(
    transformers, config, auto_class: str, trust_remote_code: bool
):
    auto_class = (auto_class or "auto").lower()

    if trust_remote_code:
        class_name = AUTO_CLASS_MAP.get(auto_class, "AutoModel")
        return getattr(transformers, class_name, transformers.AutoModel)

    if auto_class == "auto":
        for name in getattr(config, "architectures", []) or []:
            resolved = getattr(transformers, name, None)
            if resolved is not None:
                return resolved
        return transformers.AutoModel

    class_name = AUTO_CLASS_MAP.get(auto_class, "AutoModel")
    return getattr(transformers, class_name, transformers.AutoModel)


def _resolve_dtype(torch, dtype: str | None):
    if not dtype or dtype == "auto":
        return None
    dtype = dtype.lower()
    mapping = {
        "float32": torch.float32,
        "float16": torch.float16,
        "bfloat16": torch.bfloat16,
    }
    if dtype not in mapping:
        raise ValueError(f"Unsupported dtype: {dtype}")
    return mapping[dtype]


def _load_tokenizer(
    transformers, model_id: str, *, revision: str | None, trust_remote_code: bool
):
    try:
        return transformers.AutoTokenizer.from_pretrained(
            model_id,
            revision=revision,
            trust_remote_code=trust_remote_code,
        )
    except Exception:
        return None


def _sanitize_config(config, *, model_class_name: str | None = None) -> list[str]:
    changes: list[str] = []

    if not hasattr(config, "pad_token_id"):
        config.pad_token_id = getattr(config, "eos_token_id", None) or 0
        changes.append("pad_token_id")
    elif getattr(config, "pad_token_id", None) is None:
        config.pad_token_id = getattr(config, "eos_token_id", None) or 0
        changes.append("pad_token_id")

    if not hasattr(config, "vocab_size") or getattr(config, "vocab_size", None) is None:
        config.vocab_size = 32000
        changes.append("vocab_size")
    vocab_size = getattr(config, "vocab_size", None)
    if not isinstance(vocab_size, int):
        config.vocab_size = 32000
        vocab_size = config.vocab_size
        changes.append("vocab_size")
    if vocab_size is not None and getattr(config, "pad_token_id", None) is not None:
        if config.pad_token_id >= vocab_size:
            config.pad_token_id = max(0, vocab_size - 1)
            changes.append("pad_token_id_clamped")

    if (
        not hasattr(config, "hidden_size")
        or getattr(config, "hidden_size", None) is None
    ):
        candidate = getattr(config, "d_model", None) or getattr(
            config, "model_dim", None
        )
        config.hidden_size = candidate or 768
        changes.append("hidden_size")

    if (
        not hasattr(config, "intermediate_size")
        or getattr(config, "intermediate_size", None) is None
    ):
        hidden = getattr(config, "hidden_size", None) or 768
        config.intermediate_size = hidden * 4
        changes.append("intermediate_size")

    if hasattr(config, "qk_channels") and getattr(config, "qk_channels", None) is None:
        candidate = (
            getattr(config, "d_model", None)
            or getattr(config, "hidden_size", None)
            or getattr(config, "embed_dim", None)
        )
        if candidate is not None:
            config.qk_channels = candidate
            changes.append("qk_channels")

    if (
        not hasattr(config, "num_hidden_layers")
        or getattr(config, "num_hidden_layers", None) is None
    ):
        config.num_hidden_layers = 1
        changes.append("num_hidden_layers")

    hidden = getattr(config, "hidden_size", None)
    heads = getattr(config, "num_attention_heads", None)
    if hasattr(config, "head_dim") and getattr(config, "head_dim", None) is None:
        if hidden is not None and heads:
            config.head_dim = hidden // heads
            changes.append("head_dim")

    if (
        not hasattr(config, "num_attention_heads")
        or getattr(config, "num_attention_heads", None) is None
    ):
        config.num_attention_heads = 1
        changes.append("num_attention_heads")

    if (
        not hasattr(config, "num_key_value_heads")
        or getattr(config, "num_key_value_heads", None) is None
    ):
        if getattr(config, "num_attention_heads", None):
            config.num_key_value_heads = config.num_attention_heads
            changes.append("num_key_value_heads")

    if (
        hasattr(config, "decoder_hidden_size")
        and getattr(config, "decoder_hidden_size", None) is None
    ):
        hidden = getattr(config, "hidden_size", None)
        if hidden is not None:
            config.decoder_hidden_size = hidden
            changes.append("decoder_hidden_size")

    if (
        hasattr(config, "decoder_num_heads")
        and getattr(config, "decoder_num_heads", None) is None
    ):
        num_heads = getattr(config, "num_heads", None)
        if isinstance(num_heads, list) and num_heads:
            config.decoder_num_heads = num_heads[-1]
        else:
            config.decoder_num_heads = getattr(config, "num_attention_heads", None) or 1
        changes.append("decoder_num_heads")

    if (
        hasattr(config, "prediction_length")
        and getattr(config, "prediction_length", None) is None
    ):
        context = getattr(config, "context_length", None)
        config.prediction_length = context or 1
        changes.append("prediction_length")

    if (
        hasattr(config, "context_length")
        and getattr(config, "context_length", None) is None
    ):
        config.context_length = 1
        changes.append("context_length")

    if (
        hasattr(config, "rope_scaling")
        and getattr(config, "rope_scaling", None) is None
    ):
        config.rope_scaling = {}
        changes.append("rope_scaling")

    if not hasattr(config, "rope_theta") or getattr(config, "rope_theta", None) is None:
        config.rope_theta = 10000.0
        changes.append("rope_theta")

    if hasattr(config, "rope_parameters"):
        rope_params = getattr(config, "rope_parameters", None)
        if rope_params is None:
            config.rope_parameters = {
                "rope_theta": getattr(config, "rope_theta", 10000.0)
            }
            changes.append("rope_parameters")
        elif isinstance(rope_params, dict) and "rope_theta" not in rope_params:
            rope_params = dict(rope_params)
            rope_params["rope_theta"] = getattr(config, "rope_theta", 10000.0)
            config.rope_parameters = rope_params
            changes.append("rope_parameters.rope_theta")

    if not hasattr(config, "dropout") or getattr(config, "dropout", None) is None:
        config.dropout = 0.0
        changes.append("dropout")

    if (
        not hasattr(config, "attention_dropout")
        or getattr(config, "attention_dropout", None) is None
    ):
        config.attention_dropout = 0.0
        changes.append("attention_dropout")

    if (
        not hasattr(config, "attention_bias")
        or getattr(config, "attention_bias", None) is None
    ):
        config.attention_bias = False
        changes.append("attention_bias")

    if not hasattr(config, "mlp_bias") or getattr(config, "mlp_bias", None) is None:
        config.mlp_bias = False
        changes.append("mlp_bias")

    if not hasattr(config, "hidden_act") or getattr(config, "hidden_act", None) is None:
        config.hidden_act = "silu"
        changes.append("hidden_act")

    for attr in (
        "num_experts",
        "n_routed_experts",
        "n_shared_experts",
        "num_experts_per_tok",
    ):
        if hasattr(config, attr) and getattr(config, attr, None) is None:
            setattr(config, attr, 1)
            changes.append(attr)

    if (
        hasattr(config, "vocabulary_map")
        and getattr(config, "vocabulary_map", None) is None
    ):
        config.vocabulary_map = {"<image>": 0}
        changes.append("vocabulary_map")

    has_backbone_config = (
        hasattr(config, "backbone_config")
        and getattr(config, "backbone_config", None) is not None
    )
    if has_backbone_config and getattr(config, "backbone", None):
        config.backbone = None
        changes.append("backbone")
    if (
        not has_backbone_config
        and hasattr(config, "backbone")
        and not getattr(config, "backbone", None)
    ):
        config.backbone = "resnet50"
        changes.append("backbone")

    if hasattr(config, "vision_config"):
        vision_cfg = getattr(config, "vision_config")
        force_vision_embed = bool(
            model_class_name and "PerceptionLM" in model_class_name
        )
        if vision_cfg is not None and hasattr(vision_cfg, "architecture"):
            arch = getattr(vision_cfg, "architecture", "")
            if (
                isinstance(arch, str)
                and arch.startswith("resnet")
                and force_vision_embed
            ):
                vision_cfg.architecture = "vit_base_patch16_224"
                changes.append("vision_config.architecture")
            elif isinstance(arch, str) and arch.startswith("resnet"):
                if hasattr(vision_cfg, "model_args") and getattr(
                    vision_cfg, "model_args", None
                ):
                    vision_cfg.model_args = None
                    changes.append("vision_config.model_args")
        if (
            vision_cfg is not None
            and hasattr(vision_cfg, "model_args")
            and vision_cfg.model_args is None
        ):
            arch = getattr(vision_cfg, "architecture", "")
            if (
                force_vision_embed
                or not isinstance(arch, str)
                or not arch.startswith("resnet")
            ):
                embed_dim = (
                    getattr(vision_cfg, "hidden_size", None)
                    or getattr(vision_cfg, "embed_dim", None)
                    or 768
                )
                vision_cfg.model_args = {"embed_dim": embed_dim}
                changes.append("vision_config.model_args")
        if vision_cfg is not None:
            changes.extend(_fix_attention_heads(vision_cfg, prefix="vision_config."))

    changes.extend(_fix_attention_heads(config))

    subconfig_names = {
        "text_config",
        "attn_config",
        "audio_config",
        "model_config",
        "backbone_config",
        "vision_config",
    }
    for attr_name in vars(config):
        if attr_name.endswith("_config"):
            subconfig_names.add(attr_name)
    for attr_name in sorted(subconfig_names):
        sub_cfg = getattr(config, attr_name, None)
        if sub_cfg is None or not hasattr(sub_cfg, "__dict__"):
            continue
        sub_changes = _sanitize_config(sub_cfg, model_class_name=None)
        changes.extend([f"{attr_name}.{item}" for item in sub_changes])

    if hasattr(config, "out_indices"):
        out_indices = getattr(config, "out_indices")
        stage_names = getattr(config, "stage_names", None)
        if not isinstance(out_indices, list):
            out_indices = None
        if isinstance(stage_names, list) and stage_names:
            max_index = len(stage_names) - 1
            invalid = (
                out_indices is None
                or len(out_indices) != 4
                or any(
                    not isinstance(idx, int) or idx > max_index or idx < 0
                    for idx in out_indices
                )
            )
            if invalid:
                start = max(0, len(stage_names) - 4)
                config.out_indices = list(range(start, len(stage_names)))
                changes.append("out_indices")
        elif out_indices is None or len(out_indices) != 4:
            config.out_indices = [3, 5, 7, 11]
            changes.append("out_indices")

    if (
        hasattr(config, "layers_block_type")
        and getattr(config, "layers_block_type", None) is None
    ):
        num_layers = getattr(config, "num_hidden_layers", None) or 1
        config.layers_block_type = ["mamba"] * num_layers
        changes.append("layers_block_type")

    if (
        hasattr(config, "decoder_depth")
        and getattr(config, "decoder_depth", None) is None
    ):
        config.decoder_depth = 1
        changes.append("decoder_depth")

    if config.__class__.__name__ == "Qwen3OmniMoeTalkerTextConfig":
        if (
            not hasattr(config, "shared_expert_intermediate_size")
            or getattr(config, "shared_expert_intermediate_size", None) is None
        ):
            fallback = getattr(config, "intermediate_size", None) or 1
            config.shared_expert_intermediate_size = fallback
            changes.append("shared_expert_intermediate_size")

    if config.__class__.__name__ == "Qwen3OmniMoeTalkerConfig":
        if (
            not hasattr(config, "spatial_merge_size")
            or getattr(config, "spatial_merge_size", None) is None
        ):
            vision_cfg = getattr(config, "vision_config", None)
            fallback = (
                getattr(vision_cfg, "spatial_merge_size", None)
                if vision_cfg is not None
                else None
            )
            config.spatial_merge_size = fallback or 2
            changes.append("spatial_merge_size")

    if hasattr(config, "layer_types") and getattr(config, "layer_types", None) is None:
        num_layers = getattr(config, "num_hidden_layers", None) or 1
        config.layer_types = ["full_attention"] * num_layers
        changes.append("layer_types")

    if (
        hasattr(config, "keypoint_encoder_sizes")
        and getattr(config, "keypoint_encoder_sizes", None) is None
    ):
        config.keypoint_encoder_sizes = [32, 64, 128, 256]
        changes.append("keypoint_encoder_sizes")

    if (
        hasattr(config, "gnn_layers_types")
        and getattr(config, "gnn_layers_types", None) is None
    ):
        config.gnn_layers_types = ["self", "cross"] * 9
        changes.append("gnn_layers_types")

    if model_class_name:
        if "LMHead" in model_class_name or model_class_name.endswith("ForCausalLM"):
            if hasattr(config, "is_decoder") and not getattr(
                config, "is_decoder", False
            ):
                config.is_decoder = True
                changes.append("is_decoder")
        if "EncoderModel" in model_class_name:
            if hasattr(config, "is_encoder_decoder") and getattr(
                config, "is_encoder_decoder", False
            ):
                config.is_encoder_decoder = False
                changes.append("is_encoder_decoder")

    if config.__class__.__name__ == "Emu3Config":
        text_cfg = getattr(config, "text_config", None)
        if text_cfg is not None:
            for attr in (
                "vocab_size",
                "hidden_size",
                "intermediate_size",
                "num_hidden_layers",
                "num_attention_heads",
                "num_key_value_heads",
                "max_position_embeddings",
                "rms_norm_eps",
                "attention_dropout",
                "attention_bias",
                "mlp_bias",
                "hidden_act",
                "pad_token_id",
                "bos_token_id",
                "eos_token_id",
                "rope_parameters",
            ):
                if not hasattr(config, attr) or getattr(config, attr, None) is None:
                    if hasattr(text_cfg, attr):
                        setattr(config, attr, getattr(text_cfg, attr))
                        changes.append(attr)

    return changes


def _fix_attention_heads(config, prefix: str = "") -> list[str]:
    changes: list[str] = []
    hidden = (
        getattr(config, "hidden_size", None)
        or getattr(config, "embed_dim", None)
        or getattr(config, "d_model", None)
        or getattr(config, "model_dim", None)
        or getattr(config, "hidden_dim", None)
        or getattr(config, "qk_channels", None)
    )
    hidden_val = hidden if isinstance(hidden, int) else None

    head_attrs = [
        ("num_attention_heads", getattr(config, "num_attention_heads", None)),
        ("num_heads", getattr(config, "num_heads", None)),
        ("num_self_attention_heads", getattr(config, "num_self_attention_heads", None)),
        (
            "num_cross_attention_heads",
            getattr(config, "num_cross_attention_heads", None),
        ),
    ]

    for name, value in head_attrs:
        if isinstance(value, int) and hidden_val and hidden_val % value != 0:
            for candidate in range(value, 0, -1):
                if hidden_val % candidate == 0:
                    setattr(config, name, candidate)
                    changes.append(f"{prefix}{name}")
                    break

    qk_channels = getattr(config, "qk_channels", None)
    if isinstance(qk_channels, int):
        for name, value in head_attrs:
            if not isinstance(value, int) or value <= 0:
                continue
            if qk_channels % value != 0:
                new_qk = (qk_channels // value) * value
                if new_qk <= 0:
                    new_qk = value
                if new_qk != qk_channels:
                    config.qk_channels = new_qk
                    changes.append(f"{prefix}qk_channels")
                    qk_channels = new_qk
                break

    return changes


@contextmanager
def _disable_post_init(transformers):
    try:
        from transformers.modeling_utils import PreTrainedModel
    except Exception:
        yield
        return
    orig_post_init = PreTrainedModel.post_init

    def _noop_post_init(self):
        return None

    PreTrainedModel.post_init = _noop_post_init
    try:
        yield
    finally:
        PreTrainedModel.post_init = orig_post_init


@contextmanager
def _maybe_patch_layoutlmv2(transformers, model_class):
    name = getattr(model_class, "__name__", "")
    if not name.startswith("LayoutLMv2"):
        yield False
        return
    try:
        from transformers.models.layoutlmv2 import modeling_layoutlmv2
    except Exception:
        yield False
        return
    is_available = getattr(modeling_layoutlmv2, "is_detectron2_available", None)
    if callable(is_available) and is_available():
        yield False
        return

    torch = import_torch()

    class _DummyVisualBackbone(torch.nn.Module):
        def __init__(self, config):
            super().__init__()
            self.config = config
            self.backbone = torch.nn.Identity()

        def forward(self, image):
            return image

    orig_visual = modeling_layoutlmv2.LayoutLMv2VisualBackbone
    orig_requires = modeling_layoutlmv2.requires_backends

    def _noop_requires(*_args, **_kwargs):
        return None

    modeling_layoutlmv2.LayoutLMv2VisualBackbone = _DummyVisualBackbone
    modeling_layoutlmv2.requires_backends = _noop_requires
    try:
        yield True
    finally:
        modeling_layoutlmv2.LayoutLMv2VisualBackbone = orig_visual
        modeling_layoutlmv2.requires_backends = orig_requires


@contextmanager
def _maybe_patch_dinat(transformers, model_class):
    name = getattr(model_class, "__name__", "")
    if not name.startswith("Dinat"):
        yield False
        return
    try:
        from transformers.models.dinat import modeling_dinat
    except Exception:
        yield False
        return
    is_available = getattr(modeling_dinat, "is_natten_available", None)
    if callable(is_available) and is_available():
        yield False
        return

    orig_requires = modeling_dinat.requires_backends

    def _noop_requires(*_args, **_kwargs):
        return None

    modeling_dinat.requires_backends = _noop_requires
    try:
        yield True
    finally:
        modeling_dinat.requires_backends = orig_requires


def parse_model(
    model_id: str,
    *,
    output_dir: Path,
    config_only: bool = False,
    auto_class: str = "auto",
    revision: str | None = None,
    trust_remote_code: bool = False,
    include_param_details: bool = False,
    include_buffer_details: bool = False,
    collapse_layers: bool = True,
    trace: bool = False,
    trace_store: str = "summary",
    trace_text: str | None = None,
    transformers_src: str | None = None,
    device: str = "cpu",
    dtype: str | None = None,
    compression: str = "none",
) -> dict[str, Any]:
    torch = import_torch()
    transformers = import_transformers(transformers_src)

    warnings: list[str] = []
    ensure_dir(output_dir)

    config = transformers.AutoConfig.from_pretrained(
        model_id,
        revision=revision,
        trust_remote_code=trust_remote_code,
    )
    model_class = _resolve_model_class(
        transformers, config, auto_class, trust_remote_code
    )
    changes = _sanitize_config(config, model_class_name=model_class.__name__)
    if changes:
        warnings.append(f"Sanitized config fields: {', '.join(sorted(set(changes)))}")
    torch_dtype = _resolve_dtype(torch, dtype)

    if config_only:
        try:
            model = model_class.from_config(config, trust_remote_code=trust_remote_code)
        except TypeError:
            model = model_class.from_config(config)
    else:
        model = model_class.from_pretrained(
            model_id,
            config=config,
            revision=revision,
            trust_remote_code=trust_remote_code,
            torch_dtype=torch_dtype,
        )

    model.eval()
    model.to(device)

    root_name = model.__class__.__name__
    tree = build_module_tree(
        model,
        name=root_name,
        path=root_name,
        include_param_details=include_param_details,
        include_buffer_details=include_buffer_details,
    )
    compact_tree = compact_module_tree(tree) if collapse_layers else None
    flat = flatten_tree(tree)
    flat_compact = flatten_tree(compact_tree) if compact_tree else None

    param_summary = summarize_named_tensors(model.named_parameters())
    buffer_summary = summarize_named_tensors(model.named_buffers())
    total_size = param_summary["size_bytes"] + buffer_summary["size_bytes"]

    trace_info: dict[str, Any] = {"enabled": False}
    if trace:
        tokenizer = _load_tokenizer(
            transformers,
            model_id,
            revision=revision,
            trust_remote_code=trust_remote_code,
        )
        if trace_text and not tokenizer:
            warnings.append(
                "Tokenizer unavailable; falling back to heuristic dummy inputs."
            )
        try:
            inputs = build_dummy_inputs(
                model, tokenizer=tokenizer, sample_text=trace_text
            )
            trace_info = {"enabled": True}
            trace_info.update(
                trace_model_forward(
                    model,
                    inputs,
                    store=trace_store,
                    output_dir=output_dir,
                    compression=compression,
                )
            )
        except Exception as exc:
            warnings.append(f"Trace failed: {exc}")

    source = "local" if Path(model_id).exists() else "hub"
    data = {
        "schema_version": "1.0",
        "generated_at": utc_now_iso(),
        "status": "ok",
        "model": {
            "id": model_id,
            "safe_id": safe_model_dir_name(model_id),
            "source": source,
            "revision": revision,
            "auto_class": auto_class,
            "config_class": config.__class__.__name__,
            "class": root_name,
            "model_type": getattr(config, "model_type", None),
            "architectures": getattr(config, "architectures", None),
            "is_encoder_decoder": bool(getattr(config, "is_encoder_decoder", False)),
            "parameters": param_summary,
            "buffers": buffer_summary,
            "size_bytes": total_size,
            "config": to_jsonable(config.to_dict()),
            "weights_loaded": not config_only,
            "empty_weights": False,
        },
        "modules": {
            "tree": tree,
            "compact_tree": compact_tree,
            "flat": flat,
            "flat_compact": flat_compact,
            "module_count": len(flat["nodes"]),
        },
        "trace": trace_info,
        "runtime": {
            "python": sys.version.split()[0],
            "platform": platform.platform(),
            "torch": getattr(torch, "__version__", "unknown"),
            "transformers": getattr(transformers, "__version__", "unknown"),
            "device": device,
            "dtype": str(torch_dtype) if torch_dtype is not None else "auto",
        },
        "warnings": warnings,
    }

    return data


def _construct_model(model_class, config, trust_remote_code: bool):
    if hasattr(model_class, "from_config"):
        try:
            return model_class.from_config(config, trust_remote_code=trust_remote_code)
        except TypeError:
            return model_class.from_config(config)
    return model_class(config)


def parse_model_from_config(
    model_id: str,
    *,
    model_class,
    config,
    output_dir: Path,
    include_param_details: bool = False,
    include_buffer_details: bool = False,
    collapse_layers: bool = True,
    trace: bool = False,
    trace_store: str = "summary",
    trace_text: str | None = None,
    transformers_src: str | None = None,
    device: str = "cpu",
    dtype: str | None = None,
    mapping_names: list[str] | None = None,
    empty_weights: bool = False,
    strict_empty_weights: bool = True,
    max_non_meta_param_bytes: int = 1_073_741_824,
    max_non_meta_buffer_bytes: int = 5_000_000,
    trust_remote_code: bool = False,
    source: str | None = None,
    compression: str = "none",
) -> dict[str, Any]:
    torch = import_torch()
    transformers = import_transformers(transformers_src)

    warnings: list[str] = []
    ensure_dir(output_dir)

    changes = _sanitize_config(
        config, model_class_name=getattr(model_class, "__name__", None)
    )
    if changes:
        warnings.append(f"Sanitized config fields: {', '.join(sorted(set(changes)))}")

    torch_dtype = _resolve_dtype(torch, dtype)
    model = None
    using_empty_weights = False
    patched_layoutlmv2 = False
    patched_dinat = False

    if empty_weights:
        try:
            from accelerate import init_empty_weights

            using_empty_weights = True
            with _disable_post_init(transformers):
                with init_empty_weights(include_buffers=True):
                    with (
                        _maybe_patch_layoutlmv2(
                            transformers, model_class
                        ) as patched_layout,
                        _maybe_patch_dinat(transformers, model_class) as patched_nat,
                    ):
                        patched_layoutlmv2 = patched_layoutlmv2 or patched_layout
                        patched_dinat = patched_dinat or patched_nat
                        model = _construct_model(model_class, config, trust_remote_code)
        except Exception as exc:
            if strict_empty_weights:
                raise RuntimeError(f"Empty weight init failed: {exc}") from exc
            warnings.append(
                f"Empty weight init failed, falling back to real weights: {exc}"
            )

    if model is None:
        with (
            _maybe_patch_layoutlmv2(transformers, model_class) as patched_layout,
            _maybe_patch_dinat(transformers, model_class) as patched_nat,
        ):
            patched_layoutlmv2 = patched_layoutlmv2 or patched_layout
            patched_dinat = patched_dinat or patched_nat
            model = _construct_model(model_class, config, trust_remote_code)

    model.eval()
    if not using_empty_weights:
        model.to(device)
    else:
        non_meta_param_bytes = 0
        non_meta_param_count = 0
        for module in model.modules():
            for name, param in list(module._parameters.items()):
                if param is None:
                    continue
                if param.device.type != "meta":
                    non_meta_param_bytes += param.numel() * param.element_size()
                    non_meta_param_count += 1
                    module._parameters[name] = torch.nn.Parameter(
                        param.to(device="meta"),
                        requires_grad=param.requires_grad,
                    )
        if non_meta_param_bytes > max_non_meta_param_bytes:
            raise RuntimeError(
                "Non-meta parameters exceed limit: "
                f"{non_meta_param_bytes} bytes (limit {max_non_meta_param_bytes})."
            )
        if non_meta_param_count:
            warnings.append(
                f"Converted {non_meta_param_count} parameters to meta after init "
                f"({non_meta_param_bytes} bytes)."
            )

        non_meta_buffer_bytes = 0
        non_meta_buffer_count = 0
        for module in model.modules():
            for name, buffer in list(module._buffers.items()):
                if buffer is None:
                    continue
                if buffer.device.type != "meta":
                    non_meta_buffer_bytes += buffer.numel() * buffer.element_size()
                    non_meta_buffer_count += 1
                    module._buffers[name] = buffer.to(device="meta")
        if non_meta_buffer_bytes > max_non_meta_buffer_bytes:
            raise RuntimeError(
                "Non-meta buffers exceed limit: "
                f"{non_meta_buffer_bytes} bytes (limit {max_non_meta_buffer_bytes})."
            )
        if non_meta_buffer_count:
            warnings.append(
                f"Converted {non_meta_buffer_count} buffers to meta after init "
                f"({non_meta_buffer_bytes} bytes)."
            )

    root_name = model.__class__.__name__
    tree = build_module_tree(
        model,
        name=root_name,
        path=root_name,
        include_param_details=include_param_details,
        include_buffer_details=include_buffer_details,
    )
    compact_tree = compact_module_tree(tree) if collapse_layers else None
    flat = flatten_tree(tree)
    flat_compact = flatten_tree(compact_tree) if compact_tree else None

    param_summary = summarize_named_tensors(model.named_parameters())
    buffer_summary = summarize_named_tensors(model.named_buffers())
    total_size = param_summary["size_bytes"] + buffer_summary["size_bytes"]

    trace_info: dict[str, Any] = {"enabled": False}
    if trace:
        if using_empty_weights:
            warnings.append("Trace disabled because empty weights were used.")
        else:
            tokenizer = _load_tokenizer(
                transformers,
                model_id,
                revision=None,
                trust_remote_code=trust_remote_code,
            )
            if trace_text and not tokenizer:
                warnings.append(
                    "Tokenizer unavailable; falling back to heuristic dummy inputs."
                )
            try:
                inputs = build_dummy_inputs(
                    model, tokenizer=tokenizer, sample_text=trace_text
                )
                trace_info = {"enabled": True}
                trace_info.update(
                    trace_model_forward(
                        model,
                        inputs,
                        store=trace_store,
                        output_dir=output_dir,
                    )
                )
            except Exception as exc:
                warnings.append(f"Trace failed: {exc}")

    source_value = source or ("local" if Path(model_id).exists() else "catalog")
    if patched_layoutlmv2:
        warnings.append(
            "LayoutLMv2 detectron2 unavailable; using a dummy visual backbone."
        )
    if patched_dinat:
        warnings.append(
            "Dinat natten unavailable; bypassed backend checks for model construction."
        )
    data = {
        "schema_version": "1.0",
        "generated_at": utc_now_iso(),
        "status": "ok",
        "model": {
            "id": model_id,
            "safe_id": safe_model_dir_name(model_id),
            "source": source_value,
            "revision": None,
            "auto_class": None,
            "config_class": config.__class__.__name__,
            "class": root_name,
            "model_type": getattr(config, "model_type", None),
            "architectures": getattr(config, "architectures", None),
            "is_encoder_decoder": bool(getattr(config, "is_encoder_decoder", False)),
            "mapping_names": mapping_names or [],
            "parameters": param_summary,
            "buffers": buffer_summary,
            "size_bytes": total_size,
            "config": to_jsonable(config.to_dict()),
            "weights_loaded": False,
            "empty_weights": using_empty_weights,
        },
        "modules": {
            "tree": tree,
            "compact_tree": compact_tree,
            "flat": flat,
            "flat_compact": flat_compact,
            "module_count": len(flat["nodes"]),
        },
        "trace": trace_info,
        "runtime": {
            "python": sys.version.split()[0],
            "platform": platform.platform(),
            "torch": getattr(torch, "__version__", "unknown"),
            "transformers": getattr(transformers, "__version__", "unknown"),
            "device": "meta" if using_empty_weights else device,
            "dtype": str(torch_dtype) if torch_dtype is not None else "auto",
        },
        "warnings": warnings,
    }

    del model
    gc.collect()

    return data


def error_payload(
    model_id: str, error: Exception, extra_model_fields: dict[str, Any] | None = None
) -> dict[str, Any]:
    payload = {
        "schema_version": "1.0",
        "generated_at": utc_now_iso(),
        "status": "error",
        "model": {"id": model_id, "safe_id": safe_model_dir_name(model_id)},
        "error": {
            "type": error.__class__.__name__,
            "message": str(error),
            "traceback": traceback.format_exc(),
        },
    }
    if extra_model_fields:
        payload["model"].update(extra_model_fields)
    return payload
