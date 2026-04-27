import { useFilmLabCurveAndSliderWorkbench } from './useFilmLabCurveAndSliderWorkbench.js';
import { useFilmLabShellOverlayProps } from './useFilmLabShellOverlayProps.js';

/** Curve/slider workbench handlers plus crop overlay + render-debug prop factories. */
export function useFilmLabCurveWorkbenchShellOverlayCluster({
  curveWorkbenchFirstProps,
  curveWorkbenchSecondProps,
  shellOverlayPropsArgs,
}) {
  const curveWorkbench = useFilmLabCurveAndSliderWorkbench(
    curveWorkbenchFirstProps,
    curveWorkbenchSecondProps
  );
  const overlay = useFilmLabShellOverlayProps(shellOverlayPropsArgs);
  return { ...curveWorkbench, ...overlay };
}
