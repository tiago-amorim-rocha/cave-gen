import { rngFromSeed, randRange } from "./utils/rng.js";
import { perlin2, fbm, remapMinus1To1To01, ridged } from "./algorithms/perlin.js";
import { worley } from "./algorithms/worley.js";
import { makeMetaballs } from "./algorithms/metaballs.js";

const $ = (sel) => document.querySelector(sel);

const canvas = $("#canvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const TAU = Math.PI * 2;
let overlayPolygons = [];
let overlayCenters = [];
let currentAnimation = null;
let currentWalkState = null;
let currentPostSettings = null;

const ui = {
  algo: $("#algo"),
  width: $("#width"),
  height: $("#height"),
  seed: $("#seed"),
  randomize: $("#randomize"),
  render: $("#render"),
  download: $("#download"),
  scale: $("#scale"),
  octaves: $("#octaves"),
  lacunarity: $("#lacunarity"),
  gain: $("#gain"),
  warp: $("#warp"),
  cellSize: $("#cellSize"),
  ballCount: $("#ballCount"),
  ballRadius: $("#ballRadius"),
  thresholdEnabled: $("#thresholdEnabled"),
  threshold: $("#threshold"),
  thresholdValue: $("#thresholdValue"),
  thresholdWidth: $("#thresholdWidth"),
  thresholdWidthValue: $("#thresholdWidthValue"),
  billowPower: $("#billowPower"),
  blurRadius: $("#blurRadius"),
  blurRadiusValue: $("#blurRadiusValue"),
  caveRadius: $("#caveRadius"),
  caveIrregularity: $("#caveIrregularity"),
  caveDetailScale: $("#caveDetailScale"),
  caveSamples: $("#caveSamples"),
  edgeFeather: $("#edgeFeather"),
  caveSmooth: $("#caveSmooth"),
  layoutCount: $("#layoutCount"),
  layoutMinRadius: $("#layoutMinRadius"),
  layoutMaxRadius: $("#layoutMaxRadius"),
  layoutPadding: $("#layoutPadding"),
  walkCount: $("#walkCount"),
  walkSteps: $("#walkSteps"),
  walkRadius: $("#walkRadius"),
  walkBranch: $("#walkBranch"),
  walkSpeed: $("#walkSpeed"),
  walkBias: $("#walkBias"),
  walkCohesion: $("#walkCohesion"),
  walkEdgeSoft: $("#walkEdgeSoft"),
  walkEdgeHard: $("#walkEdgeHard"),
  walkReset: $("#walkReset"),
};

const scopedControls = Array.from(document.querySelectorAll(".controls [data-scope]"));
const algoRows = Array.from(document.querySelectorAll(".controls .algo-row"));

const softUnion = (a, b) => 1 - (1 - a) * (1 - b);

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function buildField(options) {
  const {
    algo,
    seed,
    width,
    height,
    scale,
    octaves,
    lacunarity,
    gain,
    warpStrength,
    cellSize,
    ballCount,
    ballRadius,
    billowPower,
    caveRadius,
    caveIrregularity,
    caveDetailScale,
    caveSamples,
    edgeFeather,
    caveSmooth,
    layoutCount,
    layoutMinRadius,
    layoutMaxRadius,
    layoutPadding,
  } = options;


  const p = perlin2(seed);
  const fbmBase = fbm(p, { octaves, lacunarity, gain });
  const fbm01 = (x, y) => remapMinus1To1To01(fbmBase(x, y));
  const billow = (x, y) => Math.pow(Math.abs(fbmBase(x, y)), billowPower);

  const warpVec = (x, y, s) => {
    // Use two channels of fbm for a displacement vector
    const k = s / scale;
    const wx = fbmBase(x * 0.5, y * 0.5) * k;
    const wy = fbmBase(x * -0.5 + 100, y * 0.5 - 100) * k;
    return [x + wx, y + wy];
  };

  if (algo === "fbm") {
    return (x, y) => {
      const u = x / scale, v = y / scale;
      return fbm01(u, v);
    };
  }

  if (algo === "fbmBillow") {
    return (x, y) => {
      const u = x / scale, v = y / scale;
      return billow(u, v);
    };
  }

  if (algo === "fbmWarp") {
    return (x, y) => {
      let [ux, vy] = warpVec(x / scale, y / scale, warpStrength);
      return fbm01(ux, vy);
    };
  }

  if (algo === "singleCave") {
    const offsetRng = rngFromSeed(seed ^ 0x51a6e);
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const cave = makeRadialCaveField({
      centerX,
      centerY,
      baseRadius: caveRadius,
      irregularity: caveIrregularity,
      detailScale: caveDetailScale,
      samples: caveSamples,
      edgeFeather,
      smoothIterations: caveSmooth,
      fbmBase,
      billowPower,
      offsetX: offsetRng() * 1000,
      offsetY: offsetRng() * 1000,
    });
    overlayPolygons.push(cave.polygon);
    overlayCenters.push({ x: centerX, y: centerY, radius: caveRadius });
    return cave.sample;
  }

  if (algo === "caveLayout") {
    const layout = generateCaveLayout({
      width,
      height,
      count: layoutCount,
      minRadius: layoutMinRadius,
      maxRadius: layoutMaxRadius,
      padding: layoutPadding,
      irregularity: caveIrregularity,
      detailScale: caveDetailScale,
      samples: caveSamples,
      edgeFeather,
      smoothIterations: caveSmooth,
      fbmBase,
      billowPower,
      seed,
    });
    overlayPolygons.push(...layout.polygons);
    overlayCenters.push(...layout.centers);
    return layout.sample;
  }

  if (algo === "worleyF1" || algo === "worleyF2F1") {
    const w = worley(seed ^ 0xA93EE, { cellSize });
    return (x, y) => {
      let u = x, v = y;
      if (algo === "worleyF1") {
        const d = w.f1(u, v);
        return Math.max(0, Math.min(1, d));
      } else {
        const r = w.f2MinusF1(u, v);
        return Math.max(0, Math.min(1, r));
      }
    };
  }

  if (algo === "metaballs" || algo === "metaballsWarp") {
    const field = makeMetaballs(seed ^ 0x12345, width, height, { count: ballCount, baseRadius: ballRadius, jitter: 0.3 });
    if (algo === "metaballs") return field;
    return (x, y) => {
      const [ux, vy] = warpVec(x / scale, y / scale, warpStrength);
      return field(ux * scale, vy * scale);
    };
  }

  if (algo === "perlinCells") {
    const w = worley(seed ^ 0x77f00, { cellSize });
    return (x, y) => {
      const u = x / scale, v = y / scale;
      const perlinVal = billow(u, v);
      const cellFill = 1 - Math.min(1, w.f1(x, y));
      return softUnion(perlinVal, cellFill);
    };
  }

  if (algo === "perlinMetaballs") {
    const field = makeMetaballs(seed ^ 0x54321, width, height, { count: ballCount, baseRadius: ballRadius, jitter: 0.3 });
    return (x, y) => {
      const u = x / scale, v = y / scale;
      const perlinVal = billow(u, v);
      return softUnion(perlinVal, field(x, y));
    };
  }

  // default fallback
  return (x, y) => {
    const u = x / scale, v = y / scale;
    return ridged(fbmBase)(u, v);
  };
}

function cancelAnimation() {
  if (currentAnimation && currentAnimation.stop) {
    currentAnimation.stop();
  }
  currentAnimation = null;
  currentWalkState = null;
  currentPostSettings = null;
}

function render() {
  const algo = ui.algo.value;
  const isRandomWalk = algo === "randomWalk";
  if (!isRandomWalk) {
    cancelAnimation();
  }
  const width = clamp(parseInt(ui.width.value || "512", 10), 1, 4096);
  const height = clamp(parseInt(ui.height.value || "512", 10), 1, 4096);
  const seed = parseInt(ui.seed.value || "1", 10) | 0;
  const scale = clamp(parseFloat(ui.scale.value || "256"), 1, 4096);
  const octaves = clamp(parseInt(ui.octaves.value || "5", 10), 1, 12);
  const lacunarity = clamp(parseFloat(ui.lacunarity.value || "2"), 1, 6);
  const gain = clamp(parseFloat(ui.gain.value || "0.5"), 0, 1);
  const warpStrength = clamp(parseFloat(ui.warp.value || "0"), 0, 2048);
  const cellSize = clamp(parseInt(ui.cellSize.value || "64", 10), 4, 2048);
  const ballCount = clamp(parseInt(ui.ballCount.value || "120", 10), 1, 5000);
  const ballRadius = clamp(parseInt(ui.ballRadius.value || "24", 10), 1, 1024);
  const billowPower = clamp(parseFloat(ui.billowPower.value || "0.85"), 0.2, 2);
  const rawCaveRadius = clamp(parseFloat(ui.caveRadius.value || "180"), 16, 4096);
  const caveIrregularity = clamp(parseFloat(ui.caveIrregularity.value || "0.35"), 0, 1.5);
  const caveDetailScale = clamp(parseFloat(ui.caveDetailScale.value || "2"), 0.2, 10);
  const caveSamples = clampInt(parseInt(ui.caveSamples.value || "256", 10), 32, 2048);
  const edgeFeather = clamp(parseFloat(ui.edgeFeather.value || "8"), 0.5, 200);
  const caveSmooth = clampInt(parseInt(ui.caveSmooth.value || "2", 10), 0, 5);
  const thresholdOn = ui.thresholdEnabled.checked;
  const thresholdCutoff = clamp(parseFloat(ui.threshold.value || "0.5"), 0, 1);
  const thresholdWidth = clamp(parseFloat(ui.thresholdWidth.value || "0.05"), 0, 1);
  const blurRadius = clampInt(parseFloat(ui.blurRadius.value || "0"), 0, 30);
  let layoutCount = clampInt(parseInt(ui.layoutCount.value || "12", 10), 1, 200);
  let layoutMinRadius = clamp(parseFloat(ui.layoutMinRadius.value || "90"), 8, 4096);
  let layoutMaxRadius = clamp(parseFloat(ui.layoutMaxRadius.value || "180"), layoutMinRadius, 4096);
  let layoutPadding = clamp(parseFloat(ui.layoutPadding.value || "12"), 0, 500);
  const maxPadding = Math.max(0, Math.min(width, height) * 0.5 - 8);
  layoutPadding = Math.min(layoutPadding, maxPadding);
  const maxAllowedRadius = Math.max(8, Math.min(width, height) * 0.5 - layoutPadding - 4);
  layoutMinRadius = Math.min(layoutMinRadius, maxAllowedRadius);
  layoutMaxRadius = Math.min(Math.max(layoutMaxRadius, layoutMinRadius), maxAllowedRadius);
  const caveRadius = Math.min(rawCaveRadius, maxAllowedRadius);
  layoutCount = Math.max(1, Math.min(layoutCount, 400));
  const walkCount = clampInt(parseInt(ui.walkCount.value || "20", 10), 1, 500);
  const walkSteps = clampInt(parseInt(ui.walkSteps.value || "800", 10), 10, 10000);
  const walkRadius = clamp(parseFloat(ui.walkRadius.value || "2"), 1, 64);
  const walkBranch = clamp(parseFloat(ui.walkBranch.value || "0.05"), 0, 1);
  const walkBias = clamp(parseFloat(ui.walkBias.value || "0.5"), 0, 1);
  const walkCohesion = clamp(parseFloat(ui.walkCohesion.value || "0"), 0, 1);
  const walkEdgeSoftInput = clamp(parseFloat(ui.walkEdgeSoft.value || "48"), 0, Math.max(width, height));
  const walkEdgeHardInput = clamp(parseFloat(ui.walkEdgeHard.value || "24"), 0, Math.max(width, height));
  let walkEdgeSoft = walkEdgeSoftInput;
  let walkEdgeHard = walkEdgeHardInput;
  if (walkEdgeSoft < walkEdgeHard) {
    [walkEdgeSoft, walkEdgeHard] = [walkEdgeHard, walkEdgeSoft];
  }
  const walkSpeed = clampInt(parseInt(ui.walkSpeed.value || "60", 10), 1, 60);

  const postSettings = { thresholdOn, thresholdCutoff, thresholdWidth, blurRadius };

  canvas.width = width;
  canvas.height = height;
  clearOverlays();

  if (isRandomWalk) {
    const needsRestart = !currentWalkState || currentWalkState.width !== width || currentWalkState.height !== height;
    const config = {
      width,
      height,
      seed,
      walkCount,
      walkSteps,
      walkRadius,
      walkBranch,
      walkBias,
      walkCohesion,
      walkEdgeSoft,
      walkEdgeHard,
      walkSpeed,
      postSettings,
    };
    if (needsRestart) {
      startRandomWalkAnimation(config);
    } else {
      currentPostSettings = postSettings;
      renderRandomWalkFrame();
    }
    return;
  }

  const field = buildField({
    algo,
    seed,
    width,
    height,
    scale,
    octaves,
    lacunarity,
    gain,
    warpStrength,
    cellSize,
    ballCount,
    ballRadius,
    billowPower,
    caveRadius,
    caveIrregularity,
    caveDetailScale,
    caveSamples,
    edgeFeather,
    caveSmooth,
    layoutCount,
    layoutMinRadius,
    layoutMaxRadius,
    layoutPadding,
  });

  const values = new Float32Array(width * height);

  let idx = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = field(x, y);
      values[idx++] = Math.max(0, Math.min(1, v));
    }
  }

  const processed = applyPostProcessing(values, width, height, postSettings);
  drawScalarField(processed, width, height);
  drawOverlays();
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function clampInt(v, a, b) { return Math.max(a, Math.min(b, Math.round(v))); }

