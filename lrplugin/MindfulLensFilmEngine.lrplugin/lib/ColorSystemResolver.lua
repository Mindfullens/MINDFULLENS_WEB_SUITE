local LrPathUtils = import "LrPathUtils"

local manifest = dofile(LrPathUtils.child(_PLUGIN.path, "profiles/modular/color_systems/tools_manifest.lua"))

local M = {}

local aliases = {
    portra_160 = {
        system = "portra",
        stage01Title = "Portra 160",
        package = { stage02 = "Natural", stage03 = "Subject Polish", stage04 = "Soft Highlights" },
    },
    portra_400 = {
        system = "portra",
        stage01Title = "Portra 400",
        package = { stage02 = "Natural", stage03 = "Subject Polish", stage04 = "Soft Highlights" },
    },
    portra_800 = {
        system = "portra",
        stage01Title = "Portra 800",
        package = { stage02 = "Indoor Balance", stage03 = "Subject Polish", stage04 = "Soft Highlights" },
    },
    ektar_100 = {
        system = "ektar",
        stage01Title = "Ektar 100",
        package = { stage02 = "Natural", stage03 = "Color Separation", stage04 = "Texture" },
    },
    cinestill_800t = {
        system = "vision3",
        stage01Title = "Vision3 500T",
        package = { stage02 = "Tungsten Clean", stage03 = "Light Wrap", stage04 = "Soft Highlights" },
    },
    vision3_50d = {
        system = "vision3",
        stage01Title = "Vision3 50D",
        package = { stage02 = "Natural", stage03 = "Subject Polish", stage04 = "Soft Highlights" },
    },
    vision3_200t = {
        system = "vision3",
        stage01Title = "Vision3 200T",
        package = { stage02 = "Tungsten Clean", stage03 = "Subject Polish", stage04 = "Soft Highlights" },
    },
    vision3_500t = {
        system = "vision3",
        stage01Title = "Vision3 500T",
        package = { stage02 = "Tungsten Clean", stage03 = "Light Wrap", stage04 = "Soft Highlights" },
    },
    fuji_400h = {
        system = "fuji",
        stage01Title = "Fuji 400H",
        package = { stage02 = "Natural", stage03 = "Subject Polish", stage04 = "Soft Highlights" },
    },
    fuji_superia_400 = {
        system = "fuji",
        stage01Title = "Superia 400",
        package = { stage02 = "Natural", stage03 = "Color Separation", stage04 = "Texture" },
    },
    fuji_natura_1600 = {
        system = "fuji",
        stage01Title = "Natura 1600",
        package = { stage02 = "Indoor Balance", stage03 = "Subject Focus", stage04 = "Deep Shadows" },
    },
    fuji_superia_1600 = {
        system = "fuji",
        stage01Title = "Superia 1600",
        package = { stage02 = "Indoor Balance", stage03 = "Subject Focus", stage04 = "Deep Shadows" },
    },
    fuji_velvia_50 = {
        system = "fuji",
        stage01Title = "Velvia 50",
        package = { stage02 = "Cool Balance", stage03 = "Contrast", stage04 = "Texture" },
    },
    fuji_astia_100f = {
        system = "fuji",
        stage01Title = "Astia 100F",
        package = { stage02 = "Soft Control", stage03 = "Soft", stage04 = "Soft Highlights" },
    },
    fuji_provia_100f = {
        system = "fuji",
        stage01Title = "Provia 100F",
        package = { stage02 = "Natural", stage03 = "Contrast", stage04 = "Texture" },
    },
    kodachrome_25 = {
        system = "kodachrome",
        stage01Title = "Kodachrome 25",
        package = { stage02 = "Natural", stage03 = "Color Separation", stage04 = "Texture" },
    },
    kodachrome_64 = {
        system = "kodachrome",
        stage01Title = "Kodachrome 64",
        package = { stage02 = "Natural", stage03 = "Color Separation", stage04 = "Texture" },
    },
    bw_xp2 = {
        system = "bw",
        stage01Title = "XP2",
        package = { stage02 = "Natural", stage03 = "Depth", stage04 = "Soft Highlights" },
    },
    bw_tmax_400 = {
        system = "bw",
        stage01Title = "TMAX 400",
        package = { stage02 = "Natural", stage03 = "Depth", stage04 = "Texture" },
    },
    bw_foma_100 = {
        system = "bw",
        stage01Title = "Foma 100",
        package = { stage02 = "Natural", stage03 = "Crisp", stage04 = "Texture" },
    },
    bw_hp5 = {
        system = "bw",
        stage01Title = "HP5",
        package = { stage02 = "Soft Control", stage03 = "Film Fade", stage04 = "Deep Shadows" },
    },
    bw_vision = {
        system = "bw",
        stage01Title = "Vision BW",
        package = { stage02 = "Natural", stage03 = "Contrast", stage04 = "Deep Shadows" },
    },
    bw_foma_400 = {
        system = "bw",
        stage01Title = "Foma 400",
        package = { stage02 = "Soft Control", stage03 = "Depth", stage04 = "Deep Shadows" },
    },
    bw_delta_100 = {
        system = "bw",
        stage01Title = "Delta 100",
        package = { stage02 = "Natural", stage03 = "Crisp", stage04 = "Texture" },
    },
}

