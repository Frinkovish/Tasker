-- What the conversational assistant needs beyond its two original tables.
--
-- The assistant can't change anything itself. It can only leave a proposal, which
-- the user confirms or dismisses. Proposals are stored rather than held in the
-- browser, so they survive a reload and each can only be confirmed once.

alter table public.assistant_conversations
  add column title text not null default 'New conversation'
    check (char_length(btrim(title)) between 1 and 120);

-- Links are drawn from these ids and live task data, never from the model's text.
-- There's no foreign key because a removed task should only drop out of the links.
alter table public.assistant_messages
  add column referenced_task_ids uuid[] not null default '{}',
  add constraint assistant_messages_content_length
    check (char_length(btrim(content)) between 1 and 8000);

create table public.assistant_proposals (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null
    references public.assistant_messages (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  -- Validated by the app when it's created and again when it's applied.
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'applied', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint assistant_proposals_resolved_when_decided
    check ((status = 'pending') = (resolved_at is null))
);

create index assistant_proposals_message_idx
  on public.assistant_proposals (message_id, created_at);
create index assistant_proposals_task_idx
  on public.assistant_proposals (task_id);

revoke all on public.assistant_proposals from anon, authenticated;

-- What was proposed can't be rewritten afterwards, only decided on.
grant select, insert on public.assistant_proposals to authenticated;
grant update (status, resolved_at) on public.assistant_proposals to authenticated;

-- Only the timestamp, so a new message can move a conversation up the list.
grant update (updated_at) on public.assistant_conversations to authenticated;

alter table public.assistant_proposals enable row level security;

create policy "Owners can read proposals"
  on public.assistant_proposals for select to authenticated
  using (exists (
    select 1 from public.assistant_messages m
    join public.assistant_conversations c on c.id = m.conversation_id
    where m.id = message_id and c.owner_id = (select auth.uid())
  ));

-- The task check stops a proposal pointing at a task the user can't see, since a
-- foreign key alone would ignore Row Level Security on the task.
create policy "Owners can add proposals for their own tasks"
  on public.assistant_proposals for insert to authenticated
  with check (
    status = 'pending'
    and exists (
      select 1 from public.assistant_messages m
      join public.assistant_conversations c on c.id = m.conversation_id
      where m.id = message_id and c.owner_id = (select auth.uid())
    )
    and exists (select 1 from public.tasks t where t.id = task_id)
  );

create policy "Owners can decide on proposals"
  on public.assistant_proposals for update to authenticated
  using (exists (
    select 1 from public.assistant_messages m
    join public.assistant_conversations c on c.id = m.conversation_id
    where m.id = message_id and c.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.assistant_messages m
    join public.assistant_conversations c on c.id = m.conversation_id
    where m.id = message_id and c.owner_id = (select auth.uid())
  ));

-- Saves one exchange as a single transaction, so a question can't be stored without
-- its answer, or an answer without the proposals it mentions. Passing no conversation
-- starts a new one.
--
-- clock_timestamp() rather than now(), which is fixed for the whole transaction and
-- would leave the question and answer with no order between them.
--
-- Security invoker: Row Level Security applies as it does to any other change.
create function public.record_assistant_turn(
  p_conversation_id uuid,
  p_title text,
  p_user_content text,
  p_assistant_content text,
  p_referenced_task_ids uuid[],
  p_proposals jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_conversation_id uuid := p_conversation_id;
  v_message_id uuid;
begin
  if v_conversation_id is null then
    insert into public.assistant_conversations (title)
    values (p_title)
    returning id into v_conversation_id;
  else
    update public.assistant_conversations
    set updated_at = now()
    where id = v_conversation_id;

    if not found then
      raise exception 'Conversation not found' using errcode = 'P0002';
    end if;
  end if;

  insert into public.assistant_messages (conversation_id, role, content, created_at)
  values (v_conversation_id, 'user', p_user_content, clock_timestamp());

  insert into public.assistant_messages (
    conversation_id, role, content, referenced_task_ids, created_at
  )
  values (
    v_conversation_id, 'assistant', p_assistant_content, p_referenced_task_ids,
    clock_timestamp()
  )
  returning id into v_message_id;

  insert into public.assistant_proposals (message_id, task_id, payload, created_at)
  select v_message_id, (item ->> 'task_id')::uuid, item -> 'payload', clock_timestamp()
  from jsonb_array_elements(p_proposals) as item;

  return v_conversation_id;
end;
$$;

revoke all on function public.record_assistant_turn(
  uuid, text, text, text, uuid[], jsonb
) from public, anon;
grant execute on function public.record_assistant_turn(
  uuid, text, text, text, uuid[], jsonb
) to authenticated;
