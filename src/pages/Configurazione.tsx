import { useState } from "react";
import {
  useUsersStore,
  useGruppiStore,
  useUtenteGruppiStore,
  useTemplatesStore,
  useCurrentSession,
} from "@/lib/store";
import {
  addUserProfile,
  sendPasswordReset,
  setUserGroupMembership,
  updateEmailTemplateConfig,
  updateUserProfile,
} from "@/lib/configurationActions";
import {
  EMAIL_TEMPLATE_KIND,
  EMAIL_TEMPLATE_LABELS,
  EmailTemplateKind,
  ROLES,
  ROLE_LABELS,
  Role,
} from "@/lib/types";
import { canManageUsers } from "@/lib/permissions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { KeyRound, Plus } from "lucide-react";

export default function Configurazione() {
  const session = useCurrentSession();
  if (!session || !canManageUsers(session)) {
    return (
      <div className="space-y-3">
        <h1>Settings</h1>
        <p className="text-[13px] text-muted-foreground">
          This section is reserved to full-access roles.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-5 max-w-[1200px]">
      <h1>Settings</h1>
      <Tabs defaultValue="utenti" className="space-y-4">
        <TabsList>
          <TabsTrigger value="utenti">Users</TabsTrigger>
          <TabsTrigger value="gruppi">Prepress teams</TabsTrigger>
          <TabsTrigger value="caselle">Mailboxes</TabsTrigger>
          <TabsTrigger value="template">Email templates</TabsTrigger>
        </TabsList>
        <TabsContent value="utenti"><UtentiTab /></TabsContent>
        <TabsContent value="gruppi"><GruppiTab /></TabsContent>
        <TabsContent value="caselle"><CaselleTab /></TabsContent>
        <TabsContent value="template"><TemplateTab /></TabsContent>
      </Tabs>

    </div>
  );
}

// USERS
function UtentiTab() {
  const users = useUsersStore((s) => s.users);

  const [openNew, setOpenNew] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [ruolo, setRuolo] = useState<Role>("grafico");

  const addUser = async () => {
    const res = await addUserProfile({ nome, email, ruolo });
    if (res.ok === false) {
      toast({ title: "User not saved", description: res.reason, variant: "destructive" });
      return;
    }
    setNome("");
    setEmail("");
    setRuolo("grafico");
    setOpenNew(false);
    toast({ title: "User added" });
  };

  return (
    <section className="bg-card border border-border rounded-md p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="label-caps">Users ({users.length})</div>
        <Button size="sm" onClick={() => setOpenNew((v) => !v)}>
          <Plus className="h-4 w-4" /> Add user
        </Button>
      </div>

      {openNew && (
        <div className="border border-border rounded-md p-3 space-y-2 bg-muted/20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-[12px] text-muted-foreground">Name</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[12px] text-muted-foreground">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-[12px] text-muted-foreground">Role</Label>
              <Select value={ruolo} onValueChange={(v) => setRuolo(v as Role)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setOpenNew(false)}>Cancel</Button>
            <Button size="sm" onClick={addUser}>Save</Button>
          </div>
        </div>
      )}

      <div className="overflow-hidden border border-border rounded-md">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Active</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.nome}</td>
                <td className="text-muted-foreground">{u.email}</td>
                <td>
                  <Select
                    value={u.ruolo}
                    onValueChange={(v) => {
                      void updateUserProfile(u.id, { ruolo: v as Role }).then((res) => {
                        if (res.ok === false) {
                          toast({ title: "Role not saved", description: res.reason, variant: "destructive" });
                        }
                      });
                    }}
                  >
                    <SelectTrigger className="h-8 w-[220px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
                <td>
                  <Switch
                    checked={u.attivo}
                    onCheckedChange={(v) => {
                      void updateUserProfile(u.id, { attivo: !!v }).then((res) => {
                        if (res.ok === false) {
                          toast({ title: "User status not saved", description: res.reason, variant: "destructive" });
                        }
                      });
                    }}
                  />
                </td>
                <td className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void sendPasswordReset(u.email).then((res) => {
                        if (res.ok === false) {
                          toast({ title: "Password reset not sent", description: res.reason, variant: "destructive" });
                          return;
                        }
                        toast({ title: `Password reset email sent to ${u.email}` });
                      });
                    }}
                  >
                    <KeyRound className="h-4 w-4" /> Reset password
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// PREPRESS TEAMS
function GruppiTab() {
  const gruppi = useGruppiStore((s) => s.gruppi);
  const memberships = useUtenteGruppiStore((s) => s.utenteGruppi);
  const users = useUsersStore((s) => s.users);

  return (
    <section className="space-y-4">
      <p className="text-[12px] text-muted-foreground">
        A user can belong to several teams. The team mailbox is the default sender of
        their emails.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {gruppi.map((g) => {
          const memberIds = new Set(memberships.filter((m) => m.gruppoId === g.id).map((m) => m.userId));
          return (
            <div key={g.id} className="bg-card border border-border rounded-md p-4 space-y-3">
              <div>
                <div className="text-[14px] font-medium">{g.nome}</div>
                <div className="text-[12px] text-muted-foreground tabular-nums">{g.mailbox}</div>
              </div>
              <div className="space-y-1 max-h-[260px] overflow-y-auto">
                {users.map((u) => {
                  const inGroup = memberIds.has(u.id);
                  return (
                    <label key={u.id} className="flex items-center gap-2 text-[13px] cursor-pointer hover:bg-muted/30 p-1 rounded">
                      <Checkbox
                        checked={inGroup}
                        onCheckedChange={(v) => {
                          void setUserGroupMembership(u.id, g.id, !!v).then((res) => {
                            if (res.ok === false) {
                              toast({ title: "Team not saved", description: res.reason, variant: "destructive" });
                            }
                          });
                        }}
                      />
                      <span>{u.nome}</span>
                      <span className="text-muted-foreground text-[11px] ml-auto">
                        {ROLE_LABELS[u.ruolo]}
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {memberIds.size} membri
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// MAILBOXES — read only
function CaselleTab() {
  const gruppi = useGruppiStore((s) => s.gruppi);
  return (
    <section className="bg-card border border-border rounded-md p-5 space-y-3">
      <div className="label-caps">Team mailboxes</div>
      <p className="text-[12px] text-muted-foreground">
        Credentials and the SMTP/IMAP host are configured once during setup.
        They are read-only here.
      </p>
      <div className="overflow-hidden border border-border rounded-md">
        <table className="data-table">
          <thead>
            <tr><th>Team</th><th>Mailbox</th><th>SMTP host</th><th>Status</th></tr>
          </thead>
          <tbody>
            {gruppi.map((g) => (
              <tr key={g.id}>
                <td>{g.nome}</td>
                <td className="tabular-nums">{g.mailbox}</td>
                <td className="text-muted-foreground">smtp.acmeflexo.example:587 (STARTTLS)</td>
                <td><span className="text-[12px] text-success">Active</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// EMAIL TEMPLATES
function TemplateTab() {
  const templates = useTemplatesStore((s) => s.templates);
  const session = useCurrentSession()!;

  return (
    <section className="space-y-4">
      <div className="bg-muted/30 border border-border rounded-md p-3 text-[12px] text-muted-foreground">
        Available variables:{" "}
        <code className="text-foreground">{"{job_number}"}</code>{" "}
        <code className="text-foreground">{"{job_name}"}</code>{" "}
        <code className="text-foreground">{"{customer}"}</code>{" "}
        <code className="text-foreground">{"{user_name}"}</code>
      </div>
      {EMAIL_TEMPLATE_KIND.map((kind) => {
        const t = templates.find((x) => x.kind === kind);
        if (!t) return null;
        return (
          <TemplateEditor
            key={t.id}
            kind={kind}
            oggetto={t.oggetto}
            corpo={t.corpo}
            onSave={async (oggetto, corpo) => {
              const res = await updateEmailTemplateConfig(t.id, { oggetto, corpo, userId: session.userId });
              if (res.ok === false) {
                toast({ title: "Template not saved", description: res.reason, variant: "destructive" });
                return;
              }
              toast({ title: `Template "${EMAIL_TEMPLATE_LABELS[kind]}" saved` });
            }}
          />
        );
      })}
    </section>
  );
}

function TemplateEditor({
  kind,
  oggetto,
  corpo,
  onSave,
}: {
  kind: EmailTemplateKind;
  oggetto: string;
  corpo: string;
  onSave: (oggetto: string, corpo: string) => void | Promise<void>;
}) {
  const [o, setO] = useState(oggetto);
  const [c, setC] = useState(corpo);
  const dirty = o !== oggetto || c !== corpo;
  return (
    <div className="bg-card border border-border rounded-md p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[14px] font-medium">{EMAIL_TEMPLATE_LABELS[kind]}</div>
        <Button size="sm" disabled={!dirty} onClick={() => onSave(o, c)}>Save</Button>
      </div>
      <div className="space-y-2">
        <Label className="text-[12px] text-muted-foreground">Subject</Label>
        <Input value={o} onChange={(e) => setO(e.target.value)} placeholder="(empty)" />
      </div>
      <div className="space-y-2">
        <Label className="text-[12px] text-muted-foreground">Body</Label>
        <Textarea
          value={c}
          onChange={(e) => setC(e.target.value)}
          rows={8}
          placeholder="Empty template. Use the variables above to make it dynamic."
        />
      </div>
    </div>
  );
}
