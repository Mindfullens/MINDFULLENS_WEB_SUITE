local M = {}

M.DEFAULTS = {
    integral_masking = "base",
    d_min = "base",
    d_max = "base",
    hd_curve = "base",
    mtf_response = "base",
    reciprocity_tail = "base",
    ssg_grain = "base",
    photon_scattering = "base",
    mackie_lines = "base",
    grain_rms = "base",
    grain_clumping = "base",
    crystal_size = "base",
    grain_lr_roughness = "base",
    surface_roughness = "base",
    anti_halation_bloom = "base",
    optical_bloom = "base",
    film_damage = "base",
}

M.PANEL_KEYS = {
    ii = { "integral_masking", "d_min", "d_max", "hd_curve", "mtf_response", "reciprocity_tail" },
    iii = {
        "grain_rms",
        "grain_clumping",
        "crystal_size",
        "grain_lr_roughness",
        "ssg_grain",
    },
    iv = {
        "photon_scattering",
        "mackie_lines",
        "surface_roughness",
        "anti_halation_bloom",
        "optical_bloom",
        "film_damage",
    },
}

local EFFECT_SCALE = 2

local CONTROL_SCALE_OVERRIDES = {
    integral_masking = 0.5,
    d_min = 0.5,
    d_max = 2.0,
    mtf_response = 0.75,
    photon_scattering = 0.5,
    surface_roughness = 0.5,
    anti_halation_bloom = 0.5,
    optical_bloom = 0.35,
    film_damage = 0.30,
    grain_lr_roughness = 0.72,
    reciprocity_tail = 0.48,
}

local CONTROL_LEVEL_MAP = {
    -- 0/1/2/3 must be monotonic intensity, not direction switches.
    integral_masking = { "l1", "l2", "l3" },
    d_min = { "measured", "precise", "anchored" },
    d_max = { "restrained", "clipped", "compressed" },
    hd_curve = { "shaped", "dense", "cinematic" },
    mtf_response = { "measured", "editorial", "etched" },
    reciprocity_tail = { "brief", "prolonged", "extreme" },
    ssg_grain = { "refined", "balanced", "raw" },
    photon_scattering = { "soft", "cine", "diffuse" },
    mackie_lines = { "subtle", "luminous", "etched" },
    grain_rms = { "fine", "neutral", "bold" },
    grain_clumping = { "smooth", "organic", "broken" },
    crystal_size = { "tight", "neutral", "large" },
    grain_lr_roughness = { "silk", "natural", "coarse" },
    surface_roughness = { "satin", "rough", "toothed" },
    anti_halation_bloom = { "soft", "strong", "bleeding" },
    optical_bloom = { "soft", "cine", "halated" },
    film_damage = { "aged", "weathered", "distressed" },
}

local LEVEL_STRENGTH = {
    l1 = 0.75,
    l2 = 1.15,
    l3 = 1.55,
}

local CONTROL_LEVEL_STRENGTH = {
    integral_masking = { l1 = 1.00, l2 = 1.00, l3 = 1.00 },
    d_min = { l1 = 0.70, l2 = 1.00, l3 = 1.35 },
    d_max = { l1 = 0.70, l2 = 1.00, l3 = 1.30 },
    hd_curve = { l1 = 0.70, l2 = 1.00, l3 = 1.35 },
    mtf_response = { l1 = 0.35, l2 = 0.50, l3 = 0.70 },
    reciprocity_tail = { l1 = 0.70, l2 = 1.00, l3 = 1.30 },
    ssg_grain = { l1 = 0.55, l2 = 0.62, l3 = 0.92 },
    photon_scattering = { l1 = 0.75, l2 = 1.00, l3 = 1.35 },
    mackie_lines = { l1 = 0.30, l2 = 0.42, l3 = 0.68 },
    grain_rms = { l1 = 0.82, l2 = 0.98, l3 = 1.12 },
    grain_clumping = { l1 = 0.78, l2 = 0.94, l3 = 1.08 },
    crystal_size = { l1 = 0.80, l2 = 0.92, l3 = 1.12 },
    grain_lr_roughness = { l1 = 0.62, l2 = 0.88, l3 = 1.08 },
    surface_roughness = { l1 = 0.45, l2 = 0.68, l3 = 1.12 },
    anti_halation_bloom = { l1 = 0.75, l2 = 1.00, l3 = 1.35 },
    optical_bloom = { l1 = 0.75, l2 = 1.00, l3 = 1.35 },
    film_damage = { l1 = 0.65, l2 = 1.00, l3 = 1.30 },
}

