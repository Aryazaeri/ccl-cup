---
name: web-design-guidelines
description: Audits and reviews UI code against Vercel Web Interface Guidelines for accessibility, focus states, forms, typography, responsive layout shifts, and engineering quality.
---

# Web Interface Guidelines & Quality Review

Review and audit frontend code against Vercel's Web Interface Guidelines and industry accessibility/performance standards. Output concise, high-signal, actionable feedback in `file:line` format.

## Core Evaluation Pillars

### 1. Accessibility & Semantics (WCAG 2.1 AA)
- **Icon Buttons**: Every icon-only button must have a descriptive `aria-label` or `title` (e.g. `<button aria-label="Close dialog">`).
- **Semantic HTML**: Always use `<button>` for actions and `<a>`/`<Link>` for navigation. Avoid `<div onClick="...">`.
- **Form Controls**: Every input/select requires an explicit `<label htmlFor="...">` or wrapping `<label>`, or an `aria-label`.
- **Images**: Require descriptive `alt` text (or `alt=""` explicitly if purely decorative).
- **Decorative Icons**: Add `aria-hidden="true"` to Lucide/SVG icons so screen readers do not announce raw glyphs.
- **Dynamic Updates**: Use `aria-live="polite"` for toast notifications, live match score updates, or async validation messages.
- **Heading Hierarchy**: Maintain strict sequential heading levels (`<h1>` -> `<h2>` -> `<h3>`) without skipping levels.

### 2. Focus States & Keyboard Affordance
- **Visible Focus**: Interactive elements must provide a visible, high-contrast focus indicator using `:focus-visible` (e.g. `focus-visible:ring-2 focus-visible:ring-primary` or `outline: 2px solid var(--accent)`).
- **No Invisible Focus**: Never set `outline: none` without providing a distinct `:focus-visible` replacement.
- **Compound Controls**: Use `:focus-within` on input search bars or composite pickers.
- **Keyboard Navigation**: Modals, dropdowns, and canvas pickers must be closeable via `Escape` and navigable with `Tab` / `Enter` / `Space`.

### 3. Forms & Data Input
- **Autocomplete & Types**: Supply appropriate `type` (`email`, `number`, `url`), `inputMode`, and `autoComplete` attributes.
- **Clickable Labels**: Label and checkbox/radio controls must share a continuous hit area with no dead zones.
- **No Blocked Paste**: Never disable paste on text, password, or URL inputs.
- **Inline Validation**: Validation errors must appear inline adjacent to the relevant field, with error IDs linked via `aria-describedby`.
- **Loading State Feedback**: Submit buttons must display a spinner or loading text (`"Saving…"`, `"Loading…"`) and disable duplicate submissions while pending.
- **Ellipsis Standard**: Use true ellipsis (`…`) rather than three periods (`...`).

### 4. Typography & Numbers
- **Tabular Figures**: Always apply `font-variant-numeric: tabular-nums` to stats, standings, scorelines, clock timers, and countdowns to prevent jitter during updates.
- **Text Wrapping**: Use `text-wrap: balance` on hero/section headlines to avoid orphan words.
- **Ellipsis & Quotes**: Use typographic ellipsis `…` and curly quotes `“` `”` for editorial text.

### 5. Content Resiliency & Layout Shifts
- **Container Overflow**: Flexbox containers containing dynamic names/titles must have `min-width: 0` (`min-w-0`) to enable graceful `text-overflow: ellipsis`.
- **Empty States**: Never render broken blank spaces when arrays/strings are empty; provide purposeful invitations to act with guidance.
- **Cumulative Layout Shift (CLS)**: Supply explicit `width`/`height` or CSS `aspect-ratio` on images, logos, and pitch canvas wrappers to eliminate layout popping during load.

### 6. Animation & Motion
- **Reduced Motion**: Respect `@media (prefers-reduced-motion: reduce)` by disabling non-essential transitions or providing instant jumps.
- **Compositor Acceleration**: Animate only GPU-accelerated properties (`transform`, `opacity`, `filter`). Avoid animating layout triggers (`width`, `height`, `margin`, `padding`).
- **Explicit Transitions**: Avoid `transition: all` — explicitly enumerate properties (e.g. `transition: transform 0.15s ease, opacity 0.15s ease`).
