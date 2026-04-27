import { useCallback, useEffect, useState } from 'react';
import { getLastBatchPerfSnapshot, IS_BATCH_PERF_ENABLED } from './engine/batchPerf.js';
import { SHORTCUT_KEYS } from './engine/shortcutActions.js';
import { formatRatioPercent } from './filmLab/displayFormat.js';
import {
  getProxyWorkerOutputFitStatusLabel,
  getProxyWorkerOutputTileStatusLabel,
  hasProxyWorkerGpuTexDimensions,
  isProxyWorkerGpuInputTexDownscaled,
} from './filmLab/proxyWorkerGpuInputTelemetry.js';
import {
  getFilmLabE2eKeyboardSession,
  getFilmLabE2ePointerAuxSession,
} from './filmLab/previewE2ePointerMark.js';
import {
  getMainPreviewAbRolloutGateThresholdsHint,
  getMainPreviewAbRolloutGateInfo,
  getMainPreviewAbRolloutHealthThresholdsHint,
  getMainPreviewAbRolloutHealthInfo,
  getPreviewE2eFrameCostGateInfo,
  getPreviewE2eFrameCostGateThresholdsHint,
} from './filmLab/rolloutGate.js';
import { isEnvE2eHostSchedRaf, isEnvEnablePreviewLuts, readEnvFlag } from './filmLab/runtimeEnv.js';

function formatRenderMs(value) {
  return Number.isFinite(value) ? `${Number(value).toFixed(1)} ms` : '—';
}

function formatPreviewE2ePerPathStats(stats) {
  if (!stats || typeof stats !== 'object') {
    return '—';
  }
  const prefer = ['fast-main-webgpu-ab', 'fast-webgl', 'worker-gpu', 'cpu-preview', 'cpu-full'];
  const keys = Object.keys(stats);
  if (!keys.length) {
    return '—';
  }
  const ordered = [
    ...prefer.filter((k) => keys.includes(k)),
    ...keys.filter((k) => !prefer.includes(k)).sort(),
  ];
  const chunks = [];
  for (const k of ordered) {
    const item = stats[k];
    if (!item || !Number.isFinite(Number(item.medianMs))) {
      continue;
    }
    const count = Number(item.count);
    const cnt = Number.isFinite(count) ? ` n=${Math.floor(count)}` : '';
    const state = item.kpiState != null ? ` ${String(item.kpiState)}` : '';
    chunks.push(`${k}: ${Number(item.medianMs).toFixed(1)}ms${cnt}${state}`);
  }
  return chunks.length ? chunks.join(' | ') : '—';
}

function formatPreviewE2eAbSummary(stats) {
  if (!stats || typeof stats !== 'object') {
    return '—';
  }
  const wg = stats['fast-main-webgpu-ab'];
  const gl = stats['fast-webgl'];
  const wgMed = Number(wg?.medianMs);
  const glMed = Number(gl?.medianMs);
  const wgCount = Number(wg?.count);
  const glCount = Number(gl?.count);
  const wgLabel = Number.isFinite(wgMed) ? `${wgMed.toFixed(1)}ms` : '—';
  const glLabel = Number.isFinite(glMed) ? `${glMed.toFixed(1)}ms` : '—';
  const wgN = Number.isFinite(wgCount) ? Math.floor(wgCount) : null;
  const glN = Number.isFinite(glCount) ? Math.floor(glCount) : null;
  if (!Number.isFinite(wgMed) && !Number.isFinite(glMed)) {
    return '—';
  }
  if (!Number.isFinite(wgMed) || !Number.isFinite(glMed)) {
    return `WebGPU: ${wgLabel}${wgN != null ? ` (n=${wgN})` : ''} · WebGL: ${glLabel}${glN != null ? ` (n=${glN})` : ''}`;
  }
  const delta = Number((wgMed - glMed).toFixed(2));
  const faster = delta <= 0 ? 'WebGPU' : 'WebGL';
  const deltaAbs = Math.abs(delta).toFixed(2);
  return `WebGPU: ${wgLabel}${wgN != null ? ` (n=${wgN})` : ''} · WebGL: ${glLabel}${glN != null ? ` (n=${glN})` : ''} · Δ ${deltaAbs}ms · szybciej: ${faster}`;
}

function formatMainPreviewAbRolloutHealth(renderDebugInfo) {
  return getMainPreviewAbRolloutHealthInfo(renderDebugInfo).panelLabel;
}

function formatMainPreviewAbRolloutHealthSummary(renderDebugInfo) {
  const label = formatMainPreviewAbRolloutHealth(renderDebugInfo);
  if (label === '—') {
    return null;
  }
  return label;
}

function getMainPreviewAbRolloutHealthTone(renderDebugInfo) {
  return getMainPreviewAbRolloutHealthInfo(renderDebugInfo).tone;
}

function formatMainPreviewAbRolloutGate(renderDebugInfo) {
  return getMainPreviewAbRolloutGateInfo(renderDebugInfo).panelLabel;
}

function getMainPreviewAbRolloutGateTone(renderDebugInfo) {
  return getMainPreviewAbRolloutGateInfo(renderDebugInfo).tone;
}

function getMainPreviewAbFallbackReason(renderDebugInfo) {
  const path = String(renderDebugInfo?.mainThreadWebGpuPreviewAbPath ?? '').trim();
  if (path !== 'webgl-fallback') {
    return '';
  }
  const decision = String(renderDebugInfo?.mainThreadWebGpuPreviewAbDecision ?? '').trim();
  if (decision === 'armed_runtime_error') {
    return 'main-preview A/B fallback: runtime error (WebGPU -> WebGL)';
  }
  if (decision === 'armed_runtime_fallback') {
    return 'main-preview A/B fallback: runtime fallback (WebGPU -> WebGL)';
  }
  if (decision === 'armed_probe_fail') {
    return 'main-preview A/B fallback: probe fail (WebGPU -> WebGL)';
  }
  return 'main-preview A/B fallback: WebGPU -> WebGL';
}

/** Worker vs wątek główny: osobne `getOrCreatePersistentWebGpuDevice` — format 3D LUT może się różnić. */
function formatWebGpuLut3dMainWorkerParityLine(renderDebugInfo) {
  const w = renderDebugInfo?.proxyWorkerWebGpuLut3dTexFormat;
  const m = renderDebugInfo?.mainThreadWebGpuLut3dTexFormat;
  const wL = w != null && String(w).trim() !== '' ? String(w) : '—';
  const mL = m != null && String(m).trim() !== '' ? String(m) : '—';
  if (w == null && m == null) {
    return '—';
  }
  const both = w != null && m != null;
  const same = both && String(w) === String(m);
  const tail = both ? (same ? ' · zgodne' : ' · różne') : '';
  return `W: ${wL} · main: ${mL}${tail}`;
}

