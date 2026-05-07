local LrApplication = import "LrApplication"
local LrExportSession = import "LrExportSession"
local LrFileUtils = import "LrFileUtils"
local LrPathUtils = import "LrPathUtils"
local LrTasks = import "LrTasks"

local function pluginLoad(relativePath)
    return dofile(LrPathUtils.child(_PLUGIN.path, relativePath))
end

local logger = pluginLoad("lib/Logger.lua")
local jsonLite = pluginLoad("lib/JsonLite.lua")
local catalogWrite = pluginLoad("lib/CatalogWrite.lua")

local M = {}

local function detectWindows()
    local pluginPath = (_PLUGIN and _PLUGIN.path) or ""
    if string.find(pluginPath, "\\", 1, true) then
        return true
    end
    local tempPath = LrPathUtils.getStandardFilePath("temp") or ""
    return string.find(tempPath, "\\", 1, true) ~= nil
end

local isWindows = detectWindows()

local function escapeShell(path)
    return '"' .. string.gsub(tostring(path or ""), '"', '\\"') .. '"'
end

local function clamp(v, lo, hi)
    if v < lo then return lo end
    if v > hi then return hi end
    return v
end

local function buildRunTempDir()
    local tempRoot = LrPathUtils.child(LrPathUtils.getStandardFilePath("temp"), "mindfullens_analog_external")
    local stamp = os.date("%Y%m%d_%H%M%S")
    local micros = tostring(math.floor((os.clock() % 1) * 1000000))
    local runDir = LrPathUtils.child(tempRoot, stamp .. "_" .. micros)
    LrFileUtils.createAllDirectories(runDir)
    return runDir
end

local function exportLinearTiff(photo, outDir)
    local sourceFileName = photo:getFormattedMetadata("fileName") or "photo"
    local sourceBaseName = sourceFileName:gsub("%.[^%.]+$", "")
    local stem = sourceBaseName .. "_analog_external_input"
    local expected = LrPathUtils.child(outDir, stem .. ".tif")

    local exportSession = LrExportSession({
        photosToExport = { photo },
        exportSettings = {
            LR_export_destinationType = "specificFolder",
            LR_export_destinationPathPrefix = outDir,
            LR_export_useSubfolder = false,
            LR_collisionHandling = "overwrite",
            LR_renamingTokensOn = true,
            LR_tokens = "{{image_originalName}}_analog_external_input",
            LR_format = "TIFF",
            LR_tiff_bitDepth = 16,
            LR_colorSpace = "ProPhotoRGB",
        },
    })

    local renderedPath = nil
    for _, rendition in exportSession:renditions({ stopIfCanceled = true }) do
        local success, pathOrMessage = rendition:waitForRender()
        if success and pathOrMessage and pathOrMessage ~= "" then
            renderedPath = pathOrMessage
            break
        end
        logger.error("Analog external input export rendition failed", {
            message = tostring(pathOrMessage or ""),
        })
    end

    if renderedPath and LrFileUtils.exists(renderedPath) then
        return renderedPath
    end
    if LrFileUtils.exists(expected) then
        return expected
    end
    error("Analog external input export failed")
end

local function jsonEscape(str)
    local s = tostring(str or "")
    s = s:gsub("\\", "\\\\")
    s = s:gsub('"', '\\"')
    s = s:gsub("\n", "\\n")
    s = s:gsub("\r", "\\r")
    s = s:gsub("\t", "\\t")
    return s
end

