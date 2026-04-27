import { buildFilmLabGlobalKeydownProps } from './shellPropBuilders.js';
import { useFilmLabGlobalKeydown } from './useFilmLabGlobalKeydown.js';

export function useFilmLabShellGlobalKeydown(props) {
  useFilmLabGlobalKeydown(buildFilmLabGlobalKeydownProps(props));
}
