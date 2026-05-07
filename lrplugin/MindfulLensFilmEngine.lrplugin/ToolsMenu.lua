local LrApplication = import "LrApplication"
local LrApplicationView = import "LrApplicationView"
local LrBinding = import "LrBinding"
local LrDialogs = import "LrDialogs"
local LrFunctionContext = import "LrFunctionContext"
local LrPrefs = import "LrPrefs"
local LrTasks = import "LrTasks"
local LrView = import "LrView"
local LrPathUtils = import "LrPathUtils"

local function pluginLoad(relativePath)
    return dofile(LrPathUtils.child(_PLUGIN.path, relativePath))
end

local logger = pluginLoad("lib/Logger.lua")
local xmpLoader = pluginLoad("lib/XmpPresetLoader.lua")
local developSettingsScale = pluginLoad("lib/DevelopSettingsScale.lua")
local developPreview = pluginLoad("lib/DevelopPreview.lua")
local catalogWrite = pluginLoad("lib/CatalogWrite.lua")
local colorResolver = pluginLoad("lib/ColorSystemResolver.lua")
local colorCatalog = pluginLoad("lib/ColorSystemCatalog.lua")
local photoScopedPrefs = pluginLoad("lib/PhotoScopedPrefs.lua")
local colorManifest = colorCatalog.visibleManifest(_PLUGIN.path)
local TOOL_STRENGTH_MULTIPLIER = developSettingsScale.DEFAULT_MULTIPLIER

local TOOL_FIELD_MULTIPLIER = {
    halation = 0.55,
    bloom = 0.25,
}

local DELTA_BLEND_FIELDS = {
    halation = true,
    bloom = true,
}

local MODULAR_LIBRARY = {
    prep = {
        label = "Przygotowanie Negatywu",
        caption = "Usuń artefakty optyczne przed wejściem obrazu w łańcuch ciemni.",
        field = "prepDefringe",
        rowLabel = "Oczyszczenie Aberracji",
        items = {
            { title = "Reset (0)", value = "off" },
            { title = "Poziom I | Delikatne", value = "profiles/modular/prep/prep_defringe_soft.xmp" },
            { title = "Poziom III | Głębokie", value = "profiles/modular/prep/prep_defringe_strong.xmp" },
        },
    },
    release_print = {
        label = "Odbitka Referencyjna",
        caption = "Emulacja odbitki kinowej bez mieszania jej z papierem finalnym.",
        field = "releasePrint",
        rowLabel = "Sygnatura Odbitki",
        items = {
            { title = "Reset (0)", value = "off" },
            { title = "Poziom II | Kodak 2383", value = "profiles/modular/print/print_kodak_2383_soft.xmp" },
        },
    },
    paper_print = {
        label = "Papier Finalny",
        caption = "Wybierz papier finalny osobno, bez duplikowania sygnatury odbitki.",
        field = "paperPrint",
        rowLabel = "Powierzchnia Papieru",
        items = {
            { title = "Reset (0)", value = "off" },
            { title = "Poziom II | Kodak Endura Ciepły", value = "profiles/modular/print/print_kodak_endura_warm.xmp" },
            { title = "Poziom II | Fuji Crystal Czysty", value = "profiles/modular/print/print_fuji_crystal_clean.xmp" },
        },
    },
    halation = {
        label = "Połysk Barytowy",
        caption = "Finalny etap odbitki: charakter światła po suszeniu i szkleniu papieru.",
        field = "halation",
        rowLabel = "Połysk Odbitki",
        items = {
            { title = "Reset (0)", value = "off" },
            { title = "Poziom I | Satyna Barytowa", value = "profiles/modular/print/final_paper_glaze_soft.xmp" },
            { title = "Poziom III | Polerowana Baryta", value = "profiles/modular/print/final_paper_glaze_strong.xmp" },
        },
    },
    bloom = {
        label = "Dyfuzja Bloom",
        caption = "Kontrola bloom niezależna od połysku papieru.",
        field = "bloom",
        rowLabel = "Bloom",
        items = {
            { title = "Reset (0)", value = "off" },
            { title = "Poziom I | Bloom Soft", value = "profiles/modular/optics/bloom_soft.xmp" },
            { title = "Poziom II | Bloom Strong", value = "profiles/modular/optics/bloom_strong.xmp" },
        },
    },
    vignette = {
        label = "Winieta Odbitki",
        caption = "Subtelne domknięcie kadru dla finalnej odbitki.",
        field = "vignette",
        rowLabel = "Winieta",
        items = {
            { title = "Reset (0)", value = "off" },
            { title = "Poziom I | Subtelna", value = "profiles/modular/optics/vignette_soft.xmp" },
            { title = "Poziom II | Klasyczna", value = "profiles/modular/optics/vignette_medium.xmp" },
            { title = "Poziom III | Głęboka", value = "profiles/modular/optics/vignette_strong.xmp" },
        },
    },
    grain = {
        label = "Tekstura Emulsji",
        caption = "Kontrola ziarna jako osobny etap, po kolorze i tonie.",
        field = "grain",
        rowLabel = "Struktura Ziarna",
        items = {
            { title = "Reset (0)", value = "off" },
            { title = "Poziom I | 35mm Fine", value = "profiles/modular/grain/grain_35mm_soft.xmp" },
            { title = "Poziom III | 35mm Rough", value = "profiles/modular/grain/grain_35mm_rough.xmp" },
            { title = "Poziom II | 120 Clean", value = "profiles/modular/grain/grain_120_clean.xmp" },
        },
    },
}

local SYSTEM_TITLES = {
    bw = "Silver Gelatin Monochrome",
    ektar = "Kodak Ektar Signature",
    gold = "Kodak Gold Color Story",
    fuji = "Fujifilm Chroma Atelier",
    fuji_consumer = "Fujifilm Consumer Negative",
    fuji_pro = "Fujifilm Pro Negative",
    fuji_slide = "Fujifilm Slide Atelier",
    kodachrome = "Kodachrome Heritage",
    portra = "Kodak Portra Signature",
    vision3 = "Kodak Vision3 Cinema",
}

