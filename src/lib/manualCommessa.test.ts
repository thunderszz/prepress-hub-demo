import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("./supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import {
  createClienteManuale,
  createCommessaManuale,
  renameClienteManuale,
} from "./manualCommessa";
import { useClientiStore, useCommesseStore, useEventiStore } from "./store";
import type { Cliente } from "./types";

const cliente: Cliente = {
  id: "cli-1",
  nome: "Contoso Waters Inc.",
  nomeChiave: "contoso waters inc.",
  creatoIl: "2026-01-01T00:00:00.000Z",
};

/** A `commesse` row as Postgres would return it after the insert. */
function commessaRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "com-1",
    numero_commessa: "2026/8812",
    cliente_id: "cli-1",
    nome_lavoro: "1.5L label",
    stampatore: null,
    cod_stampatore: null,
    soggetto: null,
    cod_soggetto: null,
    rif_cliente: null,
    cod_articolo: null,
    numero_ordine: null,
    operatore_repro: null,
    stato: "disponibile",
    sospensione_attiva_id: null,
    presa_in_carico_da_user_id: null,
    presa_in_carico_il: null,
    revisioni_pdf: 0,
    esito_prova_colore: null,
    esito_caduta: null,
    data_consegna_prevista: null,
    termine_primo_pdf: null,
    note_interne: null,
    spedita_il: null,
    creata_il: "2026-09-17T08:00:00.000Z",
    aggiornata_il: "2026-09-17T08:00:00.000Z",
    annullata_il: null,
    ...overrides,
  };
}

/**
 * Table stub: covers both `.insert(...).select().single()` and the
 * `.select().eq().maybeSingle()` check that precedes customer creation.
 * `omonima` = row returned by that check (null = no duplicate in the DB).
 */
function insertSingle(result: { data?: unknown; error?: unknown; omonima?: unknown }) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn().mockResolvedValue({ data: result.omonima ?? null, error: null }),
      })),
    })),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: result.data ?? null,
          error: result.error ?? null,
        }),
      })),
    })),
  };
}

beforeEach(() => {
  useClientiStore.getState().setClienti([cliente]);
  useCommesseStore.getState().setCommesse([]);
  useEventiStore.getState().setEventi([]);
  fromMock.mockReset();
});

