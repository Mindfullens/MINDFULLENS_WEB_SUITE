import { createFilmLabCurveHandlers } from '../FilmLabCurveHandlers.js';
import { createFilmLabSliderRenderers } from '../FilmLabSliderRenderers.jsx';

export function useFilmLabCurveAndSliderWorkbench(curveHandlerProps, sliderRendererProps) {
  return {
    ...createFilmLabCurveHandlers(curveHandlerProps),
    ...createFilmLabSliderRenderers(sliderRendererProps),
  };
}
