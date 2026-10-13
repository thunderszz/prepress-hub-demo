// =============================================================
// Workflow actions — high-level orchestration (PHASE 2)
//
// Every action:
//  1. validates (status + basic permissions)
//  2. updates the stores involved
//  3. records an immutable event in `eventi`
//
// Stores are accessed through getState() so actions can be called
// outside React too (handy for tests/dev).
// =============================================================

import {
  EmailInviata,
  EmailStato,
  EmailTemplateKind,
  EMAIL_TEMPLATE_LABELS,
  EsitoCaduta,
  EsitoProvaColore,
  EventoTipo,
  ESITO_CADUTA_LABELS,
  ESITO_PROVA_COLORE_LABELS,
  MOTIVO_SOSPENSIONE_LABELS,
  MotivoSospensione,
  StatoCommessa,
  STATO_LABELS,
} from "./types";
import {
  useCommesseStore,
  useEmailStore,
  useEventiStore,
  useFileStore,
  useGruppiStore,
  useSospensioniStore,
  useUsersStore,
  useUtenteGruppiStore,
  useAssegnatariStore,
  performTransition,
} from "./store";
import { canEditWorkflow, canMarkShipped, Session } from "./permissions";
import { emailViaSupabase, sendEmailViaFunction } from "./emailSend";
import { flushPendingWrites } from "./supabaseWrites";

export type ActionResult =
  | { ok: true }
  | { ok: false; reason: string; needsForzatura?: boolean };

// -------------------------------------------------------------
// Action-side permission guards (defence in depth; in production the
// source of truth is the RLS policies — see permissions.ts).
// Resolves the user's role from the store so call sites don't have to
// pass the Session around.
// -------------------------------------------------------------
function sessionFor(userId: string): Session | null {
  const u = useUsersStore.getState().users.find((x) => x.id === userId);
  return u ? { userId: u.id, role: u.ruolo } : null;
}

/**
 * Guard "can this user work on the job?" (full access or assigned designer).
 * Returns an error ActionResult if NOT allowed, otherwise null (go ahead).
 * Usage: `const denied = guardCanEdit(...); if (denied) return denied;`
 */
function guardCanEdit(
  userId: string,
  commessaId: string,
  reason = "Permission denied on this job.",
): ActionResult | null {
  const s = sessionFor(userId);
  const ass = useAssegnatariStore.getState().assegnatari;
  if (!s || !canEditWorkflow(s, { id: commessaId }, ass)) return { ok: false, reason };
  return null;
}

function guardCanAdvance(
  userId: string,
  commessaId: string,
  to: StatoCommessa,
): ActionResult | null {
  const s = sessionFor(userId);
  if (!s) return { ok: false, reason: "Permission denied on this job." };
  if (to === "spedito") {
    if (!canMarkShipped(s)) {
      return {
        ok: false,
        reason: "Only Quality Control or full-access roles can mark a job as Shipped.",
      };
    }
    return null;
  }
  return guardCanEdit(userId, commessaId);
}

// -------------------------------------------------------------
// Transition labels (drive the UI buttons)
// -------------------------------------------------------------
export interface TransitionOption {
  to: StatoCommessa;
  label: string;
  eventoTipo: EventoTipo;
  eventoTitolo: string;
  /** Set when an outcome must be recorded before this can run. */
  blockedReason?: string;
}

