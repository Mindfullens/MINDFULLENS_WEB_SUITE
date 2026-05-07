-- Panel VIII — Głębia Subtraktywna i Kinematografia
-- Suwaki 0-100, architektura identyczna jak Panel VII / Panel V.
-- Mapowanie na natywne suwaki LR:
--   velviaOverdrive → matematyka subtraktywna CMY: SatAdj+LumAdj Greens/Blues↓, Vibrance↑, Contrast↑
--   portaSkinGuard  → HSL ochrona skory: LumAdj Orange↑, SatAdj Orange↓ at high, ColorGrade Shadows cyan roll-off
--   cineonLog       → lift cieni (Blacks↑), kompresja swiatel (Whites↓), Contrast↓ — emulacja LogC/Cineon
--   kodachromeK14   → SatAdj Red↑, SatAdj Blue↓, LumAdj Blue↑, Shadows deep blue-black

local LrApplication    = import "LrApplication"
local LrApplicationView = import "LrApplicationView"
local LrBinding        = import "LrBinding"
local LrDevelopController = import "LrDevelopController"
local LrDialogs        = import "LrDialogs"
local LrFunctionContext = import "LrFunctionContext"
local LrPathUtils      = import "LrPathUtils"
local LrPrefs          = import "LrPrefs"
local LrTasks          = import "LrTasks"
local LrView           = import "LrView"

local function pluginLoad(relativePath)
    return dofile(LrPathUtils.child(_PLUGIN.path, relativePath))
end

local logger         = pluginLoad("lib/Logger.lua")
local developPreview = pluginLoad("lib/DevelopPreview.lua")
local catalogWrite   = pluginLoad("lib/CatalogWrite.lua")

-- ─────────────────────────── defaults / ranges ───────────────────────────────

local DEFAULTS = {
    velviaOverdrive  = 0,
    portaSkinGuard   = 0,
    cineonLog        = 0,
    kodachromeK14    = 0,
}

local RANGES = {
    velviaOverdrive  = { min = 0, max = 100 },
    portaSkinGuard   = { min = 0, max = 100 },
    cineonLog        = { min = 0, max = 100 },
    kodachromeK14    = { min = 0, max = 100 },
}

local SLIDER_KEYS = {
    "velviaOverdrive", "portaSkinGuard", "cineonLog", "kodachromeK14",
}

local PREF_PREFIX = "panel8_"

local PREVIEW_KEYS = {
    "Saturation", "Vibrance",
    "Contrast2012", "Clarity2012", "Texture", "Dehaze",
    "Highlights2012", "Whites2012", "Shadows2012", "Blacks2012",
    "HueAdjustmentRed",    "HueAdjustmentOrange", "HueAdjustmentYellow",
    "HueAdjustmentGreen",  "HueAdjustmentAqua",   "HueAdjustmentBlue",
    "HueAdjustmentPurple", "HueAdjustmentMagenta",
    "SaturationAdjustmentRed",    "SaturationAdjustmentOrange",
    "SaturationAdjustmentYellow", "SaturationAdjustmentGreen",
    "SaturationAdjustmentAqua",   "SaturationAdjustmentBlue",
    "SaturationAdjustmentPurple", "SaturationAdjustmentMagenta",
    "LuminanceAdjustmentRed",   "LuminanceAdjustmentOrange",
    "LuminanceAdjustmentYellow","LuminanceAdjustmentGreen",
    "LuminanceAdjustmentAqua",  "LuminanceAdjustmentBlue",
    "LuminanceAdjustmentPurple","LuminanceAdjustmentMagenta",
    "ColorGradeShadowsHue",    "ColorGradeShadowsSat",
    "ColorGradeHighlightsHue", "ColorGradeHighlightsSat",
    "ColorGradeMidtoneHue",    "ColorGradeMidtoneSat",
    "ColorGradeBlending",      "ColorGradeBalance",
}

-- ─────────────────────────── develop settings ────────────────────────────────

