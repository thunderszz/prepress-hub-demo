// =============================================================
// Mock backend (portfolio demo only)
//
// Replaces the Supabase client with an in-memory database exposing the
// same subset of the API the app uses:
//   from(t).select/insert/update/upsert/delete + eq/order/single/maybeSingle
//   auth.*        → login with demo users (password "demo")
//   functions.*   → simulated send-email / invite-user
//   storage.*     → files kept in memory (placeholders when missing)
//   channel(...)  → realtime no-op
//
// Data lives in the browser's localStorage: it can be changed freely and
// "Reset demo data" brings everything back to the initial state.
// No network calls.
// =============================================================

import { jsPDF } from "jspdf";
import type { Database } from "../database.types";
import { buildSeed, DEMO_PASSWORD } from "./seed";

type Tables = Database["public"]["Tables"];
export type TableName = keyof Tables;
type Row<T extends TableName> = Tables[T]["Row"];
type AnyRow = Record<string, unknown>;
export type MockDb = { [K in TableName]: Row<K>[] };

export interface MockError {
  message: string;
  code?: string;
}

const DB_KEY = "prepress-hub-demo:db:v3";
const SESSION_KEY = "prepress-hub-demo:session:v2";

// ---------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------
function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function loadDb(): MockDb {
  const ls = safeStorage();
  try {
    const raw = ls?.getItem(DB_KEY);
    if (raw) return JSON.parse(raw) as MockDb;
  } catch {
    // corrupted data: start again from the seed
  }
  return buildSeed();
}

let db: MockDb = loadDb();

function saveDb() {
  try {
    safeStorage()?.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    // quota full or storage blocked: the demo keeps going in memory
  }
}
saveDb();

/** Resets the demo data to its initial state (used by the UI button). */
export function resetDemoData() {
  db = buildSeed();
  saveDb();
  blobs.clear();
}

// Unique constraints mirrored from the real DB (Postgres code 23505).
const UNIQUE: Partial<Record<TableName, string[][]>> = {
  clienti: [["nome_chiave"]],
  commesse: [["numero_commessa"]],
  utenti: [["email"]],
  commessa_assegnatari: [["commessa_id", "user_id"]],
  utente_gruppi: [["utente_id", "gruppo_id"]],
};

const now = () => new Date().toISOString();

// Defaults that DEFAULT columns and triggers set in the real DB.
function withDefaults(table: TableName, row: AnyRow): AnyRow {
  const base: AnyRow = { ...row };
  if (!("id" in base) && table !== "commessa_assegnatari" && table !== "utente_gruppi") {
    base.id = crypto.randomUUID();
  }
  switch (table) {
    case "clienti":
      return { email: null, telefono: null, note: null, creato_il: now(), ...base };
    case "commesse":
      return {
        stampatore: null, cod_stampatore: null, soggetto: null, cod_soggetto: null,
        rif_cliente: null, cod_articolo: null, numero_ordine: null, operatore_repro: null,
        sospensione_attiva_id: null, presa_in_carico_da_user_id: null, presa_in_carico_il: null,
        esito_prova_colore: null, esito_caduta: null, data_consegna_prevista: null,
        termine_primo_pdf: null, note_interne: null, spedita_il: null, annullata_il: null,
        creata_il: now(), aggiornata_il: now(),
        ...base,
        // like trg_enforce_commessa_insert_defaults
        stato: "disponibile", revisioni_pdf: 0,
      };
    case "eventi":
      return { data: now(), user_id: null, dettaglio: null, ref_type: null, ref_id: null, ...base };
    case "utenti":
      return { creato_il: now(), attivo: true, ...base };
    default:
      return base;
  }
}

function violatesUnique(table: TableName, row: AnyRow, ignoreRef?: AnyRow): boolean {
  const rows = db[table] as AnyRow[];
  return (UNIQUE[table] ?? []).some((cols) =>
    rows.some((r) => r !== ignoreRef && cols.every((c) => r[c] === row[c])),
  );
}

