# Deploying Brew

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
3. In **Project Settings → API**, copy:
   - **Project URL** (`NEXT_PUBLIC_SUPABASE_URL`)
   - **anon / public key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)
   - **service_role key** (`SUPABASE_SERVICE_ROLE_KEY`)
4. In **Auth → URL Configuration**, set:
   - Site URL: your Vercel deployment URL (e.g. `https://brew.vercel.app`)
   - Redirect URLs: add `https://brew.vercel.app/auth/callback`

---

## 2. Generate the encryption key

```bash
openssl rand -base64 32
```

Copy the output — this is your `APP_ENCRYPTION_KEY`.

---

## 3. Deploy to Vercel

1. Push this directory to a GitHub repository.
2. Import the repo in Vercel.
3. Set these **Environment Variables** in Vercel:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | your Supabase service-role key |
| `APP_ENCRYPTION_KEY` | output of `openssl rand -base64 32` |

4. Deploy.

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
