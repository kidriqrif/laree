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
| `SUPABASE_SECRET_KEY` | secret, the project's secret (service role) key | `backup.yml`, to read the private file bucket |
| `SUPABASE_PROJECT_REF` | variable, optional: the workflows default to `lqxvjonypveaxsmcgbql` | `supabase-deploy.yml` |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | variables. `keepalive.yml` defaults to this project's public values: set both or neither. `backup.yml` has no default and needs `SUPABASE_URL` of the same project as `SUPABASE_DB_URL` | `keepalive.yml`; `backup.yml` uses the URL |
| `BACKUP_AGE_RECIPIENT` | variable, your age public key (`age1…`) | `backup.yml` |

`backup.yml` also reads `SUPABASE_URL` and `BACKUP_AGE_RECIPIENT` from secrets of the same name, when no variable has them. With none of its four settings, the backup is skipped; with only some of them, it fails and names the ones missing.

The deploy and backup jobs use a GitHub environment named `production`. Add the secrets there, or at repository level.

**Supabase, Edge Function secrets** (`npx supabase secrets set NAME=value`):

| Name | What |
|---|---|
| `APP_ORIGIN` | The production address, `https://laree-pi.vercel.app`, so functions answer only the app (CORS). Preview addresses are refused. |
| `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY` | AI provider keys. Any subset works. |
| `AI_PROVIDERS` | Optional: the provider chain as JSON (backend.md, "AI") |

**Supabase, Authentication:** the site URL is `https://laree-pi.vercel.app`, the project's production domain on Vercel (`laree.vercel.app` belongs to another project); the redirect URLs are that address and the preview addresses (`https://laree-*-kidriqrifs-projects.vercel.app/**`). A project first set up with `laree.vercel.app` must change three hosted settings to `https://laree-pi.vercel.app`: the site URL, the redirect list (Authentication, URL Configuration) and the `APP_ORIGIN` function secret. Until then, sign-in links lead to the other project's site and the functions refuse the app. The email templates "Magic link" and "Confirm signup" carry `{{ .Token }}` (copy `supabase/templates/sign-in.html`, subject "Your Laree sign-in code"). OTP expiry is 600 seconds. On the free plan, Supabase allows custom templates only with custom SMTP: until then the email holds a link, not a code, and the app's code screen cannot be used.

**Email:** Supabase's built-in email sends only to the project's team members, a few per hour. Before inviting anyone else, add custom SMTP under Authentication, SMTP settings. A free tier of an email service is enough for a small team. This project uses Gmail with an app password (host `smtp.gmail.com`, port 465, about 500 emails a day). Brevo allows 300 a day. Resend needs a domain you have verified with them: it refuses a gmail.com sender.

## Common jobs

**Make someone a premium coach.** Anyone may choose to coach when they start, on the free plan. To start someone as a premium coach instead, in the SQL editor:

```sql
insert into public.invitations (email, role) values ('coach@example.com', 'coach');
```

They sign in, then accept the invitation on the screen that follows.

**Change a plan.** Premium lifts a coach's 3-athlete limit and gives AI to their athletes; for a self-coached athlete it gives AI. For either:

```sql
update public.profiles set plan = 'premium' where id = (select id from auth.users where email = 'someone@example.com');
```

**See who coaches on the free plan.** `select p.display_name, u.email, (select count(*) from public.coach_athletes l where l.coach_id = p.id and l.status = 'active') as athletes from public.profiles p join auth.users u on u.id = p.id where p.role = 'coach' and p.plan = 'free';`

**See what broke.** `select * from public.client_errors order by at desc limit 50;`

**See AI use and cost.** `select provider, model, status, count(*), sum(input_tokens), sum(output_tokens) from public.ai_runs where created_at > now() - interval '7 days' group by 1, 2, 3;`

**Deploy a database change.** Add a migration in `supabase/migrations/` with a pgTAP test. Merge to `main`, and `supabase-deploy.yml` pushes it and redeploys the functions.

## Restore a backup

A backup holds the rows (`dump/data.sql`: the app's tables and the accounts) and the original activity files (`dump/files/`, listed in `dump/files.txt`). `scripts/backup.sh` makes both and keeps them only if no file changed from before the dump until the last download, so the files match the rows. It does not hold the schema, the Edge Functions or any setting: those come from this repository and from the steps below. Do the steps in this order. The app keeps pointing at the old project until the last step.

1. **Get the backup.** Download the newest `laree-backup` artifact from the "Nightly backup" workflow run and decrypt it with your age key: `age -d -i key.txt laree-YYYY-MM-DD.tar.gz.age | tar -xz`
2. **Make an empty project** in `ap-southeast-1` and note its project ref, database password, URL and keys.
3. **Apply the migrations.** `npx supabase link --project-ref NEW_REF`, then `npx supabase db push --remote` (without `--remote` the CLI pushes to the local stack). This creates the tables, the access rules, the sign-up trigger on `auth.users`, and the `activity-files` bucket with its rules. A data dump contains none of these.
4. **Deploy the functions and their secrets.** `npx supabase functions deploy ai delete-account --use-api`, then set every secret from "Settings to keep in place" with `npx supabase secrets set`. Without this step, AI and "Delete my account" do not work in the restored app.
5. **Set up sign-in** as in "Settings to keep in place": site URL, redirect URLs, email templates, OTP expiry and SMTP.
6. **Load the rows.** The dump's first line turns triggers off for its own session (`SET session_replication_role = replica`). That matters: the sign-up trigger would otherwise make a second profile for every account, and the stamp triggers would rewrite every row's time. So load the file as it is, in one transaction, as the `postgres` user:

   ```bash
   psql "NEW_DB_URL" --single-transaction -v ON_ERROR_STOP=1 -f dump/data.sql
   ```

7. **Upload the files.** `SUPABASE_URL=https://NEW_REF.supabase.co SUPABASE_SECRET_KEY=… scripts/restore-files.sh dump`. The scripts send the secret key over HTTPS only.
8. **Check it.** In the SQL editor: `select count(*) from auth.users`, `select count(*) from public.profiles` (the two match) and `select count(*) from storage.objects where bucket_id = 'activity-files'` (it matches `wc -l dump/files.txt`).
9. **Point GitHub at the new project**, or the next deploy and the next backup still use the old one: `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.
10. **Switch the app.** Set Vercel's `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the new project and redeploy. Everyone signs in again: sessions belong to the old project.

Keep the age private key somewhere safe and offline. Without it the backups cannot be read. Try a restore into a scratch project once, before you need it.

## Rotate a key

- **AI provider key:** create a new key on the provider's site, set it with `supabase secrets set`, then revoke the old one.
- **Supabase secret (service role) key:** create a new secret key under Settings, API keys. Functions read it from the platform. Update `SUPABASE_SECRET_KEY` in GitHub for the backup. Then delete the old key.
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
