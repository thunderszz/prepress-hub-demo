// =============================================================
// MANUAL-MODE — manual creation of jobs and customers.
//
// Temporary bridge: by design jobs are born in the ERP (SYN-01) and
// arrive through a server-side sync that is not available yet. This
// module lets users create them from the portal.
//
// Who can use it: full-access roles only. That is enforced by
// `canCreateCommessa`, `canCreateCliente` and `canRenameCliente` (which
// hide the commands) and by the `commesse_insert` (migration 0017) and
// `clienti_write` policies (which reject the write). The role is not
// checked here: the permission is a single thing, and it lives in the DB.
//
// REMOVAL once the ERP sync is live:
//   1. delete this file, NuovaCommessaDialog.tsx and NuovoClienteDialog.tsx
//   2. grep -rn MANUAL-MODE src
//   3. apply supabase/manual_mode_rollback.sql
//
// Unlike supabaseWrites.ts (fire-and-forget writes, errors only in the
// console) every insert here is awaited and errors surface in the UI: a
// silently failed creation would leave the job only in memory, gone at
// the next refresh.
// =============================================================

import { hasSupabaseConfig, supabase } from "./supabase";
import { isDemoMode } from "./supabaseWrites";
import { mapCliente, mapCommessa } from "./supabaseData";
import { useClientiStore, useCommesseStore, useEventiStore } from "./store";
import { isValidEmail } from "./emailValidation";
import type { Cliente, Commessa } from "./types";
import type { Database } from "./database.types";

/** Unique constraint violation (unique_violation). */
const UNIQUE_VIOLATION = "23505";
/** RLS: the row does not pass the policy (insufficient_privilege). */
const INSUFFICIENT_PRIVILEGE = "42501";
/** PostgREST: `.single()` received zero rows. */
const NESSUNA_RIGA = "PGRST116";

type PgError = { message?: string; code?: string } | null;

export interface NuovoClienteInput {
  nome: string;
  email?: string;
  telefono?: string;
  note?: string;
}

export interface NuovaCommessaInput {
  /** ERP job number, typed by hand. Unique key. */
  numeroCommessa: string;
  nomeLavoro: string;
  /** Existing customer... */
  clienteId?: string;
  /** ...or a customer created on the fly. */
  nuovoCliente?: NuovoClienteInput;
  stampatore?: string;
  codStampatore?: string;
  soggetto?: string;
  codSoggetto?: string;
  rifCliente?: string;
  codArticolo?: string;
  numeroOrdine?: string;
  operatoreRePro?: string;
  /** ISO date (YYYY-MM-DD from the form date input). */
  dataConsegnaPrevista?: string;
}

// Outcomes are checked with `esito.ok === false`, not `!esito.ok`:
// with `strict: false` (tsconfig.app.json) TypeScript does not narrow
// the union on `!`, and `esito.reason` would not compile.
export type CreateCommessaOutcome =
  /**
   * `avviso` (warning) = the job exists, but something secondary
   * failed (today: the creation event). It is not `ok: false`,
   * otherwise the user would retry and create a duplicate.
   */
  | { ok: true; commessa: Commessa; avviso?: string }
  | { ok: false; reason: string };

/** Empty or whitespace-only string → null (nullable Postgres column). */
const opt = (v?: string): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

/** Customer grouping key: same rule as store.upsertCliente. */
const chiaveCliente = (nome: string): string => nome.trim().toLowerCase();

/** Readable message for a permission denied by the database. */
const PERMESSO_NEGATO =
  "You are not allowed to create jobs: this requires the Production Manager or Design Team Lead role.";

function commessaInsertReason(error: PgError, numero: string): string {
  if (error?.code === UNIQUE_VIOLATION) {
    return `Job number ${numero} already exists. Check the job list or use a different number.`;
  }
  if (error?.code === INSUFFICIENT_PRIVILEGE) return PERMESSO_NEGATO;
  return error?.message || "Job creation failed.";
}

export type ClienteOutcome =
  | { ok: true; cliente: Cliente }
  | { ok: false; reason: string };

const PERMESSO_NEGATO_CLIENTI =
  "You are not allowed to create or edit customers: this requires the Production Manager or Design Team Lead role.";

const clienteGiaPresente = (nome: string): string =>
  `A customer named "${nome}" already exists: you can find it in the customer list.`;

