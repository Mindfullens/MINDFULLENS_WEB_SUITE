import { useCallback, useMemo, useRef, useState } from 'react';
import FilmLabCanvasArea from './FilmLabCanvasArea.jsx';
import { useI18n } from './i18n';
import {
  ADAPTIVE_PRESET_V1_SCHEMA,
  applyAdaptivePresetV1Steps,
  parseAdaptivePresetV1,
  recomputeAiAssistMasksHeuristic,
  activeCropRectNormFromAdjustments,
} from './filmLab/adaptivePresetV1.js';

const STORAGE_KEY = 'filmLab.adaptivePreset.v1';

const EXAMPLE_PRESET = {
  schema: ADAPTIVE_PRESET_V1_SCHEMA,
  version: 1,
  steps: [
    { type: 'setPatch', patch: { exposure: 0.15, contrast: 8 } },
    { type: 'recomputeAiMasks' },
  ],
};

const LEGEND_PRESET_PROFILE_1TO1 = {
  schema: ADAPTIVE_PRESET_V1_SCHEMA,
  version: 1,
  steps: [
    {
      type: 'setPatch',
      patch: {
        inputWorkflowMode: 'negative_film',
        filmFormatId: '35mm',
        strength: 88,
        pushPullEv: 1,
        orangeMaskCorrection: 46,
        filmToneResponseShape: 's_curve',
        emulsionReciprocityComp: 22,
        emulsionEdgeAcutance: 12,
        userGrain: 28,
        userGrainSize: 38,
        fade: 9,
      },
    },
  ],
};

