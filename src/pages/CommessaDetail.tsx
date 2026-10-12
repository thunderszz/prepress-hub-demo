import { useParams, Link } from "react-router-dom";
import {
  useCommesseStore,
  useClientiStore,
  useAssegnatariStore,
  useUsersStore,
  useSospensioniStore,
  useCurrentSession,
} from "@/lib/store";
import { StatoCommessaPill } from "@/components/Pills";
import { JobMetroMap } from "@/components/JobMetroMap";
import { WorkflowActions } from "@/components/WorkflowActions";
import { EventiTimeline } from "@/components/EventiTimeline";
import { FileTab } from "@/components/FileTab";
import { TempiTab } from "@/components/TempiTab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { isFullAccess } from "@/lib/permissions";
import {
  ESITO_CADUTA_LABELS,
  ESITO_PROVA_COLORE_LABELS,
  MOTIVO_SOSPENSIONE_LABELS,
} from "@/lib/types";
import { fmtDate, fmtDateTime } from "@/lib/format";

export default function CommessaDetail() {
  const { id } = useParams();
  const commessa = useCommesseStore((s) => s.commesse.find((c) => c.id === id));
  const setPatch = useCommesseStore((s) => s.setPatch);
  const clienti = useClientiStore((s) => s.clienti);
  const assegnatari = useAssegnatariStore((s) => s.assegnatari);
  const users = useUsersStore((s) => s.users);
  const session = useCurrentSession();
  const sospensioneAttiva = useSospensioniStore((s) =>
    commessa?.sospensioneAttivaId
      ? s.sospensioni.find((x) => x.id === commessa.sospensioneAttivaId)
      : undefined,
  );

  if (!commessa) {
    return (
      <div className="space-y-3">
        <Link to="/jobs" className="text-primary text-[13px]">← Jobs</Link>
        <h1>Job not found</h1>
      </div>
    );
  }

  const cliente = clienti.find((c) => c.id === commessa.clienteId);
  const assegnati = assegnatari
    .filter((a) => a.commessaId === commessa.id)
    .map((a) => users.find((u) => u.id === a.userId)?.nome ?? "?");
  const presaInCarico = commessa.presaInCaricoDaUserId
    ? users.find((u) => u.id === commessa.presaInCaricoDaUserId)?.nome
    : undefined;

  return (
    <div className="space-y-5 max-w-[1400px]">
      <Link to="/jobs" className="text-primary text-[13px]">← Jobs</Link>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[12px] text-muted-foreground tabular-nums">{commessa.numeroCommessa}</div>
          <h1>{commessa.nomeLavoro}</h1>
          <div className="text-[13px] text-muted-foreground">{cliente?.nome ?? "—"}</div>
        </div>
        <StatoCommessaPill
          stato={commessa.stato}
          sospesa={!!commessa.sospensioneAttivaId}
          esitoProvaColore={commessa.esitoProvaColore}
        />
      </div>

      {sospensioneAttiva && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-[13px]">
          <span className="font-semibold">On hold</span> — {MOTIVO_SOSPENSIONE_LABELS[sospensioneAttiva.motivo]}
          {sospensioneAttiva.nota && <> · {sospensioneAttiva.nota}</>}
          <span className="text-muted-foreground"> · since {fmtDateTime(sospensioneAttiva.apertaIl)}</span>
        </div>
      )}

      <section className="bg-card border border-border rounded-md p-5">
        <div className="label-caps mb-3">Workflow</div>
        <JobMetroMap commessa={commessa} sospesa={!!commessa.sospensioneAttivaId} />
      </section>

      <Tabs defaultValue="panoramica" className="space-y-4">
        <TabsList>
          <TabsTrigger value="panoramica">Overview</TabsTrigger>
          <TabsTrigger value="file">Files</TabsTrigger>
          <TabsTrigger value="tempi">Time</TabsTrigger>
          <TabsTrigger value="storico">History</TabsTrigger>
        </TabsList>

        <TabsContent value="panoramica" className="space-y-5">
          <WorkflowActions commessa={commessa} />

          <section className="bg-card border border-border rounded-md p-5 space-y-2 text-[13px]">
            <div className="label-caps mb-2">Data synced from the ERP</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-1.5">
              <Row k="Job number" v={commessa.numeroCommessa} />
              <Row k="Customer" v={cliente?.nome ?? "—"} />
              <Row k="Printer" v={commessa.stampatore} />
              <Row k="Printer code" v={commessa.codStampatore} />
              <Row k="Artwork variant" v={commessa.soggetto} />
              <Row k="Variant code" v={commessa.codSoggetto} />
              <Row k="Customer ref." v={commessa.rifCliente} />
              <Row k="Item code" v={commessa.codArticolo} />
              <Row k="Order no." v={commessa.numeroOrdine} />
              <Row k="RePro operator" v={commessa.operatoreRePro} />
            </div>
          </section>

          <section className="bg-card border border-border rounded-md p-5 space-y-2 text-[13px]">
            <div className="label-caps mb-2">Work status</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-1.5">
              <Row k="Assignees" v={assegnati.length ? assegnati.join(", ") : "—"} />
              <Row k="Claimed by" v={presaInCarico ?? "—"} />
              <Row
                k="Claimed on"
                v={commessa.presaInCaricoIl ? fmtDateTime(commessa.presaInCaricoIl) : "—"}
              />
              <Row k="PDF revisions" v={String(commessa.revisioniPdf)} />
              <Row
                k="Colour proof outcome"
                v={commessa.esitoProvaColore ? ESITO_PROVA_COLORE_LABELS[commessa.esitoProvaColore] : "—"}
              />
              <Row
                k="Press proof outcome"
                v={commessa.esitoCaduta ? ESITO_CADUTA_LABELS[commessa.esitoCaduta] : "—"}
              />
              <div className="flex gap-3">
                <span className="text-muted-foreground min-w-[160px]">Expected delivery</span>
                {session && isFullAccess(session.role) ? (
                  <Input
                    type="date"
                    className="h-7 w-[200px] py-0 text-[13px]"
                    value={commessa.dataConsegnaPrevista ? commessa.dataConsegnaPrevista.slice(0, 10) : ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPatch(commessa.id, {
                        dataConsegnaPrevista: v ? new Date(v + "T00:00:00").toISOString() : undefined,
                      });
                    }}
                  />
                ) : (
                  <span>{commessa.dataConsegnaPrevista ? fmtDate(commessa.dataConsegnaPrevista) : "—"}</span>
                )}
              </div>
            </div>
            {commessa.noteInterne && (
              <div className="pt-2 mt-2 border-t border-border">
                <div className="label-caps mb-1">Internal notes</div>
                <div className="text-muted-foreground whitespace-pre-wrap">{commessa.noteInterne}</div>
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="file">
          <FileTab commessa={commessa} />
        </TabsContent>

        <TabsContent value="tempi">
          <TempiTab commessa={commessa} />
        </TabsContent>

        <TabsContent value="storico">
          <EventiTimeline commessaId={commessa.id} />
        </TabsContent>
      </Tabs>

    </div>
  );
}

function Row({ k, v }: { k: string; v?: string }) {
  return (
    <div className="flex gap-3">
      <span className="text-muted-foreground min-w-[160px]">{k}</span>
      <span>{v ?? "—"}</span>
    </div>
  );
}
