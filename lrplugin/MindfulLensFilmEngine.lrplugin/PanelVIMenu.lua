-- Panel V — Komora Halacji, Powierzchnia i Defektow Analogowych
-- Suwaki 0-100 identyczne z webowym Film Lab.
-- Mapowanie na natywne suwaki LR:
--   chromAb  → HSL ×2 (moc przy 100): HueAdj Blue/Purple/Red + SatAdj Blue/Red (nie geometria jak na web)
--   bloom    → Texture/Clarity/Whites/Highlights + ColorGrade highlights (ciepła poświata)
--   halation → Texture/Clarity/Red+BlueSat + ColorGrade highlights (czerwona obwódka świateł)
--   anamorph → Whites/Highlights boost + Clarity ujemne + ColorGrade highlights niebieskie
--              (+50% moc vs wcześniej; bez natywnych pasm — tylko poświata HL)
-- Live preview: DevelopController w module Develop.
-- Zapis: catalogWrite.run -> photo:applyDevelopSettings (delty + absolut).

local LrApplication  = import "LrApplication"
local LrApplicationView = import "LrApplicationView"
local LrBinding      = import "LrBinding"
local LrDevelopController = import "LrDevelopController"
local LrDialogs      = import "LrDialogs"
local LrFunctionContext = import "LrFunctionContext"
local LrPathUtils    = import "LrPathUtils"
local LrPrefs        = import "LrPrefs"
local LrTasks        = import "LrTasks"
local LrView         = import "LrView"

local function pluginLoad(relativePath)
    return dofile(LrPathUtils.child(_PLUGIN.path, relativePath))
end

local logger         = pluginLoad("lib/Logger.lua")
local developPreview = pluginLoad("lib/DevelopPreview.lua")
local catalogWrite   = pluginLoad("lib/CatalogWrite.lua")
local panelRuntime   = pluginLoad("lib/PanelsRuntime.lua")
local opticalDyspersjaPreview = pluginLoad("lib/OpticalDyspersjaPreview.lua")

-- ──────────────────────────────────────────────────────────────────────────────
-- Sekcja "Powierzchnia, Bloom i Starzenie" — dawny Panel V (PanelsIIV target=iv).
-- Zachowujemy ten sam zestaw kluczy/poziomow i ten sam prefiks prefs `panel_iiv_`,
-- zeby silnik (EngineBridge / PanelsRuntime) nadal je rozpoznawal.
-- ──────────────────────────────────────────────────────────────────────────────

local LEGACY_PANELV_KEYS = panelRuntime.PANEL_KEYS.iv  -- photon_scattering, mackie_lines, surface_roughness, anti_halation_bloom, optical_bloom, film_damage
local LEGACY_PREF_PREFIX = "panel_iiv_"

local LEGACY_LEVEL_ITEMS = {
    { title = "Reset (0)",  value = "base" },
    { title = "Poziom I",   value = "l1" },
    { title = "Poziom II",  value = "l2" },
    { title = "Poziom III", value = "l3" },
}

local LEGACY_FIELDS = {
    { key = "photon_scattering",   label = "Rozpraszanie Fotonow",     note = "Wewnetrzne rozproszenie i halo swiatel." },
    { key = "mackie_lines",        label = "Linie Mackie / FDP",       note = "Kontrast krawedzi z lokalnego wyczerpania wywolywacza." },
    { key = "surface_roughness",   label = "Chropowatosc Powierzchni", note = "Mikrorelief powierzchni i odczuwalna akutanse." },
    { key = "anti_halation_bloom", label = "Bloom Antyhalacyjny",      note = "Przeciek bloom w warstwie antyhalacyjnej." },
    { key = "optical_bloom",       label = "Bloom Optyczny",           note = "Bloom optyczny niezalezny od warstwy antyhalacyjnej." },
    { key = "film_damage",         label = "Starzenie Materialu",      note = "Patyna i zuzycie materialu bez dublowania ziarna." },
}

-- ─────────────────────────────── defaults ────────────────────────────────────

-- Domyslne wartosci suwakow panelu.
-- halRadius / halThresh / streakLen: min zakresu = "wylaczone" dla silnika zewnetrznego.
local DEFAULTS = {
    chromAb           = 0,   -- Aberracja Barwna (LR/HSL – live preview)
    spectralSeparation = 0,  -- Optyczna Dyspersja (silnik separacji spektralnej)
    bloom             = 0,
    halation          = 0,
    halRadius         = 5,
    halThresh         = 120,
    halHue            = 0,
    anamorph          = 0,
    streakLen         = 10,
}

local RANGES = {
    chromAb           = { min = 0,    max = 100 },
    spectralSeparation = { min = 0,    max = 100 },
    bloom             = { min = 0,    max = 100 },
    halation          = { min = 0,    max = 100 },
    halRadius         = { min = 5,    max = 80  },
    halThresh         = { min = 120,  max = 250 },
    halHue            = { min = -100, max = 100 },
    anamorph          = { min = 0,    max = 100 },
    streakLen         = { min = 10,   max = 100 },
}

