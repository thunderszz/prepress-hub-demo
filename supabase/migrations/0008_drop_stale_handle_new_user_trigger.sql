-- =============================================================
-- 0008_drop_stale_handle_new_user_trigger.sql
-- Remove the obsolete on-signup trigger left from the original schema.
--
-- The original schema linked public.utenti.id -> auth.users(id) and used an
-- AFTER INSERT trigger on auth.users (handle_new_user) to auto-create a
-- public.utenti row for every new Auth account.
--
-- Migration 0006 changed the model: app users are seeded/managed in
-- public.utenti and matched to Auth accounts BY EMAIL (utenti_email_key).
-- With that model, the old trigger is harmful: when a known employee email
-- is invited/created in Auth, the trigger tries to INSERT a second
-- public.utenti row with the same email and fails on utenti_email_key,
-- which would break every real invite/login for the 14 seeded users.
--
-- Auth <-> app user mapping is now done at read time via
-- app_private.current_app_user_id() (see 0006/0007), so no trigger is needed.
-- =============================================================

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- =============================================================
-- END
-- =============================================================
