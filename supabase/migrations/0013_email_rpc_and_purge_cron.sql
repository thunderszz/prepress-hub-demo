-- =============================================================
-- 0013 — Real emails (§11) and physical purge of expired binaries
--
-- 1) Public RPC can_edit_commessa: exposes the permission check
--    app_private.can_edit_workflow to the send-email Edge Function
--    (the app_private schema is not exposed through PostgREST).
--    Runs in the context of the authenticated caller: no bypass.
--
-- 2) pg_net + pg_cron job "file-purge-daily": calls the
--    retention-purge Edge Function (Storage API), which physically
--    deletes binaries already flagged unavailable by retention 0010.
--    Direct DELETE on storage.objects is blocked by Supabase, hence
--    the function. The bearer is the anon key (public by design):
--    the function is idempotent and can only delete binaries that
--    have already expired, never live data.
-- =============================================================

-- 1) Job edit permission RPC (for the send-email Edge Function)
create or replace function public.can_edit_commessa(p_commessa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_private.can_edit_workflow(p_commessa_id);
$$;

revoke all on function public.can_edit_commessa(uuid) from public;
revoke all on function public.can_edit_commessa(uuid) from anon;
grant execute on function public.can_edit_commessa(uuid) to authenticated;
grant execute on function public.can_edit_commessa(uuid) to service_role;

-- 2) Daily physical purge through the Edge Function
create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'file-purge-daily') then
    perform cron.unschedule('file-purge-daily');
  end if;
end $$;

-- 03:00 UTC: half an hour after "file-retention-daily" (02:30), which flags expired binaries.
select cron.schedule(
  'file-purge-daily',
  '0 3 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/retention-purge',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR-ANON-KEY'
    ),
    body := '{}'::jsonb
  );
  $$
);
