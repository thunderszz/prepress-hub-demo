import { beforeEach, describe, expect, it } from "vitest";
import { buildSeed } from "./seed";
import { createMockClient, resetDemoData } from "./mockClient";
import { canTransition } from "../workflow";

describe("demo seed", () => {
  const db = buildSeed(Date.UTC(2026, 9, 6, 12));

  it("every child row points to an existing job", () => {
    const ids = new Set(db.commesse.map((c) => c.id));
    for (const t of ["eventi", "email_inviate", "file_commessa", "correzioni", "sospensioni", "commessa_assegnatari"] as const) {
      for (const r of db[t]) expect(ids.has(r.commessa_id)).toBe(true);
    }
  });

  it("covers every workflow status with consistent data", () => {
    const stati = new Set(db.commesse.map((c) => c.stato));
    expect(stati.size).toBe(8);
    for (const c of db.commesse) {
      if (c.stato === "in_attesa_approvazione_caduta") {
        expect(["non_serve", "spedita_approvata"]).toContain(c.esito_prova_colore);
      }
      if (c.stato === "spedito") expect(c.spedita_il).toBeTruthy();
      if (c.sospensione_attiva_id) {
        expect(db.sospensioni.some((s) => s.id === c.sospensione_attiva_id && !s.chiusa_il)).toBe(true);
      }
    }
    expect(canTransition("in_attesa_prova_colore", "in_attesa_approvazione_caduta", { esitoProvaColore: "non_serve" }).ok).toBe(true);
  });

  it("only uses addresses on reserved .example domains", () => {
    const emails = [
      ...db.utenti.map((u) => u.email),
      ...db.clienti.flatMap((c) => (c.email ? [c.email] : [])),
      ...db.email_inviate.flatMap((e) => [e.mittente, ...e.destinatari, ...e.cc]),
    ];
    for (const e of emails) expect(e).toMatch(/\.example$/);
  });
});

describe("mock client", () => {
  beforeEach(() => resetDemoData());

  it("insert + select + single returns the row with defaults", async () => {
    const client = createMockClient();
    const { data, error } = await client
      .from("clienti")
      .insert({ nome: "New", nome_chiave: "new" })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data.id).toBeTruthy();
    expect(data.creato_il).toBeTruthy();
    const { data: trovato } = await client.from("clienti").select("*").eq("nome_chiave", "new").maybeSingle();
    expect(trovato?.id).toBe(data.id);
  });

  it("enforces unique job numbers (23505)", async () => {
    const client = createMockClient();
    const { data: esistenti } = await client.from("commesse").select("*");
    const { error } = await client
      .from("commesse")
      .insert({ numero_commessa: esistenti[0].numero_commessa, cliente_id: esistenti[0].cliente_id, nome_lavoro: "Duplicate" })
      .select()
      .single();
    expect(error?.code).toBe("23505");
  });

  it("login only with the demo password", async () => {
    const client = createMockClient();
    const ko = await client.auth.signInWithPassword({ email: "giulia.ferri@acmeflexo.example", password: "x" });
    expect(ko.error).toBeTruthy();
    const ok = await client.auth.signInWithPassword({ email: "giulia.ferri@acmeflexo.example", password: "demo" });
    expect(ok.error).toBeNull();
    const { data } = await client.auth.getUser();
    expect(data.user?.email).toBe("giulia.ferri@acmeflexo.example");
  });
});
