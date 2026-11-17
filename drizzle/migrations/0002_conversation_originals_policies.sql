create policy "garden members read originals" on storage.objects for select to authenticated
  using (bucket_id = 'conversation-originals' and public.is_garden_member(((storage.foldername(name))[1])::uuid));
create policy "garden writers upload originals" on storage.objects for insert to authenticated
  with check (bucket_id = 'conversation-originals' and public.can_write_garden(((storage.foldername(name))[1])::uuid));