import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  entityName: string;
  description?: string;
  onConfirm: () => void;
  disabled?: boolean;
  disabledReason?: string;
}

export function DeleteConfirmDialog({ open, onOpenChange, entityName, description, onConfirm, disabled, disabledReason }: Props) {
  const [text, setText] = useState("");

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setText(""); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Permanent deletion
          </DialogTitle>
        </DialogHeader>
        {disabled ? (
          <div className="text-[13px] text-muted-foreground bg-muted p-3 rounded">
            {disabledReason ?? "This item cannot be permanently deleted."}
          </div>
        ) : (
          <>
            <div className="text-[13px] space-y-2">
              <p>You are about to permanently delete: <strong>{entityName}</strong>.</p>
              <p className="text-destructive font-medium">This action cannot be undone.</p>
              {description && <p className="text-muted-foreground">{description}</p>}
            </div>
            <div>
              <Label className="text-[12px]">Type <code className="px-1 bg-muted rounded">DELETE</code> to confirm</Label>
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="DELETE" className="mt-1.5" />
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {!disabled && (
            <Button
              variant="destructive"
              disabled={text !== "DELETE"}
              onClick={() => { onConfirm(); onOpenChange(false); setText(""); }}
            >Delete permanently</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
