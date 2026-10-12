import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock of the Edge Function bridge: this tests inviaEmail's orchestration,
// not the network.
const emailViaSupabaseMock = vi.fn();
const sendEmailViaFunctionMock = vi.fn();
const flushPendingWritesMock = vi.fn();
vi.mock("./emailSend", () => ({
  emailViaSupabase: () => emailViaSupabaseMock(),
  sendEmailViaFunction: (req: unknown) => sendEmailViaFunctionMock(req),
}));
vi.mock("./supabaseWrites", () => ({
  flushPendingWrites: () => flushPendingWritesMock(),
  persistAssegnatari: vi.fn(),
  persistCommessaPatch: vi.fn(),
  persistCorrezione: vi.fn(),
  persistEvento: vi.fn(),
  persistFile: vi.fn(),
  persistNotaForzatura: vi.fn(),
  persistSospensione: vi.fn(),
}));

import {
  useAssegnatariStore,
  useCommesseStore,
  useEmailStore,
  useEventiStore,
  useUsersStore,
} from "./store";
import type { Commessa, EmailInviata, User } from "./types";
import { inviaEmail } from "./workflowActions";

const now = "2026-06-10T12:00:00.000Z";

const fullAccess: User = {
  id: "user-full",
  nome: "Full Access",
  email: "full@example.test",
  ruolo: "responsabile_produzione",
  attivo: true,
  iniziali: "FA",
};

const commessa: Commessa = {
  id: "commessa-1",
  numeroCommessa: "TEST-001",
  clienteId: "cliente-1",
  nomeLavoro: "Test email",
  stato: "in_lavorazione",
  revisioniPdf: 0,
  creataIl: now,
  aggiornataIl: now,
};

const serverEmail: EmailInviata = {
  id: "server-email-1",
  commessaId: "commessa-1",
  data: now,
  templateKind: "pdf",
  mittente: "prestampa01@acmeflexo.example",
  destinatari: ["cliente@example.test"],
  oggetto: "PDF ready",
  corpo: "Attached.",
  allegatoNome: "prova.pdf",
  allegatoDisponibile: true,
  inviataDaUserId: fullAccess.id,
  stato: "inviata",
};

const payloadBase = {
  kind: "pdf" as const,
  mittente: "prestampa01@acmeflexo.example",
  destinatari: ["cliente@example.test"],
  oggetto: "PDF ready",
  corpo: "Attached.",
  allegatoNome: "prova.pdf",
};

beforeEach(() => {
  emailViaSupabaseMock.mockReset().mockReturnValue(true);
  sendEmailViaFunctionMock.mockReset();
  flushPendingWritesMock.mockReset().mockResolvedValue(undefined);
  useUsersStore.setState({ users: [fullAccess] });
  useCommesseStore.setState({ commesse: [{ ...commessa }] });
  useAssegnatariStore.setState({ assegnatari: [] });
  useEventiStore.setState({ eventi: [] });
  useEmailStore.setState({ emailInviate: [] });
});