local VALID_LEVEL_VALUES = {
    base = true,
    l1 = true,
    l2 = true,
    l3 = true,
}

local LEGACY_LEVEL_FALLBACK = {
    off = "base",
    soft = "l1",
    gentle = "l1",
    subtle = "l1",
    calm = "l1",
    refined = "l1",
    matte = "l1",
    fine = "l1",
    polished = "l1",
    smooth = "l1",
    tight = "l1",
    aged = "l1",

    medium = "l2",
    strong = "l2",
    precise = "l2",
    rich = "l2",
    dense = "l2",
    editorial = "l2",
    cine = "l2",
    raw = "l2",
    bold = "l2",
    organic = "l2",
    rough = "l2",
    luminous = "l2",
    large = "l2",

    aggressive = "l3",
    distressed = "l3",
}

local FORMAT_GRAIN_FACTORS = {
    ["35mm"] = { GrainAmount = 1.00, GrainSize = 1.00, GrainFrequency = 1.00 },
    ["mf_120"] = { GrainAmount = 0.88, GrainSize = 0.95, GrainFrequency = 0.92 },
    ["lf_4x5"] = { GrainAmount = 0.76, GrainSize = 0.88, GrainFrequency = 0.84 },
    ["lf_8x10"] = { GrainAmount = 0.70, GrainSize = 0.84, GrainFrequency = 0.80 },
}

