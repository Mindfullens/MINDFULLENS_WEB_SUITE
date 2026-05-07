#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import struct
import subprocess
import sys
import tempfile

def _inject_runtime_paths() -> None:
    script_dir = Path(__file__).resolve().parent
    candidate_paths = [
        script_dir,
        script_dir.parent / "python",
        script_dir.parent / "vendor" / "python",
        Path(__file__).resolve().parents[3] / "src",
    ]
    for candidate in candidate_paths:
        if not candidate.exists():
            continue
        candidate_str = str(candidate)
        if candidate_str not in sys.path:
            sys.path.insert(0, candidate_str)


_inject_runtime_paths()
from lightweight_calibration import extract_white_balance_shift, extract_tone_curve_pv2012


EMULSION_REGISTRY = {
    "portra_400": {
        "config_file": "portra_400_v1.json",
        "lut_file": "portra_400.cube",
        "bias_delta": {
            "Exposure": 0.04,
        },
        "override": {
            "Exposure": 0.34,
            "Temperature": 5600,
            "Tint": 5,
            "Contrast2012": 10,
            "Highlights2012": -35,
            "Shadows2012": 32,
            "Whites2012": 11,
            "Blacks2012": -6,
            "Texture": 1,
            "Clarity2012": 1,
            "Dehaze": 0,
            "Vibrance": 8,
            "Saturation": -4,
            "HueAdjustmentRed": 2,
            "HueAdjustmentOrange": -4,
            "HueAdjustmentYellow": -6,
            "HueAdjustmentGreen": -8,
            "HueAdjustmentAqua": 0,
            "HueAdjustmentBlue": -4,
            "SaturationAdjustmentRed": -6,
            "SaturationAdjustmentOrange": -8,
            "SaturationAdjustmentYellow": -5,
            "SaturationAdjustmentGreen": -8,
            "SaturationAdjustmentAqua": 0,
            "SaturationAdjustmentBlue": -6,
            "LuminanceAdjustmentRed": 6,
            "LuminanceAdjustmentOrange": 10,
            "LuminanceAdjustmentYellow": 0,
            "LuminanceAdjustmentGreen": 0,
            "LuminanceAdjustmentAqua": 0,
            "LuminanceAdjustmentBlue": -5,
            "RedHue": 4,
            "RedSaturation": 2,
            "GreenHue": -4,
            "GreenSaturation": 0,
            "BlueHue": -6,
            "BlueSaturation": 4,
            "ColorGradeBlending": 50,
            "ColorGradeBalance": 14,
            "ColorGradeShadowsHue": 35,
            "ColorGradeShadowsSat": 5,
            "ColorGradeMidtoneHue": 40,
            "ColorGradeMidtoneSat": 8,
            "ColorGradeHighlightsHue": 50,
            "ColorGradeHighlightsSat": 10,
        },
    },
    "portra_800": {
        "config_file": "portra_800_v1.json",
        "lut_file": "portra_800.cube",
        "bias_delta": {
            "Exposure": 0.05,
        },
        "override": {
            "Exposure": 0.31,
            "Temperature": 5505,
            "Tint": -4,
            "Contrast2012": -27,
            "Highlights2012": -48,
            "Shadows2012": 15,
            "Whites2012": -25,
            "Blacks2012": -9,
            "Texture": 7,
            "Clarity2012": -2,
            "Dehaze": -4,
            "Vibrance": -7,
            "Saturation": -5,
            "HueAdjustmentRed": 4,
            "HueAdjustmentOrange": 2,
            "HueAdjustmentYellow": -10,
            "HueAdjustmentGreen": -10,
            "HueAdjustmentAqua": -3,
            "HueAdjustmentBlue": -1,
            "SaturationAdjustmentRed": 6,
            "SaturationAdjustmentOrange": 0,
            "SaturationAdjustmentYellow": -7,
            "SaturationAdjustmentGreen": -6,
            "SaturationAdjustmentAqua": -13,
            "SaturationAdjustmentBlue": -5,
            "LuminanceAdjustmentOrange": 4,
            "LuminanceAdjustmentYellow": 4,
            "LuminanceAdjustmentGreen": -4,
            "LuminanceAdjustmentBlue": -3,
            "RedHue": 8,
            "RedSaturation": 6,
            "GreenHue": -6,
            "GreenSaturation": -4,
            "BlueHue": -10,
            "BlueSaturation": -12,
            "ColorGradeMidtoneHue": 30,
            "ColorGradeMidtoneSat": 6,
            "ColorGradeBlending": 45,
        },
    },
    "gold_200": {
        "config_file": "gold_200_v1.json",
        "lut_file": "gold_200.cube",
        "bias_delta": {
            "Exposure": 0.03,
        },
        "override": {
            "Exposure": 0.18,
            "Temperature": 5580,
            "Tint": 2,
            "Contrast2012": 2,
            "Highlights2012": -30,
            "Shadows2012": 18,
            "Whites2012": -10,
            "Blacks2012": -7,
            "Texture": 5,
            "Clarity2012": 2,
            "Dehaze": -1,
            "Vibrance": 8,
            "Saturation": 2,
            "HueAdjustmentOrange": 4,
            "HueAdjustmentYellow": -12,
            "HueAdjustmentGreen": -18,
            "HueAdjustmentBlue": -3,
            "SaturationAdjustmentOrange": 6,
            "SaturationAdjustmentYellow": -4,
            "SaturationAdjustmentGreen": -10,
            "SaturationAdjustmentAqua": -10,
            "SaturationAdjustmentBlue": -6,
            "LuminanceAdjustmentOrange": 4,
            "LuminanceAdjustmentYellow": 2,
            "LuminanceAdjustmentBlue": -4,
            "ColorGradeMidtoneHue": 34,
            "ColorGradeMidtoneSat": 4,
            "ColorGradeHighlightsHue": 42,
            "ColorGradeHighlightsSat": 2,
            "ColorGradeBlending": 44,
        },
    },
    "gold_luxe": {
        "config_file": "gold_luxe_v1.json",
        "lut_file": "gold_luxe.cube",
        "bias_delta": {
            "Exposure": 0.03,
        },
        "override": {
            "Exposure": 0.20,
            "Temperature": 5660,
            "Tint": 2,
            "Contrast2012": 0,
            "Highlights2012": -28,
            "Shadows2012": 18,
            "Whites2012": -8,
            "Blacks2012": -5,
            "Texture": 2,
            "Clarity2012": -1,
            "Dehaze": -2,
            "Vibrance": 9,
            "Saturation": 1,
            "HueAdjustmentOrange": 5,
            "HueAdjustmentYellow": -8,
            "HueAdjustmentGreen": -10,
            "HueAdjustmentBlue": -2,
            "SaturationAdjustmentOrange": 6,
            "SaturationAdjustmentYellow": -2,
            "SaturationAdjustmentGreen": -8,
            "SaturationAdjustmentBlue": -4,
            "LuminanceAdjustmentOrange": 5,
            "LuminanceAdjustmentYellow": 2,
            "LuminanceAdjustmentBlue": -2,
            "ColorGradeMidtoneHue": 38,
            "ColorGradeMidtoneSat": 5,
            "ColorGradeHighlightsHue": 44,
            "ColorGradeHighlightsSat": 3,
            "ColorGradeBlending": 45,
        },
    },
    "kodak_gold_v1": {
        "config_file": "kodak_gold_v1_v1.json",
        "lut_file": "kodak_gold_v1.cube",
        "bias_delta": {
            "Exposure": 0.03,
        },
        "override": {
            "Exposure": 0.16,
            "Temperature": 5560,
            "Tint": 1,
            "Contrast2012": -2,
            "Highlights2012": -30,
            "Shadows2012": 18,
            "Whites2012": -10,
            "Blacks2012": -6,
            "Texture": 3,
            "Clarity2012": 0,
            "Dehaze": -1,
            "Vibrance": 7,
            "Saturation": 1,
            "HueAdjustmentOrange": 4,
            "HueAdjustmentYellow": -10,
            "HueAdjustmentGreen": -14,
            "HueAdjustmentBlue": -3,
            "SaturationAdjustmentOrange": 5,
            "SaturationAdjustmentYellow": -4,
            "SaturationAdjustmentGreen": -10,
            "SaturationAdjustmentBlue": -5,
            "LuminanceAdjustmentOrange": 4,
            "LuminanceAdjustmentYellow": 2,
            "LuminanceAdjustmentBlue": -3,
            "ColorGradeMidtoneHue": 34,
            "ColorGradeMidtoneSat": 4,
            "ColorGradeHighlightsHue": 42,
            "ColorGradeHighlightsSat": 2,
            "ColorGradeBlending": 44,
        },
    },
    "kodak_gold_v2": {
        "config_file": "kodak_gold_v2_v1.json",
        "lut_file": "kodak_gold_v2.cube",
        "bias_delta": {
            "Exposure": 0.03,
        },
        "override": {
            "Exposure": 0.18,
            "Temperature": 5600,
            "Tint": 2,
            "Contrast2012": 1,
            "Highlights2012": -28,
            "Shadows2012": 18,
            "Whites2012": -9,
            "Blacks2012": -6,
            "Texture": 4,
            "Clarity2012": 1,
            "Dehaze": -1,
            "Vibrance": 8,
            "Saturation": 2,
            "HueAdjustmentOrange": 5,
            "HueAdjustmentYellow": -10,
            "HueAdjustmentGreen": -15,
            "HueAdjustmentBlue": -3,
            "SaturationAdjustmentOrange": 6,
            "SaturationAdjustmentYellow": -4,
            "SaturationAdjustmentGreen": -11,
            "SaturationAdjustmentBlue": -6,
            "LuminanceAdjustmentOrange": 4,
            "LuminanceAdjustmentYellow": 2,
            "LuminanceAdjustmentBlue": -4,
            "ColorGradeMidtoneHue": 35,
            "ColorGradeMidtoneSat": 4,
            "ColorGradeHighlightsHue": 43,
            "ColorGradeHighlightsSat": 2,
            "ColorGradeBlending": 44,
        },
    },
    "kodachrome_v1": {
        "config_file": "kodachrome_v1_v1.json",
        "lut_file": "kodachrome_v1.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.06,
            "Temperature": 6000,
            "Tint": 1,
            "Contrast2012": 5,
            "Highlights2012": -28,
            "Shadows2012": 18,
            "Whites2012": -8,
            "Blacks2012": -14,
            "Texture": 7,
            "Clarity2012": 5,
            "Dehaze": 1,
            "Vibrance": 8,
            "Saturation": 2,
            "HueAdjustmentRed": -2,
            "HueAdjustmentOrange": -3,
            "HueAdjustmentYellow": -8,
            "HueAdjustmentGreen": -12,
            "HueAdjustmentAqua": -6,
            "HueAdjustmentBlue": -8,
            "SaturationAdjustmentRed": 8,
            "SaturationAdjustmentOrange": 2,
            "SaturationAdjustmentYellow": 2,
            "SaturationAdjustmentGreen": -4,
            "SaturationAdjustmentAqua": 1,
            "SaturationAdjustmentBlue": 10,
            "LuminanceAdjustmentOrange": 1,
            "LuminanceAdjustmentYellow": -3,
            "LuminanceAdjustmentGreen": -8,
            "LuminanceAdjustmentBlue": -14,
            "ColorGradeMidtoneHue": 38,
            "ColorGradeMidtoneSat": 4,
            "ColorGradeHighlightsHue": 48,
            "ColorGradeHighlightsSat": 2,
            "ColorGradeBlending": 46,
        },
    },
    "kodachrome_v2": {
        "config_file": "kodachrome_v2_v1.json",
        "lut_file": "kodachrome_v2.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.08,
            "Temperature": 6125,
            "Tint": 2,
            "Contrast2012": 7,
            "Highlights2012": -26,
            "Shadows2012": 16,
            "Whites2012": -7,
            "Blacks2012": -16,
            "Texture": 8,
            "Clarity2012": 6,
            "Dehaze": 2,
            "Vibrance": 10,
            "Saturation": 3,
            "HueAdjustmentRed": -4,
            "HueAdjustmentOrange": -5,
            "HueAdjustmentYellow": -10,
            "HueAdjustmentGreen": -14,
            "HueAdjustmentAqua": -8,
            "HueAdjustmentBlue": -10,
            "SaturationAdjustmentRed": 10,
            "SaturationAdjustmentOrange": 2,
            "SaturationAdjustmentYellow": 4,
            "SaturationAdjustmentGreen": -5,
            "SaturationAdjustmentAqua": 2,
            "SaturationAdjustmentBlue": 12,
            "LuminanceAdjustmentOrange": 1,
            "LuminanceAdjustmentYellow": -4,
            "LuminanceAdjustmentGreen": -10,
            "LuminanceAdjustmentBlue": -16,
            "ColorGradeMidtoneHue": 40,
            "ColorGradeMidtoneSat": 4,
            "ColorGradeHighlightsHue": 50,
            "ColorGradeHighlightsSat": 2,
            "ColorGradeBlending": 47,
        },
    },
    "kodachrome_v3": {
        "config_file": "kodachrome_v3_v1.json",
        "lut_file": "kodachrome_v3.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.06,
            "Temperature": 5900,
            "Tint": 1,
            "Contrast2012": 4,
            "Highlights2012": -30,
            "Shadows2012": 18,
            "Whites2012": -8,
            "Blacks2012": -13,
            "Texture": 6,
            "Clarity2012": 4,
            "Dehaze": 1,
            "Vibrance": 6,
            "Saturation": 1,
            "HueAdjustmentOrange": -2,
            "HueAdjustmentYellow": -6,
            "HueAdjustmentGreen": -8,
            "HueAdjustmentAqua": -2,
            "HueAdjustmentBlue": -6,
            "SaturationAdjustmentRed": 6,
            "SaturationAdjustmentOrange": 1,
            "SaturationAdjustmentYellow": 1,
            "SaturationAdjustmentGreen": -3,
            "SaturationAdjustmentAqua": 1,
            "SaturationAdjustmentBlue": 8,
            "LuminanceAdjustmentOrange": 2,
            "LuminanceAdjustmentBlue": -10,
            "ColorGradeMidtoneHue": 36,
            "ColorGradeMidtoneSat": 3,
            "ColorGradeHighlightsHue": 46,
            "ColorGradeHighlightsSat": 2,
            "ColorGradeBlending": 45,
        },
    },
    "leicachrome": {
        "config_file": "leicachrome_v1.json",
        "lut_file": "leicachrome.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.04,
            "Temperature": 5750,
            "Tint": 1,
            "Contrast2012": 4,
            "Highlights2012": -30,
            "Shadows2012": 20,
            "Whites2012": -10,
            "Blacks2012": -12,
            "Texture": 7,
            "Clarity2012": 4,
            "Dehaze": 1,
            "Vibrance": 6,
            "Saturation": 1,
            "HueAdjustmentOrange": -2,
            "HueAdjustmentYellow": -4,
            "HueAdjustmentGreen": -6,
            "HueAdjustmentAqua": -2,
            "HueAdjustmentBlue": -4,
            "SaturationAdjustmentRed": 4,
            "SaturationAdjustmentOrange": 1,
            "SaturationAdjustmentYellow": 1,
            "SaturationAdjustmentGreen": -3,
            "SaturationAdjustmentAqua": 1,
            "SaturationAdjustmentBlue": 8,
            "LuminanceAdjustmentOrange": 2,
            "LuminanceAdjustmentGreen": -4,
            "LuminanceAdjustmentBlue": -10,
            "ColorGradeMidtoneHue": 34,
            "ColorGradeMidtoneSat": 3,
            "ColorGradeHighlightsHue": 44,
            "ColorGradeHighlightsSat": 2,
            "ColorGradeBlending": 45,
        },
    },
    "colorplus_200": {
        "config_file": "colorplus_200_v1.json",
        "lut_file": "colorplus_200.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.12,
            "Temperature": 5480,
            "Tint": 0,
            "Contrast2012": -6,
            "Highlights2012": -30,
            "Shadows2012": 20,
            "Whites2012": -10,
            "Blacks2012": -2,
            "Texture": 0,
            "Clarity2012": -2,
            "Dehaze": -3,
            "Vibrance": 6,
            "Saturation": -4,
            "HueAdjustmentOrange": -1,
            "HueAdjustmentYellow": -3,
            "HueAdjustmentGreen": -4,
            "HueAdjustmentBlue": -2,
            "SaturationAdjustmentOrange": -1,
            "SaturationAdjustmentYellow": -5,
            "SaturationAdjustmentGreen": -6,
            "LuminanceAdjustmentOrange": 3,
            "LuminanceAdjustmentBlue": -1,
            "ColorGradeMidtoneHue": 35,
            "ColorGradeMidtoneSat": 2,
            "ColorGradeBlending": 44,
        },
    },
    "ultramax_400": {
        "config_file": "ultramax_400_v1.json",
        "lut_file": "ultramax_400.cube",
        "bias_delta": {
            "Exposure": 0.03,
        },
        "override": {
            "Exposure": 0.20,
            "Temperature": 5520,
            "Tint": 2,
            "Contrast2012": 0,
            "Highlights2012": -16,
            "Shadows2012": 10,
            "Whites2012": -14,
            "Blacks2012": -5,
            "Texture": 6,
            "Clarity2012": 1,
            "Dehaze": -3,
            "Vibrance": -2,
            "Saturation": -2,
            "HueAdjustmentOrange": 1,
            "HueAdjustmentYellow": -8,
            "HueAdjustmentGreen": -8,
            "HueAdjustmentAqua": -4,
            "HueAdjustmentBlue": -3,
            "SaturationAdjustmentOrange": 2,
            "SaturationAdjustmentYellow": -8,
            "SaturationAdjustmentGreen": -6,
            "SaturationAdjustmentAqua": -10,
            "SaturationAdjustmentBlue": -4,
            "LuminanceAdjustmentOrange": 8,
            "LuminanceAdjustmentYellow": 3,
            "LuminanceAdjustmentBlue": 4,
            "ColorGradeMidtoneHue": 30,
            "ColorGradeMidtoneSat": 4,
            "ColorGradeHighlightsHue": 40,
            "ColorGradeHighlightsSat": 2,
            "ColorGradeBlending": 43,
        },
    },
    "cinestill_50d": {
        "config_file": "cinestill_50d_v1.json",
        "lut_file": "cinestill_50d.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.10,
            "Temperature": 5440,
            "Tint": 2,
            "Contrast2012": -2,
            "Highlights2012": -30,
            "Shadows2012": 20,
            "Whites2012": -12,
            "Blacks2012": -2,
            "Texture": 2,
            "Clarity2012": 0,
            "Dehaze": 0,
            "Vibrance": -3,
            "Saturation": -2,
            "HueAdjustmentOrange": 1,
            "HueAdjustmentYellow": -2,
            "HueAdjustmentAqua": 2,
            "HueAdjustmentBlue": 2,
            "SaturationAdjustmentOrange": 1,
            "SaturationAdjustmentGreen": -2,
            "SaturationAdjustmentBlue": 1,
            "LuminanceAdjustmentOrange": 5,
            "LuminanceAdjustmentBlue": -1,
            "ColorGradeMidtoneHue": 36,
            "ColorGradeMidtoneSat": 2,
            "ColorGradeBlending": 42,
        },
    },
    "blue_velvet_cinestill_50d": {
        "config_file": "blue_velvet_cinestill_50d_v1.json",
        "lut_file": "blue_velvet_cinestill_50d.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.08,
            "Temperature": 5160,
            "Tint": -4,
            "Contrast2012": -4,
            "Highlights2012": -28,
            "Shadows2012": 18,
            "Whites2012": -10,
            "Blacks2012": -4,
            "Texture": 1,
            "Clarity2012": -1,
            "Dehaze": -1,
            "Vibrance": -4,
            "Saturation": -3,
            "HueAdjustmentOrange": -1,
            "HueAdjustmentYellow": -4,
            "HueAdjustmentGreen": -2,
            "HueAdjustmentAqua": 4,
            "HueAdjustmentBlue": 8,
            "SaturationAdjustmentOrange": -1,
            "SaturationAdjustmentAqua": 3,
            "SaturationAdjustmentBlue": 5,
            "LuminanceAdjustmentOrange": 2,
            "LuminanceAdjustmentBlue": -2,
            "ColorGradeShadowsHue": 220,
            "ColorGradeShadowsSat": 5,
            "ColorGradeMidtoneHue": 215,
            "ColorGradeMidtoneSat": 4,
            "ColorGradeHighlightsHue": 42,
            "ColorGradeHighlightsSat": 2,
            "ColorGradeBalance": -8,
            "ColorGradeBlending": 44,
        },
    },
    "classic_cinema": {
        "config_file": "classic_cinema_v1.json",
        "lut_file": "classic_cinema.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.14,
            "Temperature": 5350,
            "Tint": 1,
            "Contrast2012": -2,
            "Highlights2012": -26,
            "Shadows2012": 18,
            "Whites2012": -9,
            "Blacks2012": -5,
            "Texture": 0,
            "Clarity2012": -1,
            "Dehaze": -1,
            "Vibrance": -2,
            "Saturation": -2,
            "HueAdjustmentOrange": 2,
            "HueAdjustmentYellow": -3,
            "HueAdjustmentGreen": -4,
            "HueAdjustmentBlue": -2,
            "SaturationAdjustmentOrange": 2,
            "SaturationAdjustmentYellow": -2,
            "SaturationAdjustmentGreen": -3,
            "SaturationAdjustmentBlue": -2,
            "LuminanceAdjustmentOrange": 4,
            "LuminanceAdjustmentBlue": -1,
            "ColorGradeMidtoneHue": 32,
            "ColorGradeMidtoneSat": 3,
            "ColorGradeHighlightsHue": 40,
            "ColorGradeHighlightsSat": 2,
            "ColorGradeBlending": 44,
        },
    },
    "classic_chrome": {
        "config_file": "classic_chrome_v1.json",
        "lut_file": "classic_chrome.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.08,
            "Temperature": 5400,
            "Tint": 1,
            "Contrast2012": -5,
            "Highlights2012": -32,
            "Shadows2012": 18,
            "Whites2012": -10,
            "Blacks2012": -7,
            "Texture": 0,
            "Clarity2012": -1,
            "Dehaze": 0,
            "Vibrance": -6,
            "Saturation": -8,
            "HueAdjustmentOrange": -2,
            "HueAdjustmentYellow": -6,
            "HueAdjustmentGreen": 8,
            "HueAdjustmentAqua": 4,
            "HueAdjustmentBlue": 2,
            "SaturationAdjustmentOrange": -4,
            "SaturationAdjustmentYellow": -5,
            "SaturationAdjustmentGreen": -8,
            "SaturationAdjustmentAqua": -4,
            "SaturationAdjustmentBlue": -8,
            "LuminanceAdjustmentOrange": 2,
            "LuminanceAdjustmentBlue": -3,
            "ColorGradeShadowsHue": 210,
            "ColorGradeShadowsSat": 3,
            "ColorGradeMidtoneHue": 36,
            "ColorGradeMidtoneSat": 2,
            "ColorGradeHighlightsHue": 44,
            "ColorGradeHighlightsSat": 1,
            "ColorGradeBlending": 42,
            "ColorGradeBalance": -6,
        },
    },
    "velvia_pro": {
        "config_file": "velvia_pro_v1.json",
        "lut_file": "velvia_pro.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.06,
            "Temperature": 6200,
            "Tint": 2,
            "Contrast2012": 6,
            "Highlights2012": -30,
            "Shadows2012": 18,
            "Whites2012": -8,
            "Blacks2012": -16,
            "Texture": 4,
            "Clarity2012": 4,
            "Dehaze": 3,
            "Vibrance": 10,
            "Saturation": 4,
            "HueAdjustmentOrange": -4,
            "HueAdjustmentYellow": -8,
            "HueAdjustmentGreen": -12,
            "HueAdjustmentAqua": -10,
            "HueAdjustmentBlue": -6,
            "SaturationAdjustmentOrange": 2,
            "SaturationAdjustmentYellow": 8,
            "SaturationAdjustmentGreen": 12,
            "SaturationAdjustmentAqua": 12,
            "SaturationAdjustmentBlue": 10,
            "LuminanceAdjustmentOrange": 2,
            "LuminanceAdjustmentYellow": -8,
            "LuminanceAdjustmentGreen": -14,
            "LuminanceAdjustmentBlue": -18,
            "ColorGradeMidtoneHue": 42,
            "ColorGradeMidtoneSat": 4,
            "ColorGradeHighlightsHue": 50,
            "ColorGradeHighlightsSat": 2,
            "ColorGradeBlending": 45,
        },
    },
    "cinestill_800t": {
        "config_file": "cinestill_800t_v1.json",
        "lut_file": "cinestill_800t.cube",
        "bias_delta": {
            "Exposure": 0.05,
        },
        "override": {
            "Exposure": 0.36,
            "Temperature": 4300,
            "Tint": 7,
            "Contrast2012": 6,
            "Highlights2012": -42,
            "Shadows2012": 36,
            "Whites2012": -3,
            "Blacks2012": -9,
            "Clarity2012": 3,
            "Texture": 0,
            "Dehaze": 4,
            "Vibrance": 5,
            "Saturation": -7,
            "HueAdjustmentRed": 0,
            "HueAdjustmentOrange": 0,
            "HueAdjustmentYellow": -8,
            "HueAdjustmentGreen": -10,
            "HueAdjustmentAqua": 0,
            "HueAdjustmentBlue": -6,
            "SaturationAdjustmentRed": -2,
            "SaturationAdjustmentOrange": -4,
            "SaturationAdjustmentYellow": -6,
            "SaturationAdjustmentGreen": -8,
            "SaturationAdjustmentAqua": 0,
            "SaturationAdjustmentBlue": 10,
            "LuminanceAdjustmentRed": 0,
            "LuminanceAdjustmentOrange": 4,
            "LuminanceAdjustmentYellow": 0,
            "LuminanceAdjustmentGreen": 0,
            "LuminanceAdjustmentAqua": 0,
            "LuminanceAdjustmentBlue": 0,
            "RedHue": 2,
            "RedSaturation": 0,
            "GreenHue": -4,
            "GreenSaturation": 0,
            "BlueHue": -14,
            "BlueSaturation": 8,
            "ColorGradeBlending": 60,
            "ColorGradeBalance": -18,
            "ColorGradeShadowsHue": 215,
            "ColorGradeShadowsSat": 12,
            "ColorGradeMidtoneHue": 210,
            "ColorGradeMidtoneSat": 8,
            "ColorGradeHighlightsHue": 35,
            "ColorGradeHighlightsSat": 6,
        },
    },
    "cinestill_800": {
        "config_file": "cinestill_800_v1.json",
        "lut_file": "cinestill_800.cube",
        "bias_delta": {
            "Exposure": 0.03,
        },
        "override": {
            "Exposure": 0.18,
            "Temperature": 4900,
            "Tint": 2,
            "Contrast2012": -2,
            "Highlights2012": -34,
            "Shadows2012": 22,
            "Whites2012": -6,
            "Blacks2012": -8,
            "Texture": 2,
            "Clarity2012": 0,
            "Dehaze": 0,
            "Vibrance": 2,
            "Saturation": -3,
            "HueAdjustmentYellow": -4,
            "HueAdjustmentGreen": -6,
            "HueAdjustmentAqua": 2,
            "HueAdjustmentBlue": 0,
            "SaturationAdjustmentOrange": -3,
            "SaturationAdjustmentYellow": -5,
            "SaturationAdjustmentGreen": -6,
            "SaturationAdjustmentAqua": 2,
            "SaturationAdjustmentBlue": 2,
            "LuminanceAdjustmentOrange": 2,
            "LuminanceAdjustmentBlue": -2,
            "ColorGradeShadowsHue": 215,
            "ColorGradeShadowsSat": 4,
            "ColorGradeMidtoneHue": 34,
            "ColorGradeMidtoneSat": 3,
            "ColorGradeHighlightsHue": 48,
            "ColorGradeHighlightsSat": 3,
            "ColorGradeBlending": 43,
        },
    },
    "vision3_50d": {
        "config_file": "vision3_50d_v1.json",
        "lut_file": "vision3_50d.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.08,
            "Temperature": 5425,
            "Tint": 2,
            "Contrast2012": -4,
            "Highlights2012": -28,
            "Shadows2012": 20,
            "Whites2012": -12,
            "Blacks2012": -2,
            "Texture": 1,
            "Clarity2012": 0,
            "Dehaze": 0,
            "Vibrance": -4,
            "Saturation": -2,
            "HueAdjustmentOrange": 1,
            "HueAdjustmentYellow": -2,
            "HueAdjustmentAqua": 2,
            "HueAdjustmentBlue": 2,
            "SaturationAdjustmentOrange": 1,
            "SaturationAdjustmentGreen": -2,
            "LuminanceAdjustmentOrange": 5,
            "LuminanceAdjustmentBlue": -1,
            "ColorGradeMidtoneHue": 36,
            "ColorGradeMidtoneSat": 2,
            "ColorGradeBlending": 42,
        },
    },
    "vision3_250d": {
        "config_file": "vision3_250d_v1.json",
        "lut_file": "vision3_250d.cube",
        "bias_delta": {
            "Exposure": 0.03,
        },
        "override": {
            "Exposure": 0.12,
            "Temperature": 5260,
            "Tint": 4,
            "Contrast2012": -12,
            "Highlights2012": -34,
            "Shadows2012": 24,
            "Whites2012": -14,
            "Blacks2012": -4,
            "Texture": 2,
            "Clarity2012": 0,
            "Dehaze": -1,
            "Vibrance": -5,
            "Saturation": -3,
            "HueAdjustmentYellow": -5,
            "HueAdjustmentGreen": 2,
            "HueAdjustmentAqua": 4,
            "HueAdjustmentBlue": 5,
            "SaturationAdjustmentYellow": -4,
            "SaturationAdjustmentGreen": -3,
            "SaturationAdjustmentAqua": 1,
            "SaturationAdjustmentBlue": 3,
            "LuminanceAdjustmentOrange": 4,
            "LuminanceAdjustmentBlue": -4,
            "ColorGradeMidtoneHue": 34,
            "ColorGradeMidtoneSat": 3,
            "ColorGradeBlending": 42,
        },
    },
    "vision3_200t": {
        "config_file": "vision3_200t_v1.json",
        "lut_file": "vision3_200t.cube",
        "bias_delta": {
            "Exposure": 0.03,
        },
        "override": {
            "Exposure": 0.14,
            "Temperature": 3625,
            "Tint": 1,
            "Contrast2012": -8,
            "Highlights2012": -30,
            "Shadows2012": 18,
            "Whites2012": -10,
            "Blacks2012": -5,
            "Texture": 0,
            "Clarity2012": 0,
            "Dehaze": 0,
            "Vibrance": -4,
            "Saturation": -3,
            "HueAdjustmentOrange": -1,
            "HueAdjustmentYellow": -4,
            "HueAdjustmentGreen": -4,
            "HueAdjustmentBlue": -4,
            "SaturationAdjustmentOrange": -3,
            "SaturationAdjustmentYellow": -5,
            "SaturationAdjustmentGreen": -8,
            "SaturationAdjustmentBlue": -6,
            "LuminanceAdjustmentOrange": 4,
            "LuminanceAdjustmentBlue": -3,
            "RedHue": 2,
            "RedSaturation": 3,
            "GreenHue": -4,
            "BlueHue": -6,
            "BlueSaturation": 4,
            "ColorGradeMidtoneHue": 34,
            "ColorGradeMidtoneSat": 3,
            "ColorGradeHighlightsHue": 42,
            "ColorGradeHighlightsSat": 2,
            "ColorGradeBlending": 42,
        },
    },
    "vision3_200t_plus": {
        "config_file": "vision3_200t_plus_v1.json",
        "lut_file": "vision3_200t_plus.cube",
        "bias_delta": {
            "Exposure": 0.03,
        },
        "override": {
            "Exposure": 0.18,
            "Temperature": 4880,
            "Tint": -1,
            "Contrast2012": -4,
            "Highlights2012": -36,
            "Shadows2012": 22,
            "Whites2012": -12,
            "Blacks2012": -4,
            "Texture": 3,
            "Clarity2012": 1,
            "Dehaze": -1,
            "Vibrance": -6,
            "Saturation": 1,
            "HueAdjustmentOrange": -2,
            "HueAdjustmentYellow": -5,
            "HueAdjustmentGreen": -8,
            "HueAdjustmentAqua": -4,
            "HueAdjustmentBlue": -3,
            "SaturationAdjustmentOrange": -3,
            "SaturationAdjustmentYellow": -5,
            "SaturationAdjustmentAqua": 3,
            "SaturationAdjustmentBlue": 5,
            "LuminanceAdjustmentOrange": 3,
            "LuminanceAdjustmentAqua": -4,
            "LuminanceAdjustmentBlue": -5,
            "RedHue": 3,
            "BlueHue": -6,
            "BlueSaturation": 4,
            "ColorGradeMidtoneHue": 32,
            "ColorGradeMidtoneSat": 2,
            "ColorGradeHighlightsHue": 46,
            "ColorGradeHighlightsSat": 2,
            "ColorGradeBlending": 43,
        },
    },
    "vision3_500t": {
        "config_file": "vision3_500t_v1.json",
        "lut_file": "vision3_500t.cube",
        "bias_delta": {
            "Exposure": 0.04,
        },
        "override": {
            "Exposure": 0.20,
            "Temperature": 4975,
            "Tint": 6,
            "Contrast2012": -16,
            "Highlights2012": -34,
            "Shadows2012": 24,
            "Whites2012": -12,
            "Blacks2012": -7,
            "Texture": 3,
            "Clarity2012": 1,
            "Dehaze": -3,
            "Vibrance": -5,
            "Saturation": -3,
            "HueAdjustmentOrange": -5,
            "HueAdjustmentYellow": -10,
            "HueAdjustmentGreen": 10,
            "HueAdjustmentAqua": 12,
            "HueAdjustmentBlue": 14,
            "SaturationAdjustmentOrange": -5,
            "SaturationAdjustmentYellow": -10,
            "SaturationAdjustmentGreen": -6,
            "SaturationAdjustmentAqua": 7,
            "SaturationAdjustmentBlue": 8,
            "LuminanceAdjustmentOrange": 3,
            "LuminanceAdjustmentBlue": -5,
            "RedHue": -5,
            "BlueHue": 16,
            "BlueSaturation": 4,
            "ColorGradeMidtoneHue": 28,
            "ColorGradeMidtoneSat": 4,
            "ColorGradeHighlightsHue": 40,
            "ColorGradeHighlightsSat": 2,
            "ColorGradeBalance": -8,
            "ColorGradeBlending": 42,
        },
    },
    "fuji_400h": {
        "config_file": "fuji_400h_v1.json",
        "lut_file": "fuji_400h.cube",
        "bias_delta": {
            "Exposure": 0.03,
        },
        "override": {
            "Exposure": 0.34,
            "Temperature": 5150,
            "Tint": -8,
            "Contrast2012": -12,
            "Highlights2012": -14,
            "Shadows2012": 30,
            "Whites2012": -10,
            "Blacks2012": 4,
            "Clarity2012": -4,
            "Texture": -5,
            "Dehaze": -4,
            "Vibrance": 4,
            "Saturation": -10,
            "HueAdjustmentRed": 0,
            "HueAdjustmentOrange": 3,
            "HueAdjustmentYellow": 12,
            "HueAdjustmentGreen": 16,
            "HueAdjustmentAqua": 0,
            "HueAdjustmentBlue": 0,
            "SaturationAdjustmentRed": -5,
            "SaturationAdjustmentOrange": -6,
            "SaturationAdjustmentYellow": -5,
            "SaturationAdjustmentGreen": -16,
            "SaturationAdjustmentAqua": 0,
            "SaturationAdjustmentBlue": -14,
            "LuminanceAdjustmentRed": 0,
            "LuminanceAdjustmentOrange": 10,
            "LuminanceAdjustmentYellow": 0,
            "LuminanceAdjustmentGreen": 0,
            "LuminanceAdjustmentAqua": 0,
            "LuminanceAdjustmentBlue": 8,
            "RedHue": 2,
            "RedSaturation": 0,
            "GreenHue": -6,
            "GreenSaturation": 0,
            "BlueHue": -20,
            "BlueSaturation": -1,
            "ColorGradeBlending": 35,
            "ColorGradeBalance": -8,
            "ColorGradeShadowsHue": 200,
            "ColorGradeShadowsSat": 10,
            "ColorGradeMidtoneHue": 175,
            "ColorGradeMidtoneSat": 8,
            "ColorGradeHighlightsHue": 45,
            "ColorGradeHighlightsSat": 2,
        },
    },
    "fuji_nostalgic_neg": {
        "config_file": "fuji_nostalgic_neg_v1.json",
        "lut_file": "fuji_nostalgic_neg.cube",
        "bias_delta": {
            "Exposure": 0.03,
        },
        "override": {
            "Exposure": 0.16,
            "Temperature": 5600,
            "Tint": 0,
            "Contrast2012": -4,
            "Highlights2012": -28,
            "Shadows2012": 20,
            "Whites2012": -10,
            "Blacks2012": -5,
            "Texture": -1,
            "Clarity2012": -1,
            "Dehaze": -1,
            "Vibrance": -2,
            "Saturation": -3,
            "HueAdjustmentOrange": 2,
            "HueAdjustmentYellow": -3,
            "HueAdjustmentGreen": 6,
            "HueAdjustmentAqua": 4,
            "HueAdjustmentBlue": 3,
            "SaturationAdjustmentOrange": 2,
            "SaturationAdjustmentYellow": -2,
            "SaturationAdjustmentGreen": -4,
            "SaturationAdjustmentAqua": -2,
            "SaturationAdjustmentBlue": -2,
            "LuminanceAdjustmentOrange": 5,
            "LuminanceAdjustmentBlue": 1,
            "ColorGradeMidtoneHue": 34,
            "ColorGradeMidtoneSat": 3,
            "ColorGradeHighlightsHue": 44,
            "ColorGradeHighlightsSat": 2,
            "ColorGradeBlending": 43,
        },
    },
    "fuji_eterna": {
        "config_file": "fuji_eterna_v1.json",
        "lut_file": "fuji_eterna.cube",
        "bias_delta": {
            "Exposure": 0.03,
        },
        "override": {
            "Exposure": 0.14,
            "Temperature": 5250,
            "Tint": 0,
            "Contrast2012": -8,
            "Highlights2012": -30,
            "Shadows2012": 24,
            "Whites2012": -12,
            "Blacks2012": -4,
            "Texture": -2,
            "Clarity2012": -2,
            "Dehaze": -1,
            "Vibrance": -4,
            "Saturation": -4,
            "HueAdjustmentOrange": 1,
            "HueAdjustmentYellow": -2,
            "HueAdjustmentGreen": 4,
            "HueAdjustmentAqua": 2,
            "HueAdjustmentBlue": 2,
            "SaturationAdjustmentOrange": 0,
            "SaturationAdjustmentYellow": -2,
            "SaturationAdjustmentGreen": -6,
            "SaturationAdjustmentAqua": -2,
            "SaturationAdjustmentBlue": -3,
            "LuminanceAdjustmentOrange": 4,
            "LuminanceAdjustmentBlue": 1,
            "ColorGradeMidtoneHue": 32,
            "ColorGradeMidtoneSat": 2,
            "ColorGradeHighlightsHue": 40,
            "ColorGradeHighlightsSat": 1,
            "ColorGradeBlending": 42,
        },
    },
    "asteroid_city_kodak_vision_t200_v1": {
        "config_file": "asteroid_city_kodak_vision_t200_v1_v1.json",
        "lut_file": "asteroid_city_kodak_vision_t200_v1.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.15,
            "Temperature": 5285,
            "Tint": -1,
            "Contrast2012": -6,
            "Highlights2012": -14,
            "Shadows2012": 8,
            "Whites2012": -4,
            "Blacks2012": -8,
            "Clarity2012": -2,
            "Texture": -3,
            "Dehaze": -1,
            "Vibrance": -1,
            "Saturation": -3,
            "HueAdjustmentYellow": -1,
            "HueAdjustmentBlue": 8,
            "SaturationAdjustmentOrange": -2,
            "SaturationAdjustmentAqua": 0,
            "SaturationAdjustmentBlue": 5,
            "LuminanceAdjustmentOrange": 1,
            "LuminanceAdjustmentBlue": 1,
            "ColorGradeMidtoneHue": 34,
            "ColorGradeMidtoneSat": 5,
            "ColorGradeHighlightsHue": 48,
            "ColorGradeHighlightsSat": 3,
            "ColorGradeBlending": 40,
        },
    },
    "asteroid_city_kodak_vision_t200_v2": {
        "config_file": "asteroid_city_kodak_vision_t200_v2_v1.json",
        "lut_file": "asteroid_city_kodak_vision_t200_v2.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.16,
            "Temperature": 5425,
            "Tint": -2,
            "Contrast2012": -4,
            "Highlights2012": -18,
            "Shadows2012": 10,
            "Whites2012": -5,
            "Blacks2012": -7,
            "Clarity2012": -1,
            "Texture": -2,
            "Dehaze": -1,
            "Vibrance": -1,
            "Saturation": -3,
            "HueAdjustmentYellow": -2,
            "HueAdjustmentAqua": 2,
            "HueAdjustmentBlue": 6,
            "SaturationAdjustmentOrange": -2,
            "SaturationAdjustmentYellow": -1,
            "SaturationAdjustmentAqua": -1,
            "SaturationAdjustmentBlue": 3,
            "LuminanceAdjustmentOrange": 3,
            "LuminanceAdjustmentBlue": 1,
            "ColorGradeMidtoneHue": 34,
            "ColorGradeMidtoneSat": 4,
            "ColorGradeHighlightsHue": 48,
            "ColorGradeHighlightsSat": 3,
            "ColorGradeBlending": 41,
        },
    },
    "ayon_200": {
        "config_file": "ayon_200_v1.json",
        "lut_file": "ayon_200.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.17,
            "Temperature": 5160,
            "Tint": 0,
            "Contrast2012": -8,
            "Highlights2012": -12,
            "Shadows2012": 10,
            "Whites2012": -7,
            "Blacks2012": -6,
            "Clarity2012": -1,
            "Texture": -3,
            "Dehaze": -1,
            "Vibrance": -1,
            "Saturation": -4,
            "HueAdjustmentOrange": -1,
            "HueAdjustmentYellow": -2,
            "HueAdjustmentGreen": 1,
            "HueAdjustmentBlue": 0,
            "SaturationAdjustmentOrange": -3,
            "SaturationAdjustmentYellow": -5,
            "SaturationAdjustmentGreen": 0,
            "SaturationAdjustmentAqua": -2,
            "SaturationAdjustmentBlue": -2,
            "LuminanceAdjustmentOrange": 2,
            "LuminanceAdjustmentYellow": 1,
            "LuminanceAdjustmentGreen": 0,
            "LuminanceAdjustmentBlue": 1,
            "ColorGradeMidtoneHue": 40,
            "ColorGradeMidtoneSat": 4,
            "ColorGradeHighlightsHue": 48,
            "ColorGradeHighlightsSat": 2,
            "ColorGradeBlending": 38,
        },
    },
    "cinechrome": {
        "config_file": "cinechrome_v1.json",
        "lut_file": "cinechrome.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.10,
            "Temperature": 5180,
            "Tint": -1,
            "Contrast2012": -6,
            "Highlights2012": -30,
            "Shadows2012": 18,
            "Whites2012": -10,
            "Blacks2012": -6,
            "Clarity2012": -1,
            "Texture": -1,
            "Dehaze": 0,
            "Vibrance": -5,
            "Saturation": -7,
            "HueAdjustmentOrange": -1,
            "HueAdjustmentYellow": -5,
            "HueAdjustmentGreen": 6,
            "HueAdjustmentAqua": 6,
            "HueAdjustmentBlue": 6,
            "SaturationAdjustmentOrange": -3,
            "SaturationAdjustmentYellow": -4,
            "SaturationAdjustmentGreen": -6,
            "SaturationAdjustmentAqua": -5,
            "SaturationAdjustmentBlue": -6,
            "LuminanceAdjustmentOrange": 2,
            "LuminanceAdjustmentBlue": -2,
            "ColorGradeShadowsHue": 210,
            "ColorGradeShadowsSat": 4,
            "ColorGradeMidtoneHue": 34,
            "ColorGradeMidtoneSat": 2,
            "ColorGradeHighlightsHue": 44,
            "ColorGradeHighlightsSat": 1,
            "ColorGradeBalance": -8,
            "ColorGradeBlending": 43,
        },
    },
    "procolor": {
        "config_file": "procolor_v1.json",
        "lut_file": "procolor.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.12,
            "Temperature": 5650,
            "Tint": 1,
            "Contrast2012": 0,
            "Highlights2012": -24,
            "Shadows2012": 16,
            "Whites2012": -8,
            "Blacks2012": -7,
            "Clarity2012": 0,
            "Texture": 1,
            "Dehaze": 0,
            "Vibrance": 2,
            "Saturation": -1,
            "HueAdjustmentOrange": -1,
            "HueAdjustmentYellow": -3,
            "HueAdjustmentGreen": -2,
            "HueAdjustmentBlue": -1,
            "SaturationAdjustmentOrange": 3,
            "SaturationAdjustmentYellow": 1,
            "SaturationAdjustmentGreen": -2,
            "SaturationAdjustmentAqua": -1,
            "SaturationAdjustmentBlue": -1,
            "LuminanceAdjustmentOrange": 3,
            "LuminanceAdjustmentYellow": 1,
            "LuminanceAdjustmentBlue": -1,
            "ColorGradeMidtoneHue": 36,
            "ColorGradeMidtoneSat": 2,
            "ColorGradeHighlightsHue": 46,
            "ColorGradeHighlightsSat": 1,
            "ColorGradeBlending": 44,
        },
    },
    "dreamneg": {
        "config_file": "dreamneg_v1.json",
        "lut_file": "dreamneg.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.18,
            "Temperature": 5525,
            "Tint": 2,
            "Contrast2012": -10,
            "Highlights2012": -20,
            "Shadows2012": 18,
            "Whites2012": -12,
            "Blacks2012": -3,
            "Clarity2012": -3,
            "Texture": -4,
            "Dehaze": -2,
            "Vibrance": -4,
            "Saturation": -5,
            "HueAdjustmentOrange": 1,
            "HueAdjustmentYellow": -4,
            "HueAdjustmentGreen": 4,
            "HueAdjustmentAqua": 3,
            "HueAdjustmentBlue": 2,
            "SaturationAdjustmentOrange": 1,
            "SaturationAdjustmentYellow": -3,
            "SaturationAdjustmentGreen": -4,
            "SaturationAdjustmentAqua": -2,
            "SaturationAdjustmentBlue": -3,
            "LuminanceAdjustmentOrange": 5,
            "LuminanceAdjustmentBlue": 2,
            "ColorGradeMidtoneHue": 32,
            "ColorGradeMidtoneSat": 3,
            "ColorGradeHighlightsHue": 42,
            "ColorGradeHighlightsSat": 2,
            "ColorGradeBlending": 41,
        },
    },
    "chroma_fade": {
        "config_file": "chroma_fade_v1.json",
        "lut_file": "chroma_fade.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.14,
            "Temperature": 5450,
            "Tint": -1,
            "Contrast2012": -12,
            "Highlights2012": -18,
            "Shadows2012": 24,
            "Whites2012": -14,
            "Blacks2012": 0,
            "Clarity2012": -4,
            "Texture": -4,
            "Dehaze": -3,
            "Vibrance": -10,
            "Saturation": -12,
            "HueAdjustmentOrange": 2,
            "HueAdjustmentYellow": -2,
            "HueAdjustmentGreen": 2,
            "HueAdjustmentAqua": 4,
            "HueAdjustmentBlue": 5,
            "SaturationAdjustmentOrange": -4,
            "SaturationAdjustmentYellow": -5,
            "SaturationAdjustmentGreen": -8,
            "SaturationAdjustmentAqua": -8,
            "SaturationAdjustmentBlue": -10,
            "LuminanceAdjustmentOrange": 6,
            "LuminanceAdjustmentBlue": 4,
            "ColorGradeShadowsHue": 210,
            "ColorGradeShadowsSat": 2,
            "ColorGradeMidtoneHue": 30,
            "ColorGradeMidtoneSat": 2,
            "ColorGradeHighlightsHue": 40,
            "ColorGradeHighlightsSat": 1,
            "ColorGradeBalance": -4,
            "ColorGradeBlending": 40,
        },
    },
    "phoenix_harman": {
        "config_file": "phoenix_harman_v1.json",
        "lut_file": "phoenix_harman.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.10,
            "Temperature": 5850,
            "Tint": 4,
            "Contrast2012": 8,
            "Highlights2012": -26,
            "Shadows2012": 14,
            "Whites2012": -4,
            "Blacks2012": -12,
            "Clarity2012": 2,
            "Texture": 3,
            "Dehaze": 1,
            "Vibrance": 6,
            "Saturation": 2,
            "HueAdjustmentOrange": 4,
            "HueAdjustmentYellow": -2,
            "HueAdjustmentGreen": 10,
            "HueAdjustmentAqua": 6,
            "HueAdjustmentBlue": -2,
            "SaturationAdjustmentOrange": 5,
            "SaturationAdjustmentYellow": -2,
            "SaturationAdjustmentGreen": 4,
            "SaturationAdjustmentAqua": 3,
            "SaturationAdjustmentBlue": -2,
            "LuminanceAdjustmentOrange": 3,
            "LuminanceAdjustmentGreen": -2,
            "LuminanceAdjustmentBlue": -4,
            "ColorGradeShadowsHue": 235,
            "ColorGradeShadowsSat": 4,
            "ColorGradeMidtoneHue": 34,
            "ColorGradeMidtoneSat": 3,
            "ColorGradeHighlightsHue": 52,
            "ColorGradeHighlightsSat": 2,
            "ColorGradeBalance": 2,
            "ColorGradeBlending": 45,
        },
    },
    "crimson": {
        "config_file": "crimson_v1.json",
        "lut_file": "crimson.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.12,
            "Temperature": 5900,
            "Tint": 5,
            "Contrast2012": 4,
            "Highlights2012": -24,
            "Shadows2012": 14,
            "Whites2012": -6,
            "Blacks2012": -10,
            "Clarity2012": 1,
            "Texture": 2,
            "Dehaze": 0,
            "Vibrance": 4,
            "Saturation": 1,
            "HueAdjustmentRed": -4,
            "HueAdjustmentOrange": 2,
            "HueAdjustmentYellow": -2,
            "HueAdjustmentGreen": 4,
            "HueAdjustmentBlue": -3,
            "SaturationAdjustmentRed": 8,
            "SaturationAdjustmentOrange": 4,
            "SaturationAdjustmentYellow": -1,
            "SaturationAdjustmentGreen": -3,
            "SaturationAdjustmentBlue": -2,
            "LuminanceAdjustmentOrange": 2,
            "LuminanceAdjustmentRed": 1,
            "LuminanceAdjustmentBlue": -2,
            "ColorGradeShadowsHue": 335,
            "ColorGradeShadowsSat": 3,
            "ColorGradeMidtoneHue": 24,
            "ColorGradeMidtoneSat": 4,
            "ColorGradeHighlightsHue": 42,
            "ColorGradeHighlightsSat": 2,
            "ColorGradeBalance": 4,
            "ColorGradeBlending": 44,
        },
    },
    "acidnom": {
        "config_file": "acidnom_v1.json",
        "lut_file": "acidnom.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.10,
            "Temperature": 5000,
            "Tint": -6,
            "Contrast2012": 3,
            "Highlights2012": -20,
            "Shadows2012": 12,
            "Whites2012": -6,
            "Blacks2012": -9,
            "Clarity2012": 2,
            "Texture": 2,
            "Dehaze": 1,
            "Vibrance": 2,
            "Saturation": -1,
            "HueAdjustmentYellow": -8,
            "HueAdjustmentGreen": 12,
            "HueAdjustmentAqua": 10,
            "HueAdjustmentBlue": 6,
            "SaturationAdjustmentOrange": -2,
            "SaturationAdjustmentYellow": -5,
            "SaturationAdjustmentGreen": 6,
            "SaturationAdjustmentAqua": 6,
            "SaturationAdjustmentBlue": 2,
            "LuminanceAdjustmentOrange": 1,
            "LuminanceAdjustmentGreen": -2,
            "LuminanceAdjustmentBlue": -1,
            "ColorGradeShadowsHue": 195,
            "ColorGradeShadowsSat": 4,
            "ColorGradeMidtoneHue": 170,
            "ColorGradeMidtoneSat": 3,
            "ColorGradeHighlightsHue": 52,
            "ColorGradeHighlightsSat": 1,
            "ColorGradeBalance": -4,
            "ColorGradeBlending": 43,
        },
    },
    "estra_500": {
        "config_file": "estra_500_v1.json",
        "lut_file": "estra_500.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.16,
            "Temperature": 5325,
            "Tint": 2,
            "Contrast2012": -3,
            "Highlights2012": -28,
            "Shadows2012": 20,
            "Whites2012": -9,
            "Blacks2012": -5,
            "Clarity2012": -1,
            "Texture": -1,
            "Dehaze": -1,
            "Vibrance": -1,
            "Saturation": -2,
            "HueAdjustmentOrange": 1,
            "HueAdjustmentYellow": -2,
            "HueAdjustmentGreen": 3,
            "HueAdjustmentAqua": 2,
            "HueAdjustmentBlue": 1,
            "SaturationAdjustmentOrange": 1,
            "SaturationAdjustmentYellow": -1,
            "SaturationAdjustmentGreen": -2,
            "SaturationAdjustmentAqua": -1,
            "SaturationAdjustmentBlue": -2,
            "LuminanceAdjustmentOrange": 4,
            "LuminanceAdjustmentBlue": 1,
            "ColorGradeShadowsHue": 215,
            "ColorGradeShadowsSat": 2,
            "ColorGradeMidtoneHue": 34,
            "ColorGradeMidtoneSat": 2,
            "ColorGradeHighlightsHue": 44,
            "ColorGradeHighlightsSat": 1,
            "ColorGradeBalance": -2,
            "ColorGradeBlending": 42,
        },
    },
    "magic_spice": {
        "config_file": "magic_spice_v1.json",
        "lut_file": "magic_spice.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.18,
            "Temperature": 6125,
            "Tint": 2,
            "Contrast2012": -2,
            "Highlights2012": -18,
            "Shadows2012": 18,
            "Whites2012": -8,
            "Blacks2012": -5,
            "Clarity2012": -1,
            "Texture": 0,
            "Dehaze": -1,
            "Vibrance": 2,
            "Saturation": 0,
            "HueAdjustmentRed": 2,
            "HueAdjustmentOrange": 4,
            "HueAdjustmentYellow": -4,
            "HueAdjustmentGreen": -6,
            "HueAdjustmentBlue": -2,
            "SaturationAdjustmentOrange": 6,
            "SaturationAdjustmentYellow": 2,
            "SaturationAdjustmentGreen": -4,
            "SaturationAdjustmentBlue": -3,
            "LuminanceAdjustmentOrange": 5,
            "LuminanceAdjustmentYellow": 2,
            "ColorGradeMidtoneHue": 28,
            "ColorGradeMidtoneSat": 4,
            "ColorGradeHighlightsHue": 48,
            "ColorGradeHighlightsSat": 2,
            "ColorGradeBalance": 3,
            "ColorGradeBlending": 44,
        },
    },
    "amarelo_30d": {
        "config_file": "amarelo_30d_v1.json",
        "lut_file": "amarelo_30d.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.20,
            "Temperature": 6250,
            "Tint": -1,
            "Contrast2012": -4,
            "Highlights2012": -16,
            "Shadows2012": 16,
            "Whites2012": -8,
            "Blacks2012": -4,
            "Clarity2012": -1,
            "Texture": -1,
            "Dehaze": -1,
            "Vibrance": 1,
            "Saturation": -1,
            "HueAdjustmentOrange": 3,
            "HueAdjustmentYellow": -8,
            "HueAdjustmentGreen": -4,
            "HueAdjustmentBlue": -4,
            "SaturationAdjustmentOrange": 5,
            "SaturationAdjustmentYellow": 3,
            "SaturationAdjustmentGreen": -5,
            "SaturationAdjustmentBlue": -3,
            "LuminanceAdjustmentOrange": 6,
            "LuminanceAdjustmentYellow": 4,
            "ColorGradeMidtoneHue": 34,
            "ColorGradeMidtoneSat": 3,
            "ColorGradeHighlightsHue": 50,
            "ColorGradeHighlightsSat": 2,
            "ColorGradeBalance": 4,
            "ColorGradeBlending": 43,
        },
    },
    "evproplus": {
        "config_file": "evproplus_v1.json",
        "lut_file": "evproplus.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.08,
            "Temperature": 5700,
            "Tint": 1,
            "Contrast2012": 6,
            "Highlights2012": -28,
            "Shadows2012": 16,
            "Whites2012": -6,
            "Blacks2012": -12,
            "Clarity2012": 2,
            "Texture": 2,
            "Dehaze": 2,
            "Vibrance": 5,
            "Saturation": 1,
            "HueAdjustmentOrange": -2,
            "HueAdjustmentYellow": -4,
            "HueAdjustmentGreen": 2,
            "HueAdjustmentAqua": 2,
            "HueAdjustmentBlue": 2,
            "SaturationAdjustmentOrange": 2,
            "SaturationAdjustmentYellow": 2,
            "SaturationAdjustmentGreen": -2,
            "SaturationAdjustmentAqua": 1,
            "SaturationAdjustmentBlue": 2,
            "LuminanceAdjustmentOrange": 2,
            "LuminanceAdjustmentBlue": -2,
            "ColorGradeShadowsHue": 225,
            "ColorGradeShadowsSat": 3,
            "ColorGradeMidtoneHue": 36,
            "ColorGradeMidtoneSat": 3,
            "ColorGradeHighlightsHue": 48,
            "ColorGradeHighlightsSat": 2,
            "ColorGradeBalance": 1,
            "ColorGradeBlending": 45,
        },
    },
    "sony_standard_cl": {
        "config_file": "sony_standard_cl_v1.json",
        "lut_file": "sony_standard_cl.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.08,
            "Temperature": 5550,
            "Tint": 1,
            "Contrast2012": 0,
            "Highlights2012": -22,
            "Shadows2012": 14,
            "Whites2012": -7,
            "Blacks2012": -7,
            "Clarity2012": 0,
            "Texture": 1,
            "Dehaze": 0,
            "Vibrance": 1,
            "Saturation": -1,
            "HueAdjustmentOrange": -1,
            "HueAdjustmentYellow": -2,
            "HueAdjustmentGreen": 2,
            "HueAdjustmentBlue": 1,
            "SaturationAdjustmentOrange": 1,
            "SaturationAdjustmentGreen": -2,
            "SaturationAdjustmentBlue": -1,
            "LuminanceAdjustmentOrange": 2,
            "LuminanceAdjustmentBlue": -1,
            "ColorGradeMidtoneHue": 36,
            "ColorGradeMidtoneSat": 2,
            "ColorGradeHighlightsHue": 46,
            "ColorGradeHighlightsSat": 1,
            "ColorGradeBlending": 44,
        },
    },
    "vektro100": {
        "config_file": "vektro100_v1.json",
        "lut_file": "vektro100.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.10,
            "Temperature": 5480,
            "Tint": 0,
            "Contrast2012": 2,
            "Highlights2012": -24,
            "Shadows2012": 12,
            "Whites2012": -6,
            "Blacks2012": -9,
            "Clarity2012": 1,
            "Texture": 1,
            "Dehaze": 0,
            "Vibrance": 2,
            "Saturation": 0,
            "HueAdjustmentOrange": -2,
            "HueAdjustmentYellow": -3,
            "HueAdjustmentGreen": 2,
            "HueAdjustmentAqua": 1,
            "HueAdjustmentBlue": 0,
            "SaturationAdjustmentOrange": 2,
            "SaturationAdjustmentYellow": 1,
            "SaturationAdjustmentGreen": -2,
            "SaturationAdjustmentBlue": 1,
            "LuminanceAdjustmentOrange": 2,
            "LuminanceAdjustmentBlue": -1,
            "ColorGradeShadowsHue": 220,
            "ColorGradeShadowsSat": 2,
            "ColorGradeMidtoneHue": 34,
            "ColorGradeMidtoneSat": 2,
            "ColorGradeHighlightsHue": 44,
            "ColorGradeHighlightsSat": 1,
            "ColorGradeBalance": -1,
            "ColorGradeBlending": 44,
        },
    },
    "senova_light": {
        "config_file": "senova_light_v1.json",
        "lut_file": "senova_light.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.14,
            "Temperature": 5600,
            "Tint": 1,
            "Contrast2012": -8,
            "Highlights2012": -24,
            "Shadows2012": 18,
            "Whites2012": -10,
            "Blacks2012": -3,
            "Clarity2012": -2,
            "Texture": -2,
            "Dehaze": -1,
            "Vibrance": -2,
            "Saturation": -3,
            "HueAdjustmentOrange": 1,
            "HueAdjustmentYellow": -2,
            "HueAdjustmentGreen": 3,
            "HueAdjustmentBlue": 2,
            "SaturationAdjustmentOrange": 1,
            "SaturationAdjustmentGreen": -2,
            "SaturationAdjustmentBlue": -2,
            "LuminanceAdjustmentOrange": 4,
            "LuminanceAdjustmentBlue": 1,
            "ColorGradeMidtoneHue": 34,
            "ColorGradeMidtoneSat": 2,
            "ColorGradeHighlightsHue": 44,
            "ColorGradeHighlightsSat": 1,
            "ColorGradeBlending": 42,
        },
    },
    "pro_neg_std": {
        "config_file": "pro_neg_std_v1.json",
        "lut_file": "pro_neg_std.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.10,
            "Temperature": 5450,
            "Tint": 1,
            "Contrast2012": -6,
            "Highlights2012": -30,
            "Shadows2012": 18,
            "Whites2012": -10,
            "Blacks2012": -4,
            "Clarity2012": -2,
            "Texture": -1,
            "Dehaze": -1,
            "Vibrance": -3,
            "Saturation": -4,
            "HueAdjustmentOrange": 1,
            "HueAdjustmentYellow": -2,
            "HueAdjustmentGreen": 2,
            "HueAdjustmentBlue": 1,
            "SaturationAdjustmentOrange": -1,
            "SaturationAdjustmentGreen": -2,
            "SaturationAdjustmentBlue": -2,
            "LuminanceAdjustmentOrange": 4,
            "LuminanceAdjustmentBlue": 1,
            "ColorGradeMidtoneHue": 34,
            "ColorGradeMidtoneSat": 2,
            "ColorGradeHighlightsHue": 42,
            "ColorGradeHighlightsSat": 1,
            "ColorGradeBlending": 42,
        },
    },
    "sony_eterna": {
        "config_file": "sony_eterna_v1.json",
        "lut_file": "sony_eterna.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.12,
            "Temperature": 5280,
            "Tint": 0,
            "Contrast2012": -8,
            "Highlights2012": -30,
            "Shadows2012": 24,
            "Whites2012": -12,
            "Blacks2012": -4,
            "Clarity2012": -2,
            "Texture": -2,
            "Dehaze": -1,
            "Vibrance": -4,
            "Saturation": -4,
            "HueAdjustmentOrange": 1,
            "HueAdjustmentYellow": -2,
            "HueAdjustmentGreen": 4,
            "HueAdjustmentAqua": 2,
            "HueAdjustmentBlue": 2,
            "SaturationAdjustmentYellow": -2,
            "SaturationAdjustmentGreen": -5,
            "SaturationAdjustmentBlue": -3,
            "LuminanceAdjustmentOrange": 4,
            "LuminanceAdjustmentBlue": 1,
            "ColorGradeShadowsHue": 210,
            "ColorGradeShadowsSat": 3,
            "ColorGradeMidtoneHue": 32,
            "ColorGradeMidtoneSat": 2,
            "ColorGradeHighlightsHue": 40,
            "ColorGradeHighlightsSat": 1,
            "ColorGradeBalance": -4,
            "ColorGradeBlending": 42,
        },
    },
    "sony_nostalgic_neg": {
        "config_file": "sony_nostalgic_neg_v1.json",
        "lut_file": "sony_nostalgic_neg.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.14,
            "Temperature": 5675,
            "Tint": 1,
            "Contrast2012": -4,
            "Highlights2012": -26,
            "Shadows2012": 20,
            "Whites2012": -10,
            "Blacks2012": -5,
            "Clarity2012": -1,
            "Texture": -1,
            "Dehaze": -1,
            "Vibrance": -2,
            "Saturation": -3,
            "HueAdjustmentOrange": 2,
            "HueAdjustmentYellow": -2,
            "HueAdjustmentGreen": 5,
            "HueAdjustmentAqua": 3,
            "HueAdjustmentBlue": 2,
            "SaturationAdjustmentOrange": 2,
            "SaturationAdjustmentGreen": -3,
            "SaturationAdjustmentBlue": -2,
            "LuminanceAdjustmentOrange": 4,
            "LuminanceAdjustmentBlue": 1,
            "ColorGradeMidtoneHue": 34,
            "ColorGradeMidtoneSat": 3,
            "ColorGradeHighlightsHue": 44,
            "ColorGradeHighlightsSat": 2,
            "ColorGradeBalance": -2,
            "ColorGradeBlending": 43,
        },
    },
    "oktar": {
        "config_file": "oktar_v1.json",
        "lut_file": "oktar.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.12,
            "Temperature": 5725,
            "Tint": 1,
            "Contrast2012": 1,
            "Highlights2012": -24,
            "Shadows2012": 14,
            "Whites2012": -7,
            "Blacks2012": -8,
            "Clarity2012": 1,
            "Texture": 1,
            "Dehaze": 0,
            "Vibrance": 2,
            "Saturation": 0,
            "HueAdjustmentOrange": -1,
            "HueAdjustmentYellow": -2,
            "HueAdjustmentGreen": 1,
            "HueAdjustmentBlue": 1,
            "SaturationAdjustmentOrange": 2,
            "SaturationAdjustmentYellow": 1,
            "SaturationAdjustmentBlue": 1,
            "LuminanceAdjustmentOrange": 2,
            "LuminanceAdjustmentBlue": -1,
            "ColorGradeMidtoneHue": 36,
            "ColorGradeMidtoneSat": 2,
            "ColorGradeHighlightsHue": 46,
            "ColorGradeHighlightsSat": 1,
            "ColorGradeBlending": 44,
        },
    },
    "zero_mute": {
        "config_file": "zero_mute_v1.json",
        "lut_file": "zero_mute.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.10,
            "Temperature": 5400,
            "Tint": 0,
            "Contrast2012": -12,
            "Highlights2012": -28,
            "Shadows2012": 22,
            "Whites2012": -14,
            "Blacks2012": -2,
            "Clarity2012": -3,
            "Texture": -3,
            "Dehaze": -2,
            "Vibrance": -9,
            "Saturation": -12,
            "HueAdjustmentOrange": 1,
            "HueAdjustmentYellow": -2,
            "HueAdjustmentGreen": 2,
            "HueAdjustmentBlue": 1,
            "SaturationAdjustmentOrange": -4,
            "SaturationAdjustmentYellow": -5,
            "SaturationAdjustmentGreen": -6,
            "SaturationAdjustmentBlue": -8,
            "LuminanceAdjustmentOrange": 4,
            "LuminanceAdjustmentBlue": 2,
            "ColorGradeShadowsHue": 215,
            "ColorGradeShadowsSat": 2,
            "ColorGradeMidtoneHue": 34,
            "ColorGradeMidtoneSat": 1,
            "ColorGradeHighlightsHue": 42,
            "ColorGradeHighlightsSat": 1,
            "ColorGradeBalance": -3,
            "ColorGradeBlending": 40,
        },
    },
    "zetra_100": {
        "config_file": "zetra_100_v1.json",
        "lut_file": "zetra_100.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.08,
            "Temperature": 5625,
            "Tint": 0,
            "Contrast2012": 2,
            "Highlights2012": -24,
            "Shadows2012": 14,
            "Whites2012": -7,
            "Blacks2012": -8,
            "Clarity2012": 1,
            "Texture": 1,
            "Dehaze": 0,
            "Vibrance": 2,
            "Saturation": 0,
            "HueAdjustmentOrange": -1,
            "HueAdjustmentYellow": -2,
            "HueAdjustmentBlue": 1,
            "SaturationAdjustmentOrange": 2,
            "SaturationAdjustmentYellow": 1,
            "SaturationAdjustmentBlue": 1,
            "LuminanceAdjustmentOrange": 2,
            "LuminanceAdjustmentBlue": -1,
            "ColorGradeShadowsHue": 220,
            "ColorGradeShadowsSat": 2,
            "ColorGradeMidtoneHue": 36,
            "ColorGradeMidtoneSat": 2,
            "ColorGradeHighlightsHue": 46,
            "ColorGradeHighlightsSat": 1,
            "ColorGradeBalance": -1,
            "ColorGradeBlending": 44,
        },
    },
    "rose_spectra": {
        "config_file": "rose_spectra_v1.json",
        "lut_file": "rose_spectra.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.14,
            "Temperature": 5950,
            "Tint": 3,
            "Contrast2012": -2,
            "Highlights2012": -22,
            "Shadows2012": 16,
            "Whites2012": -8,
            "Blacks2012": -6,
            "Clarity2012": 0,
            "Texture": 0,
            "Dehaze": -1,
            "Vibrance": 3,
            "Saturation": 1,
            "HueAdjustmentRed": -2,
            "HueAdjustmentOrange": 2,
            "HueAdjustmentYellow": -1,
            "HueAdjustmentGreen": 1,
            "HueAdjustmentBlue": 2,
            "SaturationAdjustmentRed": 4,
            "SaturationAdjustmentOrange": 3,
            "SaturationAdjustmentBlue": -1,
            "LuminanceAdjustmentOrange": 3,
            "LuminanceAdjustmentBlue": 1,
            "ColorGradeShadowsHue": 320,
            "ColorGradeShadowsSat": 2,
            "ColorGradeMidtoneHue": 20,
            "ColorGradeMidtoneSat": 3,
            "ColorGradeHighlightsHue": 44,
            "ColorGradeHighlightsSat": 2,
            "ColorGradeBalance": 2,
            "ColorGradeBlending": 43,
        },
    },
    "phenomena": {
        "config_file": "phenomena_v1.json",
        "lut_file": "phenomena.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.12,
            "Temperature": 5480,
            "Tint": 1,
            "Contrast2012": 4,
            "Highlights2012": -24,
            "Shadows2012": 14,
            "Whites2012": -6,
            "Blacks2012": -10,
            "Clarity2012": 1,
            "Texture": 1,
            "Dehaze": 1,
            "Vibrance": 2,
            "Saturation": 0,
            "HueAdjustmentOrange": -1,
            "HueAdjustmentYellow": -1,
            "HueAdjustmentGreen": 2,
            "HueAdjustmentBlue": 1,
            "SaturationAdjustmentOrange": 2,
            "SaturationAdjustmentGreen": -1,
            "SaturationAdjustmentBlue": 1,
            "LuminanceAdjustmentOrange": 2,
            "LuminanceAdjustmentBlue": -1,
            "ColorGradeShadowsHue": 230,
            "ColorGradeShadowsSat": 2,
            "ColorGradeMidtoneHue": 36,
            "ColorGradeMidtoneSat": 2,
            "ColorGradeHighlightsHue": 46,
            "ColorGradeHighlightsSat": 1,
            "ColorGradeBalance": 0,
            "ColorGradeBlending": 44,
        },
    },
    "vespera": {
        "config_file": "vespera_v1.json",
        "lut_file": "vespera.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.10,
            "Temperature": 5050,
            "Tint": -2,
            "Contrast2012": 6,
            "Highlights2012": -20,
            "Shadows2012": 12,
            "Whites2012": -5,
            "Blacks2012": -11,
            "Clarity2012": 2,
            "Texture": 2,
            "Dehaze": 1,
            "Vibrance": 3,
            "Saturation": 0,
            "HueAdjustmentOrange": -2,
            "HueAdjustmentYellow": -4,
            "HueAdjustmentGreen": 3,
            "HueAdjustmentAqua": 2,
            "HueAdjustmentBlue": 3,
            "SaturationAdjustmentOrange": 1,
            "SaturationAdjustmentYellow": -1,
            "SaturationAdjustmentGreen": -2,
            "SaturationAdjustmentBlue": 2,
            "LuminanceAdjustmentOrange": 1,
            "LuminanceAdjustmentBlue": -2,
            "ColorGradeShadowsHue": 220,
            "ColorGradeShadowsSat": 3,
            "ColorGradeMidtoneHue": 34,
            "ColorGradeMidtoneSat": 2,
            "ColorGradeHighlightsHue": 44,
            "ColorGradeHighlightsSat": 1,
            "ColorGradeBalance": -2,
            "ColorGradeBlending": 44,
        },
    },
    "sony_classic_negative": {
        "config_file": "sony_classic_negative_v1.json",
        "lut_file": "sony_classic_negative.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.10,
            "Temperature": 5600,
            "Tint": 0,
            "Contrast2012": -8,
            "Highlights2012": -28,
            "Shadows2012": 18,
            "Whites2012": -12,
            "Blacks2012": -4,
            "Clarity2012": -2,
            "Texture": -1,
            "Dehaze": -1,
            "Vibrance": -5,
            "Saturation": -5,
            "HueAdjustmentOrange": 1,
            "HueAdjustmentYellow": -1,
            "HueAdjustmentGreen": 5,
            "HueAdjustmentAqua": 3,
            "HueAdjustmentBlue": 2,
            "SaturationAdjustmentOrange": -2,
            "SaturationAdjustmentGreen": -4,
            "SaturationAdjustmentBlue": -4,
            "LuminanceAdjustmentOrange": 3,
            "LuminanceAdjustmentBlue": 1,
            "ColorGradeShadowsHue": 210,
            "ColorGradeShadowsSat": 2,
            "ColorGradeMidtoneHue": 32,
            "ColorGradeMidtoneSat": 2,
            "ColorGradeHighlightsHue": 42,
            "ColorGradeHighlightsSat": 1,
            "ColorGradeBalance": -4,
            "ColorGradeBlending": 42,
        },
    },
    "cinestill_x": {
        "config_file": "cinestill_x_v1.json",
        "lut_file": "cinestill_x.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.14,
            "Temperature": 5000,
            "Tint": -1,
            "Contrast2012": 0,
            "Highlights2012": -30,
            "Shadows2012": 20,
            "Whites2012": -10,
            "Blacks2012": -6,
            "Clarity2012": -1,
            "Texture": -1,
            "Dehaze": 0,
            "Vibrance": -2,
            "Saturation": -1,
            "HueAdjustmentOrange": -1,
            "HueAdjustmentYellow": -2,
            "HueAdjustmentAqua": 4,
            "HueAdjustmentBlue": 8,
            "SaturationAdjustmentOrange": 1,
            "SaturationAdjustmentYellow": -1,
            "SaturationAdjustmentAqua": 6,
            "SaturationAdjustmentBlue": 8,
            "LuminanceAdjustmentOrange": 2,
            "LuminanceAdjustmentBlue": -3,
            "ColorGradeShadowsHue": 240,
            "ColorGradeShadowsSat": 4,
            "ColorGradeMidtoneHue": 30,
            "ColorGradeMidtoneSat": 2,
            "ColorGradeHighlightsHue": 44,
            "ColorGradeHighlightsSat": 1,
            "ColorGradeBalance": -4,
            "ColorGradeBlending": 45,
        },
    },
    "neo_max": {
        "config_file": "neo_max_v1.json",
        "lut_file": "neo_max.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.08,
            "Temperature": 5200,
            "Tint": -1,
            "Contrast2012": 8,
            "Highlights2012": -24,
            "Shadows2012": 10,
            "Whites2012": -6,
            "Blacks2012": -12,
            "Clarity2012": 3,
            "Texture": 1,
            "Dehaze": 2,
            "Vibrance": -2,
            "Saturation": -4,
            "HueAdjustmentOrange": -2,
            "HueAdjustmentYellow": -3,
            "HueAdjustmentGreen": 2,
            "HueAdjustmentAqua": 3,
            "HueAdjustmentBlue": 4,
            "SaturationAdjustmentOrange": -2,
            "SaturationAdjustmentGreen": -4,
            "SaturationAdjustmentBlue": -3,
            "LuminanceAdjustmentOrange": 1,
            "LuminanceAdjustmentBlue": -2,
            "ColorGradeShadowsHue": 225,
            "ColorGradeShadowsSat": 4,
            "ColorGradeMidtoneHue": 32,
            "ColorGradeMidtoneSat": 1,
            "ColorGradeHighlightsHue": 40,
            "ColorGradeHighlightsSat": 0,
            "ColorGradeBalance": -4,
            "ColorGradeBlending": 46,
        },
    },
    "midred_infra": {
        "config_file": "midred_infra_v1.json",
        "lut_file": "midred_infra.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.12,
            "Temperature": 6200,
            "Tint": 4,
            "Contrast2012": 4,
            "Highlights2012": -18,
            "Shadows2012": 12,
            "Whites2012": -5,
            "Blacks2012": -10,
            "Clarity2012": 2,
            "Texture": 1,
            "Dehaze": 1,
            "Vibrance": 4,
            "Saturation": 2,
            "HueAdjustmentRed": -10,
            "HueAdjustmentOrange": 6,
            "HueAdjustmentYellow": 8,
            "HueAdjustmentGreen": 12,
            "HueAdjustmentAqua": -6,
            "HueAdjustmentBlue": -12,
            "SaturationAdjustmentRed": 8,
            "SaturationAdjustmentOrange": 6,
            "SaturationAdjustmentYellow": 2,
            "SaturationAdjustmentGreen": -8,
            "SaturationAdjustmentBlue": -10,
            "LuminanceAdjustmentRed": 2,
            "LuminanceAdjustmentOrange": 4,
            "LuminanceAdjustmentBlue": -4,
            "ColorGradeShadowsHue": 340,
            "ColorGradeShadowsSat": 3,
            "ColorGradeMidtoneHue": 20,
            "ColorGradeMidtoneSat": 3,
            "ColorGradeHighlightsHue": 48,
            "ColorGradeHighlightsSat": 1,
            "ColorGradeBalance": 3,
            "ColorGradeBlending": 40,
        },
    },
    "x_tarr": {
        "config_file": "x_tarr_v1.json",
        "lut_file": "x_tarr.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.10,
            "Temperature": 5350,
            "Tint": -1,
            "Contrast2012": 2,
            "Highlights2012": -22,
            "Shadows2012": 14,
            "Whites2012": -6,
            "Blacks2012": -8,
            "Clarity2012": 1,
            "Texture": 1,
            "Dehaze": 1,
            "Vibrance": 2,
            "Saturation": 1,
            "HueAdjustmentOrange": -4,
            "HueAdjustmentYellow": -6,
            "HueAdjustmentGreen": 6,
            "HueAdjustmentAqua": 4,
            "HueAdjustmentBlue": 2,
            "SaturationAdjustmentOrange": 1,
            "SaturationAdjustmentYellow": -2,
            "SaturationAdjustmentGreen": 3,
            "SaturationAdjustmentBlue": 2,
            "LuminanceAdjustmentOrange": 1,
            "LuminanceAdjustmentBlue": -1,
            "ColorGradeShadowsHue": 210,
            "ColorGradeShadowsSat": 3,
            "ColorGradeMidtoneHue": 34,
            "ColorGradeMidtoneSat": 2,
            "ColorGradeHighlightsHue": 42,
            "ColorGradeHighlightsSat": 1,
            "ColorGradeBalance": -1,
            "ColorGradeBlending": 44,
        },
    },
    "veniliqum": {
        "config_file": "veniliqum_v1.json",
        "lut_file": "veniliqum.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.09,
            "Temperature": 5150,
            "Tint": -1,
            "Contrast2012": 0,
            "Highlights2012": -26,
            "Shadows2012": 18,
            "Whites2012": -8,
            "Blacks2012": -8,
            "Clarity2012": 0,
            "Texture": 0,
            "Dehaze": 0,
            "Vibrance": -1,
            "Saturation": -2,
            "HueAdjustmentRed": 2,
            "HueAdjustmentOrange": -1,
            "HueAdjustmentYellow": -3,
            "HueAdjustmentGreen": 5,
            "HueAdjustmentAqua": 3,
            "HueAdjustmentBlue": 5,
            "SaturationAdjustmentRed": 2,
            "SaturationAdjustmentOrange": 1,
            "SaturationAdjustmentGreen": -2,
            "SaturationAdjustmentBlue": 3,
            "LuminanceAdjustmentOrange": 2,
            "LuminanceAdjustmentBlue": -2,
            "ColorGradeShadowsHue": 250,
            "ColorGradeShadowsSat": 3,
            "ColorGradeMidtoneHue": 320,
            "ColorGradeMidtoneSat": 2,
            "ColorGradeHighlightsHue": 44,
            "ColorGradeHighlightsSat": 1,
            "ColorGradeBalance": -2,
            "ColorGradeBlending": 43,
        },
    },
    "acros_x": {
        "config_file": "acros_x_v1.json",
        "lut_file": "acros_x.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.02,
            "Temperature": 6100,
            "Tint": 4,
            "Contrast2012": 4,
            "Highlights2012": -36,
            "Shadows2012": 26,
            "Whites2012": -12,
            "Blacks2012": -18,
            "Clarity2012": 10,
            "Texture": 16,
            "Dehaze": 0,
            "Vibrance": -100,
            "Saturation": -100,
            "GrayMixerRed": 0,
            "GrayMixerOrange": 0,
            "GrayMixerYellow": 0,
            "GrayMixerGreen": 0,
            "GrayMixerAqua": 0,
            "GrayMixerBlue": 0,
            "GrayMixerPurple": 0,
            "GrayMixerMagenta": 0,
            "ColorGradeMidtoneHue": 35,
            "ColorGradeMidtoneSat": 4,
            "ColorGradeBlending": 45,
        },
    },
    "acros_xy": {
        "config_file": "acros_xy_v1.json",
        "lut_file": "acros_xy.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.03,
            "Temperature": 6150,
            "Tint": 4,
            "Contrast2012": 5,
            "Highlights2012": -34,
            "Shadows2012": 24,
            "Whites2012": -11,
            "Blacks2012": -18,
            "Clarity2012": 10,
            "Texture": 15,
            "Dehaze": 1,
            "Vibrance": -100,
            "Saturation": -100,
            "GrayMixerRed": 6,
            "GrayMixerOrange": 10,
            "GrayMixerYellow": 22,
            "GrayMixerGreen": 4,
            "GrayMixerAqua": -18,
            "GrayMixerBlue": -32,
            "GrayMixerPurple": -8,
            "GrayMixerMagenta": -4,
            "ColorGradeMidtoneHue": 38,
            "ColorGradeMidtoneSat": 4,
            "ColorGradeBlending": 45,
        },
    },
    "acros_xr": {
        "config_file": "acros_xr_v1.json",
        "lut_file": "acros_xr.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.03,
            "Temperature": 6200,
            "Tint": 5,
            "Contrast2012": 7,
            "Highlights2012": -34,
            "Shadows2012": 22,
            "Whites2012": -10,
            "Blacks2012": -20,
            "Clarity2012": 12,
            "Texture": 16,
            "Dehaze": 1,
            "Vibrance": -100,
            "Saturation": -100,
            "GrayMixerRed": 28,
            "GrayMixerOrange": 18,
            "GrayMixerYellow": 6,
            "GrayMixerGreen": -18,
            "GrayMixerAqua": -30,
            "GrayMixerBlue": -42,
            "GrayMixerPurple": -12,
            "GrayMixerMagenta": -6,
            "ColorGradeMidtoneHue": 34,
            "ColorGradeMidtoneSat": 5,
            "ColorGradeBlending": 46,
        },
    },
    "acros_xg": {
        "config_file": "acros_xg_v1.json",
        "lut_file": "acros_xg.cube",
        "bias_delta": {
            "Exposure": 0.02,
        },
        "override": {
            "Exposure": 0.01,
            "Temperature": 6000,
            "Tint": 3,
            "Contrast2012": 3,
            "Highlights2012": -38,
            "Shadows2012": 28,
            "Whites2012": -12,
            "Blacks2012": -16,
            "Clarity2012": 9,
            "Texture": 14,
            "Dehaze": 0,
            "Vibrance": -100,
            "Saturation": -100,
            "GrayMixerRed": -18,
            "GrayMixerOrange": -8,
            "GrayMixerYellow": 8,
            "GrayMixerGreen": 30,
            "GrayMixerAqua": 14,
            "GrayMixerBlue": -8,
            "GrayMixerPurple": -2,
            "GrayMixerMagenta": -4,
            "ColorGradeMidtoneHue": 32,
            "ColorGradeMidtoneSat": 3,
            "ColorGradeBlending": 44,
        },
    },
}