describe("inviaEmail — real send through the Edge Function", () => {
  it("success: uses the row archived by the server (no double archive) and records the event", async () => {
    sendEmailViaFunctionMock.mockResolvedValue({ sent: true, email: serverEmail });

    const res = await inviaEmail("commessa-1", fullAccess.id, payloadBase);

    expect(res.ok).toBe(true);
    expect(res.emailId).toBe("server-email-1");
    const archived = useEmailStore.getState().emailInviate;
    expect(archived).toHaveLength(1);
    expect(archived[0].id).toBe("server-email-1");
    expect(sendEmailViaFunctionMock).toHaveBeenCalledWith(
      expect.objectContaining({ commessaId: "commessa-1", kind: "pdf" }),
    );
    const eventi = useEventiStore.getState().eventi;
    expect(eventi).toHaveLength(1);
    expect(eventi[0].tipo).toBe("invio_pdf");
    expect(eventi[0].refId).toBe("server-email-1");
  });

  it("when sending advances the status, waits for status and history to be saved", async () => {
    sendEmailViaFunctionMock.mockResolvedValue({ sent: true, email: serverEmail });

    const res = await inviaEmail("commessa-1", fullAccess.id, {
      ...payloadBase,
      advanceState: "in_attesa_approvazione_pdf",
    });

    expect(res.ok).toBe(true);
    expect(flushPendingWritesMock).toHaveBeenCalledTimes(1);
  });

  it("archived error (MAIL-07): ok:false with emailId, 'send error' event, status NOT advanced", async () => {
    sendEmailViaFunctionMock.mockResolvedValue({
      sent: false,
      reason: "Provider 500: boom.",
      email: { ...serverEmail, stato: "errore" },
    });

    const res = await inviaEmail("commessa-1", fullAccess.id, {
      ...payloadBase,
      advanceState: "in_attesa_approvazione_pdf",
    });

    expect(res.ok).toBe(false);
    expect(res.emailId).toBe("server-email-1");
    expect(useEmailStore.getState().emailInviate[0].stato).toBe("errore");
    expect(useCommesseStore.getState().commesse[0].stato).toBe("in_lavorazione");
    expect(useEventiStore.getState().eventi[0].titolo).toContain("send error");
  });

  it("rejected before archiving: ok:false without emailId, no trace", async () => {
    sendEmailViaFunctionMock.mockResolvedValue({
      sent: false,
      reason: "Permission denied for this job.",
    });

    const res = await inviaEmail("commessa-1", fullAccess.id, payloadBase);

    expect(res).toEqual({ ok: false, reason: "Permission denied for this job." });
    expect(useEmailStore.getState().emailInviate).toHaveLength(0);
    expect(useEventiStore.getState().eventi).toHaveLength(0);
  });

  it("simulaErrore (dev): local archive with error status, server NEVER called", async () => {
    const res = await inviaEmail("commessa-1", fullAccess.id, {
      ...payloadBase,
      simulaErrore: true,
    });

    expect(res.ok).toBe(false);
    expect(res.emailId).toBeDefined();
    expect(sendEmailViaFunctionMock).not.toHaveBeenCalled();
    expect(useEmailStore.getState().emailInviate[0].stato).toBe("errore");
  });
});

describe("inviaEmail — QA demo mode (no server)", () => {
  it("archives locally and records the event", async () => {
    emailViaSupabaseMock.mockReturnValue(false);

    const res = await inviaEmail("commessa-1", fullAccess.id, payloadBase);

    expect(res.ok).toBe(true);
    expect(sendEmailViaFunctionMock).not.toHaveBeenCalled();
    const archived = useEmailStore.getState().emailInviate;
    expect(archived).toHaveLength(1);
    expect(archived[0].stato).toBe("inviata");
    expect(useEventiStore.getState().eventi).toHaveLength(1);
  });
});

describe("inviaEmail — carbon copy (CC)", () => {
  it("passes CC to the Edge Function and writes it into the history", async () => {
    sendEmailViaFunctionMock.mockResolvedValue({
      sent: true,
      email: { ...serverEmail, cc: ["john@customer.com", "luke@customer.com"] },
    });

    const res = await inviaEmail("commessa-1", fullAccess.id, {
      ...payloadBase,
      cc: ["john@customer.com", "luke@customer.com"],
    });

    expect(res.ok).toBe(true);
    expect(sendEmailViaFunctionMock).toHaveBeenCalledWith(
      expect.objectContaining({ cc: ["john@customer.com", "luke@customer.com"] }),
    );
    const evento = useEventiStore.getState().eventi[0];
    expect(evento.dettaglio).toBe("To: cliente@example.test · CC: john@customer.com, luke@customer.com");
  });

  it("without CC the history stays as before", async () => {
    sendEmailViaFunctionMock.mockResolvedValue({ sent: true, email: serverEmail });

    await inviaEmail("commessa-1", fullAccess.id, { ...payloadBase, cc: [] });

    expect(useEventiStore.getState().eventi[0].dettaglio).toBe("To: cliente@example.test");
  });

  it("in QA demo mode CC is archived locally too", async () => {
    emailViaSupabaseMock.mockReturnValue(false);

    await inviaEmail("commessa-1", fullAccess.id, { ...payloadBase, cc: ["john@customer.com"] });

    expect(useEmailStore.getState().emailInviate[0].cc).toEqual(["john@customer.com"]);
  });
});
