#!/usr/bin/env python3
"""
MindfulLens live preview: Optyczna Dyspersja (monochromatyczna).

Algorithm (edge-limited, no chroma fringe):
1) Luma_Base extraction
2) Luma_Prime = directional fractional shift + narrow directional smear
3) Edge_Mask from Sobel magnitude
4) Blend (lighten-like) with low opacity gated by Edge_Mask
5) Re-apply chroma by scaling original RGB with luma ratio
"""

from __future__ import annotations

import argparse
import math
import os
import sys

import cv2
import numpy as np


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Live optical dyspersja preview")
    p.add_argument("--image", required=True, help="Path to proxy image")
    p.add_argument("--initial", type=int, default=0, help="Initial slider 0-100")
    p.add_argument("--result", required=False, help="Optional JSON output with selected value")
    return p.parse_args()


def clamp01(x: np.ndarray) -> np.ndarray:
    return np.clip(x, 0.0, 1.0)


def luma_from_bgr(img_bgr_f32: np.ndarray) -> np.ndarray:
    # BT.709-ish luma
    b = img_bgr_f32[..., 0]
    g = img_bgr_f32[..., 1]
    r = img_bgr_f32[..., 2]
    return 0.0722 * b + 0.7152 * g + 0.2126 * r


def shifted_luma(luma: np.ndarray, dx: float, dy: float) -> np.ndarray:
    h, w = luma.shape
    m = np.array([[1.0, 0.0, dx], [0.0, 1.0, dy]], dtype=np.float32)
    return cv2.warpAffine(
        luma,
        m,
        (w, h),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REFLECT_101,
    )


def directional_smear(luma_shifted: np.ndarray, dx: float, dy: float, radius: int) -> np.ndarray:
    if radius <= 1:
        return luma_shifted

    # unit vector aligned with shift direction
    length = max(1e-5, math.sqrt(dx * dx + dy * dy))
    ux, uy = dx / length, dy / length

    steps = np.arange(0, radius + 1, dtype=np.float32)
    weights = np.exp(-steps / max(1.0, radius * 0.55))
    weights /= np.sum(weights)

    acc = np.zeros_like(luma_shifted, dtype=np.float32)
    for i, w in enumerate(weights):
        sx = ux * float(i)
        sy = uy * float(i)
        acc += float(w) * shifted_luma(luma_shifted, sx, sy)
    return acc


def build_edge_mask(luma_base: np.ndarray, strength_norm: float) -> np.ndarray:
    gx = cv2.Sobel(luma_base, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(luma_base, cv2.CV_32F, 0, 1, ksize=3)
    mag = cv2.magnitude(gx, gy)
    mag = cv2.GaussianBlur(mag, (0, 0), sigmaX=1.0)

    # Normalize robustly
    p95 = float(np.percentile(mag, 95.0)) if mag.size else 1.0
    norm = mag / max(1e-6, p95)
    norm = clamp01(norm)

    # Balanced threshold (strong enough to see, not full-frame flood).
    th = 0.22 - 0.10 * strength_norm
    edge_sobel = np.where(norm > th, (norm - th) / max(1e-6, 1.0 - th), 0.0).astype(np.float32)

    # Canny support for contour stability.
    u8 = np.clip(luma_base * 255.0, 0, 255).astype(np.uint8)
    c1 = int(max(12, 28 - 9 * strength_norm))
    c2 = int(max(34, 74 - 18 * strength_norm))
    canny = cv2.Canny(u8, c1, c2).astype(np.float32) / 255.0
    canny = cv2.GaussianBlur(canny, (0, 0), sigmaX=1.2)

    edge = np.maximum(edge_sobel, canny)
    edge = cv2.GaussianBlur(edge, (0, 0), sigmaX=0.9)
    return clamp01(edge)


def apply_optical_dyspersja(img_bgr_u8: np.ndarray, strength: int) -> np.ndarray:
    s = max(0.0, min(1.0, strength / 100.0))
    if s <= 1e-4:
        return img_bgr_u8

    img_f = img_bgr_u8.astype(np.float32) / 255.0
    luma_base = luma_from_bgr(img_f)

    # Asymmetry vector in pixels (fractional shift)
    dx = 1.40 + 4.80 * s
    dy = 0.45 + 1.90 * s
    luma_shifted = shifted_luma(luma_base, dx, dy)

    # Narrow directional smear coupled with vector direction
    smear_radius = max(2, int(round(2.0 + 6.4 * s)))
    luma_prime = directional_smear(luma_shifted, dx, dy, smear_radius)

    # Edge mask only
    edge_mask = build_edge_mask(luma_base, s)

    # Low opacity blend, edge-gated
    opacity = 0.28 + 0.42 * s
    alpha = edge_mask * opacity

    # Edge ghost: blend shifted luma + controlled edge contrast carry.
    luma_mix = luma_base * (1.0 - alpha) + luma_prime * alpha
    edge_delta = np.abs(luma_prime - luma_base) * (0.32 + 0.36 * s) * edge_mask
    luma_out = np.maximum(luma_base, luma_mix + edge_delta)
    luma_out = clamp01(luma_out)

    # Reapply original chroma (no color fringes)
    ratio = luma_out / np.maximum(1e-4, luma_base)
    out = img_f * ratio[..., None]
    out = clamp01(out)
    return (out * 255.0 + 0.5).astype(np.uint8)


def main() -> int:
    args = parse_args()
    if not os.path.exists(args.image):
        print(f"missing image: {args.image}", file=sys.stderr)
        return 1

    src = cv2.imread(args.image, cv2.IMREAD_COLOR)
    if src is None:
        print(f"cannot open image: {args.image}", file=sys.stderr)
        return 1

    win = "MindfulLens - Optyczna Dyspersja (Live Preview, ESC)"
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(win, 1400, 900)
    cv2.createTrackbar("Optyczna Dyspersja", win, max(0, min(100, args.initial)), 100, lambda _v: None)

    selected_value = max(0, min(100, args.initial))
    while True:
        # Break immediately when user closes the window via [X].
        if cv2.getWindowProperty(win, cv2.WND_PROP_VISIBLE) < 1:
            break
        v = cv2.getTrackbarPos("Optyczna Dyspersja", win)
        selected_value = v
        out = apply_optical_dyspersja(src, v)
        # High-contrast HUD so value is always readable.
        cv2.rectangle(out, (10, 10), (700, 130), (0, 0, 0), thickness=-1)
        cv2.putText(
            out,
            "ESC / Q / ENTER = zamknij",
            (24, 50),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.00,
            (230, 230, 230),
            2,
            cv2.LINE_AA,
        )
        cv2.putText(
            out,
            f"Optyczna Dyspersja: {v:3d}",
            (24, 104),
            cv2.FONT_HERSHEY_SIMPLEX,
            1.25,
            (255, 255, 255),
            4,
            cv2.LINE_AA,
        )
        cv2.imshow(win, out)
        key = cv2.waitKey(16) & 0xFF
        if key in (27, ord("q"), ord("Q"), 13):
            break

    cv2.destroyAllWindows()
    if args.result:
        try:
            os.makedirs(os.path.dirname(args.result), exist_ok=True)
            with open(args.result, "w", encoding="utf-8") as f:
                f.write('{"value": %d}\n' % int(selected_value))
        except Exception:
            # Do not fail preview close path because of optional result write.
            pass
    print(f"selected_value={int(selected_value)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
