-- Tests the database's security rules against the real schema.
-- Everything runs in one transaction that is rolled back, so nothing persists,
-- including the test users. Run with: npm run db:test

\set ON_ERROR_STOP on
\set QUIET on
\pset format unaligned
\pset tuples_only on

begin;

-- Helpers, removed by the rollback. They run with the caller's privileges.
create function public._t_ok(label text, passed boolean) returns void
language plpgsql as $$
begin
  if passed is not true then
    raise exception 'FAIL: %', label;
  end if;
  raise notice 'PASS: %', label;
end;
$$;

create function public._t_error(label text, statement text, expected text) returns void
language plpgsql as $$
declare
  actual text;
begin
  begin
    execute statement;
    raise exception 'FAIL: % (no error raised)', label;
  exception
    when others then
      actual := sqlstate;
      if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  if actual <> expected then
    raise exception 'FAIL: % (expected %, got %)', label, expected, actual;
  end if;
  raise notice 'PASS: %', label;
end;
$$;

create function public._t_rows(statement text) returns bigint
language plpgsql as $$
declare
  affected bigint;
begin
  execute statement;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

grant execute on function public._t_ok(text, boolean) to anon, authenticated;
grant execute on function public._t_error(text, text, text) to anon, authenticated;
grant execute on function public._t_rows(text) to anon, authenticated;

\set alice '''a0000000-0000-4000-8000-000000000001'''
\set bob '''b0000000-0000-4000-8000-000000000002'''
\set as_alice 'set local role authenticated; set local request.jwt.claims = ''{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}'';'
\set as_bob 'set local role authenticated; set local request.jwt.claims = ''{"sub":"b0000000-0000-4000-8000-000000000002","role":"authenticated"}'';'
\set as_anon 'set local role anon; set local request.jwt.claims = ''{"role":"anon"}'';'
\set as_admin 'reset role; reset request.jwt.claims;'

-- ---------------------------------------------------------------------------
-- New users and their default workspaces
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  (:alice, 'alice@test.invalid'),
  (:bob, 'bob@test.invalid');

select public._t_ok('a new user gets exactly two workspaces',
  (select count(*) from public.workspaces where owner_id = :alice) = 2);
select public._t_ok('the default workspaces are GoMyCode and Second job',
  (select array_agg(name order by slot) from public.workspaces where owner_id = :alice)
    = array['GoMyCode', 'Second job']);

select id as a1 from public.workspaces where owner_id = :alice and slot = 1 \gset
select id as a2 from public.workspaces where owner_id = :alice and slot = 2 \gset
select id as b1 from public.workspaces where owner_id = :bob and slot = 1 \gset

select public._t_ok('row level security is on for every public table',
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  ));
select public._t_error('a third workspace breaks the slot constraint',
  format('insert into public.workspaces (owner_id, slot, name, color) values (%L, 3, ''x'', ''#000000'')', :alice),
  '23514');
select public._t_error('a duplicate slot is rejected',
  format('insert into public.workspaces (owner_id, slot, name, color) values (%L, 1, ''x'', ''#000000'')', :alice),
  '23505');

-- ---------------------------------------------------------------------------
-- Anonymous visitors
-- ---------------------------------------------------------------------------

:as_anon
select public._t_error('anon can''t read ' || t, 'select * from public.' || t, '42501')
from unnest(array[
  'workspaces', 'stakeholders', 'projects', 'tasks', 'subtasks', 'task_notes',
  'task_activity', 'assistant_conversations', 'assistant_messages'
]) as t;
:as_admin

-- ---------------------------------------------------------------------------
-- Workspaces
-- ---------------------------------------------------------------------------

:as_alice
select public._t_ok('a user sees only their own workspaces',
  (select count(*) from public.workspaces) = 2
  and not exists (select 1 from public.workspaces where owner_id <> :alice));
select public._t_ok('another user''s workspace is invisible',
  not exists (select 1 from public.workspaces where id = :'b1'));
select public._t_ok('a user can rename their workspace',
  public._t_rows(format('update public.workspaces set name = ''Renamed'' where id = %L', :'a1')) = 1);
select public._t_ok('renaming another user''s workspace changes nothing',
  public._t_rows(format('update public.workspaces set name = ''Hacked'' where id = %L', :'b1')) = 0);
select public._t_error('a workspace can''t be given away',
  format('update public.workspaces set owner_id = %L where id = %L', :bob, :'a1'), '42501');
select public._t_error('a workspace''s slot can''t change',
  format('update public.workspaces set slot = 2 where id = %L', :'a1'), '42501');
select public._t_error('clients can''t create workspaces',
  format('insert into public.workspaces (owner_id, slot, name, color) values (%L, 2, ''x'', ''#000000'')', :alice),
  '42501');