local function buildDevelopSettings(props, baseline)
    local out = {}
    baseline = baseline or {}

    local function addD(key, delta)
        local base = tonumber(baseline[key]) or 0
        out[key] = base + delta
    end

    local function clamp(v, lo, hi)
        if v < lo then return lo end
        if v > hi then return hi end
        return v
    end

    -- ── Fuji Velvia / Provia E-6 — Subtractive Overdrive ────────────────────
    -- Matematyka subtraktywna CMY: luminancja barwna gęstnieje logarytmicznie
    local velviaScale = clamp((tonumber(props.velviaOverdrive) or 0) / 100, 0, 1)
    if velviaScale > 0 then
        local k = velviaScale
        -- Zagęszczanie zieleni (gęstość warstwy Cyan-Magenta)
        addD("LuminanceAdjustmentGreen",     -22 * k)
        addD("SaturationAdjustmentGreen",     28 * k)
        -- Zagęszczanie błękitu (gęstość warstwy Yellow)
        addD("LuminanceAdjustmentBlue",      -18 * k)
        addD("SaturationAdjustmentBlue",      22 * k)
        -- Ogólna mikrokontrast i dynamika
        addD("Vibrance",                      20 * k)
        addD("Contrast2012",                  18 * k)
        addD("Shadows2012",                  -12 * k)  -- kompresja cieni jak Velvia
        addD("Highlights2012",               -10 * k)  -- ograniczona tolerancja prześwietle
        -- Lekkie podbicie akwy dla efektu E-6 (niebo, woda)
        addD("SaturationAdjustmentAqua",      18 * k)
        addD("LuminanceAdjustmentAqua",       -8 * k)
    end

    -- ── Kodak Portra — Ochrona Tonacji Skóry ─────────────────────────────────
    -- Dynamic Skin-Tone Preservation: izolacja HSL pomarańcz/żółć + soft-clipping
    local portaScale = clamp((tonumber(props.portaSkinGuard) or 0) / 100, 0, 1)
    if portaScale > 0 then
        local k = portaScale
        -- Jasność pomarańczy↑ (skóra nie traci detalu w światłach)
        addD("LuminanceAdjustmentOrange",     14 * k)
        -- Saturacja pomarańczy delikatnie↓ przy wysokich wartościach (soft-clipping koloru skóry)
        addD("SaturationAdjustmentOrange",   -10 * k)
        -- Żółcień lekko chroniona
        addD("LuminanceAdjustmentYellow",      8 * k)
        addD("SaturationAdjustmentYellow",    -6 * k)
        -- Cyan roll-off w cieniach (charakterystyczny dla Portra)
        addD("ColorGradeShadowsHue",         195 * k)
        addD("ColorGradeShadowsSat",          12 * k)
        -- Delikatne otwarcie cieni (Shadows)
        addD("Shadows2012",                   10 * k)
    end

    -- ── Print Film / Cineon Log — Emulacja Wydruku Kinowego ──────────────────
    -- Płaska przestrzeń logarytmiczna → wirtualna głowica powiększalnika CMY
    local cineonScale = clamp((tonumber(props.cineonLog) or 0) / 100, 0, 1)
    if cineonScale > 0 then
        local k = cineonScale
        -- Lift cieni (fade / baza celuloidowa)
        addD("Blacks2012",                    22 * k)
        addD("Shadows2012",                   15 * k)
        -- Kompresja swiatel
        addD("Whites2012",                   -18 * k)
        addD("Highlights2012",               -12 * k)
        -- Spłaszczenie krzywej (odcisk papieru kinowego)
        addD("Contrast2012",                 -20 * k)
        -- Delikatna utrata nasycenia typowa dla odbitki
        addD("SaturationAdjustmentBlue",      -8 * k)
        addD("SaturationAdjustmentGreen",     -5 * k)
        -- Lekkie ocieplenie swiatel (głowica powiększalnika CMY)
        addD("ColorGradeHighlightsHue",       35 * k)
        addD("ColorGradeHighlightsSat",        8 * k)
    end

    -- ── Kodachrome K-14 — Trójwarstwowa Synteza ──────────────────────────────
    -- Legendarny material: sterylna struktura, czernie w stronę głębokiego granatu
    local kodaScale = clamp((tonumber(props.kodachromeK14) or 0) / 100, 0, 1)
    if kodaScale > 0 then
        local k = kodaScale
        -- Charakterystyczna żywość czerwieni (warstwa top)
        addD("SaturationAdjustmentRed",       25 * k)
        addD("HueAdjustmentRed",              -8 * k)   -- lekki shift czerwieni w stronę pomarańczu
        -- Kompresja niebieskiego (K-14 stłumiał niebieskie w półcieniach)
        addD("SaturationAdjustmentBlue",      -12 * k)
        addD("LuminanceAdjustmentBlue",        16 * k)  -- ale jasność niebiego wyżej (czyste niebo)
        -- Stłumienie saturacji w półcieniach — charakterystyczna "sterylność"
        addD("SaturationAdjustmentGreen",      -8 * k)
        addD("SaturationAdjustmentAqua",      -10 * k)
        -- Cienie głęboko w stronę niebiesko-czarnego (Additive-Subtractive Substrate)
        addD("ColorGradeShadowsHue",          230 * k)
        addD("ColorGradeShadowsSat",           18 * k)
        addD("Shadows2012",                   -12 * k)
        addD("Blacks2012",                    -10 * k)
    end

    return out
