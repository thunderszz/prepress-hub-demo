import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useClientiStore, useCommesseStore, useCurrentSession } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { canCreateCliente } from "@/lib/permissions";
import { NuovoClienteDialog } from "@/components/NuovoClienteDialog"; // MANUAL-MODE

export default function Clienti() {
  const clienti = useClientiStore((s) => s.clienti);
  const commesse = useCommesseStore((s) => s.commesse);
  const navigate = useNavigate();
  const session = useCurrentSession();
  const [nuovoAperto, setNuovoAperto] = useState(false); // MANUAL-MODE
  const puoCreare = !!session && canCreateCliente(session);
  return (
    <div className="space-y-5 max-w-[1100px]">
      <div className="flex items-center justify-between">
        <h1>Customers</h1>
        {puoCreare && (
          // MANUAL-MODE
          <Button size="sm" onClick={() => setNuovoAperto(true)}>
            New customer
          </Button>
        )}
      </div>

      {/* MANUAL-MODE */}
      <NuovoClienteDialog
        open={nuovoAperto}
        onOpenChange={setNuovoAperto}
        onCreated={(id) => navigate(`/customers/${id}`)}
      />

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <table className="data-table">
          <thead>
            <tr><th>Name</th><th>Email</th><th className="text-right">Jobs</th></tr>
          </thead>
          <tbody>
            {clienti.map((c) => (
              <tr
                key={c.id}
                className="hover:bg-muted/40 cursor-pointer"
                onClick={() => navigate(`/customers/${c.id}`)}
              >
                <td>
                  <Link
                    to={`/customers/${c.id}`}
                    className="text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {c.nome}
                  </Link>
                </td>
                <td className="text-muted-foreground">{c.email ?? "—"}</td>
                <td className="text-right tabular-nums">{commesse.filter((x) => x.clienteId === c.id).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