EMULSION_FALLBACKS = {
    "portra": "portra_400",
    "gold": "portra_400",
    "colorplus": "portra_400",
    "ektar": "portra_400",
    "kodachrome": "portra_400",
    "vision3": "cinestill_800t",
    "cinestill": "cinestill_800t",
    "fuji": "fuji_400h",
    "bw": "portra_400",
}

FORMAT_ADJUSTMENTS = {
    "35mm": {"Texture": 6, "Clarity2012": 4, "Dehaze": 1},
    "mf_120": {"Texture": -6, "Clarity2012": -3, "Dehaze": -1},
    "lf_4x5": {"Texture": -10, "Clarity2012": -5, "Dehaze": -3},
    # Large-format sheet: similar relief to 4x5; tune independently when SSG/halation wiring lands.
    "lf_8x10": {"Texture": -12, "Clarity2012": -6, "Dehaze": -4},
}

DEBUG_MODE_DELTAS = {
    "portra_400": {"Temperature": 120, "Tint": 2, "ColorGradeHighlightsSat": 3},
    "cinestill_800t": {"Temperature": -350, "Tint": 3, "ColorGradeShadowsSat": 5, "SaturationAdjustmentBlue": 4},
    "fuji_400h": {"Temperature": -200, "Tint": -3, "ColorGradeMidtoneSat": 4, "SaturationAdjustmentGreen": -4},
}

