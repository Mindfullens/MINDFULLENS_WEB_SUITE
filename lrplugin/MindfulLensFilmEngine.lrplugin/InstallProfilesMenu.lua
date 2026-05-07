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
            "DCP install summary",
            "",
            "Target: " .. tostring(result.target),
            "Installed: " .. tostring(result.installed),
            "Already present (skipped): " .. tostring(result.skipped),
            "Missing in plugin profiles/dcp: " .. tostring(result.missing),
            "Copy errors: " .. tostring(result.errors),
        }

        if (result.legacy_found or 0) > 0 or (result.caches_deleted or 0) > 0 then
            lines[#lines + 1] = ""
            lines[#lines + 1] = "Legacy cleanup:"
            lines[#lines + 1] = "Stale camera-specific AI_KM files found: " .. tostring(result.legacy_found or 0)
            lines[#lines + 1] = "Stale camera-specific AI_KM files removed: " .. tostring(result.legacy_removed or 0)
            lines[#lines + 1] = "Adobe cache files deleted: " .. tostring(result.caches_deleted or 0)
        end

        if (result.legacy_errors or 0) > 0 or (result.cache_errors or 0) > 0 then
            lines[#lines + 1] = ""
            lines[#lines + 1] = "Cleanup warnings:"
            lines[#lines + 1] = "Legacy remove errors: " .. tostring(result.legacy_errors or 0)
            lines[#lines + 1] = "Cache delete errors: " .. tostring(result.cache_errors or 0)
        end

        if result.missing > 0 then
            lines[#lines + 1] = ""
            lines[#lines + 1] = "Note: DCP binaries are still missing in /profiles/dcp."
            lines[#lines + 1] = "This is expected until we drop the final compiled DCP files."
        end

        LrDialogs.message("MindfulLens", table.concat(lines, "\n"), "info")
    end)
end

runInstall()
