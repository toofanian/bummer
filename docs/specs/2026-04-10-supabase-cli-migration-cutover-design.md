# Supabase CLI Migration Cutover — Design Spec

**Status:** Draft
**Date:** 2026-04-10
**Sub-project:** B (of 3, part of the prod/dev environment initiative)
**Depends on:** Nothing
**Blocks:** Sub-project C (Vercel Python hosting + Supabase branching)

## Context

Crate currently manages database schema changes through a home-grown `backend/migrate.py` script — a 34-line tool that POSTs raw SQL files to Supabase's management API via HTTPS. It has no state tracking (no `_migrations_applied` table), no ordering enforcement, and no way to know which files have been run. Migrations live in `backend/migrations/` as ten ad-hoc timestamped SQL files (with at least two filename collisions: two `002_*` files, two `004_*` files).

More recently, three migrations have been applied via the Supabase MCP tool's `apply_migration` method, which does track state in the built-in `supabase_migrations.schema_migrations` table. The result is a split history: migrate.py applied the first eight migrations with no tracking; the MCP tool applied the last three with tracking. The current prod schema reflects all of them, but only three have audit rows.

Sub-project C (Vercel Python hosting + Supabase branching) requires canonical Supabase CLI-format migrations. Supabase branching — the per-PR preview database automation — only works when migrations live in `supabase/migrations/` and are managed by the Supabase CLI. This cutover is a prerequisite for C; it touches no runtime code and produces no user-visible change, but it moves the project onto a migration system that the rest of the Supabase ecosystem (CLI, GitHub integration, branching, seed.sql, config.toml) is built around.

## Goals

- Move schema migration management from `backend/migrate.py` to Supabase CLI-managed files in `supabase/migrations/`.
- Generate a single baseline migration file that represents the current prod schema, so future migrations layer on top.
- Mark the baseline as already applied on the remote Supabase project so `supabase migration up` is a no-op for current state.
- Delete `backend/migrations/` and `backend/migrate.py` entirely, with no runtime code impact.
- Create `supabase/seed.sql` as an empty placeholder file so the directory structure is complete; actual fixture contents are designed in sub-project C.
- Update `CLAUDE.md` to document the new migration workflow (how to add a migration, how tracking works, where files live).
- Zero changes to prod schema, prod data, or backend runtime code.
- Ship as a direct merge to `main` per the current one-person-show workflow (pre-sub-project-C).

## Non-goals

- **No Supabase local dev environment.** `supabase start` requires Docker and is not needed for this sub-project. Deferred to C.
- **No Supabase branching configuration.** Enabling branching, wiring the GitHub integration, and installing the Vercel integration are all sub-project C work.
- **No real seed data.** The `supabase/seed.sql` file is an empty placeholder in this sub-project. Designing meaningful fixtures (test user, sample albums, a collection) happens in C when we know what a preview branch needs to smoke-test against the new OAuth clients.
- **No historical migration files preserved individually.** The user explicitly chose "clean slate" over "preserve history" during brainstorming. The original ten files in `backend/migrations/` remain in git history for anyone who needs to look up a specific past change; we do not replay them as per-file migrations.
- **No backend runtime code changes.** Zero edits to `.py` files outside of deleting `backend/migrate.py` itself.
- **No changes to the three existing Supabase-tracked migrations.** `20260405045207` (multi_user_pivot), `20260410004630` (service_agnostic_rename), and `20260410011041` (drop_invite_codes_redeemed_by) stay recorded in `supabase_migrations.schema_migrations` as historical records. The new baseline coexists alongside them.

## Design

### Overview

The Supabase CLI supports importing an existing remote project's schema into a fresh `supabase/` directory. The standard path is:

1. Install the CLI.
2. `supabase init` creates an empty `supabase/` directory structure locally.
3. `supabase link --project-ref <ref>` associates the local directory with the remote project.
4. `supabase db pull` introspects the remote schema and writes a single SQL file representing the entire current state (tables, columns, constraints, indexes, RLS policies, triggers, functions, installed extensions).
5. Manual verification that the pulled file matches reality.
6. `supabase migration repair --status applied <version>` writes a row to `supabase_migrations.schema_migrations` marking the baseline as already-applied, so future `supabase migration up` calls won't try to re-run it against a schema that already exists.
7. Old files (`backend/migrations/`, `backend/migrate.py`) are deleted.
8. `supabase/seed.sql` is created as an empty placeholder.
9. `CLAUDE.md` is updated.
10. Everything is committed and pushed to `main` in one PR-less merge.

The entire cutover is read-mostly from prod's perspective: the only write to the remote is the single `INSERT` into `supabase_migrations.schema_migrations` that `migration repair` performs. No schema is altered, no data is modified, no existing rows are affected.

### Detailed step walkthrough

#### Step 1: Install Supabase CLI

```bash
brew install supabase/tap/supabase
supabase --version
```

No Docker required. Verify the version is 1.x or newer (any current-era version works for `link`, `db pull`, and `migration repair`).

