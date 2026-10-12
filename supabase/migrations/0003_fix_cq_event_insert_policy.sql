-- =============================================================
-- 0003_fix_cq_event_insert_policy.sql
-- Restricts Quality Control to shipping events.
--
-- Previously `can_mark_shipped()` let QC insert any event. QC must
-- only be able to record the event matching "Mark shipped"; the
-- other operational events stay reserved to whoever can work on
-- the job.
-- =============================================================

drop policy if exists eventi_insert on public.eventi;
create policy eventi_insert on public.eventi
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      tipo = 'nota_interna'
      or app_private.can_edit_workflow(commessa_id)
      or (tipo = 'spedizione' and app_private.can_mark_shipped())
    )
  );

-- =============================================================
-- END
-- =============================================================