/** Returns the "natural" transitions from the current status, labelled for buttons. */
export function transitionsFor(commessaId: string): TransitionOption[] {
  const c = useCommesseStore.getState().commesse.find((x) => x.id === commessaId);
  if (!c) return [];

  switch (c.stato) {
    case "disponibile":
      return [];
    case "assegnata":
      return [
        {
          to: "in_lavorazione",
          label: "Take ownership",
          eventoTipo: "presa_in_carico",
          eventoTitolo: "Claimed",
        },
      ];
    case "in_lavorazione":
      return [
        {
          to: "in_attesa_approvazione_pdf",
          label: "Send PDF to customer",
          eventoTipo: "invio_pdf",
          eventoTitolo: "PDF sent to customer",
        },
      ];
    case "in_attesa_approvazione_pdf":
      return [
        {
          to: "in_attesa_prova_colore",
          label: "PDF approved",
          eventoTipo: "esito_pdf",
          eventoTitolo: "PDF approved by the customer",
        },
        {
          to: "in_lavorazione",
          label: "PDF needs changes",
          eventoTipo: "esito_pdf",
          eventoTitolo: "PDF needs changes",
        },
      ];
    case "in_attesa_prova_colore":
      return [
        {
          to: "in_attesa_approvazione_caduta",
          label: "Send press proof",
          eventoTipo: "invio_caduta",
          eventoTitolo: "Press proof sent",
          blockedReason:
            c.esitoProvaColore === "non_serve" || c.esitoProvaColore === "spedita_approvata"
              ? undefined
              : c.esitoProvaColore === "da_rifare"
              ? "The colour proof is 'To be redone': move the job back to artwork."
              : "Record the colour proof outcome first ('Not required' or 'Sent and approved').",
        },
        {
          to: "in_lavorazione",
          label: "Back to artwork",
          eventoTipo: "esito_pdf",
          eventoTitolo: "Back to artwork",
        },
      ];
    case "in_attesa_approvazione_caduta":
      return [
        {
          to: "in_produzione_matrice",
          label: "Press proof approved → plates",
          eventoTipo: "esito_caduta",
          eventoTitolo: "Press proof approved, plate production started",
          blockedReason:
            c.esitoCaduta === "approvata"
              ? undefined
              : "Record the 'Approved' press proof outcome first.",
        },
        {
          to: "in_lavorazione",
          label: "Press proof to redo",
          eventoTipo: "esito_caduta",
          eventoTitolo: "Press proof to be redone",
        },
      ];
    case "in_produzione_matrice":
      return [
        {
          to: "spedito",
          label: "Mark as shipped",
          eventoTipo: "spedizione",
          eventoTitolo: "Job shipped",
        },
      ];
    case "spedito":
      return [];
  }
}

// -------------------------------------------------------------
// Action: take ownership
// -------------------------------------------------------------
export function prendiInCarico(commessaId: string, userId: string): ActionResult {
  const cStore = useCommesseStore.getState();
  const c = cStore.commesse.find((x) => x.id === commessaId);
  if (!c) return { ok: false, reason: "Job not found." };
  if (c.presaInCaricoDaUserId)
    return { ok: false, reason: "Job already claimed." };

  const now = new Date().toISOString();
  cStore.setPatch(commessaId, {
    presaInCaricoDaUserId: userId,
    presaInCaricoIl: now,
  });

  return performTransition({
    commessaId,
    to: "in_lavorazione",
    userId,
    eventoTipo: "presa_in_carico",
    eventoTitolo: "Claimed",
  });
}

// -------------------------------------------------------------
// Action: assignment (WF-03/04) — full access only
// -------------------------------------------------------------
export function assegnaCommessa(
  commessaId: string,
  userId: string,
  userIds: string[],
  terminePrimoPdfIso?: string,
): ActionResult {
  const cStore = useCommesseStore.getState();
  const c = cStore.commesse.find((x) => x.id === commessaId);
  if (!c) return { ok: false, reason: "Job not found." };
  if (c.stato !== "disponibile")
    return { ok: false, reason: "The job is not in 'Available' status." };
  if (userIds.length === 0)
    return { ok: false, reason: "Select at least one designer." };

  useAssegnatariStore.getState().setAssegnatari(commessaId, userIds, userId);
  if (terminePrimoPdfIso) {
    cStore.setPatch(commessaId, { terminePrimoPdf: terminePrimoPdfIso });
  }
  return performTransition({
    commessaId,
    to: "assegnata",
    userId,
    eventoTipo: "assegnazione",
    eventoTitolo: "Assigned to designers",
    eventoDettaglio: `${userIds.length} designer${userIds.length === 1 ? "" : "s"}`,
  });
}

