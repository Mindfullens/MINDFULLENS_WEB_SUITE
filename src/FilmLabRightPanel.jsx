import ColorWheel from './ColorWheel.jsx';
import { useFilmLabColorGradeWheelAdjustSession } from './filmLab/useFilmLabColorGradeWheelAdjustSession.js';

const LEAK_OPTIONS = [
  { id: 'none', label: 'Brak' },
  { id: 'warm', label: 'Ciepłe' },
  { id: 'cool', label: 'Zimne' },
  { id: 'vintage', label: 'Vintage' },
  { id: 'prism', label: 'Pryzmat' },
  { id: 'halation', label: 'Halacja' },
];

const FRAME_OPTIONS = [
  { id: 'none', label: 'Brak' },
  { id: 'border-thin', label: 'Cienka biała' },
  { id: 'polaroid', label: 'Polaroid' },
  { id: 'border-thick', label: 'Gruba biała' },
  { id: 'black-thin', label: 'Cienka czarna' },
  { id: 'black-thick', label: 'Gruba czarna' },
  { id: 'filmstrip', label: 'Klisza' },
  { id: 'raw-darkroom', label: 'Raw Darkroom' },
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
}) {
  const { onColorWheelSessionStart, onColorWheelSessionEnd } = useFilmLabColorGradeWheelAdjustSession({
    activeGradeZone,
    saveUndo,
    setIsAdjusting,
    setInteractionKind,
    handleSliderEnd,
  });

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
            <div className="effect-section-title">Cała historia</div>
            <div className="slider-help">
              Pełny łańcuch zmian: wszystkie kroki zapisane w Film Lab oraz aktualny stan roboczy.
            </div>
            <div className="history-actions-row">
              <button type="button" className="effect-btn" onClick={undoAction} disabled={!undoStackRef.current.length}>
                Cofnij ostatni krok
              </button>
              <button type="button" className="effect-btn" onClick={redoAction} disabled={!redoStackRef.current.length}>
                Dalej
              </button>
              <span className="history-count-label">
                Kroków zapisanych: {Math.max(0, fullHistoryTimeline.length - 1)}
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
                    <span>{entry.isCurrent ? 'TERAZ' : `#${index + 1}`}</span>
                  </div>
                  <div className="history-timeline-grid">
                    <span>Profil</span>
                    <strong>{entry.filmName}</strong>
                    <span>Ekspozycja</span>
                    <strong>{entry.exposure.toFixed(0)}</strong>
                    <span>Kontrast</span>
                    <strong>{entry.contrast.toFixed(0)}</strong>
                    <span>Obrót</span>
                    <strong>{entry.rotation.toFixed(1)}°</strong>
                    <span>Odbicie</span>
                    <strong>{entry.flipped ? 'ON' : 'OFF'}</strong>
                    <span>Zoom</span>
                    <strong>{Math.round(entry.zoom * 100)}%</strong>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>

        <div className={`panel-page${activePanel === 'basic' ? ' active' : ''}`}>
          <div className="effect-section">
            <div className="effect-section-title">
              Profil
              <button
                className="section-reset"
                type="button"
                disabled={isInputProfile}
                onClick={() => resetAdjustments(['strength'])}
              >
                Reset
              </button>
            </div>
            {renderSlider('strength')}
          </div>

          <div className="effect-section">
            <div className="effect-section-title">
              Światło
              <button
                className="section-reset"
                type="button"
                onClick={() =>
                  resetAdjustments(['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks'])
                }
              >
                Reset
              </button>
            </div>
            {['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks'].map(renderSlider)}
          </div>

          <div className="effect-section">
            <div className="effect-section-title">
              Ton
              <button className="section-reset" type="button" onClick={() => resetAdjustments(['fade', 'clarity', 'dehaze'])}>
                Reset
              </button>
            </div>
            {['fade', 'clarity', 'dehaze'].map(renderSlider)}
          </div>
        </div>

        <div className={`panel-page${activePanel === 'color' ? ' active' : ''}`}>
          <div className="effect-section">
            <div className="effect-section-title">
              Kolor bazowy
              <button
                className="section-reset"
                type="button"
                onClick={() => resetAdjustments(['temp', 'tint', 'saturation', 'vibrance'])}
              >
                Reset
              </button>
            </div>
            {renderSlider('temp')}
            {renderCustomSlider({
              id: 'tint',
              label: sliderDefs.tint.label,
              value: adjustments.tint,
              min: sliderDefs.tint.min,
              max: sliderDefs.tint.max,
              onChange: (value) => updateAdjustment('tint', value),
              onReset: () => resetSingleAdjustment('tint'),
            })}
            {renderCustomSlider({
              id: 'saturation',
              label: sliderDefs.saturation.label,
              value: adjustments.saturation,
              min: sliderDefs.saturation.min,
              max: sliderDefs.saturation.max,
              onChange: (value) => updateAdjustment('saturation', value),
              onReset: () => resetSingleAdjustment('saturation'),
            })}
            {renderCustomSlider({
              id: 'vibrance',
              label: sliderDefs.vibrance.label,
              value: adjustments.vibrance,
              min: sliderDefs.vibrance.min,
              max: sliderDefs.vibrance.max,
              onChange: (value) => updateAdjustment('vibrance', value),
              onReset: () => resetSingleAdjustment('vibrance'),
            })}
          </div>

          <div className="effect-section">
            <div className="effect-section-title">
              Krzywe RGB
              <button className="section-reset" type="button" onClick={resetCurves}>
                Reset
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
            <div className="slider-help">Dwuklik punktu usuwa punkt krzywej.</div>
            {renderSlider('curveLumaMix')}
            <div className="slider-help">
              0% = RGB (więcej nasycenia), 100% = Luma (bez dodatkowego nasycania jak w C1).
            </div>
          </div>

          <div className="effect-section">
            <div className="effect-section-title">
              Kanały HSL
              <button className="section-reset" type="button" onClick={resetColorMixer}>
                Reset
              </button>
            </div>
            <div className="slider-help">
              Wybierz kanał HSL poniżej: osobno ustawiasz nasycenie, przesunięcie barwy i jasność.
            </div>
            <div className="hsl-channel-label">Kanał HSL</div>
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
              Gradacja tonalna
              <button className="section-reset" type="button" onClick={resetColorGrading}>
                Reset
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
                      ? 'Cienie'
                      : activeGradeZone === 'midtones'
                        ? 'Półtony'
                        : 'Światła'
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
                label: 'Barwa',
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
                label: 'Nasycenie',
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
                  label: 'Luminancja',
                  value: colorGrading[activeGradeZone].luminance ?? 0,
                  min: -100,
                  max: 100,
                  onChange: (value) => updateColorGradeValue(activeGradeZone, 'luminance', value),
                  onReset: () => resetColorGradeValue(activeGradeZone, 'luminance'),
                })
              : null}
            {renderCustomSlider({
              id: 'grade-blending',
              label: 'Mieszanie',
              value: colorGrading.blending,
              min: 0,
              max: 100,
              mode: 'percent',
              onChange: (value) => updateColorGradeValue('meta', 'blending', value),
              onReset: () => resetColorGradeValue('meta', 'blending'),
            })}
            {renderCustomSlider({
              id: 'grade-balance',
              label: 'Balans',
              value: colorGrading.balance,
              min: -100,
              max: 100,
              onChange: (value) => updateColorGradeValue('meta', 'balance', value),
              onReset: () => resetColorGradeValue('meta', 'balance'),
            })}
          </div>

          <div className="effect-section">
            <div className="effect-section-title">
              Kalibracja aparatu
              <button className="section-reset" type="button" onClick={resetColorCalibration}>
                Reset
              </button>
            </div>
            {renderCustomSlider({
              id: 'calibration-shadows-tint',
              label: 'Tint cieni (Z↔M)',
              value: colorCalibration.shadowsTint,
              min: -100,
              max: 100,
              onChange: (value) => updateCalibrationValue('meta', 'shadowsTint', value),
              onReset: () => resetCalibrationValue('meta', 'shadowsTint'),
            })}
            {renderCustomSlider({
              id: 'calibration-red-hue',
              label: 'Barwa czerwonej składowej',
              value: colorCalibration.red.hue,
              min: -100,
              max: 100,
              thumbColor: '#ff2d2d',
              onChange: (value) => updateCalibrationValue('red', 'hue', value),
              onReset: () => resetCalibrationValue('red', 'hue'),
            })}
            {renderCustomSlider({
              id: 'calibration-red-saturation',
              label: 'Nasycenie czerwonej składowej',
              value: colorCalibration.red.saturation,
              min: -100,
              max: 100,
              thumbColor: '#ff2d2d',
              onChange: (value) => updateCalibrationValue('red', 'saturation', value),
              onReset: () => resetCalibrationValue('red', 'saturation'),
            })}
            {renderCustomSlider({
              id: 'calibration-green-hue',
              label: 'Barwa zielonej składowej',
              value: colorCalibration.green.hue,
              min: -100,
              max: 100,
              thumbColor: '#2df52d',
              onChange: (value) => updateCalibrationValue('green', 'hue', value),
              onReset: () => resetCalibrationValue('green', 'hue'),
            })}
            {renderCustomSlider({
              id: 'calibration-green-saturation',
              label: 'Nasycenie zielonej składowej',
              value: colorCalibration.green.saturation,
              min: -100,
              max: 100,
              thumbColor: '#2df52d',
              onChange: (value) => updateCalibrationValue('green', 'saturation', value),
              onReset: () => resetCalibrationValue('green', 'saturation'),
            })}
            {renderCustomSlider({
              id: 'calibration-blue-hue',
              label: 'Barwa niebieskiej składowej',
              value: colorCalibration.blue.hue,
              min: -100,
              max: 100,
              thumbColor: '#2d6bff',
              onChange: (value) => updateCalibrationValue('blue', 'hue', value),
              onReset: () => resetCalibrationValue('blue', 'hue'),
            })}
            {renderCustomSlider({
              id: 'calibration-blue-saturation',
              label: 'Nasycenie niebieskiej składowej',
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
              Ziarno filmowe
              <button
                className="section-reset"
                type="button"
                onClick={() => resetAdjustments(['userGrain', 'userGrainSize'])}
              >
                Reset
              </button>
            </div>
            <div className="slider-help">0 = brak ziarna. Domyślna wartość jest dobierana wg ISO filmu.</div>
            {['userGrain', 'userGrainSize'].map(renderSlider)}
          </div>

          <div className="effect-section">
            <div className="effect-section-title">Defekty analogowe</div>
            <div className="slider-help">Aberacja chromatyczna i bloom (poświata).</div>
            {['chromAb', 'bloom'].map(renderSlider)}
          </div>
        </div>

        <div className={`panel-page${activePanel === 'effects' ? ' active' : ''}`}>
          <div className="effect-section">
            <div className="effect-section-title">Losowe nakładki</div>
            <div className="slider-help">
              Każde kliknięcie losuje inny plik. Skróty: `D` = Rysy, `L` = RAW Leak.
            </div>
            <div className="effect-grid">
              <button
                className={`effect-btn${(adjustments.dust ?? 0) > 0 ? ' active' : ''}`}
                type="button"
                onClick={triggerDustZip}
              >
                Rysy
              </button>
              <button
                className={`effect-btn${(adjustments.dust ?? 0) === 0 ? ' active' : ''}`}
                type="button"
                onClick={disableDustZip}
              >
                Wyłącz Rysy
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
                Wyłącz RAW Leak
              </button>
            </div>
          </div>

          <div className="effect-section">
            <div className="effect-section-title">Winieta</div>
            {renderSlider('userVignette')}
          </div>

          <div className="effect-section">
            <div className="effect-section-title">Przecieki światła</div>
            <div className="effect-grid">
              {LEAK_OPTIONS.map((option) => (
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
            <div className="effect-section-title">Ramka</div>
            <div className="effect-grid">
              {FRAME_OPTIONS.map((option) => (
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
            <div className="kino-title">Kino 3D</div>
            <div className="kino-subtitle">Halacja i efekty anamorfczne.</div>
          </div>

          <div className="effect-section">
            <div className="effect-section-title">Halacja</div>
            {['halation', 'halRadius', 'halThresh'].map(renderSlider)}
            {renderCustomSlider({
              id: 'kino-hal-hue',
              label: sliderDefs.halHue.label,
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
            <div className="effect-section-title">Anamorficzne</div>
            {['anamorph', 'streakLen'].map(renderSlider)}
          </div>
        </div>

        <div className={`panel-page${activePanel === 'crop' ? ' active' : ''}`}>
          <div className="effect-section">
            <div className="effect-section-title">Proporcje kadru</div>
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
              Aktywny preset: {activeCropAspect.label}
              {activeCropAspect.ratio ? ' (blokada proporcji włączona)' : ' (bez blokady proporcji)'}.
            </div>
          </div>

          <div className="effect-section">
            <div className="effect-section-title">Nakładki kompozycyjne</div>
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
                Następna (O)
              </button>
              <button className="effect-btn" type="button" onClick={rotateCropOverlay}>
                Obrót nakładki 90°
              </button>
            </div>
          </div>

          <div className="effect-section">
            <div className="effect-section-title">
              Kadrowanie i prostowanie
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
                Reset
              </button>
            </div>
            {['level'].map(renderSlider)}
            <div className="slider-help">
              Zatwierdzanie kadru: Enter, 2x klik na ramce lub środkowy znacznik.
            </div>
            <div className="crop-action-row">
              <button className="effect-btn" type="button" onClick={rotateImage}>
                Obrót 90°
              </button>
              <button
                className={`effect-btn${adjustments.flipped ? ' active' : ''}`}
                type="button"
                onClick={toggleFlip}
              >
                Odbicie poziome
              </button>
              <button className="effect-btn" type="button" onClick={() => resetAdjustments(['level'])}>
                Zeruj poziom
              </button>
            </div>
          </div>

          <div className="effect-section">
            <div className="effect-section-title">Ręczne prostowanie i auto-straighten</div>
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
                {isStraightenToolArmed ? 'Anuluj prostowanie' : 'Włącz prostowanie ręczne'}
              </button>
              <button className="effect-btn" type="button" onClick={runAutoStraighten}>
                Auto (proxy)
              </button>
            </div>
            <div className="slider-help">
              {isStraightenToolArmed
                ? 'Naciśnij na jednym końcu horyzontu, przeciągnij do drugiego i puść. Zwolnienie myszy automatycznie zatwierdza prostowanie.'
                : 'Tryb ręczny działa na Pointer Events + pointer capture oraz geometrii znormalizowanej, bez dryfu między klatkami.'}
            </div>
            {Number(adjustments.autoStraightenConfidence ?? 0) > 0 ? (
              <div className="crop-confidence">
                Pewność auto-straighten: {(Number(adjustments.autoStraightenConfidence) * 100).toFixed(1)}%
              </div>
            ) : null}
          </div>

          <div className="effect-section">
            <div className="effect-section-title">Stan niedestrukcyjny</div>
            <div className="crop-state-grid">
              <div className="crop-state-item">
                <span>x</span>
                <strong>{activeCropRectNorm.x.toFixed(3)}</strong>
              </div>
              <div className="crop-state-item">
                <span>y</span>
                <strong>{activeCropRectNorm.y.toFixed(3)}</strong>
              </div>
              <div className="crop-state-item">
                <span>w</span>
                <strong>{activeCropRectNorm.w.toFixed(3)}</strong>
              </div>
              <div className="crop-state-item">
                <span>h</span>
                <strong>{activeCropRectNorm.h.toFixed(3)}</strong>
              </div>
              <div className="crop-state-item">
                <span>Zoom</span>
                <strong>{Math.round((1 / Math.max(activeCropRectNorm.w, activeCropRectNorm.h)) * 100)}%</strong>
              </div>
              <div className="crop-state-item">
                <span>Aspect</span>
                <strong>{activeCropAspect.id}</strong>
              </div>
            </div>
            <div className="slider-help">Stan kadru jest trzymany niedestrukcyjnie jako znormalizowane `x/y/w/h`.</div>
          </div>
        </div>
      </div>

      <div className="free-tier-info">
        {hasImage ? `Render gotowy · ${activeFilm.name}` : 'Wgraj zdjęcie, aby rozpocząć'}
      </div>
    </aside>
  );
}
