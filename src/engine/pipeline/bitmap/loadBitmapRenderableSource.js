export async function loadBitmapRenderableSource(
  uploadedFile,
  uploadedImage,
  _options = {}
) {
  if (
    uploadedFile &&
    typeof window !== 'undefined' &&
    'createImageBitmap' in window
  ) {
    try {
      const image = await window.createImageBitmap(uploadedFile, {
        imageOrientation: 'from-image',
        colorSpaceConversion: 'default',
        premultiplyAlpha: 'none',
      });

      return {
        image,
        close() {
          if (typeof image.close === 'function') {
            image.close();
          }
        },
      };
    } catch (_error) {
      // Fall back to HTMLImageElement when the browser cannot decode the file.
    }
  }

  const objectUrl = uploadedFile instanceof Blob ? URL.createObjectURL(uploadedFile) : null;
  const imageSrc = objectUrl ?? uploadedImage;

  if (!imageSrc) {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
    throw new Error('Bitmap source is missing image URL.');
  }

  let image = null;
  try {
    image = await new Promise((resolve, reject) => {
      const htmlImage = new Image();
      htmlImage.decoding = 'async';
      htmlImage.loading = 'eager';
      htmlImage.fetchPriority = 'high';
      htmlImage.onload = () => resolve(htmlImage);
      htmlImage.onerror = () => {
        reject(new Error('Failed to decode bitmap source via HTMLImage.'));
      };
      htmlImage.src = imageSrc;
    });
  } catch (error) {
    const causeMessage = error instanceof Error ? error.message : String(error || 'unknown decode error');
    throw new Error(`Bitmap decode fallback failed: ${causeMessage}`);
  }

  return {
    image,
    close() {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    },
  };
}

async function decodeBlobViaCreateImageBitmap(blob) {
  if (typeof window === 'undefined' || !('createImageBitmap' in window)) {
    throw new Error('createImageBitmap is unavailable in this environment.');
  }
  const image = await window.createImageBitmap(blob, {
    imageOrientation: 'from-image',
    colorSpaceConversion: 'default',
    premultiplyAlpha: 'none',
  });
  return {
    image,
    close() {
      if (typeof image.close === 'function') {
        image.close();
      }
    },
  };
}

async function decodeBlobViaHtmlImage(blob) {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise((resolve, reject) => {
      const htmlImage = new Image();
      htmlImage.decoding = 'async';
      htmlImage.onload = () => resolve(htmlImage);
      htmlImage.onerror = () => {
        reject(
          new Error(
            `Failed to decode bitmap blob via HTMLImage. Blob type="${blob?.type || 'unknown'}", size=${blob?.size ?? 0}`
          )
        );
      };
      htmlImage.src = objectUrl;
    });
    return {
      image,
      close() {
        URL.revokeObjectURL(objectUrl);
      },
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export async function loadBitmapRenderableBlob(blob, options = {}) {
  const preferHtmlImage = Boolean(options?.preferHtmlImage);

  const attempts = preferHtmlImage
    ? [decodeBlobViaHtmlImage, decodeBlobViaCreateImageBitmap]
    : [decodeBlobViaCreateImageBitmap, decodeBlobViaHtmlImage];

  const failures = [];
  for (const attempt of attempts) {
    try {
      return await attempt(blob);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(
    `Blob decode failed (type="${blob?.type || 'unknown'}", size=${blob?.size ?? 0}). Reasons: ${failures.join(' | ')}`
  );
}
