#!/usr/bin/env python3
"""
MindfulLens Analog External Runner — engine v1.

Contract:
- Reads JSON request from --request
- Writes JSON response to --response
- Produces rendered TIFF at request.output_path

Engine v2 — Optyczna Dyspersja i Asymetryczna Aberracja
("Procedural Vector Pixel-Shift & Directional Bleed"):

  1) Green channel stays anchored (luminance core).
  2) Red/Blue are shifted in opposite X directions (asymmetric lens factors).
  3) Shifted channels receive directional motion smear aligned to shift vectors.
  4) Radial non-linear lens mask boosts effect from center (0%) to edges (100%).

  Output keeps input dtype and dynamic range (uint8/uint16/float32).

Other effects in the request (bloom, halation, anamorph) are kept in the
response payload for forward compatibility but are not modified here, because
Lightroom already applies their delta-blended XMP equivalents in the Develop
module before the export. Only chromAb requires per-pixel work that LR can't
reproduce natively.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from datetime import datetime
from typing import Any, Callable, Tuple


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="MindfulLens analog external bridge")
    parser.add_argument("--request", required=True, help="Path to request JSON")
    parser.add_argument("--response", required=True, help="Path to response JSON")
    return parser.parse_args()


def read_json(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: str, payload: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def _import_numpy():
    try:
        import numpy  # type: ignore

        return numpy
    except ImportError as exc:  # noqa: BLE001
        raise RuntimeError(
            "numpy is required for the analog external engine. "
            "Install via: pip3 install --user numpy tifffile"
        ) from exc


def _import_imaging(np_module) -> Tuple[Callable[[str], Any], Callable[[str, Any], None], str]:
    """Return (read_tiff, write_tiff, backend_label)."""

    np = np_module

    try:
        import tifffile  # type: ignore

        def read_tiff(path: str):
            return tifffile.imread(path)

        def write_tiff(path: str, arr) -> None:
            tifffile.imwrite(path, arr, photometric="rgb", compression=None)

        return read_tiff, write_tiff, "tifffile"
    except ImportError:
        pass

    try:
        from PIL import Image  # type: ignore

        def read_tiff(path: str):
            with Image.open(path) as im:
                im.load()
                return np.array(im)

        def write_tiff(path: str, arr) -> None:
            if arr.dtype == np.uint16:
                im = Image.fromarray(arr, mode="I;16")
            elif arr.dtype == np.uint8:
                im = Image.fromarray(arr, mode="RGB" if arr.ndim == 3 else "L")
            else:
                clipped = np.clip(arr, 0.0, 1.0)
                im = Image.fromarray((clipped * 65535.0).astype(np.uint16))
            im.save(path, format="TIFF", compression=None)

        return read_tiff, write_tiff, "pillow"
    except ImportError as exc:  # noqa: BLE001
        raise RuntimeError(
            "Neither tifffile nor Pillow available; install one: "
            "pip3 install --user tifffile  (preferred) or  pip3 install --user pillow"
        ) from exc


def _shifted_columns(width: int, offset: float, np_module):
    """Sampling plan for 1D sub-pixel sampling at (x - offset), clamped at borders."""
    np = np_module
    base = np.arange(width, dtype=np.float64) - float(offset)
    floor = np.floor(base).astype(np.int64)
    frac = (base - floor).astype(np.float32)
    ceil = floor + 1
    floor = np.clip(floor, 0, width - 1)
    ceil = np.clip(ceil, 0, width - 1)
    return floor, ceil, frac


def _sample_shifted_x(channel_2d, offset: float, np_module):
    """Sub-pixel horizontal sampling of one channel."""
    np = np_module
    h, w = channel_2d.shape
    floor, ceil, frac = _shifted_columns(w, offset, np)
    return (1.0 - frac)[None, :] * channel_2d[:, floor] + frac[None, :] * channel_2d[:, ceil]


def _directional_smear(channel_2d, direction_sign: float, radius_px: int, np_module):
    """Directional motion smear along X axis, aligned with channel shift direction."""
    np = np_module
    if radius_px <= 0:
        return channel_2d

    # Exponential weights -> organic film-like bleed tail.
    steps = np.arange(0, radius_px + 1, dtype=np.float32)
    weights = np.exp(-steps / max(1.0, radius_px * 0.55))
    weights /= np.sum(weights)

    acc = np.zeros_like(channel_2d, dtype=np.float32)
    for i, w in enumerate(weights):
        offset = direction_sign * float(i)
        acc += w * _sample_shifted_x(channel_2d, offset, np)
    return acc


def _radial_mask(height: int, width: int, intensity_norm: float, np_module):
    """0 at optical center, non-linearly increasing to edges/corners."""
    np = np_module
    yy, xx = np.meshgrid(
        np.linspace(-1.0, 1.0, height, dtype=np.float32),
        np.linspace(-1.0, 1.0, width, dtype=np.float32),
        indexing="ij",
    )
    radius = np.sqrt(xx * xx + yy * yy)
    radius = np.clip(radius / np.sqrt(2.0), 0.0, 1.0)

    # Stronger vintage-lens edge onset: defect enters frame deeper at high intensity.
    gamma = max(0.75, 2.20 - 1.45 * intensity_norm)
    mask = radius ** gamma
    return np.clip(mask, 0.0, 1.0)


def apply_chrom_ab(arr, chrom_ab_norm: float, np_module):
    """Procedural Vector Pixel-Shift & Directional Bleed (spectral separation engine)."""
    if chrom_ab_norm <= 0.0:
        return arr, {"max_shift_px": 0.0, "smear_radius_px": 0}

    np = np_module
    if arr.ndim != 3 or arr.shape[2] < 3:
        return arr, {"max_shift_px": 0.0, "smear_radius_px": 0}

    src_dtype = arr.dtype
    work = arr.astype(np.float32, copy=False)
    h, w, channels = work.shape

    # Pixel-shift base tuned for stronger low-cost-lens character.
    shift_max_px = max(1.0, chrom_ab_norm * 8.2)
    smear_radius_px = int(round(max(2.0, chrom_ab_norm * 12.5)))

    # Stronger asymmetry profile (plastic/early optics feel): red pulls harder, blue lags more.
    red_factor = 1.0 + 0.34 * chrom_ab_norm
    blue_factor = max(0.58, 1.0 - 0.28 * chrom_ab_norm)

    red_src = work[..., 0]
    green_src = work[..., 1]  # anchored luminance core
    blue_src = work[..., 2]

    # Directional smear on isolated channels, aligned with their vector travel.
    red_smeared = _directional_smear(red_src, +1.0, smear_radius_px, np)
    blue_smeared = _directional_smear(blue_src, -1.0, smear_radius_px, np)

    # Shift + smear integration
    red_shifted = _sample_shifted_x(red_smeared, +shift_max_px * red_factor, np)
    blue_shifted = _sample_shifted_x(blue_smeared, -shift_max_px * blue_factor, np)

    # Radial masking: 0 center -> 1 edges/corners with non-linear growth.
    mask = _radial_mask(h, w, chrom_ab_norm, np)
    mask3 = mask[..., None]

    out = np.empty_like(work)
    out[..., 0] = red_src * (1.0 - mask) + red_shifted * mask
    out[..., 1] = green_src
    out[..., 2] = blue_src * (1.0 - mask) + blue_shifted * mask
    if channels > 3:
        out[..., 3:] = work[..., 3:]

    if np.issubdtype(src_dtype, np.integer):
        info = np.iinfo(src_dtype)
        out = np.clip(out, info.min, info.max).astype(src_dtype)
    else:
        out = out.astype(src_dtype)

    return out, {"max_shift_px": float(shift_max_px), "smear_radius_px": int(smear_radius_px)}


def render(input_path: str, output_path: str, effects: dict) -> dict:
    np = _import_numpy()
    read_tiff, write_tiff, backend = _import_imaging(np)

    arr = read_tiff(input_path)
    if arr is None:
        raise RuntimeError(f"failed to decode TIFF: {input_path}")

    chrom_ab_value = float(effects.get("chromAb", 0) or 0)
    chrom_ab_norm = max(0.0, min(1.0, chrom_ab_value / 100.0))

    arr_out, applied = apply_chrom_ab(arr, chrom_ab_norm, np)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    write_tiff(output_path, arr_out)

    return {
        "engine": "analog_external_v1",
        "imaging_backend": backend,
        "input_dtype": str(arr.dtype),
        "input_shape": list(arr.shape),
        "applied": {
            "chromAb_input": chrom_ab_value,
            "chromAb_norm": chrom_ab_norm,
            "chromAb_pixel_shift": applied.get("max_shift_px", 0.0),
            "directional_smear_radius": applied.get("smear_radius_px", 0),
        },
        # Effects acknowledged in the request but applied earlier in Lightroom
        # via Develop settings (XMP-equivalent delta blends):
        "delegated_to_lightroom": [
            "bloom",
            "halation",
            "halRadius",
            "halThresh",
            "halHue",
            "anamorph",
            "streakLen",
        ],
    }


def main() -> int:
    args = parse_args()
    started = datetime.utcnow().isoformat() + "Z"

    try:
        req = read_json(args.request)
        input_path = req.get("input_path")
        output_path = req.get("output_path")
        effects = req.get("effects", {}) or {}

        if not input_path or not os.path.exists(input_path):
            raise FileNotFoundError(f"input missing: {input_path}")
        if not output_path:
            raise ValueError("output_path missing in request")

        try:
            details = render(input_path, output_path, effects)
            mode = "engine_v1"
        except Exception as render_exc:  # noqa: BLE001
            # Fallback so Lightroom still gets a file back; surface the cause in the response.
            shutil.copy2(input_path, output_path)
            details = {
                "engine": "fallback_copy",
                "error": str(render_exc),
                "hint": (
                    "Install Python imaging deps: pip3 install --user numpy tifffile "
                    "(or pillow). Re-run from Lightroom afterwards."
                ),
            }
            mode = "fallback_copy"

        write_json(
            args.response,
            {
                "status": "ok" if mode == "engine_v1" else "degraded",
                "mode": mode,
                "contract": "mindfullens.analog.external.v1",
                "started_at": started,
                "finished_at": datetime.utcnow().isoformat() + "Z",
                "input_path": input_path,
                "output_path": output_path,
                "effects": effects,
                "details": details,
            },
        )
        return 0
    except Exception as exc:  # noqa: BLE001
        write_json(
            args.response,
            {
                "status": "error",
                "mode": "engine_v1",
                "contract": "mindfullens.analog.external.v1",
                "started_at": started,
                "finished_at": datetime.utcnow().isoformat() + "Z",
                "error": str(exc),
            },
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
