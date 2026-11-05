// Every page at several sizes with deliberately awkward data, plus what matters most
// on a phone: finger-sized controls, no zooming, and surviving a dropped connection.
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { BASE, browser, check, createUser, login, LIVE, main, newPage, psql, quote, runSuite, shot } from "./lib.mjs";

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const SIZES = [
  { name: "phone-small", width: 320, height: 640, touch: true },
  { name: "phone", width: 390, height: 844, touch: true, thorough: true },
  { name: "phone-landscape", width: 844, height: 390, touch: true },
  { name: "tablet-touch", width: 820, height: 1180, touch: true },
  { name: "laptop", width: 1024, height: 768, touch: false },
  { name: "desktop", width: 1280, height: 800, touch: false, thorough: true },
];
const MIN_TAP_SIZE = 40;

const signIn = async (page, user) => {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
};

await runSuite(async () => {
  const user = createUser("responsive");
  const [w1, w2] = user.workspaces;
  const LONG = "Prepare the extraordinarily comprehensive quarterly attendance reconciliation report for the regional operations leadership team";
  const WORD = "Supercalifragilisticexpialidocious".repeat(4);

  psql(`update public.workspaces set name = ${quote("International Operations & Learning Experience Department")}, description = ${quote(LONG)} where id = '${w1}'`);
  const person = psql(`insert into public.stakeholders (workspace_id, name, role, contact_details) values ('${w1}', ${quote("Maximiliana Featherstonehaugh-Cholmondeley")}, ${quote("Senior Vice President of Global Partnerships")}, ${quote(`${WORD}@example.invalid`)}) returning id`);
  const emma = psql(`insert into public.stakeholders (workspace_id, name) values ('${w2}', 'Emma') returning id`);
  const project = psql(`insert into public.projects (workspace_id, name, description) values ('${w1}', ${quote("Enrollment Linked Dashboards Modernization Programme")}, ${quote(LONG)}) returning id`);
  const add = (workspace, title, extra = {}) => psql(`
    insert into public.tasks (workspace_id, title, source_request, status, priority, deadline, estimated_minutes, stakeholder_id, project_id, next_action, waiting_for, description)
    values ('${workspace}', ${quote(title)}, ${quote(extra.request ?? title)}, '${extra.status ?? "todo"}', '${extra.priority ?? "medium"}', ${extra.deadline ?? "null"}, ${extra.estimate ?? "null"},
      ${extra.who ? `'${extra.who}'` : "null"}, ${extra.project ? `'${extra.project}'` : "null"}, ${quote(extra.next ?? LONG)}, ${extra.waiting ? quote(extra.waiting) : "null"}, ${quote(extra.description ?? `${LONG} ${WORD}`)}) returning id`);

  const big = add(w1, LONG, { priority: "critical", deadline: "now() - interval '3 days'", estimate: 600, who: person, project, request: `${LONG}. ${WORD}. URGENT please` });
  add(w1, WORD, { priority: "high", deadline: "now() + interval '2 hours'", estimate: 240, who: person });
  const quick = add(w2, "Quick one", { deadline: "now() + interval '1 day'", estimate: 20, who: emma });
  add(w2, "Waiting on figures", { status: "waiting", waiting: "Maximiliana Featherstonehaugh-Cholmondeley", deadline: "now() + interval '2 days'" });
  add(w2, "Nothing urgent", { priority: "low" });
  add(w1, "Already finished", { status: "done" });
  for (let n = 0; n < 6; n++) add(w2, `Filler task number ${n}`, { deadline: `now() + interval '${n + 3} days'`, estimate: 30 + n * 15 });
  psql(`insert into public.subtasks (task_id, title) values ('${big}', ${quote(LONG)}), ('${big}', ${quote(WORD)});
        insert into public.task_notes (task_id, body) values ('${big}', ${quote(`${LONG} ${WORD}`)});`);
  const capture = psql(`insert into public.captures (owner_id, source_text) values ('${user.id}', ${quote(`${LONG} ${WORD}`)}) returning id`);
  psql(`insert into public.captures (owner_id, source_text) values ('${user.id}', 'A short request')`);
  const conversation = psql(`insert into public.assistant_conversations (owner_id, title) values ('${user.id}', ${quote(LONG.slice(0, 100))}) returning id`);
  psql(`insert into public.assistant_messages (conversation_id, role, content, created_at) values ('${conversation}', 'user', ${quote(`${LONG} ${WORD}`)}, now() - interval '1 minute')`);
  const message = psql(`insert into public.assistant_messages (conversation_id, role, content, referenced_task_ids) values ('${conversation}', 'assistant', ${quote(`Here is the plan:\n- ${LONG}\n- ${WORD}`)}, array['${quick}']::uuid[]) returning id`);
  psql(`insert into public.assistant_proposals (message_id, task_id, payload) values
    ('${message}', '${big}', ${quote(JSON.stringify({ kind: "update_task", changes: [{ field: "deadline", before: "2026-11-03T22:59:59.000Z", after: "2030-12-06T13:00:00.000Z" }, { field: "nextAction", before: LONG, after: WORD }] }))}),
    ('${message}', '${big}', ${quote(JSON.stringify({ kind: "add_note", body: WORD }))})`);

  const PAGES = [
    ["dashboard", "/dashboard"],
    ["plan", "/plan"],
    ["plan-with-time", "/plan?minutes=120"],
    ["inbox", "/inbox"],
    ["review", `/inbox/${capture}`],
    ["tasks", "/tasks"],
    ["tasks-filtered", "/tasks?status=all&deadline=overdue"],
    ["task", `/tasks/${big}`],
    ["assistant", "/assistant"],
    ["conversation", `/assistant?c=${conversation}`],
    ["workspace", `/workspaces/${w1}`],
  ];

  async function measure(page) {
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(150);
    return page.evaluate(() => {
      const visible = (el) => {
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && !el.closest(".sr-only");
      };
      const name = (el) =>
        `${el.tagName.toLowerCase()}:${(el.getAttribute("aria-label") || el.innerText || el.getAttribute("placeholder") || el.name || el.type || "").trim().slice(0, 28).replace(/\s+/g, " ")}`;
      const width = document.documentElement.clientWidth;

      const pastEdge = [...document.querySelectorAll("body *")].filter(visible).filter((el) => {
        if (el.getBoundingClientRect().right <= width + 1) return false;
        for (let parent = el.parentElement; parent; parent = parent.parentElement) {
          if (getComputedStyle(parent).overflowX !== "visible") return false;
        }
        return true;
      }).slice(0, 3).map(name);

      const small = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button]')]
        .filter(visible)
        .filter((el) => !el.closest("[hidden]"))
        .map((el) => {
          const box = el.getBoundingClientRect();
          // A stretched ::after is the real tap area, on rows and the complete toggle.
          const after = getComputedStyle(el, "::after");
          const isStretched = after.position === "absolute";
          return {
            name: name(el),
            w: Math.max(box.width, isStretched ? parseFloat(after.width) || 0 : 0),
            h: Math.max(box.height, isStretched ? parseFloat(after.height) || 0 : 0),
          };
        });

      const zooms = [...document.querySelectorAll("input:not([type=hidden]),select,textarea")]
        .filter(visible)
        .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
        .map(name);

      return { scrollWidth: document.documentElement.scrollWidth, width, pastEdge, small, zooms };
    });
  }

  async function axeViolations(page) {
    await page.evaluate(axeSource);
    return page.evaluate(async () => {
      const result = await window.axe.run(document, {
        runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"],
      });
      return result.violations.map(({ id, nodes }) => `${id} x${nodes.length}: ${nodes[0].target.join(" ")}`);
    });
  }

  for (const size of SIZES) {
    console.log(`\n# ${size.name} (${size.width}x${size.height})`);
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      hasTouch: size.touch,
      isMobile: size.touch,
    });
    const page = await context.newPage();
    const problems = [];
    page.on("console", (m) => { if (m.type() === "error") problems.push(m.text().slice(0, 160)); });
    page.on("pageerror", (e) => problems.push(e.message.slice(0, 160)));

    const overflow = [];
    const pastEdge = [];
    const small = new Map();
    const zooms = new Set();
    const violations = new Set();
    const audit = async (name) => {
      const measured = await measure(page);
      if (measured.scrollWidth > measured.width) overflow.push(`${name} ${measured.scrollWidth}/${measured.width}`);
      if (measured.pastEdge.length) pastEdge.push(`${name}: ${measured.pastEdge.join(", ")}`);
      if (size.touch) {
        for (const item of measured.small) {
          if (item.w < MIN_TAP_SIZE || item.h < MIN_TAP_SIZE) {
            small.set(item.name, `${Math.round(item.w)}x${Math.round(item.h)} on ${name}`);
          }
        }
        for (const zoom of measured.zooms) zooms.add(`${zoom} on ${name}`);
      }
      if (size.thorough) for (const violation of await axeViolations(page)) violations.add(`${name}: ${violation}`);
    };

    await page.goto(`${BASE}/login`);
    await audit("login");
    await signIn(page, user);
    for (const [name, url] of PAGES) {
      await page.goto(BASE + url);
      await audit(name);
      if (size.thorough || size.width === 320) await shot(page, `responsive-${name}-${size.name}`);
    }

    await page.goto(`${BASE}/tasks`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /Capture request/ }).locator("visible=true").first().click();
    await page.getByRole("dialog").waitFor();
    await audit("capture dialog");

    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    await page.getByRole("button", { name: /^Workspace:/ }).locator("visible=true").first().click();
    await page.getByRole("menu").waitFor();
    await page.waitForTimeout(300); // The menu grows as it opens.
    const menuItems = await page.locator('[role^="menuitem"]').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height));
    if (size.touch) check("workspace menu items are finger-sized", menuItems.length > 0 && menuItems.every((height) => height >= MIN_TAP_SIZE), menuItems.join(","));
    await page.keyboard.press("Escape");

    // The sidebar's last control must stay reachable however short the screen is.
    if (size.width >= 768) {
      const signOut = page.getByRole("button", { name: "Sign out" }).locator("visible=true").first();
      await signOut.scrollIntoViewIfNeeded();
      const box = await signOut.boundingBox();
      check("everything in the sidebar can be reached", box !== null && box.y >= 0 && box.y + box.height <= size.height, JSON.stringify(box));
      await shot(page, `responsive-sidebar-${size.name}`);
    }

    check("no sideways scrolling", overflow.length === 0, overflow.join("; "));
    check("nothing past the screen's edge", pastEdge.length === 0, pastEdge.join("; ").slice(0, 300));
    if (size.touch) {
      check(`controls are at least ${MIN_TAP_SIZE}px`, small.size === 0, [...small].map(([k, v]) => `${k} ${v}`).join("; ").slice(0, 400));
      check("no field makes iOS zoom in", zooms.size === 0, [...zooms].join("; ").slice(0, 300));
    }
    if (size.thorough) check("no accessibility violations", violations.size === 0, [...violations].join("; ").slice(0, 500));
    check("no browser errors", problems.length === 0, problems.join(" | ").slice(0, 300));
    await context.close();
  }

  console.log("\n# Dark mode");
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: "dark", hasTouch: width < 768, isMobile: width < 768 });
    const page = await context.newPage();
    await signIn(page, user);
    const violations = [];
    for (const [name, url] of PAGES) {
      await page.goto(BASE + url);
      await page.waitForLoadState("networkidle").catch(() => {});
      for (const violation of await axeViolations(page)) violations.push(`${name}: ${violation}`);
    }
    check(`no accessibility violations at ${width}px`, violations.length === 0, violations.join("; ").slice(0, 500));
    await context.close();
  }

  console.log("\n# On a phone");
  const phone = await newPage({ width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  await login(phone, user);

  await phone.goto(`${BASE}/tasks`);
  await phone.waitForLoadState("networkidle");
  const row = main(phone).locator("li").filter({ hasText: "Quick one" });
  const circle = await row.getByRole("button", { name: "Mark Quick one complete" }).boundingBox();
  await phone.touchscreen.tap(circle.x + circle.width + 8, circle.y + circle.height / 2);
  await phone.waitForFunction(() => document.querySelector('main [aria-label="Reopen Quick one"]') !== null, null, { timeout: 15000 }).catch(() => {});
  check("tapping just beside the circle still completes the task", psql(`select status from public.tasks where id = '${quick}'`) === "done");
  check("and doesn't open the task", phone.url().endsWith("/tasks"));
  psql(`update public.tasks set status = 'todo' where id = '${quick}'`);
  await phone.reload();
  await phone.waitForLoadState("networkidle");
  // By position, because the row's link deliberately covers this text.
  const elsewhere = await main(phone).locator("li").filter({ hasText: "Quick one" }).getByText("Second job").boundingBox();
  await phone.touchscreen.tap(elsewhere.x + 5, elsewhere.y + elsewhere.height / 2);
  await phone.waitForURL(`**/tasks/${quick}`);
  check("tapping anywhere else on a row opens the task", true);

  console.log("\n# A dropped connection doesn't lose what you typed");
  await phone.goto(`${BASE}/tasks/${quick}`);
  await phone.waitForLoadState("networkidle");
  const title = main(phone).getByLabel("Title", { exact: true });
  await title.fill("Edited while offline");
  await phone.context().setOffline(true);
  await main(phone).getByRole("button", { name: "Save changes" }).tap();
  const alert = main(phone).getByRole("alert");
  await alert.waitFor();
  check("editing a task: it explains", (await alert.innerText()).includes("couldn't be reached"));
  check("editing a task: the text is still there", (await title.inputValue()) === "Edited while offline");
  check("editing a task: it stays on the form", await main(phone).getByRole("button", { name: "Save changes" }).isVisible());
  check("editing a task: nothing was saved", psql(`select title from public.tasks where id = '${quick}'`) === "Quick one");

  const note = main(phone).getByPlaceholder("Add a note");
  await note.fill("A note written offline");
  await main(phone).getByRole("button", { name: "Add note" }).tap();
  await phone.locator(`form${LIVE}`).filter({ has: phone.getByPlaceholder("Add a note") }).getByRole("alert").waitFor();
  check("adding a note: the text is still there", (await main(phone).getByPlaceholder("Add a note").inputValue()) === "A note written offline");

  await phone.context().setOffline(false);
  await main(phone).getByRole("button", { name: "Save changes" }).tap();
  await main(phone).getByText("Saved.", { exact: true }).waitFor();
  check("once back online, saving works", psql(`select title from public.tasks where id = '${quick}'`) === "Edited while offline");

  console.log("\n# Messages go away when they stop being true");
  await main(phone).getByLabel("Title", { exact: true }).fill("Edited again");
  check('"Saved." goes once you edit again', (await main(phone).getByText("Saved.", { exact: true }).count()) === 0);
  await main(phone).getByLabel("Title", { exact: true }).fill("   ");
  await main(phone).getByRole("button", { name: "Save changes" }).tap();
  await main(phone).getByText("Enter a title.").waitFor();
  await main(phone).getByLabel("Title", { exact: true }).fill("Fixed");
  check("an error goes once you start fixing it", (await main(phone).getByText("Enter a title.").count()) === 0);
  await phone.context().close();

  const signedOut = await newPage({ width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  await signedOut.goto(`${BASE}/login`);
  await signedOut.waitForLoadState("networkidle");
  await signedOut.getByLabel("Email").fill(user.email);
  await signedOut.getByLabel("Password").fill(user.password);
  await signedOut.context().setOffline(true);
  await signedOut.getByRole("button", { name: "Sign in" }).tap();
  const signInAlert = signedOut.locator("form").getByRole("alert");
  await signInAlert.waitFor();
  check("signing in: it explains", (await signInAlert.innerText()).includes("couldn't be reached"));
  check("signing in: the email is still there", (await signedOut.getByLabel("Email").inputValue()) === user.email);
  await signedOut.context().close();

  const desktop = await newPage();
  await login(desktop, user);

  console.log("\n# Saving says so");
  await desktop.goto(`${BASE}/tasks/${quick}`);
  await desktop.waitForLoadState("networkidle");
  await main(desktop).getByLabel("Title", { exact: true }).fill("Saved on desktop");
  await main(desktop).getByRole("button", { name: "Save changes" }).click();
  await main(desktop).getByText("Saved.", { exact: true }).waitFor();
  check("saving a task confirms it", true);
  check("and the form shows what's saved", (await main(desktop).getByLabel("Title", { exact: true }).inputValue()) === "Saved on desktop");
  await main(desktop).getByRole("button", { name: "Mark Saved on desktop complete" }).click();
  await main(desktop).getByRole("button", { name: "Reopen Saved on desktop" }).waitFor();
  await desktop.waitForFunction(() => [...document.querySelectorAll("main select[name=status]")].some((el) => el.checkVisibility() && el.value === "done"));
  check("a change from elsewhere on the page refreshes the fields", true);

  await desktop.goto(`${BASE}/workspaces/${w2}`);
  await desktop.waitForLoadState("networkidle");
  const settings = desktop.locator(`form${LIVE}`).filter({ has: desktop.getByLabel("Colour") });
  await settings.getByLabel("Description").fill("Saved description");
  await settings.getByRole("button", { name: "Save changes" }).click();
  await settings.getByText("Saved.", { exact: true }).waitFor();
  check("saving a workspace confirms it", (await settings.getByLabel("Description").inputValue()) === "Saved description");
  await settings.getByLabel("Description").fill("Saved description, then more");
  check("and the message goes once you edit again", (await settings.getByText("Saved.", { exact: true }).count()) === 0);

  console.log("\n# Not found");
  for (const [name, url] of [
    ["an unknown address", "/nope"],
    ["a task that doesn't exist", `/tasks/${randomUUID()}`],
    ["a malformed task id", "/tasks/not-a-uuid"],
    ["a request that doesn't exist", `/inbox/${randomUUID()}`],
    ["a workspace that doesn't exist", `/workspaces/${randomUUID()}`],
    ["a conversation that doesn't exist", `/assistant?c=${randomUUID()}`],
  ]) {
    await desktop.goto(BASE + url);
    await desktop.waitForLoadState("networkidle");
    const heading = desktop.locator(`main${LIVE}`).getByRole("heading", { name: "Not found" });
    check(`${name} says so, with a way back`, (await heading.count()) === 1 && (await desktop.locator(`main${LIVE}`).getByRole("link", { name: /^Back to/ }).count()) === 1);
  }

  console.log("\n# Production settings");
  const cookies = await desktop.context().cookies();
  const session = cookies.filter(({ name }) => name.startsWith("sb-"));
  check("there's a session cookie", session.length > 0);
  check("scripts in the page can't read it", session.every(({ httpOnly }) => httpOnly));
  check("it's only sent over HTTPS", session.every(({ secure }) => secure));
  check("and not sent with requests from other sites", session.every(({ sameSite }) => sameSite === "Lax"));
  await desktop.goto(`${BASE}/dashboard`);
  check("the page's scripts really can't see it", !(await desktop.evaluate(() => document.cookie)).includes("sb-"));
  await desktop.context().close();

  const response = await fetch(`${BASE}/login`);
  const expected = {
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    "referrer-policy": "same-origin",
    "strict-transport-security": "max-age=63072000",
  };
  for (const [header, value] of Object.entries(expected)) {
    check(`${header} is set`, response.headers.get(header) === value, response.headers.get(header) ?? "");
  }
  check("the page can't be framed", (response.headers.get("content-security-policy") ?? "").includes("frame-ancestors 'none'"));
  check("the framework isn't advertised", response.headers.get("x-powered-by") === null);
  check("search engines are told to stay away", (await response.text()).includes('content="noindex, nofollow"'));
});