// ---------------------------------------------------------------
// Query builder (thenable, like PostgrestBuilder)
// ---------------------------------------------------------------
type Op =
  | { kind: "select" }
  | { kind: "insert"; values: AnyRow[] }
  | { kind: "upsert"; values: AnyRow[] }
  | { kind: "update"; values: AnyRow }
  | { kind: "delete" };

interface Result<D> {
  data: D;
  error: MockError | null;
}

class QueryBuilder<T extends TableName, D = Row<T>[]> implements PromiseLike<Result<D>> {
  private filters: Array<[string, unknown]> = [];
  private orders: Array<{ col: string; asc: boolean }> = [];
  private mode: "many" | "single" | "maybe" = "many";

  constructor(private table: T, private op: Op = { kind: "select" }) {}

  select(_cols?: string): QueryBuilder<T, Row<T>[]> {
    return this as unknown as QueryBuilder<T, Row<T>[]>;
  }
  insert(values: Tables[T]["Insert"] | Tables[T]["Insert"][]) {
    this.op = { kind: "insert", values: (Array.isArray(values) ? values : [values]) as AnyRow[] };
    return this;
  }
  upsert(values: Tables[T]["Insert"] | Tables[T]["Insert"][]) {
    this.op = { kind: "upsert", values: (Array.isArray(values) ? values : [values]) as AnyRow[] };
    return this;
  }
  update(values: Tables[T]["Update"]) {
    this.op = { kind: "update", values: values as AnyRow };
    return this;
  }
  delete() {
    this.op = { kind: "delete" };
    return this;
  }
  eq(col: keyof Row<T> & string, value: unknown) {
    this.filters.push([col, value]);
    return this;
  }
  order(col: keyof Row<T> & string, opts?: { ascending?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending ?? true });
    return this;
  }
  single(): QueryBuilder<T, Row<T>> {
    this.mode = "single";
    return this as unknown as QueryBuilder<T, Row<T>>;
  }
  maybeSingle(): QueryBuilder<T, Row<T> | null> {
    this.mode = "maybe";
    return this as unknown as QueryBuilder<T, Row<T> | null>;
  }

  private matches(r: AnyRow) {
    return this.filters.every(([c, v]) => r[c] === v);
  }

  private execute(): Result<unknown> {
    const rows = db[this.table] as AnyRow[];
    let out: AnyRow[] = [];
    switch (this.op.kind) {
      case "select":
        out = rows.filter((r) => this.matches(r));
        break;
      case "insert": {
        const prepared = this.op.values.map((v) => withDefaults(this.table, v));
        for (const r of prepared) {
          if (violatesUnique(this.table, r)) {
            return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
          }
        }
        rows.push(...prepared);
        out = prepared;
        saveDb();
        break;
      }
      case "upsert": {
        for (const v of this.op.values) {
          const idx = rows.findIndex((r) => r.id === v.id);
          if (idx >= 0) rows[idx] = { ...rows[idx], ...v };
          else rows.push(withDefaults(this.table, v));
          out.push(idx >= 0 ? rows[idx] : rows[rows.length - 1]);
        }
        saveDb();
        break;
      }
      case "update": {
        const patch = { ...this.op.values };
        if (this.table === "commesse" && !("aggiornata_il" in patch)) patch.aggiornata_il = now();
        for (let i = 0; i < rows.length; i++) {
          if (!this.matches(rows[i])) continue;
          const next = { ...rows[i], ...patch };
          if (violatesUnique(this.table, next, rows[i])) {
            return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
          }
          rows[i] = next;
          out.push(next);
        }
        saveDb();
        break;
      }
      case "delete": {
        out = rows.filter((r) => this.matches(r));
        (db as Record<string, AnyRow[]>)[this.table] = rows.filter((r) => !this.matches(r));
        saveDb();
        break;
      }
    }

    for (const { col, asc } of [...this.orders].reverse()) {
      out = [...out].sort((a, b) => {
        const x = a[col] as string | number | null;
        const y = b[col] as string | number | null;
        if (x === y) return 0;
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return (x < y ? -1 : 1) * (asc ? 1 : -1);
      });
    }

    // Copies: nobody may mutate the "DB" from outside.
    const copy = out.map((r) => structuredClone(r));
    if (this.mode === "single") {
      if (copy.length !== 1) return { data: null, error: { code: "PGRST116", message: "No rows returned" } };
      return { data: copy[0], error: null };
    }
    if (this.mode === "maybe") return { data: copy[0] ?? null, error: null };
    return { data: copy, error: null };
  }

  then<R1 = Result<D>, R2 = never>(
    onfulfilled?: ((value: Result<D>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    // small latency: the UI behaves as it would with a real server
    return new Promise<Result<D>>((resolve) =>
      setTimeout(() => resolve(this.execute() as Result<D>), 40),
    ).then(onfulfilled, onrejected);
  }
}

// ---------------------------------------------------------------
// Auth
// ---------------------------------------------------------------
type AuthEvent = "INITIAL_SESSION" | "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED";
interface MockSession {
  user: { id: string; email: string };
}
type AuthListener = (event: AuthEvent, session: MockSession | null) => void;

const listeners = new Set<AuthListener>();

function readSession(): MockSession | null {
  try {
    const raw = safeStorage()?.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as MockSession) : null;
  } catch {
    return null;
  }
}
function writeSession(s: MockSession | null) {
  try {
    if (s) safeStorage()?.setItem(SESSION_KEY, JSON.stringify(s));
    else safeStorage()?.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
const emit = (e: AuthEvent, s: MockSession | null) => listeners.forEach((l) => l(e, s));
const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));

