const VERTEX_SOURCE = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT_SOURCE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uSource;
uniform sampler2D uLut;
uniform int uHasLut;
uniform int uLutSize;
uniform float uExposureGain;
uniform float uContrast;
uniform float uSaturation;
uniform float uVibrance;
uniform vec2 uTempTint;
uniform vec4 uTone;
uniform float uFade;
uniform float uMicroContrast;
uniform float uVignette;
uniform float uBloom;

vec3 applyTone(vec3 color, vec4 tone) {
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  float highMask = smoothstep(0.5, 1.0, luma);
  float shadowMask = 1.0 - smoothstep(0.0, 0.5, luma);

  float highAdjust = tone.x * highMask * 0.34 + tone.z * highMask * 0.4;
  float shadowAdjust = tone.y * shadowMask * 0.3 + tone.w * shadowMask * 0.38;

  if (highAdjust >= 0.0) {
    color += (1.0 - color) * highAdjust;
  } else {
    color *= 1.0 + highAdjust;
  }

  if (shadowAdjust >= 0.0) {
    color += (1.0 - color) * shadowAdjust;
  } else {
    color *= 1.0 + shadowAdjust;
  }

  return color;
}

ivec2 lutCoord(int r, int g, int b) {
  return ivec2(g * uLutSize + b, r);
}

vec3 sampleLut(vec3 color) {
  if (uHasLut == 0 || uLutSize < 2) {
    return color;
  }

  float maxIndex = float(uLutSize - 1);
  vec3 pos = clamp(color, 0.0, 1.0) * maxIndex;
  int r0 = int(floor(pos.r));
  int g0 = int(floor(pos.g));
  int b0 = int(floor(pos.b));
  int r1 = min(uLutSize - 1, r0 + 1);
  int g1 = min(uLutSize - 1, g0 + 1);
  int b1 = min(uLutSize - 1, b0 + 1);

  float dr = pos.r - float(r0);
  float dg = pos.g - float(g0);
  float db = pos.b - float(b0);

  vec3 v000 = texelFetch(uLut, lutCoord(r0, g0, b0), 0).rgb;
  vec3 v001 = texelFetch(uLut, lutCoord(r0, g0, b1), 0).rgb;
  vec3 v010 = texelFetch(uLut, lutCoord(r0, g1, b0), 0).rgb;
  vec3 v011 = texelFetch(uLut, lutCoord(r0, g1, b1), 0).rgb;
  vec3 v100 = texelFetch(uLut, lutCoord(r1, g0, b0), 0).rgb;
  vec3 v101 = texelFetch(uLut, lutCoord(r1, g0, b1), 0).rgb;
  vec3 v110 = texelFetch(uLut, lutCoord(r1, g1, b0), 0).rgb;
  vec3 v111 = texelFetch(uLut, lutCoord(r1, g1, b1), 0).rgb;

  vec3 c00 = mix(v000, v100, dr);
  vec3 c01 = mix(v001, v101, dr);
  vec3 c10 = mix(v010, v110, dr);
  vec3 c11 = mix(v011, v111, dr);
  vec3 c0 = mix(c00, c10, dg);
  vec3 c1 = mix(c01, c11, dg);
  return mix(c0, c1, db);
}

void main() {
  vec3 color = texture(uSource, vUv).rgb;
  color *= max(0.0, uExposureGain);

  color.r += uTempTint.x + uTempTint.y * 0.2;
  color.g += uTempTint.y * 0.08;
  color.b -= uTempTint.x;

  color = applyTone(color, uTone);
  color = sampleLut(color);

  color = (color - 0.5) * uContrast + 0.5;
  color = (color - 0.5) * (1.0 + uMicroContrast * 0.15) + 0.5;

  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  float maxC = max(color.r, max(color.g, color.b));
  float minC = min(color.r, min(color.g, color.b));
  float satNow = maxC > 0.0001 ? (maxC - minC) / maxC : 0.0;
  float satMix = max(0.0, uSaturation + uVibrance * (1.0 - satNow));
  color = vec3(luma) + (color - vec3(luma)) * satMix;

  vec3 fadeLift = vec3(0.22, 0.215, 0.205);
  color = mix(color, fadeLift, clamp(uFade * 0.22, 0.0, 1.0));

  float bloomMask = smoothstep(0.65, 1.0, luma) * clamp(uBloom * 0.22, 0.0, 1.0);
  color += vec3(0.18, 0.14, 0.16) * bloomMask;

  vec2 radial = vUv * 2.0 - 1.0;
  float radius = length(radial);
  float vigMask = smoothstep(0.35, 1.0, radius) * clamp(uVignette * 0.78, 0.0, 1.0);
  color *= 1.0 - vigMask;

  outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

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
    throw new Error(log);
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
    throw new Error(log);
  }

  return program;
}

