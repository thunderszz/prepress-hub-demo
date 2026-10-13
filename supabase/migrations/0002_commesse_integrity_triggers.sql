-- =============================================================
-- 0002_commesse_integrity_triggers.sql
-- Automatic checks on changes to `commesse`.
--
-- RLS decides WHO may try to change a row.
-- This trigger decides HOW the row may change, in the cases that
-- need finer, column-level checks.
-- =============================================================

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

drop trigger if exists trg_enforce_commesse_integrity on public.commesse;
create trigger trg_enforce_commesse_integrity
  before update on public.commesse
  for each row execute function app_private.enforce_commesse_integrity();

-- =============================================================
-- END
-- =============================================================
