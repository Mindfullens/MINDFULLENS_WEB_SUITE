/**
 * Batch Processor — Sequential multi-file rendering with ZIP output.
 *
 * Loads each file from a FileList, renders it through the full Film-Lab
 * pipeline (renderToContext → Output Sharpening → EXIF), collects every
 * resulting JPEG into a JSZip archive, and triggers a single browser
 * download when the batch is complete.
 */

// JSZip is loaded lazily to avoid blocking the render pipeline with ~256KB
import piexif from 'piexifjs';
import { applyOutputSharpening } from './outputSharpening.js';
import { ingestUploadSource } from './pipeline/ingestSource.js';
import { buildBatchPerfContext, logBatchPerfSummary, measureAsync, recordBatchPerfFile, IS_BATCH_PERF_ENABLED } from './batchPerf.js';

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
 * Convert a rendered canvas to a JPEG Blob with EXIF metadata
 */
function canvasToExifJpeg(canvas, context, filmName, sharpeningStrength = 0.42, sizeProfile = 'full') {
  // Output Sharpening
  applyOutputSharpening(context, canvas.width, canvas.height, sharpeningStrength);

  // Base64 JPEG
  const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95);

  let finalDataUrl = jpegDataUrl;
  try {
    const zeroth = {};
    const exifIfd = {};
    zeroth[piexif.ImageIFD.Make] = 'MindfulLens';
    zeroth[piexif.ImageIFD.Model] = 'Film-Lab Web Engine';
    zeroth[piexif.ImageIFD.Software] = 'MindfulLens Film-Lab v1.0';
    zeroth[piexif.ImageIFD.ImageDescription] = `Film profile: ${filmName} | Size: ${sizeProfile}`;
    zeroth[piexif.ImageIFD.Copyright] = 'Processed with MindfulLens Film-Lab';
    zeroth[piexif.ImageIFD.Artist] = 'MindfulLens User';
    zeroth[piexif.ImageIFD.Orientation] = 1;
    exifIfd[piexif.ExifIFD.DateTimeOriginal] = new Date()
      .toISOString()
      .replace('T', ' ')
      .slice(0, 19);
    exifIfd[piexif.ExifIFD.UserComment] = `Batch export | Profile: ${filmName} | Mode: ${sizeProfile}`;

    const exifBytes = piexif.dump({ '0th': zeroth, Exif: exifIfd });
    finalDataUrl = piexif.insert(exifBytes, jpegDataUrl);
  } catch (error) {
    console.warn('[Batch] EXIF insertion failed, using original JPEG:', error);
  }

  // Convert base64 → binary Uint8Array (JSZip handles this better than Blob in some cases)
  const byteString = atob(finalDataUrl.split(',')[1]);
  const buffer = new ArrayBuffer(byteString.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < byteString.length; i++) {
    view[i] = byteString.charCodeAt(i);
  }
  return view;
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

  let addedCount = 0;

  for (let i = 0; i < total; i++) {
    if (signal?.aborted) {
      break;
    }

    const file = files[i];
    const baseName = file.name.replace(/\.[^.]+$/, '');
    const outputName = `mindfullens_${baseName}_${sizeProfile}.jpg`;
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

      const renderTimed = await measureAsync(() =>
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

      // 4. Sharpen + EXIF → JPEG binary
      const encodeTimed = await measureAsync(() =>
        Promise.resolve(canvasToExifJpeg(exportCanvas, exportContext, filmName, sharpeningStrength, sizeProfile))
      );
      const jpegBinary = encodeTimed.result;

      // 5. Add to ZIP
      zip.file(outputName, jpegBinary, { binary: true });
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
            encodeJpeg: encodeTimed.ms,
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