NIGHT_BOOST_DELTAS = {
    # Tuned for visibly stronger separation in dark scenes while keeping a film-like rolloff.
    "portra_400": {
        "Exposure": 0.55,
        "Shadows2012": 34,
        "Blacks2012": 24,
        "Whites2012": 8,
        "Contrast2012": -14,
        "Dehaze": -6,
        "Vibrance": 6,
        "Saturation": 3,
        "Temperature": 180,
        "Tint": 2,
    },
    "cinestill_800t": {
        "Exposure": 0.62,
        "Shadows2012": 38,
        "Blacks2012": 28,
        "Whites2012": 10,
        "Contrast2012": -16,
        "Dehaze": -8,
        "Vibrance": 6,
        "Saturation": 2,
        "Temperature": 260,
        "Tint": 2,
    },
    "fuji_400h": {
        "Exposure": 0.52,
        "Shadows2012": 30,
        "Blacks2012": 20,
        "Whites2012": 6,
        "Contrast2012": -10,
        "Dehaze": -5,
        "Temperature": 120,
        "Tint": 2,
        "Saturation": 1,
    },
}

NIGHT_BOOST_BASELINE_VERSION = "v1.1-night"
NIGHT_BOOST_LEVEL_SCALE = {
    "off": 0.0,
    "soft": 0.6,
    "medium": 0.85,
    "strong": 1.15,
}
_IMAGE_ANALYSIS_SUFFIXES = {".jpg", ".jpeg", ".tif", ".tiff", ".png", ".bmp"}
_IMAGE_ANALYSIS_MAX_DIM = 256


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _round(value: float) -> int:
    return int(round(value))


