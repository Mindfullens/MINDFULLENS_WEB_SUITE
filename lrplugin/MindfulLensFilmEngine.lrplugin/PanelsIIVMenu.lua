local LrApplication = import "LrApplication"
local LrApplicationView = import "LrApplicationView"
local LrBinding = import "LrBinding"
local LrDialogs = import "LrDialogs"
local LrFunctionContext = import "LrFunctionContext"
local LrPathUtils = import "LrPathUtils"
local LrPrefs = import "LrPrefs"
local LrTasks = import "LrTasks"
local LrView = import "LrView"

local PREF_PREFIX = "panel_iiv_"
local PREF_SCHEMA_VERSION = 10

local function pluginLoad(relativePath)
    return dofile(LrPathUtils.child(_PLUGIN.path, relativePath))
end

local logger = pluginLoad("lib/Logger.lua")
local developPreview = pluginLoad("lib/DevelopPreview.lua")
local panelRuntime = pluginLoad("lib/PanelsRuntime.lua")
local catalogWrite = pluginLoad("lib/CatalogWrite.lua")

local DEFAULTS = panelRuntime.DEFAULTS
local PANEL_KEYS = panelRuntime.PANEL_KEYS

local PREVIEW_KEYS = {
    "Temperature",
    "Tint",
    "Vibrance",
    "Saturation",
    "Dehaze",
    "Texture",
    "Clarity2012",
    "Contrast2012",
    "Highlights2012",
    "Shadows2012",
    "Whites2012",
    "Blacks2012",
    "GrainAmount",
    "GrainSize",
    "GrainFrequency",
}

local trySwitchToDevelopModule

local function applySettingsWithFallback(photo, catalog, settings, actionName)
    local okWrite, errWrite = pcall(function()
        photo:applyDevelopSettings(settings)
    end)
    if okWrite then
        return true, nil, "photo_apply"
    end

    local errText = tostring(errWrite or "apply_failed")
    local lowered = string.lower(errText)
    if string.find(lowered, "yielding is not allowed", 1, true) then
        local okCatalog, errCatalog = catalogWrite.run(
            catalog,
            tostring(actionName or "MindfulLens Apply Panel III-V (fallback)"),
            function()
                photo:applyDevelopSettings(settings)
            end,
            { attempts = 12, sleep = 0.08, sleepMax = 0.40 }
        )
        if okCatalog then
            logger.warn("Panels III-V switched to catalog write fallback save", {
                error = errText,
            })
            return true, nil, "catalog_write_fallback"
        end

        local fallbackErr = tostring(errCatalog or errText)
        if developPreview.isDevelopModuleActive() then
            local okPreview, errPreview = developPreview.applySettings(settings, { logFailures = true })
            if okPreview then
                logger.warn("Panels III-V switched to DevelopController fallback save", {
                    error = fallbackErr,
                })
                return true, nil, "develop_controller_fallback"
            end
            fallbackErr = tostring(errPreview or fallbackErr)
        end

        return false, fallbackErr, "fallback_failed"
    end

    return false, errText, "photo_apply_failed"
end

local function applySettingsDeterministic(photo, catalog, settings, actionName)
    local hasSettings = false
    for _ in pairs(settings or {}) do
        hasSettings = true
        break
    end
    if not hasSettings then
        return true, nil, "no_settings"
    end

    if trySwitchToDevelopModule and trySwitchToDevelopModule() then
        local okPreview, errPreview = developPreview.applySettings(settings, { logFailures = true })
        if okPreview then
            return true, nil, "develop_controller_primary"
        end
        logger.warn("Panels III-V DevelopController primary save failed; trying fallback", {
            error = tostring(errPreview or ""),
        })
    end

    return applySettingsWithFallback(photo, catalog, settings, actionName)
end

local function levelItems()
    return {
        { title = "Reset (0)", value = "base" },
        { title = "Poziom I", value = "l1" },
        { title = "Poziom II", value = "l2" },
        { title = "Poziom III", value = "l3" },
    }
end


