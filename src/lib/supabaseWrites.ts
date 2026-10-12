import { supabase, hasSupabaseConfig } from "./supabase";
import type { Database } from "./database.types";
import {
  Cliente,
  Commessa,
  CommessaAssegnatario,
  Correzione,
  Evento,
  FileCommessa,
  NotaForzatura,
  Sospensione,
} from "./types";

function report(error: unknown) {
  if (error instanceof Error) console.error("Supabase write failed:", error.message);
  else console.error("Supabase write failed:", error);
}

// QA demo mode: when on, NO write reaches the database.
// Used by the original QA "demo session" that filled the UI with fake data.
let demoMode = false;
export function setDemoMode(value: boolean): void {
  demoMode = value;
}
export function isDemoMode(): boolean {
  return demoMode;
}
const writesDisabled = () => !hasSupabaseConfig || demoMode;

let pendingWrites: Promise<void>[] = [];

async function run(label: string, op: PromiseLike<{ error: { message: string } | null }>) {
  if (writesDisabled()) return;
  const { error } = await op;
  if (error) throw new Error(`${label}: ${error.message}`);
}

function queue(promise: Promise<void>) {
  const tracked = promise.catch((error) => {
    report(error);
    throw error;
  });
  pendingWrites.push(tracked);
  void tracked.catch(() => undefined);
}

export async function flushPendingWrites(): Promise<void> {
  if (demoMode) {
    pendingWrites = [];
    return;
  }
  const batch = pendingWrites;
  pendingWrites = [];
  await Promise.all(batch);
}

// Customer record (CLI-04): only the hand-editable fields.
// Explicit `field: undefined` = cleared → null in the DB.
export function persistClientePatch(id: string, patch: Partial<Cliente>) {
  if (writesDisabled()) return;
  const row: Database["public"]["Tables"]["clienti"]["Update"] = {};
  if ("email" in patch) row.email = patch.email ?? null;
  if ("telefono" in patch) row.telefono = patch.telefono ?? null;
  if ("note" in patch) row.note = patch.note ?? null;
  if (Object.keys(row).length === 0) return;
  queue(run("clienti.update", supabase.from("clienti").update(row).eq("id", id)));
}

export function persistCommessaPatch(id: string, patch: Partial<Commessa>) {
  if (writesDisabled()) return;
  const row: Database["public"]["Tables"]["commesse"]["Update"] = {};
  if (patch.stato !== undefined) row.stato = patch.stato;
  if (patch.sospensioneAttivaId !== undefined) row.sospensione_attiva_id = patch.sospensioneAttivaId ?? null;
  if (patch.presaInCaricoDaUserId !== undefined) row.presa_in_carico_da_user_id = patch.presaInCaricoDaUserId ?? null;
  if (patch.presaInCaricoIl !== undefined) row.presa_in_carico_il = patch.presaInCaricoIl ?? null;
  if (patch.revisioniPdf !== undefined) row.revisioni_pdf = patch.revisioniPdf;
  // Explicit `esitoProvaColore: undefined` = reset (back to artwork).
  if ("esitoProvaColore" in patch) row.esito_prova_colore = patch.esitoProvaColore ?? null;
  if (patch.esitoCaduta !== undefined) row.esito_caduta = patch.esitoCaduta ?? null;
  if (patch.dataConsegnaPrevista !== undefined) row.data_consegna_prevista = patch.dataConsegnaPrevista ?? null;
  if (patch.terminePrimoPdf !== undefined) row.termine_primo_pdf = patch.terminePrimoPdf ?? null;
  if (patch.noteInterne !== undefined) row.note_interne = patch.noteInterne ?? null;
  if (patch.speditaIl !== undefined) row.spedita_il = patch.speditaIl ?? null;
  if (Object.keys(row).length === 0) return;
  queue(run("commesse.update", supabase.from("commesse").update(row).eq("id", id)));
}

export function persistAssegnatari(commessaId: string, rows: CommessaAssegnatario[]) {
  if (writesDisabled()) return;
  const payload = rows.map((r) => ({
    commessa_id: r.commessaId,
    user_id: r.userId,
    assegnato_il: r.assegnatoIl,
    assegnato_da_user_id: r.assegnatoDaUserId,
  }));
  queue((async () => {
    await run("commessa_assegnatari.delete", supabase.from("commessa_assegnatari").delete().eq("commessa_id", commessaId));
    if (payload.length > 0) {
      await run("commessa_assegnatari.insert", supabase.from("commessa_assegnatari").insert(payload));
    }
  })());
}

export function persistEvento(e: Evento) {
  queue(run(
    "eventi.insert",
    supabase.from("eventi").insert({
      id: e.id,
      commessa_id: e.commessaId,
      data: e.data,
      user_id: e.userId ?? null,
      tipo: e.tipo,
      titolo: e.titolo,
      dettaglio: e.dettaglio ?? null,
      ref_type: e.refType ?? null,
      ref_id: e.refId ?? null,
    }),
  ));
}

export function persistFile(f: FileCommessa) {
  queue(run(
    "file_commessa.upsert",
    supabase.from("file_commessa").upsert({
      id: f.id,
      commessa_id: f.commessaId,
      nome: f.nome,
      tipo: f.tipo,
      dimensione_bytes: f.dimensioneBytes,
      caricato_il: f.caricatoIl,
      caricato_da_user_id: f.caricatoDaUserId,
      binario_disponibile: f.binarioDisponibile,
      storage_path: f.storagePath ?? null,
    }),
  ));
}

export function persistCorrezione(c: Correzione) {
  queue(run(
    "correzioni.insert",
    supabase.from("correzioni").insert({
      id: c.id,
      commessa_id: c.commessaId,
      user_id: c.userId,
      minuti: c.minuti,
      data: c.data,
      nota: c.nota ?? null,
    }),
  ));
}

export function persistNotaForzatura(n: NotaForzatura) {
  queue(run(
    "note_forzatura.insert",
    supabase.from("note_forzatura").insert({
      id: n.id,
      commessa_id: n.commessaId,
      step_saltato: n.stepSaltato,
      stato_target: n.statoTarget,
      nota: n.nota,
      data: n.data,
      user_id: n.userId,
    }),
  ));
}

export function persistSospensione(s: Sospensione) {
  queue(run(
    "sospensioni.upsert",
    supabase.from("sospensioni").upsert({
      id: s.id,
      commessa_id: s.commessaId,
      motivo: s.motivo,
      nota: s.nota ?? null,
      aperta_il: s.apertaIl,
      aperta_da_user_id: s.apertaDaUserId,
      chiusa_il: s.chiusaIl ?? null,
      chiusa_da_user_id: s.chiusaDaUserId ?? null,
    }),
  ));
}
