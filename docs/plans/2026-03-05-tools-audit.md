# Tools Audit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix broken tooling, add ruff + Playwright E2E, and install three Claude plugins to complete the development toolchain.

**Architecture:** Sequential tasks — auth fix and plugin installs are CLI commands; ruff is a backend config addition; Playwright is a frontend test scaffold with mocked API smoke tests.

**Tech Stack:** Python/ruff (backend linting), Playwright + @playwright/test (E2E), Claude CLI (plugin management), hookify (hook config files)

---

## PREREQUISITE (Manual — User Does This First)

### Fix `gh` CLI Authentication

Run in your terminal:
```bash
gh auth login
```
Follow the prompts (browser flow). Verify with:
```bash
gh auth status
```
Expected: `Logged in to github.com as toofanian`

**Do not proceed until this is confirmed.**

---

## Task 1: Install and Configure Ruff (Backend Linter)

**Files:**
- Modify: `backend/requirements.txt`
- Create: `backend/pyproject.toml`
- Modify: `.vscode/settings.json`

**Step 1: Add ruff to requirements.txt**

Open `backend/requirements.txt` and add `ruff` at the end:
```
ruff
```

**Step 2: Install it**
```bash
source backend/.venv/bin/activate && pip install ruff
```
Expected: Successfully installed ruff

**Step 3: Create backend/pyproject.toml with ruff config**

Create `backend/pyproject.toml`:
```toml
[tool.ruff]
line-length = 88

[tool.ruff.lint]
select = ["E", "F", "I"]
ignore = ["E501"]
```

**Step 4: Run ruff to verify it works**
```bash
source backend/.venv/bin/activate && cd backend && ruff check . && ruff format --check .
```
Expected: Either "All checks passed" or a list of fixable issues. If issues, run:
```bash
ruff format .
```

**Step 5: Add ruff to VS Code settings**

In `.vscode/settings.json`, add inside the existing JSON object:
```json
"[python]": {
  "editor.defaultFormatter": "charliermarsh.ruff",
  "editor.formatOnSave": true
},
"ruff.enable": true
```

**Step 6: Add ruff commands to Makefile**

In `Makefile`, add after the `test-frontend` target:
```makefile
lint:
	@source backend/.venv/bin/activate && cd backend && ruff check . && ruff format --check .

lint-fix:
	@source backend/.venv/bin/activate && cd backend && ruff check --fix . && ruff format .
```

**Step 7: Commit**
```bash
git add backend/requirements.txt backend/pyproject.toml .vscode/settings.json Makefile
git commit -m "tooling: add ruff linter/formatter to backend"
```

---

## Task 2: Scaffold Playwright E2E Tests

**Files:**
- Create: `frontend/e2e/playwright.config.js`
- Create: `frontend/e2e/smoke.spec.js`
- Modify: `frontend/package.json`

**Step 1: Install @playwright/test**
```bash
cd frontend && npm install --save-dev @playwright/test
```
Expected: package-lock.json updated

**Step 2: Install Playwright browser (chromium only)**
```bash
cd frontend && npx playwright install chromium
```
Expected: Chromium downloaded

**Step 3: Write smoke test (failing first)**

Create `frontend/e2e/smoke.spec.js`:
```javascript
import { test, expect } from '@playwright/test'

test.describe('App smoke tests', () => {
  test('app HTML loads and root element exists', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#root')).toBeAttached()
  })

  test('unauthenticated: app checks auth status', async ({ page }) => {
    // Intercept the auth status call and return unauthenticated
    await page.route('**/auth/status', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: false }) })
    )
    // Also intercept the redirect to Spotify so Playwright doesn't follow it
    await page.route('**/auth/login', route =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>Spotify login</body></html>' })
    )
    await page.goto('/')
    // App should briefly show loading state before redirecting
    // Verify the root mounted (JS ran)
    await expect(page.locator('#root')).toBeAttached()
  })

  test('authenticated: library heading is visible', async ({ page }) => {
    // Mock all required API calls
    await page.route('**/auth/status', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true }) })
    )
    await page.route('**/library/albums', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ albums: [] }) })
    )
    await page.route('**/collections', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    )
    await page.route('**/playback/state', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ is_playing: false, track: null, device: null }) })
    )

    await page.goto('/')
    await expect(page.locator('text=Library')).toBeVisible({ timeout: 5000 })
  })
})
```

