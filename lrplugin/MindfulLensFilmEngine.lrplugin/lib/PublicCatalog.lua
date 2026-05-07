local M = {}

M.catalogVersion = 2
M.catalogCodename = "Analog Memory"

local function listToMap(ids, value)
    local mapped = {}
    for _, id in ipairs(ids or {}) do
        mapped[id] = value
    end
    return mapped
end

local function mergeInto(target, source)
    for key, value in pairs(source or {}) do
        target[key] = value
    end
    return target
end

local PUBLIC_LABELS = {
    portra_160 = "Portrait Soft 160",
    portra_400 = "Portrait Neutral 400",
    portra_800 = "Portrait Night 800",
    gold_200 = "Golden Hour 200",
    colorplus_200 = "Color Story 200",
    ektar_100 = "Vivid Color 100",
    ultramax_400 = "Everyday Color 400",
    ektachrome = "Daylight Chrome",
    cinestill_800t = "Neon Tungsten 800",
    cinestill_50d = "Neon Daylight 50",
    fuji_400h = "Pastel Portrait 400",
    fuji_superia_400 = "Street Color 400",
    fuji_natura_1600 = "Nature Night 1600",
    fuji_superia_1600 = "Street Night 1600",
    fuji_velvia_50 = "Velvet Slide 50",
    fuji_astia_100f = "Soft Slide 100F",
    fuji_provia_100f = "Neutral Slide 100F",
    fuji_provia_rx = "Neutral Slide RX",
    fuji_fortia_50 = "Color Forte 50",
    vision3_50d = "Cinema Day 50",
    vision3_250d = "Cinema Day 250",
    vision3_200t = "Cinema Tungsten 200",
    vision3_200t_plus = "Cinema Tungsten 200+",
    vision3_500t = "Cinema Tungsten 500",
    kodachrome_25 = "Archive Chrome 25",
    kodachrome_64 = "Archive Chrome 64",
    kodak_oktar = "Clean Color 100",
    agfa_precisa = "Alpine Chrome",
    redscale_ultra = "Amber Reverse",
    harman_phoenix = "Ember Color",
    gaf_500 = "Retro Color 500",
    eastman_cn_ii_100 = "Studio Negative 100",
    kodak_solara_100 = "Sun Color 100",
    bw_trix_400 = "Reporter Mono 400",
    bw_trix_1600 = "Reporter Mono 1600",
    bw_xp2 = "Mono C-41",
    bw_tmax_400 = "T-Grain Mono 400",
    bw_tmax_100 = "T-Grain Mono 100",
    bw_foma_100 = "Classic Mono 100",
    bw_arista_edu_100 = "Student Mono 100",
    bw_hp5 = "Street Mono 400",
    bw_delta_3200 = "Delta Night 3200",
    bw_kosmo_pan = "Cosmic Mono",
    bw_vision = "Cinema Mono",
    bw_foma_400 = "Classic Mono 400",
    bw_delta_100 = "Delta Clean 100",
    sony_standard_cl = "Clean Standard",
    vektro100 = "Vektro 100",
    senova_light = "Senova Light",
    evproplus = "EV Pro Plus",
    kodak_gold_v1 = "Golden Print I",
    kodak_gold_v2 = "Golden Print II",
    kodachrome_v1 = "Archive Tone I",
    kodachrome_v2 = "Archive Tone II",
    kodachrome_v3 = "Archive Tone III",
    leicachrome = "Gallery Chrome",
    velvia_pro = "Velvet Pro",
    classic_chrome = "Classic Chrome",
    pro_neg_std = "Pro Negative Soft",
    sony_classic_negative = "Classic Negative",
    fuji_nostalgic_neg = "Nostalgic Negative",
    fuji_eterna = "Cinema Pastel",
    sony_eterna = "Soft Cinema",
    acros_x = "Silver Mono N",
    acros_xy = "Silver Mono Y",
    acros_xr = "Silver Mono R",
    acros_xg = "Silver Mono G",
    sony_nostalgic_neg = "Nostalgic Color",
    classic_cinema = "Classic Cinema",
    oktar = "Oktar",
    zero_mute = "Zero Mute",
    cinechrome = "CineChrome",
    procolor = "ProColor",
    blue_velvet_cinestill_50d = "Blue Velvet Day 50",
    cinestill_800 = "Midnight Cinema 800",
    cinestill_x = "Cinema Echo X",
    chroma_fade = "Chroma Fade",
    neo_max = "Neo Max",
    midred_infra = "MidRed Infra",
    dreamneg = "DreamNeg",
    zetra_100 = "Zetra 100",
    rose_spectra = "Rose Spectra",
    asteroid_city_kodak_vision_t200_v1 = "Desert Cinema V1",
    asteroid_city_kodak_vision_t200_v2 = "Desert Cinema V2",
    ayon_200 = "Ayon 200",
    phoenix_harman = "Phoenix Ember",
    phenomena = "Phenomena",
    crimson = "Crimson",
    acidnom = "Acidnom",
    estra_500 = "Estra 500",
    x_tarr = "X-Tarr",
    magic_spice = "Magic Spice",
    amarelo_30d = "Amarelo 30D",
    vespera = "Vespera",
    veniliqum = "Veniliqum",
    gold_luxe = "Gold Luxe",
    fuji_400h_cc = "Pastel Portrait 400",
    ektar_100_cc = "Vivid Color 100",
    kodak_color_plus_200_cc = "Color Story 200",
    ektachrome_cc = "Daylight Chrome",
    fuji_provia_cc = "Neutral Slide 100F",
    provia_rx_cc = "Neutral Slide RX",
    astia_cc = "Soft Slide 100F",
    fortia_50_cc = "Color Forte 50",
    tmax100_cc = "T-Grain Mono 100",
    delta_3200_cc = "Delta Night 3200",
    ilford_hp5_cc = "Street Mono 400",
    redscale_ultra_cc = "Amber Reverse",
    solara_100_cc = "Sun Color 100",
}

