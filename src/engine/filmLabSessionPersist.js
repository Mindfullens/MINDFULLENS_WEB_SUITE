import { del, get, set } from 'idb-keyval';

const SESSION_KEY = 'mindfullens-filmlab-autosave-v1';

/**
 * Persist Film Lab session (source bytes + recipe snapshot) for crash/refresh recovery.
 * @param {{ fileMeta: { name: string, type?: string, lastModified?: number, size: number }, buffer: ArrayBuffer, recipe: object, ui?: object }} payload
 */
export async function saveFilmLabSession(payload) {
  if (
    !payload?.buffer ||
    !(payload.buffer instanceof ArrayBuffer) ||
    payload.buffer.byteLength < 1 ||
    !payload?.fileMeta ||
    typeof payload.fileMeta.name !== 'string' ||
    !payload?.recipe ||
    typeof payload.recipe !== 'object'
  ) {
    return false;
  }

  try {
    await set(SESSION_KEY, {
      v: 1,
      savedAt: Date.now(),
      fileMeta: {
        name: payload.fileMeta.name,
        type: payload.fileMeta.type ?? '',
        lastModified: Number(payload.fileMeta.lastModified) || Date.now(),
        size: Number(payload.fileMeta.size) || payload.buffer.byteLength,
      },
      buffer: payload.buffer,
      recipe: payload.recipe,
      ui: payload.ui && typeof payload.ui === 'object' ? payload.ui : {},
    });
    return true;
  } catch (error) {
    console.warn('[FilmLab] Auto-save failed', error);
    return false;
  }
}

/**
 * @returns {Promise<{ v: number, savedAt: number, fileMeta: object, buffer: ArrayBuffer, recipe: object, ui: object } | null>}
 */
export async function loadFilmLabSession() {
  try {
    const raw = await get(SESSION_KEY);
    if (!raw || raw.v !== 1) {
      return null;
    }
    return raw;
  } catch (error) {
    console.warn('[FilmLab] Session load failed', error);
    return null;
  }
}

export async function clearFilmLabSession() {
  try {
    await del(SESSION_KEY);
  } catch {
    // noop
  }
}

/**
 * @param {unknown} raw
 * @returns {{ buffer: ArrayBuffer, fileMeta: object, recipe: object, ui: object, savedAt: number } | null}
 */
export function normalizeLoadedSession(raw) {
  if (!raw || raw.v !== 1) {
    return null;
  }

  const buffer = raw.buffer;
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 1) {
    return null;
  }

  const fm = raw.fileMeta;
  if (!fm || typeof fm.name !== 'string') {
    return null;
  }

  const size = Number(fm.size);
  if (!Number.isFinite(size) || size !== buffer.byteLength) {
    return null;
  }

  if (!raw.recipe || typeof raw.recipe !== 'object') {
    return null;
  }

  return {
    buffer,
    fileMeta: {
      name: fm.name,
      type: typeof fm.type === 'string' ? fm.type : '',
      lastModified: Number.isFinite(Number(fm.lastModified)) ? Number(fm.lastModified) : Date.now(),
      size,
    },
    recipe: raw.recipe,
    ui: raw.ui && typeof raw.ui === 'object' ? raw.ui : {},
    savedAt: Number.isFinite(Number(raw.savedAt)) ? Number(raw.savedAt) : Date.now(),
  };
}