local GROUPS = {
    stage01_stock = {
        stageId = "01",
        field = "stockMaster",
        header = "A) Materiał Bazowy",
        caption = "Wybierz materiał główny: negatyw, slajd, stock filmowy lub B&W.",
        rowLabel = "Materiał Główny",
        allowAll = true,
    },
    stage02_scan_neutrality = {
        stageId = "02",
        field = "scanNeutrality",
        header = "B) Neutralność Skanu",
        caption = "Ustaw czysty punkt startowy skanu przed dalszym kształtowaniem.",
        rowLabel = "Neutralność",
        match = { "clean canvas", "natural" },
    },
    stage02_lab_balance = {
        stageId = "02",
        field = "labBalance",
        header = "C) Balans Ciemni",
        caption = "Balans chemiczny: dzienny, tungsten lub ciepła korekta procesu.",
        rowLabel = "Balans",
        match = { "balance", "warm fix", "cool balance", "indoor balance", "tungsten clean", "warm control" },
    },
    stage02_skin_harmony = {
        stageId = "02",
        field = "skinHarmony",
        header = "D) Harmonia Skóry",
        caption = "Kontrola odcieni skóry bez cyfrowej czerwieni i magenty.",
        rowLabel = "Skóra",
        match = { "reduce redness", "soft touch" },
    },
    stage02_negative_density = {
        stageId = "02",
        field = "negativeDensity",
        header = "E) Gęstość Negatywu",
        caption = "Kształtuj toe, shoulder i miękkość gęstości negatywu.",
        rowLabel = "Gęstość",
        match = { "highlight soft", "shadow open", "soft control" },
    },
    stage03_palette = {
        stageId = "03",
        field = "paletteShape",
        header = "F) Sygnatura Palety",
        caption = "Kształt palety i separacji barw w stylu analogowej ciemni.",
        rowLabel = "Paleta",
        match = { "calm colors", "color separation", "pastel" },
    },
    stage03_tonal_architecture = {
        stageId = "03",
        field = "tonalArchitecture",
        header = "G) Architektura Tonalna",
        caption = "Buduj głębię i separację tonalną bez utraty filmowej miękkości.",
        rowLabel = "Ton",
        match = { "contrast", "depth", "tonal separation" },
    },
    stage03_subject = {
        stageId = "03",
        field = "subjectRender",
        header = "H) Obecność Tematu",
        caption = "Wzmocnij temat główny bez sztucznej cyfrowej ostrości.",
        rowLabel = "Temat",
        match = { "subject focus", "subject polish", "subject lift" },
    },
    stage03_atmosphere = {
        stageId = "03",
        field = "atmosphereShape",
        header = "I) Atmosfera Kadru",
        caption = "Powietrze, wrap światła i miękkość skanu premium.",
        rowLabel = "Atmosfera",
        match = { "film fade", "light wrap", "soft" },
    },
    stage03_edge_definition = {
        stageId = "03",
        field = "edgeDefinition",
        header = "J) Definicja Krawędzi",
        caption = "Kontrola granicy między miękkością i precyzją detalu.",
        rowLabel = "Krawędzie",
        match = { "crisp" },
    },
    stage04_shadow_weight = {
        stageId = "04",
        field = "shadowWeight",
        header = "K) Waga Cieni",
        caption = "Ustaw finalną siłę cieni: od otwartych po głębokie kinowe.",
        rowLabel = "Cienie",
        match = { "deep shadows" },
    },
    stage04_highlight_silk = {
        stageId = "04",
        field = "highlightSilk",
        header = "L) Jedwabne Światła",
        caption = "Kontrola roll-off świateł, aby biele były miękkie i eleganckie.",
        rowLabel = "Światła",
        match = { "soft highlights" },
    },
    stage04_surface_finish = {
        stageId = "04",
        field = "surfaceFinish",
        header = "M) Finisz Powierzchni",
        caption = "Wybierz finalny charakter powierzchni odbitki.",
        rowLabel = "Powierzchnia",
        match = { "soft pastel", "matte fade" },
    },
    stage04_texture_signature = {
        stageId = "04",
        field = "textureSignature",
        header = "N) Sygnatura Tekstury",
        caption = "Dotykowa tekstura finalna, jak z realnej odbitki.",
        rowLabel = "Tekstura",
        match = { "texture" },
    },
}

local GROUP_ORDER = {
    "stage01_stock",
    "stage02_scan_neutrality",
    "stage02_lab_balance",
    "stage02_skin_harmony",
    "stage02_negative_density",
    "stage03_palette",
    "stage03_tonal_architecture",
    "stage03_subject",
    "stage03_atmosphere",
    "stage03_edge_definition",
    "stage04_shadow_weight",
    "stage04_highlight_silk",
    "stage04_surface_finish",
    "stage04_texture_signature",
}

local PRINT_FIELD_ORDER = {
    "halation",
    "bloom",
    "vignette",
    "grain",
}

local PRINT_OPTICS_FIELD_ORDER = {
    "halation",
    "vignette",
}

local function isPrintTarget(target)
    local t = tostring(target or "")
    return t == "print" or t == "print_optics"
end

local function activePrintFieldOrder(target)
    if tostring(target or "") == "print_optics" then
        return PRINT_OPTICS_FIELD_ORDER
    end
    return PRINT_FIELD_ORDER
end

local FIELD_ALLOWED_KEYS = {
    prepDefringe = {
        DefringePurpleAmount = true,
        DefringePurpleHueLo = true,
        DefringePurpleHueHi = true,
        DefringeGreenAmount = true,
        DefringeGreenHueLo = true,
        DefringeGreenHueHi = true,
    },
    halation = {
        Highlights2012 = true,
        Whites2012 = true,
        Blacks2012 = true,
        Dehaze = true,
        Texture = true,
    },
    bloom = {
        Clarity2012 = true,
        Texture = true,
        Dehaze = true,
        Highlights2012 = true,
        Shadows2012 = true,
        Whites2012 = true,
        Vibrance = true,
        ColorGradeHighlightsHue = true,
        ColorGradeHighlightsSat = true,
        ColorGradeBalance = true,
    },
    vignette = {
        PostCropVignetteAmount = true,
        PostCropVignetteMidpoint = true,
        PostCropVignetteRoundness = true,
        PostCropVignetteFeather = true,
        PostCropVignetteHighlights = true,
    },
    grain = {
        GrainAmount = true,
        GrainSize = true,
        GrainFrequency = true,
        Texture = true,
    },
}

