import { useEffect } from 'react';
import { parseExifMetadataFromFile } from '../engine/metadata/exifMetadata.js';

/** Load EXIF when `uploadedFile` changes; revoke blob `imageUrl` on change/unmount. */
export function useFilmLabImageSourceEffects({ uploadedFile, imageUrl, setExifMeta }) {
  useEffect(() => {
    let cancelled = false;
    setExifMeta(null);

    if (!uploadedFile) {
      return () => {
        cancelled = true;
      };
    }

    parseExifMetadataFromFile(uploadedFile)
      .then((metadata) => {
        if (!cancelled) {
          setExifMeta(metadata);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setExifMeta(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [uploadedFile]);

  useEffect(() => {
    return () => {
      if (imageUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);
}
