local LrApplication = import "LrApplication"
local LrApplicationView = import "LrApplicationView"
local LrBinding = import "LrBinding"
local LrDevelopController = import "LrDevelopController"
local LrDialogs = import "LrDialogs"
local LrFileUtils = import "LrFileUtils"
local LrFunctionContext = import "LrFunctionContext"
local LrPathUtils = import "LrPathUtils"
local LrPrefs = import "LrPrefs"
local LrTasks = import "LrTasks"
local LrView = import "LrView"

local function pluginLoad(relativePath)
    return dofile(LrPathUtils.child(_PLUGIN.path, relativePath))
end

local bridge = pluginLoad("lib/EngineBridge.lua")
local config = pluginLoad("lib/FilmEngineConfig.lua")
local logger = pluginLoad("lib/Logger.lua")
local publicCatalog = pluginLoad("lib/PublicCatalog.lua")
local profileInstaller = pluginLoad("lib/ProfileInstaller.lua")
local catalogWrite = pluginLoad("lib/CatalogWrite.lua")
local photoScopedPrefs = pluginLoad("lib/PhotoScopedPrefs.lua")
local PANEL1_TITLE = "Panel I — Ingest i kalibracja"
local PANEL1_RESULT_TITLE = "Panel I — Wynik ingest / kalibracji"
local ORIGINAL_EMULSION_ID = "__original__"
local PANEL1_DIALOG_FRAME_KEY = "mindfullens.panel1.dialog"

local function coerceBoolean(value, defaultValue)
    if value == nil then
        return defaultValue == true
    end
    if value == true then
        return true
    end
    if value == false then
        return false
    end
    local lowered = string.lower(tostring(value or ""))
    if lowered == "1" or lowered == "true" or lowered == "yes" then
        return true
    end
    if lowered == "0" or lowered == "false" or lowered == "no" then
        return false
    end
    return defaultValue == true
end

local function loadPanel2StateFromPrefs(prefs)
    local source = prefs or {}
    return {
        colorProcess = tostring(source.panel2ColorProcess or config.defaultColorProcess or "refined"),
        lutIntensity = tostring(source.panel2LutIntensity or config.defaultLutIntensity or "100"),
        saturationTrim = tostring(source.panel2SaturationTrim or config.defaultSaturationTrim or "0"),
        labGlow = tostring(source.panel2LabGlow or config.defaultLabGlow or "0"),
        labFade = tostring(source.panel2LabFade or config.defaultLabFade or "0"),
        softHighs = coerceBoolean(source.panel2SoftHighs, config.defaultSoftHighs == true),
        softLows = coerceBoolean(source.panel2SoftLows, config.defaultSoftLows == true),
        whiteClip = tostring(source.panel2WhiteClip or config.defaultWhiteClip or "0"),
        blackClip = tostring(source.panel2BlackClip or config.defaultBlackClip or "0"),
    }
end

local function applyPanel2StateToProps(props, panel2State)
    local source = panel2State or {}
    props.colorProcess = tostring(source.colorProcess or config.defaultColorProcess or "refined")
    props.lutIntensity = tostring(source.lutIntensity or config.defaultLutIntensity or "100")
    props.saturationTrim = tostring(source.saturationTrim or config.defaultSaturationTrim or "0")
    props.labGlow = tostring(source.labGlow or config.defaultLabGlow or "0")
    props.labFade = tostring(source.labFade or config.defaultLabFade or "0")
    props.softHighs = (source.softHighs == true)
    props.softLows = (source.softLows == true)
    props.whiteClip = tostring(source.whiteClip or config.defaultWhiteClip or "0")
    props.blackClip = tostring(source.blackClip or config.defaultBlackClip or "0")
end

local function ensureDevelopModuleForOriginalReset()
    local moduleOk, moduleName = pcall(function()
        return LrApplicationView.getCurrentModuleName()
    end)
    if not moduleOk or moduleName ~= "develop" then
        return false
    end
    return true
end

local function resetPhotoToOriginal()
    local okReset, errReset = LrTasks.pcall(function()
        LrDevelopController.resetAllDevelopAdjustments()
    end)
    if not okReset then
        return false, errReset
    end
    return true, nil
end

local EMULSION_PROCESS_ORDER = {
    "color_negative",
    "slide",
    "cine",
    "bw",
    "camera_sim",
    "creative",
}

local EMULSION_PROCESS_PREFIX = {
    color_negative = "C-41 | ",
    slide = "E-6/K-14 | ",
    cine = "CINE | ",
    bw = "B&W | ",
    camera_sim = "SIM | ",
    creative = "CREATIVE | ",
}

