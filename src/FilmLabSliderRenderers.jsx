import { mapTemperatureToKelvin } from './engine/sliderResponseMap.js';
import { formatCustomSliderValue, formatSliderValue } from './engine/filmLabSliderFormat.js';
import { useI18n } from './i18n';
import { markFilmLabE2ePointerDown } from './filmLab/previewE2ePointerMark.js';
import {
  getActiveMaskSlotGraphNodeId,
  isAdjustmentBoundToMask,
  toggleAdjustmentMaskBinding,
} from './filmLab/useFilmLabMaskBindings.js';

function FilmLabSliderTrack({
  name,
  adjustments,
  updateAdjustment,
  isInputProfile,
  sliderDefs,
  handleSliderStart,
  handleSliderEnd,
  handleSliderChange,
  handleTemperatureSliderChange,
  handleSliderDoubleClick,
  handleSliderTouchStart,
}) {
  const { t } = useI18n();
  const isDisabled = name === 'strength' && isInputProfile;
  const displayValue = isDisabled ? '—' : formatSliderValue(name, adjustments[name]);
  const isTemperatureSlider = name === 'temp';
  const sliderMin = isTemperatureSlider ? 2000 : sliderDefs[name].min;
  const sliderMax = isTemperatureSlider ? 10000 : sliderDefs[name].max;
  const sliderValue = isTemperatureSlider
    ? Math.round(mapTemperatureToKelvin(adjustments[name]))
    : adjustments[name];

  const bound = isAdjustmentBoundToMask(adjustments, name);
  const nodeId = getActiveMaskSlotGraphNodeId(adjustments);
  const canPin =
    typeof updateAdjustment === 'function' &&
    Array.isArray(adjustments?.localMasks) &&
    adjustments.localMasks.length > 0 &&
    adjustments?.uiMode !== 'simple';

  const toggleBinding = () => {
    if (!canPin || typeof updateAdjustment !== 'function') {
      return;
    }
    toggleAdjustmentMaskBinding(adjustments, name, updateAdjustment);
  };

  return (
    <div className={`slider-group${isDisabled ? ' is-disabled' : ''}`}>
      <div className="slider-label">
        <span className="slider-name">{t(`filmLab.slider.${name}`)}</span>
        {canPin ? (
          <button
            type="button"
            className={`slider-mask-pin${bound ? ' active' : ''}`}
            title={
              bound
                ? t('filmLab.sliderMaskBind.activeTitle', { node: nodeId })
                : t('filmLab.sliderMaskBind.idleTitle', { node: nodeId })
            }
            aria-label={t('filmLab.sliderMaskBind.aria')}
            aria-pressed={bound}
            onClick={(e) => {
              e.preventDefault();
              toggleBinding();
            }}
          >
            ◎
          </button>
        ) : null}
        <span className="slider-val">{displayValue}</span>
      </div>
      <input
        className="slider-input"
        id={`${name}Slider`}
        name={`${name}Slider`}
        type="range"
        min={sliderMin}
        max={sliderMax}
        value={sliderValue}
        disabled={isDisabled}
        onMouseDown={(event) => handleSliderStart(`slider:${name}`, event)}
        onTouchStart={handleSliderTouchStart(name)}
        onDoubleClick={() => handleSliderDoubleClick(name)}
        onInput={isTemperatureSlider ? handleTemperatureSliderChange : handleSliderChange(name)}
        onPointerUp={handleSliderEnd}
        onPointerCancel={handleSliderEnd}
        onTouchEnd={handleSliderEnd}
        onBlur={handleSliderEnd}
      />
      {isDisabled ? <div className="slider-help">{t('filmLab.sliderHelp.inputProfileStrength')}</div> : null}
    </div>
  );
}

export function createFilmLabSliderRenderers({
  adjustments,
  updateAdjustment,
  isInputProfile,
  sliderDefs,
  handleSliderStart,
  handleSliderEnd,
  handleSliderChange,
  handleTemperatureSliderChange,
  handleSliderDoubleClick,
  handleSliderTouchStart,
  handleCustomSliderTouchStart,
  sliderDragActivationRef,
  isAdjusting,
  scheduleSliderReleaseFailsafe,
  setInteractionKind,
  setIsAdjusting,
  queueSliderUpdate,
}) {
  const renderSlider = (name) => (
    <FilmLabSliderTrack
      key={name}
      name={name}
      adjustments={adjustments}
      updateAdjustment={updateAdjustment}
      isInputProfile={isInputProfile}
      sliderDefs={sliderDefs}
      handleSliderStart={handleSliderStart}
      handleSliderEnd={handleSliderEnd}
      handleSliderChange={handleSliderChange}
      handleTemperatureSliderChange={handleTemperatureSliderChange}
      handleSliderDoubleClick={handleSliderDoubleClick}
      handleSliderTouchStart={handleSliderTouchStart}
    />
  );

  const renderCustomSlider = ({
    id,
    label,
    value,
    min,
    max,
    mode = 'signed',
    onChange,
    onReset,
    thumbColor = null,
    thumbSize = null,
    trackType = null,
  }) => (
    <div className="slider-group" key={id}>
      <div className="slider-label">
        <span className="slider-name">{label}</span>
        <span className="slider-val">{formatCustomSliderValue(value, mode)}</span>
      </div>
      <input
        className={`slider-input${trackType ? ` slider-input--${trackType}` : ''}`}
        id={id}
        name={id}
        type="range"
        min={min}
        max={max}
        value={value}
        style={
          thumbColor
            ? {
                '--slider-thumb-color': thumbColor,
                '--slider-thumb-size':
                  typeof thumbSize === 'number' ? `${thumbSize}px` : undefined,
              }
            : undefined
        }
        onMouseDown={(event) => handleSliderStart(`slider:${id}`, event)}
        onTouchStart={handleCustomSliderTouchStart(id, onReset, `slider:${id}`)}
        onDoubleClick={onReset}
        onInput={(event) => {
          const nextValue = Number(event.target.value);
          if (Number(value) === nextValue) {
            return;
          }
          const dragState = sliderDragActivationRef.current;
          const shouldEnterAdjusting = !dragState.active || dragState.activated;
          if (dragState.active || isAdjusting) {
            scheduleSliderReleaseFailsafe();
          }
          if (shouldEnterAdjusting) {
            setInteractionKind(`slider:${id}`);
            if (!isAdjusting) {
              markFilmLabE2ePointerDown();
              setIsAdjusting(true);
            }
          }
          queueSliderUpdate(`custom:${id}`, onChange, nextValue);
        }}
        onPointerUp={handleSliderEnd}
        onPointerCancel={handleSliderEnd}
        onTouchEnd={handleSliderEnd}
        onBlur={handleSliderEnd}
      />
    </div>
  );

  return { renderSlider, renderCustomSlider };
}
