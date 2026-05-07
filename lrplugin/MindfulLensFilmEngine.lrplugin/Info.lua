local MENU_ITEMS = {
    {
        title = "1) Panel I — Ingest i kalibracja (Przygotowanie i inwersja)",
        file = "FilmEngineMenu.lua",
    },
    {
        title = "2) Panel II — Charakter Ciemni i Soft Clip (LIVE)",
        file = "PanelIIMenu.lua",
    },
    {
        title = "3) Panel III — Sensytometria i H&D",
        file = "PanelIIIMenu.lua",
    },
    {
        title = "4) Panel IV — Morfologia Ziarna i Generator Srebra",
        file = "PanelIVMenu.lua",
    },
    {
        title = "5) Panel V — Komora Halacji, Powierzchnia i Defekty Analogowe",
        file = "PanelVIMenu.lua",
    },
    {
        title = "6) Panel V — Optyka Odbitki (Polysk + Winieta)",
        file = "PanelVOpticsMenu.lua",
    },
    {
        title = "7) Panel VII — Matryca Barw: Kreacyjne Emulsje Specjalne",
        file = "PanelVIIMenu.lua",
    },
    {
        title = "8) Panel VIII — Glebia Subtraktywna i Kinematografia",
        file = "PanelVIIIMenu.lua",
    },
    {
        title = "9) Panel IX — Chemia, Klimat i Epoki",
        file = "PanelIXMenu.lua",
    },
    {
        title = "Instalacja — Profile DCP",
        file = "InstallProfilesMenu.lua",
    },
    {
        title = "Instalacja — Presety Modularne XMP",
        file = "InstallModularPresetsMenu.lua",
    },
    {
        title = "Serwis — Raport Unikalnosci Assetow",
        file = "AssetReportMenu.lua",
    },
    {
        title = "Serwis — Synchronizacja Systemow Koloru",
        file = "SyncColorSystemsMenu.lua",
    },
    {
        title = "Serwis — Kontrola Integralnosci",
        file = "SystemHealthMenu.lua",
    },
}

return {
    LrSdkVersion = 12.0,
    LrSdkMinimumVersion = 6.0,
    LrToolkitIdentifier = "com.mindfullens.filmengine",
    LrPluginName = "Analog Signature",

    VERSION = {
        major = 0,
        minor = 2,
        revision = 1,
        build = 2,
    },

    LrInitPlugin = "PluginInit.lua",

    -- Keep export menu for legacy entrypoint, but also expose the workflow under Plug-in Extras,
    -- which is where users typically look for panel-style tools.
    LrExportMenuItems = MENU_ITEMS,
    LrLibraryMenuItems = MENU_ITEMS,
    LrDevelopMenuItems = MENU_ITEMS,
}