local function categorizeEmulsionProcess(emulsion)
    local id = string.lower(tostring(emulsion and emulsion.id or ""))
    local label = string.lower(tostring((emulsion and emulsion.legacyLabel) or (emulsion and emulsion.label) or ""))

    local function hasToken(token)
        return string.find(id, token, 1, true) or string.find(label, token, 1, true)
    end

    if emulsion and emulsion.bw == true
        or hasToken("bw_")
        or hasToken("tri-x")
        or hasToken("t-max")
        or hasToken("delta")
        or hasToken("hp5")
        or hasToken("xp2")
        or hasToken("foma")
        or hasToken("arista")
        or hasToken("acros")
        or hasToken("kosmo")
    then
        return "bw"
    end

    if hasToken("vision3")
        or hasToken("cinestill")
        or hasToken("cinema")
        or hasToken("eterna")
        or hasToken("t200")
    then
        return "cine"
    end

    if hasToken("velvia")
        or hasToken("provia")
        or hasToken("astia")
        or hasToken("ektachrome")
        or hasToken("kodachrome")
        or hasToken("fortia")
        or hasToken("precisa")
        or hasToken("leicachrome")
    then
        return "slide"
    end

    if hasToken("classic chrome")
        or hasToken("nostalgic neg")
        or hasToken("pro neg")
        or hasToken("sony_")
        or hasToken("sony ")
        or hasToken("fuji nostalgic")
        or hasToken("sony classic")
    then
        return "camera_sim"
    end

    if hasToken("redscale")
        or hasToken("infra")
        or hasToken("dream")
        or hasToken("acid")
        or hasToken("crimson")
        or hasToken("phenomena")
        or hasToken("magic")
        or hasToken("neo")
        or hasToken("zero")
        or hasToken("oktar")
        or hasToken("vektro")
        or hasToken("senova")
        or hasToken("evpro")
        or hasToken("ayon")
        or hasToken("vespera")
        or hasToken("veniliqum")
        or hasToken("zetra")
        or hasToken("rose spectra")
        or hasToken("asteroid city")
        or hasToken("blue velvet")
        or hasToken("chroma fade")
        or hasToken("x-tarr")
        or hasToken("amarelo")
        or hasToken("gold luxe")
        or hasToken("procolor")
        or hasToken("phoenix")
        or hasToken("gaf")
    then
        return "creative"
    end

    return "color_negative"
end

local function isCcVariant(emulsion)
    local id = tostring(emulsion and emulsion.id or "")
    return string.match(id, "_cc$") ~= nil
end

local function emulsionPriority(emulsion)
    local score = 0
    if not isCcVariant(emulsion) then
        score = score + 100
    end
    score = score + string.len(tostring(emulsion and emulsion.label or ""))
    return score
end

local function displayEmulsionLabel(emulsion)
    return tostring((emulsion and emulsion.clientFacingLabel) or (emulsion and emulsion.legacyLabel) or (emulsion and emulsion.publicLabel) or (emulsion and emulsion.label) or "")
end

local function formatTagLine(tags)
    if type(tags) ~= "table" or #tags == 0 then
        return "Tagi: filmowy charakter podstawowy"
    end
    return "Tagi: " .. table.concat(tags, " • ")
end

local function emulsionCategoryCode(emulsion)
    local categoryId = tostring((emulsion and emulsion.publicCategoryId) or publicCatalog.getCategoryId(emulsion and emulsion.id, emulsion and emulsion.type, emulsion and emulsion.bw == true) or "experimental")
    return publicCatalog.getCategoryCode(categoryId)
end

