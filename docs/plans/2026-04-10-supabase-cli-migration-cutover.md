# Supabase CLI Migration Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `backend/migrate.py` + `backend/migrations/` with Supabase CLI-managed migrations in `supabase/migrations/`, using a single pulled baseline to represent current prod schema.

**Architecture:** Remote-only Supabase CLI workflow — no Docker, no local dev DB. Install the CLI via homebrew, `supabase init` to create the directory structure, `supabase link` to associate with the prod project, `supabase db pull` to generate the baseline, manually verify, `supabase migration repair` to mark as applied, then delete old files.

**Tech Stack:** Supabase CLI, Postgres, homebrew. No runtime code changes.

**Spec:** [`docs/specs/2026-04-10-supabase-cli-migration-cutover-design.md`](../specs/2026-04-10-supabase-cli-migration-cutover-design.md)

---

## Pre-flight

- [ ] **Step 1: Confirm you're on main with a clean working tree**

```
cd /Users/alextoofanian/Documents/20-29_Projects/21_Software/21.01_personal/crate
git status
```

Expected: `On branch main`. No modified tracked files (untracked `.vercel/`, `node_modules/`, etc. are OK). If there are modified tracked files, stash or commit them before proceeding.

- [ ] **Step 2: Confirm prod backend tests pass against the unchanged prod DB**

```
backend/.venv/bin/pytest backend/tests/ -q
```

Expected: all tests passing. **Record the passing count** (e.g., "174 passed") — it's your regression baseline for Task 7 Step 4 and Task 10 Step 1. Any later failure should be caused by the cutover, not a pre-existing issue.

---

## Task 1: Install Supabase CLI

**Files:** none (tool installation)

- [ ] **Step 1: Install via homebrew**

```
brew install supabase/tap/supabase
```

Expected: installation completes cleanly. If `brew` prompts for a tap that's already installed, follow prompts.

- [ ] **Step 2: Verify the installed version**

```
supabase --version
```

