local LrDialogs = import "LrDialogs"
local LrPathUtils = import "LrPathUtils"

local function pluginLoad(relativePath)
    return dofile(LrPathUtils.child(_PLUGIN.path, relativePath))
end

local config = pluginLoad("lib/FilmEngineConfig.lua")
local logger = pluginLoad("lib/Logger.lua")
local profileInstaller = pluginLoad("lib/ProfileInstaller.lua")
local presetInstaller = pluginLoad("lib/PresetInstaller.lua")

logger.info("Plugin initialized", {
    pluginPath = _PLUGIN.path,
    tempDir = LrPathUtils.getStandardFilePath("temp"),
})

local ok, result = pcall(function()
    return profileInstaller.installAllDcpProfiles(_PLUGIN.path)
end)

if ok and result then
    logger.info("Plugin init DCP sync", {
        target = tostring(result.target),
        installed = tostring(result.installed),
        skipped = tostring(result.skipped),
        missing = tostring(result.missing),
        errors = tostring(result.errors),
        legacy_found = tostring(result.legacy_found or 0),
        legacy_removed = tostring(result.legacy_removed or 0),
        caches_deleted = tostring(result.caches_deleted or 0),
        legacy_errors = tostring(result.legacy_errors or 0),
        cache_errors = tostring(result.cache_errors or 0),
    })
    if (result.legacy_removed or 0) > 0 or (result.caches_deleted or 0) > 0 then
        local lines = {
            "MindfulLens migrated a legacy Lightroom profile state.",
            "",
            "Removed stale camera-specific AI_KM profiles: " .. tostring(result.legacy_removed or 0),
            "Cleared Adobe profile caches: " .. tostring(result.caches_deleted or 0),
            "",
            "If the profile browser still looks stale, restart Lightroom Classic once.",
        }
        LrDialogs.message("MindfulLens", table.concat(lines, "\n"), "info")
    end
else
    logger.error("Plugin init DCP sync failed", {
        error = tostring(result),
    })
end

local presetsOk, presetsResult = pcall(function()
    return presetInstaller.installModularPresets(_PLUGIN.path, config)
end)

if presetsOk and presetsResult then
    logger.info("Plugin init modular preset sync", {
        target = tostring(presetsResult.target),
        installed = tostring(presetsResult.installed),
        skipped = tostring(presetsResult.skipped),
        missing = tostring(presetsResult.missing),
        errors = tostring(presetsResult.errors),
    })
else
    logger.error("Plugin init modular preset sync failed", {
        error = tostring(presetsResult),
    })
end