function smallCanvasSelected() {
  return parseInt(ui.width.value, 10) <= 1024 && parseInt(ui.height.value, 10) <= 1024;
}

function maybeAutoRender() {
  if (smallCanvasSelected()) {
    render();
  }
}

function updateControlVisibility(algo) {
  scopedControls.forEach((el) => {
    const scopes = (el.dataset.scope || "").split(/\s+/);
    const visible = scopes.includes(algo);
    el.dataset.hidden = visible ? "false" : "true";
  });
  algoRows.forEach((row) => {
    const hasVisible = Array.from(row.querySelectorAll("[data-scope]")).some((el) => el.dataset.hidden !== "true");
    row.dataset.hidden = hasVisible ? "false" : "true";
  });
}

function updateSliderValue(input, output, decimals = 2) {
  output.textContent = Number(input.value).toFixed(decimals);
}

function boxBlur(field, width, height, radius) {
  if (radius <= 0) return field;
  const temp = new Float32Array(field.length);
  const out = new Float32Array(field.length);
  blurPass(field, temp, width, height, radius, true);
  blurPass(temp, out, width, height, radius, false);
  return out;
}

function blurPass(src, dst, width, height, radius, horizontal) {
  const window = radius * 2 + 1;
  if (horizontal) {
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      const sample = (x) => {
        const clamped = x < 0 ? 0 : x >= width ? width - 1 : x;
        return src[rowOffset + clamped];
      };
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += sample(k);
      for (let x = 0; x < width; x++) {
        dst[rowOffset + x] = sum / window;
        const addIdx = x + radius + 1;
        const removeIdx = x - radius;
        sum += sample(addIdx) - sample(removeIdx);
      }
    }
  } else {
    for (let x = 0; x < width; x++) {
      const sample = (y) => {
        const clamped = y < 0 ? 0 : y >= height ? height - 1 : y;
        return src[clamped * width + x];
      };
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += sample(k);
      for (let y = 0; y < height; y++) {
        dst[y * width + x] = sum / window;
        const addIdx = y + radius + 1;
        const removeIdx = y - radius;
        sum += sample(addIdx) - sample(removeIdx);
      }
    }
  }
}