local function merge(into, from)
    if not from then return end
    for k, v in pairs(from) do
        into[k] = v
    end
end

local function trySwitchToDevelopModule()
    if developPreview.isDevelopModuleActive() then
        return true
    end
    pcall(function()
        LrApplicationView.switchToModule("develop")
    end)
    return developPreview.isDevelopModuleActive()
end

local function normalize(value)
    value = string.lower(value or "")
    value = value:gsub("&", "and")
    value = value:gsub("[^%w]+", " ")
    value = value:gsub("%s+", " ")
    value = value:gsub("^%s+", "")
    value = value:gsub("%s+$", "")
    return value
end

local function titleMatches(entryTitle, patterns)
    local hay = normalize(entryTitle)
    for _, pattern in ipairs(patterns or {}) do
        local needle = normalize(pattern)
        if needle ~= "" and hay:find(needle, 1, true) then
            return true
        end
    end
    return false
end

local function buildSystemItems()
    local items = {}
    for _, key in ipairs(colorCatalog.systemKeys(_PLUGIN.path, { manifest = colorManifest })) do
        table.insert(items, { title = SYSTEM_TITLES[key] or key, value = key })
    end
    return items
end

local function entriesForStage(systemKey, stageId)
    local system = colorManifest[systemKey]
    if not system or not system.stages then return {} end
    return system.stages[stageId] or {}
end

local function buildGroupItems(systemKey, groupKey)
    local group = GROUPS[groupKey]
    local items = { { title = "Reset (0)", value = "off" } }
    local seen = {}
    for _, entry in ipairs(entriesForStage(systemKey, group.stageId)) do
        local include = group.allowAll or titleMatches(entry.title, group.match)
        if include and not seen[entry.path] then
            table.insert(items, { title = entry.title, value = entry.path })
            seen[entry.path] = true
        end
    end
    return items
end

local function groupHasChoices(props, groupKey)
    local group = GROUPS[groupKey]
    local items = props[group.field .. "Items"] or {}
    return #items > 1
end

local function refreshMenus(props)
    for _, groupKey in ipairs(GROUP_ORDER) do
        local group = GROUPS[groupKey]
        local itemsField = group.field .. "Items"
        props[itemsField] = buildGroupItems(props.system, groupKey)
        local selected = props[group.field]
        local valid = false
        for _, item in ipairs(props[itemsField]) do
            if item.value == selected then valid = true break end
        end
        if not valid then props[group.field] = "off" end
    end
end

local function buildSelectedEntriesForTarget(props, toolTarget)
    local entries = {}
    if isPrintTarget(toolTarget) then
        for _, field in ipairs(activePrintFieldOrder(toolTarget)) do
            entries[#entries + 1] = {
                field = field,
                path = tostring(props[field] or "off"),
            }
        end
        return entries
    end

    for _, groupKey in ipairs(GROUP_ORDER) do
        local field = GROUPS[groupKey].field
        entries[#entries + 1] = {
            field = field,
            path = tostring(props[field] or "off"),
        }
    end
    entries[#entries + 1] = {
        field = "prepDefringe",
        path = tostring(props.prepDefringe or "off"),
    }
    return entries
end

local function filterSettingsForField(settings, field)
    local allow = FIELD_ALLOWED_KEYS[field]
    if not allow then
        return settings
    end
    local filtered = {}
    for key, value in pairs(settings or {}) do
        if allow[tostring(key)] == true then
            filtered[key] = value
        end
    end
    return filtered
end

local DEVELOP_KEY_ALIASES = {
    Contrast2012 = { "Contrast2012", "Contrast" },
    Highlights2012 = { "Highlights2012", "Highlights" },
    Shadows2012 = { "Shadows2012", "Shadows" },
    Whites2012 = { "Whites2012", "Whites" },
    Blacks2012 = { "Blacks2012", "Blacks" },
    Clarity2012 = { "Clarity2012", "Clarity" },
}

local function candidateReadbackKeys(key)
    local mapped = DEVELOP_KEY_ALIASES[tostring(key)]
    if mapped then
        return mapped
    end
    return { tostring(key) }
end

local function getNumericWithFallback(settings, key)
    if type(settings) ~= "table" then
        return nil
    end
    for _, readKey in ipairs(candidateReadbackKeys(key)) do
        local numeric = tonumber(settings[readKey])
        if numeric ~= nil then
            return numeric
        end
    end
    return nil
end

local function applyBaselineAliases(targetSettings, key, numericValue)
    if type(targetSettings) ~= "table" then
        return
    end
    targetSettings[tostring(key)] = numericValue
    for _, alias in ipairs(candidateReadbackKeys(key)) do
        if targetSettings[alias] == nil then
            targetSettings[alias] = numericValue
        end
    end
end

local function anyPrintToolSelected(state, fieldOrder)
    for _, field in ipairs(fieldOrder or PRINT_FIELD_ORDER) do
        if tostring(state[field] or "off") ~= "off" then
            return true
        end
    end
    return false
end