describe("createCommessaManuale", () => {
  it("rejects an empty job number without touching the database", async () => {
    const r = await createCommessaManuale(
      { numeroCommessa: "   ", nomeLavoro: "Label", clienteId: "cli-1" },
      "user-1",
    );

    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toMatch(/job number/i);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects an empty job name without touching the database", async () => {
    const r = await createCommessaManuale(
      { numeroCommessa: "2026/8812", nomeLavoro: "  ", clienteId: "cli-1" },
      "user-1",
    );

    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toMatch(/job name/i);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects when there is neither a selected nor a new customer", async () => {
    const r = await createCommessaManuale(
      { numeroCommessa: "2026/8812", nomeLavoro: "Label" },
      "user-1",
    );

    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toMatch(/customer/i);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("creates the job on an existing customer and puts it in the store", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "commesse") return insertSingle({ data: commessaRow() });
      if (table === "eventi") return { insert: vi.fn().mockResolvedValue({ error: null }) };
      throw new Error(`unexpected table: ${table}`);
    });

    const r = await createCommessaManuale(
      { numeroCommessa: "2026/8812", nomeLavoro: "1.5L label", clienteId: "cli-1" },
      "user-1",
    );

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commessa.numeroCommessa).toBe("2026/8812");
    expect(useCommesseStore.getState().commesse).toHaveLength(1);
  });

  it("writes the creation event with its author into the history", async () => {
    const eventoInsert = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockImplementation((table: string) => {
      if (table === "commesse") return insertSingle({ data: commessaRow() });
      if (table === "eventi") return { insert: eventoInsert };
      throw new Error(`unexpected table: ${table}`);
    });

    await createCommessaManuale(
      { numeroCommessa: "2026/8812", nomeLavoro: "1.5L label", clienteId: "cli-1" },
      "user-1",
    );

    expect(eventoInsert).toHaveBeenCalledTimes(1);
    const row = eventoInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.tipo).toBe("creazione_manuale");
    expect(row.user_id).toBe("user-1");
    expect(row.commessa_id).toBe("com-1");
  });

  it("creates the new customer and uses it for the job", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "clienti") {
        return insertSingle({
          data: {
            id: "cli-2",
            nome: "Fabrikam Pasta Ltd",
            nome_chiave: "fabrikam pasta ltd",
            email: "ordini@fabrikampasta.example",
            telefono: null,
            note: null,
            creato_il: "2026-09-17T08:00:00.000Z",
          },
        });
      }
      if (table === "commesse") return insertSingle({ data: commessaRow({ cliente_id: "cli-2" }) });
      if (table === "eventi") return { insert: vi.fn().mockResolvedValue({ error: null }) };
      throw new Error(`unexpected table: ${table}`);
    });

    const r = await createCommessaManuale(
      {
        numeroCommessa: "2026/8813",
        nomeLavoro: "500g carton",
        nuovoCliente: { nome: "Fabrikam Pasta Ltd", email: "ordini@fabrikampasta.example" },
      },
      "user-1",
    );

    expect(r.ok).toBe(true);
    expect(useClientiStore.getState().clienti.map((c) => c.id)).toContain("cli-2");
  });

  it("reuses the existing customer when the new name matches up to case and spaces", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "commesse") return insertSingle({ data: commessaRow() });
      if (table === "eventi") return { insert: vi.fn().mockResolvedValue({ error: null }) };
      throw new Error(`unexpected table: ${table}`);
    });

    const r = await createCommessaManuale(
      {
        numeroCommessa: "2026/8814",
        nomeLavoro: "Label",
        nuovoCliente: { nome: "  CONTOSO WATERS INC.  " },
      },
      "user-1",
    );

    expect(r.ok).toBe(true);
    expect(useClientiStore.getState().clienti).toHaveLength(1);
    expect(fromMock).not.toHaveBeenCalledWith("clienti");
  });

  it("turns the unique violation into a readable message", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "commesse") {
        return insertSingle({
          error: { code: "23505", message: 'duplicate key value violates unique constraint "commesse_numero_commessa_key"' },
        });
      }
      throw new Error(`unexpected table: ${table}`);
    });

    const r = await createCommessaManuale(
      { numeroCommessa: "2026/8812", nomeLavoro: "Label", clienteId: "cli-1" },
      "user-1",
    );

    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.reason).toContain("2026/8812");
      expect(r.reason).not.toContain("duplicate key");
    }
    expect(useCommesseStore.getState().commesse).toHaveLength(0);
  });

  it("catches a duplicate already in the store without querying the database", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "commesse") return insertSingle({ data: commessaRow() });
      if (table === "eventi") return { insert: vi.fn().mockResolvedValue({ error: null }) };
      throw new Error(`unexpected table: ${table}`);
    });
    await createCommessaManuale(
      { numeroCommessa: "2026/8812", nomeLavoro: "Label", clienteId: "cli-1" },
      "user-1",
    );
    fromMock.mockClear();

    const r = await createCommessaManuale(
      { numeroCommessa: "2026/8812", nomeLavoro: "Another job", clienteId: "cli-1" },
      "user-1",
    );

    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toContain("2026/8812");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("does not leave the job in the store when the insert fails", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "commesse") {
        return insertSingle({ error: { code: "42501", message: "new row violates row-level security policy" } });
      }
      throw new Error(`unexpected table: ${table}`);
    });

    const r = await createCommessaManuale(
      { numeroCommessa: "2026/8812", nomeLavoro: "Label", clienteId: "cli-1" },
      "user-1",
    );

    expect(r.ok).toBe(false);
    expect(useCommesseStore.getState().commesse).toHaveLength(0);
  });

  it("turns the database permission error into a readable message", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "commesse") {
        return insertSingle({
          error: { code: "42501", message: "new row violates row-level security policy" },
        });
      }
      throw new Error(`unexpected table: ${table}`);
    });

    const r = await createCommessaManuale(
      { numeroCommessa: "2026/8812", nomeLavoro: "Label", clienteId: "cli-1" },
      "user-1",
    );

    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.reason).toMatch(/production manager/i);
      expect(r.reason).not.toContain("row-level security");
    }
  });

  it("detects the duplicate in the database before creating the new customer", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "commesse") return insertSingle({ omonima: { id: "com-esistente" } });
      throw new Error(`unexpected table: ${table}`);
    });

    const r = await createCommessaManuale(
      {
        numeroCommessa: "2026/8812",
        nomeLavoro: "Label",
        nuovoCliente: { nome: "Fabrikam Pasta Ltd" },
      },
      "user-1",
    );

    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toContain("2026/8812");
    // The customer must not be created: without a transaction it would be orphaned.
    expect(fromMock).not.toHaveBeenCalledWith("clienti");
    expect(useClientiStore.getState().clienti).toHaveLength(1);
  });

  it("returns a warning when the job is created but the history misses the event", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "commesse") return insertSingle({ data: commessaRow() });
      if (table === "eventi") {
        return {
          insert: vi.fn().mockResolvedValue({
            error: { code: "42501", message: "new row violates row-level security policy" },
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    });

    const r = await createCommessaManuale(
      { numeroCommessa: "2026/8812", nomeLavoro: "Label", clienteId: "cli-1" },
      "user-1",
    );

    // The job exists: ok:false would make the user retry and duplicate it.
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.avviso).toMatch(/history/i);
    expect(useCommesseStore.getState().commesse).toHaveLength(1);
    // No ghost event in the store: it is not in the database.
    expect(useEventiStore.getState().eventi).toHaveLength(0);
  });

  it("rejects a malformed email for the new customer before writing anything", async () => {
    const commesse = insertSingle({ data: commessaRow() });
    const clienti = insertSingle({ data: clienteRow() });
    fromMock.mockImplementation((table: string) => {
      if (table === "commesse") return commesse;
      if (table === "clienti") return clienti;
      if (table === "eventi") return { insert: vi.fn().mockResolvedValue({ error: null }) };
      throw new Error(`unexpected table: ${table}`);
    });

    const r = await createCommessaManuale(
      {
        numeroCommessa: "2026/8815",
        nomeLavoro: "Label",
        nuovoCliente: { nome: "Fabrikam Pasta Ltd", email: "orders@fabrikampasta" },
      },
      "user-1",
    );

    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toMatch(/email/i);
    expect(clienti.insert).not.toHaveBeenCalled();
    expect(commesse.insert).not.toHaveBeenCalled();
  });
});

