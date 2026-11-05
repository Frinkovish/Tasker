# WorkPilot

A personal work management assistant for someone juggling more than one job.
The goal is that no request, commitment, deadline or follow-up gets forgotten.

**Current state: Phase 7, the last of the MVP.** Requests are captured and saved, AI
proposes the task details, you check and save them, a transparent set of rules ranks
your work into a daily plan, and an assistant answers questions from your saved
records and prepares changes for you to confirm. It works on desktop, tablet and phone.

## Getting started

Requires Node.js 22.18 or later, and a Supabase project. Running the database and
browser tests also needs `psql` and Chrome.

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run db:push              # create the schema
npm run dev
```

Then open <http://localhost:3000>.

### Creating your account

The app has no sign-up page, because it's for one person:

1. In Supabase, go to **Authentication > Users > Add user** and choose
   **Create new user** with **Auto Confirm User** on. Your two workspaces are
   created automatically.
2. Go to **Authentication > Sign In / Providers** and turn off
   **Allow new users to sign up**.

## Scripts

| Command             | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Start the development server                    |
| `npm run build`     | Create a production build                       |
| `npm run start`     | Serve the production build                      |
| `npm run lint`      | Run ESLint                                      |
| `npm run typecheck` | Generate route types and run `tsc`              |
| `npm test`          | Run unit tests with Node's test runner          |
| `npm run test:e2e`  | Build, then run every browser suite             |
| `npm run test:ai`   | Measure the assistant on the real AI provider   |
| `npm run db:push`   | Apply new migrations, after asking to confirm   |
| `npm run db:test`   | Run the security tests, then roll everything back |

## Environment variables

| Variable                               | Required | Purpose                                                                    |
| -------------------------------------- | -------- | -------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Yes      | Your project's URL.                                                        |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes      | Public by design: Row Level Security protects the data, not this key.      |
| `SUPABASE_DB_URL`                      | db:\*    | Full database access, for the `db:` scripts only. The app doesn't use it.  |
| `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION` | No | AI task extraction and the assistant, server-side only. Without them, you fill in the review form yourself and the assistant can't answer. |
| `WORKPILOT_TIME_ZONE`                  | Hosting  | IANA zone for "today" and for reading deadlines you enter. Defaults to the server's zone, so set it when hosting. |

Keep real values in `.env.local`, which git ignores. If your network has no IPv6,
use Supabase's session pooler string for `SUPABASE_DB_URL`.

## Testing

| Layer | Command | Covers |
| ----- | ------- | ------ |
| Unit | `npm test` | Business rules: deadlines, ranking, extraction checks, assistant tools |
| Database | `npm run db:test` | Row Level Security, constraints and functions, rolled back afterwards |
| Browser | `npm run test:e2e` | Every feature through the real app and real database, at every screen size |
| Real AI | `npm run test:e2e -- --real`, `npm run test:ai` | What the real model does, on made-up data. These cost money. |

Lint, types, unit tests and the build also run on every push (`.github/workflows/ci.yml`).

The browser suites live in `e2e/` and use a fake AI provider (`mock-azure.mjs`), so
failures and bad replies can be triggered on demand. Name suites to run only those
(`npm run test:e2e -- assistant tasks`), or add `--dev` to run against `next dev`,
which also reports hydration problems. Set `E2E_CHROME_PATH` to use a browser other
than the installed Chrome. Screenshots go to `e2e/.output/` for checking by eye.

**They use the database in `.env.local`.** Each suite creates its own throwaway users
and deletes them afterwards, even if it crashes, and never reads or changes anyone
else's data, so it's safe alongside real data. A separate Supabase project is tidier
if you have one.

## Deploying

The app needs a Node.js server with streaming. `next start` on any host works, and
Vercel works with no configuration. The app doesn't use a shared cache, so there's
nothing else to set up.

1. **Apply migrations first:** `npm run db:push`, from your machine.
2. **Set these on the host,** using the table above:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
   `WORKPILOT_TIME_ZONE` (hosts usually run in UTC, which would make "today" wrong),
   and the `AZURE_OPENAI_*` values. **Don't set `SUPABASE_DB_URL` there:** the app
   doesn't use it, and it gives full database access.
3. **Serve it over HTTPS.** In production the session cookie is only sent over HTTPS,
   so signing in over plain HTTP won't stick, except on `localhost`.
4. **Check that sign-ups are off** in Supabase (see Getting started). Anyone who can
   sign up would get their own empty account.
5. **Allow enough time per request.** An assistant reply can take up to 90 seconds at
   worst. Hosts with a shorter limit on requests will cut off the slowest replies.

To check a deployment: sign in, capture a request, review it, and ask the assistant
what's overdue.

## How it's organized

```
src/
├─ proxy.ts             Sends signed-out visitors to /login
├─ app/                 Routes. (app)/ holds everything inside the shell.
├─ components/
│  ├─ ui/               shadcn/ui components
│  ├─ shell/            Sidebar, mobile navigation, workspace switcher
│  ├─ assistant/  auth/  capture/  dashboard/  inbox/  plan/  tasks/  workspaces/  common/
└─ lib/
   ├─ ai/               The AI provider call and task extraction
   ├─ assistant/        The assistant's tools, proposals, prompt and conversation loop
   ├─ auth/             Current user, sign-in and sign-out
   ├─ supabase/         Supabase clients
   ├─ domain/           Types and Zod schemas
   ├─ data/             The data interface and its Supabase implementation
   ├─ forms/            The shared path every form submission goes through
   ├─ captures/         Saving and reviewing requests
   ├─ prioritization/   The ranking rules and the daily plan
   ├─ tasks/            Deadlines, filters, history and task actions
   ├─ dashboard/        Turns tasks into what the dashboard shows
   └─ workspaces/       Workspace scope, URL handling and server actions
