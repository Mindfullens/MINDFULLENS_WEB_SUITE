function formatExifRational(value) {
  if (Array.isArray(value) && value.length === 2) {
    const [num, den] = value;
    const denominator = Number(den);
    const numerator = Number(num);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
      return numerator / denominator;
    }
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  return null;
}

function formatShutterFromExif(value) {
  if (Array.isArray(value) && value.length === 2) {
    const [num, den] = value;
    const n = Number(num);
    const d = Number(den);
    if (Number.isFinite(n) && Number.isFinite(d) && d !== 0) {
      const seconds = n / d;
      if (seconds >= 1) {
        return `${seconds.toFixed(seconds >= 10 ? 0 : 1)} s`;
      }
      const reciprocal = Math.round(1 / seconds);
      return reciprocal > 0 ? `1/${reciprocal} s` : `${seconds.toFixed(3)} s`;
    }
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    if (numeric >= 1) {
      return `${numeric.toFixed(numeric >= 10 ? 0 : 1)} s`;
    }
    const reciprocal = Math.round(1 / numeric);
    return reciprocal > 0 ? `1/${reciprocal} s` : `${numeric.toFixed(3)} s`;
  }
  return '—';
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toCleanString(value) {
  if (value == null) {
    return null;
  }
  const normalized = String(value).replace(/\0/g, '').trim();
  return normalized.length ? normalized : null;
}

function firstNonNull(...values) {
  for (const value of values) {
    if (value != null) {
      return value;
    }
  }
  return null;
}

function convertArrayBufferToBinaryString(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return binary;
}

function binaryStringToDataUrl(binaryString, mimeType = 'application/octet-stream') {
  return `data:${mimeType};base64,${btoa(binaryString)}`;
}

export function mapExifOrientationToLabel(orientationTag) {
  switch (Number(orientationTag) || 0) {
    case 1:
      return 'Normalna';
    case 2:
      return 'Lustro poziome';
    case 3:
      return 'Obrót 180°';
    case 4:
      return 'Lustro pionowe';
    case 5:
      return 'Lustro poziome + obrót 270°';
    case 6:
      return 'Obrót 90°';
    case 7:
      return 'Lustro poziome + obrót 90°';
    case 8:
      return 'Obrót 270°';
    default:
      return null;
  }
}

export function mapExifOrientationToTransform(orientationTag) {
  const orientation = Number(orientationTag) || 1;
  switch (orientation) {
    case 2:
      return { rotationDegrees: 0, mirrored: true, label: 'Lustro poziome' };
    case 3:
      return { rotationDegrees: 180, mirrored: false, label: 'Obrót 180°' };
    case 4:
      return { rotationDegrees: 180, mirrored: true, label: 'Lustro pionowe' };
    case 5:
      return { rotationDegrees: 270, mirrored: true, label: 'Lustro + obrót 270°' };
    case 6:
      return { rotationDegrees: 90, mirrored: false, label: 'Obrót 90°' };
    case 7:
      return { rotationDegrees: 90, mirrored: true, label: 'Lustro + obrót 90°' };
    case 8:
      return { rotationDegrees: 270, mirrored: false, label: 'Obrót 270°' };
    case 1:
    default:
      return { rotationDegrees: 0, mirrored: false, label: 'Normalna' };
  }
}

/**
 * Single precedence list for “native” pixel dimensions used by crop overlay,
 * export math, and preview aspect. Keeps FilmLab and EXIF parsing aligned.
 */
export function resolveFilmLabSourcePixelSize(imageMeta, exifMeta) {
  const sourceWidth =
    Number(
      imageMeta?.previewWidth ??
        imageMeta?.width ??
        imageMeta?.sourceWidth ??
        exifMeta?.pixelWidth ??
        0
    ) || 0;
  const sourceHeight =
    Number(
      imageMeta?.previewHeight ??
        imageMeta?.height ??
        imageMeta?.sourceHeight ??
        exifMeta?.pixelHeight ??
        0
    ) || 0;
  return { sourceWidth, sourceHeight };
}

export async function parseExifMetadataFromFile(file) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    return null;
  }

  let piexif = null;
  try {
    const piexifModule = await import('piexifjs');
    piexif = piexifModule?.default ?? null;
  } catch {
    return null;
  }

  if (!piexif || typeof piexif.load !== 'function') {
    return null;
  }

  let binaryString = '';
  try {
    const buffer = await file.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) {
      return null;
    }
    binaryString = convertArrayBufferToBinaryString(buffer);
  } catch {
    return null;
  }

  if (!binaryString) {
    return null;
  }

  let parsed = null;
  try {
    parsed = piexif.load(binaryString);
  } catch {
    try {
      const mimeType = file?.type || 'application/octet-stream';
      const dataUrl = binaryStringToDataUrl(binaryString, mimeType);
      parsed = piexif.load(dataUrl);
    } catch {
      return null;
    }
  }

  const zeroth = parsed?.['0th'] ?? {};
  const exif = parsed?.Exif ?? {};

  const cameraMake = toCleanString(zeroth?.[piexif.ImageIFD.Make]);
  const cameraModel = toCleanString(zeroth?.[piexif.ImageIFD.Model]);
  const lensModel = toCleanString(
    firstNonNull(exif?.[piexif.ExifIFD.LensModel], zeroth?.[piexif.ImageIFD.LensModel])
  );
  const dateTaken = toCleanString(
    firstNonNull(
      exif?.[piexif.ExifIFD.DateTimeOriginal],
      exif?.[piexif.ExifIFD.DateTimeDigitized],
      zeroth?.[piexif.ImageIFD.DateTime]
    )
  );
  const orientationTag = toNumber(zeroth?.[piexif.ImageIFD.Orientation]);
  const orientationLabel = mapExifOrientationToLabel(orientationTag);
  const orientationTransform = mapExifOrientationToTransform(orientationTag);

  const isoRaw = firstNonNull(
    exif?.[piexif.ExifIFD.ISOSpeedRatings],
    exif?.[piexif.ExifIFD.PhotographicSensitivity]
  );
  const pixelWidth = toNumber(
    firstNonNull(
      exif?.[piexif.ExifIFD.PixelXDimension],
      zeroth?.[piexif.ImageIFD.ImageWidth]
    )
  );
  const pixelHeight = toNumber(
    firstNonNull(
      exif?.[piexif.ExifIFD.PixelYDimension],
      zeroth?.[piexif.ImageIFD.ImageLength]
    )
  );
  const iso = Array.isArray(isoRaw) ? toNumber(isoRaw[0]) : toNumber(isoRaw);
  const exposureTimeRaw = exif?.[piexif.ExifIFD.ExposureTime];
  const apertureRaw = firstNonNull(exif?.[piexif.ExifIFD.FNumber], exif?.[piexif.ExifIFD.ApertureValue]);
  const focalLengthRaw = exif?.[piexif.ExifIFD.FocalLength];

  const aperture = formatExifRational(apertureRaw);
  const focalLength = formatExifRational(focalLengthRaw);

  const normalized = {
    cameraMake,
    cameraModel,
    lensModel,
    dateTaken,
    iso: Number.isFinite(iso) ? Math.round(iso) : null,
    shutter: formatShutterFromExif(exposureTimeRaw),
    aperture: Number.isFinite(aperture) ? `f/${aperture.toFixed(1)}` : '—',
    focalLength: Number.isFinite(focalLength) ? `${Math.round(focalLength)} mm` : '—',
    pixelWidth: Number.isFinite(pixelWidth) && pixelWidth > 0 ? Math.round(pixelWidth) : null,
    pixelHeight: Number.isFinite(pixelHeight) && pixelHeight > 0 ? Math.round(pixelHeight) : null,
    orientationTag: Number.isFinite(orientationTag) ? Math.round(orientationTag) : null,
    orientationLabel,
    orientationTransform,
  };

  const hasUsefulData = Boolean(
    normalized.cameraMake ||
      normalized.cameraModel ||
      normalized.lensModel ||
      normalized.dateTaken ||
      normalized.iso != null ||
      normalized.pixelWidth != null ||
      normalized.pixelHeight != null ||
      normalized.orientationTag != null
  );

  return hasUsefulData ? normalized : null;
}