const auth = {
  onAuthStateChange(cb: AuthListener) {
    listeners.add(cb);
    setTimeout(() => cb("INITIAL_SESSION", readSession()), 0);
    return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
  },
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    await delay();
    const user = db.utenti.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || password !== DEMO_PASSWORD) {
      return {
        data: { session: null },
        error: { message: `Invalid credentials. In the demo every user's password is "${DEMO_PASSWORD}".` },
      };
    }
    const session: MockSession = { user: { id: user.id, email: user.email } };
    writeSession(session);
    emit("SIGNED_IN", session);
    return { data: { session }, error: null };
  },
  async signOut() {
    writeSession(null);
    emit("SIGNED_OUT", null);
    return { error: null };
  },
  async getUser() {
    const s = readSession();
    return s
      ? { data: { user: s.user }, error: null }
      : { data: { user: null }, error: { message: "No session" } };
  },
  async updateUser(_attrs: { password?: string }) {
    await delay();
    return { data: {}, error: null };
  },
  async resetPasswordForEmail(_email: string, _opts?: { redirectTo?: string }) {
    await delay();
    return { data: {}, error: null };
  },
};

// ---------------------------------------------------------------
// Simulated Edge Functions
// ---------------------------------------------------------------
function initialsFor(nome: string) {
  return nome.split(/\s+/).filter(Boolean).map((p) => p[0]!.toUpperCase()).slice(0, 2).join("") || "UT";
}

