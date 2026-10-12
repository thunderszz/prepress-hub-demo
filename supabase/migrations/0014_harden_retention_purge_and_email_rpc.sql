-- =============================================================
-- 0014 — Hardening of retention purge + email permission RPC
--
-- - retention-purge: requires an application secret that is not
--   hardcoded in the repo. The value is generated in the DB on first
--   apply and read by the cron at call time.
-- - can_edit_commessa: must not be SECURITY DEFINER in public; the
--   public function stays an invoker wrapper around the RLS helpers.
-- =============================================================

create table if not exists app_private.function_secrets (
  name text primary key,
  secret text not null,
  created_at timestamptz not null default now()
);

revoke all on table app_private.function_secrets from public, anon, authenticated;

insert into app_private.function_secrets (name, secret)
select 'retention-purge', encode(gen_random_bytes(32), 'hex')
where not exists (
  select 1 from app_private.function_secrets where name = 'retention-purge'
);

create or replace function public.verify_retention_purge_secret(p_secret text)
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

revoke all on function public.verify_retention_purge_secret(text) from public;
revoke all on function public.verify_retention_purge_secret(text) from anon;
revoke all on function public.verify_retention_purge_secret(text) from authenticated;
grant execute on function public.verify_retention_purge_secret(text) to service_role;

create or replace function public.can_edit_commessa(p_commessa_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select app_private.can_edit_workflow(p_commessa_id);
$$;

revoke all on function public.can_edit_commessa(uuid) from public;
revoke all on function public.can_edit_commessa(uuid) from anon;
grant execute on function public.can_edit_commessa(uuid) to authenticated;
grant execute on function public.can_edit_commessa(uuid) to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'file-purge-daily') then
    perform cron.unschedule('file-purge-daily');
  end if;
end $$;

select cron.schedule(
  'file-purge-daily',
  '0 3 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/retention-purge',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR-ANON-KEY',
      'x-retention-purge-secret', (
        select secret
        from app_private.function_secrets
        where name = 'retention-purge'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
