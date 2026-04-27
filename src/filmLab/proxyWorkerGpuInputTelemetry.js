/**
 * Pola `renderDebugInfo` z `useFilmLabEngine` (ostatnia klatka proxy) — czy używano
 * mniejszej tekstury 2D wejścia w workerze względem bufora źródła (ścieżka `proxySourceDownscale`).
 *
 * @param {object | null | undefined} info
 * @returns {boolean}
 */
export function isProxyWorkerGpuInputTexDownscaled(info) {
  if (!info) {
    return false;
  }
  const tw = info.proxyWorkerGpuTexW;
  const th = info.proxyWorkerGpuTexH;
  const fw = info.proxyWorkerFullSourceW;
  const fh = info.proxyWorkerFullSourceH;
  if (tw == null || th == null || fw == null || fh == null) {
    return false;
  }
  return tw < fw || th < fh;
}

/**
 * Czy w ramce są liczby rozmiaru tex wejścia (ścieżka GPU w workerze).
 * @param {object | null | undefined} info
 * @returns {boolean}
 */
export function hasProxyWorkerGpuTexDimensions(info) {
  return (
    info != null &&
    info.proxyWorkerGpuTexW != null &&
    info.proxyWorkerGpuTexH != null
  );
}

/**
 * Czy nominalny rozmiar z `computeProxySize` był docięty do `maxTextureDimension2D`
 * (ostatnia klatka workera, GPU lub CPU) — `fitNominalToMaxTexture2dEdge` w workera.
 *
 * @param {object | null | undefined} info
 * @returns {boolean}
 */
export function isProxyWorkerProxyOutputFitted(info) {
  return info != null && info.proxyWorkerProxyOutputFitted === true;
}

/**
 * Tekst do wiersza „W · wyjście do limitu 2D” w panelu Render Debug (`—` / `nie` / `tak` / `tak (W×H → W×H)`).
 *
 * @param {object | null | undefined} info
 * @returns {string}
 */
export function getProxyWorkerOutputFitStatusLabel(info) {
  if (info == null || info.proxySourceReady !== true) {
    return '—';
  }
  if (!isProxyWorkerProxyOutputFitted(info)) {
    return 'nie';
  }
  const rw = info.proxyWorkerProxyOutputRequestedW;
  const rh = info.proxyWorkerProxyOutputRequestedH;
  const tw = info.proxyWorkerProxyOutputTargetW;
  const th = info.proxyWorkerProxyOutputTargetH;
  if (rw != null && rh != null && tw != null && th != null) {
    return `tak (${rw}×${rh} → ${tw}×${th})`;
  }
  return 'tak';
}

/**
 * Wiersz „W · kafle (nom. → wyj. @ max2D)”: ile kafli wymagałby nominalny rozmiar proxy
 * vs ile faktyczne wyjście po `fitNominalToMaxTexture2dEdge` (zwykle 1).
 *
 * @param {object | null | undefined} info
 * @returns {string}
 */
export function getProxyWorkerOutputTileStatusLabel(info) {
  if (info == null || info.proxySourceReady !== true) {
    return '—';
  }
  const n = info.proxyWorkerOutputTileCountNominal;
  const t = info.proxyWorkerOutputTileCountTarget;
  if (n == null && t == null) {
    return 'brak max 2D';
  }
  if (n == null || t == null) {
    return '—';
  }
  if (n === 1 && t === 1) {
    return '1 kafel';
  }
  if (n > 1 && t === 1) {
    return `${n} nominalnie → 1 (wyj.)`;
  }
  return `nom. ${n} · wyj. ${t}`;
}
