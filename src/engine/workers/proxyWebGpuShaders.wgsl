// Parity with proxyGpuRenderer.js (GLSL). Uniform 256 B (typowy wymóg min buffer).
struct UBlock {
  c0: vec4f, // x=exposureGain, y=contrast, z=pivot, w=uLutSize
  c1: vec4f, // x=uLookLutSize, y=uStrength, z=uMode(0/1), w=uMaxWhite
  c2: vec4f, // x=saturation, y=vibrance, z=uHasLut(0/1), w=uHasLookLut(0/1)
  c3: vec4f, // x=uShowClipping(0/1), y=uFade, z=uWbR, w=uWbG
  c4: vec4f, // x=uWbB, y=uMicroContrast, z=uVignette, w=uBloom
  c5: vec4f, // uTone: highlights, shadows, whites, blacks
  c6: vec4f, // output tile: origin.xy, scale.zw (norm. pełnego wyjścia)
  _pad: array<vec4f, 9>,
}

@group(0) @binding(0) var tSrc: texture_2d<f32>;
@group(0) @binding(1) var sSrc: sampler;
@group(0) @binding(2) var tLut: texture_3d<f32>;
@group(0) @binding(3) var sLut: sampler;
@group(0) @binding(4) var tLook: texture_3d<f32>;
@group(0) @binding(5) var sLook: sampler;
@group(0) @binding(6) var<uniform> U: UBlock;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) vUv: vec2f,
}

@vertex
fn vmain(@location(0) aPos: vec2f) -> VOut {
  var o: VOut;
  o.pos = vec4f(aPos, 0.0, 1.0);
  o.vUv = aPos * 0.5 + vec2f(0.5);
  return o;
}

fn apply_contrast_curve(val: f32, contrast: f32) -> f32 {
  return (val - 0.5) * contrast + 0.5;
}

fn apply_tone(color: vec3f, tone: vec4f) -> vec3f {
  var c = color;
  let luma = dot(c, vec3f(0.299, 0.587, 0.114));
  let shadowMask = 1.0 - smoothstep(0.0, 0.65, luma);
  let highMask = smoothstep(0.35, 1.0, luma);
  let blackMask = 1.0 - smoothstep(0.0, 0.45, luma);
  let whiteMask = smoothstep(0.55, 1.0, luma);
  let shadowAdjust = tone.y * shadowMask * 0.45;
  let highAdjust = tone.x * highMask * 0.45;
  let blackAdjust = tone.w * blackMask * 0.4;
  let whiteAdjust = tone.z * whiteMask * 0.4;
  c = c + vec3f(shadowAdjust + highAdjust + blackAdjust + whiteAdjust);
  return c;
}

fn sample_lut(color: vec3f) -> vec3f {
  if (U.c2.z < 0.5) {
    return color;
  }
  let n = U.c0.w;
  let coords =
    clamp(color, vec3f(0.0), vec3f(1.0)) * ((n - 1.0) / n) + vec3f(0.5 / n);
  return textureSample(tLut, sLut, coords).rgb;
}

fn sample_look_lut(color: vec3f) -> vec3f {
  if (U.c2.w < 0.5) {
    return color;
  }
  let n = U.c1.x;
  let coords =
    clamp(vec3f(color.b, color.g, color.r), vec3f(0.0), vec3f(1.0)) * ((n - 1.0) / n) + vec3f(0.5 / n);
  return textureSample(tLook, sLook, coords).rgb;
}

@fragment
fn fmain(i: VOut) -> @location(0) vec4f {
  let u = U;
  let gUv = u.c6.xy + i.vUv * u.c6.zw;
  var color = textureSample(tSrc, sSrc, gUv).rgb;
  color = color * max(0.0, u.c0.x);
  color = vec3f(color.r * u.c3.z, color.g * u.c3.w, color.b * u.c4.x);
  color = apply_tone(color, u.c5);
  let beforeLuts = color;
  color = sample_lut(color);
  color = sample_look_lut(color);
  color = mix(beforeLuts, color, u.c1.y);
  if (u.c1.z > 0.5) {
    let l = dot(color, vec3f(0.299, 0.587, 0.114));
    let nl = apply_contrast_curve(l, u.c0.y);
    color = color * (nl / max(l, 0.0001));
  } else {
    color = vec3f(
      apply_contrast_curve(color.r, u.c0.y),
      apply_contrast_curve(color.g, u.c0.y),
      apply_contrast_curve(color.b, u.c0.y)
    );
  }
  color = (color - 0.5) * (1.0 + u.c4.y * 0.15) + 0.5;
  var luma = dot(color, vec3f(0.299, 0.587, 0.114));
  let maxC = max(color.r, max(color.g, color.b));
  let minC = min(color.r, min(color.g, color.b));
  let satNow = select(0.0, (maxC - minC) / maxC, maxC > 0.0001);
  var satMix = max(0.0, u.c2.x + u.c2.y * (1.0 - satNow));
  let rollOff = smoothstep(0.75, 1.0, luma / max(u.c1.w, 1.0));
  satMix = satMix * (1.0 - rollOff);
  color = vec3f(luma) + (color - vec3f(luma)) * satMix;
  let fadeLift = vec3f(0.22, 0.215, 0.205);
  color = mix(color, fadeLift, clamp(u.c3.y * 0.22, 0.0, 1.0));
  luma = dot(color, vec3f(0.299, 0.587, 0.114));
  let bloomMask = smoothstep(0.65, 1.0, luma) * clamp(u.c4.w * 0.22, 0.0, 1.0);
  color = color + vec3f(0.18, 0.14, 0.16) * bloomMask;
  let radial = gUv * 2.0 - vec2f(1.0);
  let radius = length(radial);
  let vig = smoothstep(0.35, 1.0, radius) * clamp(u.c4.z * 0.78, 0.0, 1.0);
  color = color * (1.0 - vig);
  let preClip = color;
  color = clamp(color, vec3f(0.0), vec3f(1.0));
  if (u.c3.x > 0.5) {
    if (preClip.r >= 0.92 || preClip.g >= 0.92 || preClip.b >= 0.92) {
      color = vec3f(1.0, 0.0, 0.0);
    } else if (
      dot(preClip, vec3f(0.2126, 0.7152, 0.0722)) <= 0.055 &&
        preClip.r <= 0.03 &&
        preClip.g <= 0.03 &&
        preClip.b <= 0.03
    ) {
      color = vec3f(0.0, 0.0, 1.0);
    }
  }
  return vec4f(color, 1.0);
}
