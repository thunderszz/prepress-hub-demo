// =============================================================
// Permissions — RLS-mappable (PHASE 1)
//
// Every canX(session, row, joins) function must be expressible as a
// SQL condition on the row (so it can become an RLS policy):
//   - the user's role
//   - membership in `commessa_assegnatari (commessa_id, user_id)`
//   - flags/status on the row (e.g. `presaInCaricoDaUserId`)
//
// Job visibility (§4.6) is "everyone sees everything": designers get
// quick FILTERS in the UI, not an RLS filter.
// =============================================================

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

// -------------------------------------------------------------
// Basic helpers
// -------------------------------------------------------------
export const isFullAccess = (role: Role): boolean => FULL_ACCESS_ROLES.includes(role);

export const isAssegnato = (
  ass: CommessaAssegnatario[],
  commessaId: string,
  userId: string,
): boolean => ass.some((a) => a.commessaId === commessaId && a.userId === userId);

// -------------------------------------------------------------
// Job permissions
// -------------------------------------------------------------

/** §4.6: everyone sees every job. */
export const canSeeAllCommesse = (_s: Session): boolean => true;

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

export const canSendEmail = canEditWorkflow;
export const canUploadFile = canEditWorkflow;
export const canSospendere = canEditWorkflow;
export const canAddNotaSottopassaggio = canEditWorkflow;

/** Assign or change assignments. Full access only. */
export const canAssegnare = (s: Session): boolean => isFullAccess(s.role);

/**
 * Who can receive a job (§4.3, WF-03): active designers and anyone who,
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
 * Direct override to "Shipped" (shortcut). Aligned with who can mark a
 * job shipped: QC + full access. NB: distinct from canForzaturaStep — QC
 * can use "Force shipped…" but not "Override step…".
 */
export const canForzaturaSpedito = canMarkShipped;

// MANUAL-MODE: §16/SYN-01 forbid manual creation because jobs are born
// in the ERP, but the ERP API is not available yet and the portal must be
// testable. Full access only, like `canEditCliente`: read-only roles
// never create anything (same line as migration 0005).
// Set back to `false` once the ERP sync is live.
export const canCreateCommessa = (s: Session): boolean => isFullAccess(s.role);

// MANUAL-MODE: CLI-01 wants customers created by the ERP sync only.
// Until then, full-access users create them from the Customers page and
// can fix their name (a typo would otherwise stay forever). With the sync
// the name becomes the ERP one again — the key used to recognise the
// customer: set both back to `false`.
export const canCreateCliente = (s: Session): boolean => isFullAccess(s.role);
export const canRenameCliente = (s: Session): boolean => isFullAccess(s.role);

// -------------------------------------------------------------
// Customers and settings
// -------------------------------------------------------------
export const canEditCliente = (s: Session): boolean => isFullAccess(s.role);
export const canManageUsers = (s: Session): boolean => isFullAccess(s.role);
export const canManageGruppi = (s: Session): boolean => isFullAccess(s.role);
export const canManageTemplates = (s: Session): boolean => isFullAccess(s.role);
export const canManageMailboxes = (s: Session): boolean => isFullAccess(s.role);

// -------------------------------------------------------------
// Navigation by role (sidebar)
// -------------------------------------------------------------
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
