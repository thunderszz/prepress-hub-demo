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
import { Checkbox } from "@/components/ui/checkbox";
import {
  useAssegnatariStore,
  useGruppiStore,
  useUsersStore,
  useUtenteGruppiStore,
} from "@/lib/store";
import { utentiAssegnabili } from "@/lib/permissions";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  commessaId: string;
  /** Shown at the top. "assegna" = first assignment, "modifica" = already assigned. */
  mode: "assegna" | "modifica";
  /** Default deadline (only in "assegna" mode): now+48h ISO. */
  defaultTerminePrimoPdf?: string;
  onConfirm: (userIds: string[], terminePrimoPdfIso: string | undefined) => void;
}

export function AssegnaDialog({
  open,
  onOpenChange,
  commessaId,
  mode,
  defaultTerminePrimoPdf,
  onConfirm,
}: Props) {
  const users = useUsersStore((s) => s.users);
  const memberships = useUtenteGruppiStore((s) => s.utenteGruppi);
  const gruppi = useGruppiStore((s) => s.gruppi);
  const allAssegnatari = useAssegnatariStore((s) => s.assegnatari);
  const currentAss = useMemo(
    () => allAssegnatari.filter((a) => a.commessaId === commessaId),
    [allAssegnatari, commessaId],
  );

  const grafici = useMemo(
    () => utentiAssegnabili(users, memberships),
    [users, memberships],
  );
  const groupsOfUser = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const x of memberships) {
      const arr = m.get(x.userId) ?? [];
      const g = gruppi.find((gr) => gr.id === x.gruppoId);
      if (g) arr.push(g.nome);
      m.set(x.userId, arr);
    }
    return m;
  }, [memberships, gruppi]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [termine, setTermine] = useState<string>("");

  useEffect(() => {
    if (open) {
      setSelected(new Set(currentAss.map((a) => a.userId)));
      // datetime-local wants "YYYY-MM-DDTHH:mm"
      const iso = defaultTerminePrimoPdf ?? new Date(Date.now() + 48 * 3600 * 1000).toISOString();
      const d = new Date(iso);
      const pad = (n: number) => String(n).padStart(2, "0");
      setTermine(
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, commessaId]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const submit = () => {
    const ids = Array.from(selected);
    const iso = mode === "assegna" && termine ? new Date(termine).toISOString() : undefined;
    onConfirm(ids, iso);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "assegna" ? "Assign to designers" : "Change assignment"}
          </DialogTitle>
          <DialogDescription>
            Select one or more designers. Designers from different teams can share a job.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[12px] text-muted-foreground">Designers</Label>
            <div className="border border-border rounded-md max-h-[260px] overflow-y-auto divide-y divide-border">
              {grafici.map((u) => {
                const gs = groupsOfUser.get(u.id) ?? [];
                return (
                  <div
                    key={u.id}
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/40 text-[13px]"
                    onClick={() => toggle(u.id)}
                  >
                    <Checkbox
                      checked={selected.has(u.id)}
                      onCheckedChange={() => toggle(u.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="flex-1">{u.nome}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {gs.length ? gs.join(", ") : "—"}
                    </span>
                  </div>
                );
              })}
              {grafici.length === 0 && (
                <div className="px-3 py-4 text-[12px] text-muted-foreground">
                  No active designers.
                </div>
              )}
            </div>
          </div>

          {mode === "assegna" && (
            <div className="space-y-1.5">
              <Label className="text-[12px] text-muted-foreground">
                First PDF deadline (default: now + 48h)
              </Label>
              <Input
                type="datetime-local"
                value={termine}
                onChange={(e) => setTermine(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={selected.size === 0} onClick={submit}>
            {mode === "assegna" ? "Assign" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
