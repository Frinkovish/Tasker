import { BASE, browser, check, createUser, psql, runSuite } from "./lib.mjs";

await runSuite(async () => {
  const user = createUser("no-ai");
  const ws = psql(`select id from public.workspaces where owner_id='${user.id}' order by slot limit 1`);
  const id = psql(`insert into public.captures (owner_id, source_text) values ('${user.id}', 'No AI here') returning id`);
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/dashboard");
  await page.goto(`${BASE}/inbox/${id}`);
  await page.getByRole("button", { name: "Save as task" }).waitFor();
  check("says AI isn't set up", (await page.locator("main:visible").innerText()).includes("aren't set up"));
  check("the form starts empty", (await page.getByLabel("Title").inputValue()) === "");
  await page.getByLabel("Title").fill("Saved without AI");
  await page.getByLabel("Workspace", { exact: true }).selectOption(ws);
  await page.getByRole("button", { name: "Save as task" }).click();
  await page.waitForURL("**/inbox");
  check("a task can be saved without AI", psql(`select source_request from public.tasks where workspace_id='${ws}'`) === "No AI here");

  // The assistant without AI: it can't answer, but what's already there still works.
  const task = psql(`select id from public.tasks where workspace_id='${ws}'`);
  const conversation = psql(`insert into public.assistant_conversations (owner_id, title) values ('${user.id}', 'An old conversation') returning id`);
  const message = psql(`insert into public.assistant_messages (conversation_id, role, content) values ('${conversation}', 'assistant', 'An old reply') returning id`);
  psql(`insert into public.assistant_proposals (message_id, task_id, payload) values ('${message}', '${task}', '{"kind":"add_note","body":"Confirmed without AI"}')`);
  await page.goto(`${BASE}/assistant`);
  await page.getByText("isn't set up on this server").first().waitFor();
  const main = page.locator("main:visible");
  check("the assistant says it isn't set up", true);
  check("no suggestions or message box", (await main.getByRole("list", { name: "Suggested questions" }).count()) === 0 && (await main.getByLabel("Message the assistant").count()) === 0);
  await main.getByRole("link", { name: /An old conversation/ }).click();
  await main.getByText("An old reply").waitFor();
  check("old conversations can still be read", true);
  await main.getByRole("button", { name: /^Confirm/ }).click();
  await main.getByText("Applied").waitFor();
  check("a waiting change can still be confirmed", psql(`select body from public.task_notes where task_id='${task}'`) === "Confirmed without AI");
});
