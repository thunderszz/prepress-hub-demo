import { hasSupabaseConfig, supabase } from "./supabase";
import { isDemoMode } from "./supabaseWrites";
import {
  useTemplatesStore,
  useUsersStore,
  useUtenteGruppiStore,
} from "./store";
import type { EmailTemplate, Role, User } from "./types";
import type { Database } from "./database.types";

type ConfigResult<T = never> =
  | { ok: true; value?: T }
  | { ok: false; reason: string };

const writesDisabled = () => !hasSupabaseConfig || isDemoMode();

function errorReason(error: { message?: string } | null | undefined): string {
  return error?.message || "Database write failed.";
}

async function functionErrorReason(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : "Edge Function failed.";
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export function initialsForName(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join("") || "UT";
}

export async function addUserProfile(data: {
  nome: string;
  email: string;
  ruolo: Role;
}): Promise<ConfigResult<User>> {
  const nome = data.nome.trim();
  const email = data.email.trim().toLowerCase();
  if (!nome || !email) return { ok: false, reason: "Name and email are required." };

  const user: User = {
    id: crypto.randomUUID(),
    nome,
    email,
    ruolo: data.ruolo,
    attivo: true,
    iniziali: initialsForName(nome),
  };

  if (!writesDisabled()) {
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
    const { data: payload, error } = await supabase.functions.invoke("invite-user", {
      body: { nome, email, ruolo: data.ruolo, redirectTo },
    });
    if (error) return { ok: false, reason: await functionErrorReason(error) };
    const returnedUser = (payload as { user?: User } | null)?.user;
    if (!returnedUser) return { ok: false, reason: "Unexpected response from the invite server." };
    useUsersStore.getState().setUsers([...useUsersStore.getState().users, returnedUser]);
    return { ok: true, value: returnedUser };
  }

  useUsersStore.getState().setUsers([...useUsersStore.getState().users, user]);
  return { ok: true, value: user };
}

export async function updateUserProfile(
  id: string,
  patch: Partial<Pick<User, "nome" | "email" | "ruolo" | "attivo">>,
): Promise<ConfigResult> {
  const nextPatch: Partial<User> = { ...patch };
  if (patch.nome !== undefined) {
    nextPatch.nome = patch.nome.trim();
    nextPatch.iniziali = initialsForName(patch.nome);
  }
  if (patch.email !== undefined) nextPatch.email = patch.email.trim().toLowerCase();

  if (!writesDisabled()) {
    const row: Database["public"]["Tables"]["utenti"]["Update"] = {};
    if (nextPatch.nome !== undefined) row.nome = nextPatch.nome;
    if (nextPatch.email !== undefined) row.email = nextPatch.email;
    if (nextPatch.ruolo !== undefined) row.ruolo = nextPatch.ruolo;
    if (nextPatch.attivo !== undefined) row.attivo = nextPatch.attivo;
    if (nextPatch.iniziali !== undefined) row.iniziali = nextPatch.iniziali;
    const { error } = await supabase.from("utenti").update(row).eq("id", id);
    if (error) return { ok: false, reason: errorReason(error) };
  }

  useUsersStore.getState().updateUser(id, nextPatch);
  return { ok: true };
}

export async function setUserGroupMembership(
  userId: string,
  gruppoId: string,
  enabled: boolean,
): Promise<ConfigResult> {
  if (!writesDisabled()) {
    const query = enabled
      ? supabase.from("utente_gruppi").insert({ utente_id: userId, gruppo_id: gruppoId })
      : supabase
        .from("utente_gruppi")
        .delete()
        .eq("utente_id", userId)
        .eq("gruppo_id", gruppoId);
    const { error } = await query;
    if (error) return { ok: false, reason: errorReason(error) };
  }

  const store = useUtenteGruppiStore.getState();
  if (enabled) store.addMembership(userId, gruppoId);
  else store.removeMembership(userId, gruppoId);
  return { ok: true };
}

export async function updateEmailTemplateConfig(
  id: string,
  data: {
    oggetto: string;
    corpo: string;
    userId: string;
  },
): Promise<ConfigResult> {
  const patch: Partial<EmailTemplate> = {
    oggetto: data.oggetto,
    corpo: data.corpo,
    ultimaModificaDaUserId: data.userId,
  };
  const ultimaModificaIl = new Date().toISOString();

  if (!writesDisabled()) {
    const { error } = await supabase
      .from("email_template")
      .update({
        oggetto: data.oggetto,
        corpo: data.corpo,
        ultima_modifica_da_user_id: data.userId,
        ultima_modifica_il: ultimaModificaIl,
      })
      .eq("id", id);
    if (error) return { ok: false, reason: errorReason(error) };
  }

  useTemplatesStore.getState().updateTemplate(id, {
    ...patch,
    ultimaModificaIl,
  });
  return { ok: true };
}

export async function sendPasswordReset(email: string): Promise<ConfigResult> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return { ok: false, reason: "Email is required." };
  if (writesDisabled()) {
    return { ok: false, reason: "Password reset is only available with a configured backend." };
  }

  const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo });
  if (error) return { ok: false, reason: errorReason(error) };
  return { ok: true };
}
