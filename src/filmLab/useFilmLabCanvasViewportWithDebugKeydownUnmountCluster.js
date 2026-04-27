import { useFilmLabCanvasViewportIdentityAndOverlayCluster } from './useFilmLabCanvasViewportIdentityAndOverlayCluster.js';
import { useFilmLabViewportDebugKeydownUnmountCluster } from './useFilmLabViewportDebugKeydownUnmountCluster.js';

/**
 * Canvas viewport (identity + overlay) then viewport debug / shell keydown / unmount cleanup (FilmLabPro cluster).
 */
export function useFilmLabCanvasViewportWithDebugKeydownUnmountCluster({
  canvasViewportIdentityOverlayArgs,
  viewportDebugKeydownUnmountArgs,
}) {
  const viewport = useFilmLabCanvasViewportIdentityAndOverlayCluster(canvasViewportIdentityOverlayArgs);

  const { viewportDebugStateArgs, shellGlobalKeydownArgs, unmountCleanupArgs } = viewportDebugKeydownUnmountArgs;

  useFilmLabViewportDebugKeydownUnmountCluster({
    viewportDebugArgs: {
      canvasViewportSize: viewport.canvasViewportSize,
      fitCanvasRenderSize: viewport.fitCanvasRenderSize,
      zoom: viewportDebugStateArgs.zoom,
      displayedZoomPercent: viewport.displayedZoomPercent,
      zoomOneToOne: viewport.zoomOneToOne,
      fitZoom: viewport.fitZoom,
      devicePixelRatio: viewportDebugStateArgs.devicePixelRatio,
      panOffsetRef: viewportDebugStateArgs.panOffsetRef,
    },
    shellGlobalKeydownArgs: {
      ...shellGlobalKeydownArgs,
      fitClassic: viewport.fitClassic,
      jumpToOneToOne: viewport.jumpToOneToOne,
      stepZoom: viewport.stepZoom,
      nudgePan: viewport.nudgePan,
    },
    unmountCleanupArgs,
  });

  return viewport;
}
