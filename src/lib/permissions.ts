// Permissions.
//
// Every canX(session, row, joins) check uses only what an RLS policy can
// see, so each one has a twin in supabase/migrations:
//   - the user's role
//   - membership in `commessa_assegnatari (commessa_id, user_id)`
//   - flags and status on the row (e.g. `presaInCaricoDaUserId`)
//
// Everyone can see every job; designers get quick filters in the UI
// instead of a row filter.

import {
  Commessa,
  CommessaAssegnatario,
  FULL_ACCESS_ROLES,
  Role,
  User,
  UtenteGruppo,
} from "./types";

export interface Session {
  userId: string;
  role: Role;
}

// Basic helpers
export const isFullAccess = (role: Role): boolean => FULL_ACCESS_ROLES.includes(role);

const isAssegnato = (
  ass: CommessaAssegnatario[],
  commessaId: string,
  userId: string,
): boolean => ass.some((a) => a.commessaId === commessaId && a.userId === userId);

// Job permissions

/**
 * Claims a job.
 * - full access: always
 * - designer: only if among the assignees
 * - row constraint: the job must not be claimed already
 */
export function canPrendiInCarico(
  s: Session,
  c: Commessa,
  ass: CommessaAssegnatario[],
): boolean {
  if (c.presaInCaricoDaUserId) return false;
  if (isFullAccess(s.role)) return true;
  if (s.role === "grafico") return isAssegnato(ass, c.id, s.userId);
  return false;
}

/** Advance steps / work on the job, put on hold, send emails, upload files. */
export function canEditWorkflow(
  s: Session,
  c: Pick<Commessa, "id">,
  ass: CommessaAssegnatario[],
): boolean {
  if (isFullAccess(s.role)) return true;
  if (s.role === "grafico") return isAssegnato(ass, c.id, s.userId);
  return false;
}

export const canUploadFile = canEditWorkflow;
export const canSospendere = canEditWorkflow;
export const canAddNotaSottopassaggio = canEditWorkflow;

/** Assign or change assignments. Full access only. */
export const canAssegnare = (s: Session): boolean => isFullAccess(s.role);

/**
 * Who can be assigned a job: active designers, and anyone who,
 * despite another role, belongs to a prepress team — the Design Team
 * Lead sits in studio-e and is assigned like a designer. The DB puts
 * no constraint on the assignee's role.
 */
export function utentiAssegnabili(users: User[], memberships: UtenteGruppo[]): User[] {
  const membri = new Set(memberships.map((m) => m.userId));
  return users.filter((u) => u.attivo && (u.ruolo === "grafico" || membri.has(u.id)));
}

/** Mark as "Shipped" — QC + full access. */
export const canMarkShipped = (s: Session): boolean =>
  isFullAccess(s.role) || s.role === "controllo_qualita";

/**
 * Override of an intermediate workflow step (skips a step).
 * Same conditions as editing: full access or an assigned designer.
 */
export const canForzaturaStep = canEditWorkflow;

/**
 * Direct override to "Shipped". Same people who can mark a job shipped:
 * QC and full access. Unlike canForzaturaStep, so QC can use "Force
 * shipped…" but not "Override step…".
 */
export const canForzaturaSpedito = canMarkShipped;

// MANUAL-MODE: jobs are meant to come from the ERP sync, which does not
// exist yet, so full-access users can create them by hand. Read-only
// roles never create anything (same rule as migration 0005).
// Set back to `false` once the ERP sync is live.
export const canCreateCommessa = (s: Session): boolean => isFullAccess(s.role);

// MANUAL-MODE: customers are meant to come from the ERP sync too. Until
// then, full-access users create them from the Customers page and can fix
// their name (a typo would otherwise stay forever). With the sync the ERP
// name, which is how a customer is recognised, wins again: set both back
// to `false`.
export const canCreateCliente = (s: Session): boolean => isFullAccess(s.role);
export const canRenameCliente = (s: Session): boolean => isFullAccess(s.role);

// Settings: users, teams, mailboxes and email templates.
export const canManageUsers = (s: Session): boolean => isFullAccess(s.role);

// Navigation by role (sidebar)
export type NavKey =
  | "dashboard"
  | "commesse"
  | "clienti"
  | "configurazione";

export const NAV_LABELS: Record<NavKey, string> = {
  dashboard: "Dashboard",
  commesse: "Jobs",
  clienti: "Customers",
  configurazione: "Settings",
};

export const ROUTE_BY_NAV: Record<NavKey, string> = {
  dashboard: "/",
  commesse: "/jobs",
  clienti: "/customers",
  configurazione: "/settings",
};

export const NAV_BY_ROLE: Record<Role, NavKey[]> = {
  responsabile_produzione: ["dashboard", "commesse", "clienti", "configurazione"],
  responsabile_ufficio_grafico: ["dashboard", "commesse", "clienti", "configurazione"],
  responsabile_commerciale: ["dashboard", "commesse", "clienti"],
  amministrazione: ["dashboard", "commesse", "clienti"],
  controllo_qualita: ["dashboard", "commesse"],
  grafico: ["dashboard", "commesse"],
};

export function canAccessRoute(role: Role, pathname: string): boolean {
  if (pathname === "/profile" || pathname === "/login" || pathname === "/logout") return true;
  const allowed = NAV_BY_ROLE[role] ?? [];
  for (const k of allowed) {
    const r = ROUTE_BY_NAV[k];
    if (pathname === r) return true;
    if (r !== "/" && pathname.startsWith(r + "/")) return true;
  }
  if (allowed.includes("commesse") && pathname.startsWith("/jobs/")) return true;
  if (allowed.includes("clienti") && pathname.startsWith("/customers/")) return true;
  if (allowed.includes("configurazione") && pathname.startsWith("/settings/")) return true;
  return false;
}
