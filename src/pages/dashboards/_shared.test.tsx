import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { UltimiEventi } from "./_shared";
import { useCommesseStore, useEventiStore, useUsersStore } from "@/lib/store";
import type { Commessa, Evento, User } from "@/lib/types";

const user: User = {
  id: "user-1",
  nome: "Giulia F.",
  email: "giulia.f@acmeflexo.example",
  ruolo: "responsabile_produzione",
  attivo: true,
  iniziali: "AS",
};

const commessa: Commessa = {
  id: "commessa-1",
  numeroCommessa: "QA-EMAIL-001",
  clienteId: "cliente-1",
  nomeLavoro: "QA email",
  stato: "in_lavorazione",
  revisioniPdf: 0,
  creataIl: "2026-06-24T10:00:00.000Z",
  aggiornataIl: "2026-06-24T10:00:00.000Z",
};

function makeEvent(index: number): Evento {
  return {
    id: `evento-${index}`,
    commessaId: commessa.id,
    userId: user.id,
    data: `2026-06-24T10:${String(60 - index).padStart(2, "0")}:00.000Z`,
    tipo: "nota_interna",
    titolo: `Event ${index}`,
  };
}

beforeEach(() => {
  useUsersStore.setState({ users: [user] });
  useCommesseStore.setState({ commesse: [commessa] });
  useEventiStore.setState({ eventi: Array.from({ length: 12 }, (_, i) => makeEvent(i + 1)) });
});

describe("UltimiEventi", () => {
  it("lets you show more events beyond the initial limit", () => {
    render(
      <MemoryRouter>
        <UltimiEventi />
      </MemoryRouter>,
    );

    expect(screen.getByText("Event 1")).toBeInTheDocument();
    expect(screen.getByText("Event 8")).toBeInTheDocument();
    expect(screen.queryByText("Event 9")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show more/i }));

    expect(screen.getByText("Event 9")).toBeInTheDocument();
    expect(screen.getByText("Event 12")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show more/i })).not.toBeInTheDocument();
  });
});
