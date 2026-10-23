/**
 * The open gatefold's inner board is printed in one ink taken from the featured sleeve.
 * Sampling reads the cover's pixels, which the browser allows only when Discogs serves
 * the image with CORS; otherwise the board stays carbon. Either way the text colour is
 * chosen for contrast (WCAG 2.2 AA), never assumed.
 */
import { useEffect, useState } from 'react';

export interface BoardInk {
  /** Board colour. */
  ink: string;
  /** Text colour on the board, black or white by contrast. */
  text: string;
  /** Secondary text, the text colour at reduced strength (still AA on the board). */
  soft: string;
}

const CARBON: BoardInk = { ink: '#1b1b1b', text: '#f3f3f0', soft: 'rgb(243 243 240 / 0.78)' };

function luminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** A board ink from the sleeve's dominant colour, slightly deepened like ink on board. */
export function inkFrom(rgb: [number, number, number]): BoardInk {
  const deep = rgb.map((v) => Math.round(v * 0.9)) as [number, number, number];
  const ink = `rgb(${deep.join(' ')})`;
  const L = luminance(deep);
  // Contrast against white vs. near-black text; pick whichever is higher.
  const onWhite = 1.05 / (L + 0.05);
  const onBlack = (L + 0.05) / 0.06;
  return onWhite >= onBlack
    ? { ink, text: '#ffffff', soft: 'rgb(255 255 255 / 0.8)' }
    : { ink, text: '#141414', soft: 'rgb(20 20 20 / 0.78)' };
}

/**
 * The cover's dominant colour: the most common colour after coarse quantising, so a blue
 * sleeve with a yellow sun prints blue rather than an averaged grey.
 */
function sample(image: HTMLImageElement): [number, number, number] | null {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  try {
    context.drawImage(image, 0, 0, 32, 32);
    const { data } = context.getImageData(0, 0, 32, 32); // throws on a tainted canvas
    const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b] = [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
      const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
      const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      bucket.count++;
      bucket.r += r;
      bucket.g += g;
      bucket.b += b;
      buckets.set(key, bucket);
    }
    let top: { count: number; r: number; g: number; b: number } | undefined;
    for (const bucket of buckets.values()) if (!top || bucket.count > top.count) top = bucket;
    return top ? [top.r / top.count, top.g / top.count, top.b / top.count] : null;
  } catch {
    return null;
  }
}

export function useBoardInk(coverUrl: string | null): BoardInk {
  const [ink, setInk] = useState<BoardInk>(CARBON);

  useEffect(() => {
    if (!coverUrl) return;
    let cancelled = false;
    const image = new Image();
    // A separate, CORS-mode load: the visible cover never depends on CORS succeeding.
    image.crossOrigin = 'anonymous';
    image.referrerPolicy = 'no-referrer';
    image.onload = () => {
      const rgb = sample(image);
      if (!cancelled) setInk(rgb ? inkFrom(rgb) : CARBON);
    };
    image.onerror = () => {
      if (!cancelled) setInk(CARBON);
    };
    image.src = coverUrl;
    return () => {
      cancelled = true;
    };
  }, [coverUrl]);

  return coverUrl ? ink : CARBON;
}
