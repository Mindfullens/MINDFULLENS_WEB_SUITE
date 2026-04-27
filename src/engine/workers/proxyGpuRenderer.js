import { readEnvNegated } from '../../filmLab/runtimeEnv.js';
import { resolveWhiteBalanceGains } from '../whiteBalance.js';
import { clampUnit } from '../colorMathShared.js';
import { probeWebgl2Rgba16fFboUsable } from '../webgl2Rgba16fFboProbe.js';
import { probeWebgl2Rgba16f3dLutUsable } from '../webgl2Rgba16f3dLutProbe.js';
import { u8RgbaToHalfFloatRgbaForTexImage } from '../webglU8RgbaToHalfFloat.js';
import { wouldProxy3dLutsExceedMaxTexEdge } from '../proxyGpuLut3dLimit.js';
import { doesRectExceedMaxTexture2dEdge } from '../proxyGpu2dRectLimit.js';
import { flipRgba8ImageYInPlace } from '../proxyOutputTileComposite.js';

const VERTEX_SOURCE = [
  '#version 300 es',
  'precision highp float;',
  'layout(location = 0) in vec2 aPosition;',
  'out vec2 vUv;',
  'void main() {',
  '  vUv = aPosition * 0.5 + 0.5;',
  '  gl_Position = vec4(aPosition, 0.0, 1.0);',
  '}'
].join('\n');

