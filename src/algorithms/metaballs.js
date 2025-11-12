import { rngFromSeed, randRange } from "../utils/rng.js";

// Metaballs: sum of radial basis contributions from blob centers
export function makeMetaballs(seed, width, height, {
  count = 120,
  baseRadius = 24,
  jitter = 0.5,
} = {}) {
  const rng = rngFromSeed(seed);
  const balls = [];
  for (let i = 0; i < count; i++) {
    const x = randRange(rng, 0, width);
    const y = randRange(rng, 0, height);
    const r = Math.max(2, baseRadius * (0.5 + rng() * 1.5));
    balls.push({ x, y, r });
  }

  // Inverse quadratic falloff: 1 / (1 + (d/r)^2)
  function contrib(dx, dy, r) {
    const q = (dx * dx + dy * dy) / (r * r);
    return 1 / (1 + q);
  }

  // Normalize by an empirical factor to keep ~0..1 range
  const norm = 1 / Math.max(1, Math.log2(count + 1));

  return function field(x, y) {
    let sum = 0;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      sum += contrib(x - b.x, y - b.y, b.r);
    }
    sum *= norm;
    if (jitter > 0) {
      // subtle grain to avoid banding
      sum += (rng() - 0.5) * 0.02 * jitter;
    }
    return Math.min(1, Math.max(0, sum));
  };
}

