local LrDialogs = import "LrDialogs"
local LrFileUtils = import "LrFileUtils"
local LrPathUtils = import "LrPathUtils"

local function pluginLoad(relativePath)
    return dofile(LrPathUtils.child(_PLUGIN.path, relativePath))
end

local config = pluginLoad("lib/FilmEngineConfig.lua")
local logger = pluginLoad("lib/Logger.lua")

local function buildUsageMaps(emulsions)
    local dcpUsage = {}
    local lutUsage = {}
    local foundationUsage = {}
    for _, em in ipairs(emulsions or {}) do
        if em.dcpFile and em.dcpFile ~= "" then
            dcpUsage[em.dcpFile] = dcpUsage[em.dcpFile] or {}
            table.insert(dcpUsage[em.dcpFile], em.label)
        end
        if em.lutFile and em.lutFile ~= "" then
            lutUsage[em.lutFile] = lutUsage[em.lutFile] or {}
            table.insert(lutUsage[em.lutFile], em.label)
        end
        if em.foundationPreset and em.foundationPreset ~= "" then
            foundationUsage[em.foundationPreset] = foundationUsage[em.foundationPreset] or {}
            table.insert(foundationUsage[em.foundationPreset], em.label)
        end
    end
    return dcpUsage, lutUsage, foundationUsage
end

local function csvEscape(value)
    value = tostring(value or "")
    if string.find(value, "[\",\n]") then
        value = value:gsub("\"", "\"\"")
        return "\"" .. value .. "\""
    end
    return value
end

local function writeCsv(path, emulsions, dcpUsage, lutUsage, foundationUsage)
    local f = io.open(path, "w")
    if not f then
        return false, "Cannot write report: " .. tostring(path)
    end

    local header = table.concat({
        "emulsion_id",
        "label",
        "profile_name",
        "dcp_file",
        "dcp_shared_count",
        "dcp_shared_with",
        "lut_file",
        "lut_shared_count",
        "lut_shared_with",
        "foundation_xmp",
        "foundation_shared_count",
    }, ",")
    f:write(header, "\n")

    for _, em in ipairs(emulsions or {}) do
        local dcp = em.dcpFile or ""
        local lut = em.lutFile or ""
        local foundation = em.foundationPreset or ""
        local dcpList = dcpUsage[dcp] or {}
        local lutList = lutUsage[lut] or {}
        local foundationList = foundationUsage[foundation] or {}

        local dcpShared = {}
        for _, label in ipairs(dcpList) do
            if label ~= em.label then
                table.insert(dcpShared, label)
            end
        end
        local lutShared = {}
        for _, label in ipairs(lutList) do
            if label ~= em.label then
                table.insert(lutShared, label)
            end
        end

        local row = {
            em.id or "",
            em.label or "",
            em.profile or "",
            dcp,
            tostring(#dcpList),
            table.concat(dcpShared, "; "),
            lut,
            tostring(#lutList),
            table.concat(lutShared, "; "),
            foundation,
            tostring(#foundationList),
        }
        for i, value in ipairs(row) do
            row[i] = csvEscape(value)
        end
        f:write(table.concat(row, ","), "\n")
    end

    f:close()
    return true, nil
end

local function generateReport()
    local emulsions = config.emulsions or {}
    local dcpUsage, lutUsage, foundationUsage = buildUsageMaps(emulsions)

    local sharedDcp = 0
    local sharedLut = 0
    for _, labels in pairs(dcpUsage) do
        if #labels > 1 then sharedDcp = sharedDcp + 1 end
    end
    for _, labels in pairs(lutUsage) do
        if #labels > 1 then sharedLut = sharedLut + 1 end
    end

    local reportPath = LrPathUtils.child(
        LrPathUtils.getStandardFilePath("temp"),
        "mindfullens_asset_uniqueness_" .. os.date("%Y%m%d_%H%M%S") .. ".csv"
    )
    local ok, err = writeCsv(reportPath, emulsions, dcpUsage, lutUsage, foundationUsage)
    if not ok then
        LrDialogs.message("MindfulLens — Asset Report", err or "Failed to write report.", "critical")
        return
    end

    logger.info("Asset uniqueness report generated", {
        path = reportPath,
        emulsions = tostring(#emulsions),
        shared_dcp = tostring(sharedDcp),
        shared_lut = tostring(sharedLut),
    })

    local lines = {
        "Asset uniqueness report generated.",
        "",
        "Emulsions: " .. tostring(#emulsions),
        "Shared DCP files: " .. tostring(sharedDcp),
        "Shared LUT files: " .. tostring(sharedLut),
        "",
        "Report saved to:",
        reportPath,
    }
    LrDialogs.message("MindfulLens — Asset Report", table.concat(lines, "\n"), "info")
end

generateReport()
