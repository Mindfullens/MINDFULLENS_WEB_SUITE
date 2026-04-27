function clamp(value, min = 0, max = 255) {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

const CURVE_LUT_CACHE_LIMIT = 320;
const curveLutCache = new Map();

function createCurveSignature(points) {
  if (!points?.length) {
    return 'identity';
  }

  let signature = '';

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    signature += `${point[0]}:${point[1]}|`;
  }

  return signature;
}

function getCachedLut(cacheKey) {
  const cached = curveLutCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  // Small LRU refresh to keep hot curves (drag updates + active channel) in memory.
  curveLutCache.delete(cacheKey);
  curveLutCache.set(cacheKey, cached);

  return cached;
}

function setCachedLut(cacheKey, lut) {
  curveLutCache.set(cacheKey, lut);

  if (curveLutCache.size <= CURVE_LUT_CACHE_LIMIT) {
    return;
  }

  const oldestKey = curveLutCache.keys().next().value;

  if (oldestKey) {
    curveLutCache.delete(oldestKey);
  }
}

function identityLut(resolution, round) {
  const safeResolution = Math.max(2, Math.floor(resolution) || 256);
  const lut = round ? new Uint8Array(safeResolution) : new Float32Array(safeResolution);

  for (let index = 0; index < safeResolution; index += 1) {
    const value = (index / (safeResolution - 1)) * 255;
    lut[index] = round ? clamp(Math.round(value)) : value;
  }

  return lut;
}

function normalizeCurvePoints(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return null;
  }

  const sorted = [...points]
    .map((point) => [clamp(Number(point?.[0]) || 0), clamp(Number(point?.[1]) || 0)])
    .sort((left, right) => left[0] - right[0]);

  const deduped = [];
  for (let index = 0; index < sorted.length; index += 1) {
    const [x, y] = sorted[index];
    const last = deduped[deduped.length - 1];

    if (last && last[0] === x) {
      last[1] = y;
    } else {
      deduped.push([x, y]);
    }
  }

  if (deduped.length < 2) {
    return null;
  }

  return deduped;
}

function computeMonotoneTangents(xs, ys) {
  const count = xs.length;
  const h = new Array(count - 1);
  const delta = new Array(count - 1);

  for (let index = 0; index < count - 1; index += 1) {
    h[index] = Math.max(1e-6, xs[index + 1] - xs[index]);
    delta[index] = (ys[index + 1] - ys[index]) / h[index];
  }

  const tangents = new Array(count).fill(0);

  if (count === 2) {
    tangents[0] = delta[0];
    tangents[1] = delta[0];
    return tangents;
  }

  // End-point mode for freed curve edges:
  // derive edge tangents from the nearest active segment only
  // instead of relying on any fixed corner anchors.
  tangents[0] = delta[0];

  for (let index = 1; index < count - 1; index += 1) {
    if (
      delta[index - 1] === 0 ||
      delta[index] === 0 ||
      delta[index - 1] * delta[index] <= 0
    ) {
      tangents[index] = 0;
      continue;
    }

    const w1 = 2 * h[index] + h[index - 1];
    const w2 = h[index] + 2 * h[index - 1];
    tangents[index] = (w1 + w2) / (w1 / delta[index - 1] + w2 / delta[index]);
  }

  tangents[count - 1] = delta[count - 2];

  for (let index = 0; index < count - 1; index += 1) {
    if (delta[index] === 0) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      continue;
    }

    const a = tangents[index] / delta[index];
    const b = tangents[index + 1] / delta[index];

    if (a < 0 || b < 0) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      continue;
    }

    const magnitude = a * a + b * b;
    if (magnitude > 9) {
      const scale = 3 / Math.sqrt(magnitude);
      tangents[index] = scale * a * delta[index];
      tangents[index + 1] = scale * b * delta[index];
    }
  }

  return tangents;
}

function evalMonotoneHermite(x0, x1, y0, y1, m0, m1, x) {
  const h = Math.max(1e-6, x1 - x0);
  const t = (x - x0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  return h00 * y0 + h10 * h * m0 + h01 * y1 + h11 * h * m1;
}

export function sampleCurveLut(lut, value) {
  if (!lut || lut.length < 2) {
    return clamp(value);
  }

  const clampedValue = clamp(value);
  const position = (clampedValue / 255) * (lut.length - 1);
  const floorIndex = Math.floor(position);
  const ceilIndex = Math.min(lut.length - 1, floorIndex + 1);
  const blend = position - floorIndex;

  return lut[floorIndex] * (1 - blend) + lut[ceilIndex] * blend;
}

export function buildCurveLut(
  points,
  {
    resolution = 256,
    interpolation = 'monotonic',
    round = true,
  } = {}
) {
  const safeResolution = Math.max(2, Math.floor(resolution) || 256);
  const mode = interpolation === 'linear' ? 'linear' : 'monotonic';
  const normalizedPoints = normalizeCurvePoints(points);
  const cacheKey = `${safeResolution}|${round ? 1 : 0}|${mode}|${createCurveSignature(
    normalizedPoints
  )}`;
  const cachedLut = getCachedLut(cacheKey);

  if (cachedLut) {
    return cachedLut;
  }

  if (!normalizedPoints) {
    const identity = identityLut(safeResolution, round);
    setCachedLut(cacheKey, identity);
    return identity;
  }

  const lut = round ? new Uint8Array(safeResolution) : new Float32Array(safeResolution);
  const xs = normalizedPoints.map((point) => point[0]);
  const ys = normalizedPoints.map((point) => point[1]);
  const useLinear = mode === 'linear' || xs.length === 2;
  const tangents = useLinear ? null : computeMonotoneTangents(xs, ys);
  let segmentIndex = 0;

  for (let index = 0; index < safeResolution; index += 1) {
    const inputValue = (index / (safeResolution - 1)) * 255;
    let value;

    if (inputValue <= xs[0]) {
      value = ys[0];
    } else if (inputValue >= xs[xs.length - 1]) {
      value = ys[ys.length - 1];
    } else {
      while (segmentIndex < xs.length - 2 && inputValue > xs[segmentIndex + 1]) {
        segmentIndex += 1;
      }

      const x0 = xs[segmentIndex];
      const x1 = xs[segmentIndex + 1];
      const y0 = ys[segmentIndex];
      const y1 = ys[segmentIndex + 1];

      if (useLinear) {
        const t = (inputValue - x0) / Math.max(1e-6, x1 - x0);
        value = y0 + (y1 - y0) * t;
      } else {
        value = evalMonotoneHermite(
          x0,
          x1,
          y0,
          y1,
          tangents[segmentIndex],
          tangents[segmentIndex + 1],
          inputValue
        );
      }
    }

    if (round) {
      lut[index] = clamp(Math.round(value));
    } else {
      lut[index] = clamp(value);
    }
  }

  setCachedLut(cacheKey, lut);

  return lut;
}

export function buildCurvePreviewLut(points, interpolation = 'smooth') {
  const interpolationMode = interpolation === 'linear' ? 'linear' : 'monotonic';
  return buildCurveLut(points, {
    resolution: 1024,
    interpolation: interpolationMode,
    round: false,
  });
}
