-- =============================================================
-- 0004_fix_grafico_force_spedito.sql
-- Blocks the case: assigned designer -> override/mark "shipped".
--
-- The rule:
-- - an assigned designer can work on the job and override intermediate steps;
-- - "Shipped" is reserved to Quality Control and full-access roles.
-- =============================================================

drop policy if exists note_forzatura_insert on public.note_forzatura;
create policy note_forzatura_insert on public.note_forzatura
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      (stato_target = 'spedito'::public.stato_commessa and app_private.can_mark_shipped())
      or (
        stato_target <> 'spedito'::public.stato_commessa
        and app_private.can_edit_workflow(commessa_id)
      )
    )
  );

create or replace function app_private.enforce_commesse_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only QC and full-access roles can mark a job "shipped".
  -- RLS decides who can update the row; this blocks the case
  -- assigned designer -> shipped, which would otherwise pass via can_edit_workflow.
  if auth.uid() is not null
     and old.stato is distinct from 'spedito'::public.stato_commessa
     and new.stato = 'spedito'::public.stato_commessa
     and not app_private.can_mark_shipped()
  then
    raise exception 'Only Quality Control or full-access roles can mark a job as Shipped.';
  end if;

  -- Quality Control can only move the job to "shipped".
  -- The technical update of `spedita_il` and `aggiornata_il` is allowed too.
  if app_private.current_user_role() = 'controllo_qualita'
     and not app_private.is_full_access()
  then
    if old.stato = 'spedito' or new.stato <> 'spedito' then
      raise exception 'Quality Control can only mark a job as Shipped.';
    end if;

    if (to_jsonb(new) - 'stato' - 'spedita_il' - 'aggiornata_il')
       <> (to_jsonb(old) - 'stato' - 'spedita_il' - 'aggiornata_il') then
      raise exception 'Quality Control cannot change other job fields.';
    end if;
  end if;

  -- A job can be claimed only once, and only in your own name.
  if new.presa_in_carico_da_user_id is distinct from old.presa_in_carico_da_user_id then
    if old.presa_in_carico_da_user_id is not null then
      raise exception 'The job has already been claimed.';
    end if;

    if auth.uid() is not null
       and new.presa_in_carico_da_user_id is distinct from auth.uid() then
      raise exception 'You can only claim a job in your own name.';
    end if;

    new.presa_in_carico_il := coalesce(new.presa_in_carico_il, now());
  end if;

  -- Retention anchor: when a job becomes "shipped", the DB sets the date.
  if old.stato is distinct from 'spedito'::public.stato_commessa
     and new.stato = 'spedito'::public.stato_commessa then
    new.spedita_il := coalesce(new.spedita_il, now());
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_commesse_integrity() from public;

-- =============================================================
-- END
-- =============================================================
