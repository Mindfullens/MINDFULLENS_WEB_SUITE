import { MASK_STUDIO_BUILDER_SECTIONS } from './filmLab/maskStudioSectionIds.js';
import { buildSemanticNodesForSlotLike } from './filmLab/recipe/filmLabRecipeSemanticNodes.js';
import { normalizeLocalMaskGraphOp } from './filmLab/localMaskGraph.js';
import { useI18n } from './i18n';

/**
 * Local mask UI: embedded block (panel Detal) + split rails (widok Maski).
 */

function maskSlotSemanticSummary(mask, idx) {
  const nodes = buildSemanticNodesForSlotLike(mask ?? {}, `slot_${idx}`, idx);
  if (nodes.length === 0) {
    return '';
  }
  return nodes
    .map((n) => String(n.type ?? '').replace(/^semantic\./, '').replace(/\.v\d+$/, ''))
    .join(' · ');
}

function depthOnnxStatusLineKey(ui) {
  if (!ui || ui.phase === 'idle') {
    return null;
  }
  if (ui.phase === 'running') {
    return 'filmLab.localMask.depthOnnxStatusRunning';
  }
  if (ui.phase === 'ready') {
    return ui.via === 'luma_env' ? 'filmLab.localMask.depthOnnxStatusLumaTest' : null;
  }
  if (ui.phase === 'fallback') {
    const r = String(ui.reason ?? '');
    const map = {
      no_model_url: 'filmLab.localMask.depthOnnxFallbackNoModelUrl',
      ort_unavailable: 'filmLab.localMask.depthOnnxFallbackOrt',
      fetch_failed: 'filmLab.localMask.depthOnnxFallbackFetch',
      session_failed: 'filmLab.localMask.depthOnnxFallbackSession',
      inputs_not_supported: 'filmLab.localMask.depthOnnxFallbackLayout',
      tensor_layout_failed: 'filmLab.localMask.depthOnnxFallbackLayout',
      tensor_build_failed: 'filmLab.localMask.depthOnnxFallbackLayout',
      run_failed: 'filmLab.localMask.depthOnnxFallbackRun',
      output_extract_failed: 'filmLab.localMask.depthOnnxFallbackOutput',
      wrong_output_length: 'filmLab.localMask.depthOnnxFallbackOutput',
      invalid_input: 'filmLab.localMask.depthOnnxFallbackGeneric',
    };
    return map[r] ?? 'filmLab.localMask.depthOnnxFallbackGeneric';
  }
  return null;
}

function FilmLabDepthMapSourceRow({ adjustments, updateAdjustment, depthOnnxInferenceUi }) {
  const { t } = useI18n();
  if (String(adjustments?.localMaskMode ?? '') !== 'depth') {
    return null;
  }
  const src = String(adjustments?.depthMapSource ?? 'luminance');
  const statusKey = src === 'onnx' ? depthOnnxStatusLineKey(depthOnnxInferenceUi) : null;
  return (
    <>
      <div className="effect-grid" style={{ marginTop: 6 }}>
        <button
          type="button"
          className={`effect-btn${src === 'luminance' ? ' active' : ''}`}
          onClick={() => updateAdjustment('depthMapSource', 'luminance')}
        >
          {t('filmLab.localMask.depthMapSourceLuminance')}
        </button>
        <button
          type="button"
          className={`effect-btn${src === 'onnx' ? ' active' : ''}`}
          onClick={() => updateAdjustment('depthMapSource', 'onnx')}
        >
          {t('filmLab.localMask.depthMapSourceOnnx')}
        </button>
      </div>
      <div className="slider-help">{t('filmLab.localMask.depthMapSourceOnnxHelp')}</div>
      {statusKey ? (
        <div className={`slider-help${depthOnnxInferenceUi?.phase === 'fallback' ? ' film-lab-depth-onnx-warning' : ''}`}>
          {t(statusKey)}
        </div>
      ) : null}
    </>
  );
}

function formatLocalMaskStackMeta(mask, t, opts) {
  const includeBlend = opts?.includeBlend !== false;
  const mode = String(mask?.mode ?? 'brush');
  const modeLabel =
    mode === 'linear'
      ? t('filmLab.localMask.toolLinear')
      : mode === 'radial'
        ? t('filmLab.localMask.toolRadial')
        : mode === 'luma'
          ? t('filmLab.localMask.toolLuma')
          : mode === 'hue'
            ? t('filmLab.localMask.toolHue')
            : mode === 'depth'
              ? t('filmLab.localMask.toolDepth')
              : t('filmLab.localMask.toolBrush');
  const pct = Math.round(Number(mask?.opacity ?? 100));
  let base;
  if (includeBlend) {
    const blend = String(mask?.blend ?? 'normal');
    const blendLabel =
      blend === 'add'
        ? t('filmLab.localMask.metaBlendAdd')
        : blend === 'subtract'
          ? t('filmLab.localMask.metaBlendSubtract')
          : t('filmLab.localMask.metaBlendNormal');
    base = `${modeLabel} · ${pct}% · ${blendLabel}`;
  } else {
    base = `${modeLabel} · ${pct}%`;
  }
  if (mask?.source !== 'ai-assist') {
    return base;
  }
  const aiConfidence = Number(mask?.ai?.confidence);
  const aiSuffix = Number.isFinite(aiConfidence)
    ? `${t('filmLab.localMask.maskMetaSourceAi')} ${Math.round(Math.max(0, Math.min(1, aiConfidence)) * 100)}%`
    : t('filmLab.localMask.maskMetaSourceAi');
  return `${base} · ${aiSuffix}`;
}

