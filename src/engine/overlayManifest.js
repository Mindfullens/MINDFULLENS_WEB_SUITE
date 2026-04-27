function buildOverlaySequence(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index + 1}.jpg`);
}

export const DUST_OVERLAY_FILES = buildOverlaySequence('dust', 15);

export const RAW_LEAK_OVERLAY_FILES = buildOverlaySequence('raw-leak', 46);

export const FILMSTRIP_OVERLAY_FILES = buildOverlaySequence('filmstrip', 15);