end

-- ─────────────────────────── prefs helpers ───────────────────────────────────

local function loadFromPrefs(prefs)
    local p = {}
    for _, key in ipairs(SLIDER_KEYS) do
        local raw = tonumber(prefs[PREF_PREFIX .. key])
        p[key] = raw ~= nil and raw or DEFAULTS[key]
    end
    return p
end

local function saveToPrefs(prefs, props)
    for _, key in ipairs(SLIDER_KEYS) do
        prefs[PREF_PREFIX .. key] = tonumber(props[key]) or DEFAULTS[key]
    end
end

-- ─────────────────────────── apply helpers ───────────────────────────────────

local function applySettingsDeterministic(photo, catalog, settings, actionName)
    local okDirect, errDirect = pcall(function()
        photo:applyDevelopSettings(settings)
    end)
    if okDirect then return true, nil end

    local errText = tostring(errDirect or "")
    if string.find(string.lower(errText), "yielding is not allowed", 1, true) then
        local okCat, errCat = catalogWrite.run(
            catalog, tostring(actionName or "Panel VIII apply"),
            function() photo:applyDevelopSettings(settings) end,
            { attempts = 12, sleep = 0.08, sleepMax = 0.40 }
        )
        if okCat then return true, nil end
        return false, errCat or errText
    end
    return false, errDirect
end

local function countReadbackMatches(photo, settings, tolerance)
    local tol = tolerance or 2.0
    local readback = {}
    pcall(function() readback = photo:getDevelopSettings() or {} end)
    local matched, comparable = 0, 0
    for k, v in pairs(settings) do
        local rv = tonumber(readback[k])
        local sv = tonumber(v)
        if rv ~= nil and sv ~= nil then
            comparable = comparable + 1
            if math.abs(rv - sv) <= tol then matched = matched + 1 end
        end
    end
    return matched, comparable
end

-- ─────────────────────────── main dialog ─────────────────────────────────────