local SLIDER_KEYS = {
    "chromAb","spectralSeparation","bloom","halation","halRadius","halThresh","halHue","anamorph","streakLen",
}

-- Keys that get live-preview capture / restore (LR native params).
-- These match what buildDevelopSettings() may write.
local PREVIEW_KEYS = {
    "AutoLateralCA",
    "DefringePurpleAmount","DefringePurpleHueLo","DefringePurpleHueHi",
    "DefringeGreenAmount", "DefringeGreenHueLo", "DefringeGreenHueHi",
    "Texture","Clarity2012","Dehaze",
    "Highlights2012","Whites2012","Shadows2012",
    "Contrast2012","Blacks2012",
    "ColorGradeHighlightsHue","ColorGradeHighlightsSat",
    "ColorGradeMidtoneHue","ColorGradeMidtoneSat",
    "ColorGradeBlending","ColorGradeBalance",
    "RedSaturation","BlueSaturation",
    "SharpenRadius","SharpenDetail","SharpenEdgeMasking","SharpenAmount",
    "LuminanceSmoothing",
    -- chromAb — HSL-based colour-channel separation (visible on any photo)
    "HueAdjustmentBlue","HueAdjustmentPurple","HueAdjustmentRed",
    "SaturationAdjustmentBlue","SaturationAdjustmentRed",
    -- anamorph — highlight-streak approximation
    "LuminanceAdjustmentBlue",
    -- Powierzchnia/Bloom/Starzenie (legacy Panel V) — ziarno
    "GrainAmount","GrainSize","GrainFrequency",
}

local READBACK_ALIASES = {
    Clarity2012    = { "Clarity2012",    "Clarity"    },
    Highlights2012 = { "Highlights2012", "Highlights" },
    Shadows2012    = { "Shadows2012",    "Shadows"    },
    Whites2012     = { "Whites2012",     "Whites"     },
    -- HSL params mogą być raportowane pod obiema nazwami zależnie od wersji LR
    HueAdjustmentBlue    = { "HueAdjustmentBlue",    "HueBlue"    },
    HueAdjustmentRed     = { "HueAdjustmentRed",     "HueRed"     },
    HueAdjustmentPurple  = { "HueAdjustmentPurple",  "HuePurple"  },
    SaturationAdjustmentBlue = { "SaturationAdjustmentBlue", "SaturationBlue" },
    SaturationAdjustmentRed  = { "SaturationAdjustmentRed",  "SaturationRed"  },
}

-- ─────────────────────────────── helpers ─────────────────────────────────────

local function clamp(v, lo, hi)
    if v < lo then return lo end
    if v > hi then return hi end
    return v
end

local function round(v)
    if v >= 0 then return math.floor(v + 0.5) end
    return math.ceil(v - 0.5)
end

local function prefKey(name)
    return "panel5_" .. tostring(name)
end

local function legacyPrefKey(name)
    return "panel6_" .. tostring(name)
end

local function baselineFor(baseline, key)
    local direct = tonumber((baseline or {})[key])
    if direct ~= nil then return direct end
    local aliases = READBACK_ALIASES[key]
    if aliases then
        for _, alias in ipairs(aliases) do
            local v = tonumber((baseline or {})[alias])
            if v ~= nil then return v end
        end
    end
    return 0
end

-- ──────────────────── develop settings computation ───────────────────────────
-- Mapping derived from the existing XMP profiles + HSL channel-split approach:
--
--   bloom_strong.xmp  (100% bloom):
--     Texture=-10, Clarity2012=-22, Dehaze=-8, Highlights2012=-14,
--     Whites2012=+14, Shadows2012=+4,
--     ColorGradeHighlightsHue=38, ColorGradeHighlightsSat=9, ColorGradeBalance=24
--
--   halation_strong.xmp  (100% halation):
--     Texture=-14, Clarity2012=-12, Dehaze=-5, Highlights2012=-10, Whites2012=+6,
--     ColorGradeHighlightsHue=16, ColorGradeHighlightsSat=14,
--     ColorGradeMidtoneHue=18, ColorGradeMidtoneSat=5,
--     ColorGradeBlending=80, ColorGradeBalance=24,
--     RedSaturation=+8, BlueSaturation=-5
--
--   chromAb  — HSL channel-split (×8 vs pierwsza wersja):
--     Blue hue +96°, Purple +48°, Red -64°; Blue sat +64, Red sat +40
--     (Lightroom nie ma przesunięcia pikseli R/B — to tylko symulacja barwna; patrz nagłówek pliku.)
--
--   anamorph  — highlight-streak (+50% mocy vs poprzednio):
--     Whites +22.5, Highlights +12, Clarity -12, Texture -6,
--     ColorGradeHighlights hue +330° (delta skalowane), sat +21, Balance +22.5
-- ─────────────────────────────────────────────────────────────────────────────

