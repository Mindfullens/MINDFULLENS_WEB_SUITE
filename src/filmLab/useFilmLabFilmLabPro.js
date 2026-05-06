import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, startTransition, useState } from 'react';
import { buildFilmLabShellContainerBundleArgs } from './buildFilmLabShellContainerBundleArgs.js';
import {
  clearFilmLabDevelopPresentationGhost,
  setFilmLabProDevelopCatalogLoadBump,
} from './filmLabDevelopCatalogLoadCooperation.js';
import { filmLabFilmLabProClusterArgFactories } from './filmLabFilmLabProClusterArgFactories.js';
import {
  cancelImageWorkerRequest,
  getDevelopFastPreviewPriority,
  nextImageWorkerRequestId,
  scheduleOpfsDamPreviewDecode,
} from './filmLabImageWorkerBridge.js';
import { useFilmLabCatalogProLibraryWorkspace } from './useFilmLabCatalogProLibraryWorkspace.js';
import { useFilmLabDevelopOpfsThumbnailCapture } from './useFilmLabDevelopOpfsThumbnailCapture.js';
import { useFilmLabDevelopSmartPreviewBitmap } from './useFilmLabDevelopSmartPreviewBitmap.js';
import { useFilmLabWorkbenchChromeCaptureFilmCropStraightenPanelAndCanvasViewportDebugCurveShellCluster } from './useFilmLabWorkbenchChromeCaptureFilmCropStraightenPanelAndCanvasViewportDebugCurveShellCluster.js';
import { resolveFilmLabDevelopTargetAssetId } from './resolveFilmLabDevelopTargetAssetId.js';

/**
 * Full Film Lab Pro workbench + shell bundle wiring (invoked from FilmLabPro.jsx).
 */
