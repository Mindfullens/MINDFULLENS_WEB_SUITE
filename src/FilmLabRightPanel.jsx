import { useMemo, useRef, useState } from 'react';
import ColorWheel from './ColorWheel.jsx';
import { DEVELOP_BASIC_LIGHT_KEYS } from './filmLab/filmLabDevelopSliderGroups.js';
import {
  FILM_FORMAT_IDS,
  FILM_TONE_RESPONSE_SHAPES,
  normalizeFilmToneResponseShape,
} from './filmLab/filmLabIngressCalibration.js';
import { analyzeLocalMaskAiAssistPresetSync } from './filmLab/localMaskAiAssistCore.js';
import { flatAdjustmentsFromMaskSlot, seedFirstMaskLayerIfEmpty } from './filmLab/maskStackSeed.js';
import { useFilmLabColorGradeWheelAdjustSession } from './filmLab/useFilmLabColorGradeWheelAdjustSession.js';
import { useI18n } from './i18n';
import { PIPELINE_KIND } from './engine/pipeline/constants.js';

const LEAK_IDS = ['none', 'warm', 'cool', 'vintage', 'prism', 'halation'];

const FRAME_IDS = [
  'none',
  'border-thin',
  'polaroid',
  'border-thick',
  'black-thin',
  'black-thick',
  'filmstrip',
  'raw-darkroom',
  'sprocket-35',
];

const MIXER_THUMB_HUES = {
  red: 0,
  orange: 30,
  yellow: 55,
  green: 120,
  aqua: 180,
  blue: 220,
  purple: 275,
  magenta: 310,
};

function hueToThumbColor(hue) {
  const normalizedHue = ((Number(hue) % 360) + 360) % 360;
  return `hsl(${normalizedHue}deg 92% 56%)`;
}

function kinoRbThumbColor(value) {
  const normalized = Math.max(0, Math.min(1, (Number(value) + 100) / 200));
  const hue = 220 - normalized * 205;
  return `hsl(${hue}deg 96% 58%)`;
}

function mixerThumbColor(colorId, value) {
  const baseHue = MIXER_THUMB_HUES[colorId] ?? 0;
  const shift = (Number(value) / 100) * 30;
  return `hsl(${baseHue + shift}deg 85% 55%)`;
}

