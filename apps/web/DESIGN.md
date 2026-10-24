---
name: Vinyl Shelf
description: One open gatefold to sit inside, with the rest of the collection fanned beside it as real-coloured discs.
colors:
  sticker: "#cc3620"
  sticker-ink: "#fff8f0"
  carbon: "#1b1b1b"
  lacquer: "#121212"
  ground: "#f3f3f0"
  ink: "#141414"
  ink-soft: "#4a4844"
  rule: "#d9d8d3"
typography:
  display:
    fontFamily: "'Archivo Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(3rem, 9vw, 6rem)"
    fontWeight: 800
    lineHeight: 0.85
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 62"
  headline:
    fontFamily: "'Archivo Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 3vw, 2.75rem)"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 78"
  wordmark:
    fontFamily: "'Archivo Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 800
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 62"
  body:
    fontFamily: "'Archivo Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "'Archivo Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.625
  label:
    fontFamily: "'Archivo Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.7rem"
    fontWeight: 400
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 72"
    fontFeature: "'tnum'"
  sticker:
    fontFamily: "'Archivo Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0.06em"
    fontVariation: "'wdth' 72"
  fine-print:
    fontFamily: "'Archivo Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.7rem"
    fontWeight: 400
    lineHeight: 1.625
rounded:
  none: "0"
  full: "9999px"
spacing:
  gutter-phone: "1rem"
  gutter-wide: "2rem"
  stack: "1.5rem"
  board: "2.5rem"
components:
  hype-sticker:
    backgroundColor: "{colors.sticker}"
    textColor: "{colors.sticker-ink}"
    typography: "{typography.sticker}"
    rounded: "{rounded.full}"
    size: "8rem"
    padding: "1rem"
  closed-sleeve:
    backgroundColor: "{colors.carbon}"
    textColor: "{colors.ground}"
    typography: "{typography.display}"
    rounded: "{rounded.none}"
    width: "34rem"
    padding: "{spacing.board}"
  liner-board:
    backgroundColor: "{colors.carbon}"
    textColor: "{colors.ground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.none}"
    padding: "{spacing.board}"
  disc:
    backgroundColor: "{colors.lacquer}"
    rounded: "{rounded.full}"
    size: "15rem"
  disc-phone:
    backgroundColor: "{colors.lacquer}"
    rounded: "{rounded.full}"
    size: "9.5rem"
  header-strip:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    padding: "0.75rem 2rem"
  text-action:
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
  leaned-readout:
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    height: "2.75rem"
    padding: "0.75rem 1.5rem"
---

# Design System: Vinyl Shelf

## Overview

**Creative North Star: "Gatefold Liner Notes"**

A studio product shot of a record collection. The ground is a studio-white seamless sweep with soft photographic shadows; on it, one gatefold lies open at full size (the cover square on one panel, the liner notes printed on the inner board on the other, a crease between them) and the rest of the collection is fanned beside it as discs in their real colourways, each overlapping the next and showing a crescent. One record at a time gets the whole sleeve. The rest wait as a stack you can thumb through.

Type is set like liner notes: one variable family (Archivo) carrying the hierarchy through its width axis, condensed capitals for roles, positions and credit lines, regular weight for names and titles, hairline-ruled columns. Colour is almost all neutral; the only chromatic colours come from the records (cover art and named colourways) and from one sticker red that marks actions. Motion is physical: discs lean out of the stack on springs, and choosing one folds the board shut on its crease and opens it again on the new record.

Truth comes before decoration. A colourway is drawn only when Discogs names it; an unnamed record is drawn black and nothing is printed about its colour. Discogs data never appears without its credit.

**Key Characteristics:**
- Studio-white ground, soft photographic drop shadows, no hard edges of light.
- One open gatefold per screen; everything else is a fanned disc stack.
- Two shapes only: squares (sleeves, boards, covers) and circles (discs, stickers).
- Archivo Variable throughout; width (wdth 62 to 100) does the work other systems give to a second family.
- Sticker red is the single signal colour; actions are round hype stickers or underlined text.
- Springs only, transform and opacity only; reduced motion turns the fold into a crossfade.

## Colors

A neutral studio palette, warm by a hair, with one sticker red and whatever colour the records bring.

