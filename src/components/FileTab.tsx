import { useMemo, useRef } from "react";
import { Commessa } from "@/lib/types";
import { useFileStore, useUsersStore, useAssegnatariStore, useCurrentSession } from "@/lib/store";
import { canUploadFile } from "@/lib/permissions";
import { uploadCommessaFile, getFileDownloadUrl } from "@/lib/fileStorage";
import { Button } from "@/components/ui/button";
import { fmtDateTime } from "@/lib/format";
import { toast } from "@/hooks/use-toast";
import { Upload, FileText, FileImage, Download } from "lucide-react";
import { flushPendingWrites } from "@/lib/supabaseWrites";
import { reloadFromSupabase } from "@/lib/supabaseData";

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  commessa: Commessa;
}

export function FileTab({ commessa }: Props) {
  const session = useCurrentSession();
  const assegnatari = useAssegnatariStore((s) => s.assegnatari);
  const allFiles = useFileStore((s) => s.files);
  const files = useMemo(
    () => allFiles.filter((f) => f.commessaId === commessa.id),
    [allFiles, commessa.id],
  );
  const users = useUsersStore((s) => s.users);
  const inputRef = useRef<HTMLInputElement>(null);

  const canEdit = session ? canUploadFile(session, commessa, assegnatari) : false;

  const handleFiles = async (list: FileList | null) => {
    if (!list || !session) return;
    for (const file of Array.from(list)) {
      const res = await uploadCommessaFile(commessa.id, session.userId, file);
      if (!res.ok) {
        toast({
          title: "File not uploaded",
          description: (res as { reason?: string }).reason,
          variant: "destructive",
        });
        continue;
      }
      try {
        await flushPendingWrites();
        toast({
          title: res.replaced ? "File replaced" : "File uploaded",
          description: file.name,
        });
      } catch (error) {
        toast({
          title: "File not saved",
          description: error instanceof Error ? error.message : "The database rejected the file.",
          variant: "destructive",
        });
        void reloadFromSupabase();
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleDownload = async (f: (typeof files)[number]) => {
    const url = await getFileDownloadUrl(f);
    if (url) {
      window.open(url, "_blank", "noopener");
    } else {
      toast({
        title: "Download not available",
        description: "The file is no longer available (retention, or never stored).",
        variant: "destructive",
      });
    }
  };

  return (
    <section className="bg-card border border-border rounded-md p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="label-caps">Job files</div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,application/pdf,.jpg,.jpeg,image/jpeg,.png,image/png"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button
            size="sm"
            disabled={!canEdit}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-4 w-4" /> Upload file
          </Button>
        </div>
      </div>

      <p className="text-[12px] text-muted-foreground">
        Allowed formats: PDF, JPEG, PNG. Same name → replacement (with its own history event).
      </p>

      {files.length === 0 ? (
        <div className="text-[12px] text-muted-foreground">No files yet.</div>
      ) : (
        <ul className="divide-y divide-border">
          {files.map((f) => {
            const u = users.find((x) => x.id === f.caricatoDaUserId);
            const Icon = f.tipo === "PDF" ? FileText : FileImage;
            return (
              <li key={f.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{f.nome}</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    {f.tipo} · {fmtBytes(f.dimensioneBytes)} · {fmtDateTime(f.caricatoIl)}
                    {u && <> · {u.nome}</>}
                  </div>
                </div>
                {!f.binarioDisponibile && (
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-warning/40 text-warning bg-warning/10">
                    File no longer available
                  </span>
                )}
                {f.binarioDisponibile && f.storagePath && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Download ${f.nome}`}
                    onClick={() => void handleDownload(f)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
