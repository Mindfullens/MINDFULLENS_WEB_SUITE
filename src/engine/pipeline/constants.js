export const SOURCE_KIND = {
  NONE: 'none',
  BITMAP: 'bitmap',
  RAW: 'raw',
  UNKNOWN: 'unknown',
};

export const PIPELINE_KIND = {
  BITMAP: 'bitmap',
  RAW: 'raw',
};

export const PIPELINE_STATUS = {
  IDLE: 'idle',
  READY: 'ready',
  DECODER_MISSING: 'decoder-missing',
  ERROR: 'error',
};

export const RAW_EXTENSIONS = new Set([
  'raw',
  'dng',
  'nef',
  'nrw',
  'cr2',
  'cr3',
  'arw',
  'srw',
  'srf',
  'sr2',
  'dcr',
  'raf',
  'rwl',
  'rw2',
  'mef',
  'orf',
  'pef',
  'iiq',
  '3fr',
  'erf',
  'fff',
  'kdc',
  'mos',
  'mrw',
  'x3f',
]);

export const BITMAP_EXTENSIONS = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'heic',
  'heif',
  'gif',
  'bmp',
  'avif',
  'tif',
  'tiff',
]);

export const FILE_INPUT_ACCEPT =
  'image/jpeg,image/png,image/webp,image/tiff,image/avif,image/heic,image/heif,.raw,.dng,.nef,.nrw,.cr2,.cr3,.arw,.srw,.srf,.sr2,.dcr,.raf,.rwl,.rw2,.mef,.orf,.pef,.iiq,.3fr,.erf,.fff,.kdc,.mos,.mrw,.x3f,.heic,.heif';

export function getFileExtension(filename = '') {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() ?? '' : '';
}

export function detectSourceKind(file) {
  if (!file) {
    return SOURCE_KIND.NONE;
  }

  const extension = getFileExtension(file.name);

  if (RAW_EXTENSIONS.has(extension)) {
    return SOURCE_KIND.RAW;
  }

  if (BITMAP_EXTENSIONS.has(extension) || file.type.startsWith('image/')) {
    return SOURCE_KIND.BITMAP;
  }

  return SOURCE_KIND.UNKNOWN;
}

export function createIdlePipelineInfo() {
  return {
    sourceKind: SOURCE_KIND.NONE,
    pipelineKind: PIPELINE_KIND.BITMAP,
    status: PIPELINE_STATUS.IDLE,
    message: '',
    capabilities: null,
    fileName: '',
  };
}

export function getPipelineLabel(pipelineInfo) {
  if (!pipelineInfo) {
    return 'Bitmap';
  }

  if (pipelineInfo.pipelineKind === PIPELINE_KIND.RAW) {
    return 'RAW Pipeline';
  }

  return 'Bitmap Pipeline';
}
