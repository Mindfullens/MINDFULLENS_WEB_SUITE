import { useMemo } from 'react';
import { useI18n } from './i18n';
import { createRecipeLayerV0 } from './filmLab/recipeLayersV0.js';
import { normalizeRecipeLayerBlendMode, RECIPE_LAYER_BLEND_MODES } from './filmLab/recipeLayerBlendApply.js';

function clampSelected(idx, len) {
  if (len <= 0) return 0;
  return Math.max(0, Math.min(len - 1, idx));
}

export function FilmLabRecipeLayersListRail({ adjustments, updateAdjustment, maskWorkbench }) {
  const { t } = useI18n();
  const layers = Array.isArray(adjustments?.recipeLayersV0) ? adjustments.recipeLayersV0 : [];
  const sel = clampSelected(Number(adjustments?.recipeLayersSelectedIndex ?? 0), layers.length);

  const setLayers = (next) => updateAdjustment('recipeLayersV0', next);

  const addLayer = () => {
    const next = layers.slice();
    const localMasks = maskWorkbench?.localMasks ?? [];
    const activeIdx = Number(maskWorkbench?.localMaskActiveIndex ?? 0);
    const stackLen = Math.max(0, localMasks.length);
    const mi = stackLen === 0 ? 0 : Math.max(0, Math.min(stackLen - 1, activeIdx));
    next.push(
      createRecipeLayerV0({
        name: t('filmLab.recipeLayers.defaultLayerName', { index: next.length + 1 }),
        maskIndex: mi,
      }),
    );
    setLayers(next);
    updateAdjustment('recipeLayersSelectedIndex', next.length - 1);
  };

  const removeLayer = (idx) => {
    const next = layers.filter((_, i) => i !== idx);
    setLayers(next);
    let nextSel = sel;
    if (next.length === 0) {
      nextSel = 0;
    } else if (idx === sel) {
      nextSel = Math.min(sel, next.length - 1);
    } else if (idx < sel) {
      nextSel = sel - 1;
    }
    updateAdjustment('recipeLayersSelectedIndex', nextSel);
  };

  const selectLayer = (idx) => updateAdjustment('recipeLayersSelectedIndex', idx);

  const moveLayer = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= layers.length) return;
    const next = layers.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    setLayers(next);
    updateAdjustment('recipeLayersSelectedIndex', j);
  };

  return (
    <aside className="sidebar-left recipe-layers-rail recipe-layers-rail--list" aria-label={t('filmLab.recipeLayers.ariaList')}>
      <div className="sb-header mask-studio-rail-header">
        <div className="sb-title">
          {t('filmLab.recipeLayers.headerTitle')} <span className="sb-count">v0</span>
        </div>
        <button type="button" className="section-reset" onClick={addLayer}>
          {t('filmLab.recipeLayers.addLayer')}
        </button>
      </div>
      <div className="panel-content mask-studio-rail-scroll">
        <div className="slider-help">{t('filmLab.recipeLayers.helpOrder')}</div>
        {layers.length === 0 ? (
          <div className="slider-help">{t('filmLab.recipeLayers.emptyList')}</div>
        ) : (
          <div className="recipe-layer-list">
            {layers.map((layer, idx) => (
              <div key={layer.id} className={`recipe-layer-row${sel === idx ? ' active' : ''}`}>
                <button
                  type="button"
                  className={`effect-btn${sel === idx ? ' active' : ''}`}
                  onClick={() => selectLayer(idx)}
                >
                  {String(layer.name ?? t('filmLab.recipeLayers.defaultLayerName', { index: idx + 1 }))}
                </button>
                <span className="recipe-layer-meta">
                  {t('filmLab.recipeLayers.metaEv', {
                    state:
                      layer.enabled === false
                        ? t('filmLab.recipeLayers.shortOff')
                        : t('filmLab.recipeLayers.shortOn'),
                    ev: Math.round(Number(layer.exposure ?? 0)),
                  })}
                  <span
                    className="recipe-layer-meta-blend"
                    title={t(`filmLab.recipeLayers.blend.${normalizeRecipeLayerBlendMode(layer.blendMode)}`)}
                  >
                    {' '}
                    · {t(`filmLab.recipeLayers.blendShort.${normalizeRecipeLayerBlendMode(layer.blendMode)}`)}
                  </span>
                  {layer.maskGraphNodeId ? (
                    <span className="recipe-layer-ir" title={String(layer.maskGraphNodeId)}>
                      {' '}
                      · {t('filmLab.recipeLayers.maskGraphNodeHint', { node: String(layer.maskGraphNodeId) })}
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  className="effect-btn local-mask-mini"
                  disabled={idx <= 0}
                  onClick={() => moveLayer(idx, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="effect-btn local-mask-mini"
                  disabled={idx >= layers.length - 1}
                  onClick={() => moveLayer(idx, 1)}
                >
                  ↓
                </button>
                <button type="button" className="effect-btn local-mask-mini" onClick={() => removeLayer(idx)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

export function FilmLabRecipeLayersEditorRail({ adjustments, updateAdjustment, maskWorkbench }) {
  const { t } = useI18n();
  const layers = Array.isArray(adjustments?.recipeLayersV0) ? adjustments.recipeLayersV0 : [];
  const sel = clampSelected(Number(adjustments?.recipeLayersSelectedIndex ?? 0), layers.length);
  const selected = layers[sel];
  const localMasks = maskWorkbench?.localMasks ?? [];
  const maskOptionsLen = Math.max(1, localMasks.length);

  const maskNames = useMemo(
    () =>
      localMasks.map((m, i) => ({
        idx: i,
        label: String(m?.name ?? t('filmLab.localMask.defaultName', { n: i + 1 })),
      })),
    [localMasks, t],
  );

  const setLayers = (next) => updateAdjustment('recipeLayersV0', next);

  const patchLayer = (idx, patch) => {
    const next = layers.slice();
    if (!next[idx]) return;
    next[idx] = { ...next[idx], ...patch };
    setLayers(next);
  };

  return (
    <aside className="sidebar-right recipe-layers-rail recipe-layers-rail--edit" aria-label={t('filmLab.recipeLayers.ariaEditor')}>
      <div className="sb-header mask-studio-rail-header">
        <div className="sb-title">{t('filmLab.recipeLayers.propertiesTitle')}</div>
      </div>
      <div className="panel-content mask-studio-rail-scroll">
        {!selected ? (
          <div className="slider-help">{t('filmLab.recipeLayers.selectOrAdd')}</div>
        ) : (
          <>
            <label className="slider-wrap">
              <span className="slider-label">{t('filmLab.recipeLayers.fieldName')}</span>
              <input
                className="slider-input"
                type="text"
                value={String(selected.name ?? '')}
                onChange={(e) => patchLayer(sel, { name: e.target.value.slice(0, 48) })}
              />
            </label>
            <label className="mask-graph-toggle">
              <input
                type="checkbox"
                checked={selected.enabled !== false}
                onChange={(e) => patchLayer(sel, { enabled: e.target.checked })}
              />
              <span>{t('filmLab.recipeLayers.enabled')}</span>
            </label>
            <label className="mask-graph-select recipe-layer-field">
              <span className="slider-label">{t('filmLab.recipeLayers.blendMode')}</span>
              <select
                value={RECIPE_LAYER_BLEND_MODES.includes(String(selected.blendMode ?? 'normal').toLowerCase()) ? String(selected.blendMode ?? 'normal').toLowerCase() : 'normal'}
                onChange={(e) => patchLayer(sel, { blendMode: e.target.value })}
              >
                {RECIPE_LAYER_BLEND_MODES.map((bm) => (
                  <option key={bm} value={bm}>
                    {t(`filmLab.recipeLayers.blend.${bm}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="mask-graph-select recipe-layer-field">
              <span className="slider-label">{t('filmLab.recipeLayers.sourceMask')}</span>
              <select
                value={Math.min(maskOptionsLen - 1, Math.max(0, Number(selected.maskIndex ?? 0)))}
                onChange={(e) => {
                  const mi = Number(e.target.value);
                  patchLayer(sel, {
                    maskIndex: mi,
                    maskGraphNodeId: `mask_slot_${mi}`,
                  });
                }}
              >
                {(maskNames.length ? maskNames : [{ idx: 0, label: t('filmLab.recipeLayers.defaultMaskOption') }]).map(
                  ({ idx, label }) => (
                    <option key={`opt-${idx}`} value={idx}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>
            <div className="slider-help recipe-layer-ir-line">
              {t('filmLab.recipeLayers.maskGraphNode')}:{' '}
              <code>{String(selected.maskGraphNodeId ?? `mask_slot_${Number(selected.maskIndex ?? 0)}`)}</code>
            </div>
            <div className="slider-wrap">
              <span className="slider-label">
                {t('filmLab.recipeLayers.localExposure', {
                  ev: Math.round(Number(selected.exposure ?? 0)),
                })}
              </span>
              <input
                type="range"
                min={-100}
                max={100}
                value={Number(selected.exposure ?? 0)}
                onChange={(e) => patchLayer(sel, { exposure: Number(e.target.value) })}
              />
            </div>
            <div className="slider-wrap">
              <span className="slider-label">
                {t('filmLab.recipeLayers.layerOpacity', {
                  percent: Math.round(Number(selected.opacity ?? 100)),
                })}
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={Number(selected.opacity ?? 100)}
                onChange={(e) => patchLayer(sel, { opacity: Number(e.target.value) })}
              />
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
