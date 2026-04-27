import { useFilmLabShellGlobalKeydown } from './useFilmLabShellGlobalKeydown.js';
import { useFilmLabUnmountCleanup } from './useFilmLabUnmountCleanup.js';
import { useFilmLabViewportDebugExpose } from './useFilmLabViewportDebugExpose.js';

/** Viewport debug bridge, shell-level shortcuts, then unmount cleanup (order matches Film Lab pro). */
export function useFilmLabViewportDebugKeydownUnmountCluster({
  viewportDebugArgs,
  shellGlobalKeydownArgs,
  unmountCleanupArgs,
}) {
  useFilmLabViewportDebugExpose(viewportDebugArgs);
  useFilmLabShellGlobalKeydown(shellGlobalKeydownArgs);
  useFilmLabUnmountCleanup(unmountCleanupArgs);
}
