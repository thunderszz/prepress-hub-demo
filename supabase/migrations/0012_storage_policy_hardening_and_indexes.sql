-- =============================================================
-- 0012 — Hardening from code review (2026-06-10)
-- M2: storage uploads must refer to an EXISTING job
--     (with a non-uuid path can_edit_workflow(null) was true for
--     full-access users: they could create orphan blobs).
-- B2: indexes for the EXISTS subqueries of the storage select policy.
-- =============================================================

drop policy if exists commessa_files_insert on storage.objects;
create policy commessa_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'commessa-files'
    and app_private.storage_commessa_id(name) is not null
    and exists (
      select 1 from public.commesse c
      where c.id = app_private.storage_commessa_id(name)
    )
    and app_private.can_edit_workflow(app_private.storage_commessa_id(name))
  );

drop policy if exists commessa_files_update on storage.objects;
create policy commessa_files_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'commessa-files'
    and app_private.storage_commessa_id(name) is not null
    and exists (
      select 1 from public.commesse c
      where c.id = app_private.storage_commessa_id(name)
    )
    and app_private.can_edit_workflow(app_private.storage_commessa_id(name))
  )
  with check (
    bucket_id = 'commessa-files'
    and app_private.storage_commessa_id(name) is not null
    and exists (
      select 1 from public.commesse c
      where c.id = app_private.storage_commessa_id(name)
    )
    and app_private.can_edit_workflow(app_private.storage_commessa_id(name))
  );

create index if not exists idx_file_commessa_storage_path
  on public.file_commessa (storage_path);
create index if not exists idx_email_inviate_allegato_path
  on public.email_inviate (allegato_path);
