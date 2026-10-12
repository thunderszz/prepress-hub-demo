// =============================================================
// Edge Function retention-purge — physical deletion of expired binaries
//
// Retention (migration 0010, pg_cron job 02:30 UTC) flags expired
// binaries (binario_disponibile / allegato_disponibile = false) but
// cannot delete the objects: Supabase blocks direct DELETE on
// storage.objects. This function, called by the pg_cron job
// "file-purge-daily" (03:00 UTC, migration 0013), finishes the job
// through the Storage API and clears the paths on the cleaned rows.
//
// It is idempotent and "mark-driven": it can delete ONLY objects
// already flagged unavailable by retention, never live data. A path
// is deleted only if NO reference (file or email attachment) still
// considers it available.
// =============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const FILES_BUCKET = "commessa-files";
// Per-run limit: the job is daily, any backlog spreads over the following days.
const BATCH = 200;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed." }), { status: 405 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const purgeSecret = req.headers.get("x-retention-purge-secret") ?? "";
  if (!purgeSecret) {
    return new Response(JSON.stringify({ error: "Unauthorised." }), { status: 401 });
  }

  const { data: secretOk, error: secretError } = await admin.rpc(
    "verify_retention_purge_secret",
    { p_secret: purgeSecret },
  );
  if (secretError) {
    return new Response(JSON.stringify({ error: `Secret check failed: ${secretError.message}` }), {
      status: 500,
    });
  }
  if (!secretOk) {
    return new Response(JSON.stringify({ error: "Unauthorised." }), { status: 401 });
  }

  // Candidates: binaries flagged as expired that still have a path.
  const { data: files, error: filesError } = await admin
    .from("file_commessa")
    .select("id, storage_path")
    .eq("binario_disponibile", false)
    .not("storage_path", "is", null)
    .limit(BATCH);
  if (filesError) {
    return new Response(JSON.stringify({ error: filesError.message }), { status: 500 });
  }

  const { data: emails, error: emailsError } = await admin
    .from("email_inviate")
    .select("id, allegato_path")
    .eq("allegato_disponibile", false)
    .not("allegato_path", "is", null)
    .limit(BATCH);
  if (emailsError) {
    return new Response(JSON.stringify({ error: emailsError.message }), { status: 500 });
  }

  const candidatePaths = [
    ...new Set([
      ...(files ?? []).map((f) => f.storage_path as string),
      ...(emails ?? []).map((e) => e.allegato_path as string),
    ]),
  ];

  if (candidatePaths.length === 0) {
    return new Response(JSON.stringify({ deleted: 0, files: 0, emails: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Guard: do not delete objects still referenced as AVAILABLE
  // elsewhere (files and emails of the same job share the path;
  // retention periods can diverge if the parameters change).
  const { data: liveFiles } = await admin
    .from("file_commessa")
    .select("storage_path")
    .eq("binario_disponibile", true)
    .in("storage_path", candidatePaths);
  const { data: liveEmails } = await admin
    .from("email_inviate")
    .select("allegato_path")
    .eq("allegato_disponibile", true)
    .in("allegato_path", candidatePaths);
  const livePaths = new Set([
    ...(liveFiles ?? []).map((f) => f.storage_path as string),
    ...(liveEmails ?? []).map((e) => e.allegato_path as string),
  ]);

  const deletable = candidatePaths.filter((p) => !livePaths.has(p));
  if (deletable.length === 0) {
    return new Response(JSON.stringify({ deleted: 0, files: 0, emails: 0, skippedLive: livePaths.size }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // remove() does not fail on paths already gone: safe to re-run.
  const { error: removeError } = await admin.storage.from(FILES_BUCKET).remove(deletable);
  if (removeError) {
    return new Response(JSON.stringify({ error: `Storage remove: ${removeError.message}` }), { status: 500 });
  }

  // Clear paths ONLY on rows whose object was deleted:
  // rows skipped by the guard stay queued for future runs.
  const fileIds = (files ?? [])
    .filter((f) => deletable.includes(f.storage_path as string))
    .map((f) => f.id);
  const emailIds = (emails ?? [])
    .filter((e) => deletable.includes(e.allegato_path as string))
    .map((e) => e.id);

  if (fileIds.length > 0) {
    const { error } = await admin
      .from("file_commessa").update({ storage_path: null }).in("id", fileIds);
    if (error) {
      return new Response(JSON.stringify({ error: `Update file_commessa: ${error.message}` }), { status: 500 });
    }
  }
  if (emailIds.length > 0) {
    const { error } = await admin
      .from("email_inviate").update({ allegato_path: null }).in("id", emailIds);
    if (error) {
      return new Response(JSON.stringify({ error: `Update email_inviate: ${error.message}` }), { status: 500 });
    }
  }

  console.log(`retention-purge: eliminati ${deletable.length} oggetti (file: ${fileIds.length}, email: ${emailIds.length})`);
  return new Response(
    JSON.stringify({ deleted: deletable.length, files: fileIds.length, emails: emailIds.length }),
    { headers: { "Content-Type": "application/json" } },
  );
});
