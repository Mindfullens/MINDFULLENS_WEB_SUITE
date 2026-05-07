local LrExportSession = import "LrExportSession"
local LrFileUtils = import "LrFileUtils"
local LrPathUtils = import "LrPathUtils"
local LrTasks = import "LrTasks"

local function pluginLoad(relativePath)
    return dofile(LrPathUtils.child(_PLUGIN.path, relativePath))
end

local logger = pluginLoad("lib/Logger.lua")

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

local function buildRunTempDir()
    local tempRoot = LrPathUtils.child(LrPathUtils.getStandardFilePath("temp"), "mindfullens_optical_dyspersja_live")
    local stamp = os.date("%Y%m%d_%H%M%S")
    local micros = tostring(math.floor((os.clock() % 1) * 1000000))
    local runDir = LrPathUtils.child(tempRoot, stamp .. "_" .. micros)
    LrFileUtils.createAllDirectories(runDir)
    return runDir
end

local function readSelectedValue(path)
    local f = io.open(path, "r")
    if not f then
        return nil
    end
    local raw = f:read("*a")
    f:close()
    if not raw or raw == "" then
        return nil
    end
    local num = tonumber(string.match(raw, '"value"%s*:%s*(%-?%d+)'))
    if not num then
        return nil
    end
    if num < 0 then num = 0 end
    if num > 100 then num = 100 end
    return math.floor(num + 0.5)
end

local function exportProxyJpeg(photo, outDir)
    local sourceFileName = photo:getFormattedMetadata("fileName") or "photo"
    local sourceBaseName = sourceFileName:gsub("%.[^%.]+$", "")
    local expected = LrPathUtils.child(outDir, sourceBaseName .. "_optical_dyspersja_proxy.jpg")

    local exportSession = LrExportSession({
        photosToExport = { photo },
        exportSettings = {
            LR_export_destinationType = "specificFolder",
            LR_export_destinationPathPrefix = outDir,
            LR_export_useSubfolder = false,
            LR_collisionHandling = "overwrite",
            LR_renamingTokensOn = true,
            LR_tokens = "{{image_originalName}}_optical_dyspersja_proxy",
            LR_format = "JPEG",
            LR_jpeg_quality = 0.85,
            LR_size_doConstrain = true,
            LR_size_maxHeight = 1400,
            LR_size_maxWidth = 2000,
            LR_colorSpace = "sRGB",
            LR_outputSharpeningOn = false,
        },
    })

    local renderedPath = nil
    for _, rendition in exportSession:renditions({ stopIfCanceled = true }) do
        local success, pathOrMessage = rendition:waitForRender()
        if success and pathOrMessage and pathOrMessage ~= "" then
            renderedPath = pathOrMessage
            break
        end
        logger.error("Optical dyspersja live preview proxy export failed", {
            message = tostring(pathOrMessage or ""),
        })
    end

    if renderedPath and LrFileUtils.exists(renderedPath) then
        return renderedPath
    end
    if LrFileUtils.exists(expected) then
        return expected
    end
    error("Optical dyspersja live preview proxy export failed")
end

function M.launch(params)
    local photo = params and params.photo
    if not photo then
        error("OpticalDyspersjaPreview.launch: missing photo")
    end

    local initial = tonumber(params and params.initialStrength or 0) or 0
    if initial < 0 then initial = 0 end
    if initial > 100 then initial = 100 end

    local runDir = buildRunTempDir()
    local proxyPath = exportProxyJpeg(photo, runDir)
    local resultPath = LrPathUtils.child(runDir, "selected_value.json")
    local scriptPath = LrPathUtils.child(_PLUGIN.path, "bin/live_optical_dyspersja_preview.py")
    if not LrFileUtils.exists(scriptPath) then
        error("Missing preview script: " .. tostring(scriptPath))
    end

    local pythonCmd = isWindows and "python" or "python3"
    local command = pythonCmd
        .. " " .. escapeShell(scriptPath)
        .. " --image " .. escapeShell(proxyPath)
        .. " --initial " .. tostring(math.floor(initial + 0.5))
        .. " --result " .. escapeShell(resultPath)

    logger.info("Launching optical dyspersja live preview", {
        command = command,
        proxy = tostring(proxyPath),
    })

    local status = LrTasks.execute(command)
    if status ~= 0 then
        error("Optical dyspersja preview process failed with status " .. tostring(status))
    end

    return {
        status = "ok",
        runDir = runDir,
        proxyPath = proxyPath,
        selectedValue = readSelectedValue(resultPath),
    }
end

return M
