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
            "Instalacja presetów modularnych XMP — podsumowanie",
            "",
            "Folder docelowy: " .. tostring(result.target),
            "Przeskanowano wpisów: " .. tostring(result.total or 0),
            "Zainstalowano: " .. tostring(result.installed),
            "Pominięto (już były): " .. tostring(result.skipped),
            "Brak w bundle (modular): " .. tostring(result.missing),
            "Błędy kopiowania: " .. tostring(result.errors),
        }

        LrDialogs.message("Analog Signature — presety XMP", table.concat(lines, "\n"), "info")
    end)
end

runInstall()
