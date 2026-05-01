import { Fragment, useMemo, useState } from 'react';
import { useI18n } from './i18n';

export default function FilmLabLibraryWorkspace({
  collections = [],
  assets = [],
  activeCollectionId = 'inbox',
  onCollectionChange,
}) {
  const { t } = useI18n();
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState(null);

  const activeCollection = useMemo(
    () => collections.find((entry) => entry?.id === activeCollectionId) ?? collections[0] ?? null,
    [collections, activeCollectionId]
  );

  const visibleAssetIds = Array.isArray(activeCollection?.assetIds) ? activeCollection.assetIds : [];
  const visibleAssets = assets.filter((asset) => visibleAssetIds.includes(asset?.id));

  const q = filterQuery.trim().toLowerCase();
  const filteredAssets = useMemo(() => {
    if (!q) {
      return visibleAssets;
    }
    return visibleAssets.filter((asset) => {
      const name = String(asset?.sourceName ?? '').toLowerCase();
      const tags = Array.isArray(asset?.semanticIndex?.tags)
        ? asset.semanticIndex.tags.join(' ').toLowerCase()
        : '';
      return name.includes(q) || tags.includes(q);
    });
  }, [visibleAssets, q]);

  const selectedAsset =
    selectedAssetId != null ? assets.find((a) => a?.id === selectedAssetId) ?? null : null;

  return (
    <section className="film-lab-library-workspace" aria-label={t('workspace.library.title')}>
      <div className="film-lab-library-head">
        <h2 className="film-lab-library-title">{t('workspace.library.title')}</h2>
        <div className="film-lab-library-meta">
          {t('workspace.library.meta', {
            collections: collections.length,
            assets: assets.length,
          })}
        </div>
      </div>

      <div className="film-lab-library-toolbar">
        <label className="film-lab-library-filter">
          <span className="film-lab-library-filter-label">{t('workspace.library.filterLabel')}</span>
          <input
            type="search"
            className="film-lab-library-filter-input"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder={t('workspace.library.filterPlaceholder')}
          />
        </label>
      </div>

      <div className="film-lab-library-collections" role="tablist" aria-label={t('workspace.library.collections')}>
        {collections.map((collection) => {
          const isActive = collection?.id === activeCollectionId;
          const assetCount = Array.isArray(collection?.assetIds) ? collection.assetIds.length : 0;
          return (
            <button
              key={String(collection?.id ?? '')}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`film-lab-library-collection-chip${isActive ? ' active' : ''}`}
              onClick={() => onCollectionChange?.(String(collection?.id ?? 'inbox'))}
            >
              {String(collection?.name ?? t('workspace.library.unnamedCollection'))} · {assetCount}
            </button>
          );
        })}
      </div>

      <div className="film-lab-library-main">
        <div className="film-lab-library-grid-wrap">
          {filteredAssets.length > 0 ? (
            <ul className="film-lab-library-grid">
              {filteredAssets.map((asset) => {
                const id = String(asset?.id ?? '');
                const active = id === String(selectedAssetId ?? '');
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className={`film-lab-library-card${active ? ' active' : ''}`}
                      onClick={() => setSelectedAssetId(asset?.id ?? null)}
                    >
                      <div className="film-lab-library-thumb" aria-hidden>
                        <span className="film-lab-library-thumb-placeholder">
                          {t('workspace.library.thumbPlaceholder')}
                        </span>
                      </div>
                      <div className="film-lab-library-card-body">
                        <span className="film-lab-library-asset-name">{String(asset?.sourceName ?? '—')}</span>
                        <span className="film-lab-library-asset-state">
                          {asset?.hasDecodedFrame
                            ? t('workspace.library.assetReady')
                            : t('workspace.library.assetPending')}
                        </span>
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
          ) : (
            <div className="film-lab-library-empty">{t('workspace.library.empty')}</div>
          )}
        </div>

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
                      ? JSON.stringify(selectedAsset.exif, null, 0)
                      : t('workspace.library.exifPending')}
                  </dd>
                </>
              )}
            </dl>
          ) : (
            <p className="film-lab-library-exif-empty">{t('workspace.library.exifEmpty')}</p>
          )}
        </aside>
      </div>
    </section>
  );
}
