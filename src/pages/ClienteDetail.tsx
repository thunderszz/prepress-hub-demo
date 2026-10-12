import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useClientiStore, useCommesseStore, useCurrentSession } from "@/lib/store";
import { StatoCommessaPill } from "@/components/Pills";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { canRenameCliente, isFullAccess } from "@/lib/permissions";
import { isValidEmail } from "@/lib/emailValidation";
import { flushPendingWrites } from "@/lib/supabaseWrites";
import { reloadFromSupabase } from "@/lib/supabaseData";
import { renameClienteManuale } from "@/lib/manualCommessa"; // MANUAL-MODE
import { toast } from "@/hooks/use-toast";

export default function ClienteDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const cliente = useClientiStore((s) => s.clienti.find((c) => c.id === id));
  const updateCliente = useClientiStore((s) => s.updateCliente);
  const allCommesse = useCommesseStore((s) => s.commesse);
  const commesse = useMemo(
    () => allCommesse.filter((c) => c.clienteId === id),
    [allCommesse, id],
  );
  const session = useCurrentSession();

  const [nome, setNome] = useState(""); // MANUAL-MODE
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (cliente) {
      setNome(cliente.nome);
      setEmail(cliente.email ?? "");
      setTelefono(cliente.telefono ?? "");
      setNote(cliente.note ?? "");
    }
  }, [cliente?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cliente)
    return (
      <div>
        <Link to="/customers" className="text-primary text-[13px]">← Customers</Link>
        <h1>Customer not found</h1>
      </div>
    );

  // CLI-04: the customer record is editable by full-access roles
  // (in particular the email used as recipient in the wizard §5.6).
  const canEdit = !!session && isFullAccess(session.role);
  // MANUAL-MODE: the name can only be fixed while customers are created by hand.
  const canRename = !!session && canRenameCliente(session);
  const nomeCambiato = canRename && nome.trim() !== cliente.nome;
  const anagraficaCambiata =
    (email || "") !== (cliente.email ?? "") ||
    (telefono || "") !== (cliente.telefono ?? "") ||
    (note || "") !== (cliente.note ?? "");
  const dirty = nomeCambiato || anagraficaCambiata;

  const save = async () => {
    if (email.trim() && !isValidEmail(email)) {
      toast({
        title: "Invalid email",
        description: "Check the address: use the form name@domain.com.",
        variant: "destructive",
      });
      return;
    }
    // MANUAL-MODE: the name goes first and we await the answer, because it
    // can clash with another customer: in that case nothing is saved.
    if (nomeCambiato) {
      const esito = await renameClienteManuale(cliente.id, nome);
      if (esito.ok === false) {
        toast({ title: "Change not saved", description: esito.reason, variant: "destructive" });
        return;
      }
      setNome(esito.cliente.nome);
    }
    if (anagraficaCambiata) {
      updateCliente(cliente.id, {
        email: email.trim() || undefined,
        telefono: telefono.trim() || undefined,
        note: note.trim() || undefined,
      });
      try {
        await flushPendingWrites();
      } catch (error) {
        toast({
          title: "Change not saved",
          description: error instanceof Error ? error.message : "The database rejected the change.",
          variant: "destructive",
        });
        // the UI updated optimistically: re-sync with the real DB
        void reloadFromSupabase();
        return;
      }
    }
    toast({ title: "Customer updated" });
  };

  return (
    <div className="space-y-5 max-w-[1100px]">
      <Link to="/customers" className="text-primary text-[13px]">← Customers</Link>
      <h1>{cliente.nome}</h1>

      <section className="bg-card border border-border rounded-md p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="label-caps">Customer record</div>
          {!canEdit && (
            <span className="text-[11px] text-muted-foreground">Read only</span>
          )}
        </div>
        {/* MANUAL-MODE: with the ERP sync the name becomes read-only again. */}
        <div className="space-y-1">
          <Label htmlFor="cliente-nome" className="text-[12px] text-muted-foreground">Name</Label>
          <Input
            id="cliente-nome"
            value={nome}
            disabled={!canRename}
            onChange={(e) => setNome(e.target.value)}
          />
          {canRename && (
            <p className="text-[11px] text-muted-foreground">
              Write it as in the ERP: the sync will recognise the customer by
              its name.
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="cliente-email" className="text-[12px] text-muted-foreground">Email</Label>
            <Input
              id="cliente-email"
              type="email"
              value={email}
              disabled={!canEdit}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="used as the recipient of customer emails"
            />
            {email.trim() && !isValidEmail(email) && (
              <p className="text-[11px] text-destructive">
                Invalid format: use name@domain.com
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="cliente-telefono" className="text-[12px] text-muted-foreground">Phone</Label>
            <Input
              id="cliente-telefono"
              value={telefono}
              disabled={!canEdit}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="cliente-note" className="text-[12px] text-muted-foreground">Notes</Label>
          <Textarea
            id="cliente-note"
            value={note}
            disabled={!canEdit}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
        </div>
        {canEdit && (
          <div className="flex justify-end">
            <Button disabled={!dirty} onClick={() => void save()}>Save</Button>
          </div>
        )}
      </section>

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Number</th><th>Job name</th><th>Status</th></tr></thead>
          <tbody>
            {commesse.map((c) => (
              <tr
                key={c.id}
                className="cursor-pointer"
                onClick={() => navigate(`/jobs/${c.id}`)}
              >
                <td>
                  <Link
                    to={`/jobs/${c.id}`}
                    className="text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {c.numeroCommessa}
                  </Link>
                </td>
                <td className="text-muted-foreground">{c.nomeLavoro}</td>
                <td>
                  <StatoCommessaPill
                    stato={c.stato}
                    sospesa={!!c.sospensioneAttivaId}
                    esitoProvaColore={c.esitoProvaColore}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
