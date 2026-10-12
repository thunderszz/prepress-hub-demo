import { useMemo } from "react";
import { useCommesseStore, useAssegnatariStore, useCurrentUser } from "@/lib/store";
import { MetricCard } from "@/components/MetricCard";
import {
  AlertList, Card, CommesseMiniTable, DashHeader, KpiGrid, useAlertsMap,
} from "./_shared";

export function DashboardGrafico() {
  const u = useCurrentUser();
  const commesse = useCommesseStore((s) => s.commesse);
  const ass = useAssegnatariStore((s) => s.assegnatari);
  const { all } = useAlertsMap();

  const data = useMemo(() => {
    if (!u) return { mie: [], condivise: [], inAttesaCliente: [], alertMie: [] };
    const mieIds = new Set(ass.filter((a) => a.userId === u.id).map((a) => a.commessaId));
    const mie = commesse.filter((c) => mieIds.has(c.id) && c.stato !== "spedito");
    const condivise = mie.filter((c) => ass.filter((a) => a.commessaId === c.id).length > 1);
    const inAttesaCliente = mie.filter(
      (c) =>
        c.stato === "in_attesa_approvazione_pdf" ||
        c.stato === "in_attesa_prova_colore" ||
        c.stato === "in_attesa_approvazione_caduta",
    );
    const alertMie = all.filter((a) => mieIds.has(a.commessaId));
    return { mie, condivise, inAttesaCliente, alertMie };
  }, [u, ass, commesse, all]);

  if (!u) return null;

  const inLavorazione = data.mie.filter((c) => c.stato === "in_lavorazione" || c.stato === "assegnata");

  return (
    <div className="space-y-5 max-w-[1500px]">
      <DashHeader title="Designer Dashboard" subtitle={`Your jobs, ${u.nome}`} />
      <KpiGrid>
        <MetricCard label="My jobs in progress" value={inLavorazione.length} accent="primary" />
        <MetricCard label="Shared with others" value={data.condivise.length} />
        <MetricCard label="Waiting for customer" value={data.inAttesaCliente.length} />
        <MetricCard label="Alerts on my jobs" value={data.alertMie.length} accent="danger" />
      </KpiGrid>

      <Card title="My jobs"><CommesseMiniTable commesse={data.mie} /></Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Shared with others"><CommesseMiniTable commesse={data.condivise} /></Card>
        <Card title="Waiting for customer"><CommesseMiniTable commesse={data.inAttesaCliente} /></Card>
      </div>
      <Card title="Alerts on my jobs"><AlertList alerts={data.alertMie} /></Card>
    </div>
  );
}
