// Database commands. Run through npm so .env.local is loaded:
//   npm run db:push    Apply new migrations
//   npm run db:test    Run the security tests (changes nothing)
import { spawnSync } from "node:child_process";

const SUPABASE_CLI = "supabase@3.0.0";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is missing. Add it to .env.local.");
  process.exit(1);
}

const commands = {
  push: [
    "npx",
    ["--yes", SUPABASE_CLI, "db", "push", `--remote=${url}`, ...process.argv.slice(3)],
  ],
  test: [
    "psql",
    [url, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "supabase/tests/security_test.sql"],
  ],
};

const command = commands[process.argv[2]];
if (!command) {
  console.error(`Unknown command. Use one of: ${Object.keys(commands).join(", ")}`);
  process.exit(1);
}

const { status } = spawnSync(command[0], command[1], { stdio: "inherit" });
process.exit(status ?? 1);
