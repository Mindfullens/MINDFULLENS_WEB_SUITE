import { CROP_MIN_SIZE } from './cropConstants.js';

function clampNumber(value, min, max) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function clampCropRectToBounds(rect, minSize = CROP_MIN_SIZE) {
  const safeMin = clampNumber(Number(minSize) || CROP_MIN_SIZE, 0.01, 0.95);
  let x = Number(rect?.x);
  let y = Number(rect?.y);
  let w = Number(rect?.w);
  let h = Number(rect?.h);

  if (!Number.isFinite(x)) x = 0;
  if (!Number.isFinite(y)) y = 0;
  if (!Number.isFinite(w)) w = 1;
  if (!Number.isFinite(h)) h = 1;

  w = clampNumber(w, safeMin, 1);
  h = clampNumber(h, safeMin, 1);
  x = clampNumber(x, 0, 1 - safeMin);
  y = clampNumber(y, 0, 1 - safeMin);

  if (x + w > 1) {
    w = 1 - x;
  }
  if (y + h > 1) {
    h = 1 - y;
  }

  w = clampNumber(w, safeMin, 1 - x);
  h = clampNumber(h, safeMin, 1 - y);

  return { x, y, w, h };
}

export function deriveCropRectNormLegacy(adjustments) {
  const level = Number(adjustments?.level ?? 0) || 0;
  const cropZoom = Number(adjustments?.cropZoom ?? 100) || 100;
  const cropX = Number(adjustments?.cropX ?? 0) || 0;
  const cropY = Number(adjustments?.cropY ?? 0) || 0;
  const levelCompensation = 1 + Math.min(0.16, Math.abs(level) / 180);
  const effectiveZoom = Math.max(cropZoom / 100, levelCompensation, 1);
  const cropSize = clampNumber(1 / effectiveZoom, 0.18, 1);
  const maxShift = Math.max(0, (1 - cropSize) / 2);
  const shiftX = clampNumber((cropX / 100) * maxShift * 1.6, -maxShift, maxShift);
  const shiftY = clampNumber((cropY / 100) * maxShift * 1.6, -maxShift, maxShift);
  const centerX = 0.5 - shiftX;
  const centerY = 0.5 - shiftY;
  const x = clampNumber(centerX - cropSize / 2, 0, 1 - cropSize);
  const y = clampNumber(centerY - cropSize / 2, 0, 1 - cropSize);

  return {
    x,
    y,
    w: cropSize,
    h: cropSize,
    zoom: effectiveZoom,
  };
}

export function buildCropRectNormFromAdjustments(adjustments) {
  const rect = {
    x: Number(adjustments?.cropRectX),
    y: Number(adjustments?.cropRectY),
    w: Number(adjustments?.cropRectW),
    h: Number(adjustments?.cropRectH),
  };
  const hasExplicitRect =
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.w) &&
    Number.isFinite(rect.h);
  const normalizedRect = hasExplicitRect
    ? clampCropRectToBounds(rect)
    : clampCropRectToBounds(deriveCropRectNormLegacy(adjustments));

  return {
    ...normalizedRect,
    zoom: 1 / Math.max(normalizedRect.w, normalizedRect.h),
  };
}

export function areCropRectsClose(leftRect, rightRect, epsilon = 0.0001) {
  if (!leftRect || !rightRect) {
    return false;
  }
  return (
    Math.abs((leftRect.x ?? 0) - (rightRect.x ?? 0)) <= epsilon &&
    Math.abs((leftRect.y ?? 0) - (rightRect.y ?? 0)) <= epsilon &&
    Math.abs((leftRect.w ?? 0) - (rightRect.w ?? 0)) <= epsilon &&
    Math.abs((leftRect.h ?? 0) - (rightRect.h ?? 0)) <= epsilon
  );
}

