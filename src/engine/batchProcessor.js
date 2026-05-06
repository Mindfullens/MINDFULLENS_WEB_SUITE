/**
 * Batch Processor — Sequential multi-file rendering with ZIP output.
 *
 * Loads each file from a FileList, renders it through the full Film-Lab
 * pipeline (renderToContext → output sharpening → EXIF on JPEG path),
 * encodes each frame with `encodeFilmLabExportCanvas` / `encodeFilmLabExportImageData`
 * using the caller’s `fileFormat` (raster IDs lub eksperymentalne `psd` / `dng`; patrz `FILM_LAB_EXPORT_MODAL_FORMAT_IDS`), optionally adds
 * before/mask/recipe sidecars, builds `mindfullens_batch_*_manifest.json` (with digest),
 * and triggers a single browser download when the batch ZIP is ready.
 */

// JSZip is loaded lazily to avoid blocking the render pipeline with ~256KB
import {
  encodeFilmLabExportCanvas,
  encodeFilmLabExportImageData,
  imageDataToPngUint8Array,
} from './filmLabExportEncode.js';
import {
  manifestLossyQualityForFilmLabExport,
  normalizeFilmLabExportFileFormat,
} from './filmLabExportFormats.js';
import { applyOutputSharpening } from './outputSharpening.js';
import { ingestUploadSource } from './pipeline/ingestSource.js';
import { buildBatchPerfContext, logBatchPerfSummary, measureAsync, recordBatchPerfFile, IS_BATCH_PERF_ENABLED } from './batchPerf.js';
import { SERVICE_BUILD_LABEL, SERVICE_BUILD_TAG, VIEWPORT_BUILD_MARKER } from '../filmLab/buildInfo.js';
import { buildFilmLabExportManifestArtifactRow } from './filmLabExportManifestArtifact.js';
import {
  attachFilmLabExportManifestDigest,
  buildFilmLabExportManifestRootBase,
} from './filmLabExportManifestHelpers.js';

