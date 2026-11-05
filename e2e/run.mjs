// Builds the app, starts it against the fake AI provider, and runs the browser suites.
//
//   npm run test:e2e                  Everything
//   npm run test:e2e -- assistant     Only the named suites
//   npm run test:e2e -- --dev         Against `next dev`, which reports hydration problems
//   npm run test:e2e -- --real        With the real AI provider (costs money, made-up data)
import { spawn, spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const isDev = args.includes("--dev");
const isReal = args.includes("--real");
const chosen = args.filter((arg) => !arg.startsWith("--"));

const FAKE_AI = { AZURE_OPENAI_ENDPOINT: "http://localhost:3199/", AZURE_OPENAI_API_KEY: "fake-key-for-the-browser-suites" };
const NO_AI = { AZURE_OPENAI_ENDPOINT: "", AZURE_OPENAI_API_KEY: "" };

const SUITES = isReal
  ? [
      { name: "extraction", env: { REAL_AI: "1" }, ai: {} },
      { name: "assistant-real", ai: {} },
    ]
  : [
      { name: "workspaces", ai: FAKE_AI },
      { name: "tasks", ai: FAKE_AI },
      { name: "extraction", ai: FAKE_AI },
      { name: "planning", ai: FAKE_AI },
      { name: "assistant", ai: FAKE_AI },
      { name: "responsive", ai: FAKE_AI, productionOnly: true },
      { name: "no-ai", ai: NO_AI },
    ];

for (const name of ["SUPABASE_DB_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
  if (!process.env[name]) {
    console.error(`${name} is missing. Add it to .env.local.`);
    process.exit(1);
  }
}

const isPortFree = (port) =>
  new Promise((resolve) => {
    const socket = createConnection({ port, host: "localhost" });
    socket.once("connect", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => resolve(true));
  });

for (const port of [3100, 3199]) {
  if (!(await isPortFree(port))) {
    console.error(`Port ${port} is in use. Stop whatever is using it, then run this again.`);
    process.exit(1);
  }
}

const children = new Set();
function start(command, commandArgs, env = {}) {
  // In its own process group, so stopping it also stops what npx starts.
  const child = spawn(command, commandArgs, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: "ignore",
    detached: true,
  });
  children.add(child);
  return child;
}
function stop(child) {
  children.delete(child);
  try { process.kill(-child.pid, "SIGTERM"); } catch { /* It has already exited. */ }
}
const stopAll = () => { for (const child of children) stop(child); };
process.on("exit", stopAll);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => { stopAll(); process.exit(1); });
}

async function waitUntilServing() {
  for (let tries = 0; tries < 240; tries++) {
    try {
      const response = await fetch("http://localhost:3100/login");
      if (response.ok) return;
    } catch { /* Not up yet. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("The app didn't start.");
}

function startApp(ai) {
  return start(
    "npx",
    ["next", isDev ? "dev" : "start", "-p", "3100"],
    { WORKPILOT_TIME_ZONE: "Africa/Tunis", ...ai },
  );
}

if (!isDev) {
  console.log("Building...");
  const build = spawnSync("npx", ["next", "build"], { cwd: ROOT, stdio: "ignore" });
  if (build.status !== 0) {
    console.error("The build failed. Run npm run build to see why.");
    process.exit(1);
  }
}

if (!isReal) start("node", ["e2e/mock-azure.mjs"]);

const results = [];
let app = null;
let appAi = null;
for (const suite of SUITES) {
  if (chosen.length > 0 && !chosen.includes(suite.name)) continue;
  if (isDev && suite.productionOnly) continue;

  if (appAi !== suite.ai) {
    if (app) {
      stop(app);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    app = startApp(suite.ai);
    appAi = suite.ai;
    await waitUntilServing();
  }

  console.log(`\n=== ${suite.name} ===`);
  const run = spawnSync("node", [`e2e/${suite.name}.mjs`], {
    cwd: ROOT,
    env: { ...process.env, ...suite.ai, ...suite.env },
    stdio: ["ignore", "pipe", "inherit"],
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  const lines = run.stdout.split("\n");
  for (const line of lines) {
    if (line.startsWith("FAIL")) console.log(line);
  }
  const passed = lines.filter((line) => line.startsWith("PASS")).length;
  const failed = lines.filter((line) => line.startsWith("FAIL")).length;
  console.log(`${run.status === 0 ? "ok" : "FAILED"}  ${passed} passed, ${failed} failed`);
  results.push({ name: suite.name, passed, failed, ok: run.status === 0 });
}
stopAll();

console.log("\nSummary");
for (const { name, passed, failed, ok } of results) {
  console.log(`  ${ok ? "ok    " : "FAILED"} ${name}: ${passed} passed, ${failed} failed`);
}
const allOk = results.length > 0 && results.every(({ ok }) => ok);
if (results.length === 0) console.log("  No suites matched.");
process.exit(allOk ? 0 : 1);
