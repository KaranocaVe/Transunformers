from __future__ import annotations

from dataclasses import dataclass, field
import shutil
from pathlib import Path
from typing import Any, Iterable

from .hf_compat import import_transformers
from .index import build_index
from .parser import error_payload, parse_model_from_config
from .utils import ensure_dir, read_json, safe_model_dir_name, write_json


@dataclass
class ModelSpec:
    model_id: str
    config_class: type
    model_class: type
    mapping_names: list[str] = field(default_factory=list)


def _iter_auto_mappings(transformers) -> Iterable[tuple[str, Any]]:
    from transformers.models.auto import modeling_auto

    for name, value in vars(modeling_auto).items():
        if not name.endswith("_MAPPING"):
            continue
        if name.startswith("TF_") or name.startswith("FLAX_"):
            continue
        if not hasattr(value, "__getitem__") or not hasattr(value, "keys"):
            continue
        yield name, value


def discover_model_specs(transformers, mapping_filter: set[str] | None = None) -> tuple[list[ModelSpec], list[dict[str, Any]]]:
    specs: dict[tuple[type, type], ModelSpec] = {}
    mapping_errors: list[dict[str, Any]] = []

    for mapping_name, mapping in _iter_auto_mappings(transformers):
        if mapping_filter and mapping_name not in mapping_filter:
            continue
        try:
            config_classes = list(mapping.keys())
        except Exception as exc:
            mapping_errors.append({"mapping": mapping_name, "error": str(exc)})
            continue

        for config_class in config_classes:
            try:
                model_class = mapping[config_class]
            except Exception as exc:
                mapping_errors.append(
                    {
                        "mapping": mapping_name,
                        "config_class": getattr(config_class, "__name__", str(config_class)),
                        "error": str(exc),
                    }
                )
                continue
            model_classes = model_class if isinstance(model_class, (list, tuple)) else (model_class,)
            for model_entry in model_classes:
                if model_entry is None:
                    continue
                key = (config_class, model_entry)
                if key not in specs:
                    model_id = f"{model_entry.__name__}::{config_class.__name__}"
                    specs[key] = ModelSpec(
                        model_id=model_id,
                        config_class=config_class,
                        model_class=model_entry,
                        mapping_names=[mapping_name],
                    )
                else:
                    if mapping_name not in specs[key].mapping_names:
                        specs[key].mapping_names.append(mapping_name)

    ordered = sorted(specs.values(), key=lambda spec: spec.model_id.lower())
    return ordered, mapping_errors


def _patch_problematic_configs(transformers) -> None:
    llama4_vision = getattr(transformers, "Llama4VisionConfig", None)
    if llama4_vision and not hasattr(llama4_vision, "convert_rope_params_to_dict"):
        def _convert_rope_params_to_dict(self, ignore_keys_at_rope_validation=None, **kwargs):
            return kwargs

        llama4_vision.convert_rope_params_to_dict = _convert_rope_params_to_dict

    try:
        from transformers.models.qwen3_omni_moe import configuration_qwen3_omni_moe as qwen3_cfg
    except Exception:
        qwen3_cfg = None
    if qwen3_cfg is not None:
        qwen3_talker = getattr(qwen3_cfg, "Qwen3OmniMoeTalkerCodePredictorConfig", None)
        if qwen3_talker:
            if not hasattr(qwen3_talker, "use_sliding_window"):
                qwen3_talker.use_sliding_window = False
            if not hasattr(qwen3_talker, "max_window_layers"):
                qwen3_talker.max_window_layers = 28


def build_default_config(transformers, config_class: type) -> Any:
    _patch_problematic_configs(transformers)
    try:
        return config_class()
    except Exception:
        pass

    enc_dec = getattr(transformers, "EncoderDecoderConfig", None)
    if enc_dec and issubclass(config_class, enc_dec):
        encoder = transformers.BertConfig()
        decoder = transformers.BertConfig()
        return enc_dec.from_encoder_decoder_configs(encoder, decoder)

    vision_enc_dec = getattr(transformers, "VisionEncoderDecoderConfig", None)
    if vision_enc_dec and issubclass(config_class, vision_enc_dec):
        encoder = transformers.ViTConfig()
        decoder = transformers.GPT2Config()
        return vision_enc_dec.from_encoder_decoder_configs(encoder, decoder)

    speech_enc_dec = getattr(transformers, "SpeechEncoderDecoderConfig", None)
    if speech_enc_dec and issubclass(config_class, speech_enc_dec):
        encoder = transformers.Wav2Vec2Config()
        decoder = transformers.BertConfig()
        return speech_enc_dec.from_encoder_decoder_configs(encoder, decoder)

    rag_config = getattr(transformers, "RagConfig", None)
    if rag_config and issubclass(config_class, rag_config):
        encoder = transformers.DPRQuestionEncoderConfig()
        generator = transformers.BartConfig()
        return rag_config.from_question_encoder_generator_configs(encoder, generator)

    dual_config = getattr(transformers, "VisionTextDualEncoderConfig", None)
    if dual_config and issubclass(config_class, dual_config):
        vision = transformers.ViTConfig()
        text = transformers.BertConfig()
        return dual_config.from_vision_text_configs(vision, text)

    musicgen_config = getattr(transformers, "MusicgenConfig", None)
    if musicgen_config and issubclass(config_class, musicgen_config):
        text = transformers.T5Config()
        audio = transformers.EncodecConfig()
        decoder = transformers.MusicgenDecoderConfig()
        return musicgen_config(text_encoder=text, audio_encoder=audio, decoder=decoder)

    musicgen_melody = getattr(transformers, "MusicgenMelodyConfig", None)
    if musicgen_melody and issubclass(config_class, musicgen_melody):
        text = transformers.T5Config()
        audio = transformers.EncodecConfig()
        decoder = transformers.MusicgenMelodyDecoderConfig()
        return musicgen_melody(text_encoder=text, audio_encoder=audio, decoder=decoder)

    sub_configs = getattr(config_class, "sub_configs", None)
    if sub_configs:
        payload: dict[str, Any] = {}
        for key, sub in sub_configs.items():
            if sub is None:
                continue
            if getattr(sub, "__name__", "") == "AutoConfig":
                payload[key] = _choose_default_subconfig(transformers, key)
            else:
                try:
                    payload[key] = sub()
                except Exception:
                    payload[key] = _choose_default_subconfig(transformers, key)
        try:
            return config_class(**payload)
        except TypeError as exc:
            if "mapping" in str(exc):
                dict_payload: dict[str, Any] = {}
                for key, value in payload.items():
                    if hasattr(value, "to_dict"):
                        dict_payload[key] = value.to_dict()
                    else:
                        dict_payload[key] = value
                try:
                    return config_class(**dict_payload)
                except Exception:
                    pass
        except Exception:
            pass

    return config_class()


