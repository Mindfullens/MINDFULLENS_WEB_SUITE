-- MindfulLens Film Engine
-- Processing Pipeline Spec (runtime structure, not a preset)
-- This module defines the ordered processing stages and the data
-- structures exchanged between stages for a photochemical model.

local M = {}

-- Runtime structures (schema-like tables)
M.Structures = {
  EmulsionProfile = {
    id = "",
    label = "",
    type = "color_negative", -- color_negative | color_positive | black_and_white
    base = {
      dmin_ref = 0.0,
      dmax_ref = 0.0,
      orange_mask = {
        enabled = true,
        density_rgb = {0.0, 0.0, 0.0},
        spectral_curve_ref = "",
      },
    },
    spectral = {
      a_lambda_ref = "",
      layers = {
        { name = "blue", sensitivity_curve_ref = "" },
        { name = "green", sensitivity_curve_ref = "" },
        { name = "red", sensitivity_curve_ref = "" },
      },
    },
    sensitometry = {
      hd_curves = {
        blue = { toe = 0.0, gamma = 0.0, shoulder = 0.0, logE_breaks = {} },
        green = { toe = 0.0, gamma = 0.0, shoulder = 0.0, logE_breaks = {} },
        red = { toe = 0.0, gamma = 0.0, shoulder = 0.0, logE_breaks = {} },
      },
      interlayer_coupling = { rg = 0.0, gb = 0.0, rb = 0.0 },
    },
    grain = {
      base_rms = 0.0,
      clumping = 0.0,
      size_um = { 0.0, 0.0 },
      format_scale = { ["35mm"] = 1.0, ["120"] = 0.75, ["4x5"] = 0.45, ["8x10"] = 0.36 },
    },
    print = {
      paper_ref = "",
      enlarger_ref = "",
    },
  },

  ProcessingContext = {
    image = {
      width = 0,
      height = 0,
      camera = "",
      wb = { t = 0, tint = 0 },
      exposure = 0,
    },
    format = "35mm",
    dmin = 0.0,
    dmax = 0.0,
    night_boost = "off", -- off | soft | medium | strong
    advanced = {
      sensitometry = true,
      analyzer_overrides = false,
    },
  },

  PipelineState = {
    -- scene-referred linear buffers (conceptual)
    linear_rgb = nil,
    logE = nil,
    density = nil,
    density_layers = { blue = nil, green = nil, red = nil },
    output_rgb = nil,
    log = {},
  },
}

-- Ordered pipeline stages
M.Stages = {
  {
    id = "photochemical_base",
    label = "Baza Fotochemiczna",
    steps = {
      "emulsion_profiling",
      "exposure_index",
      "sensitometry",
      "film_compression",
    },
  },
  {
    id = "development_processing",
    label = "Kinematyka Wywolywania",
    steps = {
      "push_pull",
      "bleach_bypass",
      "emulsion_reticulation",
      "base_fog_shift",
    },
  },
  {
    id = "subtractive_color_matrix",
    label = "Subtraktywna Korekcja Barwna",
    steps = {
      "ymc_density",
      "dye_response",
      "cross_process",
    },
  },
  {
    id = "medium_optics",
    label = "Fizyka Nosnika i Optyki",
    steps = {
      "grain_morphology",
      "anti_halation_bloom",
      "optical_bloom",
      "film_damage",
    },
  },
  {
    id = "positive_darkroom_print",
    label = "Ciemnia Pozytywowa",
    steps = {
      "paper_profile",
      "dmin_dmax_limits",
      "enlarger_lens_falloff",
      "film_borders",
    },
  },
}

return M
