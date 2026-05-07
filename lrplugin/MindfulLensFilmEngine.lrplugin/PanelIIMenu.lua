local LrApplication = import "LrApplication"
local LrBinding = import "LrBinding"
local LrDialogs = import "LrDialogs"
local LrFunctionContext = import "LrFunctionContext"
local LrPathUtils = import "LrPathUtils"
local LrPrefs = import "LrPrefs"
local LrTasks = import "LrTasks"
local LrView = import "LrView"

local function pluginLoad(relativePath)
    return dofile(LrPathUtils.child(_PLUGIN.path, relativePath))
end

local config = pluginLoad("lib/FilmEngineConfig.lua")
local logger = pluginLoad("lib/Logger.lua")
local developPreview = pluginLoad("lib/DevelopPreview.lua")
local catalogWrite = pluginLoad("lib/CatalogWrite.lua")

local PANEL_TITLE = "Panel II: Charakter Ciemni (LIVE)"
local PANEL2_DIALOG_FRAME_KEY = "mindfullens.panel2.dialog"

local PREVIEW_KEYS = {
    "Vibrance",
    "Saturation",
    "Dehaze",
    "Clarity2012",
    "Contrast2012",
    "Highlights2012",
    "Shadows2012",
    "Whites2012",
    "Blacks2012",
}

local function clampNumber(value, minValue, maxValue)
    if value < minValue then
        return minValue
    end
    if value > maxValue then
        return maxValue
    end
    return value
end

local function roundNearest(value)
    if value >= 0 then
        return math.floor(value + 0.5)
    end
    return math.ceil(value - 0.5)
end

local function makeColorProcessItems()
    return {
        { title = "Refined (neutralny, nowa baza)", value = "refined" },
        { title = "Neutral Soft (bezpieczny srodek)", value = "neutral_soft" },
        { title = "Classic (bardziej analogowy kontrast)", value = "classic" },
    }
end

