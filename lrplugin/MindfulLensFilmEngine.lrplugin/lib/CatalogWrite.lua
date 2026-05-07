local LrTasks = import "LrTasks"

local M = {}

local function isContentionError(raw)
    local text = string.lower(tostring(raw or ""))
    if string.find(text, "blocked by another write access", 1, true) then
        return true
    end
    if string.find(text, "could not execute action", 1, true) then
        return true
    end
    if string.find(text, "write access", 1, true) and string.find(text, "timeout", 1, true) then
        return true
    end
    return false
end

function M.run(catalog, actionName, fn, opts)
    if not catalog or type(fn) ~= "function" then
        return false, "invalid_arguments"
    end

    local options = opts or {}
    local attempts = tonumber(options.attempts) or 8
    local sleepBase = tonumber(options.sleep) or 0.08
    local sleepMax = tonumber(options.sleepMax) or 0.45
    local lastError = nil
    local canYield = false
    local canYieldOk, canYieldValue = pcall(function()
        return LrTasks.canYield()
    end)
    if canYieldOk and canYieldValue == true then
        canYield = true
    end

    for attempt = 1, attempts do
        local ok, err = LrTasks.pcall(function()
            catalog:withWriteAccessDo(actionName, fn)
        end)

        if ok then
            return true, nil, attempt
        end

        lastError = tostring(err or "write_access_error")
        if not isContentionError(lastError) then
            return false, lastError, attempt
        end

        if attempt < attempts and canYield then
            local delay = sleepBase * attempt
            if delay > sleepMax then
                delay = sleepMax
            end
            LrTasks.sleep(delay)
        else
            return false, tostring(lastError or "write_access_failed"), attempt
        end
    end

    return false, tostring(lastError or "write_access_failed"), attempts
end

return M