local function encodeJsonValue(v)
    local tv = type(v)
    if tv == "number" then
        return tostring(v)
    end
    if tv == "boolean" then
        return v and "true" or "false"
    end
    if tv == "table" then
        local out = {}
        local keys = {}
        for k in pairs(v) do
            keys[#keys + 1] = tostring(k)
        end
        table.sort(keys)
        for _, key in ipairs(keys) do
            out[#out + 1] = '"' .. jsonEscape(key) .. '":' .. encodeJsonValue(v[key])
        end
        return "{" .. table.concat(out, ",") .. "}"
    end
    return '"' .. jsonEscape(v) .. '"'
end

local function writeTextFile(path, text)
    local f = assert(io.open(path, "w"))
    f:write(text or "")
    f:close()
end

local function readTextFile(path)
    local f = io.open(path, "r")
    if not f then return nil end
    local text = f:read("*a")
    f:close()
    return text
end

local function buildRequestPayload(inputPath, outputPath, settings)
    local s = settings or {}
    -- spectralSeparation = Optyczna Dyspersja i Asymetryczna Aberracja.
    -- Backward-compat: jeśli brak, użyj starszego chromAbShift, potem chromAb.
    local pixelShift = clamp(
        tonumber(s.spectralSeparation) or tonumber(s.chromAbShift) or tonumber(s.chromAb) or 0,
        0, 100
    )
    return {
        contract = "mindfullens.analog.external.v1",
        input_path = inputPath,
        output_path = outputPath,
        effects = {
            chromAb   = pixelShift,
            bloom     = clamp(tonumber(s.bloom)     or 0,   0,   100),
            halation  = clamp(tonumber(s.halation)  or 0,   0,   100),
            halRadius = clamp(tonumber(s.halRadius) or 5,   5,   80),
            halThresh = clamp(tonumber(s.halThresh) or 120, 120, 250),
            halHue    = clamp(tonumber(s.halHue)    or 0,   -100, 100),
            anamorph  = clamp(tonumber(s.anamorph)  or 0,   0,   100),
            streakLen = clamp(tonumber(s.streakLen) or 10,  10,  100),
        },
    }
end

local function importRenderedOutput(outputPath)
    local catalog = LrApplication.activeCatalog()
    local importedPhoto = nil
    local okWrite, errWrite = catalogWrite.run(
        catalog,
        "MindfulLens Analog External Import",
        function()
            importedPhoto = catalog:addPhoto(outputPath)
        end,
        { attempts = 20, sleep = 0.10, sleepMax = 0.50 }
    )
    if not okWrite then
        error("Import rendered output failed: " .. tostring(errWrite or ""))
    end
    if importedPhoto == nil then
        error("Import rendered output returned nil photo for path: " .. tostring(outputPath))
    end
    return importedPhoto
end

local function focusImportedPhoto(importedPhoto)
    if not importedPhoto then
        return false
    end
    local catalog = LrApplication.activeCatalog()
    if not catalog then
        return false
    end
    local ok = pcall(function()
        -- Make the imported result immediately visible in Filmstrip.
        catalog:setSelectedPhotos(importedPhoto, { importedPhoto })
    end)
    return ok
end

local function buildVisibleOutputPath(photo, fallbackPath)
    local sourcePath = nil
    local okPath, rawPath = pcall(function()
        return photo and photo:getRawMetadata("path")
    end)
    if okPath and rawPath and rawPath ~= "" then
        sourcePath = rawPath
    end
    if not sourcePath then
        return fallbackPath
    end

    local srcDir = LrPathUtils.parent(sourcePath)
    local srcName = LrPathUtils.leafName(sourcePath) or "photo"
    local stem = tostring(srcName):gsub("%.[^%.]+$", "")
    local candidate = LrPathUtils.child(srcDir, stem .. "_mindfullens_dyspersja.tif")
    if not LrFileUtils.exists(candidate) then
        return candidate
    end

    for i = 2, 99 do
        local alt = LrPathUtils.child(srcDir, stem .. "_mindfullens_dyspersja_" .. tostring(i) .. ".tif")
        if not LrFileUtils.exists(alt) then
            return alt
        end
    end
    return fallbackPath
end

function M.run(params)
    local photo = params and params.photo
    if not photo then
        error("AnalogExternalBridge.run: missing photo")
    end

    local runDir = buildRunTempDir()
    local inputPath = exportLinearTiff(photo, runDir)
    local outputPath = LrPathUtils.child(runDir, "analog_external_output.tif")
    local requestPath = LrPathUtils.child(runDir, "analog_external_request.json")
    local responsePath = LrPathUtils.child(runDir, "analog_external_response.json")
    local scriptPath = LrPathUtils.child(_PLUGIN.path, "bin/run_analog_external.py")
    local payload = buildRequestPayload(inputPath, outputPath, params and params.settings or {})

    writeTextFile(requestPath, encodeJsonValue(payload))

    local usedMode = "stub_copy"
    if LrFileUtils.exists(scriptPath) then
        local pythonCmd = isWindows and "python" or "python3"
        local command = pythonCmd
            .. " " .. escapeShell(scriptPath)
            .. " --request " .. escapeShell(requestPath)
            .. " --response " .. escapeShell(responsePath)
        logger.info("Running analog external renderer", {
            command = command,
            input = tostring(inputPath),
            output = tostring(outputPath),
        })
        local status = LrTasks.execute(command)
        if status ~= 0 then
            error("Analog external renderer failed with status " .. tostring(status))
        end
        usedMode = "external_runner"
    else
        LrFileUtils.copy(inputPath, outputPath)
        writeTextFile(responsePath, encodeJsonValue({
            status = "ok",
            mode = usedMode,
            output_path = outputPath,
            note = "run_analog_external.py not found; used copy fallback",
        }))
    end

    if not LrFileUtils.exists(outputPath) then
        local responseRaw = readTextFile(responsePath)
        if responseRaw then
            local okDecode, decoded = pcall(function()
                return jsonLite.decode(responseRaw)
            end)
            if okDecode and decoded and decoded.output_path and LrFileUtils.exists(decoded.output_path) then
                outputPath = decoded.output_path
            end
        end
    end

    if not LrFileUtils.exists(outputPath) then
        error("Analog external output missing")
    end

    local visibleOutputPath = buildVisibleOutputPath(photo, outputPath)
    if visibleOutputPath ~= outputPath then
        local copied = LrFileUtils.copy(outputPath, visibleOutputPath)
        if copied ~= true then
            error("Copy rendered output to visible path failed: " .. tostring(visibleOutputPath))
        end
        outputPath = visibleOutputPath
    end

    local importedPhoto = importRenderedOutput(outputPath)
    local focused = focusImportedPhoto(importedPhoto)
    logger.info("Analog external output imported", {
        output = tostring(outputPath),
        mode = tostring(usedMode),
        focused = tostring(focused),
    })
    return {
        status = "ok",
        mode = usedMode,
        inputPath = inputPath,
        outputPath = outputPath,
        responsePath = responsePath,
        runDir = runDir,
        imported = (importedPhoto ~= nil),
        focused = (focused == true),
    }
end

return M
