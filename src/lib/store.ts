// Stores — in-memory UI cache
//
// The source of truth is the database. These stores only keep what was
// loaded from it, so React components stay simple.

import { create } from "zustand";

import {
  Cliente,
  Commessa,
  CommessaAssegnatario,
  Correzione,
  EmailInviata,
  EmailTemplate,
  Evento,
  FileCommessa,
  GruppoPrestampa,
  NotaForzatura,
  Sospensione,
  StatoCommessa,
  User,
  UtenteGruppo,
} from "./types";
import { canTransition, stepOf } from "./workflow";
import { Session } from "./permissions";
import {
  persistAssegnatari,
  persistClientePatch,
  persistCommessaPatch,
  persistCorrezione,
  persistEvento,
  persistFile,
  persistNotaForzatura,
  persistSospensione,
} from "./supabaseWrites";

const uid = (): string => crypto.randomUUID();
const nowIso = (): string => new Date().toISOString();

// SESSION (Supabase Auth + current application user)
// Inactivity timeout (security requirements): 7 days, so users don't have to
// log in again every morning. It only counts while the tab is open.
const INACTIVITY_LIMIT_MS = 7 * 24 * 60 * 60 * 1000;
const INACTIVITY_WARNING_MS = 2 * 60 * 1000;

interface SessionState {
  isAuthenticated: boolean;
  currentUserId: string | null;
  authEmail: string | null;
  lastActivity: number;
  warningOpen: boolean;
  hasHydrated: boolean;
  login: (userId: string) => void;
  setSession: (data: { currentUserId: string | null; authEmail: string | null; isAuthenticated: boolean }) => void;
  logout: () => void;
  setCurrentUser: (userId: string) => void;
  touchActivity: () => void;
  showInactivityWarning: () => void;
  hideInactivityWarning: () => void;
  setHasHydrated: (value: boolean) => void;
}

export const useSessionStore = create<SessionState>()((set, get) => ({
  isAuthenticated: false,
  currentUserId: null,
  authEmail: null,
  lastActivity: Date.now(),
  warningOpen: false,
  hasHydrated: false,
  login: (userId) =>
    set({
      isAuthenticated: true,
      currentUserId: userId,
      lastActivity: Date.now(),
      warningOpen: false,
    }),
  setSession: ({ currentUserId, authEmail, isAuthenticated }) =>
    set({
      isAuthenticated,
      currentUserId,
      authEmail,
      lastActivity: Date.now(),
      warningOpen: false,
      hasHydrated: true,
    }),
  logout: () =>
    set({
      isAuthenticated: false,
      currentUserId: null,
      authEmail: null,
      warningOpen: false,
    }),
  setCurrentUser: (userId) =>
    set({
      isAuthenticated: true,
      currentUserId: userId,
      lastActivity: Date.now(),
    }),
  touchActivity: () => set({ lastActivity: Date.now() }),
  showInactivityWarning: () => set({ warningOpen: true }),
  hideInactivityWarning: () => {
    const { isAuthenticated } = get();
    set({ warningOpen: false, lastActivity: Date.now(), isAuthenticated });
  },
  setHasHydrated: (hasHydrated) => set({ hasHydrated }),
}));

export const INACTIVITY = {
  LIMIT_MS: INACTIVITY_LIMIT_MS,
  WARNING_MS: INACTIVITY_WARNING_MS,
};

// USERS
interface UsersState {
  users: User[];
  setUsers: (u: User[]) => void;
  updateUser: (id: string, patch: Partial<User>) => void;
}
export const useUsersStore = create<UsersState>()((set) => ({
  users: [],
  setUsers: (users) => set({ users }),
  updateUser: (id, patch) =>
    set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) })),
}));

// PREPRESS TEAMS (gruppi)
interface GruppiState {
  gruppi: GruppoPrestampa[];
  setGruppi: (gruppi: GruppoPrestampa[]) => void;
}
export const useGruppiStore = create<GruppiState>()((set) => ({
  gruppi: [],
  setGruppi: (gruppi) => set({ gruppi }),
}));

