-- Restricts the authenticated role's grants to the privileges the
-- frontend actually uses. RLS stays the row-level barrier, but SQL
-- privileges must not include unexpected operations like TRUNCATE/REFERENCES/TRIGGER.

revoke all privileges on all tables in schema public from authenticated;
alter default privileges in schema public revoke all on tables from authenticated;
alter default privileges for role postgres in schema public revoke all on tables from authenticated;

grant select, update on table public.clienti to authenticated;
grant select on table public.gruppi_prestampa to authenticated;
grant select, insert, delete on table public.utente_gruppi to authenticated;
grant select, insert, update on table public.utenti to authenticated;
grant select, update on table public.email_template to authenticated;
grant select, update on table public.impostazioni to authenticated;

grant select, update on table public.commesse to authenticated;
grant select, insert, delete on table public.commessa_assegnatari to authenticated;
grant select, insert on table public.eventi to authenticated;
grant select, insert, update on table public.file_commessa to authenticated;
grant select, insert on table public.correzioni to authenticated;
grant select, insert on table public.note_forzatura to authenticated;
grant select, insert, update on table public.sospensioni to authenticated;
grant select on table public.email_inviate to authenticated;

notify pgrst, 'reload schema';