### Primary
- **Hype Sticker Red** (sticker): the round sticker on a sleeve's shrink-wrap. Fills hype stickers (sign in, import), draws the focus ring (2px outline, 3px offset), the text caret, and the filled part of the import progress bar. Under Sticker Ink it reaches 4.84:1; on the ground 4.59:1; as a focus ring on a carbon board 3.38:1 (non-text, passes).
- **Sticker Ink** (sticker-ink): the warm off-white printed on a hype sticker. Used nowhere else.

### Secondary
- **Carbon Board** (carbon): the printed inner board of the open gatefold, the closed sleeve (sign-in, empty shelf, waiting), and the panel behind a missing cover. With real Discogs covers this is the board you see: `i.discogs.com` sends no CORS header (verified 2026-10-23), so cover sampling cannot read the pixels and the board stays carbon with Studio White text and that text at 78% for secondary lines.
- **Lacquer Black** (lacquer): standard black vinyl, the colour of every disc whose colourway Discogs does not name.

### Neutral
- **Studio White** (ground): the seamless ground behind everything, and the text colour on carbon.
- **Press Ink** (ink): primary text on the ground; the selection highlight background (with Studio White text).
- **Soft Ink** (ink-soft): secondary text on the ground (counts, usernames, the "Sort by" label, credits, footer). It is the ink lifted toward warm, never a neutral grey; 8.2:1 on the ground.
- **Hairline Rule** (rule): every 1px rule on the ground: under the header, above the footer, the stack column's edge, Also the paper colour of a disc's centre label when there is no cover.

