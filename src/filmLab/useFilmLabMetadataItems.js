import { useCallback, useMemo } from 'react';
import { PIPELINE_KIND } from '../engine/pipeline/constants.js';
import {
  formatAspectRatio,
  formatDateTime,
  formatFileSize,
  formatMegapixels,
} from './displayFormat.js';
import { METADATA_VIEW_MODES } from './workbenchConstants.js';
import { useI18n } from '../i18n';

function translatePipelineKindTitle(pipelineInfo, t) {
  if (!pipelineInfo) {
    return t('filmLab.sourcePanel.pipelineIdle');
  }
  if (pipelineInfo.pipelineKind === PIPELINE_KIND.RAW) {
    return t('filmLab.sourcePanel.pipelineRaw');
  }
  return t('filmLab.sourcePanel.pipelineBitmap');
}

function formatLibrawMetadataSummaryLine(summary) {
  if (!summary || typeof summary !== 'object') {
    return null;
  }
  const parts = [];
  const make = String(summary.make ?? '').trim();
  const model = String(summary.model ?? '').trim();
  const camera = [make, model].filter(Boolean).join(' ');
  if (camera) {
    parts.push(camera);
  }
  const iso = Number(summary.iso_speed ?? summary.iso);
  if (Number.isFinite(iso)) {
    parts.push(`ISO ${iso}`);
  }
  const shutter = summary.shutter != null ? String(summary.shutter).trim() : '';
  if (shutter) {
    parts.push(`t ${shutter}`);
  }
  const aperture = summary.aperture != null ? String(summary.aperture).trim() : '';
  if (aperture) {
    parts.push(aperture);
  }
  const ow = Number(summary.iwidth ?? summary.width);
  const oh = Number(summary.iheight ?? summary.height);
  if (Number.isFinite(ow) && Number.isFinite(oh) && ow > 0 && oh > 0) {
    parts.push(`${Math.round(ow)}×${Math.round(oh)}`);
  }
  const lens = summary.lens != null ? String(summary.lens).trim() : '';
  if (lens) {
    parts.push(lens);
  }
  return parts.length ? parts.join(' · ') : null;
}

const COMPACT_ORDER_IDS = [
  'file',
  'dimensions',
  'megapixels',
  'orientation',
  'iso',
  'shutter',
  'aperture',
  'zoom',
  'profile',
  'pipeline',
  'libraw',
  'rawDecode',
  'render',
  'qualityAlerts',
];

const EXIF_ORDER_IDS = [
  'camera',
  'lens',
  'dateTaken',
  'iso',
  'shutter',
  'aperture',
  'focalLength',
  'dimensions',
  'megapixels',
  'aspectRatio',
  'orientation',
];

