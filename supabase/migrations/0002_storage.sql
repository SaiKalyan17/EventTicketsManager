-- Storage bucket for event branding (logo, banner, invitation artwork).
-- Public read (these images are shown on public e-pass pages); only
-- Super Admins can upload / replace / delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-assets', 'event-assets', true, 5242880,
        array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/png','image/jpeg','image/webp'];

create policy "event assets are publicly readable" on storage.objects
  for select using (bucket_id = 'event-assets');

create policy "super admins upload event assets" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-assets' and public.has_role('super_admin'));

create policy "super admins update event assets" on storage.objects
  for update to authenticated
  using (bucket_id = 'event-assets' and public.has_role('super_admin'));

create policy "super admins delete event assets" on storage.objects
  for delete to authenticated
  using (bucket_id = 'event-assets' and public.has_role('super_admin'));
