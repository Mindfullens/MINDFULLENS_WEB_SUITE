function clamp(value, min, max) {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

function toNormalizedTempTint(temp, tint) {
  const normalizedTemp = clamp(Number(temp) || 0, -100, 100) / 100;
  const normalizedTint = clamp(Number(tint) || 0, -100, 100) / 100;
  return {
    temp: normalizedTemp,
    tint: normalizedTint,
  };
}

export function resolveWhiteBalanceGains(temp = 0, tint = 0) {
  const normalized = toNormalizedTempTint(temp, tint);
  const baseRed = Math.max(0.72, 1 + normalized.temp * 0.22 + normalized.tint * 0.08);
  const baseBlue = Math.max(0.72, 1 - normalized.temp * 0.22 - normalized.tint * 0.05);
  const baseGreen = Math.max(0.72, 1 + normalized.tint * 0.12 - Math.abs(normalized.temp) * 0.04);

  // Keep perceived brightness stable while shifting channel balance.
  const luma = baseRed * 0.299 + baseGreen * 0.587 + baseBlue * 0.114;
  const luminanceScale = luma > 1e-5 ? 1 / luma : 1;

  return {
    r: baseRed * luminanceScale,
    g: baseGreen * luminanceScale,
    b: baseBlue * luminanceScale,
  };
}

