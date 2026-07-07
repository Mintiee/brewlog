# Auth cutover runbook — email + 6-digit OTP

This is the owner runbook for moving brewlog off the no-auth "identity picker"
(anonymous sessions auto-joined to household `BREWMK`) and onto **email + 6-digit
OTP** sign-in with an invite-code household join.

After cutover:
- Sign-in is email → 6-digit code → (first time only) name + invite code.
- Anonymous sign-in is disabled.
- Each member has a **new** auth user id. Their existing brews/coffees are
  re-pointed from the old anonymous profile to the new one with a one-time SQL
  script.

Do the steps in order. Steps 1–3 are non-destructive. Step 4 (re-key) mutates
data — take a backup first. Step 5 (disable anonymous) is the point of no return
for old anonymous sessions.

---

## 0. Prerequisites

- The `ux-improvements` branch is merged/available to deploy.
- Migration `017_household_ai_lockdown.sql` is applied (or will be applied with
  this release). It is independent of the auth change but ships in the same
  milestone.
- A database backup / point-in-time-restore window is available before step 4.
- You can reach the Supabase dashboard for project `amtyxwqwnjiqodoiazpt`.

---

## 1. Supabase dashboard: configure the OTP email

The OTP flow uses `signInWithOtp` + `verifyOtp({ type: "email" })`, which needs
the email to deliver the **numeric code**, not a magic link.

1. Dashboard → **Authentication → Email Templates → Magic Link** (this template
   is reused for OTP).
2. Ensure the template body sends the code token. It must contain:

   ```
   {{ .Token }}
   ```

   A default Supabase template only contains `{{ .ConfirmationURL }}` (the magic
   link). If `{{ .Token }}` is missing, members will receive a link but no code
   and cannot sign in. A minimal body:

   ```
   Your brewlog sign-in code is {{ .Token }}. It expires shortly.
   ```

3. Dashboard → **Authentication → Providers → Email**: confirm **Email OTP** is
   enabled and note the **OTP expiry** (default 3600s / 1 hour). A shorter
   expiry (e.g. 600s) is fine; just confirm it's long enough for a phone
   round-trip.
4. Leave **anonymous sign-ins** enabled for now — we disable it in step 5, after
   both members have migrated.

> Note: the app cannot test live OTP delivery for you. Sending a real code to a
> real inbox in step 3 is the first end-to-end verification.

---

## 2. Deploy the branch to a Vercel preview

1. Push / open the `ux-improvements` branch so Vercel builds a **preview**
   deployment (do not promote to production yet).
2. Confirm the preview uses the same Supabase project env vars
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`).
3. Open the preview `/login` — you should see the email input (not the
   "Who's brewing?" name buttons). If you still see name buttons, the old build
   is cached; hard-refresh or redeploy.

---

## 3. Both members sign in and join

Do this on the **preview** first. Each member, on their own phone/device:

1. Enter email → **Send code**.
2. Enter the 6-digit code from the email → **Verify & continue**.
3. Because this is a brand-new auth user, the app shows **Join your household**:
   enter your **name** and the **invite code**.

### Where to find the invite code

The household already exists (it was seeded under invite code `BREWMK` during the
no-auth phase). Confirm/lookup the actual code with the service role (SQL editor):

```sql
select id, invite_code, created_at from public.households order by created_at;
```

Use the `invite_code` of the household that holds your existing brews. If it is
still `BREWMK`, that is the code both members enter. (You can rename it to
something less guessable afterwards with
`update public.households set invite_code = 'NEWCODE' where id = '<household id>';`
— do this only after both members have joined, or hand them the new code.)

After both members complete step 3 there will be **two new profiles** in the
household (one per member) **in addition to** the two old anonymous profiles.
The new profiles have no brews yet — that's expected; step 4 moves the data.

### Record the id mapping

For each member, capture old anonymous profile id → new profile id. List all
profiles with their brew counts to tell them apart:

```sql
select p.id, p.name, p.created_at,
       (select count(*) from public.brews b where b.logged_by = p.id) as brews_logged
