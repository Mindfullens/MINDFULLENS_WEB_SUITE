local M = {}

local function curve(points)
    local out = {}
    for _, pair in ipairs(points) do
        out[#out + 1] = string.format("%d, %d", pair[1], pair[2])
    end
    return out
end

M.optics = {
    halation = {
        soft = {
            Texture = -10,
            Clarity2012 = -15,
            Dehaze = -2,
            Highlights2012 = -6,
            Whites2012 = 4,
            ColorGradeHighlightsHue = 20,
            ColorGradeHighlightsSat = 10,
            ColorGradeMidtoneHue = 25,
            ColorGradeMidtoneSat = 4,
            ColorGradeBlending = 70,
            ColorGradeBalance = 20,
        },
        strong = {
            Texture = -20,
            Clarity2012 = -35,
            Dehaze = -4,
            Highlights2012 = -12,
            Whites2012 = 8,
            Exposure2012 = 0.15,
            ColorGradeHighlightsHue = 18,
            ColorGradeHighlightsSat = 18,
            ColorGradeMidtoneHue = 22,
            ColorGradeMidtoneSat = 6,
            ColorGradeBlending = 75,
            ColorGradeBalance = 25,
        },
    },
    bloom = {
        soft = {
            Clarity2012 = -20,
            Dehaze = -10,
            Highlights2012 = -12,
            Whites2012 = 10,
            Texture = -8,
        },
        strong = {
            Clarity2012 = -35,
            Dehaze = -18,
            Highlights2012 = -20,
            Whites2012 = 18,
            Texture = -14,
        },
    },
}

M.grain = {
    g35_soft = { GrainAmount = 38, GrainSize = 34, GrainFrequency = 52 },
    g35_strong = { GrainAmount = 45, GrainSize = 38, GrainFrequency = 55 },
    g120_soft = { GrainAmount = 24, GrainSize = 20, GrainFrequency = 40 },
    g120_strong = { GrainAmount = 30, GrainSize = 24, GrainFrequency = 42 },
    rough_soft = { GrainAmount = 62, GrainSize = 58, GrainFrequency = 68 },
    rough_strong = { GrainAmount = 72, GrainSize = 66, GrainFrequency = 75 },
}

M.prep = {
    defringe = {
        soft = {
            AutoLateralCA = 1,
            DefringePurpleAmount = 3,
            DefringePurpleHueLo = 28,
            DefringePurpleHueHi = 72,
            DefringeGreenAmount = 3,
            DefringeGreenHueLo = 40,
            DefringeGreenHueHi = 65,
        },
        strong = {
            AutoLateralCA = 1,
            DefringePurpleAmount = 10,
            DefringePurpleHueLo = 26,
            DefringePurpleHueHi = 74,
            DefringeGreenAmount = 10,
            DefringeGreenHueLo = 38,
            DefringeGreenHueHi = 70,
        },
    },
}

M.print_media = {
    soft = {
        ToneCurveName2012 = "Custom",
        ToneCurvePV2012 = curve({ {0, 20}, {64, 64}, {128, 128}, {192, 192}, {255, 230} }),
    },
    medium = {
        ToneCurveName2012 = "Custom",
        ToneCurvePV2012 = curve({ {0, 8}, {64, 58}, {128, 128}, {192, 205}, {255, 247} }),
    },
    strong = {
        ToneCurveName2012 = "Custom",
        ToneCurvePV2012 = curve({ {0, 0}, {32, 12}, {96, 80}, {160, 190}, {224, 240}, {255, 255} }),
    },
}

M.print_tones = {
    c41 = {
        soft = {
            ColorGradeShadowsHue = 155,
            ColorGradeShadowsSat = 8,
            ColorGradeShadowsLum = 5,
            ColorGradeMidtoneHue = 40,
            ColorGradeMidtoneSat = 12,
            ColorGradeHighlightsHue = 50,
            ColorGradeHighlightsSat = 8,
            ColorGradeHighlightsLum = -4,
            ColorGradeBlending = 70,
            ColorGradeBalance = -12,
        },
        strong = {
            ColorGradeShadowsHue = 160,
            ColorGradeShadowsSat = 12,
            ColorGradeShadowsLum = 6,
            ColorGradeMidtoneHue = 42,
            ColorGradeMidtoneSat = 16,
            ColorGradeHighlightsHue = 52,
            ColorGradeHighlightsSat = 12,
            ColorGradeHighlightsLum = -6,
            ColorGradeBlending = 75,
            ColorGradeBalance = -15,
        },
    },
    ecn2 = {
        soft = {
            ColorGradeShadowsHue = 220,
            ColorGradeShadowsSat = 15,
            ColorGradeShadowsLum = -5,
            ColorGradeMidtoneHue = 30,
            ColorGradeMidtoneSat = 5,
            ColorGradeHighlightsHue = 20,
            ColorGradeHighlightsSat = 12,
            ColorGradeBlending = 70,
            ColorGradeBalance = 12,
        },
        strong = {
            ColorGradeShadowsHue = 225,
            ColorGradeShadowsSat = 20,
            ColorGradeShadowsLum = -6,
            ColorGradeMidtoneHue = 30,
            ColorGradeMidtoneSat = 8,
            ColorGradeHighlightsHue = 22,
            ColorGradeHighlightsSat = 18,
            ColorGradeBlending = 75,
            ColorGradeBalance = 15,
        },
    },
    e6 = {
        soft = {
            ColorGradeShadowsHue = 250,
            ColorGradeShadowsSat = 12,
            ColorGradeShadowsLum = -10,
            ColorGradeMidtoneHue = 310,
            ColorGradeMidtoneSat = 6,
            ColorGradeHighlightsHue = 210,
            ColorGradeHighlightsSat = 4,
            ColorGradeHighlightsLum = 10,
            ColorGradeBlending = 70,
            ColorGradeBalance = 15,
        },
        strong = {
            ColorGradeShadowsHue = 255,
            ColorGradeShadowsSat = 16,
            ColorGradeShadowsLum = -12,
            ColorGradeMidtoneHue = 315,
            ColorGradeMidtoneSat = 8,
            ColorGradeHighlightsHue = 210,
            ColorGradeHighlightsSat = 6,
            ColorGradeHighlightsLum = 12,
            ColorGradeBlending = 75,
            ColorGradeBalance = 18,
        },
    },
}

M.calibration = {
    kodak = {
        soft = {
            ShadowTint = 10,
            RedHue = 18,
            RedSaturation = -8,
            GreenHue = -15,
            GreenSaturation = -12,
            BlueHue = -20,
            BlueSaturation = 22,
        },
        strong = {
            ShadowTint = 15,
            RedHue = 24,
            RedSaturation = -12,
            GreenHue = -22,
            GreenSaturation = -18,
            BlueHue = -28,
            BlueSaturation = 30,
        },
    },
    fuji = {
        soft = {
            ShadowTint = 8,
            RedHue = 8,
            RedSaturation = -12,
            GreenHue = 28,
            GreenSaturation = 6,
            BlueHue = -18,
            BlueSaturation = 22,
        },
        strong = {
            ShadowTint = 12,
            RedHue = 10,
            RedSaturation = -18,
            GreenHue = 38,
            GreenSaturation = 10,
            BlueHue = -26,
            BlueSaturation = 30,
        },
    },
}

M.hsl = {
    skin = {
        soft = {
            HueAdjustmentRed = 6,
            HueAdjustmentOrange = 2,
            SaturationAdjustmentRed = -10,
            SaturationAdjustmentOrange = -10,
            LuminanceAdjustmentOrange = 12,
        },
        strong = {
            HueAdjustmentRed = 10,
            HueAdjustmentOrange = 5,
            SaturationAdjustmentRed = -15,
            SaturationAdjustmentOrange = -15,
            LuminanceAdjustmentOrange = 20,
        },
    },
    greens = {
        soft = {
            HueAdjustmentYellow = -12,
            HueAdjustmentGreen = 15,
            SaturationAdjustmentYellow = -20,
            SaturationAdjustmentGreen = -35,
            LuminanceAdjustmentGreen = -12,
        },
        strong = {
            HueAdjustmentYellow = -15,
            HueAdjustmentGreen = 25,
            SaturationAdjustmentYellow = -25,
            SaturationAdjustmentGreen = -50,
            LuminanceAdjustmentGreen = -22,
        },
    },
    blues = {
        soft = {
            HueAdjustmentAqua = -12,
            HueAdjustmentBlue = -12,
            SaturationAdjustmentBlue = -20,
            LuminanceAdjustmentBlue = -20,
        },
        strong = {
            HueAdjustmentAqua = -18,
            HueAdjustmentBlue = -20,
            SaturationAdjustmentBlue = -30,
            LuminanceAdjustmentBlue = -30,
        },
    },
}

return M
