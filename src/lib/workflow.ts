// =============================================================
// Workflow — the job (Commessa) state machine (PHASE 1)
//
// - The job `stato` is the SINGLE source of truth.
// - The metro stop (StepKey) is DERIVED through STEP_BY_STATO.
// - Allowed transitions are encoded here; specific constraints
//   (e.g. WF-19) are explicit. Transitions not listed are only
//   allowed as an `override` (`forzatura`, mandatory note — §5).
// =============================================================

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
 *   - WF-19: reaching `in_attesa_approvazione_caduta` requires a
 *     colour proof outcome.
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
            "The colour proof must be 'Not required' or 'Sent and approved' before sending the press proof (WF-18/19).",
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