// WF-07: change assignment while "assegnata" / "in_lavorazione" — no status change.
export function modificaAssegnazione(
  commessaId: string,
  userId: string,
  userIds: string[],
): ActionResult {
  const c = useCommesseStore.getState().commesse.find((x) => x.id === commessaId);
  if (!c) return { ok: false, reason: "Job not found." };
  if (c.stato !== "assegnata" && c.stato !== "in_lavorazione")
    return { ok: false, reason: "Can only be changed while 'Assigned' or 'In progress'." };
  if (userIds.length === 0)
    return { ok: false, reason: "Select at least one designer." };

  useAssegnatariStore.getState().setAssegnatari(commessaId, userIds, userId);
  useEventiStore.getState().appendEvento({
    commessaId,
    userId,
    tipo: "modifica_assegnazione",
    titolo: "Assignment updated",
    dettaglio: `${userIds.length} designer${userIds.length === 1 ? "" : "s"}`,
  });
  return { ok: true };
}

// -------------------------------------------------------------
// Action: advance status (optionally with an override)
// -------------------------------------------------------------
export function advanceTo(
  commessaId: string,
  userId: string,
  to: StatoCommessa,
  opts?: { forzaturaNota?: string },
): ActionResult {
  const c = useCommesseStore.getState().commesse.find((x) => x.id === commessaId);
  if (!c) return { ok: false, reason: "Job not found." };
  const denied = guardCanAdvance(userId, commessaId, to);
  if (denied) return denied;

  const natural = transitionsFor(commessaId).find((t) => t.to === to);
  return performTransition({
    commessaId,
    to,
    userId,
    forzaturaNota: opts?.forzaturaNota,
    eventoTipo: natural?.eventoTipo ?? "forzatura",
    eventoTitolo:
      natural?.eventoTitolo ?? `Status → ${STATO_LABELS[to]} (override)`,
  });
}

// -------------------------------------------------------------
// Action: put on hold / resume
// -------------------------------------------------------------
export function sospendiCommessa(
  commessaId: string,
  userId: string,
  motivo: MotivoSospensione,
  nota?: string,
): ActionResult {
  const cStore = useCommesseStore.getState();
  const c = cStore.commesse.find((x) => x.id === commessaId);
  if (!c) return { ok: false, reason: "Job not found." };
  const denied = guardCanEdit(userId, commessaId);
  if (denied) return denied;
  if (c.sospensioneAttivaId)
    return { ok: false, reason: "Job already on hold." };

  const sosp = useSospensioniStore.getState().apriSospensione({
    commessaId,
    motivo,
    nota,
    apertaDaUserId: userId,
  });
  cStore.setPatch(commessaId, { sospensioneAttivaId: sosp.id });
  useEventiStore.getState().appendEvento({
    commessaId,
    userId,
    tipo: "sospensione",
    titolo: `On hold — ${MOTIVO_SOSPENSIONE_LABELS[motivo]}`,
    dettaglio: nota,
    refType: "sospensione",
    refId: sosp.id,
  });
  return { ok: true };
}

export function riattivaCommessa(commessaId: string, userId: string): ActionResult {
  const cStore = useCommesseStore.getState();
  const c = cStore.commesse.find((x) => x.id === commessaId);
  if (!c) return { ok: false, reason: "Job not found." };
  const denied = guardCanEdit(userId, commessaId);
  if (denied) return denied;
  if (!c.sospensioneAttivaId)
    return { ok: false, reason: "Job is not on hold." };

  useSospensioniStore.getState().chiudiSospensione(c.sospensioneAttivaId, userId);
  cStore.setPatch(commessaId, { sospensioneAttivaId: undefined });
  useEventiStore.getState().appendEvento({
    commessaId,
    userId,
    tipo: "riattivazione",
    titolo: "Resumed",
  });
  return { ok: true };
}