local function makeLutIntensityItems()
    local levels = { 0, 25, 50, 75, 100, 125, 150 }
    local items = {}
    for _, value in ipairs(levels) do
        items[#items + 1] = { title = tostring(value) .. "%", value = tostring(value) }
    end
    return items
end

local function makeSignedItems(levels)
    local items = {}
    for _, value in ipairs(levels or {}) do
        local title = tostring(value)
        if value > 0 then
            title = "+" .. title
        end
        items[#items + 1] = { title = title, value = tostring(value) }
    end
    return items
end

local function makeSaturationTrimItems()
    return makeSignedItems({ -30, -20, -10, 0, 10, 20, 30 })
end

local function makeLabToneItems()
    return makeSignedItems({ -30, -20, -10, 0, 10, 20, 30 })
end

local function makeClipItems()
    return makeSignedItems({ -20, -10, -5, 0, 5, 10, 15, 20 })
end

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

local function panel2DefaultState(prefs)
    return {
        colorProcess = tostring(config.defaultColorProcess or "refined"),
        lutIntensity = tostring(config.defaultLutIntensity or "100"),
        saturationTrim = tostring(config.defaultSaturationTrim or "0"),
        labGlow = tostring(config.defaultLabGlow or "0"),
        labFade = tostring(config.defaultLabFade or "0"),
        softHighs = (config.defaultSoftHighs == true),
        softLows = (config.defaultSoftLows == true),
        whiteClip = tostring(config.defaultWhiteClip or "0"),
        blackClip = tostring(config.defaultBlackClip or "0"),
        livePreview = (prefs and prefs.panel2LivePreview ~= false),
    }
end

local function panel2SavedStateFromPrefs(prefs)
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
        livePreview = (source.panel2LivePreview ~= false),
    }
end

local function panel2StateSummary(state)
    local source = state or {}
    return "Ostatnio zapisane: "
        .. "Color " .. tostring(source.colorProcess or "refined")
        .. " | Glow " .. tostring(source.labGlow or "0")
        .. " | Fade " .. tostring(source.labFade or "0")
        .. " | SH " .. tostring(source.softHighs == true)
        .. " (" .. tostring(source.whiteClip or "0") .. ")"
        .. " | SL " .. tostring(source.softLows == true)
        .. " (" .. tostring(source.blackClip or "0") .. ")"
end

local function applyPanel2StateToProps(props, state)
    local source = state or {}
    props.colorProcess = tostring(source.colorProcess or "refined")
    props.lutIntensity = tostring(source.lutIntensity or "100")
    props.saturationTrim = tostring(source.saturationTrim or "0")
    props.labGlow = tostring(source.labGlow or "0")
    props.labFade = tostring(source.labFade or "0")
    props.softHighs = (source.softHighs == true)
    props.softLows = (source.softLows == true)
    props.whiteClip = tostring(source.whiteClip or "0")
    props.blackClip = tostring(source.blackClip or "0")
    props.livePreview = (source.livePreview == true)
end

local function snapshotPanel2State(props)
    return {
        colorProcess = tostring(props.colorProcess or "refined"),
        lutIntensity = tostring(props.lutIntensity or "100"),
        saturationTrim = tostring(props.saturationTrim or "0"),
        labGlow = tostring(props.labGlow or "0"),
        labFade = tostring(props.labFade or "0"),
        softHighs = (props.softHighs == true),
        softLows = (props.softLows == true),
        whiteClip = tostring(props.whiteClip or "0"),
        blackClip = tostring(props.blackClip or "0"),
        livePreview = (props.livePreview == true),
    }
end

local function hasAnyEntries(tableValue)
    if type(tableValue) ~= "table" then
        return false
    end
    for _ in pairs(tableValue) do
        return true
    end
    return false
end

local function isMonochromeEmulsion(emulsionId, baselineSettings)
    if type(baselineSettings) == "table" and baselineSettings.ConvertToGrayscale == true then
        return true
    end
    local emulsion = config.findEmulsion(emulsionId)
    if emulsion and emulsion.bw == true then
        return true
    end
    local id = string.lower(tostring(emulsion and emulsion.id or ""))
    local label = string.lower(tostring((emulsion and emulsion.label) or ""))
    local function hasToken(token)
        return string.find(id, token, 1, true) or string.find(label, token, 1, true)
    end
    return hasToken("bw_")
        or hasToken("acros")
        or hasToken("tri-x")
        or hasToken("t-max")
        or hasToken("ilford")
        or hasToken("hp5")
        or hasToken("delta")
        or hasToken("xp2")
        or hasToken("foma")
        or hasToken("arista")
        or hasToken("monochrome")
        or hasToken("black and white")
end

local function buildPreviewSettings(baselineSettings, props, emulsionId)
    local baseline = baselineSettings or {}
    local state = {}
    local output = {}
    local monochrome = isMonochromeEmulsion(emulsionId, baseline)
    local colorProcess = string.lower(tostring(props.colorProcess or "refined"))

    for _, key in ipairs(PREVIEW_KEYS) do
        state[key] = tonumber(baseline[key])
    end

    local function currentValue(key)
        return tonumber(state[key]) or 0
    end

    local function setValue(key, value, minValue, maxValue)
        local oldValue = currentValue(key)
        local bounded = roundNearest(clampNumber(value, minValue, maxValue))
        if bounded ~= oldValue then
            state[key] = bounded
            output[key] = bounded
        end
    end

    local function adjust(key, delta, minValue, maxValue)
        setValue(key, currentValue(key) + delta, minValue, maxValue)
    end

    if colorProcess == "classic" then
        adjust("Contrast2012", 4, -100, 100)
        adjust("Clarity2012", 4, -100, 100)
        adjust("Dehaze", 2, -100, 100)
        adjust("Highlights2012", -4, -100, 100)
        adjust("Shadows2012", 2, -100, 100)
        if not monochrome then
            adjust("Vibrance", 6, -100, 100)
            adjust("Saturation", 3, -100, 100)
        end
    elseif colorProcess == "neutral_soft" then
        adjust("Contrast2012", -2, -100, 100)
        adjust("Clarity2012", -2, -100, 100)
        adjust("Dehaze", -1, -100, 100)
        adjust("Highlights2012", -2, -100, 100)
        adjust("Shadows2012", 2, -100, 100)
        if not monochrome then
            adjust("Vibrance", 2, -100, 100)
        end
    end

    local glow = clampNumber(tonumber(props.labGlow) or 0, -30, 30)
    local fade = clampNumber(tonumber(props.labFade) or 0, -30, 30)
    local whiteClip = clampNumber(tonumber(props.whiteClip) or 0, -20, 20)
    local blackClip = clampNumber(tonumber(props.blackClip) or 0, -20, 20)

    if glow ~= 0 then
        adjust("Clarity2012", roundNearest(-0.7 * glow), -100, 100)
        adjust("Dehaze", roundNearest(-0.4 * glow), -100, 100)
        adjust("Highlights2012", roundNearest(-0.5 * glow), -100, 100)
        adjust("Whites2012", roundNearest(-0.3 * glow), -100, 100)
    end

    if fade ~= 0 then
        adjust("Contrast2012", roundNearest(-0.8 * fade), -100, 100)
        adjust("Shadows2012", roundNearest(0.5 * fade), -100, 100)
        adjust("Blacks2012", roundNearest(0.9 * fade), -100, 100)
    end

    if props.softHighs == true then
        local hiRoll = roundNearest(8 + whiteClip)
        local hiWhite = roundNearest(5 + (whiteClip * 0.8))
        adjust("Highlights2012", -hiRoll, -100, 100)
        adjust("Whites2012", -hiWhite, -100, 100)
    end

    if props.softLows == true then
        local loLift = roundNearest(8 + blackClip)
        local loBlack = roundNearest(5 + (blackClip * 0.8))
        adjust("Shadows2012", loLift, -100, 100)
        adjust("Blacks2012", loBlack, -100, 100)
    end

    local intensity = clampNumber(tonumber(props.lutIntensity) or 100, 0, 200)
    local factor = intensity / 100.0
    if factor ~= 1.0 then
        setValue("Vibrance", currentValue("Vibrance") * factor, -100, 100)
        setValue("Saturation", currentValue("Saturation") * factor, -100, 100)
    end

    local trim = clampNumber(tonumber(props.saturationTrim) or 0, -50, 50)
    if monochrome then
        trim = 0
    end
    if trim ~= 0 then
        setValue("Saturation", currentValue("Saturation") + trim, -100, 100)
        setValue("Vibrance", currentValue("Vibrance") + roundNearest(trim * 0.7), -100, 100)
    end

    if monochrome then
        setValue("Saturation", -100, -100, 100)
        setValue("Vibrance", -100, -100, 100)
    end

    return output
end

local function showDialog()
    LrFunctionContext.callWithContext("MindfulLensPanelIIStyle", function(context)
        local f = LrView.osFactory()
        local bind = LrView.bind
        local props = LrBinding.makePropertyTable(context)
        local prefs = LrPrefs.prefsForPlugin()
        local catalog = LrApplication.activeCatalog()
        local targetPhoto = catalog and catalog:getTargetPhoto() or nil
        local emulsionId = tostring(prefs.lastEmulsion or config.defaultEmulsionId or "portra_400")
        local initialState = panel2DefaultState(prefs)
        local savedStateAtOpen = panel2SavedStateFromPrefs(prefs)
        applyPanel2StateToProps(props, initialState)
        local entryState = snapshotPanel2State(props)
        props.savedStateSummary = panel2StateSummary(savedStateAtOpen)

        local baselineDevelopSettings = nil
        local previewAppliedEntries = {}
        local previewApplied = false
        local previewDirty = false
        local previewWorker = false
        local dialogClosing = false

        if targetPhoto then
            local okPhoto, photoSettings = pcall(function()
                return targetPhoto:getDevelopSettings()
            end)
            if okPhoto and type(photoSettings) == "table" then
                baselineDevelopSettings = {}
                for _, key in ipairs(PREVIEW_KEYS) do
                    if tonumber(photoSettings[key]) ~= nil then
                        baselineDevelopSettings[key] = tonumber(photoSettings[key])
                    end
                end
                if photoSettings.ConvertToGrayscale == true then
                    baselineDevelopSettings.ConvertToGrayscale = true
                end
            end

            local okCapture, _, previewValues = developPreview.captureValues(PREVIEW_KEYS)
            if okCapture and type(previewValues) == "table" then
                baselineDevelopSettings = baselineDevelopSettings or {}
                for key, value in pairs(previewValues) do
                    if tonumber(value) ~= nil then
                        baselineDevelopSettings[key] = tonumber(value)
                    end
                end
            end
        end

        local function restoreBaseline()
            if not targetPhoto or not baselineDevelopSettings or #previewAppliedEntries == 0 then
                return
            end
            local okRestore, errRestore = developPreview.restoreSettings(baselineDevelopSettings, previewAppliedEntries)
            if not okRestore then
                logger.error("Panel II live preview restore failed", { error = tostring(errRestore or "") })
                return
            end
            previewAppliedEntries = {}
            previewApplied = false
        end

        local function applyLivePreview()
            if dialogClosing then
                return true, nil
            end
            if props.livePreview ~= true or not targetPhoto then
                return true, nil
            end
            if not developPreview.isDevelopModuleActive() then
                return true, nil
            end

            local settings = buildPreviewSettings(baselineDevelopSettings, props, emulsionId)
            local hasSettings = false
            for _ in pairs(settings or {}) do
                hasSettings = true
                break
            end

            if previewApplied then
                restoreBaseline()
            end
            if not hasSettings then
                return true, nil
            end

            local okApply, errApply, appliedEntries = developPreview.applySettings(settings, { logFailures = true })
            if not okApply then
                logger.error("Panel II live preview apply failed", { error = tostring(errApply or "") })
                return false, tostring(errApply or "")
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
                        applyLivePreview()
                    end
                end
                previewWorker = false
            end)
        end

        local function sectionTitle(title)
            return f:static_text({ title = title, fill_horizontal = 1, font = "<system/bold>" })
        end

        local function subtitleText(title)
            return f:static_text({ title = title, fill_horizontal = 1, font = "<system/small>" })
        end

        local function toolLabel(title, width)
            return f:static_text({ title = title, width = width, font = "<system/small>" })
        end

        local content = f:column({
            bind_to_object = props,
            spacing = f:control_spacing(),
            subtitleText("Panel II ustawia charakter ciemni dla konwersji z Panelu I."),
            subtitleText("Podglad LIVE jest tymczasowy (Develop) i sluzy tylko do wyboru ustawien."),
            subtitleText("Referencja emulsji: " .. tostring(emulsionId)),
            subtitleText("Panel startuje od neutralnych delt (0), a zapisane wartosci sa stosowane przez Panel I."),
            f:static_text({
                title = bind("savedStateSummary"),
                fill_horizontal = 1,
                font = "<system/small>",
            }),
            f:separator({ fill_horizontal = 1 }),
            sectionTitle("Charakter i Soft Clip"),
            f:row({
                spacing = f:label_spacing(),
                toolLabel("Color Process", 180),
                f:popup_menu({
                    value = bind("colorProcess"),
                    items = makeColorProcessItems(),
                    fill_horizontal = 1,
                }),
            }),
            f:row({
                spacing = f:label_spacing(),
                toolLabel("LUT Intensity", 180),
                f:popup_menu({
                    value = bind("lutIntensity"),
                    items = makeLutIntensityItems(),
                    fill_horizontal = 1,
                }),
            }),
            f:row({
                spacing = f:label_spacing(),
                toolLabel("Saturation Trim", 180),
                f:popup_menu({
                    value = bind("saturationTrim"),
                    items = makeSaturationTrimItems(),
                    fill_horizontal = 1,
                }),
            }),
            f:row({
                spacing = f:label_spacing(),
                toolLabel("Lab Glow", 180),
                f:popup_menu({
                    value = bind("labGlow"),
                    items = makeLabToneItems(),
                    fill_horizontal = 1,
                }),
            }),
            f:row({
                spacing = f:label_spacing(),
                toolLabel("Lab Fade", 180),
                f:popup_menu({
                    value = bind("labFade"),
                    items = makeLabToneItems(),
                    fill_horizontal = 1,
                }),
            }),
            f:row({
                spacing = f:label_spacing(),
                toolLabel("WhiteClip", 180),
                f:popup_menu({
                    value = bind("whiteClip"),
                    items = makeClipItems(),
                    fill_horizontal = 1,
                }),
            }),
            f:row({
                spacing = f:label_spacing(),
                toolLabel("BlackClip", 180),
                f:popup_menu({
                    value = bind("blackClip"),
                    items = makeClipItems(),
                    fill_horizontal = 1,
                }),
            }),
            f:checkbox({
                title = "Soft Highs",
                value = bind("softHighs"),
            }),
            f:checkbox({
                title = "Soft Lows",
                value = bind("softLows"),
            }),
            f:separator({ fill_horizontal = 1 }),
            f:checkbox({
                title = "Podglad na zywo (Develop)",
                value = bind("livePreview"),
            }),
            f:row({
                spacing = 8,
                f:push_button({
                    title = "Reset panelu (0)",
                    action = function()
                        local resetState = panel2DefaultState(prefs)
                        resetState.livePreview = (props.livePreview == true)
                        applyPanel2StateToProps(props, resetState)
                        LrTasks.startAsyncTask(function()
                            restoreBaseline()
                            if props.livePreview == true then
                                requestLivePreview()
                            end
                        end)
                    end,
                }),
                f:push_button({
                    title = "Przywroc stan wejsciowy",
                    action = function()
                        local restoreState = snapshotPanel2State(entryState)
                        restoreState.livePreview = (props.livePreview == true)
                        applyPanel2StateToProps(props, restoreState)
                        LrTasks.startAsyncTask(function()
                            restoreBaseline()
                            if props.livePreview == true then
                                requestLivePreview()
                            end
                        end)
                    end,
                }),
                f:push_button({
                    title = "Wczytaj ostatni zapis",
                    action = function()
                        local savedState = panel2SavedStateFromPrefs(prefs)
                        savedState.livePreview = (props.livePreview == true)
                        applyPanel2StateToProps(props, savedState)
                        props.savedStateSummary = panel2StateSummary(savedState)
                        LrTasks.startAsyncTask(function()
                            restoreBaseline()
                            if props.livePreview == true then
                                requestLivePreview()
                            end
                        end)
                    end,
                }),
                f:push_button({
                    title = "Cofnij podglad",
                    action = function()
                        LrTasks.startAsyncTask(function()
                            restoreBaseline()
                            LrDialogs.showBezel("MindfulLens: podglad przywrocony", 1.1)
                        end)
                    end,
                }),
            }),
        })

        local liveKeys = {
            "colorProcess",
            "lutIntensity",
            "saturationTrim",
            "labGlow",
            "labFade",
            "softHighs",
            "softLows",
            "whiteClip",
            "blackClip",
        }
        for _, key in ipairs(liveKeys) do
            props:addObserver(key, requestLivePreview)
        end
        props:addObserver("livePreview", function()
            if props.livePreview == true then
                requestLivePreview()
            else
                restoreBaseline()
            end
        end)

        local result = LrDialogs.presentModalDialog({
            title = PANEL_TITLE,
            save_frame = PANEL2_DIALOG_FRAME_KEY,
            actionVerb = "Zapisz ustawienia",
            cancelVerb = "Zamknij",
            contents = f:scrolled_view({
                width = 460,
                height = 520,
                horizontal_scroller = false,
                vertical_scroller = true,
                content,
            }),
        })
        dialogClosing = true
        previewDirty = false
        logger.info("Panel II dialog closed", { result = tostring(result or "") })

        if tostring(result or "") == "cancel" then
            restoreBaseline()
            return
        end
        local savedState = snapshotPanel2State(props)
        local commitSettings = buildPreviewSettings(baselineDevelopSettings, savedState, emulsionId)

        if previewApplied then
            restoreBaseline()
        end

        prefs.panel2ColorProcess = tostring(savedState.colorProcess or config.defaultColorProcess or "refined")
        prefs.panel2LutIntensity = tostring(savedState.lutIntensity or config.defaultLutIntensity or "100")
        prefs.panel2SaturationTrim = tostring(savedState.saturationTrim or config.defaultSaturationTrim or "0")
        prefs.panel2LabGlow = tostring(savedState.labGlow or config.defaultLabGlow or "0")
        prefs.panel2LabFade = tostring(savedState.labFade or config.defaultLabFade or "0")
        prefs.panel2SoftHighs = (savedState.softHighs == true)
        prefs.panel2SoftLows = (savedState.softLows == true)
        prefs.panel2WhiteClip = tostring(savedState.whiteClip or config.defaultWhiteClip or "0")
        prefs.panel2BlackClip = tostring(savedState.blackClip or config.defaultBlackClip or "0")
        prefs.panel2LivePreview = (savedState.livePreview == true)

        logger.info("Panel II settings saved", {
            color_process = tostring(prefs.panel2ColorProcess or ""),
            lut_intensity = tostring(prefs.panel2LutIntensity or ""),
            saturation_trim = tostring(prefs.panel2SaturationTrim or ""),
            lab_glow = tostring(prefs.panel2LabGlow or ""),
            lab_fade = tostring(prefs.panel2LabFade or ""),
            soft_highs = tostring(prefs.panel2SoftHighs == true),
            soft_lows = tostring(prefs.panel2SoftLows == true),
            white_clip = tostring(prefs.panel2WhiteClip or ""),
            black_clip = tostring(prefs.panel2BlackClip or ""),
        })
        local savedSummary = panel2StateSummary(savedState)
        LrTasks.startAsyncTask(function()
            local committedToPhoto = false
            local committedKeys = 0
            local commitError = nil
            local commitMode = "none"

            if targetPhoto and hasAnyEntries(commitSettings) then
                for _ in pairs(commitSettings) do
                    committedKeys = committedKeys + 1
                end

                if developPreview.isDevelopModuleActive() then
                    local okPreview, errPreview = developPreview.applySettings(commitSettings, { logFailures = true })
                    if okPreview then
                        committedToPhoto = true
                        commitMode = "develop_controller"
                    else
                        commitError = tostring(errPreview or "develop_preview_failed")
                    end
                end

                if not committedToPhoto then
                    local okDirect, errDirect = pcall(function()
                        targetPhoto:applyDevelopSettings(commitSettings)
                    end)
                    if okDirect then
                        committedToPhoto = true
                        commitMode = "photo_apply"
                    else
                        local directErr = tostring(errDirect or "photo_apply_failed")
                        if catalog then
                            local okWrite, writeErr = catalogWrite.run(
                                catalog,
                                "MindfulLens Apply Panel II",
                                function()
                                    targetPhoto:applyDevelopSettings(commitSettings)
                                end,
                                { attempts = 20, sleep = 0.10, sleepMax = 0.50 }
                            )
                            if okWrite then
                                committedToPhoto = true
                                commitMode = "catalog_write"
                            else
                                commitError = tostring(writeErr or directErr)
                            end
                        else
                            commitError = directErr
                        end
                    end
                end

                if committedToPhoto then
                    baselineDevelopSettings = baselineDevelopSettings or {}
                    for key, value in pairs(commitSettings) do
                        baselineDevelopSettings[key] = value
                    end
                    logger.info("Panel II settings committed to photo", {
                        keys = tostring(committedKeys),
                        mode = commitMode,
                        color_process = tostring(savedState.colorProcess or ""),
                        lab_glow = tostring(savedState.labGlow or ""),
                        lab_fade = tostring(savedState.labFade or ""),
                    })
                else
                    logger.error("Panel II commit to photo failed", {
                        error = tostring(commitError or "unknown"),
                        keys = tostring(committedKeys),
                    })
                end
            else
                logger.info("Panel II commit skipped", {
                    reason = targetPhoto and "neutral_or_no_keys" or "no_target_photo",
                })
            end

            if committedToPhoto then
                LrDialogs.showBezel("MindfulLens: Panel II zapisany i zastosowany na zdjeciu", 1.6)
                LrDialogs.message(PANEL_TITLE, savedSummary .. "\n\nZastosowano na aktywnym zdjeciu.", "info")
            else
                LrDialogs.showBezel("MindfulLens: ustawienia Panelu II zapisane", 1.4)
                local fallbackMessage = savedSummary .. "\n\nZapisano globalnie."
                if commitError then
                    fallbackMessage = fallbackMessage .. "\nNie udalo sie zastosowac na zdjeciu: " .. commitError
                else
                    fallbackMessage = fallbackMessage .. "\nBrak zmian do zastosowania (wartosci neutralne)."
                end
                LrDialogs.message(PANEL_TITLE, fallbackMessage, "warning")
            end
        end)
    end)
end

showDialog()