def _project_root() -> Path:
    # .../MindfulLens_FilmEngine_RnD/lightroom_plugin/MindfulLensFilmEngine.lrplugin/bin/analyzer_stub.py
    return Path(__file__).resolve().parents[3]


def _plugin_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _percentile(sorted_values, fraction: float) -> float:
    if not sorted_values:
        return 0.0
    fraction = _clamp(float(fraction), 0.0, 1.0)
    if len(sorted_values) == 1:
        return float(sorted_values[0])
    index = int(round((len(sorted_values) - 1) * fraction))
    index = max(0, min(len(sorted_values) - 1, index))
    return float(sorted_values[index])


def _load_rgb_pixels_via_bmp(source_input: str):
    if sys.platform != "darwin":
        raise RuntimeError("bmp_scene_analysis_unavailable")
    temp_dir = Path(tempfile.mkdtemp(prefix="mindfullens_scene_"))
    bmp_path = temp_dir / "scene.bmp"
    command = [
        "/usr/bin/sips",
        "-s",
        "format",
        "bmp",
        "-Z",
        str(_IMAGE_ANALYSIS_MAX_DIM),
        source_input,
        "--out",
        str(bmp_path),
    ]
    try:
        subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        data = bmp_path.read_bytes()
    finally:
        try:
            if bmp_path.exists():
                bmp_path.unlink()
            temp_dir.rmdir()
        except Exception:
            pass

    if len(data) < 54 or data[:2] != b"BM":
        raise RuntimeError("bmp_decode_error")
    pixel_offset = struct.unpack_from("<I", data, 10)[0]
    width = struct.unpack_from("<i", data, 18)[0]
    height = struct.unpack_from("<i", data, 22)[0]
    bit_count = struct.unpack_from("<H", data, 28)[0]
    compression = struct.unpack_from("<I", data, 30)[0]
    if compression != 0 or bit_count not in (24, 32) or width == 0 or height == 0:
        raise RuntimeError("bmp_unsupported_layout")

    width = abs(width)
    top_down = height < 0
    height = abs(height)
    bytes_per_pixel = bit_count // 8
    row_stride = ((bit_count * width + 31) // 32) * 4
    pixels = []
    for y in range(height):
        row_index = y if top_down else (height - 1 - y)
        row_start = pixel_offset + row_index * row_stride
        for x in range(width):
            pos = row_start + x * bytes_per_pixel
            if pos + 3 > len(data):
                break
            blue = data[pos]
            green = data[pos + 1]
            red = data[pos + 2]
            pixels.append((red, green, blue))
    return pixels


def _derive_scene_adjustments_from_renderable(source_input: str):
    meta = {
        "available": False,
        "reason": "unsupported",
        "pixels": 0,
        "neutral_confidence": 0.0,
        "neutral_fraction": 0.0,
        "luma_p05": "",
        "luma_p50": "",
        "luma_p95": "",
        "dynamic_range": "",
    }
    path = Path(source_input)
    if path.suffix.lower() not in _IMAGE_ANALYSIS_SUFFIXES:
        meta["reason"] = "unsupported_suffix"
        return {}, meta
    if not path.exists():
        meta["reason"] = "missing_input"
        return {}, meta

    try:
        pixels = _load_rgb_pixels_via_bmp(str(path))
    except Exception as exc:
        meta["reason"] = str(exc)
        return {}, meta

    if not pixels:
        meta["reason"] = "empty_image"
        return {}, meta

    lumas = []
    total_r = total_g = total_b = 0.0
    neutral_r = neutral_g = neutral_b = neutral_weight = 0.0

    for r8, g8, b8 in pixels:
        r = float(r8) / 255.0
        g = float(g8) / 255.0
        b = float(b8) / 255.0
        total_r += r
        total_g += g
        total_b += b

        luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
        lumas.append(luma)

        max_c = max(r, g, b)
        min_c = min(r, g, b)
        saturation = 0.0 if max_c <= 1e-6 else (max_c - min_c) / max_c
        if 0.08 <= luma <= 0.97 and saturation <= 0.12:
            weight = 1.0 - (saturation / 0.12)
            neutral_r += r * weight
            neutral_g += g * weight
            neutral_b += b * weight
            neutral_weight += weight

    lumas.sort()
    pixel_count = float(len(pixels))
    mean_r = total_r / pixel_count
    mean_g = total_g / pixel_count
    mean_b = total_b / pixel_count
    p05 = _percentile(lumas, 0.05)
    p50 = _percentile(lumas, 0.50)
    p95 = _percentile(lumas, 0.95)
    dynamic_range = max(0.0, p95 - p05)

    neutral_fraction = 0.0
    if neutral_weight > 0.0:
        neutral_fraction = neutral_weight / pixel_count
        neutral_confidence = _clamp(neutral_fraction / 0.22, 0.18, 1.0)
        ref_r = neutral_r / neutral_weight
        ref_g = neutral_g / neutral_weight
        ref_b = neutral_b / neutral_weight
    else:
        neutral_confidence = 0.22
        ref_r = mean_r
        ref_g = mean_g
        ref_b = mean_b

    avg_rb = (ref_r + ref_b) / 2.0
    temp_delta = _round(_clamp((ref_b - ref_r) * 2200.0 * neutral_confidence, -450.0, 450.0))
    tint_delta = _round(_clamp((ref_g - avg_rb) * 140.0 * neutral_confidence, -12.0, 12.0))

    target_mid = 0.46
    exposure_delta = _clamp(math.log2((target_mid + 1e-4) / (p50 + 1e-4)), -0.35, 0.35)
    if p95 > 0.97:
        exposure_delta -= min(0.12, (p95 - 0.97) * 2.0)
    elif p95 < 0.68:
        exposure_delta += min(0.08, (0.68 - p95) * 0.6)
    exposure_delta = round(_clamp(exposure_delta * 0.85, -0.40, 0.40), 2)

    highlights_delta = _round(_clamp(-((p95 - 0.86) / 0.14) * 40.0, -45.0, 8.0))
    shadows_delta = _round(_clamp(((0.16 - p05) / 0.16) * 30.0, -8.0, 30.0))
    whites_delta = _round(_clamp(-((p95 - 0.90) / 0.10) * 28.0, -32.0, 6.0))
    blacks_delta = _round(_clamp(((0.05 - p05) / 0.05) * 10.0, -4.0, 10.0))
    contrast_delta = _round(_clamp(((0.48 - dynamic_range) / 0.48) * 10.0, -10.0, 10.0))

    adjustments = {
        "Temperature": temp_delta,
        "Tint": tint_delta,
        "Exposure": exposure_delta,
        "Highlights2012": highlights_delta,
        "Shadows2012": shadows_delta,
        "Whites2012": whites_delta,
        "Blacks2012": blacks_delta,
        "Contrast2012": contrast_delta,
    }

    meta.update(
        {
            "available": True,
            "reason": "ok",
            "pixels": int(pixel_count),
            "neutral_confidence": round(neutral_confidence, 3),
            "neutral_fraction": round(neutral_fraction, 3),
            "luma_p05": round(p05, 3),
            "luma_p50": round(p50, 3),
            "luma_p95": round(p95, 3),
            "dynamic_range": round(dynamic_range, 3),
        }
    )
    return adjustments, meta


def _load_km_config(emulsion_id: str) -> dict:
    meta = _resolve_emulsion_meta(emulsion_id)
    config_name = meta["config_file"]
    candidates = [
        _plugin_root() / "profiles" / config_name,
        _project_root() / "configs" / config_name,
    ]
    config_path = None
    for candidate in candidates:
        if candidate.exists():
            config_path = candidate
            break

    if config_path is None:
        fallback_path = candidates[0]
        return {
            "film_id": emulsion_id.upper(),
            "k_coeffs": [0.85, 0.92, 0.78],
            "s_coeffs": [0.12, 0.15, 0.10],
            "print_contrast": 1.12,
            "config_path": str(fallback_path),
            "config_missing": True,
        }

    if not config_path.exists():
        return {
            "film_id": emulsion_id.upper(),
            "k_coeffs": [0.85, 0.92, 0.78],
            "s_coeffs": [0.12, 0.15, 0.10],
            "print_contrast": 1.12,
            "config_path": str(config_path),
            "config_missing": True,
        }
    cfg = json.loads(config_path.read_text(encoding="utf-8"))
    cfg["config_path"] = str(config_path)
    cfg["config_missing"] = False
    return cfg


def _resolve_emulsion_meta(emulsion_id: str) -> dict:
    if emulsion_id in EMULSION_REGISTRY:
        return EMULSION_REGISTRY[emulsion_id]
    # If dedicated config/LUT files exist, use them even if overrides are empty.
    config_name = f"{emulsion_id}_v1.json"
    lut_name = f"{emulsion_id}.cube"
    config_exists = (_plugin_root() / "profiles" / config_name).exists() or (_project_root() / "configs" / config_name).exists()
    lut_exists = (_plugin_root() / "profiles" / "luts" / lut_name).exists()
    if config_exists or lut_exists:
        return {
            "config_file": config_name,
            "lut_file": lut_name,
            "bias_delta": {},
            "override": {},
        }

    lowered = emulsion_id.lower()
    for key, base in EMULSION_FALLBACKS.items():
        if key in lowered:
            return EMULSION_REGISTRY.get(base, EMULSION_REGISTRY["portra_400"])
    return EMULSION_REGISTRY["portra_400"]


def _derive_base_look(cfg: dict) -> dict:
    k_tup = tuple(float(x) for x in cfg.get("k_coeffs", [0.85, 0.92, 0.78]))
    s_tup = tuple(float(x) for x in cfg.get("s_coeffs", [0.12, 0.15, 0.10]))
    pc = float(cfg.get("print_contrast", 1.0))

    k_avg = sum(k_tup) / 3.0
    s_avg = sum(s_tup) / 3.0
    channel_spread = max(k_tup) - min(k_tup)
    density = (k_avg - s_avg) * 2.0

    # 1. Use Bradford CAT to extract accurate Temperature / Tint offsets
    t_shift, tint_shift = extract_white_balance_shift(k_tup, s_tup, pc)
    
    # Base assuming D65/D50 hybrid for generic daylight ~5200K
    temperature = _round(_clamp(5200.0 + float(t_shift), 2000.0, 50000.0))
    tint = _round(_clamp(float(tint_shift), -150.0, 150.0))
    
    exposure = round(_clamp(0.18 + (1.0 - density) * 0.12, -0.35, 0.45), 2)

    vibrance = _round(_clamp(channel_spread * 45.0, -25.0, 30.0))
    saturation = _round(_clamp((channel_spread - 0.18) * 20.0, -20.0, 16.0))

    return {
        "Temperature": temperature,
        "Tint": tint,
        "Exposure": exposure,
        "Contrast2012": 0,    # Delegated to True ToneCurvePV2012
        "Highlights2012": 0,  # Delegated
        "Shadows2012": 0,     # Delegated
        "Whites2012": 0,      # Delegated
        "Blacks2012": 0,      # Delegated
        "Vibrance": vibrance,
        "Saturation": saturation,
        "Clarity2012": 0,
        "Texture": -4,
        "Dehaze": 0,
    }


def _merge_adjustments(base: dict, adjustments: dict) -> dict:
    merged = dict(base)
    for key, value in adjustments.items():
        if key in merged:
            merged[key] = merged[key] + value
        else:
            merged[key] = value
    return merged


def _scale_adjustments(adjustments: dict, scale: float) -> dict:
    if scale == 1.0:
        return dict(adjustments)
    out = {}
    for key, value in adjustments.items():
        out[key] = value * scale
    return out


def _normalize_for_lightroom(payload: dict) -> dict:
    ranges = {
        "Temperature": (2000, 50000),
        "Tint": (-150, 150),
        "Contrast2012": (-100, 100),
        "Highlights2012": (-100, 100),
        "Shadows2012": (-100, 100),
        "Whites2012": (-100, 100),
        "Blacks2012": (-100, 100),
        "Vibrance": (-100, 100),
        "Saturation": (-100, 100),
        "Clarity2012": (-100, 100),
        "Texture": (-100, 100),
        "Dehaze": (-100, 100),
        "HueAdjustmentRed": (-100, 100),
        "HueAdjustmentOrange": (-100, 100),
        "HueAdjustmentYellow": (-100, 100),
        "HueAdjustmentGreen": (-100, 100),
        "HueAdjustmentAqua": (-100, 100),
        "HueAdjustmentBlue": (-100, 100),
        "SaturationAdjustmentRed": (-100, 100),
        "SaturationAdjustmentOrange": (-100, 100),
        "SaturationAdjustmentYellow": (-100, 100),
        "SaturationAdjustmentGreen": (-100, 100),
        "SaturationAdjustmentAqua": (-100, 100),
        "SaturationAdjustmentBlue": (-100, 100),
        "LuminanceAdjustmentRed": (-100, 100),
        "LuminanceAdjustmentOrange": (-100, 100),
        "LuminanceAdjustmentYellow": (-100, 100),
        "LuminanceAdjustmentGreen": (-100, 100),
        "LuminanceAdjustmentAqua": (-100, 100),
        "LuminanceAdjustmentBlue": (-100, 100),
        "RedHue": (-100, 100),
        "RedSaturation": (-100, 100),
        "GreenHue": (-100, 100),
        "GreenSaturation": (-100, 100),
        "BlueHue": (-100, 100),
        "BlueSaturation": (-100, 100),
        "ColorGradeBlending": (0, 100),
        "ColorGradeBalance": (-100, 100),
        "ColorGradeShadowsHue": (0, 360),
        "ColorGradeShadowsSat": (0, 100),
        "ColorGradeMidtoneHue": (0, 360),
        "ColorGradeMidtoneSat": (0, 100),
        "ColorGradeHighlightsHue": (0, 360),
        "ColorGradeHighlightsSat": (0, 100),
    }
    for key, bounds in ranges.items():
        if key in payload:
            payload[key] = int(round(_clamp(float(payload[key]), bounds[0], bounds[1])))
    if "Exposure" in payload:
        payload["Exposure"] = round(_clamp(float(payload["Exposure"]), -5.0, 5.0), 2)
    return payload


def _decode_tiff_value(data: bytes, tiff_start: int, endian: str, value_type: int, count: int, raw4: bytes):
    type_sizes = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 9: 4, 10: 8}
    if value_type not in type_sizes or count <= 0:
        return None
    if count > _MAX_TIFF_VALUE_COUNT:
        return None
    total_size = type_sizes[value_type] * count

    if total_size <= 4:
        value_data = raw4[:total_size]
    else:
        value_offset = struct.unpack(endian + "I", raw4)[0]
        start = tiff_start + value_offset
        end = start + total_size
        if start < 0 or end > len(data):
            return None
        value_data = data[start:end]

    if value_type == 2:  # ASCII
        return value_data.split(b"\x00", 1)[0].decode("ascii", errors="ignore")

    if value_type == 3:  # SHORT
        values = struct.unpack(endian + ("H" * count), value_data)
        return list(values) if count > 1 else values[0]

    if value_type == 4:  # LONG
        values = struct.unpack(endian + ("I" * count), value_data)
        return list(values) if count > 1 else values[0]

    if value_type == 5:  # RATIONAL
        vals = []
        for i in range(count):
            num, den = struct.unpack(endian + "II", value_data[i * 8 : (i + 1) * 8])
            vals.append((float(num) / float(den)) if den else None)
        return vals if count > 1 else vals[0]

    if value_type == 9:  # SLONG
        values = struct.unpack(endian + ("i" * count), value_data)
        return list(values) if count > 1 else values[0]

    if value_type == 10:  # SRATIONAL
        vals = []
        for i in range(count):
            num, den = struct.unpack(endian + "ii", value_data[i * 8 : (i + 1) * 8])
            vals.append((float(num) / float(den)) if den else None)
        return vals if count > 1 else vals[0]

    return None


