import type { ReactNode } from 'react';

/**
 * A closed sleeve: the front of the gatefold before anything is opened. Used where there
 * is no record to show yet (sign-in, an empty shelf, the first import), with the action
 * on it as a hype sticker and whatever needs saying set on the sleeve itself.
 */
export function ClosedSleeve({
  title,
  heading: Heading = 'h1',
  children,
  sticker,
}: {
  title: string;
  /** The sleeve title is the page heading on sign-in, a section heading elsewhere. */
  heading?: 'h1' | 'h2';
  children?: ReactNode;
  sticker?: ReactNode;
}) {
  return (
    <div className="relative w-full max-w-[34rem]">
      <div className="flex aspect-square flex-col justify-between bg-carbon p-8 text-ground shadow-photo md:p-10">
        <Heading className="condensed text-[clamp(3rem,9vw,6rem)] font-extrabold leading-[0.85] [font-stretch:62%]">
          {title}
        </Heading>
        <div className="max-w-[24rem] space-y-3 text-sm leading-relaxed text-ground/80">
          {children}
        </div>
      </div>
      {sticker && <div className="absolute -right-6 -top-6 md:-right-10 md:-top-10">{sticker}</div>}
    </div>
  );
}
