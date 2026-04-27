import { useCallback, useMemo } from 'react';
import { getPipelineLabel } from '../engine/pipeline/constants.js';
import {
  formatAspectRatio,
  formatDateTime,
  formatFileSize,
  formatMegapixels,
} from './displayFormat.js';
import { METADATA_VIEW_MODES } from './workbenchConstants.js';

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
  const metadataItems = useMemo(() => {
    const geometryOrientation =
      imageMeta?.width && imageMeta?.height
        ? imageMeta.width > imageMeta.height
          ? 'Poziome'
          : imageMeta.width < imageMeta.height
            ? 'Pionowe'
            : 'Kwadrat'
        : '—';
    const orientation =
      exifMeta?.orientationLabel && geometryOrientation !== '—'
        ? `${geometryOrientation} · EXIF: ${exifMeta.orientationLabel}`
        : geometryOrientation;
    const orientationCorrection = exifMeta?.orientationTransform
      ? `${exifMeta.orientationTransform.rotationDegrees}°${exifMeta.orientationTransform.mirrored ? ' + lustro' : ''}`
      : '—';
    const previewScale =
      imageMeta?.width && imageMeta?.previewWidth
        ? `${Math.round((imageMeta.previewWidth / imageMeta.width) * 100)}%`
        : '—';

    return [
      { label: 'Plik', value: uploadedFile?.name || '—' },
      { label: 'Format', value: uploadedFile?.type || uploadedFile?.name?.split('.').pop()?.toUpperCase() || '—' },
      { label: 'Rozmiar pliku', value: formatFileSize(uploadedFile?.size) },
      { label: 'Data pliku', value: formatDateTime(uploadedFile?.lastModified ? new Date(uploadedFile.lastModified) : null) },
      {
        label: 'Aparat',
        value: [exifMeta?.cameraMake, exifMeta?.cameraModel].filter(Boolean).join(' ') || '—',
      },
      { label: 'Obiektyw', value: exifMeta?.lensModel || '—' },
      { label: 'Data zdjęcia', value: formatDateTime(exifMeta?.dateTaken) },
      { label: 'ISO', value: Number.isFinite(exifMeta?.iso) ? String(exifMeta.iso) : '—' },
      { label: 'Migawka', value: exifMeta?.shutter || '—' },
      { label: 'Przysłona', value: exifMeta?.aperture || '—' },
      { label: 'Ogniskowa', value: exifMeta?.focalLength || '—' },
      { label: 'Wymiary', value: imageMeta ? `${imageMeta.width}×${imageMeta.height}` : '—' },
      { label: 'Megapiksele', value: formatMegapixels(imageMeta?.width, imageMeta?.height) },
      { label: 'Proporcje', value: formatAspectRatio(imageMeta?.width, imageMeta?.height) },
      { label: 'Orientacja', value: orientation },
      {
        label: 'Korekcja EXIF',
        value:
          exifMeta?.orientationTag != null
            ? `${orientationCorrection} (tag ${exifMeta.orientationTag})`
            : orientationCorrection,
      },
      {
        label: 'Podgląd',
        value: imageMeta ? `${imageMeta.previewWidth}×${imageMeta.previewHeight} (${previewScale})` : '—',
      },
      { label: 'Zoom', value: `${Math.round(zoom * 100)}%` },
      { label: 'Obrót', value: `${adjustments.rotation ?? 0}°` },
      { label: 'Odbicie', value: adjustments.flipped ? 'Tak' : 'Nie' },
      { label: 'Profil', value: activeFilmName || '—' },
      { label: 'Siła profilu', value: isInputProfile ? '—' : `${adjustments.strength}%` },
      { label: 'Pipeline', value: getPipelineLabel(pipelineInfo) },
      { label: 'Render', value: showInlineProcessing ? 'Przetwarzanie…' : 'Gotowy' },
      {
        label: 'Alerty jakości',
        value: qualityStatus?.text ?? '—',
        warn: qualityStatus?.tone === 'warn',
      },
      {
        label: 'RAW Decode',
        value: rawDecodeSummary || '—',
        warn: isRawDecodeWarning,
      },
      {
        label: 'LibRaw',
        value: formatLibrawMetadataSummaryLine(pipelineInfo?.capabilities?.librawMetadataSummary) ?? '—',
      },
      {
        label: 'RAW Color Pipeline',
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
    imageMeta,
    exifMeta,
    isInputProfile,
    isRawDecodeWarning,
    pipelineInfo,
    rawLinearStageOverride,
    qualityStatus,
    rawDecodeSummary,
    showInlineProcessing,
    uploadedFile,
    zoom,
  ]);

  const displayedMetadataItems = useMemo(() => {
    const compactOrder = [
      'Plik',
      'Wymiary',
      'Megapiksele',
      'Orientacja',
      'ISO',
      'Migawka',
      'Przysłona',
      'Zoom',
      'Profil',
      'Pipeline',
      'LibRaw',
      'RAW Decode',
      'Render',
      'Alerty jakości',
    ];
    const exifOrder = [
      'Aparat',
      'Obiektyw',
      'Data zdjęcia',
      'ISO',
      'Migawka',
      'Przysłona',
      'Ogniskowa',
      'Wymiary',
      'Megapiksele',
      'Proporcje',
      'Orientacja',
    ];

    const byOrder = (order) =>
      order
        .map((label) => metadataItems.find((item) => item.label === label))
        .filter(Boolean);

    if (metadataViewMode === 'compact') {
      return byOrder(compactOrder);
    }
    if (metadataViewMode === 'exif') {
      return byOrder(exifOrder);
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
  }, []);

  return { metadataItems, displayedMetadataItems, cycleMetadataViewMode };
}
