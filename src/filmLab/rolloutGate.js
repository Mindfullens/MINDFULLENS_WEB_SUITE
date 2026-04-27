export const MAIN_PREVIEW_AB_ROLLOUT_READY_MIN_FRAMES = 60;
export const MAIN_PREVIEW_AB_HEALTH_WARMUP_FRAMES = 10;
export const MAIN_PREVIEW_AB_HEALTH_WARN_FALLBACK_RATE = 0.2;
/** Wspólny próg: mediana intent→present **oraz** mediana kosztu samej klatki (render). */
export const PREVIEW_E2E_KPI_TARGET_MS = 16;
export const PREVIEW_E2E_FRAME_COST_TARGET_MS = PREVIEW_E2E_KPI_TARGET_MS;
/** Minimalna liczba próbek mediany kosztu klatki zanim bramka może być READY. */
export const PREVIEW_E2E_FRAME_COST_GATE_MIN_SAMPLES = 10;
export const MAIN_PREVIEW_AB_ROLLOUT_THRESHOLDS = {
  healthWarmupFrames: MAIN_PREVIEW_AB_HEALTH_WARMUP_FRAMES,
  healthWarnFallbackRate: MAIN_PREVIEW_AB_HEALTH_WARN_FALLBACK_RATE,
  gateReadyMinFrames: MAIN_PREVIEW_AB_ROLLOUT_READY_MIN_FRAMES,
};

export function getMainPreviewAbRolloutHealthThresholdsHint() {
  return `WARMUP <${MAIN_PREVIEW_AB_HEALTH_WARMUP_FRAMES}, OK <=${Math.round(MAIN_PREVIEW_AB_HEALTH_WARN_FALLBACK_RATE * 100)}% fallback, WARN >${Math.round(MAIN_PREVIEW_AB_HEALTH_WARN_FALLBACK_RATE * 100)}% fallback`;
}

export function getMainPreviewAbRolloutGateThresholdsHint() {
  return `READY gdy health=OK i n>=${MAIN_PREVIEW_AB_ROLLOUT_READY_MIN_FRAMES}; w pozostałych przypadkach HOLD`;
}

export function getPreviewE2eFrameCostGateThresholdsHint() {
  return `READY gdy mediana kosztu klatki <=${PREVIEW_E2E_FRAME_COST_TARGET_MS}ms i n>=${PREVIEW_E2E_FRAME_COST_GATE_MIN_SAMPLES}; inaczej HOLD`;
}

/**
 * Bramka operacyjna na medianie kosztu klatki (tylko czas renderu workera / fast / CPU), nie pełnym intent→present.
 */
export function getPreviewE2eFrameCostGateInfo(renderDebugInfo) {
  const path = String(renderDebugInfo?.previewE2ePath ?? '').trim();
  const none = {
    decision: null,
    isReady: false,
    tone: 'none',
    panelLabel: '—',
    badgeSegment: '',
    exportSummary: null,
  };
  if (!path) {
    return none;
  }
  const stats = renderDebugInfo?.previewE2eFrameCostPerPathStats;
  const row = stats && typeof stats === 'object' ? stats[path] : null;
  if (!row || typeof row !== 'object') {
    return none;
  }
  const median = Number(row.medianMs);
  const count = Number(row.count);
  if (!Number.isFinite(median) || !Number.isFinite(count)) {
    return none;
  }
  const n = Math.floor(count);
  if (n < PREVIEW_E2E_FRAME_COST_GATE_MIN_SAMPLES) {
    return {
      decision: 'HOLD',
      isReady: false,
      tone: 'warmup',
      panelLabel: `HOLD · n=${n}`,
      badgeSegment: ` | fc-gate:HOLD n=${n}`,
      exportSummary: `HOLD n=${n}`,
    };
  }
  const kpiOk = median <= PREVIEW_E2E_FRAME_COST_TARGET_MS;
  const decision = kpiOk ? 'READY' : 'HOLD';
  return {
    decision,
    isReady: kpiOk,
    tone: kpiOk ? 'ok' : 'warn',
    panelLabel: `${decision} · med=${median.toFixed(1)}ms · n=${n}`,
    badgeSegment: ` | fc-gate:${decision} med=${median.toFixed(1)}ms n=${n}`,
    exportSummary: `${decision} med=${median.toFixed(1)}ms n=${n}`,
  };
}