function clampUnit(value) {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
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
  gl.bindTexture(gl.TEXTURE_2D, lutTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  let currentWidth = 1;
  let currentHeight = 1;
  let lutCacheKey = '';

  function ensureCanvasSize(width, height) {
    if (currentWidth === width && currentHeight === height) {
      return;
    }
    currentWidth = width;
    currentHeight = height;
    canvas.width = width;
    canvas.height = height;
  }

  function updateLutTexture(lutSize, lutData) {
    const key = `${lutSize}:${lutData ? lutData.length : 0}:${lutData?.buffer ?? 'none'}`;
    if (lutCacheKey === key) {
      return;
    }
    lutCacheKey = key;

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, lutTexture);

    if (!lutSize || lutSize < 2 || !lutData) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([0, 0, 0, 255])
      );
      return;
    }

    const width = lutSize * lutSize;
    const height = lutSize;
    const rgba = new Uint8Array(width * height * 4);

    for (let red = 0; red < lutSize; red += 1) {
      for (let green = 0; green < lutSize; green += 1) {
        for (let blue = 0; blue < lutSize; blue += 1) {
          const srcIndex = ((red * lutSize + green) * lutSize + blue) * 3;
          const dstIndex = ((red * width + green * lutSize + blue) * 4);
          rgba[dstIndex] = lutData[srcIndex];
          rgba[dstIndex + 1] = lutData[srcIndex + 1];
          rgba[dstIndex + 2] = lutData[srcIndex + 2];
          rgba[dstIndex + 3] = 255;
        }
      }
    }

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
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
    } = params;

    ensureCanvasSize(targetWidth, targetHeight);
    updateLutTexture(profileLutSize, profileLutData);

    const profileStrength = clampUnit((adjustments.strength ?? 100) / 100);
    const exposureEv = ((adjustments.exposure ?? 0) / 100) * 1.42 + ((film.exposure ?? 0) / 100) * 0.35 * profileStrength;
    const exposureGain = Math.pow(2, exposureEv);
    const contrast = 1 + ((adjustments.contrast ?? 0) / 100) * 0.28 + ((film.contrast ?? 0) / 100) * 0.25 * profileStrength;
    const saturation = 1 + ((adjustments.saturation ?? 0) / 100) * 0.35 + ((film.saturation ?? 0) / 100) * 0.2 * profileStrength;
    const vibrance = ((adjustments.vibrance ?? 0) / 100) * 0.55 + ((film.vibrance ?? 0) / 100) * 0.28 * profileStrength;
    const tempShift = (((adjustments.temp ?? 0) / 100) * 20 + ((film.temperature ?? 0) / 100) * 14 * profileStrength) * 0.75 / 255;
    const tintShift = (((adjustments.tint ?? 0) / 100) * 16 + ((film.tint ?? 0) / 100) * 10 * profileStrength) * 0.7 / 255;
    const highlights = ((adjustments.highlights ?? 0) / 100) * 0.3 + ((film.highlights ?? 0) / 100) * 0.2 * profileStrength;
    const shadows = ((adjustments.shadows ?? 0) / 100) * 0.3 + ((film.shadows ?? 0) / 100) * 0.2 * profileStrength;
    const whites = ((adjustments.whites ?? 0) / 100) * 0.3 + ((film.whites ?? 0) / 100) * 0.2 * profileStrength;
    const blacks = ((adjustments.blacks ?? 0) / 100) * 0.3 + ((film.blacks ?? 0) / 100) * 0.2 * profileStrength;
    const fade = clampUnit((adjustments.fade ?? 0) / 100);
    const dehaze = ((adjustments.dehaze ?? 0) / 100) * 0.32 + ((film.dehaze ?? 0) / 100) * 0.2;
    const clarity = ((adjustments.clarity ?? 0) / 100) * 0.4 + ((film.clarity ?? 0) / 100) * 0.22;
    const microContrast = dehaze * 0.22 + clarity * 0.16;
    const vignette = clampUnit((adjustments.userVignette ?? 0) / 100);
    const bloom = clampUnit((adjustments.bloom ?? 0) / 100);

    gl.viewport(0, 0, targetWidth, targetHeight);
    gl.useProgram(program);
    gl.bindVertexArray(vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      sourceWidth,
      sourceHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      sourcePixels
    );

    gl.uniform1i(uniform('uSource'), 0);
    gl.uniform1i(uniform('uLut'), 1);
    gl.uniform1i(uniform('uHasLut'), profileLutSize > 1 && profileLutData ? 1 : 0);
    gl.uniform1i(uniform('uLutSize'), profileLutSize > 1 ? profileLutSize : 1);
    gl.uniform1f(uniform('uExposureGain'), exposureGain);
    gl.uniform1f(uniform('uContrast'), contrast);
    gl.uniform1f(uniform('uSaturation'), saturation);
    gl.uniform1f(uniform('uVibrance'), vibrance);
    gl.uniform2f(uniform('uTempTint'), tempShift, tintShift);
    gl.uniform4f(uniform('uTone'), highlights, shadows, whites, blacks);
    gl.uniform1f(uniform('uFade'), fade);
    gl.uniform1f(uniform('uMicroContrast'), microContrast);
    gl.uniform1f(uniform('uVignette'), vignette);
    gl.uniform1f(uniform('uBloom'), bloom);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);

    return {
      width: targetWidth,
      height: targetHeight,
      bitmap: canvas.transferToImageBitmap(),
    };
  }

  function destroy() {
    gl.deleteTexture(sourceTexture);
    gl.deleteTexture(lutTexture);
    gl.deleteBuffer(quadBuffer);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(program);
  }

  return {
    render,
    destroy,
  };
}
