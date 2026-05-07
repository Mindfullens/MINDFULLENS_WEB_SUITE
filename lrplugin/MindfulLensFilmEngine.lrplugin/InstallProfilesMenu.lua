local LrDialogs = import "LrDialogs"
local LrPathUtils = import "LrPathUtils"
local LrTasks = import "LrTasks"

local function pluginLoad(relativePath)
    return dofile(LrPathUtils.child(_PLUGIN.path, relativePath))
end

local config = pluginLoad("lib/FilmEngineConfig.lua")
local logger = pluginLoad("lib/Logger.lua")
local profileInstaller = pluginLoad("lib/ProfileInstaller.lua")

local function runInstall()
    LrTasks.startAsyncTask(function()
        local result = profileInstaller.installAllDcpProfiles(_PLUGIN.path)
        logger.info("DCP install run", {
            installed = tostring(result.installed),
            skipped = tostring(result.skipped),
            missing = tostring(result.missing),
            errors = tostring(result.errors),
            target = tostring(result.target),
        })

        local lines = {
            "Instalacja profili DCP — podsumowanie",
            "",
            "Folder docelowy: " .. tostring(result.target),
            "Zainstalowano: " .. tostring(result.installed),
            "Pominięto (już były): " .. tostring(result.skipped),
            "Brak w bundle (profiles/dcp): " .. tostring(result.missing),
            "Błędy kopiowania: " .. tostring(result.errors),
        }

        if (result.legacy_found or 0) > 0 or (result.caches_deleted or 0) > 0 then
            lines[#lines + 1] = ""
            lines[#lines + 1] = "Czyszczenie starych plików:"
            lines[#lines + 1] = "Znaleziono przestarzałe AI_KM_* (per aparat): " .. tostring(result.legacy_found or 0)
            lines[#lines + 1] = "Usunięto: " .. tostring(result.legacy_removed or 0)
            lines[#lines + 1] = "Skasowano pliki cache Adobe: " .. tostring(result.caches_deleted or 0)
        end

        if (result.legacy_errors or 0) > 0 or (result.cache_errors or 0) > 0 then
            lines[#lines + 1] = ""
            lines[#lines + 1] = "Ostrzeżenia czyszczenia:"
            lines[#lines + 1] = "Błędy usuwania legacy: " .. tostring(result.legacy_errors or 0)
            lines[#lines + 1] = "Błędy kasowania cache: " .. tostring(result.cache_errors or 0)
        end

        if result.missing > 0 then
            lines[#lines + 1] = ""
            lines[#lines + 1] = "Uwaga: część plików DCP nie jest jeszcze w profiles/dcp — to normalne do czasu pełnego pakietu .dcp."
        end

        LrDialogs.message("Analog Signature — instalacja DCP", table.concat(lines, "\n"), "info")
    end)
end

runInstall()