### Record colours (data, not tokens)
Disc colourways come from a fixed swatch table keyed by the colour words Discogs uses ("Blue Marbled", "Clear w/ Black Splatter"), in `src/design/vinyl.ts`. Clear vinyl draws through the clear plate so the ground shows; marble and splatter press a second colour through their plates. Refreshing records appear as unlit discs, an opaque pale grey (#dddcd7) with the sheen at 40%, so a stack of stand-ins still reads as a stack.

### Named Rules
**The One Signal Rule.** Sticker Red marks actions and focus only: hype stickers, the focus ring, the caret, import progress. It is never a decoration, a heading colour or a background panel.

**The Carbon Board Rule.** The liner board is carbon unless the featured cover is CORS-readable, in which case it is printed in the cover's dominant colour deepened to 90%, with black (#141414) or white text chosen by computed contrast. Treat carbon as the effective default and sampling as a latent path. Where board colour is sourced from (client sampling, server-side sampling with a contract change, or carbon only) is an open decision with the user; do not settle it in a surface.

**The Named Colourway Rule.** Only a colourway Discogs names is drawn or printed ("2019 · Blue Marbled vinyl"). No name means a Lacquer Black disc and no colour claim in the text. Never guess a colour from the cover.

## Typography

**Display Font:** Archivo Variable, self-hosted with the width axis (with ui-sans-serif, system-ui, sans-serif)
**Body Font:** Archivo Variable (same family)

**Character:** One grotesque used like a record sleeve's typesetting: compressed heavy capitals for titles printed on a sleeve, a narrower bold for the record title on the board, small condensed caps for credit roles, plain regular for everything a person reads.

### Hierarchy
- **Display** (800, clamp(3rem, 9vw, 6rem), line-height 0.85, wdth 62, uppercase): the title printed on a closed sleeve ("Vinyl Shelf" on sign-in, "Your shelf is empty", "Back in a moment"). A missing cover prints its title in the same voice, smaller (clamp(2rem, 4vw, 3.5rem), line-height 0.9).
- **Headline** (700, clamp(1.75rem, 3vw, 2.75rem), line-height 0.95, -0.02em, wdth 78, balanced wrap): the record title on the liner board. Title case, never uppercase. The live import count uses the same width and weight at 1.5rem.
- **Wordmark** (800, 0.875rem, wdth 62, uppercase, 0.06em): "Vinyl Shelf" in the header strip only.
- **Body** (400, 1rem, 1.5): the artist line under the record title; the lead sentence on the sign-in sleeve.
- **Body small** (400, 0.875rem, 1.625): the header controls, notices, errors, sleeve copy, the leaned-record readout, liner notes on phones and tablets (0.8125rem from 64rem up, where the notes split into two columns). Sleeve copy holds to 24rem.
- **Label** (400, 0.7rem, 0.06em, wdth 72, uppercase, tabular numerals): track positions, credit roles (Format, Genre, Producer), the catalogue line ("SYN-100 · Synthetic Records · Added Oct 14, 2026") and the "More below" cue. Always beside or under what it names, as on a printed credit list.
- **Sticker** (700, 0.875rem, 1.25, wdth 72, uppercase, 0.06em): the words on a hype sticker, centred.
- **Fine print** (400, 0.7rem, 1.625): the Discogs non-affiliation footer. The per-block "Data provided by Discogs" credit sits at 0.75rem.

### Named Rules
**The One Family Rule.** Archivo Variable is the only face. Hierarchy comes from the width axis (62 sleeve titles and wordmark, 72 labels, 78 headlines, 100 reading text) and weight, never from a second family or a system display face.

**The Liner Notes Rule.** Condensed caps label data the way a sleeve's credits do: in the left column of a term/value pair, as a track position, or as a credit line under the notes. They never float above a heading as a kicker or eyebrow.

**The Tabular Rule.** Anything counted or timed (record counts, track durations, years, catalogue lines, the import counter) uses tabular numerals.

## Layout

The app is a full-height column: a thin header strip, the working area, and the Discogs footer, each separated by Hairline Rules. From 48rem up the app is exactly the viewport height and the stack scrolls on its own.

**Wide (48rem and up).** The working area is a two-column grid: the gatefold column (`minmax(0, 1fr)`) and the stack column (`minmax(16rem, 28%)`), split by a 1px rule. The gatefold is centred in its column with 2rem gutters, as two square panels side by side; its width is capped at twice the available height (`(100dvh - 10rem) × 2`) so both squares always fit without scrolling. At 1440 × 900 it occupies about 70% of the width. Discs are 15rem across and each shows a 3.25rem crescent of the one beneath; the stack hangs from the right, indented 38% so a leaning disc has room to slide left.

**Phones (below 48rem).** The stack becomes a horizontal row above the gatefold (9.5rem discs, 2.75rem crescents, 1rem gutters), and the gatefold stacks its panels: cover above, board below, hinged on the shared edge.

**Readout, not overlay.** The leaned record is named in the strip under the stack (title in semibold, artist and year in Soft Ink), across the column's full width under a Hairline Rule, with no box of its own. The strip is washed in a pastel rainbow (red, orange, yellow, green, cyan, blue, violet, pink, at 80%) that slides slowly along itself on its own (the wash is three times the strip's width and translated, never repainted; a zero-bounce spring with a 12s visual duration, mirrored forever; still under reduced motion). The movement draws the eye to where names appear. Before anything is leaned it says how: "Hover a record to see what it is", or "Tap a record to open it" on phones. Reserved at 2.75rem so the layout does not jump. It never sits over the discs. Added at the user's request (2026-10-24): the world's one pastel.

**Sign-in.** The closed sleeve (max 34rem, square) is centred with five illustrative discs fanned vertically beside it from 64rem up (18rem discs overlapping by 14.5rem). Those discs stand for no record.

### Named Rules
**The One Record Rule.** One record is open at full size; the rest of the collection is a stack. Never lay the collection out as a grid of equal square covers.

**The Clear Readout Rule.** Information about a leaned or hovered disc appears in the readout under the stack, never on top of a disc.

## Elevation & Depth

Depth is photographic. Objects on the ground (the open gatefold, a closed sleeve, a hype sticker, each disc) cast soft drop shadows from a light above, as on a seamless studio sweep. Shadows are soft-edged with negative spread so they pool under the object rather than outlining it. Surfaces themselves are flat; there is no tonal layering of panels.

Two other depth devices are native to the world. The fold is a soft crease: a 1.5rem shadow from 30% black to transparent along the board's hinge edge, wide screens only. Long liner notes fade out over their last 2.5rem with a mask, and only while more is below. The open gatefold sits in 2400px perspective so the board can fold in 3D, and the board's printed face is hidden when it is turned away.

