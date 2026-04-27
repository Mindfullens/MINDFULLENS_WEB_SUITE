import { readEnvFlag, readEnvNegated } from '../../filmLab/runtimeEnv.js';
import { resolveWhiteBalanceGains } from '../whiteBalance.js';
import { u8RgbaToHalfFloatRgbaForTexImage } from '../webglU8RgbaToHalfFloat.js';
import { probeWebgl2Rgba16fFboUsable } from '../webgl2Rgba16fFboProbe.js';

const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
attribute vec2 a_uv;
varying vec2 v_uv;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_uv = vec2(a_uv.x, 1.0 - a_uv.y);
}
`;

const FRAGMENT_SHADER_SOURCE = `
precision mediump float;

varying vec2 v_uv;
vec3 g_rawAdjustedColor;

uniform sampler2D u_image;
uniform sampler2D u_lut;
uniform sampler2D u_lookLut;
uniform float u_hasLut;
uniform float u_lutSize;
uniform float u_hasLookLut;
uniform float u_lookLutSize;
uniform float u_strength;
uniform float u_exposure;
uniform float u_contrast;
uniform float u_pivot;
uniform int u_mode;
uniform float u_max_white;
uniform float u_saturation;
uniform float u_vibrance;
uniform float u_wbR;
uniform float u_wbG;
uniform float u_wbB;
uniform float u_fade;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_whites;
uniform float u_blacks;
uniform float u_dehaze;
uniform float u_dehazeLiftScale;
uniform float u_clarity;
uniform float u_chromAb;
uniform float u_grain;
uniform float u_grainSize;
uniform float u_bloom;
uniform float u_vignette;
uniform float u_halation;
uniform float u_halRadius;
uniform float u_halThreshold;
uniform float u_halHue;
uniform float u_anamorph;
uniform float u_streakLen;
uniform float u_texelX;
uniform float u_texelY;
uniform float u_seed;
uniform float u_showClipping;

float clampUnit(float value) {
  return clamp(value, 0.0, 1.0);
}

vec2 clampUv(vec2 uv) {
  return clamp(uv, vec2(0.0), vec2(1.0));
}

vec3 applyWhiteBalance(vec3 color) {
  color.r *= u_wbR;
  color.g *= u_wbG;
  color.b *= u_wbB;
  return color;
}

vec3 sampleLutPoint(float redIndex, float greenIndex, float blueIndex) {
  float width = u_lutSize * u_lutSize;
  float x = (redIndex + greenIndex * u_lutSize + 0.5) / width;
  float y = (blueIndex + 0.5) / u_lutSize;
  return texture2D(u_lut, vec2(x, y)).rgb;
}

vec3 applyLut(vec3 color) {
  if (u_hasLut < 0.5 || u_strength <= 0.001) {
    return color;
  }

  float maxIndex = u_lutSize - 1.0;
  vec3 coord = vec3(clampUnit(color.r), clampUnit(color.g), clampUnit(color.b)) * maxIndex;
  float r0 = floor(coord.r);
  float g0 = floor(coord.g);
  float b0 = floor(coord.b);
  float r1 = min(maxIndex, r0 + 1.0);
  float g1 = min(maxIndex, g0 + 1.0);
  float b1 = min(maxIndex, b0 + 1.0);
  float fr = fract(coord.r);
  float fg = fract(coord.g);
  float fb = fract(coord.b);

  vec3 c000 = sampleLutPoint(r0, g0, b0);
  vec3 c001 = sampleLutPoint(r0, g0, b1);
  vec3 c010 = sampleLutPoint(r0, g1, b0);
  vec3 c011 = sampleLutPoint(r0, g1, b1);
  vec3 c100 = sampleLutPoint(r1, g0, b0);
  vec3 c101 = sampleLutPoint(r1, g0, b1);
  vec3 c110 = sampleLutPoint(r1, g1, b0);
  vec3 c111 = sampleLutPoint(r1, g1, b1);

  vec3 c00 = mix(c000, c100, fr);
  vec3 c01 = mix(c001, c101, fr);
  vec3 c10 = mix(c010, c110, fr);
  vec3 c11 = mix(c011, c111, fr);
  vec3 c0 = mix(c00, c10, fg);
  vec3 c1 = mix(c01, c11, fg);
  vec3 lutColor = mix(c0, c1, fb);

  return mix(color, lutColor, clampUnit(u_strength));
}

vec3 sampleLookLutPoint(float redIndex, float greenIndex, float blueIndex) {
  float width = u_lookLutSize * u_lookLutSize;
  float x = (blueIndex + greenIndex * u_lookLutSize + 0.5) / width;
  float y = (redIndex + 0.5) / u_lookLutSize;
  return texture2D(u_lookLut, vec2(x, y)).rgb;
}

