/** The non-affiliation notice Discogs' API terms require (ADR 0004 §7). */
export function Footer() {
  return (
    <footer className="shrink-0 border-t border-rule px-4 py-2 text-[0.7rem] leading-relaxed text-ink-soft md:px-8">
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
