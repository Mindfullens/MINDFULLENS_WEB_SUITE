/**
 * Synchroniczny odczyt, czy przeglądarka udostępnia WebGPU API (`navigator.gpu`).
 * Nie tworzy adaptera ani device — tylko sygnał do diagnostyki (plan v3.1 Etap 1, Sprint 1 telemetria).
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
/** Ostatni `GPUAdapter` z udanego `requestAdapter` — do jednorazowej sondy `requestDevice` (Etap 1). */
let lastGpuAdapter = null;

let cachedDeviceProbe = null;
let deviceProbeInFlight = null;

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
      lastGpuAdapter = null;
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
        lastGpuAdapter = null;
        cachedAdapterProbe = {
          api,
          adapter: { status: 'no-adapter' },
          adapterInfo: null,
        };
        adapterProbeInFlight = null;
        return cachedAdapterProbe;
      }
      const adapterInfo = await readAdapterInfoObject(adapter);
      lastGpuAdapter = adapter;
      cachedAdapterProbe = {
        api,
        adapter: { status: 'ok' },
        adapterInfo,
      };
    } catch (e) {
      lastGpuAdapter = null;
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

/**
 * Jednorazowa sonda `GPUAdapter.requestDevice()` + odczyt `limits`, potem `device.destroy()`.
 * Nie uruchamia renderu — pod Etap 1 (łańcuch WebGPU przed właściwym pipeline).
 * Wymaga wcześniejszego `getOrProbeWebGpuAdapter()`.
 */
export function getOrProbeWebGpuDevice() {
  if (cachedDeviceProbe) {
    return Promise.resolve(cachedDeviceProbe);
  }
  if (deviceProbeInFlight) {
    return deviceProbeInFlight;
  }
  deviceProbeInFlight = (async () => {
    await getOrProbeWebGpuAdapter();
    if (!lastGpuAdapter) {
      cachedDeviceProbe = {
        status: 'unavailable',
        reason: 'no-adapter',
        limits: null,
      };
      deviceProbeInFlight = null;
      return cachedDeviceProbe;
    }
    try {
      const device = await lastGpuAdapter.requestDevice();
      const { limits } = device;
      const limitsSnapshot = {
        maxTextureDimension2D: limits.maxTextureDimension2D,
        maxTextureDimension3D: limits.maxTextureDimension3D,
        maxStorageBufferBindingSize: limits.maxStorageBufferBindingSize,
        maxBufferSize: limits.maxBufferSize,
      };
      device.destroy();
      cachedDeviceProbe = {
        status: 'ok',
        limits: limitsSnapshot,
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

let persistentRenderDevice = null;
let persistentRenderInFlight = null;

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
    await getOrProbeWebGpuAdapter();
    if (!lastGpuAdapter) {
      persistentRenderInFlight = null;
      throw new Error('WebGPU: brak adaptera');
    }
    const device = await lastGpuAdapter.requestDevice({
      label: deviceLabel,
      powerPreference: 'high-performance',
    });
    persistentRenderDevice = device;
    device.lost.then(() => {
      if (persistentRenderDevice === device) {
        persistentRenderDevice = null;
      }
    });
    persistentRenderInFlight = null;
    return persistentRenderDevice;
  })();
  return persistentRenderInFlight;
}
