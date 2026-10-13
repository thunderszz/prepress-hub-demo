import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmailWizardDialog } from "./EmailWizardDialog";
import {
  useClientiStore,
  useFileStore,
  useGruppiStore,
  useSessionStore,
  useTemplatesStore,
  useUsersStore,
} from "@/lib/store";
import type { Commessa, User } from "@/lib/types";

vi.mock("@/lib/supabaseWrites", () => ({
  flushPendingWrites: vi.fn().mockResolvedValue(undefined),
  persistAssegnatari: vi.fn(),
  persistCommessaPatch: vi.fn(),
  persistCorrezione: vi.fn(),
  persistEvento: vi.fn(),
  persistFile: vi.fn(),
  persistNotaForzatura: vi.fn(),
  persistSospensione: vi.fn(),
}));

const uploadCommessaFileMock = vi.fn();
const inviaEmailMock = vi.fn();
vi.mock("@/lib/workflowActions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/workflowActions")>()),
  inviaEmail: (...args: unknown[]) => inviaEmailMock(...args),
}));
vi.mock("@/lib/fileStorage", () => ({
  uploadCommessaFile: (...args: unknown[]) => uploadCommessaFileMock(...args),
}));

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
  creataIl: "2026-06-10T12:00:00.000Z",
  aggiornataIl: "2026-06-10T12:00:00.000Z",
};

beforeEach(() => {
  useUsersStore.setState({ users: [fullAccess] });
  useSessionStore.setState({
    isAuthenticated: true,
    currentUserId: fullAccess.id,
    authEmail: fullAccess.email,
  });
  useClientiStore.setState({
    clienti: [{
      id: "cliente-1",
      nome: "Test Customer",
      nomeChiave: "cliente test",
      email: "cliente@example.test",
      creatoIl: "2026-06-10T12:00:00.000Z",
    }],
  });
  useGruppiStore.setState({
    gruppi: [{ id: "gruppo-1", nome: "studio-a", mailbox: "studio-a@acmeflexo.example" }],
  });
  useTemplatesStore.setState({
    templates: [{ id: "template-1", kind: "pdf", oggetto: "", corpo: "" }],
  });
  useFileStore.setState({
    files: [{
      id: "file-1",
      commessaId: "commessa-1",
      nome: "test.pdf",
      tipo: "PDF",
      dimensioneBytes: 1200,
      caricatoIl: "2026-06-10T12:00:00.000Z",
      caricatoDaUserId: fullAccess.id,
      binarioDisponibile: true,
      storagePath: "commessa-1/test.pdf",
    }],
  });
  uploadCommessaFileMock.mockReset();
  inviaEmailMock.mockReset().mockResolvedValue({ ok: true });
});

function renderWizard() {
  render(
    <EmailWizardDialog
      open
      onOpenChange={vi.fn()}
      commessa={commessa}
      kind="pdf"
      advanceState="in_attesa_approvazione_pdf"
    />,
  );
  return screen.getByRole("dialog", { name: "Send PDF" });
}

