alter table public.conversations drop constraint if exists conversations_source_format_check;
alter table public.conversations add constraint conversations_source_format_check check (source_format in ('paste','lines','whatsapp','vtt','srt','transcript','notes','slack','chatgpt','claude','other'));
alter table public.messages drop constraint if exists messages_time_source_check;
alter table public.messages add constraint messages_time_source_check check (time_source in ('source_export','user_entered','recording_offset','none'));
alter table public.events drop constraint if exists events_type_check;
alter table public.events add constraint events_type_check check (type in ('idea_created','idea_edited','link_added','status_changed','knot_set','knot_reopened','conversation_added','imported','outcome_marked','outcome_unmarked','batch_received'));

create table public.intake_batches (
  id uuid primary key default gen_random_uuid(),
  garden_id uuid not null references public.gardens(id),
  conversation_id uuid not null references public.conversations(id),
  accession_no int not null,
  raw_text text not null,
  source_format text not null check (source_format in ('paste','lines','whatsapp','vtt','srt','transcript','notes','slack','chatgpt','claude','other')),
  original_file text,
  parser_version text not null,
  options jsonb not null default '{}'::jsonb,
  report jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (garden_id, accession_no)
);
grant select, insert on public.intake_batches to authenticated;
grant all on public.intake_batches to service_role;
alter table public.intake_batches enable row level security;
create policy "read batches" on public.intake_batches for select to authenticated using (public.is_garden_member(garden_id));
create policy "write batches" on public.intake_batches for insert to authenticated with check (public.can_write_garden(garden_id));
create trigger intake_batches_insert_only before update or delete on public.intake_batches for each row execute function public.archive_is_insert_only();

alter table public.messages
  add column batch_id uuid references public.intake_batches(id),
  add column raw_start int,
  add column raw_end int,
  add column speaker_label text,
  add column offset_ms int,
  add column hidden_reason text check (hidden_reason in ('system','media','deleted','empty'));

