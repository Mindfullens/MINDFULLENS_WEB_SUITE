import { useLayoutEffect, useState } from 'react';
import { clamp } from './crop/cropStraighten.js';

/**
 * Tracks horizontal chrome (sidebars) so the canvas viewport can subtract fixed UI width.
 * Top/bottom stay 0 — stage already accounts for toolbar/footer per FilmLab layout.
 */
export function useChromeBoxInsets({
  leftSidebarRef,
  rightSidebarRef,
  toolbarRef,
  workspaceFooterRef,
}) {
  const [chromeBox, setChromeBox] = useState({ top: 0, bottom: 0, left: 0, right: 0 });

  useLayoutEffect(() => {
    const updateChromeBox = () => {
      if (typeof window === 'undefined') {
        return;
      }

      const leftRect = leftSidebarRef.current?.getBoundingClientRect?.();
      const rightRect = rightSidebarRef.current?.getBoundingClientRect?.();
      const winW = Number(window.innerWidth) || 0;
      const leftWidth = leftRect?.width ?? 0;
      const rightWidth = rightRect?.width ?? 0;

      const next = {
        top: 0,
        bottom: 0,
        left: clamp(Math.round(leftWidth), 0, Math.max(0, winW)),
        right: clamp(Math.round(rightWidth), 0, Math.max(0, winW)),
      };

      setChromeBox((current) => {
        if (
          current.top === next.top &&
          current.bottom === next.bottom &&
          current.left === next.left &&
          current.right === next.right
        ) {
          return current;
        }
        return next;
      });
    };

    updateChromeBox();

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            updateChromeBox();
          })
        : null;

    if (toolbarRef.current) {
      resizeObserver?.observe(toolbarRef.current);
    }
    if (leftSidebarRef.current) {
      resizeObserver?.observe(leftSidebarRef.current);
    }
    if (rightSidebarRef.current) {
      resizeObserver?.observe(rightSidebarRef.current);
    }
    if (workspaceFooterRef.current) {
      resizeObserver?.observe(workspaceFooterRef.current);
    }

    window.addEventListener('resize', updateChromeBox);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateChromeBox);
    };
  }, [leftSidebarRef, rightSidebarRef, toolbarRef, workspaceFooterRef]);

  return chromeBox;
}