local EFFECTS = {
    integral_masking = {
        l1 = {
            { key = "Temperature", delta = 120, min = 2000, max = 50000, skipIfGrayscale = true },
            { key = "Tint", delta = 4, min = -150, max = 150, skipIfGrayscale = true },
            { key = "Vibrance", delta = 8, min = -100, max = 100, skipIfGrayscale = true },
            { key = "Saturation", delta = 5, min = -100, max = 100, skipIfGrayscale = true },
            { key = "Dehaze", delta = 2, min = -50, max = 50 },
        },
        l2 = {
            -- Deliberately stronger split versus l1: user reported l2 looked too close.
            { key = "Temperature", delta = 260, min = 2000, max = 50000, skipIfGrayscale = true },
            { key = "Tint", delta = 8, min = -150, max = 150, skipIfGrayscale = true },
            { key = "Vibrance", delta = 16, min = -100, max = 100, skipIfGrayscale = true },
            { key = "Saturation", delta = 10, min = -100, max = 100, skipIfGrayscale = true },
            { key = "Dehaze", delta = 8, min = -50, max = 50 },
            { key = "Contrast2012", delta = 4, min = -100, max = 100 },
        },
        l3 = {
            { key = "Temperature", delta = 420, min = 2000, max = 50000, skipIfGrayscale = true },
            { key = "Tint", delta = 12, min = -150, max = 150, skipIfGrayscale = true },
            { key = "Vibrance", delta = 24, min = -100, max = 100, skipIfGrayscale = true },
            { key = "Saturation", delta = 16, min = -100, max = 100, skipIfGrayscale = true },
            { key = "Dehaze", delta = 12, min = -50, max = 50 },
            { key = "Contrast2012", delta = 7, min = -100, max = 100 },
            { key = "Highlights2012", delta = -4, min = -100, max = 100 },
        },
        soft = {
            { key = "Temperature", delta = -220, min = 2000, max = 50000, skipIfGrayscale = true },
            { key = "Tint", delta = -6, min = -150, max = 150, skipIfGrayscale = true },
            { key = "Vibrance", delta = -12, min = -100, max = 100, skipIfGrayscale = true },
            { key = "Saturation", delta = -8, min = -100, max = 100, skipIfGrayscale = true },
        },
        rich = {
            { key = "Temperature", delta = 220, min = 2000, max = 50000, skipIfGrayscale = true },
            { key = "Tint", delta = 6, min = -150, max = 150, skipIfGrayscale = true },
            { key = "Vibrance", delta = 12, min = -100, max = 100, skipIfGrayscale = true },
            { key = "Saturation", delta = 8, min = -100, max = 100, skipIfGrayscale = true },
            { key = "Dehaze", delta = 6, min = -50, max = 50 },
        },
    },
    d_min = {
        soft = {
            { key = "Blacks2012", delta = 14, min = -100, max = 100 },
            { key = "Shadows2012", delta = 12, min = -100, max = 100 },
            { key = "Contrast2012", delta = -8, min = -100, max = 100 },
            { key = "Dehaze", delta = -6, min = -50, max = 50 },
        },
        measured = {
            { key = "Blacks2012", delta = -8, min = -100, max = 100 },
            { key = "Shadows2012", delta = -5, min = -100, max = 100 },
            { key = "Contrast2012", delta = 4, min = -100, max = 100 },
            { key = "Dehaze", delta = 3, min = -50, max = 50 },
        },
        precise = {
            { key = "Blacks2012", delta = -16, min = -100, max = 100 },
            { key = "Shadows2012", delta = -10, min = -100, max = 100 },
            { key = "Contrast2012", delta = 8, min = -100, max = 100 },
            { key = "Dehaze", delta = 6, min = -50, max = 50 },
        },
        anchored = {
            { key = "Blacks2012", delta = -24, min = -100, max = 100 },
            { key = "Shadows2012", delta = -14, min = -100, max = 100 },
            { key = "Contrast2012", delta = 12, min = -100, max = 100 },
            { key = "Dehaze", delta = 8, min = -50, max = 50 },
        },
    },
    d_max = {
        extended = {
            -- Keep D-Max distinct: this is primarily a highlight ceiling control.
            { key = "Highlights2012", delta = 5, min = -100, max = 100 },
            { key = "Whites2012", delta = 4, min = -100, max = 100 },
        },
        restrained = {
            { key = "Highlights2012", delta = -3, min = -100, max = 100 },
            { key = "Whites2012", delta = -2, min = -100, max = 100 },
        },
        clipped = {
            { key = "Highlights2012", delta = -6, min = -100, max = 100 },
            { key = "Whites2012", delta = -5, min = -100, max = 100 },
        },
        compressed = {
            { key = "Highlights2012", delta = -10, min = -100, max = 100 },
            { key = "Whites2012", delta = -8, min = -100, max = 100 },
            { key = "Contrast2012", delta = 2, min = -100, max = 100 },
        },
    },
    hd_curve = {
        soft = {
            -- Characteristic curve: toe/shoulder feel, not a D-Max ceiling.
            { key = "Contrast2012", delta = -5, min = -100, max = 100 },
            { key = "Shadows2012", delta = 9, min = -100, max = 100 },
            { key = "Blacks2012", delta = 6, min = -100, max = 100 },
            { key = "Highlights2012", delta = -4, min = -100, max = 100 },
        },
        shaped = {
            -- Poziom I: lekki S z miękkim ramieniem w światłach (łatwiej odróżnić od „dense”).
            { key = "Contrast2012", delta = 3, min = -100, max = 100 },
            { key = "Shadows2012", delta = -3, min = -100, max = 100 },
            { key = "Blacks2012", delta = -3, min = -100, max = 100 },
            { key = "Highlights2012", delta = -3, min = -100, max = 100 },
            { key = "Whites2012", delta = -2, min = -100, max = 100 },
        },
        dense = {
            { key = "Contrast2012", delta = 7, min = -100, max = 100 },
            { key = "Shadows2012", delta = -7, min = -100, max = 100 },
            { key = "Blacks2012", delta = -6, min = -100, max = 100 },
            { key = "Highlights2012", delta = -6, min = -100, max = 100 },
        },
        cinematic = {
            { key = "Contrast2012", delta = 10, min = -100, max = 100 },
            { key = "Shadows2012", delta = -10, min = -100, max = 100 },
            { key = "Blacks2012", delta = -9, min = -100, max = 100 },
            { key = "Highlights2012", delta = -8, min = -100, max = 100 },
            { key = "Whites2012", delta = -5, min = -100, max = 100 },
        },
    },
    mtf_response = {
        calm = {
            { key = "Clarity2012", delta = -14, min = -100, max = 100 },
            { key = "Texture", delta = -10, min = -100, max = 100 },
            { key = "Dehaze", delta = -4, min = -50, max = 50 },
        },
        measured = {
            { key = "Clarity2012", delta = 10, min = -100, max = 100 },
            { key = "Texture", delta = 8, min = -100, max = 100 },
            { key = "Dehaze", delta = 2, min = -50, max = 50 },
        },
        editorial = {
            { key = "Clarity2012", delta = 21, min = -100, max = 100 },
            { key = "Texture", delta = 16, min = -100, max = 100 },
            { key = "Dehaze", delta = 6, min = -50, max = 50 },
        },
        etched = {
            { key = "Clarity2012", delta = 27, min = -100, max = 100 },
            { key = "Texture", delta = 20, min = -100, max = 100 },
            { key = "Dehaze", delta = 8, min = -50, max = 50 },
        },
    },
    -- Reciprocity failure / Schwarzschild tail: lift & fog model via tone controls only (neutral at base).
    reciprocity_tail = {
        brief = {
            { key = "Shadows2012", delta = 6, min = -100, max = 100 },
            { key = "Blacks2012", delta = 5, min = -100, max = 100 },
            { key = "Contrast2012", delta = -3, min = -100, max = 100 },
            { key = "Dehaze", delta = -3, min = -50, max = 50 },
            { key = "Clarity2012", delta = -2, min = -100, max = 100 },
            { key = "Texture", delta = -1, min = -100, max = 100 },
        },
        prolonged = {
            { key = "Shadows2012", delta = 9, min = -100, max = 100 },
            { key = "Blacks2012", delta = 8, min = -100, max = 100 },
            { key = "Contrast2012", delta = -5, min = -100, max = 100 },
            { key = "Dehaze", delta = -5, min = -50, max = 50 },
            { key = "Clarity2012", delta = -3, min = -100, max = 100 },
            { key = "Texture", delta = -2, min = -100, max = 100 },
        },
        extreme = {
            { key = "Shadows2012", delta = 12, min = -100, max = 100 },
            { key = "Blacks2012", delta = 10, min = -100, max = 100 },
            { key = "Contrast2012", delta = -7, min = -100, max = 100 },
            { key = "Dehaze", delta = -7, min = -50, max = 50 },
            { key = "Clarity2012", delta = -5, min = -100, max = 100 },
            { key = "Texture", delta = -3, min = -100, max = 100 },
        },
    },
    ssg_grain = {
        refined = {
            { key = "GrainAmount", delta = 9, min = 0, max = 100 },
            { key = "GrainSize", delta = 2, min = 0, max = 100 },
            { key = "GrainFrequency", delta = 6, min = 0, max = 100 },
            { key = "Clarity2012", delta = -4, min = -100, max = 100 },
            { key = "Texture", delta = -4, min = -100, max = 100 },
            { key = "Blacks2012", delta = 1, min = -100, max = 100 },
        },
        balanced = {
            { key = "GrainAmount", delta = 15, min = 0, max = 100 },
            { key = "GrainSize", delta = 5, min = 0, max = 100 },
            { key = "GrainFrequency", delta = 11, min = 0, max = 100 },
            { key = "Clarity2012", delta = -5, min = -100, max = 100 },
            { key = "Texture", delta = -5, min = -100, max = 100 },
            { key = "Blacks2012", delta = 2, min = -100, max = 100 },
        },
        raw = {
            { key = "GrainAmount", delta = 22, min = 0, max = 100 },
            { key = "GrainSize", delta = 8, min = 0, max = 100 },
            { key = "GrainFrequency", delta = 17, min = 0, max = 100 },
            { key = "Clarity2012", delta = -7, min = -100, max = 100 },
            { key = "Texture", delta = -7, min = -100, max = 100 },
            { key = "Blacks2012", delta = 4, min = -100, max = 100 },
        },
    },
    photon_scattering = {
        soft = {
            { key = "Highlights2012", delta = -12, min = -100, max = 100 },
            { key = "Whites2012", delta = -9, min = -100, max = 100 },
            { key = "Clarity2012", delta = -10, min = -100, max = 100 },
            { key = "Texture", delta = -5, min = -100, max = 100 },
            { key = "Dehaze", delta = -5, min = -50, max = 50 },
            { key = "Contrast2012", delta = -4, min = -100, max = 100 },
        },
        cine = {
            { key = "Highlights2012", delta = -18, min = -100, max = 100 },
            { key = "Whites2012", delta = -13, min = -100, max = 100 },
            { key = "Clarity2012", delta = -14, min = -100, max = 100 },
            { key = "Texture", delta = -7, min = -100, max = 100 },
            { key = "Dehaze", delta = -8, min = -50, max = 50 },
            { key = "Contrast2012", delta = -5, min = -100, max = 100 },
        },
        diffuse = {
            { key = "Highlights2012", delta = -24, min = -100, max = 100 },
            { key = "Whites2012", delta = -18, min = -100, max = 100 },
            { key = "Clarity2012", delta = -18, min = -100, max = 100 },
            { key = "Texture", delta = -9, min = -100, max = 100 },
            { key = "Dehaze", delta = -10, min = -50, max = 50 },
            { key = "Contrast2012", delta = -6, min = -100, max = 100 },
        },
    },
    mackie_lines = {
        matte = {
            { key = "Blacks2012", delta = 16, min = -100, max = 100 },
            { key = "Contrast2012", delta = -10, min = -100, max = 100 },
            { key = "Texture", delta = -6, min = -100, max = 100 },
            { key = "Clarity2012", delta = -6, min = -100, max = 100 },
        },
        subtle = {
            { key = "Whites2012", delta = 6, min = -100, max = 100 },
            { key = "Highlights2012", delta = 4, min = -100, max = 100 },
            { key = "Contrast2012", delta = 4, min = -100, max = 100 },
            { key = "Clarity2012", delta = 8, min = -100, max = 100 },
            { key = "Texture", delta = 6, min = -100, max = 100 },
        },
        luminous = {
            { key = "Whites2012", delta = 14, min = -100, max = 100 },
            { key = "Highlights2012", delta = 10, min = -100, max = 100 },
            { key = "Contrast2012", delta = 8, min = -100, max = 100 },
            { key = "Clarity2012", delta = 16, min = -100, max = 100 },
            { key = "Texture", delta = 12, min = -100, max = 100 },
        },
        etched = {
            { key = "Whites2012", delta = 18, min = -100, max = 100 },
            { key = "Highlights2012", delta = 14, min = -100, max = 100 },
            { key = "Contrast2012", delta = 10, min = -100, max = 100 },
            { key = "Clarity2012", delta = 22, min = -100, max = 100 },
            { key = "Texture", delta = 16, min = -100, max = 100 },
            { key = "Blacks2012", delta = -4, min = -100, max = 100 },
        },
    },
    grain_rms = {
        fine = {
            { key = "GrainAmount", delta = 10, min = 14, max = 100 },
            { key = "GrainSize", delta = 1, min = 8, max = 100 },
            { key = "GrainFrequency", delta = 8, min = 18, max = 100 },
            { key = "Texture", delta = 2, min = -100, max = 100 },
        },
        neutral = {
            { key = "GrainAmount", delta = 12, min = 12, max = 100 },
            { key = "GrainSize", delta = 3, min = 8, max = 100 },
            { key = "GrainFrequency", delta = 9, min = 18, max = 100 },
            { key = "Texture", delta = 4, min = -100, max = 100 },
        },
        bold = {
            { key = "GrainAmount", delta = 16, min = 8, max = 100 },
            { key = "GrainSize", delta = 7, min = 8, max = 100 },
            { key = "GrainFrequency", delta = 11, min = 18, max = 100 },
        },
    },
    grain_clumping = {
        smooth = {
            { key = "GrainAmount", delta = 10, min = 10, max = 100 },
            { key = "GrainFrequency", delta = 10, min = 18, max = 100 },
            { key = "Texture", delta = 5, min = -100, max = 100 },
            { key = "Clarity2012", delta = 2, min = -100, max = 100 },
        },
        organic = {
            { key = "GrainAmount", delta = 12, min = 8, max = 100 },
            { key = "GrainFrequency", delta = 18, min = 18, max = 100 },
            { key = "Texture", delta = 9, min = -100, max = 100 },
            { key = "Clarity2012", delta = 3, min = -100, max = 100 },
        },
        broken = {
            { key = "GrainAmount", delta = 12, min = 8, max = 100 },
            { key = "GrainFrequency", delta = 22, min = 18, max = 100 },
            { key = "Texture", delta = 10, min = -100, max = 100 },
            { key = "Clarity2012", delta = 4, min = -100, max = 100 },
        },
    },
    crystal_size = {
        tight = {
            { key = "GrainAmount", delta = 6, min = 8, max = 100 },
            { key = "GrainSize", delta = -2, min = 8, max = 100 },
            { key = "GrainFrequency", delta = 5, min = 18, max = 100 },
            { key = "Texture", delta = -1, min = -100, max = 100 },
        },
        neutral = {
            { key = "GrainAmount", delta = 6, min = 8, max = 100 },
            { key = "GrainSize", delta = 1, min = 8, max = 100 },
            { key = "Texture", delta = 0, min = -100, max = 100 },
        },
        large = {
            { key = "GrainAmount", delta = 8, min = 8, max = 100 },
            { key = "GrainSize", delta = 8, min = 8, max = 100 },
            { key = "Texture", delta = 2, min = -100, max = 100 },
        },
    },
    -- Lightroom Effects › Grain › Roughness maps to crs:GrainFrequency only (neutral at base / Reset).
    grain_lr_roughness = {
        silk = {
            { key = "GrainFrequency", delta = -6, min = 18, max = 100 },
        },
        natural = {
            { key = "GrainFrequency", delta = 5, min = 18, max = 100 },
        },
        coarse = {
            { key = "GrainFrequency", delta = 11, min = 18, max = 100 },
        },
    },
    surface_roughness = {
        polished = {
            { key = "Texture", delta = -14, min = -100, max = 100 },
            { key = "Clarity2012", delta = -10, min = -100, max = 100 },
            { key = "Dehaze", delta = -4, min = -50, max = 50 },
        },
        satin = {
            { key = "Texture", delta = 8, min = -100, max = 100 },
            { key = "Clarity2012", delta = 4, min = -100, max = 100 },
            { key = "Dehaze", delta = 1, min = -50, max = 50 },
        },
        rough = {
            { key = "Texture", delta = 16, min = -100, max = 100 },
            { key = "Clarity2012", delta = 10, min = -100, max = 100 },
            { key = "Dehaze", delta = 4, min = -50, max = 50 },
        },
        toothed = {
            { key = "Texture", delta = 22, min = -100, max = 100 },
            { key = "Clarity2012", delta = 14, min = -100, max = 100 },
            { key = "Dehaze", delta = 6, min = -50, max = 50 },
        },
    },
    anti_halation_bloom = {
        soft = {
            { key = "Highlights2012", delta = -16, min = -100, max = 100 },
            { key = "Whites2012", delta = -12, min = -100, max = 100 },
            { key = "Dehaze", delta = -6, min = -50, max = 50 },
            { key = "Clarity2012", delta = -6, min = -100, max = 100 },
        },
        strong = {
            { key = "Highlights2012", delta = -24, min = -100, max = 100 },
            { key = "Whites2012", delta = -18, min = -100, max = 100 },
            { key = "Dehaze", delta = -10, min = -50, max = 50 },
            { key = "Clarity2012", delta = -10, min = -100, max = 100 },
        },
        bleeding = {
            { key = "Highlights2012", delta = -30, min = -100, max = 100 },
            { key = "Whites2012", delta = -22, min = -100, max = 100 },
            { key = "Dehaze", delta = -12, min = -50, max = 50 },
            { key = "Clarity2012", delta = -12, min = -100, max = 100 },
            { key = "Texture", delta = -4, min = -100, max = 100 },
        },
    },
    optical_bloom = {
        soft = {
            { key = "Clarity2012", delta = -10, min = -100, max = 100 },
            { key = "Texture", delta = -8, min = -100, max = 100 },
            { key = "Dehaze", delta = -6, min = -50, max = 50 },
            { key = "Highlights2012", delta = -8, min = -100, max = 100 },
            { key = "Vibrance", delta = 3, min = -100, max = 100, skipIfGrayscale = true },
        },
        cine = {
            { key = "Clarity2012", delta = -18, min = -100, max = 100 },
            { key = "Texture", delta = -12, min = -100, max = 100 },
            { key = "Dehaze", delta = -10, min = -50, max = 50 },
            { key = "Highlights2012", delta = -14, min = -100, max = 100 },
            { key = "Whites2012", delta = -8, min = -100, max = 100 },
            { key = "Vibrance", delta = 5, min = -100, max = 100, skipIfGrayscale = true },
        },
        halated = {
            { key = "Clarity2012", delta = -24, min = -100, max = 100 },
            { key = "Texture", delta = -16, min = -100, max = 100 },
            { key = "Dehaze", delta = -12, min = -50, max = 50 },
            { key = "Highlights2012", delta = -18, min = -100, max = 100 },
            { key = "Whites2012", delta = -10, min = -100, max = 100 },
            { key = "Vibrance", delta = 6, min = -100, max = 100, skipIfGrayscale = true },
        },
    },
    film_damage = {
        aged = {
            { key = "Blacks2012", delta = 10, min = -100, max = 100 },
            { key = "Contrast2012", delta = -8, min = -100, max = 100 },
            { key = "Highlights2012", delta = -10, min = -100, max = 100 },
            { key = "Whites2012", delta = -8, min = -100, max = 100 },
            { key = "Dehaze", delta = -4, min = -50, max = 50 },
            { key = "Temperature", delta = 140, min = 2000, max = 50000, skipIfGrayscale = true },
            { key = "Vibrance", delta = -4, min = -100, max = 100, skipIfGrayscale = true },
            { key = "Saturation", delta = -4, min = -100, max = 100, skipIfGrayscale = true },
        },
        weathered = {
            { key = "Blacks2012", delta = 12, min = -100, max = 100 },
            { key = "Contrast2012", delta = -10, min = -100, max = 100 },
            { key = "Highlights2012", delta = -13, min = -100, max = 100 },
            { key = "Whites2012", delta = -10, min = -100, max = 100 },
            { key = "Clarity2012", delta = -4, min = -100, max = 100 },
            { key = "Dehaze", delta = -6, min = -50, max = 50 },
            { key = "Temperature", delta = 180, min = 2000, max = 50000, skipIfGrayscale = true },
            { key = "Tint", delta = -2, min = -150, max = 150, skipIfGrayscale = true },
            { key = "Vibrance", delta = -5, min = -100, max = 100, skipIfGrayscale = true },
            { key = "Saturation", delta = -6, min = -100, max = 100, skipIfGrayscale = true },
        },
        distressed = {
            { key = "Blacks2012", delta = 14, min = -100, max = 100 },
            { key = "Contrast2012", delta = -12, min = -100, max = 100 },
            { key = "Highlights2012", delta = -16, min = -100, max = 100 },
            { key = "Whites2012", delta = -12, min = -100, max = 100 },
            { key = "Clarity2012", delta = -8, min = -100, max = 100 },
            { key = "Dehaze", delta = -8, min = -50, max = 50 },
            { key = "Temperature", delta = 220, min = 2000, max = 50000, skipIfGrayscale = true },
            { key = "Tint", delta = -4, min = -150, max = 150, skipIfGrayscale = true },
            { key = "Vibrance", delta = -6, min = -100, max = 100, skipIfGrayscale = true },
            { key = "Saturation", delta = -8, min = -100, max = 100, skipIfGrayscale = true },
        },
    },
}

