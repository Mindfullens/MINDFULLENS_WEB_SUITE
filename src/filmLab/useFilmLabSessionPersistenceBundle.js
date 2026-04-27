import { useCallback, useMemo } from 'react';
import { clearFilmLabSession, saveFilmLabSession } from '../engine/filmLabSessionPersist.js';
import { PANEL_TABS } from './panelAndGradeTabs.js';
import { RAW_BACKEND_MODES, RAW_LINEAR_STAGE_MODES } from './workbenchConstants.js';
import { cloneSnapshotSafe } from './sessionSnapshot.js';

export function useFilmLabSessionPersistenceBundle({
  skipNextPersistRef,
  cropLiveRectRef,
  pendingAutosavePayloadRef,
  restoreSnapshot,
  captureCurrentSnapshot,
  setActiveCategory,
  setSearchQuery,
  setActiveCurveCh,
  setStraightenGuide,
  setCropLiveRect,
  setRawBackendMode,
  setRawLinearStageMode,
  setSessionRestoreNotice,
  setSessionRestorePrompt,
  activeFilmIndex,
  adjustments,
  userCurves,
  colorMixer,
  colorGrading,
  colorCalibration,
  zoom,
  panOffset,
  activePanel,
  activeCategory,
  searchQuery,
  activeCurveCh,
  straightenGuide,
  cropLiveRect,
  rawBackendMode,
  rawLinearStageMode,
  uploadedFile,
  hasImage,
}) {
  const applySessionFromNormalized = useCallback(
    (normalized) => {
      if (!normalized) {
        return;
      }

      skipNextPersistRef.current = true;
      const file = new File([normalized.buffer], normalized.fileMeta.name, {
        type: normalized.fileMeta.type || '',
        lastModified: normalized.fileMeta.lastModified,
      });

      const snapshot = cloneSnapshotSafe({
        ...normalized.recipe,
        sourceRestoreFile: file,
      });

      if (!snapshot) {
        return;
      }

      const ui = normalized.ui || {};
      const targetPanel =
        typeof ui.activePanel === 'string' && PANEL_TABS.some((tab) => tab.id === ui.activePanel)
          ? ui.activePanel
          : 'basic';

      restoreSnapshot(snapshot, {
        keepCurrentPanel: false,
        fileTargetPanel: targetPanel,
      });

      if (typeof ui.activeCategory === 'string') {
        setActiveCategory(ui.activeCategory);
      }
      if (typeof ui.searchQuery === 'string') {
        setSearchQuery(ui.searchQuery);
      }
      if (['rgb', 'r', 'g', 'b'].includes(ui.activeCurveCh)) {
        setActiveCurveCh(ui.activeCurveCh);
      }
      if (Object.prototype.hasOwnProperty.call(ui, 'straightenGuide')) {
        setStraightenGuide(ui.straightenGuide);
      }
      if (Object.prototype.hasOwnProperty.call(ui, 'cropLiveRect')) {
        const restoredCrop = ui.cropLiveRect;
        setCropLiveRect(restoredCrop);
        cropLiveRectRef.current = restoredCrop ?? null;
      }
      if (RAW_BACKEND_MODES.includes(ui.rawBackendMode)) {
        setRawBackendMode(ui.rawBackendMode);
      }
      if (RAW_LINEAR_STAGE_MODES.includes(ui.rawLinearStageMode)) {
        setRawLinearStageMode(ui.rawLinearStageMode);
      }

      setSessionRestoreNotice(
        `Przywrócono auto-zapis (${new Date(normalized.savedAt).toLocaleString(undefined, {
          dateStyle: 'short',
          timeStyle: 'short',
        })})`
      );
    },
    [
      cropLiveRectRef,
      restoreSnapshot,
      setActiveCategory,
      setActiveCurveCh,
      setCropLiveRect,
      setRawBackendMode,
      setRawLinearStageMode,
      setSearchQuery,
      setSessionRestoreNotice,
      setStraightenGuide,
      skipNextPersistRef,
    ]
  );

  const confirmSessionRestore = useCallback(() => {
    const normalized = pendingAutosavePayloadRef.current;
    pendingAutosavePayloadRef.current = null;
    setSessionRestorePrompt(null);
    if (normalized) {
      applySessionFromNormalized(normalized);
    }
  }, [applySessionFromNormalized, pendingAutosavePayloadRef, setSessionRestorePrompt]);

  const declineSessionRestore = useCallback(async () => {
    pendingAutosavePayloadRef.current = null;
    setSessionRestorePrompt(null);
    try {
      await clearFilmLabSession();
    } catch {
      // noop
    }
  }, [pendingAutosavePayloadRef, setSessionRestorePrompt]);

  const sessionPersistFingerprint = useMemo(
    () =>
      JSON.stringify({
        activeFilmIndex,
        adjustments,
        userCurves,
        colorMixer,
        colorGrading,
        colorCalibration,
        zoom,
        panOffset,
        activePanel,
        activeCategory,
        searchQuery,
        activeCurveCh,
        straightenGuide,
        cropLiveRect,
        rawBackendMode,
        rawLinearStageMode,
        fileKey:
          uploadedFile instanceof File
            ? `${uploadedFile.name}:${uploadedFile.size}:${uploadedFile.lastModified}`
            : '',
      }),
    [
      activeCategory,
      activeCurveCh,
      activeFilmIndex,
      activePanel,
      adjustments,
      colorCalibration,
      colorGrading,
      colorMixer,
      cropLiveRect,
      panOffset,
      rawBackendMode,
      rawLinearStageMode,
      searchQuery,
      straightenGuide,
      uploadedFile,
      userCurves,
      zoom,
    ]
  );

  const flushSessionToIdb = useCallback(async () => {
    if (!uploadedFile || !(uploadedFile instanceof File) || !hasImage) {
      return;
    }

    try {
      const snap = captureCurrentSnapshot();
      if (!snap) {
        return;
      }

      const recipe = { ...snap };
      delete recipe.sourceRestoreFile;
      const buffer = await uploadedFile.arrayBuffer();

      await saveFilmLabSession({
        fileMeta: {
          name: uploadedFile.name,
          type: uploadedFile.type,
          lastModified: uploadedFile.lastModified,
          size: uploadedFile.size,
        },
        buffer,
        recipe,
        ui: {
          activePanel,
          activeCategory,
          searchQuery,
          activeCurveCh,
          straightenGuide,
          cropLiveRect,
          rawBackendMode,
          rawLinearStageMode,
        },
      });
    } catch (error) {
      console.warn('[FilmLab] Session flush failed', error);
    }
  }, [
    activeCategory,
    activeCurveCh,
    activePanel,
    captureCurrentSnapshot,
    cropLiveRect,
    hasImage,
    rawBackendMode,
    rawLinearStageMode,
    searchQuery,
    straightenGuide,
    uploadedFile,
  ]);

  return {
    applySessionFromNormalized,
    confirmSessionRestore,
    declineSessionRestore,
    sessionPersistFingerprint,
    flushSessionToIdb,
  };
}
