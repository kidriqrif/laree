# Backend

The live app runs on Supabase (Postgres, auth, storage and Edge Functions, in Singapore) with the frontend on Vercel. The demo on GitHub Pages has no backend. A build is live only when `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are set (`src/app/mode.ts`).

The plan behind this page is [docs/roadmap/mvp.md](../roadmap/mvp.md). Where this page differs, this page describes what is built.

## Tiers

Every profile has a plan, `free` or `premium`. Users cannot change it; the owner sets it (see the runbook).

- A coach is always premium. The database refuses a coach on the free plan.
- A coached athlete gets AI only when their coach turns on "AI access" for them.
- A self-coached athlete (no active coach) gets AI only on the premium plan.
- Every athlete must also give their own AI consent. Without it, nothing is sent.

`public.ai_allowed(athlete)` holds this rule. The `ai` Edge Function checks it before every call.

## Data model

People and links are plain tables:

| Table | What it holds | Who writes |
|---|---|---|
| `profiles` | Role, plan, name, sports, baselines | The person, except `role` and `plan` |
| `coach_athletes` | Coach-athlete links, one active coach per athlete, and the AI grant | Created by accepting an invitation. The coach changes `ai_access`. Either side can end a link. |
| `invitations` | A coach's invitation to an email address | The coach. The invitee accepts with `accept_invitation(id)`. |
| `consents` | Every consent answer, append-only | The person, insert only |

Training records are **synced documents**. Each row has typed key columns (`athlete_id` or `owner_id`, `id`, `day`, `updated_at`, `deleted_at`) and a `body` jsonb holding the app's own record with real dates. A deletion sets `deleted_at`, so other devices learn of it.

| Writer | Tables |
|---|---|
| The athlete | `activities`, `check_ins`, `check_in_skips`, `badges`, `badge_seen` |
| The planner: the active coach, or a self-coached athlete | `planned_workouts`, `races`, `phases`, `thresholds`, `excuses`, `activity_notes`, `flag_states` |
| Both | `kudos` (the coach sends, the athlete marks seen) |
| The owner only | `workout_templates`, `settings` (the coach can read an athlete's settings) |

Reading an athlete's rows needs `can_read_athlete`: the athlete themself or their active coach. A trigger stamps `updated_at` and `updated_by` with server values and writes an `audit_log` row (who, what, which row, never the body).

Activity files go in the private `activity-files` bucket at `{athlete_id}/{activity_id}.{ext}`. Only the athlete uploads. Their coach can read.

Retention: `ai_runs` 90 days, `client_errors` 30 days, `audit_log` 1 year, purged nightly by `pg_cron`.

## Local development

Needs Docker.

| Script | What it does |
|---|---|
| `npm run db:start` | Starts a local Supabase with the services Laree uses and applies the migrations. Prints the local URL and keys. |
| `npm run db:test` | Runs the pgTAP access tests in `supabase/tests/`. |
| `npm run db:reset` | Rebuilds the local database from the migrations. |
| `npm run db:stop` | Stops the local stack. |

For a live build against the local stack, copy `.env.example` to `.env.local` and fill in the local URL and publishable key.

Every migration change needs a matching test in `supabase/tests/database/`. The key test signs in as a second coach and checks that every table returns zero rows of the first coach's athletes.