export function fitCropRectToAspect(rect, ratio, minSize = CROP_MIN_SIZE) {
  const safeRect = clampCropRectToBounds(rect, minSize);
  const normalizedRatio = Number(ratio);
  if (!Number.isFinite(normalizedRatio) || normalizedRatio <= 0) {
    return safeRect;
  }

  const centerX = safeRect.x + safeRect.w / 2;
  const centerY = safeRect.y + safeRect.h / 2;
  const currentRatio = safeRect.w / safeRect.h;
  let width = safeRect.w;
  let height = safeRect.h;

  if (currentRatio >= normalizedRatio) {
    width = height * normalizedRatio;
  } else {
    height = width / normalizedRatio;
  }

  const minWidthByAspect = Math.max(minSize, minSize * normalizedRatio);
  width = Math.max(width, minWidthByAspect);
  height = width / normalizedRatio;
  if (height < minSize) {
    height = minSize;
    width = height * normalizedRatio;
  }

  const maxWidthByHorizontal = 2 * Math.min(centerX, 1 - centerX);
  const maxWidthByVertical = 2 * Math.min(centerY, 1 - centerY) * normalizedRatio;
  const maxAllowedWidth = Math.max(0.001, Math.min(maxWidthByHorizontal, maxWidthByVertical));
  width = Math.min(width, maxAllowedWidth);
  height = width / normalizedRatio;

  return clampCropRectToBounds(
    {
      x: centerX - width / 2,
      y: centerY - height / 2,
      w: width,
      h: height,
    },
    minSize
  );
}

