# Bummer Style Guide

Visual patterns and conventions used across the frontend.

## Design Tokens

All colors use semantic Tailwind tokens defined in `frontend/src/tailwind.css`. Dark mode is default; light mode overrides via `prefers-color-scheme`.

| Token | Usage |
|-------|-------|
| `bg` | Page background |
| `surface` | Card/modal background |
| `surface-2` | Elevated surface, button default bg |
| `border` | Borders, dividers |
| `text` | Primary text |
| `text-dim` | Secondary/muted text |
| `accent` | Active/selected state, highlights |
| `spotify-green` | Spotify branding (login, connect) |
| `delete-red` | Destructive actions |
| `now-playing` | Now-playing row highlight bg |

## Loading & State Feedback

### Pulse (`animate-pulse`)

Use Tailwind's `animate-pulse` for **in-progress background operations** where the element remains interactive or informational. The pulse signals "something is happening" without blocking the UI.

Used for:
- **Tab labels** (Library, Collections) while syncing/loading data
- **Device picker rows** while connecting to a selected device

Pattern: apply `animate-pulse` class to the text or row element while the async operation runs. Remove when complete or on error.

### Spinner (`animate-spin`)

Use a spinning ring for **blocking loading states** where content is not yet available.

```jsx
<div className="w-7 h-7 border-[2.5px] border-border border-t-accent rounded-full animate-spin" />
```

Used for: initial page load, full-screen loading gates.

### Equalizer bars (`now-playing-indicator`, `eq-bar`)

Animated bars indicating active playback on a specific album/track row. Uses `eq-bounce` keyframes.

## Interactive Elements

### Buttons

Base style set in `@layer base` — `surface-2` bg, `border` border, 4px radius, 13px font. Hover lightens border to `hover-border`.

### Device/item rows

Rows in pickers and lists: `hover:bg-surface-2`, active/selected state uses `text-accent`. Fixed height, `cursor-pointer`, `select-none`.

### Tab underline

Active tab uses a 2px accent-colored underline that animates width via `tab-underline` utility class + `aria-selected`.

## Typography

- System font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- Base: 14px / 1.5
- Headings: `h1` 1.2rem semibold, `h2` 1rem semibold
- Small text: `text-xs` or `text-sm` with `text-text-dim`

## Layout

- Mobile-first, targets iPhone + Mac desktop
- `100dvh` root height, flex column
- Breakpoints: `sm` 390px, `md` 768px, `lg` 1024px
- Modals/pickers: `position: fixed`, high z-index (9998 backdrop, 9999 content)

## Transitions

- Default: `0.15s` for bg/border hover effects
- Chevron expand: `0.18s ease`
- Tab underline: `0.2s ease`
