// Shared by the browser suites. They run against the real database in .env.local, so
// each suite creates its own throwaway users and only ever touches their data.
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

export const BASE = "http://localhost:3100";
export const MOCK = "http://localhost:3199";
/** The zone the server is started with. Browsers are deliberately in a different one. */
export const ZONE = "Africa/Tunis";
export const LIVE = ":visible";
export const DB = process.env.SUPABASE_DB_URL;
export const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const SHOTS = new URL("./.output/shots/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

let failures = 0;
export function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
}

export const psql = (sql) =>
  execFileSync("psql", [DB, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"], {
    input: sql,
    encoding: "utf8",
  }).trim();
export const quote = (text) => `'${String(text).replace(/'/g, "''")}'`;

const createdUsers = [];

/** A real account with its two workspaces, removed again when the suite ends. */
export function createUser(label) {
  const user = {
    id: randomUUID(),
    email: `e2e-${label}-${randomBytes(4).toString("hex")}@test.invalid`,
    password: randomBytes(18).toString("base64url"),
  };
  createdUsers.push(user);
  psql(`
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', '${user.id}', 'authenticated', 'authenticated', '${user.email}',
      extensions.crypt('${user.password}', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), '${user.id}', '${user.id}',
      jsonb_build_object('sub', '${user.id}', 'email', '${user.email}', 'email_verified', true),
      'email', now(), now(), now());`);
  user.workspaces = psql(
    `select id from public.workspaces where owner_id = '${user.id}' order by slot`,
  ).split("\n");
  return user;
}

function removeCreatedUsers() {
  if (createdUsers.length === 0) return;
  const owners = createdUsers.map(({ id }) => `'${id}'`).join(",");
  const workspaces = createdUsers
    .flatMap((user) => user.workspaces ?? [])
    .map((id) => `'${id}'`)
    .join(",") || "null";
  psql(`delete from auth.users where id in (${owners})`);
  const left = psql(`select
      (select count(*) from auth.users where id in (${owners}))
      || '/' || (select count(*) from public.workspaces where id in (${workspaces}))
      || '/' || (select count(*) from public.tasks where workspace_id in (${workspaces}))
      || '/' || (select count(*) from public.captures where owner_id in (${owners}))
      || '/' || (select count(*) from public.assistant_conversations where owner_id in (${owners}));`);
  check("test users and all their data were removed", left === "0/0/0/0/0", left);
}

export const browser = await chromium.launch({
  // Uses the installed Chrome. Set E2E_CHROME_PATH to use a different browser.
  ...(process.env.E2E_CHROME_PATH
    ? { executablePath: process.env.E2E_CHROME_PATH }
    : { channel: "chrome" }),
  args: ["--no-sandbox"],
});

export async function newPage(viewport = { width: 1280, height: 800 }, extra = {}) {
  const context = await browser.newContext({ viewport, timezoneId: "Asia/Tokyo", ...extra });
  // `next dev` compiles a route on its first visit, which can take a while.
  context.setDefaultNavigationTimeout(90_000);
  const page = await context.newPage();
  page.problems = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      page.problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => page.problems.push(`pageerror: ${error.message}`));
  return page;
}

/** Saved for looking at by hand, since passing checks don't show that it looks right. */
export const shot = (page, name) =>
  page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true, caret: "initial" });

export async function login(page, user) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
  await page.getByRole("heading", { name: "Dashboard" }).waitFor();
}

export const main = (page) => page.locator(`main${LIVE}`);

/** Reads the numbers in a stats strip. */
export async function stat(page) {
  const out = {};
  for (const row of await page.locator(`dl${LIVE} > div`).all()) {
    out[await row.locator("dt").innerText()] = Number(await row.locator("dd").innerText());
  }
  return out;
}

/** Runs a suite, and always removes its users, however it ends. */
export async function runSuite(suite) {
  let finished = false;
  const finish = async () => {
    if (finished) return;
    finished = true;
    try {
      removeCreatedUsers();
    } catch (error) {
      check("test users could be removed", false, error.message);
    }
    await browser.close().catch(() => {});
    console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}`);
    process.exit(failures === 0 ? 0 : 1);
  };
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      check("the suite finished", false, `stopped by ${signal}`);
      finish();
    });
  }
  // A failure in the browser driver's own callbacks can arrive outside the suite.
  process.on("uncaughtException", (error) => {
    check("the suite finished", false, error.message);
    finish();
  });

  try {
    await suite();
  } catch (error) {
    check("the suite finished", false, error.message.split("\n").slice(0, 3).join(" "));
  }
  await finish();
}