export function useFilmLabFilmLabPro() {
  const s = useFilmLabWorkbenchChromeCaptureFilmCropStraightenPanelAndCanvasViewportDebugCurveShellCluster({
    ...filmLabFilmLabProClusterArgFactories,
  });

  const libraryWorkspace = useFilmLabCatalogProLibraryWorkspace({
    uploadedFile: s.uploadedFile,
    hasImage: s.hasImage,
    exifMeta: s.exifMeta,
    imageMeta: s.imageMeta,
    imageUrl: s.imageUrl,
    pauseBackgroundEmbeddedExtract: false,
  });

  const {
    importCatalogFiles,
    resolveAssetFile,
    pickAsset,
    clearEntireCatalog,
    removeCatalogAssets,
    ...libraryWorkspaceRest
  } = libraryWorkspace;

  /**
   * Blokuje wielokrotne auto-handoff w pętli, gdy `!hasImage` (np. mostek RAW niedostępny).
   * Ręczny wybór na filmstrip / „Otwórz w edycji” przekazuje `fromAutoHandoff: false` i zeruje blokadę.
   */
  const developHandoffTripRef = useRef(false);
  const developHandoffTargetTidRef = useRef(null);
  /** Ostatni „Active / Target Photo” dla którego pokazano UI — zmiana bez ghostingu wymaga layout clear. */
  const developVisualTargetRef = useRef(null);
  /** HotDrink-lite: każde wywołanie `loadDevelopAssetFromCatalog` podbija — po `await` tylko najnowsze gen stosuje UI. */
  const developCatalogLoadGenRef = useRef(0);
  /** Ostatni `requestId` dla `scheduleOpfsDamPreviewDecode` w Develop — anulowany przy nowym lotcie / invalidacji. */
  const developFastPreviewRequestIdRef = useRef('');
  /** Ostatni `requestId` dla `scheduleOpfsCatalogSourceRead` (duży RAW z OPFS). */
  const developCatalogSourceRequestIdRef = useRef('');

  const bumpDevelopCatalogLoadInvalidation = useCallback(() => {
    developCatalogLoadGenRef.current += 1;
    const ridFast = developFastPreviewRequestIdRef.current;
    if (ridFast) {
      cancelImageWorkerRequest(ridFast);
      developFastPreviewRequestIdRef.current = '';
    }
    const ridSrc = developCatalogSourceRequestIdRef.current;
    if (ridSrc) {
      cancelImageWorkerRequest(ridSrc);
      developCatalogSourceRequestIdRef.current = '';
    }
  }, []);

  useLayoutEffect(() => {
    setFilmLabProDevelopCatalogLoadBump(bumpDevelopCatalogLoadInvalidation);
    return () => setFilmLabProDevelopCatalogLoadBump(null);
  }, [bumpDevelopCatalogLoadInvalidation]);

  /**
   * Proxy-first: przy zmianie celu Develop czyść **tylko** pełny canvas silnika (anti-ghost).
   * Nie kasuj warstwy proxy JPEG — unikasz ~10 s czarnego ekranu; stary podgląd znika po `await previewP`.
   */
  useLayoutEffect(() => {
    if (s.studioWorkspace !== 'develop') {
      developVisualTargetRef.current = null;
      return;
    }
    const catAssets = libraryWorkspace.assets ?? [];
    if (catAssets.length === 0) {
      return;
    }
    const tid = resolveFilmLabDevelopTargetAssetId({
      primaryAssetId: libraryWorkspace.primaryAssetId,
      selectedAssetIds: libraryWorkspace.selectedAssetIds,
      catalogAssets: catAssets,
      filteredAssets: libraryWorkspace.filteredAssets,
    });
    if (tid == null || tid === '') {
      return;
    }
    const prev = developVisualTargetRef.current;
    if (prev === tid) {
      return;
    }
    if (prev != null) {
      clearFilmLabDevelopPresentationGhost();
      bumpDevelopCatalogLoadInvalidation();
    }
    developVisualTargetRef.current = tid;
  }, [
    s.studioWorkspace,
    libraryWorkspace.assets,
    libraryWorkspace.primaryAssetId,
    libraryWorkspace.selectedAssetIds,
    libraryWorkspace.filteredAssets,
    bumpDevelopCatalogLoadInvalidation,
  ]);

  useEffect(() => {
    if (s.studioWorkspace !== 'develop') {
      s.setDevelopFastPreviewBitmap((prev) => {
        prev?.close?.();
        return null;
      });
      s.setDevelopFastPreviewExifOrientation(1);
      s.setDevelopSmartPreviewBitmap((prev) => {
        prev?.close?.();
        return null;
      });
    }
  }, [
    s.studioWorkspace,
    s.setDevelopFastPreviewBitmap,
    s.setDevelopFastPreviewExifOrientation,
    s.setDevelopSmartPreviewBitmap,
  ]);

  const [developOpfsCaptureAssetId, setDevelopOpfsCaptureAssetId] = useState(null);

  const loadDevelopAssetFromCatalog = useCallback(
    async (assetId, { alsoSwitchToDevelop = false, fromAutoHandoff = false } = {}) => {
      const loadGen = (developCatalogLoadGenRef.current += 1);
      const ridStale = developFastPreviewRequestIdRef.current;
      if (ridStale) {
        cancelImageWorkerRequest(ridStale);
        developFastPreviewRequestIdRef.current = '';
      }
      const ridSrcStale = developCatalogSourceRequestIdRef.current;
      if (ridSrcStale) {
        cancelImageWorkerRequest(ridSrcStale);
        developCatalogSourceRequestIdRef.current = '';
      }
      /** Pełny podgląd silnika wyczyść — bez kasowania warstwy proxy JPEG (proxy-first). */
      clearFilmLabDevelopPresentationGhost();
      /** Oddaj wątek po kliknięciu — unik „Violation: click handler took …ms”. */
      await Promise.resolve();
      if (!fromAutoHandoff) {
        developHandoffTripRef.current = false;
      }
      if (alsoSwitchToDevelop) {
        s.handleStudioWorkspaceChange('develop');
      }
      const sid = libraryWorkspace.sessionId;
      const aid = String(assetId ?? '');
      if (aid) {
        setDevelopOpfsCaptureAssetId(aid);
      }
      if (!aid) {
        return;
      }
      const fastReq = nextImageWorkerRequestId();
      developFastPreviewRequestIdRef.current = fastReq;

      const catAssets = libraryWorkspace.assets ?? [];
      const assetRow = catAssets.find((a) => String(a?.id) === aid);
      const catalogAssetMeta =
        assetRow != null
          ? {
              sourceName: assetRow.sourceName,
              sourceLastModified: assetRow.sourceLastModified,
              orientationTag:
                Number.isFinite(Number(assetRow.exif?.orientationTag)) &&
                Number(assetRow.exif?.orientationTag) >= 1 &&
                Number(assetRow.exif?.orientationTag) <= 8
                  ? Math.round(Number(assetRow.exif.orientationTag))
                  : null,
            }
          : null;

      /** Proxy-first: OPFS standard/embedded — bez równoległego odczytu source.bin (blokował UI ~10 s). */
      const previewP = scheduleOpfsDamPreviewDecode({
        sessionId: sid,
        assetId: aid,
        priority: getDevelopFastPreviewPriority(),
        requestId: fastReq,
        catalogAssetMeta,
        skipSourceBin: true,
      }).catch(() => null);
      let sourceReq = '';
      try {
        let fast = await previewP;
        if (loadGen !== developCatalogLoadGenRef.current) {
          fast?.bitmap?.close?.();
          return;
        }

        let resolvedFile = null;
        if (!fast) {
          sourceReq = nextImageWorkerRequestId();
          developCatalogSourceRequestIdRef.current = sourceReq;
          resolvedFile = await resolveAssetFile(assetId, { requestId: sourceReq }).catch(() => null);
          if (resolvedFile instanceof File && loadGen === developCatalogLoadGenRef.current) {
            const { writeRawEmbeddedThumbnailIfPossible } = await import('./dam/filmLabEmbeddedPreviewQueue.js');
            const { ok } = await writeRawEmbeddedThumbnailIfPossible(sid, aid, resolvedFile);
            if (ok && loadGen === developCatalogLoadGenRef.current) {
              fast = await scheduleOpfsDamPreviewDecode({
                sessionId: sid,
                assetId: aid,
                priority: getDevelopFastPreviewPriority(),
                requestId: nextImageWorkerRequestId(),
                catalogAssetMeta,
                skipSourceBin: true,
              }).catch(() => null);
            }
          }
        }

        if (fast?.bitmap) {
          /** Proxy JPEG: piksele „as stored”, orientacja 1–8 z workera (TIFF/DNG + EXIF osadzonego JPEG). */
          s.setDevelopFastPreviewExifOrientation(
            Number.isFinite(Number(fast?.exifOrientation)) &&
              Number(fast.exifOrientation) >= 1 &&
              Number(fast.exifOrientation) <= 8
              ? Math.floor(Number(fast.exifOrientation))
              : 1
          );
          s.setDevelopFastPreviewBitmap((prev) => {
            if (prev && prev !== fast.bitmap) {
              prev.close?.();
            }
            return fast.bitmap;
          });
        } else {
          s.setDevelopFastPreviewExifOrientation(1);
        }

        if (!resolvedFile) {
          sourceReq = nextImageWorkerRequestId();
          developCatalogSourceRequestIdRef.current = sourceReq;
          resolvedFile = await resolveAssetFile(assetId, { requestId: sourceReq }).catch((err) => {
            if (err && typeof err === 'object' && err.name === 'AbortError') {
              return null;
            }
            console.warn('[FilmLab] resolveAssetFile', err);
            return null;
          });
        }
        
        const file = resolvedFile;
        if (loadGen !== developCatalogLoadGenRef.current) {
          return;
        }
        if (file instanceof File) {
          queueMicrotask(() => {
            if (loadGen === developCatalogLoadGenRef.current) {
              s.applyUploadedSource(file, {
                targetPanel: 'basic',
                preserveLook: false,
                skipDevelopCatalogLoadGen: true,
              });
              // Fast proxy will stay on screen because we no longer clear it here.
              // It should ideally be cleared by observing engine state (e.g. renderVersion),
              // but for now keeping it prevents the 10s black screen.
            }
          });
        }
      } finally {
        if (developFastPreviewRequestIdRef.current === fastReq) {
          developFastPreviewRequestIdRef.current = '';
        }
        if (sourceReq && developCatalogSourceRequestIdRef.current === sourceReq) {
          developCatalogSourceRequestIdRef.current = '';
        }
      }
    },
    [
      libraryWorkspace.assets,
      libraryWorkspace.sessionId,
      resolveAssetFile,
      s.applyUploadedSource,
      s.handleStudioWorkspaceChange,
      s.setDevelopFastPreviewBitmap,
      s.setDevelopFastPreviewExifOrientation,
      setDevelopOpfsCaptureAssetId,
    ]
  );

  const handleFileUpload = useCallback(
    (event) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = '';
      if (!files.length) {
        return;
      }
      importCatalogFiles(files);
      s.applyUploadedSource(files[0], { targetPanel: 'basic' });
    },
    [importCatalogFiles, s.applyUploadedSource]
  );

  const openLibraryAssetInDevelop = useCallback(
    (assetId) => {
      const id = String(assetId ?? '');
      if (id) {
        setDevelopOpfsCaptureAssetId(id);
      }
      /** Zakładka „Edycja” natychmiast; ładowanie preview może nadgonić z opóźnieniem. */
      s.handleStudioWorkspaceChange('develop');
      queueMicrotask(() => {
        startTransition(() => {
          void loadDevelopAssetFromCatalog(id, { alsoSwitchToDevelop: false });
        });
      });
    },
    [loadDevelopAssetFromCatalog, s.handleStudioWorkspaceChange]
  );

  const handleFilmstripPickAsset = useCallback(
    (assetId, modifiers, orderedIds) => {
      pickAsset(assetId, modifiers, orderedIds);
      const m = modifiers || {};
      if (m.shiftKey || m.metaKey || m.ctrlKey) {
        return;
      }
      void loadDevelopAssetFromCatalog(assetId, { alsoSwitchToDevelop: false });
    },
    [pickAsset, loadDevelopAssetFromCatalog]
  );

  const revokeAndClearImage = useCallback(() => {
    bumpDevelopCatalogLoadInvalidation();
    setDevelopOpfsCaptureAssetId(null);
    s.setDevelopFastPreviewBitmap((prev) => {
      prev?.close?.();
      return null;
    });
    s.setDevelopFastPreviewExifOrientation(1);
    s.setDevelopSmartPreviewBitmap((prev) => {
      prev?.close?.();
      return null;
    });
    s.setUploadedFile(null);
    s.setImageUrl((currentUrl) => {
      if (typeof currentUrl === 'string' && currentUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentUrl);
      }
      return null;
    });
  }, [
    bumpDevelopCatalogLoadInvalidation,
    s.setDevelopFastPreviewBitmap,
    s.setDevelopFastPreviewExifOrientation,
    s.setDevelopSmartPreviewBitmap,
    s.setUploadedFile,
    s.setImageUrl,
  ]);

  const currentUploadedAssetId = useMemo(() => {
    const uf = s.uploadedFile;
    if (!(uf instanceof File)) {
      return null;
    }
    const assets = libraryWorkspace.assets ?? [];
    const byTriple = assets.find(
      (a) =>
        String(a?.sourceName ?? '') === uf.name &&
        Number(a?.sourceSize) === uf.size &&
        Number(a?.sourceLastModified) === uf.lastModified
    );
    if (byTriple?.id) {
      return String(byTriple.id);
    }
    const bySize = assets.find(
      (a) => String(a?.sourceName ?? '') === uf.name && Number(a?.sourceSize) === uf.size
    );
    return bySize?.id ? String(bySize.id) : null;
  }, [s.uploadedFile, libraryWorkspace.assets]);

  /**
   * Develop (Lightroom): „Active / Target Photo” — jednorazowy auto-handoff po wejściu / zmianie celu.
   * Przy `!hasImage` ten sam `tid` nie uruchamia ponownie spirali (circuit `developHandoffTripRef`).
   */
  useEffect(() => {
    if (s.studioWorkspace !== 'develop') {
      developHandoffTripRef.current = false;
      developHandoffTargetTidRef.current = null;
      return;
    }
    const catAssets = libraryWorkspace.assets ?? [];
    if (catAssets.length === 0) {
      return;
    }
    const tid = resolveFilmLabDevelopTargetAssetId({
      primaryAssetId: libraryWorkspace.primaryAssetId,
      selectedAssetIds: libraryWorkspace.selectedAssetIds,
      catalogAssets: catAssets,
      filteredAssets: libraryWorkspace.filteredAssets,
    });
    if (tid == null || tid === '') {
      return;
    }
    if (developHandoffTargetTidRef.current !== tid) {
      developHandoffTargetTidRef.current = tid;
      developHandoffTripRef.current = false;
    }
    const currentId = developOpfsCaptureAssetId ?? currentUploadedAssetId;
    const shouldHandoff =
      !s.hasImage || (currentId != null && String(currentId) !== tid);
    if (!shouldHandoff) {
      developHandoffTripRef.current = false;
      return;
    }
    if (developHandoffTripRef.current) {
      return;
    }
    developHandoffTripRef.current = true;
    void loadDevelopAssetFromCatalog(tid, {
      alsoSwitchToDevelop: false,
      fromAutoHandoff: true,
    });
  }, [
    s.studioWorkspace,
    s.hasImage,
    libraryWorkspace.assets,
    libraryWorkspace.primaryAssetId,
    libraryWorkspace.selectedAssetIds,
    libraryWorkspace.filteredAssets,
    developOpfsCaptureAssetId,
    currentUploadedAssetId,
    loadDevelopAssetFromCatalog,
  ]);

  /** Powrót Biblioteka ← Edycja: zsynchronizuj zaznaczenie z edytowanym plikiem. */
  const prevStudioWorkspaceRef = useRef(null);
  useEffect(() => {
    const prev = prevStudioWorkspaceRef.current;
    const next = s.studioWorkspace;
    if (prev === next) {
      return;
    }
    prevStudioWorkspaceRef.current = next;

    if (next === 'library' && prev === 'develop') {
      const developId = developOpfsCaptureAssetId ?? currentUploadedAssetId;
      if (!developId) {
        return;
      }
      const order = (libraryWorkspace.filteredAssets ?? [])
        .map((a) => String(a?.id ?? ''))
        .filter(Boolean);
      pickAsset(String(developId), {}, order.length > 0 ? order : [String(developId)]);
    }
  }, [
    s.studioWorkspace,
    libraryWorkspace.filteredAssets,
    pickAsset,
    developOpfsCaptureAssetId,
    currentUploadedAssetId,
  ]);

  const developOpfsThumbnailTargetId = developOpfsCaptureAssetId ?? currentUploadedAssetId;

  useFilmLabDevelopOpfsThumbnailCapture({
    studioWorkspace: s.studioWorkspace,
    canvasRef: s.canvasRef,
    sessionId: libraryWorkspace.sessionId,
    assetId: developOpfsThumbnailTargetId,
    hasImage: s.hasImage,
    bumpPreviewEpoch: libraryWorkspace.bumpPreviewEpoch,
    patchAssetDamPreviewTier: libraryWorkspace.patchAssetDamPreviewTier,
    exifRotationDegrees: Number(s.exifMeta?.orientationTransform?.rotationDegrees ?? 0) || 0,
    renderVersion: s.renderVersion ?? 0,
    isAdjusting: Boolean(s.isAdjusting),
  });

  useFilmLabDevelopSmartPreviewBitmap({
    studioWorkspace: s.studioWorkspace,
    hasImage: s.hasImage,
    sessionId: libraryWorkspace.sessionId,
    assetId: developOpfsThumbnailTargetId,
    previewEpoch: libraryWorkspace.previewEpoch,
    isPixelPeepZoom: Boolean(s.isPixelPeepZoom),
    isAdjusting: Boolean(s.isAdjusting),
    setDevelopSmartPreviewBitmap: s.setDevelopSmartPreviewBitmap,
  });

  /**
   * Po pierwszym rzucie silnika zdejmij warstwę DAM JPEG (z-index nad canvasem), żeby nie „mazać”
   * ostrego WebGL/CPU nad działającym pipeline — proxy-first bez stałego rozmytego overlay.
   */
  useEffect(() => {
    if (s.studioWorkspace !== 'develop') {
      return undefined;
    }
    if (!s.developFastPreviewBitmap) {
      return undefined;
    }
    if (!s.hasImage) {
      return undefined;
    }
    if ((s.renderVersion ?? 0) < 1) {
      return undefined;
    }
    const rafHandles = { outer: 0, inner: 0 };
    const run = () => {
      s.setDevelopFastPreviewBitmap((prev) => {
        if (prev && typeof prev.close === 'function') {
          prev.close();
        }
        return null;
      });
    };
    rafHandles.outer = requestAnimationFrame(() => {
      rafHandles.inner = requestAnimationFrame(run);
    });
    return () => {
      cancelAnimationFrame(rafHandles.outer);
      cancelAnimationFrame(rafHandles.inner);
    };
  }, [
    s.studioWorkspace,
    s.hasImage,
    s.renderVersion,
    s.developFastPreviewBitmap,
    s.setDevelopFastPreviewBitmap,
  ]);

  const clearLibraryAndWorkbench = useCallback(async () => {
    revokeAndClearImage();
    await clearEntireCatalog();
  }, [clearEntireCatalog, revokeAndClearImage]);

  const removeSelectedFromLibrary = useCallback(() => {
    const ids = libraryWorkspace.selectedAssetIds.map(String);
    if (ids.length === 0) {
      return;
    }
    const kill = new Set(ids);
    if (currentUploadedAssetId && kill.has(currentUploadedAssetId)) {
      revokeAndClearImage();
    }
    removeCatalogAssets(ids);
  }, [
    libraryWorkspace.selectedAssetIds,
    currentUploadedAssetId,
    removeCatalogAssets,
    revokeAndClearImage,
  ]);

  return {
    shellRef: s.shellRef,
    viewMode: s.viewMode,
    isPreviewFullMode: s.isPreviewFullMode,
    bundleArgs: buildFilmLabShellContainerBundleArgs({
      ...s,
      handleFileUpload,
      onFilmstripPickAsset: handleFilmstripPickAsset,
      libraryWorkspace: {
        ...libraryWorkspaceRest,
        /** Jawne — żeby bundel zawsze miał listy i pick (rest po destructuringu bywał kompletny, ale i tak pinujemy). */
        assets: libraryWorkspace.assets,
        pickAsset: libraryWorkspace.pickAsset,
        importCatalogFiles,
        resolveAssetFile,
        clearEntireCatalog,
        removeCatalogAssets,
        onOpenAssetInDevelop: openLibraryAssetInDevelop,
        onClearLibrary: clearLibraryAndWorkbench,
        onRemoveSelectedFromLibrary: removeSelectedFromLibrary,
      },
    }),
  };
}
