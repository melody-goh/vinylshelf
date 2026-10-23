import type { CSSProperties } from 'react';
import clearPlate from '../design/disc/clear.webp';
import marblePlate from '../design/disc/marble.webp';
import sheenPlate from '../design/disc/sheen.webp';
import splatterPlate from '../design/disc/splatter.webp';
import { discSurface, type DiscSurface } from '../design/vinyl';

const EFFECT_PLATES = { marble: marblePlate, splatter: splatterPlate };

const UNLIT: DiscSurface = { base: '#dddcd7', clear: false, effect: null, description: null };

function masked(plate: string): CSSProperties {
  return { maskImage: `url(${plate})`, maskSize: '100% 100%', WebkitMaskImage: `url(${plate})` };
}

interface DiscProps {
  vinylColors: readonly string[];
  /** Cover art, cropped round as the centre label. Omitted: a plain paper label. */
  labelImageUrl?: string | null;
  /** Turns the marbling or splatter, so two records in one colourway are not identical. */
  seed?: number;
  /** Unlit: a record whose data is refreshing, a plain disc held back in the shadow. */
  unlit?: boolean;
  className?: string;
}

/**
 * A record out of its sleeve, composited like a product shot: the vinyl in its named
 * colourway, the pressed-in marbling or splatter, then the raster plate of grooves and
 * studio light (scripts/disc-plates.ts), and the cover as the centre label. Purely
 * visual; the button around it carries the accessible name.
 */
export function Disc({
  vinylColors,
  labelImageUrl,
  seed = 0,
  unlit = false,
  className = '',
}: DiscProps) {
  // Unlit discs are opaque and pale, so a stack of them still reads as a stack.
  const surface = unlit ? UNLIT : discSurface(vinylColors);

  return (
    <div
      aria-hidden="true"
      className={`relative aspect-square rounded-full shadow-disc ${className}`}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{ backgroundColor: surface.base, ...(surface.clear ? masked(clearPlate) : {}) }}
      />
      {surface.effect && (
        <div
          className="absolute inset-0 rounded-full"
          style={{
            backgroundColor: surface.effect.colour,
            transform: `rotate(${String((seed * 137) % 360)}deg)`,
            ...masked(EFFECT_PLATES[surface.effect.kind]),
          }}
        />
      )}
      <img
        src={sheenPlate}
        alt=""
        className={`absolute inset-0 h-full w-full ${unlit ? 'opacity-40' : ''}`}
      />
      <div
        className={`absolute inset-[32%] overflow-hidden rounded-full ring-1 ring-black/10 ${unlit ? 'bg-ground' : 'bg-rule'}`}
      >
        {labelImageUrl && !unlit && (
          <img
            src={labelImageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="absolute left-1/2 top-1/2 h-[3%] w-[3%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ground ring-1 ring-black/30" />
    </div>
  );
}
