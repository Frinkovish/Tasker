-- Unreviewed requests.
--
-- A task must belong to a workspace, but a request can't be assigned to one until
-- the user has reviewed it. Captures hold requests until then, so nothing is lost
-- and no workspace is assumed.

create table public.captures (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  source_text text not null
    check (char_length(btrim(source_text)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index captures_owner_created_idx
  on public.captures (owner_id, created_at desc);

revoke all on public.captures from anon, authenticated;

-- No update: the user's original words are never rewritten.
grant select, insert, delete on public.captures to authenticated;

alter table public.captures enable row level security;

create policy "Owners can manage captures"
  on public.captures for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- Turns a reviewed capture into a task. It's one transaction, so a request can't
-- be lost or duplicated if something fails halfway. The source text comes from the
-- capture rather than the caller, so it stays exactly what the user wrote.
--
-- Security invoker: Row Level Security and the workspace foreign keys apply as
-- they would to any other change the user makes.
create function public.review_capture(
  p_capture_id uuid,
  p_workspace_id uuid,
  p_stakeholder_id uuid,
  p_project_id uuid,
  p_title text,
  p_description text,
  p_status text,
  p_priority text,
  p_deadline timestamptz,
  p_estimated_minutes integer,
  p_next_action text,
  p_waiting_for text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source_text text;
  v_task_id uuid;
begin
  delete from public.captures
  where id = p_capture_id
  returning source_text into v_source_text;

  if not found then
    raise exception 'Capture not found' using errcode = 'P0002';
  end if;

  insert into public.tasks (
    workspace_id, stakeholder_id, project_id, title, description, source_request,
    status, priority, deadline, estimated_minutes, next_action, waiting_for
  )
  values (
    p_workspace_id, p_stakeholder_id, p_project_id, p_title, p_description, v_source_text,
    p_status, p_priority, p_deadline, p_estimated_minutes, p_next_action, p_waiting_for
  )
  returning id into v_task_id;

  return v_task_id;
end;
$$;

revoke all on function public.review_capture(
  uuid, uuid, uuid, uuid, text, text, text, text, timestamptz, integer, text, text
) from public, anon;
grant execute on function public.review_capture(
  uuid, uuid, uuid, uuid, text, text, text, text, timestamptz, integer, text, text
) to authenticated;
