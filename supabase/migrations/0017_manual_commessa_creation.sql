-- =============================================================
-- 0017_manual_commessa_creation.sql               [MANUAL-MODE]
--
-- Opens manual creation of jobs and customers until the ERP API is
-- available. By design (0001_rls_policies.sql) jobs were meant to be
-- created ONLY server-side by the ERP sync: no INSERT policy and no
-- grant for the client.
--
-- Permissions: full access only (production manager, design team
-- lead). Same line as 0005: read-only roles write nothing, not even
-- in manual mode.
--
-- Why a single policy is enough:
--   * CLIENTI — `clienti_write` (0001) is already `for all` with
--     `is_full_access()` and covers INSERT: only the grant is missing.
--   * EVENTI  — `eventi_insert` (0005) requires `can_edit_workflow`,
--     which is always true for full access.
--     WARNING: the original version of this comment stopped here and
--     was wrong. `eventi_insert` ALSO requires
--     `user_id = auth.uid()`, and since 0006 the app identity is
--     `app_private.current_app_user_id()` (matched by email):
--     no user satisfied that condition, and the creation event was
--     rejected with 42501. Fixed by
--     20260919203724_fix_eventi_insert_app_user_mapping.sql.
-- The MANUAL-MODE boundary therefore boils down to two grants, one
-- policy and one trigger.
--
-- REMOVAL: apply supabase/manual_mode_rollback.sql.
--
-- HISTORICAL NOTE: in production this migration was first applied in
-- a version open to every authenticated user and restricted right
-- after (`manual_creation_restrict_to_full_access`, 2026-09-17).
-- On a new database this file produces the final state directly,
-- without going through the open version.
--
-- ORDERING: this file is NOT enough on its own on a new database.
-- `0017_...` sorts before `20260623122157_limit_authenticated_
-- public_table_grants.sql`, which does `revoke all privileges on all
-- tables in schema public from authenticated` and does not re-grant
-- INSERT: the two grants below would be wiped right after.
-- 20260919203724, which sorts last, re-affirms them.
-- =============================================================

-- -------------------------------------------------------------
-- GRANT: without these the client gets "permission denied for
-- table" before RLS is even evaluated. The Postgres role
-- `authenticated` is the same for every portal user: app roles are
-- told apart by the policies, not by the grants.
-- -------------------------------------------------------------
grant insert on table public.commesse to authenticated;
grant insert on table public.clienti  to authenticated;

-- -------------------------------------------------------------
-- JOBS — new INSERT policy.
-- Initial values are enforced by the trigger below, not by the
-- policy: with check cannot rewrite the row, only reject it.
-- -------------------------------------------------------------
drop policy if exists commesse_insert on public.commesse;
create policy commesse_insert on public.commesse
  for insert to authenticated
  with check (app_private.is_full_access());

-- -------------------------------------------------------------
-- GUARDRAIL: a job created by the client always starts from the beginning.
-- Without this trigger even a full-access user could, through the
-- API, insert a job already 'spedito', with outcomes filled in and
-- claimed by someone else, bypassing the whole workflow.
--
-- auth.uid() is null = service_role call (Edge Function, cron,
-- future ERP sync): no constraint, those channels are trusted and
-- must be able to import jobs in any status.
--
-- The existing `enforce_commesse_integrity` trigger is `before update`
-- and dereferences `old`: it does not cover insert, a separate function is needed.
-- -------------------------------------------------------------
create or replace function app_private.enforce_commessa_insert_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  new.stato                     := 'disponibile'::public.stato_commessa;
  new.revisioni_pdf             := 0;
  new.presa_in_carico_da_user_id := null;
  new.presa_in_carico_il        := null;
  new.esito_prova_colore        := null;
  new.esito_caduta              := null;
  new.spedita_il                := null;
  new.annullata_il              := null;
  new.sospensione_attiva_id     := null;
  new.creata_il                 := coalesce(new.creata_il, now());
  new.aggiornata_il             := now();

  return new;
end;
$$;

revoke all on function app_private.enforce_commessa_insert_defaults() from public;

drop trigger if exists trg_enforce_commessa_insert_defaults on public.commesse;
create trigger trg_enforce_commessa_insert_defaults
  before insert on public.commesse
  for each row execute function app_private.enforce_commessa_insert_defaults();

notify pgrst, 'reload schema';

-- =============================================================
-- END
-- =============================================================
