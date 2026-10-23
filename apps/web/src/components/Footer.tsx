/** The non-affiliation notice Discogs' API terms require (ADR 0004 §7). */
export function Footer() {
  return (
    <footer className="mt-12 border-t border-neutral-200 py-6 text-xs text-neutral-500">
      <p>
        This application uses Discogs&rsquo; API but is not affiliated with, sponsored or endorsed
        by Discogs. &ldquo;Discogs&rdquo; is a trademark of Zink Media, LLC. Data provided by{' '}
        <a
          href="https://www.discogs.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Discogs
        </a>
        .
      </p>
    </footer>
  );
}
