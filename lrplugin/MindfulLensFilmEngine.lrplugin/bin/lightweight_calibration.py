from __future__ import annotations

import math
from typing import Dict, List, Tuple

D65_X, D65_Y = 0.3127, 0.3290


def linear_rec2020_to_xyz(rgb: Tuple[float, float, float]) -> Tuple[float, float, float]:
    r, g, b = rgb
    return (
        0.636958 * r + 0.144617 * g + 0.168881 * b,
        0.262700 * r + 0.677998 * g + 0.059302 * b,
        0.028073 * g + 1.060985 * b,
    )


def calculate_cct_and_duv(x: float, y: float) -> Tuple[float, float]:
    n = (x - 0.3320) / (0.1858 - y) if (0.1858 - y) != 0 else 0.0
    cct = 449.0 * (n ** 3) + 3525.0 * (n ** 2) + 6823.3 * n + 5520.33
    duv_approx = (y - D65_Y) - (x - D65_X) * 2.0
    tint = duv_approx * -3000.0
    return cct, tint


def _process_gray(level: float, k_coeffs: Tuple[float, float, float], s_coeffs: Tuple[float, float, float], print_contrast: float, epsilon: float = 1e-6) -> Tuple[float, float, float]:
    density = tuple(-math.log10(max(level, epsilon)) for _ in range(3))
    remission = []
    for channel_density, k_coeff, s_coeff in zip(density, k_coeffs, s_coeffs):
        k_layer = channel_density * float(k_coeff)
        s_layer = channel_density * float(s_coeff) + epsilon
        ratio = k_layer / s_layer
        reflectance = 1.0 + ratio - math.sqrt((ratio * ratio) + (2.0 * ratio))
        reflectance = max(0.0, min(1.0, reflectance))
        if not math.isclose(print_contrast, 1.0):
            reflectance = pow(max(reflectance, 0.0), print_contrast)
        remission.append(max(0.0, min(1.0, reflectance)))
    return (remission[0], remission[1], remission[2])


def extract_white_balance_shift(
    k_coeffs: Tuple[float, float, float],
    s_coeffs: Tuple[float, float, float],
    print_contrast: float,
) -> Tuple[int, int]:
    white_out = _process_gray(1.0, k_coeffs, s_coeffs, print_contrast)
    xyz = linear_rec2020_to_xyz(white_out)
    total_xyz = sum(xyz)
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
    points = max(2, int(points))
    start = 0.001
    stop = 1.0
    step = (stop - start) / float(points - 1)
    curves = {"Red": [], "Green": [], "Blue": [], "Master": []}

    for i in range(points):
        level = start + step * i
        rgb_out = _process_gray(level, k_coeffs, s_coeffs, print_contrast)
        x_val = int(round(level * 255.0))
        r_val = int(round(max(0.0, min(1.0, rgb_out[0])) * 255.0))
        g_val = int(round(max(0.0, min(1.0, rgb_out[1])) * 255.0))
        b_val = int(round(max(0.0, min(1.0, rgb_out[2])) * 255.0))
        m_val = int(round((r_val + g_val + b_val) / 3.0))
        curves["Red"].extend([x_val, r_val])
        curves["Green"].extend([x_val, g_val])
        curves["Blue"].extend([x_val, b_val])
        curves["Master"].extend([x_val, m_val])

    return curves