local function buildDevelopSettings(props, baseline)
    local bl = baseline or {}
    local out = {}

    local function baseVal(key)
        return baselineFor(bl, key)
    end

    -- delta from baseline: accumulated across effects
    local delta = {}
    local function addD(key, amount)
        delta[key] = (delta[key] or 0) + amount
    end

    local bScale   = clamp(tonumber(props.bloom)    or 0, 0, 100) / 100.0
    local hScale   = clamp(tonumber(props.halation) or 0, 0, 100) / 100.0
    local halHueV  = clamp(tonumber(props.halHue)   or 0, -100, 100)
    local caBase   = clamp(tonumber(props.chromAb) or 0, 0, 100)
    local spectralProp = tonumber(props.spectralSeparation) or 0
    local spectral = clamp(spectralProp, 0, 100)
    local caScale = caBase / 100.0
    local spectralScale = spectral / 100.0
    local aScale   = clamp(tonumber(props.anamorph) or 0, 0, 100) / 100.0

    -- ── Bloom (delta-blended on top of photo baseline) ──
    if bScale > 0 then
        addD("Texture",            -10 * bScale)
        addD("Clarity2012",        -22 * bScale)
        addD("Dehaze",              -8 * bScale)
        addD("Highlights2012",     -14 * bScale)
        addD("Whites2012",          14 * bScale)
        addD("Shadows2012",          4 * bScale)
        addD("ColorGradeHighlightsHue", 38 * bScale)
        addD("ColorGradeHighlightsSat",  9 * bScale)
        addD("ColorGradeBalance",        24 * bScale)
    end

    -- ── Halation (delta-blended) ──
    if hScale > 0 then
        addD("Texture",             -14 * hScale)
        addD("Clarity2012",         -12 * hScale)
        addD("Dehaze",               -5 * hScale)
        addD("Highlights2012",      -10 * hScale)
        addD("Whites2012",            6 * hScale)
        addD("RedSaturation",         8 * hScale)
        addD("BlueSaturation",       -5 * hScale)
        addD("ColorGradeHighlightsSat", 14 * hScale)
        addD("ColorGradeMidtoneSat",     5 * hScale)
        addD("ColorGradeBlending",      80 * hScale)
        addD("ColorGradeBalance",       24 * hScale)

        -- Hue: base 16° (warm/red). halHue +100=more red, -100=more blue/cool.
        local hueBase  = 16.0
        local hueShift = -halHueV * 1.84
        addD("ColorGradeHighlightsHue", (hueBase + hueShift) * hScale)
        addD("ColorGradeMidtoneHue",    (18.0 + hueShift * 0.8) * hScale)
    end

    -- ── Aberracja Chromatyczna (kolor) ──
    -- TYLKO kolor. Bez mieszania z Optyczna Dyspersja.
    if caScale > 0 then
        addD("HueAdjustmentBlue",           96 * caScale)
        addD("HueAdjustmentPurple",         48 * caScale)
        addD("HueAdjustmentRed",           -64 * caScale)
        addD("SaturationAdjustmentBlue",    64 * caScale)
        addD("SaturationAdjustmentRed",     40 * caScale)
        out["AutoLateralCA"] = 1
    else
        out["AutoLateralCA"] = 0
    end

    -- Optyczna Dyspersja (monochromatyczna) - commit approximation for LR develop.
    -- Bez koloru (nie dotykamy hue/saturation). Dziala na micro-contrast i krawedziach.
    if spectralScale > 0 then
        local k = spectralScale
        -- Keep structure/edges; avoid global blur from heavy denoise.
        addD("SharpenEdgeMasking",       85 * k)
        addD("SharpenRadius",           2.80 * k)
        addD("SharpenDetail",            20 * k)
        addD("SharpenAmount",           150 * k)
        addD("Clarity2012",              -4 * k)
        addD("Texture",                 -12 * k)
        addD("Dehaze",                   -6 * k)
        -- Vignette OFF for Optyczna Dyspersja (user requested).
        -- addD("PostCropVignetteAmount", 0)
    end

    -- ── Smugi Anamorficzne — highlight glow (+50% mocy względem poprzedniej wersji) ──
    if aScale > 0 then
        addD("Whites2012",               22.5 * aScale)
        addD("Highlights2012",            12 * aScale)
        addD("Clarity2012",              -12 * aScale)
        addD("Texture",                   -6 * aScale)
        addD("ColorGradeHighlightsHue",  330 * aScale)
        addD("ColorGradeHighlightsSat",   21 * aScale)
        addD("ColorGradeBalance",       22.5 * aScale)
    end

    -- ── Apply all deltas on top of photo baseline ──
    for key, d in pairs(delta) do
        if math.abs(d) > 0.01 then
            local newVal = baseVal(key) + d
            if key == "ColorGradeHighlightsHue" or key == "ColorGradeMidtoneHue" then
                newVal = ((newVal % 360) + 360) % 360
            elseif key == "ColorGradeBlending" or key == "ColorGradeHighlightsSat"
                or key == "ColorGradeMidtoneSat" or key == "ColorGradeShadowsSat"
                or key == "SaturationAdjustmentBlue" or key == "SaturationAdjustmentRed" then
                newVal = clamp(newVal, 0, 100)
            elseif key == "LuminanceSmoothing" then
                newVal = clamp(newVal, 0, 100)
            elseif key == "SharpenRadius" then
                newVal = clamp(newVal, 0.5, 3.0)
            elseif key == "SharpenDetail" or key == "SharpenEdgeMasking" then
                newVal = clamp(newVal, 0, 100)
            elseif key == "SharpenAmount" then
                newVal = clamp(newVal, 0, 150)
            else
                newVal = clamp(newVal, -100, 100)
            end
            out[key] = round(newVal)
        end
    end

    return out
