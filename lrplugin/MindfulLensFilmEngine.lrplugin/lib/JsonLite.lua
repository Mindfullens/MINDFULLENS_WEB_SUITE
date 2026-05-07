-- Minimal JSON decoder (objects, arrays, strings, numbers, booleans, null)
-- Designed for profile JSON files.

local M = {}

local function decodeError(msg, idx)
    error((msg or "JSON parse error") .. " at position " .. tostring(idx))
end

function M.decode(input)
    if type(input) ~= "string" then
        decodeError("JSON input must be a string", 0)
    end

    local i = 1
    local len = #input

    local function peek()
        return input:sub(i, i)
    end

    local function nextChar()
        local c = input:sub(i, i)
        i = i + 1
        return c
    end

    local function skipWhitespace()
        while i <= len do
            local c = input:sub(i, i)
            if c == " " or c == "\t" or c == "\n" or c == "\r" then
                i = i + 1
            else
                break
            end
        end
    end

    local function parseString()
        local quote = nextChar()
        if quote ~= '"' then
            decodeError("Expected string", i)
        end
        local out = {}
        while i <= len do
            local c = nextChar()
            if c == '"' then
                return table.concat(out)
            elseif c == "\\" then
                local esc = nextChar()
                if esc == '"' then out[#out+1] = '"'
                elseif esc == "\\" then out[#out+1] = "\\"
                elseif esc == "/" then out[#out+1] = "/"
                elseif esc == "b" then out[#out+1] = "\b"
                elseif esc == "f" then out[#out+1] = "\f"
                elseif esc == "n" then out[#out+1] = "\n"
                elseif esc == "r" then out[#out+1] = "\r"
                elseif esc == "t" then out[#out+1] = "\t"
                elseif esc == "u" then
                    local hex = input:sub(i, i+3)
                    if #hex < 4 or not hex:match("^[0-9a-fA-F]+$") then
                        decodeError("Invalid unicode escape", i)
                    end
                    i = i + 4
                    -- Basic \uXXXX handling for ASCII range
                    local code = tonumber(hex, 16)
                    if code and code <= 0x7F then
                        out[#out+1] = string.char(code)
                    else
                        -- Keep as placeholder for non-ASCII
                        out[#out+1] = "?"
                    end
                else
                    decodeError("Invalid escape", i)
                end
            else
                out[#out+1] = c
            end
        end
        decodeError("Unterminated string", i)
    end

    local function parseNumber()
        local start = i
        local c = peek()
        if c == "-" then
            i = i + 1
        end
        while i <= len and input:sub(i, i):match("%d") do
            i = i + 1
        end
        if i <= len and input:sub(i, i) == "." then
            i = i + 1
            while i <= len and input:sub(i, i):match("%d") do
                i = i + 1
            end
        end
        if i <= len then
            local e = input:sub(i, i)
            if e == "e" or e == "E" then
                i = i + 1
                local s = input:sub(i, i)
                if s == "+" or s == "-" then
                    i = i + 1
                end
                while i <= len and input:sub(i, i):match("%d") do
                    i = i + 1
                end
            end
        end
        local numStr = input:sub(start, i - 1)
        local num = tonumber(numStr)
        if num == nil then
            decodeError("Invalid number", start)
        end
        return num
    end

    local parseValue

    local function parseArray()
        local arr = {}
        nextChar() -- [
        skipWhitespace()
        if peek() == "]" then
            nextChar()
            return arr
        end
        while i <= len do
            local val = parseValue()
            arr[#arr+1] = val
            skipWhitespace()
            local c = peek()
            if c == "," then
                nextChar()
                skipWhitespace()
            elseif c == "]" then
                nextChar()
                return arr
            else
                decodeError("Expected ',' or ']'", i)
            end
        end
        decodeError("Unterminated array", i)
    end

    local function parseObject()
        local obj = {}
        nextChar() -- {
        skipWhitespace()
        if peek() == "}" then
            nextChar()
            return obj
        end
        while i <= len do
            skipWhitespace()
            local key = parseString()
            skipWhitespace()
            if nextChar() ~= ":" then
                decodeError("Expected ':'", i)
            end
            skipWhitespace()
            local val = parseValue()
            obj[key] = val
            skipWhitespace()
            local c = peek()
            if c == "," then
                nextChar()
                skipWhitespace()
            elseif c == "}" then
                nextChar()
                return obj
            else
                decodeError("Expected ',' or '}'", i)
            end
        end
        decodeError("Unterminated object", i)
    end

    function parseValue()
        skipWhitespace()
        local c = peek()
        if c == "{" then
            return parseObject()
        elseif c == "[" then
            return parseArray()
        elseif c == '"' then
            return parseString()
        elseif c == "t" and input:sub(i, i+3) == "true" then
            i = i + 4
            return true
        elseif c == "f" and input:sub(i, i+4) == "false" then
            i = i + 5
            return false
        elseif c == "n" and input:sub(i, i+3) == "null" then
            i = i + 4
            return nil
        else
            return parseNumber()
        end
    end

    local value = parseValue()
    skipWhitespace()
    if i <= len then
        decodeError("Trailing characters", i)
    end
    return value
end

return M