def _choose_default_subconfig(transformers, key: str):
    lower = key.lower()
    if "keypoint" in lower:
        superpoint = getattr(transformers, "SuperPointConfig", None)
        if superpoint is not None:
            return superpoint()
    if "vision" in lower:
        return transformers.ViTConfig()
    if "question" in lower:
        dpr = getattr(transformers, "DPRQuestionEncoderConfig", None)
        if dpr is not None:
            return dpr()
    if "generator" in lower or "decoder" in lower:
        bart = getattr(transformers, "BartConfig", None)
        if bart is not None:
            return bart()
        return transformers.GPT2Config()
    if "audio" in lower:
        encodec = getattr(transformers, "EncodecConfig", None)
        if encodec is not None:
            return encodec()
        return transformers.Wav2Vec2Config()
    if "text" in lower or "encoder" in lower:
        return transformers.BertConfig()
    return transformers.BertConfig()


def parse_all_models(
    *,
    output_dir: Path,
    transformers_src: str | None = None,
    include_param_details: bool = True,
    include_buffer_details: bool = True,
    collapse_layers: bool = True,
    device: str = "cpu",
    dtype: str | None = None,
    empty_weights: bool = True,
    strict_empty_weights: bool = True,
    max_non_meta_param_bytes: int = 1_073_741_824,
    max_non_meta_buffer_bytes: int = 5_000_000,
    mapping_filter: set[str] | None = None,
    max_models: int | None = None,
    write_index: bool = True,
    compression: str = "none",
    compact_json: bool = False,
) -> dict[str, Any]:
    transformers = import_transformers(transformers_src)
    ensure_dir(output_dir)

    specs, mapping_errors = discover_model_specs(transformers, mapping_filter=mapping_filter)
    if max_models is not None:
        specs = specs[:max_models]

    parsed = 0
    failed = 0
    if compression not in {"none", "gzip", "zstd"}:
        raise ValueError(f"Unsupported compression: {compression}")
    filename = "model.json"
    if compression == "gzip":
        filename = "model.json.gz"
    elif compression == "zstd":
        filename = "model.json.zst"
    for spec in specs:
        safe_id = safe_model_dir_name(spec.model_id)
        model_dir = output_dir / safe_id
        output_file = model_dir / filename
        if output_file.exists():
            try:
                existing = read_json(output_file)
                if existing.get("status") == "ok":
                    continue
            except Exception:
                pass
        try:
            config_class = spec.config_class
            expected_config_class = getattr(spec.model_class, "config_class", None)
            if expected_config_class and not issubclass(config_class, expected_config_class):
                config_class = expected_config_class
            config = build_default_config(transformers, config_class)
            data = parse_model_from_config(
                spec.model_id,
                model_class=spec.model_class,
                config=config,
                output_dir=model_dir,
                include_param_details=include_param_details,
                include_buffer_details=include_buffer_details,
                collapse_layers=collapse_layers,
                trace=False,
                transformers_src=transformers_src,
                device=device,
                dtype=dtype,
                mapping_names=spec.mapping_names,
                empty_weights=empty_weights,
                strict_empty_weights=strict_empty_weights,
                max_non_meta_param_bytes=max_non_meta_param_bytes,
                max_non_meta_buffer_bytes=max_non_meta_buffer_bytes,
                source="catalog",
            )
            parsed += 1
        except Exception as exc:
            data = error_payload(
                spec.model_id,
                exc,
                extra_model_fields={
                    "config_class": spec.config_class.__name__,
                    "mapping_names": spec.mapping_names,
                    "source": "catalog",
                },
            )
            failed += 1
        write_json(output_file, data, compact=compact_json)

    for entry in mapping_errors:
        model_id = f"mapping_error::{entry.get('mapping')}"
        safe_id = safe_model_dir_name(model_id)
        model_dir = output_dir / safe_id
        output_file = model_dir / filename
        data = error_payload(
            model_id,
            RuntimeError(entry.get("error", "mapping error")),
            extra_model_fields=entry,
        )
        write_json(output_file, data, compact=compact_json)

    existing_mapping_dirs = [path for path in output_dir.iterdir() if path.is_dir() and path.name.startswith("mapping_error__")]
    expected_mapping_dirs = {
        safe_model_dir_name(f"mapping_error::{entry.get('mapping')}")
        for entry in mapping_errors
        if entry.get("mapping")
    }
    for path in existing_mapping_dirs:
        if path.name not in expected_mapping_dirs:
            shutil.rmtree(path, ignore_errors=True)

    index = build_index(output_dir) if write_index else {"count": parsed + failed}
    return {"parsed": parsed, "failed": failed, "errors": len(mapping_errors), "index": index}