const FRAGMENT_SOURCE = [
  '#version 300 es',
  'precision highp float;',
  'in vec2 vUv;',
  'out vec4 outColor;',
  '',
  'uniform sampler2D uSource;',
  'uniform sampler3D uLut;',
  'uniform int uHasLut;',
  'uniform float uLutSize;',
  'uniform float uExposureGain;',
  'uniform float uContrast;',
  'uniform float uPivot;',
  'uniform int uMode;',
  'uniform float uMaxWhite;',
  'uniform float uSaturation;',
  'uniform float uVibrance;',
  'uniform float uWbR;',
  'uniform float uWbG;',
  'uniform float uWbB;',
  'uniform vec4 uTone;',
  'uniform float uFade;',
  'uniform float uMicroContrast;',
  'uniform float uVignette;',
  'uniform float uBloom;',
  'uniform sampler3D uLookLut;',
  'uniform int uHasLookLut;',
  'uniform float uLookLutSize;',
  'uniform int uShowClipping;',
  'uniform float uStrength;',
  'uniform vec4 uOutputUv;',
  '',
  'float applyContrastCurve(float val, float contrast) {',
  '  return (val - 0.5) * contrast + 0.5;',
  '}',
  '',
  'vec3 applyTone(vec3 color, vec4 tone) {',
  '  float luma = dot(color, vec3(0.299, 0.587, 0.114));',
  '  ',
  '  float shadowMask = 1.0 - smoothstep(0.0, 0.65, luma);',
  '  float highMask = smoothstep(0.35, 1.0, luma);',
  '  float blackMask = 1.0 - smoothstep(0.0, 0.45, luma);',
  '  float whiteMask = smoothstep(0.55, 1.0, luma);',
  '',
  '  float shadowAdjust = tone.y * shadowMask * 0.45;',
  '  float highAdjust = tone.x * highMask * 0.45;',
  '  float blackAdjust = tone.w * blackMask * 0.4;',
  '  float whiteAdjust = tone.z * whiteMask * 0.4;',
  '',
  '  color += vec3(shadowAdjust + highAdjust + blackAdjust + whiteAdjust);',
  '  return color;',
  '}',
  '',
  'vec3 sampleLut(vec3 color) {',
  '  if (uHasLut == 0) return color;',
  '  vec3 coords = clamp(color.rgb, 0.0, 1.0) * ((uLutSize - 1.0) / uLutSize) + (0.5 / uLutSize);',
  '  return texture(uLut, coords).rgb;',
  '}',
  '',
  'vec3 sampleLookLut(vec3 color) {',
  '  if (uHasLookLut == 0) return color;',
  '  vec3 coords = clamp(color.bgr, 0.0, 1.0) * ((uLookLutSize - 1.0) / uLookLutSize) + (0.5 / uLookLutSize);',
  '  return texture(uLookLut, coords).rgb;',
  '}',
  '',
  'void main() {',
  '  vec2 gUv = uOutputUv.xy + vUv * uOutputUv.zw;',
  '  vec3 color = texture(uSource, gUv).rgb;',
  '  color *= max(0.0, uExposureGain);',
  '',
  '  color.r *= uWbR;',
  '  color.g *= uWbG;',
  '  color.b *= uWbB;',
  '',
  '  color = applyTone(color, uTone);',
  '  ',
  '  vec3 colorBeforeLuts = color;',
  '  color = sampleLut(color);',
  '  color = sampleLookLut(color);',
  '  ',
  '  color = mix(colorBeforeLuts, color, uStrength);',
  '',
  '  if (uMode == 1) {',
  '    float luma = dot(color, vec3(0.299, 0.587, 0.114));',
  '    float newLuma = applyContrastCurve(luma, uContrast);',
  '    color *= (newLuma / max(luma, 0.0001));',
  '  } else {',
  '    color.r = applyContrastCurve(color.r, uContrast);',
  '    color.g = applyContrastCurve(color.g, uContrast);',
  '    color.b = applyContrastCurve(color.b, uContrast);',
  '  }',
  '',
  '  color = (color - 0.5) * (1.0 + uMicroContrast * 0.15) + 0.5;',
  '',
  '  float luma = dot(color, vec3(0.299, 0.587, 0.114));',
  '  float maxC = max(color.r, max(color.g, color.b));',
  '  float minC = min(color.r, min(color.g, color.b));',
  '  float satNow = maxC > 0.0001 ? (maxC - minC) / maxC : 0.0;',
  '  float satMix = max(0.0, uSaturation + uVibrance * (1.0 - satNow));',
  '  ',
  '  float rollOffMask = smoothstep(0.75, 1.0, luma / max(uMaxWhite, 1.0));',
  '  satMix *= (1.0 - rollOffMask);',
  '  ',
  '  color = vec3(luma) + (color - vec3(luma)) * satMix;',
  '',
  '  vec3 fadeLift = vec3(0.22, 0.215, 0.205);',
  '  color = mix(color, fadeLift, clamp(uFade * 0.22, 0.0, 1.0));',
  '',
  '  float bloomMask = smoothstep(0.65, 1.0, luma) * clamp(uBloom * 0.22, 0.0, 1.0);',
  '  color += vec3(0.18, 0.14, 0.16) * bloomMask;',
  '',
  '  vec2 radial = gUv * 2.0 - 1.0;',
  '  float radius = length(radial);',
  '  float vigMask = smoothstep(0.35, 1.0, radius) * clamp(uVignette * 0.78, 0.0, 1.0);',
  '  color *= 1.0 - vigMask;',
  '',
  '  vec3 preClipColor = color;',
  '  color = clamp(color, 0.0, 1.0);',
  '',
  '  if (uShowClipping == 1) {',
  '    if (preClipColor.r >= 0.92 || preClipColor.g >= 0.92 || preClipColor.b >= 0.92) {',
  '      color = vec3(1.0, 0.0, 0.0);',
  '    } ',
  '    else if (dot(preClipColor, vec3(0.2126, 0.7152, 0.0722)) <= 0.055 && preClipColor.r <= 0.03 && preClipColor.g <= 0.03 && preClipColor.b <= 0.03) {',
  '      color = vec3(0.0, 0.0, 1.0);',
  '    }',
  '  }',
  '',
  '  outColor = vec4(color, 1.0);',
  '}'
].join('\n');

/** Blit LDR: próbka z FBO `RGBA16F` do bufora domyślnego (jak `fastPreviewRenderer`, §5.1.1.1). */
const BLIT_VERTEX_SOURCE = [
  '#version 300 es',
  'precision highp float;',
  'layout(location = 0) in vec2 aPosition;',
  'out vec2 vUv;',
  'void main() {',
  '  vUv = aPosition * 0.5 + 0.5;',
  '  gl_Position = vec4(aPosition, 0.0, 1.0);',
  '}',
].join('\n');