### Shadow Vocabulary
- **Photo** (`box-shadow: 0 18px 32px -14px rgb(20 20 20 / 0.35), 0 4px 10px -4px rgb(20 20 20 / 0.2)`): sleeve-sized objects: the open gatefold, the closed sleeve, the hype sticker.
- **Disc** (`box-shadow: 0 10px 18px -8px rgb(20 20 20 / 0.45)`): every disc, which also makes each crescent in a stack read as a separate record.

### Named Rules
**The Product Shot Rule.** Shadows are soft, fall downward and belong to physical objects. No hard offset shadows, no glows, no shadows on text or on rules.

## Shapes

Two shapes, both taken from the object. Squares with sharp corners (0 radius) for everything paper: covers, sleeves, the liner board. Perfect circles for everything pressed or stuck on: discs, their centre labels (the cover cropped round at 36% of the disc), the spindle hole, hype stickers, and the focus ring on a disc, which follows its circle. Borders are 1px hairlines or nothing. Inside the board, tracklist rows are divided by rules of the board text colour at 22%.

**The Two Shapes Rule.** If it is not a square of paper or a circle of vinyl or sticker, it has no shape at all: text actions, notices and controls sit directly on the ground without a container.

## Components

### Hype Sticker
The round sticker on a sleeve's shrink-wrap; the only filled control in the system, reserved for the few primary actions (sign in with Discogs, import my collection).
- **Shape:** an 8rem circle with the Photo shadow, set at -8° as if stuck on by hand.
- **Colour and type:** Sticker Red with Sticker Ink, bold condensed caps at 0.875rem, centred, 1rem padding.
- **Placement:** on a closed sleeve's top-right corner, overhanging it by 2.5rem on wide screens and tucked inside it (0.75rem in) on phones, where the sleeve title reserves 8rem on its right.
- **States:** hover straightens it slightly and lifts it (scale 1.05, -4°); press scales to 0.97; spring 500/28. Disabled at 70% opacity with no motion.

### Text Actions
Every other action ("Sign out", "Try now", "Sign in again", "Load more records") is underlined text in the current colour, with a 0.2em underline offset. "Load more records" uses condensed caps at 0.75rem and drops the underline while loading. The sort control is a bare select in medium weight with a 1rem chevron, after a "Sort by" label in Soft Ink.

### Header Strip
Wordmark on the left; record count, sort, username (wide screens only) and "Sign out" on the right, 1.5rem apart, on a Hairline Rule. 0.75rem vertical, 1rem phone and 2rem wide horizontal padding.

### Open Gatefold (signature)
The record at full size: two square panels in the Photo shadow.
- **Cover panel:** the Discogs cover, object-fit cover, on carbon. With no cover, the sleeve prints its own title in compressed caps and the artists below, never a stock image.
- **Liner board:** printed in the board ink (see The Carbon Board Rule), 1.5rem / 2rem / 2.5rem padding by breakpoint. Header: headline title, artists in body, then year and named colourway in Soft board text. Middle: the tracklist (position label, title, duration, ruled rows) and a term/value list of format, genre and credits, side by side from 64rem; only this middle scrolls, and says "More below" while it does. Footer: the catalogue line in label type and the Discogs credit.
- **Loading:** "Reading the liner notes…" over four bars in the text colour at 15%.
- **The fold:** choosing another record folds the board shut on its crease over the cover (rotateY to -180° from its left edge on wide screens, rotateX to 180° from its top edge on phones), swaps the record while closed, and opens it again; spring 210/29. Under reduced motion the record crossfades instead.

### Disc
A record out of its sleeve, composited like a product shot from raster plates: the vinyl's base colour (through the clear plate for clear vinyl), the marble or splatter plate as a mask in the second colour (rotated by the release id so two copies differ), the sheen plate of grooves, run-out and a studio light wedge, the cover cropped round as the centre label (a plain Hairline Rule-coloured label without one), and a Studio White spindle hole. The plates are 512px WebP with alpha, rendered procedurally and seeded by `apps/web/scripts/disc-plates.ts`; nothing is traced from a real record and no image model is involved.

### Disc Stack (signature)
The rest of the collection, fanned. The open record's disc is nudged 10% out of line. **Leaning:** on hover or keyboard focus a disc slides out of the stack (36% left on wide screens, 28% down on phones) on a spring of 420/34, and the readout below names it. Clicking or Enter opens it in the gatefold. Each disc is a button whose accessible name is title, artists and year. Up to eight unlit discs stand in for records that are refreshing; an empty shelf keeps the column with five unlit discs. The next page loads as the end of the stack comes into view.

