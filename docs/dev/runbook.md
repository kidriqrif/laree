# Runbook

Day-to-day running of the live app. How it works: [backend.md](backend.md).

## Where things are

| Part | Where | Free-tier limits worth knowing |
|---|---|---|
| Frontend | Vercel project `laree`, built from `main` | Hobby plan: personal, non-commercial use |
| Database, auth, files, functions | Supabase project `laree`, region `ap-southeast-1` (Singapore) | Pauses after 7 days without requests (the keep-alive prevents it). No backups (the nightly dump covers it). 500 MB database, 1 GB files. |
| Demo | GitHub Pages, built from `main` | None |

## Settings to keep in place

**Vercel, Environment Variables (Production and Preview):**

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

**GitHub, Settings, Secrets and variables, Actions:**

| Name | Kind | Used by |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | secret | `supabase-deploy.yml` |
| `SUPABASE_DB_PASSWORD` | secret | `supabase-deploy.yml` |
| `SUPABASE_DB_URL` | secret, the session pooler connection string | `backup.yml` |
| `SUPABASE_PROJECT_REF` | variable | `supabase-deploy.yml` |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | variables | `keepalive.yml` |
| `BACKUP_AGE_RECIPIENT` | variable, your age public key (`age1…`) | `backup.yml` |

The deploy and backup jobs use a GitHub environment named `production`. Add the secrets there, or at repository level.

**Supabase, Edge Function secrets** (`npx supabase secrets set NAME=value`):

| Name | What |
|---|---|
| `APP_ORIGIN` | The Vercel URL, so functions answer only the app (CORS) |
| `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY` | AI provider keys. Any subset works. |
| `AI_PROVIDERS` | Optional: the provider chain as JSON (backend.md, "AI") |

**Supabase, Authentication:** the site URL and redirect URLs are the Vercel URL. The email templates "Magic link" and "Confirm signup" carry `{{ .Token }}` (copy `supabase/templates/sign-in.html`). OTP expiry is 600 seconds.

**Email:** Supabase's built-in email sends only to the project's team members, a few per hour. Before inviting anyone else, add custom SMTP under Authentication, SMTP settings. A free tier of an email service is enough for a small team. Brevo, for example, allows 300 emails a day. Use a sender address you own.

## Common jobs

**Make someone a coach.** In the SQL editor:

```sql
insert into public.invitations (email, role) values ('coach@example.com', 'coach');
```

They sign in, then accept the invitation on the screen that follows.

**Change a plan.** Coaches are always premium. For a self-coached athlete:

```sql
update public.profiles set plan = 'premium' where id = (select id from auth.users where email = 'athlete@example.com');
```

**See what broke.** `select * from public.client_errors order by at desc limit 50;`

**See AI use and cost.** `select provider, model, status, count(*), sum(input_tokens), sum(output_tokens) from public.ai_runs where created_at > now() - interval '7 days' group by 1, 2, 3;`

**Deploy a database change.** Add a migration in `supabase/migrations/` with a pgTAP test. Merge to `main`, and `supabase-deploy.yml` pushes it and redeploys the functions.

## Restore a backup

1. Download the newest `laree-backup` artifact from the "Nightly backup" workflow run.
2. Decrypt it with your age key: `age -d -i key.txt laree-YYYY-MM-DD.tar.gz.age | tar -xz`
3. Into an empty project, apply `dump/schema.sql`, then `dump/data.sql`, with `psql` and the new project's connection string.
4. Point Vercel's `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` at the new project and redeploy.

Keep the age private key somewhere safe and offline. Without it the backups cannot be read.

## Rotate a key

- **AI provider key:** create a new key on the provider's site, set it with `supabase secrets set`, then revoke the old one.
- **Supabase secret (service role) key:** create a new secret key under Settings, API keys. Functions read it from the platform, so nothing else changes. Then delete the old key.
- **Database password:** reset it under Settings, Database. Update `SUPABASE_DB_PASSWORD` and `SUPABASE_DB_URL` in GitHub.

## If data leaks

1. Contain the leak. Revoke the key or token involved. If the cause is unclear, pause the project under Settings, General.
2. Find the cause. `audit_log` shows who changed which row and when. Supabase logs show requests.
3. Under Malaysia's PDPA, as amended in 2024, notify the Personal Data Protection Commissioner as soon as practicable, within 72 hours. Tell the affected people without undue delay if the breach could cause them significant harm. A lawyer should confirm the current rules.
4. Fix the cause, add a pgTAP test that would have caught it, and write down what happened.

## Owner follow-ups

- The Malay privacy notice, and a lawyer's review of the notice and the consent wording.
- Custom SMTP for sign-in emails.
- A custom domain for the app.
- Billing for premium, if it is ever sold. Today the owner sets plans by hand.