local CATEGORY_ORDER = {
    "portrait_skin",
    "golden_hour",
    "landscape_travel",
    "night_city",
    "documentary_street",
    "cinema_storytelling",
    "studio_fineart",
    "vintage_lofi",
    "experimental",
}

local CATEGORY_META = {
    portrait_skin = {
        title = "Portret i Skora",
        prefix = "PORTRET | ",
        code = "POR",
        short = "Subtelne tony skory, miekkie przejscia i spokojny kontrast.",
    },
    golden_hour = {
        title = "Zlota Godzina",
        prefix = "ZLOTA GODZINA | ",
        code = "ZG",
        short = "Cieple swiatlo, nostalgia i sloneczny charakter kadru.",
    },
    landscape_travel = {
        title = "Krajobraz i Podroze",
        prefix = "KRAJOBRAZ | ",
        code = "KRA",
        short = "Nasycone niebo, zielen i detal do natury oraz podrozy.",
    },
    night_city = {
        title = "Noc i Miasto",
        prefix = "NOC | ",
        code = "NOC",
        short = "Sztuczne swiatlo, neony, tungsten i wysoka czulosc.",
    },
    documentary_street = {
        title = "Reportaz i Ulica",
        prefix = "REPORTAZ | ",
        code = "REP",
        short = "Surowosc, rytm miasta i elastycznosc codziennego dokumentu.",
    },
    cinema_storytelling = {
        title = "Kino i Storytelling",
        prefix = "KINO | ",
        code = "KIN",
        short = "Szeroka tonacja i filmowy przebieg koloru pod opowiesc.",
    },
    studio_fineart = {
        title = "Studio i Fine-Art",
        prefix = "FINE-ART | ",
        code = "FA",
        short = "Precyzja, spokoj, czysta forma i kontrola tonalna.",
    },
    vintage_lofi = {
        title = "Vintage i Lo-Fi",
        prefix = "VINTAGE | ",
        code = "VIN",
        short = "Retro chemia, nostalgia i celowo starszy charakter obrazu.",
    },
    experimental = {
        title = "Eksperymentalne",
        prefix = "EKSPERYMENT | ",
        code = "EXP",
        short = "Niestandardowa paleta, efekty specjalne i autorskie odchylenia.",
    },
}

