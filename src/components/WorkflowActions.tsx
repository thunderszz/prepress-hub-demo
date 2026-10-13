import { useEffect, useState } from "react";
import {
  Commessa,
  EmailTemplateKind,
  EsitoCaduta,
  EsitoProvaColore,
  ESITI_CADUTA,
  ESITI_PROVA_COLORE,
  ESITO_CADUTA_LABELS,
  ESITO_PROVA_COLORE_LABELS,
  MOTIVI_SOSPENSIONE,
  MOTIVO_SOSPENSIONE_LABELS,
  MotivoSospensione,
  STATI,
  STATO_LABELS,
  StatoCommessa,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useCurrentSession, useAssegnatariStore } from "@/lib/store";
import {
  canAssegnare,
  canEditWorkflow,
  canForzaturaSpedito,
  canForzaturaStep,
  canMarkShipped,
  canPrendiInCarico,
  canSospendere,
} from "@/lib/permissions";
import {
  advanceTo,
  assegnaCommessa,
  modificaAssegnazione,
  prendiInCarico,
  registraWeTransfer,
  riattivaCommessa,
  setEsitoCaduta,
  setEsitoProvaColore,
  sospendiCommessa,
  transitionsFor,
} from "@/lib/workflowActions";
import { AssegnaDialog } from "@/components/AssegnaDialog";
import { EmailWizardDialog } from "@/components/EmailWizardDialog";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, Mail, PauseCircle, Play, Send, UserPlus } from "lucide-react";
import { flushPendingWrites } from "@/lib/supabaseWrites";
import { reloadFromSupabase } from "@/lib/supabaseData";

interface Props {
  commessa: Commessa;
}