function morphologicalClosing(field, width, height, radius) {
  if (radius <= 0) return field;
  const dilated = morphologicalFilter(field, width, height, radius, true);
  return morphologicalFilter(dilated, width, height, radius, false);
}

function morphologicalFilter(field, width, height, radius, isMax) {
  if (radius <= 0) return field;
  const temp = new Float32Array(field.length);
  const out = new Float32Array(field.length);
  morphPass(field, temp, width, height, radius, isMax, true);
  morphPass(temp, out, width, height, radius, isMax, false);
  return out;
}

function morphPass(src, dst, width, height, radius, isMax, horizontal) {
  if (radius <= 0) {
    dst.set(src);
    return;
  }
  const inner = horizontal ? width : height;
  const outer = horizontal ? height : width;
  const paddedLen = inner + radius * 2;
  const line = new Float32Array(paddedLen);
  const result = new Float32Array(inner);
  for (let o = 0; o < outer; o++) {
    const getVal = (i) => {
      if (horizontal) return src[o * width + i];
      return src[i * width + o];
    };
    const first = getVal(0);
    const last = getVal(inner - 1);
    for (let i = 0; i < radius; i++) line[i] = first;
    for (let i = 0; i < inner; i++) line[i + radius] = getVal(i);
    for (let i = 0; i < radius; i++) line[inner + radius + i] = last;
    slidingWindowOp(line, radius, isMax, result);
    for (let i = 0; i < inner; i++) {
      if (horizontal) dst[o * width + i] = result[i];
      else dst[i * width + o] = result[i];
    }
  }
}

