import { beforeEach, describe, expect, it, vi } from "vitest";

const eq = vi.fn(() => Promise.resolve({ error: null }));
const update = vi.fn(() => ({ eq }));
const from = vi.fn((..._args: unknown[]) => ({ update }));

vi.mock("./supabase", () => ({
  hasSupabaseConfig: true,
  supabase: { from: (...args: unknown[]) => from(...args) },
}));

import { flushPendingWrites, persistClientePatch, persistCommessaPatch } from "./supabaseWrites";

describe("persistCommessaPatch", () => {
  beforeEach(() => {
    from.mockClear();
    update.mockClear();
    eq.mockClear();
  });

  it("persists the esitoProvaColore reset as null", async () => {
    persistCommessaPatch("commessa-1", { esitoProvaColore: undefined });
    await flushPendingWrites();

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ esito_prova_colore: null }),
    );
    expect(eq).toHaveBeenCalledWith("id", "commessa-1");
  });

  it("persists a set outcome unchanged", async () => {
    persistCommessaPatch("commessa-1", { esitoProvaColore: "spedita_approvata" });
    await flushPendingWrites();

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ esito_prova_colore: "spedita_approvata" }),
    );
  });
});

describe("persistClientePatch", () => {
  beforeEach(() => {
    from.mockClear();
    update.mockClear();
    eq.mockClear();
  });

  it("persists customer email, phone and notes (CLI-04)", async () => {
    persistClientePatch("cliente-1", {
      email: "customer@example.com",
      telefono: "0421 123456",
      note: "referente: Mario",
    });
    await flushPendingWrites();

    expect(from).toHaveBeenCalledWith("clienti");
    expect(update).toHaveBeenCalledWith({
      email: "customer@example.com",
      telefono: "0421 123456",
      note: "referente: Mario",
    });
    expect(eq).toHaveBeenCalledWith("id", "cliente-1");
  });

  it("persists a cleared field as null", async () => {
    persistClientePatch("cliente-1", { email: undefined });
    await flushPendingWrites();

    expect(update).toHaveBeenCalledWith({ email: null });
  });

  it("does not touch the DB if the patch has no editable fields", async () => {
    persistClientePatch("cliente-1", {});
    await flushPendingWrites();

    expect(from).not.toHaveBeenCalled();
  });
});
