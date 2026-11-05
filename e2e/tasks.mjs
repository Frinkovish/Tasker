import { BASE, check, createUser, LIVE, login, main, newPage, psql, quote, runSuite, SB_KEY, SB_URL, shot, stat, ZONE } from "./lib.mjs";

function zoneDate(offsetDays) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(Date.now() + offsetDays * 86_400_000));
}


const taskTitles = (page) => page.locator(`main${LIVE} ul li a[href^="/tasks/"]`).allInnerTexts();
const waitForTitles = (page, expected) =>
  page.waitForFunction(
    (want) => {
      const got = [...document.querySelectorAll('main ul li a[href^="/tasks/"]')]
        .filter((el) => el.checkVisibility())
        .map((el) => el.textContent.trim())
        .sort();
      return JSON.stringify(got) === JSON.stringify([...want].sort());
    },
    expected,
    { timeout: 8000 },
  ).then(() => true, () => false);

await runSuite(async () => {
  const alice = createUser("alice");
  const bob = createUser("bob");
  const [a1, a2] = alice.workspaces;
  const seed = psql(`
    with s as (insert into public.stakeholders (workspace_id, name) values
      ('${a1}', 'Nadia'), ('${a2}', 'Emma') returning id, name),
    p as (insert into public.projects (workspace_id, name) values
      ('${a1}', 'Reporting'), ('${a2}', 'ELD') returning id, name)
    select (select id from s where name='Nadia') || ',' || (select id from s where name='Emma') || ',' ||
           (select id from p where name='Reporting') || ',' || (select id from p where name='ELD');`).split(",");
  const [nadia, emma, reporting, eld] = seed;

  const page = await newPage();
  await login(page, alice);

  // ---------- Capture ----------
  console.log("\n# Capture is saved");
  const REQUEST = "Emma asked me to update the ELD dashboard before Thursday. It should include validation rules.";
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const box = dialog.getByLabel("Describe the request");

  await page.route("**/dashboard*", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
  await box.fill(REQUEST);
  await box.press("Enter");
  await dialog.getByRole("alert").waitFor();
  check("a network failure keeps the text and explains", (await box.inputValue()) === REQUEST, await dialog.getByRole("alert").innerText());
  check("a failed capture isn't saved", psql(`select count(*) from public.captures where owner_id='${alice.id}'`) === "0");
  check("a failed capture doesn't crash the page", !(await page.getByText("Something went wrong").isVisible()));
  await page.unroute("**/dashboard*");

  await box.press("Enter");
  await dialog.getByText("Captured and saved to your inbox").waitFor();
  check("capturing works once the network is back", (await box.inputValue()) === "");
  check("the capture is really in the database", psql(`select source_text from public.captures where owner_id='${alice.id}'`) === REQUEST);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page.locator(`aside${LIVE}`).getByRole("link", { name: /Inbox/ }).getByText("To review: 1").waitFor({ timeout: 8000 });
  check("the sidebar shows one to review", true);
  await page.getByRole("link", { name: "1 request is waiting for review" }).waitFor();
  check("the dashboard says a request is waiting", true);
  check("recent requests lists it as not reviewed", (await main(page).innerText()).includes("Not reviewed"));

  await page.goto(`${BASE}/inbox`);
  await page.getByRole("heading", { name: "To review" }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "To review" }).waitFor();
  check("a capture survives a reload", (await main(page).innerText()).includes(REQUEST));
  await shot(page, "p3-inbox");

  // ---------- Discard ----------
  const inboxBox = page.getByRole("main").getByLabel("Describe the request");
  await inboxBox.fill("Throwaway request");
  await inboxBox.press("Enter");
  await page.getByText("Throwaway request").waitFor();
  const throwawayRow = page.locator(`main${LIVE} li`).filter({ hasText: "Throwaway request" });
  page.once("dialog", (d) => d.dismiss());
  await throwawayRow.getByRole("button", { name: "Discard this request" }).click();
  await page.waitForTimeout(500);
  check("cancelling keeps the request", psql(`select count(*) from public.captures where source_text='Throwaway request' and owner_id='${alice.id}'`) === "1");
  page.once("dialog", (d) => d.accept());
  await throwawayRow.getByRole("button", { name: "Discard this request" }).click();
  await page.getByText("Throwaway request").waitFor({ state: "detached" });
  check("confirming discards the request", psql(`select count(*) from public.captures where source_text='Throwaway request' and owner_id='${alice.id}'`) === "0");

  // ---------- Review ----------
  console.log("\n# Reviewing a request into a task");
  await page.locator(`main${LIVE} li`).filter({ hasText: REQUEST }).getByRole("link", { name: "Review" }).click();
  await page.waitForURL(/\/inbox\/.+/);
  const captureUrl = page.url();
  await page.getByRole("heading", { name: "Review request" }).waitFor();
  check("the original request is shown", (await main(page).locator("blockquote").innerText()) === REQUEST);
  const workspaceSelect = page.getByLabel("Workspace", { exact: true });
  check("no workspace is assumed", (await workspaceSelect.inputValue()) === "");
  check("stakeholder and project wait for a workspace", (await page.getByLabel("Stakeholder").isDisabled()) && (await page.getByLabel("Project").isDisabled()));
  check("no deadline is assumed", (await page.getByLabel("Deadline").inputValue()) === "");

  const save = page.getByRole("button", { name: "Save as task" });
  await page.getByLabel("Title").fill("Update ELD dashboard");
  await page.getByLabel("Priority").selectOption("high");
  await save.click();
  await page.getByRole("alert").filter({ hasText: "Choose a workspace." }).waitFor();
  check("a workspace is required", psql(`select count(*) from public.tasks where workspace_id in ('${a1}','${a2}')`) === "0");
  check("a failed save keeps the typed title", (await page.getByLabel("Title").inputValue()) === "Update ELD dashboard");
  check("a failed save keeps the chosen priority", (await page.getByLabel("Priority").inputValue()) === "high");

  await workspaceSelect.selectOption(a1);
  const stakeholderOptions = () => page.getByLabel("Stakeholder").locator("option").allInnerTexts();
  check("only that workspace's stakeholders are offered", (await stakeholderOptions()).join() === "None,Nadia");
  await page.getByLabel("Stakeholder").selectOption(nadia);
  await workspaceSelect.selectOption(a2);
  check("changing workspace clears the old stakeholder and offers its own", (await page.getByLabel("Stakeholder").inputValue()) === "" && (await stakeholderOptions()).join() === "None,Emma");

  await page.getByLabel("Stakeholder").selectOption(emma);
  await page.getByLabel("Project").selectOption(eld);
  await page.getByLabel("Priority").selectOption("high");
  await page.getByLabel("Estimated minutes (optional)").fill("not a number");
  await page.getByLabel("Deadline").fill(zoneDate(2));
  await page.getByLabel("Time (optional, otherwise end of day)").fill("17:00");
  await page.getByLabel("Next action (optional)").fill("Pull the enrollment numbers");
  await save.click();
  await page.getByRole("alert").filter({ hasText: "whole number of minutes" }).waitFor();
  check("a bad estimate is refused", true);
  check("a failed save keeps the workspace", (await workspaceSelect.inputValue()) === a2);
  check("a failed save keeps the stakeholder", (await page.getByLabel("Stakeholder").inputValue()) === emma);
  check("a failed save keeps the deadline", (await page.getByLabel("Deadline").inputValue()) === zoneDate(2));
  check("the capture is still there after failures", psql(`select count(*) from public.captures where owner_id='${alice.id}'`) === "1");
  await shot(page, "p3-review");

  await page.getByLabel("Estimated minutes (optional)").fill("45");
  await save.click();
  await page.waitForURL("**/inbox");
  await page.getByText("Nothing to review.").waitFor();
  check("saving returns to the inbox and clears the request", psql(`select count(*) from public.captures where owner_id='${alice.id}'`) === "0");

  const saved = psql(`select workspace_id||'|'||stakeholder_id||'|'||project_id||'|'||priority||'|'||status||'|'||estimated_minutes||'|'||next_action
    from public.tasks where workspace_id='${a2}' and title='Update ELD dashboard'`);
  check("the task has everything chosen", saved === `${a2}|${emma}|${eld}|high|todo|45|Pull the enrollment numbers`, saved);
  check("the original words are kept exactly", psql(`select source_request from public.tasks where workspace_id='${a2}'`) === REQUEST);
  check("the deadline uses the server's zone, not the browser's",
    psql(`select to_char(deadline at time zone '${ZONE}', 'YYYY-MM-DD HH24:MI') from public.tasks where workspace_id='${a2}'`) === `${zoneDate(2)} 17:00`);
  const firstTask = psql(`select id from public.tasks where workspace_id='${a2}'`);

  await page.goto(captureUrl);
  await page.getByRole("heading", { name: "Request not found" }).waitFor();
  check("a reviewed request's old link says it's gone", true);

  // ---------- Reviewing in two tabs ----------
  psql(`insert into public.captures (owner_id, source_text) values ('${alice.id}', 'Reviewed twice')`);
  const twiceId = psql(`select id from public.captures where owner_id='${alice.id}'`);
  const tab1 = await page.context().newPage();
  const tab2 = await page.context().newPage();
  for (const tab of [tab1, tab2]) {
    tab.problemsLocal = [];
    tab.on("console", (m) => { if (m.type() === "error") tab.problemsLocal.push(m.text().slice(0, 200)); });
    tab.on("pageerror", (e) => tab.problemsLocal.push(e.message.slice(0, 200)));
    await tab.goto(`${BASE}/inbox/${twiceId}`);
    await tab.getByLabel("Title").fill("Twice");
    await tab.getByLabel("Description (optional)").fill("Typed before choosing");
    await tab.getByLabel("Priority").selectOption("low");
    await tab.getByLabel("Workspace", { exact: true }).selectOption(a1);
    check("choosing a workspace keeps what's already typed",
      (await tab.getByLabel("Title").inputValue()) === "Twice" &&
      (await tab.getByLabel("Description (optional)").inputValue()) === "Typed before choosing" &&
      (await tab.getByLabel("Priority").inputValue()) === "low");
  }
  await tab1.bringToFront();
  await tab1.getByRole("button", { name: "Save as task" }).click();
  await tab1.waitForURL("**/inbox", { timeout: 10000 }).catch(async (e) => {
    console.log("DEBUG url:", tab1.url());
    console.log("DEBUG workspace value:", await tab1.getByLabel("Workspace", { exact: true }).inputValue().catch(() => "n/a"));
    console.log("DEBUG alerts:", await tab1.getByRole("alert").allInnerTexts().catch(() => []));
    console.log("DEBUG db:", psql(`select count(*) from public.tasks where workspace_id='${a1}' and title='Twice'`), psql(`select count(*) from public.captures where owner_id='${alice.id}'`));
    console.log("DEBUG console:", tab1.problemsLocal);
    await shot(tab1, "p3-debug-tab1");
    throw e;
  });
  await tab2.getByRole("button", { name: "Save as task" }).click();
  await tab2.getByRole("alert").filter({ hasText: "already been reviewed" }).waitFor();
  check("reviewing in a second tab can't create a duplicate", psql(`select count(*) from public.tasks where workspace_id='${a1}' and title='Twice'`) === "1");
  await tab1.close();
  await tab2.close();

  // ---------- Task list ----------
  console.log("\n# Task list and filters");
  const insertTask = (ws, title, extra = "") => {
    return psql(`insert into public.tasks (workspace_id, title, source_request, status, priority, deadline, stakeholder_id, project_id, waiting_for)
      select ws, title, src, st, pr, dl, sh, pj, wf from (values (${extra})) as v(ws, title, src, st, pr, dl, sh, pj, wf) returning id`);
  };
  void insertTask;
  const add = (ws, title, status, priority, deadline, sh = null, pj = null, wf = null) =>
    psql(`insert into public.tasks (workspace_id, title, source_request, status, priority, deadline, stakeholder_id, project_id, waiting_for)
      values ('${ws}', ${quote(title)}, ${quote(`Request: ${title}`)}, '${status}', '${priority}', ${deadline ? `now() + interval '${deadline}'` : "null"},
        ${sh ? `'${sh}'` : "null"}, ${pj ? `'${pj}'` : "null"}, ${wf ? quote(wf) : "null"}) returning id`);
  psql(`delete from public.tasks where workspace_id='${a1}' and title='Twice'`);
  const overdueId = add(a1, "Send attendance report", "todo", "critical", "-2 days", nadia, reporting);
  add(a1, "Get KPI sign-off", "waiting", "high", null, nadia, null, "Nadia");
  add(a1, "Tidy documentation", "todo", "low", null);
  add(a2, "Finished export", "done", "medium", "-1 day");
  add(a2, "Cancelled idea", "cancelled", "low", null);
  add(a1, "Due very soon", "in_progress", "medium", "1 hour");
  const ACTIVE = ["Send attendance report", "Get KPI sign-off", "Tidy documentation", "Due very soon", "Update ELD dashboard"];

  await page.goto(`${BASE}/tasks`);
  await page.getByRole("heading", { name: "Tasks" }).waitFor();
  check("the default view shows active tasks only", await waitForTitles(page, ACTIVE), (await taskTitles(page)).join(" | "));
  check("overdue work is listed first", (await taskTitles(page))[0] === "Send attendance report");
  check("the list counts its tasks", (await main(page).innerText()).includes("5 tasks"));
  await shot(page, "p3-tasks");

  const filter = (name) => page.getByLabel(`Filter by ${name}`);
  await filter("priority").selectOption("critical");
  check("filtering by priority", await waitForTitles(page, ["Send attendance report"]));
  await page.waitForURL(/priority=critical/);
  check("filters are in the URL", true);
  await page.reload();
  check("filters survive a reload", (await filter("priority").inputValue()) === "critical" && (await waitForTitles(page, ["Send attendance report"])));

  await page.getByRole("button", { name: "Clear filters" }).click();
  check("clearing filters restores the list", await waitForTitles(page, ACTIVE));

  await filter("status").selectOption("waiting");
  check("filtering by status", await waitForTitles(page, ["Get KPI sign-off"]));
  check("the row says who it's waiting for", (await main(page).innerText()).includes("Waiting for Nadia"));
  await filter("status").selectOption("done");
  check("finished work can be found", await waitForTitles(page, ["Finished export"]));
  await filter("status").selectOption("all");
  check("all statuses shows everything", await waitForTitles(page, [...ACTIVE, "Finished export", "Cancelled idea"]));
  const allRows = await taskTitles(page);
  check("finished work sorts last", ["Finished export", "Cancelled idea"].includes(allRows.at(-1)) && ["Finished export", "Cancelled idea"].includes(allRows.at(-2)));
  await filter("status").selectOption("active");

  await filter("deadline").selectOption("overdue");
  check("filtering by overdue, ignoring tasks with no deadline", await waitForTitles(page, ["Send attendance report"]));
  await filter("deadline").selectOption("none");
  check("filtering by no deadline", await waitForTitles(page, ["Get KPI sign-off", "Tidy documentation"]));
  await filter("deadline").selectOption("");

  await filter("workspace").selectOption(a2);
  check("filtering by workspace", await waitForTitles(page, ["Update ELD dashboard"]));
  const scopedOptions = await filter("stakeholder").locator("option").allInnerTexts();
  check("stakeholder options follow the workspace", scopedOptions.join() === "Any stakeholder,Emma", scopedOptions.join());
  await filter("workspace").selectOption("all");
  await page.waitForFunction(() => !location.search.includes("workspace"));

  await filter("stakeholder").selectOption(nadia);
  check("filtering by stakeholder", await waitForTitles(page, ["Send attendance report", "Get KPI sign-off"]));
  await filter("workspace").selectOption(a2);
  check("changing workspace drops a stakeholder from the other one", await waitForTitles(page, ["Update ELD dashboard"]));
  await filter("workspace").selectOption("all");
  await page.waitForFunction(() => !location.search.includes("workspace"));
  await filter("project").selectOption(reporting);
  check("filtering by project", await waitForTitles(page, ["Send attendance report"]));
  await filter("project").selectOption("");

  const search = page.getByRole("searchbox", { name: "Search tasks" });
  await search.fill("ATTENDANCE report");
  check("search ignores case and matches every word", await waitForTitles(page, ["Send attendance report"]));
  await search.fill("validation rules");
  check("search covers the original request", await waitForTitles(page, ["Update ELD dashboard"]));
  await search.fill("Nadia");
  check("search covers stakeholder names", await waitForTitles(page, ["Send attendance report", "Get KPI sign-off"]));
  await search.fill("zzz-nothing");
  await page.getByText("No tasks match these filters.").waitFor();
  check("no matches says so", true);
  await page.getByRole("button", { name: "Clear filters" }).click();
  check("clearing also clears the search box", (await search.inputValue()) === "" && (await waitForTitles(page, ACTIVE)));

  // ---------- Mark complete ----------
  console.log("\n# Marking complete");
  await page.getByRole("button", { name: "Mark Tidy documentation complete" }).click();
  check("a completed task leaves the active list", await waitForTitles(page, ACTIVE.filter((t) => t !== "Tidy documentation")));
  check("completing sets status and completed_at", psql(`select status||'|'||(completed_at is not null) from public.tasks where title='Tidy documentation' and workspace_id='${a1}'`) === "done|true");
  await filter("status").selectOption("done");
  await page.getByRole("button", { name: "Reopen Tidy documentation" }).waitFor();
  await page.getByRole("button", { name: "Reopen Tidy documentation" }).click();
  await page.getByRole("button", { name: "Reopen Tidy documentation" }).waitFor({ state: "detached" });
  check("reopening clears completed_at", psql(`select status||'|'||(completed_at is null) from public.tasks where title='Tidy documentation' and workspace_id='${a1}'`) === "todo|true");

  // ---------- Task detail ----------
  console.log("\n# Task detail");
  await page.goto(`${BASE}/tasks/${firstTask}`);
  await page.getByRole("heading", { name: "Update ELD dashboard" }).waitFor();
  check("the original request is shown", (await main(page).locator("blockquote").innerText()) === REQUEST);
  check("the form shows the deadline in the server's zone", (await page.getByLabel("Deadline").inputValue()) === zoneDate(2) && (await page.getByLabel("Time (optional, otherwise end of day)").inputValue()) === "17:00");
  check("only this workspace's stakeholders are offered", (await page.getByLabel("Stakeholder").locator("option").allInnerTexts()).join() === "None,Emma");
  check("history starts with creation", (await main(page).innerText()).includes("Task created"));

  await page.getByLabel("Title").fill("   ");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("alert").filter({ hasText: "Enter a title." }).waitFor();
  check("a blank title is refused", psql(`select title from public.tasks where id='${firstTask}'`) === "Update ELD dashboard");

  await page.getByLabel("Title").fill("Update ELD dashboard v2");
  await page.getByLabel("Status").selectOption("waiting");
  await page.getByLabel("Priority").selectOption("critical");
  await page.getByLabel("Deadline").fill(zoneDate(5));
  await page.getByLabel("Time (optional, otherwise end of day)").fill("");
  await page.getByLabel("Waiting for (optional)").fill("Emma");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("heading", { name: "Update ELD dashboard v2" }).waitFor();
  const updated = psql(`select title||'|'||status||'|'||priority||'|'||waiting_for||'|'||to_char(deadline at time zone '${ZONE}', 'YYYY-MM-DD HH24:MI')||'|'||source_request from public.tasks where id='${firstTask}'`);
  check("edits are saved, and no time means end of day", updated === `Update ELD dashboard v2|waiting|critical|Emma|${zoneDate(5)} 23:59|${REQUEST}`, updated);
  check("the original request didn't change", true);
  check("a date with no time shows an empty time field", (await page.getByLabel("Time (optional, otherwise end of day)").inputValue()) === "");

  const history = await main(page).innerText();
  check("history records each change in plain words",
    history.includes('Title changed from "Update ELD dashboard" to "Update ELD dashboard v2"') &&
    history.includes("Status changed from To do to Waiting") &&
    history.includes("Priority changed from High to Critical") &&
    history.includes("Deadline changed from") &&
    history.includes("Waiting for changed from none to Emma"));

  await page.evaluate((other) => {
    const select = document.querySelector('select[name="stakeholderId"]');
    select.add(new Option("Nadia (forged)", other));
    select.value = other;
  }, nadia);
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("alert").filter({ hasText: "isn't in this task's workspace" }).waitFor();
  check("a stakeholder from the other workspace is refused", psql(`select stakeholder_id from public.tasks where id='${firstTask}'`) === emma);
  await page.reload();
  await page.getByRole("heading", { name: "Update ELD dashboard v2" }).waitFor();

  await page.getByLabel("Deadline").fill("");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText("Deadline changed from").nth(1).waitFor();
  check("a deadline can be removed", psql(`select deadline is null from public.tasks where id='${firstTask}'`) === "t");

  // Subtasks
  const subtaskBox = page.getByLabel("New subtask");
  await subtaskBox.fill("Check the numbers");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Mark Check the numbers complete" }).waitFor();
  check("a subtask can be added", psql(`select count(*) from public.subtasks where task_id='${firstTask}'`) === "1");
  await page.getByRole("button", { name: "Mark Check the numbers complete" }).click();
  await page.getByRole("button", { name: "Reopen Check the numbers" }).waitFor();
  check("a subtask can be completed", psql(`select status||'|'||(completed_at is not null) from public.subtasks where task_id='${firstTask}'`) === "done|true");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete Check the numbers" }).click();
  await page.getByRole("button", { name: "Reopen Check the numbers" }).waitFor({ state: "detached" });
  check("a subtask can be deleted", psql(`select count(*) from public.subtasks where task_id='${firstTask}'`) === "0");

  // Notes
  await page.getByLabel("New note").fill("Spoke to Emma.\nShe confirmed the scope.");
  await page.getByRole("button", { name: "Add note" }).click();
  await page.getByText("She confirmed the scope.").waitFor();
  check("a note can be added", psql(`select count(*) from public.task_notes where task_id='${firstTask}'`) === "1");
  check("the note box clears", (await page.getByLabel("New note").inputValue()) === "");
  await shot(page, "p3-task-detail");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete note" }).click();
  await page.getByText("She confirmed the scope.").waitFor({ state: "detached" });
  check("a note can be deleted", psql(`select count(*) from public.task_notes where task_id='${firstTask}'`) === "0");

  // ---------- Dashboard on real tasks ----------
  console.log("\n# Dashboard on real tasks");
  await page.goto(`${BASE}/dashboard`);
  await page.getByRole("heading", { name: "Dashboard" }).waitFor();
  const stats = await stat(page);
  check("the numbers match the tasks", stats.Active === 5 && stats.Overdue === 1 && stats["Due today"] === 1 && stats.Waiting === 2, JSON.stringify(stats));
  const firstPriority = await page.locator(`ol${LIVE} > li`).first().innerText();
  check("the overdue task is recommended first, with its reason", firstPriority.includes("Send attendance report") && firstPriority.includes("Overdue by 2 days"));
  check("waiting tasks aren't recommended", !(await page.locator(`ol${LIVE}`).innerText()).includes("Get KPI sign-off"));
  await shot(page, "p3-dashboard");
  await page.getByRole("link", { name: /^Overdue: 1/ }).click();
  await page.waitForURL(/deadline=overdue/);
  check("the overdue number opens that list", await waitForTitles(page, ["Send attendance report"]));
  await page.goto(`${BASE}/dashboard?workspace=${a2}`);
  await page.getByRole("heading", { name: "Dashboard" }).waitFor();
  check("a workspace's numbers exclude the other one", (await stat(page)).Active === 1, JSON.stringify(await stat(page)));
  await page.getByRole("link", { name: /^Active: 1/ }).click();
  await page.waitForURL(new RegExp(`/tasks\\?workspace=${a2}`));
  check("stat links stay in the workspace", true);
  await page.goto(`${BASE}/dashboard`);
  await page.locator(`ol${LIVE}`).getByRole("link", { name: "Send attendance report" }).click();
  await page.waitForURL(`**/tasks/${overdueId}`);
  await page.getByRole("heading", { name: "Send attendance report" }).waitFor();
  check("a recommendation opens its task", true);

  await page.goto(`${BASE}/workspaces/${a1}`);
  await page.getByRole("heading", { name: "Active tasks" }).waitFor();
  const wsText = await main(page).innerText();
  check("a workspace page lists its own active tasks", wsText.includes("Send attendance report") && !wsText.includes("Update ELD dashboard"));

  // ---------- Hostile and awkward input ----------
  console.log("\n# Awkward input");
  const HOSTILE = `<img src=x onerror="window.__pwned=1">`;
  const LONG = "x".repeat(200);
  add(a1, HOSTILE, "todo", "medium", null);
  const longId = add(a1, LONG, "todo", "medium", null);
  psql(`update public.tasks set description = ${quote("y".repeat(3000))}, next_action = ${quote("z".repeat(400))} where id='${longId}'`);
  await page.goto(`${BASE}/tasks`);
  await page.getByText(HOSTILE).first().waitFor();
  check("HTML in a title shows as text and doesn't run", (await page.evaluate(() => window.__pwned)) === undefined);
  check("no console problems on desktop", page.problems.filter((p) => !/404|Failed to fetch|ERR_FAILED|Failed to load resource/.test(p)).length === 0, page.problems.join(" | ").slice(0, 300));

  // ---------- Mobile ----------
  console.log("\n# Mobile 320px");
  const phone = await newPage({ width: 320, height: 568 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await login(phone, alice);
  psql(`insert into public.captures (owner_id, source_text) values ('${alice.id}', ${quote("u".repeat(600))})`);
  const longCapture = psql(`select id from public.captures where owner_id='${alice.id}' limit 1`);
  for (const route of ["dashboard", "inbox", `inbox/${longCapture}`, "tasks", `tasks/${longId}`, `tasks/${firstTask}`, `workspaces/${a1}`]) {
    await phone.goto(`${BASE}/${route}`);
    await phone.locator(`main${LIVE} h1`).first().waitFor();
    await phone.waitForLoadState("networkidle");
    const m = await phone.evaluate(() => ({ s: document.documentElement.scrollWidth, i: window.innerWidth }));
    check(`no sideways scrolling on /${route.split("/")[0]}${route.includes("/") ? "/[id]" : ""}`, m.s <= m.i, `${m.s}/${m.i}`);
  }
  await phone.goto(`${BASE}/tasks`);
  await phone.getByRole("heading", { name: "Tasks" }).waitFor();
  check("filters start collapsed on mobile", !(await phone.getByLabel("Filter by status").isVisible()));
  await phone.getByRole("button", { name: "Filters" }).tap();
  await phone.getByLabel("Filter by status").waitFor();
  await phone.getByLabel("Filter by priority").selectOption("critical");
  check("filters work on mobile", await waitForTitles(phone, ["Send attendance report", "Update ELD dashboard v2"]));
  await phone.getByRole("button", { name: "Mark Send attendance report complete" }).tap();
  check("tasks can be completed on mobile", await waitForTitles(phone, ["Update ELD dashboard v2"]));
  await shot(phone, "p3-mobile-tasks");
  await phone.goto(`${BASE}/inbox/${longCapture}`);
  await phone.getByRole("heading", { name: "Review request" }).waitFor();
  await shot(phone, "p3-mobile-review");
  await phone.goto(`${BASE}/tasks/${firstTask}`);
  await phone.getByRole("heading", { name: "Update ELD dashboard v2" }).waitFor();
  await shot(phone, "p3-mobile-task");
  await phone.context().close();

  // ---------- Isolation ----------
  console.log("\n# Isolation between users");
  const bobPage = await newPage();
  await login(bobPage, bob);
  await bobPage.goto(`${BASE}/tasks/${firstTask}`);
  await bobPage.getByRole("heading", { name: "Task not found" }).waitFor();
  check("another user's task shows not found", !(await bobPage.content()).includes("Update ELD dashboard"));
  await bobPage.goto(`${BASE}/inbox/${longCapture}`);
  await bobPage.getByRole("heading", { name: "Request not found" }).waitFor();
  check("another user's request shows not found", true);
  await bobPage.goto(`${BASE}/tasks?status=all`);
  await bobPage.getByText("No tasks yet.").waitFor();
  check("another user's task list is empty", true);
  await bobPage.goto(`${BASE}/inbox`);
  await bobPage.getByText("Nothing to review.").waitFor();
  check("another user's inbox is empty", !(await bobPage.locator("aside:visible").innerText()).match(/Inbox\s*To review/));

  const tokenRes = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SB_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: bob.email, password: bob.password }),
  });
  const { access_token: bobToken } = await tokenRes.json();
  const api = (route, init = {}) =>
    fetch(`${SB_URL}/rest/v1/${route}`, {
      ...init,
      headers: { apikey: SB_KEY, Authorization: `Bearer ${bobToken}`, "Content-Type": "application/json", Prefer: "return=representation", ...init.headers },
    });
  check("the API hides another user's captures", (await (await api(`captures?id=eq.${longCapture}`)).json()).length === 0);
  check("the API hides another user's tasks", (await (await api(`tasks?id=eq.${firstTask}`)).json()).length === 0);
  check("the API hides another user's history", (await (await api(`task_activity?task_id=eq.${firstTask}`)).json()).length === 0);
  const del = await (await api(`captures?id=eq.${longCapture}`, { method: "DELETE" })).json();
  check("the API can't delete another user's capture", del.length === 0 && psql(`select count(*) from public.captures where id='${longCapture}'`) === "1");
  const rpc = await api("rpc/review_capture", {
    method: "POST",
    body: JSON.stringify({ p_capture_id: longCapture, p_workspace_id: bob.workspaces[0], p_stakeholder_id: null, p_project_id: null, p_title: "Stolen", p_description: null, p_status: "todo", p_priority: "medium", p_deadline: null, p_estimated_minutes: null, p_next_action: null, p_waiting_for: null }),
  });
  check("the API can't review another user's capture", !rpc.ok && psql(`select count(*) from public.captures where id='${longCapture}'`) === "1" && psql(`select count(*) from public.tasks where title='Stolen'`) === "0", `${rpc.status}`);
  const patchSource = await api(`tasks?workspace_id=eq.${bob.workspaces[0]}`, { method: "PATCH", body: JSON.stringify({ source_request: "changed" }) });
  check("the API refuses to rewrite a source request", patchSource.status === 401 || patchSource.status === 403, `${patchSource.status}`);
  check("no console problems for the second user", bobPage.problems.filter((p) => !p.includes("404")).length === 0, bobPage.problems.join(" | ").slice(0, 300));
  await bobPage.context().close();
  await page.context().close();
});
