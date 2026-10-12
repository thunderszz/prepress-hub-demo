import { useState } from "react";
import { Link } from "react-router-dom";
import { useCommesseStore } from "@/lib/store";
import { MetricCard } from "@/components/MetricCard";
import { Input } from "@/components/ui/input";
import {
  Card, CommesseMiniTable, DashHeader, KpiGrid, UltimiEventi,
  isSpedito, speditoQuestoMese, useClienteMap,
} from "./_shared";

export function DashboardAmministrazione() {
  const commesse = useCommesseStore((s) => s.commesse);
  const cliMap = useClienteMap();
  const [q, setQ] = useState("");

  const spedite = commesse.filter(isSpedito);
  const spMese = spedite.filter(speditoQuestoMese);
  const attive = commesse.filter((c) => !isSpedito(c) && !c.annullataIl);

  const ql = q.trim().toLowerCase();
  const matches = ql
    ? commesse.filter((c) => {
        const cli = cliMap.get(c.clienteId);
        return [
          c.numeroCommessa, c.nomeLavoro, c.stampatore, c.codStampatore,
          c.numeroOrdine, c.rifCliente, c.codArticolo, c.soggetto, cli?.nome,
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(ql));
      })
    : [];

  return (
    <div className="space-y-5 max-w-[1500px]">
      <DashHeader title="Administration Dashboard" subtitle="Shipping status and quick search" />

      <KpiGrid>
        <MetricCard label="Shipped (to invoice)" value={spedite.length} accent="primary" />
        <MetricCard label="Shipped this month" value={spMese.length} />
        <MetricCard label="Active" value={attive.length} />
      </KpiGrid>

      <Card title="Quick job search">
        <Input
          placeholder="Search number, customer, order…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {ql && (
          <div className="mt-3 text-[12px] text-muted-foreground">
            {matches.length} risultati
            <ul className="mt-2 space-y-1">
              {matches.slice(0, 10).map((c) => (
                <li key={c.id}>
                  <Link to={`/jobs/${c.id}`} className="text-primary hover:underline">
                    {c.numeroCommessa}
                  </Link>{" "}
                  — {cliMap.get(c.clienteId)?.nome} · {c.nomeLavoro}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card title="Recently shipped"><CommesseMiniTable commesse={spMese} /></Card>
      <Card title="Latest events"><UltimiEventi /></Card>
    </div>
  );
}
