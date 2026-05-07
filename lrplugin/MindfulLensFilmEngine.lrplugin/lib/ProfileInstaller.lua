local LrFileUtils = import "LrFileUtils"
local LrPathUtils = import "LrPathUtils"

local M = {}

local function listDcpFiles(pluginPath)
    local dcpDir = LrPathUtils.child(pluginPath, "profiles/dcp")
    local files = {}
    local iter = LrFileUtils.directoryEntries(dcpDir)
    if iter then
        for entry in iter do
            if not string.match(entry, "/%._") and string.match(entry, "%.dcp$") then
                table.insert(files, LrPathUtils.leafName(entry))
            end
        end
    end
    return files
end

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

local function filesEqual(src, dst)
    local srcFile = io.open(src, "rb")
    if not srcFile then
        return false
    end
    local dstFile = io.open(dst, "rb")
    if not dstFile then
        srcFile:close()
        return false
    end

    local same = true
    while true do
        local srcChunk = srcFile:read(65536)
        local dstChunk = dstFile:read(65536)
        if srcChunk ~= dstChunk then
            same = false
            break
        end
        if srcChunk == nil then
            break
        end
    end

    srcFile:close()
    dstFile:close()
    return same
end

local function cameraProfilesDir()
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
    return LrPathUtils.child(p2, "CameraProfiles")
end

local function cameraRawDir()
    return LrPathUtils.parent(cameraProfilesDir())
end

local function settingsDir()
    return LrPathUtils.child(cameraRawDir(), "Settings")
end

local function normalizeId(value)
    if not value then
        return ""
    end
    local text = tostring(value):upper()
    text = text:gsub("[^%w]", "")
    return text
end

local function splitFallbackLabel(label)
    if not label then
        return nil, nil
    end
    local make, model = tostring(label):match("^%s*(%S+)%s+(.+)$")
    return make, model
end

local function stripExtension(name)
    return tostring(name or ""):gsub("%.[^%.]+$", "")
end

local function stripSuffixMarkers(modelNorm)
    local text = modelNorm or ""
    text = text:gsub("MARK[IVX]+$", "")
    text = text:gsub("MK[IVX]+$", "")
    text = text:gsub("MARK%d+$", "")
    text = text:gsub("%d+$", "")
    return text
end

local function deriveFamilyCandidates(cameraModel)
    local raw = normalizeId(cameraModel)
    if raw == "" then
        return {}
    end
    local family = stripSuffixMarkers(raw)
    if family ~= "" and family ~= raw then
        return { family, raw }
    end
    return { raw }
end

local function walkDirectory(root, onFile)
    if not root or root == "" or not LrFileUtils.exists(root) then
        return
    end

    local iter = LrFileUtils.directoryEntries(root)
    if not iter then
        return
    end

    for entry in iter do
        local leaf = LrPathUtils.leafName(entry)
        if leaf ~= "." and leaf ~= ".." then
            local childIter = LrFileUtils.directoryEntries(entry)
            if childIter then
                walkDirectory(entry, onFile)
            else
                onFile(entry, leaf)
            end
        end
    end
end

local function isLegacyMindfulLensCameraSpecificDcp(leaf)
    local name = tostring(leaf or "")
    return string.match(name, "^AI_KM_.+__.+%.dcp$") ~= nil
end

