import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  FILMLAB_RECIPE_APPLY_UI_EVENT,
  RECIPE_IMPORT_UI_CODE,
  applyRecipeTextToWorkbench,
  isFilmLabRecipeDropFilename,
  recipeImportUiDetailLine,
  translateRecipeSoftWarningsLine,
} from './filmLab/recipe/index.js';
import { useI18n } from './i18n';

function formatRenderMs(value, dash) {
  return Number.isFinite(value) ? `${Number(value).toFixed(1)} ms` : dash;
}

function formatPreviewE2ePerPathStats(stats, dash) {
  if (!stats || typeof stats !== 'object') {
    return dash;
  }
  const prefer = ['fast-main-webgpu-ab', 'fast-webgl', 'worker-gpu', 'cpu-preview', 'cpu-full'];
  const keys = Object.keys(stats);
  if (!keys.length) {
    return dash;
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
  return chunks.length ? chunks.join(' | ') : dash;
}

function formatPreviewE2eAbSummary(stats, t, dash) {
  if (!stats || typeof stats !== 'object') {
    return dash;
  }
  const wg = stats['fast-main-webgpu-ab'];
  const gl = stats['fast-webgl'];
  const wgMed = Number(wg?.medianMs);
  const glMed = Number(gl?.medianMs);
  const wgCount = Number(wg?.count);
  const glCount = Number(gl?.count);
  const wgLabel = Number.isFinite(wgMed) ? `${wgMed.toFixed(1)}ms` : dash;
  const glLabel = Number.isFinite(glMed) ? `${glMed.toFixed(1)}ms` : dash;
  const wgN = Number.isFinite(wgCount) ? Math.floor(wgCount) : null;
  const glN = Number.isFinite(glCount) ? Math.floor(glCount) : null;
  const wgSuffix = wgN != null ? ` (n=${wgN})` : '';
  const glSuffix = glN != null ? ` (n=${glN})` : '';
  const wgPart = `${wgLabel}${wgSuffix}`;
  const glPart = `${glLabel}${glSuffix}`;
  if (!Number.isFinite(wgMed) && !Number.isFinite(glMed)) {
    return dash;
  }
  if (!Number.isFinite(wgMed) || !Number.isFinite(glMed)) {
    return t('filmLab.renderDebug.e2eAbPairPartial', { wgPart, glPart });
  }
  const delta = Number((wgMed - glMed).toFixed(2));
  const faster =
    delta <= 0 ? t('filmLab.renderDebug.e2eFasterWebGpu') : t('filmLab.renderDebug.e2eFasterWebGl');
  const deltaAbs = Math.abs(delta).toFixed(2);
  return t('filmLab.renderDebug.e2eAbDelta', {
    wgPart,
    glPart,
    deltaMs: deltaAbs,
    faster,
  });
}

function formatMainPreviewAbRolloutHealth(renderDebugInfo, dash) {
  return getMainPreviewAbRolloutHealthInfo(renderDebugInfo, { dashMark: dash }).panelLabel;
}

function formatMainPreviewAbRolloutHealthSummary(renderDebugInfo, dash) {
  const label = formatMainPreviewAbRolloutHealth(renderDebugInfo, dash);
  if (label === dash) {
    return null;
  }
  return label;
}

function getMainPreviewAbRolloutHealthTone(renderDebugInfo) {
  return getMainPreviewAbRolloutHealthInfo(renderDebugInfo).tone;
}

function formatMainPreviewAbRolloutGate(renderDebugInfo, dash) {
  return getMainPreviewAbRolloutGateInfo(renderDebugInfo, { dashMark: dash }).panelLabel;
}

function getMainPreviewAbRolloutGateTone(renderDebugInfo) {
  return getMainPreviewAbRolloutGateInfo(renderDebugInfo).tone;
}

function getMainPreviewAbFallbackReason(renderDebugInfo, t) {
  const path = String(renderDebugInfo?.mainThreadWebGpuPreviewAbPath ?? '').trim();
  if (path !== 'webgl-fallback') {
    return '';
  }
  const decision = String(renderDebugInfo?.mainThreadWebGpuPreviewAbDecision ?? '').trim();
  if (decision === 'armed_runtime_error') {
    return t('filmLab.renderDebug.fallbackRuntimeError');
  }
  if (decision === 'armed_runtime_fallback') {
    return t('filmLab.renderDebug.fallbackRuntimeFallback');
  }
  if (decision === 'armed_probe_fail') {
    return t('filmLab.renderDebug.fallbackProbeFail');
  }
  return t('filmLab.renderDebug.fallbackGeneric');
}

/** Worker vs wątek główny: osobne `getOrCreatePersistentWebGpuDevice` — format 3D LUT może się różnić. */
function formatWebGpuLut3dMainWorkerParityLine(renderDebugInfo, t, dash) {
  const w = renderDebugInfo?.proxyWorkerWebGpuLut3dTexFormat;
  const m = renderDebugInfo?.mainThreadWebGpuLut3dTexFormat;
  const wL = w != null && String(w).trim() !== '' ? String(w) : dash;
  const mL = m != null && String(m).trim() !== '' ? String(m) : dash;
  if (w == null && m == null) {
    return dash;
  }
  const both = w != null && m != null;
  const same = both && String(w) === String(m);
  const tail = both ? (same ? t('filmLab.renderDebug.paritySuffixSame') : t('filmLab.renderDebug.paritySuffixDiff')) : '';
  return `${t('filmLab.renderDebug.parityWorkerTag')} ${wL} · ${t('filmLab.renderDebug.parityMainTag')} ${mL}${tail}`;
}

/** Hex #RRGGBB z pierwszych trzech kanałów (jak `rb0` w wierszu main·preview) — tylko diagnostyka. */
function formatReadbackRgba8HexRgb(rgba, dash) {
  if (!Array.isArray(rgba) || rgba.length < 3) {
    return dash;
  }
  return `#${[0, 1, 2]
    .map((i) => Math.floor(Number(rgba[i])).toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * Porównanie readbacku 1×1 (0,0) z proxy WebGPU w workerze vs sondy wątku głównego.
 * Osobne urządzenia/rozdzielczości/ścieżki — zgodność hex nie jest oczekiwana; służy do szybkiego skanu.
 */
function formatWebGpuReadbackMainWParityLine(renderDebugInfo, t, dash) {
  const w = renderDebugInfo?.proxyWorkerWebGpuReadbackRgba8;
  const m = renderDebugInfo?.mainThreadWebGpuHostSourceReadbackRgba8;
  const wH = formatReadbackRgba8HexRgb(w, dash);
  const mH = formatReadbackRgba8HexRgb(m, dash);
  if (wH === dash && mH === dash) {
    return dash;
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
  const tail = both ? (same ? t('filmLab.renderDebug.paritySuffixSame') : t('filmLab.renderDebug.paritySuffixDiff')) : '';
  return `${t('filmLab.renderDebug.parityWorkerTag')} ${wH}${wSuffix} · ${t('filmLab.renderDebug.parityMainTag')} ${mH}${mSuffix}${tail}`;
}

function formatWebGpuReadbackMainWParityRgb(renderDebugInfo, t) {
  const w = renderDebugInfo?.proxyWorkerWebGpuReadbackRgba8;
  const m = renderDebugInfo?.mainThreadWebGpuHostSourceReadbackRgba8;
  if (!Array.isArray(w) || w.length < 3 || !Array.isArray(m) || m.length < 3) {
    return 'n/a';
  }
  const same = [0, 1, 2].every(
    (i) => Math.floor(Number(w[i])) === Math.floor(Number(m[i])),
  );
  return same ? t('filmLab.renderDebug.readbackRgbMatch') : t('filmLab.renderDebug.readbackRgbDiff');
}

function formatViteProxyCpuYieldEvery(dash) {
  const v = import.meta?.env?.VITE_FILMLAB_PROXY_CPU_YIELD_EVERY;
  if (v == null || String(v).trim() === '') {
    return dash;
  }
  return String(v).trim();
}

function formatWebGpuAdapterLabel(renderDebugInfo, t, dash) {
  const api = renderDebugInfo?.webGpuApi;
  const a = renderDebugInfo?.webGpuAdapter;
  const info = renderDebugInfo?.webGpuAdapterInfo;
  if (!a || a.status === 'pending') {
    if (api && !api.exposed) {
      return t('filmLab.renderDebug.notApplicable');
    }
    return t('filmLab.renderDebug.ellipsis');
  }
  if (a.status === 'unavailable') {
    return t('filmLab.renderDebug.notApplicable');
  }
  if (a.status === 'no-adapter') {
    return t('filmLab.renderDebug.gpuNoAdapter');
  }
  if (a.status === 'error') {
    return a.reason || t('filmLab.renderDebug.errorShort');
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
    return t('filmLab.renderDebug.workerGpuStatusOk');
  }
  return dash;
}

function formatWebGpuDeviceLabel(renderDebugInfo, t, dash) {
  const d = renderDebugInfo?.webGpuDevice;
  if (!d || d.status === 'pending') {
    return t('filmLab.renderDebug.ellipsis');
  }
  if (d.status === 'unavailable') {
    return t('filmLab.renderDebug.notApplicable');
  }
  if (d.status === 'error') {
    return d.reason || t('filmLab.renderDebug.errorShort');
  }
  if (d.status === 'ok' && d.limits?.maxTextureDimension2D) {
    return t('filmLab.renderDebug.webGpuDeviceDimsOk', { px: d.limits.maxTextureDimension2D });
  }
  if (d.status === 'ok') {
    return t('filmLab.renderDebug.workerGpuStatusOk');
  }
  return dash;
}

function formatSharedArrayBufferHostLine(renderDebugInfo, t, dash) {
  const s = renderDebugInfo?.sharedArrayBufferHost;
  if (!s) {
    return dash;
  }
  const coi = s.crossOriginIsolated;
  const coiLabel =
    coi == null
      ? t('filmLab.renderDebug.notApplicable')
      : coi
        ? t('filmLab.renderDebug.yesLower')
        : t('filmLab.renderDebug.noLower');
  const sab = s.sabConstructible ? t('filmLab.renderDebug.yesLower') : t('filmLab.renderDebug.noLower');
  const smoke = s.smokeOk
    ? t('filmLab.renderDebug.smokeOkBytes', { bytes: Math.floor(Number(s.smokeBytes) || 0) })
    : t('filmLab.renderDebug.smokeFail');
  const policy = String(s.policyState ?? 'n/a');
  return t('filmLab.renderDebug.sabHostLine', { sab, coi: coiLabel, smoke, policy });
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

function formatWorkerWebGpuStatus(w, t, dash) {
  if (!w || w.status === 'pending') {
    return t('filmLab.renderDebug.ellipsis');
  }
  if (w.status === 'skipped') {
    return w.reason || t('filmLab.renderDebug.gpuSkipped');
  }
  if (w.status === 'error') {
    return w.reason || t('filmLab.renderDebug.errorShort');
  }
  if (w.status === 'ready') {
    return t('filmLab.renderDebug.workerGpuStatusOk');
  }
  return dash;
}

function formatBatchZipTotalMs(snapshot, dash) {
  const total = snapshot?.timingsMs?.total;
  return Number.isFinite(Number(total)) ? `${Number(total).toFixed(1)} ms` : dash;
}

function formatProxyNominalDebugLine(info, t, dash) {
  const nw = info?.proxyWorkerNominalW;
  const nh = info?.proxyWorkerNominalH;
  const max = info?.proxyWorkerProxyMaxEffective;
  const iw = info?.proxyInputBufferW;
  const ih = info?.proxyInputBufferH;
  if (nw == null || nh == null) {
    return dash;
  }
  const head = `${nw}×${nh} · max ${max ?? dash}`;
  if (iw != null && ih != null) {
    if (iw === nw && ih === nh) {
      return `${head}${t('filmLab.renderDebug.proxyNominalEqualsBuffer', { w: iw, h: ih })}`;
    }
    return `${head}${t('filmLab.renderDebug.proxyNominalBuffered', { w: iw, h: ih })}`;
  }
  return head;
}

export default function FilmLabRenderDebugPanel({
  open,
  adjustments,
  hasImage,
  uploadedFile,
  exportDebugReport,
  exportRecipeSidecar,
  copyRecipeDocumentJson,
  debugExportFeedback,
  recipeExportFeedback,
  recipeClipboardFeedback,
  applyRecipeDocument,
  renderDebugInfo,
  previewPathLabel,
  rawBackendAbSummary,
  rawBackendMode,
  setRawBackendMode,
  rawLinearStageMode,
  setRawLinearStageMode,
  rawLinearStageModeLabel,
  rawQualityQaSummary,
  maskGraphEvaluatorStub,
  maskEnginePayloadHints,
}) {
  const { t } = useI18n();
  const dash = t('filmLab.renderDebug.dashMark');
  const [lastBatchPerf, setLastBatchPerf] = useState(() => getLastBatchPerfSnapshot());
  const [batchPerfCopyFeedback, setBatchPerfCopyFeedback] = useState(null);
  const [recipeImportFeedback, setRecipeImportFeedback] = useState(null);
  const [recipeImportWarnings, setRecipeImportWarnings] = useState(null);
  const recipeImportWarningsDisplay = useMemo(
    () =>
      recipeImportWarnings ? translateRecipeSoftWarningsLine(recipeImportWarnings, t) : null,
    [recipeImportWarnings, t],
  );
  const [recipeFileDragOverPanel, setRecipeFileDragOverPanel] = useState(false);
  const recipeFileDragActiveRef = useRef(false);
  const recipeFileInputRef = useRef(null);
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

  useEffect(() => {
    if (!open) {
      setRecipeImportWarnings(null);
      recipeFileDragActiveRef.current = false;
      setRecipeFileDragOverPanel(false);
    }
  }, [open]);

  const failRecipeImport = useCallback((detail) => {
    setRecipeImportFeedback('error');
    setRecipeImportWarnings(
      typeof detail === 'string' && detail.trim() !== '' ? detail.trim() : null,
    );
    setTimeout(() => setRecipeImportFeedback(null), 1500);
  }, []);

  const applyRecipeApplyResultToUi = useCallback(
    (result) => {
      if (!result || typeof result !== 'object') {
        return;
      }
      if (result.ok) {
        setRecipeImportFeedback('ok');
        setRecipeImportWarnings(
          typeof result.warningsLine === 'string' && result.warningsLine.trim() !== ''
            ? result.warningsLine.trim()
            : null,
        );
        setTimeout(() => setRecipeImportFeedback(null), 1200);
      } else {
        failRecipeImport(result.detail);
      }
    },
    [failRecipeImport],
  );

  useEffect(() => {
    if (!open || typeof window === 'undefined') {
      return undefined;
    }
    const handler = (event) => {
      applyRecipeApplyResultToUi(event.detail);
    };
    window.addEventListener(FILMLAB_RECIPE_APPLY_UI_EVENT, handler);
    return () => window.removeEventListener(FILMLAB_RECIPE_APPLY_UI_EVENT, handler);
  }, [open, applyRecipeApplyResultToUi]);

  const applyRecipeFromText = useCallback(
    (text) => {
      try {
        const result = applyRecipeTextToWorkbench(text, applyRecipeDocument);
        applyRecipeApplyResultToUi(result);
      } catch (e) {
        failRecipeImport(
          recipeImportUiDetailLine(RECIPE_IMPORT_UI_CODE.IMPORT_APPLY_THREW, e?.message ?? e),
        );
      }
    },
    [applyRecipeDocument, applyRecipeApplyResultToUi, failRecipeImport],
  );

  const handleRecipeImportFileChange = useCallback(
    async (event) => {
      const input = event?.target;
      const file = input?.files?.[0];
      if (input) {
        input.value = '';
      }
      if (!file) {
        return;
      }
      try {
        const text = await file.text();
        applyRecipeFromText(text);
      } catch (e) {
        failRecipeImport(
          recipeImportUiDetailLine(RECIPE_IMPORT_UI_CODE.IMPORT_FILE_READ_FAILED, e?.message ?? e),
        );
      }
    },
    [applyRecipeFromText, failRecipeImport],
  );

  const handleRecipePasteFromClipboard = useCallback(async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
        failRecipeImport(RECIPE_IMPORT_UI_CODE.CLIPBOARD_READ_TEXT_UNAVAILABLE);
        return;
      }
      const text = await navigator.clipboard.readText();
      if (typeof text !== 'string' || text.trim() === '') {
        failRecipeImport(RECIPE_IMPORT_UI_CODE.CLIPBOARD_EMPTY_RECIPE_TEXT);
        return;
      }
      applyRecipeFromText(text.trim());
    } catch (e) {
      failRecipeImport(
        recipeImportUiDetailLine(RECIPE_IMPORT_UI_CODE.CLIPBOARD_READ_FAILED, e?.message ?? e),
      );
    }
  }, [applyRecipeFromText, failRecipeImport]);

  const handleRecipePanelDragEnter = useCallback(
    (event) => {
      if (typeof applyRecipeDocument !== 'function') {
        return;
      }
      const types = event.dataTransfer?.types;
      if (!types || !Array.from(types).includes('Files')) {
        return;
      }
      event.preventDefault();
      if (!recipeFileDragActiveRef.current) {
        recipeFileDragActiveRef.current = true;
        setRecipeFileDragOverPanel(true);
      }
    },
    [applyRecipeDocument],
  );

  const handleRecipePanelDragOver = useCallback(
    (event) => {
      if (typeof applyRecipeDocument !== 'function') {
        return;
      }
      const types = event.dataTransfer?.types;
      if (!types || !Array.from(types).includes('Files')) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      if (!recipeFileDragActiveRef.current) {
        recipeFileDragActiveRef.current = true;
        setRecipeFileDragOverPanel(true);
      }
    },
    [applyRecipeDocument],
  );

  const handleRecipePanelDragLeave = useCallback((event) => {
    if (event.currentTarget?.contains?.(event.relatedTarget)) {
      return;
    }
    recipeFileDragActiveRef.current = false;
    setRecipeFileDragOverPanel(false);
  }, []);

  const handleRecipePanelDrop = useCallback(
    async (event) => {
      recipeFileDragActiveRef.current = false;
      setRecipeFileDragOverPanel(false);
      if (typeof applyRecipeDocument !== 'function') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const file = event.dataTransfer?.files?.[0];
      if (!file || !isFilmLabRecipeDropFilename(file.name)) {
        return;
      }
      try {
        const text = await file.text();
        applyRecipeFromText(text);
      } catch (e) {
        failRecipeImport(
          recipeImportUiDetailLine(RECIPE_IMPORT_UI_CODE.IMPORT_DROP_FILE_FAILED, e?.message ?? e),
        );
      }
    },
    [applyRecipeDocument, applyRecipeFromText, failRecipeImport],
  );

  const mainPreviewAbHealthSummary = formatMainPreviewAbRolloutHealthSummary(renderDebugInfo, dash);
  const mainPreviewAbHealthTone = getMainPreviewAbRolloutHealthTone(renderDebugInfo);
  const mainPreviewAbRolloutGate = formatMainPreviewAbRolloutGate(renderDebugInfo, dash);
  const mainPreviewAbRolloutGateTone = getMainPreviewAbRolloutGateTone(renderDebugInfo);
  const previewE2eFrameCostGate = getPreviewE2eFrameCostGateInfo(renderDebugInfo, {
    dashMark: dash,
  });
  const mainPreviewAbFallbackReason = getMainPreviewAbFallbackReason(renderDebugInfo, t);

  if (!open) {
    return null;
  }

  return (
    <div
      className={`render-debug-panel${recipeFileDragOverPanel ? ' render-debug-panel--recipe-drop' : ''}`}
      onDragEnter={handleRecipePanelDragEnter}
      onDragOver={handleRecipePanelDragOver}
      onDragLeave={handleRecipePanelDragLeave}
      onDrop={handleRecipePanelDrop}
      title={t('filmLab.renderDebug.panelDropTitle')}
    >
      <div className="render-debug-header">
        <div className="render-debug-title-wrap">
          <div className="render-debug-title">{t('filmLab.renderDebug.title')}</div>
          <div
            className="render-debug-health-legend"
            title={t('filmLab.renderDebug.healthLegendTitle', {
              hint: getMainPreviewAbRolloutHealthThresholdsHint(),
            })}
          >
            <span className="render-debug-health-legend-label">{t('filmLab.renderDebug.healthLegendShort')}</span>
            <span className="render-debug-inline-health tone-ok">{t('filmLab.renderDebug.healthPillOk')}</span>
            <span className="render-debug-inline-health tone-warn">{t('filmLab.renderDebug.healthPillWarn')}</span>
            <span className="render-debug-inline-health tone-warmup">{t('filmLab.renderDebug.healthPillWarmup')}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            ref={recipeFileInputRef}
            type="file"
            accept=".json,.recipe.json,application/json"
            style={{ display: 'none' }}
            aria-hidden
            tabIndex={-1}
            onChange={handleRecipeImportFileChange}
          />
          <button
            type="button"
            className="render-debug-export-btn"
            onClick={exportDebugReport}
            title={t('filmLab.renderDebug.exportDiagJsonTitle')}
          >
            {debugExportFeedback === 'saved'
              ? t('filmLab.renderDebug.jsonSaved')
              : debugExportFeedback === 'error'
                ? t('filmLab.renderDebug.errorShort')
                : t('filmLab.renderDebug.exportJsonButton')}
          </button>
          <button
            type="button"
            className="render-debug-export-btn"
            onClick={exportRecipeSidecar}
            title={t('filmLab.renderDebug.recipeDownloadTitle')}
          >
            {recipeExportFeedback === 'saved'
              ? t('filmLab.renderDebug.recipeExportOk')
              : recipeExportFeedback === 'error'
                ? t('filmLab.renderDebug.recipeExportErr')
                : t('filmLab.renderDebug.recipeExportDefault')}
          </button>
          <button
            type="button"
            className="render-debug-export-btn"
            disabled={typeof applyRecipeDocument !== 'function'}
            onClick={() => recipeFileInputRef.current?.click()}
            title={t('filmLab.renderDebug.recipeLoadTitle')}
          >
            {recipeImportFeedback === 'ok'
              ? t('filmLab.renderDebug.recipeImportOk')
              : recipeImportFeedback === 'error'
                ? t('filmLab.renderDebug.recipeImportErr')
                : t('filmLab.renderDebug.recipeImportDefault')}
          </button>
          <button
            type="button"
            className="render-debug-export-btn"
            disabled={typeof applyRecipeDocument !== 'function'}
            onClick={handleRecipePasteFromClipboard}
            title={t('filmLab.renderDebug.recipePasteTitle')}
          >
            {recipeImportFeedback === 'ok'
              ? t('filmLab.renderDebug.recipePasteOk')
              : recipeImportFeedback === 'error'
                ? t('filmLab.renderDebug.recipePasteErr')
                : t('filmLab.renderDebug.recipePasteDefault')}
          </button>
          <button
            type="button"
            className="render-debug-export-btn"
            onClick={copyRecipeDocumentJson}
            disabled={typeof copyRecipeDocumentJson !== 'function'}
            title={t('filmLab.renderDebug.recipeCopyJsonTitle')}
          >
            {recipeClipboardFeedback === 'copied'
              ? t('filmLab.renderDebug.recipeJsonClipboardOk')
              : recipeClipboardFeedback === 'error'
                ? t('filmLab.renderDebug.recipeJsonClipboardErr')
                : t('filmLab.renderDebug.recipeJsonClipboardDefault')}
          </button>
        </div>
      </div>
      {recipeImportWarnings ? (
        <div
          className="render-debug-reason"
          title={recipeImportWarningsDisplay || recipeImportWarnings}
          aria-live="polite"
          role="status"
        >
          {recipeImportWarningsDisplay || recipeImportWarnings}
        </div>
      ) : null}
      {maskGraphEvaluatorStub != null && typeof maskGraphEvaluatorStub === 'object' ? (
        <div className="render-debug-block tone-neutral">
          <div className="render-debug-block-title-row">
            <div className="render-debug-block-title">{t('filmLab.renderDebug.maskGraphStubTitle')}</div>
          </div>
          <div className="render-debug-row">
            <span>{t('filmLab.renderDebug.maskGraphStubGraphs')}</span>
            <strong>{maskGraphEvaluatorStub.graphCount}</strong>
          </div>
          <div className="render-debug-row">
            <span>{t('filmLab.renderDebug.maskGraphStubNodes')}</span>
            <strong>{maskGraphEvaluatorStub.nodeCountTotal}</strong>
          </div>
          {maskGraphEvaluatorStub.hasGenerativeStub ? (
            <div className="render-debug-reason">{t('filmLab.renderDebug.maskGraphGenerativePill')}</div>
          ) : null}
          {maskGraphEvaluatorStub?.hasDepthRangeSemantic ? (
            <div className="render-debug-reason">{t('filmLab.renderDebug.maskGraphDepthProxyPill')}</div>
          ) : null}
          {maskGraphEvaluatorStub?.hasBrushEdgeSemantic ? (
            <div className="render-debug-reason">{t('filmLab.renderDebug.maskGraphBrushEdgePill')}</div>
          ) : null}
          <div className="render-debug-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '6px' }}>
            <span>{t('filmLab.renderDebug.maskGraphStubTypes')}</span>
            <strong
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                fontSize: 11,
                fontWeight: 600,
                wordBreak: 'break-all',
              }}
            >
              {Array.isArray(maskGraphEvaluatorStub.semanticNodeTypes) &&
              maskGraphEvaluatorStub.semanticNodeTypes.length > 0
                ? maskGraphEvaluatorStub.semanticNodeTypes.join(', ')
                : dash}
            </strong>
          </div>
          {maskEnginePayloadHints != null && typeof maskEnginePayloadHints === 'object' ? (
            <>
              <div className="render-debug-row">
                <span>{t('filmLab.renderDebug.maskPayloadWorkerIntent')}</span>
                <strong>
                  {maskEnginePayloadHints.generativeStubIntent
                    ? t('filmLab.renderDebug.diagShortOn')
                    : t('filmLab.renderDebug.diagShortOff')}
                </strong>
              </div>
              <div className="render-debug-row">
                <span>{t('filmLab.renderDebug.maskPayloadWorkerSemantic')}</span>
                <strong>
                  {maskEnginePayloadHints.hasGenerativeSemanticStub
                    ? t('filmLab.renderDebug.diagShortOn')
                    : t('filmLab.renderDebug.diagShortOff')}
                </strong>
              </div>
              <div className="render-debug-row">
                <span>{t('filmLab.renderDebug.maskPayloadWorkerDepthRange')}</span>
                <strong>
                  {maskEnginePayloadHints?.hasDepthRangeSemantic
                    ? t('filmLab.renderDebug.diagShortOn')
                    : t('filmLab.renderDebug.diagShortOff')}
                </strong>
              </div>
              <div className="render-debug-row">
                <span>{t('filmLab.renderDebug.maskPayloadWorkerBrushEdge')}</span>
                <strong>
                  {maskEnginePayloadHints?.hasBrushEdgeSemantic
                    ? t('filmLab.renderDebug.diagShortOn')
                    : t('filmLab.renderDebug.diagShortOff')}
                </strong>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      <div className="render-debug-block tone-neutral">
        <div className="render-debug-block-title-row">
          <div className="render-debug-block-title">{t('filmLab.renderDebug.batchZipTitle')}</div>
          <button
            type="button"
            className="render-debug-export-btn"
            onClick={copyLastBatchPerfJson}
            disabled={!lastBatchPerf}
            title={t('filmLab.renderDebug.batchPerfCopyTitle')}
          >
            {batchPerfCopyFeedback === 'copied'
              ? '✓'
              : batchPerfCopyFeedback === 'error'
                ? '✕'
                : t('filmLab.renderDebug.batchPerfCopyLabel')}
          </button>
        </div>
        <div className="render-debug-row">
          <span>{t('filmLab.renderDebug.batchMeasurement')}</span>
          <strong>
            {IS_BATCH_PERF_ENABLED ? t('filmLab.renderDebug.stateOn') : t('filmLab.renderDebug.stateOff')}
          </strong>
        </div>
        {IS_BATCH_PERF_ENABLED && !lastBatchPerf ? (
          <div className="render-debug-reason">{t('filmLab.renderDebug.batchNoMeasurement')}</div>
        ) : null}
        {lastBatchPerf ? (
          <>
            <div className="render-debug-row">
              <span>{t('filmLab.renderDebug.batchTotal')}</span>
              <strong>{formatBatchZipTotalMs(lastBatchPerf, dash)}</strong>
            </div>
            <div className="render-debug-row">
              <span>{t('filmLab.renderDebug.batchFilesAdded')}</span>
              <strong>
                {lastBatchPerf.addedCount ?? dash}
                {typeof lastBatchPerf.totalFiles === 'number' ? ` / ${lastBatchPerf.totalFiles}` : ''}
              </strong>
            </div>
            <div className="render-debug-row">
              <span>{t('filmLab.renderDebug.batchZipRow')}</span>
              <strong>
                {lastBatchPerf.timingsMs?.zip == null
                  ? dash
                  : `${Number(lastBatchPerf.timingsMs.zip).toFixed(1)} ms`}
              </strong>
            </div>
            {lastBatchPerf.aborted ? (
              <div className="render-debug-reason">{t('filmLab.renderDebug.batchAborted')}</div>
            ) : null}
          </>
        ) : null}
        {!IS_BATCH_PERF_ENABLED ? (
          <div className="render-debug-reason" title={t('filmLab.renderDebug.batchPerfHintDisabled')}>
            {t('filmLab.renderDebug.batchPerfEnableHint')}
          </div>
        ) : null}
      </div>
      <div className="render-debug-row">
        <span>{t('filmLab.renderDebug.dragWorkerRow')}</span>
        <strong>
          {renderDebugInfo?.workerDragEnabled
            ? t('filmLab.renderDebug.diagShortOn')
            : t('filmLab.renderDebug.diagShortOff')}
        </strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.buildWebGpuProxyTitle')}
      >
        <span>{t('filmLab.renderDebug.webGpuBuildProxyRow')}</span>
        <strong>
          {renderDebugInfo?.webgpuProxyBuild
            ? t('filmLab.renderDebug.diagShortOn')
            : t('filmLab.renderDebug.diagShortOff')}
        </strong>
      </div>
      <div className="render-debug-row">
        <span>{t('filmLab.renderDebug.proxyGpuRow')}</span>
        <strong>
          {renderDebugInfo?.proxyGpuEnabled
            ? t('filmLab.renderDebug.diagShortOn')
            : t('filmLab.renderDebug.diagShortOff')}
        </strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.profileLutPreviewTitle')}
      >
        <span>{t('filmLab.renderDebug.profileLutPreview')}</span>
        <strong>
          {isEnvEnablePreviewLuts() ? t('filmLab.renderDebug.stateOn') : t('filmLab.renderDebug.stateOff')}
        </strong>
      </div>
      <div className="render-debug-row" title={t('filmLab.renderDebug.webGpuApiTitle')}>
        <span>{t('filmLab.renderDebug.webGpuApiRowShort')}</span>
        <strong>
          {renderDebugInfo?.webGpuApi == null
            ? dash
            : renderDebugInfo.webGpuApi.exposed
              ? t('filmLab.renderDebug.yesLower')
              : t('filmLab.renderDebug.noLower')}
        </strong>
      </div>
      <div
        className="render-debug-row"
        title={
          renderDebugInfo?.webGpuAdapterInfo
            ? JSON.stringify(renderDebugInfo.webGpuAdapterInfo)
            : t('filmLab.renderDebug.webGpuAdapterTitleFallback')
        }
      >
        <span>{t('filmLab.renderDebug.webGpuAdapterRow')}</span>
        <strong>{formatWebGpuAdapterLabel(renderDebugInfo, t, dash)}</strong>
      </div>
      <div
        className="render-debug-row"
        title={
          renderDebugInfo?.webGpuDevice?.limits
            ? JSON.stringify(renderDebugInfo.webGpuDevice.limits)
            : t('filmLab.renderDebug.webGpuDeviceTitleFallback')
        }
      >
        <span>{t('filmLab.renderDebug.webGpuDeviceRow')}</span>
        <strong>{formatWebGpuDeviceLabel(renderDebugInfo, t, dash)}</strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.webGpuMainPreviewTitle', {
          hint: getMainPreviewAbRolloutHealthThresholdsHint(),
        })}
      >
        <span>{t('filmLab.renderDebug.webGpuMainPreviewRow')}</span>
        <strong>
          {renderDebugInfo?.mainThreadWebGpuPreviewStatus ?? dash}
          {renderDebugInfo?.mainThreadWebGpuPreviewAbEnabled != null
            ? t('filmLab.renderDebug.mainPreviewSuffixAb', {
                state: renderDebugInfo.mainThreadWebGpuPreviewAbEnabled
                  ? t('filmLab.renderDebug.diagShortOn')
                  : t('filmLab.renderDebug.diagShortOff'),
              })
            : ''}
          {renderDebugInfo?.mainThreadWebGpuPreviewAbDecision != null
            ? t('filmLab.renderDebug.mainPreviewSuffixDecision', {
                value: renderDebugInfo.mainThreadWebGpuPreviewAbDecision,
              })
            : ''}
          {renderDebugInfo?.mainThreadWebGpuPreviewAbPath != null
            ? t('filmLab.renderDebug.mainPreviewSuffixPath', {
                value: renderDebugInfo.mainThreadWebGpuPreviewAbPath,
              })
            : ''}
          {renderDebugInfo?.mainThreadWebGpuPreviewAbRenderMs != null &&
          Number.isFinite(Number(renderDebugInfo.mainThreadWebGpuPreviewAbRenderMs))
            ? t('filmLab.renderDebug.mainPreviewSuffixAbMs', {
                ms: `${Number(renderDebugInfo.mainThreadWebGpuPreviewAbRenderMs).toFixed(1)} ms`,
              })
            : ''}
          {renderDebugInfo?.mainThreadWebGpuPreviewAbSourceTexFormat != null
            ? t('filmLab.renderDebug.mainPreviewSuffixSrcTex', {
                fmt: renderDebugInfo.mainThreadWebGpuPreviewAbSourceTexFormat,
              })
            : ''}
          {Number.isFinite(Number(renderDebugInfo?.mainThreadWebGpuPreviewAbFramesTotal))
            ? t('filmLab.renderDebug.mainPreviewSuffixFrames', {
                n: Math.floor(Number(renderDebugInfo.mainThreadWebGpuPreviewAbFramesTotal)),
              })
            : ''}
          {Number.isFinite(Number(renderDebugInfo?.mainThreadWebGpuPreviewAbFramesWebGpuMain)) &&
          Number.isFinite(Number(renderDebugInfo?.mainThreadWebGpuPreviewAbFramesWebGlFallback))
            ? t('filmLab.renderDebug.mainPreviewSuffixFrameRatio', {
                main: Math.floor(Number(renderDebugInfo.mainThreadWebGpuPreviewAbFramesWebGpuMain)),
                fallback: Math.floor(Number(renderDebugInfo.mainThreadWebGpuPreviewAbFramesWebGlFallback)),
              })
            : ''}
          {Number.isFinite(Number(renderDebugInfo?.mainThreadWebGpuPreviewAbWebGpuRatio))
            ? t('filmLab.renderDebug.mainPreviewSuffixWgpuPct', {
                pct: (Number(renderDebugInfo.mainThreadWebGpuPreviewAbWebGpuRatio) * 100).toFixed(1),
              })
            : ''}
          {mainPreviewAbHealthSummary != null ? ' · ' : ''}
          {mainPreviewAbHealthSummary != null ? (
            <span className={`render-debug-inline-health tone-${mainPreviewAbHealthTone}`}>
              {t('filmLab.renderDebug.mainPreviewHealthInline', { label: mainPreviewAbHealthSummary })}
            </span>
          ) : null}
          {renderDebugInfo?.mainThreadWebGpuMaxTextureDimension2d != null
            ? t('filmLab.renderDebug.suffixTex2dMax', {
                n: renderDebugInfo.mainThreadWebGpuMaxTextureDimension2d,
              })
            : ''}
          {renderDebugInfo?.mainThreadWebGpuMaxTextureDimension3d != null
            ? t('filmLab.renderDebug.suffixTex3dMax', {
                n: renderDebugInfo.mainThreadWebGpuMaxTextureDimension3d,
              })
            : ''}
          {renderDebugInfo?.mainThreadWebGpuLut3dTexFormat != null
            ? t('filmLab.renderDebug.suffixLut3dFmt', {
                fmt: renderDebugInfo.mainThreadWebGpuLut3dTexFormat,
              })
            : ''}
          {renderDebugInfo?.mainThreadWebGpuCanvasClearPass != null
            ? `${t('filmLab.renderDebug.mainGpuPassCanvas')} ${
                renderDebugInfo.mainThreadWebGpuCanvasClearPass
                  ? t('filmLab.renderDebug.yesLower')
                  : t('filmLab.renderDebug.noLower')
              }`
            : ''}
          {renderDebugInfo?.mainThreadWebGpuSolidDrawPass != null
            ? `${t('filmLab.renderDebug.mainGpuPassDraw')} ${
                renderDebugInfo.mainThreadWebGpuSolidDrawPass
                  ? t('filmLab.renderDebug.yesLower')
                  : t('filmLab.renderDebug.noLower')
              }`
            : ''}
          {renderDebugInfo?.mainThreadWebGpuTextureDrawPass != null
            ? `${t('filmLab.renderDebug.mainGpuPassTex')} ${
                renderDebugInfo.mainThreadWebGpuTextureDrawPass
                  ? t('filmLab.renderDebug.yesLower')
                  : t('filmLab.renderDebug.noLower')
              }`
            : ''}
          {renderDebugInfo?.mainThreadWebGpuProxyShaderDrawPass != null
            ? `${t('filmLab.renderDebug.mainGpuPassProxy')} ${
                renderDebugInfo.mainThreadWebGpuProxyShaderDrawPass
                  ? t('filmLab.renderDebug.yesLower')
                  : t('filmLab.renderDebug.noLower')
              }`
            : ''}
          {renderDebugInfo?.mainThreadWebGpuHostSourceProxyPass != null
            ? `${t('filmLab.renderDebug.mainGpuPassSrc')} ${
                renderDebugInfo.mainThreadWebGpuHostSourceProxyPass
                  ? t('filmLab.renderDebug.yesLower')
                  : t('filmLab.renderDebug.noLower')
              }`
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
        title={t('filmLab.renderDebug.rolloutHealthRowTitle', {
          hint: getMainPreviewAbRolloutHealthThresholdsHint(),
        })}
      >
        <span>{t('filmLab.renderDebug.webGpuAbRolloutHealth')}</span>
        <strong>
          <span className={`render-debug-inline-health tone-${mainPreviewAbHealthTone}`}>
            {formatMainPreviewAbRolloutHealth(renderDebugInfo, dash)}
          </span>
        </strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.rolloutGateRowTitle', {
          hint: getMainPreviewAbRolloutGateThresholdsHint(),
        })}
      >
        <span>{t('filmLab.renderDebug.webGpuAbRolloutGate')}</span>
        <strong>
          <span className={`render-debug-inline-health tone-${mainPreviewAbRolloutGateTone}`}>
            {mainPreviewAbRolloutGate}
          </span>
        </strong>
      </div>
      <div
        className="render-debug-row"
        title={`${t('filmLab.renderDebug.hostSabTitleBody')}\n${JSON.stringify(renderDebugInfo?.sharedArrayBufferHost ?? null, null, 0)}`}
      >
        <span>{t('filmLab.renderDebug.hostSharedArrayBuffer')}</span>
        <strong>{formatSharedArrayBufferHostLine(renderDebugInfo, t, dash)}</strong>
      </div>
      {asWorkerWebGpuRenderShape(renderDebugInfo?.webGpuWorker) ? (
        <>
          <div
            className="render-debug-row"
            title={t('filmLab.renderDebug.workerApiTitle')}
          >
            <span>{t('filmLab.renderDebug.workerApiRow')}</span>
            <strong>
              {renderDebugInfo?.webGpuWorker?.webGpuApi?.exposed
                ? t('filmLab.renderDebug.yesLower')
                : t('filmLab.renderDebug.noLower')}
            </strong>
          </div>
          <div
            className="render-debug-row"
            title={
              renderDebugInfo?.webGpuWorker?.webGpuAdapterInfo
                ? JSON.stringify(renderDebugInfo.webGpuWorker.webGpuAdapterInfo)
                : t('filmLab.renderDebug.webGpuAdapterTitleFallback')
            }
          >
            <span>{t('filmLab.renderDebug.workerAdapterRow')}</span>
            <strong>
              {formatWebGpuAdapterLabel(asWorkerWebGpuRenderShape(renderDebugInfo?.webGpuWorker) || {}, t, dash)}
            </strong>
          </div>
          <div
            className="render-debug-row"
            title={
              renderDebugInfo?.webGpuWorker?.webGpuDevice?.limits
                ? JSON.stringify(renderDebugInfo.webGpuWorker.webGpuDevice.limits)
                : t('filmLab.renderDebug.webGpuDeviceTitleFallback')
            }
          >
            <span>{t('filmLab.renderDebug.workerDeviceRow')}</span>
            <strong>
              {formatWebGpuDeviceLabel(
                asWorkerWebGpuRenderShape(renderDebugInfo?.webGpuWorker) || {},
                t,
                dash,
              )}
            </strong>
          </div>
        </>
      ) : (
        <div
          className="render-debug-row"
          title={t('filmLab.renderDebug.workerWebGpuProbeTitle')}
        >
          <span>{t('filmLab.renderDebug.workerWebGpuStatusRow')}</span>
          <strong>{formatWorkerWebGpuStatus(renderDebugInfo?.webGpuWorker, t, dash)}</strong>
        </div>
      )}
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.canvasFormatTitle')}
      >
        <span>{t('filmLab.renderDebug.workerCanvasFormat')}</span>
        <strong>{renderDebugInfo?.proxyWorkerWebGpuCanvasFormat ?? dash}</strong>
      </div>
      <div
        className="render-debug-row"
        title={
          renderDebugInfo?.proxyWorkerWebGpuDeviceLimits
            ? JSON.stringify(renderDebugInfo.proxyWorkerWebGpuDeviceLimits, null, 0)
            : t('filmLab.renderDebug.workerTexLimitsTitleFallback')
        }
      >
        <span>{t('filmLab.renderDebug.workerTexLimits')}</span>
        <strong>
          {renderDebugInfo?.proxyWorkerWebGpuDeviceLimits
            ? `2D ${renderDebugInfo.proxyWorkerWebGpuDeviceLimits.maxTextureDimension2D} · 3D ${renderDebugInfo.proxyWorkerWebGpuDeviceLimits.maxTextureDimension3D}`
            : dash}
        </strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.workerGlLimitsTitle')}
      >
        <span>{t('filmLab.renderDebug.workerGlTexLimits')}</span>
        <strong>
          {renderDebugInfo?.proxyLastFrameGpuImpl === 'webgl' &&
          renderDebugInfo?.proxyWorkerWebGlMaxTex2d != null
            ? `2D ${renderDebugInfo.proxyWorkerWebGlMaxTex2d} · 3D ${renderDebugInfo.proxyWorkerWebGlMaxTex3d ?? dash}`
            : dash}
        </strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.workerGlFboTitle')}
      >
        <span>{t('filmLab.renderDebug.workerGlFboRgba16f')}</span>
        <strong>
          {renderDebugInfo?.proxyLastFrameGpuImpl === 'webgl' &&
          renderDebugInfo?.proxyWorkerWebGlRgba16f != null
            ? `${renderDebugInfo.proxyWorkerWebGlRgba16f ? t('filmLab.renderDebug.probeYes') : t('filmLab.renderDebug.probeNo')}${
                renderDebugInfo?.proxyWorkerWebGlFbo16fBlit != null
                  ? ` · ${renderDebugInfo.proxyWorkerWebGlFbo16fBlit ? t('filmLab.renderDebug.blitYes') : t('filmLab.renderDebug.blitNo')}`
                  : ''
              }`
            : dash}
        </strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.workerGl3dLutTitle')}
      >
        <span>{t('filmLab.renderDebug.workerGl3dLut')}</span>
        <strong>
          {renderDebugInfo?.proxyLastFrameGpuImpl === 'webgl' &&
          renderDebugInfo?.proxyWorkerWebGl3dLutRgba16f != null
            ? renderDebugInfo.proxyWorkerWebGl3dLutRgba16f
              ? 'rgba16f'
              : 'rgba8'
            : dash}
        </strong>
      </div>
      {renderDebugInfo?.proxyLastFrameBackend === 'gpu' &&
      hasProxyWorkerGpuTexDimensions(renderDebugInfo) ? (
        <div
          className="render-debug-row"
          title={t('filmLab.renderDebug.gpuInputTexTitle')}
        >
          <span>{t('filmLab.renderDebug.workerGpuInputTex')}</span>
          <strong>
            {!isProxyWorkerGpuInputTexDownscaled(renderDebugInfo)
              ? `${renderDebugInfo.proxyWorkerGpuTexW}×${renderDebugInfo.proxyWorkerGpuTexH}`
              : `${renderDebugInfo.proxyWorkerGpuTexW}×${renderDebugInfo.proxyWorkerGpuTexH}${t(
                  'filmLab.renderDebug.gpuInputFromFull',
                  {
                    w: renderDebugInfo.proxyWorkerFullSourceW,
                    h: renderDebugInfo.proxyWorkerFullSourceH,
                  },
                )}`}
          </strong>
        </div>
      ) : null}
      {renderDebugInfo?.proxyLastFrameBackend === 'gpu' &&
      hasProxyWorkerGpuTexDimensions(renderDebugInfo) ? (
        <div
          className="render-debug-row"
          title={t('filmLab.renderDebug.gpuInputDownscaleTitle')}
        >
          <span>{t('filmLab.renderDebug.workerInputDownscale')}</span>
          <strong>
            {renderDebugInfo.proxyWorkerGpuInputDownscaleMs === null
              ? dash
              : renderDebugInfo.proxyWorkerGpuInputDownscaleMs === 0
                ? t('filmLab.renderDebug.cacheHitMs')
                : formatRenderMs(renderDebugInfo.proxyWorkerGpuInputDownscaleMs, dash)}
          </strong>
        </div>
      ) : null}
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.proxyNominalTitle')}
      >
        <span>{t('filmLab.renderDebug.workerNominalCompute')}</span>
        <strong>{formatProxyNominalDebugLine(renderDebugInfo, t, dash)}</strong>
      </div>
      {readEnvFlag(import.meta?.env?.VITE_FILMLAB_PROXY_MATCH_PREVIEW) ? (
        <div
          className="render-debug-row"
          title={t('filmLab.renderDebug.proxyMatchPreviewTitle')}
        >
          <span>{t('filmLab.renderDebug.workerMatchPreviewBuffer')}</span>
          <strong>{t('filmLab.renderDebug.stateOn')}</strong>
        </div>
      ) : null}
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.proxyOutputFitTitle')}
      >
        <span>{t('filmLab.renderDebug.workerOutputFit2d')}</span>
        <strong>{getProxyWorkerOutputFitStatusLabel(renderDebugInfo, t)}</strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.proxyTilesTitle')}
      >
        <span>{t('filmLab.renderDebug.workerTilesMax2d')}</span>
        <strong>{getProxyWorkerOutputTileStatusLabel(renderDebugInfo, t)}</strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.proxySourceTexFmtTitle')}
      >
        <span>{t('filmLab.renderDebug.workerInputTexFormat')}</span>
        <strong>{renderDebugInfo?.proxyWorkerWebGpuSourceTexFormat ?? dash}</strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.lut3dWorkerTitle')}
      >
        <span>{t('filmLab.renderDebug.workerLut3dTexRow')}</span>
        <strong>{renderDebugInfo?.proxyWorkerWebGpuLut3dTexFormat ?? dash}</strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.lut3dParityTitle')}
      >
        <span>{t('filmLab.renderDebug.lut3dWorkerMain')}</span>
        <strong>{formatWebGpuLut3dMainWorkerParityLine(renderDebugInfo, t, dash)}</strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.readbackRbTitle')}
      >
        <span>{t('filmLab.renderDebug.readbackWMainRb')}</span>
        <strong>{formatWebGpuReadbackMainWParityLine(renderDebugInfo, t, dash)}</strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.readbackRgbTitle')}
      >
        <span>{t('filmLab.renderDebug.readbackParityRgb')}</span>
        <strong>{formatWebGpuReadbackMainWParityRgb(renderDebugInfo, t)}</strong>
      </div>
      <div className="render-debug-row">
        <span>{t('filmLab.renderDebug.statusRow')}</span>
        <strong>{renderDebugInfo?.proxyWorkerStatus ?? t('filmLab.renderDebug.notApplicable')}</strong>
      </div>
      <div className="render-debug-row">
        <span>{t('filmLab.renderDebug.profileModeRow')}</span>
        <strong>{renderDebugInfo?.profileRenderMode ?? t('filmLab.renderDebug.notApplicable')}</strong>
      </div>
      <div className="render-debug-row">
        <span>{t('filmLab.renderDebug.previewPathDebugRow')}</span>
        <strong>{previewPathLabel}</strong>
      </div>
      <div className="render-debug-row">
        <span>{t('filmLab.renderDebug.aiRunsRow')}</span>
        <strong>{Number(adjustments?.aiAssistRuns ?? 0)}</strong>
      </div>
      <div className="render-debug-row">
        <span>{t('filmLab.renderDebug.aiLatencyRow')}</span>
        <strong>
          {Number.isFinite(Number(adjustments?.aiAssistLastLatencyMs))
            ? `${Number(adjustments.aiAssistLastLatencyMs).toFixed(2)} ms`
            : dash}
          {' · avg '}
          {Number(adjustments?.aiAssistRuns ?? 0) > 0 &&
          Number.isFinite(Number(adjustments?.aiAssistTotalLatencyMs))
            ? `${(
                Number(adjustments.aiAssistTotalLatencyMs) /
                Number(adjustments.aiAssistRuns)
              ).toFixed(2)} ms`
            : dash}
        </strong>
      </div>
      <div className="render-debug-row">
        <span>{t('filmLab.renderDebug.aiKpiRow')}</span>
        <strong>
          {Number.isFinite(Number(adjustments?.aiAssistLastLatencyMs))
            ? Number(adjustments.aiAssistLastLatencyMs) <= 100
              ? t('filmLab.renderDebug.aiKpiOk')
              : t('filmLab.renderDebug.aiKpiWarn')
            : t('filmLab.renderDebug.aiKpiPending')}
        </strong>
      </div>
      <div className="render-debug-row">
        <span>{t('filmLab.renderDebug.workflowProRow')}</span>
        <strong>
          {uploadedFile instanceof File && hasImage
            ? t('filmLab.renderDebug.workflowProSessionReady')
            : t('filmLab.renderDebug.workflowProSessionIdle')}
          {' · '}
          {t('filmLab.renderDebug.workflowProCatalogPending')}
        </strong>
      </div>
      <div className="render-debug-row">
        <span>{t('filmLab.renderDebug.lastRenderPathRow')}</span>
        <strong>{renderDebugInfo?.lastRenderPath ?? t('filmLab.renderDebug.notApplicable')}</strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.interactionKindTitle')}
      >
        <span>{t('filmLab.renderDebug.interactionEngineRow')}</span>
        <strong>{renderDebugInfo?.interactionKind ?? dash}</strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.isAdjustingTitle')}
      >
        <span>{t('filmLab.renderDebug.adjustingEngineRow')}</span>
        <strong>
          {renderDebugInfo?.isAdjusting ? t('filmLab.renderDebug.yesLower') : t('filmLab.renderDebug.noLower')}
        </strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.e2ePanTitle')}
      >
        <span>{t('filmLab.renderDebug.e2ePanRow')}</span>
        <strong>
          {renderDebugInfo?.e2ePanning ? t('filmLab.renderDebug.yesLower') : t('filmLab.renderDebug.noLower')}
        </strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.e2eAuxTitle')}
      >
        <span>{t('filmLab.renderDebug.e2eAuxRow')}</span>
        <strong>{e2ePointerAux ? t('filmLab.renderDebug.yesLower') : t('filmLab.renderDebug.noLower')}</strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.e2eKbdTitle')}
      >
        <span>{t('filmLab.renderDebug.e2eKbdRow')}</span>
        <strong>{e2ePointerKeyboard ? t('filmLab.renderDebug.yesLower') : t('filmLab.renderDebug.noLower')}</strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.e2eSchedCanvasTitle')}
      >
        <span>{t('filmLab.renderDebug.e2eSchedCanvas')}</span>
        <strong>
          {formatRenderMs(renderDebugInfo?.previewE2eIntentToPresentMs, dash)} ·{' '}
          {renderDebugInfo?.previewE2ePath ?? dash}
          {renderDebugInfo?.previewE2eMedianMs != null
            ? t('filmLab.renderDebug.e2eMedSuffix', {
                ms: formatRenderMs(renderDebugInfo?.previewE2eMedianMs, dash),
              })
            : ''}
          {renderDebugInfo?.previewE2eKpiState != null
            ? t('filmLab.renderDebug.e2eKpiSuffix', {
                target: renderDebugInfo?.previewE2eKpiTargetMs ?? 16,
                state: renderDebugInfo.previewE2eKpiState,
              })
            : ''}
        </strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.e2eSchedRafTitle')}
      >
        <span>{t('filmLab.renderDebug.e2eSchedRafHost')}</span>
        <strong>
          {isEnvE2eHostSchedRaf()
            ? formatRenderMs(renderDebugInfo?.previewE2eHostSchedToRafMs, dash)
            : t('filmLab.renderDebug.e2eSchedRafDisabled')}
        </strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.e2eDragCanvasTitle')}
      >
        <span>{t('filmLab.renderDebug.e2eDragCanvas')}</span>
        <strong>{formatRenderMs(renderDebugInfo?.previewE2eDragToPresentMs, dash)}</strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.e2ePointerCanvasTitle')}
      >
        <span>{t('filmLab.renderDebug.e2ePointerCanvas')}</span>
        <strong>{formatRenderMs(renderDebugInfo?.previewE2ePointerToPresentMs, dash)}</strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.e2eMedianPerPathTitle')}
      >
        <span>{t('filmLab.renderDebug.e2eMedianPerPath')}</span>
        <strong>{formatPreviewE2ePerPathStats(renderDebugInfo?.previewE2ePerPathStats, dash)}</strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.e2eAbMedianTitle')}
      >
        <span>{t('filmLab.renderDebug.e2eAbWebGpuWebGl')}</span>
        <strong>{formatPreviewE2eAbSummary(renderDebugInfo?.previewE2ePerPathStats, t, dash)}</strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.e2eFrameCostTitle', {
          hint: getPreviewE2eFrameCostGateThresholdsHint(),
        })}
      >
        <span>{t('filmLab.renderDebug.e2eFrameCost')}</span>
        <strong>
          {formatRenderMs(renderDebugInfo?.previewE2eFrameCostMs, dash)} ·{' '}
          {renderDebugInfo?.previewE2ePath ?? dash}
          {renderDebugInfo?.previewE2eFrameCostMedianMs != null
            ? t('filmLab.renderDebug.e2eMedSuffix', {
                ms: formatRenderMs(renderDebugInfo?.previewE2eFrameCostMedianMs, dash),
              })
            : ''}
          {renderDebugInfo?.previewE2eFrameCostKpiState != null
            ? t('filmLab.renderDebug.e2eKpiSuffix', {
                target: renderDebugInfo?.previewE2eFrameCostKpiTargetMs ?? 16,
                state: renderDebugInfo.previewE2eFrameCostKpiState,
              })
            : ''}
        </strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.e2eFrameCostGateTitle', {
          hint: getPreviewE2eFrameCostGateThresholdsHint(),
        })}
      >
        <span>{t('filmLab.renderDebug.e2eGateFrameCost')}</span>
        <strong>
          <span className={`render-debug-inline-health tone-${previewE2eFrameCostGate.tone}`}>
            {previewE2eFrameCostGate.panelLabel}
          </span>
        </strong>
      </div>
      <div className="render-debug-row">
        <span>{t('filmLab.renderDebug.lastFrameRow')}</span>
        <strong>{renderDebugInfo?.proxyLastFrameBackend ?? t('filmLab.renderDebug.notApplicable')}</strong>
      </div>
      <div className="render-debug-row">
        <span>{t('filmLab.renderDebug.proxyGpuApiRow')}</span>
        <strong>{renderDebugInfo?.proxyLastFrameGpuImpl ?? t('filmLab.renderDebug.notApplicable')}</strong>
      </div>
      {renderDebugInfo?.proxyWebGpuDeviceLost ? (
        <div
          className="render-debug-row"
          title={t('filmLab.renderDebug.webGpuLostTitle', {
            message: String(renderDebugInfo?.proxyWebGpuDeviceLostMessage ?? ''),
          })}
        >
          <span>{t('filmLab.renderDebug.webGpuLost')}</span>
          <strong>
            {renderDebugInfo?.proxyWebGpuDeviceLostAt
              ? new Date(renderDebugInfo.proxyWebGpuDeviceLostAt).toLocaleTimeString()
              : t('filmLab.renderDebug.webGpuLostYes')}
          </strong>
        </div>
      ) : null}
      {renderDebugInfo?.proxyWebGpuReinitFailedAt ? (
        <div
          className="render-debug-row"
          title={String(renderDebugInfo?.proxyWebGpuReinitFailedMessage ?? '')}
        >
          <span>{t('filmLab.renderDebug.webGpuReinitError')}</span>
          <strong>
            {new Date(renderDebugInfo.proxyWebGpuReinitFailedAt).toLocaleTimeString()}
          </strong>
        </div>
      ) : null}
      <div className="render-debug-row">
        <span>{t('filmLab.renderDebug.proxySourceReadyRow')}</span>
        <strong>
          {renderDebugInfo?.proxySourceReady ? t('filmLab.renderDebug.yesLower') : t('filmLab.renderDebug.noLower')}
        </strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.fastGlMainTitle')}
      >
        <span>{t('filmLab.renderDebug.fastGlMainRow')}</span>
        <strong>
          {renderDebugInfo?.fastPreviewGlContext ?? dash} ·{' '}
          {renderDebugInfo?.fastPreviewMainThreadSourceTexFormat ?? dash} ·{' '}
          {renderDebugInfo?.fastPreviewFloatPipeline ?? dash} ·{' '}
          {renderDebugInfo?.fastPreviewLutAtlasTexFormat ?? dash} ·{' '}
          {renderDebugInfo?.fastPreviewGradingPrecision ?? dash}
        </strong>
      </div>
      <div className="render-debug-row">
        <span>{t('filmLab.renderDebug.fastRenderRow')}</span>
        <strong>{formatRenderMs(renderDebugInfo?.fastRenderMs, dash)}</strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.cpuNominalTitle')}
      >
        <span>{t('filmLab.renderDebug.cpuNominalEqualsBuffer')}</span>
        <strong>
          {renderDebugInfo?.cpuParityNominalW == null
            ? dash
            : `${renderDebugInfo.cpuParityNominalW}×${renderDebugInfo.cpuParityNominalH} · ${
                renderDebugInfo.cpuParityMatchNominal
                  ? t('filmLab.renderDebug.yesLower')
                  : t('filmLab.renderDebug.noLower')
              }${renderDebugInfo?.cpuParityDownscaled ? ' · ↓nom' : ''}`}
        </strong>
      </div>
      <div className="render-debug-row">
        <span>{t('filmLab.renderDebug.cpuPreviewRow')}</span>
        <strong>{formatRenderMs(renderDebugInfo?.cpuPreviewMs, dash)}</strong>
      </div>
      <div className="render-debug-row">
        <span>{t('filmLab.renderDebug.cpuFullRow')}</span>
        <strong>{formatRenderMs(renderDebugInfo?.cpuFullMs, dash)}</strong>
      </div>
      <div className="render-debug-row">
        <span>{t('filmLab.renderDebug.workerRtRow')}</span>
        <strong>{formatRenderMs(renderDebugInfo?.workerRenderMs, dash)}</strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.workerGpuRenderTitle')}
      >
        <span>{t('filmLab.renderDebug.workerGpuRender')}</span>
        <strong>{formatRenderMs(renderDebugInfo?.proxyWorkerGpuRenderMs, dash)}</strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.workerCpuRenderTitle')}
      >
        <span>{t('filmLab.renderDebug.workerCpuRender')}</span>
        <strong>
          {formatRenderMs(renderDebugInfo?.proxyWorkerCpuRenderMs, dash)}
          {renderDebugInfo?.proxyLastFrameBackend === 'cpu' && renderDebugInfo?.proxyWorkerCpuFullNominalParity
            ? t('filmLab.renderDebug.nominalSuffix')
            : ''}
        </strong>
      </div>
      <div
        className="render-debug-row"
        title={t('filmLab.renderDebug.workerCpuYieldTitle')}
      >
        <span>{t('filmLab.renderDebug.workerCpuYield')}</span>
        <strong>{formatViteProxyCpuYieldEvery(dash)}</strong>
      </div>
      {rawBackendAbSummary ? (
        <div className={`render-debug-block tone-${rawBackendAbSummary.scoreQualityTone}`}>
          <div className="render-debug-block-title-row">
            <div className="render-debug-block-title">{t('filmLab.renderDebug.rawAbBlockTitle')}</div>
            <span className={`render-debug-quality-pill tone-${rawBackendAbSummary.scoreQualityTone}`}>
              {rawBackendAbSummary.scoreQualityTone === 'good'
                ? t('filmLab.renderDebug.scorePillGood')
                : rawBackendAbSummary.scoreQualityTone === 'neutral'
                  ? t('filmLab.renderDebug.scorePillNeutral')
                  : t('filmLab.renderDebug.scorePillRisky')}
            </span>
          </div>
          <div className="render-debug-row">
            <span>{t('filmLab.renderDebug.winnerRow')}</span>
            <strong>{rawBackendAbSummary.winnerBackend}</strong>
          </div>
          <div className="render-debug-row">
            <span>{t('filmLab.renderDebug.pathRow')}</span>
            <strong>{rawBackendAbSummary.winnerLabel}</strong>
          </div>
          <div className="render-debug-row">
            <span>{t('filmLab.renderDebug.deltaRow')}</span>
            <strong>
              {rawBackendAbSummary.scoreDelta == null
                ? t('filmLab.renderDebug.notApplicable')
                : rawBackendAbSummary.scoreDelta >= 0
                  ? `+${rawBackendAbSummary.scoreDelta.toFixed(2)}`
                  : rawBackendAbSummary.scoreDelta.toFixed(2)}
            </strong>
          </div>
          <div className="render-debug-row">
            <span>{t('filmLab.renderDebug.primaryRow')}</span>
            <strong>
              {rawBackendAbSummary.primaryScore == null
                ? t('filmLab.renderDebug.notApplicable')
                : rawBackendAbSummary.primaryScore.toFixed(2)}
            </strong>
          </div>
          <div className="render-debug-row">
            <span>{t('filmLab.renderDebug.alternateRow')}</span>
            <strong>
              {rawBackendAbSummary.alternateScore == null
                ? t('filmLab.renderDebug.notApplicable')
                : rawBackendAbSummary.alternateScore.toFixed(2)}
            </strong>
          </div>
          <div className="render-debug-row">
            <span>{t('filmLab.renderDebug.reasonRow')}</span>
            <strong>{rawBackendAbSummary.reason}</strong>
          </div>
          {rawBackendAbSummary.diffHeatmap ? (
            <>
              <div className="render-debug-row">
                <span>{t('filmLab.renderDebug.diffMeanDelta')}</span>
                <strong>
                  {rawBackendAbSummary.diffHeatmap.meanDelta == null
                    ? t('filmLab.renderDebug.notApplicable')
                    : rawBackendAbSummary.diffHeatmap.meanDelta.toFixed(2)}
                </strong>
              </div>
              <div className="render-debug-row">
                <span>{t('filmLab.renderDebug.diffP95Max')}</span>
                <strong>
                  {rawBackendAbSummary.diffHeatmap.p95Delta == null
                    ? t('filmLab.renderDebug.notApplicable')
                    : rawBackendAbSummary.diffHeatmap.p95Delta.toFixed(2)}
                  {' / '}
                  {rawBackendAbSummary.diffHeatmap.maxDelta == null
                    ? t('filmLab.renderDebug.notApplicable')
                    : rawBackendAbSummary.diffHeatmap.maxDelta.toFixed(2)}
                </strong>
              </div>
              {rawBackendAbSummary.diffHeatmap.dataUrl ? (
                <div className="render-debug-heatmap-wrap">
                  <img
                    src={rawBackendAbSummary.diffHeatmap.dataUrl}
                    alt={t('filmLab.renderDebug.heatMapAlt')}
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
              {t('filmLab.renderDebug.rawBackendChipAuto')}
            </button>
            <button
              type="button"
              className={`render-debug-chip${rawBackendMode === 'quicklook' ? ' active' : ''}`}
              onClick={() => setRawBackendMode('quicklook')}
            >
              {t('filmLab.renderDebug.rawBackendChipQl')}
            </button>
            <button
              type="button"
              className={`render-debug-chip${rawBackendMode === 'sips' ? ' active' : ''}`}
              onClick={() => setRawBackendMode('sips')}
            >
              {t('filmLab.renderDebug.rawBackendChipSips')}
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
              title={t('filmLab.renderDebug.rawAbForceWinnerTitle')}
            >
              {t('filmLab.renderDebug.rawAbForceWinnerChip')}
            </button>
          </div>
          <div className="render-debug-row">
            <span title={t('filmLab.renderDebug.rawLinearShortcutTitle', { key: SHORTCUT_KEYS.rawLinearStage })}>
              {t('filmLab.renderDebug.rawLinearStageRow')}
            </span>
            <strong>{rawLinearStageModeLabel}</strong>
          </div>
          <div className="render-debug-backend-controls">
            <button
              type="button"
              className={`render-debug-chip${rawLinearStageMode === 'auto' ? ' active' : ''}`}
              onClick={() => setRawLinearStageMode('auto')}
            >
              {t('filmLab.renderDebug.linearStageAuto')}
            </button>
            <button
              type="button"
              className={`render-debug-chip${rawLinearStageMode === 'on' ? ' active' : ''}`}
              onClick={() => setRawLinearStageMode('on')}
            >
              {t('filmLab.renderDebug.linearStageOn')}
            </button>
            <button
              type="button"
              className={`render-debug-chip${rawLinearStageMode === 'off' ? ' active' : ''}`}
              onClick={() => setRawLinearStageMode('off')}
            >
              {t('filmLab.renderDebug.linearStageOff')}
            </button>
          </div>
        </div>
      ) : null}
      {rawQualityQaSummary ? (
        <div className={`render-debug-block tone-${rawQualityQaSummary.tone}`}>
          <div className="render-debug-block-title-row">
            <div className="render-debug-block-title">{t('filmLab.renderDebug.rawQaBlockTitle')}</div>
            <span className={`render-debug-quality-pill tone-${rawQualityQaSummary.tone}`}>
              {rawQualityQaSummary.label}
            </span>
          </div>
          <div className="render-debug-row">
            <span>{t('filmLab.renderDebug.statusTextRow')}</span>
            <strong>{rawQualityQaSummary.statusText}</strong>
          </div>
          <div className="render-debug-row">
            <span>{t('filmLab.renderDebug.highlightsRow')}</span>
            <strong>{formatRatioPercent(rawQualityQaSummary.metrics.highlightClipRatio, 2)}</strong>
          </div>
          <div className="render-debug-row">
            <span>{t('filmLab.renderDebug.shadowsRow')}</span>
            <strong>{formatRatioPercent(rawQualityQaSummary.metrics.shadowClipRatio, 2)}</strong>
          </div>
          <div className="render-debug-row">
            <span>{t('filmLab.renderDebug.decodeLNb')}</span>
            <strong>
              {Number.isFinite(rawQualityQaSummary.metrics.meanLuma)
                ? rawQualityQaSummary.metrics.meanLuma.toFixed(2)
                : t('filmLab.renderDebug.notApplicable')}
              {' / '}
              {formatRatioPercent(rawQualityQaSummary.metrics.nonBlackRatio, 2)}
            </strong>
          </div>
          <div className="render-debug-row">
            <span>{t('filmLab.renderDebug.guardBlackFrame')}</span>
            <strong>
              {rawQualityQaSummary.metrics.blackOutputGuardTriggered
                ? t('filmLab.renderDebug.guardActiveShort')
                : t('filmLab.renderDebug.guardInactiveShort')}
              {' / '}
              {rawQualityQaSummary.metrics.suspectedBlackFrame
                ? t('filmLab.renderDebug.blackSuspectedShort')
                : t('filmLab.renderDebug.blackOkShort')}
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
