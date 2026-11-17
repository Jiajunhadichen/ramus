create table public.thought_events (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  garden_id uuid not null references public.gardens(id) on delete cascade,
  type text not null check (type in ('raised','challenged','refined','merged','rested','revived','settled','reopened')),
  idea_id uuid not null references public.ideas(id),
  related_idea_id uuid references public.ideas(id),
  settled_kind text check (settled_kind in ('decision','result','ruled_out','conclusion')),
  person_id uuid references public.contributors(id),
  occurred_at timestamptz,
  time_precision text not null default 'unknown' check (time_precision in ('second','minute','day','unknown')),
  recorded_at timestamptz not null default now(),
  recorded_by uuid default auth.uid(),
  rationale text,
  origin text not null default 'human' check (origin in ('human','ai')),
  confirmed boolean not null default true,
  rejected_at timestamptz,
  corrects_event_id uuid references public.thought_events(id),
  check (settled_kind is null or type = 'settled')
);
create index on public.thought_events(garden_id, seq);
create index on public.thought_events(idea_id);

create table public.thought_event_evidence (
  thought_event_id uuid not null references public.thought_events(id),
  message_id uuid not null references public.messages(id),
  garden_id uuid not null references public.gardens(id) on delete cascade,
  primary key (thought_event_id, message_id)
);

grant select, insert on public.thought_events to authenticated;
grant select, insert on public.thought_event_evidence to authenticated;
grant all on public.thought_events, public.thought_event_evidence to service_role;

alter table public.thought_events enable row level security;
alter table public.thought_event_evidence enable row level security;

create policy "read thought events" on public.thought_events for select to authenticated using (
  public.is_garden_member(garden_id) and exists (select 1 from public.ideas i where i.id = idea_id and (i.visibility = 'shared' or i.owner_user_id = auth.uid())));
create policy "write thought events" on public.thought_events for insert to authenticated with check (
  public.can_write_garden(garden_id) and recorded_by = auth.uid()
  and exists (select 1 from public.ideas i where i.id = idea_id and i.garden_id = thought_events.garden_id));
create policy "read thought evidence" on public.thought_event_evidence for select to authenticated using (
  exists (select 1 from public.thought_events t where t.id = thought_event_id));
create policy "write thought evidence" on public.thought_event_evidence for insert to authenticated with check (
  public.can_write_garden(garden_id)
  and exists (select 1 from public.thought_events t where t.id = thought_event_id and t.garden_id = thought_event_evidence.garden_id)
  and exists (select 1 from public.messages m where m.id = message_id and m.garden_id = thought_event_evidence.garden_id));

-- insert-only; the only allowed change is setting confirmed or rejected_at once, inside the dedicated functions
create or replace function public.thought_events_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then raise exception 'thought events are insert-only'; end if;
  if current_setting('ramus.review', true) is distinct from 'on' then raise exception 'thought events are insert-only; a correction is a new row'; end if;
  if (to_jsonb(new) - 'confirmed' - 'rejected_at') <> (to_jsonb(old) - 'confirmed' - 'rejected_at') then raise exception 'only confirmed or rejected_at may be set'; end if;
  if old.confirmed and not new.confirmed then raise exception 'confirmed can be set only once'; end if;
  if old.rejected_at is not null and new.rejected_at is distinct from old.rejected_at then raise exception 'rejected_at can be set only once'; end if;
  return new;
end $$;
create trigger thought_events_guard before update or delete on public.thought_events for each row execute function public.thought_events_guard();
create trigger thought_evidence_insert_only before update or delete on public.thought_event_evidence for each row execute function public.archive_is_insert_only();

create or replace function public.review_thought_event(_id uuid, _confirm boolean) returns void
language plpgsql security definer set search_path = public as $$
declare t public.thought_events;
begin
  select * into t from public.thought_events where id = _id;
  if t.id is null or not public.can_write_garden(t.garden_id) then raise exception 'not allowed'; end if;
  if t.confirmed or t.rejected_at is not null then raise exception 'this event has already been decided'; end if;
  perform set_config('ramus.review', 'on', true);
  if _confirm then update public.thought_events set confirmed = true where id = _id;
  else update public.thought_events set rejected_at = now() where id = _id; end if;
  perform set_config('ramus.review', 'off', true);