local EMULSION_CATEGORY_BY_ID = {}

mergeInto(EMULSION_CATEGORY_BY_ID, listToMap({
    "portra_160",
    "portra_400",
    "fuji_400h",
    "fuji_astia_100f",
    "cinechrome",
    "evproplus",
    "senova_light",
    "veniliqum",
    "pro_neg_std",
    "fuji_400h_cc",
    "astia_cc",
}, "portrait_skin"))

mergeInto(EMULSION_CATEGORY_BY_ID, listToMap({
    "gold_200",
    "colorplus_200",
    "kodak_solara_100",
    "ultramax_400",
    "kodak_gold_v1",
    "kodak_gold_v2",
    "gold_luxe",
    "amarelo_30d",
    "magic_spice",
    "ayon_200",
    "kodak_color_plus_200_cc",
    "solara_100_cc",
}, "golden_hour"))

mergeInto(EMULSION_CATEGORY_BY_ID, listToMap({
    "ektar_100",
    "ektachrome",
    "fuji_velvia_50",
    "fuji_provia_100f",
    "fuji_provia_rx",
    "fuji_fortia_50",
    "agfa_precisa",
    "velvia_pro",
    "kodak_oktar",
    "oktar",
    "vektro100",
    "zetra_100",
    "procolor",
    "ektar_100_cc",
    "ektachrome_cc",
    "fuji_provia_cc",
    "provia_rx_cc",
    "fortia_50_cc",
}, "landscape_travel"))

mergeInto(EMULSION_CATEGORY_BY_ID, listToMap({
    "cinestill_800t",
    "cinestill_800",
    "vision3_500t",
    "vision3_200t",
    "vision3_200t_plus",
    "portra_800",
    "asteroid_city_kodak_vision_t200_v1",
    "asteroid_city_kodak_vision_t200_v2",
    "cinestill_x",
    "vespera",
}, "night_city"))

mergeInto(EMULSION_CATEGORY_BY_ID, listToMap({
    "fuji_superia_400",
    "fuji_natura_1600",
    "fuji_superia_1600",
    "bw_trix_400",
    "bw_hp5",
    "bw_foma_400",
    "bw_tmax_400",
    "bw_xp2",
    "bw_arista_edu_100",
    "bw_kosmo_pan",
    "classic_chrome",
    "crimson",
    "x_tarr",
    "sony_classic_negative",
    "sony_standard_cl",
    "gaf_500",
    "ilford_hp5_cc",
}, "documentary_street"))

mergeInto(EMULSION_CATEGORY_BY_ID, listToMap({
    "fuji_eterna",
    "vision3_250d",
    "vision3_50d",
    "eastman_cn_ii_100",
    "sony_eterna",
    "classic_cinema",
    "cinestill_50d",
    "blue_velvet_cinestill_50d",
    "bw_vision",
}, "cinema_storytelling"))

mergeInto(EMULSION_CATEGORY_BY_ID, listToMap({
    "bw_delta_100",
    "bw_tmax_100",
    "bw_foma_100",
    "acros_x",
    "acros_xy",
    "acros_xr",
    "acros_xg",
    "zero_mute",
    "tmax100_cc",
}, "studio_fineart"))

mergeInto(EMULSION_CATEGORY_BY_ID, listToMap({
    "kodachrome_25",
    "kodachrome_64",
    "harman_phoenix",
    "phoenix_harman",
    "leicachrome",
    "kodachrome_v1",
    "kodachrome_v2",
    "kodachrome_v3",
    "fuji_nostalgic_neg",
    "sony_nostalgic_neg",
    "acidnom",
    "chroma_fade",
    "neo_max",
    "redscale_ultra",
    "redscale_ultra_cc",
}, "vintage_lofi"))

mergeInto(EMULSION_CATEGORY_BY_ID, listToMap({
    "delta_3200_cc",
    "bw_trix_1600",
    "bw_delta_3200",
    "dreamneg",
    "midred_infra",
    "rose_spectra",
    "phenomena",
    "estra_500",
}, "experimental"))