// -------------------------------------------------------------
// Action: record outcomes (does not advance the status — buttons do)
// -------------------------------------------------------------
export function setEsitoProvaColore(
  commessaId: string,
  userId: string,
  esito: EsitoProvaColore,
): ActionResult {
  const denied = guardCanEdit(userId, commessaId);
  if (denied) return denied;
  useCommesseStore.getState().setPatch(commessaId, { esitoProvaColore: esito });
  useEventiStore.getState().appendEvento({
    commessaId,
    userId,
    tipo: "esito_prova_colore",
    titolo: `Colour proof: ${ESITO_PROVA_COLORE_LABELS[esito]}`,
  });
  return { ok: true };
}

export function setEsitoCaduta(
  commessaId: string,
  userId: string,
  esito: EsitoCaduta,
): ActionResult {
  const denied = guardCanEdit(userId, commessaId);
  if (denied) return denied;
  useCommesseStore.getState().setPatch(commessaId, { esitoCaduta: esito });
  useEventiStore.getState().appendEvento({
    commessaId,
    userId,
    tipo: "esito_caduta",
    titolo: `Press proof: ${ESITO_CADUTA_LABELS[esito]}`,
  });
  return { ok: true };
}

// -------------------------------------------------------------
// Action: internal note
// -------------------------------------------------------------
export function aggiungiNotaInterna(
  commessaId: string,
  userId: string,
  testo: string,
): ActionResult {
  const denied = guardCanEdit(userId, commessaId);
  if (denied) return denied;
  if (!testo.trim()) return { ok: false, reason: "Empty note." };
  useEventiStore.getState().appendEvento({
    commessaId,
    userId,
    tipo: "nota_interna",
    titolo: "Internal note",
    dettaglio: testo.trim(),
  });
  return { ok: true };
}

export function aggiungiNotaSottopassaggio(
  commessaId: string,
  userId: string,
  testo: string,
): ActionResult {
  const denied = guardCanEdit(userId, commessaId);
  if (denied) return denied;
  if (!testo.trim()) return { ok: false, reason: "Empty note." };
  useEventiStore.getState().appendEvento({
    commessaId,
    userId,
    tipo: "nota_sottopassaggio",
    titolo: "Handover note",
    dettaglio: testo.trim(),
  });
  return { ok: true };
}

// -------------------------------------------------------------
// Action: log correction time (option B §10)
// -------------------------------------------------------------
import { useCorrezioniStore } from "./store";
export function registraCorrezione(
  commessaId: string,
  userId: string,
  minuti: number,
  nota?: string,
): ActionResult {
  const denied = guardCanEdit(userId, commessaId);
  if (denied) return denied;
  if (!Number.isFinite(minuti) || minuti <= 0)
    return { ok: false, reason: "Invalid minutes." };
  const cr = useCorrezioniStore.getState().addCorrezione({
    commessaId,
    userId,
    minuti: Math.round(minuti),
    nota: nota?.trim() || undefined,
  });
  useEventiStore.getState().appendEvento({
    commessaId,
    userId,
    tipo: "correzione_registrata",
    titolo: `Correction logged: ${cr.minuti} min`,
    dettaglio: cr.nota,
    refType: "correzione",
    refId: cr.id,
  });
  return { ok: true };
}

// -------------------------------------------------------------
// Action: files
// -------------------------------------------------------------
import { FileTipo } from "./types";
export function uploadFile(
  commessaId: string,
  userId: string,
  f: { nome: string; tipo: FileTipo; dimensioneBytes: number; storagePath?: string | null },
): ActionResult & { replaced?: boolean } {
  const denied = guardCanEdit(userId, commessaId);
  if (denied) return denied;
  const { file, replaced } = useFileStore.getState().upsertFile({
    commessaId,
    nome: f.nome,
    tipo: f.tipo,
    dimensioneBytes: f.dimensioneBytes,
    caricatoDaUserId: userId,
    storagePath: f.storagePath ?? null,
  });
  useEventiStore.getState().appendEvento({
    commessaId,
    userId,
    tipo: replaced ? "sostituzione_file" : "upload",
    titolo: replaced ? `File replaced: ${file.nome}` : `File uploaded: ${file.nome}`,
    refType: "file",
    refId: file.id,
  });
  return { ok: true, replaced };
}

