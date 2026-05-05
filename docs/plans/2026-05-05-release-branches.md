# Release Branches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple production deploys from `main` by introducing `rc` (staging) and `production` long-lived branches, with manual promotion gates and a post-deploy smoke test.

**Architecture:** Three branches — `main` (integration, preview deploys), `rc` (release candidate, soak target at `staging.bummer.app`), `production` (live). Promotion is manual: snapshot `main` → `rc`, soak, then PR `rc` → `production`. A new GitHub Action runs after each `production` push to verify `/health` on the live domain.

**Tech Stack:** GitHub Actions (YAML), Vercel (manual config), Spotify Developer Dashboard (manual config), GitHub branch protection (manual config).

**Spec:** `docs/specs/2026-05-04-release-branches-design.md`

**Issue:** [#140](https://github.com/toofanian/bummer/issues/140)

---

## Task ordering note

Tasks 1–3 are code changes that land via the normal PR-to-main flow on the current branch (`140-release-branches`). They are safe to merge with the old single-branch model still in place — the CI workflow change adds `production` and `rc` as additional triggers without removing `main`, and the smoke-test workflow only fires on pushes to `production` (which doesn't exist yet, so it's inert).

Tasks 4–10 are the one-time live migration. They MUST be executed in order, by the owner, AFTER the PR for tasks 1–3 has merged to `main`. They are mostly manual UI/CLI steps and cannot be done by an agent.

---

## File Structure

**Modified:**
- `.github/workflows/ci.yml` — extend triggers to include PRs targeting `rc` and `production`
- `CLAUDE.md` — update git workflow + preview deploy sections
- (Create) `.github/workflows/prod-smoke-test.yml` — post-deploy `/health` check on `production` pushes

**Not changed in code:** Vercel project settings, GitHub branch protection, Spotify redirect URIs, branch creation. These are documented as a runbook in Task 4 but executed manually.

---

## Task 1: Extend CI workflow to cover rc and production PRs

**Files:**
- Modify: `.github/workflows/ci.yml:3-5`

**Context:** Currently CI only runs on PRs targeting `main`. After release branches are introduced, PRs will also target `rc` (bugfixes during soak) and `production` (the ship PR). All three need the same lint + test gates.

- [ ] **Step 1: Update the `on:` trigger**

Change lines 3–5 of `.github/workflows/ci.yml` from:

```yaml
on:
  pull_request:
    branches: [main]
```

to:

```yaml
on:
  pull_request:
    branches: [main, rc, production]
```

Leave the rest of the file unchanged.

- [ ] **Step 2: Validate the YAML**

Run: `python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run on PRs targeting rc and production [140]"
```

---

## Task 2: Add post-deploy smoke test workflow

**Files:**
- Create: `.github/workflows/prod-smoke-test.yml`

**Context:** When `production` is pushed, Vercel auto-deploys. We want a workflow that waits for the deploy, hits `/health`, and fails loudly if the live site is broken. The prod URL is stored as a repository variable `PROD_URL` (set during Task 4) so we don't hardcode the domain.

The Vercel deploy is async — Vercel doesn't block on the GitHub push. We poll `${PROD_URL}/health` with a delay and retries to absorb the deploy latency and any cold start.

- [ ] **Step 1: Create the workflow file**

Create `.github/workflows/prod-smoke-test.yml` with this content:

```yaml
name: Production Smoke Test

on:
  push:
    branches: [production]

jobs:
  smoke-test:
    name: Smoke test /health on production
    runs-on: ubuntu-latest
    steps:
      - name: Wait for Vercel deploy to propagate
        run: sleep 90

      - name: Hit /health with retries
        env:
          PROD_URL: ${{ vars.PROD_URL }}
        run: |
          if [ -z "$PROD_URL" ]; then
            echo "PROD_URL repository variable is not set" >&2
            exit 1
          fi

          attempts=0
          max_attempts=5
          delay=20

          while [ $attempts -lt $max_attempts ]; do
            attempts=$((attempts + 1))
            echo "Attempt $attempts: GET $PROD_URL/health"

            http_code=$(curl -s -o /tmp/health.json -w "%{http_code}" --max-time 15 "$PROD_URL/health" || echo "000")
            body=$(cat /tmp/health.json 2>/dev/null || echo "")

            if [ "$http_code" = "200" ] && echo "$body" | grep -q '"status":"ok"'; then
              echo "Smoke test passed: $body"
              exit 0
            fi

            echo "Attempt $attempts failed (status=$http_code, body=$body). Retrying in ${delay}s..."
            sleep $delay
          done

          echo "Smoke test failed after $max_attempts attempts" >&2
          exit 1
```

- [ ] **Step 2: Validate the YAML**

Run: `python -c "import yaml; yaml.safe_load(open('.github/workflows/prod-smoke-test.yml'))"`
Expected: no output, exit code 0.

- [ ] **Step 3: Verify the existing `/health` response shape matches the assertion**

Read `backend/main.py:81-83`. Confirm the endpoint returns `{"status": "ok"}`. The grep pattern in the workflow (`"status":"ok"`) must match this body verbatim (Python dict serialization removes the space; FastAPI/Starlette JSONResponse output is `{"status":"ok"}`).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/prod-smoke-test.yml
git commit -m "ci: add post-deploy smoke test on production push [140]"
```

---

## Task 3: Update CLAUDE.md for release-branch workflow

**Files:**
- Modify: `CLAUDE.md` — "Git workflow" section and "Preview deploys" section

**Context:** Several CLAUDE.md statements assume `main` is production. Update them. Also add the release flow steps and the rc-bugfix-then-backport rule.

- [ ] **Step 1: Replace the "main is production" warning**

Find the line in `CLAUDE.md` that begins:

```
- **`main` is production** — merging to main triggers a Vercel production deploy
```

Replace the entire bullet (one paragraph) with:

```
- **`production` is production** — merging to `production` triggers a Vercel production deploy to live users. Treat every merge to `production` as a release. Never push, force-push, or merge to `production` without passing CI and user approval. `main` is the integration branch and gets preview deploys per PR; merges to `main` do NOT deploy to prod.
```

- [ ] **Step 2: Add a "Release flow" subsection under "Git workflow"**

Find the "Git workflow" heading (`## Git workflow`). After the existing bullets but before the "Local preview before PR" bullet, insert this new subsection:

```markdown
### Release flow (rc + production)

Three long-lived branches: `main` (integration), `rc` (release candidate, deploys to `staging.bummer.app`), `production` (live).

1. Feature work merges to `main` via PR (current behavior).
2. When a batch is ready to ship, fast-forward `rc` to current `main` HEAD: `git push origin main:rc`. This is the code freeze.
3. Soak the staging URL (`staging.bummer.app`) on phone + Mac with real Spotify auth.
4. Bug found during soak → fix on `rc` directly (PR `fix/x` → `rc`), then backport to `main` (PR or cherry-pick). Soak continues — no reset. **Every rc-only fix MUST land on `main` before the next `rc` snapshot, or it gets clobbered.**
5. Stable → open PR `rc` → `production`. CI runs (lint + tests). Merge with a merge commit (no squash, no rebase — the merge commit is the ship event and the revert target).
6. Tag the release: `git tag vX.Y.Z && git push --tags` (manual semver bump).
7. Vercel auto-deploys `production`. The `Production Smoke Test` workflow hits `/health` and fails loudly if broken.

**Rollback:**
- Fast: Vercel UI → Instant Rollback to prior production deployment.
- Durable: `git revert -m 1 <merge-sha>` on `production` and push.
```

- [ ] **Step 3: Update the "Preview deploys" section**

Find the heading `## Preview deploys`. Add a new bullet at the end of the existing bullet list:

```markdown
- The `rc` branch deploys to `staging.bummer.app` (via Vercel branch deploy + custom domain). Unlike preview deploys, `rc` uses **direct Spotify OAuth** (its callback URI is registered in the Spotify Dashboard) — not the callback proxy. RC shares the prod Supabase DB, same as preview deploys.
```

- [ ] **Step 4: Verify the file still reads cleanly**

Open `CLAUDE.md` and read the modified sections top-to-bottom. Confirm:
- No duplicate "main is production" wording
- The release flow bullets are numbered 1–7 with no gaps
- The `staging.bummer.app` bullet is grouped with the other preview-deploy bullets

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for release-branch workflow [140]"
```

---

## Task 3.5: Open PR, get tasks 1–3 to main

**Context:** The remaining tasks (4–10) are manual live-migration steps. They need the workflow files and docs from tasks 1–3 already on `main`, because the migration creates the `production` branch by branching from `main`.

- [ ] **Step 1: Push the branch and open the PR**

```bash
git push -u origin 140-release-branches
gh pr create --title "Release branches: workflows + docs [140]" --body "$(cat <<'EOF'
## Summary
- Extend CI to run on PRs targeting `rc` and `production`
- Add post-deploy smoke test workflow that hits `/health` on `production` pushes
- Update CLAUDE.md to document the rc + production release flow

## Test plan
- [x] YAML validates for both workflow files
- [x] `/health` response shape matches the smoke test assertion
- [ ] After merge, owner runs the live migration runbook (Tasks 4–10)

Closes part of #140 (workflow/docs); branch creation and Vercel/Spotify config done manually post-merge.
EOF
)"
```

- [ ] **Step 2: Wait for CI green and user approval, then merge**

Poll `gh pr checks` until green. After user approves: `gh pr merge --squash --repo toofanian/bummer`.

---

## Task 4: One-time migration — create `production` branch and protect it

**Context:** From here down is a runbook for the owner. No agent should attempt these steps. Each step is reversible until step 5 (Vercel cutover).

**Pre-flight check:** The PR from Task 3.5 must be merged to `main`. Verify: `git fetch origin && git log origin/main --oneline -5` includes the workflow + CLAUDE.md commits.

- [ ] **Step 1: Create `production` branch from current main**

```bash
git fetch origin
git push origin origin/main:refs/heads/production
```

This pushes a new `production` branch pointing at the same SHA as `main`. No local checkout needed.

- [ ] **Step 2: Add branch protection on `production`**

GitHub UI: Settings → Branches → Add rule. Branch name pattern: `production`. Enable:
- Require a pull request before merging
- Require status checks to pass before merging — select: `Lint (ruff)`, `Backend Tests (pytest)`, `Frontend Tests (vitest)`
- Require branches to be up to date before merging
- Do not allow bypassing the above settings
- Restrict pushes (no force push, no deletion)

Save the rule. Verify: `gh api repos/toofanian/bummer/branches/production/protection` returns the rule (not 404).

- [ ] **Step 3: Tag the current state as v1.0.0**

```bash
git fetch origin
git tag v1.0.0 origin/production
git push origin v1.0.0
```

---

## Task 5: One-time migration — Vercel production branch cutover

**Context:** This is the live cutover. Until this step, prod still deploys from `main`. After this step, prod only deploys from `production`.

- [ ] **Step 1: Change Vercel production branch**

Vercel Dashboard → Project (bummer) → Settings → Git → Production Branch. Change from `main` to `production`. Save.

- [ ] **Step 2: Verify prod still works**

Open the live prod URL. Confirm normal load + `/health` returns 200. Since `production` was created from `main` at the same SHA, no redeploy should be needed, but Vercel may trigger one — wait for it to finish and verify.

- [ ] **Step 3: Set the `PROD_URL` repository variable**

```bash
gh variable set PROD_URL --body "https://<your-prod-domain>" --repo toofanian/bummer
```

Replace `<your-prod-domain>` with the actual production domain (e.g. `https://bummer.vercel.app` or your custom domain). The smoke-test workflow reads this.