export default function FilmLabRightPanel({
  rightSidebarRef,
  panelTabs,
  activePanel,
  onPanelTabChange,
  undoAction,
  redoAction,
  undoStackRef,
  redoStackRef,
  fullHistoryTimeline,
  renderSlider,
  renderCustomSlider,
  sliderDefs,
  adjustments,
  isInputProfile,
  resetAdjustments,
  resetSingleAdjustment,
  updateAdjustment,
  setAdjustments,
  activeCurveCh,
  setActiveCurveCh,
  curvesCanvasRef,
  handleCurvePointerDown,
  handleCurveDoubleClick,
  resetCurves,
  mixerGroups,
  mixerColors,
  activeMixerGroup,
  setActiveMixerGroup,
  colorMixer,
  updateMixerValue,
  resetMixerValue,
  resetColorMixer,
  gradeZones,
  activeGradeZone,
  setActiveGradeZone,
  colorGrading,
  updateColorGradeValue,
  resetColorGradeValue,
  resetColorGrading,
  saveUndo,
  setIsAdjusting,
  setInteractionKind,
  handleSliderEnd,
  colorCalibration,
  updateCalibrationValue,
  resetCalibrationValue,
  resetColorCalibration,
  setLeak,
  setFrame,
  triggerDustZip,
  disableDustZip,
  triggerRawLeakZip,
  disableRawLeakZip,
  cropAspectPresets,
  activeCropAspectPreset,
  setCropAspectPreset,
  activeCropAspect,
  cropOverlayModes,
  activeCropOverlayMode,
  setCropOverlayMode,
  cycleCropOverlayMode,
  rotateCropOverlay,
  cancelManualStraighten,
  cancelCropDraft,
  rotateImage,
  toggleFlip,
  isStraightenToolArmed,
  setIsStraightenToolArmed,
  beginManualStraightenSession,
  runAutoStraighten,
  activeCropRectNorm,
  hasImage,
  activeFilm,
  setDoubleExposureOverlay,
  doubleExposurePlateReady,
  doubleExposurePlateOrigin = 'none',
  pipelineKind = null,
}) {
  const { t } = useI18n();
  const doubleExposureInputRef = useRef(null);
  const snapshotSlotsRef = useRef([null, null, null, null]);
  const [snapshotEpoch, setSnapshotEpoch] = useState(0);
  const leakOptions = useMemo(
    () => LEAK_IDS.map((id) => ({ id, label: t(`filmLab.leak.${id}`) })),
    [t],
  );
  const frameOptions = useMemo(
    () => FRAME_IDS.map((id) => ({ id, label: t(`filmLab.frame.${id}`) })),
    [t],
  );
  const snapshotSlots = useMemo(
    () =>
      [0, 1, 2, 3].map((index) => ({
        index,
        id: `S${index + 1}`,
        hasValue: Boolean(snapshotSlotsRef.current[index]),
      })),
    [snapshotEpoch],
  );
  const canUseSnapshots = typeof setAdjustments === 'function';
  const canUseHybridMaskStudio = typeof setAdjustments === 'function';

  const { onColorWheelSessionStart, onColorWheelSessionEnd } = useFilmLabColorGradeWheelAdjustSession({
    activeGradeZone,
    saveUndo,
    setIsAdjusting,
    setInteractionKind,
    handleSliderEnd,
  });

  const saveSnapshotSlot = (slotIndex) => {
    if (!canUseSnapshots) {
      return;
    }
    try {
      snapshotSlotsRef.current[slotIndex] = structuredClone(adjustments ?? {});
    } catch {
      snapshotSlotsRef.current[slotIndex] = JSON.parse(JSON.stringify(adjustments ?? {}));
    }
    setSnapshotEpoch((value) => value + 1);
  };

  const applySnapshotSlot = (slotIndex) => {
    if (!canUseSnapshots) {
      return;
    }
    const snap = snapshotSlotsRef.current[slotIndex];
    if (!snap) {
      return;
    }
    setAdjustments(() => {
      try {
        return structuredClone(snap);
      } catch {
        return JSON.parse(JSON.stringify(snap));
      }
    });
  };

  const applyMaskIntentPreset = (kind) => {
    if (!canUseHybridMaskStudio) {
      return;
    }
    setAdjustments((current) => {
      const seeded = seedFirstMaskLayerIfEmpty(current ?? {}, t, 'brush');
      const next = { ...seeded };
      const stack = Array.isArray(next.localMasks) ? [...next.localMasks] : [];
      const maskIndex = stack.length;
      const cropRect = {
        x: Number(next.cropRectX ?? 0),
        y: Number(next.cropRectY ?? 0),
        w: Number(next.cropRectW ?? 1),
        h: Number(next.cropRectH ?? 1),
      };
      const { mask } = analyzeLocalMaskAiAssistPresetSync({
        kind,
        maskIndex,
        activeCropRectNorm: cropRect,
      });
      const baseName = t('filmLab.maskStudioHybrid.intentName', {
        kind: t(`filmLab.maskStudioHybrid.intent.${kind}`),
        n: maskIndex + 1,
      });
      const created = { ...mask, name: String(mask?.name || baseName) };
      stack.push(created);
      return {
        ...next,
        localMasks: stack,
        activeLocalMaskIndex: stack.length - 1,
        brushMaskEnabled: true,
        ...flatAdjustmentsFromMaskSlot(created),
      };
    });
  };

  return (
    <aside className="sidebar-right" ref={rightSidebarRef}>
      <div className="panel-tabs">
        {panelTabs.map((tab) => (
          <button
            key={tab.id}
            className={`panel-tab${activePanel === tab.id ? ' active' : ''}${tab.id === 'history' ? ' panel-tab-history' : ''}`}
            type="button"
            onClick={() => onPanelTabChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="panel-content">
        <div className={`panel-page${activePanel === 'history' ? ' active' : ''}`}>
          <div className="effect-section">
            <div className="effect-section-title">{t('filmLab.rightPanel.historyTitle')}</div>
            <div className="slider-help">{t('filmLab.rightPanel.historyHelp')}</div>
            <div className="history-actions-row">
              <button type="button" className="effect-btn" onClick={undoAction} disabled={!undoStackRef.current.length}>
                {t('filmLab.rightPanel.undoStep')}
              </button>
              <button type="button" className="effect-btn" onClick={redoAction} disabled={!redoStackRef.current.length}>
                {t('filmLab.rightPanel.redoStep')}
              </button>
              <span className="history-count-label">
                {t('filmLab.rightPanel.stepsSaved')} {Math.max(0, fullHistoryTimeline.length - 1)}
              </span>
            </div>
            <div className="history-timeline-list">
              {fullHistoryTimeline.map((entry, index) => (
                <article
                  key={entry.id}
                  className={`history-timeline-item${entry.isCurrent ? ' current' : ''}`}
                >
                  <div className="history-timeline-head">
                    <strong>{entry.stepLabel}</strong>
                    <span>{entry.isCurrent ? t('filmLab.rightPanel.now') : `#${index + 1}`}</span>
                  </div>
                  <div className="history-timeline-grid">
                    <span>{t('filmLab.rightPanel.profile')}</span>
                    <strong>{entry.filmName}</strong>
                    <span>{t('filmLab.rightPanel.exposure')}</span>
                    <strong>{entry.exposure.toFixed(0)}</strong>
                    <span>{t('filmLab.rightPanel.contrast')}</span>
                    <strong>{entry.contrast.toFixed(0)}</strong>
                    <span>{t('filmLab.rightPanel.rotation')}</span>
                    <strong>{entry.rotation.toFixed(1)}°</strong>
                    <span>{t('filmLab.rightPanel.flip')}</span>
                    <strong>
                      {entry.flipped ? t('filmLab.metaValue.yes') : t('filmLab.metaValue.no')}
                    </strong>
                    <span>{t('filmLab.rightPanel.zoom')}</span>
                    <strong>{Math.round(entry.zoom * 100)}%</strong>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>

        <div className={`panel-page${activePanel === 'basic' ? ' active' : ''}`}>
          {/*
            Epik B — Panel II (Tonality & Lab): ingress + profil.
            Epik C — sekcja „Chemia emulsji”: kształt H&D, reciprocity, MTF→Clarity (merge w filmLabIngressCalibration).
            Pełna lista procesów (E‑6 / K‑14 / BW / Cineon) — backlog silnika; merge obsługuje cyfra vs negative_film (C‑41 orange mask).
          */}
          <div className="effect-section">
            <div className="effect-section-title">
              {t('filmLab.rightPanel.section.panel2TonalityLab')}
              <button
                className="section-reset"
                type="button"
                disabled={isInputProfile}
                onClick={() =>
                  resetAdjustments([
                    'filmFormatId',
                    'inputWorkflowMode',
                    'orangeMaskCorrection',
                    'pushPullEv',
                    'rawColorimetryPolicy',
                    'filmToneResponseShape',
                    'emulsionReciprocityComp',
                    'emulsionEdgeAcutance',
                    'strength',
                  ])
                }
              >
                {t('filmLab.rightPanel.reset')}
              </button>
            </div>
            <div className="slider-help">{t('filmLab.rightPanel.help.panel2TonalityLabIntro')}</div>

            <div className="hsl-channel-label">{t('filmLab.rightPanel.panel2.colorWorkflow')}</div>
            <div className="effect-grid" style={{ marginTop: 8 }}>
              <button
                type="button"
                className={`effect-btn${adjustments.inputWorkflowMode !== 'negative_film' ? ' active' : ''}`}
                onClick={() => updateAdjustment('inputWorkflowMode', 'digital')}
              >
                {t('filmLab.rightPanel.panel2.workflow.digital')}
              </button>
              <button
                type="button"
                className={`effect-btn${adjustments.inputWorkflowMode === 'negative_film' ? ' active' : ''}`}
                onClick={() => updateAdjustment('inputWorkflowMode', 'negative_film')}
              >
                {t('filmLab.rightPanel.panel2.workflow.negativeFilm')}
              </button>
            </div>

            <div className="hsl-channel-label" style={{ marginTop: 12 }}>
              {t('filmLab.rightPanel.panel2.filmFormatTitle')}
            </div>
            <div className="mini-tab-row" style={{ flexWrap: 'wrap' }}>
              {FILM_FORMAT_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`mini-tab${adjustments.filmFormatId === id ? ' active' : ''}`}
                  onClick={() => updateAdjustment('filmFormatId', id)}
                >
                  {t(`filmLab.rightPanel.panel2.filmFormat.${id}`)}
                </button>
              ))}
            </div>

            {renderSlider('pushPullEv')}
            {adjustments.inputWorkflowMode === 'negative_film' ? renderSlider('orangeMaskCorrection') : null}
            {adjustments.inputWorkflowMode !== 'negative_film' ? (
              <div className="slider-help">{t('filmLab.rightPanel.help.orangeMaskDigitalHint')}</div>
            ) : null}

            {pipelineKind === PIPELINE_KIND.RAW ? (
              <>
                <div className="hsl-channel-label" style={{ marginTop: 12 }}>
                  {t('filmLab.rightPanel.ingress.rawColorimetry')}
                </div>
                <select
                  className="ingress-raw-policy-select"
                  value={adjustments.rawColorimetryPolicy ?? 'auto'}
                  onChange={(e) => updateAdjustment('rawColorimetryPolicy', e.target.value)}
                  aria-label={t('filmLab.rightPanel.ingress.rawColorimetry')}
                >
                  <option value="auto">{t('filmLab.rightPanel.ingress.rawPolicy.auto')}</option>
                  <option value="camera_embed">{t('filmLab.rightPanel.ingress.rawPolicy.camera_embed')}</option>
                  <option value="generic_matrix">{t('filmLab.rightPanel.ingress.rawPolicy.generic_matrix')}</option>
                </select>
                <div className="slider-help">{t('filmLab.rightPanel.help.rawColorimetryReload')}</div>
              </>
            ) : null}

            <div className="hsl-channel-label" style={{ marginTop: 12 }}>
              {t('filmLab.rightPanel.panel2.profileBlendTitle')}
            </div>
            <div className="slider-help">{t('filmLab.rightPanel.help.panel2ProfileBlend')}</div>
            {renderSlider('strength')}
          </div>

          <div className="effect-section">
            <div className="effect-section-title">
              {t('filmLab.rightPanel.section.light')}
              <button
                className="section-reset"
                type="button"
                onClick={() => resetAdjustments([...DEVELOP_BASIC_LIGHT_KEYS])}
              >
                {t('filmLab.rightPanel.reset')}
              </button>
            </div>
            <div className="slider-help">{t('filmLab.rightPanel.help.panel2LightRolloff')}</div>
            {DEVELOP_BASIC_LIGHT_KEYS.map(renderSlider)}
          </div>

          <div className="effect-section">
            <div className="effect-section-title">
              {t('filmLab.rightPanel.section.emulsionChemistry')}
              <button
                className="section-reset"
                type="button"
                disabled={isInputProfile}
                onClick={() =>
                  resetAdjustments([
                    'filmToneResponseShape',
                    'emulsionReciprocityComp',
                    'emulsionEdgeAcutance',
                  ])
                }
              >
                {t('filmLab.rightPanel.reset')}
              </button>
            </div>
            <div className="slider-help">{t('filmLab.rightPanel.help.emulsionChemistryIntro')}</div>
            <div className="slider-help">{t('filmLab.rightPanel.help.emulsionToneShape')}</div>
            <div className="mini-tab-row">
              {FILM_TONE_RESPONSE_SHAPES.map((sid) => (
                <button
                  key={sid}
                  type="button"
                  className={`mini-tab${
                    normalizeFilmToneResponseShape(adjustments.filmToneResponseShape) === sid ? ' active' : ''
                  }`}
                  disabled={isInputProfile}
                  onClick={() => updateAdjustment('filmToneResponseShape', sid)}
                >
                  {t(`filmLab.rightPanel.emulsion.toneShape.${sid}`)}
                </button>
              ))}
            </div>
            {renderSlider('emulsionReciprocityComp')}
            {renderSlider('emulsionEdgeAcutance')}
            <div className="slider-help">{t('filmLab.rightPanel.help.emulsionEdgeVsClarity')}</div>
          </div>

          <div className="effect-section">
            <div className="effect-section-title">
              {t('filmLab.rightPanel.section.tone')}
              <button className="section-reset" type="button" onClick={() => resetAdjustments(['fade', 'clarity', 'dehaze'])}>
                {t('filmLab.rightPanel.reset')}
              </button>
            </div>
            <div className="slider-help">{t('filmLab.rightPanel.help.panel2LabFadeIntro')}</div>
            {['fade', 'clarity', 'dehaze'].map(renderSlider)}
          </div>
        </div>

        <div className={`panel-page${activePanel === 'color' ? ' active' : ''}`}>
          <div className="effect-section">
            <div className="effect-section-title">
              {t('filmLab.rightPanel.section.baseColor')}
              <button
                className="section-reset"
                type="button"
                onClick={() => resetAdjustments(['temp', 'tint', 'saturation', 'vibrance'])}
              >
                {t('filmLab.rightPanel.reset')}
              </button>
            </div>
            <div className="slider-help">{t('filmLab.rightPanel.help.panel2ColorTrimIntro')}</div>
            {renderSlider('temp')}
            {renderCustomSlider({
              id: 'tint',
              label: t('filmLab.slider.tint'),
              value: adjustments.tint,
              min: sliderDefs.tint.min,
              max: sliderDefs.tint.max,
              onChange: (value) => updateAdjustment('tint', value),
              onReset: () => resetSingleAdjustment('tint'),
            })}
            {renderCustomSlider({
              id: 'saturation',
              label: t('filmLab.slider.saturation'),
              value: adjustments.saturation,
              min: sliderDefs.saturation.min,
              max: sliderDefs.saturation.max,
              onChange: (value) => updateAdjustment('saturation', value),
              onReset: () => resetSingleAdjustment('saturation'),
            })}
            {renderCustomSlider({
              id: 'vibrance',
              label: t('filmLab.slider.vibrance'),
              value: adjustments.vibrance,
              min: sliderDefs.vibrance.min,
              max: sliderDefs.vibrance.max,
              onChange: (value) => updateAdjustment('vibrance', value),
              onReset: () => resetSingleAdjustment('vibrance'),
            })}
          </div>

          <div className="effect-section">
            <div className="effect-section-title">
              {t('filmLab.rightPanel.section.rgbCurves')}
              <button className="section-reset" type="button" onClick={resetCurves}>
                {t('filmLab.rightPanel.reset')}
              </button>
            </div>
            <div className="curves-ch-tabs">
              {['rgb', 'r', 'g', 'b'].map((channel) => (
                <button
                  key={channel}
                  className={`curves-ch-tab${activeCurveCh === channel ? ' active' : ''}`}
                  type="button"
                  onClick={() => setActiveCurveCh(channel)}
                >
                  {channel.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="curves-canvas-wrap">
              <canvas
                ref={curvesCanvasRef}
                width="288"
                height="160"
                onPointerDown={handleCurvePointerDown}
                onDoubleClick={handleCurveDoubleClick}
              />
            </div>
            <div className="slider-help">{t('filmLab.rightPanel.help.curveDoubleClick')}</div>
            {renderSlider('curveLumaMix')}
            <div className="slider-help">{t('filmLab.rightPanel.help.curveLumaMix')}</div>
          </div>

          <div className="effect-section">
            <div className="effect-section-title">
              {t('filmLab.rightPanel.section.hslChannels')}
              <button className="section-reset" type="button" onClick={resetColorMixer}>
                {t('filmLab.rightPanel.reset')}
              </button>
            </div>
            <div className="slider-help">{t('filmLab.rightPanel.help.hslChannelsIntro')}</div>
            <div className="hsl-channel-label">{t('filmLab.rightPanel.help.hslChannelLabel')}</div>
            <div className="mini-tab-row">
              {mixerGroups.map((group) => (
                <button
                  key={group.id}
                  className={`mini-tab${activeMixerGroup === group.id ? ' active' : ''}`}
                  type="button"
                  onClick={() => setActiveMixerGroup(group.id)}
                >
                  {group.label}
                </button>
              ))}
            </div>
            {mixerColors.map((color) =>
              renderCustomSlider({
                id: `mixer-${activeMixerGroup}-${color.id}`,
                label: color.label,
                value: colorMixer[activeMixerGroup][color.id],
                min: -100,
                max: 100,
                thumbColor:
                  activeMixerGroup === 'hue'
                    ? mixerThumbColor(color.id, colorMixer[activeMixerGroup][color.id])
                    : null,
                onChange: (value) => updateMixerValue(activeMixerGroup, color.id, value),
                onReset: () => resetMixerValue(activeMixerGroup, color.id),
              })
            )}
          </div>

          <div className="effect-section">
            <div className="effect-section-title">
              {t('filmLab.rightPanel.section.toneGrade')}
              <button className="section-reset" type="button" onClick={resetColorGrading}>
                {t('filmLab.rightPanel.reset')}
              </button>
            </div>
            <div className="mini-tab-row">
              {gradeZones.map((zone) => (
                <button
                  key={zone.id}
                  className={`mini-tab${activeGradeZone === zone.id ? ' active' : ''}`}
                  type="button"
                  onClick={() => setActiveGradeZone(zone.id)}
                >
                  {zone.label}
                </button>
              ))}
            </div>
            {activeGradeZone !== 'global' && (
              <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0' }}>
                <ColorWheel
                  label={
                    activeGradeZone === 'shadows'
                      ? t('filmLab.gradeZone.shadows')
                      : activeGradeZone === 'midtones'
                        ? t('filmLab.gradeZone.midtones')
                        : t('filmLab.gradeZone.highlights')
                  }
                  hue={colorGrading[activeGradeZone].hue}
                  saturation={colorGrading[activeGradeZone].saturation}
                  onChange={({ hue, saturation }) => {
                    updateColorGradeValue(activeGradeZone, 'hue', hue);
                    updateColorGradeValue(activeGradeZone, 'saturation', saturation);
                  }}
                  onReset={() => {
                    resetColorGradeValue(activeGradeZone, 'hue');
                    resetColorGradeValue(activeGradeZone, 'saturation');
                  }}
                  onAdjustSessionStart={onColorWheelSessionStart}
                  onAdjustSessionEnd={onColorWheelSessionEnd}
                />
              </div>
            )}
            {activeGradeZone === 'global' &&
              renderCustomSlider({
                id: `grade-global-hue`,
                label: t('filmLab.rightPanel.grade.hue'),
                value: colorGrading.global.hue,
                min: 0,
                max: 360,
                mode: 'degrees',
                thumbColor: hueToThumbColor(colorGrading.global.hue),
                thumbSize: 18,
                trackType: 'hue',
                onChange: (value) => updateColorGradeValue('global', 'hue', value),
                onReset: () => resetColorGradeValue('global', 'hue'),
              })}
            {activeGradeZone === 'global' &&
              renderCustomSlider({
                id: `grade-global-saturation`,
                label: t('filmLab.slider.saturation'),
                value: colorGrading.global.saturation,
                min: 0,
                max: 100,
                mode: 'percent',
                onChange: (value) => updateColorGradeValue('global', 'saturation', value),
                onReset: () => resetColorGradeValue('global', 'saturation'),
              })}
            {activeGradeZone !== 'global'
              ? renderCustomSlider({
                  id: `grade-${activeGradeZone}-luminance`,
                  label: t('filmLab.rightPanel.grade.luminance'),
                  value: colorGrading[activeGradeZone].luminance ?? 0,
                  min: -100,
                  max: 100,
                  onChange: (value) => updateColorGradeValue(activeGradeZone, 'luminance', value),
                  onReset: () => resetColorGradeValue(activeGradeZone, 'luminance'),
                })
              : null}
            {renderCustomSlider({
              id: 'grade-blending',
              label: t('filmLab.rightPanel.grade.blending'),
              value: colorGrading.blending,
              min: 0,
              max: 100,
              mode: 'percent',
              onChange: (value) => updateColorGradeValue('meta', 'blending', value),
              onReset: () => resetColorGradeValue('meta', 'blending'),
            })}
            {renderCustomSlider({
              id: 'grade-balance',
              label: t('filmLab.rightPanel.grade.balance'),
              value: colorGrading.balance,
              min: -100,
              max: 100,
              onChange: (value) => updateColorGradeValue('meta', 'balance', value),
              onReset: () => resetColorGradeValue('meta', 'balance'),
            })}
          </div>

          <div className="effect-section">
            <div className="effect-section-title">
              {t('filmLab.rightPanel.section.cameraCalibration')}
              <button className="section-reset" type="button" onClick={resetColorCalibration}>
                {t('filmLab.rightPanel.reset')}
              </button>
            </div>
            {renderCustomSlider({
              id: 'calibration-shadows-tint',
              label: t('filmLab.rightPanel.calibration.shadowsTint'),
              value: colorCalibration.shadowsTint,
              min: -100,
              max: 100,
              onChange: (value) => updateCalibrationValue('meta', 'shadowsTint', value),
              onReset: () => resetCalibrationValue('meta', 'shadowsTint'),
            })}
            {renderCustomSlider({
              id: 'calibration-red-hue',
              label: t('filmLab.rightPanel.calibration.redHue'),
              value: colorCalibration.red.hue,
              min: -100,
              max: 100,
              thumbColor: '#ff2d2d',
              onChange: (value) => updateCalibrationValue('red', 'hue', value),
              onReset: () => resetCalibrationValue('red', 'hue'),
            })}
            {renderCustomSlider({
              id: 'calibration-red-saturation',
              label: t('filmLab.rightPanel.calibration.redSaturation'),
              value: colorCalibration.red.saturation,
              min: -100,
              max: 100,
              thumbColor: '#ff2d2d',
              onChange: (value) => updateCalibrationValue('red', 'saturation', value),
              onReset: () => resetCalibrationValue('red', 'saturation'),
            })}
            {renderCustomSlider({
              id: 'calibration-green-hue',
              label: t('filmLab.rightPanel.calibration.greenHue'),
              value: colorCalibration.green.hue,
              min: -100,
              max: 100,
              thumbColor: '#2df52d',
              onChange: (value) => updateCalibrationValue('green', 'hue', value),
              onReset: () => resetCalibrationValue('green', 'hue'),
            })}
            {renderCustomSlider({
              id: 'calibration-green-saturation',
              label: t('filmLab.rightPanel.calibration.greenSaturation'),
              value: colorCalibration.green.saturation,
              min: -100,
              max: 100,
              thumbColor: '#2df52d',
              onChange: (value) => updateCalibrationValue('green', 'saturation', value),
              onReset: () => resetCalibrationValue('green', 'saturation'),
            })}
            {renderCustomSlider({
              id: 'calibration-blue-hue',
              label: t('filmLab.rightPanel.calibration.blueHue'),
              value: colorCalibration.blue.hue,
              min: -100,
              max: 100,
              thumbColor: '#2d6bff',
              onChange: (value) => updateCalibrationValue('blue', 'hue', value),
              onReset: () => resetCalibrationValue('blue', 'hue'),
            })}
            {renderCustomSlider({
              id: 'calibration-blue-saturation',
              label: t('filmLab.rightPanel.calibration.blueSaturation'),
              value: colorCalibration.blue.saturation,
              min: -100,
              max: 100,
              thumbColor: '#7ea6ff',
              onChange: (value) => updateCalibrationValue('blue', 'saturation', value),
              onReset: () => resetCalibrationValue('blue', 'saturation'),
            })}
          </div>
        </div>

        <div className={`panel-page${activePanel === 'detail' ? ' active' : ''}`}>
          <div className="effect-section">
            <div className="effect-section-title">
              {t('filmLab.rightPanel.section.panel4Ssg')}
              <button
                className="section-reset"
                type="button"
                onClick={() => resetAdjustments(['userGrain', 'userGrainSize'])}
              >
                {t('filmLab.rightPanel.reset')}
              </button>
            </div>
            <div className="slider-help">{t('filmLab.rightPanel.help.panel4SsgIntro')}</div>
            <div className="slider-help">{t('filmLab.rightPanel.help.grainIntro')}</div>
            {['userGrain', 'userGrainSize'].map(renderSlider)}
          </div>

          <div className="effect-section">
            <div className="effect-section-title">{t('filmLab.rightPanel.section.panel2LabGlow')}</div>
            <div className="slider-help">{t('filmLab.rightPanel.help.panel2LabGlowIntro')}</div>
            {renderSlider('bloom')}
            <div className="effect-grid" style={{ marginTop: 8 }}>
              <button
                type="button"
                className={`effect-btn${adjustments.bloomLabAccurate !== false ? ' active' : ''}`}
                onClick={() =>
                  updateAdjustment(
                    'bloomLabAccurate',
                    adjustments.bloomLabAccurate === false ? true : false
                  )
                }
              >
                {t('filmLab.rightPanel.bloomLabAccurate')}
              </button>
            </div>
            <div className="slider-help">{t('filmLab.rightPanel.help.bloomLabAccurateIntro')}</div>
          </div>

          <div className="effect-section">
            <div className="effect-section-title">{t('filmLab.rightPanel.section.analogDefects')}</div>
            <div className="slider-help">{t('filmLab.rightPanel.help.analogDefectsIntro')}</div>
            {renderSlider('chromAb')}
          </div>
        </div>

        <div className={`panel-page${activePanel === 'effects' ? ' active' : ''}`}>
          <div className="effect-section">
            <div className="effect-section-title">{t('filmLab.rightPanel.section.maskStudioHybrid')}</div>
            <div className="slider-help">{t('filmLab.rightPanel.help.maskStudioHybridIntro')}</div>
            <div className="effect-grid">
              <button
                type="button"
                className="effect-btn"
                disabled={!canUseHybridMaskStudio}
                onClick={() => applyMaskIntentPreset('subject')}
              >
                {t('filmLab.maskStudioHybrid.intent.subject')}
              </button>
              <button
                type="button"
                className="effect-btn"
                disabled={!canUseHybridMaskStudio}
                onClick={() => applyMaskIntentPreset('sky')}
              >
                {t('filmLab.maskStudioHybrid.intent.sky')}
              </button>
              <button
                type="button"
                className="effect-btn"
                disabled={!canUseHybridMaskStudio}
                onClick={() => applyMaskIntentPreset('background')}
              >
                {t('filmLab.maskStudioHybrid.intent.background')}
              </button>
            </div>
            <div className="slider-help">{t('filmLab.rightPanel.help.maskStudioHybridAdvancedHint')}</div>
          </div>

          <div className="effect-section">
            <div className="effect-section-title">{t('filmLab.rightPanel.section.panelJDepthExport')}</div>
            <div className="slider-help">{t('filmLab.rightPanel.help.panelJDepthExportIntro')}</div>
            <div className="effect-grid">
              <button
                type="button"
                className={`effect-btn${String(adjustments?.depthMapSource ?? 'luminance') !== 'onnx' ? ' active' : ''}`}
                onClick={() => updateAdjustment('depthMapSource', 'luminance')}
              >
                {t('filmLab.localMask.depthMapSourceEstimateBtn')}
              </button>
              <button
                type="button"
                className={`effect-btn${String(adjustments?.depthMapSource ?? 'luminance') === 'onnx' ? ' active' : ''}`}
                onClick={() => updateAdjustment('depthMapSource', 'onnx')}
              >
                {t('filmLab.localMask.depthMapSourceModelBtn')}
              </button>
            </div>
            <div className="slider-help">{t('filmLab.rightPanel.help.panelJDepthExportHint')}</div>
          </div>

          <div className="effect-section">
            <div className="effect-section-title">{t('filmLab.rightPanel.section.panel10WorkflowQc')}</div>
            <div className="slider-help">{t('filmLab.rightPanel.help.panel10WorkflowQcIntro')}</div>
            <div className="effect-grid">
              {snapshotSlots.map((slot) => (
                <button
                  key={`snapshot-save-${slot.id}`}
                  className={`effect-btn${slot.hasValue ? ' active' : ''}`}
                  type="button"
                  disabled={!canUseSnapshots}
                  onClick={() => saveSnapshotSlot(slot.index)}
                >
                  {t('filmLab.rightPanel.snapshotSave', { slot: slot.id })}
                </button>
              ))}
            </div>
            <div className="effect-grid" style={{ marginTop: 8 }}>
              {snapshotSlots.map((slot) => (
                <button
                  key={`snapshot-load-${slot.id}`}
                  className={`effect-btn${slot.hasValue ? ' active' : ''}`}
                  type="button"
                  disabled={!slot.hasValue || !canUseSnapshots}
                  onClick={() => applySnapshotSlot(slot.index)}
                >
                  {t('filmLab.rightPanel.snapshotApply', { slot: slot.id })}
                </button>
              ))}
            </div>
          </div>

          <div className="effect-section">
            <div className="effect-section-title">{t('filmLab.rightPanel.section.panel5OpticsPhysics')}</div>
            <div className="slider-help">{t('filmLab.rightPanel.help.panel5OpticsPhysicsIntro')}</div>
          </div>

          <div className="effect-section">
            <div className="effect-section-title">{t('filmLab.rightPanel.section.randomOverlays')}</div>
            <div className="slider-help">{t('filmLab.rightPanel.help.randomOverlaysIntro')}</div>
            <div className="effect-grid">
              <button
                className={`effect-btn${(adjustments.dust ?? 0) > 0 ? ' active' : ''}`}
                type="button"
                onClick={triggerDustZip}
              >
                {t('filmLab.rightPanel.effects.dustScratches')}
              </button>
              <button
                className={`effect-btn${(adjustments.dust ?? 0) === 0 ? ' active' : ''}`}
                type="button"
                onClick={disableDustZip}
              >
                {t('filmLab.rightPanel.effects.dustDisable')}
              </button>
              <button
                className={`effect-btn${adjustments.leak === 'raw-leakedge' ? ' active' : ''}`}
                type="button"
                onClick={triggerRawLeakZip}
              >
                RAW Light Leak
              </button>
              <button
                className={`effect-btn${adjustments.leak !== 'raw-leakedge' ? ' active' : ''}`}
                type="button"
                onClick={disableRawLeakZip}
              >
                {t('filmLab.rightPanel.effects.rawLeakDisable')}
              </button>
            </div>
          </div>

          <div className="effect-section">
            <div className="effect-section-title">{t('filmLab.rightPanel.section.vignette')}</div>
            <div className="slider-help">{t('filmLab.rightPanel.help.panel6LegacyPrintIntro')}</div>
            {renderSlider('userVignette')}
          </div>

          <div className="effect-section">
            <div className="effect-section-title">{t('filmLab.rightPanel.section.panel6LegacyPrint')}</div>
            <div className="slider-help">{t('filmLab.rightPanel.help.panel6LegacyPrintHint')}</div>
            <div className="effect-section-title">{t('filmLab.rightPanel.section.lightLeak')}</div>
            <div className="effect-grid">
              {leakOptions.map((option) => (
                <button
                  key={option.id}
                  className={`effect-btn${adjustments.leak === option.id ? ' active' : ''}`}
                  type="button"
                  onClick={() => setLeak(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="effect-section">
            <div className="effect-section-title">{t('filmLab.rightPanel.section.frameStyle')}</div>
            <div className="effect-grid">
              {frameOptions.map((option) => (
                <button
                  key={option.id}
                  className={`effect-btn${adjustments.frame === option.id ? ' active' : ''}`}
                  type="button"
                  onClick={() => setFrame(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={`panel-page${activePanel === 'kino' ? ' active' : ''}`}>
          <div className="effect-section kino-intro">
            <div className="kino-icon">🎬</div>
            <div className="kino-title">{t('filmLab.rightPanel.section.kinoTitle')}</div>
            <div className="kino-subtitle">{t('filmLab.rightPanel.section.kinoSubtitle')}</div>
            <div className="slider-help">{t('filmLab.rightPanel.help.panel5KinoIntro')}</div>
          </div>

          <div className="effect-section">
            <div className="effect-section-title">{t('filmLab.rightPanel.section.halation')}</div>
            {['halation', 'halRadius', 'halThresh'].map(renderSlider)}
            {renderCustomSlider({
              id: 'kino-hal-hue',
              label: t('filmLab.slider.halHue'),
              value: adjustments.halHue,
              min: sliderDefs.halHue.min,
              max: sliderDefs.halHue.max,
              thumbColor: kinoRbThumbColor(adjustments.halHue),
              thumbSize: 20,
              trackType: 'rb',
              onChange: (value) => updateAdjustment('halHue', value),
              onReset: () => resetSingleAdjustment('halHue'),
            })}
          </div>

          <div className="effect-section">
            <div className="effect-section-title">{t('filmLab.rightPanel.section.anamorphic')}</div>
            {['anamorph', 'streakLen'].map(renderSlider)}
          </div>

          <div className="effect-section">
            <div className="effect-section-title">{t('filmLab.rightPanel.section.gateWeave')}</div>
            {renderSlider('gateWeave')}
          </div>

          <div className="effect-section">
            <div className="effect-section-title">{t('filmLab.rightPanel.section.doubleExposure')}</div>
            <input
              ref={doubleExposureInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  setDoubleExposureOverlay?.(file);
                }
                event.target.value = '';
              }}
            />
            <div className="effect-grid">
              <button
                className="effect-btn"
                type="button"
                disabled={!hasImage}
                onClick={() => doubleExposureInputRef.current?.click()}
              >
                {t('filmLab.rightPanel.doubleExposureLoadPlate')}
              </button>
              <button
                className="effect-btn"
                type="button"
                disabled={!doubleExposurePlateReady}
                onClick={() => setDoubleExposureOverlay?.(null)}
              >
                {t('filmLab.rightPanel.doubleExposureClearPlate')}
              </button>
            </div>
            <div className="slider-help">
              {!doubleExposurePlateReady ? (
                '\u00a0'
              ) : (
                <>
                  <div>
                    {doubleExposurePlateOrigin === 'opfs'
                      ? t('filmLab.rightPanel.doubleExposureRestoredFromCache')
                      : t('filmLab.rightPanel.doubleExposurePlateHint')}
                  </div>
                  {doubleExposurePlateOrigin === 'file' ? (
                    <div className="slider-help-nested">{t('filmLab.rightPanel.doubleExposureOpfsPersistHint')}</div>
                  ) : null}
                </>
              )}
            </div>
            {renderSlider('doubleExposureAmount')}
            <div className="effect-grid">
              <button
                className={`effect-btn${adjustments.doubleExposureBlendMode !== 'multiply' ? ' active' : ''}`}
                type="button"
                onClick={() => updateAdjustment('doubleExposureBlendMode', 'screen')}
              >
                {t('filmLab.rightPanel.doubleExposureBlendScreen')}
              </button>
              <button
                className={`effect-btn${adjustments.doubleExposureBlendMode === 'multiply' ? ' active' : ''}`}
                type="button"
                onClick={() => updateAdjustment('doubleExposureBlendMode', 'multiply')}
              >
                {t('filmLab.rightPanel.doubleExposureBlendMultiply')}
              </button>
            </div>
          </div>
        </div>

        <div className={`panel-page${activePanel === 'crop' ? ' active' : ''}`}>
          <div className="effect-section">
            <div className="effect-section-title">{t('filmLab.rightPanel.section.cropAspectTitle')}</div>
            <div className="crop-aspect-grid">
              {cropAspectPresets.map((preset) => (
                <button
                  key={preset.id}
                  className={`mini-tab${activeCropAspectPreset === preset.id ? ' active' : ''}`}
                  type="button"
                  onClick={() => setCropAspectPreset(preset.id)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="slider-help">
              {t('filmLab.rightPanel.help.cropAspectActive', {
                label: activeCropAspect.label,
                ratioHint: activeCropAspect.ratio
                  ? t('filmLab.rightPanel.help.cropRatioLocked')
                  : t('filmLab.rightPanel.help.cropRatioFree'),
              })}
            </div>
          </div>

          <div className="effect-section">
            <div className="effect-section-title">{t('filmLab.rightPanel.section.cropOverlayTitle')}</div>
            <div className="crop-overlay-grid">
              {cropOverlayModes.map((mode) => (
                <button
                  key={mode.id}
                  className={`crop-overlay-btn${activeCropOverlayMode === mode.id ? ' active' : ''}`}
                  type="button"
                  onClick={() => setCropOverlayMode(mode.id)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <div className="crop-action-row">
              <button className="effect-btn" type="button" onClick={cycleCropOverlayMode}>
                {t('filmLab.rightPanel.crop.overlayNext')}
              </button>
              <button className="effect-btn" type="button" onClick={rotateCropOverlay}>
                {t('filmLab.rightPanel.crop.overlayRotate90')}
              </button>
            </div>
          </div>

          <div className="effect-section">
            <div className="effect-section-title">
              {t('filmLab.rightPanel.section.cropStraightenTitle')}
              <button
                className="section-reset"
                type="button"
                onClick={() => {
                  cancelManualStraighten();
                  cancelCropDraft();
                  resetAdjustments([
                    'level',
                    'cropRectX',
                    'cropRectY',
                    'cropRectW',
                    'cropRectH',
                    'cropZoom',
                    'cropX',
                    'cropY',
                    'cropAspect',
                    'cropOverlayMode',
                    'cropOverlayOrientation',
                    'autoStraightenConfidence',
                  ]);
                }}
              >
                {t('filmLab.rightPanel.reset')}
              </button>
            </div>
            {['level'].map(renderSlider)}
            <div className="slider-help">{t('filmLab.rightPanel.help.cropCommitHint')}</div>
            <div className="crop-action-row">
              <button className="effect-btn" type="button" onClick={rotateImage}>
                {t('filmLab.rightPanel.crop.rotate90')}
              </button>
              <button
                className={`effect-btn${adjustments.flipped ? ' active' : ''}`}
                type="button"
                onClick={toggleFlip}
              >
                {t('filmLab.rightPanel.crop.flipHorizontal')}
              </button>
              <button className="effect-btn" type="button" onClick={() => resetAdjustments(['level'])}>
                {t('filmLab.rightPanel.crop.resetLevel')}
              </button>
            </div>
          </div>

          <div className="effect-section">
            <div className="effect-section-title">{t('filmLab.rightPanel.section.manualStraightenTitle')}</div>
            <div className="crop-action-row">
              <button
                className={`effect-btn${isStraightenToolArmed ? ' active' : ''}`}
                type="button"
                onClick={() => {
                  const next = !isStraightenToolArmed;
                  if (!next) {
                    cancelManualStraighten();
                    return;
                  }
                  setIsStraightenToolArmed(true);
                  beginManualStraightenSession();
                }}
              >
                {isStraightenToolArmed
                  ? t('filmLab.rightPanel.crop.straightenCancel')
                  : t('filmLab.rightPanel.crop.straightenEnable')}
              </button>
              <button className="effect-btn" type="button" onClick={runAutoStraighten}>
                {t('filmLab.rightPanel.crop.autoStraightenProxy')}
              </button>
            </div>
            <div className="slider-help">
              {isStraightenToolArmed
                ? t('filmLab.rightPanel.help.straightenManualArmed')
                : t('filmLab.rightPanel.help.straightenManualIdle')}
            </div>
            {Number(adjustments.autoStraightenConfidence ?? 0) > 0 ? (
              <div className="crop-confidence">
                {t('filmLab.rightPanel.crop.autoStraightenConfidence', {
                  percent: (Number(adjustments.autoStraightenConfidence) * 100).toFixed(1),
                })}
              </div>
            ) : null}
          </div>

          <div className="effect-section">
            <div className="effect-section-title">{t('filmLab.rightPanel.section.nonDestructiveState')}</div>
            <div className="crop-state-grid">
              <div className="crop-state-item">
                <span>{t('filmLab.rightPanel.crop.coordX')}</span>
                <strong>{activeCropRectNorm.x.toFixed(3)}</strong>
              </div>
              <div className="crop-state-item">
                <span>{t('filmLab.rightPanel.crop.coordY')}</span>
                <strong>{activeCropRectNorm.y.toFixed(3)}</strong>
              </div>
              <div className="crop-state-item">
                <span>{t('filmLab.rightPanel.crop.coordW')}</span>
                <strong>{activeCropRectNorm.w.toFixed(3)}</strong>
              </div>
              <div className="crop-state-item">
                <span>{t('filmLab.rightPanel.crop.coordH')}</span>
                <strong>{activeCropRectNorm.h.toFixed(3)}</strong>
              </div>
              <div className="crop-state-item">
                <span>{t('filmLab.rightPanel.zoom')}</span>
                <strong>{Math.round((1 / Math.max(activeCropRectNorm.w, activeCropRectNorm.h)) * 100)}%</strong>
              </div>
              <div className="crop-state-item">
                <span>{t('filmLab.rightPanel.crop.stateAspect')}</span>
                <strong>{activeCropAspect.id}</strong>
              </div>
            </div>
            <div className="slider-help">{t('filmLab.rightPanel.help.cropStateHint')}</div>
          </div>
        </div>
      </div>

      <div className="free-tier-info">
        {hasImage
          ? t('filmLab.rightPanel.footer.renderReady', { name: activeFilm.name })
          : t('filmLab.rightPanel.footer.uploadPrompt')}
      </div>
    </aside>
  );
}
