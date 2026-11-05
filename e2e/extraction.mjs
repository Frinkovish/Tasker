import { BASE, check, createUser, login, main, MOCK, newPage, psql, quote, runSuite, shot, ZONE } from "./lib.mjs";

const REAL = process.env.REAL_AI === "1";

const mock = async () => (await fetch(`${MOCK}/count`)).json();

function nextWeekday(target) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [y, m, d] = parts.split("-").map(Number);
  const today = new Date(Date.UTC(y, m - 1, d));
  const delta = ((target - today.getUTCDay() + 7) % 7) || 7;
  return new Date(today.getTime() + delta * 86400000).toISOString().slice(0, 10);
}

const addCapture = (user, text) => psql(`insert into public.captures (owner_id, source_text) values ('${user.id}', ${quote(text)}) returning id`);
const clearCaptures = (user) => psql(`delete from public.captures where owner_id='${user.id}'`);
const openReview = async (page, id, query = "") => {
  await page.goto(`${BASE}/inbox/${id}${query}`);
  await page.getByRole("heading", { name: "Review request" }).waitFor();
};
const formReady = (page) => page.getByRole("button", { name: "Save as task" }).waitFor({ timeout: 40000 });

await runSuite(async () => {
  const alice = createUser("alice");
  const bob = createUser("bob");
  const [a1, a2] = alice.workspaces;
  const ids = psql(`
    with s as (insert into public.stakeholders (workspace_id, name) values ('${a1}', 'Nadia'), ('${a2}', 'Emma') returning id, name),
    p as (insert into public.projects (workspace_id, name) values ('${a1}', 'Reporting'), ('${a2}', 'ELD') returning id, name)
    select (select id from s where name='Nadia')||','||(select id from s where name='Emma')||','||(select id from p where name='Reporting')||','||(select id from p where name='ELD');`).split(",");
  const [nadia, emma, reporting, eld] = ids;
  void nadia; void reporting;
  const page = await newPage();
  await login(page, alice);

  if (REAL) {
    console.log("\n# Real model through the real app");
    const text = "Emma asked me to update the ELD dashboard with new enrollment figures before Monday. It should include validation rules.";
    const id = addCapture(alice, text);
    const started = Date.now();
    await openReview(page, id);
    await formReady(page);
    console.log(`INFO  suggestions took ${Date.now() - started}ms`);
    check("the original request is kept", (await main(page).locator("blockquote").innerText()) === text);
    check("workspace identified from the stakeholder", (await page.getByLabel("Workspace", { exact: true }).inputValue()) === a2);
    check("stakeholder matched", (await page.getByLabel("Stakeholder").inputValue()) === emma);
    check("project matched", (await page.getByLabel("Project").inputValue()) === eld);
    check("deadline resolved to next Monday", (await page.getByLabel("Deadline").inputValue()) === nextWeekday(1), await page.getByLabel("Deadline").inputValue());
    check("no time invented", (await page.getByLabel("Time (optional, otherwise end of day)").inputValue()) === "");
    check("a title was written", (await page.getByLabel("Title").inputValue()).length > 3, await page.getByLabel("Title").inputValue());
    const text2 = await main(page).innerText();
    check("the deadline quotes the user's words", /From your request: "before Monday"/i.test(text2));
    check("suggestions are labelled as such", text2.includes("AI suggestion"));
    await shot(page, "p4-real-review");
    await page.getByRole("button", { name: "Save as task" }).click();
    await page.waitForURL("**/inbox");
    await page.getByText("Nothing to review.").waitFor();
    check("saving creates the task with the exact original words", psql(`select source_request from public.tasks where workspace_id='${a2}'`) === text);
    check("no console problems", page.problems.length === 0, page.problems.join(" | ").slice(0, 300));
    await page.context().close();
  } else {
    // ---------- When AI runs ----------
    console.log("\n# When AI is called");
    let before = (await mock()).calls;
    await page.keyboard.press("Control+k");
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByLabel("Describe the request").fill("MOCK_FAIL capture doesn't depend on AI");
    await dialog.getByLabel("Describe the request").press("Enter");
    await dialog.getByText("Captured and saved to your inbox").waitFor();
    check("capturing never calls AI", (await mock()).calls === before);
    await page.keyboard.press("Escape");
    clearCaptures(alice);

    const goodText = "MOCK_GOOD Emma asked me to update the ELD dashboard before Monday.";
    const goodId = addCapture(alice, goodText);
    await page.goto(`${BASE}/inbox`);
    await page.getByRole("link", { name: "Review", exact: true }).waitFor();
    await page.getByRole("link", { name: "Review", exact: true }).hover();
    await page.waitForTimeout(1500);
    check("listing or hovering a request doesn't call AI", (await mock()).calls === before, `${(await mock()).calls - before} calls`);

    const anon = await fetch(`${BASE}/inbox/${goodId}`, { redirect: "manual" });
    check("signed out, the review page redirects without calling AI", anon.status === 307 && (await mock()).calls === before);

    await page.getByRole("link", { name: "Review", exact: true }).click();
    await page.waitForURL(/\/inbox\/.+/);
    await formReady(page);
    check("opening a review calls AI once", (await mock()).calls === before + 1, `${(await mock()).calls - before} calls`);

    const seen = (await mock()).last;
    check("the provider gets the key server-side, in the header", seen.hasKey);
    check("strict structured output is requested", seen.responseFormat === "json_schema" && seen.strict === true);
    check("no database ids are sent to the provider", !/[0-9a-f]{8}-[0-9a-f]{4}-/.test(seen.user));
    check("the user's email isn't sent to the provider", !seen.user.includes(alice.email));
    check("workspace descriptions aren't sent", !seen.user.includes("description"));
    const sentNames = JSON.parse(seen.user);
    check("the provider gets the names it needs", sentNames.stakeholders.some((s) => s.name === "Emma") && sentNames.workspaces.some((w) => w.name === "GoMyCode"));

    // ---------- A good suggestion ----------
    console.log("\n# A good suggestion");
    check("the original request is kept", (await main(page).locator("blockquote").innerText()) === goodText);
    check("the title is filled in", (await page.getByLabel("Title").inputValue()) === "Update the ELD dashboard");
    check("the workspace is suggested from the stakeholder", (await page.getByLabel("Workspace", { exact: true }).inputValue()) === a2);
    check("the stakeholder is selected", (await page.getByLabel("Stakeholder").inputValue()) === emma);
    check("the project is selected", (await page.getByLabel("Project").inputValue()) === eld);
    check("the deadline is filled in", (await page.getByLabel("Deadline").inputValue()) === nextWeekday(1));
    check("no time is invented", (await page.getByLabel("Time (optional, otherwise end of day)").inputValue()) === "");
    check("the estimate is filled in", (await page.getByLabel("Estimated minutes (optional)").inputValue()) === "90");
    check("the next action is filled in", (await page.getByLabel("Next action (optional)").inputValue()) === "Pull the enrollment figures");
    const reviewText = await main(page).innerText();
    check("stated information quotes the user's words", reviewText.includes('From your request: "before Monday"') && reviewText.includes('From your request: "Emma"'));
    check("the AI's judgements are labelled", reviewText.includes("AI suggestion") && reviewText.includes('AI suggestion, based on "Emma"'));
    check("clarification questions are shown", reviewText.includes("Before you save") && reviewText.includes("Which figures should it use?"));
    await shot(page, "p4-review");

    const callsAfterOpen = (await mock()).calls;
    await page.getByLabel("Title").fill("Edited by me");
    await page.getByLabel("Priority").selectOption("low");
    await page.getByLabel("Estimated minutes (optional)").fill("nope");
    await page.getByRole("button", { name: "Save as task" }).click();
    await page.getByRole("alert").filter({ hasText: "whole number of minutes" }).waitFor();
    check("a failed save keeps edits rather than the suggestion", (await page.getByLabel("Title").inputValue()) === "Edited by me" && (await page.getByLabel("Priority").inputValue()) === "low");
    check("a failed save keeps the suggested stakeholder", (await page.getByLabel("Stakeholder").inputValue()) === emma);
    check("a failed save doesn't call AI again", (await mock()).calls === callsAfterOpen);
    await page.getByLabel("Estimated minutes (optional)").fill("30");
    await page.getByRole("button", { name: "Save as task" }).click();
    await page.waitForURL("**/inbox");
    await page.getByText("Nothing to review.").waitFor();
    const saved = psql(`select title||'|'||workspace_id||'|'||stakeholder_id||'|'||project_id||'|'||priority||'|'||estimated_minutes||'|'||source_request||'|'||to_char(deadline at time zone '${ZONE}','YYYY-MM-DD HH24:MI')
      from public.tasks where workspace_id='${a2}'`);
    check("what's saved is what the user approved", saved === `Edited by me|${a2}|${emma}|${eld}|low|30|${goodText}|${nextWeekday(1)} 23:59`, saved);
    check("saving doesn't call AI", (await mock()).calls === callsAfterOpen);

    // ---------- A hostile suggestion ----------
    console.log("\n# A model that invents things");
    const inventId = addCapture(alice, "MOCK_INVENT please look at the report");
    await openReview(page, inventId);
    await formReady(page);
    check("an invented workspace isn't used", (await page.getByLabel("Workspace", { exact: true }).inputValue()) === "");
    check("relations stay locked with no workspace", await page.getByLabel("Stakeholder").isDisabled());
    check("an invented deadline isn't used", (await page.getByLabel("Deadline").inputValue()) === "");
    check("an invented time isn't used", (await page.getByLabel("Time (optional, otherwise end of day)").inputValue()) === "");
    check("unearned critical priority is reduced", (await page.getByLabel("Priority").inputValue()) === "medium");
    check("a bad estimate is dropped", (await page.getByLabel("Estimated minutes (optional)").inputValue()) === "");
    check("it asks which workspace", (await main(page).innerText()).includes("Which workspace is this for?"));
    check("HTML from the model shows as text and doesn't run", (await page.evaluate(() => window.__pwned)) === undefined && (await main(page).locator("b").count()) === 0);
    check("an overlong description is clipped", (await page.getByLabel("Description (optional)").inputValue()).length === 5000);
    check("the title field holds the markup as plain text", (await page.getByLabel("Title").inputValue()).includes("<img"));
    clearCaptures(alice);

    // ---------- AI failures ----------
    console.log("\n# When AI fails");
    for (const mode of ["MOCK_FAIL", "MOCK_429", "MOCK_BADJSON", "MOCK_BADSHAPE", "MOCK_FILTERED", "MOCK_REFUSAL"]) {
      const text = `${mode} request text`;
      const id = addCapture(alice, text);
      await openReview(page, id);
      await formReady(page);
      const body = await main(page).innerText();
      check(`${mode}: says AI is unavailable and leaves the form usable`, body.includes("AI suggestions aren't available right now") && (await page.getByLabel("Title").isEditable()) && (await page.getByLabel("Title").inputValue()) === "");
      check(`${mode}: the request is still shown`, body.includes(text));
      clearCaptures(alice);
    }
    const manualText = "MOCK_FAIL save this by hand";
    const manualId = addCapture(alice, manualText);
    await openReview(page, manualId);
    await formReady(page);
    await page.getByLabel("Title").fill("Saved by hand");
    await page.getByLabel("Workspace", { exact: true }).selectOption(a1);
    await page.getByRole("button", { name: "Save as task" }).click();
    await page.waitForURL("**/inbox");
    check("a task can still be saved by hand when AI fails", psql(`select source_request from public.tasks where title='Saved by hand' and workspace_id='${a1}'`) === manualText);

    const slowId = addCapture(alice, "MOCK_SLOW a slow request");
    // A streaming page only finishes loading after the AI call, so don't wait for that.
    const callsBeforeSlow = (await mock()).calls;
    const slowStarted = Date.now();
    await page.goto(`${BASE}/inbox/${slowId}`, { waitUntil: "commit" });
    await main(page).locator("blockquote").waitFor({ timeout: 8000 });
    const slowVisibleIn = Date.now() - slowStarted;
    await page.getByRole("link", { name: "Fill it in myself" }).waitFor({ timeout: 5000 });
    const slowBody = await main(page).innerText();
    check("while AI is slow, the request appears quickly", slowBody.includes("MOCK_SLOW a slow request") && slowVisibleIn < 5000, `${slowVisibleIn}ms`);
    check("while AI is slow, it says so", slowBody.includes("Reading your request"));
    await shot(page, "p4-reading");
    // This page's own call has to arrive first, or it'd look like skipping caused it.
    for (let tries = 0; tries < 50 && (await mock()).calls === callsBeforeSlow; tries++) {
      await page.waitForTimeout(100);
    }
    const beforeManual = (await mock()).calls;
    check("opening the page makes exactly one AI call", beforeManual === callsBeforeSlow + 1, `${beforeManual - callsBeforeSlow}`);
    await page.getByRole("link", { name: "Fill it in myself" }).click();
    await page.waitForURL(/manual=1/);
    await formReady(page);
    check("skipping AI gives the form straight away", (await page.getByLabel("Title").inputValue()) === "");
    check("skipping AI doesn't call it", (await mock()).calls === beforeManual);
    check("skipping AI shows no error", !(await main(page).innerText()).includes("aren't available"));
    const started = Date.now();
    await openReview(page, slowId);
    await formReady(page);
    const elapsed = Date.now() - started;
    check("a hung AI call gives up by itself", elapsed > 15000 && elapsed < 30000 && (await main(page).innerText()).includes("aren't available right now"), `${elapsed}ms`);
    clearCaptures(alice);

    // ---------- Isolation ----------
    console.log("\n# Isolation");
    const privateId = addCapture(alice, "MOCK_GOOD private request");
    const bobPage = await newPage();
    await login(bobPage, bob);
    const beforeBob = (await mock()).calls;
    await bobPage.goto(`${BASE}/inbox/${privateId}`);
    await bobPage.getByRole("heading", { name: "Request not found" }).waitFor();
    check("another user's request is never sent to AI", (await mock()).calls === beforeBob);
    const bobOwn = addCapture(bob, "MOCK_GOOD Emma asked me before Monday");
    await openReview(bobPage, bobOwn);
    await formReady(bobPage);
    const bobSent = (await mock()).last.user;
    check("a user's names aren't sent for someone else", !bobSent.includes("Nadia") && !bobSent.includes('"Emma",') );
    check("another user's stakeholder isn't matched", (await bobPage.getByLabel("Workspace", { exact: true }).inputValue()) === "" && (await main(bobPage).innerText()).includes(`"Emma" isn't saved as a stakeholder`));
    await bobPage.context().close();
    clearCaptures(alice);

    // ---------- Mobile ----------
    console.log("\n# Mobile 320px");
    const phone = await newPage({ width: 320, height: 568 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await login(phone, alice);
    const phoneId = addCapture(alice, "MOCK_GOOD Emma asked me to update the ELD dashboard before Monday.");
    await openReview(phone, phoneId);
    await formReady(phone);
    await phone.waitForLoadState("networkidle");
    const m = await phone.evaluate(() => ({ s: document.documentElement.scrollWidth, i: window.innerWidth }));
    check("no sideways scrolling on the review page", m.s <= m.i, `${m.s}/${m.i}`);
    check("suggestions show on mobile", (await main(phone).innerText()).includes("From your request"));
    await shot(phone, "p4-mobile-review");
    await phone.context().close();

    check("no console problems", page.problems.filter((p) => !/404|Failed to load resource|Task extraction failed/.test(p)).length === 0, page.problems.join(" | ").slice(0, 300));
    await page.context().close();
  }
});