export function useFilmLabMetadataItems({
  metadataViewMode,
  setMetadataViewMode,
  uploadedFile,
  imageMeta,
  exifMeta,
  zoom,
  adjustments,
  activeFilmName,
  isInputProfile,
  pipelineInfo,
  rawLinearStageOverride,
  qualityStatus,
  rawDecodeSummary,
  showInlineProcessing,
  isRawDecodeWarning,
}) {
  const { t } = useI18n();

  const metadataItems = useMemo(() => {
    let geometryOrientation = '—';
    if (imageMeta?.width && imageMeta?.height) {
      if (imageMeta.width > imageMeta.height) {
        geometryOrientation = t('filmLab.metaValue.horizontal');
      } else if (imageMeta.width < imageMeta.height) {
        geometryOrientation = t('filmLab.metaValue.vertical');
      } else {
        geometryOrientation = t('filmLab.metaValue.square');
      }
    }

    const orientation =
      exifMeta?.orientationLabel && geometryOrientation !== '—'
        ? t('filmLab.metaLine.orientationExif', {
            geometry: geometryOrientation,
            exifLabel: exifMeta.orientationLabel,
          })
        : geometryOrientation;

    const orientationCorrection = exifMeta?.orientationTransform
      ? `${exifMeta.orientationTransform.rotationDegrees}°${
          exifMeta.orientationTransform.mirrored ? t('filmLab.meta.mirrorSuffix') : ''
        }`
      : '—';

    const exifCorrectionValue =
      exifMeta?.orientationTag != null
        ? t('filmLab.metaLine.exifCorrectionWithTag', {
            correction: orientationCorrection,
            tag: exifMeta.orientationTag,
          })
        : orientationCorrection;

    const previewScale =
      imageMeta?.width && imageMeta?.previewWidth
        ? `${Math.round((imageMeta.previewWidth / imageMeta.width) * 100)}%`
        : '—';

    return [
      { id: 'file', label: t('filmLab.meta.file'), value: uploadedFile?.name || '—' },
      {
        id: 'format',
        label: t('filmLab.meta.format'),
        value: uploadedFile?.type || uploadedFile?.name?.split('.').pop()?.toUpperCase() || '—',
      },
      { id: 'fileSize', label: t('filmLab.meta.fileSize'), value: formatFileSize(uploadedFile?.size) },
      {
        id: 'fileDate',
        label: t('filmLab.meta.fileDate'),
        value: formatDateTime(uploadedFile?.lastModified ? new Date(uploadedFile.lastModified) : null),
      },
      {
        id: 'camera',
        label: t('filmLab.meta.camera'),
        value: [exifMeta?.cameraMake, exifMeta?.cameraModel].filter(Boolean).join(' ') || '—',
      },
      { id: 'lens', label: t('filmLab.meta.lens'), value: exifMeta?.lensModel || '—' },
      {
        id: 'dateTaken',
        label: t('filmLab.meta.dateTaken'),
        value: formatDateTime(exifMeta?.dateTaken),
      },
      {
        id: 'iso',
        label: t('filmLab.meta.iso'),
        value: Number.isFinite(exifMeta?.iso) ? String(exifMeta.iso) : '—',
      },
      { id: 'shutter', label: t('filmLab.meta.shutter'), value: exifMeta?.shutter || '—' },
      { id: 'aperture', label: t('filmLab.meta.aperture'), value: exifMeta?.aperture || '—' },
      {
        id: 'focalLength',
        label: t('filmLab.meta.focalLength'),
        value: exifMeta?.focalLength || '—',
      },
      {
        id: 'dimensions',
        label: t('filmLab.meta.dimensions'),
        value: imageMeta ? `${imageMeta.width}×${imageMeta.height}` : '—',
      },
      {
        id: 'megapixels',
        label: t('filmLab.meta.megapixels'),
        value: formatMegapixels(imageMeta?.width, imageMeta?.height),
      },
      {
        id: 'aspectRatio',
        label: t('filmLab.meta.aspectRatio'),
        value: formatAspectRatio(imageMeta?.width, imageMeta?.height),
      },
      { id: 'orientation', label: t('filmLab.meta.orientation'), value: orientation },
      {
        id: 'exifCorrection',
        label: t('filmLab.meta.exifCorrection'),
        value: exifCorrectionValue,
      },
      {
        id: 'preview',
        label: t('filmLab.meta.preview'),
        value: imageMeta ? `${imageMeta.previewWidth}×${imageMeta.previewHeight} (${previewScale})` : '—',
      },
      { id: 'zoom', label: t('filmLab.meta.zoom'), value: `${Math.round(zoom * 100)}%` },
      { id: 'rotation', label: t('filmLab.meta.rotation'), value: `${adjustments.rotation ?? 0}°` },
      {
        id: 'flip',
        label: t('filmLab.meta.flip'),
        value: adjustments.flipped ? t('filmLab.metaValue.yes') : t('filmLab.metaValue.no'),
      },
      { id: 'profile', label: t('filmLab.meta.profile'), value: activeFilmName || '—' },
      {
        id: 'profileStrength',
        label: t('filmLab.meta.profileStrength'),
        value: isInputProfile ? '—' : `${adjustments.strength}%`,
      },
      { id: 'pipeline', label: t('filmLab.meta.pipeline'), value: translatePipelineKindTitle(pipelineInfo, t) },
      {
        id: 'render',
        label: t('filmLab.meta.render'),
        value: showInlineProcessing ? t('filmLab.metaValue.processing') : t('filmLab.metaValue.ready'),
      },
      {
        id: 'qualityAlerts',
        label: t('filmLab.meta.qualityAlerts'),
        value: qualityStatus?.text ?? '—',
        warn: qualityStatus?.tone === 'warn',
      },
      {
        id: 'rawDecode',
        label: t('filmLab.meta.rawDecode'),
        value: rawDecodeSummary || '—',
        warn: isRawDecodeWarning,
      },
      {
        id: 'libraw',
        label: t('filmLab.meta.libraw'),
        value: formatLibrawMetadataSummaryLine(pipelineInfo?.capabilities?.librawMetadataSummary) ?? '—',
      },
      {
        id: 'rawColorPipeline',
        label: t('filmLab.meta.rawColorPipeline'),
        value:
          pipelineInfo?.capabilities?.colorPipeline?.stage
            ? `${pipelineInfo.capabilities.colorPipeline.stage} · ${
                pipelineInfo.capabilities.colorPipeline.inputEncoding ?? 'input'
              } -> ${pipelineInfo.capabilities.colorPipeline.outputEncoding ?? 'output'} · linear ${
                rawLinearStageOverride == null
                  ? pipelineInfo.capabilities.colorPipeline.linearStageEnabled === false
                    ? 'off'
                    : 'on'
                  : rawLinearStageOverride
                    ? 'on (forced)'
                    : 'off (forced)'
              }`
            : '—',
      },
    ];
  }, [
    activeFilmName,
    adjustments.flipped,
    adjustments.rotation,
    adjustments.strength,
    exifMeta,
    imageMeta,
    isInputProfile,
    isRawDecodeWarning,
    pipelineInfo,
    qualityStatus,
    rawDecodeSummary,
    rawLinearStageOverride,
    showInlineProcessing,
    t,
    uploadedFile,
    zoom,
  ]);

  const displayedMetadataItems = useMemo(() => {
    const byOrder = (ids) =>
      ids.map((id) => metadataItems.find((item) => item.id === id)).filter(Boolean);

    if (metadataViewMode === 'compact') {
      return byOrder(COMPACT_ORDER_IDS);
    }
    if (metadataViewMode === 'exif') {
      return byOrder(EXIF_ORDER_IDS);
    }
    return metadataItems;
  }, [metadataItems, metadataViewMode]);

  const cycleMetadataViewMode = useCallback(() => {
    setMetadataViewMode((current) => {
      const currentIndex = METADATA_VIEW_MODES.indexOf(current);
      if (currentIndex < 0) {
        return METADATA_VIEW_MODES[0];
      }
      return METADATA_VIEW_MODES[(currentIndex + 1) % METADATA_VIEW_MODES.length];
    });
  }, [setMetadataViewMode]);

  return { metadataItems, displayedMetadataItems, cycleMetadataViewMode };
}
