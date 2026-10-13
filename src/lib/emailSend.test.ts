import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock of the Supabase client: tests must not touch the network.
const invokeMock = vi.fn();
vi.mock("./supabase", () => ({
  supabase: {
    // lazy: vi.mock is hoisted, a direct reference to invokeMock is not initialised yet
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

import { sendEmailViaFunction } from "./emailSend";

const EMAIL_ROW = {
  id: "email-1",
  commessa_id: "commessa-1",
  data: "2026-06-10T10:00:00.000Z",
  template_kind: "pdf",
  mittente: "studio-a@acmeflexo.example",
  destinatari: ["cliente@example.test"],
  oggetto: "PDF pronto",
  corpo: "PDF attached.",
  allegato_nome: "prova.pdf",
  allegato_path: "commessa-1/prova-abc.pdf",
  allegato_disponibile: true,
  inviata_da_user_id: "user-1",
  stato: "inviata",
};

beforeEach(() => {
  invokeMock.mockReset();
});

describe("sendEmailViaFunction", () => {
  it("successful send: maps the row archived by the server", async () => {
    invokeMock.mockResolvedValue({
      data: { ok: true, stato: "inviata", reason: null, email: EMAIL_ROW },
      error: null,
    });
    const res = await sendEmailViaFunction({
      commessaId: "commessa-1",
      kind: "pdf",
      mittente: "studio-a@acmeflexo.example",
      destinatari: ["cliente@example.test"],
      oggetto: "PDF pronto",
      corpo: "PDF attached.",
    });
    expect(res.sent).toBe(true);
    expect(res.email?.id).toBe("email-1");
    expect(res.email?.stato).toBe("inviata");
    expect(res.email?.allegatoNome).toBe("prova.pdf");
    expect(invokeMock).toHaveBeenCalledWith("send-email", expect.objectContaining({
      body: expect.objectContaining({ commessaId: "commessa-1", kind: "pdf" }),
    }));
  });

  it("failed but archived send (MAIL-07): returns the row with error status", async () => {
    invokeMock.mockResolvedValue({
      data: {
        ok: false,
        stato: "errore",
        reason: "Provider 401: unauthorized",
        email: { ...EMAIL_ROW, stato: "errore" },
      },
      error: null,
    });
    const res = await sendEmailViaFunction({
      commessaId: "commessa-1",
      kind: "pdf",
      mittente: "studio-a@acmeflexo.example",
      destinatari: ["cliente@example.test"],
      oggetto: "PDF pronto",
      corpo: "Corpo.",
    });
    expect(res.sent).toBe(false);
    expect(res.email?.stato).toBe("errore");
    expect(res.reason).toContain("Provider 401");
  });

  it("rejected before archiving: reads the detail from the response body", async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("Edge Function returned a non-2xx status code"), {
        context: new Response(JSON.stringify({ error: "Permission denied for this job." }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        }),
      }),
    });
    const res = await sendEmailViaFunction({
      commessaId: "commessa-1",
      kind: "pdf",
      mittente: "studio-a@acmeflexo.example",
      destinatari: ["cliente@example.test"],
      oggetto: "PDF",
      corpo: "Corpo.",
    });
    expect(res.sent).toBe(false);
    expect(res.email).toBeUndefined();
    expect(res.reason).toBe("Permission denied for this job.");
  });

  it("response without an email row: controlled failure", async () => {
    invokeMock.mockResolvedValue({ data: { ok: true }, error: null });
    const res = await sendEmailViaFunction({
      commessaId: "commessa-1",
      kind: "pdf",
      mittente: "studio-a@acmeflexo.example",
      destinatari: ["cliente@example.test"],
      oggetto: "PDF",
      corpo: "Corpo.",
    });
    expect(res.sent).toBe(false);
  });

  it("forwards CC to the function and reads it back from the archived row", async () => {
    invokeMock.mockResolvedValue({
      data: { ok: true, stato: "inviata", reason: null, email: { ...EMAIL_ROW, cc: ["john@customer.example"] } },
      error: null,
    });
    const res = await sendEmailViaFunction({
      commessaId: "commessa-1",
      kind: "pdf",
      mittente: "studio-a@acmeflexo.example",
      destinatari: ["cliente@example.test"],
      cc: ["john@customer.example"],
      oggetto: "PDF",
      corpo: "Corpo.",
    });
    expect(invokeMock).toHaveBeenCalledWith("send-email", expect.objectContaining({
      body: expect.objectContaining({ cc: ["john@customer.example"] }),
    }));
    expect(res.email?.cc).toEqual(["john@customer.example"]);
  });

  it("row archived before the cc column: empty CC, not undefined", async () => {
    invokeMock.mockResolvedValue({
      data: { ok: true, stato: "inviata", reason: null, email: EMAIL_ROW },
      error: null,
    });
    const res = await sendEmailViaFunction({
      commessaId: "commessa-1",
      kind: "pdf",
      mittente: "studio-a@acmeflexo.example",
      destinatari: ["cliente@example.test"],
      oggetto: "PDF",
      corpo: "Corpo.",
    });
    expect(res.email?.cc).toEqual([]);
  });
});