vec3 applyLookLut(vec3 color) {
  if (u_hasLookLut < 0.5) {
    return color;
  }

  float maxIndex = u_lookLutSize - 1.0;
  vec3 coord = vec3(clampUnit(color.r), clampUnit(color.g), clampUnit(color.b)) * maxIndex;
  float r0 = floor(coord.r);
  float g0 = floor(coord.g);
  float b0 = floor(coord.b);
  float r1 = min(maxIndex, r0 + 1.0);
  float g1 = min(maxIndex, g0 + 1.0);
  float b1 = min(maxIndex, b0 + 1.0);
  float fr = fract(coord.r);
  float fg = fract(coord.g);
  float fb = fract(coord.b);

  vec3 c000 = sampleLookLutPoint(r0, g0, b0);
  vec3 c001 = sampleLookLutPoint(r0, g0, b1);
  vec3 c010 = sampleLookLutPoint(r0, g1, b0);
  vec3 c011 = sampleLookLutPoint(r0, g1, b1);
  vec3 c100 = sampleLookLutPoint(r1, g0, b0);
  vec3 c101 = sampleLookLutPoint(r1, g0, b1);
  vec3 c110 = sampleLookLutPoint(r1, g1, b0);
  vec3 c111 = sampleLookLutPoint(r1, g1, b1);

  vec3 c00 = mix(c000, c100, fr);
  vec3 c01 = mix(c001, c101, fr);
  vec3 c10 = mix(c010, c110, fr);
  vec3 c11 = mix(c011, c111, fr);
  vec3 c0 = mix(c00, c10, fg);
  vec3 c1 = mix(c01, c11, fg);
  return mix(c0, c1, fb);
}

vec3 applyToneAdjustments(vec3 color) {
  float luminance = dot(color, vec3(0.299, 0.587, 0.114));

  if (abs(u_shadows) > 0.0001) {
    float shadowMask = 1.0 - smoothstep(0.1, 0.72, luminance);
    float shift = u_shadows * shadowMask * (122.0 / 255.0);
    color += vec3(shift);
  }

  if (abs(u_highlights) > 0.0001) {
    float highlightMask = smoothstep(0.24, 0.88, luminance);
    float shift = u_highlights * highlightMask * (122.0 / 255.0);
    color += vec3(shift);
  }

  if (abs(u_blacks) > 0.0001) {
    float blackMask = 1.0 - smoothstep(0.02, 0.5, luminance);
    float shift = u_blacks * blackMask * (108.0 / 255.0);
    color += vec3(shift);
  }

  if (abs(u_whites) > 0.0001) {
    float whiteMask = smoothstep(0.5, 0.98, luminance);
    float shift = u_whites * whiteMask * (108.0 / 255.0);
    color += vec3(shift);
  }

  return clamp(color, 0.0, 1.0);
}

vec3 applyDehaze(vec3 color) {
  if (abs(u_dehaze) <= 0.0001) {
    return color;
  }

  float gray = dot(color, vec3(0.299, 0.587, 0.114));
  float lift = u_dehaze * (34.0 / 255.0) * u_dehazeLiftScale;

  vec3 result = vec3(
    color.r + u_dehaze * (color.r - gray) * 0.85 + lift,
    color.g + u_dehaze * (color.g - gray) * 0.85 + lift,
    color.b + u_dehaze * (color.b - gray) * 0.85 + lift
  );

  return result;
}

float apply_contrast_curve(float val, float contrast, float pivot) {
  return pow(max(val, 0.0001) / pivot, contrast) * pivot;
}

vec3 applyContrast(vec3 color) {
  if (u_mode == 1) {
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    float newLuma = apply_contrast_curve(luma, u_contrast, u_pivot);
    return color * (newLuma / max(luma, 0.0001));
  } else {
    vec3 result;
    result.r = apply_contrast_curve(color.r, u_contrast, u_pivot);
    result.g = apply_contrast_curve(color.g, u_contrast, u_pivot);
    result.b = apply_contrast_curve(color.b, u_contrast, u_pivot);
    return result;
  }
}

vec3 applySaturationAndVibrance(vec3 color) {
  float luminance = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 gray = vec3(luminance);
  float maxChannel = max(color.r, max(color.g, color.b));
  float minChannel = min(color.r, min(color.g, color.b));
  float currentSaturation = maxChannel > 0.0 ? (maxChannel - minChannel) / maxChannel : 0.0;
  float saturationMix = u_saturation + u_vibrance * (1.0 - currentSaturation);
  
  // Highlight Saturation Roll-off
  float rollOffMask = smoothstep(0.75, 1.0, luminance / max(u_max_white, 1.0));
  saturationMix *= (1.0 - rollOffMask);
  
  return gray + (color - gray) * saturationMix;
}

vec3 applyFade(vec3 color) {
  if (u_fade <= 0.0) {
    return color;
  }

  float fadeLevel = u_fade * 0.235;
  return color + vec3(fadeLevel) - color * u_fade * 0.15;
}

vec3 runCore(vec2 uv) {
  vec3 color = texture2D(u_image, clampUv(uv)).rgb;
  color = max(color * exp2(u_exposure), 0.0);
  color = applyWhiteBalance(color);
  color = applyToneAdjustments(color);
  
  // Capture state for clipping before LUTs and Fade stages
  g_rawAdjustedColor = color;

  color = applyLut(color);
  color = applyLookLut(color);
  color = applyDehaze(color);
  color = applyContrast(color);
  color = applySaturationAndVibrance(color);
  color = applyFade(color);
  // No Reinhard
  return color;
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.11369, 0.13787));
  p3 += dot(p3, p3.yzx + 19.19);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 applyChromAb(vec3 color, vec2 uv) {
  if (u_chromAb <= 0.0001) {
    return color;
  }

  float shift = max(0.6, u_chromAb * 4.8);
  vec2 offset = vec2(u_texelX * shift, 0.0);
  vec3 left = runCore(uv - offset);
  vec3 right = runCore(uv + offset);
  return vec3(left.r, color.g, right.b);
}

