// MANUAL-MODE — see src/lib/manualCommessa.ts for context
// and the removal procedure.
import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClientiStore, useCurrentUser } from "@/lib/store";
import { createCommessaManuale } from "@/lib/manualCommessa";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (commessaId: string) => void;
}

const NUOVO_CLIENTE = "__nuovo__";

/** Labelled field, single column. */
function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function NuovaCommessaDialog({ open, onOpenChange, onCreated }: Props) {
  const clienti = useClientiStore((s) => s.clienti);
  const user = useCurrentUser();

  const [numeroCommessa, setNumeroCommessa] = useState("");
  const [nomeLavoro, setNomeLavoro] = useState("");
  const [clienteId, setClienteId] = useState<string>("");
  const [nuovoClienteNome, setNuovoClienteNome] = useState("");
  const [nuovoClienteEmail, setNuovoClienteEmail] = useState("");
  const [nuovoClienteTelefono, setNuovoClienteTelefono] = useState("");
  const [stampatore, setStampatore] = useState("");
  const [codStampatore, setCodStampatore] = useState("");
  const [soggetto, setSoggetto] = useState("");
  const [codSoggetto, setCodSoggetto] = useState("");
  const [rifCliente, setRifCliente] = useState("");
  const [codArticolo, setCodArticolo] = useState("");
  const [numeroOrdine, setNumeroOrdine] = useState("");
  const [operatoreRePro, setOperatoreRePro] = useState("");
  const [dataConsegnaPrevista, setDataConsegnaPrevista] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  const clientiOrdinati = useMemo(
    () => [...clienti].sort((a, b) => a.nome.localeCompare(b.nome)),
    [clienti],
  );

  // Clean form on every opening: a reopened dialog must not show the
  // previous job's data.
  useEffect(() => {
    if (!open) return;
    setNumeroCommessa("");
    setNomeLavoro("");
    setClienteId("");
    setNuovoClienteNome("");
    setNuovoClienteEmail("");
    setNuovoClienteTelefono("");
    setStampatore("");
    setCodStampatore("");
    setSoggetto("");
    setCodSoggetto("");
    setRifCliente("");
    setCodArticolo("");
    setNumeroOrdine("");
    setOperatoreRePro("");
    setDataConsegnaPrevista("");
    setErrore(null);
    setInCorso(false);
  }, [open]);

  const creaNuovoCliente = clienteId === NUOVO_CLIENTE;

  async function submit() {
    if (!user) {
      setErrore("Session expired: sign in again and retry.");
      return;
    }
    setInCorso(true);
    setErrore(null);

    const esito = await createCommessaManuale(
      {
        numeroCommessa,
        nomeLavoro,
        clienteId: creaNuovoCliente || !clienteId ? undefined : clienteId,
        nuovoCliente: creaNuovoCliente
          ? {
              nome: nuovoClienteNome,
              email: nuovoClienteEmail,
              telefono: nuovoClienteTelefono,
            }
          : undefined,
        stampatore,
        codStampatore,
        soggetto,
        codSoggetto,
        rifCliente,
        codArticolo,
        numeroOrdine,
        operatoreRePro,
        dataConsegnaPrevista,
      },
      user.id,
    );

    setInCorso(false);
    if (esito.ok === false) {
      // The dialog stays open: the user must not retype everything.
      setErrore(esito.reason);
      return;
    }
    // The job exists anyway: the dialog closes and we navigate, but a
    // secondary problem (history not written) is reported, not hidden.
    if (esito.avviso) {
      toast({ title: "Job created with a warning", description: esito.avviso });
    }
    onOpenChange(false);
    onCreated(esito.commessa.id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New job</DialogTitle>
          <DialogDescription>
            Copy the job number from the ERP: it is the key that will match the
            job once the ERP sync is live.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Job number *">
              <Input
                value={numeroCommessa}
                onChange={(e) => setNumeroCommessa(e.target.value)}
                placeholder="2026/8812"
                autoFocus
              />
            </Campo>
            <Campo label="Expected delivery date">
              <Input
                type="date"
                value={dataConsegnaPrevista}
                onChange={(e) => setDataConsegnaPrevista(e.target.value)}
              />
            </Campo>
          </div>

          <Campo label="Job name *">
            <Input
              value={nomeLavoro}
              onChange={(e) => setNomeLavoro(e.target.value)}
              placeholder="1.5L Still Water label"
            />
          </Campo>

          <Campo label="Customer *">
            <Select value={clienteId} onValueChange={setClienteId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a customer" />
              </SelectTrigger>
              <SelectContent>
                {clientiOrdinati.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
                <SelectItem value={NUOVO_CLIENTE}>+ New customer…</SelectItem>
              </SelectContent>
            </Select>
          </Campo>

          {creaNuovoCliente && (
            <div className="border border-border rounded-md p-3 space-y-3 bg-muted/30">
              <Campo label="New customer name *">
                <Input
                  value={nuovoClienteNome}
                  onChange={(e) => setNuovoClienteNome(e.target.value)}
                  placeholder="Pastificio Aurora S.r.l."
                />
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Email">
                  <Input
                    type="email"
                    value={nuovoClienteEmail}
                    onChange={(e) => setNuovoClienteEmail(e.target.value)}
                    placeholder="orders@customer.com"
                  />
                </Campo>
                <Campo label="Phone">
                  <Input
                    value={nuovoClienteTelefono}
                    onChange={(e) => setNuovoClienteTelefono(e.target.value)}
                  />
                </Campo>
              </div>
              <p className="text-[11px] text-muted-foreground">
                The email pre-fills the recipient when sending to the customer.
                Without it, it has to be typed in every time.
              </p>
            </div>
          )}

          <div className="border-t border-border pt-3 space-y-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Other ERP fields — all optional
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Printer">
                <Input value={stampatore} onChange={(e) => setStampatore(e.target.value)} />
              </Campo>
              <Campo label="Printer code">
                <Input value={codStampatore} onChange={(e) => setCodStampatore(e.target.value)} />
              </Campo>
              <Campo label="Artwork variant">
                <Input value={soggetto} onChange={(e) => setSoggetto(e.target.value)} />
              </Campo>
              <Campo label="Variant code">
                <Input value={codSoggetto} onChange={(e) => setCodSoggetto(e.target.value)} />
              </Campo>
              <Campo label="Customer ref.">
                <Input value={rifCliente} onChange={(e) => setRifCliente(e.target.value)} />
              </Campo>
              <Campo label="Item code">
                <Input value={codArticolo} onChange={(e) => setCodArticolo(e.target.value)} />
              </Campo>
              <Campo label="Order number">
                <Input value={numeroOrdine} onChange={(e) => setNumeroOrdine(e.target.value)} />
              </Campo>
              <Campo label="RePro operator">
                <Input value={operatoreRePro} onChange={(e) => setOperatoreRePro(e.target.value)} />
              </Campo>
            </div>
          </div>

          {errore && (
            <div className="text-[12px] text-status-late-fg bg-status-late-bg rounded px-3 py-2">
              {errore}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={inCorso}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={inCorso}>
            {inCorso ? "Creating…" : "Create job"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