local function normalize(value)
    value = string.lower(value or "")
    value = value:gsub("&", "and")
    value = value:gsub("[^%w]+", "")
    return value
end

local function findStageEntry(systemKey, stageId, desiredTitle)
    local system = manifest[systemKey]
    if not system or not system.stages or not system.stages[stageId] then
        return nil
    end

    local wanted = normalize(desiredTitle)
    for _, entry in ipairs(system.stages[stageId]) do
        if normalize(entry.title) == wanted then
            return entry
        end
    end

    for _, entry in ipairs(system.stages[stageId]) do
        local title = normalize(entry.title)
        if title:find(wanted, 1, true) or wanted:find(title, 1, true) then
            return entry
        end
    end

    return nil
end

function M.getSystemKey(emulsionId, emulsionLabel)
    local alias = aliases[emulsionId]
    if alias then
        return alias.system
    end

    local lowered = string.lower(emulsionLabel or "")
    if lowered:find("portra", 1, true) then return "portra" end
    if lowered:find("ektar", 1, true) then return "ektar" end
    if lowered:find("fuji", 1, true) or lowered:find("fujifilm", 1, true) then return "fuji" end
    if lowered:find("vision", 1, true) or lowered:find("cinestill", 1, true) then return "vision3" end
    if lowered:find("kodachrome", 1, true) then return "kodachrome" end
    if lowered:find("bw", 1, true) or lowered:find("ilford", 1, true) or lowered:find("foma", 1, true) or lowered:find("t%-max") then
        return "bw"
    end
    return "portra"
end

function M.getStagePath(emulsionId, emulsionLabel, stageId)
    local alias = aliases[emulsionId]
    local systemKey = M.getSystemKey(emulsionId, emulsionLabel)
    local title = alias and alias.stage01Title or emulsionLabel

    if stageId ~= "01" and alias and alias.package then
        local stageTitle = alias.package["stage" .. stageId]
        if stageTitle then
            local entry = findStageEntry(systemKey, stageId, stageTitle)
            return systemKey, entry and entry.path or nil
        end
    end

    local entry = findStageEntry(systemKey, stageId, title)
    return systemKey, entry and entry.path or nil
end

function M.getDefaultPackage(emulsionId, emulsionLabel)
    local alias = aliases[emulsionId]
    local systemKey = M.getSystemKey(emulsionId, emulsionLabel)
    local defaults = {
        colorSystem = systemKey,
        stage02 = "off",
        stage03 = "off",
        stage04 = "off",
    }

    if not alias or not alias.package then
        return defaults
    end

    local _, stage02Path = M.getStagePath(emulsionId, emulsionLabel, "02")
    local _, stage03Path = M.getStagePath(emulsionId, emulsionLabel, "03")
    local _, stage04Path = M.getStagePath(emulsionId, emulsionLabel, "04")
    defaults.stage02 = stage02Path or "off"
    defaults.stage03 = stage03Path or "off"
    defaults.stage04 = stage04Path or "off"
    return defaults
end

return M
