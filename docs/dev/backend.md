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

The live code is in `src/live/`. `vite.config.ts` writes `__LIVE__` into the build as a literal, so a demo build leaves the live code out and a live build leaves out the seed data and the role switcher. The live gate is small and draws from the copy kept on the device. Sign-in, onboarding and the Supabase client load after it. `npm run check:budget -- --live` (run in CI) counts the gate in the Today budget.

- **Sign-in** (`SignInPage.tsx`): a 6-digit code sent by email, typed into the app. A link would open the browser instead of an installed PWA. The same code creates a new account.
- **Onboarding** (`Onboarding.tsx`): the person's name and two consents, health data and storage in Singapore, written to `consents`. Invitations show here too; accepting an athlete invitation also records `coach_sharing`.
- **Opening** (`LiveGate.tsx`, `account.ts`): with a saved session and a cached account, the app opens at once, also offline, and the session is checked in the background. A sign-out in one tab stops the sync and clears the data in every tab.
- **Guards** (`LiveGate.tsx`): a coach stays on coach pages, a coached athlete on athlete pages. A self-coached athlete opens both, so they can plan their own training. The role picker, `#/brand`, `#/kit` and `#/reset` redirect to the person's home page.
- **Day 0** (`src/app/liveEpoch.ts`): the live app fixes day 0 to Monday 27 July 2026. Day offsets saved in a body never move, so records are stored as the app holds them.

### Sync

`src/live/sync/` keeps the store and the database in step. The store stays the only source for screens.

1. **Diff** (`diff.ts`, `docs.ts`): every store change is compared with the last known state, record by record. Each changed record the person may write becomes an upsert. Each removed one becomes a tombstone (`deleted_at`).
2. **Outbox** (`outbox.ts`, `idbOutbox.ts`): writes wait in IndexedDB, one queue per account. A newer write to a row replaces the older one. Writes are upserts keyed on the record's own id, so sending one twice is harmless. Nothing is saved, sent or pulled until the saved queue has been read, so an early write never replaces it and a pull never hides an unsent change. If the queue cannot be read or saved, the app says the changes are not safe on this device (`syncStatus.ts`, `unsaved`). A tab keeps one outbox per account for all its syncs, and sends one batch at a time. Every save reads the queue in IndexedDB and applies this tab's changes to it in one transaction (add these writes; remove exactly the writes that were sent), so two tabs of one account never save over each other's writes, and each sends what the other queued.
3. **Send and pull** (`engine.ts`, `supabaseBackend.ts`): a sync sends the queue in order, then pulls. The first pull of a visit reads every row. Later pulls start 30 seconds before the server's time when the last pull began (`server_now()`), never from the newest row seen: `updated_at` is the time a write began, so a write can become visible after rows stamped later were read, also during a long paged pull. The 30 seconds stay above the 8-second statement timeout the migration sets for the `authenticated` role, the longest a write through the API can take. Rows read again unchanged are skipped. Pages follow the full key `(updated_at, owner, id)`. A queued write wins over the server's copy of its row. A sync that is stopped (sign-out, another account) sends and reads nothing more. Syncs run after a change, on `online`, when the app comes back into view, and every 60 seconds. After a failure they back off up to 5 minutes.
4. **Derived data**: after a pull, matches, flags and badges are worked out again for the athletes whose rows changed. Each person then sends only what they own. For example, a coach's device steps the flag rules and sends `flag_states`.

A write the access rules refuse is dropped and reported, and the others in its batch are still sent. The next pull restores the server's copy. Original activity files wait in IndexedDB until they reach the bucket (`files.ts`). Only the signed-in account's files are sent, and a file imported again during an upload replaces the old one instead of being lost.

An athlete's AI switch is also written to `consents` (`aiConsent.ts`): one account's changes go one after another, each row names its account, and a change that failed is tried again when the device is back online, after reading the server's answer again. Nothing is recorded before the account's settings have reached the device, so a new device never writes a withdrawal by itself.

## AI

Rules decide what a summary says, and a model only rewrites the wording. The weekly recap and the check-in summary are worked out on the device, as in the demo (`src/ai/simulate.ts`). The live app shows that text at once, labelled "Rule-based summary". It then asks the `ai` Edge Function to reword it. Next-week suggestions stay rule-based, because a model never changes a plan.

The `ai` function (`supabase/functions/ai/`):

