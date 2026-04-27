let rawWorker = null;
let nextRequestId = 1;
const inflightRequests = new Map();
const BRIDGE_BASE_URL =
  typeof import.meta !== 'undefined' && import.meta?.env?.BASE_URL
    ? import.meta.env.BASE_URL
    : '/';

function ensureRawWorker() {
  if (rawWorker || typeof Worker === 'undefined') {
    return rawWorker;
  }

  rawWorker = new Worker(new URL('./rawDecode.worker.js', import.meta.url), {
    type: 'module',
  });

  rawWorker.addEventListener('message', (event) => {
    const { id, ...result } = event.data ?? {};
    const handlers = inflightRequests.get(id);

    if (!handlers) {
      return;
    }

    inflightRequests.delete(id);
    handlers.resolve(result);
  });

  rawWorker.addEventListener('error', (workerErrorEvent) => {
    const normalizedError = new Error(
      workerErrorEvent?.message
        ? `RAW worker crashed: ${workerErrorEvent.message}`
        : 'RAW worker crashed (unknown error)'
    );
    inflightRequests.forEach(({ reject }) => {
      reject(normalizedError);
    });
    inflightRequests.clear();
  });

  return rawWorker;
}

function sendRawWorkerMessage(type, payload) {
  const worker = ensureRawWorker();

  if (!worker) {
    return Promise.resolve({
      ok: false,
      error: {
        code: 'RAW_WORKER_UNAVAILABLE',
        message: 'Przeglądarka nie udostępnia Worker API dla pipeline RAW.',
      },
      payload: {
        decoderInstalled: false,
        workerReady: false,
        supportedFormats: [],
      },
    });
  }

  const id = nextRequestId++;

  return new Promise((resolve, reject) => {
    inflightRequests.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload });
  });
}

export function probeRawPipeline() {
  return sendRawWorkerMessage('probe', {
    baseUrl: BRIDGE_BASE_URL,
  });
}

export function decodeRawSource(file, renderIntent = 'preview', backendPreference = null) {
  return sendRawWorkerMessage('decode', {
    fileName: file?.name ?? '',
    fileSize: file?.size ?? 0,
    fileType: file?.type ?? '',
    renderIntent,
    backendPreference,
    baseUrl: BRIDGE_BASE_URL,
    file,
  });
}

export function disposeRawPipeline() {
  if (!rawWorker) {
    return;
  }

  rawWorker.terminate();
  rawWorker = null;
  inflightRequests.clear();
}
