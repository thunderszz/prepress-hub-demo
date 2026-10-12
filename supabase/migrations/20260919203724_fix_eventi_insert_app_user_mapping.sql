-- =============================================================
-- 20260919203724_fix_eventi_insert_app_user_mapping.sql
--
-- Two fixes, both found in the 19/09/2026 review.
--
-- 1) `eventi_insert` was the LAST policy in the schema still anchored
--    to `auth.uid()`. 0006 decoupled the app identity from the Auth
--    one (matched by email, through
--    `app_private.current_app_user_id()`) and rewrote functions and
--    triggers, but not this policy, born in 0005.
--    Effect: `user_id = auth.uid()` was true for NOBODY
--    (0 of 14 users have `utenti.id = auth.users.id`), so every event
--    written by the client was rejected with 42501. Since
--    `persistEvento` is fire-and-forget, the whole history vanished
--    silently: no error on screen, no row in the database.
--    The new wording is identical to the one already used by
--    `correzioni_insert`, `note_forzatura_insert`,
--    `sospensioni_insert` and `file_commessa_insert`.
--
-- 2) Re-affirms the two MANUAL-MODE grants of 0017. Needed because
--    `supabase/migrations/` does not replay in alphabetical order:
--    `0017_...` sorts BEFORE `20260623122157_limit_authenticated_
--    public_table_grants.sql`, which starts with
--    `revoke all privileges on all tables in schema public from
--    authenticated` and does not re-grant INSERT. On a new database the
--    0017 grants would be wiped right after. This file has a timestamp
--    name, so it sorts last and closes the gap. In production the issue
--    never showed because migrations were applied in chronological
--    order.
--
-- REMOVING the grants: supabase/manual_mode_rollback.sql (unchanged).
-- The `eventi_insert` fix must NOT be reverted: it is a bugfix, not
-- part of the MANUAL-MODE boundary.
-- =============================================================

-- -------------------------------------------------------------
-- EVENTS — anti-spoofing on the app identity, not on Auth.
-- -------------------------------------------------------------
drop policy if exists eventi_insert on public.eventi;
create policy eventi_insert on public.eventi
  for insert to authenticated
  with check (
    user_id = app_private.current_app_user_id()
    and (
      app_private.can_edit_workflow(commessa_id)
      or (tipo = 'spedizione' and app_private.can_mark_shipped())
    )
  );

-- -------------------------------------------------------------
-- MANUAL-MODE — grants re-affirmed after 20260623122157.
-- Idempotent: they change nothing in production.
-- -------------------------------------------------------------
grant insert on table public.commesse to authenticated;
grant insert on table public.clienti  to authenticated;

notify pgrst, 'reload schema';

-- =============================================================
-- END
-- =============================================================
