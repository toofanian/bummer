# Home Page UI Overhaul

## Problem

The home page looks half-baked on desktop. Album cards are 120px in horizontal scroll rows that waste most of the viewport width. The page feels empty and unfinished on wide screens.

## Scope

Presentation overhaul only — changing how sections are displayed, not fundamentally rethinking what content appears. One content change: merge Today/This Week and add Recently Added.

## Sections

Four sections in this order:

1. **Recently Played** — merged Today + This Week. Frontend concatenates both arrays, deduplicates by `spotify_id` (keep the more recent entry). Always renders; shows "Nothing yet" fallback when empty.
2. **Recently Added** — new. Albums sorted by `date_added` descending, capped at ~20. Requires backend to include `recently_added` in the `/home` response. Always renders with "Nothing yet" fallback.
3. **You Might Like** — existing data source, unchanged. Hides when empty.
4. **Rediscover** — existing data source, unchanged. Hides when empty.

## Card Design

Each card renders:
- Album art: square, fills card width, `rounded-md`
- Album name: `text-sm`, single line, truncated
- Artist name: `text-xs text-text-dim`, single line, truncated
- Hover (desktop only): `scale-[1.03]` with a faint shadow for tactile feedback
- No borders, backgrounds, or extra chrome

Same information as current cards, just bigger and with hover polish.

## Desktop Layout (>768px)

- Each section uses a wrapping CSS grid: `grid-template-columns: repeat(auto-fill, minmax(160px, 1fr))`
- Cards grow fluidly to fill available width (~160-180px depending on viewport)
- `gap-4` (16px) between cards
- `mb-8` between sections
- Page padding: `px-6 py-4`
- Section headers: `text-lg font-semibold mb-3 text-text` (unchanged)

## Mobile Layout (<=768px)

- Horizontal scroll rows (same pattern as current)
- Card size: `w-[110px] h-[110px]` (bumped from 100px)
- Scroll-snap behavior unchanged
- No hover states

## Responsive Breakpoint

Clean switch at Tailwind `md:` (768px). Desktop gets wrapping grid, mobile gets horizontal scroll. No intermediate states.

## Backend Change

Extend the `GET /home` response to include a `recently_added` key: an array of album objects sorted by `date_added` descending, limited to 20. Same shape as existing section arrays (`spotify_id`, `name`, `artists`, `image_url`).

## Components Affected

- **HomePage.jsx** — new section ordering, merge logic for Recently Played, render Recently Added
- **AlbumRow.jsx** — conditional layout: wrapping grid on desktop, horizontal scroll on mobile. Larger cards, hover state, `rounded-md`
- **Backend `/home` endpoint** — add `recently_added` to response

## Out of Scope

- Changing the Library, Collections, or other views
- Adding new interactive features (filters, sort controls) to the home page
- Changing the playback bar, header, or side panels
- Tier ratings UI
