import { Link, useNavigate } from "react-router-dom";
import { Commessa, Cliente } from "@/lib/types";
import { StatoCommessaPill, Pill } from "@/components/Pills";
import { JobProgressMini } from "@/components/JobProgressMini";
import { AlertItem } from "@/lib/alerts";
import { useUsersStore } from "@/lib/store";
import { fmtDate } from "@/lib/format";
import { AlertTriangle } from "lucide-react";

interface Props {
  commessa: Commessa;
  cliente?: Cliente;
  alerts?: AlertItem[];
}

function PresaInCaricoBadge({ c }: { c: Commessa }) {
  const users = useUsersStore((s) => s.users);
  if (!c.presaInCaricoDaUserId || !c.presaInCaricoIl) return null;
  const u = users.find((x) => x.id === c.presaInCaricoDaUserId);
  return (
    <div className="text-[11px] text-muted-foreground mt-0.5">
      Claimed by <span className="text-foreground font-medium">{u?.nome ?? "?"}</span>{" "}
      on {fmtDate(c.presaInCaricoIl)}
    </div>
  );
}

/** Reusable, fully clickable job row. */
export function CommessaRow({ commessa: c, cliente, alerts }: Props) {
  const navigate = useNavigate();
  return (
    <tr className="cursor-pointer" onClick={() => navigate(`/jobs/${c.id}`)}>
      <td>
        <Link
          to={`/jobs/${c.id}`}
          className="text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {c.numeroCommessa}
        </Link>
      </td>
      <td>{cliente?.nome ?? "—"}</td>
      <td className="text-muted-foreground">
        <div>{c.nomeLavoro}</div>
        <PresaInCaricoBadge c={c} />
      </td>
      <td>
        <StatoCommessaPill
          stato={c.stato}
          sospesa={!!c.sospensioneAttivaId}
          esitoProvaColore={c.esitoProvaColore}
        />
      </td>
      <td><JobProgressMini commessa={c} sospesa={!!c.sospensioneAttivaId} /></td>
      <td>
        {alerts && alerts.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span className="text-[12px] font-semibold tabular-nums">{alerts.length}</span>
          </span>
        ) : (
          <span className="text-muted-foreground text-[12px]">—</span>
        )}
      </td>
    </tr>
  );
}

/** "Slim" row without progress/alert columns (for dashboards). */
export function CommessaRowCompact({ commessa: c, cliente }: { commessa: Commessa; cliente?: Cliente }) {
  const navigate = useNavigate();
  return (
    <tr className="cursor-pointer" onClick={() => navigate(`/jobs/${c.id}`)}>
      <td>
        <Link
          to={`/jobs/${c.id}`}
          className="text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {c.numeroCommessa}
        </Link>
      </td>
      <td>{cliente?.nome ?? "—"}</td>
      <td className="text-muted-foreground">
        <div>{c.nomeLavoro}</div>
        <PresaInCaricoBadge c={c} />
      </td>
      <td>
        <StatoCommessaPill
          stato={c.stato}
          sospesa={!!c.sospensioneAttivaId}
          esitoProvaColore={c.esitoProvaColore}
        />
      </td>
    </tr>
  );
}

export function AlertBadge({ count, tone = "danger" }: { count: number; tone?: "danger" | "warning" }) {
  if (count === 0) return null;
  return <Pill tone={tone === "danger" ? "late" : "urgent"}>{count}</Pill>;
}