end

-- ─────────────────────────── prefs ───────────────────────────────────────────

local function loadFromPrefs(prefs)
    local out = {}
    local p = prefs or {}
    local migrated = false

    for _, key in ipairs(SLIDER_KEYS) do
        local r = RANGES[key]
        local newKey = prefKey(key)
        local oldKey = legacyPrefKey(key)
        local raw = tonumber(p[newKey])
        local oldRaw = tonumber(p[oldKey])

        if raw == nil and oldRaw ~= nil then
            raw = oldRaw
            p[newKey] = oldRaw
            migrated = true
        end
        out[key] = round(clamp(raw ~= nil and raw or DEFAULTS[key], r.min, r.max))
    end

    local liveNew = p.panel5_livepreview
    local liveOld = p.panel6_livepreview
    if liveNew == nil and liveOld ~= nil then
        liveNew = liveOld
        p.panel5_livepreview = liveOld
        migrated = true
    end
    out.livePreview = (liveNew ~= false)

    if migrated then
        p.panel5_migrated_from_panel6 = true
        for _, key in ipairs(SLIDER_KEYS) do
            p[legacyPrefKey(key)] = nil
        end
        p.panel6_livepreview = nil
    end

    return out
end

local function saveToPrefs(prefs, props)
    for _, key in ipairs(SLIDER_KEYS) do
        local r = RANGES[key]
        prefs[prefKey(key)] = round(clamp(tonumber(props[key]) or DEFAULTS[key], r.min, r.max))
    end
    prefs.panel5_livepreview = (props.livePreview == true)
end

local function applyToProps(props, state)
    for _, key in ipairs(SLIDER_KEYS) do
        local r = RANGES[key]
        props[key] = round(clamp(tonumber(state[key]) or DEFAULTS[key], r.min, r.max))
    end
    props.livePreview = (state.livePreview == true)
end

local function snapshotProps(props)
    local s = {}
    for _, key in ipairs(SLIDER_KEYS) do
        s[key] = tonumber(props[key]) or DEFAULTS[key]
    end
    s.livePreview = (props.livePreview == true)
    return s
end

local function stateSummary(s)
    return string.format(
        "CA-barwna %d | Optyczna Dyspersja %d | Bloom %d | Hal %d | Anamorf %d",
        tonumber((s or {}).chromAb  or 0) or 0,
        tonumber((s or {}).spectralSeparation or 0) or 0,
        tonumber((s or {}).bloom    or 0) or 0,
        tonumber((s or {}).halation or 0) or 0,
        tonumber((s or {}).anamorph or 0) or 0
    )
end

local READBACK_FALLBACK_KEYS = {
    Contrast2012 = { "Contrast2012", "Contrast" },
    Highlights2012 = { "Highlights2012", "Highlights" },
    Shadows2012 = { "Shadows2012", "Shadows" },
    Whites2012 = { "Whites2012", "Whites" },
    Blacks2012 = { "Blacks2012", "Blacks" },
    Clarity2012 = { "Clarity2012", "Clarity" },
}

local function candidateReadbackKeys(key)
    local mapped = READBACK_FALLBACK_KEYS[tostring(key)]
    if mapped then
        return mapped
    end
    return { tostring(key) }
end

