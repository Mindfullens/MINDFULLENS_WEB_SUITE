from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Union

import numpy as np

RGB = tuple[float, float, float]
ArrayLike = Union[RGB, np.ndarray, list]


@dataclass(frozen=True)
class KubelkaMunkParams:
    k_coeffs: tuple[float, float, float]
    s_coeffs: tuple[float, float, float]
    epsilon: float = 1e-6
    print_contrast: float = 1.0


class KubelkaMunkEngine:
    def __init__(self, params: KubelkaMunkParams):
        if len(params.k_coeffs) != 3 or len(params.s_coeffs) != 3:
            raise ValueError("k_coeffs and s_coeffs must have length 3")
        self.params = params
        self._k_arr = np.array(params.k_coeffs, dtype=np.float64)
        self._s_arr = np.array(params.s_coeffs, dtype=np.float64)

    def linear_rgb_to_density(self, rgb_linear: ArrayLike) -> np.ndarray:
        eps = self.params.epsilon
        rgb_arr = np.asarray(rgb_linear, dtype=np.float64)
        rgb_clamped = np.clip(rgb_arr, eps, None)
        return -np.log10(rgb_clamped)

    def apply_kubelka_munk(self, cmy_density: ArrayLike) -> np.ndarray:
        eps = self.params.epsilon
        density_arr = np.asarray(cmy_density, dtype=np.float64)

        k_layer = density_arr * self._k_arr
        s_layer = density_arr * self._s_arr + eps

        ratio = k_layer / s_layer
        reflectance = 1.0 + ratio - np.sqrt((ratio * ratio) + (2.0 * ratio))

        return np.clip(reflectance, 0.0, 1.0)

    def process_pixel(self, rgb_linear: RGB) -> RGB:
        arr = self.process_pixels([rgb_linear])[0]
        return (float(arr[0]), float(arr[1]), float(arr[2]))

    def process_pixels(self, rgb_linear_pixels: ArrayLike) -> np.ndarray:
        density = self.linear_rgb_to_density(rgb_linear_pixels)
        remission = self.apply_kubelka_munk(density)

        rgb_print = remission

        contrast = self.params.print_contrast
        if not math.isclose(contrast, 1.0):
            rgb_print = np.power(np.clip(rgb_print, 0.0, None), contrast)

        return np.clip(rgb_print, 0.0, 1.0)
