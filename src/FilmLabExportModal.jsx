import { useEffect, useRef, useState } from 'react';
import {
  defaultFilmLabExportLossyQualityForFormat,
  FILM_LAB_EXPORT_LOSSY_FORMAT_SET,
  FILM_LAB_EXPORT_MODAL_FORMAT_IDS,
  normalizeFilmLabExportModalFileFormat,
} from './engine/filmLabExportFormats.js';
import { useI18n } from './i18n';

/** Persisted across sessions; keep stable — bump only on breaking shape changes. */
const EXPORT_MODAL_PREFS_KEY = 'filmLab.exportModal.prefs.v1';

const EXPORT_IDS = ['social', 'web', 'full'];

/** Stable id for `aria-labelledby` on the export dialog (single instance). */
const FILM_LAB_EXPORT_MODAL_TITLE_ID = 'film-lab-export-modal-title';

/** Visible section title + `aria-labelledby` target for the size preset group. */
const FILM_LAB_EXPORT_SIZE_PRESETS_HEADING_ID = 'film-lab-export-size-presets-heading';

/** Visible subtitle + `aria-labelledby` target for the file format pill group. */
const FILM_LAB_EXPORT_FORMAT_HEADING_ID = 'film-lab-export-format-heading';

/** Long hint under format pills when DNG is selected (derivative light — SPIKE §4.6–4.7). */
const FILM_LAB_EXPORT_DNG_HINT_ID = 'film-lab-export-dng-hint';

const EXPORT_ICONS = {
  social: '📱',
  web: '💻',
  full: '🖼️',
};

function readExportModalPrefs() {
  try {
    const raw = localStorage.getItem(EXPORT_MODAL_PREFS_KEY);
    if (!raw) {
      return null;
    }
    const p = JSON.parse(raw);
    return p && typeof p === 'object' ? p : null;
  } catch {
    return null;
  }
}

function writeExportModalPrefs(prefs) {
  try {
    localStorage.setItem(EXPORT_MODAL_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // quota / private mode — ignore
  }
}

function normalizeLastSizeProfile(value) {
  return EXPORT_IDS.includes(value) ? value : null;
}

function queryExportModalFocusables(container) {
  if (!container) {
    return [];
  }
  const selector =
    'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll(selector)).filter((el) => {
    if (!(el instanceof HTMLElement)) {
      return false;
    }
    const rects = el.getClientRects();
    return rects.length > 0 && rects[0].width + rects[0].height > 0;
  });
}

