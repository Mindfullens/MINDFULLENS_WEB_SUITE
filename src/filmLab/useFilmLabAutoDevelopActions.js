import { useCallback } from 'react';
import { clamp } from './crop/cropStraighten.js';

export function useFilmLabAutoDevelopActions({
  canvasRef,
  hasImage,
  adjustments,
  pipelineInfo,
  renderDebugInfo,
  saveUndo,
  setAdjustments,
}) {
  const estimateMeanLumaFromCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas.width || !canvas.height) {
      return Number.NaN;
    }

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return Number.NaN;
    }

    try {
      const width = Math.max(1, Math.floor(canvas.width));
      const height = Math.max(1, Math.floor(canvas.height));
      const imageData = context.getImageData(0, 0, width, height);
      const data = imageData?.data;

      if (!data || !data.length) {
        return Number.NaN;
      }

      // Keep this lightweight for large frames.
      const step = Math.max(1, Math.floor(Math.max(width, height) / 512));
      let lumaSum = 0;
      let sampled = 0;

      for (let y = 0; y < height; y += step) {
        const rowOffset = y * width * 4;
        for (let x = 0; x < width; x += step) {
          const index = rowOffset + x * 4;
          const alpha = data[index + 3] / 255;
          if (alpha <= 0) {
            continue;
          }

          const red = data[index];
          const green = data[index + 1];
          const blue = data[index + 2];
          const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
          lumaSum += luma;
          sampled += 1;
        }
      }

      return sampled > 0 ? lumaSum / sampled : Number.NaN;
    } catch {
      return Number.NaN;
    }
  }, []);

  const applyAutoExposure = useCallback(() => {
    if (!hasImage) {
      return;
    }

    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { willReadFrequently: true }) ?? null;
    const hasCanvas = Boolean(canvas && context && canvas.width && canvas.height);

    const srgbToLinear = (value) => {
      const normalized = clamp(value / 255, 0, 1);
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    };

    let nextExposure = null;
    let nextContrast = 0;
    let nextHighlights = 0;
    let nextShadows = 0;
    let nextWhites = 0;
    let nextBlacks = 0;

    if (hasCanvas) {
      let imageData;
      try {
        imageData = context.getImageData(0, 0, Math.floor(canvas.width), Math.floor(canvas.height));
      } catch {
        imageData = null;
      }

      const data = imageData?.data;
      if (data?.length) {
        const width = Math.max(1, Math.floor(canvas.width));
        const height = Math.max(1, Math.floor(canvas.height));
        const step = Math.max(1, Math.floor(Math.max(width, height) / 768));
        const histogramBins = 256;
        const histogram = new Uint32Array(histogramBins);
        const epsilon = 1e-6;

        let samples = 0;
        let lumaSum = 0;
        let highlightClip = 0;
        let shadowClip = 0;

        for (let y = 0; y < height; y += step) {
          const rowOffset = y * width * 4;
          for (let x = 0; x < width; x += step) {
            const index = rowOffset + x * 4;
            const alpha = data[index + 3];
            if (alpha <= 0) {
              continue;
            }

            const red = srgbToLinear(data[index]);
            const green = srgbToLinear(data[index + 1]);
            const blue = srgbToLinear(data[index + 2]);
            const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
            const bin = clamp(Math.floor(luma * (histogramBins - 1)), 0, histogramBins - 1);

            histogram[bin] += 1;
            lumaSum += luma;
            samples += 1;

            if (luma >= 0.985) {
              highlightClip += 1;
            }
            if (luma <= 0.015) {
              shadowClip += 1;
            }
          }
        }

        if (samples >= 96) {
          const percentile = (value) => {
            const target = samples * clamp(value, 0, 1);
            let cumulative = 0;
            for (let i = 0; i < histogramBins; i += 1) {
              cumulative += histogram[i];
              if (cumulative >= target) {
                return i / (histogramBins - 1);
              }
            }
            return 1;
          };

          const p01 = percentile(0.01);
          const p05 = percentile(0.05);
          const p25 = percentile(0.25);
          const p50 = percentile(0.5);
          const p75 = percentile(0.75);
          const p95 = percentile(0.95);
          const p99 = percentile(0.99);
          const mean = lumaSum / samples;
          const dynamicRange = Math.max(0.04, p95 - p05);

          const clipRisk = clamp(
            (highlightClip / samples + shadowClip / samples) / 0.11,
            0,
            1
          );
          const highlightRisk = clamp(
            highlightClip / (samples * 0.06) + Math.max(0, p99 - 0.94) / 0.08,
            0,
            1
          );
          const shadowRisk = clamp(
            shadowClip / (samples * 0.06) + Math.max(0, 0.06 - p01) / 0.06,
            0,
            1
          );
          const flatness = clamp((0.28 - dynamicRange) / 0.22, 0, 1);

          // Midtone anchor: robust median + slight mean influence.
          const targetMid = clamp(0.19 + flatness * 0.03 - clipRisk * 0.02, 0.16, 0.24);
          const targetMean = clamp(0.22 + flatness * 0.03 - clipRisk * 0.025, 0.17, 0.27);
          const midStops = Math.log2(targetMid / Math.max(p50, epsilon));
          const meanStops = Math.log2(targetMean / Math.max(mean, epsilon));
          const preferredStops = midStops * 0.78 + meanStops * 0.22;

          // Preserve highlight and shadow headroom.
          const maxHighlightTarget = clamp(0.91 - highlightRisk * 0.08, 0.82, 0.93);
          const minShadowTarget = clamp(0.004 + shadowRisk * 0.002, 0.003, 0.012);
          const maxPositiveStops = Math.log2(maxHighlightTarget / Math.max(p99, epsilon));
          const maxNegativeStops = Math.log2(minShadowTarget / Math.max(p01, epsilon));

          const solvedStops = clamp(
            clamp(preferredStops, maxNegativeStops, maxPositiveStops),
            -2.5,
            2.5
          );
          nextExposure = clamp(Math.round(solvedStops * 40), -100, 100);

          const projectedP01 = p01 * (2 ** solvedStops);
          const projectedP99 = p99 * (2 ** solvedStops);
          const projectedRange = Math.max(0.04, p95 * (2 ** solvedStops) - p05 * (2 ** solvedStops));

          nextHighlights = clamp(
            Math.round(-(highlightRisk * 36 + Math.max(0, projectedP99 - 0.9) * 140)),
            -48,
            12
          );
          nextShadows = clamp(
            Math.round(shadowRisk * 34 + Math.max(0, 0.055 - projectedP01) * 180),
            -12,
            48
          );
          nextWhites = clamp(
            Math.round(flatness * 14 - highlightRisk * 22 - Math.max(0, projectedP99 - 0.92) * 120),
            -28,
            20
          );
          nextBlacks = clamp(
            Math.round(shadowRisk * 14 + flatness * 6 - Math.max(0, projectedRange - 0.62) * 18),
            -16,
            22
          );
          nextContrast = clamp(
            Math.round((0.34 - dynamicRange) * 56 - clipRisk * 10 + (p75 - p25 - 0.2) * 22),
            -18,
            20
          );
        }
      }
    }

    if (!Number.isFinite(nextExposure)) {
      const sourceStatsMeanLuma = Number(renderDebugInfo?.sourceStats?.meanLuma ?? Number.NaN);
      const decodeStatsMeanLuma = Number(
        pipelineInfo?.capabilities?.decodeStats?.meanLuma ?? Number.NaN
      );
      const canvasMeanLuma = Number(estimateMeanLumaFromCanvas());
      const sourceMeanLuma = [sourceStatsMeanLuma, decodeStatsMeanLuma, canvasMeanLuma].find(
        (value) => Number.isFinite(value) && value > 0
      );

      if (!Number.isFinite(sourceMeanLuma) || sourceMeanLuma <= 0) {
        return;
      }

      const targetLuma = 118;
      const exposureStops = clamp(Math.log2(targetLuma / sourceMeanLuma), -2.5, 2.5);
      nextExposure = clamp(Math.round(exposureStops * 40), -100, 100);
      nextContrast = 0;
      nextHighlights = 0;
      nextShadows = 0;
      nextWhites = 0;
      nextBlacks = 0;
    }

    if (
      Math.abs((adjustments?.exposure ?? 0) - nextExposure) < 1 &&
      Math.abs((adjustments?.contrast ?? 0) - nextContrast) < 1 &&
      Math.abs((adjustments?.highlights ?? 0) - nextHighlights) < 1 &&
      Math.abs((adjustments?.shadows ?? 0) - nextShadows) < 1 &&
      Math.abs((adjustments?.whites ?? 0) - nextWhites) < 1 &&
      Math.abs((adjustments?.blacks ?? 0) - nextBlacks) < 1
    ) {
      return;
    }

    saveUndo();
    setAdjustments((current) => ({
      ...current,
      exposure: nextExposure,
      contrast: nextContrast,
      highlights: nextHighlights,
      shadows: nextShadows,
      whites: nextWhites,
      blacks: nextBlacks,
    }));
  }, [
    adjustments?.exposure,
    adjustments?.contrast,
    adjustments?.highlights,
    adjustments?.shadows,
    adjustments?.whites,
    adjustments?.blacks,
    estimateMeanLumaFromCanvas,
    hasImage,
    pipelineInfo?.capabilities?.decodeStats?.meanLuma,
    renderDebugInfo?.sourceStats?.meanLuma,
    saveUndo,
    setAdjustments,
  ]);

  const applyAutoColor = useCallback(() => {
    if (!hasImage) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas || !canvas.width || !canvas.height) {
      return;
    }

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return;
    }

    let imageData;
    try {
      imageData = context.getImageData(0, 0, Math.floor(canvas.width), Math.floor(canvas.height));
    } catch {
      return;
    }

    const data = imageData?.data;
    if (!data || !data.length) {
      return;
    }

    const width = Math.max(1, Math.floor(canvas.width));
    const height = Math.max(1, Math.floor(canvas.height));
    const step = Math.max(1, Math.floor(Math.max(width, height) / 768));
    const srgbToLinear = (value) => {
      const v = clamp(value / 255, 0, 1);
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const isLikelySkinPixel = (red, green, blue) => {
      if (!(red > 50 && green > 35 && blue > 20 && red > green && green >= blue)) {
        return false;
      }
      const cb = 128 - 0.168736 * red - 0.331264 * green + 0.5 * blue;
      const cr = 128 + 0.5 * red - 0.418688 * green - 0.081312 * blue;
      return cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173;
    };
    const histogramBins = 256;
    const lumaHistogram = new Uint32Array(histogramBins);
    const epsilon = 1e-6;
    const shadesOfGrayPower = 6;

    let sampleCount = 0;
    let highlightClipCount = 0;
    let shadowClipCount = 0;
    let totalSaturation = 0;
    let powerSumR = 0;
    let powerSumG = 0;
    let powerSumB = 0;

    for (let y = 0; y < height; y += step) {
      const rowOffset = y * width * 4;
      for (let x = 0; x < width; x += step) {
        const idx = rowOffset + x * 4;
        const alpha = data[idx + 3];
        if (alpha <= 0) {
          continue;
        }
        const r = srgbToLinear(data[idx]);
        const g = srgbToLinear(data[idx + 1]);
        const b = srgbToLinear(data[idx + 2]);
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const maxChannel = Math.max(r, g, b);
        const minChannel = Math.min(r, g, b);
        const saturation = maxChannel <= epsilon ? 0 : (maxChannel - minChannel) / (maxChannel + epsilon);
        const lumaBin = clamp(Math.floor(luma * (histogramBins - 1)), 0, histogramBins - 1);

        lumaHistogram[lumaBin] += 1;
        sampleCount += 1;
        totalSaturation += saturation;
        powerSumR += r ** shadesOfGrayPower;
        powerSumG += g ** shadesOfGrayPower;
        powerSumB += b ** shadesOfGrayPower;

        if (luma >= 0.985) {
          highlightClipCount += 1;
        }
        if (luma <= 0.015) {
          shadowClipCount += 1;
        }
      }
    }

    if (sampleCount < 96) {
      return;
    }

    const percentileFromHistogram = (percentile) => {
      const target = sampleCount * clamp(percentile, 0, 1);
      let cumulative = 0;
      for (let i = 0; i < histogramBins; i += 1) {
        cumulative += lumaHistogram[i];
        if (cumulative >= target) {
          return i / (histogramBins - 1);
        }
      }
      return 1;
    };

    const lowLuma = percentileFromHistogram(0.05);
    const midLuma = percentileFromHistogram(0.5);
    const highLuma = Math.max(lowLuma + 0.02, percentileFromHistogram(0.95));
    const dynamicRange = Math.max(0.04, highLuma - lowLuma);
    const clipRisk = clamp(
      (highlightClipCount / sampleCount + shadowClipCount / sampleCount) / 0.12,
      0,
      1
    );
    const adaptiveSatLimit = clamp(0.58 - dynamicRange * 0.35, 0.25, 0.58);

    let weightedR = 0;
    let weightedG = 0;
    let weightedB = 0;
    let totalWeight = 0;
    let selectedNeutralSamples = 0;

    for (let y = 0; y < height; y += step) {
      const rowOffset = y * width * 4;
      for (let x = 0; x < width; x += step) {
        const idx = rowOffset + x * 4;
        const alpha = data[idx + 3];
        if (alpha <= 0) {
          continue;
        }

        const rLin = srgbToLinear(data[idx]);
        const gLin = srgbToLinear(data[idx + 1]);
        const bLin = srgbToLinear(data[idx + 2]);
        const luma = 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;

        if (luma < lowLuma || luma > highLuma) {
          continue;
        }

        const maxChannel = Math.max(rLin, gLin, bLin);
        const minChannel = Math.min(rLin, gLin, bLin);
        const saturation = maxChannel <= epsilon ? 0 : (maxChannel - minChannel) / (maxChannel + epsilon);
        if (saturation > 0.92) {
          continue;
        }

        const neutrality = 1 - clamp(saturation / adaptiveSatLimit, 0, 1);
        if (neutrality <= 0) {
          continue;
        }

        const midtoneDistance = Math.abs(luma - midLuma) / (dynamicRange * 0.5 + epsilon);
        const midtoneWeight = clamp(1 - midtoneDistance, 0, 1);
        const clipDistanceWeight =
          clamp((luma - lowLuma) / (dynamicRange * 0.22 + epsilon), 0, 1) *
          clamp((highLuma - luma) / (dynamicRange * 0.22 + epsilon), 0, 1);
        const skinPenalty = isLikelySkinPixel(data[idx], data[idx + 1], data[idx + 2]) ? 0.45 : 1;
        const weight =
          (neutrality ** 1.8) *
          (0.2 + 0.8 * midtoneWeight) *
          (0.35 + 0.65 * clipDistanceWeight) *
          skinPenalty;

        if (weight <= 0) {
          continue;
        }

        weightedR += rLin * weight;
        weightedG += gLin * weight;
        weightedB += bLin * weight;
        totalWeight += weight;
        selectedNeutralSamples += 1;
      }
    }

    const shadesR = (powerSumR / sampleCount) ** (1 / shadesOfGrayPower);
    const shadesG = (powerSumG / sampleCount) ** (1 / shadesOfGrayPower);
    const shadesB = (powerSumB / sampleCount) ** (1 / shadesOfGrayPower);

    let baseR = shadesR;
    let baseG = shadesG;
    let baseB = shadesB;
    let neutralConfidence = 0;

    if (totalWeight > epsilon) {
      const neutralR = weightedR / totalWeight;
      const neutralG = weightedG / totalWeight;
      const neutralB = weightedB / totalWeight;
      const coverageConfidence = clamp(selectedNeutralSamples / (sampleCount * 0.2), 0, 1);
      const weightConfidence = clamp(totalWeight / (sampleCount * 0.16), 0, 1);
      neutralConfidence = clamp(coverageConfidence * 0.6 + weightConfidence * 0.4, 0, 1);
      baseR = shadesR + (neutralR - shadesR) * neutralConfidence;
      baseG = shadesG + (neutralG - shadesG) * neutralConfidence;
      baseB = shadesB + (neutralB - shadesB) * neutralConfidence;
    }

    const meanSaturation = totalSaturation / sampleCount;
    const rbBalance = (baseB - baseR) / (baseB + baseR + epsilon);
    const gmBalance =
      (baseG - (baseR + baseB) * 0.5) / (baseG + (baseR + baseB) * 0.5 + epsilon);
    const castStrength = clamp(Math.hypot(rbBalance, gmBalance) * 1.6, 0, 1);
    const correctionStrength = clamp(
      (0.5 + castStrength * 0.9) * (0.45 + neutralConfidence * 0.75 - clipRisk * 0.25),
      0.25,
      1
    );

    let targetTemp = clamp(Math.round(rbBalance * 118 * correctionStrength), -36, 36);
    let targetTint = clamp(Math.round(gmBalance * 102 * correctionStrength), -34, 34);
    let targetVibrance = clamp(
      Math.round(
        (0.24 - meanSaturation) * 72 +
          castStrength * 8 -
          clipRisk * 14 +
          (0.2 - dynamicRange) * 18
      ),
      -16,
      24
    );
    let targetSaturation = clamp(
      Math.round(
        (0.18 - meanSaturation) * 32 -
          clipRisk * 8 -
          Math.max(0, dynamicRange - 0.55) * 10
      ),
      -10,
      10
    );

    if (Math.abs(targetTemp) < 1) {
      targetTemp = 0;
    }
    if (Math.abs(targetTint) < 1) {
      targetTint = 0;
    }
    if (Math.abs(targetVibrance) < 2) {
      targetVibrance = 0;
    }
    if (Math.abs(targetSaturation) < 2) {
      targetSaturation = 0;
    }

    if (
      Math.abs((adjustments?.temp ?? 0) - targetTemp) < 1 &&
      Math.abs((adjustments?.tint ?? 0) - targetTint) < 1 &&
      Math.abs((adjustments?.vibrance ?? 0) - targetVibrance) < 1 &&
      Math.abs((adjustments?.saturation ?? 0) - targetSaturation) < 1
    ) {
      return;
    }

    saveUndo();
    setAdjustments((current) => ({
      ...current,
      temp: targetTemp,
      tint: targetTint,
      vibrance: targetVibrance,
      saturation: targetSaturation,
    }));
  }, [
    adjustments?.temp,
    adjustments?.tint,
    adjustments?.vibrance,
    adjustments?.saturation,
    hasImage,
    saveUndo,
    setAdjustments,
  ]);

  return {
    applyAutoExposure,
    applyAutoColor,
  };
}
