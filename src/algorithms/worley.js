import { hash2 } from "../utils/rng.js";

// Worley noise (cellular): compute distance to nearest feature point.
// One feature point per integer cell with jitter defined by seed.
export function worley(seed, { cellSize = 64, metric = "euclidean" } = {}) {
  const invCell = 1 / cellSize;

  function featurePointX(ix, iy) {
    return (ix + hash2(seed, ix * 9283, iy * 5737)) * cellSize;
  }
  function featurePointY(ix, iy) {
    return (iy + hash2(seed ^ 0xB5297A4D, ix * 3181, iy * 104729)) * cellSize;
  }

  function dist(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    if (metric === "manhattan") return Math.abs(dx) + Math.abs(dy);
    return Math.hypot(dx, dy);
  }

  // Returns F1 and F2 (two nearest distances)
  function f1f2(x, y) {
    const cx = Math.floor(x * invCell);
    const cy = Math.floor(y * invCell);
    let d1 = Infinity, d2 = Infinity;

    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const ix = cx + i;
        const iy = cy + j;
        const px = featurePointX(ix, iy);
        const py = featurePointY(ix, iy);
        const d = dist(x, y, px, py);
        if (d < d1) {
          d2 = d1; d1 = d;
        } else if (d < d2) {
          d2 = d;
        }
      }
    }
    return [d1, d2];
  }

  const maxF1 = (metric === "manhattan" ? 1 : Math.SQRT2) * 0.5 * cellSize;

  return {
    f1(x, y) {
      const [d1] = f1f2(x, y);
      return d1 / maxF1; // ~0..1
    },
    f2MinusF1(x, y) {
      const [d1, d2] = f1f2(x, y);
      const v = (d2 - d1) / maxF1;
      return v; // ridges/plates look
    }
  };
}