function slidingWindowOp(values, radius, isMax, out) {
  const window = radius * 2 + 1;
  const deque = [];
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    while (deque.length) {
      const lastIdx = deque[deque.length - 1];
      if (isMax ? values[lastIdx] <= val : values[lastIdx] >= val) deque.pop();
      else break;
    }
    deque.push(i);
    const start = i - window + 1;
    if (deque[0] < start) deque.shift();
    if (start >= 0) {
      out[start] = values[deque[0]];
    }
  }
}

function makeRadialCaveField({
  centerX,
  centerY,
  baseRadius,
  irregularity,
  detailScale,
  samples,
  edgeFeather,
  smoothIterations,
  fbmBase,
  billowPower,
  offsetX = 0,
  offsetY = 0,
}) {
  const freq = 1 / Math.max(0.001, detailScale);
  let radii = new Float32Array(samples);
  let maxRadius = 0;
  for (let i = 0; i < samples; i++) {
    const theta = (i / samples) * TAU;
    const nx = Math.cos(theta) * freq + offsetX;
    const ny = Math.sin(theta) * freq + offsetY;
    const noise = Math.pow(Math.abs(fbmBase(nx, ny)), billowPower);
    const radius = baseRadius * (1 + irregularity * noise);
    radii[i] = radius;
    if (radius > maxRadius) maxRadius = radius;
  }

  for (let iter = 0; iter < smoothIterations; iter++) {
    const next = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const prev = radii[(i - 1 + samples) % samples];
      const curr = radii[i];
      const nxt = radii[(i + 1) % samples];
      next[i] = (prev + curr + nxt) / 3;
    }
    radii = next;
  }

  maxRadius = 0;
  for (let i = 0; i < samples; i++) {
    if (radii[i] > maxRadius) maxRadius = radii[i];
  }

  const polygon = Array.from({ length: samples }, (_, i) => {
    const theta = (i / samples) * TAU;
    const r = radii[i];
    return {
      x: centerX + Math.cos(theta) * r,
      y: centerY + Math.sin(theta) * r,
    };
  });

  const radiusAt = (theta) => {
    let t = theta / TAU;
    if (t < 0) t += 1;
    const idx = t * samples;
    const i0 = Math.floor(idx) % samples;
    const frac = idx - Math.floor(idx);
    const i1 = (i0 + 1) % samples;
    return radii[i0] * (1 - frac) + radii[i1] * frac;
  };

  const feather = Math.max(0.5, edgeFeather);
  const sample = (x, y) => {
    const dx = x - centerX;
    const dy = y - centerY;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius + feather * 2) return 0;
    let theta = Math.atan2(dy, dx);
    if (theta < 0) theta += TAU;
    const r = radiusAt(theta);
    const diff = r - dist;
    return smoothstep(-feather, feather, diff);
  };

  return { sample, polygon, maxRadius };
}

