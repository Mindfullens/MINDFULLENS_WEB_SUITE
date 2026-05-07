local LrFileUtils = import "LrFileUtils"
local LrPathUtils = import "LrPathUtils"

local function pluginLoad(relativePath)
    return dofile(LrPathUtils.child(_PLUGIN.path, relativePath))
end

local json = pluginLoad("lib/JsonLite.lua")

local M = {}
local cache = {}

local function readFile(path)
    local fh = io.open(path, "r")
    if not fh then
        return nil, "File not found: " .. tostring(path)
    end
    local content = fh:read("*a")
    fh:close()
    if not content or content == "" then
        return nil, "Empty file: " .. tostring(path)
    end
    return content
end

local function validate(profile)
    local errs = {}
    if type(profile) ~= "table" then
        errs[#errs + 1] = "Profile is not a table"
        return false, errs
    end
    local em = profile.emulsion
    if type(em) ~= "table" then
        errs[#errs + 1] = "Missing emulsion root"
        return false, errs
    end
    if not em.id or em.id == "" then errs[#errs + 1] = "Missing emulsion.id" end
    if not em.label or em.label == "" then errs[#errs + 1] = "Missing emulsion.label" end
    if not em.type or em.type == "" then errs[#errs + 1] = "Missing emulsion.type" end
    if not em.base or type(em.base) ~= "table" then errs[#errs + 1] = "Missing emulsion.base" end
    if em.base then
        if em.base.dmin_ref == nil then errs[#errs + 1] = "Missing base.dmin_ref" end
        if em.base.dmax_ref == nil then errs[#errs + 1] = "Missing base.dmax_ref" end
    end
    if not em.sensitometry or type(em.sensitometry) ~= "table" then errs[#errs + 1] = "Missing emulsion.sensitometry" end
    if not em.spectral or type(em.spectral) ~= "table" then errs[#errs + 1] = "Missing emulsion.spectral" end
    if not em.grain or type(em.grain) ~= "table" then errs[#errs + 1] = "Missing emulsion.grain" end
    if not em.print or type(em.print) ~= "table" then errs[#errs + 1] = "Missing emulsion.print" end

    if #errs > 0 then
        return false, errs
    end
    return true, nil
end

function M.loadProfile(path)
    if cache[path] then
        return cache[path], nil
    end
    local raw, err = readFile(path)
    if not raw then
        return nil, err
    end
    local ok, data = pcall(function()
        return json.decode(raw)
    end)
    if not ok then
        return nil, "JSON parse error: " .. tostring(data)
    end
    local valid, errs = validate(data)
    if not valid then
        return nil, "Invalid profile: " .. table.concat(errs or {}, "; ")
    end
    cache[path] = data
    return data, nil
end

function M.loadProfileById(id, rootDir)
    if not id or id == "" then
        return nil, "Missing emulsion id"
    end
    local root = rootDir or LrPathUtils.child(_PLUGIN.path, "profiles/emulsion_json")
    local path = LrPathUtils.child(root, id .. ".json")
    return M.loadProfile(path)
end

function M.clearCache()
    cache = {}
end

return M
