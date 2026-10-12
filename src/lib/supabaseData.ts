import { supabase } from "./supabase";
import { isDemoMode } from "./supabaseWrites";
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
  User,
  UtenteGruppo,
} from "./types";
import type { Database } from "./database.types";
import {
  useAssegnatariStore,
  useClientiStore,
  useCommesseStore,
  useCorrezioniStore,
  useEmailStore,
  useEventiStore,
  useFileStore,
  useGruppiStore,
  useNoteForzaturaStore,
  useSessionStore,
  useSospensioniStore,
  useTemplatesStore,
  useUsersStore,
  useUtenteGruppiStore,
} from "./store";

const clean = <T>(value: T | null | undefined): T | undefined => value ?? undefined;
type Tables = Database["public"]["Tables"];
type Row<T extends keyof Tables> = Tables[T]["Row"];

const mapUser = (r: Row<"utenti">): User => ({
  id: r.id,
  nome: r.nome,
  email: r.email,
  ruolo: r.ruolo,
  attivo: r.attivo,
  iniziali: r.iniziali,
});

const mapGruppo = (r: Row<"gruppi_prestampa">): GruppoPrestampa => ({
  id: r.id,
  nome: r.nome,
  mailbox: r.mailbox,
});

const mapUtenteGruppo = (r: Row<"utente_gruppi">): UtenteGruppo => ({
  userId: r.utente_id,
  gruppoId: r.gruppo_id,
});

export const mapCliente = (r: Row<"clienti">): Cliente => ({
  id: r.id,
  nome: r.nome,
  nomeChiave: r.nome_chiave,
  email: clean(r.email),
  telefono: clean(r.telefono),
  note: clean(r.note),
  creatoIl: r.creato_il,
});

export const mapCommessa = (r: Row<"commesse">): Commessa => ({
  id: r.id,
  numeroCommessa: r.numero_commessa,
  clienteId: r.cliente_id,
  stampatore: clean(r.stampatore),
  codStampatore: clean(r.cod_stampatore),
  nomeLavoro: r.nome_lavoro,
  soggetto: clean(r.soggetto),
  codSoggetto: clean(r.cod_soggetto),
  rifCliente: clean(r.rif_cliente),
  codArticolo: clean(r.cod_articolo),
  numeroOrdine: clean(r.numero_ordine),
  operatoreRePro: clean(r.operatore_repro),
  stato: r.stato,
  sospensioneAttivaId: clean(r.sospensione_attiva_id),
  presaInCaricoDaUserId: clean(r.presa_in_carico_da_user_id),
  presaInCaricoIl: clean(r.presa_in_carico_il),
  revisioniPdf: r.revisioni_pdf,
  esitoProvaColore: clean(r.esito_prova_colore),
  esitoCaduta: clean(r.esito_caduta),
  dataConsegnaPrevista: clean(r.data_consegna_prevista),
  terminePrimoPdf: clean(r.termine_primo_pdf),
  noteInterne: clean(r.note_interne),
  speditaIl: clean(r.spedita_il),
  creataIl: r.creata_il,
  aggiornataIl: r.aggiornata_il,
  annullataIl: clean(r.annullata_il),
});

export const mapAssegnatario = (r: Row<"commessa_assegnatari">): CommessaAssegnatario => ({
  commessaId: r.commessa_id,
  userId: r.user_id,
  assegnatoIl: r.assegnato_il,
  assegnatoDaUserId: r.assegnato_da_user_id,
});

const mapEvento = (r: Row<"eventi">): Evento => ({
  id: r.id,
  commessaId: r.commessa_id,
  data: r.data,
  userId: clean(r.user_id),
  tipo: r.tipo,
  titolo: r.titolo,
  dettaglio: clean(r.dettaglio),
  refType: clean(r.ref_type) as Evento["refType"],
  refId: clean(r.ref_id),
});

export const mapEmail = (r: Row<"email_inviate">): EmailInviata => ({
  id: r.id,
  commessaId: r.commessa_id,
  data: r.data,
  templateKind: clean(r.template_kind),
  mittente: r.mittente,
  destinatari: r.destinatari,
  // ?? []: rows returned by a send-email older than the cc column.
  cc: r.cc ?? [],
  oggetto: r.oggetto,
  corpo: r.corpo,
  allegatoNome: clean(r.allegato_nome),
  allegatoDisponibile: r.allegato_disponibile,
  inviataDaUserId: r.inviata_da_user_id,
  stato: r.stato,
});

const mapFile = (r: Row<"file_commessa">): FileCommessa => ({
  id: r.id,
  commessaId: r.commessa_id,
  nome: r.nome,
  tipo: r.tipo,
  dimensioneBytes: Number(r.dimensione_bytes),
  caricatoIl: r.caricato_il,
  caricatoDaUserId: r.caricato_da_user_id,
  binarioDisponibile: r.binario_disponibile,
  storagePath: r.storage_path,
});

const mapCorrezione = (r: Row<"correzioni">): Correzione => ({
  id: r.id,
  commessaId: r.commessa_id,
  userId: r.user_id,
  minuti: r.minuti,
  data: r.data,
  nota: clean(r.nota),
});

const mapNotaForzatura = (r: Row<"note_forzatura">): NotaForzatura => ({
  id: r.id,
  commessaId: r.commessa_id,
  stepSaltato: r.step_saltato,
  statoTarget: r.stato_target,
  nota: r.nota,
  data: r.data,
  userId: r.user_id,
});