function readAiLatencySummary(adjustments) {
  const runs = Number(adjustments?.aiAssistRuns ?? 0);
  const last = Number(adjustments?.aiAssistLastLatencyMs);
  const best = Number(adjustments?.aiAssistBestLatencyMs);
  const worst = Number(adjustments?.aiAssistWorstLatencyMs);
  const total = Number(adjustments?.aiAssistTotalLatencyMs);
  const avg = runs > 0 && Number.isFinite(total) ? total / runs : NaN;
  return {
    runs,
    last: Number.isFinite(last) ? Number(last.toFixed(2)) : null,
    best: Number.isFinite(best) ? Number(best.toFixed(2)) : null,
    worst: Number.isFinite(worst) ? Number(worst.toFixed(2)) : null,
    avg: Number.isFinite(avg) ? Number(avg.toFixed(2)) : null,
  };
}

function FilmLabLocalMaskGraphPanel({ wb }) {
  const { t } = useI18n();
  const { adjustments, updateAdjustment, localMasks } = wb;
  if (adjustments?.uiMode === 'simple') {
    return (
      <div className="effect-section film-lab-mask-graph-v0 subtle">
        <div className="effect-section-title">{t('filmLab.localMask.graphTitle')}</div>
        <div className="slider-help">{t('filmLab.localMask.graphSimpleHidden')}</div>
      </div>
    );
  }
  const stackLen = Math.max(localMasks.length, 1);
  const soloOn = Number(adjustments?.localMaskSoloIndex ?? -1) >= 0;
  const brushOn = adjustments?.brushMaskEnabled !== false;
  const canGraph = brushOn && !soloOn && localMasks.length >= 2;
  const op = normalizeLocalMaskGraphOp(adjustments?.localMaskGraphOp);
  const idxA = Math.min(stackLen - 1, Math.max(0, Number(adjustments?.localMaskGraphIndexA ?? 0)));
  const idxB = Math.min(stackLen - 1, Math.max(0, Number(adjustments?.localMaskGraphIndexB ?? 1)));

  const graphOps = [
    { id: 'union', labelKey: 'filmLab.localMask.opUnion' },
    { id: 'intersect', labelKey: 'filmLab.localMask.opIntersect' },
    { id: 'subtract', labelKey: 'filmLab.localMask.opSubtract' },
    { id: 'invert', labelKey: 'filmLab.localMask.opInvert' },
    { id: 'replace', labelKey: 'filmLab.localMask.opReplace' },
    { id: 'protect', labelKey: 'filmLab.localMask.opProtect' },
  ];

  return (
    <div className={`effect-section film-lab-mask-graph-v0${canGraph ? '' : ' subtle'}`}>
      <div className="effect-section-title">{t('filmLab.localMask.graphTitle')}</div>
      <div className="slider-help">
        {t('filmLab.localMask.graphHelpPrefix')}
        <strong>{t('filmLab.localMask.graphHelpStrong')}</strong>
        {t('filmLab.localMask.graphHelpSuffix')}
      </div>
      {!brushOn ? <div className="slider-help">{t('filmLab.localMask.graphNeedBrush')}</div> : null}
      {soloOn ? <div className="slider-help">{t('filmLab.localMask.graphNeedSoloOff')}</div> : null}
      {brushOn && !soloOn && localMasks.length < 2 ? (
        <div className="slider-help">{t('filmLab.localMask.graphNeedTwoMasks')}</div>
      ) : null}
      <label className="mask-graph-toggle">
        <input
          type="checkbox"
          checked={Boolean(adjustments?.localMaskGraphEnabled)}
          disabled={!canGraph}
          onChange={(e) => updateAdjustment('localMaskGraphEnabled', e.target.checked)}
        />
        <span>{t('filmLab.localMask.graphMergeToggle')}</span>
      </label>
      <div className="effect-grid mask-graph-op-grid">
        {graphOps.map(({ id, labelKey }) => (
          <button
            key={id}
            type="button"
            className={`effect-btn${op === id ? ' active' : ''}`}
            disabled={!canGraph || !adjustments?.localMaskGraphEnabled}
            onClick={() => updateAdjustment('localMaskGraphOp', id)}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
      <div className="mask-graph-select-row">
        <label className="mask-graph-select">
          <span className="slider-label">{t('filmLab.localMask.labelMaskA')}</span>
          <select
            value={idxA}
            disabled={!canGraph || !adjustments?.localMaskGraphEnabled}
            onChange={(e) => updateAdjustment('localMaskGraphIndexA', Number(e.target.value))}
          >
            {localMasks.length === 0 ? (
              <option value={0}>{t('filmLab.localMask.placeholderDash')}</option>
            ) : (
              localMasks.map((m, i) => (
                <option key={`ga-${i}`} value={i}>
                  {String(m?.name ?? t('filmLab.localMask.defaultName', { n: i + 1 }))}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="mask-graph-select">
          <span className="slider-label">{t('filmLab.localMask.labelMaskB')}</span>
          <select
            value={idxB}
            disabled={!canGraph || !adjustments?.localMaskGraphEnabled}
            onChange={(e) => updateAdjustment('localMaskGraphIndexB', Number(e.target.value))}
          >
            {localMasks.length === 0 ? (
              <option value={0}>{t('filmLab.localMask.placeholderDash')}</option>
            ) : (
              localMasks.map((m, i) => (
                <option key={`gb-${i}`} value={i}>
                  {String(m?.name ?? t('filmLab.localMask.defaultName', { n: i + 1 }))}
                </option>
              ))
            )}
          </select>
        </label>
      </div>
      <div className="mask-graph-debug-mini" role="img" aria-label={t('filmLab.localMask.graphDebugAria')}>
        <div className="mask-graph-debug-mini-title">{t('filmLab.localMask.graphDebugTitle')}</div>
        <div className="mask-graph-debug-mini-flow">
          <span className="mask-graph-debug-mini-node">mask_slot_{idxA}</span>
          <span className="mask-graph-debug-mini-op">{op}</span>
          <span className="mask-graph-debug-mini-node">mask_slot_{idxB}</span>
        </div>
      </div>
    </div>
  );
}

export function FilmLabLocalMaskWorkbenchEmbedded({ wb }) {
  const { t } = useI18n();
  const {
    adjustments,
    updateAdjustment,
    renderSlider,
    buildCurrentLocalMask,
    localMasks,
    localMaskSoloIndex,
    localMaskActiveIndex,
    switchLocalMask,
    resetLocalMaskFields,
  } = wb;

  return (
    <div className="effect-section film-lab-mask-workbench film-lab-mask-workbench--embedded">
      <div className="effect-section-title">
        {t('filmLab.localMask.embeddedTitle')}
        <button className="section-reset" type="button" onClick={resetLocalMaskFields}>
          {t('filmLab.localMask.resetWorkbench')}
        </button>
      </div>
      <FilmLabLocalMaskWorkbenchToolGrid
        wb={wb}
        includeStackManagement
        includeModeAndPaintTools
      />
      <FilmLabLocalMaskGraphPanel wb={wb} />
      <FilmLabLocalMaskWorkbenchHelpAndAi wb={wb} />
      <div className="slider-help">
        {t('filmLab.localMask.activeMaskIndex', {
          current: localMaskActiveIndex + 1,
          total: Math.max(1, localMasks.length || 1),
        })}
      </div>
      <div className="local-mask-list">
        {localMasks.map((mask, idx) => (
          <div key={`mask-chip-${idx}`} className={`local-mask-row${idx === localMaskActiveIndex ? ' active' : ''}`}>
            <button
              className={`effect-btn${idx === localMaskActiveIndex ? ' active' : ''}`}
              type="button"
              onClick={() => switchLocalMask(idx)}
            >
              {String(mask?.name ?? t('filmLab.localMask.defaultName', { n: idx + 1 }))}
            </button>
            <span className="local-mask-meta">{formatLocalMaskStackMeta(mask, t)}</span>
            <button
              className={`effect-btn local-mask-mini${mask?.enabled !== false ? ' active' : ''}`}
              type="button"
              aria-label={t('filmLab.localMask.miniMaskToggleTitle')}
              title={t('filmLab.localMask.miniMaskToggleTitle')}
              onClick={() => {
                const nextMasks = localMasks.slice();
                nextMasks[idx] = { ...nextMasks[idx], enabled: !(nextMasks[idx]?.enabled !== false) };
                updateAdjustment('localMasks', nextMasks);
                if (idx === localMaskActiveIndex) {
                  updateAdjustment('localMaskEnabled', nextMasks[idx].enabled !== false);
                }
              }}
            >
              {t('filmLab.localMask.miniMaskToggleLabel')}
            </button>
            <button
              className={`effect-btn local-mask-mini${localMaskSoloIndex === idx ? ' active' : ''}`}
              type="button"
              aria-label={t('filmLab.localMask.miniMaskSoloTitle')}
              title={t('filmLab.localMask.miniMaskSoloTitle')}
              onClick={() => updateAdjustment('localMaskSoloIndex', localMaskSoloIndex === idx ? -1 : idx)}
            >
              {t('filmLab.localMask.miniMaskSoloLabel')}
            </button>
          </div>
        ))}
      </div>
      <div className="slider-wrap">
        <label className="slider-label">{t('filmLab.localMask.maskNameLabel')}</label>
        <input
          className="slider-input"
          type="text"
          value={String(adjustments.localMaskName ?? '')}
          onChange={(event) => {
            const nextName = String(event.target.value ?? '').slice(0, 48);
            updateAdjustment('localMaskName', nextName);
            const nextMasks = localMasks.slice();
            if (nextMasks.length === 0) {
              nextMasks.push({ ...buildCurrentLocalMask(), name: nextName });
            } else {
              nextMasks[localMaskActiveIndex] = {
                ...nextMasks[localMaskActiveIndex],
                name: nextName,
              };
            }
            updateAdjustment('localMasks', nextMasks);
          }}
          placeholder={t('filmLab.localMask.defaultName', { n: localMaskActiveIndex + 1 })}
        />
      </div>
      {renderSlider('localMaskOpacity')}
      <div className="effect-grid">
        <button
          className={`effect-btn${adjustments.localMaskBlend === 'normal' ? ' active' : ''}`}
          type="button"
          onClick={() => updateAdjustment('localMaskBlend', 'normal')}
        >
          {t('filmLab.localMask.blendNormal')}
        </button>
        <button
          className={`effect-btn${adjustments.localMaskBlend === 'add' ? ' active' : ''}`}
          type="button"
          onClick={() => updateAdjustment('localMaskBlend', 'add')}
        >
          {t('filmLab.localMask.blendAdd')}
        </button>
        <button
          className={`effect-btn${adjustments.localMaskBlend === 'subtract' ? ' active' : ''}`}
          type="button"
          onClick={() => updateAdjustment('localMaskBlend', 'subtract')}
        >
          {t('filmLab.localMask.blendSubtract')}
        </button>
      </div>
      {renderSlider('brushMaskExposure')}
      {adjustments.localMaskMode === 'brush' || adjustments.localMaskMode === 'depth' ? (
        <>
          {['brushMaskRadius', 'brushMaskFeather', 'brushMaskEdgeSensitivity'].map(renderSlider)}
          <div className="slider-help subtle">{t('filmLab.localMask.edgeBrushHelp')}</div>
        </>
      ) : null}
      {adjustments.localMaskMode === 'depth'
        ? ['depthMaskMin', 'depthMaskMax', 'depthMaskFeather'].map(renderSlider)
        : null}
      {adjustments.localMaskMode === 'depth' ? (
        <div className="slider-help">{t('filmLab.localMask.depthProxyHelp')}</div>
      ) : null}
      <FilmLabDepthMapSourceRow
        adjustments={adjustments}
        updateAdjustment={updateAdjustment}
        depthOnnxInferenceUi={wb.depthOnnxInferenceUi}
      />
      {adjustments.localMaskMode === 'linear'
        ? ['linearMaskAngle', 'linearMaskFeather', 'linearMaskOffset'].map(renderSlider)
        : null}
      {adjustments.localMaskMode === 'radial'
        ? ['radialMaskCenterX', 'radialMaskCenterY', 'radialMaskRadius', 'radialMaskFeather'].map(renderSlider)
        : null}
      {adjustments.localMaskMode === 'luma' ? ['lumaMaskMin', 'lumaMaskMax', 'lumaMaskFeather'].map(renderSlider) : null}
      {adjustments.localMaskMode === 'color' ? (
        <>
          {[
            'colorMaskHueCenter',
            'colorMaskHueWidth',
            'colorMaskFeather',
            'colorMaskChromaMin',
            'colorMaskChromaMax',
          ].map(renderSlider)}
          <div className="slider-help">{t('filmLab.localMask.colorPickShiftHint')}</div>
          <div className="slider-help subtle">{t('filmLab.localMask.chromaRangeHelp')}</div>
        </>
      ) : null}
    </div>
  );
}

function FilmLabLocalMaskWorkbenchHelpAndAi({ wb }) {
  const { t } = useI18n();
  const { adjustments, aiAssistState } = wb;
  const latency = readAiLatencySummary(adjustments);
  const hasLatency = latency.last != null || latency.avg != null;
  const kpiReady = latency.last != null;
  const kpiOk = kpiReady && latency.last <= 100;
  return (
    <>
      <div className="slider-help">{t('filmLab.localMask.paintHelp')}</div>
      <div className={`slider-help${adjustments.localMaskShowOverlay ? '' : ' subtle'}`}>
        {t('filmLab.localMask.overlayLine', {
          state: adjustments.localMaskShowOverlay
            ? t('filmLab.localMask.overlayOn')
            : t('filmLab.localMask.overlayOff'),
        })}
      </div>
      <div className="slider-help">{t('filmLab.localMask.aiPresetsHelp')}</div>
      {aiAssistState.label ? (
        <div className="slider-help">
          {aiAssistState.label}
          {aiAssistState.confidence != null
            ? t('filmLab.localMask.aiConfidenceDot', {
                percent: Math.round(aiAssistState.confidence * 100),
              })
            : ''}
        </div>
      ) : null}
      <div className="slider-help">
        {t('filmLab.localMask.aiDebugBackend', {
          backend: String(adjustments.aiAssistBackend ?? 'none'),
          runs: Number(adjustments.aiAssistRuns ?? 0),
        })}
        {aiAssistState.confidence != null
          ? t('filmLab.localMask.aiDebugConfidence', {
              percent: Math.round(aiAssistState.confidence * 100),
            })
          : ''}
      </div>
      <div className="slider-help">
        {hasLatency
          ? t('filmLab.localMask.aiLatencyLine', {
              lastMs: latency.last != null ? `${latency.last} ms` : '—',
              avgMs: latency.avg != null ? `${latency.avg} ms` : '—',
              bestMs: latency.best != null ? `${latency.best} ms` : '—',
              worstMs: latency.worst != null ? `${latency.worst} ms` : '—',
            })
          : t('filmLab.localMask.aiLatencyNoData')}
      </div>
      <div className={`slider-help${kpiReady && !kpiOk ? '' : ' subtle'}`}>
        {kpiReady
          ? t('filmLab.localMask.aiLatencyKpiLine', {
              targetMs: 100,
              state: kpiOk ? t('filmLab.localMask.aiKpiOk') : t('filmLab.localMask.aiKpiWarn'),
            })
          : t('filmLab.localMask.aiLatencyKpiPending')}
      </div>
    </>
  );
}

/**
 * @param {'full' | 'geometry' | 'range' | 'ai'} toolGridScope — `full` = jedna siatka jak wcześniej; studio dzieli sekcje.
 */
function FilmLabLocalMaskWorkbenchToolGrid({
  wb,
  includeStackManagement,
  includeModeAndPaintTools,
  toolGridScope = 'full',
  includeAiPresetButtons = true,
}) {
  const { t } = useI18n();
  const {
    adjustments,
    updateAdjustment,
    localMasks,
    localMaskActiveIndex,
    localMaskSoloIndex,
    commitCurrentMaskToStack,
    switchLocalMask,
    applyLocalMaskToAdjustments,
    applyAiAssistMaskPreset,
    aiAssistState,
    hasImage,
  } = wb;

  const scope = toolGridScope === 'geometry' || toolGridScope === 'range' || toolGridScope === 'ai' || toolGridScope === 'full' ? toolGridScope : 'full';
  const showGeoModes = scope === 'full' || scope === 'geometry';
  const showRangeModes = scope === 'full' || scope === 'range';
  const paintOnRangeForDepth =
    scope === 'range' && String(adjustments.localMaskMode ?? 'brush') === 'depth';
  const showPaintRow =
    includeModeAndPaintTools && (scope === 'full' || scope === 'geometry' || paintOnRangeForDepth);
  const showAiRow =
    includeAiPresetButtons && includeModeAndPaintTools && (scope === 'full' || scope === 'ai');

  return (
    <div className="effect-grid">
      {includeStackManagement ? (
        <>
          <button
            className="effect-btn"
            type="button"
            onClick={() => {
              if (localMasks.length <= 1) return;
              switchLocalMask(localMaskActiveIndex - 1);
            }}
            disabled={localMasks.length <= 1}
          >
            {t('filmLab.localMask.prevMask')}
          </button>
          <button
            className="effect-btn"
            type="button"
            onClick={() => {
              const nextMasks = commitCurrentMaskToStack();
              const nextId = nextMasks.length + 1;
              const created = {
                name: t('filmLab.localMask.defaultName', { n: nextId }),
                enabled: true,
                mode: 'brush',
                opacity: 100,
                blend: 'normal',
                exposure: 20,
                brush: { radius: 80, feather: 65, erase: false, strokes: [] },
                linear: { angle: 0, feather: 55, offset: 0 },
                radial: { centerX: 50, centerY: 50, radius: 35, feather: 55 },
                luma: { min: 0, max: 100, feather: 35 },
                color: { hueCenter: 210, hueWidth: 90, feather: 35, chromaMin: 0, chromaMax: 100 },
              };
              nextMasks.push(created);
              const nextIndex = nextMasks.length - 1;
              updateAdjustment('localMasks', nextMasks);
              updateAdjustment('activeLocalMaskIndex', nextIndex);
              updateAdjustment('localMaskSoloIndex', -1);
              applyLocalMaskToAdjustments(created);
            }}
          >
            {t('filmLab.localMask.addMask')}
          </button>
          <button
            className="effect-btn"
            type="button"
            onClick={() => {
              const nextMasks = commitCurrentMaskToStack();
              const source = nextMasks[localMaskActiveIndex] ?? wb.buildCurrentLocalMask();
              const duplicated = {
                ...source,
                name: `${String(
                  source?.name ?? t('filmLab.localMask.defaultName', { n: localMaskActiveIndex + 1 }),
                )}${t('filmLab.localMask.duplicateNameSuffix')}`,
                brush: {
                  ...(source?.brush ?? {}),
                  strokes: Array.isArray(source?.brush?.strokes) ? [...source.brush.strokes] : [],
                },
              };
              nextMasks.splice(localMaskActiveIndex + 1, 0, duplicated);
              const nextIndex = localMaskActiveIndex + 1;
              updateAdjustment('localMasks', nextMasks);
              updateAdjustment('activeLocalMaskIndex', nextIndex);
              updateAdjustment('localMaskSoloIndex', -1);
              applyLocalMaskToAdjustments(duplicated);
            }}
          >
            {t('filmLab.localMask.duplicateMask')}
          </button>
          <button
            className="effect-btn"
            type="button"
            onClick={() => {
              if (localMasks.length <= 1 || localMaskActiveIndex <= 0) return;
              const nextMasks = commitCurrentMaskToStack();
              const a = localMaskActiveIndex;
              const b = a - 1;
              [nextMasks[a], nextMasks[b]] = [nextMasks[b], nextMasks[a]];
              updateAdjustment('localMasks', nextMasks);
              updateAdjustment('activeLocalMaskIndex', b);
              if (localMaskSoloIndex === a) updateAdjustment('localMaskSoloIndex', b);
              else if (localMaskSoloIndex === b) updateAdjustment('localMaskSoloIndex', a);
              applyLocalMaskToAdjustments(nextMasks[b]);
            }}
            disabled={localMasks.length <= 1 || localMaskActiveIndex <= 0}
          >
            {t('filmLab.localMask.stackMoveUp')}
          </button>
          <button
            className="effect-btn"
            type="button"
            onClick={() => {
              if (localMasks.length <= 1 || localMaskActiveIndex >= localMasks.length - 1) return;
              const nextMasks = commitCurrentMaskToStack();
              const a = localMaskActiveIndex;
              const b = a + 1;
              [nextMasks[a], nextMasks[b]] = [nextMasks[b], nextMasks[a]];
              updateAdjustment('localMasks', nextMasks);
              updateAdjustment('activeLocalMaskIndex', b);
              if (localMaskSoloIndex === a) updateAdjustment('localMaskSoloIndex', b);
              else if (localMaskSoloIndex === b) updateAdjustment('localMaskSoloIndex', a);
              applyLocalMaskToAdjustments(nextMasks[b]);
            }}
            disabled={localMasks.length <= 1 || localMaskActiveIndex >= localMasks.length - 1}
          >
            {t('filmLab.localMask.stackMoveDown')}
          </button>
          <button
            className="effect-btn"
            type="button"
            onClick={() => {
              if (localMasks.length <= 1) return;
              const nextMasks = commitCurrentMaskToStack().filter((_, idx) => idx !== localMaskActiveIndex);
              const nextIndex = Math.max(0, Math.min(nextMasks.length - 1, localMaskActiveIndex - 1));
              const adjustedSoloIndex =
                localMaskSoloIndex === localMaskActiveIndex
                  ? -1
                  : localMaskSoloIndex > localMaskActiveIndex
                    ? localMaskSoloIndex - 1
                    : localMaskSoloIndex;
              updateAdjustment('localMasks', nextMasks);
              updateAdjustment('activeLocalMaskIndex', nextIndex);
              updateAdjustment('localMaskSoloIndex', adjustedSoloIndex);
              applyLocalMaskToAdjustments(nextMasks[nextIndex]);
            }}
            disabled={localMasks.length <= 1}
          >
            {t('filmLab.localMask.deleteMask')}
          </button>
          <button
            className="effect-btn"
            type="button"
            onClick={() => {
              if (localMasks.length <= 1) return;
              switchLocalMask(localMaskActiveIndex + 1);
            }}
            disabled={localMasks.length <= 1}
          >
            {t('filmLab.localMask.nextMask')}
          </button>
        </>
      ) : null}
      {showGeoModes && includeModeAndPaintTools ? (
        <>
          <button
            className={`effect-btn${adjustments.localMaskMode === 'brush' ? ' active' : ''}`}
            type="button"
            onClick={() => updateAdjustment('localMaskMode', 'brush')}
          >
            {t('filmLab.localMask.toolBrush')}
          </button>
          <button
            className={`effect-btn${adjustments.localMaskMode === 'linear' ? ' active' : ''}`}
            type="button"
            onClick={() => updateAdjustment('localMaskMode', 'linear')}
          >
            {t('filmLab.localMask.toolLinear')}
          </button>
          <button
            className={`effect-btn${adjustments.localMaskMode === 'radial' ? ' active' : ''}`}
            type="button"
            onClick={() => updateAdjustment('localMaskMode', 'radial')}
          >
            {t('filmLab.localMask.toolRadial')}
          </button>
        </>
      ) : null}
      {showRangeModes && scope === 'full' && includeModeAndPaintTools ? (
        <>
          <button
            className={`effect-btn${adjustments.localMaskMode === 'luma' ? ' active' : ''}`}
            type="button"
            onClick={() => updateAdjustment('localMaskMode', 'luma')}
          >
            {t('filmLab.localMask.toolLuma')}
          </button>
          <button
            className={`effect-btn${adjustments.localMaskMode === 'color' ? ' active' : ''}`}
            type="button"
            data-testid="film-lab-mask-mode-color"
            onClick={() => updateAdjustment('localMaskMode', 'color')}
          >
            {t('filmLab.localMask.toolHue')}
          </button>
          <button
            className={`effect-btn${adjustments.localMaskMode === 'depth' ? ' active' : ''}`}
            type="button"
            onClick={() => updateAdjustment('localMaskMode', 'depth')}
          >
            {t('filmLab.localMask.toolDepth')}
          </button>
        </>
      ) : null}
      {showRangeModes && scope === 'range' && includeModeAndPaintTools ? (
        <>
          <button
            className={`effect-btn${adjustments.localMaskMode === 'luma' ? ' active' : ''}`}
            type="button"
            onClick={() => updateAdjustment('localMaskMode', 'luma')}
          >
            {t('filmLab.localMask.toolLuma')}
          </button>
          <button
            className={`effect-btn${adjustments.localMaskMode === 'color' ? ' active' : ''}`}
            type="button"
            data-testid="film-lab-mask-mode-color"
            onClick={() => updateAdjustment('localMaskMode', 'color')}
          >
            {t('filmLab.localMask.toolHue')}
          </button>
          <button
            className={`effect-btn${adjustments.localMaskMode === 'depth' ? ' active' : ''}`}
            type="button"
            onClick={() => updateAdjustment('localMaskMode', 'depth')}
          >
            {t('filmLab.localMask.toolDepth')}
          </button>
          <button
            className={`effect-btn${adjustments.localMaskShowOverlay ? ' active' : ''}`}
            type="button"
            onClick={() => updateAdjustment('localMaskShowOverlay', !adjustments.localMaskShowOverlay)}
          >
            {t('filmLab.localMask.overlayToggle')}
          </button>
        </>
      ) : null}
      {showPaintRow ? (
        <>
          <button
            className={`effect-btn${adjustments.localMaskShowOverlay ? ' active' : ''}`}
            type="button"
            onClick={() => updateAdjustment('localMaskShowOverlay', !adjustments.localMaskShowOverlay)}
          >
            {t('filmLab.localMask.overlayToggle')}
          </button>
          <button
            className={`effect-btn${adjustments.brushMaskEnabled ? ' active' : ''}`}
            type="button"
            data-testid="film-lab-brush-toggle"
            onClick={() => updateAdjustment('brushMaskEnabled', !adjustments.brushMaskEnabled)}
          >
            {adjustments.brushMaskEnabled ? t('filmLab.localMask.brushOn') : t('filmLab.localMask.brushOff')}
          </button>
          <button
            className={`effect-btn${adjustments.brushMaskErase ? ' active' : ''}`}
            type="button"
            onClick={() => updateAdjustment('brushMaskErase', !adjustments.brushMaskErase)}
            disabled={!adjustments.brushMaskEnabled}
          >
            {adjustments.brushMaskErase ? t('filmLab.localMask.eraseOn') : t('filmLab.localMask.eraseOff')}
          </button>
          <button
            className="effect-btn"
            type="button"
            onClick={() => updateAdjustment('brushMaskStrokes', [])}
            disabled={!Array.isArray(adjustments.brushMaskStrokes) || adjustments.brushMaskStrokes.length === 0}
          >
            {t('filmLab.localMask.clearMask')}
          </button>
        </>
      ) : null}
      {showAiRow ? (
        <>
          <button
            className="effect-btn"
            type="button"
            onClick={() => applyAiAssistMaskPreset('subject')}
            disabled={!hasImage || aiAssistState.busy}
          >
            {aiAssistState.busy ? t('filmLab.localMask.aiBusy') : t('filmLab.localMask.aiSubject')}
          </button>
          <button
            className="effect-btn"
            type="button"
            onClick={() => applyAiAssistMaskPreset('sky')}
            disabled={!hasImage || aiAssistState.busy}
          >
            {t('filmLab.localMask.aiSky')}
          </button>
        </>
      ) : null}
    </div>
  );
}

export function FilmLabLocalMaskWorkbenchListRail({ wb }) {
  const { t } = useI18n();
  const { localMasks, localMaskActiveIndex, localMaskSoloIndex, switchLocalMask, updateAdjustment } = wb;

  return (
    <aside className="sidebar-left mask-studio-rail mask-studio-rail--list" aria-label={t('filmLab.localMask.ariaStack')}>
      <div className="sb-header mask-studio-rail-header">
        <div className="sb-title">
          {t('filmLab.localMask.railStackTitle')}{' '}
          <span className="sb-count">{t('filmLab.localMask.railStackBadge')}</span>
        </div>
        <div className="slider-help mask-studio-rail-hint">
          {t('filmLab.localMask.stackActiveIndex', {
            current: localMaskActiveIndex + 1,
            total: Math.max(1, localMasks.length || 1),
          })}
        </div>
      </div>
      <div className="panel-content mask-studio-rail-scroll">
        <FilmLabLocalMaskWorkbenchToolGrid wb={wb} includeStackManagement includeModeAndPaintTools={false} />
        <div className="local-mask-list mask-studio-mask-list">
          {localMasks.map((mask, idx) => {
            const irSummary = maskSlotSemanticSummary(mask, idx);
            return (
            <div
              key={`mask-studio-${idx}`}
              className={`local-mask-row mask-studio-mask-row${idx === localMaskActiveIndex ? ' active' : ''}`}
            >
              <div className="mask-studio-mask-row-top">
                <button
                  className={`effect-btn${idx === localMaskActiveIndex ? ' active' : ''}`}
                  type="button"
                  onClick={() => switchLocalMask(idx)}
                >
                  {String(mask?.name ?? t('filmLab.localMask.defaultName', { n: idx + 1 }))}
                </button>
                <span className="local-mask-meta">{formatLocalMaskStackMeta(mask, t, { includeBlend: false })}</span>
                <button
                  className={`effect-btn local-mask-mini${mask?.enabled !== false ? ' active' : ''}`}
                  type="button"
                  aria-label={t('filmLab.localMask.miniMaskToggleTitle')}
                  title={t('filmLab.localMask.miniMaskToggleTitle')}
                  onClick={() => {
                    const nextMasks = localMasks.slice();
                    nextMasks[idx] = { ...nextMasks[idx], enabled: !(nextMasks[idx]?.enabled !== false) };
                    updateAdjustment('localMasks', nextMasks);
                    if (idx === localMaskActiveIndex) {
                      updateAdjustment('localMaskEnabled', nextMasks[idx].enabled !== false);
                    }
                  }}
                >
                  {t('filmLab.localMask.miniMaskToggleLabel')}
                </button>
                <button
                  className={`effect-btn local-mask-mini${localMaskSoloIndex === idx ? ' active' : ''}`}
                  type="button"
                  aria-label={t('filmLab.localMask.miniMaskSoloTitle')}
                  title={t('filmLab.localMask.miniMaskSoloTitle')}
                  onClick={() => updateAdjustment('localMaskSoloIndex', localMaskSoloIndex === idx ? -1 : idx)}
                >
                  {t('filmLab.localMask.miniMaskSoloLabel')}
                </button>
              </div>
              <div className="mask-studio-slot-ir">
                <span className="mask-studio-slot-ir-id">
                  {t('filmLab.localMask.irNodeId')}: mask_slot_{idx}
                </span>
                {irSummary ? (
                  <span className="mask-studio-slot-ir-nodes" title={irSummary}>
                    {irSummary}
                  </span>
                ) : null}
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

export function FilmLabLocalMaskWorkbenchToolsRail({ wb }) {
  const { t } = useI18n();
  const {
    adjustments,
    updateAdjustment,
    renderSlider,
    buildCurrentLocalMask,
    localMasks,
    localMaskActiveIndex,
    resetLocalMaskFields,
  } = wb;

  const rawSection = adjustments.maskStudioBuilderSection;
  const activeSection = MASK_STUDIO_BUILDER_SECTIONS.some((s) => s.id === rawSection) ? rawSection : 'geometry';

  const geometrySliders =
    adjustments.localMaskMode === 'brush' || adjustments.localMaskMode === 'depth'
      ? ['brushMaskRadius', 'brushMaskFeather', 'brushMaskEdgeSensitivity']
      : adjustments.localMaskMode === 'linear'
        ? ['linearMaskAngle', 'linearMaskFeather', 'linearMaskOffset']
        : adjustments.localMaskMode === 'radial'
          ? ['radialMaskCenterX', 'radialMaskCenterY', 'radialMaskRadius', 'radialMaskFeather']
          : [];

  const rangeModeOk =
    adjustments.localMaskMode === 'luma' ||
    adjustments.localMaskMode === 'color' ||
    adjustments.localMaskMode === 'depth';
  const showRangeGenericHint = !rangeModeOk;

  return (
    <aside className="sidebar-right mask-studio-rail mask-studio-rail--tools" aria-label={t('filmLab.localMask.ariaTools')}>
      <div className="sb-header mask-studio-rail-header">
        <div className="sb-title">{t('filmLab.localMask.toolsTitle')}</div>
        <button className="section-reset" type="button" onClick={resetLocalMaskFields}>
          {t('filmLab.localMask.resetMask')}
        </button>
      </div>
      <nav className="mask-studio-builder-nav" aria-label={t('filmLab.localMask.builderNavAria')}>
        {MASK_STUDIO_BUILDER_SECTIONS.map(({ id, labelKey }) => (
          <button
            key={id}
            type="button"
            data-testid={`film-lab-mask-section-${id}`}
            className={`mask-studio-builder-tab${activeSection === id ? ' active' : ''}`}
            onClick={() => updateAdjustment('maskStudioBuilderSection', id)}
          >
            {t(labelKey)}
          </button>
        ))}
      </nav>
      <div className="panel-content mask-studio-rail-scroll">
        {activeSection === 'geometry' ? (
          <>
            <FilmLabLocalMaskWorkbenchToolGrid
              wb={wb}
              includeStackManagement={false}
              includeModeAndPaintTools
              toolGridScope="geometry"
              includeAiPresetButtons={false}
            />
            {geometrySliders.map((key) => renderSlider(key))}
            {adjustments.localMaskMode === 'brush' || adjustments.localMaskMode === 'depth' ? (
              <div className="slider-help subtle">{t('filmLab.localMask.edgeBrushHelp')}</div>
            ) : null}
          </>
        ) : null}

        {activeSection === 'range' ? (
          <>
            <FilmLabLocalMaskWorkbenchToolGrid
              wb={wb}
              includeStackManagement={false}
              includeModeAndPaintTools
              toolGridScope="range"
              includeAiPresetButtons={false}
            />
            <div className={adjustments.localMaskMode === 'depth' ? '' : 'mask-studio-panel-dim'}>
              {['depthMaskMin', 'depthMaskMax', 'depthMaskFeather'].map(renderSlider)}
              {adjustments.localMaskMode === 'depth' ? (
                <div className="slider-help">{t('filmLab.localMask.depthProxyHelp')}</div>
              ) : null}
              <FilmLabDepthMapSourceRow
                adjustments={adjustments}
                updateAdjustment={updateAdjustment}
                depthOnnxInferenceUi={wb.depthOnnxInferenceUi}
              />
            </div>
            {showRangeGenericHint ? (
              <div className="slider-help">{t('filmLab.localMask.builderRangeModeHint')}</div>
            ) : null}
            <div className={adjustments.localMaskMode === 'luma' ? '' : 'mask-studio-panel-dim'}>
              {['lumaMaskMin', 'lumaMaskMax', 'lumaMaskFeather'].map(renderSlider)}
            </div>
            <div className={adjustments.localMaskMode === 'color' ? '' : 'mask-studio-panel-dim'}>
              {[
                'colorMaskHueCenter',
                'colorMaskHueWidth',
                'colorMaskFeather',
                'colorMaskChromaMin',
                'colorMaskChromaMax',
              ].map(renderSlider)}
              {adjustments.localMaskMode === 'color' ? (
                <>
                  <div className="slider-help">{t('filmLab.localMask.colorPickShiftHint')}</div>
                  <div className="slider-help subtle">{t('filmLab.localMask.chromaRangeHelp')}</div>
                </>
              ) : null}
            </div>
          </>
        ) : null}

        {activeSection === 'combine' ? <FilmLabLocalMaskGraphPanel wb={wb} /> : null}

        {activeSection === 'ai' ? (
          <>
            <FilmLabLocalMaskWorkbenchToolGrid
              wb={wb}
              includeStackManagement={false}
              includeModeAndPaintTools
              toolGridScope="ai"
              includeAiPresetButtons
            />
            <FilmLabLocalMaskWorkbenchHelpAndAi wb={wb} />
          </>
        ) : null}

        {activeSection === 'output' ? (
          <>
            <div className="slider-wrap">
              <label className="slider-label">{t('filmLab.localMask.maskNameLabel')}</label>
              <input
                className="slider-input"
                type="text"
                value={String(adjustments.localMaskName ?? '')}
                onChange={(event) => {
                  const nextName = String(event.target.value ?? '').slice(0, 48);
                  updateAdjustment('localMaskName', nextName);
                  const nextMasks = localMasks.slice();
                  if (nextMasks.length === 0) {
                    nextMasks.push({ ...buildCurrentLocalMask(), name: nextName });
                  } else {
                    nextMasks[localMaskActiveIndex] = {
                      ...nextMasks[localMaskActiveIndex],
                      name: nextName,
                    };
                  }
                  updateAdjustment('localMasks', nextMasks);
                }}
                placeholder={t('filmLab.localMask.defaultName', { n: localMaskActiveIndex + 1 })}
              />
            </div>
            {renderSlider('localMaskOpacity')}
            <div className="effect-grid">
              <button
                className={`effect-btn${adjustments.localMaskBlend === 'normal' ? ' active' : ''}`}
                type="button"
                onClick={() => updateAdjustment('localMaskBlend', 'normal')}
              >
                {t('filmLab.localMask.blendNormal')}
              </button>
              <button
                className={`effect-btn${adjustments.localMaskBlend === 'add' ? ' active' : ''}`}
                type="button"
                onClick={() => updateAdjustment('localMaskBlend', 'add')}
              >
                {t('filmLab.localMask.blendAdd')}
              </button>
              <button
                className={`effect-btn${adjustments.localMaskBlend === 'subtract' ? ' active' : ''}`}
                type="button"
                onClick={() => updateAdjustment('localMaskBlend', 'subtract')}
              >
                {t('filmLab.localMask.blendSubtract')}
              </button>
            </div>
            {renderSlider('brushMaskExposure')}
          </>
        ) : null}
      </div>
    </aside>
  );
}
