local LrApplication = import "LrApplication"
local LrDialogs = import "LrDialogs"
local LrExportSession = import "LrExportSession"
local LrFileUtils = import "LrFileUtils"
local LrPathUtils = import "LrPathUtils"
local LrPrefs = import "LrPrefs"
local LrTasks = import "LrTasks"

local function pluginLoad(relativePath)
    return dofile(LrPathUtils.child(_PLUGIN.path, relativePath))
end

local config = pluginLoad("lib/FilmEngineConfig.lua")
local jsonMini = pluginLoad("lib/JsonMini.lua")
local logger = pluginLoad("lib/Logger.lua")
local emulsionProfile = pluginLoad("lib/EmulsionProfile.lua")
local profileInstaller = pluginLoad("lib/ProfileInstaller.lua")
local xmpLoader = pluginLoad("lib/XmpPresetLoader.lua")
local developSettingsScale = pluginLoad("lib/DevelopSettingsScale.lua")
local colorSystemResolver = pluginLoad("lib/ColorSystemResolver.lua")
local catalogWrite = pluginLoad("lib/CatalogWrite.lua")
local panelRuntime = pluginLoad("lib/PanelsRuntime.lua")
local photoScopedPrefs = pluginLoad("lib/PhotoScopedPrefs.lua")
local publicCatalog = pluginLoad("lib/PublicCatalog.lua")

local M = {}

local function deepCopyValue(value, seen)
    local valueType = type(value)
    if valueType ~= "table" then
        return value
    end

    seen = seen or {}
    if seen[value] then
        return seen[value]
    end

    local copied = {}
    seen[value] = copied
    for key, child in pairs(value) do
        copied[deepCopyValue(key, seen)] = deepCopyValue(child, seen)
    end
    return copied
end

local function clampNumber(value, minValue, maxValue)
    if value < minValue then
        return minValue
    end
    if value > maxValue then
        return maxValue
    end
    return value
end

local function normalizeColorProcess(value)
    local normalized = string.lower(tostring(value or "refined"))
    if normalized == "classic" then
        return "classic"
    end
    if normalized == "neutral_soft" then
        return "neutral_soft"
    end
    if normalized == "portrait_gentle" then
        return "portrait_gentle"
    end
    if normalized == "cinema_grade" then
        return "cinema_grade"
    end
    return "refined"
end

local function detectWindows()
    local pluginPath = (_PLUGIN and _PLUGIN.path) or ""
    if string.find(pluginPath, "\\", 1, true) then
        return true
    end

    local tempPath = LrPathUtils.getStandardFilePath("temp") or ""
    if string.find(tempPath, "\\", 1, true) then
        return true
    end

    return false
end

local isWindows = detectWindows()

local function escapeShell(path)
    return '"' .. string.gsub(path, '"', '\\"') .. '"'
end

local function resolvePluginPath(relativePath)
    if not relativePath then
        return nil
    end
    if string.sub(relativePath, 1, 1) == "/" then
        return relativePath
    end
    local sep = isWindows and "\\" or "/"
    local clean = string.gsub(relativePath, "[/\\]", sep)
    return _PLUGIN.path .. sep .. clean
end

local function buildRunTempDir()
    local tempRoot = LrPathUtils.child(LrPathUtils.getStandardFilePath("temp"), "mindfullens_film_engine")
    local stamp = os.date("%Y%m%d_%H%M%S")
    local micros = tostring(math.floor((os.clock() % 1) * 1000000))
    local runDir = LrPathUtils.child(tempRoot, stamp .. "_" .. micros)
    LrFileUtils.createAllDirectories(runDir)
    return runDir
end

local function normalizeEntryPath(rootDir, entry)
    if not entry or entry == "" then
        return nil
    end
    if string.sub(entry, 1, 1) == "/" then
        return entry
    end
    if string.find(entry, ":\\", 1, true) then
        return entry
    end
    return LrPathUtils.child(rootDir, entry)
end