const functions = {
  async invoke(name: string, { body: rawBody }: { body: object }) {
    const body = rawBody as Record<string, unknown>;
    await delay(400);
    const currentEmail = readSession()?.user.email;
    const currentUser = db.utenti.find((u) => u.email === currentEmail);

    if (name === "send-email") {
      const destinatari = body.destinatari as string[];
      // To show error handling (MAIL-07): an address containing
      // "error" simulates a rejection by the provider.
      const fallita = destinatari.some((d) => d.toLowerCase().includes("error"));
      const allegato = body.allegatoFileId
        ? db.file_commessa.find((f) => f.id === body.allegatoFileId)
        : undefined;
      const row: Row<"email_inviate"> = {
        id: crypto.randomUUID(),
        commessa_id: body.commessaId as string,
        data: now(),
        template_kind: body.kind as Row<"email_inviate">["template_kind"],
        mittente: body.mittente as string,
        destinatari,
        cc: (body.cc as string[]) ?? [],
        oggetto: body.oggetto as string,
        corpo: body.corpo as string,
        allegato_nome: (body.allegatoNome as string) ?? null,
        allegato_path: allegato?.storage_path ?? null,
        allegato_disponibile: Boolean(allegato),
        inviata_da_user_id: currentUser?.id ?? null,
        stato: fallita ? "errore" : "inviata",
      };
      db.email_inviate.push(row);
      saveDb();
      return {
        data: {
          ok: !fallita,
          stato: row.stato,
          reason: fallita ? "Email provider (simulated): recipient mailbox does not exist." : null,
          email: row,
        },
        error: null,
      };
    }

    if (name === "invite-user") {
      const email = String(body.email).toLowerCase();
      if (db.utenti.some((u) => u.email === email)) {
        return { data: null, error: { message: "A user with this email already exists." } };
      }
      const user: Row<"utenti"> = {
        id: crypto.randomUUID(),
        nome: String(body.nome),
        email,
        ruolo: body.ruolo as Row<"utenti">["ruolo"],
        attivo: true,
        iniziali: initialsFor(String(body.nome)),
        creato_il: now(),
      };
      db.utenti.push(user);
      saveDb();
      const { creato_il: _c, ...appUser } = user;
      return { data: { user: appUser }, error: null };
    }

    return { data: null, error: { message: `Function "${name}" is not available in the demo.` } };
  },
};

// ---------------------------------------------------------------
// Storage: uploaded binaries stay in memory for the session;
// seeded files generate a placeholder preview on the fly.
// ---------------------------------------------------------------
const blobs = new Map<string, Blob>();

function placeholderBlob(path: string, nome: string): Blob {
  const ext = nome.split(".").pop()?.toLowerCase();
  if (ext === "pdf") {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Prepress Hub — sample file", 20, 30);
    doc.setFontSize(12);
    doc.text(nome, 20, 45);
    doc.setTextColor(120);
    doc.text("The original file is not included in the demo.", 20, 58);
    doc.text(`storage: ${path}`, 20, 66);
    return doc.output("blob");
  }
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 500;
  const ctx = canvas.getContext("2d")!;
  const colors = ["#00AEEF", "#EC008C", "#FFF200", "#231F20"];
  colors.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(i * 200, 0, 200, 500);
  });
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(60, 190, 680, 120);
  ctx.fillStyle = "#111";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText("Sample preview", 90, 240);
  ctx.font = "20px sans-serif";
  ctx.fillText(nome, 90, 280);
  const dataUrl = canvas.toDataURL("image/png");
  const bin = atob(dataUrl.split(",")[1]!);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

const storage = {
  from(_bucket: string) {
    return {
      async upload(path: string, file: Blob, _opts?: { upsert?: boolean; contentType?: string }) {
        await delay(300);
        blobs.set(path, file);
        return { data: { path }, error: null };
      },
      async createSignedUrl(path: string, _ttl: number, opts?: { download?: string }) {
        const file = db.file_commessa.find((f) => f.storage_path === path);
        if (!file || !file.binario_disponibile) {
          return { data: null, error: { message: "Object not found" } };
        }
        const blob = blobs.get(path) ?? placeholderBlob(path, opts?.download ?? file.nome);
        return { data: { signedUrl: URL.createObjectURL(blob) }, error: null };
      },
    };
  },
};

// ---------------------------------------------------------------
// Realtime: the demo has one user at a time, no channels needed.
// ---------------------------------------------------------------
function channel(_name: string) {
  const ch = {
    on: (..._args: unknown[]) => ch,
    subscribe: () => ch,
  };
  return ch;
}

export function createMockClient() {
  return {
    from: <T extends TableName>(table: T) => new QueryBuilder<T>(table),
    auth,
    functions,
    storage,
    channel,
    removeChannel: async (_ch: unknown) => "ok" as const,
  };
}

export type MockSupabaseClient = ReturnType<typeof createMockClient>;
