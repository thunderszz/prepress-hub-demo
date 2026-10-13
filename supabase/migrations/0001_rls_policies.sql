-- =============================================================
-- 0001_rls_policies.sql
-- Row Level Security for Prepress Hub
--
-- Translates the logic of src/lib/permissions.ts into SQL.
-- The database-side "lock": it ALWAYS applies, even if the frontend is
-- bypassed. The frontend keeps a copy of the same rules only for the
-- user experience (hiding buttons), not for security.
--
-- Role model (types.ts):
--   full-access = responsabile_produzione, responsabile_ufficio_grafico
--   others      = responsabile_commerciale, amministrazione,
--                 controllo_qualita, grafico
--
-- Everyone sees every job → SELECT open to every
-- authenticated user. Per-role filters are UI only.
--
-- NB: calls with the service_role key (Edge Functions, cron jobs,
-- ERP sync) BYPASS RLS by design. So here we do NOT grant the client
-- permissions for actions that run server-side in production
-- (see the "SERVER-ONLY" comments).
--
-- Idempotent: can be re-run (drop policy if exists + create).
-- =============================================================

-- -------------------------------------------------------------
-- HELPER FUNCTIONS
-- Privileged functions live in a private schema, not exposed through
-- the API. Policies use them to read `utenti`/assignments without
-- RLS recursion.
-- -------------------------------------------------------------

create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

create or replace function app_private.current_user_role()
returns public.ruolo
language sql stable security definer set search_path = public as $$
  select ruolo from public.utenti where id = auth.uid()
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
    where a.commessa_id = p_commessa and a.user_id = auth.uid()
  )
$$;

