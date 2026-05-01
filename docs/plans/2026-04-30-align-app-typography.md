# Align App Typography Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the landing page's monospace font stack to all in-app headers and key UI labels for brand consistency.

**Architecture:** Add a `--font-mono` design token to Tailwind's `@theme`, apply it to base `h1`/`h2` rules, and add `font-mono` utility classes to non-heading UI labels (tab bars).

**Tech Stack:** Tailwind CSS v4, React (JSX)

---

### Task 1: Add mono font token and apply to headings

**Files:**
- Modify: `frontend/src/tailwind.css:3-25` (add token to `@theme`)
- Modify: `frontend/src/tailwind.css:101-102` (apply to `h1`, `h2`)

- [ ] **Step 1: Add `--font-mono` token to `@theme` block**

In `frontend/src/tailwind.css`, add this line after line 23 (`--breakpoint-lg: 1024px;`):

```css
  /* Typography */
  --font-mono: 'SF Mono', 'Fira Code', 'Cascadia Code', 'JetBrains Mono', ui-monospace, monospace;
```

- [ ] **Step 2: Apply mono font to `h1` and `h2` base rules**

In `frontend/src/tailwind.css`, change lines 101-102 from:

```css
  h1 { font-size: 1.2rem; font-weight: 600; }
  h2 { font-size: 1rem; font-weight: 600; }
```

to:

```css
  h1 { font-size: 1.2rem; font-weight: 600; font-family: var(--font-mono); }
  h2 { font-size: 1rem; font-weight: 600; font-family: var(--font-mono); }
```

- [ ] **Step 3: Run frontend dev server and visually verify headings changed**

Run: `npx --prefix frontend vite --host`

Check: App title "Bummer", settings section headers, artist detail headers should render in monospace.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/tailwind.css
git commit -m "Add mono font token and apply to h1/h2 base styles [142]

- Register --font-mono in @theme with landing page's monospace stack
- Apply font-family to h1, h2 base rules in @layer base

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

### Task 2: Apply mono font to bottom tab bar labels

**Files:**
- Modify: `frontend/src/components/BottomTabBar.jsx:41`

- [ ] **Step 1: Add `font-mono` class to tab label span**

In `frontend/src/components/BottomTabBar.jsx`, change line 41 from:

```jsx
          <span className={`text-xs${(tab.id === 'library' && syncing) || (tab.id === 'collections' && collectionsLoading) ? ' animate-pulse' : ''}`}>{tab.label}</span>
```

to:

```jsx
          <span className={`text-xs font-mono${(tab.id === 'library' && syncing) || (tab.id === 'collections' && collectionsLoading) ? ' animate-pulse' : ''}`}>{tab.label}</span>
```

- [ ] **Step 2: Visually verify bottom tab labels render in monospace**

Check: "Home", "Library", "Collections", "Digest" labels in bottom nav should be monospace.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/BottomTabBar.jsx
git commit -m "Apply mono font to bottom tab bar labels [142]

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

### Task 3: Apply mono font to home page tab labels

**Files:**
- Modify: `frontend/src/components/HomePage.jsx:116`

- [ ] **Step 1: Add `font-mono` class to home page tab label div**

In `frontend/src/components/HomePage.jsx`, change line 116 from:

```jsx
          <div className="px-4 py-2 text-sm font-bold tracking-wider uppercase text-text text-center flex-shrink-0 flex items-center justify-center" style={{ height: 40 }}>{tab.label}</div>
```

to:

```jsx
          <div className="px-4 py-2 text-sm font-bold font-mono tracking-wider uppercase text-text text-center flex-shrink-0 flex items-center justify-center" style={{ height: 40 }}>{tab.label}</div>
```

- [ ] **Step 2: Visually verify home page tabs render in monospace**

Check: "Recently Added", "Recently Played" etc. tab headers on home page should be monospace.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/HomePage.jsx
git commit -m "Apply mono font to home page tab labels [142]

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```
