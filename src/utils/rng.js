// Deterministic PRNG utilities

export function mulberry32(seed) {
  let t = (seed >>> 0) || 1;
  return function () {
    t |= 0;
    t = (t + 0x6D2B79F5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFromSeed(seed) {
  return mulberry32(seed >>> 0);
}

export function randRange(rng, min, max) {
  return min + (max - min) * rng();
}

// Hash two integers (ix, iy) into a reproducible float [0,1)
export function hash2(seed, ix, iy) {
  let x = ix | 0;
  let y = iy | 0;
  let h = (seed ^ x * 374761393 ^ y * 668265263) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h >>> 0) / 4294967296;
}

export function hash2Signed(seed, ix, iy) {
  return hash2(seed, ix, iy) * 2 - 1;
}

