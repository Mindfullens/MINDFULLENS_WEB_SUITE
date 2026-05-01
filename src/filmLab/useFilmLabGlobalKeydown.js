import { useEffect } from 'react';
import { resolveShortcutAction } from '../engine/shortcutActions.js';
import { isTextEditingTarget } from './domEditing.js';
import { markFilmLabE2eKeyboardE2eIntent } from './previewE2ePointerMark.js';
import { FIT_UI_ZOOM, PAN_KEY_STEP } from './viewportZoom.js';

export function useFilmLabGlobalKeydown({
  activePanel,
  studioWorkspace,
  hasImage,
  isStraightenToolArmed,
  isPreviewFullMode,
  showRenderDebugPanel,
  zoomRef,
  acceptCropDraft,
  acceptManualStraighten,
  cancelManualStraighten,
  setAdjustments,
  setIsPreviewFullMode,
  setIsShortcutHelpOpen,
  togglePreviewFullMode,
  fitClassic,
  jumpToOneToOne,
  setIsMetadataPanelOpen,
  cycleMetadataViewMode,
  cycleRawLinearStageMode,
  cycleCropOverlayMode,
  applyAutoExposure,
  applyAutoColor,
  stepZoom,
  nudgePan,
  triggerDustZip,
  triggerRawLeakZip,
  handleToolbarUndo,
  handleToolbarRedo,
  undoStackRef,
  redoStackRef,
}) {
  useEffect(() => {
    const buildCurrentLocalMask = (current) => ({
      name: String(current?.localMaskName ?? 'Maska'),
      enabled: current?.localMaskEnabled !== false,
      mode: String(current?.localMaskMode ?? 'brush'),
      opacity: Number(current?.localMaskOpacity ?? 100),
      blend: String(current?.localMaskBlend ?? 'normal'),
      exposure: Number(current?.brushMaskExposure ?? 0),
      brush: {
        radius: Number(current?.brushMaskRadius ?? 80),
        feather: Number(current?.brushMaskFeather ?? 65),
        erase: Boolean(current?.brushMaskErase),
        edgeSensitivity: Math.max(0, Math.min(100, Number(current?.brushMaskEdgeSensitivity ?? 0))),
        strokes: Array.isArray(current?.brushMaskStrokes) ? current.brushMaskStrokes : [],
      },
      linear: {
        angle: Number(current?.linearMaskAngle ?? 0),
        feather: Number(current?.linearMaskFeather ?? 55),
        offset: Number(current?.linearMaskOffset ?? 0),
      },
      radial: {
        centerX: Number(current?.radialMaskCenterX ?? 50),
        centerY: Number(current?.radialMaskCenterY ?? 50),
        radius: Number(current?.radialMaskRadius ?? 35),
        feather: Number(current?.radialMaskFeather ?? 55),
      },
      luma: {
        min: Number(current?.lumaMaskMin ?? 0),
        max: Number(current?.lumaMaskMax ?? 100),
        feather: Number(current?.lumaMaskFeather ?? 35),
      },
      color: {
        hueCenter: Number(current?.colorMaskHueCenter ?? 210),
        hueWidth: Number(current?.colorMaskHueWidth ?? 90),
        feather: Number(current?.colorMaskFeather ?? 35),
        chromaMin: Number(current?.colorMaskChromaMin ?? 0),
        chromaMax: Number(current?.colorMaskChromaMax ?? 100),
      },
      depth: {
        min: Number(current?.depthMaskMin ?? 0),
        max: Number(current?.depthMaskMax ?? 100),
        feather: Number(current?.depthMaskFeather ?? 35),
        mapSource: String(current?.depthMapSource ?? 'luminance'),
      },
    });

    const handleKeyDown = (event) => {
      const target = event.target;

      if (activePanel === 'crop' && hasImage) {
        const pressed = String(event.key || '').toLowerCase();
        const isEnter = pressed === 'enter' || pressed === 'return' || event.code === 'NumpadEnter';
        const isEscape = pressed === 'escape' || pressed === 'esc';
        if (isEnter) {
          event.preventDefault();
          markFilmLabE2eKeyboardE2eIntent();
          if (isStraightenToolArmed) {
            acceptManualStraighten();
          } else {
            acceptCropDraft();
          }
          return;
        }
        if (isEscape) {
          if (isStraightenToolArmed) {
            event.preventDefault();
            markFilmLabE2eKeyboardE2eIntent();
            cancelManualStraighten();
          }
          return;
        }
      }

      const hasPrimaryModifier = Boolean(event.metaKey || event.ctrlKey);
      if (hasPrimaryModifier && !event.altKey) {
        const modLower = String(event.key || '').toLowerCase();
        const undoCount = Number(undoStackRef?.current?.length) || 0;
        const redoCount = Number(redoStackRef?.current?.length) || 0;

        if (modLower === 'z' && !isTextEditingTarget(target)) {
          if (event.shiftKey) {
            if (redoCount < 1) {
              return;
            }
            event.preventDefault();
            markFilmLabE2eKeyboardE2eIntent();
            if (typeof handleToolbarRedo === 'function') {
              handleToolbarRedo();
            }
            return;
          }
          if (undoCount < 1) {
            return;
          }
          event.preventDefault();
          markFilmLabE2eKeyboardE2eIntent();
          if (typeof handleToolbarUndo === 'function') {
            handleToolbarUndo();
          }
          return;
        }

        if (
          modLower === 'y' &&
          !isTextEditingTarget(target) &&
          event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey
        ) {
          if (redoCount < 1) {
            return;
          }
          event.preventDefault();
          markFilmLabE2eKeyboardE2eIntent();
          if (typeof handleToolbarRedo === 'function') {
            handleToolbarRedo();
          }
          return;
        }
      }

      const shortcutAction = resolveShortcutAction({
        key: event.key,
        code: event.code,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        repeat: event.repeat,
        shiftKey: event.shiftKey,
        isPreviewFullMode,
        hasImage,
        zoom: (Number(zoomRef.current) || FIT_UI_ZOOM) / FIT_UI_ZOOM,
        panKeyStep: PAN_KEY_STEP,
        studioWorkspace,
      });

      if (!shortcutAction) {
        return;
      }

      if (isTextEditingTarget(target) && shortcutAction.type !== 'toggleCompare') {
        return;
      }

      if (shortcutAction.preventDefault) {
        event.preventDefault();
      }

      if (shortcutAction.type === 'toggleCompare') {
        markFilmLabE2eKeyboardE2eIntent();
        setAdjustments((current) => ({
          ...current,
          compareMode: !current.compareMode,
          compareX: 0.5,
        }));
        return;
      }

      if (shortcutAction.type === 'exitFull') {
        markFilmLabE2eKeyboardE2eIntent();
        if (typeof document !== 'undefined' && document.fullscreenElement && typeof document.exitFullscreen === 'function') {
          document.exitFullscreen().catch(() => {});
        }
        setIsPreviewFullMode(false);
        setIsShortcutHelpOpen(false);
        return;
      }

      if (shortcutAction.type === 'toggleFull') {
        markFilmLabE2eKeyboardE2eIntent();
        togglePreviewFullMode();
        return;
      }

      if (shortcutAction.type === 'toggleClipping') {
        markFilmLabE2eKeyboardE2eIntent();
        setAdjustments((current) => ({
          ...current,
          showClipping: !current.showClipping,
        }));
        return;
      }

      if (shortcutAction.type === 'fitZoom') {
        markFilmLabE2eKeyboardE2eIntent();
        fitClassic();
        return;
      }

      if (shortcutAction.type === 'oneToOneZoom') {
        markFilmLabE2eKeyboardE2eIntent();
        if (typeof jumpToOneToOne === 'function') {
          jumpToOneToOne(null);
        }
        return;
      }

      if (shortcutAction.type === 'toggleMetadataPanel') {
        setIsMetadataPanelOpen((current) => !current);
        return;
      }

      if (shortcutAction.type === 'cycleMetadataMode') {
        cycleMetadataViewMode();
        return;
      }

      if (shortcutAction.type === 'cycleRawLinearStage') {
        if (!showRenderDebugPanel) {
          return;
        }
        markFilmLabE2eKeyboardE2eIntent();
        cycleRawLinearStageMode();
        return;
      }

      if (shortcutAction.type === 'toggleShortcutHelp') {
        setIsShortcutHelpOpen((current) => !current);
        return;
      }

      if (shortcutAction.type === 'autoExposure') {
        markFilmLabE2eKeyboardE2eIntent();
        applyAutoExposure();
        return;
      }

      if (shortcutAction.type === 'autoColor') {
        markFilmLabE2eKeyboardE2eIntent();
        applyAutoColor();
        return;
      }

      if (shortcutAction.type === 'cycleOverlayMode') {
        markFilmLabE2eKeyboardE2eIntent();
        cycleCropOverlayMode();
        return;
      }

      if (shortcutAction.type === 'zoomIn' || shortcutAction.type === 'zoomOut') {
        markFilmLabE2eKeyboardE2eIntent();
        stepZoom(shortcutAction.type === 'zoomIn' ? 1 : -1, null);
        return;
      }

      if (shortcutAction.type === 'pan') {
        markFilmLabE2eKeyboardE2eIntent();
        nudgePan(shortcutAction.dx ?? 0, shortcutAction.dy ?? 0);
        return;
      }

      if (shortcutAction.type === 'triggerDustZip') {
        triggerDustZip();
        return;
      }

      if (shortcutAction.type === 'triggerRawLeakZip') {
        triggerRawLeakZip();
        return;
      }

      if (
        shortcutAction.type === 'localMaskPrev' ||
        shortcutAction.type === 'localMaskNext' ||
        shortcutAction.type === 'localMaskDuplicate' ||
        shortcutAction.type === 'localMaskToggleMute' ||
        shortcutAction.type === 'localMaskToggleSolo' ||
        shortcutAction.type === 'localMaskToggleOverlay' ||
        shortcutAction.type === 'localMaskStudioShiftM' ||
        shortcutAction.type === 'localMaskStudioEraseToggle' ||
        shortcutAction.type === 'localMaskMoveUp' ||
        shortcutAction.type === 'localMaskMoveDown'
      ) {
        markFilmLabE2eKeyboardE2eIntent();
        setAdjustments((current) => {
          if (shortcutAction.type === 'localMaskStudioShiftM') {
            return {
              ...current,
              brushMaskEnabled: !(current?.brushMaskEnabled !== false),
            };
          }

          const stack = Array.isArray(current?.localMasks) ? [...current.localMasks] : [];
          const active = Math.max(
            0,
            Math.min(stack.length > 0 ? stack.length - 1 : 0, Number(current?.activeLocalMaskIndex ?? 0))
          );
          const currentMask = buildCurrentLocalMask(current);
          if (stack.length === 0) {
            stack.push(currentMask);
          } else {
            stack[active] = currentMask;
          }

          const applyMask = (mask, idx, nextStack = stack, nextSoloIndex = Number(current?.localMaskSoloIndex ?? -1)) => ({
            ...current,
            localMasks: nextStack,
            activeLocalMaskIndex: idx,
            localMaskSoloIndex: nextSoloIndex,
            localMaskName: String(mask?.name ?? `Maska ${idx + 1}`),
            localMaskEnabled: mask?.enabled !== false,
            localMaskMode: String(mask?.mode ?? 'brush'),
            localMaskOpacity: Number(mask?.opacity ?? 100),
            localMaskBlend: String(mask?.blend ?? 'normal'),
            brushMaskExposure: Number(mask?.exposure ?? 0),
            brushMaskRadius: Number(mask?.brush?.radius ?? 80),
            brushMaskFeather: Number(mask?.brush?.feather ?? 65),
            brushMaskErase: Boolean(mask?.brush?.erase),
            brushMaskEdgeSensitivity: Math.max(
              0,
              Math.min(100, Number(mask?.brush?.edgeSensitivity ?? 0))
            ),
            brushMaskStrokes: Array.isArray(mask?.brush?.strokes) ? mask.brush.strokes : [],
            linearMaskAngle: Number(mask?.linear?.angle ?? 0),
            linearMaskFeather: Number(mask?.linear?.feather ?? 55),
            linearMaskOffset: Number(mask?.linear?.offset ?? 0),
            radialMaskCenterX: Number(mask?.radial?.centerX ?? 50),
            radialMaskCenterY: Number(mask?.radial?.centerY ?? 50),
            radialMaskRadius: Number(mask?.radial?.radius ?? 35),
            radialMaskFeather: Number(mask?.radial?.feather ?? 55),
            lumaMaskMin: Number(mask?.luma?.min ?? 0),
            lumaMaskMax: Number(mask?.luma?.max ?? 100),
            lumaMaskFeather: Number(mask?.luma?.feather ?? 35),
            colorMaskHueCenter: Number(mask?.color?.hueCenter ?? 210),
            colorMaskHueWidth: Number(mask?.color?.hueWidth ?? 90),
            colorMaskFeather: Number(mask?.color?.feather ?? 35),
            colorMaskChromaMin: Number(mask?.color?.chromaMin ?? 0),
            colorMaskChromaMax: Number(mask?.color?.chromaMax ?? 100),
            depthMaskMin: Number(mask?.depth?.min ?? 0),
            depthMaskMax: Number(mask?.depth?.max ?? 100),
            depthMaskFeather: Number(mask?.depth?.feather ?? 35),
            depthMapSource: String(mask?.depth?.mapSource ?? 'luminance'),
          });

          if (shortcutAction.type === 'localMaskPrev') {
            const next = Math.max(0, active - 1);
            return applyMask(stack[next], next);
          }
          if (shortcutAction.type === 'localMaskNext') {
            const next = Math.min(stack.length - 1, active + 1);
            return applyMask(stack[next], next);
          }
          if (shortcutAction.type === 'localMaskDuplicate') {
            const duplicated = {
              ...stack[active],
              brush: {
                ...(stack[active]?.brush ?? {}),
                strokes: Array.isArray(stack[active]?.brush?.strokes) ? [...stack[active].brush.strokes] : [],
              },
            };
            const nextStack = [...stack];
            nextStack.splice(active + 1, 0, duplicated);
            return applyMask(duplicated, active + 1, nextStack, -1);
          }
          if (shortcutAction.type === 'localMaskToggleMute') {
            const nextStack = [...stack];
            const currentEnabled = nextStack[active]?.enabled !== false;
            nextStack[active] = {
              ...nextStack[active],
              enabled: !currentEnabled,
            };
            return applyMask(nextStack[active], active, nextStack);
          }
          if (shortcutAction.type === 'localMaskToggleSolo') {
            const soloIndex = Number(current?.localMaskSoloIndex ?? -1);
            const nextSoloIndex = soloIndex === active ? -1 : active;
            return applyMask(stack[active], active, stack, nextSoloIndex);
          }
          if (shortcutAction.type === 'localMaskToggleOverlay') {
            return {
              ...current,
              localMaskShowOverlay: !current?.localMaskShowOverlay,
            };
          }
          if (shortcutAction.type === 'localMaskStudioEraseToggle') {
            const mode = String(current?.localMaskMode ?? 'brush');
            if (mode === 'brush' && current?.brushMaskEnabled !== false) {
              return {
                ...current,
                brushMaskErase: !current?.brushMaskErase,
              };
            }
            const nextStack = [...stack];
            const currentEnabled = nextStack[active]?.enabled !== false;
            nextStack[active] = {
              ...nextStack[active],
              enabled: !currentEnabled,
            };
            return applyMask(nextStack[active], active, nextStack);
          }
          if (shortcutAction.type === 'localMaskMoveUp' && active > 0) {
            const nextStack = [...stack];
            [nextStack[active], nextStack[active - 1]] = [nextStack[active - 1], nextStack[active]];
            const soloIndex = Number(current?.localMaskSoloIndex ?? -1);
            const nextSoloIndex =
              soloIndex === active ? active - 1 : soloIndex === active - 1 ? active : soloIndex;
            return applyMask(nextStack[active - 1], active - 1, nextStack, nextSoloIndex);
          }
          if (shortcutAction.type === 'localMaskMoveDown' && active < stack.length - 1) {
            const nextStack = [...stack];
            [nextStack[active], nextStack[active + 1]] = [nextStack[active + 1], nextStack[active]];
            const soloIndex = Number(current?.localMaskSoloIndex ?? -1);
            const nextSoloIndex =
              soloIndex === active ? active + 1 : soloIndex === active + 1 ? active : soloIndex;
            return applyMask(nextStack[active + 1], active + 1, nextStack, nextSoloIndex);
          }
          return applyMask(stack[active], active);
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [
    acceptCropDraft,
    acceptManualStraighten,
    activePanel,
    studioWorkspace,
    applyAutoColor,
    applyAutoExposure,
    cancelManualStraighten,
    cycleCropOverlayMode,
    cycleMetadataViewMode,
    cycleRawLinearStageMode,
    fitClassic,
    handleToolbarRedo,
    handleToolbarUndo,
    hasImage,
    jumpToOneToOne,
    isPreviewFullMode,
    isStraightenToolArmed,
    nudgePan,
    redoStackRef,
    setAdjustments,
    setIsMetadataPanelOpen,
    setIsPreviewFullMode,
    setIsShortcutHelpOpen,
    showRenderDebugPanel,
    stepZoom,
    togglePreviewFullMode,
    triggerDustZip,
    triggerRawLeakZip,
    undoStackRef,
    zoomRef,
  ]);
}