local function buildMergedSettings(selectedEntries, baselineSettings)
    local merged = {}
    local loadedCount = 0
    local function mergedBaselineValue(key)
        local inMerged = tonumber(merged[key])
        if inMerged ~= nil then
            return inMerged
        end
        local inBaseline = getNumericWithFallback(baselineSettings, key)
        if inBaseline ~= nil then
            return inBaseline
        end
        return 0
    end

    for _, entry in ipairs(selectedEntries or {}) do
        local field = nil
        local relPath = entry
        if type(entry) == "table" and (entry.path ~= nil or entry.field ~= nil) then
            field = tostring(entry.field or "")
            relPath = entry.path
        end

        if type(relPath) == "table" then
            -- Direct develop settings payload (used for restoring baseline keys when toggling a tool to Off).
            merge(merged, relPath)
            loadedCount = loadedCount + 1
        elseif relPath and relPath ~= "off" then
            local absPath = LrPathUtils.child(_PLUGIN.path, relPath)
            local settings, err = xmpLoader.loadDevelopSettings(absPath)
            if not settings then
                return false, "Cannot load tool XMP: " .. tostring(relPath) .. "\n" .. tostring(err)
            end
            settings = filterSettingsForField(settings, field)
            local fieldMultiplier = tonumber(TOOL_FIELD_MULTIPLIER[tostring(field or "")]) or 1.0
            local appliedMultiplier = TOOL_STRENGTH_MULTIPLIER * fieldMultiplier
            local scaledSettings = developSettingsScale.scale(settings, appliedMultiplier)
            if DELTA_BLEND_FIELDS[tostring(field or "")] == true then
                for key, value in pairs(scaledSettings or {}) do
                    local delta = tonumber(value)
                    if delta ~= nil then
                        merged[key] = mergedBaselineValue(key) + delta
                    elseif merged[key] == nil then
                        merged[key] = value
                    end
                end
            else
                merge(merged, scaledSettings)
            end
            loadedCount = loadedCount + 1
        end
    end
    if loadedCount == 0 then
        return false, "Nie wybrano żadnych narzędzi"
    end
    return true, nil, merged, loadedCount
end

