local LrPathUtils = import "LrPathUtils"

local M = {}

local HIDDEN_SYSTEMS = {
    ["ektar_color_system_patched.zip"] = true,
}

local function pluginLoad(pluginPath, relativePath)
    return dofile(LrPathUtils.child(pluginPath, relativePath))
end

local function sanitizeId(text)
    local value = string.lower(tostring(text or "preset"))
    value = value:gsub("[^%w]+", "_")
    value = value:gsub("^_+", "")
    value = value:gsub("_+$", "")
    if value == "" then
        return "preset"
    end
    return value
end

function M.isHiddenSystem(systemKey)
    local key = tostring(systemKey or "")
    return HIDDEN_SYSTEMS[key] == true
end

function M.loadManifest(pluginPath)
    local ok, manifest = pcall(pluginLoad, pluginPath, "profiles/modular/color_systems/tools_manifest.lua")
    if ok and type(manifest) == "table" then
        return manifest
    end
    return {}
end

function M.visibleManifest(pluginPath)
    local manifest = M.loadManifest(pluginPath)
    local visible = {}
    for systemKey, systemData in pairs(manifest) do
        if not M.isHiddenSystem(systemKey) then
            visible[systemKey] = systemData
        end
    end
    return visible
end

function M.systemKeys(pluginPath, options)
    local includeHidden = options and options.includeHidden == true
    local manifest = options and options.manifest or M.loadManifest(pluginPath)
    local keys = {}
    for systemKey, _ in pairs(manifest) do
        if includeHidden or not M.isHiddenSystem(systemKey) then
            keys[#keys + 1] = systemKey
        end
    end
    table.sort(keys)
    return keys, manifest
end

function M.collectPresetEntries(pluginPath, options)
    local includeHidden = options and options.includeHidden == true
    local manifest = options and options.manifest or M.loadManifest(pluginPath)
    local dedupe = {}
    local entries = {}

    for systemKey, systemData in pairs(manifest) do
        if includeHidden or not M.isHiddenSystem(systemKey) then
            for stageKey, items in pairs(systemData.stages or {}) do
                for _, item in ipairs(items or {}) do
                    local path = tostring(item.path or "")
                    if path ~= "" and not dedupe[path] then
                        dedupe[path] = true
                        entries[#entries + 1] = {
                            id = sanitizeId(systemKey .. "_" .. tostring(stageKey) .. "_" .. tostring(item.title or path)),
                            label = "Color System | " .. tostring(item.title or path),
                            xmpFile = path,
                            systemKey = systemKey,
                            stageKey = tostring(stageKey),
                            hidden = M.isHiddenSystem(systemKey),
                        }
                    end
                end
            end
        end
    end

    table.sort(entries, function(a, b)
        return tostring(a.xmpFile) < tostring(b.xmpFile)
    end)

    return entries
end

return M
