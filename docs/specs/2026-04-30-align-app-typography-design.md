# Align In-App Typography with Landing Page [#142]

## Problem

The landing page uses a monospace font stack for headings and key UI text, giving it a distinctive technical aesthetic. The in-app UI uses only the system sans-serif stack everywhere, creating a visual disconnect between the two experiences.

## Solution

Add the landing page's monospace font stack as a design token and apply it to all headers and key UI labels in the app. No new font files or CDN imports needed — the stack uses system-installed monospace fonts.

## Font Stack

From the landing page (`landing.css`):

```
'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', ui-monospace, monospace
```

## What Changes

### Gets monospace treatment

| Element | Location | Current selector/class |
|---------|----------|----------------------|
| `h1`, `h2` base styles | `tailwind.css:101-102` | `@layer base` heading rules |
| Bottom tab bar labels | `BottomTabBar.jsx` | `<span>` with `text-xs` |
| Home page tab labels | `HomePage.jsx:116` | `<div>` with `text-sm font-bold tracking-wider uppercase` |

The `h1`/`h2` base rule covers most elements automatically:
- App title ("Bummer") in top bar
- Settings section headers (`<h2>`)
- Onboarding wizard titles (`<h1>`)
- Artist detail header (`<h2>`)
- Album row titles (`<h2>`)
- Delete confirmation header (`<h2>`)

### Stays sans-serif (no change)

- Body/paragraph text
- Button labels (inherit sans-serif from body)
- Input text
- Album metadata (artist names, track lists)
- Toast/notification text

## Implementation

1. Add `--font-mono` token to `@theme` block in `tailwind.css`
2. Apply `font-family: var(--font-mono)` to `h1, h2` rules in `@layer base`
3. Add Tailwind `font-mono` class to bottom tab labels and home page tab labels
4. Register `--font-mono` in Tailwind's `@theme` so `font-mono` utility class works

## No font loading required

All fonts in the stack are system-installed or have OS-level fallbacks. No `@font-face`, no preloads, no external requests.