vec3 applyClarity(vec3 color, vec2 uv) {
  if (abs(u_clarity) <= 0.0001) {
    return color;
  }

  vec2 texel = vec2(u_texelX, u_texelY);
  vec3 blur =
    texture2D(u_image, clampUv(uv + vec2(texel.x, 0.0))).rgb +
    texture2D(u_image, clampUv(uv - vec2(texel.x, 0.0))).rgb +
    texture2D(u_image, clampUv(uv + vec2(0.0, texel.y))).rgb +
    texture2D(u_image, clampUv(uv - vec2(0.0, texel.y))).rgb +
    texture2D(u_image, clampUv(uv)).rgb;
  blur /= 5.0;
  vec3 baseRaw = texture2D(u_image, clampUv(uv)).rgb;

  vec3 difference = baseRaw - blur;
  float luminance = dot(color, vec3(0.299, 0.587, 0.114));
  float midMask = 1.0 - pow(2.0 * luminance - 1.0, 2.0);
  float boost = u_clarity * (0.7 + max(0.0, midMask) * 0.62);
  return clamp(color + difference * boost, 0.0, 1.0);
}

vec3 applyBloom(vec3 color, vec2 uv) {
  if (u_bloom <= 0.0001) {
    return color;
  }

  vec2 texel = vec2(u_texelX, u_texelY);
  float radius = mix(1.2, 6.4, clamp(u_bloom, 0.0, 1.0));
  vec2 xOff = vec2(texel.x * radius, 0.0);
  vec2 yOff = vec2(0.0, texel.y * radius);
  vec2 dOff = vec2(texel.x * radius, texel.y * radius);

  vec3 blur =
    texture2D(u_image, clampUv(uv)).rgb * 0.2 +
    texture2D(u_image, clampUv(uv + xOff)).rgb * 0.12 +
    texture2D(u_image, clampUv(uv - xOff)).rgb * 0.12 +
    texture2D(u_image, clampUv(uv + yOff)).rgb * 0.12 +
    texture2D(u_image, clampUv(uv - yOff)).rgb * 0.12 +
    texture2D(u_image, clampUv(uv + dOff)).rgb * 0.08 +
    texture2D(u_image, clampUv(uv - dOff)).rgb * 0.08 +
    texture2D(u_image, clampUv(uv + vec2(dOff.x, -dOff.y))).rgb * 0.08 +
    texture2D(u_image, clampUv(uv - vec2(dOff.x, -dOff.y))).rgb * 0.08;

  float luminance = dot(color, vec3(0.299, 0.587, 0.114));
  float highlightMask = smoothstep(0.54, 0.96, luminance);
  vec3 glow = blur * (0.22 + u_bloom * 0.52) * highlightMask;
  vec3 screened = 1.0 - (1.0 - color) * (1.0 - glow);
  return mix(color, screened, clamp(u_bloom * 0.78, 0.0, 1.0));
}

vec3 applyHalation(vec3 color, vec2 uv) {
  if (u_halation <= 0.0001) {
    return color;
  }

  vec2 texel = vec2(u_texelX, u_texelY);
  float radius = mix(1.0, 8.4, clamp(u_halRadius, 0.0, 1.0));
  vec2 xOff = vec2(texel.x * radius, 0.0);
  vec2 yOff = vec2(0.0, texel.y * radius);
  vec2 dOff = vec2(texel.x * radius, texel.y * radius);

  vec3 s0 = texture2D(u_image, clampUv(uv + xOff)).rgb;
  vec3 s1 = texture2D(u_image, clampUv(uv - xOff)).rgb;
  vec3 s2 = texture2D(u_image, clampUv(uv + yOff)).rgb;
  vec3 s3 = texture2D(u_image, clampUv(uv - yOff)).rgb;
  vec3 s4 = texture2D(u_image, clampUv(uv + dOff)).rgb;
  vec3 s5 = texture2D(u_image, clampUv(uv - dOff)).rgb;
  vec3 s6 = texture2D(u_image, clampUv(uv + vec2(dOff.x, -dOff.y))).rgb;
  vec3 s7 = texture2D(u_image, clampUv(uv - vec2(dOff.x, -dOff.y))).rgb;

  float m0 = smoothstep(u_halThreshold, 1.0, dot(s0, vec3(0.299, 0.587, 0.114)));
  float m1 = smoothstep(u_halThreshold, 1.0, dot(s1, vec3(0.299, 0.587, 0.114)));
  float m2 = smoothstep(u_halThreshold, 1.0, dot(s2, vec3(0.299, 0.587, 0.114)));
  float m3 = smoothstep(u_halThreshold, 1.0, dot(s3, vec3(0.299, 0.587, 0.114)));
  float m4 = smoothstep(u_halThreshold, 1.0, dot(s4, vec3(0.299, 0.587, 0.114)));
  float m5 = smoothstep(u_halThreshold, 1.0, dot(s5, vec3(0.299, 0.587, 0.114)));
  float m6 = smoothstep(u_halThreshold, 1.0, dot(s6, vec3(0.299, 0.587, 0.114)));
  float m7 = smoothstep(u_halThreshold, 1.0, dot(s7, vec3(0.299, 0.587, 0.114)));

  float totalMask = m0 + m1 + m2 + m3 + m4 + m5 + m6 + m7;
  if (totalMask <= 0.0001) {
    return color;
  }

  vec3 spread =
    s0 * m0 + s1 * m1 + s2 * m2 + s3 * m3 + s4 * m4 + s5 * m5 + s6 * m6 + s7 * m7;
  spread /= totalMask;

  float redShift = u_halHue > 0.0 ? 1.0 + u_halHue * 0.85 : 1.0;
  float blueShift = u_halHue < 0.0 ? 1.0 + abs(u_halHue) * 0.85 : 1.0;
  vec3 tint = vec3(spread.r * redShift, spread.g * 0.3, spread.b * blueShift);
  vec3 glow = tint * (0.18 + u_halation * 0.46);
  vec3 screened = 1.0 - (1.0 - color) * (1.0 - glow);
  return mix(color, screened, clamp(u_halation * 0.82, 0.0, 1.0));
}