local function roundNearest(value)
    if value >= 0 then
        return math.floor(value + 0.5)
    end
    return math.ceil(value - 0.5)
end

local function clampRange(value, minValue, maxValue)
    if value < minValue then
        return minValue
    end
    if value > maxValue then
        return maxValue
    end
    return value
end

local function formatFactor(formatId, key)
    local factors = FORMAT_GRAIN_FACTORS[tostring(formatId or "35mm")] or FORMAT_GRAIN_FACTORS["35mm"]
    return tonumber(factors[key]) or 1.0
end

local function scaledDelta(controlKey, key, delta, formatId, levelStrength)
    local factor = 1.0
    if key == "GrainAmount" or key == "GrainSize" or key == "GrainFrequency" then
        factor = formatFactor(formatId, key)
    end
    local controlFactor = tonumber(CONTROL_SCALE_OVERRIDES[controlKey]) or 1.0
    local levelFactor = tonumber(levelStrength) or 1.0
    return delta * EFFECT_SCALE * controlFactor * factor * levelFactor
end

local function differs(currentValue, defaultValue)
    return tostring(currentValue or "") ~= tostring(defaultValue or "")
end

local function normalizeControlValue(controlKey, value)
    local normalized = tostring(value or "")
    if normalized == "" then
        return "base"
    end
    if VALID_LEVEL_VALUES[normalized] then
        return normalized
    end

    local mapped = LEGACY_LEVEL_FALLBACK[normalized]
    if mapped then
        return mapped
    end

    local levelMap = CONTROL_LEVEL_MAP[controlKey] or {}
    if normalized == levelMap[1] then
        return "l1"
    end
    if normalized == levelMap[2] then
        return "l2"
    end
    if normalized == levelMap[3] then
        return "l3"
    end

    return "base"
