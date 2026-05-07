local LrDialogs = import "LrDialogs"
local LrPathUtils = import "LrPathUtils"
local LrTasks = import "LrTasks"

local function pluginLoad(relativePath)
    return dofile(LrPathUtils.child(_PLUGIN.path, relativePath))
end

local config = pluginLoad("lib/FilmEngineConfig.lua")
local logger = pluginLoad("lib/Logger.lua")
local presetInstaller = pluginLoad("lib/PresetInstaller.lua")

local function runInstall()
    LrTasks.startAsyncTask(function()
        local result = presetInstaller.installModularPresets(_PLUGIN.path, config)
        logger.info("Modular preset install run", {
            installed = tostring(result.installed),
            skipped = tostring(result.skipped),
            missing = tostring(result.missing),
            errors = tostring(result.errors),
            target = tostring(result.target),
        })

        local lines = {
            "Modular XMP install summary",
            "",
            "Target: " .. tostring(result.target),
            "Preset entries scanned: " .. tostring(result.total or 0),
            "Installed: " .. tostring(result.installed),
            "Already present (skipped): " .. tostring(result.skipped),
            "Missing in plugin modular folder: " .. tostring(result.missing),
            "Copy errors: " .. tostring(result.errors),
        }

        LrDialogs.message("MindfulLens", table.concat(lines, "\n"), "info")
    end)
end

runInstall()