_SCENE_GUARD_EXIF_SUFFIXES = {".jpg", ".jpeg", ".tif", ".tiff"}
_MAX_SCENE_GUARD_BYTES = 64 * 1024 * 1024
_MAX_TIFF_IFD_ENTRIES = 256
_MAX_TIFF_VALUE_COUNT = 4096


def _parse_tiff_tags(data: bytes, tiff_start: int = 0) -> dict:
    if tiff_start + 8 > len(data):
        return {}

    byte_order = data[tiff_start : tiff_start + 2]
    if byte_order == b"II":
        endian = "<"
    elif byte_order == b"MM":
        endian = ">"
    else:
        return {}

    magic = struct.unpack(endian + "H", data[tiff_start + 2 : tiff_start + 4])[0]
    if magic != 42:  # classic TIFF/EXIF
        return {}

    ifd0_offset = struct.unpack(endian + "I", data[tiff_start + 4 : tiff_start + 8])[0]
    tags = {}
    visited_offsets = set()

    def parse_ifd(rel_offset: int):
        if not isinstance(rel_offset, int):
            return {}
        if rel_offset < 0 or rel_offset in visited_offsets:
            return {}
        start = tiff_start + rel_offset
        if start < tiff_start or start + 2 > len(data):
            return {}
        visited_offsets.add(rel_offset)
        entry_count = min(struct.unpack(endian + "H", data[start : start + 2])[0], _MAX_TIFF_IFD_ENTRIES)
        out = {}
        for i in range(entry_count):
            epos = start + 2 + i * 12
            if epos + 12 > len(data):
                break
            tag = struct.unpack(endian + "H", data[epos : epos + 2])[0]
            value_type = struct.unpack(endian + "H", data[epos + 2 : epos + 4])[0]
            count = struct.unpack(endian + "I", data[epos + 4 : epos + 8])[0]
            raw4 = data[epos + 8 : epos + 12]
            out[tag] = _decode_tiff_value(data, tiff_start, endian, value_type, count, raw4)
        return out

    tags.update(parse_ifd(ifd0_offset))
    exif_ifd_ptr = tags.get(34665)  # ExifIFDPointer
    if isinstance(exif_ifd_ptr, int):
        tags.update(parse_ifd(exif_ifd_ptr))

    return tags


