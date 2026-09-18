# Design QA — Editorial Matchday public page

Reference: selected Editorial Matchday concept generated from the two Euro Business Cup examples in `ROADMAP_NOTES.md`.

## Comparison pass

- Typography: the implementation preserves the concept's condensed tournament display face for the city, section titles, scores, and player names while retaining a readable sans-serif for navigation and body copy. Heading scale and compact uppercase metadata match the intended editorial hierarchy.
- Spacing and layout: the desktop page follows the selected composition: compact header, image-led city masthead, overlapping match ribbon, report/news split, compact table, and scorer rail. Thin rules and square surfaces replace the previous generic card-heavy treatment.
- Viewport resilience: desktop was inspected at 1280 × 720 with no document overflow. Tablet and mobile breakpoints stack the editorial grids, match ribbon, news list, and scorer rail without hiding core content. Existing mobile navigation remains in place.
- Colors and tokens: deep navy, warm paper, and electric green are consistently mapped across navigation, live competition data, calls to action, focus states, and section dividers. Text contrast remains strong on both dark and light surfaces.
- Image quality: the existing full-resolution match photography is used for the hero and story feature with intentional crops and restrained color treatment. No CSS illustration substitutes were introduced for reference imagery.
- Copy and content: the masthead and calls to action now describe a live tournament publication, while all match, table, story, club, and scorer content remains data-driven.
- Icons: existing Lucide icons retain one consistent stroke family and are aligned inside controls. Club marks remain data-driven.
- States and interactions: fixture navigation, search, season selection, match details, story details, club details, and lower-page sections remain reachable. A match detail was opened and closed successfully through the new result ribbon.
- Accessibility: the page has one clear `h1`, semantic buttons and sections, visible focus styling, labelled global controls, descriptive hero alt text, and no unnamed interactive control lacking an associated form label.
- Runtime: production build passes; browser console contains no runtime errors. ESLint has no errors (the repository's existing warnings remain outside this visual change).

## Findings resolved

- Replaced the oversized generic hero/dashboard combination with the selected editorial tournament hierarchy.
- Brought latest result and next fixture into a single scannable matchday ribbon.
- Reworked stories into a deliberate report/news desk rather than an interchangeable carousel.
- Added an above-the-fold competition snapshot using real standings and scorer data.
- Removed rounded-card drift from the new public composition and aligned the deeper site surfaces with the same visual system.

final result: passed
