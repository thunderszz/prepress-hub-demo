import { useCurrentUser } from "@/lib/store";
import { ROLE_LABELS } from "@/lib/types";

export default function Profilo() {
  const u = useCurrentUser();
  if (!u) return null;
  return (
    <div className="space-y-3 max-w-xl">
      <h1>Profile</h1>
      <div className="bg-card border border-border rounded-md p-5 text-[13px] space-y-2">
        <div><span className="text-muted-foreground">Name:</span> {u.nome}</div>
        <div><span className="text-muted-foreground">Email:</span> {u.email}</div>
        <div><span className="text-muted-foreground">Role:</span> {ROLE_LABELS[u.ruolo]}</div>
      </div>
    </div>
  );
}