export function getMainPreviewAbRolloutHealthInfo(renderDebugInfo) {
  const state = String(renderDebugInfo?.mainThreadWebGpuPreviewAbHealthState ?? '').trim();
  const fallbackRateRaw = Number(renderDebugInfo?.mainThreadWebGpuPreviewAbFallbackRate);
  const healthFrames = Number(renderDebugInfo?.mainThreadWebGpuPreviewAbHealthFrames);
  const totalFrames = Number(renderDebugInfo?.mainThreadWebGpuPreviewAbFramesTotal);
  const fallbackFrames = Number(renderDebugInfo?.mainThreadWebGpuPreviewAbFramesWebGlFallback);

  let normalizedState = state;
  let n = Number.isFinite(healthFrames) && healthFrames > 0 ? Math.floor(healthFrames) : null;
  let fallbackRate = Number.isFinite(fallbackRateRaw) && fallbackRateRaw >= 0 ? fallbackRateRaw : null;

  if (!normalizedState) {
    if (!Number.isFinite(totalFrames) || totalFrames <= 0) {
      normalizedState = 'n/a';
      n = 0;
    } else if (totalFrames < MAIN_PREVIEW_AB_HEALTH_WARMUP_FRAMES) {
      normalizedState = 'insufficient-data';
      n = Math.floor(totalFrames);
      fallbackRate = null;
    } else {
      const fb = Number.isFinite(fallbackFrames) && fallbackFrames >= 0 ? fallbackFrames : 0;
      normalizedState =
        fb / totalFrames <= MAIN_PREVIEW_AB_HEALTH_WARN_FALLBACK_RATE ? 'ok' : 'warn';
      n = Math.floor(totalFrames);
      fallbackRate = Number((fb / totalFrames).toFixed(4));
    }
  }

  const decision =
    normalizedState === 'ok'
      ? 'OK'
      : normalizedState === 'warn'
        ? 'WARN'
        : normalizedState === 'insufficient-data'
          ? 'WARMUP'
          : null;
  const tone =
    decision == null ? 'none' : decision === 'OK' ? 'ok' : decision === 'WARN' ? 'warn' : 'warmup';
  const hasData = Number.isFinite(n) && n > 0;
  return {
    state: normalizedState || 'n/a',
    decision,
    tone,
    n: Number.isFinite(n) ? Math.floor(n) : 0,
    fallbackRate,
    hasData,
    panelLabel:
      decision == null
        ? '—'
        : `${decision}${Number.isFinite(fallbackRate) ? ` · fb ${(fallbackRate * 100).toFixed(1)}%` : ''} · n=${Math.floor(n ?? 0)}`,
    summaryLabel:
      decision == null
        ? null
        : `${decision}${Number.isFinite(fallbackRate) ? ` fb ${(fallbackRate * 100).toFixed(1)}%` : ''} n=${Math.floor(n ?? 0)}`,
    badgeSegment:
      decision == null
        ? ''
        : decision === 'WARN' && Number.isFinite(fallbackRate)
          ? ` | rollout:${decision} fb=${(fallbackRate * 100).toFixed(1)}%`
          : ` | rollout:${decision}`,
  };
}

export function getMainPreviewAbRolloutGateInfo(renderDebugInfo) {
  const healthInfo = getMainPreviewAbRolloutHealthInfo(renderDebugInfo);
  const state = healthInfo.state;
  const n = healthInfo.hasData ? healthInfo.n : null;
  const healthFrames = Number(renderDebugInfo?.mainThreadWebGpuPreviewAbHealthFrames);
  const runtimeReady = renderDebugInfo?.mainThreadWebGpuPreviewAbRolloutReady === true;
  const computedReady = state === 'ok' && Number.isFinite(healthFrames) && healthFrames >= MAIN_PREVIEW_AB_ROLLOUT_READY_MIN_FRAMES;
  const isReady = runtimeReady || computedReady;
  const decision = n == null || state === 'n/a' ? null : isReady ? 'READY' : 'HOLD';
  const tone =
    decision == null ? 'none' : decision === 'READY' ? 'ok' : state === 'insufficient-data' ? 'warmup' : 'warn';
  return {
    decision,
    n,
    isReady,
    tone,
    panelLabel: decision != null ? `${decision} · n=${n}` : '—',
    badgeSegment: decision != null ? ` | rollout:${decision}${n != null ? ` n=${n}` : ''}` : '',
    tooltipLabel: decision != null ? `${decision}${n != null ? ` (n=${n})` : ''}` : null,
    exportSummary: decision != null ? `${decision}${n != null ? ` n=${n}` : ''}` : null,
  };
}

