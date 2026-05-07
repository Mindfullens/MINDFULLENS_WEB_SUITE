-- Panel VII — Matryca Barw: Kreacyjne Emulsje Specjalne
-- Suwaki 0-100 dla kazdego efektu emulsji.
-- Mapowanie na natywne suwaki LR (delta-blending wzorzec Panel V):
--   lomoPurple    → HueAdj Green→magenta + SatAdj Green↓ + HueAdj Blue shift
--   lomoTurquoise → HueAdj Red/Orange→teal + HueAdj Yellow→zielony + Temp cool
--   metropolis    → Bleach Bypass: Saturation↓ + Contrast↑ + Clarity↑ + Shadows↓ (HSL mask chroni czerwień)
--   redscale      → SatAdj Blue/Green↓↓ + HueAdj Blue→czerwien + ekspozycja log
--   crossProcess  → ColorGrade Shadows→cyan + Highlights→zolty + HSL shifted per-channel

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
    lomoPurple    = 0,
    lomoTurquoise = 0,
    metropolis    = 0,
    redscale      = 0,
    crossProcess  = 0,
}

local RANGES = {
    lomoPurple    = { min = 0, max = 100 },
    lomoTurquoise = { min = 0, max = 100 },
    metropolis    = { min = 0, max = 100 },
    redscale      = { min = 0, max = 100 },
    crossProcess  = { min = 0, max = 100 },
}

local SLIDER_KEYS = {
    "lomoPurple", "lomoTurquoise", "metropolis", "redscale", "crossProcess",
}

local PREF_PREFIX = "panel7_"

