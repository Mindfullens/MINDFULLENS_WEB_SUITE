import { useEffect, useMemo, useState } from 'react';
import {
  loadFilmLabCatalogDocument,
  normalizeLoadedFilmLabCatalogDocument,
  saveFilmLabCatalogDocument,
} from '../engine/filmLabCatalogProPersist.js';
import {
  buildCatalogProDocument,
  withCatalogProFingerprint,
} from './catalogPro/filmLabCatalogProDocument.js';
import { mergeCatalogDocumentWithPipelineSnapshot } from './catalogPro/filmLabCatalogPipelineMerge.js';

function buildCatalogSessionId(uploadedFile) {
  if (!(typeof File !== 'undefined' && uploadedFile instanceof File)) {
    return 'active-session';
  }
  return `${uploadedFile.name}:${uploadedFile.size}:${uploadedFile.lastModified}`;
}

function buildBaseCatalogDocument({ uploadedFile, hasImage }) {
  return withCatalogProFingerprint(
    buildCatalogProDocument({
      sessionId: buildCatalogSessionId(uploadedFile),
      sourceFileMeta:
        typeof File !== 'undefined' && uploadedFile instanceof File
          ? {
              name: uploadedFile.name,
              type: uploadedFile.type,
              size: uploadedFile.size,
              lastModified: uploadedFile.lastModified,
            }
          : null,
      hasDecodedFrame: Boolean(hasImage),
      activeCollectionId: 'inbox',
    })
  );
}

export function useFilmLabCatalogProLibraryWorkspace({ uploadedFile, hasImage, exifMeta, imageMeta }) {
  const [catalogDocument, setCatalogDocument] = useState(() =>
    buildBaseCatalogDocument({ uploadedFile, hasImage })
  );
  const [activeCollectionId, setActiveCollectionId] = useState('inbox');

  const sessionId = useMemo(() => buildCatalogSessionId(uploadedFile), [uploadedFile]);

  const pipelineEnrichmentKey = useMemo(
    () =>
      JSON.stringify({
        sid: sessionId,
        hi: Boolean(hasImage),
        w: imageMeta?.width ?? null,
        h: imageMeta?.height ?? null,
        pw: imageMeta?.previewWidth ?? null,
        ph: imageMeta?.previewHeight ?? null,
        iso: exifMeta?.iso ?? null,
        cm: exifMeta?.cameraMake ?? null,
        cmod: exifMeta?.cameraModel ?? null,
        lens: exifMeta?.lensModel ?? null,
        shut: exifMeta?.shutter ?? null,
        ap: exifMeta?.aperture ?? null,
        fl: exifMeta?.focalLength ?? null,
        dt: exifMeta?.dateTaken ?? null,
        ori: exifMeta?.orientationLabel ?? null,
        fn: uploadedFile?.name ?? null,
        fs: uploadedFile?.size ?? null,
        fm: uploadedFile?.lastModified ?? null,
      }),
    [sessionId, hasImage, imageMeta, exifMeta, uploadedFile]
  );

  useEffect(() => {
    let cancelled = false;
    const fallbackDoc = buildBaseCatalogDocument({ uploadedFile, hasImage });

    (async () => {
      const raw = await loadFilmLabCatalogDocument({ sessionId });
      if (cancelled) {
        return;
      }
      const normalized = normalizeLoadedFilmLabCatalogDocument(raw);
      if (normalized?.document) {
        setCatalogDocument(withCatalogProFingerprint(normalized.document));
        setActiveCollectionId(String(normalized.document?.meta?.activeCollectionId ?? 'inbox'));
        return;
      }
      setCatalogDocument(fallbackDoc);
      setActiveCollectionId(String(fallbackDoc?.meta?.activeCollectionId ?? 'inbox'));
      void saveFilmLabCatalogDocument(fallbackDoc, { sessionId });
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, uploadedFile, hasImage]);

  useEffect(() => {
    setCatalogDocument((prev) => {
      const merged = mergeCatalogDocumentWithPipelineSnapshot(prev, {
        uploadedFile,
        hasImage,
        exifMeta,
        imageMeta,
      });
      if (!merged) {
        return prev;
      }
      const next = withCatalogProFingerprint(merged);
      void saveFilmLabCatalogDocument(next, { sessionId });
      return next;
    });
  }, [pipelineEnrichmentKey, uploadedFile, hasImage, exifMeta, imageMeta, sessionId]);

  const collections = Array.isArray(catalogDocument?.collections) ? catalogDocument.collections : [];
  const assets = Array.isArray(catalogDocument?.assets) ? catalogDocument.assets : [];

  return {
    sessionId,
    catalogDocument,
    collections,
    assets,
    activeCollectionId,
    setActiveCollectionId,
  };
}