const mapSospensione = (r: Row<"sospensioni">): Sospensione => ({
  id: r.id,
  commessaId: r.commessa_id,
  motivo: r.motivo,
  nota: clean(r.nota),
  apertaIl: r.aperta_il,
  apertaDaUserId: r.aperta_da_user_id,
  chiusaIl: clean(r.chiusa_il),
  chiusaDaUserId: clean(r.chiusa_da_user_id),
});

const mapTemplate = (r: Row<"email_template">): EmailTemplate => ({
  id: r.id,
  kind: r.kind,
  oggetto: r.oggetto,
  corpo: r.corpo,
  ultimaModificaIl: clean(r.ultima_modifica_il),
  ultimaModificaDaUserId: clean(r.ultima_modifica_da_user_id),
});

async function requireData<T>(query: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as T;
}

// Downloads every table from the DB and fills the data stores (does NOT touch the session).
// Returns the mapped users so the caller can resolve the current user.
async function hydrateStores(): Promise<User[]> {
  const [
    users,
    gruppi,
    utenteGruppi,
    clienti,
    commesse,
    assegnatari,
    eventi,
    email,
    files,
    correzioni,
    noteForzatura,
    sospensioni,
    templates,
  ] = await Promise.all([
    requireData(supabase.from("utenti").select("*").order("nome")),
    requireData(supabase.from("gruppi_prestampa").select("*").order("nome")),
    requireData(supabase.from("utente_gruppi").select("*")),
    requireData(supabase.from("clienti").select("*").order("nome")),
    requireData(supabase.from("commesse").select("*").order("aggiornata_il", { ascending: false })),
    requireData(supabase.from("commessa_assegnatari").select("*")),
    requireData(supabase.from("eventi").select("*").order("data", { ascending: false })),
    requireData(supabase.from("email_inviate").select("*").order("data", { ascending: false })),
    requireData(supabase.from("file_commessa").select("*").order("caricato_il", { ascending: false })),
    requireData(supabase.from("correzioni").select("*").order("data", { ascending: false })),
    requireData(supabase.from("note_forzatura").select("*").order("data", { ascending: false })),
    requireData(supabase.from("sospensioni").select("*").order("aperta_il", { ascending: false })),
    requireData(supabase.from("email_template").select("*").order("kind")),
  ]);

  if (isDemoMode()) {
    return useUsersStore.getState().users;
  }

  const mappedUsers = users.map(mapUser);

  useUsersStore.getState().setUsers(mappedUsers);
  useGruppiStore.getState().setGruppi(gruppi.map(mapGruppo));
  useUtenteGruppiStore.getState().setUtenteGruppi(utenteGruppi.map(mapUtenteGruppo));
  useClientiStore.getState().setClienti(clienti.map(mapCliente));
  useCommesseStore.getState().setCommesse(commesse.map(mapCommessa));
  useAssegnatariStore.getState().setAssegnatariRows(assegnatari.map(mapAssegnatario));
  useEventiStore.getState().setEventi(eventi.map(mapEvento));
  useEmailStore.getState().setEmailInviate(email.map(mapEmail));
  useFileStore.getState().setFiles(files.map(mapFile));
  useCorrezioniStore.getState().setCorrezioni(correzioni.map(mapCorrezione));
  useNoteForzaturaStore.getState().setNoteForzatura(noteForzatura.map(mapNotaForzatura));
  useSospensioniStore.getState().setSospensioni(sospensioni.map(mapSospensione));
  useTemplatesStore.getState().setTemplates(templates.map(mapTemplate));

  return mappedUsers;
}

export async function loadAppData(): Promise<User | null> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user?.email) {
    useSessionStore.getState().setSession({ isAuthenticated: false, currentUserId: null, authEmail: null });
    return null;
  }

  const mappedUsers = await hydrateStores();
  const current = mappedUsers.find(
    (u) => u.email.toLowerCase() === authData.user.email!.toLowerCase() && u.attivo,
  ) ?? null;

  useSessionStore.getState().setSession({
    isAuthenticated: true,
    currentUserId: current?.id ?? null,
    authEmail: authData.user.email,
  });

  return current;
}

// Re-syncs the UI with the real DB data. Used after a rejected write
// (the UI had optimistically updated the screen: here the truth comes back).
// In QA demo mode it does nothing: it must never overwrite fake data.
export async function reloadFromSupabase(): Promise<void> {
  if (isDemoMode()) return;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) return;
  await hydrateStores();
}

export function subscribeToRealtime(): () => void {
  const channel = supabase
    .channel("prepress-live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "commesse" },
      async () => {
        if (isDemoMode()) return;
        const rows = await requireData(
          supabase.from("commesse").select("*").order("aggiornata_il", { ascending: false }),
        );
        // Demo mode may have started during the await: don't overwrite fake data.
        if (isDemoMode()) return;
        useCommesseStore.getState().setCommesse(rows.map(mapCommessa));
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "commessa_assegnatari" },
      async () => {
        if (isDemoMode()) return;
        const rows = await requireData(supabase.from("commessa_assegnatari").select("*"));
        if (isDemoMode()) return;
        useAssegnatariStore.getState().setAssegnatariRows(rows.map(mapAssegnatario));
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