local PANEL_DEFINITIONS = {
    ii = {
        dialogTitle = "MindfulLens — Panel III: Sensytometria i baza",
        header = "Panel III: Sensytometria i krzywa H&D",
        subtitle = "Etap ciemni: baza materiału, D-min/D-max i charakterystyka gęstości.",
        sections = {
            {
                title = "Baza i maskowanie",
                subtitle = "Kontrola maskowania integralnego oraz zakresu gęstości bazy.",
                fields = {
                    {
                        key = "integral_masking",
                        label = "Maskowanie Integralne",
                        note = "Kompensacja maski barwnej materiału.",
                        items = levelItems(),
                    },
                    {
                        key = "d_min",
                        label = "D-min (Base + Fog)",
                        note = "Kontrola gęstości bazy i punktu czerni.",
                        items = levelItems(),
                    },
                    {
                        key = "d_max",
                        label = "D-max (Maximum Density)",
                        note = "Sufit gęstości świateł i ich kompresja.",
                        items = levelItems(),
                    },
                },
            },
            {
                title = "Reciprocity i Schwarzschild",
                subtitle = "Kompensacja „ogona” przy bardzo długich czasach: lift cieni i mięknięcie kontrastu (bez zmiany Exposure). Reset (0) = brak offsetu.",
                fields = {
                    {
                        key = "reciprocity_tail",
                        label = "Reciprocity / Schwarzschild",
                        note = "Modele strat efektywnej ekspozycji (LR: Shadows, Blacks, Contrast, Dehaze, Clarity, Texture).",
                        items = levelItems(),
                    },
                },
            },
            {
                title = "Krzywa H&D i MTF",
                subtitle = "Kontrola odpowiedzi tonalnej i mikro-kontrastu optycznego.",
                fields = {
                    {
                        key = "hd_curve",
                        label = "Krzywa Charakterystyczna (H&D)",
                        note = "Toe/shoulder i zachowanie półtonów.",
                        items = levelItems(),
                    },
                    {
                        key = "mtf_response",
                        label = "Odpowiedź MTF",
                        note = "Mikrokontrast i akutanse krawędzi.",
                        items = levelItems(),
                    },
                },
            },
        },
    },
    iii = {
        dialogTitle = "MindfulLens — Panel IV: Morfologia ziarna i generator srebra",
        header = "Panel IV: Morfologia ziarna i generator srebra",
        subtitle = "Energia ziarna, geometria kryształów i rdzeń generatora srebra.",
        sections = {
            {
                title = "Energia i geometria ziarna",
                subtitle = "Amplituda ziarna, klastrowanie i wielkość kryształów.",
                fields = {
                    {
                        key = "ssg_grain",
                        label = "Generator Srebra (SSG)",
                        note = "Kształt ziarna emulsji bez podmiany stockowego presetu.",
                        items = levelItems(),
                    },
                    {
                        key = "grain_rms",
                        label = "Bazowa Energia Ziarna",
                        note = "Bazowa energia ziarna po normalizacji formatu.",
                        items = levelItems(),
                    },
                    {
                        key = "grain_clumping",
                        label = "Klastrowanie Ziarna",
                        note = "Gładkość lub organiczne skupiska ziaren.",
                        items = levelItems(),
                    },
                    {
                        key = "crystal_size",
                        label = "Wielkość Kryształów",
                        note = "Skala kryształów bez zmiany charakteru narzędzia.",
                        items = levelItems(),
                    },
                    {
                        key = "grain_lr_roughness",
                        label = "Chropowatość ziarna (LR Roughness)",
                        note = "Mapuje na suwak Roughness w Effects › Grain (technicznie GrainFrequency). Reset (0) nie dodaje offsetu.",
                        items = levelItems(),
                    },
                },
            },
        },
    },
    iv = {
        dialogTitle = "MindfulLens — Panel V: Powierzchnia, bloom i starzenie",
        header = "Panel V: Powierzchnia, bloom i starzenie",
        subtitle = "Rozpraszanie światła, mikrostruktura powierzchni, bloom i patyna nośnika.",
        sections = {
            {
                title = "Rozpraszanie i krawędź wywołania",
                subtitle = "Kontrola rozpraszania fotonów i efektu Mackie.",
                fields = {
                    {
                        key = "photon_scattering",
                        label = "Rozpraszanie Fotonów",
                        note = "Wewnętrzne rozproszenie i halo świateł.",
                        items = levelItems(),
                    },
                    {
                        key = "mackie_lines",
                        label = "Linie Mackie / FDP",
                        note = "Kontrast krawędzi z lokalnego wyczerpania wywoływacza.",
                        items = levelItems(),
                    },
                },
            },
            {
                title = "Mikrostruktura, bloom i starzenie",
                subtitle = "Mikrostruktura powierzchni, bloom oraz starzenie nośnika.",
                fields = {
                    {
                        key = "surface_roughness",
                        label = "Chropowatość Powierzchni",
                        note = "Mikrorelief powierzchni i odczuwalna akutanse.",
                        items = levelItems(),
                    },
                    {
                        key = "anti_halation_bloom",
                        label = "Bloom Antyhalacyjny",
                        note = "Przeciek bloom w warstwie antyhalacyjnej.",
                        items = levelItems(),
                    },
                    {
                        key = "optical_bloom",
                        label = "Bloom Optyczny",
                        note = "Bloom optyczny niezależny od warstwy antyhalacyjnej.",
                        items = levelItems(),
                    },
                    {
                        key = "film_damage",
                        label = "Starzenie Materiału",
                        note = "Patyna i zużycie materiału bez dublowania ziarna.",
                        items = levelItems(),
                    },
                },
            },
        },
    },
}

