local M = {}

-- If ALLOWED_KEYS is nil, load all crs:* attributes we find.
local ALLOWED_KEYS = nil
local SKIP_KEYS = {
    AlreadyApplied = true,
    CameraModelRestriction = true,
    Cluster = true,
    CompatibleVersion = true,
    ContactInfo = true,
    Copyright = true,
    Group = true,
    HasSettings = true,
    Name = true,
    PresetType = true,
    RawFileName = true,
    RequiresRGBTables = true,
    ShortName = true,
    ShowInPresets = true,
    ShowInQuickActions = true,
    SortName = true,
    SupportsAmount = true,
    SupportsAmount2 = true,
    SupportsColor = true,
    SupportsHighDynamicRange = true,
    SupportsMonochrome = true,
    SupportsNormalDynamicRange = true,
    SupportsOutputReferred = true,
    SupportsSceneReferred = true,
    UUID = true,
    Version = true,
}

local function normalizeValue(raw)
    if raw == nil then
        return nil
    end
    if raw == "True" or raw == "true" then
        return true
    end
    if raw == "False" or raw == "false" then
        return false
    end

    local maybeNumber = tonumber(raw)
    if maybeNumber ~= nil then
        return maybeNumber
    end
    return raw
end

function M.loadDevelopSettings(xmpPath)
    local f = io.open(xmpPath, "r")
    if not f then
        return nil, "Cannot open XMP file: " .. tostring(xmpPath)
    end

    local content = f:read("*a")
    f:close()

    local settings = {}
    for key, value in string.gmatch(content, 'crs:([%w_]+)="([^"]*)"') do
        if (not SKIP_KEYS[key]) and ((not ALLOWED_KEYS) or ALLOWED_KEYS[key]) then
            settings[key] = normalizeValue(value)
        end
    end

    local function parseCurve(tag)
        local block = string.match(content, "<crs:" .. tag .. ">(.-)</crs:" .. tag .. ">")
        if not block then
            return nil
        end
        local points = {}
        for line in string.gmatch(block, "<rdf:li>([^<]+)</rdf:li>") do
            local x, y = string.match(line, "([%d%.%-]+)%s*,%s*([%d%.%-]+)")
            if x and y then
                table.insert(points, { tonumber(x), tonumber(y) })
            end
        end
        if #points > 0 then
            return points
        end
        return nil
    end

    local curve = parseCurve("ToneCurvePV2012")
    if curve then
        settings.ToneCurvePV2012 = curve
    end
    local curveR = parseCurve("ToneCurvePV2012Red")
    if curveR then
        settings.ToneCurvePV2012Red = curveR
    end
    local curveG = parseCurve("ToneCurvePV2012Green")
    if curveG then
        settings.ToneCurvePV2012Green = curveG
    end
    local curveB = parseCurve("ToneCurvePV2012Blue")
    if curveB then
        settings.ToneCurvePV2012Blue = curveB
    end

    return settings, nil
end

return M