local function collectDirectoryLeafNames(dirPath)
    local names = {}
    if LrFileUtils.exists(dirPath) ~= "directory" then
        return names
    end
    local iter = LrFileUtils.directoryEntries(dirPath)
    if not iter then
        return names
    end
    for entry in iter do
        local leaf = LrPathUtils.leafName(entry) or tostring(entry)
        names[#names + 1] = leaf
    end
    table.sort(names)
    return names
end

local function loadPanelsIIVControls()
    local prefs = LrPrefs.prefsForPlugin()
    -- Panel I should stay deterministic by default.
    -- Panels II-IV are committed in their own dialogs and are only replayed here
    -- when explicitly forced for debugging or controlled experiments.
    if prefs.panel_iiv_apply_on_panel1_force ~= true then
        return nil
    end
    local controls = panelRuntime.controlsFromPrefs(prefs, "panel_iiv_")

    if not controls.anyActive then
        return nil
    end

    return controls
end

local PRINT_FIELD_ORDER = {
    "halation",
    "bloom",
    "grain",
}

local PRINT_FIELD_MULTIPLIER = {
    halation = 0.55,
    bloom = 0.25,
}

local PRINT_DELTA_BLEND_FIELDS = {
    halation = true,
    bloom = true,
}

local PRINT_ALLOWED_KEYS = {
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
    grain = {
        GrainAmount = true,
        GrainSize = true,
        GrainFrequency = true,
        Texture = true,
    },
}

local PRINT_READBACK_ALIASES = {
    Contrast2012 = { "Contrast2012", "Contrast" },
    Highlights2012 = { "Highlights2012", "Highlights" },
    Shadows2012 = { "Shadows2012", "Shadows" },
    Whites2012 = { "Whites2012", "Whites" },
    Blacks2012 = { "Blacks2012", "Blacks" },
    Clarity2012 = { "Clarity2012", "Clarity" },
}

local function printCandidateKeys(key)
    local mapped = PRINT_READBACK_ALIASES[tostring(key)]
    if mapped then
        return mapped
    end
    return { tostring(key) }
end

local function printGetNumeric(settings, key)
    if type(settings) ~= "table" then
        return nil
    end
    for _, readKey in ipairs(printCandidateKeys(key)) do
        local numeric = tonumber(settings[readKey])
        if numeric ~= nil then
            return numeric
        end
    end
    return nil
end

local function filterPrintSettings(settings, field)
    local allow = PRINT_ALLOWED_KEYS[tostring(field)]
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

local function loadPhotoPrintControls(photo)
    local prefs = LrPrefs.prefsForPlugin()
    local stored = photoScopedPrefs.loadPrintSelections(prefs, photo)
    if not stored.anyActive then
        return nil
    end
    return stored
end

local function applyPrintSelectionsToSettings(settings, photo)
    local controls = loadPhotoPrintControls(photo)
    if not controls then
        return false, 0, settings
    end

    local updated = settings
    local touched = 0

    local function baselineValue(key)
        local existing = printGetNumeric(updated, key)
        if existing ~= nil then
            return existing
        end
        return 0
    end

    for _, field in ipairs(PRINT_FIELD_ORDER) do
        local relPath = tostring(controls[field] or "off")
        if relPath ~= "off" then
            local absPath = resolvePluginPath(relPath)
            local loaded = xmpLoader.loadDevelopSettings(absPath)
            if loaded then
                local filtered = filterPrintSettings(loaded, field)
                local fieldMultiplier = tonumber(PRINT_FIELD_MULTIPLIER[field]) or 1.0
                local scaled = developSettingsScale.scale(filtered, developSettingsScale.DEFAULT_MULTIPLIER * fieldMultiplier)
                if PRINT_DELTA_BLEND_FIELDS[field] == true then
                    for key, value in pairs(scaled or {}) do
                        local delta = tonumber(value)
                        if delta ~= nil then
                            updated[key] = baselineValue(key) + delta
                            touched = touched + 1
                        elseif updated[key] == nil then
                            updated[key] = value
                            touched = touched + 1
                        end
                    end
                else
                    for key, value in pairs(scaled or {}) do
                        updated[key] = value
                        touched = touched + 1
                    end
                end
            end
        end
    end

    return touched > 0, touched, updated
end

local function exportFromLightroom(photo, outDir, options)
    options = options or {}
    local sourceFileName = photo:getFormattedMetadata("fileName") or "photo"
    local sourceBaseName = sourceFileName:gsub("%.[^%.]+$", "")
    local tokenSuffix = tostring(options.tokenSuffix or "_mindfullens_scan")
    local format = string.upper(tostring(options.format or "TIFF"))
    local reason = tostring(options.reason or "")
    local timeoutSeconds = tonumber(options.timeoutSeconds) or 45
    local extension = (format == "JPEG") and "jpg" or "tif"
    local expectedStem = sourceBaseName .. tokenSuffix
    local expectedPath = LrPathUtils.child(outDir, expectedStem .. "." .. extension)
    local expectedPathUpper = LrPathUtils.child(outDir, expectedStem .. "." .. string.upper(extension))

    local exportSettings = {
        LR_export_destinationType = "specificFolder",
        LR_export_destinationPathPrefix = outDir,
        LR_export_useSubfolder = false,
        LR_collisionHandling = "overwrite",
        LR_renamingTokensOn = true,
        LR_tokens = "{{image_originalName}}" .. tokenSuffix,
    }
    if format == "JPEG" then
        exportSettings.LR_format = "JPEG"
        exportSettings.LR_jpeg_quality = 1
        exportSettings.LR_size_doConstrain = false
    else
        exportSettings.LR_format = "TIFF"
        exportSettings.LR_tiff_bitDepth = 16
        exportSettings.LR_colorSpace = "ProPhotoRGB"
    end

    logger.info("Preparing Lightroom intermediate export", {
        reason = reason,
        format = format,
        timeout_seconds = tostring(timeoutSeconds),
        destination_type = tostring(exportSettings.LR_export_destinationType),
        destination = tostring(exportSettings.LR_export_destinationPathPrefix),
        use_subfolder = tostring(exportSettings.LR_export_useSubfolder),
        token_suffix = tokenSuffix,
    })

    local exportSession = LrExportSession({
        photosToExport = { photo },
        exportSettings = exportSettings,
    })

    local renderedPath = nil
    for _, rendition in exportSession:renditions({ stopIfCanceled = true }) do
        local success, pathOrMessage = rendition:waitForRender()
        if success and pathOrMessage and pathOrMessage ~= "" then
            renderedPath = pathOrMessage
            break
        end
        logger.error("Intermediate export rendition failed", {
            reason = reason,
            message = tostring(pathOrMessage or ""),
        })
    end

    local function resolveExportedPath()
        local directCandidates = {
            renderedPath,
            expectedPath,
            expectedPathUpper,
        }
        local loops = math.max(1, math.floor(timeoutSeconds / 0.25))
        for _ = 1, loops do
            for _, candidate in ipairs(directCandidates) do
                if candidate and candidate ~= "" and LrFileUtils.exists(candidate) then
                    return candidate
                end
            end

            local iter = LrFileUtils.directoryEntries(outDir)
            if iter then
                for entry in iter do
                    local fullPath = normalizeEntryPath(outDir, entry)
                    if fullPath and LrFileUtils.exists(fullPath) then
                        local leaf = string.lower(LrPathUtils.leafName(fullPath) or "")
                        if leaf ~= "" and string.find(leaf, string.lower(expectedStem), 1, true) then
                            if string.find(leaf, ".tif", 1, true)
                                or string.find(leaf, ".tiff", 1, true)
                                or string.find(leaf, ".jpg", 1, true)
                                or string.find(leaf, ".jpeg", 1, true)
                            then
                                return fullPath
                            end
                        end
                    end
                end
            end

            LrTasks.sleep(0.25)
        end
        return nil
    end

    local exportedPath = resolveExportedPath()
    if not exportedPath then
        local seenAfter = collectDirectoryLeafNames(outDir)
        logger.error("TIFF export produced no file", {
            out_dir = tostring(outDir),
            reason = reason,
            timeout_seconds = tostring(timeoutSeconds),
            expected = tostring(expectedPath),
            rendered_path = tostring(renderedPath or ""),
            source_file = tostring(sourceFileName),
            matching_after = table.concat(seenAfter, " | "),
        })
        error("TIFF export produced no file")
    end
    return exportedPath
end

local function exportLinearTiff(photo, outDir)
    return exportFromLightroom(photo, outDir, {
        format = "TIFF",
        tokenSuffix = "_mindfullens_scan",
        reason = "analyzer_input",
    })
end

local function getPhotoInputPath(photo)
    local rawPath = photo:getRawMetadata("path")
    if rawPath and rawPath ~= "" then
        if not LrFileUtils.exists(rawPath) then
            logger.info("Photo input path reported by Lightroom does not pass exists(); using metadata path anyway", {
                raw_path = tostring(rawPath),
                file_name = tostring(photo:getFormattedMetadata("fileName") or ""),
            })
        end
        return rawPath
    end
    logger.info("Photo input path unavailable, using TIFF export fallback", {
        raw_path = tostring(rawPath or ""),
        file_name = tostring(photo:getFormattedMetadata("fileName") or ""),
    })
    return nil
end

local function buildAnalyzerCommand(inputPath, outputPath, requestPath, responsePath, params, includeAdvancedArgs)
    includeAdvancedArgs = includeAdvancedArgs ~= false
    local pluginPath = _PLUGIN.path
    local hybridRunner = LrPathUtils.child(pluginPath, "bin/run_hybrid_engine.py")
    local macAnalyzer = LrPathUtils.child(pluginPath, "bin/DminAnalyzer")
    local winAnalyzer = LrPathUtils.child(pluginPath, "bin/DminAnalyzer.exe")
    local stubAnalyzer = LrPathUtils.child(pluginPath, "bin/analyzer_stub.py")
    local nightBoostLevel = params.nightBoostLevel or ((params.nightBoost == true) and "strong" or "off")
    local profileModeArg = includeAdvancedArgs
        and (" --profile-mode " .. escapeShell(params.profileMode or "production"))
        or ""
    local nightBoostLevelArg = includeAdvancedArgs
        and (" --night-boost-level " .. escapeShell(nightBoostLevel))
        or ""
    -- Legacy compatibility flag for older analyzer builds.
    local nightBoostArg = includeAdvancedArgs
        and (" --night-boost " .. escapeShell((nightBoostLevel == "off") and "off" or "on"))
        or ""
    local requestOutputArg = requestPath and (" --request-output " .. escapeShell(requestPath)) or ""
    local responseOutputArg = responsePath and (" --response-output " .. escapeShell(responsePath)) or ""
    local sourceArg = " --source " .. escapeShell("lightroom_plugin")

    if LrFileUtils.exists(hybridRunner) then
        local pythonCmd = isWindows and "python" or "python3"
        return pythonCmd .. " " .. escapeShell(hybridRunner)
            .. " --input " .. escapeShell(inputPath)
            .. " --output " .. escapeShell(outputPath)
            .. " --emulsion " .. escapeShell(params.emulsionId)
            .. " --format " .. escapeShell(params.formatId)
            .. profileModeArg
            .. nightBoostLevelArg
            .. sourceArg
            .. requestOutputArg
            .. responseOutputArg,
            "hybrid_runner"
    end

    if isWindows and LrFileUtils.exists(winAnalyzer) then
        return escapeShell(winAnalyzer)
            .. " --input " .. escapeShell(inputPath)
            .. " --output " .. escapeShell(outputPath)
            .. " --emulsion " .. escapeShell(params.emulsionId)
            .. " --format " .. escapeShell(params.formatId)
            .. profileModeArg
            .. nightBoostLevelArg
            .. nightBoostArg,
            "win_analyzer"
    end

    if LrFileUtils.exists(macAnalyzer) then
        return escapeShell(macAnalyzer)
            .. " --input " .. escapeShell(inputPath)
            .. " --output " .. escapeShell(outputPath)
            .. " --emulsion " .. escapeShell(params.emulsionId)
            .. " --format " .. escapeShell(params.formatId)
            .. profileModeArg
            .. nightBoostLevelArg
            .. nightBoostArg,
            "mac_analyzer"
    end

    if LrFileUtils.exists(stubAnalyzer) then
        local pythonCmd = isWindows and "python" or "python3"
        return pythonCmd .. " " .. escapeShell(stubAnalyzer)
            .. " --input " .. escapeShell(inputPath)
            .. " --output " .. escapeShell(outputPath)
            .. " --emulsion " .. escapeShell(params.emulsionId)
            .. " --format " .. escapeShell(params.formatId)
            .. profileModeArg
            .. nightBoostLevelArg
            .. nightBoostArg,
            "stub_analyzer"
    end

    error("Analyzer binary not found in plugin /bin folder")
end

local function resolveCameraProfile(emulsion, photo, allowGenericFallback)
    if not emulsion then
        return nil, "missing_emulsion"
    end

    local dcpFile = emulsion.dcpFile
    local profileName = emulsion.profile
    if not dcpFile or dcpFile == "" or not profileName or profileName == "" then
        return nil, "missing_config"
    end

    local targetDir = profileInstaller.getCameraProfilesDir()
    local dcpTargetPath = LrPathUtils.child(targetDir, dcpFile)

    -- Always prefer the bundled root DCP in the live pipeline.
    -- Camera metadata probing in this callback can trigger Lightroom
    -- "yielding is not allowed" errors and leave a profile string assigned
    -- without a resolvable Adobe profile behind it. Root DCPs are our stable,
    -- cross-camera fallback until camera-specific routing is moved to a safer path.
    local ok = profileInstaller.installSingleDcp(_PLUGIN.path, dcpFile)
    if ok and LrFileUtils.exists(dcpTargetPath) then
        if allowGenericFallback then
            return profileName, "dcp_forced_root"
        end
        return profileName, "dcp_installed_root"
    end

    return nil, "dcp_missing_root"
end

local function applyDevelopSettings(photo, baseSettings, analyzerData, emulsion, foundationCount, requestedNightBoostLevel, applyFoundation, useAnalyzerWB, useAnalyzerOverrides, allowGenericFallback, applyCameraProfile, profileData, formatId, sourceScaleId, panelControls, lutIntensityPct, saturationTrim, labGlow, labFade, softHighs, softLows, whiteClip, blackClip, colorProcess, preserveExistingWB, pushPullEv)
    analyzerData = analyzerData or {}
    local catalog = LrApplication.activeCatalog()
    local profileName, profileState = resolveCameraProfile(emulsion, photo, allowGenericFallback)

    local appliedNightBoost = analyzerData.night_boost
    local appliedNightBoostLevel = tostring(analyzerData.night_boost_level or requestedNightBoostLevel or ((appliedNightBoost == true) and "strong" or "off"))
    if appliedNightBoost == nil then
        appliedNightBoost = (appliedNightBoostLevel ~= "off")
    end
    local wbApplied = false
    local nightBoostApplied = false
    local profileReadback = nil
    local profileReadbackAfterRetry = nil
    local finalSettingsSnapshot = nil
    local lutIntensityApplied = false
    local saturationTrimApplied = false
    local colorProcessUsed = normalizeColorProcess(colorProcess)
    local colorProcessTouched = 0
    local labToneTouched = 0
    local profileStatus = "skipped"
    if profileName and profileName ~= "" then
        if applyCameraProfile then
            profileStatus = "requested"
        else
            profileStatus = "skipped_best_effort_off"
        end
    end

	    local writeOk, writeErr = catalogWrite.run(
	        catalog,
	        "MindfulLens Apply Film Settings",
	        function()
	        local function isMonochromeEmulsion()
	            if emulsion and emulsion.bw == true then
	                return true
	            end
	            local id = string.lower(tostring(emulsion and emulsion.id or ""))
	            local label = string.lower(tostring(emulsion and emulsion.label or ""))
	            local function hasToken(token)
	                return string.find(id, token, 1, true) or string.find(label, token, 1, true)
	            end
		            return hasToken("bw_")
		                or hasToken("acros")
		                or hasToken("tri-x")
		                or hasToken("trix")
		                or hasToken("t-max")
		                or hasToken("tmax")
		                or hasToken("ilford")
		                or hasToken("hp5")
		                or hasToken("delta")
		                or hasToken("xp2")
		                or hasToken("foma")
		                or hasToken("arista")
		                or hasToken("monochrome")
		                or hasToken("silver")
		                or hasToken("black and white")
		                or hasToken("b&w")
		                or hasToken("kosmo")
		        end

	        local monochromeEmulsion = isMonochromeEmulsion()

	        local function pick(primaryKey, legacyKey, defaultValue)
	            if analyzerData[primaryKey] ~= nil then
	                return analyzerData[primaryKey]
            end
            if legacyKey and analyzerData[legacyKey] ~= nil then
                return analyzerData[legacyKey]
            end
            return defaultValue
        end

        local settings = {}
        for key, value in pairs(baseSettings or {}) do
            settings[key] = value
        end
        settings.ProcessVersion = "15.4"

        local function clamp01to100(value)
            if value == nil then
                return nil
            end
            if value < 0 then
                return 0
            end
            if value > 100 then
                return 100
            end
            return value
        end

        local function applyProfileGrain()
            local grain = (profileData and profileData.emulsion and profileData.emulsion.grain) or {}

            local function clamp(value, minValue, maxValue)
                if value < minValue then
                    return minValue
                end
                if value > maxValue then
                    return maxValue
                end
                return value
            end

            local function detectIso()
                local candidates = {
                    tostring((emulsion and emulsion.label) or ""),
                    tostring((emulsion and emulsion.id) or ""),
                    tostring((profileData and profileData.emulsion and profileData.emulsion.label) or ""),
                    tostring((profileData and profileData.emulsion and profileData.emulsion.id) or ""),
                }
                local best = nil
                for _, text in ipairs(candidates) do
                    for numberText in string.gmatch(text, "%d+") do
                        local iso = tonumber(numberText)
                        if iso and iso >= 25 and iso <= 6400 then
                            best = (best and math.max(best, iso)) or iso
                        end
                    end
                end
                return best
            end

            local function findFormatScale()
                local scaleMap = grain.format_scale
                if type(scaleMap) ~= "table" then
                    return 1.0
                end
                local keys = { formatId }
                if formatId == "mf_120" then
                    keys[#keys + 1] = "120"
                elseif formatId == "lf_4x5" then
                    keys[#keys + 1] = "4x5"
                elseif formatId == "lf_8x10" then
                    keys[#keys + 1] = "8x10"
                end
                for _, key in ipairs(keys) do
                    if key and scaleMap[key] ~= nil then
                        local scale = tonumber(scaleMap[key])
                        if scale then
                            return scale
                        end
                    end
                end
                -- Emulsion JSON often lists 35mm/120/4x5 only; derive sheet scale from 4x5.
                if formatId == "lf_8x10" and scaleMap["4x5"] ~= nil then
                    local base = tonumber(scaleMap["4x5"])
                    if base then
                        return base * 0.8
                    end
                end
                return 1.0
            end

            local function midpoint(minValue, maxValue)
                return (minValue + maxValue) * 0.5
            end

            local function mapProfileValue(value, inMin, inMax, outMin, outMax)
                if value == nil then
                    return midpoint(outMin, outMax)
                end
                if inMax <= inMin then
                    return midpoint(outMin, outMax)
                end
                local clamped = value
                if clamped < inMin then
                    clamped = inMin
                elseif clamped > inMax then
                    clamped = inMax
                end
                local t = (clamped - inMin) / (inMax - inMin)
                return outMin + ((outMax - outMin) * t)
            end

            local function averageSizeUm()
                local sizeUm = grain.size_um
                if type(sizeUm) ~= "table" then
                    return nil
                end
                local first = tonumber(sizeUm[1])
                local second = tonumber(sizeUm[2] or sizeUm[1])
                if first and second then
                    return (first + second) * 0.5
                end
                return first or second
            end

            local function inferSourceScaleId()
                local requested = string.lower(tostring(sourceScaleId or "auto"))
                if requested ~= "" and requested ~= "auto" then
                    return requested, "manual"
                end

                local cameraMake = string.lower(tostring(photo:getFormattedMetadata("cameraMake") or ""))
                local cameraModel = string.lower(tostring(photo:getFormattedMetadata("cameraModel") or ""))
                local haystack = (cameraMake .. " " .. cameraModel):gsub("%s+", " ")

                if haystack == "" or haystack == " " then
                    return "full_frame", "fallback"
                end

                if string.find(haystack, "gfx", 1, true)
                    or string.find(haystack, "hasselblad x", 1, true)
                    or string.find(haystack, "phase one", 1, true)
                    or string.find(haystack, "iq", 1, true)
                    or string.find(haystack, "645", 1, true)
                then
                    return "digital_mf", "auto"
                end

                if string.find(haystack, "olympus", 1, true)
                    or string.find(haystack, "om system", 1, true)
                    or string.find(haystack, "om-d", 1, true)
                    or string.find(haystack, "e-m", 1, true)
                    or string.find(haystack, "e-p", 1, true)
                    or string.find(haystack, "lumix g9", 1, true)
                    or string.find(haystack, "lumix gh", 1, true)
                    or string.find(haystack, "lumix gx", 1, true)
                    or string.find(haystack, "lumix gf", 1, true)
                    or string.find(haystack, "lumix gm", 1, true)
                    or string.find(haystack, "micro four thirds", 1, true)
                then
                    return "micro_four_thirds", "auto"
                end

                if string.find(haystack, "rx100", 1, true)
                    or string.find(haystack, "rx10", 1, true)
                    or string.find(haystack, "powershot", 1, true)
                    or string.find(haystack, "coolpix", 1, true)
                    or string.find(haystack, "dsc-rx", 1, true)
                    or string.find(haystack, "lumix tz", 1, true)
                    or string.find(haystack, "lumix zs", 1, true)
                then
                    return "compact_small", "auto"
                end

                if string.find(haystack, "fujifilm x-", 1, true)
                    or string.find(haystack, " sony a6", 1, true)
                    or string.find(haystack, " sony zv-e10", 1, true)
                    or string.find(haystack, " sony fx30", 1, true)
                    or string.find(haystack, "nex-", 1, true)
                    or string.find(haystack, "canon eos r7", 1, true)
                    or string.find(haystack, "canon eos r10", 1, true)
                    or string.find(haystack, "canon eos r50", 1, true)
                    or string.find(haystack, "canon eos r100", 1, true)
                    or string.find(haystack, "canon eos m", 1, true)
                    or string.find(haystack, "nikon z50", 1, true)
                    or string.find(haystack, "nikon z fc", 1, true)
                    or string.find(haystack, "nikon z30", 1, true)
                    or string.find(haystack, "d500", 1, true)
                    or string.find(haystack, "d7500", 1, true)
                    or string.find(haystack, "d7200", 1, true)
                    or string.find(haystack, "d7100", 1, true)
                    or string.find(haystack, "ricoh gr", 1, true)
                then
                    return "aps_c", "auto"
                end

                return "full_frame", "auto"
            end

            local function blend(currentValue, targetValue, weight)
                local w = tonumber(weight) or 0.5
                return (currentValue * (1.0 - w)) + (targetValue * w)
            end

            local function chooseTargets(iso, emId, emType, isBw)
                local formatScale = findFormatScale()
                local baseRms = tonumber(grain.base_rms)
                local clumping = tonumber(grain.clumping)
                local sizeUm = averageSizeUm()
                local familyId = publicCatalog.getGrainFamily(emId, emType, formatId, isBw)
                local spec = publicCatalog.getGrainSpec(familyId)
                local amountMin, amountMax = spec.amount[1], spec.amount[2]
                local sizeMin, sizeMax = spec.size[1], spec.size[2]
                local roughMin, roughMax = spec.rough[1], spec.rough[2]
                local weight = spec.weight or 0.72

                if formatId == "lf_4x5" and familyId ~= "bw_push" then
                    amountMin = amountMin - 2
                    amountMax = amountMax - 2
                    sizeMin = sizeMin + 2
                    sizeMax = sizeMax + 2
                    roughMin = roughMin - 3
                    roughMax = roughMax - 3
                elseif formatId == "lf_8x10" and familyId ~= "bw_push" then
                    amountMin = amountMin - 3
                    amountMax = amountMax - 3
                    sizeMin = sizeMin + 3
                    sizeMax = sizeMax + 3
                    roughMin = roughMin - 4
                    roughMax = roughMax - 4
                elseif formatId == "mf_120" and familyId == "classic_35" then
                    amountMin = amountMin - 2
                    amountMax = amountMax - 2
                    sizeMin = sizeMin + 2
                    sizeMax = sizeMax + 2
                    roughMin = roughMin - 3
                    roughMax = roughMax - 3
                elseif formatScale <= 0.8 and familyId == "classic_35" then
                    amountMin = amountMin - 1
                    amountMax = amountMax - 1
                    sizeMin = sizeMin + 1
                    sizeMax = sizeMax + 1
                    roughMin = roughMin - 1
                    roughMax = roughMax - 1
                end

                if familyId == "bw_push" and iso and iso >= 1600 then
                    amountMax = amountMax + 4
                    sizeMax = sizeMax + 2
                    roughMax = roughMax + 2
                elseif familyId == "disposable_lofi" then
                    roughMin = math.max(roughMin, 60)
                elseif familyId == "low_iso_smooth" and iso and iso <= 100 then
                    amountMax = amountMax - 2
                    roughMax = roughMax - 2
                end

                local amount = mapProfileValue(baseRms, 0.014, 0.024, amountMin, amountMax)
                local size = mapProfileValue(sizeUm, 6.0, 10.5, sizeMin, sizeMax)
                local rough = mapProfileValue(clumping, 0.18, 0.30, roughMin, roughMax)

                return amount, size, rough, weight, familyId
            end

            local existingAmount = tonumber(settings.GrainAmount)
            local existingSize = tonumber(settings.GrainSize)
            local existingRough = tonumber(settings.GrainFrequency)
            local hasFoundationGrain = existingAmount ~= nil and existingSize ~= nil and existingRough ~= nil

            local iso = detectIso()
            local emType = string.lower(tostring((profileData and profileData.emulsion and profileData.emulsion.type) or ""))
            local emId = string.lower(tostring((emulsion and emulsion.id) or ""))
            local isBw = (emulsion and emulsion.bw == true)
                or string.find(emType, "black", 1, true)
                or string.find(emId, "bw_", 1, true)
            local targetAmount, targetSize, targetRough, targetWeight, grainFamily = chooseTargets(iso, emId, emType, isBw)
            local resolvedSourceScaleId, resolvedSourceScaleMode = inferSourceScaleId()

            local amount = targetAmount
            local size = targetSize
            local rough = targetRough

            if hasFoundationGrain then
                amount = blend(existingAmount, targetAmount, targetWeight)
                size = blend(existingSize, targetSize, targetWeight)
                rough = blend(existingRough, targetRough, targetWeight)
            end

            local formatOffsets = publicCatalog.getFormatOffsets(formatId)
            amount = amount + tonumber(formatOffsets.amount or 0)
            size = size + tonumber(formatOffsets.size or 0)
            rough = rough + tonumber(formatOffsets.rough or 0)

            local sourceScaleOffsets = publicCatalog.getSourceScaleOffsets(resolvedSourceScaleId)
            amount = amount + tonumber(sourceScaleOffsets.amount or 0)
            size = size + tonumber(sourceScaleOffsets.size or 0)
            rough = rough + tonumber(sourceScaleOffsets.rough or 0)

            if (not hasFoundationGrain) and iso then
                if iso >= 1600 then
                    amount = amount + 2
                    size = size + 1
                    rough = rough + 2
                elseif iso >= 800 then
                    amount = amount + 1
                    size = size + 1
                    rough = rough + 1
                elseif iso >= 400 then
                    rough = rough + 1
                end
            end

            if panelControls and (panelControls.panelIIIActive or panelControls.panelIVActive) then
                local grainStyle = tostring(panelControls.grainStyle or "base")
                if grainStyle == "refined" then
                    amount = amount - 5
                    size = size + 3
                    rough = rough - 8
                elseif grainStyle == "raw" then
                    amount = amount + 8
                    size = size + 4
                    rough = rough + 12
                end
            end

            if amount >= 42 then
                size = math.max(size, isBw and 30 or 24)
            end
            if isBw and iso and iso >= 400 then
                rough = math.max(rough, 68)
            elseif amount <= 18 then
                rough = clamp(rough, 40, 58)
            end

            amount = clamp(math.floor(amount + 0.5), 8, 80)
            size = clamp(math.floor(size + 0.5), 10, 60)
            rough = clamp(math.floor(rough + 0.5), 28, 82)

            settings.GrainAmount = amount
            settings.GrainSize = size
            settings.GrainFrequency = rough

            local clarity = tonumber(settings.Clarity2012)
            local clarityCap = 1
            local clarityFloor = -5
            local clarityDefault = -2
            if amount >= 45 then
                clarityCap = isBw and 2 or 0
                clarityFloor = -6
                clarityDefault = -3
            elseif amount <= 18 then
                clarityCap = 2
                clarityFloor = -4
                clarityDefault = -1
            end
            if clarity == nil then
                settings.Clarity2012 = clarityDefault
            elseif clarity > clarityCap then
                settings.Clarity2012 = clarityCap
            elseif clarity < clarityFloor then
                settings.Clarity2012 = clarityFloor
            end

            local texture = tonumber(settings.Texture)
            if texture == nil then
                if amount >= 45 then
                    settings.Texture = -3
                elseif amount >= 28 then
                    settings.Texture = -2
                end
            elseif texture > ((amount >= 45) and 1 or 3) then
                settings.Texture = (amount >= 45) and 1 or 3
            elseif texture < -10 then
                settings.Texture = -10
            end

            local blacks = tonumber(settings.Blacks2012)
            local blackFloor = -18
            if amount >= 45 then
                blackFloor = (isBw and iso and iso >= 1600) and -10 or -12
            elseif amount >= 28 then
                blackFloor = -14
            end
            if blacks ~= nil and blacks < blackFloor then
                settings.Blacks2012 = blackFloor
            end

            logger.info("Applied film-grain baseline", {
                emulsion = tostring((emulsion and emulsion.id) or ""),
                format = tostring(formatId or ""),
                iso = tostring(iso or ""),
                bw = tostring(isBw),
                foundation_grain = tostring(hasFoundationGrain),
                target_amount = tostring(targetAmount),
                target_size = tostring(targetSize),
                target_frequency = tostring(targetRough),
                grain_family = tostring(grainFamily or ""),
                source_scale = tostring(resolvedSourceScaleId or ""),
                source_scale_mode = tostring(resolvedSourceScaleMode or ""),
                grain_amount = tostring(amount),
                grain_size = tostring(size),
                grain_frequency = tostring(rough),
            })
            return true
        end

        local grainApplied = applyProfileGrain()

        local function clampRange(value, minValue, maxValue)
            if value == nil then
                return nil
            end
            if value < minValue then
                return minValue
            end
            if value > maxValue then
                return maxValue
            end
            return value
        end

        local function mapRange(value, inMin, inMax, outMin, outMax)
            if value == nil then
                return nil
            end
            if inMax == inMin then
                return outMin
            end
            local t = (value - inMin) / (inMax - inMin)
            if t < 0 then t = 0 end
            if t > 1 then t = 1 end
            return outMin + (outMax - outMin) * t
        end

        local function safeNum(value, defaultValue)
            local n = tonumber(value)
            if n == nil then
                return defaultValue
            end
            return n
        end

        local function buildToneCurvePoints(toe, gamma, shoulder)
            local toeLift = mapRange(toe, 0.05, 0.20, 0.02, 0.08) or 0.04
            local midShift = mapRange(gamma, 0.45, 0.75, -0.04, 0.06) or 0.0
            local highlightRoll = mapRange(shoulder, 0.80, 0.95, 0.92, 0.98) or 0.96
            local shadowSoft = mapRange(toe, 0.05, 0.20, -0.02, 0.04) or 0.01
            local highSoft = mapRange(shoulder, 0.80, 0.95, 0.02, -0.04) or -0.01

            local points = {
                { 0, 0 },
                { 64, clampRange((0.25 + toeLift + shadowSoft) * 255, 0, 255) },
                { 128, clampRange((0.50 + midShift) * 255, 0, 255) },
                { 192, clampRange((0.75 + highSoft) * 255, 0, 255) },
                { 255, clampRange(highlightRoll * 255, 0, 255) },
            }

            for i = 2, #points do
                if points[i][2] < points[i - 1][2] then
                    points[i][2] = points[i - 1][2]
                end
            end
            return points
        end

        local function applyProfileCurvesAndTone()
            if not profileData or not profileData.emulsion or not profileData.emulsion.sensitometry then
                return false
            end
            local sens = profileData.emulsion.sensitometry
            local hd = sens.hd_curves or {}
            local red = hd.red or {}
            local green = hd.green or {}
            local blue = hd.blue or {}

            local blueToe = safeNum(blue.toe, 0.12)
            local blueGamma = safeNum(blue.gamma, 0.6)
            local blueShoulder = safeNum(blue.shoulder, 0.88)

            local greenToe = safeNum(green.toe, 0.12)
            local greenGamma = safeNum(green.gamma, 0.6)
            local greenShoulder = safeNum(green.shoulder, 0.88)

            local redToe = safeNum(red.toe, 0.12)
            local redGamma = safeNum(red.gamma, 0.6)
            local redShoulder = safeNum(red.shoulder, 0.88)

            local avgGamma = (redGamma + greenGamma + blueGamma) / 3.0
            local avgToe = (redToe + greenToe + blueToe) / 3.0
            local avgShoulder = (redShoulder + greenShoulder + blueShoulder) / 3.0

            if settings.Contrast2012 == nil then
                settings.Contrast2012 = math.floor((mapRange(avgGamma, 0.45, 0.75, -10, 20) or 0) + 0.5)
            end
            if settings.Shadows2012 == nil then
                settings.Shadows2012 = math.floor((mapRange(avgToe, 0.05, 0.20, 5, 30) or 0) + 0.5)
            end
            if settings.Blacks2012 == nil then
                settings.Blacks2012 = math.floor((mapRange(avgToe, 0.05, 0.20, -5, 12) or 0) + 0.5)
            end
            if settings.Highlights2012 == nil then
                settings.Highlights2012 = math.floor((mapRange(avgShoulder, 0.80, 0.95, -10, -35) or 0) + 0.5)
            end
            if settings.Whites2012 == nil then
                settings.Whites2012 = math.floor((mapRange(avgShoulder, 0.80, 0.95, -5, -25) or 0) + 0.5)
            end

            local base = profileData.emulsion.base or {}
            if base.dmin_ref and settings.Blacks2012 ~= nil then
                settings.Blacks2012 = clampRange(settings.Blacks2012 + math.floor((mapRange(base.dmin_ref, 0.15, 0.35, -5, 10) or 0) + 0.5), -100, 100)
            end
            if base.dmax_ref and settings.Whites2012 ~= nil then
                settings.Whites2012 = clampRange(settings.Whites2012 + math.floor((mapRange(base.dmax_ref, 2.0, 2.6, 0, -8) or 0) + 0.5), -100, 100)
            end

            if settings.ToneCurvePV2012 == nil then
                settings.ToneCurvePV2012 = buildToneCurvePoints(avgToe, avgGamma, avgShoulder)
                settings.ToneCurvePV2012Red = buildToneCurvePoints(redToe, redGamma, redShoulder)
                settings.ToneCurvePV2012Green = buildToneCurvePoints(greenToe, greenGamma, greenShoulder)
                settings.ToneCurvePV2012Blue = buildToneCurvePoints(blueToe, blueGamma, blueShoulder)
            end

            local coupling = sens.interlayer_coupling or {}
            local rg = safeNum(coupling.rg, 0)
            local gb = safeNum(coupling.gb, 0)
            local rb = safeNum(coupling.rb, 0)
            if settings.RedHue == nil then
                settings.RedHue = clampRange(math.floor((rg * 200.0 - rb * 100.0) + 0.5), -50, 50)
            end
            if settings.GreenHue == nil then
                settings.GreenHue = clampRange(math.floor((gb * 200.0 - rg * 80.0) + 0.5), -50, 50)
            end
            if settings.BlueHue == nil then
                settings.BlueHue = clampRange(math.floor((rb * 200.0 - gb * 80.0) + 0.5), -50, 50)
            end
            if settings.RedSaturation == nil then
                settings.RedSaturation = clampRange(math.floor((rg * 140.0) + 0.5), -50, 50)
            end
            if settings.GreenSaturation == nil then
                settings.GreenSaturation = clampRange(math.floor((gb * 140.0) + 0.5), -50, 50)
            end
            if settings.BlueSaturation == nil then
                settings.BlueSaturation = clampRange(math.floor((rb * 140.0) + 0.5), -50, 50)
            end

            local spectral = profileData.emulsion.spectral or {}
            if spectral.a_lambda_ref and spectral.a_lambda_ref ~= "" then
                local emType = tostring(profileData.emulsion.type or "")
                if settings.Vibrance == nil then
                    if emType == "color_positive" then
                        settings.Vibrance = 12
                    elseif emType == "color_negative" then
                        settings.Vibrance = 8
                    else
                        settings.Vibrance = 0
                    end
                end
                if settings.Saturation == nil then
                    if emType == "color_positive" then
                        settings.Saturation = 8
                    elseif emType == "color_negative" then
                        settings.Saturation = 4
                    else
                        settings.Saturation = 0
                    end
                end
            end

            return true
        end

        local curveApplied = applyProfileCurvesAndTone()

        if useAnalyzerWB then
            settings.Temperature = pick("Temperature", "temperature", settings.Temperature or 5200)
            settings.Tint = pick("Tint", "tint", settings.Tint or 0)
            settings.Exposure = pick("Exposure", "exposure", settings.Exposure or 0)
            settings.WhiteBalance = "Custom"
            wbApplied = true
        else
            if preserveExistingWB ~= true then
                settings.Temperature = settings.Temperature or 5200
                settings.Tint = settings.Tint or 0
                settings.Exposure = settings.Exposure or 0
            end
        end
        if applyCameraProfile and profileName and profileName ~= "" then
            settings.CameraProfile = profileName
        end
	        if monochromeEmulsion then
	            settings.ConvertToGrayscale = true
	            settings.Saturation = -100
	            settings.Vibrance = -100
	        end

        local nightBoostKeys = {
            "Exposure",
            "Shadows2012",
            "Blacks2012",
            "Whites2012",
            "Contrast2012",
            "Dehaze",
            "Vibrance",
            "Saturation",
            "Temperature",
            "Tint",
        }
	        if appliedNightBoostLevel ~= "off" then
	            for _, key in ipairs(nightBoostKeys) do
	                if analyzerData[key] ~= nil then
	                    if not monochromeEmulsion
	                        or (key ~= "Saturation" and key ~= "Vibrance" and key ~= "Temperature" and key ~= "Tint")
	                    then
	                        settings[key] = analyzerData[key]
	                    end
	                    nightBoostApplied = true
	                end
	            end
        end

	        local analyzerOverrideKeys = {
            "Contrast2012",
            "Highlights2012",
            "Shadows2012",
            "Whites2012",
            "Blacks2012",
            "Vibrance",
            "Saturation",
            "Texture",
            "Clarity2012",
            "Dehaze",
            "HueAdjustmentRed",
            "HueAdjustmentOrange",
            "HueAdjustmentYellow",
            "HueAdjustmentGreen",
            "HueAdjustmentAqua",
            "HueAdjustmentBlue",
            "SaturationAdjustmentRed",
            "SaturationAdjustmentOrange",
            "SaturationAdjustmentYellow",
            "SaturationAdjustmentGreen",
            "SaturationAdjustmentAqua",
            "SaturationAdjustmentBlue",
            "LuminanceAdjustmentRed",
            "LuminanceAdjustmentOrange",
            "LuminanceAdjustmentYellow",
            "LuminanceAdjustmentGreen",
            "LuminanceAdjustmentAqua",
            "LuminanceAdjustmentBlue",
            "RedHue",
            "RedSaturation",
            "GreenHue",
            "GreenSaturation",
            "BlueHue",
            "BlueSaturation",
            "ColorGradeBlending",
            "ColorGradeBalance",
            "ColorGradeShadowsHue",
            "ColorGradeShadowsSat",
            "ColorGradeMidtoneHue",
            "ColorGradeMidtoneSat",
            "ColorGradeHighlightsHue",
	            "ColorGradeHighlightsSat",
	        }
	        local monochromeBlockedKeys = {
	            Temperature = true,
	            Tint = true,
	            Vibrance = true,
	            Saturation = true,
	            HueAdjustmentRed = true,
	            HueAdjustmentOrange = true,
	            HueAdjustmentYellow = true,
	            HueAdjustmentGreen = true,
	            HueAdjustmentAqua = true,
	            HueAdjustmentBlue = true,
	            SaturationAdjustmentRed = true,
	            SaturationAdjustmentOrange = true,
	            SaturationAdjustmentYellow = true,
	            SaturationAdjustmentGreen = true,
	            SaturationAdjustmentAqua = true,
	            SaturationAdjustmentBlue = true,
	            RedHue = true,
	            RedSaturation = true,
	            GreenHue = true,
	            GreenSaturation = true,
	            BlueHue = true,
	            BlueSaturation = true,
	            ColorGradeBalance = true,
	            ColorGradeShadowsHue = true,
	            ColorGradeShadowsSat = true,
	            ColorGradeMidtoneHue = true,
	            ColorGradeMidtoneSat = true,
	            ColorGradeHighlightsHue = true,
	            ColorGradeHighlightsSat = true,
	        }
	        if useAnalyzerOverrides then
	            for _, key in ipairs(analyzerOverrideKeys) do
	                if analyzerData[key] ~= nil then
	                    if not (monochromeEmulsion and monochromeBlockedKeys[key] == true) then
	                        settings[key] = analyzerData[key]
	                    end
	                end
	            end
	        end

        local function roundNearest(value)
            if value >= 0 then
                return math.floor(value + 0.5)
            end
            return math.ceil(value - 0.5)
        end

        local function applyPanelsIIVToSettings()
            if not panelControls or not panelControls.anyActive then
                return false, 0
            end

	            local applied, touched, updatedSettings = panelRuntime.applyToSettings(settings, panelControls, {
	                isGrayscale = monochromeEmulsion or (settings.ConvertToGrayscale == true),
	                formatId = formatId,
	            })
	            settings = updatedSettings or settings
	            return applied, touched
	        end

        local function applyMicroTune()
            local tune = emulsion and emulsion.microTune
            if type(tune) ~= "table" then
                return false, 0
            end

            local count = 0
            for key, deltaRaw in pairs(tune) do
                local delta = tonumber(deltaRaw)
                if delta and delta ~= 0 then
                    local baseValue = tonumber(settings[key]) or 0
                    local merged = clampRange(baseValue + delta, -100, 100)
                    settings[key] = roundNearest(merged)
                    count = count + 1
                end
            end
            return count > 0, count
        end

        local function applyColorProcessStyle()
            if colorProcessUsed == "refined" then
                return false, 0
            end

            local touched = 0
            local function adjust(key, delta, minValue, maxValue)
                local current = tonumber(settings[key]) or 0
                local updated = roundNearest(clampNumber(current + delta, minValue, maxValue))
                if updated ~= current then
                    settings[key] = updated
                    touched = touched + 1
                end
            end

            if colorProcessUsed == "classic" then
                adjust("Contrast2012", 4, -100, 100)
                adjust("Clarity2012", 4, -100, 100)
                adjust("Dehaze", 2, -100, 100)
                adjust("Highlights2012", -4, -100, 100)
                adjust("Shadows2012", 2, -100, 100)
                if not monochromeEmulsion then
                    adjust("Vibrance", 6, -100, 100)
                    adjust("Saturation", 3, -100, 100)
                    if settings.ColorGradeBlending ~= nil then
                        adjust("ColorGradeBlending", 4, 0, 100)
                    end
                end
            elseif colorProcessUsed == "neutral_soft" then
                adjust("Contrast2012", -2, -100, 100)
                adjust("Clarity2012", -2, -100, 100)
                adjust("Dehaze", -1, -100, 100)
                adjust("Highlights2012", -2, -100, 100)
                adjust("Shadows2012", 2, -100, 100)
                if not monochromeEmulsion then
                    adjust("Vibrance", 2, -100, 100)
                end
            elseif colorProcessUsed == "portrait_gentle" then
                -- Soft rolloff: less micro-contrast, gentler highlights, lifted mids for skin after inversion.
                adjust("Contrast2012", -3, -100, 100)
                adjust("Clarity2012", -5, -100, 100)
                adjust("Dehaze", -2, -100, 100)
                adjust("Highlights2012", -4, -100, 100)
                adjust("Shadows2012", 6, -100, 100)
                if not monochromeEmulsion then
                    adjust("Vibrance", 5, -100, 100)
                    adjust("Saturation", 2, -100, 100)
                end
            elseif colorProcessUsed == "cinema_grade" then
                -- Moderate S-curve with highlight headroom; distinct from full “classic” punch.
                adjust("Contrast2012", 3, -100, 100)
                adjust("Clarity2012", 2, -100, 100)
                adjust("Dehaze", 1, -100, 100)
                adjust("Highlights2012", -6, -100, 100)
                adjust("Shadows2012", 4, -100, 100)
                adjust("Blacks2012", -3, -100, 100)
                if not monochromeEmulsion then
                    adjust("Vibrance", 4, -100, 100)
                    adjust("Saturation", 2, -100, 100)
                end
            end
            return touched > 0, touched
        end

        local function applyLabToneControls()
            local glow = clampNumber(tonumber(labGlow) or 0, -30, 30)
            local fade = clampNumber(tonumber(labFade) or 0, -30, 30)
            local wClip = clampNumber(tonumber(whiteClip) or 0, -20, 20)
            local bClip = clampNumber(tonumber(blackClip) or 0, -20, 20)
            local softHighsEnabled = (softHighs == true)
            local softLowsEnabled = (softLows == true)
            local touched = 0

            local function adjust(key, delta, minValue, maxValue)
                local current = tonumber(settings[key]) or 0
                local updated = roundNearest(clampNumber(current + delta, minValue, maxValue))
                if updated ~= current then
                    settings[key] = updated
                    touched = touched + 1
                end
            end

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

            if softHighsEnabled then
                local hiRoll = roundNearest(8 + wClip)
                local hiWhite = roundNearest(5 + (wClip * 0.8))
                adjust("Highlights2012", -hiRoll, -100, 100)
                adjust("Whites2012", -hiWhite, -100, 100)
            end

            if softLowsEnabled then
                local loLift = roundNearest(8 + bClip)
                local loBlack = roundNearest(5 + (bClip * 0.8))
                adjust("Shadows2012", loLift, -100, 100)
                adjust("Blacks2012", loBlack, -100, 100)
            end

            return (glow ~= 0), (fade ~= 0), softHighsEnabled, softLowsEnabled, touched, glow, fade, wClip, bClip
        end

        local function applyLutIntensityAndSaturation()
            local intensity = tonumber(lutIntensityPct) or 100
            intensity = clampNumber(intensity, 0, 200)
            local factor = intensity / 100.0

            local trim = tonumber(saturationTrim) or 0
            trim = clampNumber(trim, -50, 50)

            local function clampForKey(key, value)
                if key == "ColorGradeBlending" then
                    return clampNumber(value, 0, 100)
                end
                return clampNumber(value, -100, 100)
            end

            local intensityKeys = {
                "Vibrance",
                "Saturation",
                "SaturationAdjustmentRed",
                "SaturationAdjustmentOrange",
                "SaturationAdjustmentYellow",
                "SaturationAdjustmentGreen",
                "SaturationAdjustmentAqua",
                "SaturationAdjustmentBlue",
                "LuminanceAdjustmentRed",
                "LuminanceAdjustmentOrange",
                "LuminanceAdjustmentYellow",
                "LuminanceAdjustmentGreen",
                "LuminanceAdjustmentAqua",
                "LuminanceAdjustmentBlue",
                "RedSaturation",
                "GreenSaturation",
                "BlueSaturation",
                "ColorGradeShadowsSat",
                "ColorGradeMidtoneSat",
                "ColorGradeHighlightsSat",
                "ColorGradeShadowsLum",
                "ColorGradeMidtoneLum",
                "ColorGradeHighlightsLum",
                "ColorGradeBlending",
                "ColorGradeBalance",
            }

            local touched = 0
            if factor ~= 1.0 then
                for _, key in ipairs(intensityKeys) do
                    local current = tonumber(settings[key])
                    if current ~= nil then
                        settings[key] = roundNearest(clampForKey(key, current * factor))
                        touched = touched + 1
                    end
                end
            end

            if monochromeEmulsion then
                trim = 0
            end

            if trim ~= 0 then
                local satBase = tonumber(settings.Saturation) or 0
                local vibBase = tonumber(settings.Vibrance) or 0
                settings.Saturation = roundNearest(clampNumber(satBase + trim, -100, 100))
                settings.Vibrance = roundNearest(clampNumber(vibBase + roundNearest(trim * 0.7), -100, 100))
                touched = touched + 2
            end

            return factor ~= 1.0, trim ~= 0, touched, intensity, trim
        end

        local microTuneApplied, microTuneCount = applyMicroTune()
        local colorProcessApplied, colorProcessKeys = applyColorProcessStyle()
        colorProcessTouched = colorProcessKeys or 0
        local panelsApplied, panelsTouched = applyPanelsIIVToSettings()

        -- Grain realism in Panel I now comes from family specs, film format and source scale.
        -- Avoid hard-clamping a single stock, because that breaks the physical relation between amount, size and roughness.

        local printToolsApplied, printToolsTouched, updatedWithPrint = applyPrintSelectionsToSettings(settings, photo)
        settings = updatedWithPrint or settings
        local labGlowApplied, labFadeApplied, softHighsApplied, softLowsApplied, labTouched, labGlowUsed, labFadeUsed, whiteClipUsed, blackClipUsed = applyLabToneControls()
        labToneTouched = labTouched or 0
        local lutTouched = 0
        local lutIntensityUsed = tonumber(lutIntensityPct) or 100
        local saturationTrimUsed = tonumber(saturationTrim) or 0
        lutIntensityApplied, saturationTrimApplied, lutTouched, lutIntensityUsed, saturationTrimUsed = applyLutIntensityAndSaturation()

        if monochromeEmulsion then
            -- Hard-lock monochrome at the very end so no later layer can reintroduce color.
            settings.ConvertToGrayscale = true
            settings.Saturation = -100
            settings.Vibrance = -100
            settings.SaturationAdjustmentRed = 0
            settings.SaturationAdjustmentOrange = 0
            settings.SaturationAdjustmentYellow = 0
            settings.SaturationAdjustmentGreen = 0
            settings.SaturationAdjustmentAqua = 0
            settings.SaturationAdjustmentBlue = 0
            settings.RedSaturation = 0
            settings.GreenSaturation = 0
            settings.BlueSaturation = 0
            settings.ColorGradeShadowsSat = 0
            settings.ColorGradeMidtoneSat = 0
            settings.ColorGradeHighlightsSat = 0
        end

        -- Push/Pull development (Panel I): constant EV offset after full stack. Default 0 = no change.
        do
            local ev = tonumber(pushPullEv) or 0
            if ev > 3 then ev = 3 elseif ev < -3 then ev = -3 end
            if ev ~= 0 then
                local ex2012 = tonumber(settings.Exposure2012)
                local exLeg = tonumber(settings.Exposure)
                local base = ex2012
                if base == nil then base = exLeg end
                base = base or 0
                local out = base + ev
                settings.Exposure2012 = out
                settings.Exposure = out
                logger.info("Push/Pull EV applied", { ev = tostring(ev), exposure_after = tostring(out) })
            end
        end

        finalSettingsSnapshot = deepCopyValue(settings)
        photo:applyDevelopSettings(settings)

        if microTuneApplied then
            logger.info("Micro-tune applied", {
                emulsion = tostring(emulsion and emulsion.id or ""),
                keys = tostring(microTuneCount),
            })
        end
        if panelsApplied then
            logger.info("Panels II-IV applied to render settings", {
                emulsion = tostring(emulsion and emulsion.id or ""),
                keys = tostring(panelsTouched),
            })
        end
        if printToolsApplied then
            logger.info("Panel V print tools replayed in pipeline", {
                emulsion = tostring(emulsion and emulsion.id or ""),
                keys = tostring(printToolsTouched),
                halation = tostring((loadPhotoPrintControls(photo) or {}).halation or ""),
                bloom = tostring((loadPhotoPrintControls(photo) or {}).bloom or ""),
                grain = tostring((loadPhotoPrintControls(photo) or {}).grain or ""),
            })
        end
        if lutIntensityApplied or saturationTrimApplied then
            logger.info("LUT and saturation controls applied", {
                emulsion = tostring(emulsion and emulsion.id or ""),
                lut_intensity_pct = tostring(lutIntensityUsed),
                saturation_trim = tostring(saturationTrimUsed),
                keys = tostring(lutTouched),
            })
        end
        if colorProcessApplied then
            logger.info("Color process style applied", {
                emulsion = tostring(emulsion and emulsion.id or ""),
                color_process = tostring(colorProcessUsed),
                keys = tostring(colorProcessTouched),
            })
        end
        if labTouched > 0 then
            logger.info("Lab tone controls applied", {
                emulsion = tostring(emulsion and emulsion.id or ""),
                lab_glow = tostring(labGlowUsed),
                lab_fade = tostring(labFadeUsed),
                soft_highs = tostring(softHighsApplied),
                soft_lows = tostring(softLowsApplied),
                white_clip = tostring(whiteClipUsed),
                black_clip = tostring(blackClipUsed),
                glow_applied = tostring(labGlowApplied),
                fade_applied = tostring(labFadeApplied),
                keys = tostring(labTouched),
            })
        end
        end,
        { attempts = 20, sleep = 0.10, sleepMax = 0.50 }
    )
    if not writeOk then
        error(tostring(writeErr or "MindfulLens Apply Film Settings failed"))
    end

    if applyCameraProfile and profileName and profileName ~= "" then
        local readOk, readValue = pcall(function()
            local current = photo:getDevelopSettings()
            return current and current.CameraProfile or nil
        end)
        if readOk then
            profileReadback = readValue
        end

        if profileReadback ~= profileName then
            logger.info("Camera profile readback mismatch after apply", {
                requested = tostring(profileName),
                readback = tostring(profileReadback or ""),
                state = tostring(profileState or ""),
            })

            local profileWriteOk, profileWriteErr = catalogWrite.run(
                catalog,
                "MindfulLens Reapply Camera Profile",
                function()
                    photo:applyDevelopSettings({
                        CameraProfile = profileName,
                    })
                end,
                { attempts = 20, sleep = 0.10, sleepMax = 0.50 }
            )
            if not profileWriteOk then
                logger.error("Camera profile reapply failed", {
                    requested = tostring(profileName),
                    error = tostring(profileWriteErr or ""),
                })
            end

            local retryOk, retryValue = pcall(function()
                local current = photo:getDevelopSettings()
                return current and current.CameraProfile or nil
            end)
            if retryOk then
                profileReadbackAfterRetry = retryValue
            end
        else
            profileReadbackAfterRetry = profileReadback
        end

        if profileReadback == profileName or profileReadbackAfterRetry == profileName then
            profileStatus = "applied"
        else
            profileStatus = "rejected"
        end
    end

    local tempInfo = tostring(analyzerData.Temperature or analyzerData.temperature or "?")
    local tintInfo = tostring(analyzerData.Tint or analyzerData.tint or "?")
    local exposureInfo = tostring(analyzerData.Exposure or analyzerData.exposure or "?")
    local shadowsInfo = tostring(analyzerData.Shadows2012 or analyzerData.shadows or "?")
    local blacksInfo = tostring(analyzerData.Blacks2012 or analyzerData.blacks or "?")
    local modeInfo = tostring(analyzerData.mode or "dynamic")
    local guardTier = tostring(analyzerData.scene_guard_tier or "none")
    local nightBaseline = tostring(analyzerData.night_boost_baseline_version or "")
    local nightInfo = string.upper(appliedNightBoostLevel)
    local wbInfo = wbApplied and "WB CUSTOM" or "WB AS SHOT"
    local nightAppliedInfo = nightBoostApplied and "ACTIVE" or "OFF"
    local curveInfo = curveApplied and "H&D CURVE APPLIED" or "H&D CURVE OFF"
    local labInfo = (panelControls and panelControls.anyActive) and "LAB II-IV ON" or "LAB II-IV OFF"
    local panelInfo = ""
    if panelControls and panelControls.anyActive then
        local segments = {}
        if panelControls.panelIIActive then
            segments[#segments + 1] = "P2 " .. tostring(panelControls.integral_masking or "base") .. "/" .. tostring(panelControls.d_min or "base") .. "/" .. tostring(panelControls.d_max or "base") .. "/" .. tostring(panelControls.hd_curve or "base") .. "/" .. tostring(panelControls.mtf_response or "base") .. "/" .. tostring(panelControls.reciprocity_tail or "base")
        end
        if panelControls.panelIIIActive then
            segments[#segments + 1] = "P3 "
                .. tostring(panelControls.grain_rms or "base") .. "/"
                .. tostring(panelControls.grain_clumping or "base") .. "/"
                .. tostring(panelControls.crystal_size or "base") .. "/"
                .. tostring(panelControls.grain_lr_roughness or "base") .. "/"
                .. tostring(panelControls.ssg_grain or "base")
        end
        if panelControls.panelIVActive then
            segments[#segments + 1] = "P4 "
                .. tostring(panelControls.photon_scattering or "base") .. "/"
                .. tostring(panelControls.mackie_lines or "base") .. "/"
                .. tostring(panelControls.surface_roughness or "base") .. "/"
                .. tostring(panelControls.anti_halation_bloom or "base") .. "/"
                .. tostring(panelControls.optical_bloom or "base") .. "/"
                .. tostring(panelControls.film_damage or "base")
        end
        if #segments > 0 then
            panelInfo = " | " .. table.concat(segments, " | ")
        end
    end
    local profileInfo = "PROFILE " .. string.upper(profileStatus)
    local recommendation = ""
    local displayLabel = tostring((emulsion and emulsion.clientFacingLabel) or (emulsion and emulsion.legacyLabel) or (emulsion and emulsion.publicLabel) or (emulsion and emulsion.label) or "")
    if appliedNightBoostLevel == "off" and (guardTier == "lowlight" or guardTier == "dim") then
        recommendation = " | Tip: NightBoost SOFT"
    end
    local foundationInfo = (applyFoundation == false) and "OFF" or ("ON (" .. tostring(foundationCount or 0) .. ")")
    local grainInfo = (profileData and profileData.emulsion and profileData.emulsion.grain) and "GRAIN" or ""
    LrDialogs.showBezel(
        "Film matrix: " .. displayLabel
            .. " | T " .. tempInfo
            .. " | Tint " .. tintInfo
            .. " | E " .. exposureInfo
            .. " | Sh " .. shadowsInfo
            .. " | Bl " .. blacksInfo
            .. " | " .. modeInfo
            .. " | Develop " .. foundationInfo
            .. " | Guard " .. guardTier
            .. " | " .. wbInfo
            .. " | NightBoost " .. nightInfo .. " " .. nightAppliedInfo
            .. " | " .. curveInfo
            .. " | " .. labInfo
            .. panelInfo
            .. " | " .. profileInfo
            .. ((grainInfo ~= "") and (" | " .. grainInfo) or "")
            .. ((nightBaseline ~= "") and (" " .. nightBaseline) or "")
            .. recommendation
            .. " | Profile " .. tostring(profileName or "none"),
        2.2
    )
    logger.info("Develop settings applied", {
        emulsion = emulsion.id,
        temperature = tostring(analyzerData.Temperature or analyzerData.temperature),
        tint = tostring(analyzerData.Tint or analyzerData.tint),
        exposure = tostring(analyzerData.Exposure or analyzerData.exposure),
        profile = tostring(emulsion.profile or ""),
        lut = tostring(analyzerData.lut_path or ""),
        mode = tostring(analyzerData.mode or ""),
        foundation_keys = tostring(foundationCount or 0),
        camera_profile = profileName,
        camera_profile_state = profileState,
        camera_profile_status = profileStatus,
        scene_guard_tier = tostring(analyzerData.scene_guard_tier or "none"),
        scene_ev100 = tostring(analyzerData.scene_ev100 or ""),
        night_boost = tostring(appliedNightBoost == true),
        night_boost_level = tostring(appliedNightBoostLevel),
        night_boost_applied = tostring(nightBoostApplied),
        camera_profile_readback = tostring(profileReadback or ""),
        camera_profile_readback_after_retry = tostring(profileReadbackAfterRetry or ""),
        wb_mode = wbApplied and "Custom" or "As Shot",
        color_process = tostring(colorProcessUsed),
        color_process_keys = tostring(colorProcessTouched),
        lab_tone_keys = tostring(labToneTouched),
        hd_curve_applied = tostring(curveApplied),
        micro_tune_active = tostring(emulsion and emulsion.microTune ~= nil),
        panel_iiv_active = tostring(panelControls and panelControls.anyActive or false),
        panel_integral_masking = tostring(panelControls and panelControls.integral_masking or ""),
        panel_d_min = tostring(panelControls and panelControls.d_min or ""),
        panel_d_max = tostring(panelControls and panelControls.d_max or ""),
        panel_hd_curve = tostring(panelControls and panelControls.hd_curve or ""),
        panel_mtf_response = tostring(panelControls and panelControls.mtf_response or ""),
        panel_reciprocity_tail = tostring(panelControls and panelControls.reciprocity_tail or ""),
        panel_ssg_grain = tostring(panelControls and panelControls.ssg_grain or ""),
        panel_photon_scattering = tostring(panelControls and panelControls.photon_scattering or ""),
        panel_mackie_lines = tostring(panelControls and panelControls.mackie_lines or ""),
        panel_grain_rms = tostring(panelControls and panelControls.grain_rms or ""),
        panel_grain_clumping = tostring(panelControls and panelControls.grain_clumping or ""),
        panel_crystal_size = tostring(panelControls and panelControls.crystal_size or ""),
        panel_grain_lr_roughness = tostring(panelControls and panelControls.grain_lr_roughness or ""),
        panel_surface_roughness = tostring(panelControls and panelControls.surface_roughness or ""),
        panel_anti_halation_bloom = tostring(panelControls and panelControls.anti_halation_bloom or ""),
        panel_optical_bloom = tostring(panelControls and panelControls.optical_bloom or ""),
        panel_film_damage = tostring(panelControls and panelControls.film_damage or ""),
        profile_skipped = tostring(profileName == nil or profileName == ""),
        bw_forced = tostring(emulsion and emulsion.bw == true),
        engine_source = tostring(analyzerData.engine_source or ""),
        engine_contract_version = tostring(analyzerData.engine_contract_version or ""),
    })

    return {
        cameraProfile = profileName,
        cameraProfileState = profileState,
        cameraProfileStatus = profileStatus,
        cameraProfileReadback = profileReadback,
        cameraProfileReadbackAfterRetry = profileReadbackAfterRetry,
        wbMode = wbApplied and "Custom" or "AsShot",
        nightBoostApplied = nightBoostApplied == true,
        foundationKeys = foundationCount or 0,
        colorProcess = colorProcessUsed,
        labToneKeys = labToneTouched,
        appliedSettings = finalSettingsSnapshot or {},
    }
end

local function hasRenderableExtension(path)
    if not path or path == "" then
        return false
    end
    local ext = string.lower(LrPathUtils.extension(path) or "")
    return ext == "tif" or ext == "tiff" or ext == "jpg" or ext == "jpeg" or ext == "png"
end

local function sanitizeSlug(value, fallback)
    local text = tostring(value or "")
    text = text:gsub("%.[^%.]+$", "")
    text = text:gsub("[^%w%-_]+", "_")
    text = text:gsub("_+", "_")
    text = text:gsub("^_+", "")
    text = text:gsub("_+$", "")
    if text == "" then
        return fallback or "item"
    end
    return text
end

local function resolveBackupRoot()
    local base = LrPathUtils.getStandardFilePath("pictures")
    if not base or base == "" then
        base = LrPathUtils.getStandardFilePath("desktop")
    end
    if not base or base == "" then
        base = LrPathUtils.getStandardFilePath("temp")
    end
    return LrPathUtils.child(base, "MindfulLens_Backup_Renders")
end

local function resolveBackupInputPath(photo, tempDir, analyzerInputPath)
    logger.info("Resolving backup input path", {
        source = tostring(analyzerInputPath or ""),
        source_renderable = tostring(hasRenderableExtension(analyzerInputPath)),
    })

    if analyzerInputPath
        and analyzerInputPath ~= ""
        and hasRenderableExtension(analyzerInputPath)
        and LrFileUtils.exists(analyzerInputPath)
    then
        return analyzerInputPath, nil, "analyzer_input"
    end

    local function tryLightroomIntermediate(format, tokenSuffix, reason, timeoutSeconds)
        local intermediatePath = nil
        local ok, exportErr = LrTasks.pcall(function()
            intermediatePath = exportFromLightroom(photo, tempDir, {
                format = format,
                tokenSuffix = tokenSuffix,
                reason = reason,
                timeoutSeconds = timeoutSeconds,
            })
        end)
        if ok and intermediatePath and intermediatePath ~= "" and LrFileUtils.exists(intermediatePath) then
            logger.info("Backup input prepared through Lightroom intermediate export", {
                input_path = tostring(intermediatePath),
                input_format = tostring(format),
            })
            return intermediatePath, nil
        end

        logger.info("Backup intermediate export failed", {
            source = tostring(analyzerInputPath or ""),
            attempted_format = tostring(format),
            attempted_reason = tostring(reason),
            error = tostring(exportErr or ""),
            temp_dir = tostring(tempDir or ""),
            temp_dir_entries = table.concat(collectDirectoryLeafNames(tempDir), " | "),
        })
        return nil, tostring(exportErr or "")
    end

    local tiffIntermediate = tryLightroomIntermediate(
        "TIFF",
        "_mindfullens_backup_source_tiff",
        "backup_input_tiff",
        60
    )
    if tiffIntermediate then
        return tiffIntermediate, tiffIntermediate, "lightroom_intermediate_tiff"
    end

    local jpegIntermediate = tryLightroomIntermediate(
        "JPEG",
        "_mindfullens_backup_source",
        "backup_input_jpeg",
        45
    )
    if jpegIntermediate then
        return jpegIntermediate, jpegIntermediate, "lightroom_intermediate_jpeg"
    end

    if not isWindows and analyzerInputPath and analyzerInputPath ~= "" then
        local convertedInput = LrPathUtils.child(tempDir, "backup_source.jpg")
        local sipsCommand = "/usr/bin/sips -s format jpeg "
            .. escapeShell(tostring(analyzerInputPath))
            .. " --out "
            .. escapeShell(convertedInput)
        local sipsStatus = LrTasks.execute(sipsCommand)
        if sipsStatus == 0 and LrFileUtils.exists(convertedInput) then
            logger.info("Backup input prepared via sips conversion", {
                source = tostring(analyzerInputPath),
                converted = tostring(convertedInput),
            })
            return convertedInput, convertedInput, "sips_conversion"
        end

        logger.info("Backup sips conversion failed", {
            source = tostring(analyzerInputPath),
            temp_dir = tostring(tempDir or ""),
            temp_dir_entries = table.concat(collectDirectoryLeafNames(tempDir), " | "),
        })
    end

    return nil, nil, "unresolved"
end

local function runExternalBackupRender(photo, emulsionId, tempDir, analyzerInputPath, lutPath, enableBackupRender, profileStatus)
    if enableBackupRender == false then
        return { status = "disabled" }
    end
    if profileStatus ~= "rejected" and profileStatus ~= "skipped_best_effort_off" then
        return { status = "skipped_no_reject" }
    end

    local scriptPath = LrPathUtils.child(_PLUGIN.path, "bin/render_backup_with_lut.py")
    if not LrFileUtils.exists(scriptPath) then
        return { status = "skipped_no_script" }
    end
    if not lutPath or lutPath == "" or not LrFileUtils.exists(lutPath) then
        return { status = "skipped_no_lut" }
    end

    local backupInputPath, exportedForBackup, backupInputSource = resolveBackupInputPath(photo, tempDir, analyzerInputPath)
    if not backupInputPath or backupInputPath == "" then
        logger.info("Backup render skipped, source is not directly renderable", {
            source = tostring(analyzerInputPath or ""),
            input_source = tostring(backupInputSource or ""),
        })
        return { status = "skipped_non_renderable_input" }
    end

    if not hasRenderableExtension(backupInputPath) then
        logger.info("Backup render skipped after input resolution", {
            input = tostring(backupInputPath),
            input_source = tostring(backupInputSource or ""),
        })
        return { status = "skipped_non_renderable_input" }
    end

    if not backupInputPath or backupInputPath == "" or not LrFileUtils.exists(backupInputPath) then
        return { status = "error_missing_input" }
    end

    local runId = sanitizeSlug(LrPathUtils.leafName(tempDir), os.date("%Y%m%d_%H%M%S"))
    local sourceName = sanitizeSlug(photo:getFormattedMetadata("fileName"), "photo")
    local emulsionName = sanitizeSlug(emulsionId, "emulsion")

    local backupRoot = resolveBackupRoot()
    local backupDir = LrPathUtils.child(backupRoot, runId)
    LrFileUtils.createAllDirectories(backupDir)

    local outputTiff = LrPathUtils.child(backupDir, sourceName .. "_" .. emulsionName .. "_backup.tif")
    local outputJpeg = LrPathUtils.child(backupDir, sourceName .. "_" .. emulsionName .. "_backup.jpg")
    local pythonCmd = isWindows and "python" or "python3"
    local command = pythonCmd
        .. " " .. escapeShell(scriptPath)
        .. " --input " .. escapeShell(backupInputPath)
        .. " --lut " .. escapeShell(lutPath)
        .. " --output-tiff " .. escapeShell(outputTiff)
        .. " --output-jpeg " .. escapeShell(outputJpeg)

    logger.info("Executing external backup render", {
        command = command,
        input = tostring(backupInputPath),
        input_source = tostring(backupInputSource or ""),
        lut = tostring(lutPath),
        output_tiff = tostring(outputTiff),
        output_jpeg = tostring(outputJpeg),
    })

    local status = LrTasks.execute(command)
    if status ~= 0 then
        logger.error("External backup render failed", {
            status = tostring(status),
        })
        return {
            status = "error_render_failed",
            processStatus = tostring(status),
            tempInputPath = exportedForBackup,
        }
    end

    local tiffExists = LrFileUtils.exists(outputTiff) and true or false
    local jpegExists = LrFileUtils.exists(outputJpeg) and true or false
    if not tiffExists and not jpegExists then
        return {
            status = "error_missing_output",
            tempInputPath = exportedForBackup,
        }
    end

    return {
        status = "rendered",
        tiffPath = tiffExists and outputTiff or "",
        jpegPath = jpegExists and outputJpeg or "",
        backupDir = backupDir,
        tempInputPath = exportedForBackup,
    }
end

function M.run(params)
    local applyCameraProfile = (params.applyCameraProfile == true)
    local conversionMode = tostring(params.conversionMode or "analyze")
    local colorProcess = normalizeColorProcess(params.colorProcess or config.defaultColorProcess or "refined")
    local editOnlyMode = (conversionMode == "edit_only")
    local requestedNightBoostLevel = editOnlyMode and "off" or (params.nightBoostLevel or ((params.nightBoost == true) and "strong" or "off"))
    logger.info("Pipeline started", {
        emulsion = params.emulsionId,
        format = params.formatId,
        profile_mode = tostring(params.profileMode or "production"),
        conversion_mode = conversionMode,
        color_process = colorProcess,
        edit_only = tostring(editOnlyMode),
        apply_camera_profile = tostring(applyCameraProfile),
        night_boost = tostring(requestedNightBoostLevel ~= "off"),
        night_boost_level = tostring(requestedNightBoostLevel),
        autoDmin = tostring(params.autoDmin),
        push_pull_ev = tostring(tonumber(params.pushPullEv) or 0),
        lut_intensity = tostring(params.lutIntensity or 100),
        saturation_trim = tostring(params.saturationTrim or 0),
        lab_glow = tostring(params.labGlow or 0),
        lab_fade = tostring(params.labFade or 0),
        soft_highs = tostring(params.softHighs == true),
        soft_lows = tostring(params.softLows == true),
        white_clip = tostring(params.whiteClip or 0),
        black_clip = tostring(params.blackClip or 0),
    })

    local emulsion = config.findEmulsion(params.emulsionId)
    if not emulsion then
        error("Unknown emulsion: " .. tostring(params.emulsionId))
    end
    local profileData = nil
    local profileError = nil
    local profilePath = nil
    if emulsion and emulsion.id then
        profilePath = LrPathUtils.child(_PLUGIN.path, "profiles/emulsion_json/" .. emulsion.id .. ".json")
        profileData, profileError = emulsionProfile.loadProfile(profilePath)
        emulsion.profileData = profileData
        emulsion.profileDataPath = profilePath
    end
    logger.info("Emulsion profile JSON", {
        emulsion = tostring(emulsion.id),
        path = tostring(profilePath or ""),
        loaded = tostring(profileData ~= nil),
        error = profileError and tostring(profileError) or "",
    })
    local panelControls = loadPanelsIIVControls()
    logger.info("Loaded Panels II-IV controls", {
        active = tostring(panelControls and panelControls.anyActive or false),
        integral_masking = tostring(panelControls and panelControls.integral_masking or ""),
        d_min = tostring(panelControls and panelControls.d_min or ""),
        d_max = tostring(panelControls and panelControls.d_max or ""),
        hd_curve = tostring(panelControls and panelControls.hd_curve or ""),
        mtf_response = tostring(panelControls and panelControls.mtf_response or ""),
        reciprocity_tail = tostring(panelControls and panelControls.reciprocity_tail or ""),
        ssg_grain = tostring(panelControls and panelControls.ssg_grain or ""),
        photon_scattering = tostring(panelControls and panelControls.photon_scattering or ""),
        mackie_lines = tostring(panelControls and panelControls.mackie_lines or ""),
        grain_rms = tostring(panelControls and panelControls.grain_rms or ""),
        grain_clumping = tostring(panelControls and panelControls.grain_clumping or ""),
        crystal_size = tostring(panelControls and panelControls.crystal_size or ""),
        grain_lr_roughness = tostring(panelControls and panelControls.grain_lr_roughness or ""),
        surface_roughness = tostring(panelControls and panelControls.surface_roughness or ""),
        anti_halation_bloom = tostring(panelControls and panelControls.anti_halation_bloom or ""),
        optical_bloom = tostring(panelControls and panelControls.optical_bloom or ""),
        film_damage = tostring(panelControls and panelControls.film_damage or ""),
    })

    local tempDir = buildRunTempDir()
    local analyzerInputPath = nil
    local exportedTiff = nil
    local resultPath = nil
    local requestPath = nil
    local responsePath = nil
    local data = {}

    if editOnlyMode then
        data.mode = "edit_only"
        data.night_boost = false
        data.night_boost_level = "off"
        data.scene_guard_tier = "none"
        logger.info("Edit Only mode active; analyzer skipped", {
            emulsion = tostring(params.emulsionId or ""),
            format = tostring(params.formatId or ""),
        })
    else
        analyzerInputPath = getPhotoInputPath(params.photo)
        if not analyzerInputPath or not hasRenderableExtension(analyzerInputPath) then
            local okExport, exportResult = LrTasks.pcall(function()
                return exportLinearTiff(params.photo, tempDir)
            end)
            if okExport and exportResult and exportResult ~= "" then
                exportedTiff = exportResult
                analyzerInputPath = exportedTiff
                logger.info("Analyzer input upgraded to Lightroom TIFF export", {
                    source = tostring(getPhotoInputPath(params.photo) or ""),
                    analyzer_input = tostring(analyzerInputPath or ""),
                })
            elseif not analyzerInputPath then
                error("Analyzer input unavailable and TIFF export failed: " .. tostring(exportResult or ""))
            else
                logger.warn("Analyzer TIFF export failed, falling back to original source path", {
                    source = tostring(analyzerInputPath or ""),
                    error = tostring(exportResult or ""),
                })
            end
        end

        resultPath = LrPathUtils.child(tempDir, "analyzer_result.json")
        requestPath = LrPathUtils.child(tempDir, "hybrid_request.json")
        responsePath = LrPathUtils.child(tempDir, "hybrid_response.json")

        local command, engineMode = buildAnalyzerCommand(analyzerInputPath, resultPath, requestPath, responsePath, params, true)
        logger.info("Executing analyzer", {
            command = command,
            engine_mode = tostring(engineMode or ""),
            request_json = tostring(requestPath),
            response_json = tostring(responsePath),
            result_json = tostring(resultPath),
        })

        local status = LrTasks.execute(command)
        if status ~= 0 and (string.find(command, "--profile-mode", 1, true) or string.find(command, "--night-boost", 1, true)) then
            local legacyCommand, legacyMode = buildAnalyzerCommand(analyzerInputPath, resultPath, requestPath, responsePath, params, false)
            logger.info("Analyzer retry (legacy, no advanced args)", {
                command = legacyCommand,
                status = tostring(status),
                engine_mode = tostring(legacyMode or ""),
            })
            status = LrTasks.execute(legacyCommand)
        end
        if status ~= 0 then
            error("Analyzer process failed with status " .. tostring(status))
        end

        if not LrFileUtils.exists(resultPath) then
            error("Analyzer did not produce result JSON")
        end

        local f = io.open(resultPath, "r")
        if not f then
            error("Failed to read analyzer JSON")
        end
        local raw = f:read("*a")
        f:close()

        logger.info("Hybrid engine artifacts", {
            request_exists = tostring(LrFileUtils.exists(requestPath) and true or false),
            response_exists = tostring(LrFileUtils.exists(responsePath) and true or false),
            result_exists = tostring(LrFileUtils.exists(resultPath) and true or false),
        })

        data = jsonMini.decodeFlatObject(raw)
    end
    local foundationSettings = {}
    local foundationCount = 0
    local applyFoundation = (params.applyFoundation ~= false)
    if applyFoundation then
        local foundationPaths = {}
        local _, stage01Path = colorSystemResolver.getStagePath(emulsion.id, emulsion.label, "01")
        local packageDefaults = colorSystemResolver.getDefaultPackage(emulsion.id, emulsion.label)

        if stage01Path then
            foundationPaths[#foundationPaths + 1] = resolvePluginPath(stage01Path)
        elseif emulsion.foundationPreset then
            foundationPaths[#foundationPaths + 1] = resolvePluginPath(emulsion.foundationPreset)
        end

        if packageDefaults and packageDefaults.stage02 and packageDefaults.stage02 ~= "off" then
            foundationPaths[#foundationPaths + 1] = resolvePluginPath(packageDefaults.stage02)
        end
        if packageDefaults and packageDefaults.stage03 and packageDefaults.stage03 ~= "off" then
            foundationPaths[#foundationPaths + 1] = resolvePluginPath(packageDefaults.stage03)
        end
        if packageDefaults and packageDefaults.stage04 and packageDefaults.stage04 ~= "off" then
            foundationPaths[#foundationPaths + 1] = resolvePluginPath(packageDefaults.stage04)
        end

        for _, foundationPath in ipairs(foundationPaths) do
            local loaded, loadErr = xmpLoader.loadDevelopSettings(foundationPath)
            if loaded then
                local scaled = developSettingsScale.scale(loaded, developSettingsScale.DEFAULT_MULTIPLIER)
                for key, value in pairs(scaled) do
                    foundationSettings[key] = value
                end
                logger.info("Loaded film recipe stage", {
                    emulsion = emulsion.id,
                    path = tostring(foundationPath),
                    strength_multiplier = tostring(developSettingsScale.DEFAULT_MULTIPLIER),
                })
            else
                logger.error("Failed to load film recipe stage", {
                    emulsion = emulsion.id,
                    path = tostring(foundationPath),
                    error = tostring(loadErr),
                })
            end
        end

        for _ in pairs(foundationSettings) do
            foundationCount = foundationCount + 1
        end
    end

    local useAnalyzerWB = (not editOnlyMode) and (params.useAnalyzerWB ~= false)
    local useAnalyzerOverrides = (not editOnlyMode) and (params.useAnalyzerOverrides == true)
    local preserveExistingWB = (editOnlyMode == true)

    local applySummary = applyDevelopSettings(
        params.photo,
        foundationSettings,
        data,
        emulsion,
        foundationCount,
        requestedNightBoostLevel,
        applyFoundation,
        useAnalyzerWB,
        useAnalyzerOverrides,
        params.allowGenericFallback,
        applyCameraProfile,
        profileData,
        params.formatId,
        params.sourceScaleId,
        panelControls,
        params.lutIntensity,
        params.saturationTrim,
        params.labGlow,
        params.labFade,
        params.softHighs,
        params.softLows,
        params.whiteClip,
        params.blackClip,
        colorProcess,
        preserveExistingWB,
        tonumber(params.pushPullEv) or 0
    )
    local enableBackupRender = (not editOnlyMode) and (params.enableBackupRender ~= false)
    local backupOnProfileReject = (params.backupOnProfileReject ~= false)
    local backupSummary = runExternalBackupRender(
        params.photo,
        params.emulsionId,
        tempDir,
        analyzerInputPath,
        data.lut_path,
        (enableBackupRender and backupOnProfileReject),
        (applySummary and applySummary.cameraProfileStatus) or "unknown"
    )

    if not params.debugKeepTemp then
        if exportedTiff then
            LrFileUtils.delete(exportedTiff)
        end
        if backupSummary and backupSummary.tempInputPath then
            LrFileUtils.delete(backupSummary.tempInputPath)
        end
        if resultPath then
            LrFileUtils.delete(resultPath)
        end
    end

    logger.info("Pipeline completed", {
        emulsion = params.emulsionId,
        result = "ok",
        conversion_mode = conversionMode,
        color_process = colorProcess,
        camera_profile_status = tostring(applySummary and applySummary.cameraProfileStatus or ""),
        backup_render_status = tostring(backupSummary and backupSummary.status or ""),
    })

    return {
        engineStatus = "ok",
        lightroomApplyStatus = "ok",
        conversionMode = conversionMode,
        colorProcess = colorProcess,
        cameraProfileStatus = (applySummary and applySummary.cameraProfileStatus) or "unknown",
        cameraProfileState = (applySummary and applySummary.cameraProfileState) or "",
        cameraProfileName = (applySummary and applySummary.cameraProfile) or "",
        appliedSettings = (applySummary and applySummary.appliedSettings) or {},
        backupRenderStatus = (backupSummary and backupSummary.status) or "unknown",
        backupRenderTiffPath = (backupSummary and backupSummary.tiffPath) or "",
        backupRenderJpegPath = (backupSummary and backupSummary.jpegPath) or "",
        backupRenderDir = (backupSummary and backupSummary.backupDir) or "",
    }
end

return M