local function prefKey(name)
    return PREF_PREFIX .. name
end

local function savePropsToPrefs(prefs, props, keys)
    for _, key in ipairs(keys) do
        prefs[prefKey(key)] = tostring(props[key] or DEFAULTS[key] or "")
    end
end

local function keyInList(list, key)
    for _, value in ipairs(list or {}) do
        if tostring(value) == tostring(key) then
            return true
        end
    end
    return false
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

trySwitchToDevelopModule = function()
    if developPreview.isDevelopModuleActive() then
        return true
    end
    pcall(function()
        LrApplicationView.switchToModule("develop")
    end)
    return developPreview.isDevelopModuleActive()
end

local function showPanelsDialog(targetPanel)
    LrFunctionContext.postAsyncTaskWithContext("MindfulLensPanelsIIV", function(context)
        local f = LrView.osFactory()
        local bind = LrView.bind
        local prefs = LrPrefs.prefsForPlugin()
        local props = LrBinding.makePropertyTable(context)
        local catalog = LrApplication.activeCatalog()
        local targetPhoto = catalog and catalog:getTargetPhoto() or nil
        local baselineDevelopSettings = nil
        local baselinePhotoSettings = nil
        local previewAppliedEntries = {}
        local previewApplied = false
        local previewDirty = false
        local previewWorker = false
        local dialogClosing = false

        local panelTarget = tostring(targetPanel or "ii")
        local panelDefinition = PANEL_DEFINITIONS[panelTarget] or PANEL_DEFINITIONS.ii
        local keysToSave = PANEL_KEYS[panelTarget] or {}
        local panelDialogFrameKey = "mindfullens.panel" .. tostring(panelTarget) .. ".dialog"

        -- Prefer Develop module for deterministic preview/save behavior.
        trySwitchToDevelopModule()

        local storedSchema = tonumber(prefs[prefKey("_schema")]) or 0
        if storedSchema < PREF_SCHEMA_VERSION then
            for key, value in pairs(DEFAULTS) do
                local current = prefs[prefKey(key)]
                if current == nil or tostring(current) == "" then
                    prefs[prefKey(key)] = tostring(value)
                end
            end
            prefs[prefKey("_schema")] = PREF_SCHEMA_VERSION
        end

        local entryState = {}
        for key, defaultValue in pairs(DEFAULTS) do
            local value = panelRuntime.normalizeControlValue(key, defaultValue)
            props[key] = value
            if keyInList(keysToSave, key) then
                entryState[key] = value
            end
        end
        props.livePreview = true

        if targetPhoto then
            local photoOk, photoSettings = pcall(function()
                return targetPhoto:getDevelopSettings()
            end)
            if photoOk and type(photoSettings) == "table" then
                baselinePhotoSettings = photoSettings
            end

            baselineDevelopSettings = {}
            for _, key in ipairs(PREVIEW_KEYS) do
                if baselinePhotoSettings and tonumber(baselinePhotoSettings[key]) ~= nil then
                    baselineDevelopSettings[key] = tonumber(baselinePhotoSettings[key])
                end
            end
            if baselinePhotoSettings and baselinePhotoSettings.ConvertToGrayscale == true then
                baselineDevelopSettings.ConvertToGrayscale = true
            end

            local ok, _, settings = developPreview.captureValues(PREVIEW_KEYS)
            if ok and type(settings) == "table" then
                for key, value in pairs(settings) do
                    if tonumber(value) ~= nil then
                        baselineDevelopSettings[key] = tonumber(value)
                    end
                end
            end

            if next(baselineDevelopSettings) == nil then
                baselineDevelopSettings = baselinePhotoSettings
            end
        end

        local function buildPreviewSettings()
            local baseline = baselineDevelopSettings or {}
            local controls = panelRuntime.controlsFromProps(props)
            local isGrayscale = (baselinePhotoSettings and baselinePhotoSettings.ConvertToGrayscale == true)
                or (baseline.ConvertToGrayscale == true)
	            local _, _, settings = panelRuntime.applyToSettings({}, controls, {
	                baselineSettings = baseline,
	                isGrayscale = isGrayscale,
	                formatId = tostring(prefs.lastFormat or "35mm"),
	                panelKeys = keysToSave,
	            })
	            return settings
	        end

        local function restoreBaseline()
            if not targetPhoto or not baselineDevelopSettings or #previewAppliedEntries == 0 then
                return
            end
            local ok, err = developPreview.restoreSettings(baselineDevelopSettings, previewAppliedEntries)
            if not ok then
                logger.error("Panels III-V preview restore failed", {
                    panel = tostring(panelTarget),
                    error = tostring(err or ""),
                })
                return
            end
            previewAppliedEntries = {}
            previewApplied = false
        end

		        local function applyPreview()
                    if dialogClosing then
                        return true, nil
                    end
		            if not targetPhoto then
		                return false, "Najpierw wybierz zdjecie."
		            end
            if not developPreview.isDevelopModuleActive() then
                return true, nil
            end

            local settings = buildPreviewSettings()
            local hasSettings = false
            for _ in pairs(settings) do
                hasSettings = true
                break
            end

            if previewApplied then
                restoreBaseline()
            end

            if not hasSettings then
                return true, nil
            end

            local ok, err, appliedEntries = developPreview.applySettings(settings, { logFailures = true })
            if not ok then
                logger.error("Panels III-V preview apply failed", {
                    panel = tostring(panelTarget),
                    error = tostring(err or ""),
                })
                return false, tostring(err or "")
            end

            previewAppliedEntries = appliedEntries or {}
            previewApplied = true
            logger.info("Panels III-V preview applied", {
                panel = tostring(panelTarget),
                keys = tostring(#previewAppliedEntries),
            })
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

        local function titleText(title)
            return f:static_text({
                title = title,
                fill_horizontal = 1,
                font = "<system/bold>",
            })
        end

        local function bodyText(title)
            return f:static_text({
                title = title,
                fill_horizontal = 1,
                font = "<system/small>",
            })
        end

        local function subtitleTitle(title)
            return f:static_text({
                title = title,
                fill_horizontal = 1,
                font = "<system/bold>",
            })
        end

        local function toolLabelText(title)
            return f:static_text({
                title = title,
                fill_horizontal = 1,
                font = "<system/small>",
            })
        end

        local function fieldBlock(field)
            return f:group_box({
                fill_horizontal = 1,
                f:spacer({ height = 6 }),
                f:row({
                    spacing = 0,
                    f:spacer({ width = 10 }),
                    f:column({
                        spacing = 4,
                        toolLabelText(field.label),
                        bodyText(field.note),
                        f:popup_menu({
                            value = bind(field.key),
                            items = field.items,
                            fill_horizontal = 1,
                        }),
                    }),
                    f:spacer({ width = 10 }),
                }),
                f:spacer({ height = 6 }),
            })
        end

        local contentItems = {
            bind_to_object = props,
            spacing = 8,
            f:spacer({ width = 400, height = 1 }),
            titleText(panelDefinition.header),
            subtitleTitle(panelDefinition.subtitle),
            f:separator({ fill_horizontal = 1 }),
        }

        for _, section in ipairs(panelDefinition.sections or {}) do
            contentItems[#contentItems + 1] = subtitleTitle(section.title)
            contentItems[#contentItems + 1] = subtitleTitle(section.subtitle)
            for _, field in ipairs(section.fields or {}) do
                contentItems[#contentItems + 1] = fieldBlock(field)
            end
        end

	        contentItems[#contentItems + 1] = f:separator({ fill_horizontal = 1 })
	        contentItems[#contentItems + 1] = f:checkbox({
	            title = "Podgląd na żywo",
	            value = bind("livePreview"),
	        })
	        contentItems[#contentItems + 1] = f:row({
	            spacing = 8,
	            f:push_button({
	                title = "Reset panelu (0)",
	                action = function()
	                    for _, key in ipairs(keysToSave) do
	                        props[key] = DEFAULTS[key]
                    end
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
	                    for _, key in ipairs(keysToSave) do
	                        props[key] = tostring(entryState[key] or DEFAULTS[key])
	                    end
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
	                        LrDialogs.showBezel("MindfulLens: podgląd przywrócony", 1.2)
	                    end)
	                end,
	            }),
	        })

        for _, key in ipairs(keysToSave) do
            props:addObserver(key, requestLivePreview)
        end
        props:addObserver("livePreview", function()
            if props.livePreview == true then
                requestLivePreview()
            end
        end)

        local content = f:column(contentItems)

		        local result = LrDialogs.presentModalDialog({
		            title = panelDefinition.dialogTitle,
                    save_frame = panelDialogFrameKey,
		            actionVerb = "Zastosuj",
	            cancelVerb = "Zamknij",
	            contents = f:scrolled_view({
	                width = 440,
	                height = 510,
	                horizontal_scroller = false,
                vertical_scroller = true,
                content,
            }),
		        })
            dialogClosing = true
            previewDirty = false
	        if result == "ok" then
	            -- If live preview is already applied, restore baseline first so commit is not doubled.
	            if previewApplied then
	                restoreBaseline()
            end

            local controlsSnapshot = panelRuntime.controlsFromProps(props)
            local photo = targetPhoto
            local currentSettings = {}
            if photo then
                local gotCurrent, current = pcall(function()
                    return photo:getDevelopSettings() or {}
                end)
                if gotCurrent and type(current) == "table" then
                    currentSettings = current
                end
            end
            local commitBaseline = {}
            for key, value in pairs(currentSettings or {}) do
                commitBaseline[key] = value
            end
            for key, value in pairs(baselineDevelopSettings or {}) do
                if tonumber(value) ~= nil then
                    commitBaseline[key] = tonumber(value)
                end
            end

            local _, _, settingsSnapshot = panelRuntime.applyToSettings({}, controlsSnapshot, {
                baselineSettings = commitBaseline,
                isGrayscale = (currentSettings.ConvertToGrayscale == true),
                formatId = tostring(prefs.lastFormat or "35mm"),
                panelKeys = keysToSave,
            })

            local appliedCount = 0
            for _ in pairs(settingsSnapshot or {}) do
                appliedCount = appliedCount + 1
            end

            if photo and appliedCount > 0 then
                local maxTries = 2
                local committed = false
                local lastErr = nil
                local matchedKeys = 0

                for _ = 1, maxTries do
                    local okWrite, errWrite = applySettingsDeterministic(
                        photo,
                        catalog,
                        settingsSnapshot,
                        "MindfulLens Apply Panel III-V"
                    )
                    if not okWrite then
                        lastErr = tostring(errWrite or "apply_failed")
                    else
                        local matched = countReadbackMatches(photo, settingsSnapshot, 2.0)
                        matchedKeys = matched
                        if matched > 0 then
                            committed = true
                            break
                        end

                        if developPreview.isDevelopModuleActive() then
                            local okPreview = developPreview.applySettings(settingsSnapshot, { logFailures = true })
                            if okPreview then
                                matched = countReadbackMatches(photo, settingsSnapshot, 2.0)
                                matchedKeys = matched
                                if matched > 0 then
                                    committed = true
                                    break
                                end
                            end
                        end

                        lastErr = "readback_mismatch"
                    end
                end

                if not committed then
                    logger.error("Panels III-V apply on save failed", {
                        panel = tostring(panelTarget),
                        error = tostring(lastErr or "commit_failed"),
                        expected_keys = tostring(appliedCount),
                        matched_keys = tostring(matchedKeys),
                    })
                    LrDialogs.message(
                        panelDefinition.dialogTitle,
                        "Blad zapisu panelu: " .. tostring(lastErr or "commit_failed"),
                        "critical"
                    )
                    return
                end
            end

            savePropsToPrefs(prefs, props, keysToSave)
            logger.info("Panels III-V committed", {
                panel = tostring(panelTarget),
                keys = tostring(appliedCount),
            })
            LrDialogs.showBezel("MindfulLens: panel zastosowany", 1.2)

            -- Do NOT restore baseline after commit; that would undo the applied settings.
            previewAppliedEntries = {}
            previewApplied = false
        else
	            -- On cancel/close, restore any live preview changes.
	            restoreBaseline()
	        end
	    end)
	end

local targetPanel = rawget(_G, "ML_PANEL_TARGET")
if targetPanel ~= nil then
    _G.ML_PANEL_TARGET = nil
end
showPanelsDialog(targetPanel)