/** Hex #RRGGBB z pierwszych trzech kanałów (jak `rb0` w wierszu main·preview) — tylko diagnostyka. */
function formatReadbackRgba8HexRgb(rgba) {
  if (!Array.isArray(rgba) || rgba.length < 3) {
    return '—';
  }
  return `#${[0, 1, 2]
    .map((i) => Math.floor(Number(rgba[i])).toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * Porównanie readbacku 1×1 (0,0) z proxy WebGPU w workerze vs sondy wątku głównego.
 * Osobne urządzenia/rozdzielczości/ścieżki — zgodność hex nie jest oczekiwana; służy do szybkiego skanu.
 */
function formatWebGpuReadbackMainWParityLine(renderDebugInfo) {
  const w = renderDebugInfo?.proxyWorkerWebGpuReadbackRgba8;
  const m = renderDebugInfo?.mainThreadWebGpuHostSourceReadbackRgba8;
  const wH = formatReadbackRgba8HexRgb(w);
  const mH = formatReadbackRgba8HexRgb(m);
  if (wH === '—' && mH === '—') {
    return '—';
  }
  const wCh = renderDebugInfo?.proxyWorkerWebGpuReadbackChroma;
  const wSuffix =
    wCh != null && String(wCh).trim() !== '' ? ` [${String(wCh)}]` : '';
  const mCh = renderDebugInfo?.mainThreadWebGpuHostSourceReadbackChroma;
  const mSuffix =
    mCh != null && String(mCh).trim() !== '' ? ` [${String(mCh)}]` : '';
  const both =
    Array.isArray(w) && w.length === 4 && Array.isArray(m) && m.length === 4;
  const same =
    both &&
    [0, 1, 2].every(
      (i) => Math.floor(Number(w[i])) === Math.floor(Number(m[i])),
    );
  const tail = both ? (same ? ' · zgodne' : ' · różne') : '';
  return `W: ${wH}${wSuffix} · main: ${mH}${mSuffix}${tail}`;
}

function formatWebGpuReadbackMainWParityRgb(renderDebugInfo) {
  const w = renderDebugInfo?.proxyWorkerWebGpuReadbackRgba8;
  const m = renderDebugInfo?.mainThreadWebGpuHostSourceReadbackRgba8;
  if (!Array.isArray(w) || w.length < 3 || !Array.isArray(m) || m.length < 3) {
    return 'n/a';
  }
  const same = [0, 1, 2].every(
    (i) => Math.floor(Number(w[i])) === Math.floor(Number(m[i])),
  );
  return same ? 'zgodne' : 'różne';
}

function formatViteProxyCpuYieldEvery() {
  const v = import.meta?.env?.VITE_FILMLAB_PROXY_CPU_YIELD_EVERY;
  if (v == null || String(v).trim() === '') {
    return '—';
  }
  return String(v).trim();
}

function formatWebGpuAdapterLabel(renderDebugInfo) {
  const api = renderDebugInfo?.webGpuApi;
  const a = renderDebugInfo?.webGpuAdapter;
  const info = renderDebugInfo?.webGpuAdapterInfo;
  if (!a || a.status === 'pending') {
    if (api && !api.exposed) {
      return 'n/d';
    }
    return '…';
  }
  if (a.status === 'unavailable') {
    return 'n/d';
  }
  if (a.status === 'no-adapter') {
    return 'brak';
  }
  if (a.status === 'error') {
    return a.reason || 'błąd';
  }
  if (a.status === 'ok') {
    if (info && (info.vendor || info.device || info.description)) {
      const parts = [info.vendor, info.architecture, info.device].filter(Boolean);
      if (parts.length) {
        return parts.join(' · ');
      }
      if (info.description) {
        return String(info.description);
      }
    }
    return 'ok';
  }
  return '—';
}

function formatWebGpuDeviceLabel(renderDebugInfo) {
  const d = renderDebugInfo?.webGpuDevice;
  if (!d || d.status === 'pending') {
    return '…';
  }
  if (d.status === 'unavailable') {
    return 'n/d';
  }
  if (d.status === 'error') {
    return d.reason || 'błąd';
  }
  if (d.status === 'ok' && d.limits?.maxTextureDimension2D) {
    return `ok · 2D max ${d.limits.maxTextureDimension2D}px`;
  }
  if (d.status === 'ok') {
    return 'ok';
  }
  return '—';
}

function formatSharedArrayBufferHostLine(renderDebugInfo) {
  const s = renderDebugInfo?.sharedArrayBufferHost;
  if (!s) {
    return '—';
  }
  const coi = s.crossOriginIsolated;
  const coiLabel = coi == null ? 'n/d' : coi ? 'tak' : 'nie';
  const sab = s.sabConstructible ? 'tak' : 'nie';
  const smoke = s.smokeOk ? `ok(${Math.floor(Number(s.smokeBytes) || 0)}B)` : 'fail';
  const policy = String(s.policyState ?? 'n/a');
  return `SAB ${sab} · COI ${coiLabel} · smoke ${smoke} · policy ${policy}`;
}

function asWorkerWebGpuRenderShape(w) {
  if (!w || w.status !== 'ready') {
    return null;
  }
  return {
    webGpuApi: w.webGpuApi,
    webGpuAdapter: w.webGpuAdapter,
    webGpuAdapterInfo: w.webGpuAdapterInfo,
    webGpuDevice: w.webGpuDevice,
  };
}

function formatWorkerWebGpuStatus(w) {
  if (!w || w.status === 'pending') {
    return '…';
  }
  if (w.status === 'skipped') {
    return w.reason || 'pominięto';
  }
  if (w.status === 'error') {
    return w.reason || 'błąd';
  }
  if (w.status === 'ready') {
    return 'ok';
  }
  return '—';
}

function formatBatchZipTotalMs(snapshot) {
  const total = snapshot?.timingsMs?.total;
  return Number.isFinite(Number(total)) ? `${Number(total).toFixed(1)} ms` : '—';
}

function formatProxyNominalDebugLine(info) {
  const nw = info?.proxyWorkerNominalW;
  const nh = info?.proxyWorkerNominalH;
  const max = info?.proxyWorkerProxyMaxEffective;
  const iw = info?.proxyInputBufferW;
  const ih = info?.proxyInputBufferH;
  if (nw == null || nh == null) {
    return '—';
  }
  const head = `${nw}×${nh} · max ${max ?? '—'}`;
  if (iw != null && ih != null) {
    if (iw === nw && ih === nh) {
      return `${head} (= bufor ${iw}×${ih})`;
    }
    return `${head} (bufor ${iw}×${ih})`;
  }
  return head;
}

export default function FilmLabRenderDebugPanel({
  open,
  exportDebugReport,
  debugExportFeedback,
  renderDebugInfo,
  previewPathLabel,
  rawBackendAbSummary,
  rawBackendMode,
  setRawBackendMode,
  rawLinearStageMode,
  setRawLinearStageMode,
  rawLinearStageModeLabel,
  rawQualityQaSummary,
}) {
  const [lastBatchPerf, setLastBatchPerf] = useState(() => getLastBatchPerfSnapshot());
  const [batchPerfCopyFeedback, setBatchPerfCopyFeedback] = useState(null);
  const [e2ePointerAux, setE2ePointerAux] = useState(false);
  const [e2ePointerKeyboard, setE2ePointerKeyboard] = useState(false);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    setE2ePointerAux(getFilmLabE2ePointerAuxSession());
    setE2ePointerKeyboard(getFilmLabE2eKeyboardSession());
    const id = setInterval(() => {
      setE2ePointerAux(getFilmLabE2ePointerAuxSession());
      setE2ePointerKeyboard(getFilmLabE2eKeyboardSession());
    }, 200);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onBatchPerf = (event) => {
      setLastBatchPerf(event?.detail ?? getLastBatchPerfSnapshot());
    };
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('filmlab-batch-perf', onBatchPerf);
    }
    return () => {
      if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('filmlab-batch-perf', onBatchPerf);
      }
    };
  }, [open]);

  const copyLastBatchPerfJson = useCallback(async () => {
    const snapshot = lastBatchPerf ?? getLastBatchPerfSnapshot();
    if (!snapshot) {
      return;
    }
    const text = JSON.stringify(snapshot, null, 2);
    const showCopied = () => {
      setBatchPerfCopyFeedback('copied');
      setTimeout(() => setBatchPerfCopyFeedback(null), 1200);
    };
    const showError = () => {
      setBatchPerfCopyFeedback('error');
      setTimeout(() => setBatchPerfCopyFeedback(null), 1500);
    };
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        showCopied();
        return;
      }
    } catch {
      showError();
      return;
    }
    // Fallback (np. brak secure context / starsze WebView)
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) {
        showCopied();
      } else {
        showError();
      }
    } catch {
      showError();
    }
  }, [lastBatchPerf]);

  const mainPreviewAbHealthSummary = formatMainPreviewAbRolloutHealthSummary(renderDebugInfo);
  const mainPreviewAbHealthTone = getMainPreviewAbRolloutHealthTone(renderDebugInfo);
  const mainPreviewAbRolloutGate = formatMainPreviewAbRolloutGate(renderDebugInfo);
  const mainPreviewAbRolloutGateTone = getMainPreviewAbRolloutGateTone(renderDebugInfo);
  const previewE2eFrameCostGate = getPreviewE2eFrameCostGateInfo(renderDebugInfo);
  const mainPreviewAbFallbackReason = getMainPreviewAbFallbackReason(renderDebugInfo);

  if (!open) {
    return null;
  }

  return (
    <div className="render-debug-panel">
      <div className="render-debug-header">
        <div className="render-debug-title-wrap">
          <div className="render-debug-title">Render Debug</div>
          <div
            className="render-debug-health-legend"
            title={`Legenda health rolloutu A/B: ${getMainPreviewAbRolloutHealthThresholdsHint()}.`}
          >
            <span className="render-debug-health-legend-label">health</span>
            <span className="render-debug-inline-health tone-ok">OK</span>
            <span className="render-debug-inline-health tone-warn">WARN</span>
            <span className="render-debug-inline-health tone-warmup">WARMUP</span>
          </div>
        </div>
        <button
          type="button"
          className="render-debug-export-btn"
          onClick={exportDebugReport}
          title="Eksportuj raport diagnostyczny JSON"
        >
          {debugExportFeedback === 'saved'
            ? 'Zapisano'
            : debugExportFeedback === 'error'
              ? 'Błąd'
              : 'JSON'}
        </button>
      </div>
      <div className="render-debug-block tone-neutral">
        <div className="render-debug-block-title-row">
          <div className="render-debug-block-title">Batch ZIP</div>
          <button
            type="button"
            className="render-debug-export-btn"
            onClick={copyLastBatchPerfJson}
            disabled={!lastBatchPerf}
            title="Kopiuj ostatni pomiar batch (JSON) do schowka"
          >
            {batchPerfCopyFeedback === 'copied'
              ? '✓'
              : batchPerfCopyFeedback === 'error'
                ? '✕'
                : 'Kopiuj'}
          </button>
        </div>
        <div className="render-debug-row">
          <span>Pomiar</span>
          <strong>{IS_BATCH_PERF_ENABLED ? 'włączony' : 'wyłączony'}</strong>
        </div>
        {IS_BATCH_PERF_ENABLED && !lastBatchPerf ? (
          <div className="render-debug-reason">Brak pomiaru — uruchom eksport batch (ZIP).</div>
        ) : null}
        {lastBatchPerf ? (
          <>
            <div className="render-debug-row">
              <span>Łącznie</span>
              <strong>{formatBatchZipTotalMs(lastBatchPerf)}</strong>
            </div>
            <div className="render-debug-row">
              <span>Pliki (dodane)</span>
              <strong>
                {lastBatchPerf.addedCount ?? '—'}
                {typeof lastBatchPerf.totalFiles === 'number' ? ` / ${lastBatchPerf.totalFiles}` : ''}
              </strong>
            </div>
            <div className="render-debug-row">
              <span>ZIP</span>
              <strong>
                {lastBatchPerf.timingsMs?.zip == null
                  ? '—'
                  : `${Number(lastBatchPerf.timingsMs.zip).toFixed(1)} ms`}
              </strong>
            </div>
            {lastBatchPerf.aborted ? (
              <div className="render-debug-reason">Ostatni batch został przerwany (abort).</div>
            ) : null}
          </>
        ) : null}
        {!IS_BATCH_PERF_ENABLED ? (
          <div className="render-debug-reason" title="Wymaga przebudowy z VITE_FILMLAB_BATCH_PERF=1">
            Aby włączyć pomiary, ustaw VITE_FILMLAB_BATCH_PERF=1 i zbuduj dev/preview.
          </div>
        ) : null}
      </div>
      <div className="render-debug-row">
        <span>Drag worker</span>
        <strong>{renderDebugInfo?.workerDragEnabled ? 'on' : 'off'}</strong>
      </div>
      <div className="render-debug-row" title="VITE_FILMLAB_WEBGPU_PROXY w zbudowanej paczce (ścieżka WebGPU w workerze).">
        <span>Build WebGPU proxy</span>
        <strong>{renderDebugInfo?.webgpuProxyBuild ? 'on' : 'off'}</strong>
      </div>
      <div className="render-debug-row">
        <span>Proxy GPU</span>
        <strong>{renderDebugInfo?.proxyGpuEnabled ? 'on' : 'off'}</strong>
      </div>
      <div
        className="render-debug-row"
        title="VITE_FILMLAB_ENABLE_PREVIEW_LUTS — wyłączenie tylko przez =0 (isEnvEnablePreviewLuts w runtimeEnv; filmProfiles)."
      >
        <span>Profil · LUT podgląd</span>
        <strong>{isEnvEnablePreviewLuts() ? 'włączony' : 'wyłączony'}</strong>
      </div>
      <div className="render-debug-row" title="WebGPU API (Etap 1, diagnostyka; render nadal WebGL)">
        <span>WebGPU API</span>
        <strong>
          {renderDebugInfo?.webGpuApi == null
            ? '—'
            : renderDebugInfo.webGpuApi.exposed
              ? 'tak'
              : 'nie'}
        </strong>
      </div>
      <div
        className="render-debug-row"
        title={
          renderDebugInfo?.webGpuAdapterInfo
            ? JSON.stringify(renderDebugInfo.webGpuAdapterInfo)
            : 'requestAdapter (cache modułowe; bez GPU device)'
        }
      >
        <span>WebGPU adapter</span>
        <strong>{formatWebGpuAdapterLabel(renderDebugInfo)}</strong>
      </div>
      <div
        className="render-debug-row"
        title={
          renderDebugInfo?.webGpuDevice?.limits
            ? JSON.stringify(renderDebugInfo.webGpuDevice.limits)
            : 'requestDevice + limits (device od razu destroy; Etap 1 sonda)'
        }
      >
        <span>WebGPU device</span>
        <strong>{formatWebGpuDeviceLabel(renderDebugInfo)}</strong>
      </div>
      <div
        className="render-debug-row"
        title={`Plan §5.1.1.3: \`probeMainThreadWebGpuPreview\` — bufor, limit 2D, canvas+configure, clear, WGSL+\`createRenderPipeline\`+trójkąt+\`textureSample\` (1×1)+\`proxyWebGpuShaders.wgsl\` (worker parity) oraz po załadowaniu wejścia: downscale+\`fmain\` (\`mainThreadWebGpuHostSourceProxyPass\`); pełny kolor: \`createFastPreviewRenderer\` (WebGL/WebGL2). A/B flaga: \`VITE_FILMLAB_MAIN_PREVIEW_WEBGPU_AB=1\`. Health inline: ${getMainPreviewAbRolloutHealthThresholdsHint()}.`}
      >
        <span>WebGPU (main · preview)</span>
        <strong>
          {renderDebugInfo?.mainThreadWebGpuPreviewStatus ?? '—'}
          {renderDebugInfo?.mainThreadWebGpuPreviewAbEnabled != null
            ? ` · AB: ${renderDebugInfo.mainThreadWebGpuPreviewAbEnabled ? 'on' : 'off'}`
            : ''}
          {renderDebugInfo?.mainThreadWebGpuPreviewAbDecision != null
            ? ` · decyzja: ${renderDebugInfo.mainThreadWebGpuPreviewAbDecision}`
            : ''}
          {renderDebugInfo?.mainThreadWebGpuPreviewAbPath != null
            ? ` · tor: ${renderDebugInfo.mainThreadWebGpuPreviewAbPath}`
            : ''}
          {renderDebugInfo?.mainThreadWebGpuPreviewAbRenderMs != null &&
          Number.isFinite(Number(renderDebugInfo.mainThreadWebGpuPreviewAbRenderMs))
            ? ` · ab: ${Number(renderDebugInfo.mainThreadWebGpuPreviewAbRenderMs).toFixed(1)} ms`
            : ''}
          {renderDebugInfo?.mainThreadWebGpuPreviewAbSourceTexFormat != null
            ? ` · srcTex: ${renderDebugInfo.mainThreadWebGpuPreviewAbSourceTexFormat}`
            : ''}
          {Number.isFinite(Number(renderDebugInfo?.mainThreadWebGpuPreviewAbFramesTotal))
            ? ` · frames: ${Math.floor(Number(renderDebugInfo.mainThreadWebGpuPreviewAbFramesTotal))}`
            : ''}
          {Number.isFinite(Number(renderDebugInfo?.mainThreadWebGpuPreviewAbFramesWebGpuMain)) &&
          Number.isFinite(Number(renderDebugInfo?.mainThreadWebGpuPreviewAbFramesWebGlFallback))
            ? ` (${Math.floor(Number(renderDebugInfo.mainThreadWebGpuPreviewAbFramesWebGpuMain))}/${Math.floor(Number(renderDebugInfo.mainThreadWebGpuPreviewAbFramesWebGlFallback))})`
            : ''}
          {Number.isFinite(Number(renderDebugInfo?.mainThreadWebGpuPreviewAbWebGpuRatio))
            ? ` · wgpu%: ${(Number(renderDebugInfo.mainThreadWebGpuPreviewAbWebGpuRatio) * 100).toFixed(1)}`
            : ''}
          {mainPreviewAbHealthSummary != null ? ' · ' : ''}
          {mainPreviewAbHealthSummary != null ? (
            <span className={`render-debug-inline-health tone-${mainPreviewAbHealthTone}`}>
              {`health: ${mainPreviewAbHealthSummary}`}
            </span>
          ) : null}
          {renderDebugInfo?.mainThreadWebGpuMaxTextureDimension2d != null
            ? ` · 2D≤${renderDebugInfo.mainThreadWebGpuMaxTextureDimension2d}`
            : ''}
          {renderDebugInfo?.mainThreadWebGpuMaxTextureDimension3d != null
            ? ` · 3D≤${renderDebugInfo.mainThreadWebGpuMaxTextureDimension3d}`
            : ''}
          {renderDebugInfo?.mainThreadWebGpuLut3dTexFormat != null
            ? ` · LUT3D: ${renderDebugInfo.mainThreadWebGpuLut3dTexFormat}`
            : ''}
          {renderDebugInfo?.mainThreadWebGpuCanvasClearPass != null
            ? ` · canvas: ${renderDebugInfo.mainThreadWebGpuCanvasClearPass ? 'tak' : 'nie'}`
            : ''}
          {renderDebugInfo?.mainThreadWebGpuSolidDrawPass != null
            ? ` · rys: ${renderDebugInfo.mainThreadWebGpuSolidDrawPass ? 'tak' : 'nie'}`
            : ''}
          {renderDebugInfo?.mainThreadWebGpuTextureDrawPass != null
            ? ` · tex: ${renderDebugInfo.mainThreadWebGpuTextureDrawPass ? 'tak' : 'nie'}`
            : ''}
          {renderDebugInfo?.mainThreadWebGpuProxyShaderDrawPass != null
            ? ` · proxy: ${renderDebugInfo.mainThreadWebGpuProxyShaderDrawPass ? 'tak' : 'nie'}`
            : ''}
          {renderDebugInfo?.mainThreadWebGpuHostSourceProxyPass != null
            ? ` · src: ${renderDebugInfo.mainThreadWebGpuHostSourceProxyPass ? 'tak' : 'nie'}`
            : ''}
          {Array.isArray(renderDebugInfo?.mainThreadWebGpuHostSourceReadbackRgba8) &&
          renderDebugInfo.mainThreadWebGpuHostSourceReadbackRgba8.length === 4
            ? ` · rb0: #${[0, 1, 2]
                .map(
                  (i) =>
                    renderDebugInfo.mainThreadWebGpuHostSourceReadbackRgba8[i]
                      .toString(16)
                      .padStart(2, '0'),
                )
                .join('')}`
            : ''}
        </strong>
      </div>
      <div
        className="render-debug-row"
        title={`Status zdrowia rolloutu A/B (na bazie fallback-rate): ${getMainPreviewAbRolloutHealthThresholdsHint()}.`}
      >
        <span>A/B rollout health</span>
        <strong>
          <span className={`render-debug-inline-health tone-${mainPreviewAbHealthTone}`}>
            {formatMainPreviewAbRolloutHealth(renderDebugInfo)}
          </span>
        </strong>
      </div>
      <div
        className="render-debug-row"
        title={`Brama rolloutu A/B: ${getMainPreviewAbRolloutGateThresholdsHint()}.`}
      >
        <span>A/B rollout gate</span>
        <strong>
          <span className={`render-debug-inline-health tone-${mainPreviewAbRolloutGateTone}`}>
            {mainPreviewAbRolloutGate}
          </span>
        </strong>
      </div>
      <div
        className="render-debug-row"
        title={[
          '§5.1.1.5: SAB wymaga zwykle crossOriginIsolated (COOP+COEP). Tylko telemetria; produkcja bez wymuszenia.',
          JSON.stringify(renderDebugInfo?.sharedArrayBufferHost ?? null, null, 0),
        ].join('\n')}
      >
        <span>Host · SharedArrayBuffer</span>
        <strong>{formatSharedArrayBufferHostLine(renderDebugInfo)}</strong>
      </div>
      {asWorkerWebGpuRenderShape(renderDebugInfo?.webGpuWorker) ? (
        <>
          <div
            className="render-debug-row"
            title="proxyRenderWorker — osobna kopia `webGpuEnvironment` (porównaj z wierszami powyżej)"
          >
            <span>W · API</span>
            <strong>
              {renderDebugInfo?.webGpuWorker?.webGpuApi?.exposed ? 'tak' : 'nie'}
            </strong>
          </div>
          <div
            className="render-debug-row"
            title={
              renderDebugInfo?.webGpuWorker?.webGpuAdapterInfo
                ? JSON.stringify(renderDebugInfo.webGpuWorker.webGpuAdapterInfo)
                : ''
            }
          >
            <span>W · adapter</span>
            <strong>
              {formatWebGpuAdapterLabel(asWorkerWebGpuRenderShape(renderDebugInfo?.webGpuWorker) || {})}
            </strong>
          </div>
          <div
            className="render-debug-row"
            title={
              renderDebugInfo?.webGpuWorker?.webGpuDevice?.limits
                ? JSON.stringify(renderDebugInfo.webGpuWorker.webGpuDevice.limits)
                : ''
            }
          >
            <span>W · device</span>
            <strong>
              {formatWebGpuDeviceLabel(
                asWorkerWebGpuRenderShape(renderDebugInfo?.webGpuWorker) || {},
              )}
            </strong>
          </div>
        </>
      ) : (
        <div
          className="render-debug-row"
          title="Sonda WebGPU w `proxyRenderWorker` (ten sam wzorzec co w wątku głównym; render nadal WebGL2)"
        >
          <span>W WebGPU (worker)</span>
          <strong>{formatWorkerWebGpuStatus(renderDebugInfo?.webGpuWorker)}</strong>
        </div>
      )}
      <div
        className="render-debug-row"
        title="getPreferredCanvasFormat() w workerze (proxy WebGPU po udanym tryAttach)"
      >
        <span>W · canvas format</span>
        <strong>{renderDebugInfo?.proxyWorkerWebGpuCanvasFormat ?? '—'}</strong>
      </div>
      <div
        className="render-debug-row"
        title={
          renderDebugInfo?.proxyWorkerWebGpuDeviceLimits
            ? JSON.stringify(renderDebugInfo.proxyWorkerWebGpuDeviceLimits, null, 0)
            : 'GPUDevice.limits w workerze (po tryAttach) — m.in. maks. wymiary tekstur'
        }
      >
        <span>W · limity tex</span>
        <strong>
          {renderDebugInfo?.proxyWorkerWebGpuDeviceLimits
            ? `2D ${renderDebugInfo.proxyWorkerWebGpuDeviceLimits.maxTextureDimension2D} · 3D ${renderDebugInfo.proxyWorkerWebGpuDeviceLimits.maxTextureDimension3D}`
            : '—'}
        </strong>
      </div>
      <div
        className="render-debug-row"
        title="WebGL2 w workerze: MAX_TEXTURE_SIZE i MAX_3D_TEXTURE_SIZE (ostatnia klatka proxy WebGL)"
      >
        <span>W · GL limity tex</span>
        <strong>
          {renderDebugInfo?.proxyLastFrameGpuImpl === 'webgl' &&
          renderDebugInfo?.proxyWorkerWebGlMaxTex2d != null
            ? `2D ${renderDebugInfo.proxyWorkerWebGlMaxTex2d} · 3D ${renderDebugInfo.proxyWorkerWebGlMaxTex3d ?? '—'}`
            : '—'}
        </strong>
      </div>
      <div
        className="render-debug-row"
        title="Proxy WebGL2: sonda `probeWebgl2Rgba16fFboUsable`; FBO+blit gdy sonda OK i brak `VITE_FILMLAB_FAST_FBO16F=0` (jak szybki podgląd). Źródło `texImage2D` nadal RGBA8."
      >
        <span>W · GL FBO RGBA16F</span>
        <strong>
          {renderDebugInfo?.proxyLastFrameGpuImpl === 'webgl' &&
          renderDebugInfo?.proxyWorkerWebGlRgba16f != null
            ? `${renderDebugInfo.proxyWorkerWebGlRgba16f ? 'sonda: tak' : 'sonda: nie'}${
                renderDebugInfo?.proxyWorkerWebGlFbo16fBlit != null
                  ? ` · blit: ${renderDebugInfo.proxyWorkerWebGlFbo16fBlit ? 'tak' : 'nie'}`
                  : ''
              }`
            : '—'}
        </strong>
      </div>
      <div
        className="render-debug-row"
        title="Proxy WebGL2: 3D LUT (profil + look) w `TEXTURE_3D` — `rgba16f`+half gdy sonda 3D i aktywny FBO+blit, inaczej `rgba8`."
      >
        <span>W · GL 3D LUT</span>
        <strong>
          {renderDebugInfo?.proxyLastFrameGpuImpl === 'webgl' &&
          renderDebugInfo?.proxyWorkerWebGl3dLutRgba16f != null
            ? renderDebugInfo.proxyWorkerWebGl3dLutRgba16f
              ? 'rgba16f'
              : 'rgba8'
            : '—'}
        </strong>
      </div>
      {renderDebugInfo?.proxyLastFrameBackend === 'gpu' &&
      hasProxyWorkerGpuTexDimensions(renderDebugInfo) ? (
        <div
          className="render-debug-row"
          title="Rozmiar 2D tekstury wejścia w workerze; jeśli mniejszy niż poniższy „pełny” rozmiar, zastosowano pobiliniowe pomniejszenie do limitu GPU."
        >
          <span>W · wejście GPU (tex)</span>
          <strong>
            {!isProxyWorkerGpuInputTexDownscaled(renderDebugInfo)
              ? `${renderDebugInfo.proxyWorkerGpuTexW}×${renderDebugInfo.proxyWorkerGpuTexH}`
              : `${renderDebugInfo.proxyWorkerGpuTexW}×${renderDebugInfo.proxyWorkerGpuTexH} (z ${renderDebugInfo.proxyWorkerFullSourceW}×${renderDebugInfo.proxyWorkerFullSourceH})`}
          </strong>
        </div>
      ) : null}
      {renderDebugInfo?.proxyLastFrameBackend === 'gpu' &&
      hasProxyWorkerGpuTexDimensions(renderDebugInfo) ? (
        <div
          className="render-debug-row"
          title="Czas pobiliniowego pomniejszenia bufora wejścia do limitu 2D w workerze (przed `renderer.render`). 0 ms = odczyt z cache; — = pełna rozdzielczość mieści się w limicie (brak kroku CPU)."
        >
          <span>W · downscale wejścia</span>
          <strong>
            {renderDebugInfo.proxyWorkerGpuInputDownscaleMs === null
              ? '—'
              : renderDebugInfo.proxyWorkerGpuInputDownscaleMs === 0
                ? '0 ms (cache)'
                : formatRenderMs(renderDebugInfo.proxyWorkerGpuInputDownscaleMs)}
          </strong>
        </div>
      ) : null}
      <div
        className="render-debug-row"
        title="Nominalny rozmiar klatki proxy (`proxyComputeSize.js` = worker). „Bufor” to rozmiar canvas źródła (preview), na którym liczy się nominal; gdy różni się od nominal — worker dodatkowo pomniejsza przed dalszym pipeline."
      >
        <span>W · nominal (computeProxySize)</span>
        <strong>{formatProxyNominalDebugLine(renderDebugInfo)}</strong>
      </div>
      {readEnvFlag(import.meta?.env?.VITE_FILMLAB_PROXY_MATCH_PREVIEW) ? (
        <div
          className="render-debug-row"
          title="VITE_FILMLAB_PROXY_MATCH_PREVIEW (1/true/on/yes) — to samo co w silniku: proxyMax ≥ dłuższa krawędź bufora preview, bez drugiego downscale w workerze (koszt: wyższy render przy interakcji)."
        >
          <span>W · match bufora preview</span>
          <strong>włączony</strong>
        </div>
      ) : null}
      <div
        className="render-debug-row"
        title="Gdy tak: nominalny rozmiar z computeProxySize przekroczył maxTextureDimension2D — wyjście proxy dopasowane (wspólnie na GPU/CPU, gdy znany limit 2D)."
      >
        <span>W · wyjście do limitu 2D</span>
        <strong>{getProxyWorkerOutputFitStatusLabel(renderDebugInfo)}</strong>
      </div>
      <div
        className="render-debug-row"
        title="Ile kafli 2D wymagałby nominalny rozmiar proxy vs. faktyczne wyjście po dopasowaniu do maxTextureDimension2D (telemetria; pełny multi-tile render w repo jeszcze nie)."
      >
        <span>W · kafle @ max2D (nom.→wyj.)</span>
        <strong>{getProxyWorkerOutputTileStatusLabel(renderDebugInfo)}</strong>
      </div>
      <div
        className="render-debug-row"
        title="Format tekstury wejścia w proxy WebGPU (rgba16float jeśli urządzenie i API; inaczej rgba8unorm)"
      >
        <span>W · wejście (tex)</span>
        <strong>{renderDebugInfo?.proxyWorkerWebGpuSourceTexFormat ?? '—'}</strong>
      </div>
      <div
        className="render-debug-row"
        title="Format 3D LUT (profil + look) w proxy WebGPU"
      >
        <span>W · LUT 3D (tex)</span>
        <strong>{renderDebugInfo?.proxyWorkerWebGpuLut3dTexFormat ?? '—'}</strong>
      </div>
      <div
        className="render-debug-row"
        title="Porównanie `proxyWorkerWebGpuLut3dTexFormat` (worker) z `mainThreadWebGpuLut3dTexFormat` (sonda wątku głównego). Osobne urządzenia/cache — warto weryfikować `różne` przy debugowaniu."
      >
        <span>LUT 3D (W · main)</span>
        <strong>{formatWebGpuLut3dMainWorkerParityLine(renderDebugInfo)}</strong>
      </div>
      <div
        className="render-debug-row"
        title="Readback 1×1 piksel (0,0): worker (swapchain / kafel) vs sonda wątku głównego (`rb0` w wierszu WebGPU main·preview). Różne ścieżki, rozdzielczości i downscale — hex nie musi być zgodny; wiersz służy do szybkiego skanu i regresji."
      >
        <span>Readback (W · main · rb0)</span>
        <strong>{formatWebGpuReadbackMainWParityLine(renderDebugInfo)}</strong>
      </div>
      <div
        className="render-debug-row"
        title="Parity RGB readbacku 1×1 (worker WebGPU vs main WebGPU probe): porównanie kanałów R,G,B."
      >
        <span>Readback parity (W=main RGB)</span>
        <strong>{formatWebGpuReadbackMainWParityRgb(renderDebugInfo)}</strong>
      </div>
      <div className="render-debug-row">
        <span>Status</span>
        <strong>{renderDebugInfo?.proxyWorkerStatus ?? 'n/a'}</strong>
      </div>
      <div className="render-debug-row">
        <span>Profile mode</span>
        <strong>{renderDebugInfo?.profileRenderMode ?? 'n/a'}</strong>
      </div>
      <div className="render-debug-row">
        <span>Preview path</span>
        <strong>{previewPathLabel}</strong>
      </div>
      <div className="render-debug-row">
        <span>Last path</span>
        <strong>{renderDebugInfo?.lastRenderPath ?? 'n/a'}</strong>
      </div>
      <div
        className="render-debug-row"
        title="Efektywne `interactionKind` w silniku (z engineAdjustments): przy !isAdjusting zawsze idle — wpływa m.in. na szybki podgląd, proxy, gałęzie HSL/grade/calibration/curve. Zob. `useFilmLabEngineAdjustments`."
      >
        <span>Interaction (engine)</span>
        <strong>{renderDebugInfo?.interactionKind ?? '—'}</strong>
      </div>
      <div
        className="render-debug-row"
        title="`isAdjusting` w `engineAdjustments` (host → silnik) — włączany przy suwakach, kółku gradacji, krzywych, prostowaniu, cadrowaniu (wg panelu) itd.; wpływa na wybór ścieżki podglądu i na E2E (drag v2) gdy w momencie klatki nadal true."
      >
        <span>Adjusting (engine)</span>
        <strong>{renderDebugInfo?.isAdjusting ? 'tak' : 'nie'}</strong>
      </div>
      <div
        className="render-debug-row"
        title="`options.e2eIsPanning` z hosta (Film Lab: pan obrazu w widoku) — włącza liczenie E2E v3 pointer→canvas, gdy użytkownik nie trzyma suwaka (`isAdjusting` może być false). Zob. `readPreviewE2ePointerContext` w silniku."
      >
        <span>E2E (pan)</span>
        <strong>{renderDebugInfo?.e2ePanning ? 'tak' : 'nie'}</strong>
      </div>
      <div
        className="render-debug-row"
        title="`getFilmLabE2ePointerAuxSession()` — sesja pomocnicza (np. rękojeść kadru w `useFilmLabCropDrag`), gdy `isAdjusting` z Reacta bywa false; włącza pomiar E2E v3 pointer→canvas. Odświeżane ~5×/s przy otwartym panelu."
      >
        <span>E2E (aux)</span>
        <strong>{e2ePointerAux ? 'tak' : 'nie'}</strong>
      </div>
      <div
        className="render-debug-row"
        title="Sesja E2E v3 po skrócie klawiszowym (zoom, pan klawiszami, Przed/Po, auto A/K, cadrowanie Enter, itd.); `isAdjusting` bywa false — włączany kontekst jak przy aux. Konsumowany po pierwszej prezentacji klatki."
      >
        <span>E2E (kbd)</span>
        <strong>{e2ePointerKeyboard ? 'tak' : 'nie'}</strong>
      </div>
      <div
        className="render-debug-row"
        title="Czas od ostatniego wejścia w harmonogram renderu (scheduleProgressiveRender) do zapisu pikseli na canvasie podglądu. Obejmuje m.in. kolejkę rAF, worker i rysowanie; nie mierzy opóźnienia React/ props przed schedule. Pokazuje też medianę ruchomą (31 próbek) per `previewE2ePath` i stan KPI 16 ms."
      >
        <span>E2E (sched→canvas)</span>
        <strong>
          {formatRenderMs(renderDebugInfo?.previewE2eIntentToPresentMs)} ·{' '}
          {renderDebugInfo?.previewE2ePath ?? '—'}
          {renderDebugInfo?.previewE2eMedianMs != null
            ? ` · med: ${formatRenderMs(renderDebugInfo?.previewE2eMedianMs)}`
            : ''}
          {renderDebugInfo?.previewE2eKpiState != null
            ? ` · KPI(${renderDebugInfo?.previewE2eKpiTargetMs ?? 16}): ${renderDebugInfo.previewE2eKpiState}`
            : ''}
        </strong>
      </div>
      <div
        className="render-debug-row"
        title="Opcjonalnie: VITE_FILMLAB_E2E_HOST_SCHED_RAF=1 — czas od ostatniego `scheduleProgressiveRender` do pierwszego `requestAnimationFrame` hosta, który wykonuje pracę podglądu (fast/CPU) lub wysyła żądanie do workera. Uzupełnia sched→canvas."
      >
        <span>E2E (sched→rAF host)</span>
        <strong>
          {isEnvE2eHostSchedRaf()
            ? formatRenderMs(renderDebugInfo?.previewE2eHostSchedToRafMs)
            : 'off'}
        </strong>
      </div>
      <div
        className="render-debug-row"
        title="Czas od pierwszego ustawienia isAdjusting (start sesji drag/sterowania) do zapisu pikseli, tylko gdy w momencie prezentacji wciąż isAdjusting. Nie obejmuje kliknięć bez trybu „dostrajanie”."
      >
        <span>E2E (drag→canvas)</span>
        <strong>{formatRenderMs(renderDebugInfo?.previewE2eDragToPresentMs)}</strong>
      </div>
      <div
        className="render-debug-row"
        title="Czas od ostatniego mousedown (suwak, pan widoku, rękojeść kadru, prostowanie) lub intencji klawiatury (`markFilmLabE2eKeyboardE2eIntent`) do zapisu pikseli, gdy trwa odpowiednia sesja: isAdjusting, isPanning, rękojeść (aux) lub klawiatura (sesja w module E2E)."
      >
        <span>E2E (pointer→canvas)</span>
        <strong>{formatRenderMs(renderDebugInfo?.previewE2ePointerToPresentMs)}</strong>
      </div>
      <div
        className="render-debug-row"
        title="Agregacja median E2E per `previewE2ePath` (okno 31 próbek): ułatwia porównanie A/B `fast-main-webgpu-ab` vs `fast-webgl` i torów worker/CPU."
      >
        <span>E2E mediana (per path)</span>
        <strong>{formatPreviewE2ePerPathStats(renderDebugInfo?.previewE2ePerPathStats)}</strong>
      </div>
      <div
        className="render-debug-row"
        title="Skrót A/B E2E: porównanie median `fast-main-webgpu-ab` i `fast-webgl` (okno 31 próbek na ścieżkę)."
      >
        <span>E2E A/B (WebGPU · WebGL)</span>
        <strong>{formatPreviewE2eAbSummary(renderDebugInfo?.previewE2ePerPathStats)}</strong>
      </div>
      <div
        className="render-debug-row"
        title={`Koszt samej klatki (workerRenderMs / fastRenderMs / cpuPreview|full) — mediana ruchoma (31 próbek) i KPI; ${getPreviewE2eFrameCostGateThresholdsHint()}.`}
      >
        <span>E2E koszt klatki</span>
        <strong>
          {formatRenderMs(renderDebugInfo?.previewE2eFrameCostMs)} ·{' '}
          {renderDebugInfo?.previewE2ePath ?? '—'}
          {renderDebugInfo?.previewE2eFrameCostMedianMs != null
            ? ` · med: ${formatRenderMs(renderDebugInfo?.previewE2eFrameCostMedianMs)}`
            : ''}
          {renderDebugInfo?.previewE2eFrameCostKpiState != null
            ? ` · KPI(${renderDebugInfo?.previewE2eFrameCostKpiTargetMs ?? 16}): ${renderDebugInfo.previewE2eFrameCostKpiState}`
            : ''}
        </strong>
      </div>
      <div
        className="render-debug-row"
        title={`Brama mediany kosztu klatki: ${getPreviewE2eFrameCostGateThresholdsHint()}.`}
      >
        <span>E2E gate (koszt klatki)</span>
        <strong>
          <span className={`render-debug-inline-health tone-${previewE2eFrameCostGate.tone}`}>
            {previewE2eFrameCostGate.panelLabel}
          </span>
        </strong>
      </div>
      <div className="render-debug-row">
        <span>Last frame</span>
        <strong>{renderDebugInfo?.proxyLastFrameBackend ?? 'n/a'}</strong>
      </div>
      <div className="render-debug-row">
        <span>Proxy GPU API</span>
        <strong>{renderDebugInfo?.proxyLastFrameGpuImpl ?? 'n/a'}</strong>
      </div>
      {renderDebugInfo?.proxyWebGpuDeviceLost ? (
        <div
          className="render-debug-row"
          title={`${String(renderDebugInfo?.proxyWebGpuDeviceLostMessage ?? '')} — worker wykonuje jedną automatyczną ponowną inicjację (wiadomość reinitWebGpu).`}
        >
          <span>WebGPU utracone</span>
          <strong>
            {renderDebugInfo?.proxyWebGpuDeviceLostAt
              ? new Date(renderDebugInfo.proxyWebGpuDeviceLostAt).toLocaleTimeString()
              : 'tak'}
          </strong>
        </div>
      ) : null}
      {renderDebugInfo?.proxyWebGpuReinitFailedAt ? (
        <div
          className="render-debug-row"
          title={String(renderDebugInfo?.proxyWebGpuReinitFailedMessage ?? '')}
        >
          <span>WebGPU reinit: błąd</span>
          <strong>
            {new Date(renderDebugInfo.proxyWebGpuReinitFailedAt).toLocaleTimeString()}
          </strong>
        </div>
      ) : null}
      <div className="render-debug-row">
        <span>Source ready</span>
        <strong>{renderDebugInfo?.proxySourceReady ? 'yes' : 'no'}</strong>
      </div>
      <div
        className="render-debug-row"
        title="Kontekst WebGL, upload wejścia (rgba8), FBO+blit, atlas LUT (rgba16f / rgba8), precyzja fragmentu grading: highp przy fboRgba16f, inaczej mediump. §5.1. Worker: „W · wejście (tex)”."
      >
        <span>Głów. fast · GL / wej. / F / LUT / sh</span>
        <strong>
          {renderDebugInfo?.fastPreviewGlContext ?? '—'} ·{' '}
          {renderDebugInfo?.fastPreviewMainThreadSourceTexFormat ?? '—'} ·{' '}
          {renderDebugInfo?.fastPreviewFloatPipeline ?? '—'} ·{' '}
          {renderDebugInfo?.fastPreviewLutAtlasTexFormat ?? '—'} ·{' '}
          {renderDebugInfo?.fastPreviewGradingPrecision ?? '—'}
        </strong>
      </div>
      <div className="render-debug-row">
        <span>Fast render</span>
        <strong>{formatRenderMs(renderDebugInfo?.fastRenderMs)}</strong>
      </div>
      <div
        className="render-debug-row"
        title="§5.1.1.2: `getNominalProxyRenderSize` jak worker; `tak` = bufor = nominal. Przy `VITE_FILMLAB_CPU_PREVIEW_MATCH_NOMINAL=1` możliwy 2D downscale do nominalu (pole „↓nom”)."
      >
        <span>CPU · nominal = bufor</span>
        <strong>
          {renderDebugInfo?.cpuParityNominalW == null
            ? '—'
            : `${renderDebugInfo.cpuParityNominalW}×${renderDebugInfo.cpuParityNominalH} · ${
                renderDebugInfo.cpuParityMatchNominal ? 'tak' : 'nie'
              }${
                renderDebugInfo?.cpuParityDownscaled ? ' · ↓nom' : ''
              }`}
        </strong>
      </div>
      <div className="render-debug-row">
        <span>CPU preview</span>
        <strong>{formatRenderMs(renderDebugInfo?.cpuPreviewMs)}</strong>
      </div>
      <div className="render-debug-row">
        <span>CPU full</span>
        <strong>{formatRenderMs(renderDebugInfo?.cpuFullMs)}</strong>
      </div>
      <div className="render-debug-row">
        <span>Worker RT</span>
        <strong>{formatRenderMs(renderDebugInfo?.workerRenderMs)}</strong>
      </div>
      <div
        className="render-debug-row"
        title="Tylko wywołanie GPU render() w workerze (WebGL2/WebGPU); bez postMessage i kompozycji w wątku głównym"
      >
        <span>W · GPU render</span>
        <strong>{formatRenderMs(renderDebugInfo?.proxyWorkerGpuRenderMs)}</strong>
      </div>
      <div
        className="render-debug-row"
        title="Ścieżka CPU w workerze: pętla pikseli i krzywe (od alokacji bufora do zwrócenia pikseli); bez transferu do wątku głównego. „Pełen nominal” = ten sam W×H co kafle GPU gdy VITE_FILMLAB_PROXY_OUTPUT_TILES."
      >
        <span>W · CPU render</span>
        <strong>
          {formatRenderMs(renderDebugInfo?.proxyWorkerCpuRenderMs)}
          {renderDebugInfo?.proxyLastFrameBackend === 'cpu' && renderDebugInfo?.proxyWorkerCpuFullNominalParity
            ? ' · nominal'
            : ''}
        </strong>
      </div>
      <div
        className="render-debug-row"
        title="VITE_FILMLAB_PROXY_CPU_YIELD_EVERY — co ile wierszy pętli CPU workera `setTimeout(0)`; puste = wył. Skrót: npm run dev:proxy-cpu-yield"
      >
        <span>W · CPU yield</span>
        <strong>{formatViteProxyCpuYieldEvery()}</strong>
      </div>
      {rawBackendAbSummary ? (
        <div className={`render-debug-block tone-${rawBackendAbSummary.scoreQualityTone}`}>
          <div className="render-debug-block-title-row">
            <div className="render-debug-block-title">RAW A/B</div>
            <span className={`render-debug-quality-pill tone-${rawBackendAbSummary.scoreQualityTone}`}>
              {rawBackendAbSummary.scoreQualityTone === 'good'
                ? 'GOOD'
                : rawBackendAbSummary.scoreQualityTone === 'neutral'
                  ? 'NEUTRAL'
                  : 'RISKY'}
            </span>
          </div>
          <div className="render-debug-row">
            <span>Winner</span>
            <strong>{rawBackendAbSummary.winnerBackend}</strong>
          </div>
          <div className="render-debug-row">
            <span>Path</span>
            <strong>{rawBackendAbSummary.winnerLabel}</strong>
          </div>
          <div className="render-debug-row">
            <span>Delta</span>
            <strong>
              {rawBackendAbSummary.scoreDelta == null
                ? 'n/a'
                : rawBackendAbSummary.scoreDelta >= 0
                  ? `+${rawBackendAbSummary.scoreDelta.toFixed(2)}`
                  : rawBackendAbSummary.scoreDelta.toFixed(2)}
            </strong>
          </div>
          <div className="render-debug-row">
            <span>Primary</span>
            <strong>
              {rawBackendAbSummary.primaryScore == null
                ? 'n/a'
                : rawBackendAbSummary.primaryScore.toFixed(2)}
            </strong>
          </div>
          <div className="render-debug-row">
            <span>Alternate</span>
            <strong>
              {rawBackendAbSummary.alternateScore == null
                ? 'n/a'
                : rawBackendAbSummary.alternateScore.toFixed(2)}
            </strong>
          </div>
          <div className="render-debug-row">
            <span>Reason</span>
            <strong>{rawBackendAbSummary.reason}</strong>
          </div>
          {rawBackendAbSummary.diffHeatmap ? (
            <>
              <div className="render-debug-row">
                <span>Diff mean ΔL</span>
                <strong>
                  {rawBackendAbSummary.diffHeatmap.meanDelta == null
                    ? 'n/a'
                    : rawBackendAbSummary.diffHeatmap.meanDelta.toFixed(2)}
                </strong>
              </div>
              <div className="render-debug-row">
                <span>Diff p95/max</span>
                <strong>
                  {rawBackendAbSummary.diffHeatmap.p95Delta == null
                    ? 'n/a'
                    : rawBackendAbSummary.diffHeatmap.p95Delta.toFixed(2)}
                  {' / '}
                  {rawBackendAbSummary.diffHeatmap.maxDelta == null
                    ? 'n/a'
                    : rawBackendAbSummary.diffHeatmap.maxDelta.toFixed(2)}
                </strong>
              </div>
              {rawBackendAbSummary.diffHeatmap.dataUrl ? (
                <div className="render-debug-heatmap-wrap">
                  <img
                    src={rawBackendAbSummary.diffHeatmap.dataUrl}
                    alt="Heatmap różnic A/B"
                    className="render-debug-heatmap"
                  />
                </div>
              ) : null}
            </>
          ) : null}
          <div className="render-debug-backend-controls">
            <button
              type="button"
              className={`render-debug-chip${rawBackendMode === 'auto' ? ' active' : ''}`}
              onClick={() => setRawBackendMode('auto')}
            >
              AUTO
            </button>
            <button
              type="button"
              className={`render-debug-chip${rawBackendMode === 'quicklook' ? ' active' : ''}`}
              onClick={() => setRawBackendMode('quicklook')}
            >
              QL
            </button>
            <button
              type="button"
              className={`render-debug-chip${rawBackendMode === 'sips' ? ' active' : ''}`}
              onClick={() => setRawBackendMode('sips')}
            >
              SIPS
            </button>
            <button
              type="button"
              className="render-debug-chip winner"
              onClick={() => {
                if (rawBackendAbSummary.winnerMode) {
                  setRawBackendMode(rawBackendAbSummary.winnerMode);
                }
              }}
              disabled={!rawBackendAbSummary.winnerMode}
              title="Wymuś backend zwycięzcy z ostatniego A/B"
            >
              FORCE WINNER
            </button>
          </div>
          <div className="render-debug-row">
            <span title={`Skrót: Shift+${SHORTCUT_KEYS.rawLinearStage}`}>RAW Linear Stage</span>
            <strong>{rawLinearStageModeLabel}</strong>
          </div>
          <div className="render-debug-backend-controls">
            <button
              type="button"
              className={`render-debug-chip${rawLinearStageMode === 'auto' ? ' active' : ''}`}
              onClick={() => setRawLinearStageMode('auto')}
            >
              LINEAR AUTO
            </button>
            <button
              type="button"
              className={`render-debug-chip${rawLinearStageMode === 'on' ? ' active' : ''}`}
              onClick={() => setRawLinearStageMode('on')}
            >
              LINEAR ON
            </button>
            <button
              type="button"
              className={`render-debug-chip${rawLinearStageMode === 'off' ? ' active' : ''}`}
              onClick={() => setRawLinearStageMode('off')}
            >
              LINEAR OFF
            </button>
          </div>
        </div>
      ) : null}
      {rawQualityQaSummary ? (
        <div className={`render-debug-block tone-${rawQualityQaSummary.tone}`}>
          <div className="render-debug-block-title-row">
            <div className="render-debug-block-title">RAW QA</div>
            <span className={`render-debug-quality-pill tone-${rawQualityQaSummary.tone}`}>
              {rawQualityQaSummary.label}
            </span>
          </div>
          <div className="render-debug-row">
            <span>Status</span>
            <strong>{rawQualityQaSummary.statusText}</strong>
          </div>
          <div className="render-debug-row">
            <span>Highlights</span>
            <strong>{formatRatioPercent(rawQualityQaSummary.metrics.highlightClipRatio, 2)}</strong>
          </div>
          <div className="render-debug-row">
            <span>Shadows</span>
            <strong>{formatRatioPercent(rawQualityQaSummary.metrics.shadowClipRatio, 2)}</strong>
          </div>
          <div className="render-debug-row">
            <span>Decode L/NB</span>
            <strong>
              {Number.isFinite(rawQualityQaSummary.metrics.meanLuma)
                ? rawQualityQaSummary.metrics.meanLuma.toFixed(2)
                : 'n/a'}
              {' / '}
              {formatRatioPercent(rawQualityQaSummary.metrics.nonBlackRatio, 2)}
            </strong>
          </div>
          <div className="render-debug-row">
            <span>Guard / black frame</span>
            <strong>
              {rawQualityQaSummary.metrics.blackOutputGuardTriggered ? 'guard-on' : 'guard-off'}
              {' / '}
              {rawQualityQaSummary.metrics.suspectedBlackFrame ? 'suspected' : 'ok'}
            </strong>
          </div>
        </div>
      ) : null}
      {renderDebugInfo?.proxyWorkerReason ? (
        <div className="render-debug-reason">{renderDebugInfo.proxyWorkerReason}</div>
      ) : null}
      {mainPreviewAbFallbackReason ? (
        <div className="render-debug-reason">{mainPreviewAbFallbackReason}</div>
      ) : null}
    </div>
  );
}
