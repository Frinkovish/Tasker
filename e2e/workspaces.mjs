import { BASE, check, createUser, LIVE, login, newPage, psql, runSuite, SB_KEY, SB_URL, shot, stat } from "./lib.mjs";

const rest = (token, route, init = {}) =>
  fetch(`${SB_URL}/rest/v1/${route}`, {
    ...init,
    headers: {
      apikey: SB_KEY,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...init.headers,
    },
  });

await runSuite(async () => {
  const alice = createUser("alice");
  const bob = createUser("bob");
  check("creating a user gives them two workspaces", alice.workspaces.length === 2 && bob.workspaces.length === 2);
  const [a1, a2] = alice.workspaces;

  // ---------- Signed out ----------
  console.log("\n# Signed out");
  for (const route of ["dashboard", "inbox", "tasks", "assistant", `workspaces/${a1}`]) {
    const res = await fetch(`${BASE}/${route}`, { redirect: "manual" });
    check(`/${route} redirects to /login`, res.status === 307 && res.headers.get("location")?.endsWith("/login"), `${res.status} ${res.headers.get("location")}`);
  }
  const forged = await fetch(`${BASE}/dashboard`, {
    redirect: "manual",
    headers: { Cookie: `sb-${new URL(SB_URL).hostname.split(".")[0]}-auth-token=${encodeURIComponent(JSON.stringify({ access_token: "forged.token.value", refresh_token: "x", user: { id: a1 } }))}` },
  });
  check("a forged session cookie is rejected", forged.status === 307 && forged.headers.get("location")?.endsWith("/login"), `${forged.status}`);

  const anonTasks = await rest(null, "tasks?select=id");
  check("the API refuses anonymous reads", anonTasks.status === 401 || anonTasks.status === 403, `${anonTasks.status}`);

  // ---------- Login ----------
  console.log("\n# Login");
  const page = await newPage();
  await page.goto(`${BASE}/`);
  await page.waitForURL("**/login");
  check("/ leads to the login page when signed out", true);
  await shot(page, "p2-login");

  await page.getByLabel("Email").fill(alice.email);
  await page.getByLabel("Password").fill("definitely-wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "don't match" });
  await alert.waitFor();
  check("a wrong password is refused with a clear message", page.url().endsWith("/login"));
  check("the email is kept after a failed attempt", (await page.getByLabel("Email").inputValue()) === alice.email);
  check("the password isn't kept after a failed attempt", (await page.getByLabel("Password").inputValue()) === "");
  await shot(page, "p2-login-error");
  const wrongPwMessage = await alert.innerText();

  await page.getByLabel("Email").fill("nobody@test.invalid");
  await page.getByLabel("Password").fill("definitely-wrong");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForLoadState("networkidle");
  check("an unknown email gets the same message", (await page.getByRole("alert").filter({ hasText: "don't match" }).innerText()) === wrongPwMessage);

  await login(page, alice);
  check("correct credentials reach the dashboard", page.url().endsWith("/dashboard"));
  check("no password field or login form stays in the page", (await page.evaluate(() => document.querySelectorAll('input[type="password"]').length)) === 0);
  check("the sidebar shows who is signed in", (await page.locator(`aside${LIVE}`).innerText()).includes(alice.email));
  await page.reload();
  await page.getByRole("heading", { name: "Dashboard" }).waitFor();
  check("the session survives a reload", page.url().endsWith("/dashboard"));
  await page.goto(`${BASE}/login`);
  await page.waitForURL("**/dashboard");
  check("signed-in users skip the login page", true);

  // ---------- Real data ----------
  console.log("\n# Dashboard on the real database");
  await page.getByRole("heading", { name: "Dashboard" }).waitFor();
  const empty = await stat(page);
  check("a new user sees true zeros, not sample data", Object.values(empty).every((n) => n === 0), JSON.stringify(empty));
  check("no sample data remains", !(await page.locator(`main${LIVE}`).innerText()).match(/Sample data|Nadia|Emma/));
  check("empty states are shown", await page.getByText("Nothing pressing today.").isVisible() && await page.getByText("No requests yet.").isVisible());
  const filterLinks = page.getByRole("navigation", { name: "Filter by workspace" });
  check("the default workspaces are listed", (await filterLinks.innerText()).includes("GoMyCode") && (await filterLinks.innerText()).includes("Second job"));
  await shot(page, "p2-dashboard-empty");
  await filterLinks.getByRole("link", { name: "Second job" }).click();
  await page.waitForURL(`**/dashboard?workspace=${a2}`);
  check("the workspace filter uses real ids", true);

  // ---------- Workspace settings ----------
  console.log("\n# Workspace settings");
  await page.goto(`${BASE}/workspaces/${a1}`);
  await page.getByRole("heading", { name: "GoMyCode" }).waitFor();
  await page.getByLabel("Colour").waitFor();
  const settings = page.locator("form").filter({ has: page.getByLabel("Colour") });
  await settings.getByLabel("Name").fill("   ");
  await settings.getByRole("button", { name: "Save changes" }).click();
  await settings.getByRole("alert").filter({ hasText: "Enter a name." }).waitFor();
  check("a blank name is refused by the server", true);
  check("the rejected name isn't saved", psql(`select name from public.workspaces where id='${a1}'`) === "GoMyCode");

  await settings.getByLabel("Name").fill("AcmeWork");
  await settings.getByLabel("Description").fill("My renamed job");
  await page.evaluate(() => {
    const el = document.querySelector('input[type="color"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, "#16a34a");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settings.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("heading", { name: "AcmeWork" }).waitFor();
  check("renaming updates the page", true);
  await page.locator(`aside${LIVE}`).getByRole("link", { name: "AcmeWork" }).waitFor();
  check("renaming updates the sidebar without a reload", true);
  check("the change is really in the database", psql(`select name||'|'||description||'|'||color from public.workspaces where id='${a1}'`) === "AcmeWork|My renamed job|#16a34a");
  await page.reload();
  await page.getByRole("heading", { name: "AcmeWork" }).waitFor();
  check("the new name survives a reload", (await page.locator(`main${LIVE}`).innerText()).includes("My renamed job"));

  // ---------- Stakeholders and projects ----------
  console.log("\n# Stakeholders and projects");
  const sForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Add stakeholder" }) });
  await sForm.getByLabel("Name").fill("Nadia");
  await sForm.getByLabel("Role (optional)").fill("Operations lead");
  await sForm.getByRole("button", { name: "Add stakeholder" }).click();
  await page.getByText("Operations lead").waitFor();
  check("a stakeholder can be added", psql(`select count(*) from public.stakeholders where workspace_id='${a1}' and name='Nadia' and role='Operations lead' and contact_details is null`) === "1");
  check("the form clears after adding", (await sForm.getByLabel("Name").inputValue()) === "");

  const pForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Add project" }) });
  await pForm.getByLabel("Name").fill("Reporting");
  await pForm.getByLabel("Description (optional)").fill("Monthly numbers");
  await pForm.getByRole("button", { name: "Add project" }).click();
  await page.getByText("Monthly numbers").waitFor();
  check("a project can be added, active by default", psql(`select status from public.projects where workspace_id='${a1}' and name='Reporting'`) === "active");
  await shot(page, "p2-workspace");

  await page.goto(`${BASE}/workspaces/${a2}`);
  await page.getByRole("heading", { name: "Second job" }).waitFor();
  const other = await page.locator(`main${LIVE}`).innerText();
  check("the other workspace doesn't show them", !other.includes("Nadia") && !other.includes("Reporting"));

  await page.goto(`${BASE}/workspaces/${a1}`);
  await page.getByText("Operations lead").waitFor();
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("button", { name: "Delete Nadia" }).click();
  await page.waitForTimeout(800);
  check("cancelling the confirmation keeps the stakeholder", psql(`select count(*) from public.stakeholders where name='Nadia' and workspace_id='${a1}'`) === "1");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete Nadia" }).click();
  await page.getByText("No stakeholders yet.").waitFor();
  check("confirming deletes the stakeholder", psql(`select count(*) from public.stakeholders where name='Nadia' and workspace_id='${a1}'`) === "0");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete Reporting" }).click();
  await page.getByText("No projects yet.").waitFor();
  check("confirming deletes the project", psql(`select count(*) from public.projects where workspace_id='${a1}'`) === "0");

  // Leave data for the isolation checks.
  await sForm.getByLabel("Name").fill("Private Stakeholder");
  await sForm.getByRole("button", { name: "Add stakeholder" }).click();
  await page.getByText("Private Stakeholder").waitFor();

  // ---------- Workspace switcher and inbox on real data ----------
  console.log("\n# Switcher and inbox");
  await page.goto(`${BASE}/dashboard`);
  await page.getByRole("heading", { name: "Dashboard" }).waitFor();
  await page.locator(`aside${LIVE}`).getByRole("button", { name: /^Workspace:/ }).click();
  await page.getByRole("menuitemradio", { name: "AcmeWork" }).click();
  await page.waitForURL(`**/dashboard?workspace=${a1}`);
  check("the switcher scopes the dashboard, using the new name", true);
  await page.locator(`aside${LIVE}`).getByRole("link", { name: "Inbox" }).click();
  await page.waitForURL(`**/inbox?workspace=${a1}`);
  check("the scope carries over to the inbox", true);
  await page.getByRole("heading", { name: "To review" }).waitFor();
  check("the inbox shows a true empty state", await page.getByText("Nothing to review.").isVisible());
  const inboxBox = page.getByRole("main").getByLabel("Describe the request");
  await page.getByRole("main").getByRole("button", { name: "Capture" }).click();
  await page.getByRole("alert").filter({ hasText: "Write the request first." }).waitFor();
  check("a blank capture is rejected", true);
  await inboxBox.fill("Nadia asked for the forecast");
  await inboxBox.press("Enter");
  await page.locator(`main${LIVE} li`).filter({ hasText: "Nadia asked for the forecast" }).waitFor();
  check("a capture is listed for review", await page.getByRole("link", { name: "Review" }).first().isVisible());
  await shot(page, "p2-inbox");
  await page.goto(`${BASE}/dashboard?workspace=garbage`);
  await page.getByRole("heading", { name: "Dashboard" }).waitFor();
  check("an invalid scope falls back to all workspaces", (await page.locator(`aside${LIVE}`).getByRole("button", { name: /^Workspace:/ }).innerText()).includes("All workspaces"));
  await page.goto(`${BASE}/tasks`);
  await page.getByText("No tasks yet.").waitFor();
  await page.waitForTimeout(800);
  const hiddenCopies = await page.evaluate(() => document.querySelectorAll("[hidden] header, [hidden] main").length);
  console.log(`INFO  hidden shell copies left on /tasks: ${hiddenCopies}`);
  await page.goto(`${BASE}/workspaces/not-a-real-id`);
  await page.getByRole("heading", { name: "Workspace not found" }).waitFor();
  check("a malformed workspace id shows not found", true);

  // ---------- Capture still works ----------
  await page.goto(`${BASE}/workspaces/${a1}`);
  await page.getByRole("heading", { name: "AcmeWork" }).waitFor();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.getByLabel("Describe the request").fill("Captured while signed in");
  await dialog.getByLabel("Describe the request").press("Enter");
  await dialog.getByText("Captured and saved to your inbox").waitFor();
  check("quick capture still works", true);
  await page.keyboard.press("Escape");

  // ---------- Isolation between users ----------
  console.log("\n# Isolation between users");
  const bobPage = await newPage();
  await login(bobPage, bob);
  const bobText = await bobPage.locator(`main${LIVE}`).innerText();
  const bobNav = await bobPage.locator(`aside${LIVE}`).innerText();
  check("a second user sees their own workspaces, not the renamed one", bobNav.includes("GoMyCode") && !bobNav.includes("AcmeWork"));
  check("a second user's dashboard is empty", !bobText.includes("Private Stakeholder"));
  await bobPage.goto(`${BASE}/workspaces/${a1}`);
  await bobPage.getByRole("heading", { name: "Workspace not found" }).waitFor();
  check("another user's workspace URL shows not found", !(await bobPage.locator("body").innerText()).includes("AcmeWork"));
  await bobPage.goto(`${BASE}/dashboard?workspace=${a1}`);
  await bobPage.getByRole("heading", { name: "Dashboard" }).waitFor();
  check("another user's workspace id can't scope the dashboard", !(await bobPage.locator("body").innerText()).includes("AcmeWork"));

  const tokenRes = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SB_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: bob.email, password: bob.password }),
  });
  const { access_token: bobToken } = await tokenRes.json();
  check("the second user can get a real API token", Boolean(bobToken));
  const seen = await (await rest(bobToken, "workspaces?select=id")).json();
  check("the API returns only the second user's workspaces", seen.length === 2 && seen.every((w) => bob.workspaces.includes(w.id)));
  const seenStake = await (await rest(bobToken, `stakeholders?select=id&workspace_id=eq.${a1}`)).json();
  check("the API hides the first user's stakeholders", seenStake.length === 0);
  const patch = await (await rest(bobToken, `workspaces?id=eq.${a1}`, { method: "PATCH", body: JSON.stringify({ name: "Hacked" }) })).json();
  check("the API can't rename the first user's workspace", Array.isArray(patch) && patch.length === 0 && psql(`select name from public.workspaces where id='${a1}'`) === "AcmeWork");
  const inject = await rest(bobToken, "stakeholders", { method: "POST", body: JSON.stringify({ workspace_id: a1, name: "Injected" }) });
  check("the API can't add to the first user's workspace", inject.status === 403 && psql(`select count(*) from public.stakeholders where name='Injected'`) === "0", `${inject.status}`);
  const steal = await rest(bobToken, `workspaces?id=eq.${bob.workspaces[0]}`, { method: "PATCH", body: JSON.stringify({ owner_id: alice.id }) });
  check("the API can't reassign a workspace's owner", steal.status === 401 || steal.status === 403, `${steal.status}`);
  const del = await rest(bobToken, `workspaces?id=eq.${bob.workspaces[0]}`, { method: "DELETE" });
  check("the API can't delete a workspace", del.status === 401 || del.status === 403, `${del.status}`);
  check("no console problems for the second user", bobPage.problems.filter((p) => !p.includes("404")).length === 0, bobPage.problems.join(" | ").slice(0, 300));
  await bobPage.context().close();

  // ---------- Opening a dialog as early as possible ----------
  console.log("\n# Dialog opened before the page finishes loading");
  const racer = await newPage({ width: 375, height: 667 });
  await login(racer, alice);
  racer.problems.length = 0;
  for (let attempt = 0; attempt < 6; attempt++) {
    await racer.goto(`${BASE}/dashboard`, { waitUntil: "commit" });
    for (let i = 0; i < 200; i++) {
      await racer.keyboard.press("Control+k").catch(() => {});
      if (await racer.getByRole("dialog").isVisible().catch(() => false)) break;
      await racer.waitForTimeout(10);
    }
    await racer.getByRole("dialog").waitFor();
    await racer.keyboard.press("Escape");
    await racer.getByRole("dialog").waitFor({ state: "hidden" });
    await racer.locator(`nav.fixed${LIVE}`).waitFor();
  }
  const leftHidden = await racer.evaluate(() => [...document.querySelectorAll('[aria-hidden="true"]')].filter((el) => el.matches("nav, aside, header, main, body > div")).length);
  check("closing the dialog leaves nothing hidden from screen readers", leftHidden === 0, String(leftHidden));
  const hydration = racer.problems.filter((p) => /hydrat/i.test(p));
  check("an early dialog causes no hydration problems", hydration.length === 0, hydration.join(" | ").slice(0, 300));
  await racer.context().close();

  // ---------- Mobile ----------
  console.log("\n# Mobile 320px");
  const phone = await newPage({ width: 320, height: 568 }, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await login(phone, alice);
  for (const route of ["dashboard", "inbox", "tasks", "assistant", `workspaces/${a1}`]) {
    await phone.goto(`${BASE}/${route}`);
    await phone.locator(`main${LIVE} h1`).first().waitFor();
    const m = await phone.evaluate(() => ({ s: document.documentElement.scrollWidth, i: window.innerWidth }));
    check(`no horizontal overflow on /${route}`, m.s <= m.i, `${m.s}/${m.i}`);
  }
  await shot(phone, "p2-mobile-workspace");
  await phone.goto(`${BASE}/dashboard`);
  await phone.getByRole("heading", { name: "Dashboard" }).waitFor();
  await phone.locator(`nav.fixed${LIVE}`).getByRole("button", { name: "Capture request" }).tap();
  await phone.getByRole("dialog").waitFor();
  check("quick capture opens on mobile", true);
  await phone.keyboard.press("Escape");
  await phone.getByRole("dialog").waitFor({ state: "hidden" });
  await phone.locator(`header${LIVE}`).getByRole("button", { name: "Sign out" }).tap();
  await phone.waitForURL("**/login");
  check("sign out works from the mobile top bar", true);
  await phone.context().close();

  // ---------- Sign out ----------
  console.log("\n# Sign out");
  await page.goto(`${BASE}/dashboard`);
  await page.getByRole("heading", { name: "Dashboard" }).waitFor();
  // Leave sensitive state in memory, reached by client-side navigation only.
  await page.keyboard.press("Control+k");
  const signOutDialog = page.getByRole("dialog");
  await signOutDialog.waitFor();
  await signOutDialog.getByLabel("Describe the request").fill("Alice private capture");
  await signOutDialog.getByLabel("Describe the request").press("Enter");
  await signOutDialog.getByText("Captured and saved to your inbox").waitFor();
  await signOutDialog.getByLabel("Describe the request").fill("Alice private draft");
  await page.keyboard.press("Escape");
  await signOutDialog.waitFor({ state: "hidden" });
  await page.locator(`aside${LIVE}`).getByRole("link", { name: "Inbox" }).click();
  await page.waitForURL(/\/inbox/);
  await page.getByText("Alice private capture").filter({ visible: true }).waitFor();
  check("private state is in memory before signing out", (await page.content()).includes("Alice private capture"));
  await page.locator(`aside${LIVE}`).getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
  await page.getByLabel("Email").waitFor();
  check("sign out returns to the login page", true);
  const html = await page.content();
  for (const secret of [alice.email, "AcmeWork", "Private Stakeholder", "Alice private capture", "Alice private draft"]) {
    check(`after sign out, the whole page has no "${secret.startsWith("e2e") ? "user email" : secret}"`, !html.includes(secret));
  }
  check("after sign out, nothing is left in browser storage", await page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0));
  const cookies = await page.context().cookies();
  check("the session cookie is gone", !cookies.some((c) => c.name.includes("auth-token")), cookies.map((c) => c.name).join(","));
  await page.goBack();
  await page.waitForTimeout(1000);
  const after = await page.content();
  check("the back button doesn't reveal data after signing out", !after.includes("AcmeWork") && !after.includes(alice.email) && !after.includes("Alice private capture"), page.url());
  await page.goto(`${BASE}/dashboard`);
  await page.waitForURL("**/login");
  check("protected pages redirect again after signing out", true);

  // Next person on the same browser.
  await login(page, bob);
  await page.locator(`aside${LIVE}`).getByRole("link", { name: "Inbox" }).click();
  await page.waitForURL(/\/inbox/);
  await page.getByRole("heading", { name: "To review" }).waitFor();
  const nextUser = await page.content();
  check("the next user on this browser sees nothing of the previous one", !nextUser.includes("Alice private") && !nextUser.includes("AcmeWork") && !nextUser.includes(alice.email));
  await page.locator(`aside${LIVE}`).getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/login");
  check("no console problems for the first user", page.problems.filter((p) => !/404|401|400/.test(p)).length === 0, page.problems.filter((p) => !/404|401|400/.test(p)).join(" | ").slice(0, 400));
  await page.context().close();
});