function clienteWriteReason(error: PgError, nome: string, fallback: string): string {
  if (error?.code === UNIQUE_VIOLATION) return clienteGiaPresente(nome);
  if (error?.code === INSUFFICIENT_PRIVILEGE) return PERMESSO_NEGATO_CLIENTI;
  // `.single()` with no rows: the policy hid the customer, or it is gone.
  // For an update RLS does not return 42501, it simply touches nothing.
  if (error?.code === NESSUNA_RIGA) {
    return "The database did not save the change: reload the page and try again. If it happens again, check that you have the Production Manager or Design Team Lead role.";
  }
  return error?.message || fallback;
}

/** Creates a customer from hand-entered data and adds it to the list. */
export async function createClienteManuale(input: NuovoClienteInput): Promise<ClienteOutcome> {
  const nome = input.nome.trim();
  if (!nome) return { ok: false, reason: "Customer name is required." };
  // Same rule as the customer page: the email becomes the default
  // recipient in the send wizard (§5.6), so a typo here travels there.
  if (input.email?.trim() && !isValidEmail(input.email)) {
    return { ok: false, reason: "Invalid email: use the form name@domain.com." };
  }
  if (!hasSupabaseConfig || isDemoMode()) {
    return { ok: false, reason: "Customers cannot be created in demo mode." };
  }

  const chiave = chiaveCliente(nome);
  const omonimo = useClientiStore.getState().clienti.find((c) => c.nomeChiave === chiave);
  if (omonimo) return { ok: false, reason: clienteGiaPresente(omonimo.nome) };

  const row: Database["public"]["Tables"]["clienti"]["Insert"] = {
    id: crypto.randomUUID(),
    nome,
    nome_chiave: chiave,
    email: opt(input.email),
    telefono: opt(input.telefono),
    note: opt(input.note),
  };

  const { data, error } = await supabase.from("clienti").insert(row).select().single();
  if (error || !data) {
    return { ok: false, reason: clienteWriteReason(error, nome, "Customer creation failed.") };
  }

  const cliente = mapCliente(data);
  const store = useClientiStore.getState();
  store.setClienti([...store.clienti, cliente]);
  return { ok: true, cliente };
}

/**
 * Fixes a customer's name (and its key). Needed while customers are
 * created by hand: a typo would stay forever, and the ERP sync will
 * recognise the customer by its name.
 */
export async function renameClienteManuale(id: string, nuovoNome: string): Promise<ClienteOutcome> {
  const nome = nuovoNome.trim();
  if (!nome) return { ok: false, reason: "Customer name cannot be empty." };
  if (!hasSupabaseConfig || isDemoMode()) {
    return { ok: false, reason: "Customers cannot be edited in demo mode." };
  }

  const { clienti } = useClientiStore.getState();
  const attuale = clienti.find((c) => c.id === id);
  if (!attuale) return { ok: false, reason: "Customer not found. Reload the page and try again." };
  if (attuale.nome === nome) return { ok: true, cliente: attuale };

  // The customer itself doesn't count: fixing only case or spaces is allowed.
  const chiave = chiaveCliente(nome);
  const omonimo = clienti.find((c) => c.id !== id && c.nomeChiave === chiave);
  if (omonimo) return { ok: false, reason: clienteGiaPresente(omonimo.nome) };

  const { data, error } = await supabase
    .from("clienti")
    .update({ nome, nome_chiave: chiave })
    .eq("id", id)
    .select()
    .single();
  if (error || !data) {
    return { ok: false, reason: clienteWriteReason(error, nome, "Renaming failed.") };
  }

  const cliente = mapCliente(data);
  const store = useClientiStore.getState();
  store.setClienti(store.clienti.map((c) => (c.id === id ? cliente : c)));
  return { ok: true, cliente };
}

/**
 * Returns the customer to link to the job: the selected one, an existing
 * one with the same name, or a new one created now.
 */
async function resolveCliente(input: NuovaCommessaInput): Promise<ClienteOutcome> {
  const store = useClientiStore.getState();

  if (input.clienteId) {
    const found = store.clienti.find((c) => c.id === input.clienteId);
    if (!found) return { ok: false, reason: "Customer not found. Reload the page and try again." };
    return { ok: true, cliente: found };
  }

  const nome = input.nuovoCliente?.nome?.trim();
  if (!nome) {
    return { ok: false, reason: "Pick an existing customer or enter the name of a new one." };
  }

  // A customer with the same name already exists: reuse it instead of
  // hitting the unique index on nome_chiave. (From the Customers page a
  // duplicate is an error instead: there the user wanted a new customer.)
  const chiave = chiaveCliente(nome);
  const existing = store.clienti.find((c) => c.nomeChiave === chiave);
  if (existing) return { ok: true, cliente: existing };

  return createClienteManuale({ ...input.nuovoCliente, nome });
}

