/**
 * Metadane ścieżki szybkiego podglądu (główny wątek). Wejście obrazu: `texImage2D` LDR 8 b/k.
 * Przy WebGL2 + FBO `rgba16f` atlas LUT/look może być `RGBA16F` + `HALF_FLOAT` (telemetria: `fastPreviewLutAtlasTexFormat`).
 * Sonda FBO: `webgl2Rgba16fFboProbe.js` — ten sam plik w workerze `proxyGpuRenderer` (§5.1.1.1).
 */
export const FAST_PREVIEW_MAIN_THREAD_SOURCE_TEX_FORMAT = 'rgba8';
