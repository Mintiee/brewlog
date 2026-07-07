# Brew — Multi-Perspective Review & Improvement Roadmap

*Generated 2026-07-07 from six parallel perspective reviews of the codebase (UX, life impact, security, architecture, reliability/offline, AI quality). Each finding cites the files it touches; effort is S ≈ hours, M ≈ 1–2 days, L ≈ 3+ days.*

## Perspectives used

| Perspective | Question it asks |
|---|---|
| **UX / interaction** | How much friction is in the core loop of logging a brew on a phone in a kitchen? |
| **Impact on life** | Does the app change how you brew (coaching), or only record it (logging)? |
| **Security & privacy** | Who can read/write household data and spend the paid LLM key? |
| **Code elegance** | Does the architecture structurally prevent bug classes, or rely on discipline? |
| **Reliability / offline** | What happens on flaky kitchen wifi, backgrounded PWA, mid-write failure? |
| **AI feature quality** | Are the LLM features grounded, validated, cost-bounded, and behavior-changing? |

## Overall assessment

The data-integrity core is excellent: the `persist()` pipeline (retry/backoff, permanent-vs-transient classification, rollback, undo, write-fenced refresh) and the `brewToRow`/`brewPatchToRow` mapper split are well-designed and well-tested — the historical clobber-bug class is structurally closed. Freshness/inventory tracking and the household/faceoff layer are genuinely differentiated product value.

The three big cross-cutting gaps:

1. **The front door is open.** Anonymous sign-in + the hard-coded `BREWMK` household join means anyone on the internet can join the household, read everything, and spend the paid LLM key. Most security findings collapse into this one fact.
2. **Guidance is decoupled from action.** All the good analytics/AI live in a buried Stats tab, cached daily/weekly. Nothing speaks at the moment of brewing or rating — the app coaches retrospectively, not in the loop.
3. **The offline story is a placeholder** despite the kitchen-PWA premise. SW precaches only `/`, no durable write queue, in-progress brew flow is in-memory only.

---

## Tier 1 — Security fixes to do now

| # | Finding | Files | Effort |
|---|---|---|---|
| S1 | ~~Rotate + relocate secrets~~ **Owner-declined (2026-07-07): accepted risk, no rotation.** Do not re-raise without new exposure evidence. | `.env.local` | — |
| S2 | **SSRF in `/api/extract`.** `fetch(url)` on user-controlled URL, no scheme/host/IP validation; page text returned via the LLM (non-blind exfiltration of internal endpoints). Require `https:`, block private/loopback/link-local/metadata ranges, `redirect: "manual"` + re-validate, cap response size. | `app/api/extract/route.ts:47` | S |
| S3 | **Rate-limit uncached LLM routes.** `/api/import`, `/api/extract`, `/api/classify-notes` are unbounded per request and billed to the household key. Per-IP/per-household token bucket (Upstash ratelimit or in-memory). | `app/api/{import,extract,classify-notes}/route.ts` | M |
| S4 | **Close the front door.** Anonymous sign-in + fixed `BREWMK` join = anyone becomes a household member (`app/login/page.tsx:24-28`, `app/api/household/route.ts:17-61`). Fix: **email + 6-digit OTP** (owner preference, 2026-07-07) + invite-code join; disable anonymous sign-ups after both accounts migrate. | login, household route, auth callback | M–L |
| S5 | **Column-restrict `household_ai` select.** RLS lets members read `key_ciphertext`/`key_iv`; expose only `provider`/`set_at` via a view. Defense-in-depth against S1's key leaking. | `supabase/migrations/001_init.sql:202-203` | S |
| S6 | **Harden global `learned_notes` writes.** Last-writer-wins upsert from arbitrary (cheap-model) classifications pollutes shared data across households. Pin classify-notes to a strong model, guard note-key length/charset, insert-if-absent instead of overwrite. | `app/api/classify-notes/route.ts:42,61-77`, `lib/llm/index.ts:76` | M |

Lower-severity notes: `next` redirect param in `app/auth/callback/route.ts` should be validated (single leading `/`, not `//`) when email auth returns; prompt-injection surface via notes/import/extract is contained by strict output validation — acceptable.

## Product direction (owner-set, 2026-07-07)