local EMULSION_TAGS_BY_ID = {
    portra_160 = { "portret", "skora", "120", "soft-skin" },
    portra_400 = { "portret", "skora", "120", "soft-skin" },
    portra_800 = { "portret", "noc", "high-iso", "soft-skin" },
    fuji_400h = { "portret", "120", "pastel" },
    fuji_astia_100f = { "portret", "slide", "soft" },
    gold_200 = { "golden-hour", "35mm", "warm" },
    colorplus_200 = { "golden-hour", "35mm", "warm" },
    ultramax_400 = { "golden-hour", "35mm", "everyday" },
    ektar_100 = { "landscape", "low-iso", "vivid" },
    ektachrome = { "landscape", "slide", "daylight" },
    fuji_velvia_50 = { "landscape", "slide", "high-saturation" },
    fuji_provia_100f = { "landscape", "slide", "neutral" },
    fuji_provia_rx = { "landscape", "slide", "blue-hour" },
    vision3_50d = { "cinema", "daylight", "blue-hour" },
    vision3_250d = { "cinema", "daylight", "storytelling" },
    vision3_200t = { "cinema", "tungsten", "night" },
    vision3_200t_plus = { "cinema", "tungsten", "night" },
    vision3_500t = { "cinema", "tungsten", "high-iso" },
    cinestill_800t = { "noc", "neon", "tungsten", "halation" },
    cinestill_800 = { "noc", "neon", "high-iso" },
    cinestill_50d = { "cinema", "daylight", "blue-hour" },
    blue_velvet_cinestill_50d = { "cinema", "blue-hour", "daylight" },
    bw_trix_400 = { "bw", "street", "reportaz" },
    bw_trix_1600 = { "bw", "high-iso", "koncert" },
    bw_hp5 = { "bw", "street", "reportaz" },
    bw_delta_3200 = { "bw", "high-iso", "koncert" },
    bw_tmax_100 = { "bw", "fine-art", "low-iso" },
    bw_delta_100 = { "bw", "fine-art", "low-iso" },
    acros_x = { "bw", "fine-art", "acros" },
    acros_xy = { "bw", "fine-art", "acros", "yellow-filter" },
    acros_xr = { "bw", "fine-art", "acros", "red-filter" },
    acros_xg = { "bw", "fine-art", "acros", "green-filter" },
    classic_chrome = { "street", "document", "digital-sim" },
    sony_classic_negative = { "street", "document", "digital-sim" },
    classic_cinema = { "cinema", "storytelling", "digital-sim" },
    fuji_eterna = { "cinema", "soft", "daylight" },
    sony_eterna = { "cinema", "soft", "digital-sim" },
    fuji_nostalgic_neg = { "vintage", "warm", "digital-sim" },
    sony_nostalgic_neg = { "vintage", "warm", "digital-sim" },
    asteroid_city_kodak_vision_t200_v1 = { "cinema", "stylized", "tungsten" },
    asteroid_city_kodak_vision_t200_v2 = { "cinema", "stylized", "tungsten" },
    ayon_200 = { "warm", "stylized", "golden-hour" },
    redscale_ultra = { "experimental", "redscale", "warm" },
    midred_infra = { "experimental", "infrared", "special-effect" },
    rose_spectra = { "experimental", "special-effect", "romantic" },
    dreamneg = { "experimental", "soft", "blue-hour" },
    phenomena = { "experimental", "blue-hour", "atmospheric" },
    acidnom = { "vintage", "lo-fi", "aggressive" },
    chroma_fade = { "vintage", "fade", "retro" },
    neo_max = { "vintage", "retro", "muted" },
    vespera = { "night", "city", "stylized" },
}

local GRAIN_FAMILY_BY_ID = {}