function generateCaveLayout({
  width,
  height,
  count,
  minRadius,
  maxRadius,
  padding,
  irregularity,
  detailScale,
  samples,
  edgeFeather,
  smoothIterations,
  fbmBase,
  billowPower,
  seed,
}) {
  const rng = rngFromSeed(seed ^ 0xcafeb);
  const caves = [];
  const maxAttempts = count * 80;
  let attempts = 0;
  while (caves.length < count && attempts < maxAttempts) {
    attempts++;
    const radius = randRange(rng, minRadius, maxRadius);
    const x = randRange(rng, radius + padding, width - radius - padding);
    const y = randRange(rng, radius + padding, height - radius - padding);
    if (x - radius < padding || x + radius > width - padding || y - radius < padding || y + radius > height - padding) continue;
    let overlaps = false;
    for (let i = 0; i < caves.length; i++) {
      const other = caves[i];
      const minDist = radius + other.radius + padding;
      const dx = x - other.x;
      const dy = y - other.y;
      if (dx * dx + dy * dy < minDist * minDist) {
        overlaps = true;
        break;
      }
    }
    if (!overlaps) {
      caves.push({ x, y, radius, offsetX: rng() * 5000, offsetY: rng() * 5000 });
    }
  }

  const caveFields = caves.map((cave) =>
    makeRadialCaveField({
      centerX: cave.x,
      centerY: cave.y,
      baseRadius: cave.radius,
      irregularity,
      detailScale,
      samples,
      edgeFeather,
      smoothIterations,
      fbmBase,
      billowPower,
      offsetX: cave.offsetX,
      offsetY: cave.offsetY,
    })
  );

  const sample = (x, y) => {
    let value = 0;
    for (let i = 0; i < caveFields.length; i++) {
      const v = caveFields[i].sample(x, y);
      if (v > value) value = v;
      if (value >= 1) break;
    }
    return value;
  };

  return {
    sample,
    polygons: caveFields.map((c) => c.polygon),
    centers: caves.map((c) => ({ x: c.x, y: c.y, radius: c.radius })),
  };
}

