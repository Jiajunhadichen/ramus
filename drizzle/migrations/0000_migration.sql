create table public.gardens (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  collected text not null default '',
  focus_idea_id uuid,
  specimen_no serial,
  is_demo boolean not null default false,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.garden_members (
  garden_id uuid not null references public.gardens(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'owner' check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (garden_id, user_id)
);
create table public.contributors (
  id uuid primary key default gen_random_uuid(),
  garden_id uuid not null references public.gardens(id) on delete cascade,
  name text not null,
  color text not null,
  kind text not null default 'person' check (kind in ('person','historical_ai')),
  user_id uuid,
  created_at timestamptz not null default now(),
  unique (garden_id, name)
);
create table public.steps (
  id uuid primary key default gen_random_uuid(),
  garden_id uuid not null references public.gardens(id) on delete cascade,
  step int not null check (step >= 1),
  title text not null default '',
  date date,
  unique (garden_id, step)
);
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  garden_id uuid not null references public.gardens(id) on delete cascade,
  title text not null,
  source text not null default 'other' check (source in ('meeting','chat','notes','other')),
  happened_at date,
  raw_text text not null default '',
  consent_confirmed boolean not null check (consent_confirmed = true),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  garden_id uuid not null references public.gardens(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  position int not null,
  contributor_id uuid references public.contributors(id),
  sent_at timestamptz,
  content text not null
);
create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  garden_id uuid not null references public.gardens(id) on delete cascade,
  key text not null,
  label text not null check (char_length(label) between 1 and 24),
  note text not null default '',
  contributor_id uuid references public.contributors(id),
  step int not null default 1 check (step >= 1),
  status text not null default 'growing' check (status in ('growing','dormant')),
  is_knot boolean not null default false,
  settled text,
  origin text not null default 'human' check (origin in ('human','ai')),
  confirmed boolean not null default true,
  rejected_at timestamptz,
  visibility text not null default 'shared' check (visibility in ('shared','private')),
  owner_user_id uuid default auth.uid(),
  conversation_id uuid references public.conversations(id),
  message_id uuid references public.messages(id),
  source_excerpt text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (garden_id, key)
);
create table public.idea_links (
  id uuid primary key default gen_random_uuid(),
  garden_id uuid not null references public.gardens(id) on delete cascade,
  parent_id uuid not null references public.ideas(id),
  child_id uuid not null references public.ideas(id),
  kind text not null check (kind in ('primary','merge')),
  origin text not null default 'human' check (origin in ('human','ai')),
  confirmed boolean not null default true,
  rationale text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (parent_id, child_id),
  check (parent_id <> child_id)
);
create unique index idea_links_one_primary on public.idea_links(child_id) where kind = 'primary';
create table public.events (
  id uuid primary key default gen_random_uuid(),
  garden_id uuid not null references public.gardens(id) on delete cascade,
  actor uuid default auth.uid(),
  actor_kind text not null default 'human' check (actor_kind in ('human','ai')),
  type text not null check (type in ('idea_created','idea_edited','link_added','status_changed','knot_set','knot_reopened','conversation_added','imported')),
  idea_id uuid references public.ideas(id),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.ideas(garden_id);
create index on public.idea_links(garden_id);
create index on public.events(garden_id, created_at);
create index on public.messages(conversation_id, position);

-- helpers
create or replace function public.is_garden_member(_garden uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.garden_members where garden_id = _garden and user_id = auth.uid())
$$;
create or replace function public.can_write_garden(_garden uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.garden_members where garden_id = _garden and user_id = auth.uid() and role in ('owner','editor'))
$$;

create or replace function public.add_garden_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.garden_members(garden_id, user_id, role) values (new.id, new.created_by, 'owner');
  return new;
end $$;
create trigger gardens_add_owner after insert on public.gardens for each row execute function public.add_garden_owner();

create or replace function public.events_insert_only()
returns trigger language plpgsql as $$
begin raise exception 'events are insert-only'; end $$;
create trigger events_no_update before update or delete on public.events for each row execute function public.events_insert_only();

create or replace function public.check_idea_link()
returns trigger language plpgsql security definer set search_path = public as $$
declare cur uuid; hops int := 0;
begin
  if (select garden_id from public.ideas where id = new.parent_id) is distinct from new.garden_id
     or (select garden_id from public.ideas where id = new.child_id) is distinct from new.garden_id then
    raise exception 'Both ideas must be in the same garden';
  end if;
  if new.kind = 'primary' then
    cur := new.parent_id;
    while cur is not null loop
      if cur = new.child_id then raise exception 'This link would make the primary chain loop back on itself'; end if;
      hops := hops + 1; if hops > 10000 then exit; end if;
      select parent_id into cur from public.idea_links where child_id = cur and kind = 'primary';
    end loop;
  end if;
  return new;
end $$;
create trigger idea_links_check before insert or update on public.idea_links for each row execute function public.check_idea_link();

create or replace function public.touch_garden()
returns trigger language plpgsql security definer set search_path = public as $$
begin update public.gardens set updated_at = now() where id = new.garden_id; return new; end $$;
create trigger events_touch after insert on public.events for each row execute function public.touch_garden();

-- grants
grant select, insert, update on public.gardens to authenticated;
grant select, insert on public.garden_members to authenticated;
grant select, insert, update on public.contributors, public.steps, public.conversations, public.messages, public.ideas, public.idea_links to authenticated;
grant select, insert on public.events to authenticated;
grant usage, select on sequence public.gardens_specimen_no_seq to authenticated;
grant all on public.gardens, public.garden_members, public.contributors, public.steps, public.conversations, public.messages, public.ideas, public.idea_links, public.events to service_role;

alter table public.gardens enable row level security;
alter table public.garden_members enable row level security;
alter table public.contributors enable row level security;
alter table public.steps enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.ideas enable row level security;
alter table public.idea_links enable row level security;
alter table public.events enable row level security;

create policy "members read gardens" on public.gardens for select to authenticated using (public.is_garden_member(id) or created_by = auth.uid());
create policy "users create gardens" on public.gardens for insert to authenticated with check (created_by = auth.uid());
create policy "writers update gardens" on public.gardens for update to authenticated using (public.can_write_garden(id)) with check (public.can_write_garden(id));

create policy "members read members" on public.garden_members for select to authenticated using (public.is_garden_member(garden_id));

create policy "read contributors" on public.contributors for select to authenticated using (public.is_garden_member(garden_id));
create policy "write contributors" on public.contributors for insert to authenticated with check (public.can_write_garden(garden_id));
create policy "update contributors" on public.contributors for update to authenticated using (public.can_write_garden(garden_id));

create policy "read steps" on public.steps for select to authenticated using (public.is_garden_member(garden_id));
create policy "write steps" on public.steps for insert to authenticated with check (public.can_write_garden(garden_id));
create policy "update steps" on public.steps for update to authenticated using (public.can_write_garden(garden_id));

create policy "read conversations" on public.conversations for select to authenticated using (public.is_garden_member(garden_id));
create policy "write conversations" on public.conversations for insert to authenticated with check (public.can_write_garden(garden_id) and consent_confirmed);
create policy "update conversations" on public.conversations for update to authenticated using (public.can_write_garden(garden_id));

create policy "read messages" on public.messages for select to authenticated using (public.is_garden_member(garden_id));
create policy "write messages" on public.messages for insert to authenticated with check (public.can_write_garden(garden_id));
create policy "update messages" on public.messages for update to authenticated using (public.can_write_garden(garden_id));

create policy "read ideas" on public.ideas for select to authenticated using (
  public.is_garden_member(garden_id) and (visibility = 'shared' or owner_user_id = auth.uid()));
create policy "write ideas" on public.ideas for insert to authenticated with check (public.can_write_garden(garden_id));
create policy "update ideas" on public.ideas for update to authenticated using (
  public.can_write_garden(garden_id) and (visibility = 'shared' or owner_user_id = auth.uid()));

create policy "read links" on public.idea_links for select to authenticated using (public.is_garden_member(garden_id));
create policy "write links" on public.idea_links for insert to authenticated with check (public.can_write_garden(garden_id));
create policy "update links" on public.idea_links for update to authenticated using (public.can_write_garden(garden_id));

create policy "read events" on public.events for select to authenticated using (public.is_garden_member(garden_id));
create policy "write events" on public.events for insert to authenticated with check (public.can_write_garden(garden_id) and actor = auth.uid());