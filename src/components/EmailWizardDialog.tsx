import { useEffect, useMemo, useRef, useState } from "react";
import {
  Commessa,
  EmailTemplateKind,
  EMAIL_TEMPLATE_LABELS,
  StatoCommessa,
} from "@/lib/types";
import {
  useClientiStore,
  useCurrentSession,
  useCurrentUser,
  useFileStore,
  useGruppiStore,
  useTemplatesStore,
} from "@/lib/store";
import {
  defaultMailboxForUser,
  inviaEmail,
  InviaEmailPayload,
  renderTemplate,
} from "@/lib/workflowActions";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseEmailList } from "@/lib/emailValidation";
import { uploadCommessaFile } from "@/lib/fileStorage";
import { flushPendingWrites } from "@/lib/supabaseWrites";
import { reloadFromSupabase } from "@/lib/supabaseData";
import { toast } from "@/hooks/use-toast";
import { AlertCircle, Send, Upload } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  commessa: Commessa;
  kind: EmailTemplateKind;
  /** Target status (for pdf and press proof). prova_colore = undefined. */
  advanceState?: StatoCommessa;
}

export function EmailWizardDialog({
  open,
  onOpenChange,
  commessa,
  kind,
  advanceState,
}: Props) {
  const session = useCurrentSession();
  const currentUserId = session?.userId;
  const user = useCurrentUser();
  const cliente = useClientiStore((s) => s.clienti.find((c) => c.id === commessa.clienteId));
  const gruppi = useGruppiStore((s) => s.gruppi);
  const template = useTemplatesStore((s) => s.templates.find((t) => t.kind === kind));
  const allFiles = useFileStore((s) => s.files);
  // Attachment: any file already uploaded to the job (PDFs, but also
  // JPEG/PNG photos for the colour proof) — not just PDFs.
  const attachableFiles = useMemo(
    () => allFiles.filter((f) => f.commessaId === commessa.id),
    [allFiles, commessa.id],
  );

  const [destinatario, setDestinatario] = useState("");
  const [cc, setCc] = useState("");
  const [mittente, setMittente] = useState("");
  const [oggetto, setOggetto] = useState("");
  const [corpo, setCorpo] = useState("");
  const [allegatoNome, setAllegatoNome] = useState("");
  const [simulaErrore, setSimulaErrore] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const prefilled = useRef(false);

  // Prefill ONCE per opening. Dependencies also change while the wizard is
  // open (data reload when the tab becomes visible, attachment upload):
  // prefilling again would wipe what the user typed, e.g. a test recipient.
  useEffect(() => {
    if (!open) {
      prefilled.current = false;
      return;
    }
    if (prefilled.current || !currentUserId || !user) return;
    prefilled.current = true;
    const ctx = {
      numero_commessa: commessa.numeroCommessa,
      nome_lavoro: commessa.nomeLavoro,
      cliente: cliente?.nome ?? "",
      nome_utente: user.nome,
    };
    setDestinatario(cliente?.email ?? "");
    setCc("");
    setMittente(defaultMailboxForUser(currentUserId) ?? gruppi[0]?.mailbox ?? "");
    setOggetto(template?.oggetto ? renderTemplate(template.oggetto, ctx) : "");
    setCorpo(template?.corpo ? renderTemplate(template.corpo, ctx) : "");
    // Prefer an uploaded PDF; otherwise a photo is fine too (colour proof).
    const defaultAllegato = attachableFiles.find((f) => f.tipo === "PDF") ?? attachableFiles[0];
    setAllegatoNome(defaultAllegato?.nome ?? "");
    setSimulaErrore(false);
    setHasError(false);
    setSending(false);
  }, [
    open,
    currentUserId,
    user,
    cliente?.email,
    cliente?.nome,
    commessa.id,
    commessa.nomeLavoro,
    commessa.numeroCommessa,
    gruppi,
    kind,
    attachableFiles,
    template?.corpo,
    template?.oggetto,
  ]);

  // Addresses parsed from the pasted text: a recipient must not be repeated
  // in CC (the email provider rejects the same address in To and CC).
  const toList = parseEmailList(destinatario);
  const ccList = parseEmailList(cc);
  const toKeys = new Set(toList.emails.map((e) => e.toLowerCase()));
  const ccEmails = ccList.emails.filter((e) => !toKeys.has(e.toLowerCase()));

  if (!session || !user) return null;

  const send = async () => {
    // Formal address check BEFORE sending (typos like "name@domain").
    const invalid = [...toList.invalid, ...ccList.invalid];
    if (invalid.length > 0) {
      toast({
        title: "Invalid email address",
        description: `Please check: ${invalid.join(", ")}`,
        variant: "destructive",
      });
      return;
    }
    const destinatari = toList.emails;
    setSending(true);
    // FILE-02: names are unique per job, so the name resolves to the id.
    const allegato = attachableFiles.find((f) => f.nome === allegatoNome.trim());
    const payload: InviaEmailPayload = {
      kind,
      mittente,
      destinatari,
      cc: ccEmails,
      oggetto,
      corpo,
      allegatoNome: allegatoNome.trim() || undefined,
      allegatoFileId: allegato?.id,
      simulaErrore,
      advanceState,
    };
    try {
      const res = await inviaEmail(commessa.id, session.userId, payload);
      if (!res.ok) {
        // emailId present = archived with status 'errore' (MAIL-07): retry is possible.
        if (res.emailId) setHasError(true);
        toast({
          title: res.emailId ? "Sending failed" : "Send error",
          description: (res as { reason?: string }).reason,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Email sent", description: EMAIL_TEMPLATE_LABELS[kind] });
      onOpenChange(false);
    } finally {
      setSending(false);
    }
  };

  const retry = () => {
    setSimulaErrore(false);
    setHasError(false);
    // The user then clicks "Send", which will now succeed (toggle off)
  };

  const handleUpload = async (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    setUploading(true);
    const res = await uploadCommessaFile(commessa.id, session.userId, file);
    if (!res.ok) {
      toast({
        title: "File not uploaded",
        description: (res as { reason?: string }).reason,
        variant: "destructive",
      });
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
      return;
    }
    try {
      await flushPendingWrites();
      setAllegatoNome(file.name);
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
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{EMAIL_TEMPLATE_LABELS[kind]}</DialogTitle>
          <DialogDescription>
            Check recipient, CC, sender, subject and body. The email is only sent when you
            explicitly confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Recipient" htmlFor="email-destinatario">
            <Input
              id="email-destinatario"
              value={destinatario}
              onChange={(e) => setDestinatario(e.target.value)}
              autoComplete="off"
              inputMode="email"
              name="destinatario-cliente"
              spellCheck={false}
              placeholder="customer@example.com (separate multiple addresses with ,)"
            />
            {cliente?.email ? (
              destinatario.trim() === cliente.email ? (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Taken from the customer record. You can replace it: it only applies to this
                  email, the customer record does not change.
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2">
                  <span>Changed for this email only: the customer record keeps {cliente.email}.</span>
                  <button
                    type="button"
                    className="text-primary underline underline-offset-2"
                    onClick={() => setDestinatario(cliente.email ?? "")}
                  >
                    Restore customer email
                  </button>
                </p>
              )
            ) : (
              <p className="text-[11px] text-warning flex items-center gap-1 mt-1">
                <AlertCircle className="h-3 w-3" /> No email on the customer record.
              </p>
            )}
          </Field>

          <Field label="CC (carbon copy)" htmlFor="email-cc">
            <Textarea
              id="email-cc"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              rows={2}
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste the CC list from the customer's email, names included (e.g. Jane Doe <jane@customer.com>; …)"
            />
            {ccEmails.length > 0 ? (
              <p className="text-[11px] text-muted-foreground mt-1 break-all">
                In copy ({ccEmails.length}): {ccEmails.join(", ")}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-1">
                Optional. CC only applies to this email.
              </p>
            )}
            {ccList.invalid.length > 0 && (
              <p className="text-[11px] text-destructive flex items-center gap-1 mt-1">
                <AlertCircle className="h-3 w-3" /> To fix: {ccList.invalid.join(", ")}
              </p>
            )}
          </Field>

          <Field label="Sender (team mailbox)">
            <Select value={mittente} onValueChange={setMittente}>
              <SelectTrigger>
                <SelectValue placeholder="Choose sender…" />
              </SelectTrigger>
              <SelectContent>
                {gruppi.map((g) => (
                  <SelectItem key={g.id} value={g.mailbox}>
                    {g.mailbox}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Reply-to = sender. Replies go back to the team mailbox.
            </p>
          </Field>

          <Field label="Subject" htmlFor="email-oggetto">
            <Input id="email-oggetto" value={oggetto} onChange={(e) => setOggetto(e.target.value)} />
          </Field>

          <Field label="Body" htmlFor="email-corpo">
            <Textarea
              id="email-corpo"
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
              rows={8}
              placeholder={
                template?.corpo
                  ? undefined
                  : "The template is empty: write the message body."
              }
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Variables: {"{job_number}"} {"{job_name}"} {"{customer}"} {"{user_name}"}
            </p>
          </Field>

          <Field label="Attachment">
            <div className="flex items-center gap-2">
              {attachableFiles.length > 0 ? (
                <Select value={allegatoNome} onValueChange={setAllegatoNome}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="No attachment" />
                  </SelectTrigger>
                  <SelectContent>
                    {attachableFiles.map((f) => (
                      <SelectItem key={f.id} value={f.nome}>
                        {f.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={allegatoNome}
                  onChange={(e) => setAllegatoNome(e.target.value)}
                  placeholder="No file uploaded"
                  className="flex-1"
                />
              )}
              <input
                ref={uploadInputRef}
                type="file"
                accept=".pdf,application/pdf,.jpg,.jpeg,image/jpeg,.png,image/png"
                className="hidden"
                onChange={(e) => void handleUpload(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => uploadInputRef.current?.click()}
              >
                <Upload className="h-4 w-4" /> Upload new
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              PDF, JPEG or PNG. Pick a file already uploaded to the job or upload a new one.
            </p>
          </Field>

          {import.meta.env.DEV && (
            <label className="flex items-center gap-2 text-[12px] text-muted-foreground pt-1">
              <Checkbox
                checked={simulaErrore}
                onCheckedChange={(v) => setSimulaErrore(!!v)}
              />
              Simulate a send error (to test retry)
            </label>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {hasError ? (
            <Button onClick={retry} variant="outline">
              Ready to retry
            </Button>
          ) : null}
          <Button onClick={send} disabled={sending}>
            <Send className="h-4 w-4" />
            {hasError ? "Retry send" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[12px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