describe("EmailWizardDialog", () => {
  it("keeps recipient, subject and body editable while typing", () => {
    render(
      <EmailWizardDialog
        open
        onOpenChange={vi.fn()}
        commessa={commessa}
        kind="pdf"
        advanceState="in_attesa_approvazione_pdf"
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Send PDF" });
    const destinatario = within(dialog).getByLabelText("Recipient") as HTMLInputElement;
    const oggetto = within(dialog).getByLabelText("Subject") as HTMLInputElement;
    const corpo = within(dialog).getByLabelText("Body") as HTMLTextAreaElement;

    fireEvent.change(destinatario, { target: { value: "cliente-manuale@example.test" } });
    fireEvent.change(oggetto, { target: { value: "[TEST] PDF send" } });
    fireEvent.change(corpo, { target: { value: "Body of the test email." } });

    expect(destinatario.value).toBe("cliente-manuale@example.test");
    expect(oggetto.value).toBe("[TEST] PDF send");
    expect(corpo.value).toBe("Body of the test email.");
  });

  it("pre-fills the recipient only with the email on the customer record", () => {
    render(
      <EmailWizardDialog
        open
        onOpenChange={vi.fn()}
        commessa={commessa}
        kind="pdf"
        advanceState="in_attesa_approvazione_pdf"
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Send PDF" });
    const destinatario = within(dialog).getAllByRole("textbox")[0] as HTMLInputElement;

    expect(destinatario.value).toBe("cliente@example.test");
  });

  it("leaves the recipient empty when the customer has no email and disables browser autofill", () => {
    useClientiStore.setState({
      clienti: [{
        id: "cliente-1",
        nome: "Customer Without Email",
        nomeChiave: "customer without email",
        creatoIl: "2026-06-10T12:00:00.000Z",
      }],
    });

    render(
      <EmailWizardDialog
        open
        onOpenChange={vi.fn()}
        commessa={commessa}
        kind="pdf"
        advanceState="in_attesa_approvazione_pdf"
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Send PDF" });
    const destinatario = within(dialog).getAllByRole("textbox")[0] as HTMLInputElement;

    expect(destinatario.value).toBe("");
    expect(destinatario).toHaveAttribute("autocomplete", "off");
  });

  it("offers a non-PDF uploaded file as attachment too (e.g. colour proof photo)", () => {
    useFileStore.setState({
      files: [{
        id: "file-jpeg",
        commessaId: "commessa-1",
        nome: "foto-prova-colore.jpg",
        tipo: "JPEG",
        dimensioneBytes: 800,
        caricatoIl: "2026-06-10T12:00:00.000Z",
        caricatoDaUserId: fullAccess.id,
        binarioDisponibile: true,
        storagePath: "commessa-1/foto-prova-colore.jpg",
      }],
    });

    render(
      <EmailWizardDialog
        open
        onOpenChange={vi.fn()}
        commessa={commessa}
        kind="prova_colore"
      />,
    );

    const dialog = screen.getByRole("dialog");
    const allegatoTrigger = within(dialog).getAllByRole("combobox")[1];
    expect(allegatoTrigger).toHaveTextContent("foto-prova-colore.jpg");
  });

  it("uploads a new file from the wizard and selects it as attachment", async () => {
    uploadCommessaFileMock.mockImplementation(async (commessaId: string, userId: string, file: File) => {
      useFileStore.setState((s) => ({
        files: [...s.files, {
          id: "file-new",
          commessaId,
          nome: file.name,
          tipo: "PDF" as const,
          dimensioneBytes: file.size,
          caricatoIl: "2026-07-10T12:00:00.000Z",
          caricatoDaUserId: userId,
          binarioDisponibile: true,
          storagePath: `${commessaId}/${file.name}`,
        }],
      }));
      return { ok: true };
    });

    render(
      <EmailWizardDialog
        open
        onOpenChange={vi.fn()}
        commessa={commessa}
        kind="pdf"
        advanceState="in_attesa_approvazione_pdf"
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "Send PDF" });
    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["%PDF-fake"], "nuovo.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(uploadCommessaFileMock).toHaveBeenCalledWith("commessa-1", fullAccess.id, file);
    });
    await waitFor(() => {
      const allegatoTrigger = within(dialog).getAllByRole("combobox")[1];
      expect(allegatoTrigger).toHaveTextContent("nuovo.pdf");
    });
  });
  it("does not restore the customer email when data reloads (e.g. back on the tab)", () => {
    const dialog = renderWizard();
    const destinatario = within(dialog).getByLabelText("Recipient") as HTMLInputElement;
    const oggetto = within(dialog).getByLabelText("Subject") as HTMLInputElement;
    fireEvent.change(destinatario, { target: { value: "prova-responsabile@acmeflexo.example" } });
    fireEvent.change(oggetto, { target: { value: "[TEST] send" } });

    // Full reload from the database: same data, new arrays and objects.
    act(() => {
      useUsersStore.setState((s) => ({ users: s.users.map((u) => ({ ...u })) }));
      useClientiStore.setState((s) => ({ clienti: s.clienti.map((c) => ({ ...c })) }));
      useGruppiStore.setState((s) => ({ gruppi: s.gruppi.map((g) => ({ ...g })) }));
      useTemplatesStore.setState((s) => ({ templates: s.templates.map((t) => ({ ...t })) }));
      useFileStore.setState((s) => ({ files: s.files.map((f) => ({ ...f })) }));
    });

    expect(destinatario.value).toBe("prova-responsabile@acmeflexo.example");
    expect(oggetto.value).toBe("[TEST] send");
  });

  it("does not restore the customer email after uploading an attachment from the wizard", async () => {
    uploadCommessaFileMock.mockImplementation(async (commessaId: string, userId: string, file: File) => {
      useFileStore.setState((s) => ({
        files: [...s.files, {
          id: "file-new",
          commessaId,
          nome: file.name,
          tipo: "PDF" as const,
          dimensioneBytes: file.size,
          caricatoIl: "2026-07-10T12:00:00.000Z",
          caricatoDaUserId: userId,
          binarioDisponibile: true,
          storagePath: `${commessaId}/${file.name}`,
        }],
      }));
      return { ok: true };
    });
    const dialog = renderWizard();
    const destinatario = within(dialog).getByLabelText("Recipient") as HTMLInputElement;
    fireEvent.change(destinatario, { target: { value: "prova-responsabile@acmeflexo.example" } });

    const fileInput = dialog.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["%PDF-fake"], "nuovo.pdf", { type: "application/pdf" })] },
    });

    await waitFor(() => {
      expect(within(dialog).getAllByRole("combobox")[1]).toHaveTextContent("nuovo.pdf");
    });
    expect(destinatario.value).toBe("prova-responsabile@acmeflexo.example");
  });

  it("sends the CC list pasted from the customer email, without repeating the recipient", async () => {
    const dialog = renderWizard();
    const cc = within(dialog).getByLabelText(/^CC/);
    fireEvent.change(cc, {
      target: {
        value: 'John Smith <john@customer.example>; "Brown, Luke" <luke@customer.example>, cliente@example.test',
      },
    });
    expect(within(dialog).getByText(/john@customer\.example, luke@customer\.example/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(inviaEmailMock).toHaveBeenCalledTimes(1));
    expect(inviaEmailMock.mock.calls[0][2]).toEqual(
      expect.objectContaining({
        destinatari: ["cliente@example.test"],
        cc: ["john@customer.example", "luke@customer.example"],
      }),
    );
  });

  it("accepts a recipient pasted with the name in front", async () => {
    const dialog = renderWizard();
    fireEvent.change(within(dialog).getByLabelText("Recipient"), {
      target: { value: "Giulia F. <giulia.f@acmeflexo.example>" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(inviaEmailMock).toHaveBeenCalledTimes(1));
    expect(inviaEmailMock.mock.calls[0][2]).toEqual(
      expect.objectContaining({ destinatari: ["giulia.f@acmeflexo.example"], cc: [] }),
    );
  });

  it("blocks sending if a CC address has a typo", () => {
    const dialog = renderWizard();
    fireEvent.change(within(dialog).getByLabelText(/^CC/), {
      target: { value: "john@customer, luke@customer.example" },
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Send" }));

    expect(inviaEmailMock).not.toHaveBeenCalled();
  });
  it("says when the recipient changed and lets you restore the customer email", () => {
    const dialog = renderWizard();
    const destinatario = within(dialog).getByLabelText("Recipient") as HTMLInputElement;
    expect(within(dialog).queryByRole("button", { name: /Restore/ })).not.toBeInTheDocument();

    fireEvent.change(destinatario, { target: { value: "prova-responsabile@acmeflexo.example" } });
    expect(within(dialog).getByText(/the customer record keeps cliente@example\.test/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /Restore/ }));
    expect(destinatario.value).toBe("cliente@example.test");
  });
});