select public._t_error('clients can''t delete workspaces',
  format('delete from public.workspaces where id = %L', :'a1'), '42501');
select public._t_error('an invalid colour is rejected',
  format('update public.workspaces set color = ''red'' where id = %L', :'a1'), '23514');
select public._t_error('a blank workspace name is rejected',
  format('update public.workspaces set name = ''   '' where id = %L', :'a1'), '23514');

-- ---------------------------------------------------------------------------
-- Stakeholders and projects
-- ---------------------------------------------------------------------------

insert into public.stakeholders (workspace_id, name) values (:'a1', 'Nadia');
insert into public.stakeholders (workspace_id, name) values (:'a2', 'Emma');
insert into public.projects (workspace_id, name) values (:'a1', 'Reporting');
insert into public.projects (workspace_id, name) values (:'a2', 'ELD');

select id as nadia from public.stakeholders where name = 'Nadia' \gset
select id as emma from public.stakeholders where name = 'Emma' \gset
select id as reporting from public.projects where name = 'Reporting' \gset
select id as eld from public.projects where name = 'ELD' \gset

select public._t_error('a stakeholder can''t be added to another user''s workspace',
  format('insert into public.stakeholders (workspace_id, name) values (%L, ''x'')', :'b1'), '42501');
select public._t_error('a project can''t be added to another user''s workspace',
  format('insert into public.projects (workspace_id, name) values (%L, ''x'')', :'b1'), '42501');
select public._t_error('an unknown project status is rejected',
  format('insert into public.projects (workspace_id, name, status) values (%L, ''x'', ''nope'')', :'a1'), '23514');
select public._t_error('a stakeholder can''t move workspace',
  format('update public.stakeholders set workspace_id = %L where id = %L', :'a2', :'nadia'), '42501');

-- ---------------------------------------------------------------------------
-- Tasks and workspace isolation
-- ---------------------------------------------------------------------------

insert into public.tasks (workspace_id, stakeholder_id, project_id, title, source_request)
values (:'a1', :'nadia', :'reporting', 'Task one', 'Nadia asked for the report');
select id as t1 from public.tasks where title = 'Task one' \gset

select public._t_error('a task can''t reference another workspace''s stakeholder',
  format('insert into public.tasks (workspace_id, stakeholder_id, title, source_request) values (%L, %L, ''x'', ''x'')', :'a1', :'emma'),
  '23503');
select public._t_error('a task can''t reference another workspace''s project',
  format('insert into public.tasks (workspace_id, project_id, title, source_request) values (%L, %L, ''x'', ''x'')', :'a1', :'eld'),
  '23503');
select public._t_error('an existing task can''t be pointed at another workspace''s stakeholder',
  format('update public.tasks set stakeholder_id = %L where id = %L', :'emma', :'t1'), '23503');
select public._t_error('a task can''t be created in another user''s workspace',
  format('insert into public.tasks (workspace_id, title, source_request) values (%L, ''x'', ''x'')', :'b1'), '42501');
select public._t_error('a task can''t be moved to another workspace',
  format('update public.tasks set workspace_id = %L where id = %L', :'a2', :'t1'), '42501');
select public._t_error('a task''s source request can''t be rewritten',
  format('update public.tasks set source_request = ''changed'' where id = %L', :'t1'), '42501');
select public._t_error('an unknown task status is rejected',
  format('update public.tasks set status = ''nope'' where id = %L', :'t1'), '23514');
select public._t_error('an unknown priority is rejected',
  format('update public.tasks set priority = ''nope'' where id = %L', :'t1'), '23514');
select public._t_error('a non-positive estimate is rejected',
  format('update public.tasks set estimated_minutes = 0 where id = %L', :'t1'), '23514');

select public._t_ok('a task with no deadline stays null, never defaulted',
  (select deadline is null from public.tasks where id = :'t1'));

-- ---------------------------------------------------------------------------
-- Completion tracking
-- ---------------------------------------------------------------------------

update public.tasks set status = 'done' where id = :'t1';
select public._t_ok('completing a task sets completed_at',
  (select completed_at is not null from public.tasks where id = :'t1'));
update public.tasks set status = 'todo' where id = :'t1';
select public._t_ok('reopening a task clears completed_at',
  (select completed_at is null from public.tasks where id = :'t1'));
select public._t_error('completed_at can''t be set directly',
  format('update public.tasks set completed_at = now() where id = %L', :'t1'), '42501');

-- ---------------------------------------------------------------------------
-- Activity history
-- ---------------------------------------------------------------------------

select public._t_ok('creating a task is logged',
  (select count(*) from public.task_activity where task_id = :'t1' and action = 'created') = 1);