local function countReadbackMatches(photo, expected, tolerance)
    if not photo or type(expected) ~= "table" then
        return 0, 0
    end

    local expectedKeys = {}
    for key, value in pairs(expected) do
        if tonumber(value) ~= nil then
            expectedKeys[#expectedKeys + 1] = tostring(key)
        end
    end

    local readSettings = nil
    if developPreview.isDevelopModuleActive() and #expectedKeys > 0 then
        local capOk, _, captured = developPreview.captureValues(expectedKeys)
        if capOk and type(captured) == "table" then
            readSettings = captured
        end
    end
    if type(readSettings) ~= "table" then
        local okRead, current = pcall(function()
            return photo:getDevelopSettings() or {}
        end)
        if not okRead or type(current) ~= "table" then
            return 0, 0
        end
        readSettings = current
    end

    local tol = tonumber(tolerance) or 2.0
    local matched = 0
    local comparable = 0
    for key, expectedValue in pairs(expected) do
        local expectedNum = tonumber(expectedValue)
        if expectedNum ~= nil then
            local got = nil
            for _, readKey in ipairs(candidateReadbackKeys(key)) do
                if readSettings[readKey] ~= nil then
                    got = readSettings[readKey]
                    break
                end
            end
            local gotNum = tonumber(got)
            if gotNum ~= nil then
                comparable = comparable + 1
                if math.abs(gotNum - expectedNum) <= tol then
                    matched = matched + 1
                end
            elseif got ~= nil then
                comparable = comparable + 1
                if tostring(got) == tostring(expectedValue) then
                    matched = matched + 1
                end
            end
        end
    end
    return matched, comparable
end

-- ─────────── helpers identyczne z PanelsIIVMenu (działający wzorzec) ─────────

local trySwitchToDevelopModule

trySwitchToDevelopModule = function()
    if developPreview.isDevelopModuleActive() then return true end
    pcall(function() LrApplicationView.switchToModule("develop") end)
    return developPreview.isDevelopModuleActive()
end

-- Próbuje DevelopController, fallback do photo:applyDevelopSettings,
-- fallback do catalogWrite.run – dokładnie jak PanelsIIVMenu.applySettingsDeterministic.
local function applySettingsDeterministic(photo, catalog, settings, actionName)
    local hasSettings = false
    for _ in pairs(settings or {}) do hasSettings = true; break end
    if not hasSettings then return true, nil end

    if trySwitchToDevelopModule() then
        local okPrev = developPreview.applySettings(settings, { logFailures = true })
        if okPrev then return true, nil end
    end

    -- Próba bezpośrednia
    local okDirect, errDirect = pcall(function()
        photo:applyDevelopSettings(settings)
    end)
    if okDirect then return true, nil end

    local errText = tostring(errDirect or "apply_failed")
    if string.find(string.lower(errText), "yielding is not allowed", 1, true) then
        local okCat, errCat = catalogWrite.run(
            catalog,
            tostring(actionName or "MindfulLens Panel V"),
            function() photo:applyDevelopSettings(settings) end,
            { attempts = 12, sleep = 0.08, sleepMax = 0.40 }
        )
        if okCat then return true, nil end
        errText = tostring(errCat or errText)
        if developPreview.isDevelopModuleActive() then
            local okPrev2 = developPreview.applySettings(settings, { logFailures = true })
            if okPrev2 then return true, nil end
        end
        return false, errText
    end
    return false, errText
end

-- ────────────────────────────── dialog ───────────────────────────────────────

local function showDialog()
    -- KLUCZOWE: postAsyncTaskWithContext, a nie callWithContext.
    -- Daje kontekst z możliwością yielda → photo:applyDevelopSettings działa.
    LrFunctionContext.postAsyncTaskWithContext("MindfulLensPanelV", function(context)
        local f     = LrView.osFactory()
        local bind  = LrView.bind
        local prefs = LrPrefs.prefsForPlugin()
        local props = LrBinding.makePropertyTable(context)

        -- Wczytujemy poprzednio zapisane wartosci tylko do podsumowania.
        -- Sam panel zawsze startuje od DEFAULTS (siła = 0).
        local lastSaved = loadFromPrefs(prefs)
        local openState = {}
        for _, key in ipairs(SLIDER_KEYS) do
            openState[key] = DEFAULTS[key]
        end
        openState.livePreview = (lastSaved.livePreview == true)
        applyToProps(props, openState)
        local entryState = snapshotProps(props)
        props.savedSummary = "Ostatnio zapisane (prefs): " .. stateSummary(lastSaved)
            .. "  |  Start sesji (sila=0): " .. stateSummary(openState)

        -- Sekcja dawnego Panelu V — po wejsciu zawsze startujemy od "base" (Reset/0),
        -- analogicznie do suwakow chromAb/bloom/halation/anamorph powyzej.
        -- Prefs sa i tak zapisywane na koncu sesji, wiec apply z poprzedniej sesji
        -- nadal jest na zdjeciu, dopoki uzytkownik nie kliknie Reset/Zastosuj.
        for _, field in ipairs(LEGACY_FIELDS) do
            props[field.key] = panelRuntime.DEFAULTS[field.key] or "base"
        end

        local catalog     = LrApplication.activeCatalog()
        local targetPhoto = catalog and catalog:getTargetPhoto() or nil

        -- Baseline develop settings (for delta calculation and restore).
        local baselineDev = {}

        -- Capture baseline from Develop module
        local function primeBaseline()
            if not developPreview.isDevelopModuleActive() then return false end
            local ok, _, captured = developPreview.captureValues(PREVIEW_KEYS)
            if ok and type(captured) == "table" then
                for k, v in pairs(captured) do
                    if tonumber(v) ~= nil then
                        baselineDev[k] = tonumber(v)
                    end
                end
            end
            -- Also try getDevelopSettings for keys not reachable via controller
            if targetPhoto then
                local okPhoto, photoDevSettings = pcall(function()
                    return targetPhoto:getDevelopSettings() or {}
                end)
                if okPhoto and type(photoDevSettings) == "table" then
                    for _, key in ipairs(PREVIEW_KEYS) do
                        if baselineDev[key] == nil and tonumber(photoDevSettings[key]) ~= nil then
                            baselineDev[key] = tonumber(photoDevSettings[key])
                        end
                    end
                end
            end
            return true
        end

        local previewApplied  = false
        local previewEntries  = {}
        local previewDirty    = false
        local previewWorker   = false
        local baselinePrimed  = false
        local dialogClosing   = false

        local function restoreBaseline()
            if #previewEntries == 0 then return end
            local ok, err = developPreview.restoreSettings(baselineDev, previewEntries)
            if not ok then
                logger.error("Panel V preview restore failed", { error = tostring(err or "") })
            end
            previewEntries = {}
            previewApplied = false
        end

        -- Wspolna funkcja: laczy delty CA/Bloom/Halation/Anamorf (buildDevelopSettings)
        -- z efektami legacy panelu V (Powierzchnia/Bloom/Starzenie) z `panelRuntime`.
        -- Uzywana przez live-preview i przez ostateczny zapis.
        local function buildCombinedSettings(baseline)
            local settings = buildDevelopSettings(props, baseline or {})
            local legacyControls = panelRuntime.controlsFromProps(props)
            if legacyControls.anyActive then
                local isGrayscale = false
                if baseline and baseline.ConvertToGrayscale == true then
                    isGrayscale = true
                end
                local _, touched, merged = panelRuntime.applyToSettings(settings, legacyControls, {
                    baselineSettings = baseline or {},
                    isGrayscale      = isGrayscale,
                    formatId         = tostring(prefs.lastFormat or "35mm"),
                    panelKeys        = LEGACY_PANELV_KEYS,
                })
                if touched and touched > 0 and type(merged) == "table" then
                    settings = merged
                end
            end
            return settings
        end

        local function applyPreview()
            if dialogClosing then return true end
            if props.livePreview ~= true or not targetPhoto then return true end
            if not developPreview.isDevelopModuleActive() then return true end

            if not baselinePrimed then
                primeBaseline()
                baselinePrimed = true
            end

            local settings = buildCombinedSettings(baselineDev)
            local hasAny = false
            for _ in pairs(settings) do hasAny = true; break end

            if previewApplied then
                restoreBaseline()
            end

            if not hasAny then return true end

            local ok, err, entries = developPreview.applySettings(settings, { logFailures = true })
            if not ok then
                logger.error("Panel V preview apply failed", { error = tostring(err or "") })
                return false
            end
            previewEntries = entries or {}
            previewApplied = true
            return true
        end

        local function requestPreview()
            if dialogClosing then return end
            if props.livePreview ~= true then return end
            previewDirty = true
            if previewWorker then return end
            previewWorker = true
            LrTasks.startAsyncTask(function()
                while previewDirty do
                    previewDirty = false
                    LrTasks.sleep(0.10)
                    if not previewDirty then
                        applyPreview()
                    end
                end
                previewWorker = false
            end)
        end

        for _, key in ipairs(SLIDER_KEYS) do
            props:addObserver(key, requestPreview)
        end
        -- Observe legacy Panel V controls (popup_menu) — tak samo zrobione w PanelsIIVMenu.lua
        for _, field in ipairs(LEGACY_FIELDS) do
            props:addObserver(field.key, requestPreview)
        end
        props:addObserver("livePreview", function()
            if props.livePreview == true then
                baselinePrimed = false  -- re-capture on next preview
                requestPreview()
            else
                LrTasks.startAsyncTask(function()
                    restoreBaseline()
                end)
            end
        end)

        -- ── UI helpers ──────────────────────────────────────────────────────

        local function note(text)
            return f:static_text({
                title           = text,
                fill_horizontal = 1,
                height_in_lines = -1,
                font            = "<system/small>",
            })
        end

        -- Jeden wiersz: etykieta (110 px) | suwak (fill) | pole edycji | "0"
        local function sliderRow(key, labelText)
            local r = RANGES[key]
            return f:row({
                spacing = f:label_spacing(),
                f:static_text({
                    title = labelText,
                    width = 170,
                    font  = "<system>",
                }),
                f:slider({
                    value          = bind(key),
                    min            = r.min,
                    max            = r.max,
                    integral       = true,
                    immediate      = true,
                    fill_horizontal = 1,
                }),
                f:edit_field({
                    value          = bind(key),
                    min            = r.min,
                    max            = r.max,
                    increment      = 1,
                    width_in_digits = 5,
                    precision      = 0,
                }),
                f:push_button({
                    title  = "0",
                    width  = 30,
                    action = function() props[key] = DEFAULTS[key] end,
                }),
            })
        end

        local function sectionTitle(text)
            return f:static_text({
                title           = text,
                fill_horizontal = 1,
                font            = "<system/bold>",
            })
        end

        -- Jeden wiersz dla legacy popup: etykieta (170 px) | dropdown (fill)
        local function legacyRow(field)
            return f:column({
                fill_horizontal = 1,
                spacing = 2,
                f:row({
                    spacing = f:label_spacing(),
                    f:static_text({ title = field.label, width = 230, font = "<system>" }),
                    f:popup_menu({ value = bind(field.key), items = LEGACY_LEVEL_ITEMS, fill_horizontal = 1 }),
                }),
                f:static_text({ title = field.note, fill_horizontal = 1, height_in_lines = -1, font = "<system/small>" }),
            })
        end

        -- ── Dialog content ─────────────────────────────────────────────────
        local content = f:column({
            bind_to_object  = props,
            spacing         = f:control_spacing(),
            fill_horizontal = 1,

            -- Wymuszamy minimalną szerokość treści – bez tego scrolled_view
            -- może narysować panel za wąsko na małych ekranach.
            f:spacer({ width = 860, height = 1 }),

            f:static_text({ title = bind("savedSummary"), fill_horizontal = 1, font = "<system/small>" }),
            f:separator({ fill_horizontal = 1 }),

            -- ── Aberracja Chromatyczna ──────────────────────────────────────
            sectionTitle("Aberracja Chromatyczna"),
            sliderRow("chromAb", "Aberracja Barwna"),
            sliderRow("spectralSeparation", "Optyczna Dyspersja"),
            f:push_button({
                title = "Podglad na zywo - Optyczna Dyspersja",
                action = function()
                    local currentPhoto = (LrApplication.activeCatalog() and LrApplication.activeCatalog():getTargetPhoto()) or targetPhoto
                    if not currentPhoto then
                        LrDialogs.message("Panel V", "Najpierw wybierz zdjecie.", "warning")
                        return
                    end
                    local initial = tonumber(props.spectralSeparation) or 0
                    LrTasks.startAsyncTask(function()
                        local okRun, resultOrErr = LrTasks.pcall(function()
                            return opticalDyspersjaPreview.launch({
                                photo = currentPhoto,
                                initialStrength = initial,
                            })
                        end)
                        if not okRun then
                            logger.error("Optical dyspersja live preview failed", {
                                error = tostring(resultOrErr or ""),
                            })
                            LrDialogs.message(
                                "Optyczna Dyspersja - podglad",
                                tostring(resultOrErr or "Nie udalo sie uruchomic podgladu."),
                                "critical"
                            )
                        else
                            local selected = tonumber((resultOrErr or {}).selectedValue)
                            if selected ~= nil then
                                props.spectralSeparation = selected
                                prefs[prefKey("spectralSeparation")] = selected
                                logger.info("Optical dyspersja selected value applied to slider", {
                                    value = tostring(selected),
                                })
                                LrDialogs.showBezel("Optyczna Dyspersja ustawiona: " .. tostring(selected), 1.6)
                            else
                                logger.warn("Optical dyspersja preview closed without selected value", {})
                                LrDialogs.showBezel("Podglad zamkniety bez odczytu wartosci", 1.6)
                            end
                        end
                    end)
                end,
            }),
            f:separator({ fill_horizontal = 1 }),

            -- ── Bloom ───────────────────────────────────────────────────────
            sectionTitle("Bloom / Poswiata"),
            sliderRow("bloom", "Bloom / Glow"),
            f:separator({ fill_horizontal = 1 }),

            -- ── Halacja ─────────────────────────────────────────────────────
            sectionTitle("Halacja"),
            sliderRow("halation",  "Sila halacji"),
            sliderRow("halRadius", "Promien (prefs)"),
            sliderRow("halThresh", "Prog jasnosci (prefs)"),
            sliderRow("halHue",    "Odcien R<->B"),
            f:separator({ fill_horizontal = 1 }),

            -- ── Smugi anamorficzne ──────────────────────────────────────────
            sectionTitle("Smugi anamorficzne"),
            sliderRow("anamorph",  "Sila smug"),
            sliderRow("streakLen", "Dlugosc (prefs)"),
            f:separator({ fill_horizontal = 1 }),

            -- ── Powierzchnia, Bloom i Starzenie (dawny Panel V) ─────────────
            sectionTitle("Powierzchnia, Bloom i Starzenie"),
            note("Poziom dzialania kazdego efektu warstwy fizycznej. Stosowane razem z efektami powyzej przy Zastosuj."),
            legacyRow(LEGACY_FIELDS[1]),
            legacyRow(LEGACY_FIELDS[2]),
            legacyRow(LEGACY_FIELDS[3]),
            legacyRow(LEGACY_FIELDS[4]),
            legacyRow(LEGACY_FIELDS[5]),
            legacyRow(LEGACY_FIELDS[6]),
            f:push_button({
                title  = "Reset Powierzchnia/Bloom/Starzenie",
                action = function()
                    for _, field in ipairs(LEGACY_FIELDS) do
                        props[field.key] = panelRuntime.DEFAULTS[field.key] or "base"
                    end
                end,
            }),
            f:separator({ fill_horizontal = 1 }),

            -- ── Kontrolki ───────────────────────────────────────────────────
            f:checkbox({ title = "Podglad na zywo (Develop)", value = bind("livePreview") }),
            f:row({
                spacing = 8,
                f:push_button({
                    title  = "Reset suwakow (0)",
                    action = function()
                        local reset = {}
                        for _, key in ipairs(SLIDER_KEYS) do reset[key] = DEFAULTS[key] end
                        reset.livePreview = (props.livePreview == true)
                        applyToProps(props, reset)
                        LrTasks.startAsyncTask(function()
                            restoreBaseline()
                            if props.livePreview == true then requestPreview() end
                        end)
                    end,
                }),
                f:push_button({
                    title  = "Przywroc stan wejsciowy",
                    action = function()
                        local restore = {}
                        for k, v in pairs(entryState) do restore[k] = v end
                        restore.livePreview = (props.livePreview == true)
                        applyToProps(props, restore)
                        LrTasks.startAsyncTask(function()
                            restoreBaseline()
                            if props.livePreview == true then requestPreview() end
                        end)
                    end,
                }),
                f:push_button({
                    title  = "Cofnij podglad",
                    action = function()
                        LrTasks.startAsyncTask(function()
                            restoreBaseline()
                            LrDialogs.showBezel("MindfulLens: podglad przywrocony", 1.2)
                        end)
                    end,
                }),
            }),
        })

        -- Trigger initial preview if enabled
        if props.livePreview == true then
            LrTasks.startAsyncTask(function()
                LrTasks.sleep(0.15)
                requestPreview()
            end)
        end

        local result = LrDialogs.presentModalDialog({
            title        = "MindfulLens — Panel V: Komora Halacji, Powierzchnia i Defektow Analogowych",
            actionVerb   = "Zastosuj",
            cancelVerb   = "Zamknij",
            save_frame   = "mindfullens.panel5.dialog",
            contents     = f:scrolled_view({
                width               = 920,
                height              = 680,
                horizontal_scroller = false,
                vertical_scroller   = true,
                content             = content,
            }),
        })

        dialogClosing = true
        previewDirty  = false

        if result == "ok" then
            -- Zdejmujemy live-preview zanim nałożymy trwałe ustawienia
            if previewApplied then
                restoreBaseline()
            end

            -- Pobieramy świeże ustawienia zdjęcia jako baseline do obliczenia delt
            local currentPhotoSettings = {}
            if targetPhoto then
                local okCur, curSettings = pcall(function()
                    return targetPhoto:getDevelopSettings() or {}
                end)
                if okCur and type(curSettings) == "table" then
                    currentPhotoSettings = curSettings
                end
            end

            -- Scalamy: ostatni snapshot z develop + to co mieliśmy przy otwarciu
            local commitBaseline = {}
            for k, v in pairs(currentPhotoSettings) do
                commitBaseline[k] = v
            end
            for k, v in pairs(baselineDev or {}) do
                if tonumber(v) ~= nil then commitBaseline[k] = tonumber(v) end
            end

            local finalSettings = buildCombinedSettings(commitBaseline)

            local appliedCount = 0
            for _ in pairs(finalSettings or {}) do appliedCount = appliedCount + 1 end

            local commitPhoto = targetPhoto
            if appliedCount > 0 and commitPhoto then
                local committed = false
                local lastErr   = nil

                for attempt = 1, 2 do
                    local okApply, errApply = applySettingsDeterministic(
                        commitPhoto, catalog, finalSettings,
                        "MindfulLens Panel V — Komora Halacji i Defektow Analogowych"
                    )
                    if not okApply then
                        lastErr = tostring(errApply or "apply_failed")
                    else
                        -- Weryfikacja readback
                        local matched, comparable = countReadbackMatches(
                            commitPhoto, finalSettings, 2.0)
                        if matched > 0 or comparable == 0 then
                            committed = true
                            break
                        end
                        lastErr = "readback_mismatch (" .. matched .. "/" .. comparable .. ")"
                    end
                    if attempt < 2 then LrTasks.sleep(0.12) end
                end

                if not committed then
                    logger.error("Panel V apply failed", { error = tostring(lastErr or "") })
                    LrDialogs.message(
                        "Panel V",
                        "Blad zapisu: " .. tostring(lastErr or "apply_failed"),
                        "critical"
                    )
                    return
                end
            end

            -- Zapis do prefs – dopiero po udanym apply (wzorzec PanelsIIVMenu)
            saveToPrefs(prefs, props)
            for _, field in ipairs(LEGACY_FIELDS) do
                local norm = panelRuntime.normalizeControlValue(field.key, props[field.key])
                prefs[LEGACY_PREF_PREFIX .. field.key] = norm or panelRuntime.DEFAULTS[field.key] or "base"
            end
            local dbgSpectral = math.floor((tonumber(props.spectralSeparation) or 0) + 0.5)
            logger.info("Panel V committed", {
                keys = tostring(appliedCount),
                spectral = tostring(dbgSpectral),
                clarity = tostring(finalSettings["Clarity2012"] or "nil"),
                texture = tostring(finalSettings["Texture"] or "nil"),
                dehaze = tostring(finalSettings["Dehaze"] or "nil"),
                sharpAmt = tostring(finalSettings["SharpenAmount"] or "nil"),
            })
            LrDialogs.showBezel(
                "Zastosowano: Optyczna Dyspersja "
                    .. tostring(dbgSpectral)
                    .. " | T="
                    .. tostring(math.floor(tonumber(finalSettings["Texture"] or 0) + 0.5))
                    .. " C="
                    .. tostring(math.floor(tonumber(finalSettings["Clarity2012"] or 0) + 0.5)),
                1.8
            )

            -- Nie przywracamy baseline po commit – to by cofnęło zmiany
            previewApplied = false
            previewEntries = {}

        else
            -- Anuluj – przywróć podgląd LR
            restoreBaseline()
        end
    end)
end

-- ─────────────────────────── entry point ─────────────────────────────────────
showDialog()