from public.profiles p
where p.household_id = '<household id>'
order by p.created_at;
```

- The **old** profile for each member is the one with a non-zero `brews_logged`
  (created during the no-auth phase).
- The **new** profile is the freshly created one with `brews_logged = 0` and a
  recent `created_at`, matching the name they just entered.

Write down, per member: `OLD_PROFILE_ID` and `NEW_PROFILE_ID`.

---

## 4. Re-key each member's data (one-time SQL)

> ⚠️ Mutating. **Take a backup / confirm a PITR window first.** Run once **per
> member** (twice total for a two-person household).

Use `supabase/migrations/rekey_profiles.sql.template`. It re-points every
profile-id reference from the old profile to the new one, then deletes the old
profile, inside a single transaction with before/after counts. Follow the
instructions in that file:

1. Fill in `OLD_PROFILE_ID` and `NEW_PROFILE_ID` for the member.
2. Run it (psql recommended — see the file for the dashboard caveat).
3. Read the before/after counts. If they look right, `COMMIT;`. If anything is
   off, `ROLLBACK;` and investigate.
4. Repeat for the second member.

The columns it re-points (all profile-id foreign keys in the schema):
`brews.logged_by`, `brews.rate_for`, `household_ai.set_by`, and `profiles.id`
itself (via delete of the old row after children are moved).

`brews.taster1`, `brews.taster2`, and `config.taster2` are **display-name text**,
not profile ids — they don't need re-pointing. If a member changed the spelling
of their name at join time and you want the old rating labels to match, update
them manually (the template has an optional, commented block for this).

---

## 5. Disable anonymous sign-ins

Once **both** members have signed in with email and their data is re-keyed and
verified:

1. Dashboard → **Authentication → Providers → Email/Anonymous**: turn **off**
   anonymous sign-ins.
2. Promote the preview deployment to **production** (or merge + deploy `main`).

After this, any lingering anonymous session can no longer be created, and the
old identity-picker code path is gone from the client.

---

## 6. Verification checklist

Run after step 5, on production:

- [ ] **Row counts unchanged.** Total brews and coffees match pre-cutover:
      ```sql
      select
        (select count(*) from public.brews)   as brews,
        (select count(*) from public.coffees) as coffees;
      ```
- [ ] **No orphaned anonymous profiles remain.** Only the two new profiles exist
      in the household:
      ```sql
      select id, name,
             (select count(*) from public.brews b where b.logged_by = p.id) as brews_logged
      from public.profiles p where p.household_id = '<household id>' order by created_at;
      ```
      Both rows should be the new profiles, and their combined `brews_logged`
      should equal the total brew count.
- [ ] **Both members see the same shelf + log.** Each signs in on their device
      and sees the full household history (not an empty app).
- [ ] **Sign-out / sign-in round-trips.** Signing out and back in with
      email+code lands straight in the app (no "Join your household" step for an
      existing member).
- [ ] **Wrong invite code is rejected.** A fresh sign-in with a bad code at the
      join step shows "That invite code doesn't match a household." (403) and
      does not create a profile.
- [ ] **Expired/incorrect OTP is handled.** Entering a wrong 6-digit code shows
      an inline error and lets you retry / request a new code.
- [ ] **AI key status still reads.** Settings shows whether an AI key is set
      (this exercises the 017 column-lockdown migration via `fetchAiKeyStatus`).

---

## Rollback

- **Before step 5:** anonymous sign-ins are still enabled, so the old identity
  picker still works on the previous production build. Re-deploy the previous
  build to revert the client; no data was lost (step 4 only *added* new profiles
  and moved rows within the household).
- **After a bad step 4:** if you `COMMIT`ted a wrong re-key, restore from the
  backup / PITR taken before step 4. This is why the backup in step 4 is
  mandatory.

---

## Open questions for the owner

1. **Invite code value.** Keep `BREWMK`, or rotate to a less-guessable code
   during cutover? (The join flow validates against whatever `invite_code` the
   household row holds.) Rotating is a one-line `update` — decide before handing
   the code to the second member.
2. **OTP expiry.** Confirm the dashboard OTP expiry is acceptable for a
   phone round-trip (default 1 hour; 10 minutes is also fine).
3. **Email deliverability.** The default Supabase SMTP has low rate limits and
   can land in spam. For two people this is usually fine, but if codes don't
   arrive, configure a custom SMTP sender in the dashboard.
4. **Name spelling.** If either member wants their historical rating labels
   (`taster1`/`taster2`) to match a re-spelled name, confirm the exact strings
   so the optional block in the re-key template can be filled in.