mergeInto(GRAIN_FAMILY_BY_ID, listToMap({
    "gold_200",
    "colorplus_200",
    "ultramax_400",
    "vision3_250d",
    "vision3_200t",
    "vision3_200t_plus",
    "kodak_solara_100",
    "fuji_superia_400",
    "agfa_precisa",
    "gaf_500",
    "leicachrome",
    "sony_standard_cl",
    "sony_classic_negative",
    "kodak_gold_v1",
    "kodak_gold_v2",
    "kodachrome_v1",
    "kodachrome_v2",
    "kodachrome_v3",
    "classic_chrome",
    "pro_neg_std",
    "classic_cinema",
    "procolor",
    "neo_max",
    "asteroid_city_kodak_vision_t200_v1",
    "asteroid_city_kodak_vision_t200_v2",
    "fuji_400h_cc",
    "ektar_100_cc",
    "kodak_color_plus_200_cc",
    "ektachrome_cc",
    "fuji_provia_cc",
    "provia_rx_cc",
    "astia_cc",
    "fortia_50_cc",
    "solara_100_cc",
}, "classic_35"))

mergeInto(GRAIN_FAMILY_BY_ID, listToMap({
    "portra_160",
    "portra_400",
    "portra_800",
    "fuji_400h",
    "fuji_eterna",
    "sony_eterna",
    "cinechrome",
}, "medium_cream"))

mergeInto(GRAIN_FAMILY_BY_ID, listToMap({
    "bw_trix_400",
    "bw_trix_1600",
    "bw_xp2",
    "bw_tmax_400",
    "bw_foma_100",
    "bw_arista_edu_100",
    "bw_hp5",
    "bw_delta_3200",
    "bw_kosmo_pan",
    "bw_vision",
    "bw_foma_400",
    "acros_x",
    "acros_xy",
    "acros_xr",
    "acros_xg",
    "vision3_500t",
    "fuji_natura_1600",
    "fuji_superia_1600",
    "cinestill_800t",
    "cinestill_800",
    "cinestill_x",
    "crimson",
    "estra_500",
    "midred_infra",
    "tmax100_cc",
    "delta_3200_cc",
    "ilford_hp5_cc",
}, "bw_push"))

mergeInto(GRAIN_FAMILY_BY_ID, listToMap({
    "harman_phoenix",
    "phoenix_harman",
    "acidnom",
    "magic_spice",
    "redscale_ultra",
    "redscale_ultra_cc",
    "chroma_fade",
}, "disposable_lofi"))

mergeInto(GRAIN_FAMILY_BY_ID, listToMap({
    "ektar_100",
    "ektachrome",
    "vision3_50d",
    "kodachrome_25",
    "kodachrome_64",
    "kodak_oktar",
    "eastman_cn_ii_100",
    "bw_tmax_100",
    "bw_delta_100",
    "fuji_velvia_50",
    "fuji_astia_100f",
    "fuji_provia_100f",
    "fuji_provia_rx",
    "fuji_fortia_50",
    "fuji_nostalgic_neg",
    "cinestill_50d",
    "blue_velvet_cinestill_50d",
    "sony_nostalgic_neg",
    "vektro100",
    "senova_light",
    "evproplus",
    "velvia_pro",
    "oktar",
    "zero_mute",
    "dreamneg",
    "zetra_100",
    "rose_spectra",
    "ayon_200",
    "phenomena",
    "amarelo_30d",
    "vespera",
    "veniliqum",
    "gold_luxe",
    "x_tarr",
}, "low_iso_smooth"))

local GRAIN_SPECS = {
    classic_35 = {
        amount = { 40, 50 },
        size = { 30, 40 },
        rough = { 48, 58 },
        weight = 0.74,
    },
    medium_cream = {
        amount = { 16, 24 },
        size = { 42, 50 },
        rough = { 26, 34 },
        weight = 0.78,
    },
    medium_portrait_35 = {
        amount = { 24, 32 },
        size = { 34, 42 },
        rough = { 34, 42 },
        weight = 0.76,
    },
    bw_push = {
        amount = { 52, 68 },
        size = { 50, 60 },
        rough = { 70, 80 },
        weight = 0.84,
    },
    disposable_lofi = {
        amount = { 60, 78 },
        size = { 15, 25 },
        rough = { 62, 76 },
        weight = 0.86,
    },
    low_iso_smooth = {
        amount = { 15, 26 },
        size = { 22, 34 },
        rough = { 42, 56 },
        weight = 0.74,
    },
}

