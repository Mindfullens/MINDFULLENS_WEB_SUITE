/**
 * WebGPU: jeden `GPUAdapter` → jeden `requestDevice()` (adapter „consumed”).
 * Sonda limitów (`getOrProbeWebGpuDevice`) i urządzenie renderu (`getOrCreatePersistentWebGpuDevice`) każde wołają **własny** `requestAdapter()`.
 *
 * Singleton `persistentRenderDevice` (na wątek) — współdzielony przez preview / proxy.
 */
export function getWebGpuApiExposure() {
  if (typeof navigator === 'undefined') {
    return { exposed: false, detail: 'no-navigator' };
  }
  if (navigator.gpu == null) {
    return { exposed: false, detail: 'no-navigator-gpu' };
  }
  return { exposed: true, detail: 'navigator-gpu' };
}

let cachedAdapterProbe = null;
let adapterProbeInFlight = null;

let cachedDeviceProbe = null;
let deviceProbeInFlight = null;
/** Jeden `GPUDevice` na kontekst JS (główny wątek / worker osobno) — `getOrCreatePersistentWebGpuDevice`. */
let persistentRenderDevice = null;
let persistentRenderInFlight = null;

function pickAdapterInfo(i) {
  if (!i || typeof i !== 'object') {
    return null;
  }
  return {
    vendor: i.vendor != null ? String(i.vendor) : null,
    architecture: i.architecture != null ? String(i.architecture) : null,
    device: i.device != null ? String(i.device) : null,
    description: i.description != null ? String(i.description) : null,
  };
}

async function readAdapterInfoObject(adapter) {
  if (typeof adapter.requestAdapterInfo === 'function') {
    try {
      return pickAdapterInfo(await adapter.requestAdapterInfo());
    } catch {
      /* prefer sync .info */
    }
  }
  if (adapter.info && typeof adapter.info === 'object') {
    return pickAdapterInfo(adapter.info);
  }
  return null;
}

/**
 * Jednorazowe `requestAdapter` + odczyt metadanych (cache na poziomie modułu).
 * Nie tworzy GPUDevice — tylko sonda pod przyszły pipeline WebGPU.
 */
