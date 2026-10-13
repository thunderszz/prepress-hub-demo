// Lookups and job predicates shared by the role dashboards.

import { useMemo } from "react";
import {
  useAssegnatariStore,
  useClientiStore,
  useGruppiStore,
  useUtenteGruppiStore,
} from "@/lib/store";
import { Commessa } from "@/lib/types";
import { useAllActiveAlerts, AlertItem } from "@/lib/alerts";

export function useClienteMap() {
  const clienti = useClientiStore((s) => s.clienti);
  return useMemo(() => new Map(clienti.map((c) => [c.id, c])), [clienti]);
}

export function useAlertsMap() {
  const all = useAllActiveAlerts();
  return useMemo(() => {
    const m = new Map<string, AlertItem[]>();
    for (const a of all) {
      const arr = m.get(a.commessaId) ?? [];
      arr.push(a);
      m.set(a.commessaId, arr);
    }
    return { all, byCommessa: m };
  }, [all]);
}

export const isSpedito = (c: Commessa) => c.stato === "spedito";
export const isSospesa = (c: Commessa) => !!c.sospensioneAttivaId;

export function speditoQuestoMese(c: Commessa): boolean {
  if (!isSpedito(c) || !c.speditaIl) return false;
  const now = new Date();
  const d = new Date(c.speditaIl);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}
export function speditoOggi(c: Commessa): boolean {
  if (!isSpedito(c) || !c.speditaIl) return false;
  const now = new Date();
  const d = new Date(c.speditaIl);
  return d.toDateString() === now.toDateString();
}
export const inRitardo = (c: Commessa): boolean =>
  !!c.dataConsegnaPrevista &&
  new Date(c.dataConsegnaPrevista).getTime() < Date.now() &&
  !isSpedito(c) &&
  !isSospesa(c);

export const daAssegnare = (c: Commessa, assUserIdByCommessa: Map<string, number>): boolean =>
  c.stato === "disponibile" && (assUserIdByCommessa.get(c.id) ?? 0) === 0;

/** Number of assignees per job. */
export function useAssegnatariCount() {
  const ass = useAssegnatariStore((s) => s.assegnatari);
  return useMemo(() => {
    const m = new Map<string, number>();
    for (const a of ass) m.set(a.commessaId, (m.get(a.commessaId) ?? 0) + 1);
    return m;
  }, [ass]);
}

export function useGruppiInfo() {
  const gruppi = useGruppiStore((s) => s.gruppi);
  const utenteGruppi = useUtenteGruppiStore((s) => s.utenteGruppi);
  return useMemo(() => {
    const membriDelGruppo = new Map<string, Set<string>>();
    for (const g of gruppi) membriDelGruppo.set(g.id, new Set());
    for (const m of utenteGruppi) membriDelGruppo.get(m.gruppoId)?.add(m.userId);
    const gruppoDiUtente = new Map<string, string[]>();
    for (const m of utenteGruppi) {
      const arr = gruppoDiUtente.get(m.userId) ?? [];
      arr.push(m.gruppoId);
      gruppoDiUtente.set(m.userId, arr);
    }
    return { gruppi, membriDelGruppo, gruppoDiUtente };
  }, [gruppi, utenteGruppi]);
}