local function showDialog()
    local catalog = LrApplication.activeCatalog()
    local targetPhoto = catalog:getTargetPhoto()
    if not targetPhoto then
        LrDialogs.message("Panel VIII", "Brak zaznaczonego zdjecia.", "info")
        return
    end

    local prefs = LrPrefs.prefsForPlugin()
    local saved = loadFromPrefs(prefs)

    local baselineDev = {}
    pcall(function() baselineDev = developPreview.captureValues(PREVIEW_KEYS) or {} end)

    local previewApplied = false
    local previewEntries = {}
    local dialogClosing  = false

    local function restoreBaseline()
        if #previewEntries > 0 then
            local okR = pcall(function()
                developPreview.restoreSettings(previewEntries)
            end)
            if not okR then
                pcall(function()
                    local restore = {}
                    for _, e in ipairs(previewEntries) do restore[e.key] = e.originalValue end
                    developPreview.applySettings(restore, { logFailures = true })
                end)
            end
        end
        previewApplied = false
        previewEntries = {}
    end

    LrFunctionContext.postAsyncTaskWithContext("panel8_dialog", function(context)
        local f    = LrView.osFactory()
        local props = LrBinding.makePropertyTable(context)

        for _, key in ipairs(SLIDER_KEYS) do props[key] = saved[key] end

        local function triggerPreview()
            if dialogClosing then return end
            if not developPreview.isDevelopModuleActive() then return end
            LrTasks.startAsyncTask(function()
                if dialogClosing then return end
                local settings = buildDevelopSettings(props, baselineDev)
                if previewApplied then restoreBaseline() end
                pcall(function()
                    local entries = developPreview.captureValues(PREVIEW_KEYS)
                    developPreview.applySettings(settings, { logFailures = false })
                    previewEntries = entries or {}
                    previewApplied = true
                end)
            end)
        end

        for _, key in ipairs(SLIDER_KEYS) do
            props:addObserver(key, function() triggerPreview() end)
        end

        local function sectionTitle(text)
            return f:static_text({
                title = text, font = "<system/bold>",
                fill_horizontal = 1, margin_bottom = 4, margin_top = 10,
            })
        end

        local function sliderRow(key, label, note)
            local r = RANGES[key]
            return f:column({
                fill_horizontal = 1, spacing = 2,
                f:static_text({ title = label, font = "<system/bold>" }),
                f:row({
                    fill_horizontal = 1,
                    f:slider({
                        value = LrView.bind(key), min = r.min, max = r.max,
                        integral = true, width_in_chars = 28, fill_horizontal = 1,
                    }),
                    f:edit_field({
                        value = LrView.bind(key), min = r.min, max = r.max,
                        precision = 0, width_in_chars = 4,
                    }),
                }),
                note and f:static_text({
                    title = note,
                    font = "<system/small>",
                    fill_horizontal = 1, height_in_lines = 2,
                }) or f:spacer({ height = 0 }),
                f:separator({ fill_horizontal = 1 }),
            })
        end

        local content = f:column({
            fill_horizontal = 1, spacing = 6, margin_horizontal = 14,

            sectionTitle("Emulsje Slajdowe i Negatywowe"),

            sliderRow("velviaOverdrive",
                "Velvia / Provia — Subtractive Overdrive",
                "Matematyka subtraktywna CMY: zielenie i blekity gestneja logarytmicznie. Zapobiega swieceniu barw cyfrowych, wchodzi w glebsze, mroczne tony."),

            sliderRow("portaSkinGuard",
                "Kodak Portra — Ochrona Tonacji Skory",
                "Dynamic Skin-Tone Preservation: izolacja HSL pomarancz/zolc, soft-clipping. Spowalnia reakcje tonalna w swiatach skory. Cyan roll-off w cieniach."),

            sectionTitle("Procesy Kinowe"),

            sliderRow("cineonLog",
                "Print Film / Cineon Log",
                "Emulacja plaskiej przestrzeni logarytmicznej Cineon. Wirtualna glowica powiększalnika CMY: bezstratne zageszczenie przejsc tonalnych jak odbitka na kinowym papierze."),

            sliderRow("kodachromeK14",
                "Kodachrome K-14",
                "Trojwarstwowa synteza: algorytmiczne rozebrance obrazu na wirtualne kanaly gestosci. Sterylna struktura, czerwien zywia, cienie w glebokim niebiesko-czarnym."),

            f:spacer({ height = 8 }),

            f:push_button({
                title = "Reset wszystkich",
                action = function()
                    for _, key in ipairs(SLIDER_KEYS) do props[key] = DEFAULTS[key] end
                end,
            }),
        })

        local result = LrDialogs.presentModalDialog({
            title      = "MindfulLens — Panel VIII: Glebia Subtraktywna i Kinematografia",
            actionVerb = "Zastosuj",
            cancelVerb = "Zamknij",
            save_frame = "mindfullens.panel8.dialog",
            contents   = f:scrolled_view({
                width = 560, height = 560,
                horizontal_scroller = false, vertical_scroller = true,
                content = content,
            }),
        })

        dialogClosing = true
        if previewApplied then restoreBaseline() end

        if result == "ok" then
            pcall(function() LrApplicationView.switchToModule("develop") end)
            LrTasks.sleep(0.05)

            local currentSettings = {}
            pcall(function() currentSettings = targetPhoto:getDevelopSettings() or {} end)

            local commitBaseline = {}
            for k, v in pairs(currentSettings) do commitBaseline[k] = v end
            for k, v in pairs(baselineDev or {}) do
                if tonumber(v) ~= nil then commitBaseline[k] = tonumber(v) end
            end

            local finalSettings = buildDevelopSettings(props, commitBaseline)

            local appliedCount = 0
            for _ in pairs(finalSettings) do appliedCount = appliedCount + 1 end

            if appliedCount > 0 then
                local committed = false
                local lastErr   = nil
                for attempt = 1, 2 do
                    local okApply, errApply = applySettingsDeterministic(
                        targetPhoto, catalog, finalSettings,
                        "MindfulLens Panel VIII — Glebia Subtraktywna"
                    )
                    if not okApply then
                        lastErr = tostring(errApply or "apply_failed")
                    else
                        local matched, comparable = countReadbackMatches(targetPhoto, finalSettings, 2.0)
                        if matched > 0 or comparable == 0 then
                            committed = true
                            break
                        end
                        lastErr = "readback_mismatch (" .. matched .. "/" .. comparable .. ")"
                    end
                    if attempt < 2 then LrTasks.sleep(0.12) end
                end

                if not committed then
                    logger.error("Panel VIII apply failed", { error = tostring(lastErr or "") })
                    LrDialogs.message("Panel VIII", "Blad zapisu: " .. tostring(lastErr or ""), "critical")
                    return
                end
            end

            saveToPrefs(prefs, props)
            logger.info("Panel VIII committed", { keys = tostring(appliedCount) })

            local names = {}
            for _, key in ipairs(SLIDER_KEYS) do
                local v = tonumber(props[key]) or 0
                if v > 0 then names[#names + 1] = key .. "=" .. tostring(math.floor(v + 0.5)) end
            end
            LrDialogs.showBezel("Panel VIII: " .. (#names > 0 and table.concat(names, "  ") or "zero"), 2.0)
        end
    end)
end

showDialog()
