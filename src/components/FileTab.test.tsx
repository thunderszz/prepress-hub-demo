import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileTab } from "./FileTab";
import {
  useAssegnatariStore,
  useCommesseStore,
  useFileStore,
  useSessionStore,
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

const getFileDownloadUrlMock = vi.fn();
vi.mock("@/lib/fileStorage", () => ({
  uploadCommessaFile: vi.fn(),
  getFileDownloadUrl: (...args: unknown[]) => getFileDownloadUrlMock(...args),
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
  nomeLavoro: "Test file tab",
  stato: "in_lavorazione",
  revisioniPdf: 0,
  creataIl: "2026-06-10T12:00:00.000Z",
  aggiornataIl: "2026-06-10T12:00:00.000Z",
};

beforeEach(() => {
  vi.stubEnv("DEV", false);
  useUsersStore.setState({ users: [fullAccess] });
  useSessionStore.setState({
    isAuthenticated: true,
    currentUserId: fullAccess.id,
    authEmail: fullAccess.email,
  });
  useCommesseStore.setState({ commesse: [{ ...commessa }] });
  useAssegnatariStore.setState({ assegnatari: [] });
  useFileStore.setState({ files: [] });
  getFileDownloadUrlMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("FileTab", () => {
  it("no longer shows the email trigger (moved to Overview)", () => {
    render(<FileTab commessa={commessa} />);

    expect(screen.queryByRole("button", { name: /invia pdf al cliente/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/send email/i)).not.toBeInTheDocument();
  });

  it("no longer shows the WeTransfer trigger (moved to Overview)", () => {
    render(<FileTab commessa={commessa} />);

    expect(screen.queryByRole("button", { name: /log wetransfer delivery/i })).not.toBeInTheDocument();
  });

  it("downloads an available file through a signed URL", async () => {
    getFileDownloadUrlMock.mockResolvedValue("https://signed.example.test/prova.pdf");
    useFileStore.setState({
      files: [{
        id: "file-1",
        commessaId: commessa.id,
        nome: "prova.pdf",
        tipo: "PDF",
        dimensioneBytes: 1024,
        caricatoIl: "2026-07-10T10:00:00.000Z",
        caricatoDaUserId: fullAccess.id,
        binarioDisponibile: true,
        storagePath: "commessa-1/prova.pdf",
      }],
    });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(<FileTab commessa={commessa} />);
    fireEvent.click(screen.getByRole("button", { name: /download prova\.pdf/i }));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith("https://signed.example.test/prova.pdf", "_blank", "noopener");
    });
  });

  it("offers no download once the file is gone (retention)", () => {
    useFileStore.setState({
      files: [{
        id: "file-2",
        commessaId: commessa.id,
        nome: "scaduto.pdf",
        tipo: "PDF",
        dimensioneBytes: 1024,
        caricatoIl: "2026-05-01T10:00:00.000Z",
        caricatoDaUserId: fullAccess.id,
        binarioDisponibile: false,
        storagePath: null,
      }],
    });

    render(<FileTab commessa={commessa} />);

    expect(screen.queryByRole("button", { name: /download scaduto\.pdf/i })).not.toBeInTheDocument();
    expect(screen.getByText(/file no longer available/i)).toBeInTheDocument();
  });
});
