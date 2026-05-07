local M = {}

M.DEFAULT_MULTIPLIER = 2.0

local ZERO_CENTERED_100 = {
    Blacks2012 = true,
    BlueHue = true,
    BlueLuminance = true,
    BlueSaturation = true,
    Clarity2012 = true,
    ColorGradeBalance = true,
    Contrast2012 = true,
    Dehaze = true,
    GrayMixerBlue = true,
    GrayMixerGreen = true,
    GrayMixerOrange = true,
    GrayMixerRed = true,
    GrayMixerYellow = true,
    GreenHue = true,
    GreenLuminance = true,
    GreenSaturation = true,
    Highlights2012 = true,
    HueAdjustmentAqua = true,
    HueAdjustmentBlue = true,
    HueAdjustmentGreen = true,
    HueAdjustmentOrange = true,
    HueAdjustmentRed = true,
    HueAdjustmentYellow = true,
    LuminanceAdjustmentAqua = true,
    LuminanceAdjustmentBlue = true,
    LuminanceAdjustmentGreen = true,
    LuminanceAdjustmentOrange = true,
    LuminanceAdjustmentRed = true,
    LuminanceAdjustmentYellow = true,
    RedHue = true,
    RedLuminance = true,
    RedSaturation = true,
    Saturation = true,
    SaturationAdjustmentAqua = true,
    SaturationAdjustmentBlue = true,
    SaturationAdjustmentGreen = true,
    SaturationAdjustmentOrange = true,
    SaturationAdjustmentRed = true,
    SaturationAdjustmentYellow = true,
    ShadowTint = true,
    Shadows2012 = true,
    Texture = true,
    Vibrance = true,
    Whites2012 = true,
}

local ZERO_CENTERED_4 = {
    Exposure2012 = true,
}

local NON_NEGATIVE_100 = {
    ColorGradeBlending = true,
    ColorGradeGlobalSat = true,
    ColorGradeHighlightsSat = true,
    ColorGradeMidtoneSat = true,
    ColorGradeShadowsSat = true,
    GrainAmount = true,
    GrainFrequency = true,
    GrainSize = true,
    Sharpness = true,
    SplitToningHighlightSaturation = true,
    SplitToningShadowSaturation = true,
}

local LOCAL_KEYS = {
    LocalBlacks2012 = { min = -1.0, max = 1.0 },
    LocalBrightness = { min = -1.0, max = 1.0 },
    LocalClarity = { min = -1.0, max = 1.0 },
    LocalClarity2012 = { min = -1.0, max = 1.0 },
    LocalContrast = { min = -1.0, max = 1.0 },
    LocalContrast2012 = { min = -1.0, max = 1.0 },
    LocalDehaze = { min = -1.0, max = 1.0 },
    LocalExposure = { min = -5.0, max = 5.0 },
    LocalExposure2012 = { min = -5.0, max = 5.0 },
    LocalHighlights2012 = { min = -1.0, max = 1.0 },
    LocalSaturation = { min = -1.0, max = 1.0 },
    LocalShadows2012 = { min = -1.0, max = 1.0 },
    LocalSharpness = { min = 0.0, max = 1.0 },
    LocalTemperature = { min = -1.0, max = 1.0 },
    LocalTexture = { min = -1.0, max = 1.0 },
    LocalTint = { min = -1.0, max = 1.0 },
    LocalWhites2012 = { min = -1.0, max = 1.0 },
}

local function clamp(value, minValue, maxValue)
    if value < minValue then
        return minValue
    end
    if value > maxValue then
        return maxValue
    end
    return value
end

local function scaleForKey(key, value, multiplier)
    if ZERO_CENTERED_100[key] then
        return clamp(value * multiplier, -100.0, 100.0)
    end
    if ZERO_CENTERED_4[key] then
        return clamp(value * multiplier, -5.0, 5.0)
    end
    if NON_NEGATIVE_100[key] then
        return clamp(value * multiplier, 0.0, 100.0)
    end
    local localRange = LOCAL_KEYS[key]
    if localRange then
        return clamp(value * multiplier, localRange.min, localRange.max)
    end
    return value
end

function M.scale(settings, multiplier)
    local appliedMultiplier = tonumber(multiplier) or M.DEFAULT_MULTIPLIER
    if not settings or appliedMultiplier == 1.0 then
        return settings
    end

    local scaled = {}
    for key, value in pairs(settings) do
        if type(value) == "number" then
            scaled[key] = scaleForKey(key, value, appliedMultiplier)
        else
            scaled[key] = value
        end
    end
    return scaled
end

return M
