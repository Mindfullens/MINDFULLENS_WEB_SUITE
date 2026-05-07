local LrDialogs = import "LrDialogs"
local LrPathUtils = import "LrPathUtils"
local LrTasks = import "LrTasks"

local pluginParent = LrPathUtils.parent(_PLUGIN.path)
local repoRoot = pluginParent and LrPathUtils.parent(pluginParent)
local IMPORTER = repoRoot and LrPathUtils.child(repoRoot, "dcp_pipeline/tools/import_color_systems.py")

LrTasks.startAsyncTask(function()
    if not IMPORTER then
        LrDialogs.message(
            "MindfulLens — Auto-Sync failed",
            "Cannot resolve repository root from the current plugin path.",
            "critical"
        )
        return
    end
    local command = string.format('/usr/bin/python3 "%s"', IMPORTER)
    local status = LrTasks.execute(command)

    if status == 0 then
        LrDialogs.message(
            "MindfulLens — Auto-Sync complete",
            "Color-system XMP packs were rebuilt. Reopen Step 1 if it was already open.",
            "info"
        )
    else
        LrDialogs.message(
            "MindfulLens — Auto-Sync failed",
            "Importer returned status " .. tostring(status) .. ".",
            "critical"
        )
    end
end)
