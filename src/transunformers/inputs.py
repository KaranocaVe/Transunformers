from __future__ import annotations

import inspect
from typing import Any


def _allowed_forward_keys(model) -> set[str]:
    try:
        signature = inspect.signature(model.forward)
        return {name for name in signature.parameters if name != "self"}
    except (TypeError, ValueError):
        return set()


def _first_param_dtype(model):
    for param in model.parameters():
        return param.dtype
    return None


def _first_param_device(model):
    for param in model.parameters():
        return param.device
    return None


def _as_int(value, default):
    try:
        return int(value)
    except Exception:
        return default


def _resolve_image_size(config) -> int:
    size = getattr(config, "image_size", None)
    if isinstance(size, (list, tuple)) and size:
        return _as_int(size[0], 224)
    return _as_int(size, 224)


def _build_text_inputs(torch, config) -> dict[str, Any]:
    vocab_size = _as_int(getattr(config, "vocab_size", 30522), 30522)
    max_positions = _as_int(getattr(config, "max_position_embeddings", 16), 16)
    seq_len = max(2, min(max_positions, 16))
    input_ids = torch.randint(0, vocab_size, (1, seq_len), dtype=torch.long)
    attention_mask = torch.ones_like(input_ids)
    inputs = {"input_ids": input_ids, "attention_mask": attention_mask}
    if _as_int(getattr(config, "type_vocab_size", 0), 0) > 1:
        inputs["token_type_ids"] = torch.zeros_like(input_ids)
    return inputs


def _build_decoder_inputs(torch, config) -> dict[str, Any]:
    start_id = getattr(config, "decoder_start_token_id", None)
    if start_id is None:
        start_id = getattr(config, "bos_token_id", 0)
    start_id = _as_int(start_id, 0)
    decoder_input_ids = torch.full((1, 2), start_id, dtype=torch.long)
    decoder_attention_mask = torch.ones_like(decoder_input_ids)
    return {"decoder_input_ids": decoder_input_ids, "decoder_attention_mask": decoder_attention_mask}


def _build_pixel_inputs(torch, config) -> dict[str, Any]:
    size = _resolve_image_size(config)
    pixel_values = torch.zeros((1, 3, size, size), dtype=torch.float32)
    return {"pixel_values": pixel_values}


def _build_audio_inputs(torch, config) -> dict[str, Any]:
    if hasattr(config, "num_mel_bins") or hasattr(config, "feature_size"):
        feature_size = _as_int(getattr(config, "feature_size", getattr(config, "num_mel_bins", 80)), 80)
        seq_len = _as_int(getattr(config, "max_source_positions", 3000), 300)
        input_features = torch.zeros((1, feature_size, seq_len), dtype=torch.float32)
        return {"input_features": input_features}

    seq_len = _as_int(getattr(config, "max_source_positions", 16000), 16000)
    input_values = torch.zeros((1, seq_len), dtype=torch.float32)
    return {"input_values": input_values}


def _filter_allowed(inputs: dict[str, Any], allowed: set[str]) -> dict[str, Any]:
    if not allowed:
        return inputs
    return {k: v for k, v in inputs.items() if k in allowed}


def build_dummy_inputs(model, *, tokenizer=None, sample_text: str | None = None) -> dict[str, Any]:
    torch = __import__("torch")
    allowed = _allowed_forward_keys(model)

    if tokenizer and sample_text:
        tokenized = tokenizer(sample_text, return_tensors="pt")
        inputs = _filter_allowed(dict(tokenized), allowed)
        if inputs:
            return inputs

    try:
        dummy = getattr(model, "dummy_inputs", None)
        if isinstance(dummy, dict) and dummy:
            inputs = _filter_allowed(dummy, allowed)
            if inputs:
                return inputs
    except Exception:
        pass

    config = getattr(model, "config", None)
    if config is None:
        raise ValueError("Model config missing; cannot build dummy inputs.")

    inputs: dict[str, Any] = {}
    main_input = getattr(model, "main_input_name", "input_ids")
    if "input_ids" in allowed or (not allowed and main_input == "input_ids"):
        inputs.update(_build_text_inputs(torch, config))
    if "pixel_values" in allowed or (not allowed and main_input == "pixel_values"):
        inputs.update(_build_pixel_inputs(torch, config))
    if (
        "input_features" in allowed
        or "input_values" in allowed
        or (not allowed and main_input in {"input_features", "input_values"})
    ):
        inputs.update(_build_audio_inputs(torch, config))

    if getattr(config, "is_encoder_decoder", False) or "decoder_input_ids" in allowed:
        inputs.update(_build_decoder_inputs(torch, config))

    if allowed:
        inputs = _filter_allowed(inputs, allowed)

    if not inputs:
        raise ValueError("Unable to construct dummy inputs for model forward.")

    device = _first_param_device(model)
    dtype = _first_param_dtype(model)
    if device is not None:
        for key, value in inputs.items():
            if hasattr(value, "to"):
                inputs[key] = value.to(device)
    if dtype is not None:
        for key, value in inputs.items():
            if hasattr(value, "is_floating_point") and value.is_floating_point():
                inputs[key] = value.to(dtype=dtype)

    return inputs
