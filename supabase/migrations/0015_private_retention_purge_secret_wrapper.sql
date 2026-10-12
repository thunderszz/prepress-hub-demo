-- =============================================================
-- 0015 — Unprivileged public wrapper for the purge secret
--
-- 0014 introduced the application secret for retention-purge, but
-- the public check function was SECURITY DEFINER. We keep the public
-- RPC needed by PostgREST/Edge Function, moving the privileged read
-- into app_private.
-- =============================================================

grant usage on schema app_private to service_role;

create or replace function app_private.verify_retention_purge_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app_private.function_secrets s
    where s.name = 'retention-purge'
      and s.secret = p_secret
      and p_secret <> ''
  );
$$;

revoke all on function app_private.verify_retention_purge_secret(text) from public;
revoke all on function app_private.verify_retention_purge_secret(text) from anon;
revoke all on function app_private.verify_retention_purge_secret(text) from authenticated;
grant execute on function app_private.verify_retention_purge_secret(text) to service_role;

create or replace function public.verify_retention_purge_secret(p_secret text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.verify_retention_purge_secret(p_secret);
$$;

revoke all on function public.verify_retention_purge_secret(text) from public;
revoke all on function public.verify_retention_purge_secret(text) from anon;
revoke all on function public.verify_retention_purge_secret(text) from authenticated;
grant execute on function public.verify_retention_purge_secret(text) to service_role;
grant execute on function app_private.can_edit_workflow(uuid) to service_role;
