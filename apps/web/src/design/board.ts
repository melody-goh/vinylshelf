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

/** A board ink from an average colour: deepened so it reads as printed board, not a tint. */
export function inkFrom(rgb: [number, number, number]): BoardInk {
  const deep = rgb.map((v) => Math.round(v * 0.72)) as [number, number, number];
  const ink = `rgb(${deep.join(' ')})`;
  const L = luminance(deep);
  // Contrast against white vs. near-black text; pick whichever is higher.
  const onWhite = 1.05 / (L + 0.05);
  const onBlack = (L + 0.05) / 0.06;
  return onWhite >= onBlack
    ? { ink, text: '#ffffff', soft: 'rgb(255 255 255 / 0.8)' }
    : { ink, text: '#141414', soft: 'rgb(20 20 20 / 0.78)' };
}

/** The average of the cover's central area: its dominant printed colour, roughly. */
function sample(image: HTMLImageElement): [number, number, number] | null {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 24;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  try {
    context.drawImage(image, 0, 0, 24, 24);
    const { data } = context.getImageData(4, 4, 16, 16); // throws on a tainted canvas
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i] ?? 0;
      g += data[i + 1] ?? 0;
      b += data[i + 2] ?? 0;
    }
    const n = data.length / 4;
    return [r / n, g / n, b / n];
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
