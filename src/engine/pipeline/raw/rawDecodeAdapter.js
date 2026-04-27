/**
 * Etap 2A — adapter warstwy dekodowania RAW.
 *
 * Dziś: `http-bridge` (fetch do `__raw/decode` jak dotychczas).
 * `libraw-wasm` — LibRaw w WASM (`rawDecodeLibrawWasm.js`, pakiet `libraw-wasm`).
 *
 * Konfiguracja: `VITE_FILMLAB_RAW_DECODE_ADAPTER` = `http-bridge` | `libraw-wasm` (alias: `libraw_wasm`).
 */

export const RAW_DECODE_ADAPTER_HTTP_BRIDGE = 'http-bridge';
export const RAW_DECODE_ADAPTER_LIBRAW_WASM = 'libraw-wasm';

const ADAPTER_ALIASES = new Map([
  ['http-bridge', RAW_DECODE_ADAPTER_HTTP_BRIDGE],
  ['http_bridge', RAW_DECODE_ADAPTER_HTTP_BRIDGE],
  ['bridge', RAW_DECODE_ADAPTER_HTTP_BRIDGE],
  ['libraw-wasm', RAW_DECODE_ADAPTER_LIBRAW_WASM],
  ['libraw_wasm', RAW_DECODE_ADAPTER_LIBRAW_WASM],
  ['wasm', RAW_DECODE_ADAPTER_LIBRAW_WASM],
]);

/**
 * @param {string | null | undefined} value
 * @returns {typeof RAW_DECODE_ADAPTER_HTTP_BRIDGE | typeof RAW_DECODE_ADAPTER_LIBRAW_WASM}
 */
export function normalizeRawDecodeAdapterId(value) {
  const key = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!key) {
    return RAW_DECODE_ADAPTER_HTTP_BRIDGE;
  }
  return ADAPTER_ALIASES.get(key) ?? RAW_DECODE_ADAPTER_HTTP_BRIDGE;
}

/**
 * Id adaptera z builda Vite (worker ma `import.meta.env` zastąpione w bundle).
 * @returns {typeof RAW_DECODE_ADAPTER_HTTP_BRIDGE | typeof RAW_DECODE_ADAPTER_LIBRAW_WASM}
 */
export function getRawDecodeAdapterIdFromEnv() {
  try {
    const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
    if (!env || typeof env !== 'object') {
      return RAW_DECODE_ADAPTER_HTTP_BRIDGE;
    }
    const raw = env.VITE_FILMLAB_RAW_DECODE_ADAPTER;
    return normalizeRawDecodeAdapterId(raw);
  } catch {
    return RAW_DECODE_ADAPTER_HTTP_BRIDGE;
  }
}

/**
 * @param {typeof RAW_DECODE_ADAPTER_HTTP_BRIDGE | typeof RAW_DECODE_ADAPTER_LIBRAW_WASM} adapterId
 * @param {File | Blob} file
 * @param {(
 *   file: File | Blob,
 *   renderIntent?: string,
 *   baseUrl?: string,
 *   backendPreference?: string | null
 * ) => Promise<{ ok: boolean; error?: unknown; payload?: unknown }>} decodeHttpBridge
 * @param {{ renderIntent?: string; baseUrl?: string; backendPreference?: string | null }} context
 */
export async function decodeRawWithConfiguredAdapter(adapterId, file, decodeHttpBridge, context = {}) {
  const { renderIntent = 'preview', baseUrl = '/', backendPreference = null } = context;

  if (adapterId === RAW_DECODE_ADAPTER_LIBRAW_WASM) {
    const { decodeRawWithLibrawWasm } = await import('./rawDecodeLibrawWasm.js');
    return decodeRawWithLibrawWasm(file, {
      renderIntent,
      baseUrl,
      backendPreference,
    });
  }

  return decodeHttpBridge(file, renderIntent, baseUrl, backendPreference);
}
