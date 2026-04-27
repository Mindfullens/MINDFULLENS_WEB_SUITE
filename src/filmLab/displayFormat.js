export function formatFileSize(bytes) {
  const numeric = Number(bytes);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '—';
  }

  if (numeric < 1024) {
    return `${numeric} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = numeric / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

export function formatAspectRatio(width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (w <= 0 || h <= 0) {
    return '—';
  }

  const ratio = w / h;
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return '—';
  }

  const rounded = ratio.toFixed(3);
  return `${rounded}:1`;
}

export function formatMegapixels(width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (w <= 0 || h <= 0) {
    return '—';
  }

  return `${((w * h) / 1_000_000).toFixed(2)} MP`;
}

export function formatDateTime(value) {
  if (!value) {
    return '—';
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleString();
  }
  const raw = String(value);
  const normalized = raw.replace(/^(\d{4}):(\d{2}):(\d{2})\s/, '$1-$2-$3 ');
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString();
  }
  return raw;
}

export function formatRatioPercent(value, digits = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 'n/a';
  }
  return `${(numeric * 100).toFixed(digits)}%`;
}
