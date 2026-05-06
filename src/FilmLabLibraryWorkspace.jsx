import { Fragment, useCallback, useEffect, useMemo, useRef, useState, startTransition } from 'react';
import FilmLabThumbCanvas from './filmLab/FilmLabThumbCanvas.jsx';
import FilmLabFilmstripCanvas from './filmLab/FilmLabFilmstripCanvas.jsx';
import {
  createFilmLabImageBitmap,
  FILMLAB_CREATE_IMAGE_BITMAP_ORIENTATION_NONE,
} from './filmLab/filmLabImageBitmapOptions.js';
import { useFilmLabLibraryLazyThumbs } from './filmLab/useFilmLabLibraryLazyThumbs.js';
import { useI18n } from './i18n';

const noop = () => {};

export default function FilmLabLibraryWorkspace({
  collections: _collections = [],
  assets = [],
  activeCollectionId: _activeCollectionId = 'inbox',
  onCollectionChange: _onCollectionChange,
  studioWorkspace = 'library',
  sessionId = 'active-session',
  previewEpoch = 0,
  updateCatalogAsset,
  libraryFilterQuery: _libraryFilterQuery = '',
  setLibraryFilterQuery: _setLibraryFilterQuery = noop,
  filteredAssets = [],
  primaryAssetId = null,
  selectedAssetIds = [],
  pickAsset = noop,
  selectionAnchorRef,
  fileInputRef,
  onOpenAssetInDevelop = noop,
  isMetadataPanelOpen = false,
  onClearLibrary = noop,
  onRemoveSelectedFromLibrary = noop,
  onFilmstripPickAsset = null,
  onPrioritizeRawEmbeddedExtract = noop,
}) {
  const { t } = useI18n();
  const viewportRootRef = useRef(null);
  const developOpeningTimerRef = useRef(null);
  const [collageExportBusy, setCollageExportBusy] = useState(false);
  const [libraryActionBusy, setLibraryActionBusy] = useState(false);
  /** Podwójny klik → Edycja: krótki stan „ładuje się” na kafelku. */
  const [developOpeningAssetId, setDevelopOpeningAssetId] = useState(null);

  const assetsForThumbs = useMemo(() => {
    const byId = new Map(assets.map((a) => [String(a?.id ?? ''), a]));
    const seen = new Set();
    const out = [];
    for (const a of filteredAssets) {
      const id = String(a?.id ?? '');
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      out.push(a);
    }
    for (const sid of selectedAssetIds) {
      const id = String(sid);
      if (seen.has(id)) {
        continue;
      }
      const a = byId.get(id);
      if (a) {
        seen.add(id);
        out.push(a);
      }
    }
    return out;
  }, [assets, filteredAssets, selectedAssetIds]);

  const thumbLoadKey = useMemo(
    () => assetsForThumbs.map((a) => String(a?.id ?? '')).join(','),
    [assetsForThumbs]
  );

  /**
   * Jednorazowy „kasz” RAM miniatury primary po powrocie z Develop → Biblioteka (nie przy każdym
   * `previewEpoch++` z kolejki embedded — to powodowało miganie pierwszego zdjęcia).
   */
  const [thumbRamInvalidateNonce, setThumbRamInvalidateNonce] = useState(0);
  const prevStudioWorkspaceRef = useRef(studioWorkspace);
  useEffect(() => {
    const prev = prevStudioWorkspaceRef.current;
    if (prev !== 'library' && studioWorkspace === 'library') {
      setThumbRamInvalidateNonce((n) => n + 1);
    }
    prevStudioWorkspaceRef.current = studioWorkspace;
  }, [studioWorkspace]);

  const { thumbBitmaps, thumbFailedIds, prefetchThumb } = useFilmLabLibraryLazyThumbs({
    sessionId,
    previewEpoch,
    assetsForThumbs,
    viewportRootRef,
    /**
     * Siatka zostaje zamontowana (ukryta) w Edycji — `enabled: false` zatrzymuje Worker/OPFS dla
     * miniatur tła, żeby priorytet L0 mógł iść w Develop (pool w `filmLabImageWorkerBridge`).
     */
    enabled: studioWorkspace === 'library',
    layoutObserverKey: thumbLoadKey,
    thumbRamInvalidateNonce,
    thumbRamInvalidateAssetId: primaryAssetId,
    onPrioritizeRawEmbeddedExtract,
  });

  const showCollageLayout = selectedAssetIds.length >= 2;
  const pickOrder = useMemo(() => {
    const base = filteredAssets.map((a) => String(a?.id ?? '')).filter(Boolean);
    if (!showCollageLayout) {
      return base;
    }
    const seen = new Set(base);
    const out = [...base];
    for (const sid of selectedAssetIds) {
      const s = String(sid);
      if (!seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
    return out;
  }, [filteredAssets, showCollageLayout, selectedAssetIds]);

  const filmstripOrder = useMemo(
    () => assetsForThumbs.map((a) => String(a?.id ?? '')).filter(Boolean),
    [assetsForThumbs]
  );

  const handleFilmstripPick = useCallback(
    (assetId, modifiers) => {
      if (typeof onFilmstripPickAsset === 'function') {
        onFilmstripPickAsset(assetId, modifiers, filmstripOrder);
        return;
      }
      pickAsset(assetId, modifiers, filmstripOrder);
    },
    [onFilmstripPickAsset, pickAsset, filmstripOrder]
  );

  useEffect(() => {
    if (studioWorkspace !== 'library') {
      setDevelopOpeningAssetId(null);
    }
  }, [studioWorkspace]);

  useEffect(
    () => () => {
      if (developOpeningTimerRef.current != null) {
        window.clearTimeout(developOpeningTimerRef.current);
      }
    },
    []
  );

  const handleThumbSelectClick = useCallback(
    (ev, id) => {
      const { shiftKey, metaKey, ctrlKey } = ev;
      queueMicrotask(() => {
        prefetchThumb(id);
      });
      pickAsset(id, { shiftKey, metaKey, ctrlKey }, pickOrder);
    },
    [pickAsset, pickOrder, prefetchThumb]
  );

  const handleThumbOpenDevelopDoubleClick = useCallback(
    (ev, id) => {
      ev.preventDefault();
      if (developOpeningTimerRef.current != null) {
        window.clearTimeout(developOpeningTimerRef.current);
      }
      setDevelopOpeningAssetId(id);
      developOpeningTimerRef.current = window.setTimeout(() => {
        developOpeningTimerRef.current = null;
        setDevelopOpeningAssetId((cur) => (cur === id ? null : cur));
      }, 1000);
      startTransition(() => {
        onOpenAssetInDevelop(id);
      });
    },
    [onOpenAssetInDevelop]
  );

  const handleCollageExport = useCallback(async () => {
    if (selectedAssetIds.length < 2) {
      return;
    }
    setCollageExportBusy(true);
    try {
      const { readDamPreviewBlob } = await import('./filmLab/opfs/filmLabOpfsPreviewCache.js');
      const maxLong = 1600;
      const ids = [...selectedAssetIds];
      const n = ids.length;
      const cols = Math.ceil(Math.sqrt(n));
      const rows = Math.ceil(n / cols);
      const cell = Math.max(72, Math.floor(maxLong / cols));
      const canvas = document.createElement('canvas');
      canvas.width = cell * cols;
      canvas.height = cell * rows;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }
      ctx.fillStyle = '#0a090e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < ids.length; i += 1) {
        const assetId = String(ids[i]);
        let blob = await readDamPreviewBlob(sessionId, assetId, 'standard');
        if (!blob || blob.size < 1) {
          blob = await readDamPreviewBlob(sessionId, assetId, 'embedded');
        }
        if (!blob || blob.size < 1) {
          continue;
        }
        let bmp;
        try {
          bmp = await createFilmLabImageBitmap(blob, FILMLAB_CREATE_IMAGE_BITMAP_ORIENTATION_NONE);
        } catch {
          continue;
        }
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * cell;
        const y = row * cell;
        const scale = Math.min(cell / bmp.width, cell / bmp.height);
        const dw = bmp.width * scale;
        const dh = bmp.height * scale;
        const dx = x + (cell - dw) / 2;
        const dy = y + (cell - dh) / 2;
        ctx.drawImage(bmp, dx, dy, dw, dh);
        if (bmp && typeof bmp.close === 'function') {
          bmp.close();
        }
      }
      await new Promise((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (!b) {
              reject(new Error('collage'));
              return;
            }
            const url = URL.createObjectURL(b);
            const a = document.createElement('a');
            a.href = url;
            a.download = `film-lab-collage-${Date.now()}.jpg`;
            a.click();
            URL.revokeObjectURL(url);
            resolve();
          },
          'image/jpeg',
          0.82
        );
      });
    } finally {
      setCollageExportBusy(false);
    }
  }, [selectedAssetIds, sessionId]);

  const runClearLibrary = useCallback(() => {
    if (!window.confirm(t('workspace.library.confirmClear'))) {
      return;
    }
    setLibraryActionBusy(true);
    void Promise.resolve(onClearLibrary?.()).finally(() => {
      setLibraryActionBusy(false);
    });
  }, [onClearLibrary, t]);

  const runRemoveSelected = useCallback(() => {
    if (selectedAssetIds.length === 0) {
      return;
    }
    setLibraryActionBusy(true);
    void Promise.resolve(onRemoveSelectedFromLibrary?.()).finally(() => {
      setLibraryActionBusy(false);
    });
  }, [onRemoveSelectedFromLibrary, selectedAssetIds.length]);

  const selectedAsset =
    primaryAssetId != null
      ? assets.find((a) => String(a?.id ?? '') === String(primaryAssetId)) ?? null
      : null;

  useEffect(() => {
    if (studioWorkspace !== 'library') {
      return undefined;
    }

    const onKeyDown = (e) => {
      if (e.defaultPrevented) {
        return;
      }
      const tgt = e.target;
      if (tgt instanceof HTMLInputElement || tgt instanceof HTMLTextAreaElement || tgt?.isContentEditable) {
        return;
      }

      if (pickOrder.length === 0) {
        return;
      }

      const primary = primaryAssetId != null ? String(primaryAssetId) : pickOrder[0];
      const pi = pickOrder.indexOf(primary);

      const applyRating = (rating) => {
        if (!primary || typeof updateCatalogAsset !== 'function') {
          return;
        }
        e.preventDefault();
        updateCatalogAsset(primary, { rating });
      };

      const toggleReject = () => {
        if (!primary || typeof updateCatalogAsset !== 'function') {
          return;
        }
        e.preventDefault();
        const asset = assets.find((a) => String(a?.id) === primary);
        const nextPick = asset?.pick === 'rejected' ? 'unreviewed' : 'rejected';
        updateCatalogAsset(primary, { pick: nextPick });
      };

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (pi < 0) {
          return;
        }
        e.preventDefault();
        const delta = e.key === 'ArrowLeft' ? -1 : 1;
        const ni = Math.max(0, Math.min(pickOrder.length - 1, pi + delta));
        const nid = pickOrder[ni];
        const anchorEl = selectionAnchorRef?.current;
        if (e.shiftKey && anchorEl != null) {
          pickAsset(nid, { shiftKey: true, metaKey: false, ctrlKey: false }, pickOrder);
          return;
        }
        pickAsset(nid, { metaKey: false, ctrlKey: false, shiftKey: false }, pickOrder);
        return;
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey && /^[1-5]$/.test(e.key)) {
        applyRating(Number(e.key));
        return;
      }

      if (!e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'x' || e.key === 'X')) {
        toggleReject();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [
    studioWorkspace,
    pickOrder,
    primaryAssetId,
    assets,
    updateCatalogAsset,
    pickAsset,
    selectionAnchorRef,
  ]);

  return (
    <section className="film-lab-library-workspace" aria-label={t('workspace.library.title')}>
      <div className="film-lab-library-head">
        <div className="film-lab-library-head-text">
          <h2 className="film-lab-library-title">{t('workspace.library.title')}</h2>
        </div>
        {selectedAssetIds.length >= 2 ? (
          <button
            type="button"
            className="film-lab-library-collage-export-top"
            disabled={collageExportBusy}
            onClick={() => void handleCollageExport()}
          >
            {collageExportBusy ? t('workspace.library.collageExportBusy') : t('workspace.library.collageExport')}
          </button>
        ) : null}
      </div>

      <div className="film-lab-library-toolbar film-lab-library-toolbar--minimal">
        {assets.length > 0 ? (
          <>
            <button
              type="button"
              className="film-lab-library-add-more"
              disabled={libraryActionBusy}
              onClick={() => fileInputRef?.current?.click()}
            >
              {t('workspace.library.addMore')}
            </button>
            <button
              type="button"
              className="film-lab-library-remove-selected"
              disabled={libraryActionBusy || selectedAssetIds.length === 0}
              onClick={() => runRemoveSelected()}
            >
              {t('workspace.library.removeSelected')}
            </button>
            <button
              type="button"
              className="film-lab-library-clear-all"
              disabled={libraryActionBusy}
              onClick={() => runClearLibrary()}
            >
              {t('workspace.library.clearLibrary')}
            </button>
          </>
        ) : null}
      </div>

      <div
        className={`film-lab-library-main${isMetadataPanelOpen ? '' : ' film-lab-library-main--meta-hidden'}`}
      >
        <div
          ref={viewportRootRef}
          className={`film-lab-library-grid-wrap${filteredAssets.length === 0 && assets.length === 0 ? ' film-lab-library-grid-wrap--cold' : ''}`}
        >
          {filteredAssets.length > 0 ? (
            showCollageLayout ? (
              <div className="film-lab-library-collage" aria-label={t('workspace.library.collageAria')}>
                {selectedAssetIds.map((aid) => {
                  const asset = assets.find((a) => String(a?.id) === String(aid));
                  if (!asset) {
                    return null;
                  }
                  const id = String(asset?.id ?? '');
                  const thumbEntry = thumbBitmaps.get(id);
                  const thumbWebgpuTerminal = thumbEntry?.thumbStatus === 'webgpu-required';
                  const thumbRawPreviewTimeout = thumbEntry?.thumbStatus === 'raw-preview-timeout';
                  const thumbReactGuard = thumbEntry?.thumbStatus === 'react-thumb-guard-timeout';
                  const thumbAwaitingTier = thumbEntry?.thumbStatus === 'awaiting-embedded';
                  const thumbLoading =
                    !thumbEntry?.bitmap &&
                    !thumbFailedIds.has(id) &&
                    !thumbWebgpuTerminal &&
                    (thumbAwaitingTier || !thumbEntry);
                  return (
                    <div key={id} className="film-lab-library-collage-cell" data-asset-thumb-id={id}>
                      <button
                        type="button"
                        className="film-lab-library-collage-card"
                        onClick={(ev) => handleThumbSelectClick(ev, id)}
                        onDoubleClick={(ev) => handleThumbOpenDevelopDoubleClick(ev, id)}
                      >
                        <div
                          className={`film-lab-library-thumb${thumbFailedIds.has(id) && !thumbRawPreviewTimeout && !thumbReactGuard ? ' film-lab-library-thumb--fail' : ''}${thumbRawPreviewTimeout || thumbReactGuard ? ' film-lab-library-thumb--raw-timeout' : ''}${thumbWebgpuTerminal ? ' film-lab-library-thumb--raw-ready' : ''}${thumbLoading ? ' film-lab-library-thumb--loading' : ''}${developOpeningAssetId === id ? ' film-lab-library-thumb--opening-develop' : ''}`}
                          aria-hidden
                        >
                          {thumbEntry?.bitmap ? (
                            <FilmLabThumbCanvas
                              assetId={id}
                              bitmap={thumbEntry.bitmap}
                              exifOrientation={thumbEntry.exifOrientation ?? 1}
                              className="film-lab-library-thumb-img"
                            />
                          ) : (
                            <span
                              className={`film-lab-library-thumb-placeholder${thumbWebgpuTerminal ? ' film-lab-library-thumb-placeholder--raw' : ''}`}
                            >
                              {thumbWebgpuTerminal ? (
                                <>
                                  <span className="film-lab-library-thumb-raw-icon" aria-hidden />
                                  <span className="film-lab-library-thumb-raw-label">
                                    {t('workspace.library.thumbRawReady')}
                                  </span>
                                </>
                              ) : thumbReactGuard ? (
                                t('workspace.library.thumbPreviewGuard')
                              ) : thumbRawPreviewTimeout ? (
                                t('workspace.library.thumbRawPreviewError')
                              ) : thumbFailedIds.has(id) ? (
                                t('workspace.library.thumbDecodeError')
                              ) : thumbAwaitingTier ? (
                                t('workspace.library.thumbAwaitingExtract')
                              ) : (
                                t('workspace.library.thumbPlaceholder')
                              )}
                            </span>
                          )}
                        </div>
                        <span className="film-lab-library-collage-name">{String(asset?.sourceName ?? '—')}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
            <ul className="film-lab-library-grid">
              <li key="__import_lead__" className="film-lab-library-grid-lead">
                <button
                  type="button"
                  className="film-lab-library-import-lead"
                  onClick={() => fileInputRef?.current?.click()}
                >
                  <span className="film-lab-library-import-lead-icon" aria-hidden>
                    +
                  </span>
                  <span className="film-lab-library-import-lead-title">{t('workspace.library.importMoreTile')}</span>
                  <span className="film-lab-library-import-lead-sub">{t('workspace.library.importMoreSub')}</span>
                </button>
              </li>
              {filteredAssets.map((asset) => {
                const id = String(asset?.id ?? '');
                const active = id === String(primaryAssetId ?? '');
                const multi = selectedAssetIds.includes(id);
                const thumbEntry = thumbBitmaps.get(id);
                const thumbWebgpuTerminal = thumbEntry?.thumbStatus === 'webgpu-required';
                const thumbRawPreviewTimeout = thumbEntry?.thumbStatus === 'raw-preview-timeout';
                const thumbReactGuard = thumbEntry?.thumbStatus === 'react-thumb-guard-timeout';
                const thumbAwaitingTier = thumbEntry?.thumbStatus === 'awaiting-embedded';
                const thumbLoading =
                  !thumbEntry?.bitmap &&
                  !thumbFailedIds.has(id) &&
                  !thumbWebgpuTerminal &&
                  (thumbAwaitingTier || !thumbEntry);
                return (
                  <li key={id} data-asset-thumb-id={id}>
                    <button
                      type="button"
                      className={`film-lab-library-card${active ? ' active' : ''}${multi ? ' multi' : ''}`}
                      onClick={(ev) => handleThumbSelectClick(ev, id)}
                      onDoubleClick={(ev) => handleThumbOpenDevelopDoubleClick(ev, id)}
                    >
                      <div
                        className={`film-lab-library-thumb${thumbFailedIds.has(id) && !thumbRawPreviewTimeout && !thumbReactGuard ? ' film-lab-library-thumb--fail' : ''}${thumbRawPreviewTimeout || thumbReactGuard ? ' film-lab-library-thumb--raw-timeout' : ''}${thumbWebgpuTerminal ? ' film-lab-library-thumb--raw-ready' : ''}${thumbLoading ? ' film-lab-library-thumb--loading' : ''}${developOpeningAssetId === id ? ' film-lab-library-thumb--opening-develop' : ''}`}
                        aria-hidden
                      >
                        {thumbEntry?.bitmap ? (
                          <FilmLabThumbCanvas
                            assetId={id}
                            bitmap={thumbEntry.bitmap}
                            exifOrientation={thumbEntry.exifOrientation ?? 1}
                            className="film-lab-library-thumb-img"
                          />
                        ) : (
                          <span
                            className={`film-lab-library-thumb-placeholder${thumbWebgpuTerminal ? ' film-lab-library-thumb-placeholder--raw' : ''}`}
                          >
                            {thumbWebgpuTerminal ? (
                              <>
                                <span className="film-lab-library-thumb-raw-icon" aria-hidden />
                                <span className="film-lab-library-thumb-raw-label">
                                  {t('workspace.library.thumbRawReady')}
                                </span>
                              </>
                            ) : thumbReactGuard ? (
                              t('workspace.library.thumbPreviewGuard')
                            ) : thumbRawPreviewTimeout ? (
                              t('workspace.library.thumbRawPreviewError')
                            ) : thumbFailedIds.has(id) ? (
                              t('workspace.library.thumbDecodeError')
                            ) : thumbAwaitingTier ? (
                              t('workspace.library.thumbAwaitingExtract')
                            ) : (
                              t('workspace.library.thumbPlaceholder')
                            )}
                          </span>
                        )}
                      </div>
                      <div className="film-lab-library-card-body">
                        <span className="film-lab-library-asset-name">{String(asset?.sourceName ?? '—')}</span>
                        <span className="film-lab-library-asset-state">
                          {asset?.hasDecodedFrame
                            ? t('workspace.library.assetReady')
                            : t('workspace.library.assetPending')}
                        </span>
                        {typeof asset?.rating === 'number' && asset.rating > 0 ? (
                          <span className="film-lab-library-rating" aria-hidden>
                            {'★'.repeat(Math.min(5, asset.rating))}
                          </span>
                        ) : null}
                        {asset?.pick === 'rejected' ? (
                          <span className="film-lab-library-rejected">{t('workspace.library.rejected')}</span>
                        ) : null}
                        {Array.isArray(asset?.semanticIndex?.tags) && asset.semanticIndex.tags.length > 0 ? (
                          <span className="film-lab-library-tags">
                            {asset.semanticIndex.tags.slice(0, 4).join(' · ')}
                          </span>
                        ) : (
                          <span className="film-lab-library-tags subtle">{t('workspace.library.semanticIdle')}</span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            )
          ) : assets.length === 0 ? (
            <div
              className="upload-zone"
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef?.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef?.current?.click();
                }
              }}
            >
              <div className="upload-icon">◎</div>
              <div className="upload-text">{t('filmLab.sourcePanel.uploadTitle')}</div>
              <div className="upload-sub">{t('filmLab.sourcePanel.uploadSub')}</div>
              <button className="btn-browse" type="button">
                {t('filmLab.sourcePanel.browse')}
              </button>
            </div>
          ) : (
            <div className="film-lab-library-empty">{t('workspace.library.empty')}</div>
          )}
        </div>

        {isMetadataPanelOpen ? (
        <aside className="film-lab-library-exif-slot" aria-label={t('workspace.library.exifTitle')}>
          <div className="film-lab-library-exif-head">{t('workspace.library.exifTitle')}</div>
          {selectedAsset ? (
            <dl className="film-lab-library-exif-dl">
              <dt>{t('workspace.library.exifFile')}</dt>
              <dd>{String(selectedAsset.sourceName ?? '—')}</dd>
              <dt>{t('workspace.library.exifSize')}</dt>
              <dd>
                {selectedAsset.sourceSize != null
                  ? `${Math.round(Number(selectedAsset.sourceSize) / 1024)} KB`
                  : '—'}
              </dd>
              <dt>{t('workspace.library.exifSemantic')}</dt>
              <dd>
                {Array.isArray(selectedAsset.semanticIndex?.tags) && selectedAsset.semanticIndex.tags.length > 0
                  ? selectedAsset.semanticIndex.tags.join(', ')
                  : t('workspace.library.semanticIdle')}
              </dd>
              {selectedAsset.exif &&
              typeof selectedAsset.exif === 'object' &&
              selectedAsset.exif.schema === 'mindfullens.catalog-exif-snapshot.v1' ? (
                <>
                  {[
                    ['exifCamera', selectedAsset.exif.camera],
                    ['exifLens', selectedAsset.exif.lens],
                    ['exifIso', selectedAsset.exif.iso != null ? String(selectedAsset.exif.iso) : null],
                    ['exifShutter', selectedAsset.exif.shutter],
                    ['exifAperture', selectedAsset.exif.aperture],
                    ['exifFocal', selectedAsset.exif.focalLength],
                    ['exifDate', selectedAsset.exif.dateTaken],
                    ['exifOrientation', selectedAsset.exif.orientation],
                    ['exifDimensions', selectedAsset.exif.dimensions],
                    ['exifPreviewDimensions', selectedAsset.exif.previewDimensions],
                  ]
                    .filter(([, v]) => v != null && String(v).trim() !== '')
                    .map(([key, value]) => (
                      <Fragment key={key}>
                        <dt>{t(`workspace.library.${key}`)}</dt>
                        <dd>{String(value)}</dd>
                      </Fragment>
                    ))}
                </>
              ) : (
                <>
                  <dt>{t('workspace.library.exifRaw')}</dt>
                  <dd className="film-lab-library-exif-pre">
                    {selectedAsset.exif && typeof selectedAsset.exif === 'object'
                      ? import.meta.env.DEV
                        ? JSON.stringify(selectedAsset.exif, null, 0)
                        : `${Object.keys(selectedAsset.exif).length} keys`
                      : t('workspace.library.exifPending')}
                  </dd>
                </>
              )}
            </dl>
          ) : (
            <p className="film-lab-library-exif-empty">{t('workspace.library.exifEmpty')}</p>
          )}
        </aside>
        ) : null}
      </div>

      <div className="film-lab-library-filmstrip-host" aria-label={t('workspace.library.filmstripRegion')}>
        <FilmLabFilmstripCanvas
          assets={assetsForThumbs}
          sessionId={sessionId}
          primaryAssetId={primaryAssetId}
          selectedAssetIds={selectedAssetIds}
          previewEpoch={previewEpoch}
          onPickAsset={handleFilmstripPick}
          workspaceTabKey={studioWorkspace}
          onPrioritizeRawEmbeddedExtract={onPrioritizeRawEmbeddedExtract}
        />
      </div>
    </section>
  );
}