const BLIT_FRAGMENT_SOURCE = [
  '#version 300 es',
  'precision highp float;',
  'in vec2 vUv;',
  'out vec4 outColor;',
  'uniform sampler2D uBlitSrc;',
  'void main() {',
  '  outColor = texture(uBlitSrc, vUv);',
  '}',
].join('\n');

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error('Failed to allocate shader.');
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || 'Unknown shader compile error.';
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log}`);
  }
  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    throw new Error('Failed to allocate program.');
  }
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || 'Unknown program link error.';
    gl.deleteProgram(program);
    throw new Error(`Program link error: ${log}`);
  }

  return program;
}

function createUniformResolver(gl, program) {
  const cache = new Map();
  return (name) => {
    if (cache.has(name)) {
      return cache.get(name);
    }
    const location = gl.getUniformLocation(program, name);
    cache.set(name, location);
    return location;
  };
}

const GL_ERROR_NAMES = new Map([
  [0, 'NO_ERROR'],
  [0x0500, 'INVALID_ENUM'],
  [0x0501, 'INVALID_VALUE'],
  [0x0502, 'INVALID_OPERATION'],
  [0x0505, 'OUT_OF_MEMORY'],
  [0x0506, 'INVALID_FRAMEBUFFER_OPERATION'],
  [0x9242, 'CONTEXT_LOST_WEBGL'],
]);

function describeGlErrorCode(code) {
  const name = GL_ERROR_NAMES.get(code) ?? `0x${code.toString(16)}`;
  return `${code} (${name})`;
}

function assertNoGlError(gl, stage) {
  const code = gl.getError();
  if (code !== gl.NO_ERROR) {
    throw new Error(`WebGL error after ${stage}: ${describeGlErrorCode(code)}`);
  }
}

export function normalizeByteLutPayload(label, lutSize, lutData) {
  const normalizedSize = Number(lutSize);
  if (!normalizedSize || normalizedSize < 2 || !lutData) {
    return null;
  }

  const size = Math.max(2, Math.round(normalizedSize));
  const safeData =
    lutData instanceof Uint8Array
      ? lutData
      : lutData instanceof Uint8ClampedArray
        ? new Uint8Array(lutData.buffer, lutData.byteOffset, lutData.byteLength)
        : null;

  if (!safeData) {
    throw new Error(`${label} LUT payload must be Uint8Array-compatible.`);
  }

  const expectedLength = size * size * size * 3;
  if (safeData.length !== expectedLength) {
    throw new Error(
      `${label} LUT payload mismatch: expected ${expectedLength} bytes, got ${safeData.length} (size=${size}).`
    );
  }

  return { size, data: safeData };
}

export function buildDataSignature(size, data, extraKey = '') {
  if (!data || !data.length) {
    return `${size}:empty:${extraKey}`;
  }
  const step = Math.max(1, Math.floor(data.length / 97));
  let hash = 2166136261;
  for (let i = 0; i < data.length; i += step) {
    hash ^= data[i];
    hash = Math.imul(hash, 16777619);
  }
  hash ^= data[data.length - 1];
  hash = Math.imul(hash, 16777619);
  return `${size}:${data.length}:${extraKey}:${(hash >>> 0).toString(16)}`;
}

export function resolveLookLutPayload(lookLut) {
  if (!lookLut || typeof lookLut !== 'object') {
    return { size: 0, data: null, key: '' };
  }
  return {
    size: Number(lookLut.size) || 0,
    data: lookLut.data ?? lookLut.srgbData ?? null,
    key: typeof lookLut.key === 'string' ? lookLut.key : '',
  };
}

export function normalizeSourcePixelView(sourcePixels, sourceWidth, sourceHeight) {
  if (!(sourcePixels instanceof Uint8Array || sourcePixels instanceof Uint8ClampedArray)) {
    return null;
  }
  const expectedLength = Math.max(0, sourceWidth * sourceHeight * 4);
  const safeSourcePixels =
    sourcePixels instanceof Uint8Array
      ? sourcePixels
      : new Uint8Array(sourcePixels.buffer, sourcePixels.byteOffset, sourcePixels.byteLength);
  if (safeSourcePixels.length !== expectedLength) {
    throw new Error(
      `Source pixel payload mismatch: expected ${expectedLength}, got ${safeSourcePixels.length} (source=${sourceWidth}x${sourceHeight}).`
    );
  }
  return safeSourcePixels;
}

export function createProxyGpuRenderer() {
  const canvas = new OffscreenCanvas(1, 1);
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    premultipliedAlpha: false,
  });

  if (!gl) {
    throw new Error('WebGL2 not available in worker.');
  }

  const __webgl2Rgba16fFbo = probeWebgl2Rgba16fFboUsable(gl);
  /** Ten sam opt-out co szybki podgląd: `VITE_FILMLAB_FAST_FBO16F=0` wyłącza FBO+blit w workerze. */
  const useFloatFboRgba16f = __webgl2Rgba16fFbo && !readEnvNegated(import.meta?.env?.VITE_FILMLAB_FAST_FBO16F);
  /** 3D LUT w `RGBA16F`+`HALF_FLOAT` tylko przy aktywnym FBO+blit i pozytywnej sondzie (§5.1.1.1). */
  const use3dLutRgba16f = useFloatFboRgba16f && probeWebgl2Rgba16f3dLutUsable(gl);

  const maxTex2d = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0;
  const maxTex3d = Number(gl.getParameter(gl.MAX_3D_TEXTURE_SIZE)) || 0;

  const program = createProgram(gl, VERTEX_SOURCE, FRAGMENT_SOURCE);
  const uniform = createUniformResolver(gl, program);

  const vao = gl.createVertexArray();
  if (!vao) {
    throw new Error('Failed to allocate VAO.');
  }
  gl.bindVertexArray(vao);

  const quadBuffer = gl.createBuffer();
  if (!quadBuffer) {
    throw new Error('Failed to allocate quad buffer.');
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  const sourceTexture = gl.createTexture();
  if (!sourceTexture) {
    throw new Error('Failed to allocate source texture.');
  }
  gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const lutTexture = gl.createTexture();
  if (!lutTexture) {
    throw new Error('Failed to allocate LUT texture.');
  }
  gl.bindTexture(gl.TEXTURE_3D, lutTexture);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const lookLutTexture = gl.createTexture();
  if (!lookLutTexture) {
    throw new Error('Failed to allocate Look LUT texture.');
  }
  gl.bindTexture(gl.TEXTURE_3D, lookLutTexture);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  let currentWidth = 1;
  let currentHeight = 1;
  let lutCacheKey = '';
  let lookLutCacheKey = '';

  let fbo = null;
  let fboColorTex = null;
  let fboW = 0;
  let fboH = 0;
  let blitProgram = null;
  /** @type {WebGLUniformLocation | null} */
  let blitULocation = null;

  if (useFloatFboRgba16f) {
    fbo = gl.createFramebuffer();
    if (!fbo) {
      throw new Error('WebGL2: brak alokacji FBO dla RGBA16F.');
    }
    blitProgram = createProgram(gl, BLIT_VERTEX_SOURCE, BLIT_FRAGMENT_SOURCE);
    blitULocation = gl.getUniformLocation(blitProgram, 'uBlitSrc');
  }

  function ensureFloatFboSize(width, height) {
    if (!useFloatFboRgba16f || !fbo) {
      return;
    }
    if (fboW === width && fboH === height && fboColorTex) {
      return;
    }
    fboW = width;
    fboH = height;
    if (!fboColorTex) {
      fboColorTex = gl.createTexture();
    }
    if (!fboColorTex) {
      throw new Error('WebGL2: brak tekstury FBO RGBA16F.');
    }
    gl.bindTexture(gl.TEXTURE_2D, fboColorTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboColorTex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`WebGL2: FBO RGBA16F incomplete (0x${status.toString(16)}).`);
    }
  }

  function ensureCanvasSize(width, height) {
    if (currentWidth === width && currentHeight === height) {
      return;
    }
    currentWidth = width;
    currentHeight = height;
    canvas.width = width;
    canvas.height = height;
  }

  function assertProxyFrameFitsWebGlLimits(sw, sh, tw, th, effectiveProfileLutS, effectiveLookLutS) {
    if (doesRectExceedMaxTexture2dEdge(sw, sh, maxTex2d)) {
      throw new Error(
        `WebGL2: źródło przekracza MAX_TEXTURE_SIZE=${maxTex2d} (${sw}×${sh}).`,
      );
    }
    if (doesRectExceedMaxTexture2dEdge(tw, th, maxTex2d)) {
      throw new Error(
        `WebGL2: cel przekracza MAX_TEXTURE_SIZE=${maxTex2d} (${tw}×${th}).`,
      );
    }
    if (maxTex3d > 0) {
      const pS = Math.floor(Number(effectiveProfileLutS) || 0);
      const lS = Math.floor(Number(effectiveLookLutS) || 0);
      if (wouldProxy3dLutsExceedMaxTexEdge(pS, lS, maxTex3d)) {
        if (pS > 1 && pS > maxTex3d) {
          throw new Error(
            `WebGL2: LUT profilu (rozmiar ${pS}) przekracza MAX_3D_TEXTURE_SIZE=${maxTex3d}.`,
          );
        }
        if (lS > 1 && lS > maxTex3d) {
          throw new Error(
            `WebGL2: LUT look (rozmiar ${lS}) przekracza MAX_3D_TEXTURE_SIZE=${maxTex3d}.`,
          );
        }
      }
    }
  }

  function updateLutTexture(lutSize, lutData) {
    const normalized = normalizeByteLutPayload('Profile', lutSize, lutData);
    const key = normalized ? buildDataSignature(normalized.size, normalized.data) : 'none';
    if (lutCacheKey === key) {
      return;
    }
    lutCacheKey = key;

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, lutTexture);

    if (!normalized) {
      if (use3dLutRgba16f) {
        const h = u8RgbaToHalfFloatRgbaForTexImage(new Uint8Array([0, 0, 0, 255]));
        if (h) {
          gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, 1, 1, 1, 0, gl.RGBA, gl.HALF_FLOAT, h);
        } else {
          gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
        }
      } else {
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      }
      assertNoGlError(gl, 'profile LUT reset');
      return;
    }

    const { size, data } = normalized;
    const rgbaData = new Uint8Array(size * size * size * 4);
    for (let i = 0; i < size * size * size; i++) {
      rgbaData[i * 4] = data[i * 3];
      rgbaData[i * 4 + 1] = data[i * 3 + 1];
      rgbaData[i * 4 + 2] = data[i * 3 + 2];
      rgbaData[i * 4 + 3] = 255;
    }

    if (use3dLutRgba16f) {
      const h = u8RgbaToHalfFloatRgbaForTexImage(rgbaData);
      if (h) {
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, size, size, size, 0, gl.RGBA, gl.HALF_FLOAT, h);
      } else {
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, size, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgbaData);
      }
    } else {
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, size, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgbaData);
    }
    assertNoGlError(gl, 'profile LUT upload');
  }

  function updateLookLutTexture(lutSize, lutData, lutKey = '') {
    const normalized = normalizeByteLutPayload('Look', lutSize, lutData);
    const key = normalized
      ? buildDataSignature(normalized.size, normalized.data, lutKey)
      : `none:${lutKey}`;
    if (lookLutCacheKey === key) {
      return;
    }
    lookLutCacheKey = key;

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_3D, lookLutTexture);

    if (!normalized) {
      if (use3dLutRgba16f) {
        const h = u8RgbaToHalfFloatRgbaForTexImage(new Uint8Array([0, 0, 0, 0]));
        if (h) {
          gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, 1, 1, 1, 0, gl.RGBA, gl.HALF_FLOAT, h);
        } else {
          gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
        }
      } else {
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
      }
      assertNoGlError(gl, 'look LUT reset');
      return;
    }

    const { size, data } = normalized;
    const rgbaData = new Uint8Array(size * size * size * 4);
    for (let i = 0; i < size * size * size; i++) {
      rgbaData[i * 4] = data[i * 3];
      rgbaData[i * 4 + 1] = data[i * 3 + 1];
      rgbaData[i * 4 + 2] = data[i * 3 + 2];
      rgbaData[i * 4 + 3] = 255;
    }

    if (use3dLutRgba16f) {
      const h = u8RgbaToHalfFloatRgbaForTexImage(rgbaData);
      if (h) {
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, size, size, size, 0, gl.RGBA, gl.HALF_FLOAT, h);
      } else {
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, size, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgbaData);
      }
    } else {
      gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, size, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgbaData);
    }
    assertNoGlError(gl, 'look LUT upload');
  }

  function render(params) {
    const {
      sourcePixels,
      sourceWidth,
      sourceHeight,
      targetWidth,
      targetHeight,
      film = {},
      adjustments = {},
      profileLutSize = 0,
      profileLutData = null,
      lookLut = null,
      outputTile = null,
      returnPixels = false,
    } = params;
    const lookLutPayload = resolveLookLutPayload(lookLut);
    const hasProfileLut = Number(profileLutSize) > 1 && Boolean(profileLutData);
    const hasLookLut = Number(lookLutPayload.size) > 1 && Boolean(lookLutPayload.data);

    assertProxyFrameFitsWebGlLimits(
      sourceWidth,
      sourceHeight,
      targetWidth,
      targetHeight,
      hasProfileLut ? profileLutSize : 0,
      hasLookLut ? lookLutPayload.size : 0,
    );

    ensureCanvasSize(targetWidth, targetHeight);
    updateLutTexture(profileLutSize, profileLutData);
    updateLookLutTexture(lookLutPayload.size, lookLutPayload.data, lookLutPayload.key);

    const baseProfileStrength = clampUnit((adjustments.strength ?? 100) / 100);
    const profileStrength = baseProfileStrength * 0.66; // Match lutStrength
    const userExposure = ((adjustments.exposure ?? 0) / 100) * 1.42;
    const profileExposure = (film.exposure ?? 0) * baseProfileStrength * 0.28;
    const exposureEv = userExposure + profileExposure;
    const exposureGain = Math.pow(2, exposureEv);
    
    const contrast = 1 + ((adjustments.contrast ?? 0) * 0.28 / 200) + ((film.contrast ?? 0) * baseProfileStrength * 0.42 / 200);
    const saturation = 1 + ((adjustments.saturation ?? 0) * 0.35 / 100) + ((film.saturation ?? 0) * baseProfileStrength * 0.9 / 100);
    const vibrance = ((adjustments.vibrance ?? 0) * 0.55 / 100) + ((film.vibrance ?? 0) * baseProfileStrength * 0.9 / 100);
    const hasExplicitWbGains = Number.isFinite(adjustments?.wbR)
      && Number.isFinite(adjustments?.wbG)
      && Number.isFinite(adjustments?.wbB);
    const wb = hasExplicitWbGains
      ? {
          r: Number(adjustments.wbR),
          g: Number(adjustments.wbG),
          b: Number(adjustments.wbB),
        }
      : resolveWhiteBalanceGains(adjustments?.temp ?? 0, adjustments?.tint ?? 0);
    const highlights = ((adjustments.highlights ?? 0) * 0.3 / 100) + ((film.highlights ?? 0) * baseProfileStrength * 0.28 / 100);
    const shadows = ((adjustments.shadows ?? 0) * 0.3 / 100) + ((film.shadows ?? 0) * baseProfileStrength * 0.28 / 100);
    const whites = ((adjustments.whites ?? 0) * 0.3 / 100) + ((film.whites ?? 0) * baseProfileStrength * 0.28 / 100);
    const blacks = ((adjustments.blacks ?? 0) * 0.3 / 100) + ((film.blacks ?? 0) * baseProfileStrength * 0.28 / 100);
    const fade = clampUnit((adjustments.fade ?? 0) / 100);
    const dehaze = ((adjustments.dehaze ?? 0) / 100) * 0.32 + ((film.dehaze ?? 0) / 100) * 0.2;
    const clarity = ((adjustments.clarity ?? 0) / 100) * 0.4 + ((film.clarity ?? 0) / 100) * 0.22;
    const microContrast = dehaze * 0.22 + clarity * 0.16;
    const vignette = clampUnit((adjustments.userVignette ?? 0) / 100);
    const bloom = clampUnit((adjustments.bloom ?? 0) / 100);

    gl.viewport(0, 0, targetWidth, targetHeight);
    gl.useProgram(program);
    gl.bindVertexArray(vao);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
    if (useFloatFboRgba16f) {
      ensureFloatFboSize(targetWidth, targetHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    }
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    const safeSourcePixels = normalizeSourcePixelView(sourcePixels, sourceWidth, sourceHeight);
    if (safeSourcePixels) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        sourceWidth,
        sourceHeight,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        safeSourcePixels
      );
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourcePixels);
    }
    assertNoGlError(gl, 'texImage2D');
    gl.uniform1i(uniform('uSource'), 0);
    gl.uniform1i(uniform('uLut'), 1);
    gl.uniform1i(uniform('uHasLut'), hasProfileLut ? 1 : 0);
    gl.uniform1f(uniform('uLutSize'), profileLutSize > 1 ? profileLutSize : 1);
    
    gl.uniform1i(uniform('uLookLut'), 2);
    gl.uniform1i(uniform('uHasLookLut'), hasLookLut ? 1 : 0);
    gl.uniform1f(uniform('uLookLutSize'), hasLookLut ? lookLutPayload.size : 1);

    gl.uniform1f(uniform('uExposureGain'), exposureGain);
    gl.uniform1f(uniform('uContrast'), contrast);
    gl.uniform1f(uniform('uPivot'), adjustments.pivot ?? 0.18);
    gl.uniform1i(uniform('uMode'), 1);
    gl.uniform1f(uniform('uMaxWhite'), 1.0);
    gl.uniform1f(uniform('uSaturation'), saturation);
    gl.uniform1f(uniform('uVibrance'), vibrance);
    gl.uniform1f(uniform('uWbR'), wb.r);
    gl.uniform1f(uniform('uWbG'), wb.g);
    gl.uniform1f(uniform('uWbB'), wb.b);
    gl.uniform4f(uniform('uTone'), highlights, shadows, whites, blacks);
    gl.uniform1f(uniform('uFade'), fade);
    gl.uniform1f(uniform('uMicroContrast'), microContrast);
    gl.uniform1f(uniform('uVignette'), vignette);
    gl.uniform1f(uniform('uBloom'), bloom);
    gl.uniform1i(uniform('uShowClipping'), adjustments?.showClipping ? 1 : 0);
    gl.uniform1f(uniform('uStrength'), profileStrength);

    const fullW = outputTile ? Number(outputTile.fullWidth) || targetWidth : targetWidth;
    const fullH = outputTile ? Number(outputTile.fullHeight) || targetHeight : targetHeight;
    const ox = outputTile ? Number(outputTile.originX) || 0 : 0;
    const oy = outputTile ? Number(outputTile.originY) || 0 : 0;
    gl.uniform4f(
      uniform('uOutputUv'),
      ox / Math.max(1, fullW),
      oy / Math.max(1, fullH),
      targetWidth / Math.max(1, fullW),
      targetHeight / Math.max(1, fullH),
    );

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    assertNoGlError(gl, 'drawArrays');

    if (useFloatFboRgba16f && fbo && fboColorTex && blitProgram && blitULocation) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, targetWidth, targetHeight);
      gl.useProgram(blitProgram);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, fboColorTex);
      gl.uniform1i(blitULocation, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      assertNoGlError(gl, 'blit fboRgba16f to canvas');
      gl.useProgram(program);
    }
    gl.bindVertexArray(null);
    assertNoGlError(gl, 'post-draw');

    if (returnPixels) {
      const buf = new Uint8Array(targetWidth * targetHeight * 4);
      gl.readPixels(0, 0, targetWidth, targetHeight, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      assertNoGlError(gl, 'readPixels');
      const pixels = new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.byteLength);
      flipRgba8ImageYInPlace(pixels, targetWidth, targetHeight);
      return { width: targetWidth, height: targetHeight, pixels, bitmap: null };
    }
    return { width: targetWidth, height: targetHeight, bitmap: canvas.transferToImageBitmap() };
  }

  function destroy() {
    if (fbo) {
      gl.deleteFramebuffer(fbo);
    }
    if (fboColorTex) {
      gl.deleteTexture(fboColorTex);
    }
    if (blitProgram) {
      gl.deleteProgram(blitProgram);
    }
    gl.deleteTexture(sourceTexture);
    gl.deleteTexture(lutTexture);
    gl.deleteTexture(lookLutTexture);
    gl.deleteBuffer(quadBuffer);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
  }

  return {
    render,
    destroy,
    __gpuBackend: 'webgl',
    __glMaxTexture2d: maxTex2d,
    __glMaxTexture3d: maxTex3d,
    /** Sonda FBO `RGBA16F` (ten sam moduł co szybki podgląd w main). */
    __webgl2Rgba16fFbo,
    /** `true` gdy render idzie do FBO `RGBA16F` + blit (jak fast preview); wymaga sondy + brak `VITE_FILMLAB_FAST_FBO16F=0`. */
    __webgl2ProxyFboRgba16fBlit: useFloatFboRgba16f,
    /** 3D LUT w `TEXTURE_3D` z `RGBA16F`+`HALF_FLOAT` (sonda 3D + aktywne FBO+blit). */
    __webgl2Proxy3dLutRgba16f: use3dLutRgba16f,
  };
}
