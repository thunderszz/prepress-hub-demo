import { useMemo } from "react";
import {
  useCommesseStore,
  useAssegnatariStore,
  useUsersStore,
  useUtenteGruppiStore,
} from "@/lib/store";
import { utentiAssegnabili } from "@/lib/permissions";
import { MetricCard } from "@/components/MetricCard";
import {
  useAlertsMap,
  useAssegnatariCount,
  useGruppiInfo,
  inRitardo,
  daAssegnare,
  isSpedito,
  isSospesa,
  speditoQuestoMese,
} from "./metrics";
import { AlertList, Card, CommesseMiniTable, DashHeader, KpiGrid, UltimiEventi } from "./widgets";

export function DashboardProduzione() {
  const commesse = useCommesseStore((s) => s.commesse);
  const assCount = useAssegnatariCount();
  const ass = useAssegnatariStore((s) => s.assegnatari);
  const users = useUsersStore((s) => s.users);
  const memberships = useUtenteGruppiStore((s) => s.utenteGruppi);
  const { gruppi, membriDelGruppo } = useGruppiInfo();
  const { all: alerts } = useAlertsMap();

  const kpi = useMemo(() => {
    const attive = commesse.filter((c) => !isSpedito(c) && !c.annullataIl).length;
    const ritardo = commesse.filter(inRitardo).length;
    const daAss = commesse.filter((c) => daAssegnare(c, assCount)).length;
    const spMese = commesse.filter((c) => speditoQuestoMese(c)).length;
    return { attive, ritardo, daAss, alertAperti: alerts.length, spMese };
  }, [commesse, assCount, alerts]);

  const sospese = commesse.filter(isSospesa);
  const daGestire = commesse.filter((c) => !isSpedito(c) && (inRitardo(c) || daAssegnare(c, assCount)));

  const caricoPerGruppo = useMemo(() => {
    return gruppi.map((g) => {
      const membri = membriDelGruppo.get(g.id) ?? new Set();
      const count = commesse.filter(
        (c) =>
          !isSpedito(c) &&
          ass.some((a) => a.commessaId === c.id && membri.has(a.userId)),
      ).length;
      return { gruppo: g, count };
    });
  }, [gruppi, membriDelGruppo, commesse, ass]);

  const caricoPerGrafico = useMemo(() => {
    return utentiAssegnabili(users, memberships)
      .map((u) => ({
        user: u,
        count: commesse.filter(
          (c) => !isSpedito(c) && ass.some((a) => a.commessaId === c.id && a.userId === u.id),
        ).length,
      }))
      .sort((a, b) => b.count - a.count);
  }, [users, memberships, commesse, ass]);

  return (
    <div className="space-y-5 max-w-[1500px]">
      <DashHeader title="Production Dashboard" subtitle="Overview of the prepress flow" />

      <KpiGrid>
        <MetricCard label="Active" value={kpi.attive} accent="primary" />
        <MetricCard label="Overdue" value={kpi.ritardo} accent="danger" />
        <MetricCard label="To assign" value={kpi.daAss} />
        <MetricCard label="Open alerts" value={kpi.alertAperti} accent="danger" />
        <MetricCard label="Shipped this month" value={kpi.spMese} />
      </KpiGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Workload by team">
          <ul className="space-y-1.5 text-[13px]">
            {caricoPerGruppo.map(({ gruppo, count }) => (
              <li key={gruppo.id} className="flex justify-between border-b border-border last:border-0 py-1">
                <span>{gruppo.nome}</span>
                <span className="tabular-nums font-semibold">{count}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Workload by designer">
          <ul className="space-y-1.5 text-[13px]">
            {caricoPerGrafico.map(({ user, count }) => (
              <li key={user.id} className="flex justify-between border-b border-border last:border-0 py-1">
                <span>{user.nome}</span>
                <span className="tabular-nums font-semibold">{count}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="To handle">
        <CommesseMiniTable commesse={daGestire} />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="On hold"><CommesseMiniTable commesse={sospese} /></Card>
        <Card title="Open alerts"><AlertList alerts={alerts} /></Card>
      </div>

      <Card title="Latest events"><UltimiEventi /></Card>
    </div>
  );
}
