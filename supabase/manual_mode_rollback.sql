-- =============================================================
-- manual_mode_rollback.sql
--
-- Closes manual creation of jobs and customers again.
-- RUN once the ERP sync is live.
--
-- Frontend side too: `grep -rn MANUAL-MODE src`,
-- delete src/lib/manualCommessa.ts,
-- src/components/NuovaCommessaDialog.tsx and
-- src/components/NuovoClienteDialog.tsx, and set back to `false`
-- canCreateCommessa, canCreateCliente and canRenameCliente in
-- src/lib/permissions.ts.
--
-- NB: customer renaming has nothing to undo here: it uses the
-- UPDATE grant and the `clienti_write` policy, which already existed
-- and stay (they edit email, phone and notes). The boundary
-- is only in the frontend: remove the editable name field.
--
-- NB: `eventi_insert` and `clienti_write` do not appear here because
-- 0017 (full-access version) never touched them.
--
-- NB: 20260919203724 rewrites `eventi_insert` on
-- `app_private.current_app_user_id()`. It must NOT be reverted: it is
-- the bugfix of a policy left behind by 0006, not part of the
-- MANUAL-MODE boundary. Reverting it would zero the event history.
--
-- NB: the enum value 'creazione_manuale' stays. Postgres cannot
-- remove values from an enum, and history events already written
-- with that type must stay readable.
-- =============================================================

-- Back to the 20260623122157 grants (select, update and nothing else):
-- without the grant, `clienti_write` can no longer insert and customers
-- are created server-side only by the ERP sync again.
revoke insert on table public.commesse from authenticated;
revoke insert on table public.clienti  from authenticated;

drop policy if exists commesse_insert on public.commesse;

drop trigger  if exists trg_enforce_commessa_insert_defaults on public.commesse;
drop function if exists app_private.enforce_commessa_insert_defaults();

notify pgrst, 'reload schema';
