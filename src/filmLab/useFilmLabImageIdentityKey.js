import { useMemo } from 'react';
import { buildImageIdentityKey } from './runtimeEnv.js';

export function useFilmLabImageIdentityKey({ uploadedFile, imageMeta }) {
  const imageIdentityKey = useMemo(
    () => buildImageIdentityKey(uploadedFile, imageMeta),
    [
      imageMeta?.height,
      imageMeta?.previewHeight,
      imageMeta?.previewWidth,
      imageMeta?.width,
      uploadedFile?.lastModified,
      uploadedFile?.name,
      uploadedFile?.size,
    ]
  );

  return { imageIdentityKey };
}