-- canEditWorkflow: full access OR designer assigned to the job
create or replace function app_private.can_edit_workflow(p_commessa uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select app_private.is_full_access()
      or (
        app_private.current_user_role() = 'grafico'
        and app_private.is_assegnato(p_commessa)
      )
$$;

-- canMarkShipped / canForzaturaSpedito: full access OR quality control
create or replace function app_private.can_mark_shipped()
returns boolean
language sql stable security definer set search_path = public as $$
  select app_private.is_full_access()
      or app_private.current_user_role() = 'controllo_qualita'
$$;

revoke all on function app_private.current_user_role() from public;
revoke all on function app_private.is_full_access() from public;
revoke all on function app_private.is_assegnato(uuid) from public;
revoke all on function app_private.can_edit_workflow(uuid) from public;
revoke all on function app_private.can_mark_shipped() from public;

grant execute on function app_private.current_user_role() to authenticated;
grant execute on function app_private.is_full_access() to authenticated;
grant execute on function app_private.is_assegnato(uuid) to authenticated;
grant execute on function app_private.can_edit_workflow(uuid) to authenticated;
grant execute on function app_private.can_mark_shipped() to authenticated;

-- =============================================================
-- ENABLE RLS ON EVERY TABLE
-- =============================================================
alter table public.utenti               enable row level security;
alter table public.clienti              enable row level security;
alter table public.commesse             enable row level security;
alter table public.commessa_assegnatari enable row level security;
alter table public.eventi               enable row level security;
alter table public.correzioni           enable row level security;
alter table public.email_inviate        enable row level security;
alter table public.email_template       enable row level security;
alter table public.file_commessa        enable row level security;
alter table public.sospensioni          enable row level security;
alter table public.note_forzatura       enable row level security;
alter table public.gruppi_prestampa     enable row level security;
alter table public.utente_gruppi        enable row level security;
alter table public.impostazioni         enable row level security;

-- =============================================================
-- USERS (utenti)
-- SELECT: everyone (names/initials are needed for assignees, timeline…)
-- WRITE:  full access only (canManageUsers)
-- =============================================================
drop policy if exists utenti_select on public.utenti;
create policy utenti_select on public.utenti
  for select to authenticated using (true);

drop policy if exists utenti_write on public.utenti;
create policy utenti_write on public.utenti
  for all to authenticated
  using (app_private.is_full_access())
  with check (app_private.is_full_access());

-- Anti-escalation: nobody can change their OWN role (not even full access).
-- Changing other people's roles stays allowed to full access by the policy above.
create or replace function app_private.prevent_self_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ruolo is distinct from old.ruolo and old.id = auth.uid() then
    raise exception 'You cannot change your own role.';
  end if;
  return new;
end;
$$;
revoke all on function app_private.prevent_self_role_change() from public;
drop trigger if exists trg_prevent_self_role_change on public.utenti;
create trigger trg_prevent_self_role_change
  before update on public.utenti
  for each row execute function app_private.prevent_self_role_change();

-- =============================================================
-- CUSTOMERS (clienti)
-- SELECT: everyone. WRITE: full access (canEditCliente).
-- (creation from the ERP happens SERVER-ONLY with service_role)
-- =============================================================
drop policy if exists clienti_select on public.clienti;
create policy clienti_select on public.clienti
  for select to authenticated using (true);

drop policy if exists clienti_write on public.clienti;
create policy clienti_write on public.clienti
  for all to authenticated
  using (app_private.is_full_access())
  with check (app_private.is_full_access());

-- =============================================================
-- JOBS (commesse)
-- SELECT: everyone.
-- INSERT: SERVER-ONLY (canCreateCommessa = false; jobs come from the ERP).
-- UPDATE: whoever can work on the job OR whoever can mark it shipped.
-- DELETE: never (the annullata_il flag is used, SERVER-ONLY).
-- NB: "QC can only move to shipped" is a column-level rule → not
--     expressible in pure RLS. It must be enforced by a trigger
--     (see docs) or moved to an Edge Function. Here QC can UPDATE.
-- =============================================================
drop policy if exists commesse_select on public.commesse;
create policy commesse_select on public.commesse
  for select to authenticated using (true);

drop policy if exists commesse_update on public.commesse;
create policy commesse_update on public.commesse
  for update to authenticated
  using (app_private.can_edit_workflow(id) or app_private.can_mark_shipped())
  with check (app_private.can_edit_workflow(id) or app_private.can_mark_shipped());

-- =============================================================
-- JOB ASSIGNEES (commessa_assegnatari)
-- SELECT: everyone. WRITE: full access (canAssegnare).
-- =============================================================
drop policy if exists assegnatari_select on public.commessa_assegnatari;
create policy assegnatari_select on public.commessa_assegnatari
  for select to authenticated using (true);

drop policy if exists assegnatari_write on public.commessa_assegnatari;
create policy assegnatari_write on public.commessa_assegnatari
  for all to authenticated
  using (app_private.is_full_access())
  with check (app_private.is_full_access());

-- =============================================================
-- EVENTS (immutable history)
-- SELECT: everyone.
-- INSERT (DECISION B — collaborative notes, to confirm with the customer):
--   * type 'nota_interna' → ANY authenticated user (read-only roles
--     can leave notes too, but ONLY notes);
--   * type 'spedizione' → QC as well, consistent with "Mark shipped";
--   * any other type → whoever can work on the job (full access /
--     assigned designer).
--   In every case user_id = current user (no spoofing).
-- UPDATE/DELETE: never (immutable).
-- NB cleaner target (v2): non-note events should be written by
--    server-side TRIGGERS on the source tables, not by the client.
-- =============================================================
drop policy if exists eventi_select on public.eventi;
create policy eventi_select on public.eventi
  for select to authenticated using (true);

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
-- CORRECTIONS (correzioni)
-- SELECT: everyone. INSERT: can_edit_workflow + author = current user.
-- =============================================================
drop policy if exists correzioni_select on public.correzioni;
create policy correzioni_select on public.correzioni
  for select to authenticated using (true);

drop policy if exists correzioni_insert on public.correzioni;
create policy correzioni_insert on public.correzioni
  for insert to authenticated
  with check (user_id = auth.uid() and app_private.can_edit_workflow(commessa_id));

-- =============================================================
-- SENT EMAILS (email_inviate)
-- SELECT: everyone (permanent archive of metadata/text).
-- INSERT/UPDATE/DELETE: SERVER-ONLY. The actual send and its
--   recording happen in the `send-email` Edge Function with
--   service_role: no client policy → writes are blocked.
-- =============================================================
drop policy if exists email_inviate_select on public.email_inviate;
create policy email_inviate_select on public.email_inviate
  for select to authenticated using (true);

-- =============================================================
-- EMAIL TEMPLATES
-- SELECT: everyone. WRITE: full access (canManageTemplates).
-- =============================================================
drop policy if exists email_template_select on public.email_template;
create policy email_template_select on public.email_template
  for select to authenticated using (true);

drop policy if exists email_template_write on public.email_template;
create policy email_template_write on public.email_template
  for all to authenticated
  using (app_private.is_full_access())
  with check (app_private.is_full_access());

-- =============================================================
-- JOB FILES (file_commessa)
-- SELECT: everyone. INSERT/UPDATE: can_edit_workflow (canUploadFile).
-- Retention (binario_disponibile = false after 30 days) = SERVER-ONLY (cron).
-- =============================================================
drop policy if exists file_commessa_select on public.file_commessa;
create policy file_commessa_select on public.file_commessa
  for select to authenticated using (true);

drop policy if exists file_commessa_insert on public.file_commessa;
create policy file_commessa_insert on public.file_commessa
  for insert to authenticated
  with check (caricato_da_user_id = auth.uid() and app_private.can_edit_workflow(commessa_id));

drop policy if exists file_commessa_update on public.file_commessa;
create policy file_commessa_update on public.file_commessa
  for update to authenticated
  using (app_private.can_edit_workflow(commessa_id))
  with check (app_private.can_edit_workflow(commessa_id));

-- =============================================================
-- HOLDS (sospensioni)
-- SELECT: everyone. INSERT/UPDATE: can_edit_workflow (canSospendere).
-- =============================================================
drop policy if exists sospensioni_select on public.sospensioni;
create policy sospensioni_select on public.sospensioni
  for select to authenticated using (true);

drop policy if exists sospensioni_insert on public.sospensioni;
create policy sospensioni_insert on public.sospensioni
  for insert to authenticated
  with check (aperta_da_user_id = auth.uid() and app_private.can_edit_workflow(commessa_id));

drop policy if exists sospensioni_update on public.sospensioni;
create policy sospensioni_update on public.sospensioni
  for update to authenticated
  using (app_private.can_edit_workflow(commessa_id))
  with check (app_private.can_edit_workflow(commessa_id));

-- =============================================================
-- OVERRIDE NOTES (note_forzatura)
-- SELECT: everyone.
-- INSERT: step override = can_edit_workflow;
--         override to "shipped" = can_mark_shipped (QC included).
--         → mirrors canForzaturaStep / canForzaturaSpedito.
-- =============================================================
drop policy if exists note_forzatura_select on public.note_forzatura;
create policy note_forzatura_select on public.note_forzatura
  for select to authenticated using (true);

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

-- =============================================================
-- PREPRESS TEAMS / USER TEAMS (gruppi_prestampa / utente_gruppi)
-- SELECT: everyone. WRITE: full access (canManageGruppi).
-- =============================================================
drop policy if exists gruppi_select on public.gruppi_prestampa;
create policy gruppi_select on public.gruppi_prestampa
  for select to authenticated using (true);

drop policy if exists gruppi_write on public.gruppi_prestampa;
create policy gruppi_write on public.gruppi_prestampa
  for all to authenticated
  using (app_private.is_full_access())
  with check (app_private.is_full_access());

drop policy if exists utente_gruppi_select on public.utente_gruppi;
create policy utente_gruppi_select on public.utente_gruppi
  for select to authenticated using (true);

drop policy if exists utente_gruppi_write on public.utente_gruppi;
create policy utente_gruppi_write on public.utente_gruppi
  for all to authenticated
  using (app_private.is_full_access())
  with check (app_private.is_full_access());

-- =============================================================
-- SETTINGS (impostazioni)
-- SELECT: everyone. WRITE: full access (canManageMailboxes/config).
-- =============================================================
drop policy if exists impostazioni_select on public.impostazioni;
create policy impostazioni_select on public.impostazioni
  for select to authenticated using (true);

drop policy if exists impostazioni_write on public.impostazioni;
create policy impostazioni_write on public.impostazioni
  for all to authenticated
  using (app_private.is_full_access())
  with check (app_private.is_full_access());

-- Idempotent cleanup in case an earlier draft created helpers in public.
drop function if exists public.current_user_role();
drop function if exists public.is_full_access();
drop function if exists public.is_assegnato(uuid);
drop function if exists public.can_edit_workflow(uuid);
drop function if exists public.can_mark_shipped();
drop function if exists public.prevent_self_role_change();

-- =============================================================
-- END
-- =============================================================