- [ ] **Step 4: Smoke test the smoke test**

Push an empty commit to `production` to verify the workflow runs:

```bash
git fetch origin
git checkout -b verify-smoke-test origin/production
git commit --allow-empty -m "chore: verify smoke test workflow [140]"
git push origin verify-smoke-test
gh pr create --base production --head verify-smoke-test --title "chore: verify smoke test [140]" --body "Empty commit to confirm prod-smoke-test.yml runs and passes."
```

After merge to `production`: watch the Actions tab. The `Production Smoke Test` workflow should run, wait 90s, hit `/health`, and pass. If it fails, debug and fix before continuing.

---

## Task 6: One-time migration — create `rc` branch + Vercel staging domain

- [ ] **Step 1: Create `rc` branch from current main**

```bash
git fetch origin
git push origin origin/main:refs/heads/rc
```

- [ ] **Step 2: Add branch protection on `rc`**

GitHub UI: Settings → Branches → Add rule. Branch name pattern: `rc`. Enable:
- Require a pull request before merging — but allow administrators (you) to bypass for the fast-forward snapshots
- Require status checks to pass — same three checks as production
- Restrict pushes: no force push, no deletion. Allow direct push (needed for fast-forward snapshots).

Save.

- [ ] **Step 3: Attach `staging.bummer.app` to `rc` branch in Vercel**