vec3 applyAnamorph(vec3 color, vec2 uv) {
  if (u_anamorph <= 0.0001) {
    return color;
  }

  vec2 texel = vec2(u_texelX, u_texelY);
  float stretch = mix(2.0, 18.0, clamp(u_streakLen, 0.0, 1.0));

  vec3 s1 = texture2D(u_image, clampUv(uv + vec2(texel.x * stretch * 0.35, 0.0))).rgb;
  vec3 s2 = texture2D(u_image, clampUv(uv - vec2(texel.x * stretch * 0.35, 0.0))).rgb;
  vec3 s3 = texture2D(u_image, clampUv(uv + vec2(texel.x * stretch * 0.7, 0.0))).rgb;
  vec3 s4 = texture2D(u_image, clampUv(uv - vec2(texel.x * stretch * 0.7, 0.0))).rgb;
  vec3 s5 = texture2D(u_image, clampUv(uv + vec2(texel.x * stretch, 0.0))).rgb;
  vec3 s6 = texture2D(u_image, clampUv(uv - vec2(texel.x * stretch, 0.0))).rgb;

  vec3 streak = s1 * 0.22 + s2 * 0.22 + s3 * 0.17 + s4 * 0.17 + s5 * 0.11 + s6 * 0.11;
  float luminance = dot(color, vec3(0.299, 0.587, 0.114));
  float highlightMask = smoothstep(0.57, 0.98, luminance);
  vec3 streakTint = vec3(streak.r * 0.5 + 0.12, streak.g * 0.43 + 0.1, streak.b * 0.7 + 0.16);
  vec3 glow = streakTint * (0.12 + u_anamorph * 0.36) * highlightMask;
  vec3 screened = 1.0 - (1.0 - color) * (1.0 - glow);
  return mix(color, screened, clamp(u_anamorph * 0.75, 0.0, 1.0));
}

vec3 applyVignette(vec3 color, vec2 uv) {
  if (u_vignette <= 0.0001) {
    return color;
  }

  vec2 centered = uv * 2.0 - 1.0;
  float radius = length(centered);
  float edgeMask = smoothstep(0.54, 1.12, radius);
  float darken = clamp(u_vignette * edgeMask * 0.92, 0.0, 0.92);
  return color * (1.0 - darken);
}

vec3 applyGrain(vec3 color, vec2 uv) {
  if (u_grain <= 0.0001) {
    return color;
  }

  vec2 px = vec2(max(u_texelX, 1.0 / 8192.0), max(u_texelY, 1.0 / 8192.0));
  float grainScale = mix(2.4, 0.7, clamp(u_grainSize, 0.0, 1.0));
  vec2 coord = (uv / px) * grainScale;
  float n1 = hash21(coord + vec2(u_seed, u_seed * 1.73));
  float n2 = hash21(coord * 0.53 + vec2(u_seed * 2.11, u_seed * 0.71));
  float n3 = hash21(coord * 1.71 + vec2(u_seed * 0.37, u_seed * 3.17));
  float noise = ((n1 + n2 + n3) / 3.0) - 0.5;
  float luminance = dot(color, vec3(0.299, 0.587, 0.114));
  float envelope = clamp(4.0 * luminance * (1.0 - luminance), 0.0, 1.0);
  float amount = u_grain * 0.115 * envelope;

  vec3 result = color;
  result.r += noise * amount * 0.8;
  result.g += noise * amount * 0.9;
  result.b += noise * amount * 1.2;
  return clamp(result, 0.0, 1.0);
}

void main() {
  vec3 color = runCore(v_uv);
  color = applyChromAb(color, v_uv);
  color = applyClarity(color, v_uv);
  color = applyBloom(color, v_uv);
  color = applyHalation(color, v_uv);
  color = applyAnamorph(color, v_uv);
  color = applyVignette(color, v_uv);
  color = applyGrain(color, v_uv);
  
  vec3 preClipColor = color;
  color = clamp(color, 0.0, 1.0);

  if (u_showClipping > 0.5) {
    // Slightly more sensitive thresholds make clipping/crush warnings visible
    // earlier (closer to Lightroom's practical warning behavior).
    if (preClipColor.r >= 0.92 || preClipColor.g >= 0.92 || preClipColor.b >= 0.92) {
      color = vec3(1.0, 0.0, 0.0);
    } 
    else if (
      dot(preClipColor, vec3(0.2126, 0.7152, 0.0722)) <= 0.055 &&
      preClipColor.r <= 0.03 &&
      preClipColor.g <= 0.03 &&
      preClipColor.b <= 0.03
    ) {
      color = vec3(0.0, 0.0, 1.0);
    }
  }

  gl_FragColor = vec4(color, 1.0);
}
`;

/** Blit LDR: próbka z tekstury half-float (RGBA16F) do bufora domyślnego (8-bit). */
const BLIT_TO_CANVAS_FRAG = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_blitSrc;

void main() {
  gl_FragColor = texture2D(u_blitSrc, v_uv);
}
`;

