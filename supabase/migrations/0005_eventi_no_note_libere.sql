-- =============================================================
-- 0005_eventi_no_note_libere.sql
-- Read-only roles can no longer write notes in the history.
--
-- The policy used to have a `tipo = 'nota_interna'` branch open to
-- ANY authenticated user: even read-only roles (Sales,
-- Administration) could write a note.
-- Those roles must not change anything, notes included.
-- Operational notes (handover notes, for example) stay covered by
-- the `can_edit_workflow` branch.
--
-- Result:
--   * whoever can work on the job (full access / assigned designer)
--     can insert operational events, handover notes included;
--   * Quality Control can only insert the 'spedizione' event;
--   * read-only roles insert no events at all.
--   In every case user_id = current user (no spoofing).
-- =============================================================

drop policy if exists eventi_insert on public.eventi;
create policy eventi_insert on public.eventi
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      app_private.can_edit_workflow(commessa_id)
      or (tipo = 'spedizione' and app_private.can_mark_shipped())
    )
  );

-- =============================================================
-- END
-- =============================================================
