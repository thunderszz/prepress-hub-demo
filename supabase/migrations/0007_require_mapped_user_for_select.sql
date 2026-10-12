-- =============================================================
-- 0007_require_mapped_user_for_select.sql
-- Require an active app user mapping for every authenticated SELECT.
-- =============================================================

drop policy if exists utenti_select on public.utenti;
create policy utenti_select on public.utenti
  for select to authenticated
  using (app_private.current_app_user_id() is not null);

drop policy if exists clienti_select on public.clienti;
create policy clienti_select on public.clienti
  for select to authenticated
  using (app_private.current_app_user_id() is not null);

drop policy if exists commesse_select on public.commesse;
create policy commesse_select on public.commesse
  for select to authenticated
  using (app_private.current_app_user_id() is not null);

drop policy if exists assegnatari_select on public.commessa_assegnatari;
create policy assegnatari_select on public.commessa_assegnatari
  for select to authenticated
  using (app_private.current_app_user_id() is not null);

drop policy if exists eventi_select on public.eventi;
create policy eventi_select on public.eventi
  for select to authenticated
  using (app_private.current_app_user_id() is not null);

drop policy if exists correzioni_select on public.correzioni;
create policy correzioni_select on public.correzioni
  for select to authenticated
  using (app_private.current_app_user_id() is not null);

drop policy if exists email_inviate_select on public.email_inviate;
create policy email_inviate_select on public.email_inviate
  for select to authenticated
  using (app_private.current_app_user_id() is not null);

drop policy if exists email_template_select on public.email_template;
create policy email_template_select on public.email_template
  for select to authenticated
  using (app_private.current_app_user_id() is not null);

drop policy if exists file_commessa_select on public.file_commessa;
create policy file_commessa_select on public.file_commessa
  for select to authenticated
  using (app_private.current_app_user_id() is not null);

drop policy if exists sospensioni_select on public.sospensioni;
create policy sospensioni_select on public.sospensioni
  for select to authenticated
  using (app_private.current_app_user_id() is not null);

drop policy if exists note_forzatura_select on public.note_forzatura;
create policy note_forzatura_select on public.note_forzatura
  for select to authenticated
  using (app_private.current_app_user_id() is not null);

drop policy if exists gruppi_select on public.gruppi_prestampa;
create policy gruppi_select on public.gruppi_prestampa
  for select to authenticated
  using (app_private.current_app_user_id() is not null);

drop policy if exists utente_gruppi_select on public.utente_gruppi;
create policy utente_gruppi_select on public.utente_gruppi
  for select to authenticated
  using (app_private.current_app_user_id() is not null);

drop policy if exists impostazioni_select on public.impostazioni;
create policy impostazioni_select on public.impostazioni
  for select to authenticated
  using (app_private.current_app_user_id() is not null);

-- =============================================================
-- END
-- =============================================================
