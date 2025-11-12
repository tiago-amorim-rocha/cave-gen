# Cave Field Lab (Browser)

A zero-dependency browser project to experiment with 2D grayscale scalar fields suitable for marching squares (cave generation). No build tools needed.

Open `index.html` via a local server and switch between several algorithms: FBM Perlin, domain-warped FBM, billowy FBM, Worley variants, Metaballs, Perlin+Cells, Perlin+Metaballs, Single Cave, Cave Layout, and Biased Walk. Tune parameters, add post-processing, and export PNG.

## Run

Because the page uses ES modules, use a local server (don’t open via `file://`). Any of these options work:

- Python: `python3 -m http.server 5173`
- Ruby: `ruby -run -e httpd . -p 5173`
- PHP: `php -S 127.0.0.1:5173`

Then open: http://127.0.0.1:5173/

## Controls

- Algorithm: Choose generator.
- Width/Height: Canvas resolution.
- Seed: Deterministic result; “Randomize” picks a new seed.
- Scale: Spatial scale for noise/warp.
- Octaves/Lacunarity/Gain: FBM parameters.
- Billow Power: Raises |FBM| to change puffiness.
- Warp Strength: Amount of domain warping (when applicable).
- Worley Cell Size: Average feature spacing (Worley + Perlin+Cells modes).
- Metaball Count/Radius: Number of blobs and base radius (Metaballs + Perlin+Metaballs).
- Single Cave controls: Cave Radius, Irregularity, Detail Scale, Angular Samples, Edge Feather, Smooth Iterations.
- Layout controls: Cave Count, Min/Max Radius, Padding between caves/boundaries.
- Random Walk controls: Walkers, Max Steps, Carve Radius, Branch Chance, Walk Speed (steps/sec).
- Reset Walk button: restarts the currently running random walk so new walker settings take effect.
- Threshold: Toggle hard/soft thresholding and set soft width.
- Blur Radius: Pre-threshold box blur (px).
- Closing Radius: Morphological closing (dilate+erode) radius (px) to merge gaps.
- Buttons: Render, Download PNG. Spacebar also re-renders.

## Algorithms Included

- FBM Perlin: Fractal Brownian Motion over a Perlin-style gradient noise.
- FBM (domain-warped): Coordinates are displaced by a low-frequency FBM before sampling.
- FBM Billow: Uses `pow(abs(fbm), power)` for puffy, cloud-like lobes.
- Worley F1: Distance to nearest feature point (cellular/bubbly).
- Worley F2-F1: Difference of two nearest distances, creating ridges/cellular plates.
- Metaballs: Sum of radial basis contributions from randomly placed blobs.
- Metaballs (domain-warped): Metaballs combined with domain warping for organic variety.
- Perlin + Cells: Soft union of billowy Perlin and inverted Worley cells—organic bubbles without worminess.
- Perlin + Metaballs: Soft union of billowy Perlin and metaball blobs for chunky clouds.
- Single Cave: Radial FBM silhouette that outputs one closed bubble plus polygon overlay.
- Cave Layout: Poisson-style placement of many single-cave blobs with padding.
- Random Walk: Pure random walkers that you can watch animate in real-time (10 steps/sec by default) while they carve blobs; blur/closing/threshold sliders re-render live without restarting.

## Single Cave & Layout Workflow

1. Pick `Single Cave` to design a hero blob. Adjust radius, irregularity, detail scale, and smoothing until the outline looks right. The polygon outline is shown on the canvas for reference.
2. Switch to `Cave Layout` to scatter many such blobs. Configure count, min/max radius, and padding to control density. Each cave reuses the single-cave generator with unique offsets, so shapes stay organic but distinct.
3. Use Blur/Closing + soft threshold to blend overlapping caves before exporting the combined marching field.
4. Switch to `Random Walk` when you want to watch walkers animate across the field. Adjust walkers/steps/radius/branch chance/speed and let the animation finish before exporting.

## Tips for Cave “Bubbles”

- Start with Worley F1 (bigger cell size => bigger bubbles). Try F2-F1 for ridge-like boundaries.
- Metaballs give round blobs; domain-warping them creates squishier, irregular shapes.
- FBM warped by FBM produces natural textures; combine with a threshold in your game for void/solid.
- For cloudier shapes, try FBM Billow or Perlin+Cells and raise Blur/Closing a little before thresholding.
- Use soft threshold width (0.03–0.08) for anti-aliased marching fields; increase width for beveled iso-bands.
- Compose layouts by unioning multiple single caves; keep padding >= edge feather to avoid obvious overlaps.
- Random walk tip: drop Branch Chance for thin tendrils, or crank it up for bubbly blobs; lower Walk Speed if you want to observe each step.

## Next Ideas

- Domain-warp with Worley to create blobby cells with drifted borders.
- Ridged FBM: `1 - abs(noise)` for sharper cavities.
- Multi-source: mix normalized FBM and Worley (e.g., min/median/max or weighted sum).
- Poisson-disk center placement for more even metaball spacing.
- Reaction–Diffusion (Gray-Scott) for vein-like structures (heavier compute).
