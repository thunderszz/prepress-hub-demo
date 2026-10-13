import { useCommesseStore, useCurrentSession } from "@/lib/store";
import { MetricCard } from "@/components/MetricCard";
import { Button } from "@/components/ui/button";
import {
  Card, CommesseMiniTable, DashHeader, KpiGrid,
  speditoOggi, speditoQuestoMese, useClienteMap,
} from "./_shared";
import { advanceTo } from "@/lib/workflowActions";
import { toast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

export function DashboardControlloQualita() {
  const commesse = useCommesseStore((s) => s.commesse);
  const cliMap = useClienteMap();
  const session = useCurrentSession();

  const daSpedire = commesse.filter((c) => c.stato === "in_produzione_matrice");
  const speditoOggiList = commesse.filter((c) => speditoOggi(c));
  const speditoMese = commesse.filter(speditoQuestoMese).length;

  const marca = (id: string) => {
    if (!session) return;
    const res = advanceTo(id, session.userId, "spedito") as { ok: boolean; reason?: string };
    if (res.ok) {
      toast({ title: "Job marked as shipped" });
    } else {
      toast({ title: "Action not possible", description: res.reason, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5 max-w-[1300px]">
      <DashHeader title="Quality Control Dashboard" subtitle="Shipping and final checks" />
      <KpiGrid>
        <MetricCard label="Ready to ship" value={daSpedire.length} accent="primary" />
        <MetricCard label="Shipped today" value={speditoOggiList.length} />
        <MetricCard label="Shipped this month" value={speditoMese} />
      </KpiGrid>

      <Card title="To ship">
        {daSpedire.length === 0 ? (
          <div className="text-[12px] text-muted-foreground">No jobs ready.</div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Number</th><th>Customer</th><th>Job</th><th></th></tr></thead>
            <tbody>
              {daSpedire.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/jobs/${c.id}`} className="text-primary hover:underline">{c.numeroCommessa}</Link>
                  </td>
                  <td>{cliMap.get(c.clienteId)?.nome}</td>
                  <td className="text-muted-foreground">{c.nomeLavoro}</td>
                  <td className="text-right">
                    <Button size="sm" onClick={() => marca(c.id)}>Mark shipped</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Recently shipped"><CommesseMiniTable commesse={speditoOggiList} /></Card>
    </div>
  );
}