1. Checks the caller's token and `ai_allowed(athlete)`.
2. Takes a place in the person's allowance of 40 requests per 24 hours before it calls any provider (`reserve_ai_run`, one step under a lock, so two requests cannot share the last place). A request counts whether or not a provider answers.
3. Sends only the draft headline and lines: no names, notes, files or raw check-ins.
4. Tries each provider in `AI_PROVIDERS` in turn, moving on after a rate limit, an error or a 20-second timeout. A provider whose address is not HTTPS is skipped, and redirects are refused, so a key or a draft never travels in the clear.
5. Refuses any reply it cannot verify (`check.ts`) and tries the next provider. The reply must have the draft's lines, one for one, and each line must state the same numbers as the draft's line, with their signs and units: none added, dropped, moved or swapped ("60 km" is refused when the draft says "12 km" and "60 minutes"). The words that say what a number measures (resting, maximum, sleep, load, the sport, the day, up or down, and the like) must stay, none added or dropped, so "resting heart rate 60 bpm" cannot become "maximum heart rate 60 bpm". A line with two different values of the same kind, such as two heart rates, must come back word for word, because a swap there cannot be seen from the numbers. In a line with several values and several such words, their order must stay, since only the order says which word goes with which number.
6. Records the provider, model, outcome and token counts, never the text, in the request's `ai_runs` row.

Providers are any OpenAI-compatible API. The default chain uses free tiers listed in [awesome-free-llm-apis](https://github.com/mnfst/awesome-free-llm-apis): OpenRouter, then Groq, then Google Gemini. Each provider needs its own key, from that provider's own site. Set the chain without a deploy:

```bash
npx supabase secrets set OPENROUTER_API_KEY=... GROQ_API_KEY=... GEMINI_API_KEY=...
```

```bash
npx supabase secrets set AI_PROVIDERS='[{"name":"OpenRouter","baseUrl":"https://openrouter.ai/api/v1","model":"meta-llama/llama-3.3-70b-instruct:free","keyEnv":"OPENROUTER_API_KEY"}]'
```

Free models come and go. If one stops answering, change its `model`. A provider without a key is skipped. With no keys at all, the app keeps the rule-based text.

For a mock provider on your own machine only, `AI_ALLOW_LOCAL_HTTP=1` lets a `http://localhost` address through. Never set it on a hosted project.

## Privacy

- `#/privacy` explains, in plain English, what is kept, why, who sees it, where it is stored, what AI receives and the person's rights. The Malay version and a lawyer's review are owner follow-ups.
- **Download my data** (Account, in Me or Settings): one JSON file with the profile, consents, coach links, the names of activity files and every record the person owns. A coach's athletes' records belong to the athletes and are left out.
- **Delete my account**: the `delete-account` Edge Function removes the person's activity files, then their auth user. Every row they own goes with it. A coach's athletes keep their own data. The device then stops the sync, removes its unsent changes, waiting files and AI wording, and signs out. If something could not be removed from the device, the sign-in screen says so.
- **Download my data** waits until the device's own changes have been sent, so the file is never missing them.

## Local development

Needs Docker.

| Script | What it does |
|---|---|
| `npm run db:start` | Starts a local Supabase with the services Laree uses and applies the migrations. Prints the local URL and keys. |
| `npm run db:test` | Runs the pgTAP access tests in `supabase/tests/`. |
| `npm run db:reset` | Rebuilds the local database from the migrations. |
| `npm run check:api-timeout` | Checks, through the local API, that a statement is cancelled after 8 seconds. The sync relies on that bound. |
| `npm run check:backup` | Backs up the local stack with `scripts/backup.sh`, including a file replaced during the dump, restores the file with `scripts/restore-files.sh`, and checks that both scripts refuse unsafe addresses. |
| `npm run db:stop` | Stops the local stack. |

For a live build against the local stack, copy `.env.example` to `.env.local` and fill in the local URL and publishable key.

The hosted project has applied `20261115000000_init.sql`: change the schema only with a new migration file from now on. Every migration change needs a matching test in `supabase/tests/database/`. A migration that adds a function in `public` must revoke `execute` from `public`, `anon` and `authenticated` and grant it back to the roles that need it: PostgreSQL lets everyone call a new function. The tests list the functions each role can call. The key test signs in as a second coach and checks that every table returns zero rows of the first coach's athletes.
