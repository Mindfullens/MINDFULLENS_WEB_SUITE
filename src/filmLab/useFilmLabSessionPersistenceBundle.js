import { useCallback, useMemo } from 'react';
import { useI18n } from '../i18n';
import {
  clearFilmLabCatalogDocument,
  saveFilmLabCatalogDocument,
} from '../engine/filmLabCatalogProPersist.js';
import { clearFilmLabSession, saveFilmLabSession } from '../engine/filmLabSessionPersist.js';
import { PANEL_TABS } from './panelAndGradeTabs.js';
import {
  buildCatalogProDocument,
  withCatalogProFingerprint,
} from './catalogPro/filmLabCatalogProDocument.js';
import {
  decodeRecipeToFlatSnapshot,
  encodeFlatSnapshotToRecipeDocument,
} from './recipe/filmLabRecipeCodec.js';
import { RAW_BACKEND_MODES, RAW_LINEAR_STAGE_MODES } from './workbenchConstants.js';
import { cloneSnapshotSafe } from './sessionSnapshot.js';

function buildCatalogSessionId(fileMeta) {
  if (!fileMeta || typeof fileMeta !== 'object') {
    return 'active-session';
  }
  const name = typeof fileMeta.name === 'string' ? fileMeta.name : '';
  const size = Number.isFinite(Number(fileMeta.size)) ? Number(fileMeta.size) : 0;
  const lastModified = Number.isFinite(Number(fileMeta.lastModified)) ? Number(fileMeta.lastModified) : 0;
  if (name.trim() === '') {
    return 'active-session';
  }
  return `${name}:${size}:${lastModified}`;
}

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
  const { t } = useI18n();

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

      const flatFromRecipe = decodeRecipeToFlatSnapshot(normalized.recipe);
      if (!flatFromRecipe) {
        return;
      }

      const snapshot = cloneSnapshotSafe({
        ...flatFromRecipe,
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
        t('session.notice.restored', {
          when: new Date(normalized.savedAt).toLocaleString(undefined, {
            dateStyle: 'short',
            timeStyle: 'short',
          }),
        })
      );

      const restoredCatalog = withCatalogProFingerprint(
        buildCatalogProDocument({
          sessionId: buildCatalogSessionId(normalized.fileMeta),
          sourceFileMeta: normalized.fileMeta,
          hasDecodedFrame: true,
          activeCollectionId: 'inbox',
        })
      );
      void saveFilmLabCatalogDocument(restoredCatalog, {
        sessionId: buildCatalogSessionId(normalized.fileMeta),
      });
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
      t,
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
    const pending = pendingAutosavePayloadRef.current;
    pendingAutosavePayloadRef.current = null;
    setSessionRestorePrompt(null);
    try {
      await clearFilmLabSession();
      await clearFilmLabCatalogDocument({
        sessionId: buildCatalogSessionId(pending?.fileMeta),
      });
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

      const recipe = encodeFlatSnapshotToRecipeDocument(snap);
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

      const sessionId = buildCatalogSessionId({
        name: uploadedFile.name,
        size: uploadedFile.size,
        lastModified: uploadedFile.lastModified,
      });
      const catalogDocument = withCatalogProFingerprint(
        buildCatalogProDocument({
          sessionId,
          sourceFileMeta: {
            name: uploadedFile.name,
            type: uploadedFile.type,
            size: uploadedFile.size,
            lastModified: uploadedFile.lastModified,
          },
          hasDecodedFrame: true,
          activeCollectionId: 'inbox',
        })
      );
      await saveFilmLabCatalogDocument(catalogDocument, { sessionId });
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
