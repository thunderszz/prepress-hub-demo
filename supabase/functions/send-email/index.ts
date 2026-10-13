// =============================================================
// Edge Function send-email: sends customer emails through SendGrid.
//
// - Used at the three steps that need the customer: PDF, colour proof, press proof.
// - The sender is the prepress team's mailbox, which is also the reply-to.
// - The user confirms explicitly in the frontend wizard before this runs.
// - Every email is archived in email_inviate, from here only: the table
//   has no INSERT policy by design.
// - A failed send is archived too, with status 'errore', so the wizard can retry.
// - CC is optional, pasted for each send, and archived in email_inviate.cc.
//
// Security: JWT verified by the platform (verify_jwt), app permission
// through the can_edit_commessa RPC run in the caller's context;
// SENDGRID_API_KEY lives only in the function's secrets.
// =============================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const KINDS = ["pdf", "prova_colore", "caduta"] as const;
type Kind = (typeof KINDS)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FILES_BUCKET = "commessa-files";
// SendGrid accepts messages up to 30MB in total: keep a margin.
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
// CC cap: generous for real use, but prevents mass mailing from team mailboxes.
const MAX_CC = 50;
// Attachable types are the same the portal accepts on upload:
// the PDF, but also the JPEG/PNG photo of the colour proof.
const ATTACHMENT_MIME: Record<string, string> = {
  PDF: "application/pdf",
  JPEG: "image/jpeg",
  PNG: "image/png",
};

interface SendEmailRequest {
  commessaId: string;
  kind: Kind;
  mittente: string;
  destinatari: string[];
  cc?: string[];
  oggetto: string;
  corpo: string;
  allegatoFileId?: string;
  allegatoNome?: string;
}

