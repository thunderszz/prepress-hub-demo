// The job state machine.
//
// The job's `stato` is the single source of truth; the metro-map stop is
// derived from it. Allowed transitions are listed in NEXT, with their extra
// conditions in canTransition. Any other move is only possible as an
// override (`forzatura`), which requires a note.

import {
  Commessa,
  EsitoCaduta,
  EsitoProvaColore,
  STATI,
  StatoCommessa,
  StepKey,
} from "./types";

/** Status → metro stop (8 stops). */
export const STEP_BY_STATO: Record<StatoCommessa, StepKey> = {
  disponibile: "pool",
  assegnata: "assegnazione",
  in_lavorazione: "lavorazione_pdf",
  in_attesa_approvazione_pdf: "approvazione_pdf",
  in_attesa_prova_colore: "prova_colore",
  in_attesa_approvazione_caduta: "caduta_macchina",
  in_produzione_matrice: "produzione_matrice",
  spedito: "spedizione",
};

/** Current step derived from the status. */
export const stepOf = (c: Pick<Commessa, "stato">): StepKey => STEP_BY_STATO[c.stato];

/** Index (0..7) of the current stop, used by the metro map. */
export const stepIndexOf = (c: Pick<Commessa, "stato">): number =>
  STATI.indexOf(c.stato);

/** "Natural" transitions allowed without an override. */
const NEXT: Record<StatoCommessa, StatoCommessa[]> = {
  disponibile: ["assegnata"],
  assegnata: ["in_lavorazione", "disponibile"],
  in_lavorazione: ["in_attesa_approvazione_pdf"],
  in_attesa_approvazione_pdf: ["in_lavorazione", "in_attesa_prova_colore"],
  in_attesa_prova_colore: ["in_lavorazione", "in_attesa_approvazione_caduta"],
  in_attesa_approvazione_caduta: ["in_lavorazione", "in_produzione_matrice"],
  in_produzione_matrice: ["spedito"],
  spedito: [],
};

export interface TransitionContext {
  esitoProvaColore?: EsitoProvaColore;
  esitoCaduta?: EsitoCaduta;
  /** When present, enables non-standard transitions and bypasses. */
  forzatura?: { nota: string };
}

export type TransitionResult =
  | { ok: true }
  | { ok: false; reason: string; needsForzatura?: boolean };

/**
 * Checks whether the `from` → `to` transition is allowed in this context.
 *
 * Explicit constraints:
 *   - Reaching `in_attesa_approvazione_caduta` requires the colour proof
 *     to be "not required" or "sent and approved".
 *   - Reaching `in_produzione_matrice` requires `esitoCaduta = "approvata"`.
 *   - Any jump outside `NEXT[from]` requires `forzatura.nota`.
 */
export function canTransition(
  from: StatoCommessa,
  to: StatoCommessa,
  ctx: TransitionContext = {},
): TransitionResult {
  const forced = !!ctx.forzatura;

  if (NEXT[from].includes(to)) {
    if (to === "in_attesa_approvazione_caduta" && !forced) {
      const ok = ctx.esitoProvaColore === "non_serve" || ctx.esitoProvaColore === "spedita_approvata";
      if (!ok) {
        return {
          ok: false,
          reason:
            "The colour proof must be 'Not required' or 'Sent and approved' before sending the press proof.",
          needsForzatura: true,
        };
      }
    }
    if (to === "in_produzione_matrice" && ctx.esitoCaduta !== "approvata" && !forced) {
      return {
        ok: false,
        reason: "The press proof must be 'Approved' before plate production.",
        needsForzatura: true,
      };
    }
    return { ok: true };
  }

  if (forced) return { ok: true };
  return {
    ok: false,
    reason: `Transition not allowed: ${from} → ${to}.`,
    needsForzatura: true,
  };
}

/** Statuses reachable from `from` without an override. */
export const nextStates = (from: StatoCommessa): StatoCommessa[] => [...NEXT[from]];

/** True if the status is terminal (shipped). */
export const isTerminale = (s: StatoCommessa) => s === "spedito";
