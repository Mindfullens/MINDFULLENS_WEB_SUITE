#!/usr/bin/env python3
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image


def _srgb_to_linear(c: np.ndarray) -> np.ndarray:
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _linear_to_srgb(c: np.ndarray) -> np.ndarray:
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * (c ** (1 / 2.4)) - 0.055)


def _load_cube(path: str) -> np.ndarray:
    size = None
    data = []
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            upper = line.upper()
            if upper.startswith("LUT_3D_SIZE"):
                size = int(line.split()[-1])
                continue
            if upper.startswith("DOMAIN_"):
                continue
            parts = line.split()
            if len(parts) == 3:
                data.append([float(parts[0]), float(parts[1]), float(parts[2])])
    if size is None:
        raise ValueError("Missing LUT_3D_SIZE")
    array = np.array(data, dtype=np.float32)
    if array.shape[0] != size ** 3:
        raise ValueError("Unexpected LUT size")
    return array.reshape((size, size, size, 3))


def _trilinear(lut: np.ndarray, rgb: np.ndarray) -> np.ndarray:
    size = lut.shape[0]
    rgb = np.clip(rgb, 0.0, 1.0)
    pos = rgb * (size - 1)
    idx0 = np.floor(pos).astype(int)
    idx1 = np.clip(idx0 + 1, 0, size - 1)
    delta = pos - idx0

    c000 = lut[idx0[..., 0], idx0[..., 1], idx0[..., 2]]
    c001 = lut[idx0[..., 0], idx0[..., 1], idx1[..., 2]]
    c010 = lut[idx0[..., 0], idx1[..., 1], idx0[..., 2]]
    c011 = lut[idx0[..., 0], idx1[..., 1], idx1[..., 2]]
    c100 = lut[idx1[..., 0], idx0[..., 1], idx0[..., 2]]
    c101 = lut[idx1[..., 0], idx0[..., 1], idx1[..., 2]]
    c110 = lut[idx1[..., 0], idx1[..., 1], idx0[..., 2]]
    c111 = lut[idx1[..., 0], idx1[..., 1], idx1[..., 2]]

    dx = delta[..., 0:1]
    dy = delta[..., 1:2]
    dz = delta[..., 2:3]

    c00 = c000 * (1 - dx) + c100 * dx
    c01 = c001 * (1 - dx) + c101 * dx
    c10 = c010 * (1 - dx) + c110 * dx
    c11 = c011 * (1 - dx) + c111 * dx

    c0 = c00 * (1 - dy) + c10 * dy
    c1 = c01 * (1 - dy) + c11 * dy
    return c0 * (1 - dz) + c1 * dz


def _save_output(path: str, image: Image.Image, jpeg_quality: int) -> None:
    out_path = Path(path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    suffix = out_path.suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        image.save(out_path, quality=jpeg_quality, optimize=True)
        return
    if suffix in {".tif", ".tiff"}:
        image.save(out_path, compression="tiff_lzw")
        return
    image.save(out_path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Render backup TIFF/JPEG using LUT outside Lightroom.")
    parser.add_argument("--input", required=True, help="Input TIFF/JPEG/PNG image path")
    parser.add_argument("--lut", required=True, help="Cube LUT path")
    parser.add_argument("--output-tiff", required=True, help="Output TIFF path")
    parser.add_argument("--output-jpeg", required=True, help="Output JPEG path")
    parser.add_argument("--jpeg-quality", type=int, default=95, help="JPEG quality 1..100")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    image = Image.open(args.input).convert("RGB")
    rgb = np.array(image, dtype=np.float32) / 255.0
    linear = _srgb_to_linear(rgb)
    lut = _load_cube(args.lut)
    out_linear = _trilinear(lut, linear)
    out_srgb = _linear_to_srgb(np.clip(out_linear, 0.0, 1.0))
    out = Image.fromarray(np.clip(out_srgb * 255.0, 0, 255).astype(np.uint8))
    quality = max(1, min(100, int(args.jpeg_quality)))
    _save_output(args.output_tiff, out, quality)
    _save_output(args.output_jpeg, out, quality)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