export function registraWeTransfer(
  commessaId: string,
  userId: string,
  nota?: string,
): ActionResult {
  const denied = guardCanEdit(userId, commessaId);
  if (denied) return denied;
  useEventiStore.getState().appendEvento({
    commessaId,
    userId,
    tipo: "wetransfer",
    titolo: "WeTransfer delivery logged",
    dettaglio: nota?.trim() || undefined,
  });
  return { ok: true };
}

// Retention cleanup is server-side (migrations 0009/0010,
// pg_cron job "file-retention-daily"): nothing to do on the client.

// =============================================================
// EMAIL (Phase 3 — §5.6, §11)
// =============================================================

const TIPO_EVENTO_PER_KIND: Record<EmailTemplateKind, EventoTipo> = {
  pdf: "invio_pdf",
  prova_colore: "invio_prova_colore",
  caduta: "invio_caduta",
};

/** Default mailbox for a user = the mailbox of the first team they belong to. */
export function defaultMailboxForUser(userId: string): string | null {
  const memberships = useUtenteGruppiStore.getState().utenteGruppi.filter((m) => m.userId === userId);
  if (memberships.length === 0) return null;
  const gruppi = useGruppiStore.getState().gruppi;
  for (const m of memberships) {
    const g = gruppi.find((x) => x.id === m.gruppoId);
    if (g) return g.mailbox;
  }
  return null;
}

/** Template variable substitution (MAIL-03). */
export function renderTemplate(
  tpl: string,
  ctx: {
    numero_commessa: string;
    nome_lavoro: string;
    cliente: string;
    nome_utente: string;
  },
): string {
  return tpl
    .split("{job_number}").join(ctx.numero_commessa)
    .split("{job_name}").join(ctx.nome_lavoro)
    .split("{customer}").join(ctx.cliente)
    .split("{user_name}").join(ctx.nome_utente);
}

export interface InviaEmailPayload {
  kind: EmailTemplateKind;
  mittente: string;
  destinatari: string[];
  /** Carbon copy, already de-duplicated and without the recipients. */
  cc?: string[];
  oggetto: string;
  corpo: string;
  allegatoNome?: string;
  /** Id of the job PDF file to attach. */
  allegatoFileId?: string;
  /** If true, simulates a send failure (MAIL-07) without calling the server. */
  simulaErrore?: boolean;
  /** Target status: when set, a successful send advances the job. */
  advanceState?: StatoCommessa;
}