supabase/
├─ migrations/          The database schema
└─ tests/               Security tests against the real schema
e2e/                    Browser suites, the fake AI provider and the AI evaluation
```

### Security

Three layers protect the data, so a mistake in one doesn't expose anything:

1. **`proxy.ts`** redirects signed-out visitors. New routes are protected by default.
2. **The data layer** checks the user on every operation (`lib/data/supabase-repository.ts`).
3. **The database** enforces it regardless: Row Level Security on every table,
   composite foreign keys that block cross-workspace references, and per-column
   privileges. Clients can't rewrite a task's `source_request`, move a task between
   workspaces, or write to the activity log.

Change the schema only through new files in `supabase/migrations/`, and cover new
rules in `supabase/tests/security_test.sql`.

### AI extraction

Opening a request to review asks the model for a proposal, which you check before
anything is saved. It lives in `lib/ai/`:

- **`sanitize.ts` enforces the rules, not the prompt.** A deadline must quote the
  request and match its date. A stakeholder or project must be named in the request
  and already saved. A workspace needs its own name, or a saved person or project in
  it, and conflicts become a question. Each filled-in field says whether it came
  from your words or is the AI's suggestion.
- **AI is never required.** Capturing doesn't use it, and if it's slow, failing or
  not set up, the form is there to fill in by hand.
- **What the provider receives:** the request's text, the names of your workspaces,
  stakeholders and projects, stakeholder roles, and today's date. Database ids aren't
  sent, and request text is never logged.
- **One call per visit.** Each time the review page opens it makes a new call, so
  suggestions can differ on reload. Nothing is stored.

To use another provider, replace `lib/ai/azure-openai.ts`.

### Prioritization

`lib/prioritization/engine.ts` scores each task by adding up points, and every point
earned comes with a reason shown to the user. The rules appear in the app under "How
tasks are ranked", generated from the same constants the scoring uses. No AI is
involved, so rankings are repeatable and cost nothing.

- **Capacity is never assumed.** Time only counts when you enter it, and it lasts for
  that view. Deadline risk uses the clock, not working hours.
- **Waiting work isn't recommended.** A task is waiting if its status says so or
  "waiting for" is filled in, and it's listed to follow up instead.
- **Having a stakeholder earns nothing,** so requests aren't promoted just because
  someone asked.

### The assistant

`/assistant` answers from your saved records and prepares changes. It lives in
`lib/assistant/`, and the code enforces its rules rather than relying on the prompt:

- **The model can't change anything.** It has tools that read and tools that propose
  (`tools.ts`). A proposal is only stored. The one path to a change is
  `confirmProposal` in `actions.ts`, which runs when you press Confirm and uses the
  same validation as the task edit form.
- **The confirmation card is written by the app.** It shows the real task and exact
  values from `describeProposal`, so what you confirm doesn't depend on the model's
  wording. A reply is displayed as plain text, and task links are built from real
  tasks only.
- **Facts come from the app.** Counts, dates and ranking reasons are computed in
  `read-tools.ts` and the prioritization engine. Each reply reads fresh data.
- **It won't guess between tasks.** A proposal is refused if your last search matched
  several tasks, unless your message asks for all of them. This is in code because
  telling the model to ask wasn't enough.
- **A proposal can't overwrite newer work.** Confirming fails if a field it changes
  has moved on since. Each proposal can only be decided once, and `record_assistant_turn`
  saves a question, its answer and its proposals in one transaction.
- **Moving a task between workspaces and deleting a task aren't offered.** A task's
  stakeholder, project and original request can't be changed through it either.
- **What the provider receives:** your message, recent messages in that conversation,
  and what its tools read: task details, including original requests and notes when a
  question needs them, plus workspace, stakeholder and project names and unreviewed
  requests. Contact details are never sent, and nothing is logged. Task text can contain
  instructions from other people, which is why confirmation is enforced in code.

The model runs with reasoning off (`reasoning_effort: "none"`), because the current
deployment rejects function tools on this API otherwise. Another deployment may need
that line changed in `lib/ai/azure-openai.ts`.

### Other conventions

- **UI never reads data directly.** Pages go through `WorkRepository`
  (`lib/data/repository.ts`).
- **The workspace scope lives in the URL** as `?workspace=<id>`, and leaving it
  out means all workspaces.
- **Business rules are pure functions with tests** and don't depend on React.
- **Requests start as captures.** A task needs a workspace, and one is never
  assumed, so a request stays in `captures` until it's reviewed. `review_capture`
  creates the task and removes the capture in one transaction.
- **Signing in or out does a full page load.** Next.js keeps visited pages in the
  document, so a client-side navigation could leave one user's data in the page.
- **Control sizes live in one place.** `--control-h` in `globals.css` makes controls
  finger-sized on small screens and touch devices, and compact only with a mouse on a
  wider screen. Use it for anything tappable.
- **Forms use `useFormAction`,** which keeps what was typed if the connection drops.

Next.js 16 runs here with Cache Components on, which affects how pages are
written. Anything reading `searchParams`, `useSearchParams`, cookies or the current
time must sit inside `<Suspense>`. The docs for this exact version are in
`node_modules/next/dist/docs/`.

## Roadmap

1. Foundation: shell, navigation, dashboard and inbox
2. Database schema, authentication and workspaces
3. Task management and inbox persistence
4. AI task extraction
5. Dashboard data and the prioritization engine
6. Conversational assistant
7. **Responsive polish, testing and deployment (current)**
