/**
 * The attribution Discogs' API terms require next to every piece of Discogs data
 * (ADR 0004 §7). Render it with each data block, not once per page. The link target
 * is the record's own Discogs page, from the contract's `discogsUrl`.
 */
export function DiscogsCredit({ href }: { href: string }) {
  return (
    <p className="text-xs text-neutral-500">
      Data provided by{' '}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-neutral-800"
      >
        Discogs
      </a>
    </p>
  );
}
