-- Data API hardening: the frontend must never read or write public
-- tables with the anon role. The app uses anon only for Supabase Auth;
-- after login queries switch to the authenticated role and stay under RLS.

revoke all privileges on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;

-- Explicit grants for the authenticated role: they expose to the
-- Data API only what the frontend needs to touch; RLS policies keep
-- deciding which rows can be read or changed.
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