function createBlitProgram(gl) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, BLIT_TO_CANVAS_FRAG);
  const p = gl.createProgram();
  if (!p) {
    throw new Error('Nie udało się utworzyć programu blit WebGL.');
  }
  gl.attachShader(p, vertexShader);
  gl.attachShader(p, fragmentShader);
  gl.linkProgram(p);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error(info || 'Nie udało się połączyć programu blit WebGL.');
  }
  return p;
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error('Nie udało się utworzyć shaderu.');
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(info || 'Nie udało się skompilować shaderu.');
  }

  return shader;
}

function createProgram(gl, fragmentSource = FRAGMENT_SHADER_SOURCE) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();

  if (!program) {
    throw new Error('Nie udało się utworzyć programu WebGL.');
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(info || 'Nie udało się połączyć programu WebGL.');
  }

  return program;
}

function setTextureParameters(gl) {
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
}

function isValidRgbLutPayload(lut) {
  if (!lut || !Number.isFinite(lut.size) || lut.size < 2 || !lut.srgbData) {
    return false;
  }

  const expectedLength = lut.size * lut.size * lut.size * 3;
  return lut.srgbData.length === expectedLength;
}

function expandRgbToRgba(rgbData) {
  const pixelCount = Math.floor(rgbData.length / 3);
  const rgbaData = new Uint8Array(pixelCount * 4);

  for (let index = 0, write = 0; index < rgbData.length; index += 3, write += 4) {
    rgbaData[write] = rgbData[index];
    rgbaData[write + 1] = rgbData[index + 1];
    rgbaData[write + 2] = rgbData[index + 2];
    rgbaData[write + 3] = 255;
  }

  return rgbaData;
}

/**
 * Sonda: 2D tekstura RGBA16F + LINEAR (potrzebna do łagodnej próbki LUT w atlasie).
 */
