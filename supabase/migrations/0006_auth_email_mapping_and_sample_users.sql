-- =============================================================
-- 0006_auth_email_mapping_and_sample_users.sql
-- Decouple app users from auth.users UUIDs and map RLS by email.
--
-- Users/roles below are sample data. This migration
-- intentionally does NOT seed fake clienti or commesse.
-- =============================================================

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

-- Public app users must exist before Auth accounts are created/invited.
-- Auth accounts are matched by email through app_private.current_app_user_id().
alter table public.utenti drop constraint if exists utenti_id_fkey;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'utenti_email_key'
      and conrelid = 'public.utenti'::regclass
  ) then
    alter table public.utenti add constraint utenti_email_key unique (email);
  end if;
end $$;

create or replace function app_private.current_app_user_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select u.id
  from public.utenti u
  where lower(u.email) = lower(auth.email())
    and u.attivo = true
  limit 1
$$;

create or replace function app_private.current_user_role()
returns public.ruolo
language sql stable security definer set search_path = public as $$
  select ruolo
  from public.utenti
  where id = app_private.current_app_user_id()
$$;

create or replace function app_private.is_full_access()
returns boolean
language sql stable security definer set search_path = public as $$
  select app_private.current_user_role()
    in ('responsabile_produzione', 'responsabile_ufficio_grafico')
$$;

create or replace function app_private.is_assegnato(p_commessa uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.commessa_assegnatari a
    where a.commessa_id = p_commessa
      and a.user_id = app_private.current_app_user_id()
  )
$$;

