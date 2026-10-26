---
version: 1
slug: "src-screens-shelf-tsx"
primary_target: "src/screens/Shelf.tsx"
related_targets: ["src/screens/Login.tsx","src/App.tsx"]
---

# Shelf (signed-in collection), with sign-in and record detail

## Scope and mode

The signed-in shelf, its record detail (the open gatefold) and the sign-in screen. Shelf:
Experience (wandering and rediscovering). Sign-in: Persuade (every reviewer's first
screen). Record detail: Read, inside the shelf. Desktop first; phones get the stack as a
top row.

## Audience, job and constraints

Collectors wander their own Discogs collection (5 to 2,000+ records) and pull something
out to play; reviewers arrive cold. Real data only: the user's shelf, attributed to
Discogs, never shown past `expiresAt`. Covers can be missing. Vinyl colour only when
Discogs names it (`vinylColors`), black otherwise. WCAG 2.2 AA; motion is transform and
opacity springs only, instant under reduced motion. Free, self-hosted fonts.

## Chosen direction and memorable moment

Gatefold Liner Notes, adapted to the user's correction: one open gatefold is the focus,
the rest of the collection a fanned stack of real-coloured discs beside it. The moment:
a disc slides half out of the stack under your hand, and choosing it closes the gatefold
and opens it again on that record.

## Unresolved

- Whether Discogs cover images allow colour sampling (CORS). Fallback: carbon board.
- Attribution placement: one credit on the gatefold, one for the stack (to confirm with
  the user at review).
- Demo access for reviewers without a Discogs account (PRODUCT.md, needs an ADR).

## Direction contract

THESIS: The shelf is one open gatefold you sit inside, with your collection fanned beside
it as real-coloured discs. It refuses the category's wall of equal square covers: one
record at a time gets the whole sleeve, and the rest wait as a stack you can thumb.

OWN-WORLD: Studio-white seamless ground (#f3f3f0) with soft photographic drop shadows, as
in a product shot. The gatefold's inner board is printed in one ink sampled from the
featured sleeve (carbon #1b1b1b when sampling fails), its text in black or white by
contrast. Discs in their actual colourways (lacquer black when unnamed), fine groove
sheen, the cover cropped round as the centre label. Archivo throughout, set like liner
notes: condensed caps for roles and headings, regular for names, hairline-ruled columns.
Actions are round hype stickers; nothing else is a filled button.

STORY: The visitor sees one record large and fully readable, sees the rest of their
collection fanned and coloured beside it, leans a disc out to see what it is, and opens
it into the gatefold to read its tracklist and credits.

FIRST VIEWPORT: At 1440 x 900: a thin header strip (wordmark left; record count, sort and
sign out right). The open gatefold fills the left 64%: the cover panel a square on the
left half, the liner panel on the right half in the board ink, the fold a visible crease
between them. The disc stack fills the right column: discs about 280px across, each
showing a 56px crescent, the top disc whole. The primary action is a disc itself (click
or Enter); the import and sign-in actions are hype stickers.

FORM: Gatefold Liner Notes, number 5 on the re-roll list, adapted by the user to one
focused gatefold plus a fanned disc stack; seed: seed:bb39414dd062de9c

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
