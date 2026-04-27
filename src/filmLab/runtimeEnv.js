/**
 * @param {string | boolean | number | null | undefined} value
 * @param {boolean} [whenUnset=false] Gdy `value` to `null`/`undefined`, zwróć to (np. `true` = domyślnie włączone, jak `VITE_FILMLAB_WORKER_DRAG`).
 */
export function readEnvFlag(value, whenUnset = false) {
  if (value == null) {
    return whenUnset;
  }
  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

/**
 * Jawne „wyłącz” z env (`0`, `false`, `off`, `no`) — gdy brak / null, zwraca `false` (funkcja włączana domyślnie pozostaje do włączenia w kodzie, np. sonda GPU).
 * Użycie: opt-out, symetrycznie do `readEnvFlag` (włącz jawnie).
 */
export function readEnvNegated(value) {
  if (value == null) {
    return false;
  }
  const n = String(value).trim().toLowerCase();
  return n === '0' || n === 'false' || n === 'off' || n === 'no';
}

/**
 * `filmProfiles.js` (LUT w podglądzie) + eksport DIAG: domyślnie włączone; jedyne jawne wyłączenie: `VITE_FILMLAB_ENABLE_PREVIEW_LUTS=0` (po trim).
 * Nie używa `readEnvNegated` (nie traktujemy `off` jako wyłączenia — tylko `0`).
 */
export function isEnvEnablePreviewLuts() {
  return String(import.meta?.env?.VITE_FILMLAB_ENABLE_PREVIEW_LUTS ?? '1').trim() !== '0';
}

/**
 * Surowa wartość `VITE_FILMLAB_ENABLE_PREVIEW_LUTS` w bundlu (`null` = brak jawnej — `isEnvEnablePreviewLuts()` dalej używa domyślnego `1`).
 * Do eksportu DIAG, nie do logiki profilu.
 */
export function getViteEnablePreviewLutsRaw() {
  const v = import.meta?.env?.VITE_FILMLAB_ENABLE_PREVIEW_LUTS;
  if (v == null) {
    return null;
  }
  return String(v);
}

export const SHOW_RENDER_DEBUG_PANEL =
  readEnvFlag(import.meta?.env?.VITE_FILMLAB_DEBUG_PANEL) ||
  readEnvFlag(import.meta?.env?.VITE_FILMLAB_WORKER_DRAG) ||
  readEnvFlag(import.meta?.env?.VITE_FILMLAB_PROXY_GPU) ||
  Boolean(import.meta?.env?.DEV);

/** Dev/diag: pomiar `scheduleProgressiveRender` → pierwszy `requestAnimationFrame` hosta (wł. `1`). */
export function isEnvE2eHostSchedRaf() {
  return readEnvFlag(import.meta?.env?.VITE_FILMLAB_E2E_HOST_SCHED_RAF);
}

/** Dev/diag A/B: próba głównego podglądu WebGPU (wątek główny) — jawnie `1`. */
export function isEnvMainPreviewWebGpuAb() {
  return readEnvFlag(import.meta?.env?.VITE_FILMLAB_MAIN_PREVIEW_WEBGPU_AB);
}

/**
 * CPU `quality=preview`: przed pętlą pikseli — bilinear downscale do nominalnego W×H (`getNominalProxyRenderSize`, jak worker).
 * Drogie; tylko gdy jawnie `1`. §5.1.1.2
 */
export function isEnvCpuPreviewMatchNominal() {
  return readEnvFlag(import.meta?.env?.VITE_FILMLAB_CPU_PREVIEW_MATCH_NOMINAL);
}

/**
 * Spike §5.1.1.5: czy gospodarz może utworzyć `new SharedArrayBuffer(n)` (zwykle wymaga COOP+COEP → `crossOriginIsolated`).
 * Tylko telemetria — brak SAB w pipeline aż do osobnej polityki bezpieczeństwa / nagłówków.
 * @returns {{ sabConstructible: boolean, crossOriginIsolated: boolean | null, detail: string, policyState: string, policyReason: string, smokeBytes: number, smokeOk: boolean }}
 */
export function getSharedArrayBufferHostSnapshot() {
  const smokeBytes = 4;
  const toPolicy = (sabConstructible, crossOriginIsolated, detail) => {
    if (!sabConstructible) {
      if (detail === 'no-SharedArrayBuffer') {
        return {
          policyState: 'blocked-no-sab',
          policyReason: 'SharedArrayBuffer unavailable on host',
        };
      }
      return {
        policyState: 'blocked-construct-failed',
        policyReason: `SharedArrayBuffer constructor failed: ${detail}`,
      };
    }
    if (crossOriginIsolated !== true) {
      return {
        policyState: 'blocked-no-coi',
        policyReason: 'crossOriginIsolated=false (COOP/COEP not active)',
      };
    }
    return {
      policyState: 'ready',
      policyReason: 'SAB host policy satisfied (COI + constructor)',
    };
  };
  if (typeof SharedArrayBuffer === 'undefined') {
    const detail = 'no-SharedArrayBuffer';
    const p = toPolicy(false, null, detail);
    return {
      sabConstructible: false,
      crossOriginIsolated: null,
      detail,
      policyState: p.policyState,
      policyReason: p.policyReason,
      smokeBytes,
      smokeOk: false,
    };
  }
  let coi = null;
  if (typeof globalThis !== 'undefined' && 'crossOriginIsolated' in globalThis) {
    coi = Boolean(globalThis.crossOriginIsolated);
  }
  try {
    const sab = new SharedArrayBuffer(smokeBytes);
    if (!sab || sab.byteLength !== smokeBytes) {
      const detail = 'byteLength';
      const p = toPolicy(false, coi, detail);
      return {
        sabConstructible: false,
        crossOriginIsolated: coi,
        detail,
        policyState: p.policyState,
        policyReason: p.policyReason,
        smokeBytes,
        smokeOk: false,
      };
    }
    const detail = 'ok';
    const p = toPolicy(true, coi, detail);
    return {
      sabConstructible: true,
      crossOriginIsolated: coi,
      detail,
      policyState: p.policyState,
      policyReason: p.policyReason,
      smokeBytes,
      smokeOk: true,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const detail = msg.replace(/\s+/g, ' ').slice(0, 120);
    const p = toPolicy(false, coi, detail);
    return {
      sabConstructible: false,
      crossOriginIsolated: coi,
      detail,
      policyState: p.policyState,
      policyReason: p.policyReason,
      smokeBytes,
      smokeOk: false,
    };
  }
}

export function buildImageIdentityKey(uploadedFile, imageMeta) {
  return [
    uploadedFile?.name ?? 'no-file',
    uploadedFile?.size ?? 0,
    uploadedFile?.lastModified ?? 0,
    imageMeta?.previewWidth ?? 0,
    imageMeta?.previewHeight ?? 0,
    imageMeta?.width ?? 0,
    imageMeta?.height ?? 0,
  ].join(':');
}
