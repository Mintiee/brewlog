# Deploying brewlog

## Prerequisites

1. A [Supabase](https://supabase.com) project (free tier is fine)
2. A [Vercel](https://vercel.com) account

---

## 1. Set up Supabase

1. Create a new Supabase project.
2. Go to **SQL Editor** and run the migration file:
   ```
   supabase/migrations/001_init.sql
   ```
   (Paste the contents and click Run.)
3. Grab the **Project URL** and **keys**. Supabase reorganised the dashboard in
   2025–26, so the layout differs from older guides:

   - **Project URL** (`NEXT_PUBLIC_SUPABASE_URL`):
     `https://<project-ref>.supabase.co`. Easiest source is the green
     **Connect** button at the top of the dashboard (App Frameworks tab), or
     **Settings → API** → "Project URL".
   - **Keys** live under **Settings → API Keys**. Supabase replaced the old
     `anon` / `service_role` keys with new **publishable** (`sb_publishable_…`)
     and **secret** (`sb_secret_…`) keys. The legacy keys still work but are
     scheduled for removal in late 2026 — **use the new keys**:
     - **Publishable** key → set as `NEXT_PUBLIC_SUPABASE_ANON_KEY`
       (the app's env var name is still `…ANON_KEY`; the publishable value goes here).
     - **Secret** key (click to reveal) → set as `SUPABASE_SERVICE_ROLE_KEY`.
       Used server-side to bypass RLS — keep it out of the browser and out of git.

   > Legacy fallback: the old `anon` / `service_role` values are under the
   > **Legacy API keys** tab on the same page and map to the same two env vars.

4. Set the auth redirect URLs. This page is nested: **Authentication →
   Configuration → URL Configuration** (or go direct to
   `https://supabase.com/dashboard/project/<project-ref>/auth/url-configuration`).
   Set these to your **live Vercel URL** (you'll have it after step 3 of Deploy):
   - Site URL: e.g. `https://your-app.vercel.app`
   - Redirect URLs: add `https://your-app.vercel.app/auth/callback`

   Magic-link login fails silently if these don't match the real deployed domain.

---

## 2. Generate the encryption key

`APP_ENCRYPTION_KEY` must be 32 random bytes, base64-encoded.

```bash
# Cross-platform (Node is already a dependency):
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Or, on macOS/Linux with OpenSSL:
openssl rand -base64 32
```

Copy the output — this is your `APP_ENCRYPTION_KEY`.

---

## 3. Deploy to Vercel

1. Push this directory to a GitHub repository.
2. Import the repo at **https://vercel.com/new**. Vercel auto-detects Next.js —
   leave the framework preset, build command, and root directory at defaults
   (`package.json` is at the repo root).
3. Before deploying, expand **Environment Variables** and add:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL (`https://<ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase **publishable** key (`sb_publishable_…`) |
| `SUPABASE_SERVICE_ROLE_KEY` | your Supabase **secret** key (`sb_secret_…`) |
| `APP_ENCRYPTION_KEY` | the base64 key from step 2 |

4. Deploy, then copy the live URL Vercel gives you.
5. **Go back to Supabase step 1.4** and set Site URL + Redirect URL to that live
   URL. (You couldn't do this earlier because the URL didn't exist yet.)

Future `git push`es to the connected branch auto-redeploy.

---

## 4. First use

1. Open the app — you'll be redirected to `/login`.
2. Enter your email and click **Send sign-in link**.
3. Click the link in your email → you're in, with demo data pre-loaded.
4. To add a second household member (e.g. Kris):
   - Go to **Settings → Account** to see your household invite code.
   - Kris opens the app, clicks **Join someone's household**, enters their email + your code.

---

## 5. Adding an AI key (optional)

In **Settings → Intelligence**, paste an OpenAI or Anthropic API key. The key is validated, encrypted, and stored server-side — it's never sent back to the browser. The AI key powers:
- Bag/link scanning in Add Coffee
- The Palate insight sentence
- Automatic tasting-note categorisation (shared across your household)

Without a key, the app works fully — manual entry, freshness tracking, flavour ranking, tips, and journal all work without AI.

---

## Running locally

```bash
cp .env.local.example .env.local
# Fill in the env vars

npm install
npm run dev
# Open http://localhost:3000
```

To run Supabase locally:
```bash
npx supabase start
# Then set NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 etc.
```
