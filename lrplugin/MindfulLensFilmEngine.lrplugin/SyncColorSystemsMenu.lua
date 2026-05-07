local LrDialogs = import "LrDialogs"
local LrPathUtils = import "LrPathUtils"
local LrTasks = import "LrTasks"

local pluginParent = LrPathUtils.parent(_PLUGIN.path)
local repoRoot = pluginParent and LrPathUtils.parent(pluginParent)
local IMPORTER = repoRoot and LrPathUtils.child(repoRoot, "dcp_pipeline/tools/import_color_systems.py")

LrTasks.startAsyncTask(function()
    if not IMPORTER then
        LrDialogs.message(
            "Analog Signature — synchronizacja",
            "Nie znaleziono katalogu repozytorium względem ścieżki wtyczki (oczekiwany import_color_systems.py). Ta opcja działa tylko w środowisku deweloperskim.",
            "critical"
        )
        return
    end
    local command = string.format('/usr/bin/python3 "%s"', IMPORTER)
    local status = LrTasks.execute(command)

    if status == 0 then
        LrDialogs.message(
            "Analog Signature — synchronizacja",
            "Pakiety XMP systemów koloru zostały przebudowane. Jeśli krok 1 był otwarty, zamknij i otwórz ponownie.",
            "info"
        )
    else
        LrDialogs.message(
            "Analog Signature — synchronizacja",
            "Importer zwrócił kod " .. tostring(status) .. ". Sprawdź log w terminalu / skrypt import_color_systems.py.",
            "critical"
        )
    end
end)
