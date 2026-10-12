import { useMemo, useState } from "react";
import {
  useCommesseStore,
  useClientiStore,
  useAssegnatariStore,
  useUtenteGruppiStore,
  useGruppiStore,
  useCurrentUser,
} from "@/lib/store";
import { STATI, STATO_LABELS, StatoCommessa, Commessa } from "@/lib/types";
import { useAllActiveAlerts, ALERT_LABELS, AlertCode } from "@/lib/alerts";
import { CommessaRow } from "@/components/CommessaRow";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useNavigate } from "react-router-dom";
import { canCreateCommessa } from "@/lib/permissions";
import { NuovaCommessaDialog } from "@/components/NuovaCommessaDialog"; // MANUAL-MODE

type GraficoFilter = "all" | "mie" | "anche_mie";
type StatoFilter = StatoCommessa | "all";
type SospesaFilter = "all" | "si" | "no";
type AlertFilter = AlertCode | "all" | "any";

export default function Commesse() {
  const commesse = useCommesseStore((s) => s.commesse);
  const clienti = useClientiStore((s) => s.clienti);
  const assegnatari = useAssegnatariStore((s) => s.assegnatari);
  const utenteGruppi = useUtenteGruppiStore((s) => s.utenteGruppi);
  const gruppi = useGruppiStore((s) => s.gruppi);
  const user = useCurrentUser();
  const allAlerts = useAllActiveAlerts();

  const [stato, setStato] = useState<StatoFilter>("all");
  const [sospesa, setSospesa] = useState<SospesaFilter>("all");
  const [alertCode, setAlertCode] = useState<AlertFilter>("all");
  const [gruppoId, setGruppoId] = useState<string>("all");
  const [clienteId, setClienteId] = useState<string>("all");
  const [graficoFilter, setGraficoFilter] = useState<GraficoFilter>("all");

  const navigate = useNavigate();
  const [nuovaAperta, setNuovaAperta] = useState(false); // MANUAL-MODE
  const puoCreare =
    !!user && canCreateCommessa({ userId: user.id, role: user.ruolo });

  const alertsByCommessa = useMemo(() => {
    const m = new Map<string, typeof allAlerts>();
    for (const a of allAlerts) {
      const arr = m.get(a.commessaId) ?? [];
      arr.push(a);
      m.set(a.commessaId, arr);
    }
    return m;
  }, [allAlerts]);

  const userGruppiIds = useMemo(
    () => (user ? utenteGruppi.filter((x) => x.userId === user.id).map((x) => x.gruppoId) : []),
    [user, utenteGruppi],
  );

  const filtered: Commessa[] = useMemo(() => {
    const membriDelGruppo = (gid: string) =>
      new Set(utenteGruppi.filter((x) => x.gruppoId === gid).map((x) => x.userId));

    return commesse.filter((c) => {
      if (stato !== "all" && c.stato !== stato) return false;
      if (sospesa === "si" && !c.sospensioneAttivaId) return false;
      if (sospesa === "no" && c.sospensioneAttivaId) return false;
      if (clienteId !== "all" && c.clienteId !== clienteId) return false;

      if (gruppoId !== "all") {
        const membri = membriDelGruppo(gruppoId);
        const assOfC = assegnatari.filter((a) => a.commessaId === c.id);
        if (!assOfC.some((a) => membri.has(a.userId))) return false;
      }

      if (alertCode !== "all") {
        const list = alertsByCommessa.get(c.id) ?? [];
        if (alertCode === "any") {
          if (list.length === 0) return false;
        } else {
          if (!list.some((a) => a.code === alertCode)) return false;
        }
      }

      if (user?.ruolo === "grafico" && graficoFilter !== "all") {
        const assOfC = assegnatari.filter((a) => a.commessaId === c.id);
        const me = assOfC.some((a) => a.userId === user.id);
        if (graficoFilter === "mie" && !me) return false;
        if (graficoFilter === "anche_mie") {
          if (!me || assOfC.length < 2) return false;
        }
      }

      return true;
    });
  }, [
    commesse, stato, sospesa, alertCode, gruppoId, clienteId,
    graficoFilter, user, assegnatari, utenteGruppi, alertsByCommessa,
  ]);

  const resetFilters = () => {
    setStato("all"); setSospesa("all"); setAlertCode("all");
    setGruppoId("all"); setClienteId("all"); setGraficoFilter("all");
  };

  return (
    <div className="space-y-4 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <h1>Jobs</h1>
        <div className="flex items-center gap-3">
          <div className="text-[12px] text-muted-foreground tabular-nums">
            {filtered.length} of {commesse.length}
          </div>
          {puoCreare && (
            // MANUAL-MODE
            <Button size="sm" onClick={() => setNuovaAperta(true)}>
              New job
            </Button>
          )}
        </div>
      </div>

      {/* MANUAL-MODE */}
      <NuovaCommessaDialog
        open={nuovaAperta}
        onOpenChange={setNuovaAperta}
        onCreated={(id) => navigate(`/jobs/${id}`)}
      />

      <div className="bg-card border border-border rounded-md p-3 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Filter label="Status">
            <Select value={stato} onValueChange={(v) => setStato(v as StatoFilter)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {STATI.map((s) => <SelectItem key={s} value={s}>{STATO_LABELS[s]}</SelectItem>)}
              </SelectContent>
            </Select>
          </Filter>
          <Filter label="On hold">
            <Select value={sospesa} onValueChange={(v) => setSospesa(v as SospesaFilter)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="si">On hold only</SelectItem>
                <SelectItem value="no">Not on hold</SelectItem>
              </SelectContent>
            </Select>
          </Filter>
          <Filter label="Alert">
            <Select value={alertCode} onValueChange={(v) => setAlertCode(v as AlertFilter)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="any">With at least one alert</SelectItem>
                {(Object.keys(ALERT_LABELS) as AlertCode[]).map((k) => (
                  <SelectItem key={k} value={k}>{k} — {ALERT_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Filter>
          <Filter label="Team">
            <Select value={gruppoId} onValueChange={setGruppoId}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {gruppi.map((g) => <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </Filter>
          <Filter label="Customer">
            <Select value={clienteId} onValueChange={setClienteId}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {clienti.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </Filter>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          {user?.ruolo === "grafico" ? (
            <ToggleGroup
              type="single"
              value={graficoFilter}
              onValueChange={(v) => v && setGraficoFilter(v as GraficoFilter)}
              size="sm"
            >
              <ToggleGroupItem value="mie">Assigned to me only</ToggleGroupItem>
              <ToggleGroupItem value="anche_mie">Shared with me</ToggleGroupItem>
              <ToggleGroupItem value="all">All</ToggleGroupItem>
            </ToggleGroup>
          ) : (
            user && userGruppiIds.length > 0 && (
              <div className="text-[11px] text-muted-foreground">
                Visibility: all jobs (§4.6)
              </div>
            )
          )}
          <Button variant="ghost" size="sm" onClick={resetFilters}>Reset filters</Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Number</th>
              <th>Customer</th>
              <th>Job name</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Alert</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <CommessaRow
                key={c.id}
                commessa={c}
                cliente={clienti.find((x) => x.id === c.clienteId)}
                alerts={alertsByCommessa.get(c.id)}
              />
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted-foreground py-8">No jobs match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
