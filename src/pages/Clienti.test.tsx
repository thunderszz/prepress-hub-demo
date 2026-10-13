import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

import Clienti from "./Clienti";
import { useClientiStore, useCommesseStore, useSessionStore, useUsersStore } from "@/lib/store";
import type { Cliente, User } from "@/lib/types";

const responsabileProduzione: User = {
  id: "user-full",
  nome: "Giulia F.",
  email: "giulia@example.test",
  ruolo: "responsabile_produzione",
  attivo: true,
  iniziali: "AS",
};

// A "manager" without full access: the case a title-only check would
// let through.
const responsabileCommerciale: User = {
  id: "user-comm",
  nome: "Commerciale",
  email: "commerciale@example.test",
  ruolo: "responsabile_commerciale",
  attivo: true,
  iniziali: "CO",
};

const esistente: Cliente = {
  id: "cli-1",
  nome: "Contoso Waters Inc.",
  nomeChiave: "contoso waters inc.",
  creatoIl: "2026-01-01T00:00:00.000Z",
};

function entraCome(user: User) {
  useUsersStore.setState({ users: [user] });
  useSessionStore.setState({ isAuthenticated: true, currentUserId: user.id, authEmail: user.email });
}

function SchedaCliente() {
  const { id } = useParams();
  return <div>scheda {id}</div>;
}

function renderClienti() {
  return render(
    <MemoryRouter initialEntries={["/customers"]}>
      <Routes>
        <Route path="/customers" element={<Clienti />} />
        <Route path="/customers/:id" element={<SchedaCliente />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useClientiStore.setState({ clienti: [esistente] });
  useCommesseStore.setState({ commesse: [] });
  fromMock.mockReset();
});

describe("Customers — New customer", () => {
  it("shows the button to a full-access role", () => {
    entraCome(responsabileProduzione);

    renderClienti();

    expect(screen.getByRole("button", { name: /new customer/i })).toBeInTheDocument();
  });

  it("hides the button without full access", () => {
    entraCome(responsabileCommerciale);

    renderClienti();

    expect(screen.queryByRole("button", { name: /new customer/i })).not.toBeInTheDocument();
  });


  it("creates the customer with all fields and opens its page", async () => {
    entraCome(responsabileProduzione);
    const insert = vi.fn(() => ({
      select: () => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "cli-2",
            nome: "Fabrikam Pasta Ltd",
            nome_chiave: "fabrikam pasta ltd",
            email: "ordini@fabrikampasta.example",
            telefono: "049 8751234",
            note: "Deliveries in the morning only",
            creato_il: "2026-09-21T08:00:00.000Z",
          },
          error: null,
        }),
      }),
    }));
    fromMock.mockImplementation((table: string) => {
      if (table === "clienti") return { insert };
      throw new Error(`tabella inattesa: ${table}`);
    });
    renderClienti();

    fireEvent.click(screen.getByRole("button", { name: /new customer/i }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Fabrikam Pasta Ltd" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "ordini@fabrikampasta.example" } });
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "049 8751234" } });
    fireEvent.change(screen.getByLabelText(/notes/i), { target: { value: "Deliveries in the morning only" } });
    fireEvent.click(screen.getByRole("button", { name: /create customer/i }));

    expect(await screen.findByText("scheda cli-2")).toBeInTheDocument();
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        nome: "Fabrikam Pasta Ltd",
        email: "ordini@fabrikampasta.example",
        telefono: "049 8751234",
        note: "Deliveries in the morning only",
      }),
    );
  });

  it("if the customer already exists it says so and stays on the dialog", async () => {
    entraCome(responsabileProduzione);
    renderClienti();

    fireEvent.click(screen.getByRole("button", { name: /new customer/i }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "contoso waters inc." } });
    fireEvent.click(screen.getByRole("button", { name: /create customer/i }));

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create customer/i })).toBeInTheDocument();
    expect(fromMock).not.toHaveBeenCalled();
  });
});
