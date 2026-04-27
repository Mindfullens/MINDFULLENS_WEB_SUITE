function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function resolveFittedSizeForAspect(viewportWidth, viewportHeight, aspectRatio, fitMode = 'contain') {
  if (viewportWidth <= 0 || viewportHeight <= 0 || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return { width: Math.max(0, viewportWidth), height: Math.max(0, viewportHeight) };
  }

  const viewportRatio = viewportWidth / viewportHeight;
  const useCover = fitMode === 'cover';

  if (aspectRatio >= viewportRatio) {
    if (useCover) {
      return {
        width: viewportHeight * aspectRatio,
        height: viewportHeight,
      };
    }
    return {
      width: viewportWidth,
      height: viewportWidth / aspectRatio,
    };
  }

  if (useCover) {
    return {
      width: viewportWidth,
      height: viewportWidth / aspectRatio,
    };
  }

  return {
    width: viewportHeight * aspectRatio,
    height: viewportHeight,
  };
}

export function clampPanToBoundsForSize(
  candidatePan,
  viewportWidth,
  viewportHeight,
  baseWidth,
  baseHeight,
  zoom,
  pivotCenter = null
) {
  if (
    !Number.isFinite(zoom) ||
    zoom <= 0 ||
    viewportWidth <= 0 ||
    viewportHeight <= 0 ||
    baseWidth <= 0 ||
    baseHeight <= 0
  ) {
    return { x: 0, y: 0 };
  }

  const scaledWidth = baseWidth * zoom;
  const scaledHeight = baseHeight * zoom;
  const pivotX = clamp(
    Number.isFinite(Number(pivotCenter?.x)) ? Number(pivotCenter.x) : viewportWidth / 2,
    0,
    viewportWidth
  );
  const pivotY = clamp(
    Number.isFinite(Number(pivotCenter?.y)) ? Number(pivotCenter.y) : viewportHeight / 2,
    0,
    viewportHeight
  );
  const halfScaledWidth = scaledWidth / 2;
  const halfScaledHeight = scaledHeight / 2;
  // Single, continuous clamp window for both states:
  // - when image is smaller than viewport, pan is limited to the visible margins
  // - when image is larger than viewport, pan is limited to real image edges
  // This prevents "rebound" or sticky zones when crossing fit threshold.
  const leftEdgePanX = halfScaledWidth - pivotX;
  const rightEdgePanX = viewportWidth - pivotX - halfScaledWidth;
  const topEdgePanY = halfScaledHeight - pivotY;
  const bottomEdgePanY = viewportHeight - pivotY - halfScaledHeight;

  const minPanX = Math.min(leftEdgePanX, rightEdgePanX);
  const maxPanX = Math.max(leftEdgePanX, rightEdgePanX);
  const minPanY = Math.min(topEdgePanY, bottomEdgePanY);
  const maxPanY = Math.max(topEdgePanY, bottomEdgePanY);

  return {
    x: clamp(Number(candidatePan?.x) || 0, minPanX, maxPanX),
    y: clamp(Number(candidatePan?.y) || 0, minPanY, maxPanY),
  };
}

export function applyAnchoredZoom({
  currentZoom,
  targetZoom,
  anchorClient,
  centerClient,
  currentPan,
  clampPan,
  minZoom = 0.25,
  maxZoom = 24,
}) {
  const boundedZoom = clamp(targetZoom, minZoom, maxZoom);
  if (Math.abs(boundedZoom - currentZoom) < 0.0001) {
    return { zoom: currentZoom, pan: currentPan };
  }

  const relX = anchorClient.x - centerClient.x;
  const relY = anchorClient.y - centerClient.y;
  const ratio = boundedZoom / currentZoom;
  const unclampedPan = {
    x: relX - (relX - currentPan.x) * ratio,
    y: relY - (relY - currentPan.y) * ratio,
  };
  const clampedPan = clampPan(unclampedPan, boundedZoom);
  const zoomingIn = boundedZoom > currentZoom + 0.0001;

  const resolveAxisPan = (currentAxis, unclampedAxis, clampedAxis) => {
    if (!Number.isFinite(clampedAxis)) {
      return unclampedAxis;
    }

    if (!zoomingIn) {
      return clampedAxis;
    }

    const desiredDelta = unclampedAxis - currentAxis;
    const clampedDelta = clampedAxis - currentAxis;
    if (
      desiredDelta !== 0 &&
      clampedDelta !== 0 &&
      Math.sign(desiredDelta) !== Math.sign(clampedDelta)
    ) {
      // Never let zoom-in clamp reverse cursor direction ("rebound").
      return unclampedAxis;
    }

    return clampedAxis;
  };

  const nextPan = {
    x: resolveAxisPan(currentPan.x, unclampedPan.x, clampedPan.x),
    y: resolveAxisPan(currentPan.y, unclampedPan.y, clampedPan.y),
  };

  return {
    zoom: boundedZoom,
    pan: nextPan,
  };
}
