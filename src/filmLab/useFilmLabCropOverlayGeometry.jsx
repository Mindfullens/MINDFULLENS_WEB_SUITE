import { useMemo } from 'react';
import { clamp } from './crop/cropStraighten.js';
import { buildLogSpiralPath } from './crop/overlaySvg.js';

export function useFilmLabCropOverlayGeometry({ cropRectPercent, straightenGuide, activeCropOverlayMode }) {
  const straightenGuidePercent = useMemo(() => {
    if (!straightenGuide) {
      return null;
    }
    return {
      start: {
        x: clamp(straightenGuide.start.x * 100, 0, 100),
        y: clamp(straightenGuide.start.y * 100, 0, 100),
      },
      end: {
        x: clamp(straightenGuide.end.x * 100, 0, 100),
        y: clamp(straightenGuide.end.y * 100, 0, 100),
      },
    };
  }, [straightenGuide]);

  const cropMaskPath = useMemo(() => {
    const x2 = cropRectPercent.x + cropRectPercent.w;
    const y2 = cropRectPercent.y + cropRectPercent.h;
    return `M0 0H100V100H0Z M${cropRectPercent.x.toFixed(3)} ${cropRectPercent.y.toFixed(3)}H${x2.toFixed(3)}V${y2.toFixed(3)}H${cropRectPercent.x.toFixed(3)}Z`;
  }, [cropRectPercent.h, cropRectPercent.w, cropRectPercent.x, cropRectPercent.y]);

  const cropGuideTransform = useMemo(
    () =>
      `translate(${cropRectPercent.x.toFixed(3)} ${cropRectPercent.y.toFixed(3)}) scale(${(
        cropRectPercent.w / 100
      ).toFixed(6)} ${(cropRectPercent.h / 100).toFixed(6)})`,
    [cropRectPercent.h, cropRectPercent.w, cropRectPercent.x, cropRectPercent.y]
  );

  const cropHandles = useMemo(() => {
    const left = cropRectPercent.x;
    const top = cropRectPercent.y;
    const right = cropRectPercent.x + cropRectPercent.w;
    const bottom = cropRectPercent.y + cropRectPercent.h;
    const midX = left + cropRectPercent.w / 2;
    const midY = top + cropRectPercent.h / 2;
    return {
      nw: { x: left, y: top },
      n: { x: midX, y: top },
      ne: { x: right, y: top },
      e: { x: right, y: midY },
      se: { x: right, y: bottom },
      s: { x: midX, y: bottom },
      sw: { x: left, y: bottom },
      w: { x: left, y: midY },
    };
  }, [cropRectPercent.h, cropRectPercent.w, cropRectPercent.x, cropRectPercent.y]);

  const cropMoveZoneRect = useMemo(() => {
    const inset = Math.min(6, Math.max(1.2, Math.min(cropRectPercent.w, cropRectPercent.h) * 0.18));
    const width = Math.max(0, cropRectPercent.w - inset * 2);
    const height = Math.max(0, cropRectPercent.h - inset * 2);
    return {
      x: cropRectPercent.x + inset,
      y: cropRectPercent.y + inset,
      w: width,
      h: height,
    };
  }, [cropRectPercent.h, cropRectPercent.w, cropRectPercent.x, cropRectPercent.y]);

  const cropHandleHitboxes = useMemo(() => {
    const left = cropRectPercent.x;
    const top = cropRectPercent.y;
    const right = cropRectPercent.x + cropRectPercent.w;
    const bottom = cropRectPercent.y + cropRectPercent.h;
    const midX = left + cropRectPercent.w / 2;
    const midY = top + cropRectPercent.h / 2;
    const cornerSize = Math.min(12, Math.max(6.5, Math.min(cropRectPercent.w, cropRectPercent.h) * 0.34));
    const edgeThickness = Math.min(9, Math.max(5.2, cornerSize * 0.72));
    const minEdgeLength = 5.5;
    const horizontalLength = Math.max(minEdgeLength, cropRectPercent.w - cornerSize);
    const verticalLength = Math.max(minEdgeLength, cropRectPercent.h - cornerSize);
    const clampHitX = (value, width) => clamp(value, 0, 100 - width);
    const clampHitY = (value, height) => clamp(value, 0, 100 - height);

    return {
      nw: {
        x: clampHitX(left - cornerSize / 2, cornerSize),
        y: clampHitY(top - cornerSize / 2, cornerSize),
        w: cornerSize,
        h: cornerSize,
      },
      ne: {
        x: clampHitX(right - cornerSize / 2, cornerSize),
        y: clampHitY(top - cornerSize / 2, cornerSize),
        w: cornerSize,
        h: cornerSize,
      },
      se: {
        x: clampHitX(right - cornerSize / 2, cornerSize),
        y: clampHitY(bottom - cornerSize / 2, cornerSize),
        w: cornerSize,
        h: cornerSize,
      },
      sw: {
        x: clampHitX(left - cornerSize / 2, cornerSize),
        y: clampHitY(bottom - cornerSize / 2, cornerSize),
        w: cornerSize,
        h: cornerSize,
      },
      n: {
        x: clampHitX(midX - horizontalLength / 2, horizontalLength),
        y: clampHitY(top - edgeThickness / 2, edgeThickness),
        w: horizontalLength,
        h: edgeThickness,
      },
      s: {
        x: clampHitX(midX - horizontalLength / 2, horizontalLength),
        y: clampHitY(bottom - edgeThickness / 2, edgeThickness),
        w: horizontalLength,
        h: edgeThickness,
      },
      e: {
        x: clampHitX(right - edgeThickness / 2, edgeThickness),
        y: clampHitY(midY - verticalLength / 2, verticalLength),
        w: edgeThickness,
        h: verticalLength,
      },
      w: {
        x: clampHitX(left - edgeThickness / 2, edgeThickness),
        y: clampHitY(midY - verticalLength / 2, verticalLength),
        w: edgeThickness,
        h: verticalLength,
      },
    };
  }, [cropRectPercent.h, cropRectPercent.w, cropRectPercent.x, cropRectPercent.y]);

  const cropSpiralPath = useMemo(() => buildLogSpiralPath(), []);

  const cropOverlayGuideElements = useMemo(() => {
    const phi = 61.803;
    const phiInv = 100 - phi;
    const triangleAAnchorBottomLeft = { x: 38, y: 38 };
    const triangleAAnchorTopRight = { x: 62, y: 62 };
    const triangleBAnchorTopLeft = { x: 62, y: 38 };
    const triangleBAnchorBottomRight = { x: 38, y: 62 };

    if (activeCropOverlayMode === 'none') {
      return null;
    }
    if (activeCropOverlayMode === 'thirds') {
      return (
        <>
          <line x1="33.333" y1="0" x2="33.333" y2="100" className="crop-guide-line" />
          <line x1="66.667" y1="0" x2="66.667" y2="100" className="crop-guide-line" />
          <line x1="0" y1="33.333" x2="100" y2="33.333" className="crop-guide-line" />
          <line x1="0" y1="66.667" x2="100" y2="66.667" className="crop-guide-line" />
        </>
      );
    }
    if (activeCropOverlayMode === 'phi') {
      return (
        <>
          <line x1={phi.toFixed(3)} y1="0" x2={phi.toFixed(3)} y2="100" className="crop-guide-line" />
          <line x1={phiInv.toFixed(3)} y1="0" x2={phiInv.toFixed(3)} y2="100" className="crop-guide-line" />
          <line x1="0" y1={phi.toFixed(3)} x2="100" y2={phi.toFixed(3)} className="crop-guide-line" />
          <line x1="0" y1={phiInv.toFixed(3)} x2="100" y2={phiInv.toFixed(3)} className="crop-guide-line" />
        </>
      );
    }
    if (activeCropOverlayMode === 'spiral') {
      return <path d={cropSpiralPath} className="crop-guide-line crop-guide-spiral" />;
    }
    if (activeCropOverlayMode === 'diagonalA') {
      return <line x1="0" y1="0" x2="100" y2="100" className="crop-guide-line" />;
    }
    if (activeCropOverlayMode === 'diagonalB') {
      return <line x1="100" y1="0" x2="0" y2="100" className="crop-guide-line" />;
    }
    if (activeCropOverlayMode === 'triangleA') {
      return (
        <>
          <line x1="0" y1="0" x2="100" y2="100" className="crop-guide-line" />
          <line
            x1="0"
            y1="100"
            x2={triangleAAnchorBottomLeft.x.toFixed(3)}
            y2={triangleAAnchorBottomLeft.y.toFixed(3)}
            className="crop-guide-line"
          />
          <line
            x1="100"
            y1="0"
            x2={triangleAAnchorTopRight.x.toFixed(3)}
            y2={triangleAAnchorTopRight.y.toFixed(3)}
            className="crop-guide-line"
          />
        </>
      );
    }
    if (activeCropOverlayMode === 'triangleB') {
      return (
        <>
          <line x1="100" y1="0" x2="0" y2="100" className="crop-guide-line" />
          <line
            x1="0"
            y1="0"
            x2={triangleBAnchorTopLeft.x.toFixed(3)}
            y2={triangleBAnchorTopLeft.y.toFixed(3)}
            className="crop-guide-line"
          />
          <line
            x1="100"
            y1="100"
            x2={triangleBAnchorBottomRight.x.toFixed(3)}
            y2={triangleBAnchorBottomRight.y.toFixed(3)}
            className="crop-guide-line"
          />
        </>
      );
    }
    return null;
  }, [activeCropOverlayMode, cropSpiralPath]);

  return {
    straightenGuidePercent,
    cropMaskPath,
    cropGuideTransform,
    cropHandles,
    cropMoveZoneRect,
    cropHandleHitboxes,
    cropOverlayGuideElements,
  };
}
