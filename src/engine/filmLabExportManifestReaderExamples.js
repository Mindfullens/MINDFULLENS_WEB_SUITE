/**
 * Static blueprint objects for external tools that validate export manifests.
 * Placeholders only — not tied to a real session; shapes match live emitters.
 */

import {
  FILM_LAB_EXPORT_MANIFEST_PROFILE,
  FILM_LAB_EXPORT_MANIFEST_SCHEMA,
} from './filmLabExportManifestConstants.js';

export const FILM_LAB_EXPORT_MANIFEST_DIGEST_READER_EXAMPLES = {
  schemaHint: {
    schema: FILM_LAB_EXPORT_MANIFEST_SCHEMA,
    profile: FILM_LAB_EXPORT_MANIFEST_PROFILE,
    examplesVersion: 1,
  },
  notes: [
    'Live manifests add compat, generator, capabilities, build, film (single), counts, and full artifacts[]; hash the JSON body after removing manifestDigest only.',
    'optionalScenarios show minimal examples when includeBeforeAfter/includeLocalMaskPng/includeRecipeJson are enabled.',
    'optionalScenarios artifacts are intentionally minimal: variant, artifactRole, fileName, mimeType only (no byteLength/sha256/exportSessionId/pipelineKind); stable source order starts with variant.',
    'contract matrix (text): minimal optional artifact -> stable keys variant+artifactRole+fileName+mimeType | full artifactRow -> append canonical runtime tail byteLength+sha256+exportSessionId+pipelineKind.',
    'migration: historical exports may list variant before with artifactRole primary; canonical contract uses sidecar (identify by variant=before, not by role).',
    'validatorFlow: clone manifest -> remove manifestDigest -> JSON.stringify with 2-space indent -> UTF-8 encode -> SHA-256 -> compare with manifest.manifestDigest.sha256.',
    'validatorFlow: verify artifacts[*].variant/artifactRole/fileName/mimeType exist, then check optionalScenarios by export flags and fileFormat.',
    'optionalScenarios export.fileFormat (when present) must be a member of FILM_LAB_EXPORT_MANIFEST_OPTIONAL_SCENARIO_FILE_FORMAT_IDS in filmLabExportFormats.js (raster codecs + psd + dng; UI encoder uses FILM_LAB_EXPORT_MODAL_FORMAT_IDS).',
    'optionalScenarios may include export.lossyQuality (0.35–1) alongside fileFormat for JPEG/WebP/AVIF digest blueprints (*WithLossyQuality); sorted export keys append lossyQuality after include* flags.',
    'JPEG/WebP/AVIF digest rows may omit lossyQuality when documenting encoder-default quality (*NoRecipe without WithLossyQuality); validators accept either shape.',
    'Live manifest.export and recipe export.export may add lossyQuality (0.35–1) for JPEG/WebP/AVIF via manifestLossyQualityForFilmLabExport; omitted for PNG/TIFF.',
    'optionalScenarios for PSD (*Psd* names): primary artifact mimeType application/vnd.adobe.photoshop; no lossyQuality on export (same as PNG/TIFF).',
    'PSD + includeBeforeAfter digest: before sidecar is image/jpeg (matches Film Lab rasterFf when primary is PSD).',
    'PSD + includeBeforeAfter + includeRecipeJson: runtime also emits before_recipe.json (variant before_recipe) after the before image, then after_recipe.json (useFilmLabEngine.exportImage / batchProcessor).',
    'PSD + includeLocalMaskPng: mask sidecar is always image/png (same as raster); with includeRecipeJson runtime adds mask_recipe.json then after_recipe.json after the mask block.',
    'PSD + before + mask + includeRecipeJson: artifact order is after (PSD), before (JPEG), before_recipe, mask (PNG), mask_recipe, after_recipe (useFilmLabEngine.exportImage / batchProcessor).',
  ],
  artifactRowPrimary: {
    variant: 'after',
    artifactRole: 'primary',
    fileName: 'mindfullens_example_after.jpg',
    mimeType: 'image/jpeg',
    byteLength: 2048000,
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    exportSessionId: '00000000-0000-4000-8000-000000000000',
    pipelineKind: 'webgl2',
  },
  artifactRowSidecarRecipe: {
    variant: 'after_recipe',
    artifactRole: 'sidecar',
    fileName: 'mindfullens_example_after_recipe.json',
    mimeType: 'application/json',
    byteLength: 4096,
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    exportSessionId: '00000000-0000-4000-8000-000000000000',
    pipelineKind: 'webgl2',
  },
  artifactRowAuxMask: {
    variant: 'mask',
    artifactRole: 'aux-mask',
    fileName: 'mindfullens_example_mask.png',
    mimeType: 'image/png',
    byteLength: 512000,
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    exportSessionId: '00000000-0000-4000-8000-000000000000',
    pipelineKind: 'webgl2',
  },
  singleModeRootBeforeDigest: {
    schema: FILM_LAB_EXPORT_MANIFEST_SCHEMA,
    manifestVersion: 1,
    manifestProfile: FILM_LAB_EXPORT_MANIFEST_PROFILE,
    mode: 'single',
    exportSessionId: '00000000-0000-4000-8000-000000000000',
    export: {
      sizeProfile: 'full',
      fileFormat: 'jpeg',
      pipelineKind: 'webgl2',
      includeLocalMaskPng: false,
      includeBeforeAfter: false,
      includeRecipeJson: true,
    },
    artifacts: [],
  },
  batchModeRootBeforeDigest: {
    schema: FILM_LAB_EXPORT_MANIFEST_SCHEMA,
    manifestVersion: 1,
    manifestProfile: FILM_LAB_EXPORT_MANIFEST_PROFILE,
    mode: 'batch',
    exportSessionId: '00000000-0000-4000-8000-000000000000',
    export: {
      sizeProfile: 'full',
      fileFormat: 'jpeg',
      pipelineKind: 'webgl2',
      includeLocalMaskPng: false,
      includeBeforeAfter: false,
      includeRecipeJson: true,
      totalSources: 10,
      exportedSources: 10,
    },
    artifacts: [],
  },
  optionalScenarios: {
    singleAvifNoRecipe: {
      mode: 'single',
      export: {
        includeBeforeAfter: false,
        includeLocalMaskPng: false,
        includeRecipeJson: false,
        fileFormat: 'avif',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_example_after.avif',
          mimeType: 'image/avif',
        },
      ],
    },
    singleAvifWithLossyQuality: {
      mode: 'single',
      export: {
        includeBeforeAfter: false,
        includeLocalMaskPng: false,
        includeRecipeJson: false,
        fileFormat: 'avif',
        lossyQuality: 0.88,
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_example_after.avif',
          mimeType: 'image/avif',
        },
      ],
    },
    singleJpegNoRecipe: {
      mode: 'single',
      export: {
        includeBeforeAfter: false,
        includeLocalMaskPng: false,
        includeRecipeJson: false,
        fileFormat: 'jpeg',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_example_after.jpg',
          mimeType: 'image/jpeg',
        },
      ],
    },
    singlePsdNoRecipe: {
      mode: 'single',
      export: {
        includeBeforeAfter: false,
        includeLocalMaskPng: false,
        includeRecipeJson: false,
        fileFormat: 'psd',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_example_after.psd',
          mimeType: 'application/vnd.adobe.photoshop',
        },
      ],
    },
    singleDngNoRecipe: {
      mode: 'single',
      export: {
        includeBeforeAfter: false,
        includeLocalMaskPng: false,
        includeRecipeJson: false,
        fileFormat: 'dng',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_example_after.dng',
          mimeType: 'image/x-adobe-dng',
        },
      ],
    },
    singlePsdWithRecipe: {
      mode: 'single',
      export: {
        includeBeforeAfter: false,
        includeLocalMaskPng: false,
        includeRecipeJson: true,
        fileFormat: 'psd',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_example_after.psd',
          mimeType: 'application/vnd.adobe.photoshop',
        },
        {
          variant: 'after_recipe',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_example_after_recipe.json',
          mimeType: 'application/json',
        },
      ],
    },
    singleDngWithRecipe: {
      mode: 'single',
      export: {
        includeBeforeAfter: false,
        includeLocalMaskPng: false,
        includeRecipeJson: true,
        fileFormat: 'dng',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_example_after.dng',
          mimeType: 'image/x-adobe-dng',
        },
        {
          variant: 'after_recipe',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_example_after_recipe.json',
          mimeType: 'application/json',
        },
      ],
    },
    singleJpegWithLossyQualityNoRecipe: {
      mode: 'single',
      export: {
        includeBeforeAfter: false,
        includeLocalMaskPng: false,
        includeRecipeJson: false,
        fileFormat: 'jpeg',
        lossyQuality: 0.92,
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_example_after.jpg',
          mimeType: 'image/jpeg',
        },
      ],
    },
    singleTiffWithRecipe: {
      mode: 'single',
      export: {
        includeBeforeAfter: false,
        includeLocalMaskPng: false,
        includeRecipeJson: true,
        fileFormat: 'tiff',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_example_after.tiff',
          mimeType: 'image/tiff',
        },
        {
          variant: 'after_recipe',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_example_after_recipe.json',
          mimeType: 'application/json',
        },
      ],
    },
    batchAvifNoRecipe: {
      mode: 'batch',
      export: {
        includeBeforeAfter: false,
        includeLocalMaskPng: false,
        includeRecipeJson: false,
        fileFormat: 'avif',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_frame_001_after.avif',
          mimeType: 'image/avif',
        },
      ],
    },
    batchAvifWithLossyQualityNoRecipe: {
      mode: 'batch',
      export: {
        includeBeforeAfter: false,
        includeLocalMaskPng: false,
        includeRecipeJson: false,
        fileFormat: 'avif',
        lossyQuality: 0.88,
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_frame_001_after.avif',
          mimeType: 'image/avif',
        },
      ],
    },
    batchJpegNoRecipe: {
      mode: 'batch',
      export: {
        includeBeforeAfter: false,
        includeLocalMaskPng: false,
        includeRecipeJson: false,
        fileFormat: 'jpeg',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_frame_001_after.jpg',
          mimeType: 'image/jpeg',
        },
      ],
    },
    batchPsdNoRecipe: {
      mode: 'batch',
      export: {
        includeBeforeAfter: false,
        includeLocalMaskPng: false,
        includeRecipeJson: false,
        fileFormat: 'psd',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_frame_001_after.psd',
          mimeType: 'application/vnd.adobe.photoshop',
        },
      ],
    },
    batchDngNoRecipe: {
      mode: 'batch',
      export: {
        includeBeforeAfter: false,
        includeLocalMaskPng: false,
        includeRecipeJson: false,
        fileFormat: 'dng',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_frame_001_after.dng',
          mimeType: 'image/x-adobe-dng',
        },
      ],
    },
    batchPsdWithRecipe: {
      mode: 'batch',
      export: {
        includeBeforeAfter: false,
        includeLocalMaskPng: false,
        includeRecipeJson: true,
        fileFormat: 'psd',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_frame_001_after.psd',
          mimeType: 'application/vnd.adobe.photoshop',
        },
        {
          variant: 'after_recipe',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_frame_001_after_recipe.json',
          mimeType: 'application/json',
        },
      ],
    },
    batchDngWithRecipe: {
      mode: 'batch',
      export: {
        includeBeforeAfter: false,
        includeLocalMaskPng: false,
        includeRecipeJson: true,
        fileFormat: 'dng',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_frame_001_after.dng',
          mimeType: 'image/x-adobe-dng',
        },
        {
          variant: 'after_recipe',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_frame_001_after_recipe.json',
          mimeType: 'application/json',
        },
      ],
    },
    batchJpegWithLossyQualityNoRecipe: {
      mode: 'batch',
      export: {
        includeBeforeAfter: false,
        includeLocalMaskPng: false,
        includeRecipeJson: false,
        fileFormat: 'jpeg',
        lossyQuality: 0.92,
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_frame_001_after.jpg',
          mimeType: 'image/jpeg',
        },
      ],
    },
    batchTiffWithRecipe: {
      mode: 'batch',
      export: {
        includeBeforeAfter: false,
        includeLocalMaskPng: false,
        includeRecipeJson: true,
        fileFormat: 'tiff',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_frame_001_after.tiff',
          mimeType: 'image/tiff',
        },
        {
          variant: 'after_recipe',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_frame_001_after_recipe.json',
          mimeType: 'application/json',
        },
      ],
    },
    singleWebpNoRecipe: {
      mode: 'single',
      export: {
        includeBeforeAfter: false,
        includeLocalMaskPng: false,
        includeRecipeJson: false,
        fileFormat: 'webp',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_example_after.webp',
          mimeType: 'image/webp',
        },
      ],
    },
    batchWebpNoRecipe: {
      mode: 'batch',
      export: {
        includeBeforeAfter: false,
        includeLocalMaskPng: false,
        includeRecipeJson: false,
        fileFormat: 'webp',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_frame_001_after.webp',
          mimeType: 'image/webp',
        },
      ],
    },
    batchWebpWithLossyQualityNoRecipe: {
      mode: 'batch',
      export: {
        includeBeforeAfter: false,
        includeLocalMaskPng: false,
        includeRecipeJson: false,
        fileFormat: 'webp',
        lossyQuality: 0.78,
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_frame_001_after.webp',
          mimeType: 'image/webp',
        },
      ],
    },
    singleWithBeforeMaskRecipe: {
      mode: 'single',
      export: {
        includeBeforeAfter: true,
        includeLocalMaskPng: true,
        includeRecipeJson: true,
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_example_after.jpg',
          mimeType: 'image/jpeg',
        },
        {
          variant: 'before',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_example_before.jpg',
          mimeType: 'image/jpeg',
        },
        {
          variant: 'mask',
          artifactRole: 'aux-mask',
          fileName: 'mindfullens_example_mask.png',
          mimeType: 'image/png',
        },
        {
          variant: 'after_recipe',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_example_after_recipe.json',
          mimeType: 'application/json',
        },
      ],
    },
    batchWithBeforeMaskRecipe: {
      mode: 'batch',
      export: {
        includeBeforeAfter: true,
        includeLocalMaskPng: true,
        includeRecipeJson: true,
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_frame_001_after.jpg',
          mimeType: 'image/jpeg',
        },
        {
          variant: 'before',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_frame_001_before.jpg',
          mimeType: 'image/jpeg',
        },
        {
          variant: 'mask',
          artifactRole: 'aux-mask',
          fileName: 'mindfullens_frame_001_mask.png',
          mimeType: 'image/png',
        },
        {
          variant: 'after_recipe',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_frame_001_after_recipe.json',
          mimeType: 'application/json',
        },
      ],
    },
    singlePngWithBeforeNoRecipe: {
      mode: 'single',
      export: {
        includeBeforeAfter: true,
        includeLocalMaskPng: false,
        includeRecipeJson: false,
        fileFormat: 'png',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_example_after.png',
          mimeType: 'image/png',
        },
        {
          variant: 'before',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_example_before.png',
          mimeType: 'image/png',
        },
      ],
    },
    batchPngWithBeforeNoRecipe: {
      mode: 'batch',
      export: {
        includeBeforeAfter: true,
        includeLocalMaskPng: false,
        includeRecipeJson: false,
        fileFormat: 'png',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_frame_001_after.png',
          mimeType: 'image/png',
        },
        {
          variant: 'before',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_frame_001_before.png',
          mimeType: 'image/png',
        },
      ],
    },
    singleAvifWithBeforeNoRecipe: {
      mode: 'single',
      export: {
        includeBeforeAfter: true,
        includeLocalMaskPng: false,
        includeRecipeJson: false,
        fileFormat: 'avif',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_example_after.avif',
          mimeType: 'image/avif',
        },
        {
          variant: 'before',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_example_before.avif',
          mimeType: 'image/avif',
        },
      ],
    },
    batchAvifWithBeforeNoRecipe: {
      mode: 'batch',
      export: {
        includeBeforeAfter: true,
        includeLocalMaskPng: false,
        includeRecipeJson: false,
        fileFormat: 'avif',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_frame_001_after.avif',
          mimeType: 'image/avif',
        },
        {
          variant: 'before',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_frame_001_before.avif',
          mimeType: 'image/avif',
        },
      ],
    },
    singleTiffWithBeforeNoRecipe: {
      mode: 'single',
      export: {
        includeBeforeAfter: true,
        includeLocalMaskPng: false,
        includeRecipeJson: false,
        fileFormat: 'tiff',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_example_after.tiff',
          mimeType: 'image/tiff',
        },
        {
          variant: 'before',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_example_before.tiff',
          mimeType: 'image/tiff',
        },
      ],
    },
    batchTiffWithBeforeNoRecipe: {
      mode: 'batch',
      export: {
        includeBeforeAfter: true,
        includeLocalMaskPng: false,
        includeRecipeJson: false,
        fileFormat: 'tiff',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_frame_001_after.tiff',
          mimeType: 'image/tiff',
        },
        {
          variant: 'before',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_frame_001_before.tiff',
          mimeType: 'image/tiff',
        },
      ],
    },
    singleWebpWithBeforeNoRecipe: {
      mode: 'single',
      export: {
        includeBeforeAfter: true,
        includeLocalMaskPng: false,
        includeRecipeJson: false,
        fileFormat: 'webp',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_example_after.webp',
          mimeType: 'image/webp',
        },
        {
          variant: 'before',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_example_before.webp',
          mimeType: 'image/webp',
        },
      ],
    },
    batchWebpWithBeforeNoRecipe: {
      mode: 'batch',
      export: {
        includeBeforeAfter: true,
        includeLocalMaskPng: false,
        includeRecipeJson: false,
        fileFormat: 'webp',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_frame_001_after.webp',
          mimeType: 'image/webp',
        },
        {
          variant: 'before',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_frame_001_before.webp',
          mimeType: 'image/webp',
        },
      ],
    },
    singlePsdWithBeforeNoRecipe: {
      mode: 'single',
      export: {
        includeBeforeAfter: true,
        includeLocalMaskPng: false,
        includeRecipeJson: false,
        fileFormat: 'psd',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_example_after.psd',
          mimeType: 'application/vnd.adobe.photoshop',
        },
        {
          variant: 'before',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_example_before.jpg',
          mimeType: 'image/jpeg',
        },
      ],
    },
    batchPsdWithBeforeNoRecipe: {
      mode: 'batch',
      export: {
        includeBeforeAfter: true,
        includeLocalMaskPng: false,
        includeRecipeJson: false,
        fileFormat: 'psd',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_frame_001_after.psd',
          mimeType: 'application/vnd.adobe.photoshop',
        },
        {
          variant: 'before',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_frame_001_before.jpg',
          mimeType: 'image/jpeg',
        },
      ],
    },
    singlePsdWithBeforeAndRecipe: {
      mode: 'single',
      export: {
        includeBeforeAfter: true,
        includeLocalMaskPng: false,
        includeRecipeJson: true,
        fileFormat: 'psd',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_example_after.psd',
          mimeType: 'application/vnd.adobe.photoshop',
        },
        {
          variant: 'before',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_example_before.jpg',
          mimeType: 'image/jpeg',
        },
        {
          variant: 'before_recipe',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_example_before_recipe.json',
          mimeType: 'application/json',
        },
        {
          variant: 'after_recipe',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_example_after_recipe.json',
          mimeType: 'application/json',
        },
      ],
    },
    batchPsdWithBeforeAndRecipe: {
      mode: 'batch',
      export: {
        includeBeforeAfter: true,
        includeLocalMaskPng: false,
        includeRecipeJson: true,
        fileFormat: 'psd',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_frame_001_after.psd',
          mimeType: 'application/vnd.adobe.photoshop',
        },
        {
          variant: 'before',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_frame_001_before.jpg',
          mimeType: 'image/jpeg',
        },
        {
          variant: 'before_recipe',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_frame_001_before_recipe.json',
          mimeType: 'application/json',
        },
        {
          variant: 'after_recipe',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_frame_001_after_recipe.json',
          mimeType: 'application/json',
        },
      ],
    },
    singlePsdWithMaskNoRecipe: {
      mode: 'single',
      export: {
        includeBeforeAfter: false,
        includeLocalMaskPng: true,
        includeRecipeJson: false,
        fileFormat: 'psd',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_example_after.psd',
          mimeType: 'application/vnd.adobe.photoshop',
        },
        {
          variant: 'mask',
          artifactRole: 'aux-mask',
          fileName: 'mindfullens_example_mask.png',
          mimeType: 'image/png',
        },
      ],
    },
    batchPsdWithMaskNoRecipe: {
      mode: 'batch',
      export: {
        includeBeforeAfter: false,
        includeLocalMaskPng: true,
        includeRecipeJson: false,
        fileFormat: 'psd',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_frame_001_after.psd',
          mimeType: 'application/vnd.adobe.photoshop',
        },
        {
          variant: 'mask',
          artifactRole: 'aux-mask',
          fileName: 'mindfullens_frame_001_mask.png',
          mimeType: 'image/png',
        },
      ],
    },
    singlePsdWithMaskAndRecipe: {
      mode: 'single',
      export: {
        includeBeforeAfter: false,
        includeLocalMaskPng: true,
        includeRecipeJson: true,
        fileFormat: 'psd',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_example_after.psd',
          mimeType: 'application/vnd.adobe.photoshop',
        },
        {
          variant: 'mask',
          artifactRole: 'aux-mask',
          fileName: 'mindfullens_example_mask.png',
          mimeType: 'image/png',
        },
        {
          variant: 'mask_recipe',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_example_mask_recipe.json',
          mimeType: 'application/json',
        },
        {
          variant: 'after_recipe',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_example_after_recipe.json',
          mimeType: 'application/json',
        },
      ],
    },
    batchPsdWithMaskAndRecipe: {
      mode: 'batch',
      export: {
        includeBeforeAfter: false,
        includeLocalMaskPng: true,
        includeRecipeJson: true,
        fileFormat: 'psd',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_frame_001_after.psd',
          mimeType: 'application/vnd.adobe.photoshop',
        },
        {
          variant: 'mask',
          artifactRole: 'aux-mask',
          fileName: 'mindfullens_frame_001_mask.png',
          mimeType: 'image/png',
        },
        {
          variant: 'mask_recipe',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_frame_001_mask_recipe.json',
          mimeType: 'application/json',
        },
        {
          variant: 'after_recipe',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_frame_001_after_recipe.json',
          mimeType: 'application/json',
        },
      ],
    },
    singlePsdWithBeforeWithMaskAndRecipe: {
      mode: 'single',
      export: {
        includeBeforeAfter: true,
        includeLocalMaskPng: true,
        includeRecipeJson: true,
        fileFormat: 'psd',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_example_after.psd',
          mimeType: 'application/vnd.adobe.photoshop',
        },
        {
          variant: 'before',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_example_before.jpg',
          mimeType: 'image/jpeg',
        },
        {
          variant: 'before_recipe',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_example_before_recipe.json',
          mimeType: 'application/json',
        },
        {
          variant: 'mask',
          artifactRole: 'aux-mask',
          fileName: 'mindfullens_example_mask.png',
          mimeType: 'image/png',
        },
        {
          variant: 'mask_recipe',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_example_mask_recipe.json',
          mimeType: 'application/json',
        },
        {
          variant: 'after_recipe',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_example_after_recipe.json',
          mimeType: 'application/json',
        },
      ],
    },
    batchPsdWithBeforeWithMaskAndRecipe: {
      mode: 'batch',
      export: {
        includeBeforeAfter: true,
        includeLocalMaskPng: true,
        includeRecipeJson: true,
        fileFormat: 'psd',
      },
      artifacts: [
        {
          variant: 'after',
          artifactRole: 'primary',
          fileName: 'mindfullens_frame_001_after.psd',
          mimeType: 'application/vnd.adobe.photoshop',
        },
        {
          variant: 'before',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_frame_001_before.jpg',
          mimeType: 'image/jpeg',
        },
        {
          variant: 'before_recipe',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_frame_001_before_recipe.json',
          mimeType: 'application/json',
        },
        {
          variant: 'mask',
          artifactRole: 'aux-mask',
          fileName: 'mindfullens_frame_001_mask.png',
          mimeType: 'image/png',
        },
        {
          variant: 'mask_recipe',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_frame_001_mask_recipe.json',
          mimeType: 'application/json',
        },
        {
          variant: 'after_recipe',
          artifactRole: 'sidecar',
          fileName: 'mindfullens_frame_001_after_recipe.json',
          mimeType: 'application/json',
        },
      ],
    },
  },
};