function startRandomWalkAnimation({ width, height, seed, walkCount, walkSteps, walkRadius, walkBranch, walkBias, walkCohesion, walkEdgeSoft, walkEdgeHard, walkSpeed, postSettings }) {
  cancelAnimation();
  ctx.clearRect(0, 0, width, height);
  const values = new Float32Array(width * height).fill(1);
  const rng = rngFromSeed(seed ^ 0x915f);
  const spawnMarginX = Math.min(Math.max(0, Math.floor(walkEdgeSoft)), Math.max(0, Math.floor(width / 2) - 1));
  const spawnMarginY = Math.min(Math.max(0, Math.floor(walkEdgeSoft)), Math.max(0, Math.floor(height / 2) - 1));
  const walkers = Array.from({ length: walkCount }, () => createRandomWalker(rng, width, height, walkSteps, spawnMarginX, spawnMarginY));
  const state = {
    width,
    height,
    values,
    walkers,
    walkRadius,
    walkBranch,
    walkBias,
    walkCohesion,
    walkEdgeSoft,
    walkEdgeHard,
    rng,
    timer: null,
    finished: false,
  };
  currentWalkState = state;
  currentPostSettings = postSettings;

  const interval = Math.max(16, Math.round(1000 / Math.max(1, walkSpeed)));

  const tick = () => {
    if (!currentWalkState || currentWalkState !== state || state.finished) return;
    let active = 0;
    const newWalkers = [];
    for (const walker of state.walkers) {
      if (walker.stepsRemaining <= 0) continue;
      active++;
      stepRandomWalker(state, walker);
      if (state.walkBranch > 0 && state.rng() < state.walkBranch && walker.stepsRemaining > 1) {
        newWalkers.push({ x: walker.x, y: walker.y, stepsRemaining: walker.stepsRemaining >> 1 || 1 });
      }
    }
    if (newWalkers.length) state.walkers.push(...newWalkers);
    renderRandomWalkFrame();
    if (active === 0) {
      finish();
    }
  };

  const timer = setInterval(tick, interval);
  state.timer = timer;
  currentAnimation = {
    stop() {
      clearInterval(timer);
    }
  };
  tick();

  function finish() {
    if (state.finished) return;
    state.finished = true;
    clearInterval(timer);
    currentAnimation = null;
    renderRandomWalkFrame();
  }
}

function createRandomWalker(rng, width, height, maxSteps, marginX = 0, marginY = 0) {
  return {
    x: sampleCoord(width, marginX, rng),
    y: sampleCoord(height, marginY, rng),
    stepsRemaining: maxSteps,
  };
}

function sampleCoord(size, margin, rng) {
  if (size <= 1) return 0;
  const safeMargin = Math.min(Math.max(0, Math.floor(margin)), Math.max(0, Math.floor(size / 2)));
  const span = Math.max(1, size - safeMargin * 2);
  const coord = Math.floor(rng() * span) + safeMargin;
  return clampInt(coord, 0, size - 1);
}

