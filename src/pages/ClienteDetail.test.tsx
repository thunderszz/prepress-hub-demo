import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  hasSupabaseConfig: true,
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import ClienteDetail from "./ClienteDetail";
import { Toaster } from "@/components/ui/toaster";
import { useClientiStore, useCommesseStore, useSessionStore, useUsersStore } from "@/lib/store";
import { setDemoMode } from "@/lib/supabaseWrites";
import type { Cliente, User } from "@/lib/types";

const responsabileProduzione: User = {
  id: "user-full",
  nome: "Giulia F.",
  email: "giulia@example.test",
  ruolo: "responsabile_produzione",
  attivo: true,
  iniziali: "AS",
};

const responsabileCommerciale: User = {
  id: "user-comm",
  nome: "Commerciale",
  email: "commerciale@example.test",
  ruolo: "responsabile_commerciale",
  attivo: true,
  iniziali: "CO",
};

const cliente: Cliente = {
  id: "cli-1",
  nome: "Monte Bianco Waters S.p.A.",
  nomeChiave: "monte bianco waters s.p.a.",
  email: "ordini@montebianco.example",
  creatoIl: "2026-01-01T00:00:00.000Z",
};

const altro: Cliente = {
  id: "cli-2",
  nome: "Pastificio Aurora S.r.l.",
  nomeChiave: "pastificio aurora s.r.l.",
  creatoIl: "2026-02-01T00:00:00.000Z",
};

function entraCome(user: User) {
  useUsersStore.setState({ users: [user] });
  useSessionStore.setState({ isAuthenticated: true, currentUserId: user.id, authEmail: user.email });
}

/**
 * Fake `clienti` table. `eq()` returns an object that supports both the
 * fire-and-forget update of supabaseWrites (awaited as is) and the rename
 * (`.select().single()`), which answers with `rinominato`.
 */
function tabellaClienti(rinominato: Record<string, unknown>) {
  const update = vi.fn((_patch: Record<string, unknown>) => ({
    eq: vi.fn(() =>
      Object.assign(Promise.resolve({ error: null }), {
        select: () => ({ single: vi.fn().mockResolvedValue({ data: rinominato, error: null }) }),
      }),
    ),
  }));
  return { update };
}

function renderScheda() {
  return render(
    <MemoryRouter initialEntries={["/customers/cli-1"]}>
      <Routes>
        <Route path="/customers/:id" element={<ClienteDetail />} />
      </Routes>
      <Toaster />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  setDemoMode(false);
  useClientiStore.setState({ clienti: [cliente, altro] });
  useCommesseStore.setState({ commesse: [] });
  fromMock.mockReset();
});

describe("ClienteDetail — name", () => {
  it("a manager fixes the name and the title updates", async () => {
    entraCome(responsabileProduzione);
    const clienti = tabellaClienti({
      id: "cli-1",
      nome: "Monte Bianco Waters S.r.l.",
      nome_chiave: "monte bianco waters s.r.l.",
      email: "ordini@montebianco.example",
      telefono: null,
      note: null,
      creato_il: "2026-01-01T00:00:00.000Z",
    });
    fromMock.mockImplementation(() => clienti);
    renderScheda();

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Monte Bianco Waters S.r.l." } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(
      await screen.findByRole("heading", { name: "Monte Bianco Waters S.r.l." }),
    ).toBeInTheDocument();
    expect(clienti.update).toHaveBeenCalledWith({
      nome: "Monte Bianco Waters S.r.l.",
      nome_chiave: "monte bianco waters s.r.l.",
    });
  });

  it("if the name belongs to another customer it says so and saves nothing", async () => {
    entraCome(responsabileProduzione);
    renderScheda();

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "pastificio aurora s.r.l." } });
    // The changed email stays unsaved too: no half saves.
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "amministrazione@montebianco.example" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Monte Bianco Waters S.p.A." })).toBeInTheDocument();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("saving only the email does not rewrite the name", async () => {
    entraCome(responsabileProduzione);
    const clienti = tabellaClienti({});
    fromMock.mockImplementation(() => clienti);
    renderScheda();

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "amministrazione@montebianco.example" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(clienti.update).toHaveBeenCalledTimes(1));
    const patch = clienti.update.mock.calls[0][0] as Record<string, unknown>;
    expect(patch.email).toBe("amministrazione@montebianco.example");
    expect(patch).not.toHaveProperty("nome");
  });

  it("the name is not editable without full access", () => {
    entraCome(responsabileCommerciale);

    renderScheda();

    expect(screen.getByLabelText(/name/i)).toBeDisabled();
  });

});
