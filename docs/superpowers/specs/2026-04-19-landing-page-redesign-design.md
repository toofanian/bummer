# Landing Page Redesign — Design Spec

## Goal

Replace the current raw HTML landing page with a polished, React-based single-screen page. Brutalist/minimal aesthetic. No scroll. Screenshots are the hero element.

## Constraints

- Everything above the fold — no scrolling required on desktop
- No AI-generated marketing copy — user provides all text
- Served at `thedeathofshuffle.com` via existing Vercel rewrite rules
- Must work on desktop and mobile viewports

## Layout

Single centered column, `100vh`, vertically and horizontally centered:

1. **Heading**: "The Death of Shuffle" — large, bold, tight tracking
2. **Subheading**: "An album-first music interface, for a more intentional experience."
3. **Screenshot carousel**: largest element on the page, centered, no frame/border
4. **Dot pagination**: 4 dots below the carousel
5. **CTA button**: "Bummer" — links to `https://app.thedeathofshuffle.com`
6. **Footer**: "Feedback welcome through GitHub." text above a GitHub icon link

## Visual Direction

- Brutalist / minimal — stark, confident, anti-design
- Dark theme by default (existing design tokens), light mode supported
- No decorative elements, no gradients, no glow effects
- Monospaced accents where appropriate
- Strong whitespace, raw typography

## Tech Stack

- **React 19** — mounted as a second Vite entry point (multi-page already configured)
- **Splide.js** (`@splidejs/react-splide` + `@splidejs/splide`) — carousel with autoplay, dots, touch/swipe
- **Tailwind 4** — existing setup, no changes
- **No Framer Motion** — no animations needed for brutalist vibe

## Carousel Config

- `type: 'loop'` — infinite loop
- `autoplay: true` — ~5 second interval
- `pauseOnHover: true`
- Dot pagination enabled, no arrow buttons
- `drag: true` — touch/swipe support
- 4 slides: Home, Library, Collections, Digest
- Images at `/screenshots/{home,library,collections,digest}.png`

## Responsive Sizing

- Screenshot container constrained by `max-h` (roughly 50vh) to guarantee all elements fit viewport
- Images use `object-contain` to preserve aspect ratio
- On mobile, same vertical stack but scaled down proportionally

## Component Structure

### `frontend/src/landing-entry.jsx`
React root mount for the landing page. Imports `LandingPage` and renders into `#landing-root`.

### `frontend/src/LandingPage.jsx`
Single component containing the full page: heading, subheading, Splide carousel, CTA button, footer. Imports `landing.css`.

## Files Changed

| File | Action |
|------|--------|
| `frontend/landing.html` | Gut inline content, add `<div id="landing-root">` + `<script type="module" src="/src/landing-entry.jsx">` |
| `frontend/src/landing-entry.jsx` | **New** — React root mount |
| `frontend/src/LandingPage.jsx` | **New** — full landing page component |
| `frontend/src/landing.css` | Keep as-is |
| `frontend/package.json` | Add `@splidejs/react-splide`, `@splidejs/splide` |

## Out of Scope

- No unit tests (static page, no testable logic)
- No copy changes beyond what's already on the page
- No captions on screenshots (user will add later)
- No mobile-specific screenshots (desktop only)
