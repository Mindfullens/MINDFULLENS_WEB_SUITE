local LrFileUtils = import "LrFileUtils"
local LrPathUtils = import "LrPathUtils"

local M = {}

local function copyBinary(src, dst)
    local inFile = io.open(src, "rb")
    if not inFile then
        return false, "Cannot open source: " .. tostring(src)
    end
    local data = inFile:read("*a")
    inFile:close()

    local outFile = io.open(dst, "wb")
    if not outFile then
        return false, "Cannot open destination: " .. tostring(dst)
    end
    outFile:write(data)
    outFile:close()
    return true, nil
end

local function pluginLoad(pluginPath, relativePath)
    return dofile(LrPathUtils.child(pluginPath, relativePath))
end

local function cameraRawSettingsDir()
    local appData = LrPathUtils.getStandardFilePath("appData") or ""
    local root = appData

    local cutMac = string.find(root, "/Adobe/Lightroom", 1, true)
    if cutMac then
        root = string.sub(root, 1, cutMac - 1)
    else
        local cutWin = string.find(root, "\\Adobe\\Lightroom", 1, true)
        if cutWin then
            root = string.sub(root, 1, cutWin - 1)
        end
    end

    local p1 = LrPathUtils.child(root, "Adobe")
    local p2 = LrPathUtils.child(p1, "CameraRaw")
    return LrPathUtils.child(p2, "Settings")
end

function M.getCameraRawSettingsDir()
    return cameraRawSettingsDir()
end

function M.collectPresetEntries(pluginPath, config, options)
    local entries = {}
    local seen = {}

    local function append(preset)
        if type(preset) ~= "table" then
            return
        end
        local xmpFile = tostring(preset.xmpFile or "")
        if xmpFile == "" or seen[xmpFile] then
            return
        end
        seen[xmpFile] = true
        entries[#entries + 1] = preset
    end

    for _, preset in ipairs((config and config.modularPresets) or {}) do
        append(preset)
    end

    local colorCatalog = pluginLoad(pluginPath, "lib/ColorSystemCatalog.lua")
    for _, preset in ipairs(colorCatalog.collectPresetEntries(pluginPath, options)) do
        append(preset)
    end

    table.sort(entries, function(a, b)
        return tostring(a.xmpFile or "") < tostring(b.xmpFile or "")
    end)

    return entries
end

function M.installPresetEntries(pluginPath, presets)
    local result = {
        target = cameraRawSettingsDir(),
        installed = 0,
        skipped = 0,
        missing = 0,
        errors = 0,
        total = 0,
    }

    LrFileUtils.createAllDirectories(result.target)

    result.total = #(presets or {})
    for _, preset in ipairs(presets) do
        local xmpFile = preset.xmpFile
        if xmpFile and xmpFile ~= "" then
            local src = LrPathUtils.child(pluginPath, xmpFile)
            local relative = string.gsub(xmpFile, "^profiles/modular[/\\]", "")
            local dst = LrPathUtils.child(result.target, relative)

            if not LrFileUtils.exists(src) then
                result.missing = result.missing + 1
            elseif LrFileUtils.exists(dst) then
                result.skipped = result.skipped + 1
            else
                local dstDir = LrPathUtils.parent(dst)
                if dstDir and dstDir ~= "" then
                    LrFileUtils.createAllDirectories(dstDir)
                end

                local ok = copyBinary(src, dst)
                if ok then
                    result.installed = result.installed + 1
                else
                    result.errors = result.errors + 1
                end
            end
        end
    end

    return result
end

function M.installModularPresets(pluginPath, config, options)
    local presets = M.collectPresetEntries(pluginPath, config, options)
    return M.installPresetEntries(pluginPath, presets)
end

return M
