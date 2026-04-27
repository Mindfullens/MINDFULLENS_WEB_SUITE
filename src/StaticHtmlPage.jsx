import { useEffect, useRef } from 'react';

const FILE_INPUT_ACCEPT =
  'image/jpeg,image/png,image/webp,image/tiff,image/avif,image/heic,image/heif,.raw,.dng,.nef,.nrw,.cr2,.cr3,.arw,.srw,.srf,.sr2,.dcr,.raf,.rwl,.rw2,.mef,.orf,.pef,.iiq,.3fr,.erf,.fff,.kdc,.mos,.mrw,.x3f,.heic,.heif';

const RAW_EXTENSIONS = new Set([
  'raw',
  'dng',
  'nef',
  'nrw',
  'cr2',
  'cr3',
  'arw',
  'srw',
  'srf',
  'sr2',
  'dcr',
  'raf',
  'rwl',
  'rw2',
  'mef',
  'orf',
  'pef',
  'iiq',
  '3fr',
  'erf',
  'fff',
  'kdc',
  'mos',
  'mrw',
  'x3f',
]);

function getFileExtension(filename = '') {
  const parts = String(filename).toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() || '' : '';
}

function isRawFile(file) {
  return RAW_EXTENSIONS.has(getFileExtension(file?.name || ''));
}

function getBasePath() {
  const pathname = window.location.pathname || '/';
  if (pathname.endsWith('/')) {
    return pathname;
  }
  const index = pathname.lastIndexOf('/');
  return index >= 0 ? pathname.slice(0, index + 1) : '/';
}

function bridgeUrls(relativePath) {
  const cleanRelativePath = String(relativePath || '').replace(/^\/+/, '');
  const candidates = [`${getBasePath()}${cleanRelativePath}`, `/${cleanRelativePath}`].map((value) =>
    value.replace(/\/{2,}/g, '/')
  );
  return [...new Set(candidates)];
}

async function decodeRawFile(file) {
  let lastError = 'RAW/DNG wymaga aktywnego dekodera na serwerze.';

  for (const decodeUrl of bridgeUrls('raw/decode.php')) {
    try {
      const response = await fetch(decodeUrl, {
        method: 'POST',
        headers: {
          'x-file-name': file?.name || 'upload.raw',
          'x-render-intent': 'preview',
          'content-type': file?.type || 'application/octet-stream',
        },
        body: file,
      });

      if (!response.ok) {
        try {
          const errorPayload = await response.json();
          lastError = errorPayload?.error?.message || lastError;
        } catch {
          lastError = `Dekoder RAW zwrócił błąd HTTP ${response.status}.`;
        }
        continue;
      }

      const blob = await response.blob();
      return { ok: true, blob };
    } catch {
      // Continue trying next bridge URL.
    }
  }

  return { ok: false, error: lastError };
}