def _extract_exif_triplet(source_input: str):
    path = Path(source_input)
    if path.suffix.lower() not in _SCENE_GUARD_EXIF_SUFFIXES:
        return None
    try:
        file_size = path.stat().st_size
    except Exception:
        return None
    if file_size <= 0 or file_size > _MAX_SCENE_GUARD_BYTES:
        return None
    try:
        data = path.read_bytes()
    except Exception:
        return None

    tags = {}
    if len(data) >= 4 and data[0:2] == b"\xFF\xD8":  # JPEG
        pos = 2
        while pos + 4 <= len(data):
            if data[pos] != 0xFF:
                pos += 1
                continue
            marker = data[pos + 1]
            pos += 2
            if marker in (0xD8, 0xD9):
                continue
            if marker == 0xDA:  # start of scan
                break
            if pos + 2 > len(data):
                break
            seg_len = struct.unpack(">H", data[pos : pos + 2])[0]
            seg_start = pos + 2
            seg_end = pos + seg_len
            if seg_end > len(data):
                break
            if marker == 0xE1 and data[seg_start : seg_start + 6] == b"Exif\x00\x00":
                tags = _parse_tiff_tags(data, seg_start + 6)
                break
            pos = seg_end
    else:
        tags = _parse_tiff_tags(data, 0)

    if not tags:
        return None

    def first_number(value):
        if isinstance(value, list):
            for x in value:
                if isinstance(x, (int, float)):
                    return float(x)
            return None
        if isinstance(value, (int, float)):
            return float(value)
        return None

    exposure_s = first_number(tags.get(0x829A))  # ExposureTime
    f_number = first_number(tags.get(0x829D))  # FNumber
    iso = first_number(tags.get(0x8827))  # ISOSpeedRatings
    if iso is None:
        iso = first_number(tags.get(0x8833))  # PhotographicSensitivity

    if exposure_s and f_number and iso:
        return {"exposure_s": exposure_s, "f_number": f_number, "iso": iso}
    return None