> **The app records and shows; it does not advise.** No AI-coaching features. No features added just because other apps have them — every addition must fit the household's actual use cohesively. Feature and UX candidates below were curated by the owner against this principle; the "Parked" section records what was rejected and why, so future reviews don't resurrect them.

## Tier 2 — Product features (owner-approved)

| # | Feature | Why | Files | Effort |
|---|---|---|---|---|
| P5 | **Experiment deltas.** Link each brew to its predecessor (same coffee+brewer); show what changed and how the rating moved in StepHow ("Last time: grind 20, 3.5★") and BrewDetail. Passive display — no advice. No schema change needed. | Makes progress visible without coaching | `StepHow.tsx`, `BrewDetail.tsx`, `lib/domain` helper | M |
| P8 | **Recipe library.** Save and name a recipe ("V60 bright"), apply to any coffee. Turns the implicit last-brew default into explicit, reusable assets. | Tacit knowledge → assets; pairs naturally with P5 | types + `StepHow.tsx` + store + migration | M |

### Parked features (owner-rejected — do not resurrect without new rationale)

Rejected for AI-coaching direction or me-too/feature-parity rationale: next-brew nudge (P1), brew timer (P2), dial-in wizard (P3), insight on home screen (P4), inventory/reorder nudges (P6), PWA notifications (P7), tip follow-through tracking (P9), share card (P10).

## Tier 3 — UX fixes (owner-approved)

| # | Fix | Files | Effort |
|---|---|---|---|
| U1 | First-run dead-end: zero-coffee user sees "Everything's still resting" with no CTA. Detect and show "Add a coffee". | `StepWhat.tsx:44,175-181` | S |
| U2 | Steppers: add tap-to-type and hold-to-repeat (grind 0–10 step 0.1 = up to ~100 taps today). | `Stepper.tsx:18-44` | M |
| U4 | Hard-coded `PEOPLE = ["Min-Taec", "Kris"]` blocks any new household member. Allow arbitrary name entry. (Pairs with S4 auth work.) | `app/login/page.tsx:7` | M |
| U5 | Touch targets under 44px on the exact wet-hands controls (stepper 30px, pips 22px, half-star ~17px). Invisible hit-area padding. | `Stepper.tsx`, `Scale5.tsx`, `Stars.tsx`, `Settings.tsx:197-203` | S–M |
| U6 | One-tap "brew again" (long-press coffee row → log with last recipe). | `StepWhat.tsx:72`, `BrewFlow.tsx` | S–M |

*U4 is approved but deferred into the S4 auth milestone rather than built standalone.*

### Parked UX items

Not selected by owner: Settings reachability (U3), a11y labels/contrast (U7), splash floor (U8), disabled-button hints (U9), flavour-scale nudge (U10).

## Tier 4 — Reliability & offline

| # | Fix | Failure prevented | Files | Effort |
|---|---|---|---|---|
| R1 | Precache build static assets, not just `/`; cold offline start currently white-screens. | Blank installed app with no signal | `public/sw.js:6,36` | M |
| R2 | Durable offline write outbox (IndexedDB + replay on reconnect); >30s outage currently rolls back and **loses the brew**. | "Logged my pour-over, wifi down, it vanished" | `lib/store/persist.ts:24,61-68`, `AppContext.tsx:273` | L |
| R3 | Persist in-progress brew-flow draft to storage (iOS evicts backgrounded PWAs). | Mid-brew state loss | `BrewFlow.tsx:29-53` | M |
| R4 | Cache-first/SWR for hashed assets (network-first makes flaky wifi slow, not resilient). | Multi-second blank loads | `sw.js:26-37` | M |
| R5 | SW returns app-shell HTML for failed cross-origin GETs → supabase-js JSON parse errors. Scope to same-origin navigations. | Confusing offline errors | `sw.js:22-37` | S |
| R6 | Cap the tips digest (currently entire rated history in the prompt; insight correctly caps at 18). | Unbounded token cost/latency growth | `BrewingTips.tsx:193-211`, `tips/route.ts:106` | S |
| R7 | Client AI fetches lack timeouts → permanent loading shimmer. `AbortSignal.timeout`. | Stuck insight card | `InsightCard.tsx:72`, `BrewingTips.tsx:215` | S |
| R8 | Persist scanned-bag extraction draft (paid API result lost on sheet close). | Re-paying for the same scan | `AddCoffee.tsx:43-63` | S–M |
| R9 | Rollback snapshots captured inside re-runnable `apply()` → stale restore under concurrent/retried edits. Snapshot at call time. | Failed edit restores wrong value | `AppContext.tsx:247-306` | M |
| R10 | SW cache name fixed at `v1`; hashed chunks accumulate forever. Bump per build or prune. | Device storage bloat | `sw.js:5,13-18` | S |
| R11 | User-facing force-refresh for insight/tips (only deploy-time cache busts exist). | Stale AI after notable brews | `insight/route.ts:54`, `tips/route.ts:101`, cards | S |

