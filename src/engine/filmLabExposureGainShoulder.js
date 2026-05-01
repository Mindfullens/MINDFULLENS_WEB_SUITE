/**
 * Ekspozycja z ramieniem/kolanem — współdzielone przez podgląd CPU i warstwy recipe.
 */

import { clampUnit, mix } from './colorMathShared.js';

export function applyExposureGainWithShoulder(red, green, blue, gain) {
  if (gain === 1) {
    return [red, green, blue];
  }

  let nextRed = red * gain;
  let nextGreen = green * gain;
  let nextBlue = blue * gain;

  if (gain <= 1.0001) {
    return [nextRed, nextGreen, nextBlue];
  }

  const gainHeadroom = clampUnit((gain - 1) / 1.85);
  const luminance = (0.299 * nextRed + 0.587 * nextGreen + 0.114 * nextBlue) / 255;
  const shoulderStart = mix(0.62, 0.46, gainHeadroom);

  if (luminance > shoulderStart) {
    const shoulderRange = Math.max(1e-6, 1 - shoulderStart);
    const distanceIntoShoulder = Math.max(0, luminance - shoulderStart);
    const shoulderCompression = 3.2 + gainHeadroom * 4.4;
    const softLuminance =
      shoulderStart +
      distanceIntoShoulder /
        (1 + (distanceIntoShoulder * shoulderCompression) / shoulderRange);
    const shoulderBlend = clampUnit((gain - 1) * (1.22 + gainHeadroom * 0.68));
    const targetLuminance = mix(luminance, softLuminance, shoulderBlend);
    const luminanceScale = luminance > 1e-6 ? targetLuminance / luminance : 1;

    nextRed *= luminanceScale;
    nextGreen *= luminanceScale;
    nextBlue *= luminanceScale;
  }

  const peak = Math.max(nextRed, nextGreen, nextBlue) / 255;
  const kneeStart = mix(0.9, 0.78, gainHeadroom);

  if (peak > kneeStart) {
    const kneeRange = Math.max(1e-6, 1 - kneeStart);
    const peakDistance = peak - kneeStart;
    const kneeCompression = 4.4 + gainHeadroom * 5.6;
    const compressedPeak =
      kneeStart + peakDistance / (1 + (peakDistance * kneeCompression) / kneeRange);
    const peakScale = peak > 1e-6 ? compressedPeak / peak : 1;

    nextRed *= peakScale;
    nextGreen *= peakScale;
    nextBlue *= peakScale;
  }

  return [nextRed, nextGreen, nextBlue];
}