local FORMAT_OFFSETS = {
    ["35mm"] = { amount = 1, size = 0, rough = 1 },
    ["mf_120"] = { amount = -1, size = 2, rough = -2 },
    ["lf_4x5"] = { amount = -3, size = 4, rough = -5 },
    ["lf_8x10"] = { amount = -4, size = 5, rough = -6 },
}

local SOURCE_SCALE_OFFSETS = {
    auto = { amount = 0, size = 0, rough = 0 },
    full_frame = { amount = 0, size = 0, rough = 0 },
    aps_c = { amount = 0, size = -1, rough = -1 },
    micro_four_thirds = { amount = -1, size = -2, rough = -2 },
    compact_small = { amount = -2, size = -3, rough = -3 },
    digital_mf = { amount = 1, size = 1, rough = -1 },
}

function M.getPublicLabel(emulsionId, fallbackLabel)
    return PUBLIC_LABELS[emulsionId] or PUBLIC_LABELS[tostring(emulsionId or ""):gsub("_cc$", "")] or fallbackLabel
end

function M.getClientFacingLabel(emulsionId, legacyLabel, fallbackLabel)
    local referenceLabel = tostring(legacyLabel or fallbackLabel or "")
    if referenceLabel == "" then
        return M.getPublicLabel(emulsionId, fallbackLabel)
    end
    return referenceLabel .. " — interpretacja MindfulLens"
end

function M.getCategoryOrder()
    return CATEGORY_ORDER
end

function M.getCategoryMeta(categoryId)
    return CATEGORY_META[tostring(categoryId or "")] or CATEGORY_META.experimental
end

function M.getCategoryId(emulsionId, emulsionType, isBw)
    local emId = tostring(emulsionId or ""):gsub("_cc$", "")
    local mapped = EMULSION_CATEGORY_BY_ID[emId]
    if mapped then
        return mapped
    end
    if isBw then
        return "documentary_street"
    end
    if tostring(emulsionType or "") == "color_positive" then
        return "landscape_travel"
    end
    return "experimental"
end

function M.getCategoryPrefix(categoryId)
    local meta = M.getCategoryMeta(categoryId)
    return tostring(meta.prefix or "")
end

function M.getCategoryCode(categoryId)
    local meta = M.getCategoryMeta(categoryId)
    return tostring(meta.code or "EXP")
end

function M.getTags(emulsionId, emulsionType, isBw)
    local emId = tostring(emulsionId or ""):gsub("_cc$", "")
    local tags = {}
    local seen = {}

    local function add(tag)
        local normalized = tostring(tag or "")
        if normalized ~= "" and not seen[normalized] then
            seen[normalized] = true
            tags[#tags + 1] = normalized
        end
    end

    for _, tag in ipairs(EMULSION_TAGS_BY_ID[emId] or {}) do
        add(tag)
    end
    add(M.getCategoryId(emId, emulsionType, isBw))
    if isBw then
        add("bw")
    end
    if tostring(emulsionType or "") == "color_positive" then
        add("slide")
    end
    return tags
end

function M.getGrainFamily(emulsionId, emulsionType, formatId, isBw)
    local emId = tostring(emulsionId or ""):gsub("_cc$", "")
    local family = GRAIN_FAMILY_BY_ID[emId]
    if family == "medium_cream" and tostring(formatId or "") == "35mm" then
        return "medium_portrait_35"
    end
    if family then
        return family
    end
    if isBw then
        return "bw_push"
    end
    if tostring(emulsionType or "") == "color_positive" then
        return "low_iso_smooth"
    end
    return "classic_35"
end

function M.getGrainSpec(familyId)
    return GRAIN_SPECS[familyId] or GRAIN_SPECS.classic_35
end

function M.getFormatOffsets(formatId)
    return FORMAT_OFFSETS[tostring(formatId or "")] or { amount = 0, size = 0, rough = 0 }
end

function M.getSourceScaleOffsets(sourceScaleId)
    return SOURCE_SCALE_OFFSETS[tostring(sourceScaleId or "")] or SOURCE_SCALE_OFFSETS.auto
end

return M
