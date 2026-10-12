import { useMemo, useState } from "react";
import { Commessa } from "@/lib/types";
import {
  useAssegnatariStore,
  useCorrezioniStore,
  useCurrentSession,
  useUsersStore,
} from "@/lib/store";
import { canEditWorkflow } from "@/lib/permissions";
import { registraCorrezione } from "@/lib/workflowActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { fmtDateTime } from "@/lib/format";
import { toast } from "@/hooks/use-toast";
import { Clock } from "lucide-react";
import { flushPendingWrites } from "@/lib/supabaseWrites";
import { reloadFromSupabase } from "@/lib/supabaseData";

interface Props {
  commessa: Commessa;
}

const SOGLIA_ALERT_MIN = 60;

export function TempiTab({ commessa }: Props) {
  const session = useCurrentSession();
  const assegnatari = useAssegnatariStore((s) => s.assegnatari);
  const allCorrezioni = useCorrezioniStore((s) => s.correzioni);
  const users = useUsersStore((s) => s.users);
  const correzioni = useMemo(
    () => allCorrezioni.filter((c) => c.commessaId === commessa.id),
    [allCorrezioni, commessa.id],
  );
  const [min, setMin] = useState("");
  const [nota, setNota] = useState("");

  const canEdit = session ? canEditWorkflow(session, commessa, assegnatari) : false;
  const totale = correzioni.reduce((acc, c) => acc + c.minuti, 0);
  const overSoglia = totale >= SOGLIA_ALERT_MIN;

  return (
    <section className="bg-card border border-border rounded-md p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="label-caps">Correction time</div>
          <p className="text-[12px] text-muted-foreground mt-1">
            Only correction time is tracked. ALR-01 threshold: {SOGLIA_ALERT_MIN} minutes.
          </p>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-muted-foreground uppercase tracking-wide">Total</div>
          <div
            className={`text-2xl font-semibold tabular-nums ${
              overSoglia ? "text-destructive" : ""
            }`}
          >
            {totale} min
          </div>
        </div>
      </div>

      {canEdit && (
        <div className="space-y-2 border-t border-border pt-4">
          <div className="text-[12px] text-muted-foreground">Log a correction</div>
          <div className="flex flex-col md:flex-row gap-2">
            <Input
              type="number"
              min={1}
              step={1}
              placeholder="Minutes"
              value={min}
              onChange={(e) => setMin(e.target.value)}
              className="md:w-28"
            />
            <Textarea
              placeholder="Note (optional): what was corrected…"
              rows={2}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              className="flex-1"
            />
            <Button
              disabled={!min || Number(min) <= 0}
              onClick={async () => {
                if (!session) return;
                const r = registraCorrezione(
                  commessa.id,
                  session.userId,
                  Number(min),
                  nota,
                );
                if (r.ok) {
                  try {
                    await flushPendingWrites();
                    toast({ title: "Correction logged" });
                    setMin("");
                    setNota("");
                  } catch (error) {
                    toast({
                      title: "Correction not saved",
                      description: error instanceof Error ? error.message : "The database rejected the correction.",
                      variant: "destructive",
                    });
                    void reloadFromSupabase();
                  }
                } else {
                  toast({ title: "Error", description: (r as { reason: string }).reason, variant: "destructive" });
                }
              }}
            >
              Log
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="label-caps">Correction log</div>
        {correzioni.length === 0 ? (
          <div className="text-[12px] text-muted-foreground">No corrections logged.</div>
        ) : (
          <ul className="divide-y divide-border">
            {correzioni.map((c) => {
              const u = users.find((x) => x.id === c.userId);
              return (
                <li key={c.id} className="flex items-start gap-3 py-2.5 text-[13px]">
                  <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium tabular-nums">{c.minuti} min</div>
                    {c.nota && (
                      <div className="text-[12px] text-muted-foreground whitespace-pre-wrap">
                        {c.nota}
                      </div>
                    )}
                    <div className="text-[11px] text-muted-foreground tabular-nums">
                      {fmtDateTime(c.data)}
                      {u && <> · {u.nome}</>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
