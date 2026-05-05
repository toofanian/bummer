# Release Branches Design

**Issue:** [#140](https://github.com/toofanian/bummer/issues/140)
**Date:** 2026-05-04
**Status:** Approved, ready for implementation plan

## Problem

Today, every merge to `main` deploys straight to production. There is no buffer between "tests pass" and "users see it." We want:

- Ability to batch changes into intentional releases
- A soak period where a frozen build runs against real usage before promotion
- Easy, fast rollbacks
- Foundation for versioning and changelogs

## Solution overview

Three long-lived branches with manual promotion gates:

| Branch | Purpose | Deploys to |
|--------|---------|------------|
| `main` | Integration. PR target for all feature work. | Per-PR Vercel preview URLs (unchanged) |
| `rc` | Release candidate. Snapshot of `main` at freeze time. Soak target. | `staging.bummer.app` (Vercel branch deploy + custom domain) |
| `production` | Live users. | Production domain (unchanged) |

Promotion is manual at every step. Solo dev cadence — no scheduled releases.

## Release flow

1. Feature work merges to `main` via PR (current behavior).
2. When a batch is ready to ship, fast-forward `rc` to current `main` HEAD: `git push origin main:rc`. This is the code freeze.
3. Vercel deploys `rc` to `staging.bummer.app`. Owner soaks against the staging URL using real Spotify auth and the prod Supabase database.
4. **Bug found during soak:** fix on `rc` directly (PR `fix/x` → `rc`), then backport to `main` (cherry-pick or PR `fix/x` → `main`). Soak continues — no reset.
5. Stable → open PR `rc` → `production`. CI runs (lint + tests). Merge with a merge commit (no squash, no rebase).
6. Manually tag `vMAJOR.MINOR.PATCH` on `production` and push: `git tag vX.Y.Z && git push --tags`.
7. Vercel auto-deploys `production`. Post-deploy smoke test workflow hits `/health` on the live domain. Failure = loud notification.

### Backport discipline

Every fix that lands on `rc` MUST also land on `main` before the next `rc` snapshot, or it will be clobbered when `rc` fast-forwards. This is enforced by convention, not tooling.

## Rollback

Two mechanisms, used together:

- **Fast (Vercel Instant Rollback):** Vercel UI → promote prior production deployment. Seconds. Use when the live site is broken right now.
- **Durable (`git revert`):** `git revert -m 1 <merge-sha>` on `production` and push. Aligns git truth with deployed state. Use after the fast rollback to keep history honest, or when the fix needs to stick across future deploys.

## Branch protection

| Branch | Rules |
|--------|-------|
| `main` | PR required, CI must pass, no direct push, no force push (current). |
| `rc` | PR required for bugfixes. CI must pass. Direct fast-forward push from owner allowed for snapshots. No force push. |
| `production` | PR required, CI must pass, no direct push, no force push. |

## Vercel configuration

- **Production branch setting:** `main` → `production`
- **Staging custom domain:** `staging.bummer.app` attached to `rc` branch deploys
- **Env vars:** `rc` branch uses production-scoped env vars (since RC shares the prod Supabase DB and the prod Spotify app)
- **Preview deploys:** unchanged — every PR to `main` gets a preview URL with the existing OAuth proxy behavior

## Spotify OAuth

- Register `https://staging.bummer.app/auth/callback` as a second Spotify redirect URI
- `rc` branch uses direct Spotify OAuth, not the preview-deploy callback proxy
- Reason: soak should exercise the real callback path, not the proxy. Preview deploys keep using the proxy as today.

## Database

- `rc` shares the production Supabase database (free tier, no Supabase branching available)
- This matches existing preview-deploy behavior
- Migration discipline already in place: apply migrations to prod BEFORE merging the PR that depends on them. Same rule applies to `rc` — if `rc` requires a migration, it must already be applied to prod.

## CI / GitHub Actions

### CI on production PRs

Extend the existing main-PR CI workflow to also trigger on PRs targeting `production`. Same lint + test matrix.

### Post-deploy smoke test (new workflow)

- **Trigger:** `push` to `production`
- **Steps:**
  1. Wait for Vercel deploy to finish (poll Vercel API or use deployment status webhook)
  2. `curl https://<prod-domain>/health`, expect 200 with the existing `/health` response shape
  3. Retry 3× with backoff to tolerate cold start
  4. Fail the workflow loudly on non-200 or timeout (GitHub notification)
- **Catches:** missing/wrong prod env vars, ASGI shim breakage, Supabase prod connection issues, frontend bundle 500s on first request

### Tag automation

Manual for v1. Owner runs `git tag vX.Y.Z && git push --tags` after merging to `production`. Revisit if ship rate exceeds weekly.

## Docs updates (CLAUDE.md)

- Replace "`main` is production" warning with "`production` branch is production"
- Add the release flow steps to the "Git workflow" section
- Update "Preview deploys" section to mention `staging.bummer.app` (rc branch) alongside preview URLs
- Document the rc-bugfix-then-backport rule

## One-time migration steps

Order matters. Each step is reversible until step 3.

1. Create `production` branch from current `main` HEAD; push.
2. Add branch protection on `production` (PR required, CI required, no direct/force push).
3. Vercel: change production branch from `main` to `production`. Verify next deploy from `production` works.
4. Tag current state `v1.0.0` on `production` and push tag.
5. Create `rc` branch from current `main` HEAD; push.
6. Vercel: attach `staging.bummer.app` to `rc` branch deploys. Configure env vars to mirror prod.
7. Spotify Dashboard: add `https://staging.bummer.app/auth/callback` as a redirect URI.
8. Add branch protection on `rc` (PR for bugfixes, CI required, no force push, allow fast-forward direct push from owner).
9. Add `production` as a target branch in the existing CI workflow. Add the new smoke-test workflow.
10. Update CLAUDE.md.
11. Run a full empty-release rehearsal (snapshot `rc` from `main`, promote `rc` → `production` with no real changes) to verify the full pipeline works end-to-end.

## Out of scope

- Automated tag generation / release-please / conventional commits
- Scheduled/automated promotion (cron-based releases)
- Multiple parallel release branches (`release/vX.Y` per release)
- Supabase branching for staging (requires Pro tier, $25/mo)
- Changelog generation
- Hotfix branches that bypass `rc`