end $$;
revoke execute on function public.review_thought_event(uuid, boolean) from public, anon;
grant execute on function public.review_thought_event(uuid, boolean) to authenticated;

-- one call = one transaction: the audit event plus its thought events and their evidence.
-- occurred_at is taken only from an evidence message with a known time; never invented.
create or replace function public.record_action(_garden uuid, _audit_type text, _idea uuid, _payload jsonb, _thoughts jsonb)
returns void language plpgsql security invoker set search_path = public as $$
declare th jsonb; m public.messages; tid uuid;
begin
  insert into public.events(garden_id, actor, actor_kind, type, idea_id, payload) values (_garden, auth.uid(), 'human', _audit_type, _idea, coalesce(_payload, '{}'::jsonb));
  for th in select * from jsonb_array_elements(coalesce(_thoughts, '[]'::jsonb)) loop
    m := null;
    if th->>'message_id' is not null then
      select * into m from public.messages where id = (th->>'message_id')::uuid and garden_id = _garden;
      if m.id is null then raise exception 'message not in this garden'; end if;
    end if;
    insert into public.thought_events(garden_id, type, idea_id, related_idea_id, settled_kind, person_id, occurred_at, time_precision, rationale, origin, confirmed, recorded_by, corrects_event_id)
    values (_garden, th->>'type', (th->>'idea_id')::uuid, nullif(th->>'related_idea_id','')::uuid, nullif(th->>'settled_kind',''),
      coalesce(nullif(th->>'person_id','')::uuid, m.contributor_id),
      case when m.id is not null and m.time_precision <> 'unknown' then m.sent_at end,
      case when m.id is not null and m.time_precision <> 'unknown' then m.time_precision else 'unknown' end,
      nullif(th->>'rationale',''), 'human', true, auth.uid(), nullif(th->>'corrects_event_id','')::uuid)
    returning id into tid;
    if m.id is not null then insert into public.thought_event_evidence(thought_event_id, message_id, garden_id) values (tid, m.id, _garden); end if;
  end loop;
end $$;
revoke execute on function public.record_action(uuid, text, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.record_action(uuid, text, uuid, jsonb, jsonb) to authenticated;

-- seed raised/merged/rested/settled for ideas that have no thought events yet (backfill and imports)
create or replace function public.seed_thought_events(_garden uuid, _by uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare i record; l record; tid uuid; om record;
begin
  for i in select * from public.ideas where garden_id = _garden and not exists (select 1 from public.thought_events t where t.idea_id = ideas.id) order by position loop
    select m.id, m.sent_at, m.time_precision, m.contributor_id into om
      from public.idea_evidence e join public.messages m on m.id = e.message_id where e.idea_id = i.id and e.role = 'origin' limit 1;
    insert into public.thought_events(garden_id, type, idea_id, related_idea_id, person_id, occurred_at, time_precision, recorded_by, rationale)
      values (_garden, 'raised', i.id, (select parent_id from public.idea_links where child_id = i.id and kind = 'primary' limit 1), i.contributor_id,
        case when om.id is not null and om.time_precision <> 'unknown' then om.sent_at end,
        case when om.id is not null and om.time_precision <> 'unknown' then om.time_precision else 'unknown' end, _by, null)
      returning id into tid;
    if om.id is not null then insert into public.thought_event_evidence values (tid, om.id, _garden); end if;
    for l in select * from public.idea_links where child_id = i.id and kind = 'merge' order by position loop
      insert into public.thought_events(garden_id, type, idea_id, related_idea_id, recorded_by) values (_garden, 'merged', i.id, l.parent_id, _by);
    end loop;
    if i.status = 'dormant' then insert into public.thought_events(garden_id, type, idea_id, recorded_by) values (_garden, 'rested', i.id, _by); end if;
    if i.is_knot then insert into public.thought_events(garden_id, type, idea_id, recorded_by, rationale) values (_garden, 'settled', i.id, _by, i.settled); end if;
  end loop;
end $$;
revoke execute on function public.seed_thought_events(uuid, uuid) from public, anon;
grant execute on function public.seed_thought_events(uuid, uuid) to authenticated;

do $$ declare g record; begin
  for g in select id, created_by from public.gardens loop perform public.seed_thought_events(g.id, g.created_by); end loop;
end $$;