create table public.speaker_aliases (
  id uuid primary key default gen_random_uuid(),
  garden_id uuid not null references public.gardens(id),
  alias text not null,
  contributor_id uuid not null references public.contributors(id),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index speaker_aliases_uniq on public.speaker_aliases(garden_id, lower(alias));
grant select, insert, update on public.speaker_aliases to authenticated;
grant all on public.speaker_aliases to service_role;
alter table public.speaker_aliases enable row level security;
create policy "read aliases" on public.speaker_aliases for select to authenticated using (public.is_garden_member(garden_id));
create policy "write aliases" on public.speaker_aliases for insert to authenticated with check (public.can_write_garden(garden_id));
create policy "update aliases" on public.speaker_aliases for update to authenticated using (public.can_write_garden(garden_id)) with check (public.can_write_garden(garden_id));

create or replace function public.alias_is_real_name()
returns trigger language plpgsql as $$
begin
  if lower(trim(new.alias)) ~ '^(speaker\s*[0-9a-z]{1,3}|说话人\s*[0-9]+|unknown|user|assistant|human|system)$' then
    raise exception 'Generic labels are not remembered as names: %', new.alias;
  end if;
  return new;
end $$;
create trigger speaker_aliases_real_names before insert or update on public.speaker_aliases for each row execute function public.alias_is_real_name();

insert into public.intake_batches(garden_id, conversation_id, accession_no, raw_text, source_format, original_file, parser_version, created_by, created_at)
select c.garden_id, c.id, row_number() over (partition by c.garden_id order by c.created_at, c.id), c.raw_text, c.source_format, c.original_file, 'legacy-name-colon', c.created_by, c.created_at
from public.conversations c;

create or replace function public.receive_batch(_garden uuid, _conversation uuid, _new_conversation jsonb, _batch jsonb, _people jsonb, _aliases jsonb, _messages jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare conv uuid := _conversation; bid uuid; acc int; p jsonb; a jsonb; m jsonb; refs jsonb := '{}'::jsonb; cid uuid; n int; seq0 int; added int := 0; skipped int := 0; mid uuid; ext_map jsonb := '{}'::jsonb; i int := 0;
begin
  if not public.can_write_garden(_garden) then raise exception 'You cannot write to this garden.'; end if;
  if conv is null then
    insert into public.conversations(garden_id, title, source, happened_at, raw_text, consent_confirmed, source_format, original_file)
    values (_garden, _new_conversation->>'title', coalesce(_new_conversation->>'source','other'), nullif(_new_conversation->>'happened_at','')::date, '', true, _batch->>'source_format', nullif(_batch->>'original_file',''))
    returning id into conv;
  elsif not exists (select 1 from public.conversations where id = conv and garden_id = _garden) then
    raise exception 'That conversation is not in this garden.';
  end if;
  select coalesce(max(accession_no), 0) + 1 into acc from public.intake_batches where garden_id = _garden;
  insert into public.intake_batches(garden_id, conversation_id, accession_no, raw_text, source_format, original_file, parser_version, options, report)
  values (_garden, conv, acc, _batch->>'raw_text', _batch->>'source_format', nullif(_batch->>'original_file',''), _batch->>'parser_version', coalesce(_batch->'options','{}'), coalesce(_batch->'report','{}'))
  returning id into bid;
  for p in select * from jsonb_array_elements(coalesce(_people,'[]')) loop
    select id into cid from public.contributors where garden_id = _garden and name = trim(p->>'name');
    if cid is null then
      select count(*) into n from public.contributors where garden_id = _garden;
      insert into public.contributors(garden_id, name, color, kind) values (_garden, trim(p->>'name'), 'var(--person-' || (n % 5 + 1) || ')', coalesce(p->>'kind','person')) returning id into cid;
    end if;
    refs := refs || jsonb_build_object(p->>'ref', cid);
  end loop;
  for a in select * from jsonb_array_elements(coalesce(_aliases,'[]')) loop
    cid := coalesce(nullif(refs->>(a->>'person'),'')::uuid, (a->>'person')::uuid);
    insert into public.speaker_aliases(garden_id, alias, contributor_id) values (_garden, a->>'alias', cid)
    on conflict (garden_id, lower(alias)) do update set contributor_id = excluded.contributor_id;
  end loop;
  select coalesce(max(sequence) + 1, 0) into seq0 from public.messages where conversation_id = conv;
  for m in select * from jsonb_array_elements(coalesce(_messages,'[]')) loop
    if m->>'external_id' is not null and exists (select 1 from public.messages where conversation_id = conv and external_id = m->>'external_id') then
      skipped := skipped + 1; continue;
    end if;
    cid := case when m->>'person' is null then null else coalesce(nullif(refs->>(m->>'person'),'')::uuid, (m->>'person')::uuid) end;
    insert into public.messages(garden_id, conversation_id, position, sequence, contributor_id, sent_at, content, time_precision, time_source, external_id, batch_id, raw_start, raw_end, speaker_label, offset_ms, hidden_reason, parent_message_id)
    values (_garden, conv, seq0 + i, seq0 + i, cid, nullif(m->>'sent_at','')::timestamptz, m->>'content', m->>'precision', m->>'time_source', m->>'external_id', bid,
      nullif(m->>'raw_start','')::int, nullif(m->>'raw_end','')::int, m->>'speaker_label', nullif(m->>'offset_ms','')::int, nullif(m->>'hidden',''),
      coalesce(nullif(ext_map->>(m->>'parent_external_id'),'')::uuid, (select id from public.messages where conversation_id = conv and external_id = m->>'parent_external_id' limit 1)))
    returning id into mid;
    if m->>'external_id' is not null then ext_map := ext_map || jsonb_build_object(m->>'external_id', mid); end if;
    i := i + 1; added := added + 1;
  end loop;
  perform public.record_action(_garden, 'batch_received', null, jsonb_build_object('conversation_id', conv, 'batch_id', bid, 'accession_no', acc, 'added', added, 'already_kept', skipped, 'aliases', coalesce(_aliases,'[]')), '[]'::jsonb);
  return jsonb_build_object('conversation_id', conv, 'batch_id', bid, 'accession_no', acc, 'added', added, 'already_kept', skipped);
end $$;
revoke execute on function public.receive_batch(uuid, uuid, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.receive_batch(uuid, uuid, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;