function stepRandomWalker(state, walker) {
  const { rng, width, height, walkRadius, values, walkBias, walkCohesion, walkEdgeSoft, walkEdgeHard, walkers } = state;
  const horizontalWeight = Math.max(0, 1 - walkBias);
  const verticalWeight = Math.max(0, walkBias);
  const baseDiagonal = 0.35;
  const diagonalWeight = baseDiagonal * (1 - Math.abs(walkBias - 0.5) * 2);
  const moves = [
    { dx: -1, dy: 0, w: horizontalWeight },
    { dx: 1, dy: 0, w: horizontalWeight },
    { dx: 0, dy: -1, w: verticalWeight },
    { dx: 0, dy: 1, w: verticalWeight },
    { dx: -1, dy: -1, w: diagonalWeight },
    { dx: 1, dy: -1, w: diagonalWeight },
    { dx: -1, dy: 1, w: diagonalWeight },
    { dx: 1, dy: 1, w: diagonalWeight },
  ];
  let totalWeight = horizontalWeight * 2 + verticalWeight * 2 + diagonalWeight * 4;
  if (totalWeight <= 0) totalWeight = 1; // safeguard
  let pick = rng() * totalWeight;
  let dx = 0;
  let dy = 0;
  for (const move of moves) {
    pick -= move.w;
    if (pick <= 0) {
      dx = move.dx;
      dy = move.dy;
      break;
    }
  }
  if (walkCohesion > 0 && walkers.length > 1 && rng() < walkCohesion) {
    let target = null;
    for (let attempts = 0; attempts < 3 && !target; attempts++) {
      const candidate = walkers[Math.floor(rng() * walkers.length)];
      if (candidate && candidate !== walker) target = candidate;
    }
    if (target) {
      const steerX = Math.sign(target.x - walker.x);
      const steerY = Math.sign(target.y - walker.y);
      dx = clampStep(dx + steerX);
      dy = clampStep(dy + steerY);
      if (dx === 0 && dy === 0) {
        dx = steerX || 0;
        dy = steerY || 0;
      }
    }
  }
  dx = applyBoundaryForce(walker.x, width - 1, dx, rng, walkEdgeSoft, walkEdgeHard);
  dy = applyBoundaryForce(walker.y, height - 1, dy, rng, walkEdgeSoft, walkEdgeHard);
  walker.x = clampInt(walker.x + dx, 0, width - 1);
  walker.y = clampInt(walker.y + dy, 0, height - 1);
  walker.stepsRemaining--;
  carveValuesDisc(values, width, height, walker.x, walker.y, walkRadius);
}
function clampStep(v) {
  if (v > 0) return 1;
  if (v < 0) return -1;
  return 0;
}

function applyBoundaryForce(pos, maxIndex, delta, rng, soft, hard) {
  if (soft <= 0) return delta;
  const effectiveSoft = Math.max(soft, hard);
  const leftDist = pos;
  const rightDist = maxIndex - pos;
  if (leftDist >= effectiveSoft && rightDist >= effectiveSoft) return delta;
  let awayDir = 0;
  let distance = 0;
  if (leftDist <= rightDist) {
    awayDir = 1;
    distance = leftDist;
  } else {
    awayDir = -1;
    distance = rightDist;
  }
  const influence = boundaryInfluence(distance, effectiveSoft, hard);
  if (influence <= 0) return delta;
  if (influence >= 1 || rng() < influence) {
    return awayDir;
  }
  return delta;
}

function boundaryInfluence(dist, soft, hard) {
  if (dist <= hard) return 1;
  if (soft <= hard) return dist <= hard ? 1 : 0;
  if (dist >= soft) return 0;
  const span = Math.max(1e-6, soft - hard);
  return 1 - (dist - hard) / span;
}

function carveValuesDisc(values, width, height, cx, cy, radius) {
  const r = Math.max(1, Math.round(radius));
  const r2 = r * r;
  const minY = Math.max(0, cy - r);
  const maxY = Math.min(height - 1, cy + r);
  const minX = Math.max(0, cx - r);
  const maxX = Math.min(width - 1, cx + r);
  for (let y = minY; y <= maxY; y++) {
    const dy = y - cy;
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      if (dx * dx + dy * dy <= r2) {
        values[y * width + x] = 0;
      }
    }
  }
}