local function dedupeEmulsions(source)
    local preferredByKey = {}
    local orderedKeys = {}

    for _, emulsion in ipairs(source or {}) do
        local foundationKey = tostring(emulsion.foundationPreset or emulsion.id or "")
        if foundationKey ~= "" then
            local current = preferredByKey[foundationKey]
            if current == nil then
                preferredByKey[foundationKey] = emulsion
                orderedKeys[#orderedKeys + 1] = foundationKey
            elseif emulsionPriority(emulsion) > emulsionPriority(current) then
                preferredByKey[foundationKey] = emulsion
            end
        end
    end

    local deduped = {}
    for _, key in ipairs(orderedKeys) do
        deduped[#deduped + 1] = preferredByKey[key]
    end
    return deduped
end

local function makeItems(source)
    local grouped = {}
    for _, processId in ipairs(EMULSION_PROCESS_ORDER) do
        grouped[processId] = {}
    end

    for _, value in ipairs(dedupeEmulsions(source)) do
        local processId = categorizeEmulsionProcess(value)
        if not grouped[processId] then
            grouped[processId] = {}
        end
        local processPrefix = EMULSION_PROCESS_PREFIX[processId] or ""
        local categoryPrefix = emulsionCategoryCode(value)
        grouped[processId][#grouped[processId] + 1] = {
            title = categoryPrefix .. " | " .. processPrefix .. displayEmulsionLabel(value),
            value = value.id,
            sortLabel = displayEmulsionLabel(value),
        }
    end

    local items = {}
    items[#items + 1] = {
        title = "[ORYGINAL] Przywróć zdjęcie (bez profilu filmowego)",
        value = ORIGINAL_EMULSION_ID,
    }
    for _, processId in ipairs(EMULSION_PROCESS_ORDER) do
        table.sort(grouped[processId], function(a, b)
            return tostring(a.sortLabel) < tostring(b.sortLabel)
        end)
        for _, groupedItem in ipairs(grouped[processId]) do
            items[#items + 1] = {
                title = groupedItem.title,
                value = groupedItem.value,
            }
        end
    end
    return items
end

local function makeFormatItems(source)
    local map = {
        ["35mm"] = "Mały format (35 mm)",
        ["mf_120"] = "Średni format (120 / 220)",
        ["lf_4x5"] = "Duży format (4×5)",
        ["lf_8x10"] = "Wielki format (8×10)",
    }
    local items = {}
    for _, value in ipairs(source or {}) do
        items[#items + 1] = { title = (map[value.id] or value.label), value = value.id }
    end
    return items
end

local function makeSourceScaleItems(source)
    local map = {
        ["auto"] = "Auto (wykryj z aparatu)",
        ["full_frame"] = "Pełna klatka",
        ["aps_c"] = "APS-C",
        ["micro_four_thirds"] = "Micro 4/3",
        ["compact_small"] = "Mała matryca / kompakt",
        ["digital_mf"] = "Cyfrowy średni format",
    }
    local items = {}
    for _, value in ipairs(source or {}) do
        items[#items + 1] = { title = (map[value.id] or value.label), value = value.id }
    end
    return items
end

local function makeNightBoostItems(source)
    local map = {
        ["off"] = "Reset (0)",
        ["soft"] = "Poziom I",
        ["medium"] = "Poziom II",
        ["strong"] = "Poziom III",
    }
    local items = {}
    for _, value in ipairs(source or {}) do
        items[#items + 1] = { title = (map[value.id] or value.label), value = value.id }
    end
    return items
end

local function makeConversionModeItems()
    return {
        { title = "[Analiza negatywu] — silnik inwersji + analiza sceny", value = "analyze" },
        { title = "[Tylko edycja] — bez analizatora (cyfrowe / slajdy)", value = "edit_only" },
    }
end

local function makeMatchModeItems()
    return {
        { title = "Full (kolor + ton + detal)", value = "full" },
        { title = "Color Only (kolor/WB/HSL)", value = "color" },
        { title = "Tone Only (ekspozycja/kontrast/krzywe)", value = "tone" },
    }
end

local function makePushPullEvItems()
    local items = {}
    for ev = -3, 3 do
        local title
        if ev == 0 then
            title = "0 EV (neutral)"
        elseif ev > 0 then
            title = "+" .. tostring(ev) .. " EV (push)"
        else
            title = tostring(ev) .. " EV (pull)"
        end
        items[#items + 1] = { title = title, value = tostring(ev) }
    end
    return items
end

local function normalizeMatchMode(value)
    local mode = string.lower(tostring(value or "full"))
    if mode == "color" or mode == "tone" then
        return mode
    end
    return "full"
end

local function isColorSettingKey(key)
    local text = tostring(key or "")
    if text == "" then
        return false
    end
    if text == "CameraProfile"
        or text == "WhiteBalance"
        or text == "Temperature"
        or text == "Tint"
        or text == "Vibrance"
        or text == "Saturation"
        or text == "ConvertToGrayscale"
        or text == "RedHue"
        or text == "RedSaturation"
        or text == "GreenHue"
        or text == "GreenSaturation"
        or text == "BlueHue"
        or text == "BlueSaturation"
    then
        return true
    end
    if string.find(text, "HueAdjustment", 1, true) == 1
        or string.find(text, "SaturationAdjustment", 1, true) == 1
        or string.find(text, "LuminanceAdjustment", 1, true) == 1
        or string.find(text, "ColorGrade", 1, true) == 1
        or string.find(text, "GrayMixer", 1, true) == 1
    then
        return true
    end
    return false
end

local function buildSettingsForMatch(appliedSettings, matchMode)
    local mode = normalizeMatchMode(matchMode)
    if mode == "full" then
        return appliedSettings, mode
    end

    local filtered = {}
    for key, value in pairs(appliedSettings or {}) do
        local isColor = isColorSettingKey(key)
        if (mode == "color" and isColor) or (mode == "tone" and not isColor) then
            filtered[key] = value
        end
    end
    return filtered, mode
end

local function applyMatchToSelection(catalog, sourcePhoto, sourceRunSummary, matchMode)
    if not catalog or not sourcePhoto then
        return false, 0, "missing_catalog_or_source"
    end

    local appliedSettings = sourceRunSummary and sourceRunSummary.appliedSettings
    if type(appliedSettings) ~= "table" or next(appliedSettings) == nil then
        return false, 0, "missing_applied_settings"
    end
    local matchedSettings, normalizedMatchMode = buildSettingsForMatch(appliedSettings, matchMode)
    local matchedKeyCount = 0
    for _ in pairs(matchedSettings or {}) do
        matchedKeyCount = matchedKeyCount + 1
    end
    if type(matchedSettings) ~= "table" or next(matchedSettings) == nil then
        return false, 0, "no_keys_for_match_mode_" .. tostring(normalizedMatchMode), normalizedMatchMode, 0
    end

    local selectedPhotos = catalog:getTargetPhotos() or {}
    local targets = {}
    for _, photo in ipairs(selectedPhotos) do
        if photo ~= sourcePhoto then
            targets[#targets + 1] = photo
        end
    end

    if #targets == 0 then
        return false, 0, "no_targets"
    end

    local okWrite, writeErr = catalogWrite.run(
        catalog,
        "MindfulLens Match Selection",
        function()
            for _, targetPhoto in ipairs(targets) do
                targetPhoto:applyDevelopSettings(matchedSettings)
            end
        end,
        { attempts = 20, sleep = 0.10, sleepMax = 0.50 }
    )
    if not okWrite then
        return false, 0, tostring(writeErr or "match_write_failed"), normalizedMatchMode, matchedKeyCount
    end

    local prefs = LrPrefs.prefsForPlugin()
    local sourcePrintSelections = photoScopedPrefs.loadPrintSelections(prefs, sourcePhoto)
    if sourcePrintSelections and sourcePrintSelections.anyActive then
        for _, targetPhoto in ipairs(targets) do
            photoScopedPrefs.savePrintSelections(prefs, targetPhoto, sourcePrintSelections)
        end
    end

    return true, #targets, nil, normalizedMatchMode, matchedKeyCount
end

local function showDialogAndRun()
    LrFunctionContext.callWithContext("showDialogAndRun", function(context)
        local f = LrView.osFactory()
        local bind = LrView.bind
        local props = LrBinding.makePropertyTable(context)
        local prefs = LrPrefs.prefsForPlugin()

        props.emulsion = config.defaultEmulsionId
        props.format = config.defaultFormatId
        props.sourceScale = config.defaultSourceScaleId or "auto"
        props.profileMode = config.defaultProfileMode or "production"
        props.conversionMode = tostring(config.defaultConversionMode or "analyze")
        props.nightBoostLevel = config.defaultNightBoostLevel or "off"
        props.pushPullEv = tostring(prefs.panel1PushPullEv or "0")
        props.autoDmin = (config.defaultAutoDmin ~= false)
        props.applyFoundation = (config.defaultApplyFoundation ~= false)
        props.useAnalyzerWB = (config.defaultUseAnalyzerWB ~= false)
        props.useAnalyzerOverrides = (config.defaultUseAnalyzerOverrides == true)
        props.applyCameraProfile = (config.defaultApplyCameraProfile == true)
        props.enableBackupRender = (config.defaultEnableBackupRender ~= false)
        props.allowGenericFallback = (config.defaultAllowGenericFallback == true)
        props.debugKeepTemp = (config.defaultDebugKeepTemp == true)
        applyPanel2StateToProps(props, loadPanel2StateFromPrefs(prefs))
        props.matchMode = tostring(config.defaultMatchMode or "full")
        props.matchSelection = false
        props.devUnlock = (prefs.devUnlock == true)
        props.strictAssets = (prefs.strictAssets == true)
        prefs.startRunCount = prefs.startRunCount or 0
        props.emulsionFamilyTitle = ""
        props.emulsionFamilyDescription = ""
        props.emulsionSignatureLine = ""
        props.emulsionTagLine = ""

        local catalog = LrApplication.activeCatalog()
        local serviceModeEnabled = prefs.serviceMode == true
        local devUnlockFlagPath = LrPathUtils.child(_PLUGIN.path, "developer_unlock.flag")
        local devUnlockEnabled = LrFileUtils.exists(devUnlockFlagPath) or prefs.devUnlock == true
        local strictFlagPath = LrPathUtils.child(_PLUGIN.path, "strict_assets.flag")
        local strictAssetsEnabled = serviceModeEnabled and (LrFileUtils.exists(strictFlagPath) or prefs.strictAssets == true)
        local function sectionTitle(title)
            return f:static_text({
                title = title,
                fill_horizontal = 1,
                font = "<system/bold>",
            })
        end

        local function subtitleText(title)
            return f:static_text({
                title = title,
                fill_horizontal = 1,
                font = "<system/small>",
            })
        end

        local function toolLabel(title, width)
            return f:static_text({
                title = title,
                width = width,
                font = "<system/small>",
            })
        end

        local function refreshSelectedEmulsionInfo()
            local selected = config.findEmulsion(props.emulsion)
            if not selected then
                props.emulsionFamilyTitle = "Rodzina zastosowania: baza zdjęcia"
                props.emulsionFamilyDescription = "Ta opcja nie nakłada charakteru filmu i pozostawia bieżący stan zdjęcia."
                props.emulsionTagLine = "Tagi: neutralne • wejście"
                return
            end

            local familyTitle = tostring(selected.publicCategoryTitle or "Rodzina autorska")
            local familyDescription = tostring(selected.publicCategoryDescription or "Film gotowy do dalszego dopracowania w kolejnych panelach.")
            props.emulsionFamilyTitle = "Rodzina zastosowania: " .. familyTitle
            props.emulsionFamilyDescription = familyDescription
            props.emulsionSignatureLine = "Sygnatura Analog Signature: " .. tostring(selected.publicLabel or selected.label or "")
            props.emulsionTagLine = formatTagLine(selected.publicTags)
        end

        refreshSelectedEmulsionInfo()
        props:addObserver("emulsion", refreshSelectedEmulsionInfo)

        local contentItems = {
            bind_to_object = props,
            spacing = f:control_spacing(),

            subtitleText(
                "PANEL I — INGEST & KALIBRACJA: wejście sygnału RAW do modelu analogowego (emulsja, format, skala źródła, inwersja)."
            ),
            subtitleText(
                "Kolejne panele (II+) budują tonalność, chemię błony, ziarno SSG, optykę i wykończenie — zgodnie z kolejnością pipeline."
            ),
            f:separator({ fill_horizontal = 1 }),
            sectionTitle("Emulsja (katalog)"),
            subtitleText("Profil chemiczny z biblioteki albo [ORYGINAL] powyżej — reset bez nakładania charakteru filmu."),

            f:row({
                spacing = f:label_spacing(),
                toolLabel("Emulsja", 180),
                f:popup_menu({
                    value = bind("emulsion"),
                    items = makeItems(config.emulsions),
                    fill_horizontal = 1,
                }),
            }),
            subtitleText(
                "Filmy pogrupowane wg procesu (C-41, E-6/K-14, Cinema, B&W, SIM, Creative)."
            ),
            subtitleText(
                "Po wyborze emulsji: rodzina zastosowania, sygnatura katalogowa i tagi pomocnicze."
            ),
            f:group_box({
                fill_horizontal = 1,
                f:spacer({ height = 4 }),
                f:row({
                    spacing = 0,
                    f:spacer({ width = 10 }),
                    f:column({
                        spacing = 4,
                        f:static_text({
                            title = bind("emulsionFamilyTitle"),
                            fill_horizontal = 1,
                            font = "<system/bold>",
                        }),
                        f:static_text({
                            title = bind("emulsionFamilyDescription"),
                            fill_horizontal = 1,
                            font = "<system/small>",
                        }),
                        f:static_text({
                            title = bind("emulsionSignatureLine"),
                            fill_horizontal = 1,
                            font = "<system/small>",
                        }),
                        f:static_text({
                            title = bind("emulsionTagLine"),
                            fill_horizontal = 1,
                            font = "<system/small>",
                        }),
                    }),
                    f:spacer({ width = 10 }),
                }),
                f:spacer({ height = 4 }),
            }),

            f:row({
                spacing = f:label_spacing(),
                toolLabel("Format filmu", 180),
                f:popup_menu({
                    value = bind("format"),
                    items = makeFormatItems(config.formats),
                    fill_horizontal = 1,
                }),
            }),
            subtitleText("Skala negatywu wpływa na morfologię ziarna (SSG), halację i dyspersję optyczną w pipeline — bez zmiany samej ekspozycji barwnej."),
            f:row({
                spacing = f:label_spacing(),
                toolLabel("Matryca aparatu (skala źródła)", 180),
                f:popup_menu({
                    value = bind("sourceScale"),
                    items = makeSourceScaleItems(config.sourceScales),
                    fill_horizontal = 1,
                }),
            }),
            subtitleText("Mapuje zakres tonalny matrycy na przestrzeń pracy wtyczki. „Auto” rozpoznaje klasę aparatu; można wymusić ręcznie."),
            f:separator({ fill_horizontal = 1 }),
            sectionTitle("Tryb konwersji i kalibracja automatyczna"),
            subtitleText("Analiza negatywu uruchamia silnik inwersji i analizatora; „Tylko edycja” pomija analizę sceny."),

            f:row({
                spacing = f:label_spacing(),
                toolLabel("Tryb konwersji", 180),
                f:popup_menu({
                    value = bind("conversionMode"),
                    items = makeConversionModeItems(),
                    fill_horizontal = 1,
                }),
            }),

            f:checkbox({
                title = "Auto-korekta maski pomarańczowej (baza C-41 przed inwersją)",
                value = bind("autoDmin"),
            }),

            f:checkbox({
                title = "Zastosuj bazę wywołania (foundation preset)",
                value = bind("applyFoundation"),
            }),

            f:checkbox({
                title = "[AUTO] Analizator ekspozycji / WB (światła i cienie → szarość inwersji)",
                value = bind("useAnalyzerWB"),
            }),

            f:row({
                spacing = f:label_spacing(),
                toolLabel("Wzmocnienie ekspozycji w cieniu (Dmax / ISO)", 280),
                f:popup_menu({
                    value = bind("nightBoostLevel"),
                    items = makeNightBoostItems(config.nightBoostLevels or {
                        { id = "off", label = "Reset (0)" },
                        { id = "soft", label = "Poziom I" },
                        { id = "medium", label = "Poziom II" },
                        { id = "strong", label = "Poziom III" },
                    }),
                    fill_horizontal = 1,
                }),
            }),
            subtitleText("Wyższe poziomy zwiększają „energię” ziarna i separację tonów w ciemnych partiach (powiązanie z czułością ISO w silniku)."),

            f:row({
                spacing = f:label_spacing(),
                toolLabel("Push / pull wywołania (EV)", 280),
                f:popup_menu({
                    value = bind("pushPullEv"),
                    items = makePushPullEvItems(),
                    fill_horizontal = 1,
                }),
            }),
            subtitleText("Forsowanie wywołania (gamma / kontrast): stała delta Exposure po analizie. 0 = neutralnie."),

            f:separator({ fill_horizontal = 1 }),
            sectionTitle("Profil kamery i DCP"),
            subtitleText("Color Process / Lab — w Panelu II (podgląd na żywo). Tu: integracja z Camera Raw."),
            f:row({
                spacing = f:label_spacing(),
                toolLabel("Match Mode", 180),
                f:popup_menu({
                    value = bind("matchMode"),
                    items = makeMatchModeItems(),
                    fill_horizontal = 1,
                }),
            }),
            f:column({
                bind_to_object = props,
                spacing = f:control_spacing(),
                f:checkbox({
                    title = "Użyj natywnego profilu aparatu (stock DCP), gdy dostępny",
                    value = bind("applyCameraProfile"),
                }),
                f:checkbox({
                    title = "Zezwól na nadpisania koloru i krzywej z analizatora (eksperymentalne)",
                    value = bind("useAnalyzerOverrides"),
                }),
                f:checkbox({
                    title = "Włącz zapasowy render TIFF/JPEG",
                    value = bind("enableBackupRender"),
                }),
                f:checkbox({
                    title = "DCP fallback: generyczny profil przy nieznanej matrycy lub DNG",
                    value = bind("allowGenericFallback"),
                }),
                f:checkbox({
                    title = "Match po konwersji: zastosuj wynik na całe zaznaczenie",
                    value = bind("matchSelection"),
                }),
            }),
        }

        if serviceModeEnabled then
            table.insert(contentItems, f:separator({ fill_horizontal = 1 }))
            table.insert(contentItems, sectionTitle("Narzędzia serwisowe (ukryte w buildzie klienckim)"))
            table.insert(contentItems, f:checkbox({
                title = "Developer unlock (fallback bez wymaganych assetów)",
                value = bind("devUnlock"),
            }))
            table.insert(contentItems, f:push_button({
                title = "Uruchom test integralności systemu",
                action = function()
                    pluginLoad("SystemHealthMenu.lua")
                end,
            }))
        end

        local result = LrDialogs.presentModalDialog({
            title = PANEL1_TITLE,
            save_frame = PANEL1_DIALOG_FRAME_KEY,
            actionVerb = "Uruchom ingest",
            cancelVerb = "Zamknij",
            contents = f:scrolled_view({
                width = 500,
                height = 670,
                horizontal_scroller = false,
                vertical_scroller = true,
                f:column(contentItems),
            }),
        })

        if result ~= "ok" then
            return
        end
        if serviceModeEnabled then
            prefs.devUnlock = (props.devUnlock == true)
            prefs.strictAssets = (props.strictAssets == true)
        end

        local photo = catalog:getTargetPhoto()
        if not photo then
            LrDialogs.message(PANEL1_TITLE, "Najpierw wybierz zdjęcie.", "critical")
            return
        end

        if props.emulsion == ORIGINAL_EMULSION_ID then
            if not ensureDevelopModuleForOriginalReset() then
                LrDialogs.message(PANEL1_TITLE, "Reset [ORYGINAL] działa tylko w module Develop.", "critical")
                return
            end

            LrFunctionContext.postAsyncTaskWithContext("MindfulLensResetOriginal", function()
                local okReset, errReset = resetPhotoToOriginal()
                if not okReset then
                    logger.error("Original reset failed", { error = tostring(errReset or "") })
                    LrDialogs.message(PANEL1_TITLE, "Nie można przywrócić oryginału zdjęcia: " .. tostring(errReset), "critical")
                    return
                end

                prefs.lastFormat = props.format
                prefs.lastSourceScale = props.sourceScale
                prefs.lastEmulsion = props.emulsion
                LrDialogs.message(PANEL1_RESULT_TITLE, "Przywrócono oryginał zdjęcia.", "info")
            end)
            return
        end

        local selectedEmulsion = config.findEmulsion(props.emulsion)
        local function countUsageByField(fieldName, value)
            local count = 0
            for _, em in ipairs(config.emulsions or {}) do
                if em[fieldName] == value then
                    count = count + 1
                end
            end
            return count
        end
        local function escapePattern(text)
            return (tostring(text or ""):gsub("([^%w])", "%%%1"))
        end
        local function hasCameraSpecificDcp(dirPath, dcpFile)
            if not dirPath or not dcpFile or dcpFile == "" then
                return false
            end
            local base = tostring(dcpFile):gsub("%.dcp$", "")
            local iter = LrFileUtils.directoryEntries(dirPath)
            if not iter then
                return false
            end
            local pattern = "^" .. escapePattern(base) .. "__.+%.dcp$"
            for entry in iter do
                local leaf = LrPathUtils.leafName(entry)
                if string.match(leaf, pattern) then
                    return true
                end
            end
            return false
        end
        if selectedEmulsion and selectedEmulsion.dcpFile then
            -- Ensure all bundled DCPs are installed before checking availability.
            pcall(function()
                profileInstaller.installAllDcpProfiles(_PLUGIN.path)
            end)
            local dcpSourcePath = LrPathUtils.child(_PLUGIN.path, "profiles/dcp/" .. selectedEmulsion.dcpFile)
            local dcpInstalledPath = LrPathUtils.child(profileInstaller.getCameraProfilesDir(), selectedEmulsion.dcpFile)
            local sourceExists = LrFileUtils.exists(dcpSourcePath)
            local installedExists = LrFileUtils.exists(dcpInstalledPath)
            local missing = {}
            local warnings = {}
            if not sourceExists then
                missing[#missing + 1] = "Brak źródła DCP w pluginie:\n - " .. dcpSourcePath
            end
            if sourceExists and not installedExists then
                warnings[#warnings + 1] = "Główne DCP zostanie zainstalowane przy uruchomieniu:\n - " .. dcpInstalledPath
            end
            if props.allowGenericFallback then
                warnings[#warnings + 1] = "Włączony jest fallback uniwersalnego głównego DCP."
            end
            if selectedEmulsion.foundationPreset and selectedEmulsion.foundationPreset ~= "" then
                local foundationPath = LrPathUtils.child(_PLUGIN.path, selectedEmulsion.foundationPreset)
                if not LrFileUtils.exists(foundationPath) then
                    missing[#missing + 1] = "Brak Foundation XMP:\n - " .. foundationPath
                end
            end
            if selectedEmulsion.lutFile and selectedEmulsion.lutFile ~= "" then
                local lutPath = LrPathUtils.child(_PLUGIN.path, selectedEmulsion.lutFile)
                if not LrFileUtils.exists(lutPath) then
                    missing[#missing + 1] = "Brak LUT cube:\n - " .. lutPath
                end
            end

            local sharedNotes = {}
            if selectedEmulsion.dcpFile and countUsageByField("dcpFile", selectedEmulsion.dcpFile) > 1 then
                sharedNotes[#sharedNotes + 1] = "DCP"
            end
            if selectedEmulsion.lutFile and countUsageByField("lutFile", selectedEmulsion.lutFile) > 1 then
                sharedNotes[#sharedNotes + 1] = "LUT"
            end

            if #missing > 0 then
                local lines = {
                    "Wybrana emulsja: " .. displayEmulsionLabel(selectedEmulsion),
                    "",
                    "Brak wymaganych assetów:",
                    table.concat(missing, "\n\n"),
                    "",
                    "Najpierw napraw:",
                    "1) File -> Plug-in Extras -> Install DCP Profiles (if available)",
                    "2) File -> Plug-in Extras -> System Health Check",
                }
                if devUnlockEnabled or (serviceModeEnabled and props.devUnlock) then
                    lines[#lines + 1] = ""
                    lines[#lines + 1] = "Developer unlock jest WŁĄCZONY. Możesz kontynuować, ale zgodność kolorystyczna nie jest gwarantowana."
                    local confirm = LrDialogs.confirm(
                        PANEL1_TITLE,
                        table.concat(lines, "\n"),
                        "Kontynuuj (fallback deweloperski)",
                        "Anuluj"
                    )
                    if confirm ~= "ok" then
                        return
                    end
                else
                    LrDialogs.message(PANEL1_TITLE, table.concat(lines, "\n"), "critical")
                    return
                end
            elseif #warnings > 0 then
                local warnLines = {
                    "Wybrana emulsja: " .. displayEmulsionLabel(selectedEmulsion),
                    "",
                    "Informacja:",
                    table.concat(warnings, "\n\n"),
                }
                LrDialogs.message(PANEL1_TITLE, table.concat(warnLines, "\n"), "info")
            elseif #sharedNotes > 0 then
                local strictOn = strictAssetsEnabled or (serviceModeEnabled and props.strictAssets)
                if strictOn then
                    local blockLines = {
                        "Wybrana emulsja: " .. displayEmulsionLabel(selectedEmulsion),
                        "",
                        "Tryb strict assets jest WŁĄCZONY.",
                        "Ta emulsja współdzieli " .. table.concat(sharedNotes, " i ") .. " z innymi filmami.",
                        "Zapewnij unikalne assety lub wyłącz tryb strict.",
                    }
                    LrDialogs.message(PANEL1_TITLE, table.concat(blockLines, "\n"), "critical")
                    return
                end
                local warnLines = {
                    "Wybrana emulsja: " .. displayEmulsionLabel(selectedEmulsion),
                    "",
                    "Informacja: ta emulsja współdzieli " .. table.concat(sharedNotes, " i ") .. " z innymi filmami.",
                    "Kolory mogą wyglądać podobnie między filmami, dopóki nie dostarczysz unikalnych assetów.",
                }
                local confirm = LrDialogs.confirm(
                    PANEL1_TITLE,
                    table.concat(warnLines, "\n"),
                    "Kontynuuj",
                    "Anuluj"
                )
                if confirm ~= "ok" then
                    return
                end
            end
        end

        LrFunctionContext.postAsyncTaskWithContext("MindfulLensFilmEngineRun", function()
            local runSummary = nil
            local panel2State = loadPanel2StateFromPrefs(prefs)
            applyPanel2StateToProps(props, panel2State)
            logger.info("Panel II settings loaded for run", {
                color_process = tostring(panel2State.colorProcess or ""),
                lut_intensity = tostring(panel2State.lutIntensity or ""),
                saturation_trim = tostring(panel2State.saturationTrim or ""),
                lab_glow = tostring(panel2State.labGlow or ""),
                lab_fade = tostring(panel2State.labFade or ""),
                soft_highs = tostring(panel2State.softHighs == true),
                soft_lows = tostring(panel2State.softLows == true),
                white_clip = tostring(panel2State.whiteClip or ""),
                black_clip = tostring(panel2State.blackClip or ""),
            })
            local ok, err = LrTasks.pcall(function()
                runSummary = bridge.run({
                    photo = photo,
                    emulsionId = props.emulsion,
                    formatId = props.format,
                    sourceScaleId = props.sourceScale,
                    profileMode = props.profileMode,
                    conversionMode = props.conversionMode,
                    colorProcess = panel2State.colorProcess,
                    nightBoostLevel = props.nightBoostLevel,
                    autoDmin = props.autoDmin,
                    debugKeepTemp = props.debugKeepTemp,
                    applyFoundation = props.applyFoundation,
                    useAnalyzerWB = props.useAnalyzerWB,
                    useAnalyzerOverrides = props.useAnalyzerOverrides,
                    applyCameraProfile = props.applyCameraProfile,
                    enableBackupRender = props.enableBackupRender,
                    backupOnProfileReject = (config.defaultBackupOnProfileReject ~= false),
                    allowGenericFallback = props.allowGenericFallback,
                    lutIntensity = tonumber(panel2State.lutIntensity) or 100,
                    saturationTrim = tonumber(panel2State.saturationTrim) or 0,
                    labGlow = tonumber(panel2State.labGlow) or 0,
                    labFade = tonumber(panel2State.labFade) or 0,
                    softHighs = (panel2State.softHighs == true),
                    softLows = (panel2State.softLows == true),
                    whiteClip = tonumber(panel2State.whiteClip) or 0,
                    blackClip = tonumber(panel2State.blackClip) or 0,
                    pushPullEv = tonumber(props.pushPullEv) or 0,
                })
            end)

            if not ok then
                logger.error("Pipeline failed", { error = tostring(err) })
                LrDialogs.message(PANEL1_TITLE, "Pipeline failed: " .. tostring(err), "critical")
                return
            end

            prefs.startRunCount = (prefs.startRunCount or 0) + 1
            prefs.lastFormat = props.format
            prefs.lastSourceScale = props.sourceScale
            prefs.lastEmulsion = props.emulsion
            prefs.panel1PushPullEv = tostring(tonumber(props.pushPullEv) or 0)

            local profileStatus = (runSummary and runSummary.cameraProfileStatus) or "unknown"
            local backupStatus = (runSummary and runSummary.backupRenderStatus) or "unknown"
            local lines = {
                "Silnik: OK",
                "Zastosowanie w Lightroom: OK",
                "Tryb: " .. tostring(props.conversionMode or "analyze"),
                "Color Process: " .. tostring(props.colorProcess or "refined"),
                "Profil: " .. tostring(profileStatus),
                "Render zapasowy: " .. tostring(backupStatus),
                "Lab: Glow " .. tostring(props.labGlow or "0")
                    .. " | Fade " .. tostring(props.labFade or "0")
                    .. " | SoftHighs " .. tostring(props.softHighs == true)
                    .. " (" .. tostring(props.whiteClip or "0") .. ")"
                    .. " | SoftLows " .. tostring(props.softLows == true)
                    .. " (" .. tostring(props.blackClip or "0") .. ")",
            }
            if props.matchSelection == true then
                local matchOk, matchedCount, matchErr, matchModeUsed, matchKeyCount = applyMatchToSelection(catalog, photo, runSummary, props.matchMode)
                if matchOk then
                    lines[#lines + 1] = "Match (" .. tostring(matchModeUsed or "full") .. "): zastosowano na "
                        .. tostring(matchedCount) .. " klatkach (klucze: " .. tostring(matchKeyCount or 0) .. ")."
                else
                    if tostring(matchErr or "") == "no_targets" then
                        lines[#lines + 1] = "Match: pominięto (brak dodatkowych klatek)."
                    elseif string.find(tostring(matchErr or ""), "no_keys_for_match_mode_", 1, true) == 1 then
                        lines[#lines + 1] = "Match (" .. tostring(matchModeUsed or "full") .. "): pominięto (brak kompatybilnych ustawień, klucze: "
                            .. tostring(matchKeyCount or 0) .. ")."
                    else
                        lines[#lines + 1] = "Match: błąd (" .. tostring(matchErr or "unknown") .. ")."
                    end
                end
            end
            if runSummary and runSummary.backupRenderDir and runSummary.backupRenderDir ~= "" and backupStatus == "rendered" then
                lines[#lines + 1] = "Folder renderu zapasowego:"
                lines[#lines + 1] = tostring(runSummary.backupRenderDir)
            end
            LrDialogs.message(PANEL1_RESULT_TITLE, table.concat(lines, "\n"), "info")
        end)
    end)
end

showDialogAndRun()
