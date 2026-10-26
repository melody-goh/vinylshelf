/**
 * Renders the raster plates a Disc is composited from, so records read as photographed
 * vinyl rather than flat CSS circles (finish review, MATERIAL). Procedural and seeded:
 * rerunning produces the same files, and nothing is traced from a real record.
 *
 *   node scripts/disc-plates.ts   (from apps/web; uses Playwright's Chrome)
 *
 * Output, all 512×512 WebP with alpha, in src/design/disc/:
 *   sheen.webp     grooves, run-out and the anisotropic light wedge of a studio shot;
 *                  white lifts, black sinks, transparent is neutral
 *   marble.webp    swirled bands, used as a mask over the base colour
 *   splatter.webp  irregular flecks with satellite droplets, used as a mask
 *   clear.webp     translucency for clear vinyl: thin in the field, denser at the rim
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../src/design/disc/', import.meta.url));
const SIZE = 512;
const SEED = 0x5eed_d15c;

type Plate = 'sheen' | 'marble' | 'splatter' | 'clear';

function render(args: { plate: Plate; size: number; seed: number }): string {
  const { plate, size, seed } = args;

  // mulberry32: a small seeded PRNG, so plates are reproducible.
  let state = seed;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Value noise on a seeded lattice, summed into fractal noise for marbling.
  const lattice = Array.from({ length: 256 }, random);
  const hash = (x: number, y: number) => lattice[(x * 57 + y * 131) & 255] ?? 0;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const noise = (x: number, y: number) => {
    const [xi, yi] = [Math.floor(x), Math.floor(y)];
    const [u, v] = [smooth(x - xi), smooth(y - yi)];
    const top = hash(xi, yi) * (1 - u) + hash(xi + 1, yi) * u;
    const bottom = hash(xi, yi + 1) * (1 - u) + hash(xi + 1, yi + 1) * u;
    return top * (1 - v) + bottom * v;
  };
  const fbm = (x: number, y: number) => {
    let sum = 0;
    let amp = 0.5;
    for (let o = 0; o < 5; o++) {
      sum += amp * noise(x, y);
      x *= 2;
      y *= 2;
      amp /= 2;
    }
    return sum;
  };
  const step = (a: number, b: number, t: number) =>
    smooth(Math.min(1, Math.max(0, (t - a) / (b - a))));

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d context');
  const half = size / 2;

  if (plate === 'splatter') {
    // Flecks are paths, not pixels: irregular outlines, with droplets thrown off the big ones.
    context.fillStyle = '#fff';
    const blob = (cx: number, cy: number, radius: number) => {
      context.beginPath();
      const points = 28;
      const phase = random() * 10;
      for (let i = 0; i <= points; i++) {
        const a = (i / points) * Math.PI * 2;
        const wobble =
          1 + 0.28 * (noise(phase + Math.cos(a) * 1.6, phase + Math.sin(a) * 1.6) - 0.5) * 2;
        const x = cx + Math.cos(a) * radius * wobble;
        const y = cy + Math.sin(a) * radius * wobble;
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.fill();
    };
    for (let i = 0; i < 70; i++) {
      const r = Math.sqrt(random()) * half * 0.97;
      const a = random() * Math.PI * 2;
      const [cx, cy] = [half + Math.cos(a) * r, half + Math.sin(a) * r];
      const radius = size * (0.004 + 0.035 * random() ** 3);
      blob(cx, cy, radius);
      for (let d = 0; d < Math.round(radius / 3); d++) {
        const da = random() * Math.PI * 2;
        const dr = radius * (1.4 + random() * 1.8);
        blob(cx + Math.cos(da) * dr, cy + Math.sin(da) * dr, radius * (0.08 + random() * 0.18));
      }
    }
    for (let i = 0; i < 220; i++) {
      const r = Math.sqrt(random()) * half * 0.98;
      const a = random() * Math.PI * 2;
      blob(half + Math.cos(a) * r, half + Math.sin(a) * r, 0.6 + random() * 1.4);
    }
    context.globalCompositeOperation = 'destination-in';
    context.beginPath();
    context.arc(half, half, half - 1, 0, Math.PI * 2);
    context.fill();
    return canvas.toDataURL('image/webp', 0.92);
  }

  const image = context.createImageData(size, size);
  const offset = random() * 100;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const dx = (px + 0.5 - half) / half;
      const dy = (py + 0.5 - half) / half;
      const r = Math.hypot(dx, dy);
      const edge = Math.min(1, Math.max(0, (1 - r) * half)); // anti-aliased rim
      if (edge <= 0) continue;
      const theta = Math.atan2(dy, dx);
      let white: number;
      let alpha: number;

      if (plate === 'sheen') {
        // Light from the upper left: on grooved vinyl it shows as a bow-tie of two
        // opposite wedges, streaked by the grooves it crosses.
        const wedge = Math.max(0, Math.cos(2 * (theta + Math.PI * 0.27))) ** 6;
        const grooved = r > 0.41 && r < 0.955;
        // Grooves as random concentric grain, not a regular sine, which beats against
        // the screen's pixels into moiré rings once the disc is scaled down.
        const gaps = [0.52, 0.63, 0.71, 0.8, 0.87];
        const inGap = gaps.some((g) => Math.abs(r - g) < 0.006);
        const ring = (noise(r * 420, offset) - 0.5) * 2;
        const streak = 0.65 + 0.35 * noise(r * 260, offset + 7);
        let light = 0;
        if (grooved && !inGap) {
          light += 0.07 * ring;
          light += 0.42 * wedge * streak * (0.75 + 0.25 * ring);
        } else if (r >= 0.32 && r <= 0.41) {
          light += 0.16 * wedge; // the glossy run-out
        } else if (inGap) {
          light += 0.24 * wedge + 0.04;
        }
        if (r > 0.955) light += 0.1 + 0.25 * wedge; // the raised lip
        light -= 0.08 * step(0.2, 1, (dx + dy) / 1.4 + 0.3); // falling off away from the light
        if (r < 0.32) light = 0; // under the label
        white = light > 0 ? 255 : 0;
        alpha = Math.min(0.85, Math.abs(light));
      } else if (plate === 'marble') {
        // Pressed marble: bands that swirl round the spindle, broken up by warped noise.
        const swirl = theta + r * 2.6;
        const [sx, sy] = [Math.cos(swirl) * r * 3, Math.sin(swirl) * r * 3];
        const warp = fbm(sx + offset, sy) * 4.5;
        const band = Math.sin(sx * 1.4 + warp * 2.2) * 0.5 + 0.5;
        white = 255;
        alpha = step(0.45, 0.8, band) * (0.55 + 0.45 * fbm(sx * 3, sy * 3 + offset));
      } else {
        // Clear vinyl: mostly see-through, denser where the pressing is thicker.
        white = 255;
        alpha =
          0.5 +
          0.38 * step(0.9, 1, r) +
          0.18 * step(0.41, 0.32, r) +
          0.06 * (noise(r * 300, offset) - 0.5);
      }

      const i = (py * size + px) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = white;
      image.data[i + 3] = Math.round(255 * Math.min(1, alpha) * edge);
    }
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL('image/webp', 0.92);
}

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage();
  await mkdir(OUT, { recursive: true });
  const plates: Plate[] = ['sheen', 'marble', 'splatter', 'clear'];
  for (const [index, plate] of plates.entries()) {
    const dataUrl = await page.evaluate(render, { plate, size: SIZE, seed: SEED + index });
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    await writeFile(`${OUT}${plate}.webp`, Buffer.from(base64, 'base64'));
    console.log(`wrote ${plate}.webp`);
  }
} finally {
  await browser.close();
}
