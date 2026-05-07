-- Panel IX — Chemia, Klimat i Epoki
-- Suwaki 0-100, architektura identyczna jak Panel VII/VIII / Panel V.
-- Mapowanie na natywne suwaki LR:
--   filmSoup      → anomalie barwne (ColorGrade Midtones chaotyczny), SatAdj nierównomierne, Clarity↓
--   lomoColor92   → teal shadows, fade (Blacks lift), SatAdj globalny↓, Clarity↓ — klimat lat 90.
--   cinestill800t → Temperature radykalnie↓ (Tungsten), Tint adjust + boost halacji (czerwony odcień swiatel)

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
    filmSoup      = 0,
    lomoColor92   = 0,
    cinestill800t = 0,
}

local RANGES = {
    filmSoup      = { min = 0, max = 100 },
    lomoColor92   = { min = 0, max = 100 },
    cinestill800t = { min = 0, max = 100 },
}

local SLIDER_KEYS = { "filmSoup", "lomoColor92", "cinestill800t" }

local PREF_PREFIX = "panel9_"

local PREVIEW_KEYS = {
    "Temperature", "Tint",
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
    "LuminanceAdjustmentGreen", "LuminanceAdjustmentBlue",
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

    -- ── Film Soup — Chemiczna Korozja ─────────────────────────────────────────
    -- Zanurzenie kliszy w substancjach organicznych: smużyste przebarwienia,
    -- nielosowe anomalie barwne, lokalne degradacje nasycenia
    local soupScale = clamp((tonumber(props.filmSoup) or 0) / 100, 0, 1)
    if soupScale > 0 then
        local k = soupScale
        -- Chaotyczny shift półcieni — serce efektu "korozji"
        addD("ColorGradeMidtoneHue",          80 * k)   -- półcienie → żółtozielone (wypalony wywołacz)
        addD("ColorGradeMidtoneSat",          30 * k)
        -- Nierównomierne anomalie per kanał HSL
        addD("HueAdjustmentGreen",            35 * k)   -- zielony zabarwiony żółto (zasiedlenie bakterii)
        addD("HueAdjustmentOrange",          -25 * k)   -- skóra przesuwa się w stronę żółtozielonego
        addD("SaturationAdjustmentGreen",     20 * k)
        addD("SaturationAdjustmentOrange",   -18 * k)
        addD("SaturationAdjustmentBlue",     -25 * k)   -- niebieski traci chrominancję (degradacja warstwy)
        -- Ogólna degradacja detalu
        addD("Clarity2012",                  -20 * k)
        addD("Texture",                      -15 * k)
        -- Lekkie prześwietlenie cieni (neonowy tint Hard Light)
        addD("Shadows2012",                   12 * k)
        addD("ColorGradeShadowsHue",         110 * k)   -- cienie lekko żółtozielone
        addD("ColorGradeShadowsSat",          15 * k)
        -- Ograniczona degradacja luminancji
        addD("LuminanceAdjustmentOrange",    -10 * k)
        addD("LuminanceAdjustmentGreen",      -8 * k)
    end

    -- ── LomoChrome Color '92 — Degradacja Temperaturowa ──────────────────────
    -- Klimat lat 90.: mętne teal shadows, fade, zmęczone kolory
    local lomoScale = clamp((tonumber(props.lomoColor92) or 0) / 100, 0, 1)
    if lomoScale > 0 then
        local k = lomoScale
        -- Teal/zielone cienie (charakterystyczny odcień epoki)
        addD("ColorGradeShadowsHue",         190 * k)
        addD("ColorGradeShadowsSat",          22 * k)
        -- Fade — podniesienie czerni (wyblakła, stara klisza)
        addD("Blacks2012",                    20 * k)
        addD("Shadows2012",                   10 * k)
        -- Zmęczone, stonowane kolory
        addD("SaturationAdjustmentBlue",     -15 * k)
        addD("SaturationAdjustmentGreen",    -10 * k)
        addD("SaturationAdjustmentMagenta",  -12 * k)
        -- Negatywny mikrokontrast — mętny klimat
        addD("Clarity2012",                  -15 * k)
        addD("Texture",                      -10 * k)
        -- Lekkie ocieplenie półcieni (żółtawa baza celuloidu z lat 90.)
        addD("ColorGradeMidtoneHue",          45 * k)
        addD("ColorGradeMidtoneSat",           8 * k)
        -- Kompresja kontrastu
        addD("Contrast2012",                  -8 * k)
        addD("Highlights2012",               -10 * k)
    end

    -- ── CineStill 800T — Tungsten Shift ──────────────────────────────────────
    -- CineStill to klisza Kodak Vision3 500T bez warstwy Remjet.
    -- Efekt: ekstremalnie chłodny WB (Tungsten), czerwona halacja swiatel,
    -- brak warstwy antyhalacyjnej = rozlana czerwien.
    local cineScale = clamp((tonumber(props.cinestill800t) or 0) / 100, 0, 1)
    if cineScale > 0 then
        local k = cineScale
        -- Ekstremalny Tungsten shift — normalne swiatlo jarzeniowe staje sie niebieskie
        addD("Temperature",                 -2200 * k)  -- mocne ochłodzenie WB
        addD("Tint",                           12 * k)  -- lekka kompensacja zieleni
        -- Czerwona halacja świateł (brak Remjet)
        addD("ColorGradeHighlightsHue",        10 * k)  -- światła → czerwonawe
        addD("ColorGradeHighlightsSat",        30 * k)
        -- Odcień swiatel jeszcze cieplej przez SatAdj Red w swiatłach
        addD("SaturationAdjustmentRed",        18 * k)
        addD("HueAdjustmentRed",               -6 * k)  -- czerwony lekko w stronę pomarańczu
        -- Niebieski kanał podbity (chłodne midtony jak w Vision3)
        addD("SaturationAdjustmentBlue",       12 * k)
        addD("LuminanceAdjustmentBlue",         8 * k)
        -- Miękkie cienie z lekkim cyan
        addD("ColorGradeShadowsHue",          200 * k)
        addD("ColorGradeShadowsSat",           10 * k)
        -- Delikatne otwarcie cieni (typowe dla materiału filmowego)
        addD("Shadows2012",                     8 * k)
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
            catalog, tostring(actionName or "Panel IX apply"),
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
        LrDialogs.message("Panel IX", "Brak zaznaczonego zdjęcia.", "info")
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

    LrFunctionContext.postAsyncTaskWithContext("panel9_dialog", function(context)
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

            f:static_text({
                title = "Po stylach kinowych (Panel VIII): „chemia stołu”, epoka i halacja tungsten — nadal na natywnych suwakach Lightroom.",
                font = "<system/small>",
                fill_horizontal = 1,
                height_in_lines = 2,
            }),
            f:separator({ fill_horizontal = 1 }),

            sectionTitle("Uszkodzenia i chemia"),

            sliderRow("filmSoup",
                "Film Soup — chemiczna korozja",
                "Smużyste zniekształcenia po zanurzeniu kliszy w substancjach organicznych: chaotyczne przebarwienia półcieni, anomalie nasycenia per kanał, degradacja detalu."),

            sectionTitle("Klimat i epoki"),

            sliderRow("lomoColor92",
                "LomoChrome Color '92",
                "Mętny klimat lat 90.: teal w cieniach, fade (podniesione czernie), zmęczone stonowane kolory, lżejszy mikrokontrast."),

            sliderRow("cinestill800t",
                "CineStill 800T — Tungsten Shift",
                "Klisza kinowa bez warstwy Remjet: zimny balans (tungsten), czerwona halacja świateł, niebieskie midtony w stylu Vision3."),

            f:spacer({ height = 8 }),

            f:push_button({
                title = "Reset wszystkich",
                action = function()
                    for _, key in ipairs(SLIDER_KEYS) do props[key] = DEFAULTS[key] end
                end,
            }),
        })

        local result = LrDialogs.presentModalDialog({
            title      = "Panel IX — Chemia, Klimat i Epoki",
            actionVerb = "Zastosuj",
            cancelVerb = "Zamknij",
            save_frame = "mindfullens.panel9.dialog",
            contents   = f:scrolled_view({
                width = 560, height = 500,
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
                        "Analog Signature — Panel IX: chemia, klimat, epoki"
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
                    logger.error("Panel IX apply failed", { error = tostring(lastErr or "") })
                    LrDialogs.message("Panel IX", "Błąd zapisu: " .. tostring(lastErr or ""), "critical")
                    return
                end
            end

            saveToPrefs(prefs, props)
            logger.info("Panel IX committed", { keys = tostring(appliedCount) })

            local names = {}
            for _, key in ipairs(SLIDER_KEYS) do
                local v = tonumber(props[key]) or 0
                if v > 0 then names[#names + 1] = key .. "=" .. tostring(math.floor(v + 0.5)) end
            end
            LrDialogs.showBezel("Panel IX: " .. (#names > 0 and table.concat(names, "  ") or "zero"), 2.0)
        end
    end)
end

showDialog()
