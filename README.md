# WorkPilot

A personal work management assistant for someone juggling more than one job.
The goal is that no request, commitment, deadline or follow-up gets forgotten.

**Current state: Phase 2.** Sign-in, the database and workspaces are real. Tasks
can't be created yet, so the dashboard shows zeros and captured requests aren't
saved. Both arrive in Phase 3.

## Getting started

Requires Node.js 20.9 or later, and a Supabase project.

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
| `npm run db:push`   | Apply new migrations, after asking to confirm   |
| `npm run db:test`   | Run the security tests, then roll everything back |

## Environment variables

| Variable                               | Required | Purpose                                                                    |
| -------------------------------------- | -------- | -------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Yes      | Your project's URL.                                                        |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes      | Public by design: Row Level Security protects the data, not this key.      |
| `SUPABASE_DB_URL`                      | db:\*    | Full database access, for the `db:` scripts only. The app doesn't use it.  |
| `WORKPILOT_TIME_ZONE`                  | No       | IANA zone that decides what "today" means. Defaults to the server's zone.  |

Keep real values in `.env.local`, which git ignores. If your network has no IPv6,
use Supabase's session pooler string for `SUPABASE_DB_URL`.

## How it's organized

```
src/
├─ proxy.ts             Sends signed-out visitors to /login
├─ app/                 Routes. (app)/ holds everything inside the shell.
├─ components/
│  ├─ ui/               shadcn/ui components
│  ├─ shell/            Sidebar, mobile navigation, workspace switcher
│  ├─ auth/  capture/  dashboard/  inbox/  tasks/  workspaces/  common/
└─ lib/
   ├─ auth/             Current user, sign-in and sign-out
   ├─ supabase/         Supabase clients
   ├─ domain/           Types and Zod schemas
   ├─ data/             The data interface and its Supabase implementation
   ├─ tasks/            Deadline rules
   ├─ dashboard/        Turns tasks into what the dashboard shows
   └─ workspaces/       Workspace scope, URL handling and server actions
supabase/
├─ migrations/          The database schema
└─ tests/               Security tests against the real schema
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

### Other conventions

- **UI never reads data directly.** Pages go through `WorkRepository`
  (`lib/data/repository.ts`).
- **The workspace scope lives in the URL** as `?workspace=<id>`, and leaving it
  out means all workspaces.
- **Business rules are pure functions with tests** and don't depend on React.
- **Signing in or out does a full page load.** Next.js keeps visited pages in the
  document, so a client-side navigation could leave one user's data in the page.

Next.js 16 runs here with Cache Components on, which affects how pages are
written. Anything reading `searchParams`, `useSearchParams`, cookies or the current
time must sit inside `<Suspense>`. The docs for this exact version are in
`node_modules/next/dist/docs/`.

## Roadmap

1. Foundation: shell, navigation, dashboard and inbox
2. **Database schema, authentication and workspaces (current)**
3. Task management and inbox persistence
4. AI task extraction
5. Dashboard data and the prioritization engine
6. Conversational assistant
7. Responsive polish, testing and deployment
