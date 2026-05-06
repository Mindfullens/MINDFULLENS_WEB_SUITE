import { buildCurvePreviewLut, sampleCurveLut } from './engine/curveInterpolation.js';
import { cloneCurves, drawCurvesPreview } from './filmLab/curvesCanvas.js';
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
  curveInteractionLiveRef,
  requestCurvePreviewFrame,
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

    const working = cloneCurves(userCurves);
    const points = working[activeCurveCh].map((point) => [...point]);
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

    working[activeCurveCh] = points;
    if (curveInteractionLiveRef) {
      curveInteractionLiveRef.current = working;
    }

    const pointerLiveRef = { x: mouseX, y: mouseY };
    let isDraggingActive = true;
    let rafLoopId = 0;
    /** ~30 fps dla podglądu silnika — co klatkę rAF generowało lawinę renderów i blokowało UI. */
    let lastCurvePreviewInvoke = 0;
    const CURVE_PREVIEW_MIN_MS = 34;

    const applyPointerToPoint = () => {
      const nextX = pointerLiveRef.x;
      const nextY = pointerLiveRef.y;
      const movingPoints = working[activeCurveCh];
      if (closestIndex < 0 || closestIndex >= movingPoints.length) {
        return;
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
    };

    const tick = () => {
      if (!isDraggingActive) {
        return;
      }
      applyPointerToPoint();
      drawCurvesPreview(curvesCanvasRef.current, working, activeCurveCh);
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (
        typeof requestCurvePreviewFrame === 'function' &&
        now - lastCurvePreviewInvoke >= CURVE_PREVIEW_MIN_MS
      ) {
        lastCurvePreviewInvoke = now;
        requestCurvePreviewFrame();
      }
      rafLoopId = requestAnimationFrame(tick);
    };

    const handleMove = (moveEvent) => {
      const [nx, ny] = getCurvePosition(moveEvent);
      pointerLiveRef.x = nx;
      pointerLiveRef.y = ny;
    };

    const handleUp = () => {
      isDraggingActive = false;
      if (rafLoopId) {
        cancelAnimationFrame(rafLoopId);
        rafLoopId = 0;
      }
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      applyPointerToPoint();
      setUserCurves(cloneCurves(working));
      if (curveInteractionLiveRef) {
        curveInteractionLiveRef.current = null;
      }
      if (typeof requestCurvePreviewFrame === 'function') {
        requestCurvePreviewFrame();
      }
      handleSliderEnd();
    };

    applyPointerToPoint();
    drawCurvesPreview(curvesCanvasRef.current, working, activeCurveCh);
    if (typeof requestCurvePreviewFrame === 'function') {
      requestCurvePreviewFrame();
    }
    rafLoopId = requestAnimationFrame(tick);

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
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