function probeLutRgba16f2dLinearUsable(gl) {
  if (typeof gl.RGBA16F === 'undefined' || typeof gl.HALF_FLOAT === 'undefined') {
    return false;
  }
  if (typeof gl.getExtension === 'function') {
    gl.getExtension('EXT_color_buffer_float');
  }
  const tex = gl.createTexture();
  const sample = u8RgbaToHalfFloatRgbaForTexImage(
    new Uint8Array([128, 64, 32, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  );
  if (!sample) {
    gl.deleteTexture(tex);
    return false;
  }
  let ok = false;
  try {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 2, 2, 0, gl.RGBA, gl.HALF_FLOAT, sample);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    ok = gl.getError() === gl.NO_ERROR;
  } catch (_e) {
    ok = false;
  } finally {
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.deleteTexture(tex);
  }
  return ok;
}

const FAST_PREVIEW_CONTEXT_ATTRS = {
  antialias: false,
  alpha: false,
  depth: false,
  stencil: false,
  preserveDrawingBuffer: true,
  premultipliedAlpha: false,
};

function buildFastPreviewRendererForContext(canvas, gl, contextApi) {
  const useFloatFboRgba16f =
    contextApi === 'webgl2' &&
    !readEnvNegated(import.meta?.env?.VITE_FILMLAB_FAST_FBO16F) &&
    probeWebgl2Rgba16fFboUsable(gl);
  const floatPipeline = useFloatFboRgba16f ? 'fboRgba16f' : 'off';
  const useLutAtlasHalfRgba16f = useFloatFboRgba16f && probeLutRgba16f2dLinearUsable(gl);
  const lutAtlasTexFormat = useLutAtlasHalfRgba16f ? 'rgba16f' : 'rgba8';
  const gradingFragmentPrecision = useFloatFboRgba16f ? 'highp' : 'mediump';
  const gradingFragmentSource = useFloatFboRgba16f
    ? FRAGMENT_SHADER_SOURCE.replace('precision mediump float;', 'precision highp float;')
    : FRAGMENT_SHADER_SOURCE;

  const program = createProgram(gl, gradingFragmentSource);
  const positionLocation = gl.getAttribLocation(program, 'a_position');
  const uvLocation = gl.getAttribLocation(program, 'a_uv');
  const uniforms = {
    image: gl.getUniformLocation(program, 'u_image'),
    lut: gl.getUniformLocation(program, 'u_lut'),
    lookLut: gl.getUniformLocation(program, 'u_lookLut'),
    hasLut: gl.getUniformLocation(program, 'u_hasLut'),
    lutSize: gl.getUniformLocation(program, 'u_lutSize'),
    hasLookLut: gl.getUniformLocation(program, 'u_hasLookLut'),
    lookLutSize: gl.getUniformLocation(program, 'u_lookLutSize'),
    strength: gl.getUniformLocation(program, 'u_strength'),
    exposure: gl.getUniformLocation(program, 'u_exposure'),
    contrast: gl.getUniformLocation(program, 'u_contrast'),
    saturation: gl.getUniformLocation(program, 'u_saturation'),
    vibrance: gl.getUniformLocation(program, 'u_vibrance'),
    wbR: gl.getUniformLocation(program, 'u_wbR'),
    wbG: gl.getUniformLocation(program, 'u_wbG'),
    wbB: gl.getUniformLocation(program, 'u_wbB'),
    fade: gl.getUniformLocation(program, 'u_fade'),
    highlights: gl.getUniformLocation(program, 'u_highlights'),
    shadows: gl.getUniformLocation(program, 'u_shadows'),
    whites: gl.getUniformLocation(program, 'u_whites'),
    blacks: gl.getUniformLocation(program, 'u_blacks'),
    dehaze: gl.getUniformLocation(program, 'u_dehaze'),
    dehazeLiftScale: gl.getUniformLocation(program, 'u_dehazeLiftScale'),
    clarity: gl.getUniformLocation(program, 'u_clarity'),
    chromAb: gl.getUniformLocation(program, 'u_chromAb'),
    grain: gl.getUniformLocation(program, 'u_grain'),
    grainSize: gl.getUniformLocation(program, 'u_grainSize'),
    bloom: gl.getUniformLocation(program, 'u_bloom'),
    vignette: gl.getUniformLocation(program, 'u_vignette'),
    halation: gl.getUniformLocation(program, 'u_halation'),
    halRadius: gl.getUniformLocation(program, 'u_halRadius'),
    halThreshold: gl.getUniformLocation(program, 'u_halThreshold'),
    halHue: gl.getUniformLocation(program, 'u_halHue'),
    anamorph: gl.getUniformLocation(program, 'u_anamorph'),
    streakLen: gl.getUniformLocation(program, 'u_streakLen'),
    texelX: gl.getUniformLocation(program, 'u_texelX'),
    texelY: gl.getUniformLocation(program, 'u_texelY'),
    seed: gl.getUniformLocation(program, 'u_seed'),
    pivot: gl.getUniformLocation(program, 'u_pivot'),
    mode: gl.getUniformLocation(program, 'u_mode'),
    maxWhite: gl.getUniformLocation(program, 'u_max_white'),
    showClipping: gl.getUniformLocation(program, 'u_showClipping'),
  };

  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, -1, 0, 0,
      1, -1, 1, 0,
      -1, 1, 0, 1,
      -1, 1, 0, 1,
      1, -1, 1, 0,
      1, 1, 1, 1,
    ]),
    gl.STATIC_DRAW
  );

  const sourceTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
  setTextureParameters(gl);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

  const lutTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, lutTexture);
  setTextureParameters(gl);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

  const lookLutTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, lookLutTexture);
  setTextureParameters(gl);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  const lutRgbaCache = new Map();
  const lookLutRgbaCache = new Map();
  const lutRgbaHalfCache = new Map();
  const lookLutRgbaHalfCache = new Map();
  let lastLutFile = null;
  let lastLookLutKey = null;
  let lastSourceKey = null;

  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(uvLocation);
  gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 16, 8);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

  const fbo = useFloatFboRgba16f ? gl.createFramebuffer() : null;
  let fboColorTex = null;
  let fboW = 0;
  let fboH = 0;
  let blitProgram = null;
  let blitPositionLocation = 0;
  let blitUvLocation = 0;
  let blitUniformBlitSrc = null;

  if (useFloatFboRgba16f) {
    blitProgram = createBlitProgram(gl);
    blitPositionLocation = gl.getAttribLocation(blitProgram, 'a_position');
    blitUvLocation = gl.getAttribLocation(blitProgram, 'a_uv');
    blitUniformBlitSrc = gl.getUniformLocation(blitProgram, 'u_blitSrc');
  }

  function ensureFloatFboSize(w, h) {
    if (!useFloatFboRgba16f || !fbo) {
      return;
    }
    if (fboW === w && fboH === h && fboColorTex) {
      return;
    }
    fboW = w;
    fboH = h;
    if (!fboColorTex) {
      fboColorTex = gl.createTexture();
    }
    gl.bindTexture(gl.TEXTURE_2D, fboColorTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fboColorTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  return {
    contextApi,
    floatPipeline,
    lutAtlasTexFormat,
    gradingFragmentPrecision,
    render({
      source,
      sourceKey,
      lut,
      lutFile,
      width,
      height,
      adjustments,
    }) {
      if (!source || !width || !height) {
        return null;
      }

      if (canvas.width !== width) {
        canvas.width = width;
      }

      if (canvas.height !== height) {
        canvas.height = height;
      }

      gl.viewport(0, 0, width, height);
      gl.useProgram(program);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
      setTextureParameters(gl);

      if (lastSourceKey !== sourceKey) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        lastSourceKey = sourceKey;
      }

      gl.uniform1i(uniforms.image, 0);

      let hasLut = Boolean(lutFile && isValidRgbLutPayload(lut));
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, lutTexture);
      setTextureParameters(gl);

      if (hasLut && lastLutFile !== lutFile) {
        let lutRgba = lutRgbaCache.get(lutFile);

        if (!lutRgba) {
          lutRgba = expandRgbToRgba(lut.srgbData);
          lutRgbaCache.set(lutFile, lutRgba);
        }

        if (useLutAtlasHalfRgba16f) {
          let h = lutRgbaHalfCache.get(lutFile);
          if (!h) {
            h = u8RgbaToHalfFloatRgbaForTexImage(lutRgba);
            if (h) {
              lutRgbaHalfCache.set(lutFile, h);
            }
          }
          if (h) {
            gl.texImage2D(
              gl.TEXTURE_2D,
              0,
              gl.RGBA16F,
              lut.size * lut.size,
              lut.size,
              0,
              gl.RGBA,
              gl.HALF_FLOAT,
              h
            );
          } else {
            gl.texImage2D(
              gl.TEXTURE_2D,
              0,
              gl.RGBA,
              lut.size * lut.size,
              lut.size,
              0,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              lutRgba
            );
          }
        } else {
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            lut.size * lut.size,
            lut.size,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            lutRgba
          );
        }
        if (gl.getError() !== gl.NO_ERROR) {
          hasLut = false;
          lastLutFile = null;
        } else {
          lastLutFile = lutFile;
        }
      }

      gl.uniform1i(uniforms.lut, 1);
      gl.uniform1f(uniforms.hasLut, hasLut ? 1 : 0);
      gl.uniform1f(uniforms.lutSize, hasLut ? lut.size : 2);

      const lookLut = adjustments?.fastLookLut ?? null;
      const hasLookLut = Boolean(
        lookLut && lookLut.size && lookLut.srgbData && lookLut.key
      );
      let hasValidLookLut = hasLookLut && isValidRgbLutPayload(lookLut);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, lookLutTexture);
      setTextureParameters(gl);

      if (hasValidLookLut && lastLookLutKey !== lookLut.key) {
        let lookRgba = lookLutRgbaCache.get(lookLut.key);

        if (!lookRgba) {
          lookRgba = expandRgbToRgba(lookLut.srgbData);
          lookLutRgbaCache.set(lookLut.key, lookRgba);
        }

        if (useLutAtlasHalfRgba16f) {
          let h = lookLutRgbaHalfCache.get(lookLut.key);
          if (!h) {
            h = u8RgbaToHalfFloatRgbaForTexImage(lookRgba);
            if (h) {
              lookLutRgbaHalfCache.set(lookLut.key, h);
            }
          }
          if (h) {
            gl.texImage2D(
              gl.TEXTURE_2D,
              0,
              gl.RGBA16F,
              lookLut.size * lookLut.size,
              lookLut.size,
              0,
              gl.RGBA,
              gl.HALF_FLOAT,
              h
            );
          } else {
            gl.texImage2D(
              gl.TEXTURE_2D,
              0,
              gl.RGBA,
              lookLut.size * lookLut.size,
              lookLut.size,
              0,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              lookRgba
            );
          }
        } else {
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            lookLut.size * lookLut.size,
            lookLut.size,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            lookRgba
          );
        }
        if (gl.getError() !== gl.NO_ERROR) {
          hasValidLookLut = false;
          lastLookLutKey = null;
        } else {
          lastLookLutKey = lookLut.key;
        }
      } else if (!hasValidLookLut) {
        lastLookLutKey = null;
      }

      gl.uniform1i(uniforms.lookLut, 2);
      gl.uniform1f(uniforms.hasLookLut, hasValidLookLut ? 1 : 0);
      gl.uniform1f(uniforms.lookLutSize, hasValidLookLut ? lookLut.size : 2);
      gl.uniform1f(uniforms.strength, (adjustments?.strength ?? 100) / 100);
      gl.uniform1f(uniforms.showClipping, adjustments?.showClipping ? 1.0 : 0.0);
      gl.uniform1f(
        uniforms.exposure,
        adjustments?.fastExposure ?? (((adjustments?.exposure ?? 0) * 0.3) / 100)
      );
      gl.uniform1f(
        uniforms.contrast,
        adjustments?.fastContrast ?? (1 + ((adjustments?.contrast ?? 0) * 0.28) / 200)
      );
      gl.uniform1f(
        uniforms.saturation,
        adjustments?.fastSaturation ?? (1 + ((adjustments?.saturation ?? 0) * 0.26) / 100)
      );
      gl.uniform1f(
        uniforms.vibrance,
        adjustments?.fastVibrance ?? (((adjustments?.vibrance ?? 0) * 0.26) / 100)
      );
      const hasExplicitFastWbGains = Number.isFinite(adjustments?.fastWbR)
        && Number.isFinite(adjustments?.fastWbG)
        && Number.isFinite(adjustments?.fastWbB);
      const wb = hasExplicitFastWbGains
        ? {
            r: Number(adjustments.fastWbR),
            g: Number(adjustments.fastWbG),
            b: Number(adjustments.fastWbB),
          }
        : resolveWhiteBalanceGains(
            adjustments?.fastTemp ?? adjustments?.temp ?? 0,
            adjustments?.fastTint ?? adjustments?.tint ?? 0
          );
      gl.uniform1f(uniforms.wbR, wb.r);
      gl.uniform1f(uniforms.wbG, wb.g);
      gl.uniform1f(uniforms.wbB, wb.b);
      gl.uniform1f(
        uniforms.fade,
        adjustments?.fastFade ?? (((adjustments?.fade ?? 0) * 0.5) / 100)
      );
      gl.uniform1f(uniforms.highlights, adjustments?.fastHighlights ?? 0);
      gl.uniform1f(uniforms.shadows, adjustments?.fastShadows ?? 0);
      gl.uniform1f(uniforms.whites, adjustments?.fastWhites ?? 0);
      gl.uniform1f(uniforms.blacks, adjustments?.fastBlacks ?? 0);
      gl.uniform1f(uniforms.dehaze, adjustments?.fastDehaze ?? 0);
      gl.uniform1f(uniforms.dehazeLiftScale, adjustments?.fastDehazeLiftScale ?? 1);
      gl.uniform1f(uniforms.clarity, adjustments?.fastClarity ?? 0);
      gl.uniform1f(uniforms.chromAb, adjustments?.fastChromAb ?? 0);
      gl.uniform1f(uniforms.grain, adjustments?.fastGrain ?? 0);
      gl.uniform1f(uniforms.grainSize, adjustments?.fastGrainSize ?? 0.5);
      gl.uniform1f(uniforms.bloom, adjustments?.fastBloom ?? 0);
      gl.uniform1f(uniforms.vignette, adjustments?.fastVignette ?? 0);
      gl.uniform1f(uniforms.halation, adjustments?.fastHalation ?? 0);
      gl.uniform1f(uniforms.halRadius, adjustments?.fastHalRadius ?? 0);
      gl.uniform1f(uniforms.halThreshold, adjustments?.fastHalThreshold ?? (200 / 255));
      gl.uniform1f(uniforms.halHue, adjustments?.fastHalHue ?? 0);
      gl.uniform1f(uniforms.anamorph, adjustments?.fastAnamorph ?? 0);
      gl.uniform1f(uniforms.streakLen, adjustments?.fastStreakLen ?? 0);
      gl.uniform1f(uniforms.texelX, width > 0 ? 1 / width : 0.0);
      gl.uniform1f(uniforms.texelY, height > 0 ? 1 / height : 0.0);
      gl.uniform1f(uniforms.seed, adjustments?.fastSeed ?? 1);
      gl.uniform1f(uniforms.pivot, adjustments?.fastPivot ?? 0.18);
      gl.uniform1i(uniforms.mode, 1);
      gl.uniform1f(uniforms.maxWhite, 1.0);

      if (useFloatFboRgba16f) {
        ensureFloatFboSize(width, height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.viewport(0, 0, width, height);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, width, height);
        gl.useProgram(blitProgram);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.enableVertexAttribArray(blitPositionLocation);
        gl.vertexAttribPointer(blitPositionLocation, 2, gl.FLOAT, false, 16, 0);
        gl.enableVertexAttribArray(blitUvLocation);
        gl.vertexAttribPointer(blitUvLocation, 2, gl.FLOAT, false, 16, 8);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, fboColorTex);
        gl.uniform1i(blitUniformBlitSrc, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.useProgram(program);
      } else {
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      return canvas;
    },
    dispose() {
      if (quadBuffer) {
        gl.deleteBuffer(quadBuffer);
      }

      if (sourceTexture) {
        gl.deleteTexture(sourceTexture);
      }

      if (lutTexture) {
        gl.deleteTexture(lutTexture);
      }

      if (lookLutTexture) {
        gl.deleteTexture(lookLutTexture);
      }

      if (fbo) {
        gl.deleteFramebuffer(fbo);
      }
      if (fboColorTex) {
        gl.deleteTexture(fboColorTex);
      }
      if (blitProgram) {
        gl.deleteProgram(blitProgram);
      }
      gl.deleteProgram(program);
      lutRgbaCache.clear();
      lookLutRgbaCache.clear();
      lutRgbaHalfCache.clear();
      lookLutRgbaHalfCache.clear();
    },
  };
}