/** Indirizzi ripuliti e senza doppioni (maiuscole ignorate), nell'ordine dato. */
function uniqueEmails(list: string[], exclude: Set<string> = new Set()): string[] {
  const seen = new Set(exclude);
  const out: string[] = [];
  for (const raw of list) {
    const email = raw.trim();
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });

  let p: SendEmailRequest;
  try {
    p = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  // --- Input validation ---
  if (!p.commessaId || typeof p.commessaId !== "string") {
    return json(400, { error: "commessaId mancante." });
  }
  if (!KINDS.includes(p.kind)) return json(400, { error: "Invalid email type." });
  if (!Array.isArray(p.destinatari) || p.destinatari.length === 0 ||
    p.destinatari.some((d) => typeof d !== "string" || !EMAIL_RE.test(d.trim()))) {
    return json(400, { error: "Invalid recipients." });
  }
  if (p.cc !== undefined && (!Array.isArray(p.cc) ||
    p.cc.some((d) => typeof d !== "string" || !EMAIL_RE.test(d.trim())))) {
    return json(400, { error: "Invalid CC addresses." });
  }
  if ((p.cc?.length ?? 0) > MAX_CC) {
    return json(400, { error: `Too many CC addresses (max ${MAX_CC}).` });
  }
  if (!p.oggetto?.trim()) return json(400, { error: "Subject is required." });
  if (!p.corpo?.trim()) return json(400, { error: "Email body is required." });
  if (!p.mittente?.trim() || !EMAIL_RE.test(p.mittente.trim())) {
    return json(400, { error: "Invalid sender." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sendgridKey = Deno.env.get("SENDGRID_API_KEY");

  // --- Authentication + permission (caller's context) ---
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user?.email) return json(401, { error: "Not authenticated." });

  const { data: canEdit, error: rpcError } = await userClient.rpc("can_edit_commessa", {
    p_commessa_id: p.commessaId,
  });
  if (rpcError) return json(500, { error: `Permission check failed: ${rpcError.message}` });
  if (!canEdit) return json(403, { error: "Permission denied for this job." });

  const admin = createClient(supabaseUrl, serviceKey);

  // --- Sender: must be a registered team mailbox ---
  const mittente = p.mittente.trim();
  const { data: gruppo } = await admin
    .from("gruppi_prestampa").select("id").eq("mailbox", mittente).maybeSingle();
  if (!gruppo) return json(400, { error: "The sender must be a prepress team mailbox." });

  // --- App user (for inviata_da_user_id) ---
  const { data: appUser } = await admin
    .from("utenti").select("id")
    .ilike("email", authData.user.email).eq("attivo", true).maybeSingle();
  if (!appUser) return json(403, { error: "App user not found or inactive." });

  // --- Attachment (optional): downloaded from storage server-side ---
  let attachment: { content: string; filename: string; type: string } | null = null;
  let allegatoNome: string | null = p.allegatoNome?.trim() || null;
  let allegatoPath: string | null = null;
  if (p.allegatoFileId) {
    const { data: fileRow } = await admin
      .from("file_commessa")
      .select("nome, tipo, storage_path, binario_disponibile, dimensione_bytes")
      .eq("id", p.allegatoFileId).eq("commessa_id", p.commessaId).maybeSingle();
    if (!fileRow) return json(400, { error: "Attachment not found for this job." });
    const mime = ATTACHMENT_MIME[fileRow.tipo];
    if (!mime) return json(400, { error: "L'allegato deve essere un PDF, JPEG o PNG." });
    if (!fileRow.binario_disponibile || !fileRow.storage_path) {
      return json(400, { error: "The attached file is no longer available (retention)." });
    }
    if (Number(fileRow.dimensione_bytes) > MAX_ATTACHMENT_BYTES) {
      return json(400, { error: "Attachment too large to email (max 20MB)." });
    }
    const { data: blob, error: dlError } = await admin.storage
      .from(FILES_BUCKET).download(fileRow.storage_path);
    if (dlError || !blob) {
      return json(500, { error: `Attachment download failed: ${dlError?.message ?? "unknown"}` });
    }
    attachment = {
      content: encodeBase64(new Uint8Array(await blob.arrayBuffer())),
      filename: fileRow.nome,
      type: mime,
    };
    allegatoNome = fileRow.nome;
    allegatoPath = fileRow.storage_path;
  }

  // --- SendGrid send ---
  // SendGrid rejects the same address repeated in To and CC.
  const destinatari = uniqueEmails(p.destinatari);
  const cc = uniqueEmails(p.cc ?? [], new Set(destinatari.map((d) => d.toLowerCase())));
  let sendOk = false;
  let sendDetail: string | null = null;
  if (!sendgridKey) {
    sendDetail = "SENDGRID_API_KEY not configured.";
  } else {
    try {
      const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sendgridKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{
            to: destinatari.map((email) => ({ email })),
            ...(cc.length > 0 ? { cc: cc.map((email) => ({ email })) } : {}),
          }],
          from: { email: mittente },
          reply_to: { email: mittente },
          subject: p.oggetto.trim(),
          content: [{ type: "text/plain", value: p.corpo }],
          ...(attachment
            ? {
              attachments: [{
                content: attachment.content,
                filename: attachment.filename,
                type: attachment.type,
                disposition: "attachment",
              }],
            }
            : {}),
        }),
      });
      sendOk = sgRes.status === 202;
      if (!sendOk) {
        const text = await sgRes.text();
        sendDetail = `SendGrid ${sgRes.status}: ${text.slice(0, 500)}`;
      }
    } catch (e) {
      sendDetail = `Network error reaching SendGrid: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  // --- Permanent archive, failed sends included ---
  const stato = sendOk ? "inviata" : "errore";
  const { data: emailRow, error: insError } = await admin
    .from("email_inviate")
    .insert({
      commessa_id: p.commessaId,
      template_kind: p.kind,
      mittente,
      destinatari,
      cc,
      oggetto: p.oggetto.trim(),
      corpo: p.corpo,
      allegato_nome: allegatoNome,
      allegato_path: allegatoPath,
      inviata_da_user_id: appUser.id,
      stato,
    })
    .select()
    .single();
  if (insError) {
    console.error("Email archiving failed:", insError.message, "send status:", stato, sendDetail);
    return json(500, {
      error: `Email archiving failed: ${insError.message}`,
      stato,
      reason: sendDetail,
    });
  }
  if (!sendOk) console.error("Invio SendGrid fallito:", sendDetail);

  return json(200, { ok: sendOk, stato, reason: sendDetail, email: emailRow });
});
