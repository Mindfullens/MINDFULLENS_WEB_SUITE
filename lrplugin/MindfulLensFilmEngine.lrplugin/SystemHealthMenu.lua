local LrDialogs = import "LrDialogs"
local LrFileUtils = import "LrFileUtils"
local LrPathUtils = import "LrPathUtils"

local function pluginLoad(relativePath)
    return dofile(LrPathUtils.child(_PLUGIN.path, relativePath))
end

local config = pluginLoad("lib/FilmEngineConfig.lua")
local colorCatalog = pluginLoad("lib/ColorSystemCatalog.lua")
local logger = pluginLoad("lib/Logger.lua")
local profileInstaller = pluginLoad("lib/ProfileInstaller.lua")
local presetInstaller = pluginLoad("lib/PresetInstaller.lua")

local function stateLabel(ok)
    return ok and "OK" or "MISSING"
end

local function fileExists(relativePath)
    local fullPath = LrPathUtils.child(_PLUGIN.path, relativePath)
    return LrFileUtils.exists(fullPath), fullPath
end

local function showHealth()
    local lines = {}
    local blocked = {}

    local macAnalyzer = LrPathUtils.child(_PLUGIN.path, "bin/DminAnalyzer")
    local winAnalyzer = LrPathUtils.child(_PLUGIN.path, "bin/DminAnalyzer.exe")
    local pyAnalyzer = LrPathUtils.child(_PLUGIN.path, "bin/analyzer_stub.py")
    local hasAnalyzer = LrFileUtils.exists(macAnalyzer) or LrFileUtils.exists(winAnalyzer) or LrFileUtils.exists(pyAnalyzer)

    lines[#lines + 1] = "MindfulLens System Health"
    lines[#lines + 1] = ""
    lines[#lines + 1] = "Analyzer:"
    lines[#lines + 1] = " - macOS binary: " .. stateLabel(LrFileUtils.exists(macAnalyzer)) .. " (" .. macAnalyzer .. ")"
    lines[#lines + 1] = " - Windows binary: " .. stateLabel(LrFileUtils.exists(winAnalyzer)) .. " (" .. winAnalyzer .. ")"
    lines[#lines + 1] = " - Python stub: " .. stateLabel(LrFileUtils.exists(pyAnalyzer)) .. " (" .. pyAnalyzer .. ")"
    lines[#lines + 1] = " - Effective analyzer available: " .. stateLabel(hasAnalyzer)
    lines[#lines + 1] = ""

    local cameraProfilesDir = profileInstaller.getCameraProfilesDir()
    lines[#lines + 1] = "CameraProfiles target:"
    lines[#lines + 1] = " - " .. cameraProfilesDir
    lines[#lines + 1] = ""

    local legacy = profileInstaller.inspectLegacyCameraSpecificProfiles()
    lines[#lines + 1] = "Legacy camera-specific MindfulLens DCPs:"
    lines[#lines + 1] = " - target: " .. tostring(legacy.root)
    lines[#lines + 1] = " - stale AI_KM_*__*.dcp files: " .. tostring(legacy.count)
    if legacy.count > 0 then
        lines[#lines + 1] = " - status: BLOCKED (Lightroom can surface stale 3-profile state)"
        local previewCount = math.min(5, legacy.count)
        for i = 1, previewCount do
            lines[#lines + 1] = "   - " .. tostring(legacy.matches[i])
        end
        if legacy.count > previewCount then
            lines[#lines + 1] = "   - ... +" .. tostring(legacy.count - previewCount) .. " more"
        end
    else
        lines[#lines + 1] = " - status: OK"
    end
    lines[#lines + 1] = ""

    lines[#lines + 1] = "DCP inventory:"
    local dcpFiles = profileInstaller.listPluginDcpFiles(_PLUGIN.path) or {}
    local installedDcp = 0
    for _, dcpFile in ipairs(dcpFiles) do
        local installedPath = LrPathUtils.child(cameraProfilesDir, dcpFile)
        if LrFileUtils.exists(installedPath) then
            installedDcp = installedDcp + 1
        end
    end
    lines[#lines + 1] = " - plugin DCP files: " .. tostring(#dcpFiles)
    lines[#lines + 1] = " - installed in CameraProfiles: " .. tostring(installedDcp)
    lines[#lines + 1] = ""

    -- Build shared-asset index for diagnostics.
    local dcpUsage = {}
    local lutUsage = {}
    for _, em in ipairs(config.emulsions or {}) do
        if em.dcpFile and em.dcpFile ~= "" then
            dcpUsage[em.dcpFile] = dcpUsage[em.dcpFile] or {}
            table.insert(dcpUsage[em.dcpFile], em.label)
        end
        if em.lutFile and em.lutFile ~= "" then
            lutUsage[em.lutFile] = lutUsage[em.lutFile] or {}
            table.insert(lutUsage[em.lutFile], em.label)
        end
    end

    lines[#lines + 1] = "Per-emulsion assets:"
    for _, em in ipairs(config.emulsions or {}) do
        local foundationOk, foundationPath = fileExists(em.foundationPreset)
        local lutOk, lutPath = fileExists(em.lutFile)

        local dcpRelative = em.dcpFile and ("profiles/dcp/" .. em.dcpFile) or nil
        local dcpSourceOk = false
        local dcpSourcePath = "(none)"
        local dcpInstalledOk = false
        local dcpInstalledPath = "(none)"
        if dcpRelative then
            dcpSourceOk, dcpSourcePath = fileExists(dcpRelative)
            dcpInstalledPath = LrPathUtils.child(cameraProfilesDir, em.dcpFile)
            dcpInstalledOk = LrFileUtils.exists(dcpInstalledPath)
        end

        lines[#lines + 1] = " - " .. tostring(em.label)
        lines[#lines + 1] = "    foundation: " .. stateLabel(foundationOk) .. " (" .. foundationPath .. ")"
        lines[#lines + 1] = "    LUT cube:   " .. stateLabel(lutOk) .. " (" .. lutPath .. ")"
        lines[#lines + 1] = "    DCP source: " .. stateLabel(dcpSourceOk) .. " (" .. dcpSourcePath .. ")"
        lines[#lines + 1] = "    DCP target: " .. stateLabel(dcpInstalledOk) .. " (" .. dcpInstalledPath .. ")"
        local sharedNotes = {}
        if em.dcpFile and dcpUsage[em.dcpFile] and #dcpUsage[em.dcpFile] > 1 then
            sharedNotes[#sharedNotes + 1] = "shared DCP"
        end
        if em.lutFile and lutUsage[em.lutFile] and #lutUsage[em.lutFile] > 1 then
            sharedNotes[#sharedNotes + 1] = "shared LUT"
        end

        if not foundationOk or not lutOk or not dcpSourceOk or not dcpInstalledOk then
            lines[#lines + 1] = "    status:     BLOCKED (missing assets)"
            blocked[#blocked + 1] = tostring(em.label)
        else
            if #sharedNotes > 0 then
                lines[#lines + 1] = "    status:     OK (non-unique: " .. table.concat(sharedNotes, ", ") .. ")"
            else
                lines[#lines + 1] = "    status:     OK"
            end
        end
    end

    lines[#lines + 1] = ""
    lines[#lines + 1] = "Modular presets:"
    local settingsDir = presetInstaller.getCameraRawSettingsDir()
    lines[#lines + 1] = " - target: " .. settingsDir
    local presetEntries = presetInstaller.collectPresetEntries(_PLUGIN.path, config)
    local installedCount = 0
    for _, preset in ipairs(presetEntries or {}) do
        local sourceOk, sourcePath = fileExists(preset.xmpFile)
        local relative = string.gsub(preset.xmpFile, "^profiles/modular[/\\]", "")
        local installedPath = LrPathUtils.child(settingsDir, relative)
        local installedOk = LrFileUtils.exists(installedPath)
        if installedOk then
            installedCount = installedCount + 1
        end
        lines[#lines + 1] = " - " .. tostring(preset.label)
        lines[#lines + 1] = "    source: " .. stateLabel(sourceOk) .. " (" .. sourcePath .. ")"
        lines[#lines + 1] = "    target: " .. stateLabel(installedOk) .. " (" .. installedPath .. ")"
    end
    lines[#lines + 1] = " - installed summary: " .. tostring(installedCount) .. "/" .. tostring(#presetEntries)
    lines[#lines + 1] = " - visible color-system families: " .. tostring(#colorCatalog.systemKeys(_PLUGIN.path))

    local sharedDcpCount = 0
    local sharedLutCount = 0
    for _, labels in pairs(dcpUsage) do
        if #labels > 1 then sharedDcpCount = sharedDcpCount + 1 end
    end
    for _, labels in pairs(lutUsage) do
        if #labels > 1 then sharedLutCount = sharedLutCount + 1 end
    end

    lines[#lines + 1] = ""
    lines[#lines + 1] = "Shared asset summary:"
    lines[#lines + 1] = " - DCP files shared across emulsions: " .. tostring(sharedDcpCount)
    lines[#lines + 1] = " - LUT files shared across emulsions: " .. tostring(sharedLutCount)

    if #blocked > 0 then
        lines[#lines + 1] = ""
        lines[#lines + 1] = "Blocked emulsions summary:"
        for _, label in ipairs(blocked) do
            lines[#lines + 1] = " - " .. label
        end
    end

    local message = table.concat(lines, "\n")
    local reportPath = LrPathUtils.child(
        LrPathUtils.getStandardFilePath("temp"),
        "mindfullens_system_health_" .. os.date("%Y%m%d_%H%M%S") .. ".txt"
    )
    local rf = io.open(reportPath, "w")
    if rf then
        rf:write(message)
        rf:close()
        message = message .. "\n\nReport saved to:\n" .. reportPath
    end
    logger.info("System health check", { analyzer = tostring(hasAnalyzer), camera_profiles = cameraProfilesDir })
    LrDialogs.message("MindfulLens", message, "info")
end

showHealth()
