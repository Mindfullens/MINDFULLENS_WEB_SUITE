import { mapTemperatureToKelvin } from './sliderResponseMap.js';

export const PERCENT_SLIDERS = new Set([
  'strength',
  'fade',
  'userGrain',
  'userGrainSize',
  'userVignette',
  'halation',
  'anamorph',
  'cropZoom',
  'curveLumaMix',
  'emulsionReciprocityComp',
  'emulsionEdgeAcutance',
]);

export function formatSliderValue(name, value) {
  if (name === 'temp' || name === 'brushMaskTemp') {
    return `${Math.round(mapTemperatureToKelvin(value))}K`;
  }

  if (PERCENT_SLIDERS.has(name)) {
    return `${value}%`;
  }

  if (value === 0) {
    return '0';
  }

  return value > 0 ? `+${value}` : `${value}`;
}

export function formatCustomSliderValue(value, mode = 'signed') {
  if (mode === 'percent') {
    return `${value}%`;
  }

  if (mode === 'degrees') {
    return `${value}°`;
  }

  if (value === 0) {
    return '0';
  }

  return value > 0 ? `+${value}` : `${value}`;
}