The installed version should be pinned in `CLAUDE.md` so future contributors reproduce the same behavior. A specific pin is not strictly required — the commands used here are stable CLI surface — but documenting "tested with Supabase CLI v1.X" prevents surprise regressions.

#### Step 2: Initialize the `supabase/` directory

```bash
supabase init
```

This creates:

```
supabase/
├── config.toml      # project config (branching, auth, storage, etc.)
├── migrations/      # empty directory
└── seed.sql         # empty file
```

`config.toml` is created with default values. For sub-project B we leave it mostly as-is, with one small change noted in step 8. Sub-project C will revisit this file for branching + auth settings.

#### Step 3: Link to the remote Supabase project

```bash
supabase link --project-ref <prod-project-ref>
```

`<prod-project-ref>` is the first component of the Supabase URL (`https://<ref>.supabase.co`), extractable from `backend/.env`'s `SUPABASE_URL`. This writes the project ref to `.supabase/` (local config, gitignored by default) so subsequent CLI commands know which remote to target.

`supabase link` has no remote side effects. It's a local state change.

#### Step 4: Pull the baseline schema from remote

```bash
supabase db pull
```

This command:
1. Connects to the remote database (read-only query path)
2. Introspects the schema (tables, columns, constraints, indexes, triggers, functions, RLS policies, enabled extensions)
3. Writes a single SQL file to `supabase/migrations/<timestamp>_remote_schema.sql`
4. Generates a version timestamp automatically

The file will contain SQL that, if run against an empty database, recreates the current prod schema from scratch. It does NOT contain data — only structure.

No writes to the remote during this step.

#### Step 5: Verify the baseline is complete

This is the critical manual step. `supabase db pull` is usually correct, but it can occasionally miss or mis-serialize:
- Custom pg functions not in standard schemas
- RLS policies with complex subqueries
- Extensions enabled via `CREATE EXTENSION` outside of standard namespaces
- View definitions
- Trigger functions

Verification procedure:

