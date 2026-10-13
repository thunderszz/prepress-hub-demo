// MANUAL-MODE — see src/lib/manualCommessa.ts for context
// and the removal procedure.
import { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { createClienteManuale } from "@/lib/manualCommessa";
import { isValidEmail } from "@/lib/emailValidation";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (clienteId: string) => void;
}

/** Labelled field, single column. */
function Campo({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function NuovoClienteDialog({ open, onOpenChange, onCreated }: Props) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [note, setNote] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  // Clean form on every opening: a reopened dialog must not show the
  // previous customer's data.
  useEffect(() => {
    if (!open) return;
    setNome("");
    setEmail("");
    setTelefono("");
    setNote("");
    setErrore(null);
    setInCorso(false);
  }, [open]);

  async function submit() {
    setInCorso(true);
    setErrore(null);
    const esito = await createClienteManuale({ nome, email, telefono, note });
    setInCorso(false);
    if (esito.ok === false) {
      // The dialog stays open: the user must not retype everything.
      setErrore(esito.reason);
      return;
    }
    onOpenChange(false);
    onCreated(esito.cliente.id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New customer</DialogTitle>
          <DialogDescription>
            Write the name exactly as in the ERP: the sync will recognise the
            customer by its name. A different name would become a second
            customer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Campo id="nuovo-cliente-nome" label="Name *">
            <Input
              id="nuovo-cliente-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Fabrikam Pasta Ltd"
              autoFocus
            />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo id="nuovo-cliente-email" label="Email">
              <Input
                id="nuovo-cliente-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="orders@customer.example"
              />
              {email.trim() && !isValidEmail(email) && (
                <p className="text-[11px] text-destructive">
                  Invalid format: use name@domain.com
                </p>
              )}
            </Campo>
            <Campo id="nuovo-cliente-telefono" label="Phone">
              <Input
                id="nuovo-cliente-telefono"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
              />
            </Campo>
          </div>

          <Campo id="nuovo-cliente-note" label="Notes">
            <Textarea
              id="nuovo-cliente-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </Campo>

          <p className="text-[11px] text-muted-foreground">
            The email pre-fills the recipient when sending to the customer.
            Without it, it has to be typed in every time.
          </p>

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
            {inCorso ? "Creating…" : "Create customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