// USER ↔ TEAM (utente_gruppi)
interface UtenteGruppiState {
  utenteGruppi: UtenteGruppo[];
  setUtenteGruppi: (rows: UtenteGruppo[]) => void;
  addMembership: (userId: string, gruppoId: string) => void;
  removeMembership: (userId: string, gruppoId: string) => void;
}
export const useUtenteGruppiStore = create<UtenteGruppiState>()((set) => ({
  utenteGruppi: [],
  setUtenteGruppi: (utenteGruppi) => set({ utenteGruppi }),
  addMembership: (userId, gruppoId) =>
    set((s) =>
      s.utenteGruppi.some((m) => m.userId === userId && m.gruppoId === gruppoId)
        ? s
        : { utenteGruppi: [...s.utenteGruppi, { userId, gruppoId }] },
    ),
  removeMembership: (userId, gruppoId) =>
    set((s) => ({
      utenteGruppi: s.utenteGruppi.filter((m) => !(m.userId === userId && m.gruppoId === gruppoId)),
    })),
}));

// CUSTOMERS (clienti)
interface ClientiState {
  clienti: Cliente[];
  setClienti: (clienti: Cliente[]) => void;
  upsertCliente: (nome: string) => Cliente;
  updateCliente: (id: string, patch: Partial<Cliente>) => void;
}
export const useClientiStore = create<ClientiState>()((set, get) => ({
  clienti: [],
  setClienti: (clienti) => set({ clienti }),
  upsertCliente: (nome) => {
    const chiave = nome.trim().toLowerCase();
    const existing = get().clienti.find((c) => c.nomeChiave === chiave);
    if (existing) return existing;
    const c: Cliente = { id: uid(), nome, nomeChiave: chiave, creatoIl: nowIso() };
    set((s) => ({ clienti: [...s.clienti, c] }));
    return c;
  },
  updateCliente: (id, patch) => {
    set((s) => ({ clienti: s.clienti.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
    persistClientePatch(id, patch);
  },
}));

// JOBS (commesse)
interface CommesseState {
  commesse: Commessa[];
  setCommesse: (commesse: Commessa[]) => void;
  setStato: (id: string, stato: StatoCommessa) => void;
  setPatch: (id: string, patch: Partial<Commessa>) => void;
}

export const useCommesseStore = create<CommesseState>()((set) => ({
  commesse: [],
  setCommesse: (commesse) => set({ commesse }),
  setStato: (id, stato) =>
    set((s) => {
      persistCommessaPatch(id, { stato });
      return {
        commesse: s.commesse.map((c) =>
          c.id === id ? { ...c, stato, aggiornataIl: nowIso() } : c,
        ),
      };
    }),
  setPatch: (id, patch) =>
    set((s) => {
      persistCommessaPatch(id, patch);
      return {
        commesse: s.commesse.map((c) =>
          c.id === id ? { ...c, ...patch, aggiornataIl: nowIso() } : c,
        ),
      };
    }),
}));

// ASSIGNEES (assegnatari)
interface AssegnatariState {
  assegnatari: CommessaAssegnatario[];
  setAssegnatariRows: (rows: CommessaAssegnatario[]) => void;
  addAssegnatario: (commessaId: string, userId: string, assegnatoDaUserId: string) => void;
  removeAssegnatario: (commessaId: string, userId: string) => void;
  setAssegnatari: (commessaId: string, userIds: string[], assegnatoDaUserId: string) => void;
}
export const useAssegnatariStore = create<AssegnatariState>()((set) => ({
  assegnatari: [],
  setAssegnatariRows: (assegnatari) => set({ assegnatari }),
  addAssegnatario: (commessaId, userId, assegnatoDaUserId) =>
    set((s) =>
      s.assegnatari.some((a) => a.commessaId === commessaId && a.userId === userId)
        ? s
        : {
            assegnatari: [
              ...s.assegnatari,
              { commessaId, userId, assegnatoIl: nowIso(), assegnatoDaUserId },
            ],
          },
    ),
  removeAssegnatario: (commessaId, userId) =>
    set((s) => ({
      assegnatari: s.assegnatari.filter((a) => !(a.commessaId === commessaId && a.userId === userId)),
    })),
  setAssegnatari: (commessaId, userIds, assegnatoDaUserId) =>
    set((s) => {
      const others = s.assegnatari.filter((a) => a.commessaId !== commessaId);
      const newOnes: CommessaAssegnatario[] = userIds.map((userId) => ({
        commessaId,
        userId,
        assegnatoIl: nowIso(),
        assegnatoDaUserId,
      }));
      persistAssegnatari(commessaId, newOnes);
      return { assegnatari: [...others, ...newOnes] };
    }),
}));

// EVENTS (eventi)
interface EventiState {
  eventi: Evento[];
  setEventi: (eventi: Evento[]) => void;
  appendEvento: (e: Omit<Evento, "id" | "data"> & { data?: string }) => Evento;
}
export const useEventiStore = create<EventiState>()((set) => ({
  eventi: [],
  setEventi: (eventi) => set({ eventi }),
  appendEvento: (e) => {
    const evento: Evento = { ...e, id: uid(), data: e.data ?? nowIso() };
    persistEvento(evento);
    set((s) => ({ eventi: [evento, ...s.eventi] }));
    return evento;
  },
}));

// SENT EMAILS
interface EmailState {
  emailInviate: EmailInviata[];
  setEmailInviate: (rows: EmailInviata[]) => void;
}
export const useEmailStore = create<EmailState>()((set) => ({
  emailInviate: [],
  setEmailInviate: (emailInviate) => set({ emailInviate }),
}));

// FILES
interface FileState {
  files: FileCommessa[];
  setFiles: (files: FileCommessa[]) => void;
  upsertFile: (f: Omit<FileCommessa, "id" | "caricatoIl" | "binarioDisponibile">) =>
    { file: FileCommessa; replaced: boolean };
}
export const useFileStore = create<FileState>()((set, get) => ({
  files: [],
  setFiles: (files) => set({ files }),
  upsertFile: (f) => {
    const existing = get().files.find(
      (x) => x.commessaId === f.commessaId && x.nome === f.nome,
    );
    const file: FileCommessa = {
      ...f,
      id: existing?.id ?? uid(),
      caricatoIl: nowIso(),
      binarioDisponibile: true,
    };
    set((s) => ({
      files: existing
        ? s.files.map((x) => (x.id === existing.id ? file : x))
        : [file, ...s.files],
    }));
    persistFile(file);
    return { file, replaced: !!existing };
  },
}));

// CORRECTIONS (correzioni)
interface CorrezioniState {
  correzioni: Correzione[];
  setCorrezioni: (rows: Correzione[]) => void;
  addCorrezione: (c: Omit<Correzione, "id" | "data"> & { data?: string }) => Correzione;
}
export const useCorrezioniStore = create<CorrezioniState>()((set) => ({
  correzioni: [],
  setCorrezioni: (correzioni) => set({ correzioni }),
  addCorrezione: (c) => {
    const cr: Correzione = { ...c, id: uid(), data: c.data ?? nowIso() };
    persistCorrezione(cr);
    set((s) => ({ correzioni: [cr, ...s.correzioni] }));
    return cr;
  },
}));

// OVERRIDE NOTES (note_forzatura)
interface NoteForzaturaState {
  noteForzatura: NotaForzatura[];
  setNoteForzatura: (rows: NotaForzatura[]) => void;
  addNotaForzatura: (n: Omit<NotaForzatura, "id" | "data"> & { data?: string }) => NotaForzatura;
}
export const useNoteForzaturaStore = create<NoteForzaturaState>()((set) => ({
  noteForzatura: [],
  setNoteForzatura: (noteForzatura) => set({ noteForzatura }),
  addNotaForzatura: (n) => {
    const nf: NotaForzatura = { ...n, id: uid(), data: n.data ?? nowIso() };
    persistNotaForzatura(nf);
    set((s) => ({ noteForzatura: [nf, ...s.noteForzatura] }));
    return nf;
  },
}));

// HOLDS (sospensioni)
interface SospensioniState {
  sospensioni: Sospensione[];
  setSospensioni: (rows: Sospensione[]) => void;
  apriSospensione: (s: Omit<Sospensione, "id" | "apertaIl" | "chiusaIl" | "chiusaDaUserId">) => Sospensione;
  chiudiSospensione: (id: string, userId: string) => void;
}
export const useSospensioniStore = create<SospensioniState>()((set) => ({
  sospensioni: [],
  setSospensioni: (sospensioni) => set({ sospensioni }),
  apriSospensione: (data) => {
    const sosp: Sospensione = { ...data, id: uid(), apertaIl: nowIso() };
    persistSospensione(sosp);
    set((s) => ({ sospensioni: [sosp, ...s.sospensioni] }));
    return sosp;
  },
  chiudiSospensione: (id, userId) =>
    set((s) => {
      const chiusaIl = nowIso();
      const next = s.sospensioni.map((x) =>
        x.id === id && !x.chiusaIl ? { ...x, chiusaIl, chiusaDaUserId: userId } : x,
      );
      const changed = next.find((x) => x.id === id);
      if (changed) persistSospensione(changed);
      return { sospensioni: next };
    }),
}));

// TEMPLATES
interface TemplatesState {
  templates: EmailTemplate[];
  setTemplates: (rows: EmailTemplate[]) => void;
  updateTemplate: (id: string, patch: Partial<EmailTemplate>) => void;
}
export const useTemplatesStore = create<TemplatesState>()((set) => ({
  templates: [],
  setTemplates: (templates) => set({ templates }),
  updateTemplate: (id, patch) =>
    set((s) => ({
      templates: s.templates.map((t) =>
        t.id === id ? { ...t, ...patch, ultimaModificaIl: nowIso() } : t,
      ),
    })),
}));

// Composite hooks

export function useCurrentUser(): User | null {
  const id = useSessionStore((s) => s.currentUserId);
  const users = useUsersStore((s) => s.users);
  return id ? users.find((u) => u.id === id) ?? null : null;
}

export function useCurrentSession(): Session | null {
  const u = useCurrentUser();
  return u ? { userId: u.id, role: u.ruolo } : null;
}

// High-level local actions

interface TransitionParams {
  commessaId: string;
  to: StatoCommessa;
  userId: string;
  forzaturaNota?: string;
  eventoTipo: Evento["tipo"];
  eventoTitolo: string;
  eventoDettaglio?: string;
  refType?: Evento["refType"];
  refId?: string;
}

export function performTransition(p: TransitionParams):
  | { ok: true }
  | { ok: false; reason: string; needsForzatura?: boolean } {
  const c = useCommesseStore.getState().commesse.find((x) => x.id === p.commessaId);
  if (!c) return { ok: false, reason: "Job not found." };

  const res = canTransition(c.stato, p.to, {
    esitoProvaColore: c.esitoProvaColore,
    esitoCaduta: c.esitoCaduta,
    forzatura: p.forzaturaNota ? { nota: p.forzaturaNota } : undefined,
  });
  if (!res.ok) return res;

  useCommesseStore.getState().setStato(p.commessaId, p.to);

  if (p.to === "spedito" && !c.speditaIl) {
    useCommesseStore.getState().setPatch(p.commessaId, { speditaIl: nowIso() });
  }

  if (c.stato === "in_attesa_approvazione_pdf" && p.to === "in_lavorazione") {
    useCommesseStore.getState().setPatch(p.commessaId, {
      revisioniPdf: c.revisioniPdf + 1,
    });
  }

  // Back to artwork from the colour proof: the outcome belongs to the
  // previous round and must be reset, otherwise the new proof would look
  // already approved (badge, JOB APPROVED step, press proof unlocked).
  if (
    c.stato === "in_attesa_prova_colore" &&
    p.to === "in_lavorazione" &&
    c.esitoProvaColore !== undefined
  ) {
    useCommesseStore.getState().setPatch(p.commessaId, { esitoProvaColore: undefined });
  }

  if (p.forzaturaNota) {
    const nf = useNoteForzaturaStore.getState().addNotaForzatura({
      commessaId: p.commessaId,
      stepSaltato: stepKeyForStato(c.stato),
      statoTarget: p.to,
      nota: p.forzaturaNota,
      userId: p.userId,
    });
    useEventiStore.getState().appendEvento({
      commessaId: p.commessaId,
      userId: p.userId,
      tipo: "forzatura",
      titolo: "Step override",
      dettaglio: p.forzaturaNota,
      refType: "forzatura",
      refId: nf.id,
    });
  }

  useEventiStore.getState().appendEvento({
    commessaId: p.commessaId,
    userId: p.userId,
    tipo: p.eventoTipo,
    titolo: p.eventoTitolo,
    dettaglio: p.eventoDettaglio,
    refType: p.refType,
    refId: p.refId,
  });

  return { ok: true };
}

const stepKeyForStato = (st: StatoCommessa) => stepOf({ stato: st });
