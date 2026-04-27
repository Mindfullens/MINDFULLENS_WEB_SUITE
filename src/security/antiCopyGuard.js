import { readEnvFlag } from '../filmLab/runtimeEnv.js';

function shouldBlockShortcut(event) {
  const key = String(event.key || '').toLowerCase();
  const withModifier = event.ctrlKey || event.metaKey;

  if (key === 'f12') {
    return true;
  }

  if (!withModifier) {
    return false;
  }

  return ['u', 's', 'c', 'x', 'p', 'i', 'j'].includes(key);
}

export function installAntiCopyGuards() {
  const disableProtection = readEnvFlag(import.meta?.env?.VITE_DISABLE_COPY_PROTECTION);
  if (!import.meta.env.PROD || disableProtection) {
    return () => {};
  }

  const preventDefault = (event) => {
    event.preventDefault();
  };

  const blockImageDrag = (event) => {
    if (event.target instanceof HTMLImageElement) {
      event.preventDefault();
    }
  };

  const blockShortcuts = (event) => {
    if (shouldBlockShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  document.addEventListener('contextmenu', preventDefault, { capture: true });
  document.addEventListener('copy', preventDefault, { capture: true });
  document.addEventListener('cut', preventDefault, { capture: true });
  document.addEventListener('dragstart', blockImageDrag, { capture: true });
  document.addEventListener('keydown', blockShortcuts, { capture: true });

  return () => {
    document.removeEventListener('contextmenu', preventDefault, { capture: true });
    document.removeEventListener('copy', preventDefault, { capture: true });
    document.removeEventListener('cut', preventDefault, { capture: true });
    document.removeEventListener('dragstart', blockImageDrag, { capture: true });
    document.removeEventListener('keydown', blockShortcuts, { capture: true });
  };
}
