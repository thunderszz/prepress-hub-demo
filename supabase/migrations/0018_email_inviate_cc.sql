-- =============================================================
-- 0018_email_inviate_cc.sql
--
-- Carbon copy on sent emails (customer request, 23/09/2026).
-- Customer emails arrive with different people in CC for each job;
-- the portal does not read incoming mail, so the sender
-- pastes the CC list into the wizard on every send. The send-email
-- Edge Function passes them to the email provider and archives them
-- here with the rest of the message (the archive keeps every recipient).
--
-- Additive only: a column with a constant default, no table rewrite;
-- already archived rows get '{}'. Reading is covered by the existing
-- table SELECT grant and email_inviate_select policy; writing stays
-- server-side only (no INSERT policy, by design).
--
-- RELEASE ORDER: this migration BEFORE the new send-email (which
-- writes the column), and send-email BEFORE the frontend (which sends
-- CC: an old send-email would silently ignore it).
-- =============================================================

alter table public.email_inviate
  add column if not exists cc text[] not null default '{}'::text[];

comment on column public.email_inviate.cc is
  'Carbon-copy addresses, de-duplicated and without the recipients (written by the send-email Edge Function).';
