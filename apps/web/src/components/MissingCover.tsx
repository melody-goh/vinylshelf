/** When Discogs has no cover: the sleeve printed with its own title, never a stock image. */
export function MissingCover({ title, artists }: { title: string; artists: string[] }) {
  return (
    <div className="flex h-full flex-col justify-end p-8 text-ground">
      <p className="condensed text-[clamp(2rem,4vw,3.5rem)] font-extrabold leading-[0.9] [font-stretch:62%]">
        {title}
      </p>
      <p className="mt-2 text-sm text-ground/75">{artists.join(', ')}</p>
    </div>
  );
}
