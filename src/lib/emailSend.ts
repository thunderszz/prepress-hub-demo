// =============================================================
// Real email sending (§11) — bridge to the send-email Edge Function.
//
// The actual send (email provider) and the permanent archive in
// email_inviate (MAIL-06) happen ONLY server-side: the table has no
// INSERT policy and the provider API key lives in the function's
// secrets. Here we invoke the function and normalise the outcome.
// (In this demo the function is simulated by the mock client.)
// =============================================================

import { supabase } from "./supabase";
import { mapEmail } from "./supabaseData";
import type { EmailInviata, EmailTemplateKind } from "./types";
import type { Database } from "./database.types";

type EmailRow = Database["public"]["Tables"]["email_inviate"]["Row"];

export interface SendEmailRequest {
  commessaId: string;
  kind: EmailTemplateKind;
  mittente: string;
  destinatari: string[];
  /** Carbon copy (optional). */
  cc?: string[];
  oggetto: string;
  corpo: string;
  /** Id of the job PDF to attach (downloaded server-side). */
  allegatoFileId?: string;
  allegatoNome?: string;
}

// Flat interface (not a discriminated union): with strict=false narrowing
// on `sent` doesn't work and would force casts at call sites.
export interface SendEmailOutcome {
  /** true = sent and archived. */
  sent: boolean;
  /** Failure reason when sent=false. */
  reason?: string;
  /** Archived row (even with status 'errore', MAIL-07); missing if rejected earlier. */
  email?: EmailInviata;
}

export async function sendEmailViaFunction(req: SendEmailRequest): Promise<SendEmailOutcome> {
  const { data, error } = await supabase.functions.invoke("send-email", { body: req });

  if (error) {
    // Non-2xx response (auth/validation/archiving failed): the details
    // are in the JSON body of the response, if readable.
    let reason = error.message || "Could not reach the email server.";
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const body = (await ctx.json()) as { error?: string };
        if (body?.error) reason = body.error;
      } catch {
        // non-JSON body: keep the generic message
      }
    }
    return { sent: false, reason };
  }

  const payload = data as { ok?: boolean; reason?: string | null; email?: EmailRow } | null;
  if (!payload?.email) {
    return { sent: false, reason: "Unexpected response from the email server." };
  }
  const email = mapEmail(payload.email);
  if (email.stato === "errore") {
    return { sent: false, reason: payload.reason ?? "Rejected by the email provider.", email };
  }
  return { sent: true, email };
}