export function computeCropDragRect({
  snapshotRect,
  startPoint,
  currentPoint,
  handle,
  aspectRatio = null,
  minSize = CROP_MIN_SIZE,
}) {
  const safeSnapshot = clampCropRectToBounds(snapshotRect, minSize);
  const safeCurrent = {
    x: clampNumber(Number(currentPoint?.x) || 0, 0, 1),
    y: clampNumber(Number(currentPoint?.y) || 0, 0, 1),
  };
  const safeStart = {
    x: clampNumber(Number(startPoint?.x) || 0, 0, 1),
    y: clampNumber(Number(startPoint?.y) || 0, 0, 1),
  };
  const dx = safeCurrent.x - safeStart.x;
  const dy = safeCurrent.y - safeStart.y;
  const isMove = handle === 'move';
  const hasAspect = Number.isFinite(aspectRatio) && Number(aspectRatio) > 0;
  const safeAspect = hasAspect ? Number(aspectRatio) : null;

  if (isMove || !handle) {
    return {
      ...safeSnapshot,
      x: clampNumber(safeSnapshot.x + dx, 0, 1 - safeSnapshot.w),
      y: clampNumber(safeSnapshot.y + dy, 0, 1 - safeSnapshot.h),
    };
  }

  if (!safeAspect) {
    const leftMoved = handle.includes('w');
    const rightMoved = handle.includes('e');
    const topMoved = handle.includes('n');
    const bottomMoved = handle.includes('s');
    let left = safeSnapshot.x;
    let right = safeSnapshot.x + safeSnapshot.w;
    let top = safeSnapshot.y;
    let bottom = safeSnapshot.y + safeSnapshot.h;

    if (leftMoved) left += dx;
    if (rightMoved) right += dx;
    if (topMoved) top += dy;
    if (bottomMoved) bottom += dy;

    if (leftMoved) {
      left = Math.min(left, right - minSize);
      left = Math.max(0, left);
    }
    if (rightMoved) {
      right = Math.max(right, left + minSize);
      right = Math.min(1, right);
    }
    if (topMoved) {
      top = Math.min(top, bottom - minSize);
      top = Math.max(0, top);
    }
    if (bottomMoved) {
      bottom = Math.max(bottom, top + minSize);
      bottom = Math.min(1, bottom);
    }

    return clampCropRectToBounds(
      {
        x: left,
        y: top,
        w: right - left,
        h: bottom - top,
      },
      minSize
    );
  }

  const minWidthByAspect = Math.max(minSize, minSize * safeAspect);
  const isLeft = handle.includes('w');
  const isRight = handle.includes('e');
  const isTop = handle.includes('n');
  const isBottom = handle.includes('s');
  const isCorner = (isLeft || isRight) && (isTop || isBottom);

  if (isCorner) {
    const anchorX = isLeft ? safeSnapshot.x + safeSnapshot.w : safeSnapshot.x;
    const anchorY = isTop ? safeSnapshot.y + safeSnapshot.h : safeSnapshot.y;
    const rawWidth = Math.abs(safeCurrent.x - anchorX);
    const rawHeight = Math.abs(safeCurrent.y - anchorY);

    let nextWidth;
    if (!Number.isFinite(rawWidth) || !Number.isFinite(rawHeight)) {
      return safeSnapshot;
    }
    if (rawWidth <= 0 && rawHeight <= 0) {
      return safeSnapshot;
    }
    const widthTallEnough =
      rawHeight > 0 ? rawWidth / rawHeight >= safeAspect : rawWidth > 0;
    if (widthTallEnough) {
      nextWidth = Math.max(minWidthByAspect, rawWidth);
    } else {
      nextWidth = Math.max(minWidthByAspect, rawHeight * safeAspect);
    }

    const maxWidthByHorizontal = isLeft ? anchorX : 1 - anchorX;
    const maxWidthByVertical = (isTop ? anchorY : 1 - anchorY) * safeAspect;
    const maxAllowedWidth = Math.max(0.001, Math.min(maxWidthByHorizontal, maxWidthByVertical));
    nextWidth = Math.min(nextWidth, maxAllowedWidth);
    const nextHeight = nextWidth / safeAspect;
    return clampCropRectToBounds(
      {
        x: isLeft ? anchorX - nextWidth : anchorX,
        y: isTop ? anchorY - nextHeight : anchorY,
        w: nextWidth,
        h: nextHeight,
      },
      minSize
    );
  }

  if (isLeft || isRight) {
    const anchorX = isLeft ? safeSnapshot.x + safeSnapshot.w : safeSnapshot.x;
    const centerY = safeSnapshot.y + safeSnapshot.h / 2;
    const rawWidth = isLeft ? anchorX - safeCurrent.x : safeCurrent.x - anchorX;
    let nextWidth = Math.max(minWidthByAspect, rawWidth);
    const maxWidthByHorizontal = isLeft ? anchorX : 1 - anchorX;
    const maxWidthByVertical = 2 * Math.min(centerY, 1 - centerY) * safeAspect;
    const maxAllowedWidth = Math.max(0.001, Math.min(maxWidthByHorizontal, maxWidthByVertical));
    nextWidth = Math.min(nextWidth, maxAllowedWidth);
    const nextHeight = nextWidth / safeAspect;
    return clampCropRectToBounds(
      {
        x: isLeft ? anchorX - nextWidth : anchorX,
        y: centerY - nextHeight / 2,
        w: nextWidth,
        h: nextHeight,
      },
      minSize
    );
  }

  if (isTop || isBottom) {
    const anchorY = isTop ? safeSnapshot.y + safeSnapshot.h : safeSnapshot.y;
    const centerX = safeSnapshot.x + safeSnapshot.w / 2;
    const rawHeight = isTop ? anchorY - safeCurrent.y : safeCurrent.y - anchorY;
    let nextHeight = Math.max(minSize, rawHeight);
    const maxHeightByVertical = isTop ? anchorY : 1 - anchorY;
    const maxHeightByHorizontal = (2 * Math.min(centerX, 1 - centerX)) / safeAspect;
    const maxAllowedHeight = Math.max(0.001, Math.min(maxHeightByVertical, maxHeightByHorizontal));
    nextHeight = Math.min(nextHeight, maxAllowedHeight);
    const nextWidth = nextHeight * safeAspect;
    return clampCropRectToBounds(
      {
        x: centerX - nextWidth / 2,
        y: isTop ? anchorY - nextHeight : anchorY,
        w: nextWidth,
        h: nextHeight,
      },
      minSize
    );
  }

  return safeSnapshot;
}