local PREVIEW_KEYS = {
    "Temperature", "Tint",
    "Saturation", "Vibrance",
    "Contrast2012", "Clarity2012", "Dehaze", "Texture",
    "Highlights2012", "Whites2012", "Shadows2012", "Blacks2012",
    "HueAdjustmentRed",    "HueAdjustmentOrange", "HueAdjustmentYellow",
    "HueAdjustmentGreen",  "HueAdjustmentAqua",   "HueAdjustmentBlue",
    "HueAdjustmentPurple", "HueAdjustmentMagenta",
    "SaturationAdjustmentRed",    "SaturationAdjustmentOrange",
    "SaturationAdjustmentYellow", "SaturationAdjustmentGreen",
    "SaturationAdjustmentAqua",   "SaturationAdjustmentBlue",
    "SaturationAdjustmentPurple", "SaturationAdjustmentMagenta",
    "LuminanceAdjustmentRed",     "LuminanceAdjustmentGreen",
    "LuminanceAdjustmentBlue",
    "ColorGradeShadowsHue",    "ColorGradeShadowsSat",
    "ColorGradeHighlightsHue", "ColorGradeHighlightsSat",
    "ColorGradeMidtoneHue",    "ColorGradeMidtoneSat",
    "ColorGradeBlending",      "ColorGradeBalance",
    "Exposure2012",
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

    -- ── LomoChrome Purple (Purple Matrix Shift) ──────────────────────────────
    -- Rearanżacja dominacji: zielenie → magenta/purpura
    local purpleScale = clamp((tonumber(props.lomoPurple) or 0) / 100, 0, 1)
    if purpleScale > 0 then
        local k = purpleScale
        addD("HueAdjustmentGreen",          -120 * k)  -- zielony → żółtozielony→magenta
        addD("HueAdjustmentYellow",          -40 * k)  -- żółty przesuwa się w stronę pomarańczy
        addD("HueAdjustmentAqua",            -80 * k)  -- akwa → purpura
        addD("SaturationAdjustmentGreen",    -35 * k)  -- rozmyta saturacja zielonych
        addD("SaturationAdjustmentAqua",      20 * k)  -- akwa podbita by tworzyć fiolet
        addD("HueAdjustmentBlue",             30 * k)  -- niebieski lekko w stronę purpury
        addD("SaturationAdjustmentBlue",      15 * k)
        addD("LuminanceAdjustmentGreen",     -10 * k)  -- przyciemnienie zieleni dla efektu barwnikowego
    end

    -- ── LomoChrome Turquoise (Przesunięcie Fazowe) ───────────────────────────
    -- Rotacja wektora ciepłe→chłodne: czerwień→cyan, pomarańcz→teal
    local turqScale = clamp((tonumber(props.lomoTurquoise) or 0) / 100, 0, 1)
    if turqScale > 0 then
        local k = turqScale
        addD("HueAdjustmentRed",             120 * k)  -- czerwony → cyan (dopełnienie ~180°)
        addD("HueAdjustmentOrange",           90 * k)  -- pomarańcz → teal
        addD("HueAdjustmentYellow",           60 * k)  -- żółty → zielony
        addD("HueAdjustmentGreen",            20 * k)  -- zielony → akwa
        addD("SaturationAdjustmentRed",       10 * k)  -- lekki boost dla czytelności przesunięcia
        addD("SaturationAdjustmentOrange",    15 * k)
        addD("SaturationAdjustmentYellow",     8 * k)
        addD("ColorGradeShadowsHue",         190 * k)  -- cienie w kierunku teal
        addD("ColorGradeShadowsSat",          18 * k)
    end

    -- ── LomoChrome Metropolis (Kompresja Tonalna / Bleach Bypass) ────────────
    -- Efekt obejścia bielenia: dramatyczne czernie, zgaszone kolory
    local metropScale = clamp((tonumber(props.metropolis) or 0) / 100, 0, 1)
    if metropScale > 0 then
        local k = metropScale
        addD("Contrast2012",                  40 * k)
        addD("Clarity2012",                   30 * k)
        addD("Shadows2012",                  -40 * k)
        addD("Blacks2012",                   -25 * k)
        -- Globalne gaszenie nasycenia — ale czerwień chroniona (maskowanie HSL)
        addD("SaturationAdjustmentOrange",   -30 * k)
        addD("SaturationAdjustmentYellow",   -40 * k)
        addD("SaturationAdjustmentGreen",    -50 * k)
        addD("SaturationAdjustmentAqua",     -45 * k)
        addD("SaturationAdjustmentBlue",     -35 * k)
        addD("SaturationAdjustmentPurple",   -40 * k)
        addD("SaturationAdjustmentMagenta",  -30 * k)
        -- Czerwień celowo nie tknięta — chronimy chrominancję kanału R
        addD("LuminanceAdjustmentGreen",     -12 * k)
        addD("LuminanceAdjustmentBlue",       -8 * k)
    end

    -- ── Redscale (Optyczna Przenikalność) ────────────────────────────────────
    -- Celuloid pomarańczowy blokuje fale niebieskie/zielone
    local redScale = clamp((tonumber(props.redscale) or 0) / 100, 0, 1)
    if redScale > 0 then
        local k = redScale
        -- Blokada kanałów B i G
        addD("SaturationAdjustmentBlue",     -80 * k)
        addD("SaturationAdjustmentAqua",     -70 * k)
        addD("SaturationAdjustmentGreen",    -60 * k)
        addD("LuminanceAdjustmentBlue",      -30 * k)
        addD("LuminanceAdjustmentGreen",     -20 * k)
        -- Przesunięcie odcienia niebieskiego w kierunku czerwieni
        addD("HueAdjustmentBlue",           -100 * k)
        addD("HueAdjustmentAqua",            -80 * k)
        -- Ciepły zafarb całości + ekspozycja logarytmicznie odblokowana
        addD("ColorGradeHighlightsHue",       30 * k)  -- ciepłe światła
        addD("ColorGradeHighlightsSat",       25 * k)
        addD("ColorGradeShadowsHue",          20 * k)  -- ciepłe cienie
        addD("ColorGradeShadowsSat",          15 * k)
        addD("Whites2012",                    12 * k)  -- prześwietlenie symulujące naświetlenie kliszy od tyłu
        addD("Highlights2012",                 8 * k)
    end

    -- ── Cross Processing (Niestabilność Układów E-6→C-41) ────────────────────
    -- Destrukcyjne rozdzielenie kanałów, chaos barwny
    local crossScale = clamp((tonumber(props.crossProcess) or 0) / 100, 0, 1)
    if crossScale > 0 then
        local k = crossScale
        -- Drastyczne split toning: cienie→cyan, światła→żółty/zielony
        addD("ColorGradeShadowsHue",         195 * k)  -- cienie: cyan
        addD("ColorGradeShadowsSat",          45 * k)
        addD("ColorGradeHighlightsHue",       60 * k)  -- światła: żółty
        addD("ColorGradeHighlightsSat",       35 * k)
        addD("ColorGradeMidtoneHue",         240 * k)  -- półcienie: niebieski/fiolet
        addD("ColorGradeMidtoneSat",          20 * k)
        addD("ColorGradeBlending",           -20 * k)  -- mocniejsze przejścia stref
        -- Kanały HSL shifted dla chaosu E-6→C-41
        addD("HueAdjustmentGreen",            50 * k)  -- zielenie w kierunku żółtozielonym
        addD("HueAdjustmentBlue",            -40 * k)  -- niebieski w kierunku zieleni
        addD("SaturationAdjustmentYellow",    30 * k)
        addD("SaturationAdjustmentGreen",     25 * k)
        addD("Contrast2012",                  20 * k)
        addD("Highlights2012",               -15 * k)  -- kompresja świateł jak w E-6
        addD("Shadows2012",                   10 * k)
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
            catalog, tostring(actionName or "Panel VII apply"),
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
    local ok = pcall(function() readback = photo:getDevelopSettings() or {} end)
    if not ok then return 0, 0 end
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
        LrDialogs.message("Panel VII", "Brak zaznaczonego zdjęcia.", "info")
        return
    end

    local prefs = LrPrefs.prefsForPlugin()
    local saved = loadFromPrefs(prefs)

    local baselineDev = {}
    local okBase = pcall(function()
        baselineDev = developPreview.captureValues(PREVIEW_KEYS) or {}
    end)
    if not okBase then baselineDev = {} end

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
                    for _, e in ipairs(previewEntries) do
                        restore[e.key] = e.originalValue
                    end
                    developPreview.applySettings(restore, { logFailures = true })
                end)
            end
        end
        previewApplied = false
        previewEntries = {}
    end

    LrFunctionContext.postAsyncTaskWithContext("panel7_dialog", function(context)
        local f    = LrView.osFactory()
        local props = LrBinding.makePropertyTable(context)

        for _, key in ipairs(SLIDER_KEYS) do
            props[key] = saved[key]
        end

        -- live preview on slider change
        local function triggerPreview()
            if dialogClosing then return end
            if not developPreview.isDevelopModuleActive() then return end
            LrTasks.startAsyncTask(function()
                if dialogClosing then return end
                local settings = buildDevelopSettings(props, baselineDev)
                if previewApplied then
                    restoreBaseline()
                end
                local okP = pcall(function()
                    local entries = developPreview.captureValues(PREVIEW_KEYS)
                    developPreview.applySettings(settings, { logFailures = false })
                    previewEntries = entries or {}
                    previewApplied = true
                end)
                if not okP then previewApplied = false end
            end)
        end

        for _, key in ipairs(SLIDER_KEYS) do
            props:addObserver(key, function() triggerPreview() end)
        end

        -- ── UI helpers ──────────────────────────────────────────────────────

        local function sectionTitle(text)
            return f:static_text({
                title     = text,
                font      = "<system/bold>",
                fill_horizontal = 1,
                margin_bottom   = 4,
                margin_top      = 10,
            })
        end

        local function sliderRow(key, label, note)
            local r = RANGES[key]
            return f:column({
                fill_horizontal = 1,
                spacing         = 2,
                f:static_text({ title = label, font = "<system/bold>" }),
                f:row({
                    fill_horizontal = 1,
                    f:slider({
                        value       = LrView.bind(key),
                        min         = r.min,
                        max         = r.max,
                        integral    = true,
                        width_in_chars = 28,
                        fill_horizontal = 1,
                    }),
                    f:edit_field({
                        value       = LrView.bind(key),
                        min         = r.min,
                        max         = r.max,
                        precision   = 0,
                        width_in_chars = 4,
                    }),
                }),
                note and f:static_text({
                    title           = note,
                    font            = "<system/small>",
                    fill_horizontal = 1,
                    height_in_lines = 2,
                }) or f:spacer({ height = 0 }),
                f:separator({ fill_horizontal = 1 }),
            })
        end

        local content = f:column({
            fill_horizontal = 1,
            spacing         = 6,
            margin_horizontal = 14,

            f:static_text({
                title = "Po wcześniejszych panelach (ton i materiał): matryca kreacyjnych „emulsji” — mapowanie na HSL i Color Grade. Podgląd przy przesuwaniu suwaka w Develop.",
                font = "<system/small>",
                fill_horizontal = 1,
                height_in_lines = 2,
            }),
            f:separator({ fill_horizontal = 1 }),

            sectionTitle("Matryca Barw — LomoChrome"),

            sliderRow("lomoPurple",
                "LomoChrome Purple",
                "Purple Matrix Shift: zieleń przesuwa się w stronę magenty i purpury. Rearanżacja dominacji barwników."),

            sliderRow("lomoTurquoise",
                "LomoChrome Turquoise",
                "Przesunięcie fazowe (ok. 90–120°): ciepłe barwy (czerwień, pomarańcz) schodzą w turkus i teal."),

            sliderRow("metropolis",
                "LomoChrome Metropolis",
                "Kompresja tonalna / bleach bypass: głębsze czernie, przygasłe kolory. Czerwień chroniona przed utratą chrominancji."),

            sectionTitle("Materiały specjalne"),

            sliderRow("redscale",
                "Redscale",
                "Optyczna przenikalność: odcięcie niebieskiego i zieleni przez pomarańczowy podkład celuloidu. Wyraźny ciepło-czerwony shift."),

            sliderRow("crossProcess",
                "Cross Processing",
                "Niestabilność procesów E-6 w C-41: rozjeżdżanie kanałów. Cienie → cyan, światła → żółć, półcienie → fiolet."),

            f:spacer({ height = 8 }),

            f:push_button({
                title  = "Reset wszystkich",
                action = function()
                    for _, key in ipairs(SLIDER_KEYS) do
                        props[key] = DEFAULTS[key]
                    end
                end,
            }),
        })

        local result = LrDialogs.presentModalDialog({
            title       = "Panel VII — Matryca Barw: Kreacyjne Emulsje Specjalne",
            actionVerb  = "Zastosuj",
            cancelVerb  = "Zamknij",
            save_frame  = "mindfullens.panel7.dialog",
            contents    = f:scrolled_view({
                width               = 560,
                height              = 600,
                horizontal_scroller = false,
                vertical_scroller   = true,
                content             = content,
            }),
        })

        dialogClosing = true
        if previewApplied then restoreBaseline() end

        if result == "ok" then
            -- Switch to Develop module
            pcall(function() LrApplicationView.switchToModule("develop") end)
            LrTasks.sleep(0.05)

            local currentSettings = {}
            pcall(function()
                currentSettings = targetPhoto:getDevelopSettings() or {}
            end)

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
                        "Analog Signature — Panel VII: matryca barw"
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
                    logger.error("Panel VII apply failed", { error = tostring(lastErr or "") })
                    LrDialogs.message("Panel VII", "Błąd zapisu: " .. tostring(lastErr or ""), "critical")
                    return
                end
            end

            saveToPrefs(prefs, props)
            logger.info("Panel VII committed", { keys = tostring(appliedCount) })

            local names = {}
            for _, key in ipairs(SLIDER_KEYS) do
                local v = tonumber(props[key]) or 0
                if v > 0 then
                    names[#names + 1] = key .. "=" .. tostring(math.floor(v + 0.5))
                end
            end
            local summary = #names > 0 and table.concat(names, "  ") or "zero"
            LrDialogs.showBezel("Panel VII: " .. summary, 2.0)
        end
    end)
end

showDialog()