**Step 4: Create playwright.config.js**

Create `frontend/e2e/playwright.config.js`:
```javascript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '.',
  use: {
    baseURL: 'http://localhost:5173',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
```

**Step 5: Add e2e script to package.json**

In `frontend/package.json`, add to `"scripts"`:
```json
"test:e2e": "playwright test --config e2e/playwright.config.js"
```

**Step 6: Run the tests to verify they pass**

Start the dev backend in a separate terminal first:
```bash
make backend
```

Then run:
```bash
cd frontend && npm run test:e2e
```
Expected: 3 passed

**Step 7: Add e2e artifacts to .gitignore**

In `frontend/.gitignore`, add:
```
/test-results/
/playwright-report/
/playwright/.cache/
```

**Step 8: Add e2e command to Makefile**

In `Makefile`, add:
```makefile
test-e2e:
	@cd frontend && npm run test:e2e
```

**Step 9: Commit**
```bash
git add frontend/e2e/ frontend/package.json frontend/package-lock.json frontend/.gitignore Makefile
git commit -m "test: scaffold Playwright E2E smoke tests"
```

---

## Task 3: Install Claude Plugins

These are CLI commands — no TDD applies. Run each and verify.

**Step 1: Install claude-md-management**
```bash
claude plugin install claude-md-management
```
Expected: Plugin installed. Verify with `/revise-claude-md` command in a Claude Code session.

**Step 2: Install pr-review-toolkit**
```bash
claude plugin install pr-review-toolkit
```
Expected: Plugin installed. Verify by checking `claude plugin list`.

**Step 3: Install hookify**
```bash
claude plugin install hookify
```
Expected: Plugin installed. Verify with `/hookify:list` in a Claude Code session.

**Step 4: Verify all plugins are listed**
```bash
claude plugin list
```
Expected output includes: `frontend-design`, `superpowers`, `playwright`, `claude-md-management`, `pr-review-toolkit`, `hookify`

---

## Task 4: Configure Hookify TDD Enforcement Hook

**Files:**
- Create: `.claude/hookify.tdd-enforcement.md`

**Step 1: Create the hook config**

Create `.claude/hookify.tdd-enforcement.md`:
```markdown
---
name: tdd-enforcement
enabled: true
event: pre_tool_use
matcher: write|edit|create
---

# TDD Enforcement

Did you write a failing test first?

**Rule:** Never write implementation code without a failing test. If you're about to create or edit a source file without a corresponding test file being written first in this session, stop and write the test.

This applies to:
- New functions or classes
- New API endpoints
- New React components

Does NOT apply to:
- Config files (pyproject.toml, vite.config.js, etc.)
- CSS files
- Documentation
- Test files themselves
```

**Step 2: Verify hookify picks it up**

In a Claude Code session, run:
```
/hookify:list
```
Expected: `tdd-enforcement` appears as enabled.

**Step 3: Commit**
```bash
git add .claude/hookify.tdd-enforcement.md
git commit -m "tooling: add hookify TDD enforcement hook"
```

---

## Verification Checklist

After all tasks complete, verify:

- [ ] `gh auth status` shows logged in
- [ ] `make lint` passes with no errors
- [ ] `make test-e2e` passes (3 smoke tests green)
- [ ] `claude plugin list` shows all 6 plugins
- [ ] `/hookify:list` shows tdd-enforcement hook enabled
- [ ] `/revise-claude-md` command works in a new Claude Code session
