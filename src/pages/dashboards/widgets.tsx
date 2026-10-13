// Building blocks of the role dashboards.

import { ReactNode, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCommesseStore, useEventiStore, useUsersStore } from "@/lib/store";
import { Commessa } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { CommessaRowCompact } from "@/components/CommessaRow";
import { AlertItem } from "@/lib/alerts";
import { fmtDateTime } from "@/lib/format";
import { useClienteMap } from "./metrics";

function useUserMap() {
  const users = useUsersStore((s) => s.users);
  return useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
}

export function DashHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">{children}</div>;
}

export function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-md">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="label-caps">{title}</div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function CommesseMiniTable({ commesse }: { commesse: Commessa[] }) {
  const cliMap = useClienteMap();
  if (commesse.length === 0) return <div className="text-[12px] text-muted-foreground">No jobs.</div>;
  return (
    <table className="data-table">
      <thead><tr><th>Number</th><th>Customer</th><th>Job</th><th>Status</th></tr></thead>
      <tbody>
        {commesse.slice(0, 10).map((c) => (
          <CommessaRowCompact key={c.id} commessa={c} cliente={cliMap.get(c.clienteId)} />
        ))}
      </tbody>
    </table>
  );
}

export function UltimiEventi({ limit = 8 }: { limit?: number }) {
  const eventi = useEventiStore((s) => s.eventi);
  const commesse = useCommesseStore((s) => s.commesse);
  const users = useUserMap();
  const [visibleCount, setVisibleCount] = useState(limit);
  const cIdx = useMemo(() => new Map(commesse.map((c) => [c.id, c])), [commesse]);
  const sorted = useMemo(
    () => [...eventi].sort((a, b) => b.data.localeCompare(a.data)),
    [eventi],
  );
  const items = sorted.slice(0, visibleCount);
  const hiddenCount = sorted.length - items.length;
  if (items.length === 0) return <div className="text-[12px] text-muted-foreground">No events.</div>;
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {items.map((e) => {
          const c = cIdx.get(e.commessaId);
          const u = e.userId ? users.get(e.userId) : null;
          return (
            <li key={e.id} className="flex items-start gap-3 text-[12px]">
              <div className="text-muted-foreground tabular-nums shrink-0 w-[110px]">{fmtDateTime(e.data)}</div>
              <div className="min-w-0 flex-1">
                <div className="truncate"><span className="font-medium">{e.titolo}</span>{e.dettaglio ? ` — ${e.dettaglio}` : ""}</div>
                {c && (
                  <div className="text-muted-foreground text-[11px]">
                    <Link to={`/jobs/${c.id}`} className="hover:underline">{c.numeroCommessa}</Link>
                    {u ? ` • ${u.nome}` : ""}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {hiddenCount > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <div className="text-[11px] text-muted-foreground tabular-nums">
            {items.length} of {sorted.length} events
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setVisibleCount((current) => Math.min(current + limit, sorted.length))}
          >
            Show more
          </Button>
        </div>
      )}
    </div>
  );
}

export function AlertList({ alerts }: { alerts: AlertItem[] }) {
  const commesse = useCommesseStore((s) => s.commesse);
  const cliMap = useClienteMap();
  if (alerts.length === 0) return <div className="text-[12px] text-muted-foreground">No active alerts.</div>;
  return (
    <ul className="space-y-2">
      {alerts.slice(0, 15).map((a, i) => {
        const c = commesse.find((x) => x.id === a.commessaId);
        const cli = c ? cliMap.get(c.clienteId) : null;
        return (
          <li key={i} className="text-[12px] flex items-start gap-2">
            <span className={`shrink-0 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${a.severity === "danger" ? "bg-status-late-bg text-status-late-fg" : "bg-status-urgent-bg text-status-urgent-fg"}`}>
              {a.code}
            </span>
            <div className="min-w-0 flex-1">
              {c ? <Link to={`/jobs/${c.id}`} className="font-medium text-primary hover:underline">{c.numeroCommessa}</Link> : null}
              {cli && <span className="text-muted-foreground"> • {cli.nome}</span>}
              <div className="text-muted-foreground">{a.message}</div>
              {a.emailNotifica && <div className="text-[11px] text-warning">Notification to the Sales Manager (to be configured)</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