1. **Read the generated file end to end.** It should be reasonably short (a few hundred lines for Crate's 9 tables).

2. **Checklist against MCP introspection.** Run:
   ```
   mcp__supabase__list_tables schemas=["public"] verbose=true
   ```
   For each table returned, confirm the baseline file has:
   - `CREATE TABLE public.<name>` with all columns from the MCP response
   - Primary key constraint
   - Any foreign key constraints
   - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` if the MCP shows `rls_enabled: true`

3. **Checklist against old migration files.** For each file in `backend/migrations/`, confirm its end-state effect exists somewhere in the baseline. This is a "final state matches" check, not a replay.

4. **RLS policy spot-check.** For each table with RLS enabled, confirm at least one policy exists in the baseline. Crate relies heavily on RLS, so losing a policy silently would be bad.

5. **If anything is missing:** either manually edit the baseline file to add the missing piece, or investigate why `db pull` didn't capture it. Re-pull if necessary.

The baseline does not need to be byte-identical to the sum of the old files — it just needs to be *semantically correct* against current prod state. Formatting differences (column ordering within `CREATE TABLE`, comment positions, etc.) are fine.

#### Step 6: Mark the baseline as applied on remote

```bash
supabase migration repair --status applied <baseline-version>
```

`<baseline-version>` is the timestamp from the filename of the baseline migration file (e.g., if the file is `20260410200000_remote_schema.sql`, the version is `20260410200000`).

This command writes a single row to `supabase_migrations.schema_migrations` on the remote:

```sql
INSERT INTO supabase_migrations.schema_migrations (version, name, ...)
VALUES ('<baseline-version>', 'remote_schema', ...);
```

No schema changes. The row tells the Supabase CLI "this version is considered already applied; do not try to run it." Subsequent `supabase migration up` calls will skip the baseline and only apply any newer migrations layered on top.

The three pre-existing tracked migrations (`20260405045207`, `20260410004630`, `20260410011041`) stay in the table as historical records. Their presence causes no problems — Supabase CLI treats any row in `schema_migrations` as "applied."

#### Step 7: Delete the old migration system

```bash
rm -r backend/migrations/
rm backend/migrate.py
```

Verified during brainstorming that no runtime code imports `migrate.py` — it's a standalone CLI script. The only other references to `backend/migrations/` are in frozen historical plan docs under `docs/plans/` and a self-reference header comment inside one of the SQL files being deleted. Safe to remove entirely.

Git history preserves both the script and every old SQL file for anyone who later needs to look up a specific past change.

#### Step 8: Create `supabase/seed.sql` placeholder

Overwrite the auto-generated empty `supabase/seed.sql` with a commented placeholder:

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

Deferring actual fixture design to sub-project C is intentional: the fixtures need to match C's decisions about test users, OAuth redirects, and preview-vs-prod isolation. Designing them now would just be rework.

#### Step 9: Update CLAUDE.md

Update the top-level `CLAUDE.md` (or `backend/CLAUDE.md` if present) to document the new migration workflow. Specifically:

- **Remove** any existing text that describes `migrate.py`, `backend/migrations/`, or running SQL via `python migrate.py <file>`.
- **Add** a "Database migrations" section with:
  - Where migrations live: `supabase/migrations/`
  - How to add a new migration: `supabase migration new <descriptive_name>` → edit the generated file → commit
  - How to apply to prod: (deferred answer — resolved in sub-project C; for now, document that it's TBD)
  - How tracking works: the remote `supabase_migrations.schema_migrations` table is the source of truth
  - Required tool: Supabase CLI — the plan records the actual version installed during cutover (e.g., "tested with Supabase CLI v1.200.0") so future contributors can reproduce it.

"How to apply to prod" is intentionally left as an open question in this sub-project — the answer depends on whether C uses GitHub integration (migrations auto-apply on PR merge) or manual `supabase db push` (run from local). We write "TBD — resolved in sub-project C" so nobody gets confused reading the doc before C ships.

#### Step 10: Commit and push to main

Direct merge to main per the current one-person workflow. Single commit:

```
chore(migrations): cut over to Supabase CLI migrations

- Install Supabase CLI (brew install supabase/tap/supabase)
- Run `supabase init` to create supabase/ directory
- Link to prod project via `supabase link`
- Generate baseline via `supabase db pull`
- Mark baseline as applied via `supabase migration repair --status applied`
- Delete backend/migrations/ (10 files) and backend/migrate.py
- Add empty supabase/seed.sql placeholder (fixtures designed in C)
- Update CLAUDE.md with new migration workflow

No prod schema changes. No runtime code changes beyond deleting
the standalone migrate.py script. Unblocks sub-project C
(Vercel Python + Supabase branching).
```

### Files touched

- **Created**: `supabase/` directory (entirely new), containing `config.toml`, `migrations/<baseline>.sql`, `seed.sql`
- **Deleted**: `backend/migrate.py`, `backend/migrations/` (directory and all 10 SQL files within it)
- **Modified**: `CLAUDE.md` (replace migrate.py workflow section with Supabase CLI workflow section)

Net: ~11 files deleted, 3 files created, 1 file edited. No `.py` runtime code touched.

### Testing strategy

This sub-project has no automated tests. It's a one-time infra cutover that touches no runtime code paths.

Verification is manual (step 5 baseline verification) plus the regression test of running the existing test suite against the same prod database to confirm nothing downstream broke:

```bash
backend/.venv/bin/pytest backend/tests/
```

Expected: 174 tests passing (current baseline). If any test fails, either the cutover broke something or the test was already flaky — investigate.

There are no new unit tests to write because there's no new code. The "test" for this refactor is: "Does the existing code still work against the same database?" Yes → done.

## Risks and mitigations

### Accepted risks

- **`supabase db pull` produces semantically-different SQL from the original migrations.** Column ordering, trigger formatting, extension statement placement, etc. The baseline only has to be correct against current prod state, not byte-identical to the old files. Accepted.

### Mitigated risks

- **`db pull` misses RLS policies, triggers, or custom functions.** Mitigated by step 5's manual verification checklist (read the file end to end, cross-reference MCP introspection, cross-reference old migration files). If anything is missing, add it manually to the baseline file before running `repair`.
- **User accidentally runs `supabase db push` before `migration repair`.** This would try to re-apply the baseline against a schema where those tables already exist, resulting in errors. Mitigated by plan wording: the plan will make the order explicit with an inline "DO NOT run `db push` yet" warning between steps 4 and 6.
- **`supabase migration repair` marks the wrong version.** Mitigated by the fact that `repair` is idempotent and reversible: if you passed a wrong version, you can pass the right one, then `DELETE FROM supabase_migrations.schema_migrations WHERE version = '<wrong>'` via MCP to clean up.
- **Supabase CLI version regression.** Mitigated by pinning the tested version in `CLAUDE.md`. If `brew upgrade` later breaks this workflow, a fresh contributor can install the pinned version instead.

### Unmitigated risks

None that I can identify. The cutover is small, read-mostly on prod, and fully reversible via `git revert` + a single `DELETE` on the remote `schema_migrations` table.

## Rollback plan

If anything goes wrong after the commit is pushed to `main`:

1. `git revert <commit-sha>` — restores `backend/migrations/`, `backend/migrate.py`, old `CLAUDE.md`, and removes the new `supabase/` directory.
2. Via Supabase MCP: `DELETE FROM supabase_migrations.schema_migrations WHERE version = '<baseline-version>'` — removes the `repair` audit row.
3. Push the revert to `main`.

Prod schema is unchanged throughout the entire lifecycle, so there's no data rollback to worry about.

## Open questions

None at spec-approval time. All design questions were resolved during brainstorming.

## Appendix: relationship to sub-projects A and C

- **Sub-project A (library sync serverless refactor)**: already shipped. Independent of B. No interaction.
- **Sub-project B (this spec)**: prerequisite for C. Touches migration management only.
- **Sub-project C (Vercel Python + Supabase branching)**: requires B to be complete because Supabase branching only works with CLI-format migrations in `supabase/migrations/`. C will additionally configure `supabase/config.toml` for branching, install the Supabase-Vercel integration, design real seed.sql fixtures, and set up the GitHub integration for per-PR preview branches.