Expected: prints a version number like `1.XXX.X` (exact minor version doesn't matter — any current 1.x or 2.x release is fine). **Record the exact version string you see** — you'll write it into CLAUDE.md in Task 8.

If the command isn't found, verify homebrew's bin directory is in `$PATH` and re-open the shell if needed.

---

## Task 2: Initialize the supabase/ directory

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/` (empty)
- Create: `supabase/seed.sql` (empty)

- [ ] **Step 1: Run `supabase init`**

```
supabase init
```

The CLI may ask whether you want to generate VS Code settings or IntelliJ settings — decline both unless you use them. It may also ask about Deno linting for Edge Functions — decline (no Edge Functions in this project).

Expected: new `supabase/` directory created at the repo root with `config.toml`, an empty `migrations/` directory, and a `seed.sql` file.

- [ ] **Step 2: Verify the created structure**

```
ls supabase/
```

Expected output includes at least: `config.toml`, `migrations`, `seed.sql`.

- [ ] **Step 3: Do NOT commit yet**

We'll commit the whole cutover as one atomic commit at the end. Leave these files staged for now.

---

## Task 3: Link to the prod Supabase project

**Files:** none (writes to `.supabase/`, which is gitignored by default)

- [ ] **Step 1: Find the prod project ref**

The project ref is the first component of the Supabase URL. Read it from `backend/.env`:

```
grep SUPABASE_URL backend/.env
```

Expected: a line like `SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co`. The project ref is the `xxxxxxxxxxxxxxxxxxxx` part.

- [ ] **Step 2: Run `supabase link`**

Replace `<ref>` with the project ref from step 1:

```
supabase link --project-ref <ref>
```

The CLI will prompt for the database password. Get it from the Supabase dashboard: Project Settings → Database → Connection string → reveal password. (Or skip the password entry by pressing enter — `db pull` will prompt again.)

Expected: `Finished supabase link.` or similar success message. This step has no remote side effects — only local state in `.supabase/` is written.

- [ ] **Step 3: Confirm the link succeeded**

```
supabase projects list
```

Expected: your project appears in the list. If the command errors with "not logged in," run `supabase login` first, then retry.

---

## Task 4: Pull the baseline schema from prod

**Files:**
- Create: `supabase/migrations/<timestamp>_remote_schema.sql` (auto-generated)

- [ ] **Step 1: Run `supabase db pull`**

```
supabase db pull
```

Expected: the CLI connects to the remote database, introspects the schema, and writes a new file at `supabase/migrations/<timestamp>_remote_schema.sql`. The timestamp will be the current UTC time, e.g., `20260410230000_remote_schema.sql`.

If the CLI prompts for a database password, enter it (see Task 3 Step 2).

- [ ] **Step 2: Find the generated filename and record the version**

```
ls supabase/migrations/
```

Expected: one file, e.g., `20260410230000_remote_schema.sql`. **Record the timestamp prefix** — you'll use it as `<baseline-version>` in Task 6.

- [ ] **Step 3: DO NOT run `supabase db push`**

`db push` would try to apply the baseline file to the remote database, which already has the schema. Skip it entirely. We go straight from `db pull` → verify → `migration repair`.

---

## Task 5: Verify the baseline is complete

**Files:**
- Inspect: `supabase/migrations/<timestamp>_remote_schema.sql`

This is the one manual judgment step. The goal is to confirm the pulled file represents the full current prod schema. `supabase db pull` is usually correct but can miss edge cases.

- [ ] **Step 1: Open the baseline file and skim it end to end**

Read the entire pulled file. It should be a few hundred lines of SQL covering CREATE TABLE statements, constraints, RLS policies, and any custom functions.

```
wc -l supabase/migrations/*.sql
cat supabase/migrations/*.sql
```

Expected: reasonable length (100-500 lines). No "ERROR" or "WARNING" text in the file.

- [ ] **Step 2: Checklist — all 9 tables exist in the baseline**

The baseline should contain a `CREATE TABLE` statement for each of these public-schema tables:

1. `public.album_metadata`
2. `public.collections`
3. `public.collection_albums`
4. `public.library_cache`
5. `public.library_snapshots`
6. `public.play_history`
7. `public.invite_codes`
8. `public.profiles`
9. `public.music_tokens`

Search the file:

```
grep -E "CREATE TABLE (public\.)?(album_metadata|collections|collection_albums|library_cache|library_snapshots|play_history|invite_codes|profiles|music_tokens)" supabase/migrations/*.sql
```

Expected: 9 matching lines, one per table. If any are missing, STOP — the baseline is incomplete and needs manual repair.

- [ ] **Step 3: Checklist — RLS is enabled on all 9 tables**

```
grep -E "ENABLE ROW LEVEL SECURITY" supabase/migrations/*.sql
```

Expected: at least 9 matches (one per table). If fewer, check which tables are missing. If any public table has `rls_enabled: true` via the MCP but the baseline doesn't have `ENABLE ROW LEVEL SECURITY` for it, add the statement manually to the baseline file before continuing.

- [ ] **Step 4: Cross-reference with MCP for column-level sanity**

Use the Supabase MCP to fetch verbose table info:

```
mcp__supabase__list_tables schemas=["public"] verbose=true
```

For each table, spot-check that the columns shown by the MCP appear in the corresponding `CREATE TABLE` block in the baseline file. You don't need to verify every column — a spot check on 2-3 tables is sufficient.

- [ ] **Step 5: Checklist — at least one RLS policy per table**

Policies are expressed as `CREATE POLICY` statements. Search the baseline:

```
grep -c "CREATE POLICY" supabase/migrations/*.sql
```

Expected: at least 9 (typically 10-20 for Crate, since some tables have multiple policies for SELECT/INSERT/UPDATE/DELETE). If zero or very few, RLS policies were dropped by the pull — STOP and investigate.

- [ ] **Step 6: Final judgment call — does the baseline look right?**

If all five checks pass, proceed to Task 6. If any check flagged something missing, manually edit the baseline file to add what's missing (look up the missing piece in `backend/migrations/` before deleting those files, or use the MCP to introspect the remote directly).

---

## Task 6: Mark the baseline as already applied on remote

**Files:** none (writes one row to `supabase_migrations.schema_migrations` on remote)

- [ ] **Step 1: Run `supabase migration repair`**

Replace `<baseline-version>` with the timestamp from Task 4 Step 2 (the numeric prefix of the baseline filename, e.g., `20260410230000`):

```
supabase migration repair --status applied <baseline-version>
```

Expected: a success message like `Repaired migration <version>`. The command writes one row to the remote `supabase_migrations.schema_migrations` table saying "this version is considered applied."

- [ ] **Step 2: Verify the repair worked**

Use the Supabase MCP to list migrations:

```
mcp__supabase__list_migrations
```

Expected: the response now includes your baseline version alongside the three pre-existing entries (`20260405045207`, `20260410004630`, `20260410011041`). You should see 4 migrations total.

- [ ] **Step 3: Run `supabase migration list` to confirm local + remote are in sync**

```
supabase migration list
```

Expected: the baseline version shows as "applied" both locally and remotely. No warnings about drift or unapplied migrations.

---

## Task 7: Delete the old migration system

**Files:**
- Delete: `backend/migrate.py`
- Delete: `backend/migrations/` (directory and all 10 SQL files)

- [ ] **Step 1: Verify no runtime code imports `migrate.py`**

```
grep -rn "import migrate\|from migrate\|migrate\.py" backend/ --include="*.py"
```

Expected: empty output (the only match — if any — would be inside `migrate.py` itself, which is being deleted). If anything else matches, STOP and investigate; we may have missed an import during the spec phase.

- [ ] **Step 2: Verify `backend/migrations/` isn't referenced at runtime**

```
grep -rn "backend/migrations\|backend\\.migrations" backend/ --include="*.py"
```

Expected: empty output. Documentation references under `docs/plans/` are fine — those are frozen historical records.

- [ ] **Step 3: Delete the files**

```
rm backend/migrate.py
rm -r backend/migrations/
```

- [ ] **Step 4: Run the backend test suite to confirm nothing broke**

```
backend/.venv/bin/pytest backend/tests/ -q
```

Expected: same passing count as the Pre-flight baseline recorded in Pre-flight Step 2. A failure here means a runtime reference was missed — investigate and fix before continuing.

---

## Task 8: Create `supabase/seed.sql` placeholder + update CLAUDE.md

**Files:**
- Modify: `supabase/seed.sql` (overwrite with placeholder comment)
- Modify: `CLAUDE.md` (replace migration workflow section)

- [ ] **Step 1: Overwrite `supabase/seed.sql` with the placeholder**

Replace the entire contents of `supabase/seed.sql` with:

```sql
-- Seed data for Supabase preview branches.
--
-- Supabase branching (configured in sub-project C) creates an isolated
-- database for every PR, with migrations applied but no prod data. That
-- fresh branch needs seed fixtures to smoke-test the UI without a real
-- Spotify sign-in.
--
-- This file is an empty placeholder. Sub-project C will design the
-- fixtures (test user, sample albums, a collection) once the Google
-- OAuth + Spotify redirect shapes are locked in for the preview flow.
```

- [ ] **Step 2: Read the current CLAUDE.md to locate the migration workflow section**

```
grep -n "migrate\|migration" CLAUDE.md
```

Look for any existing section that describes migrations — it may or may not exist. The current `CLAUDE.md` has no explicit migrations section (the old workflow was "just run `python migrate.py <file>`"), so you'll likely be adding a new section rather than replacing one.

- [ ] **Step 3: Add a "Database migrations" section to CLAUDE.md**

Add this section after the "Development approach" section and before the "Conventions" section:

```markdown
## Database migrations

- Migrations live in `supabase/migrations/` as timestamped SQL files
- Managed by the Supabase CLI (`brew install supabase/tap/supabase`)
- Tested with Supabase CLI v<VERSION> (record the version you installed in Task 1)
- To add a new migration: `supabase migration new <descriptive_name>`, edit the generated file, commit
- How migrations get applied to prod: TBD — resolved in sub-project C (Vercel Python + Supabase branching). Until then, ask before applying a new migration.
- Source of truth for what's applied: the remote `supabase_migrations.schema_migrations` table, viewable via the Supabase MCP's `list_migrations` tool

```

Replace `<VERSION>` with the exact version string you recorded in Task 1 Step 2.

- [ ] **Step 4: Verify the file is well-formed markdown**

```
head -60 CLAUDE.md
```

Expected: the new section appears in the right place, headings nest correctly.

---

## Task 9: Commit and push to main

**Files:** all of the above, committed atomically

- [ ] **Step 1: Review the full diff before committing**

```
git status
git diff CLAUDE.md
```

Expected files in the staging area (after `git add`):

- `CLAUDE.md` (modified: new migrations section)
- `supabase/config.toml` (new)
- `supabase/migrations/<timestamp>_remote_schema.sql` (new)
- `supabase/seed.sql` (new)
- `backend/migrate.py` (deleted)
- `backend/migrations/001_initial.sql` through `008_service_agnostic_rename.sql` (all deleted — 10 files)

Any other files (e.g., `.supabase/`) should NOT appear. `.supabase/` is gitignored by default; if it's showing up, add it to `.gitignore` before committing.

- [ ] **Step 2: Stage the changes explicitly**

```
git add CLAUDE.md supabase/ backend/migrate.py backend/migrations/
```

- [ ] **Step 3: Commit with the atomic cutover message**

```
git commit -m "$(cat <<'EOF'
chore(migrations): cut over to Supabase CLI migrations

- Install Supabase CLI (brew install supabase/tap/supabase)
- Run supabase init to create supabase/ directory
- Link to prod project via supabase link
- Generate baseline via supabase db pull
- Mark baseline as applied via supabase migration repair
- Delete backend/migrations/ (10 files) and backend/migrate.py
- Add empty supabase/seed.sql placeholder (fixtures designed in sub-project C)
- Update CLAUDE.md with new migration workflow

No prod schema changes. No runtime code changes beyond deleting
the standalone migrate.py script. Unblocks sub-project C
(Vercel Python + Supabase branching).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push to origin**

```
git push
```

Expected: push succeeds.

---

## Task 10: Post-merge verification

**Files:** none (verification only)

- [ ] **Step 1: Run the backend test suite one more time**

```
backend/.venv/bin/pytest backend/tests/ -q
```

Expected: same passing count as the Pre-flight baseline recorded in Pre-flight Step 2. This is the final sanity check that the cutover didn't break anything downstream.

- [ ] **Step 2: Verify `supabase migration list` still reports correctly**

```
supabase migration list
```

Expected: the baseline version shows as "applied" remotely. No drift warnings.

- [ ] **Step 3: Mark sub-project B complete in BACKLOG.md**

Open `BACKLOG.md` and change:

```
  - [ ] Sub-project B: Supabase CLI migration cutover (spec TBD)
```

to:

```
  - [x] Sub-project B: Supabase CLI migration cutover | [spec](docs/specs/2026-04-10-supabase-cli-migration-cutover-design.md) | [plan](docs/plans/2026-04-10-supabase-cli-migration-cutover.md)
```

Commit directly to main:

```
git add BACKLOG.md
git commit -m "docs: mark prod/dev sub-project B complete"
git push
```

---

## Rollback plan

If the cutover needs to be reverted after the push in Task 9:

1. `git revert <commit-sha>` — restores `backend/migrations/`, `backend/migrate.py`, old `CLAUDE.md`, and removes the new `supabase/` directory.
2. Via Supabase MCP:
   ```
   mcp__supabase__execute_sql "DELETE FROM supabase_migrations.schema_migrations WHERE version = '<baseline-version>'"
   ```
   Removes the `repair` audit row so the remote tracking table is back to the 3 pre-existing entries.
3. `git push` the revert.
4. `rm -r supabase/` locally (if the directory lingers).

Prod schema is unchanged throughout the entire lifecycle, so there's no data rollback needed.