/**
 * Szybki podgląd WebGL. Domyślnie WebGL1. Przy `VITE_FILMLAB_FAST_WEBGL2=1` próbuje WebGL2
 * (te same shadery GLSL ES 1.0) i przy błędzie inicjalizacji wraca do WebGL1.
 *
 * @returns {null | {
 *   contextApi: 'webgl2' | 'webgl',
 *   floatPipeline: 'fboRgba16f' | 'off',
 *   lutAtlasTexFormat: 'rgba16f' | 'rgba8',
 *   gradingFragmentPrecision: 'highp' | 'mediump',
 *   render: (opts: object) => HTMLCanvasElement | null,
 *   dispose: () => void
 * }}
 */
export function createFastPreviewRenderer() {
  if (readEnvFlag(import.meta?.env?.VITE_FILMLAB_FAST_WEBGL2)) {
    const canvas2 = document.createElement('canvas');
    const gl2 = canvas2.getContext('webgl2', FAST_PREVIEW_CONTEXT_ATTRS);
    if (gl2) {
      try {
        return buildFastPreviewRendererForContext(canvas2, gl2, 'webgl2');
      } catch (error) {
        if (import.meta?.env?.DEV) {
          console.warn(
            '[FilmLab] Szybki podgląd: WebGL2 niedostępny lub błąd programu, używam WebGL1.',
            error
          );
        }
      }
    }
  }

  const canvas = document.createElement('canvas');
  const gl =
    canvas.getContext('webgl', FAST_PREVIEW_CONTEXT_ATTRS) ||
    canvas.getContext('experimental-webgl', FAST_PREVIEW_CONTEXT_ATTRS);

  if (!gl) {
    return null;
  }

  return buildFastPreviewRendererForContext(canvas, gl, 'webgl');
}
