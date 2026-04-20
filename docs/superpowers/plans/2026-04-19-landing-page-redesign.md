# Landing Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw HTML landing page with a React-based, brutalist single-screen page featuring a Splide screenshot carousel.

**Architecture:** `landing.html` becomes a React mount point. A new `landing-entry.jsx` boots React into `#landing-root`. A single `LandingPage.jsx` component renders the full page: heading, subheading, Splide carousel with 4 screenshots, CTA button, and footer. Existing `landing.css` provides Tailwind + design tokens.

**Tech Stack:** React 19, Splide.js (@splidejs/react-splide), Tailwind 4, Vite 7 (multi-page)

---

### Task 1: Install Splide dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install Splide packages**

```bash
cd frontend && npm install @splidejs/splide @splidejs/react-splide
```

- [ ] **Step 2: Verify installation**

```bash
cd frontend && node -e "require('@splidejs/react-splide'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "Add Splide.js carousel dependencies

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Create React entry point

**Files:**
- Create: `frontend/src/landing-entry.jsx`
- Modify: `frontend/landing.html`

- [ ] **Step 1: Create `landing-entry.jsx`**

```jsx
// frontend/src/landing-entry.jsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './landing.css'
import LandingPage from './LandingPage.jsx'

createRoot(document.getElementById('landing-root')).render(
  <StrictMode>
    <LandingPage />
  </StrictMode>,
)
```

- [ ] **Step 2: Gut `landing.html` and add React mount**

Replace the entire contents of `frontend/landing.html` with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#111111" />
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🐣</text></svg>" />
    <title>Bummer</title>
  </head>
  <body>
    <div id="landing-root"></div>
    <script type="module" src="/src/landing-entry.jsx"></script>
  </body>
</html>
```

Note: The `<link rel="stylesheet">` for `landing.css` is removed because the CSS is now imported via `landing-entry.jsx`, which Vite processes.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/landing-entry.jsx frontend/landing.html
git commit -m "Convert landing page to React entry point

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Build LandingPage component

**Files:**
- Create: `frontend/src/LandingPage.jsx`

- [ ] **Step 1: Create `LandingPage.jsx`**

```jsx
// frontend/src/LandingPage.jsx
import { Splide, SplideSlide } from '@splidejs/react-splide'
import '@splidejs/splide/css/core'

const screenshots = [
  { src: '/screenshots/home.png', alt: 'Home' },
  { src: '/screenshots/library.png', alt: 'Library' },
  { src: '/screenshots/collections.png', alt: 'Collections' },
  { src: '/screenshots/digest.png', alt: 'Digest' },
]

export default function LandingPage() {
  return (
    <main className="h-screen flex flex-col items-center justify-center px-6 py-6">
      <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-2 text-center">
        The Death of Shuffle
      </h1>
      <p className="text-base md:text-lg text-text-dim mb-4 text-center">
        An album-first music interface, for a more intentional experience.
      </p>

      <div className="w-full max-w-3xl mb-4">
        <Splide
          options={{
            type: 'loop',
            autoplay: true,
            interval: 5000,
            pauseOnHover: true,
            pagination: true,
            arrows: false,
            drag: true,
          }}
          aria-label="Feature screenshots"
        >
          {screenshots.map((s) => (
            <SplideSlide key={s.alt}>
              <img
                src={s.src}
                alt={s.alt}
                className="w-full max-h-[50vh] object-contain mx-auto rounded-lg"
              />
            </SplideSlide>
          ))}
        </Splide>
      </div>

      <a
        href="https://app.thedeathofshuffle.com"
        className="inline-block bg-surface-2 border border-border text-text font-semibold text-lg px-8 py-2 rounded-lg hover:border-accent transition-colors mb-4"
      >
        Bummer
      </a>

      <footer className="text-center text-text-dim text-sm">
        <p className="mb-2">Feedback welcome through GitHub.</p>
        <a
          href="https://github.com/toofanian/bummer"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub repository"
          className="inline-block text-text-dim hover:text-text transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
          </svg>
        </a>
      </footer>
    </main>
  )
}
```

- [ ] **Step 2: Add Splide dot styling to `landing.css`**

Append to the end of `frontend/src/landing.css`:

```css
/* Splide dot pagination — brutalist style */
.splide__pagination__page {
  background: var(--color-text-dim);
  opacity: 0.4;
  width: 8px;
  height: 8px;
  margin: 0 4px;
  border: none;
  border-radius: 50%;
  transition: opacity 0.2s;
}

.splide__pagination__page.is-active {
  opacity: 1;
  background: var(--color-text);
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/LandingPage.jsx frontend/src/landing.css
git commit -m "Build LandingPage component with Splide carousel

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Verify locally and push

- [ ] **Step 1: Run dev server and verify landing page**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173/landing.html` in browser. Verify:
- Page loads with React (no raw HTML)
- Heading "The Death of Shuffle" visible
- Subheading visible
- Carousel shows screenshots, auto-rotates every 5s, dots work, swipe works
- "Bummer" button links to `https://app.thedeathofshuffle.com`
- "Feedback welcome through GitHub." text above GitHub icon
- Everything fits viewport — no scrolling needed on desktop
- Light mode works (toggle system preference)

- [ ] **Step 2: Run build to verify production output**

```bash
cd frontend && npm run build
```

Expected: Build succeeds with no errors. `dist/landing.html` exists in output.

- [ ] **Step 3: Push**

```bash
git push origin 30-landing-page-overhaul
```
