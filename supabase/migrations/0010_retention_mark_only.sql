-- =============================================================
-- 0010 — "Mark-only" retention (fixes 0009)
-- Supabase blocks direct DELETE on storage.objects (trigger
-- storage.protect_delete: the Storage API must be used). Retention
-- therefore FLAGS binaries as unavailable: the select policies make
-- them inaccessible immediately. Physical deletion happens through
-- the Storage API (a scheduled Edge Function, see 0013); paths
-- stay in the table precisely for that purge.
-- =============================================================

-- 1) Availability flag for email attachments (the archive is permanent,
--    allegato_nome is permanent, the binary expires).
alter table public.email_inviate
  add column if not exists allegato_disponibile boolean not null default true;

-- 2) The select on storage objects honours the flag for email
--    attachments too (job files already use binario_disponibile).
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
        where e.allegato_path = name and e.allegato_disponibile
      )
    )
  );

-- 3) Mark-only retention: no delete on storage.objects.
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
  update public.file_commessa f
  set binario_disponibile = false
  from public.commesse c
  where c.id = f.commessa_id
    and c.stato = 'spedito'
    and c.spedita_il is not null
    and c.spedita_il < now() - make_interval(days => giorni_file)
    and f.binario_disponibile;
  get diagnostics n_file = row_count;

  update public.email_inviate e
  set allegato_disponibile = false
  from public.commesse c
  where c.id = e.commessa_id
    and c.stato = 'spedito'
    and c.spedita_il is not null
    and c.spedita_il < now() - make_interval(days => giorni_email)
    and e.allegato_path is not null
    and e.allegato_disponibile;
  get diagnostics n_email = row_count;

  return n_file + n_email;
end;
$$;

revoke all on function app_private.apply_file_retention() from public, anon, authenticated;
