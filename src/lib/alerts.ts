// Alerts, computed from the stores on every render; nothing is stored.
//
// ALR-01  correction minutes total ≥ 60        → notification to Sales Manager
// ALR-02  press proof sent > 2 working days    → without an approved outcome
// ALR-03  expected delivery date passed        → not shipped nor on hold
// ALR-04  > 3 months since creataIl            → not shipped
// ALR-05  first-PDF deadline passed            → no invio_pdf yet

import { Commessa, Evento } from "./types";
import { useCommesseStore, useCorrezioniStore, useEventiStore } from "./store";

export type AlertCode = "ALR-01" | "ALR-02" | "ALR-03" | "ALR-04" | "ALR-05";

export interface AlertItem {
  code: AlertCode;
  commessaId: string;
  severity: "warning" | "danger";
  message: string;
  /** True for ALR-01: triggers an "email notification" to the Sales Manager. */
  emailNotifica?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Counts whole working days (Mon-Fri) between two dates. */
function businessDaysBetween(start: Date, end: Date): number {
  if (end <= start) return 0;
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const stop = new Date(end);
  stop.setHours(0, 0, 0, 0);
  let count = 0;
  while (cur < stop) {
    cur.setDate(cur.getDate() + 1);
    const d = cur.getDay();
    if (d !== 0 && d !== 6) count++;
  }
  return count;
}

interface AlertCtx {
  eventi: Evento[];
  minutiCorrezioni: number;
}

function alertsForCommessa(c: Commessa, ctx: AlertCtx): AlertItem[] {
  const out: AlertItem[] = [];
  const sospesa = !!c.sospensioneAttivaId;
  const spedito = c.stato === "spedito";
  const annullata = !!c.annullataIl;
  if (annullata) return out;

  // ALR-01
  if (ctx.minutiCorrezioni >= 60) {
    out.push({
      code: "ALR-01",
      commessaId: c.id,
      severity: "warning",
      message: `Total corrections ${ctx.minutiCorrezioni}′ (≥ 60′)`,
      emailNotifica: true,
    });
  }

  // ALR-02
  const ultimoInvioCaduta = ctx.eventi
    .filter((e) => e.commessaId === c.id && e.tipo === "invio_caduta")
    .sort((a, b) => b.data.localeCompare(a.data))[0];
  if (ultimoInvioCaduta && c.esitoCaduta !== "approvata") {
    const gg = businessDaysBetween(new Date(ultimoInvioCaduta.data), new Date());
    if (gg > 2) {
      out.push({
        code: "ALR-02",
        commessaId: c.id,
        severity: "warning",
        message: `Press proof sent ${gg} working days ago, not approved`,
      });
    }
  }

  // ALR-03
  if (c.dataConsegnaPrevista && !spedito && !sospesa) {
    if (new Date(c.dataConsegnaPrevista).getTime() < Date.now()) {
      out.push({
        code: "ALR-03",
        commessaId: c.id,
        severity: "danger",
        message: "Expected delivery date passed",
      });
    }
  }

  // ALR-04
  if (!spedito) {
    const age = Date.now() - new Date(c.creataIl).getTime();
    if (age > 90 * DAY_MS) {
      out.push({
        code: "ALR-04",
        commessaId: c.id,
        severity: "warning",
        message: "Open for more than 3 months, not shipped",
      });
    }
  }

  // ALR-05
  if (c.terminePrimoPdf) {
    const haInviato = ctx.eventi.some(
      (e) => e.commessaId === c.id && e.tipo === "invio_pdf",
    );
    if (!haInviato && new Date(c.terminePrimoPdf).getTime() < Date.now()) {
      out.push({
        code: "ALR-05",
        commessaId: c.id,
        severity: "danger",
        message: "First PDF deadline passed, nothing sent",
      });
    }
  }

  return out;
}

// React hook: all active alerts (derived)
export function useAllActiveAlerts(): AlertItem[] {
  const commesse = useCommesseStore((s) => s.commesse);
  const eventi = useEventiStore((s) => s.eventi);
  const correzioni = useCorrezioniStore((s) => s.correzioni);
  const minByC = new Map<string, number>();
  for (const cr of correzioni) {
    minByC.set(cr.commessaId, (minByC.get(cr.commessaId) ?? 0) + cr.minuti);
  }
  const out: AlertItem[] = [];
  for (const c of commesse) {
    out.push(
      ...alertsForCommessa(c, {
        eventi,
        minutiCorrezioni: minByC.get(c.id) ?? 0,
      }),
    );
  }
  return out;
}

export const ALERT_LABELS: Record<AlertCode, string> = {
  "ALR-01": "Corrections > 1h",
  "ALR-02": "Press proof not approved",
  "ALR-03": "Delivery overdue",
  "ALR-04": "Older than 3 months",
  "ALR-05": "First PDF overdue",
};
