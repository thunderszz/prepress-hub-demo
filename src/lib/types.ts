// Domain types.
//
// - The job status is the single source of truth: the metro-map stop is
//   derived from it (see workflow.ts), never stored.
// - The model is normalised like the database: child rows carry
//   `commessaId` instead of being nested inside the job.
// - Ids are UUIDs. `numeroCommessa` (the ERP job number) is a field, not the id.
// - Enum values are snake_case and match the database; display text lives
//   in the *_LABELS maps.
// - Dates are ISO 8601 strings in UTC.
//
// Identifiers keep the Italian domain vocabulary of the original project
// (commessa = job, cliente = customer, grafico = designer...); see the
// glossary in README.md.

export type UUID = string;
export type ISODate = string;

// Roles: the six roles of the prepress department.
export const ROLES = [
  "responsabile_produzione",
  "responsabile_ufficio_grafico",
  "responsabile_commerciale",
  "amministrazione",
  "controllo_qualita",
  "grafico",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  responsabile_produzione: "Production Manager",
  responsabile_ufficio_grafico: "Design Team Lead",
  responsabile_commerciale: "Sales Manager",
  amministrazione: "Administration",
  controllo_qualita: "Quality Control",
  grafico: "Prepress Designer",
};

export const FULL_ACCESS_ROLES: readonly Role[] = [
  "responsabile_produzione",
  "responsabile_ufficio_grafico",
];

// Job statuses, in workflow order.
export const STATI = [
  "disponibile",
  "assegnata",
  "in_lavorazione",
  "in_attesa_approvazione_pdf",
  "in_attesa_prova_colore",
  "in_attesa_approvazione_caduta",
  "in_produzione_matrice",
  "spedito",
] as const;
export type StatoCommessa = (typeof STATI)[number];

export const STATO_LABELS: Record<StatoCommessa, string> = {
  disponibile: "Available",
  assegnata: "Assigned",
  in_lavorazione: "In progress",
  in_attesa_approvazione_pdf: "Awaiting PDF approval",
  in_attesa_prova_colore: "Awaiting colour proof",
  in_attesa_approvazione_caduta: "Awaiting press proof approval",
  in_produzione_matrice: "Plate production",
  spedito: "Shipped",
};

// Metro-map stops, derived from the status in workflow.ts.
export const STEP_ORDER = [
  "pool",
  "assegnazione",
  "lavorazione_pdf",
  "approvazione_pdf",
  "prova_colore",
  "caduta_macchina",
  "produzione_matrice",
  "spedizione",
] as const;
export type StepKey = (typeof STEP_ORDER)[number];

export const STEP_LABELS: Record<StepKey, string> = {
  pool: "Available / Pool",
  assegnazione: "Assignment",
  lavorazione_pdf: "Artwork + PDF sent",
  approvazione_pdf: "PDF approval",
  prova_colore: "Colour proof",
  caduta_macchina: "Press proof",
  produzione_matrice: "Plate production",
  spedizione: "Shipping",
};

export const STEP_SHORT: Record<StepKey, string> = {
  pool: "Pool",
  assegnazione: "Assign.",
  lavorazione_pdf: "Artwork",
  approvazione_pdf: "PDF appr.",
  prova_colore: "Col. proof",
  caduta_macchina: "Press proof",
  produzione_matrice: "Plates",
  spedizione: "Shipping",
};

// Outcomes of the colour proof and the press proof.
export const ESITI_PROVA_COLORE = ["non_serve", "da_rifare", "spedita_approvata"] as const;
export type EsitoProvaColore = (typeof ESITI_PROVA_COLORE)[number];
export const ESITO_PROVA_COLORE_LABELS: Record<EsitoProvaColore, string> = {
  non_serve: "Not required",
  da_rifare: "To be redone",
  spedita_approvata: "Sent and approved",
};

