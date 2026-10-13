import { useMemo, useState } from "react";
import {
  useEventiStore,
  useUsersStore,
  useCurrentSession,
  useAssegnatariStore,
  useEmailStore,
  useCommesseStore,
  useClientiStore,
} from "@/lib/store";
import { fmtDateTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { aggiungiNotaInterna, aggiungiNotaSottopassaggio } from "@/lib/workflowActions";
import { canAddNotaSottopassaggio, canEditWorkflow } from "@/lib/permissions";
import { toast } from "@/hooks/use-toast";
import { Evento, EventoTipo } from "@/lib/types";
import { ChevronDown, ChevronRight, FileDown, Mail, MailWarning } from "lucide-react";
import { flushPendingWrites } from "@/lib/supabaseWrites";
import { reloadFromSupabase } from "@/lib/supabaseData";

interface Props {
  commessaId: string;
}

const TIPO_STYLE: Partial<Record<EventoTipo, { dot: string; badge?: string; label?: string }>> = {
  nota_interna: { dot: "bg-primary/60", badge: "border-primary/40 text-primary bg-primary/10", label: "Internal note" },
  nota_sottopassaggio: {
    dot: "bg-accent",
    badge: "border-accent/50 text-accent-foreground bg-accent/20",
    label: "Handover",
  },
  forzatura: {
    dot: "bg-warning",
    badge: "border-warning/40 text-warning bg-warning/10",
    label: "Override",
  },
  sospensione: { dot: "bg-warning" },
  spedizione: { dot: "bg-success" },
  invio_pdf: { dot: "bg-primary", badge: "border-primary/40 text-primary bg-primary/10", label: "Email" },
  invio_prova_colore: { dot: "bg-primary", badge: "border-primary/40 text-primary bg-primary/10", label: "Email" },
  invio_caduta: { dot: "bg-primary", badge: "border-primary/40 text-primary bg-primary/10", label: "Email" },
};

const EMAIL_EVENTS: EventoTipo[] = ["invio_pdf", "invio_prova_colore", "invio_caduta"];

function dotFor(e: Evento) {
  return TIPO_STYLE[e.tipo]?.dot ?? "bg-muted-foreground/50";
}

export function EventiTimeline({ commessaId }: Props) {
  const allEventi = useEventiStore((s) => s.eventi);
  const users = useUsersStore((s) => s.users);
  const emailInviate = useEmailStore((s) => s.emailInviate);
  const session = useCurrentSession();
  const assegnatari = useAssegnatariStore((s) => s.assegnatari);
  const eventi = useMemo(
    () => allEventi.filter((e) => e.commessaId === commessaId),
    [allEventi, commessaId],
  );
  const commessa = useCommesseStore((s) => s.commesse.find((c) => c.id === commessaId));
  const cliente = useClientiStore((s) =>
    s.clienti.find((c) => c.id === commessa?.clienteId),
  );
  const [notaInt, setNotaInt] = useState("");
  const [notaSp, setNotaSp] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const canSottopassaggio = session
      ? canAddNotaSottopassaggio(
          session,
        { id: commessaId },
          assegnatari,
        )
    : false;
  const canNotaInterna = session
    ? canEditWorkflow(session, { id: commessaId }, assegnatari)
    : false;

  return (
    <section className="bg-card border border-border rounded-md p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div className="label-caps">History</div>
        {commessa && (
          <Button
            size="sm"
            variant="outline"
            disabled={eventi.length === 0}
            onClick={async () => {
              // jsPDF is large: load it only when someone exports.
              const { exportStoricoPdf } = await import("@/lib/storicoPdf");
              exportStoricoPdf({ commessa, cliente, eventi, users, emailInviate });
            }}
          >
            <FileDown className="h-4 w-4" /> Export PDF
          </Button>
        )}
      </div>

      {session && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-[12px] text-muted-foreground">Internal note</div>
            <Textarea
              value={notaInt}
              onChange={(e) => setNotaInt(e.target.value)}
              placeholder="General operational note…"
              rows={2}
              disabled={!canNotaInterna}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={!canNotaInterna || !notaInt.trim()}
                onClick={async () => {
                  const r = aggiungiNotaInterna(commessaId, session.userId, notaInt);
                  if (r.ok) {
                    try {
                      await flushPendingWrites();
                      toast({ title: "Internal note added" });
                      setNotaInt("");
                    } catch (error) {
                      toast({
                        title: "Note not saved",
                        description: error instanceof Error ? error.message : "The database rejected the note.",
                        variant: "destructive",
                      });
                      void reloadFromSupabase();
                    }
                  } else {
                    toast({ title: "Note not allowed", description: (r as { reason?: string }).reason, variant: "destructive" });
                  }
                }}
              >
                Add internal note
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[12px] text-muted-foreground">
              Handover note
              <span className="ml-1 text-[11px] opacity-70">(when another designer takes over)</span>
            </div>
            <Textarea
              value={notaSp}
              onChange={(e) => setNotaSp(e.target.value)}
              placeholder="What the next designer needs to know…"
              rows={2}
              disabled={!canSottopassaggio}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                disabled={!canSottopassaggio || !notaSp.trim()}
                onClick={async () => {
                  const r = aggiungiNotaSottopassaggio(commessaId, session.userId, notaSp);
                  if (r.ok) {
                    try {
                      await flushPendingWrites();
                      toast({ title: "Handover note added" });
                      setNotaSp("");
                    } catch (error) {
                      toast({
                        title: "Note not saved",
                        description: error instanceof Error ? error.message : "The database rejected the note.",
                        variant: "destructive",
                      });
                      void reloadFromSupabase();
                    }
                  }
                }}
              >
                Add handover note
              </Button>
            </div>
          </div>
        </div>
      )}

      <ol className="space-y-3">
        {eventi.length === 0 && (
          <li className="text-[12px] text-muted-foreground">No events recorded.</li>
        )}
        {eventi.map((e) => {
          const u = e.userId ? users.find((x) => x.id === e.userId) : null;
          const style = TIPO_STYLE[e.tipo];
          const isEmail = EMAIL_EVENTS.includes(e.tipo);
          const email = isEmail && e.refType === "email" && e.refId
            ? emailInviate.find((m) => m.id === e.refId)
            : undefined;
          const isOpen = !!expanded[e.id];
          const errore = email?.stato === "errore";
          return (
            <li key={e.id} className="flex gap-3">
              <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${dotFor(e)}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-medium">{e.titolo}</span>
                  {style?.label && (
                    <span
                      className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border ${style.badge}`}
                    >
                      {style.label}
                    </span>
                  )}
                  {errore && (
                    <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-destructive/40 text-destructive bg-destructive/10">
                      Error
                    </span>
                  )}
                  {email && (
                    <button
                      onClick={() => setExpanded((s) => ({ ...s, [e.id]: !isOpen }))}
                      className="ml-auto text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                    >
                      {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      {isOpen ? "Hide" : "Show email"}
                    </button>
                  )}
                </div>
                {e.dettaglio && (
                  <div className="text-[12px] text-muted-foreground whitespace-pre-wrap">
                    {e.dettaglio}
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  {fmtDateTime(e.data)}
                  {u && <> · {u.nome}</>}
                </div>

                {email && isOpen && (
                  <div className="mt-2 border border-border rounded-md bg-muted/30 p-3 space-y-1.5 text-[12px]">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      {errore ? <MailWarning className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
                      <span className="uppercase tracking-wide text-[10px]">
                        {errore ? "Email — error" : "Email sent"}
                      </span>
                    </div>
                    <KV k="From" v={email.mittente} />
                    <KV k="To" v={email.destinatari.join(", ")} />
                    {email.cc && email.cc.length > 0 && <KV k="CC" v={email.cc.join(", ")} />}
                    <KV k="Subject" v={email.oggetto} />
                    {email.allegatoNome && (
                      <KV
                        k="Attachment"
                        v={
                          email.allegatoDisponibile === false
                            ? `${email.allegatoNome} (no longer available)`
                            : email.allegatoNome
                        }
                      />
                    )}
                    <div className="pt-1.5 border-t border-border whitespace-pre-wrap text-foreground">
                      {email.corpo || <span className="text-muted-foreground">(empty body)</span>}
                    </div>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground min-w-[68px]">{k}</span>
      <span className="break-all">{v}</span>
    </div>
  );
}
