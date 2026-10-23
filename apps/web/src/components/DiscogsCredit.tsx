/**
 * The attribution Discogs' API terms require next to every piece of Discogs data
 * (ADR 0004 §7). Render it with each data block, not once per page. The link target
 * is the record's own Discogs page, from the contract's `discogsUrl`. It takes the
 * colour of whatever it sits on, so it stays legible on any board ink.
 */
export function DiscogsCredit({
  href,
  className = 'text-ink-soft',
}: {
  href: string;
  className?: string;
}) {
  return (
    <p className={`text-xs ${className}`}>
      Data provided by{' '}
      <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
        Discogs
      </a>
    </p>
  );
}
