import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ROLES = [
  "responsabile_produzione",
  "responsabile_ufficio_grafico",
  "responsabile_commerciale",
  "amministrazione",
  "controllo_qualita",
  "grafico",
] as const;
type Role = (typeof ROLES)[number];

const FULL_ACCESS = new Set<Role>(["responsabile_produzione", "responsabile_ufficio_grafico"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface InviteRequest {
  nome: string;
  email: string;
  ruolo: Role;
  redirectTo?: string;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function initialsForName(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join("") || "UT";
}

function cleanRedirectTo(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "Method not allowed." });

  let p: InviteRequest;
  try {
    p = await req.json();
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  const nome = typeof p.nome === "string" ? p.nome.trim() : "";
  const email = typeof p.email === "string" ? p.email.trim().toLowerCase() : "";
  if (!nome) return json(400, { error: "Name is required." });
  if (!EMAIL_RE.test(email)) return json(400, { error: "Invalid email." });
  if (!ROLES.includes(p.ruolo)) return json(400, { error: "Invalid role." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user?.email) return json(401, { error: "Not authenticated." });

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: caller, error: callerError } = await admin
    .from("utenti")
    .select("ruolo, attivo")
    .ilike("email", authData.user.email)
    .maybeSingle();
  if (callerError) return json(500, { error: `Permission check failed: ${callerError.message}` });
  if (!caller?.attivo || !FULL_ACCESS.has(caller.ruolo as Role)) {
    return json(403, { error: "Permission denied." });
  }

  const { data: existingAppUser } = await admin
    .from("utenti")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (existingAppUser) return json(409, { error: "A user with this email already exists." });

  const redirectTo = cleanRedirectTo(p.redirectTo);
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { nome },
    redirectTo,
  });
  if (inviteError) return json(502, { error: `Auth invite not sent: ${inviteError.message}` });

  const user = {
    id: crypto.randomUUID(),
    nome,
    email,
    ruolo: p.ruolo,
    attivo: true,
    iniziali: initialsForName(nome),
  };
  const { data: row, error: insertError } = await admin
    .from("utenti")
    .insert(user)
    .select("id, nome, email, ruolo, attivo, iniziali")
    .single();
  if (insertError) {
    return json(500, { error: `User profile not created: ${insertError.message}` });
  }

  return json(200, { ok: true, user: row });
});