## Tier 5 — Code health

| # | Refactor | Bug class prevented | Files | Effort |
|---|---|---|---|---|
| C1 | **Live bug:** `detectProvider` checks `sk-` before `sk-ant-` → always mislabels Anthropic keys as OpenAI; correct version exists in `lib/llm/index.ts:8-10`. Delete local copy, import shared. | Wrong provider label / duplication trap | `Settings.tsx:23-28` | S |
| C2 | Module-global `learnedNotes` never set server-side → SSR bakes wrong (grey) colours into first paint; also cross-request-state shape. Stop materialising `color` in the mapper; compute in component. | Stale derived state / tenant bleed shape | `lib/flavour/index.ts:120`, `mappers.ts:30`, `app/page.tsx:26` | M |
| C3 | AppShell owns a parallel copy of AI-key state (`localLlmEnabled` vs store `llmEnabled`), fetches bypass the store. Move key mutations into AppContext. | Divergent AI-enabled state | `AppShell.tsx:71-126` | M |
| C4 | `BrewFlow.logCoffee` hand-builds two near-identical 30-line `Brew` literals with `coffee!` assertions — the exact clobber class the mappers closed. Extract `makeBrew(overrides)`. | Split-brew row divergence | `BrewFlow.tsx:80-147` | S–M |
| C5 | Extract `requireHouseholdKey()`/`requireUser()`/`parseJsonBody()` — auth/validation gates copy-pasted across all 7 API routes. (Also the right place to hang S3's rate limiting.) | Auth/validation drift | all `app/api/*/route.ts` | M |
| C6 | Consolidate duplicated LLM plumbing: identical model maps (insight/tips), duplicated local-day math, 4× re-implemented tolerant JSON extraction → `lib/llm` helpers. Also bump default `claude-sonnet-4-6` → `claude-sonnet-5`. | Inconsistent parsing/model drift | `insight/route.ts:18-23`, `tips/route.ts:26-33`, `lib/llm/index.ts:76` | S |
| C7 | Adopt structured outputs (`output_config` json_schema / strict tool-use) in the LLM adapter — eliminates the regex-JSON layer entirely (supersedes half of C6). | "No JSON in response" failures | `lib/llm/index.ts:75-80`, all AI routes | M |
| C8 | Automate `supabase gen types` (script or CI check) — types file is hand-maintained and its header already drifted. | Silent TS/migration/schema divergence | `lib/db/database.types.ts` | M |
| C9 | Test the untested high-complexity logic: `deleteBrews`/`dismissBrewSession`/undo sequencing (most intricate code in the app, zero coverage), config-backfill mappers, import parsers. | Regressions in session delete/undo | `AppContext.tsx:313-374`, `mappers.ts:129-153`, `lib/import/*` | M |
| C10 | Remove dead multi-user prop surface in Settings (`users`/`onSwitchUser`/… passed as no-ops); shared `householdIdFor()` helper; narrow `__rawMap` and seed-client `any`s. | Interface rot | `Settings.tsx:14-17`, `AppShell.tsx:170-172`, `lib/llm/getKey.ts:23`, `csv.ts:82-85` | S |

## Suggested sequencing

1. **This week (mostly S):** S1 rotate secrets → S2 SSRF guard → C1 provider-detect bug → U1 first-run CTA → R6/R7 AI cost/timeout caps.
2. **Next:** S3+C5 together (shared route helpers with rate limiting), S4 auth (unblocks U4 and neutralises S5/S6), U2/U5 input ergonomics, U6 brew again.
3. **Then:** P5 experiment deltas + P8 recipe library (they compose: deltas show what a recipe change did; the library names the keepers), U10, R1–R4 offline foundation, C7 structured outputs, C9 tests.