export async function inviaEmail(
  commessaId: string,
  userId: string,
  p: InviaEmailPayload,
): Promise<ActionResult & { emailId?: string }> {
  const c = useCommesseStore.getState().commesse.find((x) => x.id === commessaId);
  if (!c) return { ok: false, reason: "Job not found." };
  const denied = guardCanEdit(userId, commessaId, "Permission denied: you cannot send emails for this job.");
  if (denied) return denied;
  if (!p.destinatari.length || p.destinatari.some((d) => !d.trim())) {
    return { ok: false, reason: "Enter at least one valid recipient." };
  }
  if (!p.oggetto.trim()) return { ok: false, reason: "Subject is required." };
  if (!p.corpo.trim()) return { ok: false, reason: "Email body is required." };

  const eventoTipo = TIPO_EVENTO_PER_KIND[p.kind];
  const cc = p.cc ?? [];
  const indirizzi = `To: ${p.destinatari.join(", ")}${cc.length ? ` · CC: ${cc.join(", ")}` : ""}`;

  const flushEmailWrites = async (emailId: string): Promise<ActionResult & { emailId?: string }> => {
    try {
      await flushPendingWrites();
      return { ok: true, emailId };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "The database rejected the post-send save.";
      return {
        ok: false,
        reason: `Email sent and archived, but status/history not saved: ${reason}`,
        emailId,
      };
    }
  };

  // 1) Send + permanent archive (MAIL-06).
  //    Production: the Edge Function sends through the email provider and
  //    inserts the row into email_inviate (even with status 'errore',
  //    MAIL-07); here we only add the returned row to the store.
  let em: EmailInviata;
  let sendFailure: string | null = null;
  if (emailViaSupabase() && !p.simulaErrore) {
    const res = await sendEmailViaFunction({
      commessaId,
      kind: p.kind,
      mittente: p.mittente,
      destinatari: p.destinatari,
      cc,
      oggetto: p.oggetto,
      corpo: p.corpo,
      allegatoFileId: p.allegatoFileId,
      allegatoNome: p.allegatoNome,
    });
    if (!res.sent && !res.email) {
      // Rejected BEFORE archiving (auth/validation/network):
      // nothing to record, the user can fix it and retry.
      return { ok: false, reason: res.reason ?? "Sending failed." };
    }
    em = res.email!;
    const emailStore = useEmailStore.getState();
    emailStore.setEmailInviate([em, ...emailStore.emailInviate]);
    if (!res.sent) sendFailure = res.reason ?? "Sending failed.";
  } else {
    const stato: EmailStato = p.simulaErrore ? "errore" : "inviata";
    em = useEmailStore.getState().appendEmail({
      commessaId,
      templateKind: p.kind,
      mittente: p.mittente,
      destinatari: p.destinatari,
      cc,
      oggetto: p.oggetto,
      corpo: p.corpo,
      allegatoNome: p.allegatoNome,
      inviataDaUserId: userId,
      stato,
    });
    if (p.simulaErrore) sendFailure = "Simulated error (test).";
  }

  // 2) Advance the status ONLY if the send succeeded and it was requested.
  //    If advancing fails, STILL record the send event: the email is
  //    already archived and must leave a trace in the history.
  if (!sendFailure && p.advanceState) {
    const res = performTransition({
      commessaId,
      to: p.advanceState,
      userId,
      eventoTipo,
      eventoTitolo: `${EMAIL_TEMPLATE_LABELS[p.kind]} — sent`,
      eventoDettaglio: indirizzi,
      refType: "email",
      refId: em.id,
    });
    if (res.ok === true) return flushEmailWrites(em.id);
    const failure: { ok: false; reason: string; needsForzatura?: boolean } = res;
    useEventiStore.getState().appendEvento({
      commessaId,
      userId,
      tipo: eventoTipo,
      titolo: `${EMAIL_TEMPLATE_LABELS[p.kind]} — sent (status not advanced)`,
      dettaglio: `${indirizzi} — ${failure.reason}`,
      refType: "email",
      refId: em.id,
    });
    return { ok: false, reason: failure.reason, needsForzatura: failure.needsForzatura, emailId: em.id };
  }

  useEventiStore.getState().appendEvento({
    commessaId,
    userId,
    tipo: eventoTipo,
    titolo: sendFailure
      ? `${EMAIL_TEMPLATE_LABELS[p.kind]} — send error`
      : EMAIL_TEMPLATE_LABELS[p.kind],
    dettaglio: indirizzi,
    refType: "email",
    refId: em.id,
  });
  if (sendFailure) {
    const flushed = await flushEmailWrites(em.id);
    if (!flushed.ok) return flushed;
    return {
      ok: false,
      reason: `Sending failed: ${sendFailure} The email was archived with status 'error'; you can retry.`,
      emailId: em.id,
    };
  }
  return flushEmailWrites(em.id);
}
