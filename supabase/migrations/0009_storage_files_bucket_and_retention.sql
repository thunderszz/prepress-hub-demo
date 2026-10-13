-- =============================================================
-- 0009 — Job file storage and retention
-- Private bucket for binaries, policies aligned with the RLS of
-- file_commessa, configurable automatic cleanup through pg_cron.
-- =============================================================

-- 1) Private bucket. PDF, JPEG and PNG only, 50 MB limit.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'commessa-files', 'commessa-files', false, 52428800,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) Helper: extracts the job id from the first folder of the path
--    (convention: <commessa_id>/<file-name>). Null if not a uuid.
create or replace function app_private.storage_commessa_id(object_name text)
returns uuid
language plpgsql
immutable
as $$
begin
  return ((storage.foldername(object_name))[1])::uuid;
exception when others then
  return null;
end;
$$;

revoke all on function app_private.storage_commessa_id(text) from public, anon;
grant execute on function app_private.storage_commessa_id(text) to authenticated;

-- 3) Policies on storage.objects, limited to the commessa-files bucket.
-- SELECT (download/signed URL): any mapped app user, but only while
-- the binary is within retention (flag on the metadata).
drop policy if exists commessa_files_select on storage.objects;
create policy commessa_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'commessa-files'
    and app_private.current_app_user_id() is not null
    and (
      exists (
        select 1 from public.file_commessa f
        where f.storage_path = name and f.binario_disponibile
      )
      or exists (
        select 1 from public.email_inviate e
        where e.allegato_path = name
      )
    )
  );

-- INSERT/UPDATE (upload, and overwrite by name): same permissions as
-- inserting into file_commessa (can_edit_workflow on the job).
drop policy if exists commessa_files_insert on storage.objects;
create policy commessa_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'commessa-files'
    and app_private.can_edit_workflow(app_private.storage_commessa_id(name))
  );

drop policy if exists commessa_files_update on storage.objects;
create policy commessa_files_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'commessa-files'
    and app_private.can_edit_workflow(app_private.storage_commessa_id(name))
  )
  with check (
    bucket_id = 'commessa-files'
    and app_private.can_edit_workflow(app_private.storage_commessa_id(name))
  );

-- No DELETE policy for users: binaries are only deleted by
-- server-side retention.

-- 4) Retention (files and email attachments): flags the metadata and deletes the
--    binaries N days after shipping. N is configurable in impostazioni
--    (retention_file_giorni / retention_pdf_email_giorni, default 30).
create or replace function app_private.apply_file_retention()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  giorni_file  integer := coalesce((select valore::int from public.impostazioni where chiave = 'retention_file_giorni'), 30);
  giorni_email integer := coalesce((select valore::int from public.impostazioni where chiave = 'retention_pdf_email_giorni'), 30);
  n_file  integer := 0;
  n_email integer := 0;
begin
  -- Working files: the metadata row stays with
  -- binario_disponibile=false ("file no longer available").
  with scaduti as (
    select f.id, f.storage_path
    from public.file_commessa f
    join public.commesse c on c.id = f.commessa_id
    where c.stato = 'spedito'
      and c.spedita_il is not null
      and c.spedita_il < now() - make_interval(days => giorni_file)
      and f.binario_disponibile
  ), upd as (
    update public.file_commessa f
    set binario_disponibile = false
    from scaduti s
    where f.id = s.id
    returning f.id
  ), del as (
    delete from storage.objects o
    where o.bucket_id = 'commessa-files'
      and o.name in (select storage_path from scaduti where storage_path is not null)
    returning o.id
  )
  select count(*) into n_file from upd;

  -- PDFs attached to sent emails: allegato_nome stays (permanent
  -- metadata, "attachment no longer available"), the binary goes.
  with scadute as (
    select e.id, e.allegato_path
    from public.email_inviate e
    join public.commesse c on c.id = e.commessa_id
    where c.stato = 'spedito'
      and c.spedita_il is not null
      and c.spedita_il < now() - make_interval(days => giorni_email)
      and e.allegato_path is not null
  ), upd as (
    update public.email_inviate e
    set allegato_path = null
    from scadute s
    where e.id = s.id
    returning e.id
  ), del as (
    delete from storage.objects o
    where o.bucket_id = 'commessa-files'
      and o.name in (select allegato_path from scadute)
    returning o.id
  )
  select count(*) into n_email from upd;

  return n_file + n_email;
end;
$$;

revoke all on function app_private.apply_file_retention() from public, anon, authenticated;

-- 5) Daily job at 02:30 UTC. Named cron.schedule is idempotent.
create extension if not exists pg_cron;
select cron.schedule('file-retention-daily', '30 2 * * *', 'select app_private.apply_file_retention()');