local function inspectLegacyCameraSpecificProfiles()
    local cameraDir = LrPathUtils.child(cameraProfilesDir(), "Camera")
    local matches = {}
    walkDirectory(cameraDir, function(entry, leaf)
        if isLegacyMindfulLensCameraSpecificDcp(leaf) then
            matches[#matches + 1] = entry
        end
    end)
    table.sort(matches)
    return {
        root = cameraDir,
        count = #matches,
        matches = matches,
    }
end

local function removeLegacyCameraSpecificProfiles()
    local inspection = inspectLegacyCameraSpecificProfiles()
    local removed = 0
    local errors = 0
    for _, path in ipairs(inspection.matches) do
        local ok = LrFileUtils.delete(path)
        if ok then
            removed = removed + 1
        else
            errors = errors + 1
        end
    end
    return {
        root = inspection.root,
        found = inspection.count,
        removed = removed,
        errors = errors,
        matches = inspection.matches,
    }
end

local function purgeAdobeProfileCaches()
    local result = {
        deleted = 0,
        errors = 0,
        deletedPaths = {},
    }

    local profileIndex = LrPathUtils.child(cameraProfilesDir(), "Index2.dat")
    if LrFileUtils.exists(profileIndex) then
        if LrFileUtils.delete(profileIndex) then
            result.deleted = result.deleted + 1
            result.deletedPaths[#result.deletedPaths + 1] = profileIndex
        else
            result.errors = result.errors + 1
        end
    end

    walkDirectory(settingsDir(), function(entry, leaf)
        if string.match(tostring(leaf or ""), "^Index_.*%.dat$") then
            if LrFileUtils.delete(entry) then
                result.deleted = result.deleted + 1
                result.deletedPaths[#result.deletedPaths + 1] = entry
            else
                result.errors = result.errors + 1
            end
        end
    end)

    return result
end

local installSurfaceMemo = nil

local function ensureCleanInstallSurface()
    if installSurfaceMemo then
        return installSurfaceMemo
    end

    local cleanup = removeLegacyCameraSpecificProfiles()
    local cache = {
        deleted = 0,
        errors = 0,
        deletedPaths = {},
    }
    if cleanup.removed > 0 then
        cache = purgeAdobeProfileCaches()
    end

    installSurfaceMemo = {
        legacyRoot = cleanup.root,
        legacyFound = cleanup.found,
        legacyRemoved = cleanup.removed,
        legacyErrors = cleanup.errors,
        cachesDeleted = cache.deleted,
        cacheErrors = cache.errors,
        cachePaths = cache.deletedPaths,
    }
    return installSurfaceMemo
end

local function listCameraSpecificForBase(pluginPath, dcpFile)
    local dcpDir = LrPathUtils.child(pluginPath, "profiles/dcp")
    local iter = LrFileUtils.directoryEntries(dcpDir)
    if not iter then
        return {}
    end
    local base = stripExtension(LrPathUtils.leafName(dcpFile))
    local baseNorm = normalizeId(base)
    local results = {}
    for entry in iter do
        local leaf = LrPathUtils.leafName(entry)
        local leafNorm = normalizeId(leaf)
        if baseNorm ~= "" and string.find(leafNorm, baseNorm .. "__", 1, true) then
            local suffix = stripExtension(leaf):sub(#base + 3)
            table.insert(results, { leaf = leaf, suffix = suffix, suffixNorm = normalizeId(suffix) })
        end
    end
    return results
end

local function findFamilyFallback(pluginPath, dcpFile, cameraMake, cameraModel)
    local candidates = listCameraSpecificForBase(pluginPath, dcpFile)
    if #candidates == 0 then
        return nil
    end
    local makeNorm = normalizeId(cameraMake)
    local families = deriveFamilyCandidates(cameraModel)
    local best = nil
    local bestScore = -1
    for _, entry in ipairs(candidates) do
        local score = 0
        if makeNorm ~= "" and string.find(entry.suffixNorm, makeNorm, 1, true) then
            score = score + 1
        end
        for _, fam in ipairs(families) do
            if fam ~= "" and string.find(entry.suffixNorm, fam, 1, true) then
                score = score + 2
                break
            end
        end
        if score > bestScore then
            bestScore = score
            best = entry.leaf
        end
    end
    if bestScore <= 0 then
        return nil
    end
    return best
end

local function findCameraSpecificDcp(pluginPath, dcpFile, cameraMake, cameraModel)
    if not pluginPath or not dcpFile then
        return nil
    end
    local dcpDir = LrPathUtils.child(pluginPath, "profiles/dcp")
    local iter = LrFileUtils.directoryEntries(dcpDir)
    if not iter then
        return nil
    end

    local base = stripExtension(LrPathUtils.leafName(dcpFile))
    local baseNorm = normalizeId(base)
    local modelNorm = normalizeId(cameraModel)
    local makeNorm = normalizeId(cameraMake)
    local combinedNorm = normalizeId((cameraMake or "") .. (cameraModel or ""))

    local best = nil
    local bestScore = -1
    for entry in iter do
        local leaf = LrPathUtils.leafName(entry)
        if string.match(leaf, "^" .. base .. "__.+%.dcp$") then
            local suffix = stripExtension(leaf):sub(#base + 3)
            local suffixNorm = normalizeId(suffix)
            local score = 0
            if modelNorm ~= "" and string.find(suffixNorm, modelNorm, 1, true) then
                score = score + 3
            end
            if combinedNorm ~= "" and string.find(suffixNorm, combinedNorm, 1, true) then
                score = score + 2
            end
            if makeNorm ~= "" and string.find(suffixNorm, makeNorm, 1, true) then
                score = score + 1
            end
            if score > bestScore then
                bestScore = score
                best = leaf
            end
        elseif baseNorm ~= "" then
            local leafNorm = normalizeId(leaf)
            if string.find(leafNorm, baseNorm .. "__", 1, true) then
                local suffixNorm = leafNorm:sub(string.find(leafNorm, baseNorm .. "__", 1, true) + #baseNorm + 2)
                local score = 0
                if modelNorm ~= "" and string.find(suffixNorm, modelNorm, 1, true) then
                    score = score + 3
                end
                if combinedNorm ~= "" and string.find(suffixNorm, combinedNorm, 1, true) then
                    score = score + 2
                end
                if makeNorm ~= "" and string.find(suffixNorm, makeNorm, 1, true) then
                    score = score + 1
                end
                if score > bestScore then
                    bestScore = score
                    best = leaf
                end
            end
        end
    end

    if bestScore <= 0 then
        return nil
    end
    return best
end

function M.getCameraProfilesDir()
    return cameraProfilesDir()
end

function M.listPluginDcpFiles(pluginPath)
    return listDcpFiles(pluginPath)
end

function M.inspectLegacyCameraSpecificProfiles()
    return inspectLegacyCameraSpecificProfiles()
end

function M.installDcpProfiles(pluginPath, config)
    local surface = ensureCleanInstallSurface()
    local result = {
        target = cameraProfilesDir(),
        installed = 0,
        skipped = 0,
        missing = 0,
        errors = 0,
        legacy_root = surface.legacyRoot,
        legacy_found = surface.legacyFound,
        legacy_removed = surface.legacyRemoved,
        legacy_errors = surface.legacyErrors,
        caches_deleted = surface.cachesDeleted,
        cache_errors = surface.cacheErrors,
    }

    LrFileUtils.createAllDirectories(result.target)

    local dcpFiles = nil
    if config and config.emulsions then
        dcpFiles = {}
        local seen = {}
        for _, em in ipairs(config.emulsions) do
            local dcpFile = em.dcpFile
            if dcpFile and dcpFile ~= "" and not seen[dcpFile] then
                table.insert(dcpFiles, dcpFile)
                seen[dcpFile] = true
            end
        end
    else
        dcpFiles = listDcpFiles(pluginPath)
    end

    for _, dcpFile in ipairs(dcpFiles or {}) do
        local src = LrPathUtils.child(pluginPath, "profiles/dcp/" .. dcpFile)
        local dst = LrPathUtils.child(result.target, dcpFile)

        if not LrFileUtils.exists(src) then
            result.missing = result.missing + 1
        elseif LrFileUtils.exists(dst) and filesEqual(src, dst) then
            result.skipped = result.skipped + 1
        else
            local ok = copyBinary(src, dst)
            if ok then
                result.installed = result.installed + 1
            else
                result.errors = result.errors + 1
            end
        end
    end

    return result
end

function M.installAllDcpProfiles(pluginPath)
    return M.installDcpProfiles(pluginPath, nil)
end

function M.installSingleDcp(pluginPath, dcpFile)
    if not dcpFile or dcpFile == "" then
        return false, "Missing dcpFile"
    end

    ensureCleanInstallSurface()

    local target = cameraProfilesDir()
    LrFileUtils.createAllDirectories(target)

    local src = LrPathUtils.child(pluginPath, "profiles/dcp/" .. dcpFile)
    local dst = LrPathUtils.child(target, dcpFile)

    if not LrFileUtils.exists(src) then
        return false, "Source DCP missing: " .. tostring(src)
    end
    if LrFileUtils.exists(dst) and filesEqual(src, dst) then
        return true, nil
    end
    return copyBinary(src, dst)
end

function M.findCameraSpecificDcp(pluginPath, dcpFile, cameraMake, cameraModel)
    return findCameraSpecificDcp(pluginPath, dcpFile, cameraMake, cameraModel)
end

function M.resolveCameraSpecificDcp(pluginPath, dcpFile, cameraMake, cameraModel, fallbackMap)
    local direct = findCameraSpecificDcp(pluginPath, dcpFile, cameraMake, cameraModel)
    if direct then
        return direct, nil
    end
    if not fallbackMap then
        return nil, nil
    end
    local key = normalizeId((cameraMake or "") .. " " .. (cameraModel or ""))
    local keyModel = normalizeId(cameraModel or "")
    local fallbackLabel = nil
    for rawKey, value in pairs(fallbackMap) do
        local nkey = normalizeId(rawKey)
        if nkey ~= "" and (nkey == key or nkey == keyModel) then
            fallbackLabel = value
            break
        end
    end
    if not fallbackLabel then
        local familyFallback = findFamilyFallback(pluginPath, dcpFile, cameraMake, cameraModel)
        if familyFallback then
            local fam = (deriveFamilyCandidates(cameraModel)[1] or "")
            local label = tostring(cameraMake or "") .. " " .. tostring(fam) .. " (family)"
            return familyFallback, label
        end
        return nil, nil
    end
    local fbMake, fbModel = splitFallbackLabel(fallbackLabel)
    local fallback = findCameraSpecificDcp(pluginPath, dcpFile, fbMake, fbModel)
    if fallback then
        return fallback, fallbackLabel
    end
    return nil, nil
end

return M