/** A `clienti` row as Postgres would return it after the insert. */
function clienteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cli-2",
    nome: "Fabrikam Pasta Ltd",
    nome_chiave: "fabrikam pasta ltd",
    email: null,
    telefono: null,
    note: null,
    creato_il: "2026-09-21T08:00:00.000Z",
    ...overrides,
  };
}

describe("createClienteManuale", () => {
  it("creates the customer with all fields and adds it to the list", async () => {
    const clienti = insertSingle({
      data: clienteRow({
        email: "ordini@fabrikampasta.example",
        telefono: "049 8751234",
        note: "Deliveries in the morning only",
      }),
    });
    fromMock.mockImplementation((table: string) => {
      if (table === "clienti") return clienti;
      throw new Error(`unexpected table: ${table}`);
    });

    const r = await createClienteManuale({
      nome: "  Fabrikam Pasta Ltd ",
      email: "ordini@fabrikampasta.example",
      telefono: "049 8751234",
      note: "Deliveries in the morning only",
    });

    expect(r.ok).toBe(true);
    expect(clienti.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        nome: "Fabrikam Pasta Ltd",
        nome_chiave: "fabrikam pasta ltd",
        email: "ordini@fabrikampasta.example",
        telefono: "049 8751234",
        note: "Deliveries in the morning only",
      }),
    );
    const creato = useClientiStore.getState().clienti.find((c) => c.id === "cli-2");
    expect(creato?.note).toBe("Deliveries in the morning only");
  });

  it("saves blank optional fields as empty", async () => {
    const clienti = insertSingle({ data: clienteRow() });
    fromMock.mockImplementation((table: string) => {
      if (table === "clienti") return clienti;
      throw new Error(`unexpected table: ${table}`);
    });

    await createClienteManuale({ nome: "Fabrikam Pasta Ltd", email: "  ", telefono: "", note: "   " });

    expect(clienti.insert).toHaveBeenCalledWith(
      expect.objectContaining({ email: null, telefono: null, note: null }),
    );
  });

  it("rejects an empty name without touching the database", async () => {
    fromMock.mockImplementation(() => insertSingle({ data: clienteRow() }));

    const r = await createClienteManuale({ nome: "   ", email: "ordini@fabrikampasta.example" });

    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toMatch(/name/i);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed email without touching the database", async () => {
    fromMock.mockImplementation(() => insertSingle({ data: clienteRow() }));

    const r = await createClienteManuale({ nome: "Fabrikam Pasta Ltd", email: "orders@fabrikampasta" });

    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toMatch(/email/i);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects a name already listed up to case and spaces, without touching the database", async () => {
    fromMock.mockImplementation(() => insertSingle({ data: clienteRow() }));

    const r = await createClienteManuale({ nome: "  CONTOSO WATERS INC. " });

    expect(r.ok).toBe(false);
    // The message names the existing customer, spelled as in the list.
    if (r.ok === false) expect(r.reason).toContain("Contoso Waters Inc.");
    expect(fromMock).not.toHaveBeenCalled();
    expect(useClientiStore.getState().clienti).toHaveLength(1);
  });

  it("turns a duplicate found by the database into a readable message", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "clienti") {
        return insertSingle({
          error: { code: "23505", message: 'duplicate key value violates unique constraint "clienti_nome_chiave_key"' },
        });
      }
      throw new Error(`unexpected table: ${table}`);
    });

    const r = await createClienteManuale({ nome: "Fabrikam Pasta Ltd" });

    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.reason).toContain("Fabrikam Pasta Ltd");
      expect(r.reason).not.toContain("duplicate key");
    }
    expect(useClientiStore.getState().clienti).toHaveLength(1);
  });

  it("turns the database permission error into a readable message", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "clienti") {
        return insertSingle({
          error: { code: "42501", message: "new row violates row-level security policy for table \"clienti\"" },
        });
      }
      throw new Error(`unexpected table: ${table}`);
    });

    const r = await createClienteManuale({ nome: "Fabrikam Pasta Ltd" });

    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.reason).toMatch(/production manager/i);
      expect(r.reason).not.toContain("row-level security");
    }
  });

});

