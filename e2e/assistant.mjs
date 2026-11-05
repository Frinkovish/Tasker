import { BASE, check, createUser, LIVE, login, main, MOCK, newPage, psql, quote, runSuite, shot } from "./lib.mjs";

const mockState = async () => (await fetch(`${MOCK}/assistant-last`)).json();


const box = (page) => main(page).getByLabel("Message the assistant");
const send = (page) => main(page).getByRole("button", { name: "Send" });
const log = (page) => main(page).getByRole("log", { name: "Conversation" });
async function openAssistant(page) {
  await page.goto(`${BASE}/assistant`);
  await box(page).waitFor();
  await page.waitForLoadState("networkidle");
}
async function ask(page, text) {
  await box(page).fill(text);
  await send(page).click();
}
const waitForText = (page, text, timeout = 30000) =>
  log(page).getByText(text).first().waitFor({ timeout });
const dbValue = (sql) => psql(sql);
const taskField = (id, field) => dbValue(`select ${field} from public.tasks where id = '${id}'`);
const conversationId = (page) => new URL(page.url()).searchParams.get("c");
const count = (sql) => Number(dbValue(`select count(*) from ${sql}`));

await runSuite(async () => {
  const alice = createUser("alice");
  const bob = createUser("bob");
  const [a1, a2] = alice.workspaces;
  const emma = psql(`insert into public.stakeholders (workspace_id, name, contact_details) values ('${a1}', 'Emma', 'emma-secret@example.invalid') returning id`);
  const add = ({ ws = a1, title, request, priority = "medium", deadline = "null", who = "null" }) =>
    psql(`insert into public.tasks (workspace_id, title, source_request, priority, deadline, stakeholder_id)
      values ('${ws}', ${quote(title)}, ${quote(request ?? `Request: ${title}`)}, '${priority}', ${deadline}, ${who === "null" ? "null" : `'${who}'`}) returning id`);
  const alpha = add({ title: "Alpha dashboard", priority: "high", deadline: "'2030-01-01 12:00+00'" });
  const stale = add({ title: "Stale report", deadline: "'2030-02-01 12:00+00'" });
  const renamed = add({ title: "Renamed thing", deadline: "'2030-03-01 12:00+00'" });
  const noteTask = add({ title: "Noted item", who: emma, request: "Emma asked for the noted item" });
  const late = add({ ws: a2, title: "Late item", deadline: "now() - interval '2 days'" });
  add({ title: "Later item", deadline: "now() + interval '30 days'" });

  const page = await newPage();

  console.log("\n# Signed out");
  await page.goto(`${BASE}/assistant`);
  await page.waitForURL("**/login**");
  check("the assistant needs signing in", page.url().includes("/login"));

  await login(page, alice);

  console.log("\n# Starting a conversation");
  await openAssistant(page);
  const suggestions = main(page).getByRole("list", { name: "Suggested questions" }).getByRole("button");
  check("suggested questions are offered", (await suggestions.count()) === 6, String(await suggestions.count()));
  check("there's nothing in the placeholder any more", !(await main(page).innerText()).includes("Not built yet"));
  check("an empty message can't be sent", await send(page).isDisabled());
  check("there are no old conversations yet", (await main(page).getByRole("heading", { name: "Recent conversations" }).count()) === 0);

  // Holds the request, to see what happens while it's waiting.
  await page.route("**/assistant", async (route) => {
    if (route.request().method() === "POST") await new Promise((r) => setTimeout(r, 1000));
    await route.continue();
  });
  await suggestions.filter({ hasText: "What tasks are overdue?" }).click();
  await log(page).getByRole("status").waitFor();
  check("the question appears straight away", await log(page).getByText("What tasks are overdue?").isVisible());
  check("it shows that it's working", (await log(page).getByRole("status").innerText()).includes("Checking your tasks"));
  check("a second message can't be sent meanwhile", await main(page).getByRole("button", { name: "Sending…" }).isDisabled());

  await page.waitForURL("**/assistant?c=*");
  await waitForText(page, "Late item (");
  await page.unroute("**/assistant");
  const first = conversationId(page);
  let text = await log(page).innerText();
  check("the question is shown once", text.split("What tasks are overdue?").length === 2);
  check("the status went away", (await log(page).getByRole("status").count()) === 0);
  check("the answer comes from real records, with its workspace", text.includes("Overdue (1):") && text.includes("Late item (Second job)"));
  check("it doesn't include tasks that aren't overdue", !text.includes("Alpha dashboard") && !text.includes("Later item"));
  const lateLink = log(page).getByRole("link", { name: "Late item" });
  check("the task is linked", (await lateLink.getAttribute("href")) === `/tasks/${late}`);
  check("the exchange was saved", count(`public.assistant_messages where conversation_id = '${first}'`) === 2);
  check("the conversation is titled from the question", dbValue(`select title from public.assistant_conversations where id = '${first}'`) === "What tasks are overdue?");

  await page.reload();
  await waitForText(page, "Late item (");
  check("it's still there after a reload", (await log(page).innerText()).includes("What tasks are overdue?"));
  check("suggestions only show for a new conversation", (await main(page).getByRole("list", { name: "Suggested questions" }).count()) === 0);

  let state = await mockState();
  check("the model gets strict output and tools, with reasoning off", state.last.strictReply === true && state.last.reasoning === "none");
  check("every tool only reads or proposes", state.last.tools.every((name) => /^(get|find|list|propose)_/.test(name)), state.last.tools.join(","));
  const context = state.last.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  check("the model is told the date and the real workspaces", /Calendar:/.test(context) && context.includes(a1) && context.includes(a2));

  console.log("\n# Keyboard");
  await box(page).fill("line one");
  await box(page).press("Shift+Enter");
  await box(page).pressSequentially("line two");
  check("Shift+Enter makes a new line", (await box(page).inputValue()) === "line one\nline two");
  await box(page).press("Enter");
  await waitForText(page, "You said: line one");
  check("Enter sends, keeping the same conversation", conversationId(page) === first);
  check("the box is cleared", (await box(page).inputValue()) === "");
  check("line breaks survive", (await log(page).innerText()).includes("line one\nline two"));

  console.log("\n# Asking for a change, then confirming");
  await ask(page, "MOCK_MOVE Alpha 2030-01-04");
  await waitForText(page, "ready for you to confirm below");
  let card = log(page).locator("div.rounded-lg.border").filter({ hasText: "Alpha dashboard" });
  let cardText = await card.innerText();
  check("the card names the real task and workspace", cardText.includes("Alpha dashboard") && cardText.includes("Deadline"));
  check("it shows the change as the app worked it out", cardText.includes("Tue 1 Jan 2030") && cardText.includes("Fri 4 Jan 2030"), cardText.replace(/\n/g, " | "));
  check("it says nothing has changed", cardText.includes("Nothing has changed yet."));
  const before = taskField(alpha, "deadline");
  check("the task really hasn't changed", before.startsWith("2030-01-01"), before);
  const activityBefore = count(`public.task_activity where task_id = '${alpha}'`);
  check("the proposal is stored as undecided", dbValue(`select status from public.assistant_proposals where task_id = '${alpha}'`) === "pending");

  await page.reload();
  await waitForText(page, "ready for you to confirm below");
  card = log(page).locator("div.rounded-lg.border").filter({ hasText: "Alpha dashboard" });
  check("it's still waiting after a reload", (await card.getByRole("button", { name: "Confirm the change to Alpha dashboard" }).count()) === 1);

  await card.getByRole("button", { name: "Confirm the change to Alpha dashboard" }).click();
  await card.getByText("Applied").waitFor();
  const after = taskField(alpha, "deadline");
  check("confirming changes the task, as end of day in the user's zone", after.startsWith("2030-01-04 22:59:59"), after);
  check("the proposal is marked applied", dbValue(`select status from public.assistant_proposals where task_id = '${alpha}'`) === "applied");
  check("the buttons are gone", (await card.getByRole("button").count()) === 0);
  check("it's in the task's history like any other edit", count(`public.task_activity where task_id = '${alpha}'`) === activityBefore + 1);
  check("the rest of the task is untouched",
    dbValue(`select title || '|' || priority || '|' || source_request || '|' || workspace_id from public.tasks where id = '${alpha}'`) === `Alpha dashboard|high|Request: Alpha dashboard|${a1}`);

  await page.goto(`${BASE}/tasks/${alpha}`);
  await main(page).getByLabel("Deadline", { exact: false }).first().waitFor();
  check("the task page shows the new date", (await main(page).locator('input[type="date"]').inputValue()) === "2030-01-04");

  await page.goto(`${BASE}/assistant?c=${first}`);
  await waitForText(page, "ready for you to confirm below");
  await ask(page, "A follow-up question");
  await waitForText(page, "You said: A follow-up question");
  state = await mockState();
  const notes = state.last.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  check("next time, the model is told it was confirmed and applied", /Alpha dashboard.*confirmed by the user and applied/s.test(notes));
  check("it can tell which task was meant", notes.includes(`Tasks mentioned:`) && notes.includes(late));
  check("the earlier question is in the history", state.last.messages.some((m) => m.role === "user" && m.content === "What tasks are overdue?"));

  console.log("\n# Dismissing");
  await ask(page, "MOCK_MOVE Later 2031-05-05");
  await waitForText(page, "2031");
  card = log(page).locator("div.rounded-lg.border").filter({ hasText: "Later item" });
  await card.getByRole("button", { name: "Dismiss the change to Later item" }).click();
  await card.getByText("Dismissed").waitFor();
  check("dismissing leaves the task alone", !dbValue(`select deadline from public.tasks where title = 'Later item' and workspace_id = '${a1}'`).startsWith("2031"));

  console.log("\n# A change that has gone stale");
  await ask(page, "MOCK_MOVE Stale 2030-02-10");
  card = log(page).locator("div.rounded-lg.border").filter({ hasText: "Stale report" });
  await card.waitFor();
  psql(`update public.tasks set deadline = '2030-02-20 12:00+00' where id = '${stale}'`);
  await card.getByRole("button", { name: "Confirm the change to Stale report" }).click();
  await card.getByRole("alert").waitFor();
  check("it refuses and explains", (await card.getByRole("alert").innerText()).includes("Deadline has changed since this was proposed"));
  check("what the user set is kept", taskField(stale, "deadline").startsWith("2030-02-20"));
  check("the proposal stays undecided", dbValue(`select status from public.assistant_proposals where task_id = '${stale}'`) === "pending");
  await card.getByRole("button", { name: "Dismiss the change to Stale report" }).click();
  await card.getByText("Dismissed").waitFor();
  check("it can then be dismissed", dbValue(`select status from public.assistant_proposals where task_id = '${stale}'`) === "dismissed");

  await ask(page, "MOCK_MOVE Renamed 2030-03-10");
  card = log(page).locator("div.rounded-lg.border").filter({ hasText: "Renamed thing" });
  await card.waitFor();
  psql(`update public.tasks set title = 'Renamed again' where id = '${renamed}'`);
  await page.reload();
  card = log(page).locator("div.rounded-lg.border").filter({ hasText: "Renamed again" });
  await card.waitFor();
  check("the card shows the task's current title", true);
  await card.getByRole("button", { name: "Confirm the change to Renamed again" }).click();
  await card.getByText("Applied").waitFor();
  check("a change to another field doesn't block it, and survives",
    dbValue(`select title from public.tasks where id = '${renamed}'`) === "Renamed again" && taskField(renamed, "deadline").startsWith("2030-03-10"));

  console.log("\n# Several proposals, and confirming twice");
  await ask(page, "MOCK_NOTE Noted");
  await waitForText(page, "Three things to confirm below.");
  const noteCard = log(page).locator("div.rounded-lg.border").filter({ hasText: "A note from the assistant" });
  const stepCard = log(page).locator("div.rounded-lg.border").filter({ hasText: "A step from the assistant" });
  const fieldsCard = log(page).locator("div.rounded-lg.border").filter({ hasText: "Waiting for" });
  check("each proposal gets its own card", (await noteCard.count()) === 1 && (await stepCard.count()) === 1 && (await fieldsCard.count()) === 1);
  const fieldsText = await fieldsCard.innerText();
  check("several fields show together", fieldsText.includes("Priority") && fieldsText.includes("Critical") && fieldsText.includes("Nadia"), fieldsText.replace(/\n/g, " | "));

  const otherTab = await page.context().newPage();
  await otherTab.goto(page.url());
  await otherTab.locator(`main${LIVE}`).getByRole("log").getByText("Three things to confirm below.").waitFor();
  await noteCard.getByRole("button", { name: /^Confirm/ }).dblclick();
  await noteCard.getByText("Applied").waitFor();
  check("a double click only adds one note", count(`public.task_notes where task_id = '${noteTask}'`) === 1);
  const staleTabCard = otherTab.locator(`main${LIVE}`).getByRole("log").locator("div.rounded-lg.border").filter({ hasText: "A note from the assistant" });
  await staleTabCard.getByRole("button", { name: /^Confirm/ }).click();
  await staleTabCard.getByText("Applied").waitFor();
  check("confirming again in another tab doesn't add a second", count(`public.task_notes where task_id = '${noteTask}'`) === 1);
  await otherTab.close();

  await stepCard.getByRole("button", { name: /^Confirm/ }).click();
  await stepCard.getByText("Applied").waitFor();
  await fieldsCard.getByRole("button", { name: /^Confirm/ }).click();
  await fieldsCard.getByText("Applied").waitFor();
  check("the note is saved as written", dbValue(`select body from public.task_notes where task_id = '${noteTask}'`) === "A note from the assistant");
  check("the subtask is saved", dbValue(`select title from public.subtasks where task_id = '${noteTask}'`) === "A step from the assistant");
  check("both fields changed", dbValue(`select priority || '|' || waiting_for from public.tasks where id = '${noteTask}'`) === "critical|Nadia");

  console.log("\n# What's sent to the model");
  await ask(page, "What did Emma ask me?");
  await waitForText(page, "Found 1");
  state = await mockState();
  const sent = JSON.stringify(state.toolReplies);
  check("the search finds Emma's request", sent.includes("Emma asked for the noted item"));
  check("contact details are never sent", !sent.includes("emma-secret") && !JSON.stringify(state.last.messages).includes("emma-secret"));

  console.log("\n# A model that misbehaves");
  await ask(page, "MOCK_XSS");
  await waitForText(page, "Click here");
  check("markup in a reply stays as text", (await log(page).getByText('onerror="window.__pwned=1"').count()) === 1);
  check("it doesn't run", (await page.evaluate(() => window.__pwned)) === undefined);
  check("no image or link is created from it", (await log(page).locator('img, a[href*="evil"]').count()) === 0);
  const refs = await log(page).locator('a[href^="/tasks/"]').evaluateAll((links) => links.map((a) => a.getAttribute("href")));
  check("made-up task ids don't become links", !refs.some((href) => href.includes("999") || href.includes("not-a-uuid")));
  check("the invented ids aren't stored", dbValue(`select count(*) from public.assistant_messages where conversation_id = '${first}' and '00000000-0000-4000-8000-000000000999' = any(referenced_task_ids)`) === "0");

  await ask(page, "MOCK_MOVEWS");
  await waitForText(page, "Result: Invalid arguments");
  check("it can't move a task to another workspace", dbValue(`select workspace_id from public.tasks where id = '${alpha}'`) === a1);

  await ask(page, "MOCK_BADTOOL");
  await waitForText(page, "no tool called drop_all_tables");
  check("an unknown tool and bad arguments are handled", (await log(page).innerText()).includes("valid JSON"));

  await ask(page, "MOCK_LOOP");
  await waitForText(page, "Out of rounds");
  check("a model that won't stop gets cut off and has to answer", true);

  await ask(page, "MOCK_MOVE Alpha Friday");
  await waitForText(page, "Couldn't: A deadline must look like");
  check("a date it didn't work out is rejected", true);
  await ask(page, "MOCK_MOVE Alpha 2030-02-31");
  await waitForText(page, "Couldn't: That isn't a valid date");
  check("an impossible date is rejected", taskField(alpha, "deadline").startsWith("2030-01-04"));

  console.log("\n# Failures keep your message and save nothing");
  const savedBefore = count(`public.assistant_messages where conversation_id = '${first}'`);
  for (const [word, wait] of [["MOCK_FAIL", 15000], ["MOCK_BADJSON", 15000], ["MOCK_FILTERED", 15000], ["MOCK_SLOW", 60000]]) {
    await ask(page, `${word} please`);
    await main(page).getByRole("alert").waitFor({ timeout: wait });
    const message = await main(page).getByRole("alert").innerText();
    check(`${word}: says so plainly`, message.includes("couldn't answer just now"), message);
    check(`${word}: your text is back in the box`, (await box(page).inputValue()) === `${word} please`);
    check(`${word}: the status went away and it's not in the log`, !(await log(page).innerText()).includes(`${word} please`));
    check(`${word}: nothing was saved`, count(`public.assistant_messages where conversation_id = '${first}'`) === savedBefore);
    await box(page).fill("");
  }

  await box(page).fill("Sent while offline");
  await page.context().setOffline(true);
  await send(page).click();
  await main(page).getByRole("alert").waitFor();
  check("losing the connection is explained", (await main(page).getByRole("alert").innerText()).includes("couldn't be reached"));
  check("and the message is kept", (await box(page).inputValue()) === "Sent while offline");
  await page.context().setOffline(false);
  await send(page).click();
  await waitForText(page, "You said: Sent while offline");
  check("sending again works", (await main(page).getByRole("alert").count()) === 0);

  await page.goto(`${BASE}/assistant`);
  await box(page).waitFor();
  await page.waitForLoadState("networkidle");
  const conversationsBefore = count(`public.assistant_conversations where owner_id = '${alice.id}'`);
  await ask(page, "MOCK_FAIL at the start");
  await main(page).getByRole("alert").waitFor();
  check("a failed first question doesn't create a conversation", count(`public.assistant_conversations where owner_id = '${alice.id}'`) === conversationsBefore);
  check("and stays on the new conversation page", page.url().endsWith("/assistant"));
  await box(page).fill("");

  console.log("\n# Conversations");
  await page.goto(`${BASE}/assistant?c=${first}`);
  await main(page).getByRole("link", { name: "New conversation" }).click();
  await page.waitForURL("**/assistant");
  await main(page).getByRole("heading", { name: "Recent conversations" }).waitFor();
  await page.waitForLoadState("networkidle");
  await ask(page, "A second conversation");
  await page.waitForURL("**/assistant?c=*");
  await waitForText(page, "You said: A second conversation");
  const second = conversationId(page);
  check("it's a separate conversation", second !== first);
  state = await mockState();
  check("it doesn't carry over the other one", !state.last.messages.some((m) => m.role === "user" && m.content.includes("overdue")));

  await main(page).getByRole("link", { name: "New conversation" }).click();
  await page.waitForURL("**/assistant");
  const recent = main(page).locator("section").filter({ hasText: "Recent conversations" });
  await recent.waitFor();
  check("going back without a reload starts empty", (await box(page).inputValue()) === "" && (await main(page).getByRole("list", { name: "Suggested questions" }).count()) === 1);
  await recent.getByRole("link", { name: /A second conversation/ }).waitFor();
  check("the list is up to date without a reload", true);
  const links = await recent.getByRole("link").allInnerTexts();
  check("the most recent comes first", links[0].includes("A second conversation") && links[1].includes("What tasks are overdue?"), links.join(" / ").replace(/\n/g, " "));
  await page.waitForLoadState("networkidle");
  page.once("dialog", (dialog) => dialog.dismiss());
  await recent.getByRole("button", { name: /Delete the conversation "A second/ }).click();
  check("cancelling keeps it", count(`public.assistant_conversations where id = '${second}'`) === 1);
  page.once("dialog", (dialog) => dialog.accept());
  await recent.getByRole("button", { name: /Delete the conversation "A second/ }).click();
  await recent.getByRole("link", { name: /A second conversation/ }).waitFor({ state: "detached" });
  check("deleting removes it", count(`public.assistant_conversations where id = '${second}'`) === 0);
  check("its messages go with it", count(`public.assistant_messages where conversation_id = '${second}'`) === 0);
  await page.goto(`${BASE}/assistant?c=${second}`);
  await page.waitForLoadState("networkidle");
  check("its address no longer opens anything", !(await main(page).innerText()).includes("A second conversation"));
  await page.goto(`${BASE}/assistant?c=not-a-uuid`);
  await page.waitForLoadState("networkidle");
  check("a malformed address doesn't break", (await page.locator("body").innerText()).length > 0 && !(await page.locator("body").innerText()).includes("Something went wrong"));

  console.log("\n# Secrets");
  await page.goto(`${BASE}/assistant?c=${first}`);
  await waitForText(page, "Late item (");
  const html = await page.content();
  check("the AI key isn't in the page", !process.env.AZURE_OPENAI_API_KEY || !html.includes(process.env.AZURE_OPENAI_API_KEY));
  check("nor the system prompt", !html.includes("You are WorkPilot"));

  console.log("\n# Another user");
  const other = await newPage();
  await login(other, bob);
  await other.goto(`${BASE}/assistant?c=${first}`);
  await other.waitForLoadState("networkidle");
  const otherHtml = await other.content();
  check("another user can't open the conversation", !otherHtml.includes("What tasks are overdue?") && !otherHtml.includes("Alpha dashboard"));
  await openAssistant(other);
  check("nor see it listed", (await main(other).getByRole("heading", { name: "Recent conversations" }).count()) === 0);
  await ask(other, "What tasks are overdue?");
  await waitForText(other, "Nothing is overdue.");
  check("searches only cover their own tasks", !(await log(other).innerText()).includes("Late item"));
  await ask(other, `MOCK_FOREIGN ${alpha}`);
  await waitForText(other, "Result: No task has that id");
  await ask(other, `MOCK_READFOREIGN ${alpha}`);
  await waitForText(other, "Result: No task has that id");
  check("the model can't reach another user's task, even with its id", dbValue(`select priority from public.tasks where id = '${alpha}'`) === "high");
  await other.context().close();

  console.log("\n# Phone");
  const phone = await newPage({ width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  await login(phone, alice);
  await phone.goto(`${BASE}/assistant`);
  await box(phone).waitFor();
  await phone.waitForLoadState("networkidle");
  let m = await phone.evaluate(() => ({ s: document.documentElement.scrollWidth, i: window.innerWidth }));
  check("a new conversation fits a phone", m.s <= m.i, `${m.s}/${m.i}`);
  await shot(phone, "p6-mobile-new");
  await phone.goto(`${BASE}/assistant?c=${first}`);
  await waitForText(phone, "Late item (");
  await phone.waitForLoadState("networkidle");
  m = await phone.evaluate(() => ({ s: document.documentElement.scrollWidth, i: window.innerWidth }));
  check("a long conversation fits a phone, including a very long word", m.s <= m.i, `${m.s}/${m.i}`);
  const positions = await phone.evaluate(() => {
    const form = [...document.querySelectorAll("form")].find((f) => f.querySelector("textarea") && f.offsetParent);
    const bar = [...document.querySelectorAll("nav.fixed")].find((n) => n.offsetParent !== null || getComputedStyle(n).position === "fixed");
    return { form: form.getBoundingClientRect().bottom, bar: bar.getBoundingClientRect().top, h: window.innerHeight };
  });
  check("the message box sits above the tab bar", positions.form <= positions.bar + 1 && positions.form > 0, JSON.stringify(positions));
  await box(phone).tap();
  await box(phone).fill("From my phone");
  await send(phone).tap();
  await waitForText(phone, "You said: From my phone");
  const replyBox = await log(phone).getByText("You said: From my phone").boundingBox();
  check("a new reply is scrolled into view", replyBox && replyBox.y >= 0 && replyBox.y < positions.bar, JSON.stringify(replyBox));
  await shot(phone, "p6-mobile-conversation");
  await phone.context().close();

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE}/assistant?c=${first}`);
  await waitForText(page, "Late item (");
  await shot(page, "p6-desktop-conversation");
  await page.goto(`${BASE}/assistant`);
  await main(page).getByRole("heading", { name: "Recent conversations" }).waitFor();
  await shot(page, "p6-desktop-new");

  const problems = page.problems.filter((p) => !/404|Failed to load resource|ERR_INTERNET_DISCONNECTED|net::/.test(p));
  check("no console problems", problems.length === 0, problems.join(" | ").slice(0, 400));
  await page.context().close();
});
