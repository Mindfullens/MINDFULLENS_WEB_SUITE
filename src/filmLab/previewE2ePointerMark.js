/**
 * Wspólny stempel czasu dla E2E v3 (pointer / pierwsze wejście w suwak) — czytany
 * w `useFilmLabEngine` po prezentacji klatki. Nie zależny od React; jedna instancja w zakładce.
 */

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function roundE2eMs(value) {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.round(value * 10) / 10);
}

let pointerT0 = null;
/** Rękojeść kadru / inne, gdy `isAdjusting` w React bywa false. */
let auxSession = false;
/** Skróty klawiszowe (Film Lab), gdy nie ma sesji pointer / pan — włącza kontekst E2E v3. */
let keyboardE2eSession = false;

export function markFilmLabE2ePointerDown() {
  pointerT0 = nowMs();
  keyboardE2eSession = false;
}

export function clearFilmLabE2ePointerMark() {
  pointerT0 = null;
  keyboardE2eSession = false;
}

/** Stempel czasu + sesja klawiatury (nie zeruje `auxSession`). */
export function markFilmLabE2eKeyboardE2eIntent() {
  pointerT0 = nowMs();
  keyboardE2eSession = true;
}

export function getFilmLabE2eKeyboardSession() {
  return keyboardE2eSession;
}

export function setFilmLabE2eKeyboardSession(active) {
  keyboardE2eSession = Boolean(active);
}

export function setFilmLabE2ePointerAuxSession(active) {
  auxSession = Boolean(active);
}

export function getFilmLabE2ePointerAuxSession() {
  return auxSession;
}

/**
 * Czas od ostatniego `markFilmLabE2ePointerDown` do „teraz”, gdy `contextActive`
 * (np. isAdjusting, isPanning w silniku, lub aux dla kadrowania).
 */
export function computePreviewE2ePointerToPresentMs(contextActive) {
  if (!contextActive) {
    return null;
  }
  if (pointerT0 == null || !Number.isFinite(pointerT0)) {
    return null;
  }
  return roundE2eMs(nowMs() - pointerT0);
}
