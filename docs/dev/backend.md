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

## The live app

The live code is in `src/live/` and loads as its own chunk after the first paint, so the demo and the Today budget never carry the Supabase client.

- **Sign-in** (`SignInPage.tsx`): a 6-digit code sent by email, typed into the app. A link would open the browser instead of an installed PWA. The same code creates a new account.
- **Onboarding** (`Onboarding.tsx`): the person's name and two consents, health data and storage in Singapore, written to `consents`. Invitations show here too; accepting an athlete invitation also records `coach_sharing`.
- **Guards** (`LiveGate.tsx`): a coach stays on coach pages, a coached athlete on athlete pages. A self-coached athlete opens both, so they can plan their own training. The role picker, `#/brand`, `#/kit` and `#/reset` redirect to the person's home page.
- **Day 0** (`src/app/liveEpoch.ts`): the live app fixes day 0 to Monday 27 July 2026. Day offsets saved in a body never move, so records are stored as the app holds them.

### Sync

`src/live/sync/` keeps the store and the database in step. The store stays the only source for screens.

1. **Diff** (`diff.ts`, `docs.ts`): every store change is compared with the last known state, record by record. Each changed record the person may write becomes an upsert. Each removed one becomes a tombstone (`deleted_at`).
2. **Outbox** (`outbox.ts`, `idbOutbox.ts`): writes wait in IndexedDB, one queue per account. A newer write to a row replaces the older one. Writes are upserts keyed on the record's own id, so sending one twice is harmless.
3. **Send and pull** (`engine.ts`): a sync sends the queue in order, then pulls. The first pull of a visit reads every row. Later pulls read only rows changed since. A queued write wins over the server's copy of its row. Syncs run after a change, on `online`, when the app comes back into view, and every 60 seconds. After a failure they back off up to 5 minutes.
4. **Derived data**: after a pull, matches, flags and badges are worked out again for the athletes whose rows changed. Each person then sends only what they own. For example, a coach's device steps the flag rules and sends `flag_states`.

A write the access rules refuse is dropped and reported. The next pull restores the server's copy. Original activity files wait in IndexedDB until they reach the bucket (`files.ts`).

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