export async function createCommessaManuale(
  input: NuovaCommessaInput,
  autoreUserId: string,
): Promise<CreateCommessaOutcome> {
  const numeroCommessa = input.numeroCommessa.trim();
  const nomeLavoro = input.nomeLavoro.trim();

  if (!numeroCommessa) return { ok: false, reason: "Job number is required." };
  if (!nomeLavoro) return { ok: false, reason: "Job name is required." };
  if (!input.clienteId && !input.nuovoCliente?.nome?.trim()) {
    return { ok: false, reason: "Pick an existing customer or enter the name of a new one." };
  }
  if (!hasSupabaseConfig || isDemoMode()) {
    return { ok: false, reason: "Jobs cannot be created in demo mode." };
  }

  // Duplicate already visible in the list: fail immediately, without a
  // round trip to the database.
  const giaPresente = useCommesseStore
    .getState()
    .commesse.some((c) => c.numeroCommessa === numeroCommessa);
  if (giaPresente) {
    return {
      ok: false,
      reason: `Job number ${numeroCommessa} already exists. Check the job list or use a different number.`,
    };
  }

  // Duplicate in the database but not yet in the store: detect it BEFORE
  // creating the customer, otherwise the job insert fails after the
  // customer is written and leaves an orphan (no client-side transaction,
  // and `authenticated` has no DELETE grant on clienti).
  const { data: omonima } = await supabase
    .from("commesse")
    .select("id")
    .eq("numero_commessa", numeroCommessa)
    .maybeSingle();
  if (omonima) {
    return {
      ok: false,
      reason: `Job number ${numeroCommessa} already exists. Check the job list or use a different number.`,
    };
  }

  const cliente = await resolveCliente(input);
  if (cliente.ok === false) return cliente;

  const row: Database["public"]["Tables"]["commesse"]["Insert"] = {
    id: crypto.randomUUID(),
    numero_commessa: numeroCommessa,
    cliente_id: cliente.cliente.id,
    nome_lavoro: nomeLavoro,
    stampatore: opt(input.stampatore),
    cod_stampatore: opt(input.codStampatore),
    soggetto: opt(input.soggetto),
    cod_soggetto: opt(input.codSoggetto),
    rif_cliente: opt(input.rifCliente),
    cod_articolo: opt(input.codArticolo),
    numero_ordine: opt(input.numeroOrdine),
    operatore_repro: opt(input.operatoreRePro),
    data_consegna_prevista: opt(input.dataConsegnaPrevista),
    // stato, revisioni_pdf and outcomes are enforced by the
    // trg_enforce_commessa_insert_defaults trigger: don't send them.
  };

  const { data, error } = await supabase.from("commesse").insert(row).select().single();
  if (error || !data) {
    return { ok: false, reason: commessaInsertReason(error, numeroCommessa) };
  }

  const commessa = mapCommessa(data);
  const commesseStore = useCommesseStore.getState();
  commesseStore.setCommesse([commessa, ...commesseStore.commesse]);

  // Creation event (LOG-02). If it fails the job is still valid but its
  // history starts empty: a refresh will NOT recover it, because the row
  // was never written. That's why the error is reported, not swallowed
  // (it used to be silently dropped while `eventi_insert` rejected it
  // with 42501).
  const evento = {
    id: crypto.randomUUID(),
    commessa_id: commessa.id,
    data: new Date().toISOString(),
    user_id: autoreUserId,
    tipo: "creazione_manuale" as const,
    titolo: "Job created manually",
    dettaglio: `Number ${numeroCommessa} - ${cliente.cliente.nome}`,
  };
  const { error: eventoError } = await supabase.from("eventi").insert(evento);
  if (eventoError) {
    console.error("eventi.insert (creazione_manuale)", eventoError);
    return {
      ok: true,
      commessa,
      avviso:
        eventoError.code === INSUFFICIENT_PRIVILEGE
          ? "Job created, but the history did not record the creation event (permission denied). Please report it: it is a configuration problem, not yours."
          : `Job created, but the history did not record the creation event: ${eventoError.message}`,
    };
  }

  const eventiStore = useEventiStore.getState();
  eventiStore.setEventi([
    {
      id: evento.id,
      commessaId: commessa.id,
      data: evento.data,
      userId: autoreUserId,
      tipo: evento.tipo,
      titolo: evento.titolo,
      dettaglio: evento.dettaglio,
    },
    ...eventiStore.eventi,
  ]);

  return { ok: true, commessa };
}
