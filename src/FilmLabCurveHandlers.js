import { buildCurvePreviewLut, sampleCurveLut } from './engine/curveInterpolation.js';
import { markFilmLabE2ePointerDown } from './filmLab/previewE2ePointerMark.js';

export function createFilmLabCurveHandlers({
  activePanel,
  curvesCanvasRef,
  activeCurveCh,
  userCurves,
  saveUndo,
  interactionReleaseTimeoutRef,
  clearSliderReleaseFailsafe,
  setIsAdjusting,
  setInteractionKind,
  setUserCurves,
  handleSliderEnd,
  clamp,
}) {
  const getCurvePosition = (event) => {
    const curvesCanvas = curvesCanvasRef.current;

    if (!curvesCanvas) {
      return [0, 0];
    }

    const rect = curvesCanvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 255;
    const y = (1 - (event.clientY - rect.top) / rect.height) * 255;

    return [x, y];
  };

  const handleCurvePointerDown = (event) => {
    if (activePanel !== 'color') {
      return;
    }

    if (event.detail > 1) {
      return;
    }

    saveUndo();
    if (interactionReleaseTimeoutRef.current) {
      clearTimeout(interactionReleaseTimeoutRef.current);
      interactionReleaseTimeoutRef.current = null;
    }
    clearSliderReleaseFailsafe();
    setIsAdjusting(true);
    setInteractionKind('curve');
    markFilmLabE2ePointerDown();

    let isDraggingActive = true;
    let pendingPosition = null;
    let dragFrameId = 0;

    setUserCurves((current) => {
      const points = current[activeCurveCh].map((point) => [...point]);
      const [mouseX, mouseY] = getCurvePosition(event);
      let closestIndex = -1;
      let closestDistance = Number.POSITIVE_INFINITY;

      points.forEach((point, index) => {
        const distance = Math.sqrt((point[0] - mouseX) ** 2 + (point[1] - mouseY) ** 2);

        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      if (closestDistance >= 40) {
        const leftEdgeX = points[0]?.[0] ?? 0;
        const rightEdgeX = points[points.length - 1]?.[0] ?? 255;
        const hasInteriorRoom = rightEdgeX - leftEdgeX > 1;

        if (hasInteriorRoom) {
          const safeX = Math.round(clamp(mouseX, leftEdgeX + 1, rightEdgeX - 1));
          const currentLut = buildCurvePreviewLut(points, 'monotonic');
          const baselineY = sampleCurveLut(currentLut, safeX);
          const newPoint = [safeX, Math.round(clamp(baselineY))];
          points.push(newPoint);
          points.sort((left, right) => left[0] - right[0]);
          closestIndex = points.findIndex(
            (point) => point[0] === newPoint[0] && point[1] === newPoint[1]
          );
        }
      }

      const flushMove = () => {
        dragFrameId = 0;

        if (!isDraggingActive || !pendingPosition) {
          return;
        }

        const { x: nextX, y: nextY } = pendingPosition;
        pendingPosition = null;

        setUserCurves((movingCurves) => {
          const movingPoints = movingCurves[activeCurveCh].map((point) => [...point]);

          if (closestIndex < 0 || closestIndex >= movingPoints.length) {
            return movingCurves;
          }
          let minX = 0;
          let maxX = 255;

          if (closestIndex === 0) {
            maxX = movingPoints.length > 1 ? movingPoints[1][0] - 1 : 255;
          } else if (closestIndex === movingPoints.length - 1) {
            minX = movingPoints[closestIndex - 1][0] + 1;
          } else {
            minX = movingPoints[closestIndex - 1][0] + 1;
            maxX = movingPoints[closestIndex + 1][0] - 1;
          }

          movingPoints[closestIndex] = [
            Math.round(clamp(nextX, minX, maxX)),
            Math.round(clamp(nextY)),
          ];

          return {
            ...movingCurves,
            [activeCurveCh]: movingPoints,
          };
        });
      };

      const handleMove = (moveEvent) => {
        const [nextX, nextY] = getCurvePosition(moveEvent);
        pendingPosition = { x: nextX, y: nextY };

        if (dragFrameId) {
          return;
        }

        dragFrameId = window.requestAnimationFrame(flushMove);
      };

      const handleUp = () => {
        isDraggingActive = false;

        if (dragFrameId) {
          window.cancelAnimationFrame(dragFrameId);
          dragFrameId = 0;
        }

        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        handleSliderEnd();
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);

      return {
        ...current,
        [activeCurveCh]: points,
      };
    });
  };

  const handleCurveDoubleClick = (event) => {
    if (activePanel !== 'color') {
      return;
    }

    const [mouseX, mouseY] = getCurvePosition(event);
    const points = userCurves[activeCurveCh];
    let closestIndex = -1;
    let closestDistance = Number.POSITIVE_INFINITY;

    points.forEach((point, index) => {
      const distance = Math.hypot(point[0] - mouseX, point[1] - mouseY);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    if (closestDistance > 22 || closestIndex <= 0 || closestIndex >= points.length - 1) {
      return;
    }

    saveUndo();
    setUserCurves((current) => ({
      ...current,
      [activeCurveCh]: current[activeCurveCh].filter((_, index) => index !== closestIndex),
    }));
  };

  return { handleCurvePointerDown, handleCurveDoubleClick };
}
