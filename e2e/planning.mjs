import { BASE, check, createUser, LIVE, login, main, MOCK, newPage, psql, quote, runSuite, shot, ZONE } from "./lib.mjs";

const mockCalls = async () => (await (await fetch(`${MOCK}/count`)).json()).calls;


const section = (page, title) =>
  page.locator(`section${LIVE}`).filter({ has: page.getByRole("heading", { name: title, exact: true }) });
const titlesIn = (page, title) => section(page, title).locator('a[href^="/tasks/"]').allInnerTexts();
const openPlan = async (page, query = "") => {
  await page.goto(`${BASE}/plan${query}`);
  await page.getByRole("heading", { name: "Today", exact: true }).waitFor();
  await page.getByRole("heading", { name: "How much time do you have?" }).waitFor();
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

await runSuite(async () => {
  const alice = createUser("alice");
  const bob = createUser("bob");
  const [a1, a2] = alice.workspaces;
  const nadia = psql(`insert into public.stakeholders (workspace_id, name) values ('${a1}', 'Nadia') returning id`);

  const END_OF_TODAY = `((date_trunc('day', now() at time zone '${ZONE}') + interval '23 hours 59 minutes') at time zone '${ZONE}')`;
  const add = ({ ws = a1, title, request, status = "todo", priority = "medium", deadline = "null", estimate = "null", who = "null", waiting = "null", updated = "now()" }) =>
    psql(`insert into public.tasks (workspace_id, title, source_request, status, priority, deadline, estimated_minutes, stakeholder_id, waiting_for, updated_at)
      values ('${ws}', ${quote(title)}, ${quote(request ?? `Request: ${title}`)}, '${status}', '${priority}', ${deadline}, ${estimate}, ${who === "null" ? "null" : `'${who}'`}, ${waiting === "null" ? "null" : quote(waiting)}, ${updated}) returning id`);

  // Expected scores are in the comments, from the rules in the engine.
  add({ title: "Send attendance report", priority: "critical", deadline: "now() - interval '2 days'", estimate: 180, who: nadia }); // 104 + 60 = 164
  add({ ws: a2, title: "Tight deadline", status: "in_progress", deadline: "now() + interval '1 hour'", estimate: 300 }); // 80 + 15 + 20 = 115, soonest
  add({ ws: a2, title: "Review numbers", priority: "high", deadline: END_OF_TODAY, estimate: 60 }); // 80 + 35 = 115
  add({ title: "Book the room", priority: "low", deadline: END_OF_TODAY, estimate: 20 }); // 80 + 5 = 85
  add({ title: "Renew licence", priority: "low", deadline: END_OF_TODAY }); // 80
  const slides = add({ ws: a2, title: "Prepare slides", deadline: "now() + interval '1 day'", estimate: 45 }); // 60 + 15 = 75
  add({ title: "Fix cohort data", request: "URGENT: the cohort data is wrong", estimate: 30 }); // 50 + 15 + 5 = 70
  add({ ws: a2, title: "Reconcile export", deadline: "now() + interval '6 days'" }); // 30 + 15 = 45
  add({ title: "Tidy documentation", priority: "low" }); // 0, never recommended
  add({ title: "Not urgent chore", priority: "low", request: "This is not urgent at all" }); // 0
  add({ title: "Finished work", status: "done", priority: "critical", deadline: "now() - interval '1 day'" });
  add({ title: "Abandoned work", status: "cancelled", priority: "critical", deadline: "now() - interval '1 day'" });
  add({ title: "KPI sign-off", status: "waiting", priority: "critical", deadline: "now() + interval '2 days'", waiting: "Nadia" });
  add({ ws: a2, title: "Confirm access", waiting: "IT", priority: "high", updated: "now() - interval '6 days'" });

  const page = await newPage();
  await login(page, alice);
  const callsBefore = await mockCalls();

  // ---------- The dashboard ----------
  console.log("\n# Dashboard");
  const dash = await main(page).innerText();
  check("the numbers include tasks with waiting for filled in", dash.includes("Waiting") && (await page.locator(`dl${LIVE} > div`).filter({ hasText: "Waiting" }).locator("dd").innerText()) === "2");
  const dashTop = await page.locator(`ol${LIVE} a[href^="/tasks/"]`).allInnerTexts();
  check("the dashboard shows the engine's top three", same(dashTop, ["Send attendance report", "Tight deadline", "Review numbers"]), dashTop.join(" | "));
  const firstRow = await page.locator(`ol${LIVE} > li`).first().innerText();
  check("each recommendation says why", firstRow.includes("Overdue by 2 days · Critical priority"));
  check("the preview wording is gone", !dash.includes("Early preview"));
  await shot(page, "p5-dashboard");
  await page.locator(`dl${LIVE} > div`).filter({ hasText: "Waiting" }).locator("a").click();
  await page.waitForURL(/status=waiting/);
  await page.getByRole("link", { name: "Confirm access" }).waitFor();
  check("the waiting number opens the same two tasks", (await main(page).innerText()).includes("2 tasks") && (await page.getByRole("link", { name: "KPI sign-off" }).isVisible()));

  await page.goto(`${BASE}/dashboard`);
  await page.getByRole("link", { name: "Open today's full plan" }).click();
  await page.waitForURL("**/plan");
  await page.getByRole("heading", { name: "Most important" }).waitFor();
  check("the dashboard links to the plan", true);
  await page.locator(`aside${LIVE}`).getByRole("link", { name: "Dashboard" }).click();
  await page.waitForURL(/\/dashboard/);
  await page.locator(`aside${LIVE}`).getByRole("link", { name: "Today" }).click();
  await page.waitForURL(/\/plan/);
  check("the sidebar links to the plan", true);

  // ---------- The plan ----------
  console.log("\n# Daily plan with no time given");
  await openPlan(page);
  const top = await titlesIn(page, "Most important");
  check("the three most important tasks are in score order", same(top, ["Send attendance report", "Tight deadline", "Review numbers"]), top.join(" | "));
  const today = await titlesIn(page, "Also due today");
  check("other tasks due today are listed, in score order", same(today, ["Book the room", "Renew licence"]), today.join(" | "));
  const plan = await main(page).innerText();
  check("an overdue task explains why", plan.includes("Overdue by 2 days · Critical priority"));
  check("tight work explains the time", plan.includes("Needs 5h, and only") && plan.includes("is left"));
  check("quick tasks say so", plan.includes("Quick: about 20m"));
  check("nothing about capacity is assumed", !plan.includes("Planned") && !plan.includes("Won't fit"));
  for (const hidden of ["Tidy documentation", "Not urgent chore", "Finished work", "Abandoned work"]) {
    check(`"${hidden}" isn't recommended`, !plan.includes(hidden));
  }
  const follow = await titlesIn(page, "Follow up");
  check("follow-ups list waiting tasks, soonest deadline first", same(follow, ["KPI sign-off", "Confirm access"]), follow.join(" | "));
  const followText = await section(page, "Follow up").innerText();
  check("follow-ups say who, and how long it's been quiet", followText.includes("Waiting for Nadia") && followText.includes("Waiting for IT") && followText.includes("No change in 6 days"));
  const risk = await titlesIn(page, "At risk of missing their deadline");
  check("at risk only lists what isn't already above", same(risk, ["Prepare slides", "KPI sign-off"]), risk.join(" | "));
  const riskText = await section(page, "At risk of missing their deadline").innerText();
  check("risks explain themselves", riskText.includes("Due tomorrow, and not started") && riskText.includes("still waiting for Nadia"));
  check("an overdue task isn't called at risk", !risk.includes("Send attendance report"));
  await shot(page, "p5-plan");

  await page.getByText("How tasks are ranked").click();
  const rules = await main(page).innerText();
  check("the ranking rules are visible", rules.includes("+100, plus 2 per day late") && rules.includes("Having a stakeholder") && rules.includes("Your working hours aren't assumed"));

  // ---------- Available time ----------
  console.log("\n# Daily plan with 2 hours");
  await page.getByRole("link", { name: "2h", exact: true }).click();
  await page.waitForURL(/minutes=120/);
  await page.getByRole("heading", { name: "Won't fit in your time" }).waitFor();
  await page.mouse.move(700, 5);
  await page.waitForTimeout(400);
  const chip = await page.getByRole("link", { name: "2h", exact: true }).evaluate((el) => {
    const channels = (value) => {
      const canvas = document.createElement("canvas").getContext("2d");
      canvas.fillStyle = value;
      canvas.fillRect(0, 0, 1, 1);
      return [...canvas.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const luminance = (rgb) => {
      const [r, g, b] = rgb.map((c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const style = getComputedStyle(el);
    const a = luminance(channels(style.color));
    const b = luminance(channels(style.backgroundColor));
    return { ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), current: el.getAttribute("aria-current") };
  });
  check("the selected time is clearly marked and readable", chip.current === "true" && chip.ratio >= 4.5, `contrast ${chip.ratio.toFixed(1)}:1`);
  const fit = await titlesIn(page, "Most important");
  check("only what fits is recommended", same(fit, ["Review numbers", "Book the room", "Renew licence"]), fit.join(" | "));
  const noFit = await titlesIn(page, "Won't fit in your time");
  check("what doesn't fit is still shown", same(noFit, ["Send attendance report", "Tight deadline", "Prepare slides"]), noFit.join(" | "));
  const noFitText = await section(page, "Won't fit in your time").innerText();
  check("it says why it doesn't fit", noFitText.includes("Needs 3h, and you have 2h") && noFitText.includes("Needs 45m, and you'd have 40m"));
  const later = await titlesIn(page, "If you have time left");
  check("further work that fits is offered", same(later, ["Fix cohort data", "Reconcile export"]), later.join(" | "));
  const withTime = await main(page).innerText();
  check("the time adds up, and no estimate is invented", withTime.includes("Planned 1h 50m of your 2h. 2 tasks have no estimate"), withTime.split("\n").find((l) => l.includes("Planned")));
  check("unestimated work says it isn't counted", withTime.includes("No estimate, so it isn't counted against your time"));
  check("effort isn't stated twice", !withTime.includes("Quick: about 20m · Takes about") && (await section(page, "Won't fit in your time").innerText()).split("Needs 5h").length === 2);
  check("what won't fit isn't repeated as at risk", !(await titlesIn(page, "At risk of missing their deadline")).some((title) => noFit.includes(title)));
  await shot(page, "p5-plan-time");

  await page.getByLabel("Minutes available").fill("50");
  await page.getByRole("button", { name: "Set", exact: true }).click();
  await page.waitForURL(/minutes=50/);
  await page.getByText("of your 50m").waitFor();
  check("a custom amount of time works", same(await titlesIn(page, "Most important"), ["Book the room", "Renew licence", "Fix cohort data"]), (await titlesIn(page, "Most important")).join(" | "));

  await page.getByRole("link", { name: "Clear" }).click();
  await page.waitForURL((url) => !url.search.includes("minutes"));
  await page.getByRole("link", { name: "Send attendance report" }).first().waitFor();
  check("clearing the time restores the normal plan", same(await titlesIn(page, "Most important"), ["Send attendance report", "Tight deadline", "Review numbers"]));

  for (const bad of ["abc", "0", "-5", "99999"]) {
    await openPlan(page, `?minutes=${bad}`);
    check(`invalid time "${bad}" is ignored`, !(await main(page).innerText()).includes("Planned"));
  }

  // ---------- Workspaces ----------
  console.log("\n# Workspace scope");
  await openPlan(page, `?workspace=${a2}`);
  const scoped = await main(page).innerText();
  check("a workspace's plan excludes the other one", !scoped.includes("Send attendance report") && scoped.includes("Review numbers"));
  check("its tasks are ranked within it", same(await titlesIn(page, "Most important"), ["Tight deadline", "Review numbers", "Prepare slides"]));
  await page.getByRole("link", { name: "1h", exact: true }).click();
  await page.waitForURL(new RegExp(`workspace=${a2}&minutes=60`));
  check("choosing a time keeps the workspace", true);
  await page.getByLabel("Minutes available").fill("90");
  await page.getByRole("button", { name: "Set", exact: true }).click();
  await page.waitForURL(new RegExp(`workspace=${a2}&minutes=90`));
  check("a custom time keeps the workspace", true);
  await openPlan(page, "?workspace=garbage");
  check("an invalid workspace falls back to all", (await main(page).innerText()).includes("Send attendance report"));

  // ---------- Acting on the plan ----------
  console.log("\n# Completing work");
  await openPlan(page);
  await page.getByRole("button", { name: "Mark Send attendance report complete" }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll("main a")].some((a) => a.checkVisibility() && a.textContent.trim() === "Send attendance report"), null, { timeout: 8000 });
  check("completing a task updates the database", psql(`select status from public.tasks where title='Send attendance report'`) === "done");
  const reshuffled = await titlesIn(page, "Most important");
  check("the plan reshuffles", same(reshuffled, ["Tight deadline", "Review numbers", "Book the room"]), reshuffled.join(" | "));
  await page.getByRole("link", { name: "Prepare slides" }).first().click();
  await page.waitForURL(`**/tasks/${slides}`);
  await page.getByRole("heading", { name: "Prepare slides" }).waitFor();
  check("a plan item opens its task", true);
  await page.goto(`${BASE}/plan`);
  psql(`insert into public.captures (owner_id, source_text) values ('${alice.id}', 'Unreviewed')`);
  await page.reload();
  await page.getByRole("heading", { name: "How much time do you have?" }).waitFor();
  check("it says when requests aren't in the plan yet", (await main(page).innerText()).includes("1 request isn't in this plan yet"));
  check("the plan never calls AI", (await mockCalls()) === callsBefore, `${(await mockCalls()) - callsBefore} calls`);

  // ---------- Isolation ----------
  console.log("\n# Isolation");
  const bobPage = await newPage();
  await login(bobPage, bob);
  await openPlan(bobPage);
  const bobPlan = await main(bobPage).innerText();
  check("another user's plan is empty", bobPlan.includes("Nothing pressing today.") && !bobPlan.includes("Tight deadline") && !bobPlan.includes("KPI sign-off"));
  await openPlan(bobPage, `?workspace=${a1}`);
  check("another user's workspace can't scope the plan", !(await main(bobPage).innerText()).includes("Tight deadline") && !(await bobPage.content()).includes("Book the room"));
  check("no console problems for the second user", bobPage.problems.length === 0, bobPage.problems.join(" | ").slice(0, 300));
  await bobPage.context().close();

  // ---------- Mobile ----------
  console.log("\n# Mobile 320px");
  const phone = await newPage({ width: 320, height: 568 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await login(phone, alice);
  await phone.getByRole("link", { name: "Open today's full plan" }).tap();
  await phone.waitForURL("**/plan");
  await phone.getByRole("heading", { name: "Most important" }).waitFor();
  check("the plan is reachable on mobile from the dashboard", true);
  await phone.waitForLoadState("networkidle");
  let m = await phone.evaluate(() => ({ s: document.documentElement.scrollWidth, i: window.innerWidth }));
  check("no sideways scrolling on the plan", m.s <= m.i, `${m.s}/${m.i}`);
  await phone.goto(`${BASE}/plan?minutes=120`);
  await phone.getByRole("heading", { name: "Won't fit in your time" }).waitFor();
  await phone.waitForLoadState("networkidle");
  m = await phone.evaluate(() => ({ s: document.documentElement.scrollWidth, i: window.innerWidth }));
  check("no sideways scrolling with time set", m.s <= m.i, `${m.s}/${m.i}`);
  check("the tab bar still has its four tabs", (await phone.locator(`nav.fixed${LIVE} a`).count()) === 4);
  await shot(phone, "p5-mobile-plan");
  await phone.context().close();

  check("no console problems", page.problems.filter((p) => !/404|Failed to load resource/.test(p)).length === 0, page.problems.join(" | ").slice(0, 300));
  await page.context().close();
});
