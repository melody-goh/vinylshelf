import { discSurface } from '../design/vinyl';

interface DiscProps {
  vinylColors: readonly string[];
  /** Cover art, cropped round as the centre label. Omitted: a plain paper label. */
  labelImageUrl?: string | null;
  /** Unlit: a record whose data is refreshing, shown as an outline with no label. */
  unlit?: boolean;
  className?: string;
}

/**
 * A record out of its sleeve: the vinyl in its named colourway, fine grooves catching
 * light, and the cover as the centre label. Purely visual; the button around it carries
 * the accessible name.
 */
export function Disc({ vinylColors, labelImageUrl, unlit = false, className = '' }: DiscProps) {
  if (unlit) {
    return (
      <div
        aria-hidden="true"
        className={`aspect-square rounded-full border border-dashed border-ink-soft/50 bg-rule/40 ${className}`}
      />
    );
  }

  const surface = discSurface(vinylColors);
  const groove = surface.light ? '20 20 20' : '255 255 255';

  return (
    <div
      aria-hidden="true"
      className={`relative aspect-square rounded-full shadow-disc ${className}`}
      style={{ background: surface.background }}
    >
      {/* Grooves: concentric rings, faint, with a soft highlight like studio light. */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `repeating-radial-gradient(circle, rgb(${groove} / 0.07) 0 1px, transparent 1px 3px), linear-gradient(135deg, rgb(255 255 255 / 0.16), transparent 45%, rgb(0 0 0 / 0.12))`,
        }}
      />
      <div className="absolute inset-[32%] overflow-hidden rounded-full bg-ground ring-1 ring-black/10">
        {labelImageUrl && (
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
