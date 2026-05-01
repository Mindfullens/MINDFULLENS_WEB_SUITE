export const SHORTCUT_KEYS = {
  compare: {
    primary: '\\',
    fallback: 'Y',
  },
  clipping: 'J',
  autoExposure: 'A',
  autoColor: 'K',
  overlayCycle: 'O',
  fit: '0',
  fitAlt: ',',
  full: 'F',
  help: '?',
  metadata: 'I',
  metadataMode: 'M',
  rawLinearStage: 'L',
  localMaskPrev: '[',
  localMaskNext: ']',
  localMaskDuplicate: 'D',
  localMaskMute: 'M',
  localMaskSolo: 'S',
  localMaskOverlay: 'O',
  localMaskMoveUp: 'ArrowUp',
  localMaskMoveDown: 'ArrowDown',
  oneToOne: '.',
  zoomIn: '+',
  zoomOut: '-',
};

export function resolveShortcutAction({
  key,
  code,
  metaKey = false,
  ctrlKey = false,
  altKey = false,
  repeat = false,
  shiftKey = false,
  isPreviewFullMode = false,
  hasImage = false,
  zoom = 1,
  panKeyStep = 40,
  studioWorkspace = null,
} = {}) {
  const pressed = String(key || '').toLowerCase();
  const physicalCode = String(code || '');
  const hasModifierKey = Boolean(metaKey || ctrlKey || altKey);
  const allowsRepeat =
    pressed.startsWith('arrow') ||
    pressed === '=' ||
    pressed === '+' ||
    pressed === '-' ||
    pressed === '_';

  if (repeat && !allowsRepeat) {
    return null;
  }

  /** HME Stage 9 — zakładka Maski: M / Shift+M / X (bez Alt/Ctrl/Meta), gdy jest obraz. */
  if (studioWorkspace === 'masks' && hasImage && !hasModifierKey) {
    if (pressed === 'm') {
      if (shiftKey) {
        return { type: 'localMaskStudioShiftM', preventDefault: true };
      }
      return { type: 'localMaskToggleOverlay', preventDefault: true };
    }
    if (!shiftKey && pressed === 'x') {
      return { type: 'localMaskStudioEraseToggle', preventDefault: true };
    }
  }

  const isCompareShortcut =
    physicalCode === 'Backslash' ||
    physicalCode === 'IntlBackslash' ||
    key === '\\' ||
    key === '|' ||
    (!hasModifierKey && pressed === SHORTCUT_KEYS.compare.fallback.toLowerCase());

  if (isCompareShortcut) {
    if (!hasImage) {
      return null;
    }
    return { type: 'toggleCompare', preventDefault: true };
  }

  if (pressed === 'escape' && isPreviewFullMode) {
    return { type: 'exitFull', preventDefault: true };
  }

  if (!hasModifierKey && pressed === SHORTCUT_KEYS.full.toLowerCase()) {
    return { type: 'toggleFull', preventDefault: true };
  }

  if (pressed === SHORTCUT_KEYS.clipping.toLowerCase()) {
    return { type: 'toggleClipping', preventDefault: true };
  }

  if (!hasModifierKey && pressed === SHORTCUT_KEYS.autoExposure.toLowerCase()) {
    return { type: 'autoExposure', preventDefault: true };
  }

  if (!hasModifierKey && pressed === SHORTCUT_KEYS.autoColor.toLowerCase()) {
    return { type: 'autoColor', preventDefault: true };
  }

  if (!hasModifierKey && pressed === SHORTCUT_KEYS.overlayCycle.toLowerCase()) {
    return { type: 'cycleOverlayMode', preventDefault: true };
  }

  if (
    pressed === SHORTCUT_KEYS.fit ||
    pressed === SHORTCUT_KEYS.fitAlt ||
    physicalCode === 'Comma'
  ) {
    return { type: 'fitZoom', preventDefault: true };
  }

  if (!hasModifierKey && (pressed === SHORTCUT_KEYS.oneToOne || physicalCode === 'Period')) {
    return { type: 'oneToOneZoom', preventDefault: true };
  }

  if (!hasModifierKey && pressed === SHORTCUT_KEYS.metadata.toLowerCase()) {
    return { type: 'toggleMetadataPanel', preventDefault: true };
  }

  if (!hasModifierKey && pressed === SHORTCUT_KEYS.metadataMode.toLowerCase()) {
    return { type: 'cycleMetadataMode', preventDefault: true };
  }

  if (!hasModifierKey && shiftKey && pressed === SHORTCUT_KEYS.rawLinearStage.toLowerCase()) {
    return { type: 'cycleRawLinearStage', preventDefault: true };
  }

  if (altKey && !metaKey && !ctrlKey && !shiftKey && pressed === SHORTCUT_KEYS.localMaskPrev) {
    return { type: 'localMaskPrev', preventDefault: true };
  }
  if (altKey && !metaKey && !ctrlKey && !shiftKey && pressed === SHORTCUT_KEYS.localMaskNext) {
    return { type: 'localMaskNext', preventDefault: true };
  }
  if (
    altKey &&
    !metaKey &&
    !ctrlKey &&
    !shiftKey &&
    pressed === SHORTCUT_KEYS.localMaskDuplicate.toLowerCase()
  ) {
    return { type: 'localMaskDuplicate', preventDefault: true };
  }
  if (
    altKey &&
    !metaKey &&
    !ctrlKey &&
    !shiftKey &&
    pressed === SHORTCUT_KEYS.localMaskMute.toLowerCase()
  ) {
    return { type: 'localMaskToggleMute', preventDefault: true };
  }
  if (
    altKey &&
    !metaKey &&
    !ctrlKey &&
    !shiftKey &&
    pressed === SHORTCUT_KEYS.localMaskSolo.toLowerCase()
  ) {
    return { type: 'localMaskToggleSolo', preventDefault: true };
  }
  if (
    altKey &&
    !metaKey &&
    !ctrlKey &&
    !shiftKey &&
    pressed === SHORTCUT_KEYS.localMaskOverlay.toLowerCase()
  ) {
    return { type: 'localMaskToggleOverlay', preventDefault: true };
  }
  if (
    altKey &&
    !metaKey &&
    !ctrlKey &&
    shiftKey &&
    pressed === SHORTCUT_KEYS.localMaskMoveUp.toLowerCase()
  ) {
    return { type: 'localMaskMoveUp', preventDefault: true };
  }
  if (
    altKey &&
    !metaKey &&
    !ctrlKey &&
    shiftKey &&
    pressed === SHORTCUT_KEYS.localMaskMoveDown.toLowerCase()
  ) {
    return { type: 'localMaskMoveDown', preventDefault: true };
  }

  if (!hasModifierKey && (key === SHORTCUT_KEYS.help || (pressed === '/' && shiftKey))) {
    return { type: 'toggleShortcutHelp', preventDefault: true };
  }

  const isZoomIn =
    pressed === SHORTCUT_KEYS.zoomIn ||
    pressed === '=' ||
    physicalCode === 'NumpadAdd' ||
    physicalCode === 'Equal';
  const isZoomOut =
    pressed === SHORTCUT_KEYS.zoomOut ||
    pressed === '_' ||
    physicalCode === 'NumpadSubtract' ||
    physicalCode === 'Minus';

  if (isZoomIn || isZoomOut) {
    if (hasModifierKey) {
      return null;
    }
    return {
      type: isZoomIn ? 'zoomIn' : 'zoomOut',
      preventDefault: true,
    };
  }

  if (pressed.startsWith('arrow') && hasImage && zoom > 1.001) {
    const step = shiftKey ? panKeyStep * 2 : panKeyStep;
    if (pressed === 'arrowleft') {
      return { type: 'pan', preventDefault: true, dx: step, dy: 0 };
    }
    if (pressed === 'arrowright') {
      return { type: 'pan', preventDefault: true, dx: -step, dy: 0 };
    }
    if (pressed === 'arrowup') {
      return { type: 'pan', preventDefault: true, dx: 0, dy: step };
    }
    if (pressed === 'arrowdown') {
      return { type: 'pan', preventDefault: true, dx: 0, dy: -step };
    }
  }

  if (!hasModifierKey && pressed === 'd') {
    return { type: 'triggerDustZip', preventDefault: true };
  }

  if (!hasModifierKey && pressed === 'l') {
    return { type: 'triggerRawLeakZip', preventDefault: true };
  }

  return null;
}
