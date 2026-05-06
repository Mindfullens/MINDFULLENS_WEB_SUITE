import { useEffect } from 'react';
import { resolveShortcutAction } from '../engine/shortcutActions.js';
import { isTextEditingTarget } from './domEditing.js';
import { markFilmLabE2eKeyboardE2eIntent } from './previewE2ePointerMark.js';
import { FIT_UI_ZOOM, PAN_KEY_STEP } from './viewportZoom.js';

export function useFilmLabGlobalKeydown({
  activePanel,
  studioWorkspace,
  hasImage,
  hasActiveSource,
  setIsExportModalOpen,
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
  rotateCropOverlay,
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

        if (
          modLower === 'e' &&
          !event.shiftKey &&
          !event.repeat &&
          !isTextEditingTarget(target)
        ) {
          if (!hasActiveSource) {
            return;
          }
          event.preventDefault();
          markFilmLabE2eKeyboardE2eIntent();
          if (typeof setIsExportModalOpen === 'function') {
            setIsExportModalOpen(true);
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

      if (shortcutAction.type === 'localMaskToggleMute') {
        markFilmLabE2eKeyboardE2eIntent();
        setAdjustments((current) => ({
          ...current,
          localMaskEnabled: !(current.localMaskEnabled !== false),
        }));
        return;
      }

      if (shortcutAction.type === 'localMaskToggleSolo') {
        markFilmLabE2eKeyboardE2eIntent();
        setAdjustments((current) => {
          const stack = Array.isArray(current.localMasks) ? current.localMasks : [];
          if (stack.length < 1) {
            return current;
          }
          const active = Math.max(
            0,
            Math.min(stack.length - 1, Number(current.activeLocalMaskIndex ?? 0)),
          );
          const solo = Number(current.localMaskSoloIndex ?? -1);
          if (solo === active) {
            return { ...current, localMaskSoloIndex: -1 };
          }
          return { ...current, localMaskSoloIndex: active };
        });
        return;
      }

      if (shortcutAction.type === 'localMaskToggleOverlay') {
        markFilmLabE2eKeyboardE2eIntent();
        setAdjustments((current) => ({
          ...current,
          localMaskShowOverlay: !current.localMaskShowOverlay,
        }));
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

      if (shortcutAction.type === 'rotateCropOverlay') {
        markFilmLabE2eKeyboardE2eIntent();
        if (typeof rotateCropOverlay === 'function') {
          rotateCropOverlay();
        }
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
    rotateCropOverlay,
    cycleMetadataViewMode,
    cycleRawLinearStageMode,
    fitClassic,
    handleToolbarRedo,
    handleToolbarUndo,
    hasActiveSource,
    hasImage,
    jumpToOneToOne,
    isPreviewFullMode,
    isStraightenToolArmed,
    nudgePan,
    redoStackRef,
    setAdjustments,
    setIsExportModalOpen,
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