/** `clienti` stub for `.update(...).eq("id", ...).select().single()`. */
function updateSingle(result: { data?: unknown; error?: unknown }) {
  const eq = vi.fn(() => ({
    select: vi.fn(() => ({
      single: vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null }),
    })),
  }));
  return { update: vi.fn(() => ({ eq })), eq };
}

describe("renameClienteManuale", () => {
  it("fixes the name in the database and in the list", async () => {
    const clienti = updateSingle({
      data: clienteRow({
        id: "cli-1",
        nome: "Contoso Waters Ltd",
        nome_chiave: "contoso waters ltd",
        creato_il: "2026-01-01T00:00:00.000Z",
      }),
    });
    fromMock.mockImplementation((table: string) => {
      if (table === "clienti") return clienti;
      throw new Error(`unexpected table: ${table}`);
    });

    const r = await renameClienteManuale("cli-1", "  Contoso Waters Ltd ");

    expect(r.ok).toBe(true);
    expect(clienti.update).toHaveBeenCalledWith({
      nome: "Contoso Waters Ltd",
      nome_chiave: "contoso waters ltd",
    });
    expect(clienti.eq).toHaveBeenCalledWith("id", "cli-1");
    const [rinominato] = useClientiStore.getState().clienti;
    expect(rinominato.nome).toBe("Contoso Waters Ltd");
    expect(rinominato.nomeChiave).toBe("contoso waters ltd");
  });

  /** Stub that would really rename if reached: the test fails on the outcome, not on a crash. */
  const rinominaComunque = () =>
    fromMock.mockImplementation(() =>
      updateSingle({ data: clienteRow({ id: "cli-1", nome: "Qualsiasi", nome_chiave: "qualsiasi" }) }),
    );

  it("rejects an empty name without touching the database", async () => {
    rinominaComunque();

    const r = await renameClienteManuale("cli-1", "   ");

    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toMatch(/name/i);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejects the name of another listed customer, without touching the database", async () => {
    const altro: Cliente = {
      id: "cli-2",
      nome: "Fabrikam Pasta Ltd",
      nomeChiave: "fabrikam pasta ltd",
      creatoIl: "2026-02-01T00:00:00.000Z",
    };
    useClientiStore.getState().setClienti([cliente, altro]);
    rinominaComunque();

    const r = await renameClienteManuale("cli-1", " FABRIKAM PASTA LTD");

    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toContain("Fabrikam Pasta Ltd");
    expect(fromMock).not.toHaveBeenCalled();
    expect(useClientiStore.getState().clienti[0].nome).toBe("Contoso Waters Inc.");
  });

  it("accepts changing only case and spaces of the same customer", async () => {
    const clienti = updateSingle({
      data: clienteRow({ id: "cli-1", nome: "CONTOSO WATERS INC.", nome_chiave: "contoso waters inc." }),
    });
    fromMock.mockImplementation(() => clienti);

    const r = await renameClienteManuale("cli-1", "CONTOSO WATERS INC.");

    expect(r.ok).toBe(true);
    expect(clienti.update).toHaveBeenCalledWith({
      nome: "CONTOSO WATERS INC.",
      nome_chiave: "contoso waters inc.",
    });
  });

  it("writes nothing if the name did not change", async () => {
    rinominaComunque();

    const r = await renameClienteManuale("cli-1", " Contoso Waters Inc. ");

    expect(r.ok).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("turns a duplicate found by the database into a readable message", async () => {
    fromMock.mockImplementation(() =>
      updateSingle({
        error: { code: "23505", message: 'duplicate key value violates unique constraint "clienti_nome_chiave_key"' },
      }),
    );

    const r = await renameClienteManuale("cli-1", "Fabrikam Pasta Ltd");

    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.reason).toContain("Fabrikam Pasta Ltd");
      expect(r.reason).not.toContain("duplicate key");
    }
    expect(useClientiStore.getState().clienti[0].nome).toBe("Contoso Waters Inc.");
  });

  it("does not report as saved a name the database did not update", async () => {
    // No row touched (e.g. hidden by the policy): PostgREST answers
    // PGRST116 to `.single()` instead of a permission error.
    fromMock.mockImplementation(() =>
      updateSingle({
        error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
      }),
    );

    const r = await renameClienteManuale("cli-1", "Contoso Waters Ltd");

    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).not.toContain("JSON object");
    expect(useClientiStore.getState().clienti[0].nome).toBe("Contoso Waters Inc.");
  });

  it("rejects a customer that is not listed without touching the database", async () => {
    rinominaComunque();

    const r = await renameClienteManuale("cli-inesistente", "Fabrikam Pasta Ltd");

    expect(r.ok).toBe(false);
    expect(fromMock).not.toHaveBeenCalled();
  });

});
