// Display steps — VISUAL sequence of the metro map (customer request)
//
// The state machine stays the one in workflow.ts (8 `StatoCommessa`,
// SINGLE source of truth). No DB statuses are added here: the sequence
// of dots the user sees is DERIVED from status + outcomes +
// `revisioniPdf`.
//
// Requested sequence:
//   Available → Assigned → Claimed → Artwork started →
//   PDF_01 sent [→ PDF_02, PDF_03, …] → Colour proof sent →
//   JOB APPROVED → Press proof sent → Plate production → Shipped
//
// Key rules:
//  - a dot turns green ("done") every time a step is passed;
//  - if `PDF_01` is rejected it stays RED ("rejected") and `PDF_02`
//    appears after it (generalised to PDF_0n through `revisioniPdf`).

import {
  Cog,
  FileText,
  Inbox,
  Layers3,
  type LucideIcon,
  Palette,
  Play,
  ThumbsUp,
  Truck,
  UserCheck,
  UserPlus,
} from "lucide-react";

import { Commessa, STATI, StatoCommessa } from "./types";

export type DisplayStepState = "done" | "current" | "todo" | "rejected" | "blocked";

export interface DisplayStep {
  /** Stable React key (PDFs: pdf_1, pdf_2, …). */
  key: string;
  label: string;
  short: string;
  Icon: LucideIcon;
  state: DisplayStepState;
}

/** Numeric index of the current status (0..7) in `STATI` order. */
const statoIndex = (s: StatoCommessa): number => STATI.indexOf(s);

const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

/**
 * Derives the sequence of dots shown for a job.
 *
 * `sospesa` (on hold) paints the current dot yellow ("blocked"),
 * consistent with the existing metro behaviour.
 */
export function computeDisplaySteps(
  commessa: Pick<
    Commessa,
    "stato" | "revisioniPdf" | "presaInCaricoIl" | "esitoProvaColore"
  >,
  sospesa = false,
): DisplayStep[] {
  const si = statoIndex(commessa.stato);
  // Reference indexes (see STATI order in types.ts).
  const IDX = {
    disponibile: 0,
    assegnata: 1,
    in_lavorazione: 2,
    attesa_pdf: 3,
    attesa_prova: 4,
    attesa_caduta: 5,
    produzione: 6,
    spedito: 7,
  } as const;

  // Helper: state of a milestone dot (done/current/todo + blocked).
  const mk = (done: boolean, current: boolean): DisplayStepState =>
    sospesa && current ? "blocked" : current ? "current" : done ? "done" : "todo";

  const steps: DisplayStep[] = [];

  steps.push({
    key: "disponibile",
    label: "Available",
    short: "Available",
    Icon: Inbox,
    state: mk(si >= IDX.assegnata, si === IDX.disponibile),
  });

  steps.push({
    key: "assegnata",
    label: "Assigned",
    short: "Assigned",
    Icon: UserPlus,
    state: mk(si >= IDX.in_lavorazione, si === IDX.assegnata),
  });

  // Claimed: milestone, green once the job is in progress (or has been
  // claimed anyway). It has no "current" resting phase of its own.
  steps.push({
    key: "presa_in_carico",
    label: "Claimed",
    short: "Claimed",
    Icon: UserCheck,
    state: mk(si >= IDX.in_lavorazione || !!commessa.presaInCaricoIl, false),
  });

  steps.push({
    key: "inizio_lavorazione",
    label: "Artwork started",
    short: "Artwork",
    Icon: Play,
    state: mk(si >= IDX.attesa_pdf, si === IDX.in_lavorazione),
  });

  // --- PDF block: PDF_01 [.. PDF_0n], branching on `revisioniPdf`. -----
  // Number of PDF rounds shown: revisioniPdf + 1 (at least PDF_01).
  // The first `revisioniPdf` were rejected (red); the last one is the
  // current / approved / still-to-send one.
  const pdfCount = Math.max(0, commessa.revisioniPdf) + 1;
  for (let j = 1; j <= pdfCount; j++) {
    const isLast = j === pdfCount;
    let state: DisplayStepState;
    if (!isLast) {
      // Previous PDF = rejected → stays red.
      state = "rejected";
    } else if (si >= IDX.attesa_prova) {
      // Last PDF approved: already at colour proof or beyond.
      state = "done";
    } else if (si === IDX.attesa_pdf) {
      // Last PDF sent, waiting for the customer's answer.
      state = sospesa ? "blocked" : "current";
    } else {
      // Not sent yet (in progress, or next round after a rejection).
      state = "todo";
    }
    steps.push({
      key: `pdf_${j}`,
      label: `PDF_${pad2(j)} sent`,
      short: `PDF_${pad2(j)}`,
      Icon: FileText,
      state,
    });
  }

  steps.push({
    key: "prova_colore",
    label: "Colour proof sent",
    short: "Colour proof",
    Icon: Palette,
    state: mk(si >= IDX.attesa_caduta, si === IDX.attesa_prova),
  });

  // JOB APPROVED: milestone. Green when the colour proof was approved by
  // the customer ("spedita_approvata") or once past it (press proof /
  // production / shipped).
  steps.push({
    key: "lavoro_approvato",
    label: "JOB APPROVED",
    short: "Approved",
    Icon: ThumbsUp,
    state: mk(
      si >= IDX.attesa_caduta || commessa.esitoProvaColore === "spedita_approvata",
      false,
    ),
  });

  steps.push({
    key: "caduta",
    label: "Press proof sent",
    short: "Press proof",
    Icon: Layers3,
    state: mk(si >= IDX.produzione, si === IDX.attesa_caduta),
  });

  steps.push({
    key: "produzione_lastre",
    label: "Plate production",
    short: "Plates",
    Icon: Cog,
    state: mk(si >= IDX.spedito, si === IDX.produzione),
  });

  steps.push({
    key: "spedito",
    label: "Shipped",
    short: "Shipped",
    Icon: Truck,
    // Terminal: green once shipped, otherwise to do.
    state: si === IDX.spedito ? "done" : "todo",
  });

  return steps;
}