export function parseRolloutGateFromRuntimeBadge(runtimeStatusBadge) {
  const text = String(runtimeStatusBadge ?? '');
  const match = text.match(/rollout:(READY|HOLD)(?:\s+n=(\d+))?\b/);
  if (!match) {
    return null;
  }
  const decision = String(match[1]);
  const n = match[2] != null ? Number(match[2]) : null;
  return {
    decision,
    n: Number.isFinite(n) ? Math.floor(n) : null,
    tooltipLabel:
      match[2] != null && Number.isFinite(n)
        ? `${decision} (n=${Math.floor(n)})`
        : decision,
  };
}

export function parseRolloutHealthFromRuntimeBadge(runtimeStatusBadge) {
  const text = String(runtimeStatusBadge ?? '');
  const warn = text.match(/rollout:WARN(?:\s+fb=([0-9.]+)%?)?\b/);
  if (warn) {
    const fb = warn[1] != null ? Number(warn[1]) : null;
    return {
      decision: 'WARN',
      fallbackPercent: Number.isFinite(fb) ? fb : null,
      tooltipLabel: Number.isFinite(fb) ? `WARN (fb=${fb.toFixed(1)}%)` : 'WARN',
    };
  }
  if (/\brollout:OK\b/.test(text)) {
    return { decision: 'OK', fallbackPercent: null, tooltipLabel: 'OK' };
  }
  if (/\brollout:WARMUP\b/.test(text)) {
    return { decision: 'WARMUP', fallbackPercent: null, tooltipLabel: 'WARMUP' };
  }
  return null;
}

export function parseAbDeltaFromRuntimeBadge(runtimeStatusBadge) {
  const text = String(runtimeStatusBadge ?? '');
  const match = text.match(/A\/B Δ([0-9.]+)ms \((WGPU|WGL)\)/);
  if (!match) {
    return null;
  }
  const deltaMs = Number(match[1]);
  const faster = String(match[2]);
  return {
    deltaMs: Number.isFinite(deltaMs) ? Number(deltaMs.toFixed(2)) : null,
    faster,
    tooltipLabel:
      Number.isFinite(deltaMs)
        ? `Δ${Number(deltaMs).toFixed(2)}ms (faster: ${faster})`
        : `(faster: ${faster})`,
  };
}

export function parseE2eWarnFromRuntimeBadge(runtimeStatusBadge) {
  const text = String(runtimeStatusBadge ?? '');
  const match = text.match(/E2E WARN ([0-9.]+)ms\/([0-9.]+)/);
  if (!match) {
    return null;
  }
  const measuredMs = Number(match[1]);
  const targetMs = Number(match[2]);
  return {
    measuredMs: Number.isFinite(measuredMs) ? Number(measuredMs.toFixed(1)) : null,
    targetMs: Number.isFinite(targetMs) ? Number(targetMs.toFixed(0)) : null,
    tooltipLabel:
      Number.isFinite(measuredMs) && Number.isFinite(targetMs)
        ? `${Number(measuredMs).toFixed(1)}ms / ${Number(targetMs).toFixed(0)}ms`
        : 'WARN',
  };
}

export function parseFrameCostGateFromRuntimeBadge(runtimeStatusBadge) {
  const text = String(runtimeStatusBadge ?? '');
  const match = text.match(/fc-gate:(READY|HOLD)(?:\s+med=([0-9.]+)ms)?(?:\s+n=(\d+))?/);
  if (!match) {
    return null;
  }
  const decision = String(match[1]);
  const med = match[2] != null ? Number(match[2]) : null;
  const n = match[3] != null ? Number(match[3]) : null;
  return {
    decision,
    medianMs: Number.isFinite(med) ? Number(med.toFixed(1)) : null,
    n: Number.isFinite(n) ? Math.floor(n) : null,
    tooltipLabel: [decision, Number.isFinite(med) ? `${med.toFixed(1)}ms` : null, Number.isFinite(n) ? `n=${Math.floor(n)}` : null]
      .filter(Boolean)
      .join(' '),
  };
}
