import { hash2 } from "../utils/rng.js";

// 2D Gradient noise (Perlin-style)
export function perlin2(seed) {
  function grad(ix, iy) {
    const a = hash2(seed, ix, iy) * Math.PI * 2;
    return [Math.cos(a), Math.sin(a)];
  }

  function fade(t) {
    // 6t^5 - 15t^4 + 10t^3
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function dotGridGradient(ix, iy, x, y) {
    const [gx, gy] = grad(ix, iy);
    const dx = x - ix;
    const dy = y - iy;
    return dx * gx + dy * gy;
  }

  return function noise(x, y) {
    const x0 = Math.floor(x);
    const x1 = x0 + 1;
    const y0 = Math.floor(y);
    const y1 = y0 + 1;

    const sx = fade(x - x0);
    const sy = fade(y - y0);

    const n00 = dotGridGradient(x0, y0, x, y);
    const n10 = dotGridGradient(x1, y0, x, y);
    const n01 = dotGridGradient(x0, y1, x, y);
    const n11 = dotGridGradient(x1, y1, x, y);

    const ix0 = n00 + (n10 - n00) * sx;
    const ix1 = n01 + (n11 - n01) * sx;
    const value = ix0 + (ix1 - ix0) * sy;
    // Normalize approximately to [-1,1]
    return value; // consumer can remap
  };
}

export function remapMinus1To1To01(v) {
  return (v + 1) * 0.5;
}

export function fbm(noiseFn, { octaves = 5, lacunarity = 2, gain = 0.5 } = {}) {
  return function fbmNoise(x, y) {
    let amp = 0.5;
    let freq = 1.0;
    let sum = 0.0;
    let norm = 0.0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * noiseFn(x * freq, y * freq);
      norm += amp;
      freq *= lacunarity;
      amp *= gain;
    }
    return sum / (norm || 1);
  };
}

export function ridged(noiseFn) {
  return (x, y) => 1 - Math.abs(noiseFn(x, y));
}