select public._t_ok('a change logs the old and new value of that field only',
  exists (select 1 from public.task_activity where task_id = :'t1' and action = 'updated'
          and previous_value = '{"status":"inbox"}' and new_value = '{"status":"done"}')
  and exists (select 1 from public.task_activity where task_id = :'t1' and action = 'updated'
              and previous_value = '{"status":"done"}' and new_value = '{"status":"todo"}'));
update public.tasks set title = 'Task one' where id = :'t1';
select public._t_ok('an update that changes nothing isn''t logged',
  (select count(*) from public.task_activity where task_id = :'t1' and action = 'updated') = 2);
select public._t_error('history can''t be forged',
  format('insert into public.task_activity (task_id, action) values (%L, ''created'')', :'t1'), '42501');
select public._t_error('history can''t be edited',
  format('update public.task_activity set action = ''created'' where task_id = %L', :'t1'), '42501');
select public._t_error('history can''t be deleted',
  format('delete from public.task_activity where task_id = %L', :'t1'), '42501');

-- ---------------------------------------------------------------------------
-- Task children
-- ---------------------------------------------------------------------------

insert into public.subtasks (task_id, title) values (:'t1', 'Sub one');
insert into public.task_notes (task_id, body) values (:'t1', 'A note');
update public.subtasks set status = 'done' where task_id = :'t1';
select public._t_ok('completing a subtask sets completed_at',
  (select completed_at is not null from public.subtasks where task_id = :'t1'));

insert into public.assistant_conversations default values;
select id as c1 from public.assistant_conversations limit 1 \gset
insert into public.assistant_messages (conversation_id, role, content) values (:'c1', 'user', 'Hello');
select public._t_ok('a conversation belongs to its creator',
  (select owner_id = :alice from public.assistant_conversations where id = :'c1'));
select public._t_error('a conversation can''t be created for someone else',
  format('insert into public.assistant_conversations (owner_id) values (%L)', :bob), '42501');
select public._t_error('an unknown message role is rejected',
  format('insert into public.assistant_messages (conversation_id, role, content) values (%L, ''system'', ''x'')', :'c1'), '23514');
:as_admin

-- ---------------------------------------------------------------------------
-- A second user can't touch any of it
-- ---------------------------------------------------------------------------

:as_bob
select public._t_ok('another user can''t see ' || t,
  public._t_rows('select * from public.' || t) = 0)
from unnest(array[
  'stakeholders', 'projects', 'tasks', 'subtasks', 'task_notes',
  'task_activity', 'assistant_conversations', 'assistant_messages'
]) as t;
select public._t_ok('another user can''t update a task',
  public._t_rows(format('update public.tasks set title = ''Hacked'' where id = %L', :'t1')) = 0);
select public._t_ok('another user can''t delete a task',
  public._t_rows(format('delete from public.tasks where id = %L', :'t1')) = 0);
select public._t_ok('another user can''t delete a stakeholder',
  public._t_rows(format('delete from public.stakeholders where id = %L', :'nadia')) = 0);
select public._t_error('another user can''t add a subtask to the task',
  format('insert into public.subtasks (task_id, title) values (%L, ''x'')', :'t1'), '42501');
select public._t_error('another user can''t add a note to the task',
  format('insert into public.task_notes (task_id, body) values (%L, ''x'')', :'t1'), '42501');
select public._t_error('another user can''t add to the conversation',
  format('insert into public.assistant_messages (conversation_id, role, content) values (%L, ''user'', ''x'')', :'c1'), '42501');
select public._t_error('another user can''t point a task at the stakeholder',
  format('insert into public.tasks (workspace_id, stakeholder_id, title, source_request) values (%L, %L, ''x'', ''x'')', :'b1', :'nadia'), '23503');
:as_admin

-- ---------------------------------------------------------------------------
-- Internal functions
-- ---------------------------------------------------------------------------

:as_alice
select public._t_error('clients can''t call internal functions',
  'select private.create_default_workspaces()', '42501');

-- ---------------------------------------------------------------------------
-- Deleting things
-- ---------------------------------------------------------------------------

delete from public.stakeholders where id = :'nadia';
select public._t_ok('deleting a stakeholder clears only that field on its tasks',
  (select stakeholder_id is null and workspace_id = :'a1' and project_id = :'reporting'
   from public.tasks where id = :'t1'));
delete from public.projects where id = :'reporting';
select public._t_ok('deleting a project clears only that field on its tasks',
  (select project_id is null and workspace_id = :'a1' from public.tasks where id = :'t1'));
:as_admin

delete from auth.users where id = :alice;
select public._t_ok('deleting a user removes all their data',
  not exists (select 1 from public.workspaces where owner_id = :alice)
  and not exists (select 1 from public.tasks)
  and not exists (select 1 from public.assistant_conversations));
select public._t_ok('deleting a user leaves other users alone',
  (select count(*) from public.workspaces where owner_id = :bob) = 2);

rollback;
