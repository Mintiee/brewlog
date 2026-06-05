#!/usr/bin/env node
/**
 * Headless Supabase migration push — no `supabase login` / link required.
 *
 * Reads SUPABASE_DB_URL (direct Postgres connection string) from brew/.env.local
 * and runs `supabase db push --db-url <url>`. Get the connection string from the
 * dashboard: Project Settings → Database → Connection string → URI.
 * Percent-encode any special characters in the password.
 *
 *   node scripts/db-push.mjs            # apply migrations missing from remote history
 *   node scripts/db-push.mjs --dry-run  # show what would be applied
 *   node scripts/db-push.mjs --include-all
 *
 * Any flags passed here are forwarded to `supabase db push`.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, "..", ".env.local");

let dbUrl;
try {
  const env = readFileSync(envPath, "utf8");
  const m = env.match(/^\s*SUPABASE_DB_URL\s*=\s*"?([^"\n\r]+)"?\s*$/m);
  dbUrl = m && m[1].trim();
} catch {
  console.error(`Could not read ${envPath}`);
  process.exit(1);
}

if (!dbUrl) {
  console.error(
    "SUPABASE_DB_URL not found in .env.local.\n" +
      "Add it (Dashboard → Settings → Database → Connection string → URI), e.g.:\n" +
      '  SUPABASE_DB_URL="postgresql://postgres.<ref>:<password>@<host>:5432/postgres"'
  );
  process.exit(1);
}

const forwarded = process.argv.slice(2);
const args = ["supabase", "db", "push", "--db-url", dbUrl, ...forwarded];
// Avoid printing the URL (it contains the password).
console.log(`> supabase db push ${forwarded.join(" ")}`.trim());

const res = spawnSync("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
process.exit(res.status ?? 1);