export const ESITI_CADUTA = ["approvata", "da_rifare"] as const;
export type EsitoCaduta = (typeof ESITI_CADUTA)[number];
export const ESITO_CADUTA_LABELS: Record<EsitoCaduta, string> = {
  approvata: "Approved",
  da_rifare: "To be redone",
};

// Reasons a job can be put on hold.
export const MOTIVI_SOSPENSIONE = [
  "cliente",
  "attesa_ordine",
  "attesa_prova_colore",
  "attesa_caduta",
  "altro",
] as const;
export type MotivoSospensione = (typeof MOTIVI_SOSPENSIONE)[number];
export const MOTIVO_SOSPENSIONE_LABELS: Record<MotivoSospensione, string> = {
  cliente: "Put on hold by the customer",
  attesa_ordine: "Waiting for the official order",
  attesa_prova_colore: "Waiting for colour proof approval",
  attesa_caduta: "Waiting for press proof approval",
  altro: "Other",
};

// History event types. Events are append-only.
export const EVENTO_TIPI = [
  "sincronizzazione_erp",
  "aggiornamento_erp",
  "annullamento_erp",
  "assegnazione",
  "modifica_assegnazione",
  "presa_in_carico",
  "invio_pdf",
  "esito_pdf",
  "invio_prova_colore",
  "esito_prova_colore",
  "invio_caduta",
  "esito_caduta",
  "matrice_completata",
  "spedizione",
  "sospensione",
  "riattivazione",
  "upload",
  "sostituzione_file",
  "wetransfer",
  "correzione_registrata",
  "forzatura",
  "nota_interna",
  "nota_sottopassaggio",
  "email_inviata",
  "modifica_cliente",
  "creazione_manuale", // MANUAL-MODE, see manualCommessa.ts
] as const;
export type EventoTipo = (typeof EVENTO_TIPI)[number];

// Accepted job file formats.
export const FILE_TIPI = ["PDF", "JPEG", "PNG"] as const;
export type FileTipo = (typeof FILE_TIPI)[number];

// Customer emails.
export const EMAIL_STATI = ["inviata", "errore"] as const;
export type EmailStato = (typeof EMAIL_STATI)[number];

export const EMAIL_TEMPLATE_KIND = ["pdf", "prova_colore", "caduta"] as const;
export type EmailTemplateKind = (typeof EMAIL_TEMPLATE_KIND)[number];

export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplateKind, string> = {
  pdf: "Send PDF",
  prova_colore: "Send colour proof",
  caduta: "Send press proof",
};

// Domain of the shared team mailboxes.
export const MAILBOX_DOMAIN = "acmeflexo.example";

// Entities.

export interface User {
  id: UUID;
  nome: string;
  email: string;
  ruolo: Role;
  attivo: boolean;
  iniziali: string;
}

export interface GruppoPrestampa {
  id: UUID;
  nome: string;     // e.g. "studio-a"
  mailbox: string;  // e.g. "studio-a@acmeflexo.example"
}

/** Join table utente_gruppi (M:N). */
export interface UtenteGruppo {
  userId: UUID;
  gruppoId: UUID;
}

export interface Cliente {
  id: UUID;
  /** Customer name as received from the ERP (CUSTOMER field). */
  nome: string;
  /** Normalised key (trim + lowercase) used to group without duplicates. */
  nomeChiave: string;
  /** Customer email — entered by hand in v1 (the ERP does not provide it). */
  email?: string;
  telefono?: string;
  note?: string;
  creatoIl: ISODate;
}

export interface Commessa {
  id: UUID;

  // Fields synced from the ERP
  numeroCommessa: string;     // ERP key, immutable
  clienteId: UUID;
  stampatore?: string;        // printer (the customer's converter)
  codStampatore?: string;
  nomeLavoro: string;         // job name
  soggetto?: string;          // artwork variant
  codSoggetto?: string;
  rifCliente?: string;
  codArticolo?: string;
  numeroOrdine?: string;
  operatoreRePro?: string;

  // Status, the single source of truth for the workflow
  stato: StatoCommessa;

