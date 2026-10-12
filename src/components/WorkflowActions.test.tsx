import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkflowActions } from "./WorkflowActions";
import {
  useAssegnatariStore,
  useCommesseStore,
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
  nomeLavoro: "Test workflow",
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
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("WorkflowActions", () => {
  it("keeps WeTransfer available in the production build too", () => {
    render(<WorkflowActions commessa={commessa} />);

    expect(screen.getByRole("button", { name: /log wetransfer delivery/i })).toBeEnabled();
  });

  it("shows the PDF email trigger in Overview (upload/attachment choice stay in the Files tab)", () => {
    render(<WorkflowActions commessa={commessa} />);

    expect(screen.getByRole("button", { name: /send pdf to customer/i })).toBeEnabled();
  });

  it("hides WeTransfer when the status has no deliveries (e.g. shipped)", () => {
    const spedita: Commessa = { ...commessa, stato: "spedito" };
    useCommesseStore.setState({ commesse: [spedita] });

    render(<WorkflowActions commessa={spedita} />);

    expect(
      screen.queryByRole("button", { name: /log wetransfer delivery/i }),
    ).not.toBeInTheDocument();
  });

  it("shows WeTransfer while awaiting the colour proof too", () => {
    const attesaProvaColore: Commessa = { ...commessa, stato: "in_attesa_prova_colore" };
    useCommesseStore.setState({ commesse: [attesaProvaColore] });

    render(<WorkflowActions commessa={attesaProvaColore} />);

    expect(
      screen.getByRole("button", { name: /log wetransfer delivery/i }),
    ).toBeEnabled();
  });

  it("still shows colour proof outcome/send when not recorded yet", () => {
    const inAttesa: Commessa = { ...commessa, stato: "in_attesa_prova_colore" };
    useCommesseStore.setState({ commesse: [inAttesa] });

    render(<WorkflowActions commessa={inAttesa} />);

    expect(screen.getByText("Colour proof outcome")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send colour proof/i })).toBeInTheDocument();
  });

  it("hides colour proof outcome/send once recorded and shows Send press proof", () => {
    const approvata: Commessa = {
      ...commessa,
      stato: "in_attesa_prova_colore",
      esitoProvaColore: "spedita_approvata",
    };
    useCommesseStore.setState({ commesse: [approvata] });

    render(<WorkflowActions commessa={approvata} />);

    expect(screen.queryByText("Colour proof outcome")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^send colour proof$/i })).not.toBeInTheDocument();
    expect(screen.getByText(/colour proof: sent and approved/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /send press proof/i })).toBeEnabled();
  });

  it("reopens the outcome selector with Change", () => {
    const approvata: Commessa = {
      ...commessa,
      stato: "in_attesa_prova_colore",
      esitoProvaColore: "spedita_approvata",
    };
    useCommesseStore.setState({ commesse: [approvata] });

    render(<WorkflowActions commessa={approvata} />);
    fireEvent.click(screen.getByRole("button", { name: /^change$/i }));

    expect(screen.getByText("Colour proof outcome")).toBeInTheDocument();
  });
});
