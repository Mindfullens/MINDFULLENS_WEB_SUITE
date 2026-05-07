local LrApplicationView = import "LrApplicationView"
local LrDevelopController = import "LrDevelopController"
local LrPathUtils = import "LrPathUtils"

local function pluginLoad(relativePath)
    return dofile(LrPathUtils.child(_PLUGIN.path, relativePath))
end

local logger = pluginLoad("lib/Logger.lua")

local M = {}

local PARAM_FALLBACKS = {
    Contrast2012 = { "Contrast2012", "Contrast" },
    Highlights2012 = { "Highlights2012", "Highlights" },
    Shadows2012 = { "Shadows2012", "Shadows" },
    Whites2012 = { "Whites2012", "Whites" },
    Blacks2012 = { "Blacks2012", "Blacks" },
    Clarity2012 = { "Clarity2012", "Clarity" },
}

local function candidateParams(key)
    local fallbacks = PARAM_FALLBACKS[key]
    if fallbacks then
        return fallbacks
    end
    return { key }
end

local function setDevelopValue(key, value)
    local lastError = nil
    for _, param in ipairs(candidateParams(key)) do
        local ok, err = pcall(function()
            LrDevelopController.setValue(param, value)
        end)
        if ok then
            return true, nil, param
        end
        lastError = err
    end
    return false, lastError, nil
end

local function resetDevelopValue(key)
    local lastError = nil
    for _, param in ipairs(candidateParams(key)) do
        local ok, err = pcall(function()
            LrDevelopController.resetToDefault(param)
        end)
        if ok then
            return true, nil, param
        end
        lastError = err
    end
    return false, lastError, nil
end

local function baselineValueForKey(baselineSettings, key)
    if type(baselineSettings) ~= "table" then
        return nil
    end

    local direct = tonumber(baselineSettings[key])
    if direct ~= nil then
        return direct
    end

    for _, param in ipairs(candidateParams(key)) do
        local numeric = tonumber(baselineSettings[param])
        if numeric ~= nil then
            return numeric
        end
    end

    return nil
end

function M.isDevelopModuleActive()
    local ok, moduleName = pcall(function()
        return LrApplicationView.getCurrentModuleName()
    end)
    return ok and moduleName == "develop"
end

function M.captureValues(keys)
    if not M.isDevelopModuleActive() then
        return false, "Podglad na zywo dziala tylko w module Develop.", {}
    end

    local snapshot = {}
    local count = 0

    for _, key in ipairs(keys or {}) do
        local stored = false
        for _, param in ipairs(candidateParams(key)) do
            local ok, value = pcall(function()
                return LrDevelopController.getValue(param)
            end)
            if ok and tonumber(value) ~= nil then
                snapshot[key] = tonumber(value)
                count = count + 1
                stored = true
                break
            end
        end
        if not stored then
            snapshot[key] = nil
        end
    end

    return true, nil, snapshot, count
end

function M.applySettings(settings, options)
    if not M.isDevelopModuleActive() then
        return false, "Podglad na zywo dziala tylko w module Develop.", {}
    end

    local opts = options or {}
    local applied = {}
    local count = 0
    local trackedParam = nil

    for key, rawValue in pairs(settings or {}) do
        local value = tonumber(rawValue)
        if value ~= nil then
            trackedParam = candidateParams(key)[1]
            break
        end
    end

    for key, rawValue in pairs(settings or {}) do
        local value = tonumber(rawValue)
        if value ~= nil then
            local ok, err, appliedParam = setDevelopValue(key, value)
            if ok then
                applied[#applied + 1] = {
                    key = key,
                    param = appliedParam,
                }
                count = count + 1
            elseif opts.logFailures == true then
                logger.error("Develop preview skipped param", {
                    key = tostring(key),
                    error = tostring(err or ""),
                })
            end
        end
    end

    if count == 0 then
        return false, "Brak ustawien zgodnych z suwakami Lightrooma dla podgladu na zywo.", applied
    end

    return true, nil, applied
end

function M.restoreSettings(baselineSettings, appliedEntries)
    if not M.isDevelopModuleActive() then
        return false, "Przywrocenie podgladu dziala tylko w module Develop."
    end

    local seen = {}
    local restored = 0

    for _, entry in ipairs(appliedEntries or {}) do
        local key = type(entry) == "table" and entry.key or entry
        local param = type(entry) == "table" and entry.param or nil
        if key and param and not seen[param] then
            seen[param] = true
            local baselineValue = baselineValueForKey(baselineSettings, key)
            if baselineValue ~= nil then
                local ok = pcall(function()
                    LrDevelopController.setValue(param, baselineValue)
                end)
                if ok then
                    restored = restored + 1
                end
            elseif key == "Temperature" or key == "Tint" then
                -- Never reset WB sliders to Lightroom defaults when the entry snapshot
                -- did not provide an explicit baseline value. Panel deltas must preserve
                -- the photo's incoming white balance.
            else
                resetDevelopValue(key)
            end
        end
    end

    return true, nil, restored
end

return M