export default function StaticHtmlPage({ html, idPrefix, hostClassName }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode || typeof html !== 'string') {
      return undefined;
    }

    const parser = new DOMParser();
    const parsed = parser.parseFromString(html, 'text/html');
    const previousTitle = document.title;

    if (parsed.title) {
      document.title = parsed.title;
    }

    const appendedHeadNodes = [];
    parsed.head
      .querySelectorAll('link[rel="preconnect"], link[rel="stylesheet"], style, meta[name="description"]')
      .forEach((node) => {
        const clone = node.cloneNode(true);
        clone.setAttribute(`data-${idPrefix}-head`, 'true');
        document.head.appendChild(clone);
        appendedHeadNodes.push(clone);
      });

    const cursorFixStyle = document.createElement('style');
    cursorFixStyle.setAttribute(`data-${idPrefix}-cursor-fix`, 'true');
    cursorFixStyle.textContent = `
      html, body { cursor: auto !important; }
      input[type="range"], canvas, .ba-slider, .ba-container, .upload-zone, .upload-area, .viewfinder {
        cursor: auto !important;
      }
    `;
    document.head.appendChild(cursorFixStyle);
    appendedHeadNodes.push(cursorFixStyle);

    const bodyClone = parsed.body.cloneNode(true);
    const scripts = Array.from(bodyClone.querySelectorAll('script'));
    scripts.forEach((scriptNode) => scriptNode.remove());
    mountNode.innerHTML = bodyClone.innerHTML;

    const runtimeScripts = [];
    scripts.forEach((sourceScript) => {
      const scriptNode = document.createElement('script');

      Array.from(sourceScript.attributes).forEach((attribute) => {
        scriptNode.setAttribute(attribute.name, attribute.value);
      });

      if (!sourceScript.src) {
        scriptNode.textContent = sourceScript.textContent || '';
      }

      scriptNode.setAttribute(`data-${idPrefix}-script`, 'true');
      mountNode.appendChild(scriptNode);
      runtimeScripts.push(scriptNode);
    });

    const baSliderTeardowns = [];
    mountNode.querySelectorAll('.ba-slider').forEach((container) => {
      const input = container.querySelector('.ba-input');
      const after = container.querySelector('.ba-after');
      const line = container.querySelector('.ba-line');
      const handle = container.querySelector('.ba-handle');

      if (!input || !after) {
        return;
      }

      const sync = () => {
        const rawValue = Number(input.value);
        const value = Number.isFinite(rawValue) ? Math.min(100, Math.max(0, rawValue)) : 50;
        input.value = `${value}`;
        after.style.clipPath = `inset(0 0 0 ${value}%)`;
        if (line) {
          line.style.left = `${value}%`;
        }
        if (handle) {
          handle.style.left = `${value}%`;
        }
      };

      const syncFromClientX = (clientX) => {
        const rect = container.getBoundingClientRect();
        if (rect.width <= 0) {
          return;
        }
        const value = ((clientX - rect.left) / rect.width) * 100;
        input.value = `${Math.min(100, Math.max(0, value))}`;
        sync();
      };

      let pointerDragging = false;

      const onPointerDown = (event) => {
        if (typeof event.button === 'number' && event.button !== 0) {
          return;
        }
        pointerDragging = true;
        syncFromClientX(event.clientX);
        event.preventDefault();
      };

      const onPointerMove = (event) => {
        if (!pointerDragging) {
          return;
        }
        syncFromClientX(event.clientX);
        event.preventDefault();
      };

      const onPointerUp = () => {
        pointerDragging = false;
      };

      input.addEventListener('input', sync);
      input.addEventListener('change', sync);
      container.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      sync();

      baSliderTeardowns.push(() => {
        input.removeEventListener('input', sync);
        input.removeEventListener('change', sync);
        container.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      });
    });

    const fileInputs = Array.from(mountNode.querySelectorAll('input[type="file"]'));
    fileInputs.forEach((input) => {
      input.setAttribute('accept', FILE_INPUT_ACCEPT);
    });

    const dispatchDecodedFile = (decodedFile, preferredInput) => {
      const inputTarget = preferredInput || mountNode.querySelector('input[type="file"]');
      if (inputTarget && typeof DataTransfer === 'function') {
        try {
          const transfer = new DataTransfer();
          transfer.items.add(decodedFile);
          inputTarget.files = transfer.files;
          const replayEvent = new Event('change', { bubbles: true });
          replayEvent.__mlRawDecoded = true;
          inputTarget.dispatchEvent(replayEvent);
          return true;
        } catch {
          // Fallback to direct function call below.
        }
      }

      if (typeof window.handleImage === 'function') {
        window.handleImage(decodedFile);
        return true;
      }

      if (typeof window.loadImage === 'function') {
        window.loadImage(decodedFile);
        return true;
      }

      return false;
    };

    const rawFileChangeHandler = async (event) => {
      if (event.__mlRawDecoded) {
        return;
      }

      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== 'file') {
        return;
      }

      const file = input.files?.[0];
      if (!file || !isRawFile(file)) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      const decoded = await decodeRawFile(file);
      if (!decoded.ok) {
        window.alert(decoded.error || 'Nie udało się zdekodować pliku RAW.');
        return;
      }

      const decodedType = decoded.blob?.type || 'image/jpeg';
      const decodedName = `${(file.name || 'upload').replace(/\.[^.]+$/, '')}.jpg`;
      const decodedFile = new File([decoded.blob], decodedName, { type: decodedType });

      if (!dispatchDecodedFile(decodedFile, input)) {
        window.alert('Nie udało się przekazać zdekodowanego pliku do strony.');
      }
    };

    const rawDropHandler = async (event) => {
      const droppedFile = event.dataTransfer?.files?.[0];
      if (!droppedFile || !isRawFile(droppedFile)) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      const decoded = await decodeRawFile(droppedFile);
      if (!decoded.ok) {
        window.alert(decoded.error || 'Nie udało się zdekodować pliku RAW.');
        return;
      }

      const decodedType = decoded.blob?.type || 'image/jpeg';
      const decodedName = `${(droppedFile.name || 'upload').replace(/\.[^.]+$/, '')}.jpg`;
      const decodedFile = new File([decoded.blob], decodedName, { type: decodedType });

      if (!dispatchDecodedFile(decodedFile, null)) {
        window.alert('Nie udało się przekazać zdekodowanego pliku do strony.');
      }
    };

    const isEditableTarget = (target) => {
      if (!target) {
        return false;
      }
      if (target instanceof HTMLTextAreaElement) {
        return true;
      }
      if (target instanceof HTMLInputElement) {
        return target.type !== 'range' && target.type !== 'button';
      }
      return Boolean(target.isContentEditable);
    };

    const isElementVisibleInViewport = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.height > 0 && rect.width > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight;
    };

    const keyboardSliderHandler = (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      const activeRange =
        document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'range'
          ? document.activeElement
          : null;

      if (activeRange && mountNode.contains(activeRange)) {
        window.setTimeout(() => {
          activeRange.dispatchEvent(new Event('input', { bubbles: true }));
        }, 0);
        return;
      }

      const visibleBaInputs = Array.from(mountNode.querySelectorAll('.ba-input')).filter(isElementVisibleInViewport);
      if (visibleBaInputs.length > 0) {
        event.preventDefault();
        const direction = event.key === 'ArrowLeft' ? -5 : 5;
        visibleBaInputs.forEach((input) => {
          const currentValue = Number(input.value);
          const safeValue = Number.isFinite(currentValue) ? currentValue : 50;
          const nextValue = Math.max(0, Math.min(100, safeValue + direction));
          input.value = `${nextValue}`;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        return;
      }

      const matcherContainer = mountNode.querySelector('#baContainer');
      const matcherOriginal = mountNode.querySelector('#baOriginal');
      const matcherLine = mountNode.querySelector('#baLine');
      const matcherHandle = mountNode.querySelector('#baHandle');

      if (matcherContainer && matcherOriginal && matcherLine && matcherHandle && isElementVisibleInViewport(matcherContainer)) {
        event.preventDefault();
        const currentPercent = Number.parseFloat(matcherLine.style.left || '50');
        const safePercent = Number.isFinite(currentPercent) ? currentPercent : 50;
        const direction = event.key === 'ArrowLeft' ? -5 : 5;
        const nextPercent = Math.max(0, Math.min(100, safePercent + direction));
        const right = Math.max(0, 100 - nextPercent);
        matcherOriginal.style.clipPath = `inset(0 ${right}% 0 0)`;
        matcherOriginal.style.webkitClipPath = `inset(0 ${right}% 0 0)`;
        matcherLine.style.left = `${nextPercent}%`;
        matcherHandle.style.left = `${nextPercent}%`;
      }
    };

    mountNode.addEventListener('change', rawFileChangeHandler, true);
    mountNode.addEventListener('drop', rawDropHandler, true);
    document.addEventListener('keydown', keyboardSliderHandler);

    if (typeof window.bindCursorHover === 'function') {
      window.bindCursorHover();
    }
    if (typeof window.initTiltEffect === 'function') {
      window.initTiltEffect();
    }
    if (typeof window.hidePreloader === 'function') {
      window.setTimeout(() => window.hidePreloader(), 200);
    }
    if (typeof window.handleScrollLogic === 'function') {
      window.handleScrollLogic();
    }

    return () => {
      baSliderTeardowns.forEach((teardown) => teardown());
      mountNode.removeEventListener('change', rawFileChangeHandler, true);
      mountNode.removeEventListener('drop', rawDropHandler, true);
      document.removeEventListener('keydown', keyboardSliderHandler);
      runtimeScripts.forEach((node) => node.remove());
      mountNode.innerHTML = '';
      appendedHeadNodes.forEach((node) => node.remove());
      document.title = previousTitle;
    };
  }, [html, idPrefix]);

  return <div className={hostClassName || `${idPrefix}-page-host`} ref={mountRef} />;
}