export default function FilmLabExportModal({
  open,
  pendingBatchFiles,
  onClose,
  processBatch,
  exportImage,
  adjustments,
  doubleExposurePlateReady,
  doubleExposurePlateOrigin = 'none',
}) {
  const { t } = useI18n();
  const closeButtonRef = useRef(null);
  const dialogRef = useRef(null);
  const [fileFormat, setFileFormat] = useState('jpeg');
  const [includeLocalMaskPng, setIncludeLocalMaskPng] = useState(false);
  const [includeBeforeAfter, setIncludeBeforeAfter] = useState(false);
  const [includeRecipeJson, setIncludeRecipeJson] = useState(true);
  const [lastSizeProfile, setLastSizeProfile] = useState(null);
  const [lossyQuality, setLossyQuality] = useState(() => defaultFilmLabExportLossyQualityForFormat('jpeg'));

  useEffect(() => {
    if (!open) {
      return;
    }
    const saved = readExportModalPrefs();
    if (!saved) {
      setFileFormat('jpeg');
      setIncludeLocalMaskPng(false);
      setIncludeBeforeAfter(false);
      setIncludeRecipeJson(true);
      setLastSizeProfile(null);
      setLossyQuality(defaultFilmLabExportLossyQualityForFormat('jpeg'));
      return;
    }
    const loadedFormat = normalizeFilmLabExportModalFileFormat(saved.fileFormat);
    setFileFormat(loadedFormat);
    if (typeof saved.includeLocalMaskPng === 'boolean') {
      setIncludeLocalMaskPng(saved.includeLocalMaskPng);
    }
    if (typeof saved.includeBeforeAfter === 'boolean') {
      setIncludeBeforeAfter(saved.includeBeforeAfter);
    }
    if (typeof saved.includeRecipeJson === 'boolean') {
      setIncludeRecipeJson(saved.includeRecipeJson);
    }
    setLastSizeProfile(normalizeLastSizeProfile(saved.lastSizeProfile));
    if (typeof saved.lossyQuality === 'number' && Number.isFinite(saved.lossyQuality)) {
      setLossyQuality(Math.min(1, Math.max(0.35, saved.lossyQuality)));
    } else {
      setLossyQuality(defaultFilmLabExportLossyQualityForFormat(loadedFormat));
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const previous = document.activeElement;
    const canRestore =
      previous instanceof HTMLElement &&
      typeof previous.focus === 'function' &&
      previous !== document.body;

    const frame = requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
      if (canRestore && document.contains(previous)) {
        previous.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const dialog = dialogRef.current;
    if (!dialog) {
      return undefined;
    }
    const onKeyDown = (e) => {
      if (e.key !== 'Tab') {
        return;
      }
      const nodes = queryExportModalFocusables(dialog);
      if (nodes.length === 0) {
        return;
      }
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', onKeyDown);
    return () => dialog.removeEventListener('keydown', onKeyDown);
  }, [open, fileFormat]);

  if (!open) {
    return null;
  }

  const doubleExposureStrength = Number(adjustments?.doubleExposureAmount ?? 0);
  const hasBatch = Boolean(pendingBatchFiles?.length);
  const showDoubleExposureNoPlateWarning =
    Number.isFinite(doubleExposureStrength) &&
    doubleExposureStrength > 0 &&
    !doubleExposurePlateReady;
  const showDoubleExposureBatchWarning =
    hasBatch && Number.isFinite(doubleExposureStrength) && doubleExposureStrength > 0;
  const showDoubleExposurePlateRecipeNote =
    Number.isFinite(doubleExposureStrength) &&
    doubleExposureStrength > 0 &&
    doubleExposurePlateReady &&
    (doubleExposurePlateOrigin === 'file' || doubleExposurePlateOrigin === 'opfs');

  const handleBackdropClick = () => {
    onClose();
  };

  const runExport = (sizeProfile) => {
    setLastSizeProfile(sizeProfile);
    writeExportModalPrefs({
      fileFormat,
      includeLocalMaskPng,
      includeBeforeAfter,
      includeRecipeJson,
      lastSizeProfile: sizeProfile,
      lossyQuality,
    });
    if (pendingBatchFiles?.length) {
      processBatch(pendingBatchFiles, {
        sizeProfile,
        fileFormat,
        includeLocalMaskPng,
        includeBeforeAfter,
        includeRecipeJson,
        lossyQuality,
      });
    } else {
      exportImage({
        sizeProfile,
        fileFormat,
        includeLocalMaskPng,
        includeBeforeAfter,
        includeRecipeJson,
        lossyQuality,
      });
    }
    onClose();
  };

  const handleOption = (sizeProfile) => {
    runExport(sizeProfile);
  };

  return (
    <div className="export-modal-backdrop" onClick={handleBackdropClick}>
      <div
        ref={dialogRef}
        className="export-modal-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby={FILM_LAB_EXPORT_MODAL_TITLE_ID}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="export-modal-header">
          <h2 id={FILM_LAB_EXPORT_MODAL_TITLE_ID}>
            {pendingBatchFiles ? t('filmLab.exportModal.titleBatch') : t('filmLab.exportModal.titleSingle')}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="export-modal-close"
            aria-label={t('filmLab.exportModal.close')}
            onClick={handleBackdropClick}
          >
            ✕
          </button>
        </div>

        <div className="export-modal-format-section">
          <div className="export-modal-subtitle" id={FILM_LAB_EXPORT_FORMAT_HEADING_ID}>
            {t('filmLab.exportModal.formatLabel')}
          </div>
          <div
            className="export-modal-format-pills"
            role="group"
            aria-labelledby={FILM_LAB_EXPORT_FORMAT_HEADING_ID}
            aria-describedby={fileFormat === 'dng' ? FILM_LAB_EXPORT_DNG_HINT_ID : undefined}
          >
            {FILM_LAB_EXPORT_MODAL_FORMAT_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={`export-format-pill${fileFormat === id ? ' is-active' : ''}`}
                aria-pressed={fileFormat === id}
                title={id === 'dng' ? t('filmLab.exportModal.formatDngPillTitle') : undefined}
                onClick={() => {
                  setFileFormat(id);
                  writeExportModalPrefs({
                    fileFormat: id,
                    includeLocalMaskPng,
                    includeBeforeAfter,
                    includeRecipeJson,
                    lastSizeProfile,
                    lossyQuality,
                  });
                }}
              >
                {t(`filmLab.exportModal.format.${id}`)}
              </button>
            ))}
          </div>
          {fileFormat === 'dng' ? (
            <p
              id={FILM_LAB_EXPORT_DNG_HINT_ID}
              className="export-modal-quality-hint"
              role="note"
            >
              {t('filmLab.exportModal.formatDngNote')}
            </p>
          ) : null}
        </div>

        {showDoubleExposureNoPlateWarning ? (
          <p className="export-modal-warning-hint" role="note">
            {t('filmLab.exportModal.doubleExposureNoPlateNote')}
          </p>
        ) : null}

        {showDoubleExposureBatchWarning ? (
          <p className="export-modal-warning-hint" role="note">
            {t('filmLab.exportModal.doubleExposureBatchPlateNote')}
          </p>
        ) : null}

        {showDoubleExposurePlateRecipeNote ? (
          <p className="export-modal-quality-hint" role="note">
            {t('filmLab.exportModal.doubleExposurePlateRecipeNote')}
          </p>
        ) : null}

        <label className="export-modal-mask-row">
          <input
            type="checkbox"
            checked={includeLocalMaskPng}
            onChange={(e) => {
              const v = e.target.checked;
              setIncludeLocalMaskPng(v);
              writeExportModalPrefs({
                fileFormat,
                includeLocalMaskPng: v,
                includeBeforeAfter,
                includeRecipeJson,
                lastSizeProfile,
                lossyQuality,
              });
            }}
          />
          <span>{t('filmLab.exportModal.includeMaskPng')}</span>
        </label>
        <label className="export-modal-mask-row">
          <input
            type="checkbox"
            checked={includeBeforeAfter}
            onChange={(e) => {
              const v = e.target.checked;
              setIncludeBeforeAfter(v);
              writeExportModalPrefs({
                fileFormat,
                includeLocalMaskPng,
                includeBeforeAfter: v,
                includeRecipeJson,
                lastSizeProfile,
                lossyQuality,
              });
            }}
          />
          <span>{t('filmLab.exportModal.includeBeforeAfter')}</span>
        </label>
        <label className="export-modal-mask-row">
          <input
            type="checkbox"
            checked={includeRecipeJson}
            onChange={(e) => {
              const v = e.target.checked;
              setIncludeRecipeJson(v);
              writeExportModalPrefs({
                fileFormat,
                includeLocalMaskPng,
                includeBeforeAfter,
                includeRecipeJson: v,
                lastSizeProfile,
                lossyQuality,
              });
            }}
          />
          <span>{t('filmLab.exportModal.includeRecipeJson')}</span>
        </label>

        {FILM_LAB_EXPORT_LOSSY_FORMAT_SET.has(fileFormat) ? (
          <div className="export-modal-quality-section">
            <div className="export-modal-subtitle">{t('filmLab.exportModal.lossyQualityLabel')}</div>
            <div className="export-modal-quality-row">
              <input
                type="range"
                min={35}
                max={100}
                step={1}
                aria-label={t('filmLab.exportModal.lossyQualityLabel')}
                value={Math.round(lossyQuality * 100)}
                onChange={(e) => {
                  const v = Number(e.target.value) / 100;
                  setLossyQuality(v);
                  writeExportModalPrefs({
                    fileFormat,
                    includeLocalMaskPng,
                    includeBeforeAfter,
                    includeRecipeJson,
                    lastSizeProfile,
                    lossyQuality: v,
                  });
                }}
                aria-valuemin={35}
                aria-valuemax={100}
                aria-valuenow={Math.round(lossyQuality * 100)}
                aria-valuetext={`${Math.round(lossyQuality * 100)}%`}
              />
              <span className="export-modal-quality-value">{Math.round(lossyQuality * 100)}%</span>
            </div>
            <div className="export-modal-quality-hint">{t('filmLab.exportModal.lossyQualityHint')}</div>
          </div>
        ) : null}

        <div className="export-modal-subtitle" id={FILM_LAB_EXPORT_SIZE_PRESETS_HEADING_ID}>
          {t('filmLab.exportModal.sizeProfilesGroupLabel')}
        </div>
        <div
          className="export-options-grid"
          role="group"
          aria-labelledby={FILM_LAB_EXPORT_SIZE_PRESETS_HEADING_ID}
        >
          {EXPORT_IDS.map((id) => {
            const title = t(`filmLab.exportModal.option.${id}.title`);
            const desc = t(`filmLab.exportModal.option.${id}.desc`);
            return (
            <div
              key={id}
              role="button"
              tabIndex={0}
              className={`export-option-card${id === lastSizeProfile ? ' is-last-used' : ''}`}
              onClick={() => handleOption(id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleOption(id);
                }
              }}
              aria-label={`${title}. ${desc}`}
              title={id === lastSizeProfile ? t('filmLab.exportModal.lastUsedProfileHint') : undefined}
            >
              <div className="export-option-icon">{EXPORT_ICONS[id]}</div>
              <div className="export-option-title">{title}</div>
              <div className="export-option-desc">{desc}</div>
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
