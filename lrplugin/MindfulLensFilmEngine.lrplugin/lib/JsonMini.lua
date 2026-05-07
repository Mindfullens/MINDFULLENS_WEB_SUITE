local M = {}

-- Minimal JSON decoder for flat objects returned by analyzer.
function M.decodeFlatObject(text)
    local out = {}
    for key, value in string.gmatch(text, '"([%w_]+)"%s*:%s*"([^"]*)"') do
        out[key] = value
    end
    for key, value in string.gmatch(text, '"([%w_]+)"%s*:%s*([%-]?[%d%.]+)') do
        out[key] = tonumber(value)
    end
    -- Lua patterns do not support regex-style alternation ("true|false"),
    -- so we capture alpha tokens and map booleans manually.
    for key, value in string.gmatch(text, '"([%w_]+)"%s*:%s*([%a]+)') do
        if value == "true" then
            out[key] = true
        elseif value == "false" then
            out[key] = false
        end
    end
    return out
end

return M