end

M.normalizeControlValue = normalizeControlValue

function M.controlsFromSource(getValueFn)
    local controls = {}
    for key, defaultValue in pairs(M.DEFAULTS) do
        local value = getValueFn(key)
        if value == nil or value == "" then
            value = defaultValue
        end
        controls[key] = normalizeControlValue(key, value)
    end

    local activeFieldNames = {
        ii = "panelIIActive",
        iii = "panelIIIActive",
        iv = "panelIVActive",
    }

    for panelKey, keyList in pairs(M.PANEL_KEYS) do
        local active = false
        for _, key in ipairs(keyList) do
            if differs(controls[key], M.DEFAULTS[key]) then
                active = true
                break
            end
        end
        controls[activeFieldNames[panelKey]] = active
    end

    controls.anyActive = controls.panelIIActive or controls.panelIIIActive or controls.panelIVActive
    return controls
end

function M.controlsFromPrefs(prefs, prefix)
    local prefPrefix = tostring(prefix or "panel_iiv_")
    return M.controlsFromSource(function(key)
        return prefs[prefPrefix .. key]
    end)
end

function M.controlsFromProps(props)
    return M.controlsFromSource(function(key)
        return props[key]
    end)
end

function M.applyToSettings(settings, controls, options)
    if not controls or not controls.anyActive then
        return false, 0, settings or {}
    end

    local output = {}
    for key, value in pairs(settings or {}) do
        output[key] = value
    end

    local baseline = (options and options.baselineSettings) or settings or {}
    local isGrayscale = options and options.isGrayscale == true
    local formatId = options and options.formatId or "35mm"
    local touched = 0

    local function addDelta(controlKey, effect, levelStrength)
        if isGrayscale and effect.skipIfGrayscale then
            return
        end
        local delta = tonumber(effect.delta)
        if not delta or delta == 0 then
            return
        end

        local key = tostring(effect.key)
        local current = tonumber(output[key])
        if current == nil then
            current = tonumber(baseline[key])
        end
        if current == nil then
            if key == "Temperature" or key == "Tint" then
                return
            end
            current = 0
        end

        local merged = current + scaledDelta(controlKey, key, delta, formatId, levelStrength)
        local minValue = tonumber(effect.min) or -100
        local maxValue = tonumber(effect.max) or 100
        local rounded = roundNearest(clampRange(merged, minValue, maxValue))
        output[key] = rounded
        touched = touched + 1
    end

    local allowedControl = nil
    if options and type(options.panelKeys) == "table" then
        allowedControl = {}
        for _, key in ipairs(options.panelKeys) do
            allowedControl[tostring(key)] = true
        end
    end

    for controlKey, variants in pairs(EFFECTS) do
        if allowedControl == nil or allowedControl[controlKey] == true then
            local value = tostring(controls[controlKey] or "base")
            local variantKey = value
            local levelStrength = 1.0

            if value == "l1" or value == "l2" or value == "l3" then
                local levelMap = CONTROL_LEVEL_MAP[controlKey] or {}
                if value == "l1" then
                    variantKey = levelMap[1] or "base"
                elseif value == "l2" then
                    variantKey = levelMap[2] or levelMap[1] or "base"
                else
                    variantKey = levelMap[3] or levelMap[2] or levelMap[1] or "base"
                end
                local strengthMap = CONTROL_LEVEL_STRENGTH[controlKey] or LEVEL_STRENGTH
                levelStrength = strengthMap[value] or LEVEL_STRENGTH[value] or 1.0
            end

            for _, effect in ipairs(variants[variantKey] or {}) do
                addDelta(controlKey, effect, levelStrength)
            end
        end
    end

    return touched > 0, touched, output
end

return M
