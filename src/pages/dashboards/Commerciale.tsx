import { useMemo } from "react";
import { useCommesseStore, useClientiStore } from "@/lib/store";
import { MetricCard } from "@/components/MetricCard";
import { isSpedito, speditoQuestoMese, useAlertsMap } from "./metrics";
import { AlertList, Card, CommesseMiniTable, DashHeader, KpiGrid } from "./widgets";

export function DashboardCommerciale() {
  const commesse = useCommesseStore((s) => s.commesse);
  const clienti = useClientiStore((s) => s.clienti);
  const { all } = useAlertsMap();

  const attive = commesse.filter((c) => !isSpedito(c) && !c.annullataIl);
  const inAttesa = commesse.filter(
    (c) => c.stato === "in_attesa_approvazione_pdf" ||
      c.stato === "in_attesa_prova_colore" ||
      c.stato === "in_attesa_approvazione_caduta",
  );
  const alr01 = all.filter((a) => a.code === "ALR-01");
  const spMese = commesse.filter(speditoQuestoMese).length;

  const perCliente = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of commesse) if (!isSpedito(c)) m.set(c.clienteId, (m.get(c.clienteId) ?? 0) + 1);
    return clienti
      .map((c) => ({ cliente: c, count: m.get(c.id) ?? 0 }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [commesse, clienti]);

  return (
    <div className="space-y-5 max-w-[1500px]">
      <DashHeader title="Sales Dashboard" subtitle="Job status and customer issues" />
      <KpiGrid>
        <MetricCard label="Active" value={attive.length} accent="primary" />
        <MetricCard label="Awaiting customer approval" value={inAttesa.length} />
        <MetricCard label="Corrections > 1h alerts" value={alr01.length} accent="danger" />
        <MetricCard label="Shipped this month" value={spMese} />
      </KpiGrid>

      <Card title="Waiting for customer"><CommesseMiniTable commesse={inAttesa} /></Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Corrections > 1h alerts">
          <AlertList alerts={alr01} />
        </Card>
        <Card title="Jobs by customer">
          <ul className="space-y-1.5 text-[13px]">
            {perCliente.map(({ cliente, count }) => (
              <li key={cliente.id} className="flex justify-between border-b border-border last:border-0 py-1">
                <span>{cliente.nome}</span>
                <span className="tabular-nums font-semibold">{count}</span>
              </li>
            ))}
            {perCliente.length === 0 && <li className="text-muted-foreground text-[12px]">No active jobs.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