Vercel Dashboard → Project → Settings → Domains. Add `staging.bummer.app` (or your chosen subdomain). Configure it to deploy from the `rc` branch:
- Click the new domain → Edit → Git Branch → set to `rc`. Save.

DNS: add a CNAME for `staging.bummer.app` pointing at `cname.vercel-dns.com` (or whatever Vercel instructs). Wait for SSL cert to provision.

- [ ] **Step 4: Configure env vars for the `rc` branch**

Vercel Dashboard → Settings → Environment Variables. For each prod env var, add an entry scoped to the `rc` branch (or set the branch to use Production scope). The full list of env vars is in `CLAUDE.md` under "Local dev setup" — Spotify, Supabase, etc. RC must use the same values as Production scope (it shares the prod DB and prod Spotify app).

- [ ] **Step 5: Verify staging deploys**

Vercel Dashboard → Deployments. Confirm a deploy was triggered for `rc`. Once finished, open `https://staging.bummer.app/health`. Expect 200 + `{"status":"ok"}`.

---

## Task 7: One-time migration — Spotify redirect URI for staging

- [ ] **Step 1: Add staging callback URI to Spotify Dashboard**

Spotify Developer Dashboard → your app → Edit Settings → Redirect URIs. Add:

```
https://staging.bummer.app/auth/callback
```