create or replace function app_private.can_edit_workflow(p_commessa uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select app_private.is_full_access()
      or (
        app_private.current_user_role() = 'grafico'
        and app_private.is_assegnato(p_commessa)
      )
$$;

create or replace function app_private.can_mark_shipped()
returns boolean
language sql stable security definer set search_path = public as $$
  select app_private.is_full_access()
      or app_private.current_user_role() = 'controllo_qualita'
$$;

revoke all on function app_private.current_app_user_id() from public;
revoke all on function app_private.current_user_role() from public;
revoke all on function app_private.is_full_access() from public;
revoke all on function app_private.is_assegnato(uuid) from public;
revoke all on function app_private.can_edit_workflow(uuid) from public;
revoke all on function app_private.can_mark_shipped() from public;

grant execute on function app_private.current_app_user_id() to authenticated;
grant execute on function app_private.current_user_role() to authenticated;
grant execute on function app_private.is_full_access() to authenticated;
grant execute on function app_private.is_assegnato(uuid) to authenticated;
grant execute on function app_private.can_edit_workflow(uuid) to authenticated;
grant execute on function app_private.can_mark_shipped() to authenticated;

create or replace function app_private.prevent_self_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ruolo is distinct from old.ruolo
     and old.id = app_private.current_app_user_id() then
    raise exception 'You cannot change your own role.';
  end if;
  return new;
end;
$$;

create or replace function app_private.enforce_commesse_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  app_user_id uuid := app_private.current_app_user_id();
begin
  if app_user_id is not null
     and old.stato is distinct from 'spedito'::public.stato_commessa
     and new.stato = 'spedito'::public.stato_commessa
     and not app_private.can_mark_shipped()
  then
    raise exception 'Only Quality Control or full-access roles can mark a job as Shipped.';
  end if;

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

  if new.presa_in_carico_da_user_id is distinct from old.presa_in_carico_da_user_id then
    if old.presa_in_carico_da_user_id is not null then
      raise exception 'The job has already been claimed.';
    end if;

    if app_user_id is not null
       and new.presa_in_carico_da_user_id is distinct from app_user_id then
      raise exception 'You can only claim a job in your own name.';
    end if;

    new.presa_in_carico_il := coalesce(new.presa_in_carico_il, now());
  end if;

  if old.stato is distinct from 'spedito'::public.stato_commessa
     and new.stato = 'spedito'::public.stato_commessa then
    new.spedita_il := coalesce(new.spedita_il, now());
  end if;

  return new;
end;
$$;

-- Recreate policies that compare row author fields with the app user id.
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

drop policy if exists correzioni_insert on public.correzioni;
create policy correzioni_insert on public.correzioni
  for insert to authenticated
  with check (
    user_id = app_private.current_app_user_id()
    and app_private.can_edit_workflow(commessa_id)
  );

drop policy if exists file_commessa_insert on public.file_commessa;
create policy file_commessa_insert on public.file_commessa
  for insert to authenticated
  with check (
    caricato_da_user_id = app_private.current_app_user_id()
    and app_private.can_edit_workflow(commessa_id)
  );

drop policy if exists sospensioni_insert on public.sospensioni;
create policy sospensioni_insert on public.sospensioni
  for insert to authenticated
  with check (
    aperta_da_user_id = app_private.current_app_user_id()
    and app_private.can_edit_workflow(commessa_id)
  );

drop policy if exists note_forzatura_insert on public.note_forzatura;
create policy note_forzatura_insert on public.note_forzatura
  for insert to authenticated
  with check (
    user_id = app_private.current_app_user_id()
    and (
      (stato_target = 'spedito'::public.stato_commessa and app_private.can_mark_shipped())
      or (
        stato_target <> 'spedito'::public.stato_commessa
        and app_private.can_edit_workflow(commessa_id)
      )
    )
  );

-- Sample (fictional) users and prepress groups. IDs are generated once and then retained.
insert into public.utenti (id, nome, email, ruolo, attivo, iniziali)
values
  (gen_random_uuid(), 'Giulia Ferri', 'giulia.ferri@acmeflexo.example', 'responsabile_produzione', true, 'GF'),
  (gen_random_uuid(), 'Marco Bellini', 'marco.bellini@acmeflexo.example', 'responsabile_ufficio_grafico', true, 'MB'),
  (gen_random_uuid(), 'Sara Conti', 'sara.conti@acmeflexo.example', 'responsabile_commerciale', true, 'SC'),
  (gen_random_uuid(), 'Paolo Greco', 'paolo.greco@acmeflexo.example', 'amministrazione', true, 'PG'),
  (gen_random_uuid(), 'Elena Riva', 'elena.riva@acmeflexo.example', 'controllo_qualita', true, 'ER'),
  (gen_random_uuid(), 'Luca Moretti', 'luca.moretti@acmeflexo.example', 'grafico', true, 'LM'),
  (gen_random_uuid(), 'Matteo Russo', 'matteo.russo@acmeflexo.example', 'grafico', true, 'MR'),
  (gen_random_uuid(), 'Anna Costa', 'anna.costa@acmeflexo.example', 'grafico', true, 'AC'),
  (gen_random_uuid(), 'Federico Leone', 'federico.leone@acmeflexo.example', 'grafico', true, 'FL'),
  (gen_random_uuid(), 'Chiara Galli', 'chiara.galli@acmeflexo.example', 'grafico', true, 'CG'),
  (gen_random_uuid(), 'Irene Marchi', 'irene.marchi@acmeflexo.example', 'grafico', true, 'IM'),
  (gen_random_uuid(), 'Tommaso Villa', 'tommaso.villa@acmeflexo.example', 'grafico', true, 'TV'),
  (gen_random_uuid(), 'Nicola Serra', 'nicola.serra@acmeflexo.example', 'grafico', true, 'NS'),
  (gen_random_uuid(), 'Alice Fontana', 'alice.fontana@acmeflexo.example', 'grafico', true, 'AF')
on conflict (email) do update set
  nome = excluded.nome,
  ruolo = excluded.ruolo,
  attivo = excluded.attivo,
  iniziali = excluded.iniziali;

insert into public.gruppi_prestampa (id, nome, mailbox)
values
  (gen_random_uuid(), 'prestampa01', 'prestampa01@acmeflexo.example'),
  (gen_random_uuid(), 'prestampa02', 'prestampa02@acmeflexo.example'),
  (gen_random_uuid(), 'prestampa03', 'prestampa03@acmeflexo.example'),
  (gen_random_uuid(), 'prestampa04', 'prestampa04@acmeflexo.example'),
  (gen_random_uuid(), 'prestampa05', 'prestampa05@acmeflexo.example')
on conflict (nome) do update set mailbox = excluded.mailbox;

insert into public.utente_gruppi (utente_id, gruppo_id)
select u.id, g.id
from (values
  ('nicola.serra@acmeflexo.example', 'prestampa01'),
  ('chiara.galli@acmeflexo.example', 'prestampa01'),
  ('luca.moretti@acmeflexo.example', 'prestampa01'),
  ('irene.marchi@acmeflexo.example', 'prestampa02'),
  ('tommaso.villa@acmeflexo.example', 'prestampa02'),
  ('matteo.russo@acmeflexo.example', 'prestampa03'),
  ('alice.fontana@acmeflexo.example', 'prestampa03'),
  ('marco.bellini@acmeflexo.example', 'prestampa05'),
  ('anna.costa@acmeflexo.example', 'prestampa05'),
  ('federico.leone@acmeflexo.example', 'prestampa05'),
  ('matteo.russo@acmeflexo.example', 'prestampa05')
) as m(email, gruppo)
join public.utenti u on u.email = m.email
join public.gruppi_prestampa g on g.nome = m.gruppo
on conflict do nothing;

-- Realtime: technical config only, no data.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'commesse'
  ) then
    alter publication supabase_realtime add table public.commesse;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'commessa_assegnatari'
  ) then
    alter publication supabase_realtime add table public.commessa_assegnatari;
  end if;
end $$;

-- =============================================================
-- END
-- =============================================================