  // Current hold: the open row in `sospensioni`, if any
  sospensioneAttivaId?: UUID;

  // Workflow / outcomes
  presaInCaricoDaUserId?: UUID;
  presaInCaricoIl?: ISODate;
  revisioniPdf: number;
  esitoProvaColore?: EsitoProvaColore;
  esitoCaduta?: EsitoCaduta;

  // Local data
  dataConsegnaPrevista?: ISODate;  // alert ALR-03 when passed
  terminePrimoPdf?: ISODate;        // alert ALR-05 when passed; usually 48h after assignment
  noteInterne?: string;

  // Shipping: anchor for the 30-day file retention (DB: spedita_il)
  speditaIl?: ISODate;     // exact time it moved to "shipped" (≠ aggiornataIl)

  // Meta
  creataIl: ISODate;       // received from the ERP
  aggiornataIl: ISODate;
  annullataIl?: ISODate;   // jobs cancelled in the ERP are flagged, never deleted
}

/** Join table commessa_assegnatari (M:N). */
export interface CommessaAssegnatario {
  commessaId: UUID;
  userId: UUID;
  assegnatoIl: ISODate;
  assegnatoDaUserId: UUID;
}

/** One hold period; a job can be put on hold more than once. */
export interface Sospensione {
  id: UUID;
  commessaId: UUID;
  motivo: MotivoSospensione;
  nota?: string;
  apertaIl: ISODate;
  apertaDaUserId: UUID;
  chiusaIl?: ISODate;
  chiusaDaUserId?: UUID;
}

/** One history entry. Append-only. */
export interface Evento {
  id: UUID;
  commessaId: UUID;
  data: ISODate;
  userId?: UUID;
  tipo: EventoTipo;
  titolo: string;
  dettaglio?: string;
  /** Optional references to other entities (e.g. emailId, fileId). */
  refType?: "email" | "file" | "sospensione" | "forzatura" | "correzione";
  refId?: UUID;
}

/** A sent (or failed) email, archived permanently; its attachment expires with file retention. */
export interface EmailInviata {
  id: UUID;
  commessaId: UUID;
  data: ISODate;
  templateKind?: EmailTemplateKind;
  mittente: string;          // team mailbox
  destinatari: string[];
  /** Carbon copy; empty (or missing in old rows) when there was none. */
  cc?: string[];
  oggetto: string;
  corpo: string;
  allegatoNome?: string;     // name of the attached PDF
  /** false once the attachment has expired (file retention). */
  allegatoDisponibile?: boolean;
  inviataDaUserId?: UUID;
  stato: EmailStato;
}

/** File metadata; the binary lives in storage. */
export interface FileCommessa {
  id: UUID;
  commessaId: UUID;
  nome: string;
  tipo: FileTipo;
  dimensioneBytes: number;
  caricatoIl: ISODate;
  caricatoDaUserId?: UUID;
  /** false if the binary was deleted by retention (>30 days after shipping). */
  binarioDisponibile: boolean;
  /** Path in the storage bucket (commessa-files); null if never uploaded. */
  storagePath?: string | null;
}

/** Minutes spent on corrections; their total drives alert ALR-01. */
export interface Correzione {
  id: UUID;
  commessaId: UUID;
  userId: UUID;
  minuti: number;
  data: ISODate;
  nota?: string;
}

/** The mandatory note written when a workflow step is skipped. */
export interface NotaForzatura {
  id: UUID;
  commessaId: UUID;
  /** Step that was skipped/overridden. */
  stepSaltato: StepKey;
  /** Target status of the override. */
  statoTarget: StatoCommessa;
  nota: string;
  data: ISODate;
  userId: UUID;
}

/** A customer email template, with {job_number}-style variables. */
export interface EmailTemplate {
  id: UUID;
  kind: EmailTemplateKind;
  oggetto: string;
  corpo: string;
  ultimaModificaIl?: ISODate;
  ultimaModificaDaUserId?: UUID;
}