def _scene_guard_adjustments(source_input: str):
    triplet = _extract_exif_triplet(source_input)
    if not triplet:
        return {}, {"tier": "none", "reason": "no_exif"}

    t = float(triplet["exposure_s"])
    n = float(triplet["f_number"])
    iso = float(triplet["iso"])
    if t <= 0 or n <= 0 or iso <= 0:
        return {}, {"tier": "none", "reason": "invalid_exif"}

    ev100 = math.log2((n * n) / t) - math.log2(iso / 100.0)
    adjustments = {}
    tier = "none"

    if ev100 < 8.5:
        # Guard rail for dark scenes: open mids/shadows while preserving film separation.
        adjustments = {"Exposure": 0.28, "Shadows2012": 10, "Blacks2012": 6, "Contrast2012": -6}
        tier = "lowlight"
    elif ev100 < 10.0:
        adjustments = {"Exposure": 0.14, "Shadows2012": 5, "Blacks2012": 3, "Contrast2012": -3}
        tier = "dim"

    return adjustments, {
        "tier": tier,
        "ev100": round(ev100, 2),
        "exposure_s": round(t, 6),
        "f_number": round(n, 2),
        "iso": int(round(iso)),
    }


def build_payload(
    emulsion_id: str,
    format_id: str,
    source_input: str,
    profile_mode: str = "production",
    night_boost: bool = False,
    night_boost_level: str = "off",
) -> dict:
    meta = _resolve_emulsion_meta(emulsion_id)
    cfg = _load_km_config(emulsion_id)
    base = _derive_base_look(cfg)
    look = _merge_adjustments(base, meta.get("bias_delta", {}))
    for k, v in meta.get("override", {}).items():
        look[k] = v
    look = _merge_adjustments(look, FORMAT_ADJUSTMENTS.get(format_id, {}))
    image_adjustments, image_meta = _derive_scene_adjustments_from_renderable(source_input)
    if image_adjustments:
        look = _merge_adjustments(look, image_adjustments)
    # Gentle dark-scene protection for OFF mode (EXIF-driven).
    # This keeps OFF usable at night while preserving current ON strength.
    scene_adjustments, scene_meta_raw = _scene_guard_adjustments(source_input)
    scene_meta = {
        "tier": scene_meta_raw.get("tier", "none"),
        "ev100": scene_meta_raw.get("ev100", ""),
        "iso": scene_meta_raw.get("iso", ""),
        "exposure_s": scene_meta_raw.get("exposure_s", ""),
        "f_number": scene_meta_raw.get("f_number", ""),
    }
    if scene_adjustments and night_boost_level == "off":
        look = _merge_adjustments(look, _scale_adjustments(scene_adjustments, 0.75))
    boost_scale = NIGHT_BOOST_LEVEL_SCALE.get(night_boost_level, 0.0)
    if boost_scale > 0.0:
        look = _merge_adjustments(
            look,
            _scale_adjustments(NIGHT_BOOST_DELTAS.get(emulsion_id, {}), boost_scale),
        )
    if profile_mode == "debug":
        look = _merge_adjustments(look, DEBUG_MODE_DELTAS.get(emulsion_id, {}))
    look = _normalize_for_lightroom(look)

    lut_path = str((_plugin_root() / "profiles" / "luts" / meta.get("lut_file", "")).resolve())
    if not meta.get("lut_file"):
        lut_path = ""
        
    k_tup = tuple(float(x) for x in cfg.get("k_coeffs", [0.85, 0.92, 0.78]))
    s_tup = tuple(float(x) for x in cfg.get("s_coeffs", [0.12, 0.15, 0.10]))
    pc = float(cfg.get("print_contrast", 1.0))
    curves = extract_tone_curve_pv2012(k_tup, s_tup, pc, points=16)

    look.update(
        {
            "profile": f"AI_KM_{emulsion_id.upper()}",
            "mode": "foundation_xmp_plus_dynamic_" + profile_mode,
            "profile_mode": profile_mode,
            "source_input": source_input,
            "format": format_id,
            "emulsion": emulsion_id,
            "film_id": cfg.get("film_id", emulsion_id.upper()),
            "print_contrast": pc,
            "km_k_coeffs": list(k_tup),
            "km_s_coeffs": list(s_tup),
            "km_config_path": cfg.get("config_path", ""),
            "km_config_missing": bool(cfg.get("config_missing", False)),
            "lut_path": lut_path,
            "lut_exists": bool(lut_path and Path(lut_path).exists()),
            "scene_analysis_available": bool(image_meta.get("available", False)),
            "scene_analysis_reason": str(image_meta.get("reason", "")),
            "scene_analysis_pixels": int(image_meta.get("pixels", 0) or 0),
            "scene_analysis_neutral_confidence": float(image_meta.get("neutral_confidence", 0.0) or 0.0),
            "scene_analysis_neutral_fraction": float(image_meta.get("neutral_fraction", 0.0) or 0.0),
            "scene_luma_p05": image_meta.get("luma_p05", ""),
            "scene_luma_p50": image_meta.get("luma_p50", ""),
            "scene_luma_p95": image_meta.get("luma_p95", ""),
            "scene_dynamic_range": image_meta.get("dynamic_range", ""),
            "ToneCurvePV2012": curves["Master"],
            "ToneCurvePV2012Red": curves["Red"],
            "ToneCurvePV2012Green": curves["Green"],
            "ToneCurvePV2012Blue": curves["Blue"],
            "scene_guard_tier": scene_meta.get("tier", "none"),
            "scene_ev100": scene_meta.get("ev100", ""),
            "scene_iso": scene_meta.get("iso", ""),
            "scene_exposure_s": scene_meta.get("exposure_s", ""),
            "scene_f_number": scene_meta.get("f_number", ""),
            "night_boost": bool(night_boost_level != "off"),
            "night_boost_level": night_boost_level,
            "night_boost_baseline_version": NIGHT_BOOST_BASELINE_VERSION,
        }
    )
    return look


def main() -> int:
    parser = argparse.ArgumentParser(description="MindfulLens analyzer stub")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--emulsion", default="portra_400")
    parser.add_argument("--format", default="35mm")
    parser.add_argument("--profile-mode", default="production", choices=["production", "debug"])
    parser.add_argument("--night-boost", default="off", choices=["on", "off"])
    parser.add_argument("--night-boost-level", default=None, choices=["off", "soft", "medium", "strong"])
    args = parser.parse_args()
    if args.night_boost_level is not None:
        night_boost_level = args.night_boost_level
    else:
        # Backward compatibility with legacy flag.
        night_boost_level = "strong" if args.night_boost == "on" else "off"

    payload = build_payload(
        emulsion_id=args.emulsion,
        format_id=args.format,
        source_input=args.input,
        profile_mode=args.profile_mode,
        night_boost=(night_boost_level != "off"),
        night_boost_level=night_boost_level,
    )

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
