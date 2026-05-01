/**
 * Docelowe KPI produktu (Film Lab / HME) — wartości referencyjne dla release GO/NO-GO.
 * Patrz `docs/hme/NORTH-STAR.md` (Runtime i wydajność). Nie są automatycznie egzekwowane w runtime.
 */

/** Docelowy czas reakcji suwaka (interaktywny podgląd), ms */
export const FILM_LAB_KPI_SLIDER_LATENCY_MS_TARGET = 16;

/** Docelowy czas inferencji maski AI (lokalnie), ms */
export const FILM_LAB_KPI_AI_MASK_LATENCY_MS_TARGET = 1500;

/** Docelowy crash-free rate (sesje / telemetry — poza silnikiem), % */
export const FILM_LAB_KPI_CRASH_FREE_TARGET_PCT = 99.5;

/** Referencyjny rozmiar wejścia dla dyskusji OOM (45 MP), megapiksele */
export const FILM_LAB_KPI_REFERENCE_MEGAPIXELS = 45;
