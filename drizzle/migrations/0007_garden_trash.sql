alter table public.gardens add column deleted_at timestamptz;

create or replace function public.is_garden_owner(_garden uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.gardens g where g.id = _garden and g.created_by = auth.uid())
      or exists (select 1 from public.garden_members m where m.garden_id = _garden and m.user_id = auth.uid() and m.role = 'owner')
$$;

create or replace function public.trash_garden(_garden uuid, _trash boolean) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not public.is_garden_owner(_garden) then raise exception 'Only the owner can move this garden to the trash.'; end if;
  update public.gardens set deleted_at = case when _trash then now() else null end, updated_at = now() where id = _garden;
end $$;
grant execute on function public.trash_garden(uuid, boolean) to authenticated;

create or replace function public.archive_is_insert_only() returns trigger language plpgsql as $function$
begin
  if tg_op = 'DELETE' and current_setting('ramus.purge', true) = old.garden_id::text then return old; end if;
  raise exception 'The archive is insert-only: % rows cannot be changed or deleted. Add a new row instead.', TG_TABLE_NAME;
end $function$;

create or replace function public.events_insert_only() returns trigger language plpgsql as $function$
begin
  if tg_op = 'DELETE' and current_setting('ramus.purge', true) = old.garden_id::text then return old; end if;
  raise exception 'events are insert-only';
end $function$;

create or replace function public.thought_events_guard() returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if tg_op = 'DELETE' and current_setting('ramus.purge', true) = old.garden_id::text then return old; end if;
  if tg_op = 'DELETE' then raise exception 'thought events are insert-only'; end if;
  if current_setting('ramus.review', true) is distinct from 'on' then raise exception 'thought events are insert-only; a correction is a new row'; end if;
  if (to_jsonb(new) - 'confirmed' - 'rejected_at') <> (to_jsonb(old) - 'confirmed' - 'rejected_at') then raise exception 'only confirmed or rejected_at may be set'; end if;
  if old.confirmed and not new.confirmed then raise exception 'confirmed can be set only once'; end if;
  if old.rejected_at is not null and new.rejected_at is distinct from old.rejected_at then raise exception 'rejected_at can be set only once'; end if;
  return new;
end $function$;

alter table public.intake_batches drop constraint intake_batches_garden_id_fkey,
  add constraint intake_batches_garden_id_fkey foreign key (garden_id) references public.gardens(id) on delete cascade;
alter table public.speaker_aliases drop constraint speaker_aliases_garden_id_fkey,
  add constraint speaker_aliases_garden_id_fkey foreign key (garden_id) references public.gardens(id) on delete cascade;

create or replace function public.delete_garden_forever(_garden uuid) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if not public.is_garden_owner(_garden) then raise exception 'Only the owner can delete this garden.'; end if;
  if (select deleted_at from public.gardens where id = _garden) is null then raise exception 'Move the garden to the trash first.'; end if;
  perform set_config('ramus.purge', _garden::text, true);
  delete from public.gardens where id = _garden;
end $$;
grant execute on function public.delete_garden_forever(uuid) to authenticated;

create policy "garden owners delete originals" on storage.objects for delete to authenticated
  using (bucket_id = 'conversation-originals' and public.is_garden_owner(((storage.foldername(name))[1])::uuid));