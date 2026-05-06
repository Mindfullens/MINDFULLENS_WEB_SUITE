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
 * Opcjonalny `tr` — funkcja `t` z i18n (Film Lab); bez niej zwraca te same stałe jak wcześniej (np. eksport DIAG).
 *
 * @param {object | null | undefined} info
 * @param {(key: string, vars?: Record<string, unknown>) => string} [tr]
 * @returns {string}
 */
export function getProxyWorkerOutputFitStatusLabel(info, tr) {
  const dash = () => (tr ? tr('filmLab.renderDebug.dashMark') : '—');
  if (info == null || info.proxySourceReady !== true) {
    return dash();
  }
  if (!isProxyWorkerProxyOutputFitted(info)) {
    return tr ? tr('filmLab.renderDebug.proxyFitNo') : 'nie';
  }
  const rw = info.proxyWorkerProxyOutputRequestedW;
  const rh = info.proxyWorkerProxyOutputRequestedH;
  const tw = info.proxyWorkerProxyOutputTargetW;
  const th = info.proxyWorkerProxyOutputTargetH;
  if (rw != null && rh != null && tw != null && th != null) {
    return tr
      ? tr('filmLab.renderDebug.proxyFitYesSized', { rw, rh, tw, th })
      : `tak (${rw}×${rh} → ${tw}×${th})`;
  }
  return tr ? tr('filmLab.renderDebug.proxyFitYes') : 'tak';
}

/**
 * Wiersz „W · kafle (nom. → wyj. @ max2D)”: ile kafli wymagałby nominalny rozmiar proxy
 * vs ile faktyczne wyjście po `fitNominalToMaxTexture2dEdge` (zwykle 1).
 *
 * @param {object | null | undefined} info
 * @param {(key: string, vars?: Record<string, unknown>) => string} [tr]
 * @returns {string}
 */
export function getProxyWorkerOutputTileStatusLabel(info, tr) {
  const dash = () => (tr ? tr('filmLab.renderDebug.dashMark') : '—');
  if (info == null || info.proxySourceReady !== true) {
    return dash();
  }
  const n = info.proxyWorkerOutputTileCountNominal;
  const tileTarget = info.proxyWorkerOutputTileCountTarget;
  if (n == null && tileTarget == null) {
    return tr ? tr('filmLab.renderDebug.proxyTilesNoMax2d') : 'brak max 2D';
  }
  if (n == null || tileTarget == null) {
    return dash();
  }
  if (n === 1 && tileTarget === 1) {
    return tr ? tr('filmLab.renderDebug.proxyTilesOneTile') : '1 kafel';
  }
  if (n > 1 && tileTarget === 1) {
    return tr ? tr('filmLab.renderDebug.proxyTilesNominalToOneOut', { n }) : `${n} nominalnie → 1 (wyj.)`;
  }
  return tr
    ? tr('filmLab.renderDebug.proxyTilesNomOutPair', { nom: n, out: tileTarget })
    : `nom. ${n} · wyj. ${tileTarget}`;
}