async function sha256HexFromBytes(bytes) {
  const cryptoApi = globalThis?.crypto;
  if (!cryptoApi?.subtle || !(bytes instanceof Uint8Array)) {
    return null;
  }
  try {
    const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
    const view = new Uint8Array(digest);
    return Array.from(view)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

/**
 * Load file through the same ingest pipeline used by Film-Lab preview.
 * This keeps RAW/DNG support enabled for batch processing.
 */
async function loadFileAsRenderable(file, rawBackendPreference = null) {
  const uploadedImage = URL.createObjectURL(file);

  try {
    const { pipelineInfo, asset } = await ingestUploadSource({
      uploadedFile: file,
      uploadedImage,
      renderIntent: 'full',
      rawBackendPreference,
    });

    if (!asset?.image) {
      throw new Error(
        pipelineInfo?.message
          ? `${pipelineInfo.message} (${file.name})`
          : `Failed to load image: ${file.name}`
      );
    }

    return {
      image: asset.image,
      close() {
        try {
          asset.close?.();
        } finally {
          URL.revokeObjectURL(uploadedImage);
        }
      },
    };
  } catch (error) {
    URL.revokeObjectURL(uploadedImage);
    throw error;
  }
}

/**
 * Extract ImageData from an HTMLImageElement via a temporary canvas.
 * Supports scaling for specific size profiles.
 */
function imageToImageData(image, sizeProfile = 'full') {
  const canvas = document.createElement('canvas');
  let width = image.naturalWidth || image.width;
  let height = image.naturalHeight || image.height;

  if (sizeProfile === 'social') {
    const scale = 1080 / Math.max(width, height);
    if (scale < 1) {
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
  } else if (sizeProfile === 'web') {
    const scale = 2048 / Math.max(width, height);
    if (scale < 1) {
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
  }

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true })
    || canvas.getContext('2d', { willReadFrequently: true });
  
  // Use better quality scaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, width, height);

  const data = ctx.getImageData(0, 0, width, height);
  
  // Cleanup
  canvas.width = 1;
  canvas.height = 1;

  return data;
}

/**
 * Process a batch of files through the Film-Lab pipeline and download
 * the result as a single ZIP archive.
 */
export async function processBatch({
  files,
  renderToContext,
  filmName = 'Analog Signature',
  onProgress,
  onComplete,
  onError,
  signal,
  shuffleSeeds,
  sizeProfile = 'full',
  rawBackendPreference = null,
  fileFormat = 'jpeg',
  includeLocalMaskPng = false,
  includeBeforeAfter = false,
  includeRecipeJson = false,
  lossyQuality = undefined,
  exportSessionId = null,
  pipelineKind = null,
  buildMaskImageData = null,
  buildBeforeImageData = null,
  buildRecipeObject = null,
  prepareAdjustmentsForBatchFile = null,
  batchAdjustmentsOverrideRef = null,
}) {
  const total = files?.length ?? 0;
  if (total === 0) {
    console.warn('[Batch] No files to process.');
    onComplete?.();
    return;
  }

  const perfCtx = buildBatchPerfContext({
    label: 'film-lab.batch.zip',
    sizeProfile,
    totalFiles: total,
    filmName,
  });

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  let sharpeningStrength = 0.3;
  if (sizeProfile === 'social') sharpeningStrength = 0.6;
  if (sizeProfile === 'web') sharpeningStrength = 0.45;

  const requestedFf = typeof fileFormat === 'string' ? fileFormat.trim().toLowerCase() : '';
  const batchExportAsPsd = requestedFf === 'psd';
  const batchExportAsDng = requestedFf === 'dng';
  const normalizedFormat =
    batchExportAsPsd ? 'psd' : batchExportAsDng ? 'dng' : normalizeFilmLabExportFileFormat(fileFormat);
  const rasterFormatForSidecars = batchExportAsPsd || batchExportAsDng ? 'jpeg' : normalizedFormat;
  const manifestEntries = [];

  let addedCount = 0;

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) {
      break;
    }

    const file = files[i];
    const baseName = file.name.replace(/\.[^.]+$/, '');
    let renderable = null;
    let exportCanvas = null;
    const fileStartedAt = IS_BATCH_PERF_ENABLED && typeof performance?.now === 'function' ? performance.now() : null;

    try {
      onProgress?.(i, total, file.name);

      // 1. Load file via preview ingest path (bitmap + RAW/DNG)
      const loadTimed = await measureAsync(() => loadFileAsRenderable(file, rawBackendPreference));
      renderable = loadTimed.result;

      // 2. Extract pixel data with potential scaling
      const convertTimed = await measureAsync(() => Promise.resolve(imageToImageData(renderable.image, sizeProfile)));
      const source = convertTimed.result;

      // 3. Render through the full pipeline
      exportCanvas = document.createElement('canvas');
      const exportContext =
        exportCanvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true }) ||
        exportCanvas.getContext('2d', { willReadFrequently: true });

      // Randomize analog effects for each image in the batch
      shuffleSeeds?.();

      const preparedAdjustments =
        typeof prepareAdjustmentsForBatchFile === 'function'
          ? prepareAdjustmentsForBatchFile({
              file,
              fileIndex: i,
              sourceWidth: source.width,
              sourceHeight: source.height,
            })
          : null;
      if (
        batchAdjustmentsOverrideRef &&
        preparedAdjustments != null &&
        typeof preparedAdjustments === 'object'
      ) {
        batchAdjustmentsOverrideRef.current = { active: true, value: preparedAdjustments };
      }

      let renderTimed;
      try {
        renderTimed = await measureAsync(() =>
          Promise.resolve(
            renderToContext({
              canvas: exportCanvas,
              context: exportContext,
              source,
              includeCompare: false,
              quality: 'full',
            })
          )
        );
      } finally {
        if (batchAdjustmentsOverrideRef) {
          batchAdjustmentsOverrideRef.current = { active: false, value: null };
        }
      }

      // 4. Sharpen + encode (raster codecs or experimental PSD)
      const encodeTimed = await measureAsync(async () => {
        if (batchExportAsPsd) {
          applyOutputSharpening(exportContext, exportCanvas.width, exportCanvas.height, sharpeningStrength);
          const { encodeFilmLabExportPsdFromCanvas } = await import('./filmLabExportPsdFromCanvas.js');
          return encodeFilmLabExportPsdFromCanvas(exportCanvas, { layerName: `${filmName} export` });
        }
        if (batchExportAsDng) {
          applyOutputSharpening(exportContext, exportCanvas.width, exportCanvas.height, sharpeningStrength);
          const { encodeFilmLabExportDngDerivativeLightFromCanvas } = await import('./filmLabExportDngVariantA.js');
          return encodeFilmLabExportDngDerivativeLightFromCanvas(exportCanvas);
        }
        return encodeFilmLabExportCanvas(exportCanvas, exportContext, {
          filmName,
          sizeProfile,
          fileFormat: normalizedFormat,
          sharpeningStrength,
          lossyQuality,
        });
      });
      const encoded = encodeTimed.result;
      const outputName = `mindfullens_${baseName}_${sizeProfile}.${encoded.extension}`;

      zip.file(outputName, encoded.bytes, { binary: true });
      manifestEntries.push(
        await buildFilmLabExportManifestArtifactRow({
          sourceName: file.name,
          variant: 'after',
          artifactRole: 'primary',
          fileName: outputName,
          mimeType: encoded.mimeType,
          bytes: encoded.bytes,
          exportSessionId,
          pipelineKind,
          sha256HexFromBytes,
        })
      );

      if (includeBeforeAfter && typeof buildBeforeImageData === 'function') {
        const beforeData = buildBeforeImageData(source);
        if (beforeData) {
          const beforeTimed = await measureAsync(() =>
            encodeFilmLabExportImageData(beforeData, { fileFormat: rasterFormatForSidecars, lossyQuality })
          );
          const beforeArtifactName = `mindfullens_${baseName}_${sizeProfile}_before.${beforeTimed.result.extension}`;
          zip.file(beforeArtifactName, beforeTimed.result.bytes, { binary: true });
          manifestEntries.push(
            await buildFilmLabExportManifestArtifactRow({
              sourceName: file.name,
              variant: 'before',
              artifactRole: 'sidecar',
              fileName: beforeArtifactName,
              mimeType: beforeTimed.result.mimeType,
              bytes: beforeTimed.result.bytes,
              exportSessionId,
              pipelineKind,
              sha256HexFromBytes,
            })
          );
          if (includeRecipeJson && typeof buildRecipeObject === 'function') {
            const beforeRecipeObject = buildRecipeObject({
              fileName: file.name,
              sizeProfile,
              fileFormat: rasterFormatForSidecars,
              variant: 'before',
              artifactName: beforeArtifactName,
              artifactMimeType: beforeTimed.result.mimeType,
            });
            if (beforeRecipeObject && typeof beforeRecipeObject === 'object') {
              const beforeRecipeBytes = new TextEncoder().encode(JSON.stringify(beforeRecipeObject, null, 2));
              zip.file(`mindfullens_${baseName}_${sizeProfile}_before_recipe.json`, beforeRecipeBytes, {
                binary: true,
              });
              manifestEntries.push(
                await buildFilmLabExportManifestArtifactRow({
                  sourceName: file.name,
                  variant: 'before_recipe',
                  artifactRole: 'sidecar',
                  fileName: `mindfullens_${baseName}_${sizeProfile}_before_recipe.json`,
                  mimeType: 'application/json',
                  bytes: beforeRecipeBytes,
                  exportSessionId,
                  pipelineKind,
                  sha256HexFromBytes,
                })
              );
            }
          }
        }
      }

      if (includeLocalMaskPng && typeof buildMaskImageData === 'function') {
        const maskData = buildMaskImageData(source);
        if (maskData) {
          const maskTimed = await measureAsync(() => imageDataToPngUint8Array(maskData));
          const maskArtifactName = `mindfullens_${baseName}_${sizeProfile}_mask.png`;
          zip.file(maskArtifactName, maskTimed.result, { binary: true });
          manifestEntries.push(
            await buildFilmLabExportManifestArtifactRow({
              sourceName: file.name,
              variant: 'mask',
              artifactRole: 'aux-mask',
              fileName: maskArtifactName,
              mimeType: 'image/png',
              bytes: maskTimed.result,
              exportSessionId,
              pipelineKind,
              sha256HexFromBytes,
            })
          );
          if (includeRecipeJson && typeof buildRecipeObject === 'function') {
            const maskRecipeObject = buildRecipeObject({
              fileName: file.name,
              sizeProfile,
              fileFormat: rasterFormatForSidecars,
              variant: 'mask',
              artifactName: maskArtifactName,
              artifactMimeType: 'image/png',
            });
            if (maskRecipeObject && typeof maskRecipeObject === 'object') {
              const maskRecipeBytes = new TextEncoder().encode(JSON.stringify(maskRecipeObject, null, 2));
              zip.file(`mindfullens_${baseName}_${sizeProfile}_mask_recipe.json`, maskRecipeBytes, {
                binary: true,
              });
              manifestEntries.push(
                await buildFilmLabExportManifestArtifactRow({
                  sourceName: file.name,
                  variant: 'mask_recipe',
                  artifactRole: 'sidecar',
                  fileName: `mindfullens_${baseName}_${sizeProfile}_mask_recipe.json`,
                  mimeType: 'application/json',
                  bytes: maskRecipeBytes,
                  exportSessionId,
                  pipelineKind,
                  sha256HexFromBytes,
                })
              );
            }
          }
        }
      }

      if (includeRecipeJson && typeof buildRecipeObject === 'function') {
        const recipeObject = buildRecipeObject({
          fileName: file.name,
          sizeProfile,
          fileFormat: normalizedFormat,
          variant: 'after',
          artifactName: outputName,
          artifactMimeType: encoded.mimeType,
        });
        if (recipeObject && typeof recipeObject === 'object') {
          const recipeBytes = new TextEncoder().encode(JSON.stringify(recipeObject, null, 2));
          zip.file(`mindfullens_${baseName}_${sizeProfile}_after_recipe.json`, recipeBytes, { binary: true });
          manifestEntries.push(
            await buildFilmLabExportManifestArtifactRow({
              sourceName: file.name,
              variant: 'after_recipe',
              artifactRole: 'sidecar',
              fileName: `mindfullens_${baseName}_${sizeProfile}_after_recipe.json`,
              mimeType: 'application/json',
              bytes: recipeBytes,
              exportSessionId,
              pipelineKind,
              sha256HexFromBytes,
            })
          );
        }
      }

      addedCount++;

      if (perfCtx) {
        const fileEndedAt = typeof performance?.now === 'function' ? performance.now() : null;
        recordBatchPerfFile(perfCtx, {
          file: file.name,
          bytes: Number(file.size) || 0,
          ok: true,
          ms: {
            ingestLoad: loadTimed.ms,
            toImageData: convertTimed.ms,
            render: renderTimed.ms,
            encodeExport: encodeTimed.ms,
            total: fileStartedAt == null || fileEndedAt == null ? null : Math.max(0, fileEndedAt - fileStartedAt),
          },
        });
      }
    } catch (error) {
      console.error(`[Batch Error] ${file.name}:`, error);
      onError?.(file.name, error);
      if (perfCtx) {
        const fileEndedAt = typeof performance?.now === 'function' ? performance.now() : null;
        recordBatchPerfFile(perfCtx, {
          file: file.name,
          bytes: Number(file.size) || 0,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          ms: {
            total: fileStartedAt == null || fileEndedAt == null ? null : Math.max(0, fileEndedAt - fileStartedAt),
          },
        });
      }
    } finally {
      // 6. Free memory aggressively
      renderable?.close?.();
      if (exportCanvas) {
        exportCanvas.width = 1;
        exportCanvas.height = 1;
      }
    }
  }

  if (signal?.aborted || addedCount === 0) {
    if (addedCount === 0 && !signal?.aborted) {
      console.warn('[Batch] Process completed but no files were added to ZIP.');
    }
    logBatchPerfSummary(perfCtx, { zipMs: null, addedCount, aborted: Boolean(signal?.aborted) });
    onComplete?.();
    return;
  }

  const batchManifestLossyQ = manifestLossyQualityForFilmLabExport(normalizedFormat, lossyQuality);
  const batchManifest = {
    ...buildFilmLabExportManifestRootBase({
      moduleName: 'batchProcessor.processBatch',
      mode: 'batch',
      exportSessionId,
      artifactEntries: manifestEntries,
      serviceBuildTag: SERVICE_BUILD_TAG,
      serviceBuildLabel: SERVICE_BUILD_LABEL,
      viewportBuildMarker: VIEWPORT_BUILD_MARKER,
    }),
    export: {
      sizeProfile,
      fileFormat: normalizedFormat,
      pipelineKind,
      includeLocalMaskPng,
      includeBeforeAfter,
      includeRecipeJson,
      totalSources: total,
      exportedSources: addedCount,
      ...(batchManifestLossyQ !== undefined ? { lossyQuality: batchManifestLossyQ } : {}),
    },
  };
  await attachFilmLabExportManifestDigest(batchManifest, { sha256HexFromBytes });
  zip.file(
    `mindfullens_batch_${sizeProfile}_manifest.json`,
    new TextEncoder().encode(JSON.stringify(batchManifest, null, 2)),
    { binary: true }
  );

  // Generate ZIP and trigger download
  onProgress?.(total, total, 'Pakowanie ZIP...');

  try {
    const zipTimed = await measureAsync(() =>
      zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 1 }, // Fast compression — JPEGs are already compressed
      })
    );
    const zipBlob = zipTimed.result;
    const zipMs = zipTimed.ms;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(zipBlob);
    link.download = `mindfullens_batch_${sizeProfile}_${Date.now()}.zip`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    }, 200);

    logBatchPerfSummary(perfCtx, { zipMs, addedCount, aborted: false });
    onComplete?.();
  } catch (error) {
    logBatchPerfSummary(perfCtx, { zipMs: null, addedCount, aborted: false });
    onError?.('ZIP generation', error);
  }
}