function drawScalarField(values, width, height) {
  const img = ctx.createImageData(width, height);
  const data = img.data;
  for (let i = 0, p = 0; i < values.length; i++, p += 4) {
    const g = clamp(Math.round(values[i] * 255), 0, 255);
    data[p] = data[p + 1] = data[p + 2] = g;
    data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function renderRandomWalkFrame() {
  if (!currentWalkState || !currentPostSettings) return;
  const processed = applyPostProcessing(currentWalkState.values, currentWalkState.width, currentWalkState.height, currentPostSettings);
  drawScalarField(processed, currentWalkState.width, currentWalkState.height);
}

function applyPostProcessing(values, width, height, { thresholdOn, thresholdCutoff, thresholdWidth, blurRadius }) {
  let processed = values;
  if (blurRadius > 0) {
    processed = boxBlur(processed, width, height, blurRadius);
  }
  if (thresholdOn) {
    const out = new Float32Array(processed.length);
    if (thresholdWidth > 0) {
      const low = clamp(thresholdCutoff - thresholdWidth, 0, 1);
      const high = clamp(thresholdCutoff + thresholdWidth, 0, 1);
      for (let i = 0; i < processed.length; i++) {
        out[i] = smoothstep(low, high, processed[i]);
      }
    } else {
      for (let i = 0; i < processed.length; i++) {
        out[i] = processed[i] >= thresholdCutoff ? 1 : 0;
      }
    }
    processed = out;
  }
  return processed;
}

function clearOverlays() {
  overlayPolygons = [];
  overlayCenters = [];
}

function drawOverlays() {
  if (!overlayPolygons.length && !overlayCenters.length) return;
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  overlayPolygons.forEach((poly) => {
    if (!poly.length) return;
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i++) {
      ctx.lineTo(poly[i].x, poly[i].y);
    }
    ctx.closePath();
    ctx.stroke();
  });
  overlayCenters.forEach((center) => {
    ctx.beginPath();
    ctx.arc(center.x, center.y, 3, 0, TAU);
    ctx.fill();
  });
  ctx.restore();
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

ui.render.addEventListener("click", render);
ui.algo.addEventListener("change", () => {
  updateControlVisibility(ui.algo.value);
  render();
});
[
  ui.width, ui.height, ui.scale, ui.octaves, ui.lacunarity, ui.gain,
  ui.warp, ui.cellSize, ui.ballCount, ui.ballRadius, ui.seed,
  ui.billowPower, ui.thresholdEnabled,
  ui.caveRadius, ui.caveIrregularity, ui.caveDetailScale, ui.caveSamples,
  ui.edgeFeather, ui.caveSmooth, ui.layoutCount, ui.layoutMinRadius,
  ui.layoutMaxRadius, ui.layoutPadding,
  ui.walkCount, ui.walkSteps, ui.walkRadius, ui.walkBranch, ui.walkSpeed,
  ui.walkBias, ui.walkCohesion, ui.walkEdgeSoft, ui.walkEdgeHard
].forEach(el => el.addEventListener("change", () => {
  maybeAutoRender();
}));
const sliderBindings = [
  { input: ui.threshold, output: ui.thresholdValue, decimals: 2 },
  { input: ui.thresholdWidth, output: ui.thresholdWidthValue, decimals: 2 },
  { input: ui.blurRadius, output: ui.blurRadiusValue, decimals: 0 },
];
sliderBindings.forEach(({ input, output, decimals }) => {
  const update = () => updateSliderValue(input, output, decimals);
  input.addEventListener("input", () => {
    update();
    maybeAutoRender();
  });
  input.addEventListener("change", () => {
    update();
    maybeAutoRender();
  });
  update();
});
ui.randomize.addEventListener("click", () => {
  const rng = rngFromSeed((Math.random() * 1e9) | 0);
  ui.seed.value = String(((rng() * 2 ** 31) | 0) >>> 0);
  render();
});
ui.download.addEventListener("click", () => {
  const a = document.createElement("a");
  a.download = `field_${Date.now()}.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
});

if (ui.walkReset) {
  ui.walkReset.addEventListener("click", () => {
    if (ui.algo.value === "randomWalk") {
      cancelAnimation();
      render();
    }
  });
}

document.addEventListener("keydown", (e) => {
  if (e.code === "Space") { e.preventDefault(); render(); }
});

// Render on load
updateControlVisibility(ui.algo.value);
render();
