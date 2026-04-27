import { mapTemperatureToKelvin } from './engine/sliderResponseMap.js';
import { formatCustomSliderValue, formatSliderValue } from './engine/filmLabSliderFormat.js';
import { markFilmLabE2ePointerDown } from './filmLab/previewE2ePointerMark.js';

export function createFilmLabSliderRenderers({
  adjustments,
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
  const renderSlider = (name) => {
    const isDisabled = name === 'strength' && isInputProfile;
    const displayValue = isDisabled ? '—' : formatSliderValue(name, adjustments[name]);
    const isTemperatureSlider = name === 'temp';
    const sliderMin = isTemperatureSlider ? 2000 : sliderDefs[name].min;
    const sliderMax = isTemperatureSlider ? 10000 : sliderDefs[name].max;
    const sliderValue = isTemperatureSlider
      ? Math.round(mapTemperatureToKelvin(adjustments[name]))
      : adjustments[name];

    return (
      <div className={`slider-group${isDisabled ? ' is-disabled' : ''}`} key={name}>
        <div className="slider-label">
          <span className="slider-name">{sliderDefs[name].label}</span>
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
        {isDisabled ? <div className="slider-help">Profil wejściowy nie używa siły profilu.</div> : null}
      </div>
    );
  };

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