export default function FilmLabAiAutomationWorkspace({
  adjustments,
  updateAdjustment,
  setAdjustments,
  activeCropRectNorm,
  canvasAreaProps,
  batchFileInputRef,
  setIsExportModalOpen,
}) {
  const { t } = useI18n();
  const fileImportRef = useRef(null);
  const [parseMessage, setParseMessage] = useState('');
  const cropNorm = useMemo(
    () => activeCropRectNorm ?? activeCropRectNormFromAdjustments(adjustments),
    [activeCropRectNorm, adjustments]
  );

  const textValue = useMemo(() => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) || '' : '';
    } catch {
      return '';
    }
  }, []);

  const [textarea, setTextarea] = useState(() =>
    textValue
      ? textValue
      : JSON.stringify(
          {
            schema: ADAPTIVE_PRESET_V1_SCHEMA,
            version: 1,
            patch: { exposure: 0 },
          },
          null,
          2
        )
  );

  const persistTextarea = useCallback((next) => {
    setTextarea(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const onLoadExample = useCallback(() => {
    persistTextarea(JSON.stringify(EXAMPLE_PRESET, null, 2));
    setParseMessage('');
  }, [persistTextarea]);

  const onApply = useCallback(() => {
    const parsed = parseAdaptivePresetV1(textarea);
    if (!parsed.ok) {
      setParseMessage(parsed.error);
      return;
    }
    setParseMessage('');
    setAdjustments((cur) => applyAdaptivePresetV1Steps(cur, parsed.preset, cropNorm));
  }, [textarea, setAdjustments, cropNorm]);

  const onApplyLegendPreset = useCallback(() => {
    setParseMessage('');
    setAdjustments((cur) => applyAdaptivePresetV1Steps(cur, LEGEND_PRESET_PROFILE_1TO1, cropNorm));
  }, [setAdjustments, cropNorm]);

  const onDownload = useCallback(() => {
    const blob = new Blob([textarea], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mindfullens_adaptive_preset_v1.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }, [textarea]);

  const onImportFile = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          persistTextarea(reader.result);
          setParseMessage('');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    },
    [persistTextarea]
  );

  const onRecomputeAiMasks = useCallback(() => {
    const next = recomputeAiAssistMasksHeuristic(adjustments, cropNorm);
    updateAdjustment('localMasks', next.localMasks);
  }, [adjustments, cropNorm, updateAdjustment]);

  const batchRecompute = Boolean(adjustments?.batchRecomputeAiMasksHeuristic);

  return (
    <>
      <aside className="sidebar-left recipe-layers-rail recipe-layers-rail--list" aria-label={t('filmLab.aiAutomation.ariaTools')}>
        <div className="sb-header mask-studio-rail-header">
          <div className="sb-title">{t('filmLab.aiAutomation.headerTools')}</div>
        </div>
        <div className="panel-content mask-studio-rail-scroll">
          <div className="slider-help">{t('filmLab.aiAutomation.introHelp')}</div>
          <button type="button" className="effect-btn" onClick={onLoadExample}>
            {t('filmLab.aiAutomation.loadExample')}
          </button>
          <button type="button" className="effect-btn" onClick={() => fileImportRef.current?.click()}>
            {t('filmLab.aiAutomation.importFile')}
          </button>
          <input ref={fileImportRef} type="file" accept="application/json,.json" hidden onChange={onImportFile} />
          <div className="slider-label" style={{ marginTop: 14 }}>
            {t('filmLab.aiAutomation.legendPresetTitle')}
          </div>
          <div className="slider-help">{t('filmLab.aiAutomation.legendPresetHelp')}</div>
          <button type="button" className="effect-btn" onClick={onApplyLegendPreset}>
            {t('filmLab.aiAutomation.applyLegendPreset')}
          </button>
          <div className="slider-help">{t('filmLab.aiAutomation.legendPresetMap')}</div>
          <div className="slider-label" style={{ marginTop: 14 }}>
            {t('filmLab.aiAutomation.generativeSectionTitle')}
          </div>
          <div className="slider-help">{t('filmLab.aiAutomation.generativeSectionHelp')}</div>
          <button
            type="button"
            className="effect-btn"
            aria-pressed={Boolean(adjustments?.generativeAiStubIntent)}
            title={
              adjustments?.generativeAiStubIntent
                ? t('filmLab.aiAutomation.generativeIntentOnTitle')
                : t('filmLab.aiAutomation.generativeIntentOffTitle')
            }
            onClick={() =>
              updateAdjustment?.('generativeAiStubIntent', !adjustments?.generativeAiStubIntent)
            }
          >
            {adjustments?.generativeAiStubIntent
              ? t('filmLab.aiAutomation.generativeIntentActive')
              : t('filmLab.aiAutomation.generativeIntentInactive')}
          </button>
        </div>
      </aside>

      <FilmLabCanvasArea {...canvasAreaProps} />

      <aside className="sidebar-right recipe-layers-rail recipe-layers-rail--edit" aria-label={t('filmLab.aiAutomation.ariaOptions')}>
        <div className="sb-header mask-studio-rail-header">
          <div className="sb-title">{t('filmLab.aiAutomation.headerOptions')}</div>
        </div>
        <div className="panel-content mask-studio-rail-scroll">
          <label className="mask-graph-select recipe-layer-field">
            <span className="slider-label">{t('filmLab.aiAutomation.presetJsonLabel')}</span>
            <textarea
              rows={14}
              style={{ width: '100%', minHeight: 200, fontFamily: 'monospace', fontSize: 12 }}
              value={textarea}
              onChange={(e) => persistTextarea(e.target.value)}
              spellCheck={false}
            />
          </label>
          {parseMessage ? <div className="slider-help">{parseMessage}</div> : null}

          <div className="mask-studio-rail-actions">
            <button type="button" className="effect-btn" onClick={onApply}>
              {t('filmLab.aiAutomation.applySession')}
            </button>
            <button type="button" className="effect-btn" onClick={onDownload}>
              {t('filmLab.aiAutomation.downloadJson')}
            </button>
          </div>

          <div className="slider-help">{t('filmLab.aiAutomation.recomputeHelp')}</div>
          <button type="button" className="effect-btn" onClick={onRecomputeAiMasks}>
            {t('filmLab.aiAutomation.recomputeAiMasks')}
          </button>

          <div className="slider-help">{t('filmLab.aiAutomation.batchHelp')}</div>
          <label className="mask-graph-select recipe-layer-field">
            <span className="slider-label">{t('filmLab.aiAutomation.batchRecomputeLabel')}</span>
            <input
              type="checkbox"
              checked={batchRecompute}
              onChange={(e) => updateAdjustment('batchRecomputeAiMasksHeuristic', e.target.checked)}
            />
          </label>
          <div className="mask-studio-rail-actions">
            <button
              type="button"
              className="effect-btn"
              onClick={() => batchFileInputRef?.current?.click()}
              disabled={!batchFileInputRef}
            >
              {t('filmLab.aiAutomation.queueBatchFiles')}
            </button>
            {typeof setIsExportModalOpen === 'function' ? (
              <button type="button" className="effect-btn" onClick={() => setIsExportModalOpen(true)}>
                {t('filmLab.aiAutomation.openExportModal')}
              </button>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}
