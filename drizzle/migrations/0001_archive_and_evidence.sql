alter table public.messages
  add column sequence int not null default 0,
  add column time_precision text not null default 'unknown' check (time_precision in ('second','minute','day','unknown')),
  add column time_source text not null default 'none' check (time_source in ('source_export','user_entered','none')),
  add column parent_message_id uuid references public.messages(id),
  add column external_id text,
  add column imported_at timestamptz not null default now();
update public.messages set sequence = position;
create unique index messages_external_id_uniq on public.messages(conversation_id, external_id) where external_id is not null;

alter table public.conversations
  add column source_format text not null default 'paste' check (source_format in ('paste','whatsapp','vtt','srt','slack','chatgpt','claude','other')),
  add column original_file text,
  add column imported_at timestamptz not null default now();

drop policy if exists "update messages" on public.messages;
drop policy if exists "update conversations" on public.conversations;
revoke update, delete on public.messages from authenticated, anon;
revoke update, delete on public.conversations from authenticated, anon;

create or replace function public.archive_is_insert_only()
returns trigger language plpgsql as $$
begin raise exception 'The archive is insert-only: % rows cannot be changed or deleted. Add a new row instead.', TG_TABLE_NAME; end $$;
create trigger messages_insert_only before update or delete on public.messages for each row execute function public.archive_is_insert_only();
create trigger conversations_insert_only before update or delete on public.conversations for each row execute function public.archive_is_insert_only();

create table public.idea_evidence (
  id uuid primary key default gen_random_uuid(),
  garden_id uuid not null references public.gardens(id) on delete cascade,
  idea_id uuid not null references public.ideas(id),
  message_id uuid not null references public.messages(id),
  role text not null check (role in ('origin','restated','supports','challenges')),
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (idea_id, message_id, role)
);
create unique index idea_evidence_one_origin on public.idea_evidence(idea_id) where role = 'origin';
create index on public.idea_evidence(garden_id);
grant select, insert, update on public.idea_evidence to authenticated;
grant all on public.idea_evidence to service_role;
alter table public.idea_evidence enable row level security;
create policy "read evidence" on public.idea_evidence for select to authenticated using (
  exists (select 1 from public.ideas i where i.id = idea_id and public.is_garden_member(i.garden_id) and (i.visibility = 'shared' or i.owner_user_id = auth.uid())));
create policy "write evidence" on public.idea_evidence for insert to authenticated with check (public.can_write_garden(garden_id));
create policy "update evidence" on public.idea_evidence for update to authenticated using (public.can_write_garden(garden_id));

insert into public.idea_evidence (garden_id, idea_id, message_id, role, created_by)
select garden_id, id, message_id, 'origin', owner_user_id from public.ideas where message_id is not null;

comment on column public.ideas.message_id is 'DEPRECATED: replaced by idea_evidence (role origin)';
comment on column public.ideas.conversation_id is 'DEPRECATED: derive from idea_evidence -> messages';
comment on column public.ideas.source_excerpt is 'DEPRECATED: quote comes from the message via idea_evidence';

alter table public.idea_links add column nature text check (nature in ('refines','answers','challenges','splits','combines'));