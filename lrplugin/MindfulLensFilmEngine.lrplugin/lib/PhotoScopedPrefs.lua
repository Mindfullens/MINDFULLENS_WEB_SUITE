local M = {}

local PRINT_FIELDS = { "halation", "bloom", "vignette", "grain" }
local PANEL2_FIELDS = {
    "colorProcess",
    "lutIntensity",
    "saturationTrim",
    "labGlow",
    "labFade",
    "softHighs",
    "softLows",
    "whiteClip",
    "blackClip",
}

local PANEL2_BOOLEAN_FIELDS = {
    softHighs = true,
    softLows = true,
}

local function photoToken(photo)
    if not photo then
        return nil
    end

    local okId, localId = pcall(function()
        return photo.localIdentifier
    end)
    if okId and localId ~= nil and tostring(localId) ~= "" then
        return tostring(localId)
    end

    local okPath, rawPath = pcall(function()
        return photo:getRawMetadata("path")
    end)
    if okPath and type(rawPath) == "string" and rawPath ~= "" then
        return string.gsub(rawPath, "[^%w]+", "_")
    end

    return nil
end

local function printPrefKey(photo, field)
    local token = photoToken(photo)
    if not token then
        return nil
    end
    return "tools_print_photo_" .. token .. "_" .. tostring(field or "")
end

local function panel2PrefKey(photo, field)
    local token = photoToken(photo)
    if not token then
        return nil
    end
    return "panel2_photo_" .. token .. "_" .. tostring(field or "")
end

function M.loadPrintSelections(prefs, photo)
    local state = {
        halation = "off",
        bloom = "off",
        vignette = "off",
        grain = "off",
        anyActive = false,
    }
    if not prefs or not photo then
        return state
    end

    for _, field in ipairs(PRINT_FIELDS) do
        local key = printPrefKey(photo, field)
        state[field] = tostring((key and prefs[key]) or "off")
        if state[field] ~= "off" then
            state.anyActive = true
        end
    end

    return state
end

function M.savePrintSelections(prefs, photo, snapshot)
    if not prefs or not photo then
        return
    end

    for _, field in ipairs(PRINT_FIELDS) do
        local key = printPrefKey(photo, field)
        if key then
            prefs[key] = tostring((snapshot and snapshot[field]) or "off")
        end
    end
end

function M.clearPrintSelections(prefs, photo)
    if not prefs or not photo then
        return
    end

    for _, field in ipairs(PRINT_FIELDS) do
        local key = printPrefKey(photo, field)
        if key then
            prefs[key] = nil
        end
    end
end

function M.loadPanel2Settings(prefs, photo)
    local state = { hasSaved = false }
    if not prefs or not photo then
        return state
    end

    for _, field in ipairs(PANEL2_FIELDS) do
        local key = panel2PrefKey(photo, field)
        if key and prefs[key] ~= nil then
            state[field] = prefs[key]
            state.hasSaved = true
        end
    end

    return state
end

function M.savePanel2Settings(prefs, photo, snapshot)
    if not prefs or not photo then
        return
    end

    for _, field in ipairs(PANEL2_FIELDS) do
        local key = panel2PrefKey(photo, field)
        if key then
            if PANEL2_BOOLEAN_FIELDS[field] == true then
                prefs[key] = ((snapshot and snapshot[field]) == true)
            else
                prefs[key] = tostring((snapshot and snapshot[field]) or "")
            end
        end
    end
end

function M.clearPanel2Settings(prefs, photo)
    if not prefs or not photo then
        return
    end

    for _, field in ipairs(PANEL2_FIELDS) do
        local key = panel2PrefKey(photo, field)
        if key then
            prefs[key] = nil
        end
    end
end

return M