local function keysOf(settings)
    local out = {}
    for key, value in pairs(settings or {}) do
        if tonumber(value) ~= nil then
            out[#out + 1] = tostring(key)
        end
    end
    return out
end

local function countReadbackMatches(photo, expectedSettings, tolerance)
    local expectedKeys = {}
    for key, value in pairs(expectedSettings or {}) do
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
        local readOk, raw = pcall(function()
            return photo:getDevelopSettings() or {}
        end)
        if not readOk or type(raw) ~= "table" then
            return 0
        end
        readSettings = raw
    end

    local matched = 0
    local tol = tonumber(tolerance) or 2.0
    for key, targetValue in pairs(expectedSettings or {}) do
        local targetNum = tonumber(targetValue)
        if targetNum ~= nil then
            local got = nil
            for _, readKey in ipairs(candidateReadbackKeys(key)) do
                if readSettings[readKey] ~= nil then
                    got = readSettings[readKey]
                    break
                end
            end

            local gotNum = tonumber(got)
            if gotNum ~= nil then
                if math.abs(gotNum - targetNum) <= tol then
                    matched = matched + 1
                end
            elseif tostring(got) == tostring(targetValue) then
                matched = matched + 1
            end
        end
    end
    return matched
end

local function applyMergedSettingsWithFallback(photo, merged)
    local catalog = LrApplication.activeCatalog()
    local okCatalog, errCatalog = catalogWrite.run(
        catalog,
        "MindfulLens Step 2 Commit",
        function()
            photo:applyDevelopSettings(merged)
        end,
        { attempts = 12, sleep = 0.08, sleepMax = 0.40 }
    )
    if okCatalog then
        return true, nil, "catalog_write_primary"
    end

    local fallbackErr = tostring(errCatalog or "apply_failed")
    if trySwitchToDevelopModule() then
        local okPreview, errPreview = developPreview.applySettings(merged, { logFailures = true })
        if okPreview then
            logger.warn("Tools saved via DevelopController fallback after catalog failure", {
                error = fallbackErr,
            })
            return true, nil, "develop_controller_fallback_after_catalog"
        end
        fallbackErr = tostring(errPreview or fallbackErr)
    end

    return false, fallbackErr, "all_paths_failed"
end

local function applyMergedSettingsDeterministic(photo, merged)
    local hasSettings = false
    for _ in pairs(merged or {}) do
        hasSettings = true
        break
    end
    if not hasSettings then
        return true, nil, "no_settings"
    end

    return applyMergedSettingsWithFallback(photo, merged)
end

local function countTableEntries(source)
    local count = 0
    for _ in pairs(source or {}) do
        count = count + 1
    end
    return count
end

local function applyXmpStack(photo, selectedEntries, options)
    local opts = options or {}
    local targetKind = tostring(opts.target or "lab")
    local minMatched = tonumber(opts.minMatched)
    if minMatched == nil then
        minMatched = (targetKind == "print") and 4 or 1
    end

    local explicitBaseline = type(opts.baselineSettings) == "table" and opts.baselineSettings or nil
    local baselineSettings = explicitBaseline or {}
    if explicitBaseline == nil then
        local gotBaseline, baseline = pcall(function()
            return photo:getDevelopSettings() or {}
        end)
        if gotBaseline and type(baseline) == "table" then
            baselineSettings = baseline
        end
    end

    local ok, err, merged, loadedCount = buildMergedSettings(selectedEntries, baselineSettings)
    if not ok then
        return false, err
    end

    logger.info("Tools commit prepared", {
        target = targetKind,
        commit_mode = tostring(opts.commitMode or "standard"),
        used_baseline_snapshot = tostring(explicitBaseline ~= nil),
        restore_before_commit = tostring(opts.restoreBeforeCommit == true),
        baseline_keys = tostring(countTableEntries(baselineSettings)),
        merged_keys = tostring(countTableEntries(merged)),
    })

    local matched = 0
    local expectedCount = countTableEntries(merged)
    local requiredMatches = minMatched
    if expectedCount > 0 then
        if requiredMatches > expectedCount then
            requiredMatches = expectedCount
        end
        if requiredMatches < 1 then
            requiredMatches = 1
        end
    else
        requiredMatches = 0
    end

    if opts.commitMode == "preview_commit" and opts.previewAlreadyApplied == true and next(merged or {}) ~= nil then
        matched = countReadbackMatches(photo, merged, 2.0)
        if matched >= requiredMatches then
            logger.info("Tools preview commit reused live preview state", {
                target = targetKind,
                matched = tostring(matched),
                min_matched = tostring(requiredMatches),
                expected_keys = tostring(expectedCount),
            })
            logger.info("Tools stack applied", {
                xmp_count = tostring(loadedCount),
                matched_keys = tostring(matched),
                min_matched = tostring(requiredMatches),
                target = targetKind,
                strength_multiplier = tostring(TOOL_STRENGTH_MULTIPLIER),
                commit_mode = tostring(opts.commitMode or "standard"),
                reused_preview = "true",
            })
            return true
        end

        logger.warn("Tools preview commit live state below gate; falling back to deterministic apply", {
            target = targetKind,
            matched = tostring(matched),
            min_matched = tostring(requiredMatches),
            expected_keys = tostring(expectedCount),
        })
    end

    local maxTries = 2
    local okWrite = false
    local errWrite = nil
    for _ = 1, maxTries do
        local tryOk, tryErr = applyMergedSettingsDeterministic(photo, merged)
        if tryOk then
            okWrite = true
            break
        end
        errWrite = tostring(tryErr or "apply_failed")
    end
    if not okWrite then
        return false, "Błąd zapisu narzędzi: " .. tostring(errWrite or "apply_failed")
    end

    matched = countReadbackMatches(photo, merged, 2.0)

    if matched < requiredMatches and next(merged or {}) ~= nil then
        logger.warn("Tools readback below gate after primary commit", {
            target = targetKind,
            matched = tostring(matched),
            min_matched = tostring(requiredMatches),
            expected_keys = tostring(expectedCount),
        })

        if trySwitchToDevelopModule() then
            local okPreview = developPreview.applySettings(merged, { logFailures = true })
            if okPreview then
                matched = countReadbackMatches(photo, merged, 2.0)
            end
        end
    end

    if matched < requiredMatches and next(merged or {}) ~= nil then
        local catalog = LrApplication.activeCatalog()
        local okCatalog = catalogWrite.run(
            catalog,
            "MindfulLens Step 2 Commit (readback retry)",
            function()
                photo:applyDevelopSettings(merged)
            end,
            { attempts = 8, sleep = 0.08, sleepMax = 0.30 }
        )
        if okCatalog then
            matched = countReadbackMatches(photo, merged, 2.0)
        end
    end

    if matched < requiredMatches and next(merged or {}) ~= nil then
        return false, "Błąd zapisu narzędzi: readback_mismatch"
    end

    logger.info("Tools stack applied", {
        xmp_count = tostring(loadedCount),
        matched_keys = tostring(matched),
        min_matched = tostring(requiredMatches),
        target = targetKind,
        strength_multiplier = tostring(TOOL_STRENGTH_MULTIPLIER),
    })
    return true
end

local function renderGroup(f, bind, props, groupKey)
    local group = GROUPS[groupKey]
    if not groupHasChoices(props, groupKey) then
        return {}
    end
    return {
        f:separator({ fill_horizontal = 1 }),
        f:static_text({ title = group.header, fill_horizontal = 1, font = "<system/bold>" }),
        f:static_text({ title = group.caption, fill_horizontal = 1 }),
        f:row({
            spacing = f:label_spacing(),
            f:static_text({ title = group.rowLabel, width = 170 }),
            f:popup_menu({
                value = bind(group.field),
                items = bind(group.field .. "Items"),
                fill_horizontal = 1,
            }),
        }),
    }
end

local function renderLibraryBlock(f, bind, definition, prefix)
    local headerPrefix = prefix and (prefix .. " ") or ""
    return {
        f:separator({ fill_horizontal = 1 }),
        f:static_text({ title = headerPrefix .. definition.label, fill_horizontal = 1, font = "<system/bold>" }),
        f:static_text({ title = definition.caption, fill_horizontal = 1 }),
        f:row({
            spacing = f:label_spacing(),
            f:static_text({ title = definition.rowLabel, width = 170 }),
            f:popup_menu({ value = bind(definition.field), items = definition.items, fill_horizontal = 1 }),
        }),
    }
end

local function flatten(parts)
    local out = {}
    for _, part in ipairs(parts) do
        if type(part) == "table" then
            if part[1] ~= nil or next(part) == nil then
                for _, child in ipairs(part) do
                    table.insert(out, child)
                end
            else
                table.insert(out, part)
            end
        end
    end
    return out
end

local function showToolsDialog(toolTarget)
    LrFunctionContext.postAsyncTaskWithContext("showToolsDialog", function(context)
        local f = LrView.osFactory()
        local bind = LrView.bind
        local props = LrBinding.makePropertyTable(context)
        local prefs = LrPrefs.prefsForPlugin()
        local catalog = LrApplication.activeCatalog()
        local targetPhoto = catalog and catalog:getTargetPhoto() or nil
        local baselineDevelopSettings = {}
        local previewAppliedEntries = {}
        local previewApplied = false
        local previewDirty = false
        local previewWorker = false
        local previewPrimed = false
        local appliedKeysByField = {}
        local dialogClosing = false

        local target = tostring(toolTarget or "lab")
        local prefPrefix = "tools_" .. target .. "_"
        local dialogFrameKey = "mindfullens.panel6." .. tostring(target) .. ".dialog"
        local function prefKey(name)
            return prefPrefix .. tostring(name or "")
        end

        props.system = tostring(prefs[prefKey("system")] or prefs.lastColorSystem or "portra")
        trySwitchToDevelopModule()
        for _, groupKey in ipairs(GROUP_ORDER) do
            props[GROUPS[groupKey].field] = "off"
        end
        props.prepDefringe = "off"
        props.releasePrint = "off"
        props.paperPrint = "off"
        props.halation = "off"
        props.bloom = "off"
        props.vignette = "off"
        props.grain = "off"
        props.livePreview = true
        prefs.toolsRunCount = prefs.toolsRunCount or 0

        refreshMenus(props)

        local function snapshotSelectionState()
            local snapshot = {
                system = tostring(props.system or "portra"),
                prepDefringe = tostring(props.prepDefringe or "off"),
                releasePrint = tostring(props.releasePrint or "off"),
                paperPrint = tostring(props.paperPrint or "off"),
                halation = tostring(props.halation or "off"),
                bloom = tostring(props.bloom or "off"),
                vignette = tostring(props.vignette or "off"),
                grain = tostring(props.grain or "off"),
            }
            for _, groupKey in ipairs(GROUP_ORDER) do
                local field = GROUPS[groupKey].field
                snapshot[field] = tostring(props[field] or "off")
            end
            return snapshot
        end

        local entryState = snapshotSelectionState()

        local function resetPanelToBase()
            for _, groupKey in ipairs(GROUP_ORDER) do
                props[GROUPS[groupKey].field] = "off"
            end
            props.prepDefringe = "off"
            props.releasePrint = "off"
            props.paperPrint = "off"
            props.halation = "off"
            props.bloom = "off"
            props.vignette = "off"
            props.grain = "off"
        end

        local function restoreEntryState()
            props.system = tostring(entryState.system or props.system or "portra")
            refreshMenus(props)
            for _, groupKey in ipairs(GROUP_ORDER) do
                local field = GROUPS[groupKey].field
                props[field] = tostring(entryState[field] or "off")
            end
            props.prepDefringe = tostring(entryState.prepDefringe or "off")
            props.releasePrint = tostring(entryState.releasePrint or "off")
            props.paperPrint = tostring(entryState.paperPrint or "off")
            props.halation = tostring(entryState.halation or "off")
            props.bloom = tostring(entryState.bloom or "off")
            props.vignette = tostring(entryState.vignette or "off")
            props.grain = tostring(entryState.grain or "off")
        end

        if targetPhoto then
            local photoOk, photoSettings = pcall(function()
                return targetPhoto:getDevelopSettings()
            end)
            if photoOk and type(photoSettings) == "table" then
                for key, value in pairs(photoSettings) do
                    if tonumber(value) ~= nil then
                        baselineDevelopSettings[key] = tonumber(value)
                    end
                end
                if photoSettings.ConvertToGrayscale == true then
                    baselineDevelopSettings.ConvertToGrayscale = true
                end
                for canonical, _ in pairs(DEVELOP_KEY_ALIASES) do
                    local baselineValue = getNumericWithFallback(baselineDevelopSettings, canonical)
                    if baselineValue ~= nil then
                        applyBaselineAliases(baselineDevelopSettings, canonical, baselineValue)
                    end
                end
            end
        end

        local function captureBaselineForSettings(settings, baselineStore)
            local targetBaseline = baselineStore or baselineDevelopSettings
            local missingKeys = {}
            for key, value in pairs(settings or {}) do
                if tonumber(value) ~= nil and getNumericWithFallback(targetBaseline, key) == nil then
                    missingKeys[#missingKeys + 1] = key
                end
            end
            if #missingKeys == 0 then
                return true, nil
            end

            local ok, err, captured = developPreview.captureValues(missingKeys)
            if not ok then
                return false, err
            end
            for key, value in pairs(captured or {}) do
                if tonumber(value) ~= nil then
                    local numeric = tonumber(value)
                    applyBaselineAliases(targetBaseline, key, numeric)
                end
            end
            return true, nil
        end

        local function primeBaselineFromDevelop()
            if previewPrimed then
                return true, nil
            end
            if not developPreview.isDevelopModuleActive() then
                previewPrimed = true
                return true, nil
            end

            local keys = {}
            local seen = {}
            local function includeField(field)
                local allow = FIELD_ALLOWED_KEYS[field]
                for key, enabled in pairs(allow or {}) do
                    if enabled == true and not seen[key] then
                        seen[key] = true
                        keys[#keys + 1] = tostring(key)
                    end
                end
            end

            if isPrintTarget(target) then
                for _, field in ipairs(activePrintFieldOrder(target)) do
                    includeField(field)
                end
            else
                includeField("prepDefringe")
            end

            if #keys == 0 then
                previewPrimed = true
                return true, nil
            end

            local okCapture, errCapture, captured = developPreview.captureValues(keys)
            if not okCapture then
                return false, errCapture
            end
            for key, value in pairs(captured or {}) do
                local numeric = tonumber(value)
                if numeric ~= nil then
                    applyBaselineAliases(baselineDevelopSettings, key, numeric)
                end
            end
            previewPrimed = true
            return true, nil
        end

        local function restoreBaseline()
            if not targetPhoto or #previewAppliedEntries == 0 then
                return
            end
            local ok, err = developPreview.restoreSettings(baselineDevelopSettings, previewAppliedEntries)
            if not ok then
                logger.error("Tools preview restore failed", { error = tostring(err or "") })
                return
            end
            previewAppliedEntries = {}
            previewApplied = false
        end

        local function buildPreviewSettings()
            if isPrintTarget(target) then
                local previewSnapshot = {
                    halation = tostring(props.halation or "off"),
                    bloom = tostring(props.bloom or "off"),
                    vignette = tostring(props.vignette or "off"),
                    grain = tostring(props.grain or "off"),
                }
                if not anyPrintToolSelected(previewSnapshot, activePrintFieldOrder(target)) then
                    return true, nil, {}
                end
            end
            local previewEntries = buildSelectedEntriesForTarget(props, target)
            local ok, err, merged = buildMergedSettings(previewEntries, baselineDevelopSettings)
            if not ok then
                if err == "Nie wybrano żadnych narzędzi" then
                    return true, nil, {}
                end
                return false, err, {}
            end

            local previewSettings = {}
            for key, value in pairs(merged or {}) do
                if tonumber(value) ~= nil then
                    previewSettings[key] = tonumber(value)
                end
            end
            return true, nil, previewSettings
        end

        local function applyPreview()
            if dialogClosing then
                return true, nil
            end
            if not targetPhoto then
                return false, "Najpierw wybierz zdjęcie."
            end
            if not developPreview.isDevelopModuleActive() then
                return true, nil
            end

            local okPrime, errPrime = primeBaselineFromDevelop()
            if not okPrime then
                return false, errPrime
            end

            local okSettings, errSettings, settings = buildPreviewSettings()
            if not okSettings then
                return false, errSettings
            end

            if previewApplied then
                restoreBaseline()
            end

            if next(settings) == nil then
                return true, nil
            end

            local okBaseline, errBaseline = captureBaselineForSettings(settings)
            if not okBaseline then
                return false, errBaseline
            end

            local ok, err, appliedEntries = developPreview.applySettings(settings, { logFailures = true })
            if not ok then
                logger.error("Tools preview apply failed", { error = tostring(err or "") })
                return false, err
            end

            previewAppliedEntries = appliedEntries or {}
            previewApplied = true
            return true, nil
        end

        local function requestLivePreview()
            if dialogClosing then
                return
            end
            if props.livePreview ~= true or not targetPhoto then
                return
            end
            previewDirty = true
            if previewWorker then
                return
            end
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

        props:addObserver("system", function()
            prefs.lastColorSystem = props.system
            refreshMenus(props)
            requestLivePreview()
        end)

        for _, groupKey in ipairs(GROUP_ORDER) do
            props:addObserver(GROUPS[groupKey].field, requestLivePreview)
        end
        props:addObserver("prepDefringe", requestLivePreview)
        props:addObserver("releasePrint", requestLivePreview)
        props:addObserver("paperPrint", requestLivePreview)
        props:addObserver("halation", requestLivePreview)
        props:addObserver("bloom", requestLivePreview)
        props:addObserver("vignette", requestLivePreview)
        props:addObserver("grain", requestLivePreview)
        props:addObserver("livePreview", function()
            if props.livePreview == true then
                requestLivePreview()
            else
                restoreBaseline()
            end
        end)

        local panelTitle = "Panel II — Charakter ciemni / Lab (live tools)"
        local panelDialogTitle = "MindfulLens — Panel II: charakter ciemni i Lab (live tools)"
        local panelIntro = "Tonalność, Lab glow/fade i soft clip — podgląd na żywo przed zatwierdzeniem (to samo co menu Panel II, skrót kontekstowy)."
        if target == "print" then
            panelTitle = "Wykończenie — Odbitka i papier (live tools)"
            panelDialogTitle = "MindfulLens — Wykończenie: Odbitka i papier"
            panelIntro = "Odbitka, papier, bloom, winieta i ziarno — podgląd na żywo przed zatwierdzeniem."
        elseif target == "print_optics" then
            panelTitle = "Panel VI — Optyka Odbitki (Połysk + Winieta)"
            panelDialogTitle = "Panel VI — Optyka Odbitki (Połysk + Winieta)"
            panelIntro = "Po powierzchni i halacji (Panel V): połysk papieru i winieta — ten sam zestaw co pozycja menu 6, skrót kontekstowy."
        end

        local contentParts = {
            f:static_text({ title = panelTitle, fill_horizontal = 1, font = "<system/bold>" }),
            f:static_text({ title = panelIntro, fill_horizontal = 1 }),
            f:static_text({ title = "Podgląd na żywo działa w module Develop i pokazuje zmiany suwakowe przed zatwierdzeniem.", fill_horizontal = 1 }),
            f:static_text({ title = "Moc narzędzi: " .. tostring(TOOL_STRENGTH_MULTIPLIER) .. "x", fill_horizontal = 1 }),
            f:static_text({ title = "Liczba uruchomień: " .. tostring(prefs.toolsRunCount), fill_horizontal = 1 }),
        }

	        if target == "lab" then
            table.insert(contentParts, f:separator({ fill_horizontal = 1 }))
            table.insert(contentParts, f:static_text({ title = "Rodzina materialu", fill_horizontal = 1, font = "<system/bold>" }))
            table.insert(contentParts, f:row({
                spacing = f:label_spacing(),
                f:static_text({ title = "Rodzina bazowa", width = 170 }),
                f:popup_menu({ value = bind("system"), items = buildSystemItems(), fill_horizontal = 1 }),
            }))

            for _, groupKey in ipairs(GROUP_ORDER) do
                table.insert(contentParts, renderGroup(f, bind, props, groupKey))
            end

            table.insert(contentParts, renderLibraryBlock(f, bind, MODULAR_LIBRARY.prep, "O)"))
	        elseif target == "print" then
		            table.insert(contentParts, renderLibraryBlock(f, bind, MODULAR_LIBRARY.halation, "A)"))
		            table.insert(contentParts, renderLibraryBlock(f, bind, MODULAR_LIBRARY.bloom, "B)"))
		            table.insert(contentParts, renderLibraryBlock(f, bind, MODULAR_LIBRARY.vignette, "C)"))
		            table.insert(contentParts, renderLibraryBlock(f, bind, MODULAR_LIBRARY.grain, "D)"))
	        else
		            table.insert(contentParts, renderLibraryBlock(f, bind, MODULAR_LIBRARY.halation, "A)"))
		            table.insert(contentParts, renderLibraryBlock(f, bind, MODULAR_LIBRARY.vignette, "B)"))
	        end

        table.insert(contentParts, {
            f:separator({ fill_horizontal = 1 }),
            f:checkbox({
                title = "Podglad na zywo",
                value = bind("livePreview"),
            }),
            f:row({
                spacing = 8,
                f:push_button({
                    title = "Reset panelu (0)",
                    action = function()
                        resetPanelToBase()
                        LrTasks.startAsyncTask(function()
                            restoreBaseline()
                            if props.livePreview == true then
                                requestLivePreview()
                            end
                        end)
                    end,
                }),
                f:push_button({
                    title = "Przywróć stan wejściowy",
                    action = function()
                        restoreEntryState()
                        LrTasks.startAsyncTask(function()
                            restoreBaseline()
                            if props.livePreview == true then
                                requestLivePreview()
                            end
                        end)
                    end,
                }),
                f:push_button({
                    title = "Cofnij podgląd",
                    action = function()
                        LrTasks.startAsyncTask(function()
                            restoreBaseline()
                            LrDialogs.showBezel("Analog Signature: podgląd przywrócony", 1.2)
                        end)
                    end,
                }),
            }),
        })

        local contents = f:column({ bind_to_object = props, spacing = f:control_spacing(), unpack(flatten(contentParts)) })

        local result = LrDialogs.presentModalDialog({
            title = panelDialogTitle,
            save_frame = dialogFrameKey,
            actionVerb = "Zastosuj",
            cancelVerb = "Zamknij",
            contents = f:scrolled_view({
                width = 440,
                height = 510,
                horizontal_scroller = false,
                vertical_scroller = true,
                content = contents,
            }),
        })
        dialogClosing = true
        previewDirty = false

        if result ~= "ok" then
            restoreBaseline()
            return
        end

        local restoreBeforeCommit = previewApplied and target ~= "print"
        local previewCommit = isPrintTarget(target) and previewApplied
        if restoreBeforeCommit then
            restoreBaseline()
        end

        local photo = catalog:getTargetPhoto()
        if not photo then
            LrDialogs.message(panelDialogTitle, "Najpierw wybierz zdjęcie.", "critical")
            return
        end

        local printSnapshot = {
            halation = tostring(props.halation or "off"),
            bloom = tostring(props.bloom or "off"),
            vignette = tostring(props.vignette or "off"),
            grain = tostring(props.grain or "off"),
        }

        local selections = buildSelectedEntriesForTarget(props, target)
        local selectedEntries = {}
        local printHasSelection = (not isPrintTarget(target)) or anyPrintToolSelected(printSnapshot, activePrintFieldOrder(target))
        for _, entry in ipairs(selections) do
            if (not isPrintTarget(target)) or printHasSelection then
                selectedEntries[#selectedEntries + 1] = {
                    field = tostring(entry.field or ""),
                    path = tostring(entry.path or "off"),
                }
            end
        end

        if target ~= "print" then
            -- If a tool block was previously applied in this dialog session and is now turned off,
            -- restore the baseline values for the keys that block touched. This makes "Off" reversible.
            local resetSettings = {}
            for _, entry in ipairs(selections) do
                if entry.path == "off" then
                    local touched = appliedKeysByField[entry.field]
                    if type(touched) == "table" then
                        for _, key in ipairs(touched) do
                            local baseValue = getNumericWithFallback(baselineDevelopSettings, key)
                            if baseValue ~= nil then
                                resetSettings[key] = baseValue
                            end
                        end
                    end
                end
            end
            if next(resetSettings) ~= nil then
                table.insert(selectedEntries, 1, resetSettings)
            end
        end

        local labSnapshot = nil
        if target == "lab" then
            labSnapshot = {
                system = tostring(props.system or "portra"),
                prepDefringe = tostring(props.prepDefringe or "off"),
                groups = {},
            }
            for _, groupKey in ipairs(GROUP_ORDER) do
                local field = GROUPS[groupKey].field
                labSnapshot.groups[field] = tostring(props[field] or "off")
            end
        end

        local okTask, taskErr = LrTasks.pcall(function()
            if isPrintTarget(target) then
                logger.info("Tools apply request (print)", printSnapshot)
            end

            if isPrintTarget(target) and not printHasSelection then
                photoScopedPrefs.clearPrintSelections(prefs, photo)
                previewAppliedEntries = {}
                previewApplied = false
                logger.info("Tools print controls cleared", {
                    halation = "off",
                    bloom = "off",
                    vignette = "off",
                    grain = "off",
                    preview_commit = tostring(previewCommit),
                })
                LrDialogs.showBezel("Analog Signature: wykończenie odbitki przywrócone do stanu wyjściowego", 1.5)
                return
            end

            local applied, msg = applyXmpStack(photo, selectedEntries, {
                target = target,
                baselineSettings = baselineDevelopSettings,
                commitMode = previewCommit and "preview_commit" or "standard",
                restoreBeforeCommit = restoreBeforeCommit,
                previewAlreadyApplied = previewCommit and previewApplied,
            })
            if not applied then
                if isPrintTarget(target) then
                    restoreBaseline()
                end
                if isPrintTarget(target) and tostring(msg or "") == "Nie wybrano żadnych narzędzi" then
                    prefs[prefKey("halation")] = "off"
                    prefs[prefKey("bloom")] = "off"
                    prefs[prefKey("vignette")] = "off"
                    prefs[prefKey("grain")] = "off"
                    logger.info("Tools print controls cleared", {
                        halation = "off",
                        bloom = "off",
                        vignette = "off",
                        grain = "off",
                    })
                    LrDialogs.showBezel("Analog Signature: wykończenie odbitki wyzerowane", 1.5)
                    return
                end
                LrDialogs.message(panelDialogTitle, msg or "Nie wybrano żadnych narzędzi.", "info")
                return
            end

            -- Track keys touched per field so switching a block back to "Off" can restore baseline.
            for _, entry in ipairs(selections) do
                if entry.path and entry.path ~= "off" then
                    local absPath = LrPathUtils.child(_PLUGIN.path, entry.path)
                    local settings = xmpLoader.loadDevelopSettings(absPath)
                    if settings then
                        local scaled = developSettingsScale.scale(settings, TOOL_STRENGTH_MULTIPLIER)
                        appliedKeysByField[entry.field] = keysOf(scaled)
                    end
                else
                    appliedKeysByField[entry.field] = nil
                end
            end

            if target == "lab" and labSnapshot then
                prefs[prefKey("system")] = tostring(labSnapshot.system or "portra")
                for field, value in pairs(labSnapshot.groups or {}) do
                    prefs[prefKey(field)] = tostring(value or "off")
                end
                prefs[prefKey("prepDefringe")] = tostring(labSnapshot.prepDefringe or "off")
            elseif isPrintTarget(target) and printHasSelection then
                photoScopedPrefs.savePrintSelections(prefs, photo, printSnapshot)
                previewAppliedEntries = {}
                previewApplied = false
            end

            prefs.toolsRunCount = (prefs.toolsRunCount or 0) + 1
            LrDialogs.showBezel("Analog Signature: " .. string.lower(panelTitle) .. " zastosowano", 1.5)
        end)

        if not okTask then
            logger.error("Tools apply task crashed", {
                error = tostring(taskErr or ""),
                target = tostring(target),
            })
            LrDialogs.message(panelDialogTitle, "Błąd zapisu panelu: " .. tostring(taskErr or "unknown"), "critical")
        end
    end)
end

local target = rawget(_G, "ML_TOOLS_TARGET")
if target ~= nil then
    _G.ML_TOOLS_TARGET = nil
end
showToolsDialog(target)
