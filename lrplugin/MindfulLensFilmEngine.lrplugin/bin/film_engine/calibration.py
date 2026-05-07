from __future__ import annotations

from typing import Dict, List, Tuple

import numpy as np

from .km_engine import KubelkaMunkEngine, KubelkaMunkParams

D65_X, D65_Y = 0.3127, 0.3290


def linear_rec2020_to_xyz(rgb: np.ndarray) -> np.ndarray:
    matrix = np.array(
        [
            [0.636958, 0.144617, 0.168881],
            [0.262700, 0.677998, 0.059302],
            [0.000000, 0.028073, 1.060985],
        ]
    )
    return np.dot(rgb, matrix.T)


def calculate_cct_and_duv(x: float, y: float) -> Tuple[float, float]:
    n = (x - 0.3320) / (0.1858 - y) if (0.1858 - y) != 0 else 0
    cct = 449.0 * (n ** 3) + 3525.0 * (n ** 2) + 6823.3 * n + 5520.33
    duv_approx = (y - D65_Y) - (x - D65_X) * 2.0
    tint = duv_approx * -3000.0
    return cct, tint


def extract_white_balance_shift(
    k_coeffs: Tuple[float, float, float],
    s_coeffs: Tuple[float, float, float],
    print_contrast: float,
) -> Tuple[int, int]:
    engine = KubelkaMunkEngine(
        KubelkaMunkParams(
            k_coeffs=k_coeffs,
            s_coeffs=s_coeffs,
            print_contrast=print_contrast,
        )
    )

    white_out = engine.process_pixels(np.array([[1.0, 1.0, 1.0]], dtype=np.float64))[0]
    xyz = linear_rec2020_to_xyz(white_out)
    total_xyz = np.sum(xyz)
    if total_xyz <= 0:
        return 0, 0

    x = xyz[0] / total_xyz
    y = xyz[1] / total_xyz
    cct, tint = calculate_cct_and_duv(x, y)

    temp_shift = int(round(max(-10000, min(10000, cct - 6500.0))))
    tint_shift = int(round(max(-100, min(100, tint))))
    return temp_shift, tint_shift


def extract_tone_curve_pv2012(
    k_coeffs: Tuple[float, float, float],
    s_coeffs: Tuple[float, float, float],
    print_contrast: float,
    points: int = 16,
) -> Dict[str, List[int]]:
    engine = KubelkaMunkEngine(
        KubelkaMunkParams(
            k_coeffs=k_coeffs,
            s_coeffs=s_coeffs,
            print_contrast=print_contrast,
        )
    )

    linear_stops = np.linspace(0.001, 1.0, points)
    rgb_in = np.column_stack((linear_stops, linear_stops, linear_stops))
    rgb_out = engine.process_pixels(rgb_in)

    curves = {"Red": [], "Green": [], "Blue": [], "Master": []}
    for i in range(points):
        x_val = int(round(linear_stops[i] * 255.0))
        r_val = int(round(max(0.0, min(1.0, rgb_out[i, 0])) * 255.0))
        g_val = int(round(max(0.0, min(1.0, rgb_out[i, 1])) * 255.0))
        b_val = int(round(max(0.0, min(1.0, rgb_out[i, 2])) * 255.0))
        m_val = int(round((r_val + g_val + b_val) / 3.0))

        curves["Red"].extend([x_val, r_val])
        curves["Green"].extend([x_val, g_val])
        curves["Blue"].extend([x_val, b_val])
        curves["Master"].extend([x_val, m_val])
    return curves