Save.

- [ ] **Step 2: Verify direct OAuth flow on staging**

Open `https://staging.bummer.app` on phone or Mac. Sign in with Google, then connect Spotify. Confirm the OAuth round-trip completes without going through the callback proxy. (You can verify by watching Network tab — the callback hits staging.bummer.app directly, not the prod backend.)

---

## Task 8: One-time migration — empty release rehearsal

**Context:** Run a full release cycle with no real changes to verify the pipeline end-to-end.

- [ ] **Step 1: Snapshot `rc` from `main`**

```bash
git fetch origin
git push origin origin/main:rc
```

- [ ] **Step 2: Verify staging deploys and works**

Wait for Vercel deploy on `rc`. Open `staging.bummer.app`, log in, do a quick smoke test (load library, play a track if Premium).

- [ ] **Step 3: Open ship PR**

```bash
gh pr create --base production --head rc --title "Release v1.0.1 [140]" --body "Empty release rehearsal. No changes."
```

- [ ] **Step 4: Wait for CI, merge with merge commit**

`gh pr checks` until green. Then merge — important, NOT squash:

```bash
gh pr merge --merge --repo toofanian/bummer
```

- [ ] **Step 5: Tag the release**

```bash
git fetch origin
git tag v1.0.1 origin/production
git push origin v1.0.1
```

- [ ] **Step 6: Verify smoke test passes**

Watch GitHub Actions → `Production Smoke Test`. Should pass within ~3 minutes of the merge.

- [ ] **Step 7: Verify prod still works**

Open prod URL, log in, basic smoke test.

---

## Task 9: One-time migration — practice rollback

**Context:** Verify both rollback paths work before you need them under pressure.

- [ ] **Step 1: Vercel Instant Rollback dry run**

Vercel Dashboard → Deployments → previous production deploy → "..." menu → Promote to Production. Confirm prod URL serves the prior build. Then promote the latest deploy back. Document the click path in your head.

- [ ] **Step 2: `git revert` dry run on a throwaway branch**

```bash
git fetch origin
git checkout -b test-revert origin/production
git revert -m 1 HEAD  # the merge commit from Task 8
```

Verify the revert produces a clean diff. Discard the branch:

```bash
git checkout -
git branch -D test-revert
```

Do NOT push the revert during the rehearsal.

---

## Task 10: Close out

- [ ] **Step 1: Close issue #140**

```bash
gh issue close 140 --repo toofanian/bummer --comment "Release branch model live. main → rc → production with manual promotion gates, semver tags, and post-deploy smoke test. Spec: docs/specs/2026-05-04-release-branches-design.md. Plan: docs/plans/2026-05-05-release-branches.md."
```

- [ ] **Step 2: Update BACKLOG.md if it tracks this item**

Move the release-branches entry to the completed section, link issue #140 and the spec.

- [ ] **Step 3: Commit any backlog changes**

```bash
git add BACKLOG.md
git commit -m "chore: mark release branches done in backlog [140]"
git push
```
