/**
 * Szkielet „engine-first”: przyszłe Wasm SIMD / Halide-style pixel pipe poza głównym wątkiem JS.
 * Tu tylko punkty zaczepienia — brak binariów w repo.
 *
 * OPFS synchroniczny I/O w workerze: `src/filmLab/opfs/filmLabOpfsWorkerRead.js`.
 * Spójność interakcji Develop (predykaty pod przyszły model więzów): `src/filmLab/filmLabDevelopInteractionKinds.js`.
 * Klucz klatki host (`session:asset:renderVersion`): `src/filmLab/filmLabPreviewFrameCoherence.js`.
 * Damage podglądu (WebGL fast path): `fastPreviewConstants` — `resolveFastPreviewDamageNormRect`,
 * `inferFastPreviewDamageScopeFromInteractionKind`, `FAST_PREVIEW_DAMAGE_SCOPE_*`.
 */

/** @returns {boolean} */
export function wasmSimdPixelPipelineSupported() {
  return typeof WebAssembly !== 'undefined';
}

/**
 * Rezerwacja na `(await WebAssembly.instantiateStreaming(...))` lub Worker z Wasm.
 * @returns {Promise<{ ok: boolean }>}
 */
export async function initWasmPixelBridge() {
  return { ok: false };
}