export function getOrProbeWebGpuAdapter() {
  if (cachedAdapterProbe) {
    return Promise.resolve(cachedAdapterProbe);
  }
  if (adapterProbeInFlight) {
    return adapterProbeInFlight;
  }
  adapterProbeInFlight = (async () => {
    const api = getWebGpuApiExposure();
    if (!api.exposed) {
      cachedAdapterProbe = {
        api,
        adapter: { status: 'unavailable', reason: api.detail },
        adapterInfo: null,
      };
      adapterProbeInFlight = null;
      return cachedAdapterProbe;
    }
    try {
      const gpu = navigator.gpu;
      const adapter = await gpu.requestAdapter();
      if (!adapter) {
        cachedAdapterProbe = {
          api,
          adapter: { status: 'no-adapter' },
          adapterInfo: null,
        };
        adapterProbeInFlight = null;
        return cachedAdapterProbe;
      }
      const adapterInfo = await readAdapterInfoObject(adapter);
      cachedAdapterProbe = {
        api,
        adapter: { status: 'ok' },
        adapterInfo,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      cachedAdapterProbe = {
        api: getWebGpuApiExposure(),
        adapter: { status: 'error', reason: msg },
        adapterInfo: null,
      };
    }
    adapterProbeInFlight = null;
    return cachedAdapterProbe;
  })();
  return adapterProbeInFlight;
}

function snapshotLimitsFromDevice(device) {
  const { limits } = device;
  return {
    maxTextureDimension2D: limits.maxTextureDimension2D,
    maxTextureDimension3D: limits.maxTextureDimension3D,
    maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize,
    maxBufferSize: limits.maxBufferSize,
  };
}

/**
 * Jednorazowa sonda limitów — osobny `requestAdapter()` + jednorazowy `requestDevice` tylko do limitów, potem `destroy`.
 */
export function getOrProbeWebGpuDevice() {
  if (cachedDeviceProbe) {
    return Promise.resolve(cachedDeviceProbe);
  }
  if (persistentRenderDevice) {
    cachedDeviceProbe = {
      status: 'ok',
      limits: snapshotLimitsFromDevice(persistentRenderDevice),
      source: 'persistent-singleton',
    };
    return Promise.resolve(cachedDeviceProbe);
  }
  if (deviceProbeInFlight) {
    return deviceProbeInFlight;
  }
  deviceProbeInFlight = (async () => {
    const api = getWebGpuApiExposure();
    if (!api.exposed || typeof navigator === 'undefined' || navigator.gpu == null) {
      cachedDeviceProbe = {
        status: 'unavailable',
        reason: api.detail ?? 'no-gpu',
        limits: null,
      };
      deviceProbeInFlight = null;
      return cachedDeviceProbe;
    }
    /** Osobny adapter wyłącznie na sondę (nie ten od trwałego renderu). */
    let probeAdapter = null;
    try {
      probeAdapter = await navigator.gpu.requestAdapter();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      cachedDeviceProbe = {
        status: 'error',
        reason: msg,
        limits: null,
      };
      deviceProbeInFlight = null;
      return cachedDeviceProbe;
    }
    if (!probeAdapter) {
      cachedDeviceProbe = {
        status: 'unavailable',
        reason: 'no-adapter-for-probe',
        limits: null,
      };
      deviceProbeInFlight = null;
      return cachedDeviceProbe;
    }
    try {
      const device = await probeAdapter.requestDevice();
      const limitsSnapshot = snapshotLimitsFromDevice(device);
      device.destroy();
      cachedDeviceProbe = {
        status: 'ok',
        limits: limitsSnapshot,
        source: 'disposable-probe-adapter',
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      cachedDeviceProbe = {
        status: 'error',
        reason: msg,
        limits: null,
      };
    }
    deviceProbeInFlight = null;
    return cachedDeviceProbe;
  })();
  return deviceProbeInFlight;
}

/**
 * Pojedynczy `requestDevice` **bez** `destroy` — do `proxyWebGpuRenderer` w workerze lub sondy podglądu w wątku głównym.
 * Osobne od sondy `getOrProbeWebGpuDevice` (ta niszczy device).
 * @param {{ label?: string } | void} [options]
 */
export function getOrCreatePersistentWebGpuDevice(options) {
  const deviceLabel = options?.label != null ? String(options.label) : 'ml-proxy-persistent';
  if (persistentRenderDevice) {
    return Promise.resolve(persistentRenderDevice);
  }
  if (persistentRenderInFlight) {
    return persistentRenderInFlight;
  }
  persistentRenderInFlight = (async () => {
    const gpu = navigator.gpu;
    /** Osobny `requestAdapter` niż sonda `getOrProbeWebGpuAdapter` — adapter jest jednorazowy („consumed” po `requestDevice`). */
    let renderAdapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!renderAdapter) {
      renderAdapter = await gpu.requestAdapter();
    }
    if (!renderAdapter) {
      const api = getWebGpuApiExposure();
      console.warn('[FilmLab][WebGPU] getOrCreatePersistentWebGpuDevice: no adapter', {
        api,
        hint: api.exposed
          ? 'requestAdapter() zwróciło null (brak GPU, zablokowane w ustawieniach, tryb headless?)'
          : 'navigator.gpu niedostępny w tej przeglądarce / kontekście',
      });
      persistentRenderInFlight = null;
      throw new Error('WebGPU: brak adaptera');
    }
    let adapterInfo = null;
    try {
      adapterInfo = await readAdapterInfoObject(renderAdapter);
    } catch {
      /* opcjonalne */
    }
    const tryRequest = async (label, init) => {
      try {
        return await renderAdapter.requestDevice(init);
      } catch (e) {
        const name = e instanceof Error ? e.name : 'Error';
        const message = e instanceof Error ? e.message : String(e);
        let featuresList;
        try {
          featuresList =
            renderAdapter?.features != null ? Array.from(renderAdapter.features) : undefined;
        } catch {
          featuresList = undefined;
        }
        console.warn('[FilmLab][WebGPU] requestDevice failed', {
          label,
          name,
          message,
          requestInit: init,
          adapterInfo,
          features: featuresList,
          limitsPreview:
            typeof renderAdapter?.limits?.maxTextureDimension2D === 'number'
              ? { maxTextureDimension2D: renderAdapter.limits.maxTextureDimension2D }
              : undefined,
        });
        throw e;
      }
    };
    let device;
    try {
      device = await tryRequest(deviceLabel, { label: deviceLabel });
    } catch {
      try {
        console.warn('[FilmLab][WebGPU] ponawiam requestDevice (druga próba z minimalnym init)');
        device = await tryRequest(`${deviceLabel}-fallback`, { label: deviceLabel });
      } catch (e2) {
        persistentRenderInFlight = null;
        throw e2;
      }
    }
    persistentRenderDevice = device;
    if (import.meta.env?.DEV) {
      console.info('[FilmLab][WebGPU] persistent singleton GPUDevice utworzone', {
        label: deviceLabel,
      });
    }
    device.lost.then((info) => {
      console.warn('[FilmLab][WebGPU] device lost', {
        reason: info?.reason ?? 'unknown',
        message: info?.message ?? '',
      });
      if (persistentRenderDevice === device) {
        persistentRenderDevice = null;
        cachedDeviceProbe = null;
      }
    });
    persistentRenderInFlight = null;
    return persistentRenderDevice;
  })();
  return persistentRenderInFlight;
}