### Closed Sleeve
The front of the gatefold before anything is open: a carbon square (max 34rem) in the Photo shadow, the display title at the top, up to 24rem of body-small copy at 80% Studio White at the bottom, and an optional hype sticker. Used for sign-in, the empty shelf and the "Back in a moment" refresh state.

### Scored Text (loading)
The full-screen loading lines ("Waking up the shelf…", "Taking your records off the shelf…"), set in display type (800, wdth 62, caps, clamp(2.75rem, 8vw, 5.5rem)) centred on the ground. A wave runs through the words, five letters wide, one letter every 110ms: each letter fades out as a handful of engraved notes (up to nine, about a quarter of an em each, at least 0.2em apart; crotchet, quaver, minim, beamed pair and three, flat; plain Ink) bloom from points inside its outline and drift just past it (0.03 to 0.1em), away from the letter's centre, then pull back in as the letter returns; the wave rests ten ticks between passes. Points are sampled from the glyph as laid out in Archivo (`src/design/scored.ts`), seeded per letter so a word always scores the same way. Springs 260/20 for the notes, 700/45 for the letter. On first load the screen is held until the wave has passed through once (about 2.3s from page load, capped at 4s), so the notes are seen even when the session check is instant; it is never held under reduced motion or when the letters cannot be scored. Screen readers get the sentence once, as plain text in the status; under reduced motion everyone does. Display size only: below about 2rem a note cannot read as one, so small loading lines stay plain.

### Import Progress
A live count that springs up to each new value (spring 120/24), "of N records in from Discogs" beside it, over a 4px bar: Hairline Rule track, Sticker Red fill. Screen readers get the real count once per poll; under reduced motion the count shows the real number directly.

### Discogs Credit and Footer
"Data provided by Discogs" in 0.75rem, linked to the record's Discogs page, rendered with each Discogs data block. It takes the colour of whatever it sits on (Soft Ink on the ground, board text on the board). The footer carries the non-affiliation notice in fine print on a Hairline Rule. How many credits a screen carries (currently one on the board, one over the stack) is an open question with the user.

### Motion grammar
All motion runs on springs and touches only `transform` and `opacity`. The app is wrapped in a motion configuration that honours the user's reduced-motion setting: transform animations jump straight to their end state while opacity still animates, and the gatefold swaps its fold for an explicit crossfade.

## Do's and Don'ts

### Do:
- **Do** keep one record open in the gatefold and the rest in the disc stack (The One Record Rule).
- **Do** reserve Sticker Red for hype stickers, the focus ring, the caret and import progress (The One Signal Rule).
- **Do** fall back to the Carbon Board with Studio White text whenever the cover cannot be sampled, and choose board text by computed contrast, never by assumption.
- **Do** draw only the colourways Discogs names; draw an unnamed record in Lacquer Black and print nothing about its colour.
- **Do** render the Discogs credit with every block of Discogs data.
- **Do** set roles, positions and credit lines in condensed caps beside what they name, and names and titles in regular weight (The Liner Notes Rule).
- **Do** animate with springs on `transform` and `opacity` only, and keep a crossfade path for reduced motion.
- **Do** name a leaned disc in the readout under the stack, clear of the discs.
- **Do** composite discs from the seeded raster plates; regenerate them with `scripts/disc-plates.ts`, never by tracing a real record.

### Don't:
- **Don't** use kicker or eyebrow labels above headings.
- **Don't** use gradient text. (The fold crease and the notes fade are depth devices, not text treatments.)
- **Don't** use hard offset shadows; every shadow is soft and photographic (The Product Shot Rule).
- **Don't** use side stripes wider than 1px.
- **Don't** make any other filled or rectangular button; actions are hype stickers or underlined text.
- **Don't** introduce a second typeface or a system display face (The One Family Rule).
- **Don't** lay the collection out as a grid of equal square covers.
- **Don't** add rounded corners to paper; it is square, or it is a circle.
- **Don't** show a stock image for a missing cover; print the title on the sleeve.
