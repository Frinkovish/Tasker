import { BASE, browser, check, createUser, psql, runSuite, shot } from "./lib.mjs";


await runSuite(async () => {
  const user = createUser("real");
  const [w1, w2] = psql(`select id from public.workspaces where owner_id='${user.id}' order by slot`).split("\n");
  const emma = psql(`insert into public.stakeholders (workspace_id, name) values ('${w1}','Emma') returning id`);
  const add = (ws, title, req, extra = "") => psql(`insert into public.tasks (workspace_id, title, source_request, priority, deadline, estimated_minutes, stakeholder_id, status, waiting_for) values ('${ws}', '${title}', '${req}', ${extra || "'medium', null, null, null, 'todo', null"}) returning id`);
  const dash = add(w1, "Update the ELD dashboard", "Emma asked me to update the ELD dashboard", `'high', now() - interval '2 days', 90, '${emma}', 'todo', null`);
  add(w2, "Send the attendance report", "Send the attendance report", `'medium', now() + interval '1 day', 45, null, 'todo', null`);
  add(w1, "Finalize the budget", "Finalize the budget", `'medium', null, null, null, 'waiting', 'Daniel'`);

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const problems = [];
  page.on("console", (m) => { if (m.type() === "error") problems.push(m.text()); });
  page.on("pageerror", (e) => problems.push(e.message));
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
  await page.goto(`${BASE}/assistant`);
  const main = page.locator("main:visible");
  const box = main.getByLabel("Message the assistant");
  await box.waitFor();
  await page.waitForLoadState("networkidle");
  async function ask(text) {
    const before = await page.locator("main:visible [role=log] > div").count();
    const started = Date.now();
    await box.fill(text);
    await main.getByRole("button", { name: "Send" }).click();
    await page.waitForFunction((n) => {
      const log = [...document.querySelectorAll("main [role=log]")].find((el) => el.offsetParent);
      return log && log.children.length >= n + 2 && !log.querySelector("[role=status]");
    }, before, { timeout: 90000 });
    const entries = await page.locator("main:visible [role=log] > div").all();
    const reply = await entries.at(-1).innerText();
    console.log(`  (${((Date.now() - started) / 1000).toFixed(1)}s) > ${reply.replace(/\n/g, "\n    ")}`);
    return reply;
  }
  let reply = await ask("What should I work on today?");
  check("today: names the top task with its reason", /ELD dashboard/.test(reply) && /overdue/i.test(reply));
  reply = await ask("What am I waiting for?");
  check("waiting: finds it", /budget/i.test(reply) && /Daniel/.test(reply));
  reply = await ask("Move the dashboard deadline to Friday.");
  const card = main.getByRole("log").locator("div.rounded-lg.border").filter({ hasText: "Update the ELD dashboard" });
  await card.getByRole("button", { name: /^Confirm/ }).waitFor();
  const friday = psql(`select to_char(d, 'YYYY-MM-DD') from generate_series(current_date + 1, current_date + 7, interval '1 day') d where extract(dow from d) = 5`);
  const cardText = await card.innerText();
  check("proposes the right Friday", cardText.includes("Fri"), cardText.replace(/\n/g, " | "));
  check("nothing has changed before confirming", psql(`select deadline < now() from public.tasks where id='${dash}'`) === "t");
  await shot(page, "assistant-real-proposal");
  await card.getByRole("button", { name: /^Confirm/ }).click();
  await card.getByText("Applied").waitFor();
  const local = psql(`select to_char(deadline at time zone 'Africa/Tunis', 'YYYY-MM-DD') from public.tasks where id='${dash}'`);
  check("confirming moves it to that Friday", local === friday, `${local} vs ${friday}`);
  reply = await ask("Is it still overdue?");
  check("the next answer reflects the change", !/\byes\b/i.test(reply), reply);
  reply = await ask("Delete it");
  check("deleting is refused plainly", /can['’]t|cannot|isn['’]t possible|not possible/i.test(reply), reply);
  check("the task is still there", psql(`select count(*) from public.tasks where id='${dash}'`) === "1");
  await shot(page, "assistant-real-conversation");
  check("no browser errors", problems.length === 0, problems.join(" | ").slice(0, 300));
});
