# Tools Audit Design
**Date:** 2026-03-05
**Approach:** Option B — Fix, Extend, and Define Workflow

---

## 1. Fixes (Broken Tools)

| Tool | Issue | Fix |
|------|-------|-----|
| `gh` CLI | Keyring token invalid | `gh auth login` to re-authenticate |
| GitHub MCP PAT | Hardcoded in `~/.claude/mcp.json` — functional but will expire | Note expiry; rotate when needed |
| Vercel CLI | Not installed | No action — Vercel auto-deploys via GitHub push; CLI is redundant |

---

## 2. Extensions (Gaps to Fill)

### 2a — New Tools
| Gap | Tool | Location |
|-----|------|----------|
| Python linter/formatter | `ruff` | `backend/` — replaces missing black/flake8 |
| E2E tests | Playwright | `frontend/e2e/` — uses already-installed plugin + MCP |

**Ruff:** Add to `backend/requirements.txt`, configure in `backend/pyproject.toml`. Covers linting + formatting in one tool.

**Playwright E2E:** Scaffold `frontend/e2e/` with Playwright config + smoke tests (app loads, auth redirect). Runs separately from Vitest unit tests.

### 2b — Claude Plugins (Installed)
| Plugin | Skills / Commands | Role |
|--------|-------------------|------|
| `superpowers` v4.3.1 | brainstorming, TDD, debugging, planning, code review, git worktrees, executing-plans, etc. | Core development workflow |
| `frontend-design` | UI generation skill | React/Vite component design |
| `playwright` | MCP + testing skill | E2E testing + interactive UI inspection |

### 2c — Claude Plugins to Install
| Plugin | What it adds | Why |
|--------|-------------|-----|
| `claude-md-management` | `/revise-claude-md` command + skill | CLAUDE.md + memory drift is a recurring pain point; end-of-session capture |
| `pr-review-toolkit` | 6 specialized review agents | Deeper pre-merge analysis (test coverage, error handling, simplification) |
| `hookify` | Markdown-configured hooks to enforce patterns | Enforce TDD discipline, catch convention violations |

### 2d — Plugins Evaluated and Skipped
- `commit-commands` — redundant with superpowers + existing git workflow
- `feature-dev` — redundant with superpowers brainstorm → plan → execute pipeline
- `pyright-lsp` — no type hints in this codebase
- `ralph-loop` — niche iterative loop technique, overkill
- `code-review` — overlaps with `superpowers:requesting-code-review`

---

## 3. Workflow Runbook

### Phase 1: Feature Planning
1. User describes feature → invoke `superpowers:brainstorming`
2. Approved design → invoke `superpowers:writing-plans` (plan doc in `docs/plans/`)
3. Plan approved → agents via `superpowers:executing-plans` or `superpowers:subagent-driven-development`

### Phase 2: Implementation (agents)
- Each agent creates a branch, follows `superpowers:test-driven-development`
- `superpowers:using-git-worktrees` for task isolation
- `superpowers:systematic-debugging` when a test won't pass
- Agents commit; do NOT merge

### Phase 3: Review
- `superpowers:requesting-code-review` after each agent task
- `pr-review-toolkit` for deeper pre-merge analysis
- `superpowers:verification-before-completion` before any "done" claim

### Phase 4: Deploy
- Merge branch to `main` → `git push origin main`
- Vercel + Railway auto-deploy — no manual steps

### Phase 5: Maintenance
- End of each session: `/revise-claude-md` to capture learnings into CLAUDE.md
- Bugs: `superpowers:systematic-debugging` before any fix attempt
- Finished branches: `superpowers:finishing-a-development-branch`

### MCP Servers
| MCP | Used for |
|-----|----------|
| `github` MCP | PR creation, issue linking, CI status checks |
| `git` MCP | Local repo operations (log, diff, blame) without shell |
| `playwright` MCP | E2E tests + interactive UI inspection during dev |

---

## 4. Output Artifacts (Implementation)
1. Fix `gh` auth
2. Install `ruff` in backend
3. Scaffold `frontend/e2e/` with Playwright smoke tests
4. Install `claude-md-management`, `pr-review-toolkit`, `hookify` plugins
5. Configure a `hookify` hook for TDD enforcement
