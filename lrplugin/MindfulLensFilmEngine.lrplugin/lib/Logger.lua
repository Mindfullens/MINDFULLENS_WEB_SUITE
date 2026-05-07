local LrPathUtils = import "LrPathUtils"

local M = {}

local function logLine(level, message, fields)
    local path = LrPathUtils.child(LrPathUtils.getStandardFilePath("temp"), "mindfullens_film_engine.log")
    local f = io.open(path, "a")
    if not f then
        return
    end

    f:write(os.date("!%Y-%m-%dT%H:%M:%SZ"), " [", level, "] ", message)
    if fields then
        for k, v in pairs(fields) do
            f:write(" ", tostring(k), "=", tostring(v))
        end
    end
    f:write("\n")
    f:close()
end

function M.info(message, fields)
    logLine("INFO", message, fields)
end

function M.warn(message, fields)
    logLine("WARN", message, fields)
end

function M.error(message, fields)
    logLine("ERROR", message, fields)
end

return M