export function WorkflowActions({ commessa }: Props) {
  const session = useCurrentSession();
  const assegnatari = useAssegnatariStore((s) => s.assegnatari);
  const [sospendiOpen, setSospendiOpen] = useState(false);
  const [forzaturaTarget, setForzaturaTarget] = useState<StatoCommessa | null>(null);
  const [assegnaOpen, setAssegnaOpen] = useState<null | "assegna" | "modifica">(null);
  const [wtOpen, setWtOpen] = useState(false);
  const [wtNota, setWtNota] = useState("");
  const [wtAvanza, setWtAvanza] = useState(false);
  const [provaColoreModifica, setProvaColoreModifica] = useState(false);
  const [emailOpen, setEmailOpen] = useState<null | {
    kind: EmailTemplateKind;
    advanceState?: StatoCommessa;
  }>(null);

  if (!session) return null;

  const sospesa = !!commessa.sospensioneAttivaId;
  const allTransitions = transitionsFor(commessa.id);
  // Send transitions (PDF / press proof) open the email wizard instead of advancing directly.
  const transitions = allTransitions.filter(
    (t) => t.eventoTipo !== "invio_pdf" && t.eventoTipo !== "invio_caduta",
  );
  const emailTransitions = allTransitions.filter(
    (t) => t.eventoTipo === "invio_pdf" || t.eventoTipo === "invio_caduta",
  );
  const provaColoreRegistrata =
    commessa.esitoProvaColore === "non_serve" || commessa.esitoProvaColore === "spedita_approvata";
  const canEdit = canEditWorkflow(session, commessa, assegnatari);
  const canShip = canMarkShipped(session);
  const canPrendi = canPrendiInCarico(session, commessa, assegnatari);
  const canSosp = canSospendere(session, commessa, assegnatari);
  const canAssegna = canAssegnare(session);
  // WeTransfer replaces the email for heavy files: if the
  // current status has an unblocked "send" transition, advancing the step
  // is offered with an explicit confirmation (checkbox).
  const wtTransition = canEdit
    ? allTransitions.find(
        (t) => (t.eventoTipo === "invio_pdf" || t.eventoTipo === "invio_caduta") && !t.blockedReason,
      )
    : undefined;
  const canForzaStep = canForzaturaStep(session, commessa, assegnatari);
  const canForzaSpedito = canForzaturaSpedito(session);
  const stepIsShipping = commessa.stato === "in_produzione_matrice";
  const nextForzaturaTarget = STATI[Math.min(STATI.indexOf(commessa.stato) + 1, STATI.length - 1)];
  const forzaturaTargets = STATI.filter(
    (s) => s !== commessa.stato && (s !== "spedito" || canForzaSpedito),
  );
  const canOpenForzaStep =
    canForzaStep
    && commessa.stato !== "spedito"
    && nextForzaturaTarget !== "spedito"
    && forzaturaTargets.length > 0;

  const run = async (label: string, res: { ok: boolean; reason?: string; needsForzatura?: boolean }, target?: StatoCommessa) => {
    if (res.ok) {
      try {
        await flushPendingWrites();
        toast({ title: label });
      } catch (error) {
        toast({
          title: "Change not saved",
          description: error instanceof Error ? error.message : "The database rejected the change.",
          variant: "destructive",
        });
        // the UI updated optimistically: re-sync with the real DB
        void reloadFromSupabase();
      }
    } else {
      if (res.needsForzatura && target) {
        setForzaturaTarget(target);
        toast({ title: "Override required", description: res.reason, variant: "destructive" });
      } else {
        toast({ title: "Action not possible", description: res.reason, variant: "destructive" });
      }
    }
  };

  return (
    <section className="bg-card border border-border rounded-md p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="label-caps">Workflow actions</div>
        {sospesa && (
          <span className="text-[12px] text-warning flex items-center gap-1">
            <PauseCircle className="h-3.5 w-3.5" /> Job on hold
          </span>
        )}
      </div>

      {!canEdit && !canShip && !canPrendi && !canAssegna && (
        <p className="text-[12px] text-muted-foreground">
          No actions available for your role on this job.
        </p>
      )}

      {/* First assignment */}
      {commessa.stato === "disponibile" && canAssegna && (
        <div>
          <Button onClick={() => setAssegnaOpen("assegna")}>
            <UserPlus className="h-4 w-4" /> Assign to designers
          </Button>
        </div>
      )}

      {/* Change the assignees while the job is active */}
      {(commessa.stato === "assegnata" || commessa.stato === "in_lavorazione") && canAssegna && (
        <div>
          <Button variant="outline" onClick={() => setAssegnaOpen("modifica")}>
            <UserPlus className="h-4 w-4" /> Change assignment
          </Button>
        </div>
      )}

      {/* Take ownership (only if assigned and not claimed yet) */}
      {commessa.stato === "assegnata" && (
        <div>
          <Button
            disabled={!canPrendi || sospesa}
            onClick={() => void run("Job claimed", prendiInCarico(commessa.id, session.userId))}
          >
            Take ownership
          </Button>
        </div>
      )}

      {/* Contextual outcomes */}
      {commessa.stato === "in_attesa_prova_colore" && canEdit && (
        provaColoreRegistrata && !provaColoreModifica ? (
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <span>
              Colour proof: {ESITO_PROVA_COLORE_LABELS[commessa.esitoProvaColore as EsitoProvaColore]}
            </span>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-[12px]"
              onClick={() => setProvaColoreModifica(true)}
            >
              Change
            </Button>
          </div>
        ) : (
          <EsitoBlock
            label="Colour proof outcome"
            value={commessa.esitoProvaColore}
            options={ESITI_PROVA_COLORE.map((v) => ({ value: v, label: ESITO_PROVA_COLORE_LABELS[v] }))}
            onChange={(v) => {
              setProvaColoreModifica(false);
              void run("Colour proof outcome recorded", setEsitoProvaColore(commessa.id, session.userId, v as EsitoProvaColore));
            }}
          />
        )
      )}
      {commessa.stato === "in_attesa_approvazione_caduta" && canEdit && (
        <EsitoBlock
          label="Press proof outcome"
          value={commessa.esitoCaduta}
          options={ESITI_CADUTA.map((v) => ({ value: v, label: ESITO_CADUTA_LABELS[v] }))}
          onChange={(v) => void run("Press proof outcome recorded", setEsitoCaduta(commessa.id, session.userId, v as EsitoCaduta))}
        />
      )}

      {/* WeTransfer replaces the email for heavy files: it only records an event.
          Visible only in statuses that start a send (PDF / colour proof / press proof). */}
      {canEdit
        && (commessa.stato === "in_lavorazione" || commessa.stato === "in_attesa_prova_colore")
        && (
          <div>
            <Button variant="outline" disabled={sospesa} onClick={() => setWtOpen(true)}>
              <Send className="h-4 w-4" /> Log WeTransfer delivery
            </Button>
          </div>
        )}

      {/* Email to the customer (PDF / colour proof / press proof): attachment picked from the files in the Files tab */}
      {canEdit && (commessa.stato === "in_attesa_prova_colore" || emailTransitions.length > 0) && (
        <div className="space-y-2">
          <div className="text-[12px] text-muted-foreground">Send email</div>
          <div className="flex flex-wrap gap-2">
            {commessa.stato === "in_attesa_prova_colore" && !provaColoreRegistrata && (
              <Button
                variant="outline"
                disabled={sospesa}
                onClick={() => setEmailOpen({ kind: "prova_colore" })}
              >
                <Mail className="h-4 w-4" /> Send colour proof
              </Button>
            )}
            {emailTransitions.map((t) => (
              <Button
                key={t.to + ":" + t.eventoTipo}
                variant="outline"
                disabled={sospesa || !!t.blockedReason}
                title={t.blockedReason}
                onClick={() =>
                  setEmailOpen({
                    kind: t.eventoTipo === "invio_pdf" ? "pdf" : "caduta",
                    advanceState: t.to,
                  })
                }
              >
                <Mail className="h-4 w-4" />
                {t.label}
              </Button>
            ))}
          </div>
          {emailTransitions.some((t) => t.blockedReason) && (
            <p className="text-[11px] text-warning flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {emailTransitions.find((t) => t.blockedReason)!.blockedReason}
            </p>
          )}
        </div>
      )}

      {/* Natural transitions */}
      {transitions.length > 0 && (canEdit || (stepIsShipping && canShip)) && (
        <div className="space-y-2">
          <div className="text-[12px] text-muted-foreground">Advance workflow</div>
          <div className="flex flex-wrap gap-2">
            {transitions.map((t) => {
              const allowed =
                t.to === "spedito" ? canShip : (canEdit || (t.to === "in_lavorazione" && canPrendi));
              const disabled = sospesa || !allowed || !!t.blockedReason || commessa.stato === "assegnata";
              return (
                <Button
                  key={t.to + ":" + t.eventoTipo}
                  variant={t.to === "in_lavorazione" ? "outline" : "default"}
                  disabled={disabled}
                  title={t.blockedReason}
                  onClick={() => void run(t.label, advanceTo(commessa.id, session.userId, t.to), t.to)}
                >
                  {t.label}
                </Button>
              );
            })}
          </div>
          {transitions.some((t) => t.blockedReason) && (
            <p className="text-[11px] text-warning flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {transitions.find((t) => t.blockedReason)!.blockedReason}
            </p>
          )}
        </div>
      )}

      {/* Hold */}
      {canSosp && (
        <div className="pt-2 border-t border-border flex items-center gap-2">
          {sospesa ? (
            <Button
              variant="outline"
              onClick={() => void run("Job resumed", riattivaCommessa(commessa.id, session.userId))}
            >
              <Play className="h-4 w-4" /> Resume
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setSospendiOpen(true)}>
              <PauseCircle className="h-4 w-4" /> Put on hold
            </Button>
          )}

          {canOpenForzaStep && (
            <Button variant="ghost" onClick={() => setForzaturaTarget(nextForzaturaTarget)}>
              Override step…
            </Button>
          )}
        </div>
      )}

      {canForzaSpedito && commessa.stato !== "spedito" && commessa.stato !== "in_produzione_matrice" && (
        <div className="pt-2 border-t border-border">
          <Button variant="outline" onClick={() => setForzaturaTarget("spedito")}>
            <AlertTriangle className="h-4 w-4" /> Force shipped…
          </Button>
        </div>
      )}

      <SospendiDialog
        open={sospendiOpen}
        onOpenChange={setSospendiOpen}
        onConfirm={(motivo, nota) => {
          const res = sospendiCommessa(commessa.id, session.userId, motivo, nota);
          void run("Job put on hold", res);
          setSospendiOpen(false);
        }}
      />

      <ForzaturaDialog
        commessaStato={commessa.stato}
        allowedTargets={forzaturaTargets}
        target={forzaturaTarget}
        onCancel={() => setForzaturaTarget(null)}
        onConfirm={(to, nota) => {
          const res = advanceTo(commessa.id, session.userId, to, { forzaturaNota: nota });
          void run("Status overridden", res);
          setForzaturaTarget(null);
        }}
      />

      <Dialog open={wtOpen} onOpenChange={setWtOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log WeTransfer delivery</DialogTitle>
            <DialogDescription>
              No file is uploaded: the event is recorded in the history.
              {wtTransition && " If this delivery completes the step, tick the advance option."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Note (optional): recipient, link reference…"
            rows={3}
            value={wtNota}
            onChange={(e) => setWtNota(e.target.value)}
          />
          {wtTransition && (
            <label className="flex items-start gap-2 text-[13px] cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 accent-primary"
                checked={wtAvanza}
                onChange={(e) => setWtAvanza(e.target.checked)}
              />
              <span>
                Move the job to <b>{STATO_LABELS[wtTransition.to]}</b>
                <span className="block text-[11px] text-muted-foreground">
                  The WeTransfer delivery replaces the email: the step only advances with this confirmation.
                </span>
              </span>
            </label>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setWtOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                registraWeTransfer(commessa.id, session.userId, wtNota);
                let avanzata = false;
                if (wtAvanza && wtTransition) {
                  const res = advanceTo(commessa.id, session.userId, wtTransition.to);
                  if (!res.ok) {
                    toast({
                      title: "Cannot advance",
                      description: (res as { reason?: string }).reason,
                      variant: "destructive",
                    });
                  } else {
                    avanzata = true;
                  }
                }
                try {
                  await flushPendingWrites();
                  toast({
                    title: avanzata
                      ? `Delivery logged — job now ${STATO_LABELS[wtTransition!.to]}`
                      : "WeTransfer delivery logged",
                  });
                  setWtNota("");
                  setWtAvanza(false);
                  setWtOpen(false);
                } catch (error) {
                  toast({
                    title: "Delivery not saved",
                    description: error instanceof Error ? error.message : "The database rejected the event.",
                    variant: "destructive",
                  });
                  void reloadFromSupabase();
                }
              }}
            >
              {wtAvanza && wtTransition ? "Log and advance" : "Log"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {emailOpen && (
        <EmailWizardDialog
          open={!!emailOpen}
          onOpenChange={(o) => !o && setEmailOpen(null)}
          commessa={commessa}
          kind={emailOpen.kind}
          advanceState={emailOpen.advanceState}
        />
      )}

      {assegnaOpen && (
        <AssegnaDialog
          open={!!assegnaOpen}
          onOpenChange={(o) => !o && setAssegnaOpen(null)}
          commessaId={commessa.id}
          mode={assegnaOpen}
          defaultTerminePrimoPdf={commessa.terminePrimoPdf}
          onConfirm={(userIds, termineIso) => {
            const res = assegnaOpen === "assegna"
              ? assegnaCommessa(commessa.id, session.userId, userIds, termineIso)
              : modificaAssegnazione(commessa.id, session.userId, userIds);
            void run(assegnaOpen === "assegna" ? "Job assigned" : "Assignment updated", res);
            if (res.ok) setAssegnaOpen(null);
          }}
        />
      )}
    </section>
  );
}

function EsitoBlock({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-[280px]"><SelectValue placeholder="Select outcome…" /></SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SospendiDialog({
  open, onOpenChange, onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (motivo: typeof MOTIVI_SOSPENSIONE[number], nota?: string) => void;
}) {
  const [motivo, setMotivo] = useState<typeof MOTIVI_SOSPENSIONE[number]>("cliente");
  const [nota, setNota] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Put job on hold</DialogTitle>
          <DialogDescription>The job stays visible but is flagged as on hold.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="text-[12px] text-muted-foreground">Reason</div>
            <Select value={motivo} onValueChange={(v) => setMotivo(v as MotivoSospensione)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MOTIVI_SOSPENSIONE.map((m) => (
                  <SelectItem key={m} value={m}>{MOTIVO_SOSPENSIONE_LABELS[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <div className="text-[12px] text-muted-foreground">Note (optional)</div>
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onConfirm(motivo, nota.trim() || undefined)}>Put on hold</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ForzaturaDialog({
  commessaStato, allowedTargets, target, onCancel, onConfirm,
}: {
  commessaStato: StatoCommessa;
  allowedTargets: StatoCommessa[];
  target: StatoCommessa | null;
  onCancel: () => void;
  onConfirm: (to: StatoCommessa, nota: string) => void;
}) {
  const [to, setTo] = useState<StatoCommessa | null>(target);
  const [nota, setNota] = useState("");
  useEffect(() => {
    if (target) {
      setTo(target);
      setNota("");
    }
  }, [target]);
  const open = !!target;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Override step</DialogTitle>
          <DialogDescription>
            You are skipping a natural transition. A note is mandatory and stays in the history.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="text-[12px] text-muted-foreground">Target status</div>
            <Select value={to ?? undefined} onValueChange={(v) => setTo(v as StatoCommessa)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {allowedTargets.filter((s) => s !== commessaStato).map((s) => (
                  <SelectItem key={s} value={s}>{STATO_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <div className="text-[12px] text-muted-foreground">Reason (required)</div>
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} placeholder="Why are you overriding this step?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button disabled={!to || !nota.trim()} onClick={() => to && onConfirm(to, nota.trim())}>
            Override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
