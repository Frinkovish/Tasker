-- WorkPilot initial schema.
--
-- Security model:
--   * Every row belongs to a user, directly or through its workspace, and Row
--     Level Security enforces that on every table.
--   * Composite foreign keys stop a task from pointing at a stakeholder or
--     project in another workspace, whatever the application does.
--   * Privileges are granted per table and per column, so some rules hold even
--     for a user's own rows: clients can't rewrite a task's source request, move
--     a task between workspaces, or edit the activity log.

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- Each user has exactly two workspaces, one per job.
  slot smallint not null check (slot in (1, 2)),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  description text not null default '' check (char_length(description) <= 280),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slot)
);

create table public.stakeholders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  role text check (char_length(role) <= 120),
  contact_details text check (char_length(contact_details) <= 280),
  created_at timestamptz not null default now(),
  -- The target of the composite foreign key on tasks. Also serves as the index
  -- on workspace_id.
  unique (workspace_id, id)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  status text not null default 'active'
    check (status in ('active', 'on_hold', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  stakeholder_id uuid,
  project_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (char_length(description) <= 5000),
  -- The user's original words, kept unchanged as the task's source text.
  source_request text not null check (char_length(source_request) >= 1),
  status text not null default 'inbox'
    check (status in ('inbox', 'todo', 'in_progress', 'waiting', 'done', 'cancelled')),
  priority text not null default 'medium'
    check (priority in ('critical', 'high', 'medium', 'low')),
  deadline timestamptz,
  estimated_minutes integer check (estimated_minutes > 0),
  next_action text check (char_length(next_action) <= 500),
  waiting_for text check (char_length(waiting_for) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  -- Same-workspace references only. Deleting a stakeholder or project clears
  -- just that column, leaving workspace_id in place.
  foreign key (workspace_id, stakeholder_id)
    references public.stakeholders (workspace_id, id)
    on delete set null (stakeholder_id),
  foreign key (workspace_id, project_id)
    references public.projects (workspace_id, id)
    on delete set null (project_id)
);

create table public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  status text not null default 'todo' check (status in ('todo', 'done')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.task_notes (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create table public.task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  action text not null check (action in ('created', 'updated')),
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create table public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.assistant_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index tasks_workspace_status_idx on public.tasks (workspace_id, status);
create index tasks_workspace_priority_idx on public.tasks (workspace_id, priority);
create index tasks_workspace_deadline_idx on public.tasks (workspace_id, deadline)
  where deadline is not null;
create index tasks_workspace_stakeholder_idx on public.tasks (workspace_id, stakeholder_id)
  where stakeholder_id is not null;
create index tasks_workspace_project_idx on public.tasks (workspace_id, project_id)
  where project_id is not null;
create index subtasks_task_idx on public.subtasks (task_id);
create index task_notes_task_idx on public.task_notes (task_id, created_at);
create index task_activity_task_idx on public.task_activity (task_id, created_at);
create index assistant_conversations_owner_idx on public.assistant_conversations (owner_id);
create index assistant_messages_conversation_idx
  on public.assistant_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger workspaces_touch_updated_at
  before update on public.workspaces
  for each row execute function private.touch_updated_at();

create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function private.touch_updated_at();

create trigger assistant_conversations_touch_updated_at
  before update on public.assistant_conversations
  for each row execute function private.touch_updated_at();

-- Derives completed_at from status, so the two can't disagree.
create function private.sync_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'done' then
    new.completed_at := null;
  elsif tg_op = 'INSERT' or old.status <> 'done' then
    new.completed_at := now();
  else
    new.completed_at := old.completed_at;
  end if;
  return new;
end;
$$;

create trigger tasks_sync_completed_at
  before insert or update of status, completed_at on public.tasks
  for each row execute function private.sync_completed_at();

create trigger subtasks_sync_completed_at
  before insert or update of status, completed_at on public.subtasks
  for each row execute function private.sync_completed_at();

-- Records task history. Security definer because clients have no write access
-- to task_activity, which is what keeps the history trustworthy.
create function private.log_task_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  bookkeeping constant text[] := array['id', 'created_at', 'updated_at', 'completed_at'];
  old_row jsonb;
  new_row jsonb;
  previous_changes jsonb := '{}';
  new_changes jsonb := '{}';
  field text;
begin
  new_row := to_jsonb(new) - bookkeeping;

  if tg_op = 'INSERT' then
    insert into public.task_activity (task_id, action, new_value)
    values (new.id, 'created', new_row);
    return null;
  end if;

  old_row := to_jsonb(old) - bookkeeping;
  for field in select jsonb_object_keys(new_row) loop
    if (old_row -> field) is distinct from (new_row -> field) then
      previous_changes := previous_changes || jsonb_build_object(field, old_row -> field);
      new_changes := new_changes || jsonb_build_object(field, new_row -> field);
    end if;
  end loop;

  if new_changes <> '{}' then
    insert into public.task_activity (task_id, action, previous_value, new_value)
    values (new.id, 'updated', previous_changes, new_changes);
  end if;
  return null;
end;
$$;

create trigger tasks_log_activity
  after insert or update on public.tasks
  for each row execute function private.log_task_activity();

-- Gives every new user their two workspaces.
create function private.create_default_workspaces()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspaces (owner_id, slot, name, description, color)
  values
    (new.id, 1, 'GoMyCode', '', '#2563eb'),
    (new.id, 2, 'Second job', '', '#c2410c');
  return null;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.create_default_workspaces();

revoke all on all functions in schema private from public;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

-- Workspaces are created by the trigger above and can't be deleted, so there's
-- always exactly two. Only their presentation can change.
grant select on public.workspaces to authenticated;
grant update (name, description, color) on public.workspaces to authenticated;

grant select, insert, delete on public.stakeholders to authenticated;
grant update (name, role, contact_details) on public.stakeholders to authenticated;

grant select, insert, delete on public.projects to authenticated;
grant update (name, description, status) on public.projects to authenticated;

-- workspace_id and source_request are left out on purpose. Moving a task needs
-- explicit confirmation, so it will get its own dedicated function.
grant select, insert, delete on public.tasks to authenticated;
grant update (
  stakeholder_id, project_id, title, description, status, priority,
  deadline, estimated_minutes, next_action, waiting_for
) on public.tasks to authenticated;

grant select, insert, delete on public.subtasks to authenticated;
grant update (title, status) on public.subtasks to authenticated;

grant select, insert, delete on public.task_notes to authenticated;
grant update (body) on public.task_notes to authenticated;

-- Read-only: only the trigger writes history.
grant select on public.task_activity to authenticated;

grant select, insert, delete on public.assistant_conversations to authenticated;
grant select, insert, delete on public.assistant_messages to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.workspaces enable row level security;
alter table public.stakeholders enable row level security;
alter table public.projects enable row level security;
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;
alter table public.task_notes enable row level security;
alter table public.task_activity enable row level security;
alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;

create policy "Owners can read their workspaces"
  on public.workspaces for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "Owners can update their workspaces"
  on public.workspaces for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Owners can manage stakeholders"
  on public.stakeholders for all to authenticated
  using (exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.owner_id = (select auth.uid())
  ));

create policy "Owners can manage projects"
  on public.projects for all to authenticated
  using (exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.owner_id = (select auth.uid())
  ));

create policy "Owners can manage tasks"
  on public.tasks for all to authenticated
  using (exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.owner_id = (select auth.uid())
  ));

create policy "Owners can manage subtasks"
  on public.subtasks for all to authenticated
  using (exists (
    select 1 from public.tasks t
    join public.workspaces w on w.id = t.workspace_id
    where t.id = task_id and w.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.tasks t
    join public.workspaces w on w.id = t.workspace_id
    where t.id = task_id and w.owner_id = (select auth.uid())
  ));

create policy "Owners can manage task notes"
  on public.task_notes for all to authenticated
  using (exists (
    select 1 from public.tasks t
    join public.workspaces w on w.id = t.workspace_id
    where t.id = task_id and w.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.tasks t
    join public.workspaces w on w.id = t.workspace_id
    where t.id = task_id and w.owner_id = (select auth.uid())
  ));

create policy "Owners can read task activity"
  on public.task_activity for select to authenticated
  using (exists (
    select 1 from public.tasks t
    join public.workspaces w on w.id = t.workspace_id
    where t.id = task_id and w.owner_id = (select auth.uid())
  ));

create policy "Owners can manage conversations"
  on public.assistant_conversations for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Owners can manage messages"
  on public.assistant_messages for all to authenticated
  using (exists (
    select 1 from public.assistant_conversations c
    where c.id = conversation_id and c.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.assistant_conversations c
    where c.id = conversation_id and c.owner_id = (select auth.uid())
  ));
