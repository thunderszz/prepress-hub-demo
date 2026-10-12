import { describe, expect, it } from "vitest";

import { utentiAssegnabili } from "./permissions";
import type { User, UtenteGruppo } from "./types";

function user(overrides: Partial<User>): User {
  return {
    id: "u",
    nome: "User",
    email: "u@acmeflexo.example",
    ruolo: "grafico",
    attivo: true,
    iniziali: "U",
    ...overrides,
  };
}

describe("utentiAssegnabili", () => {
  const grafico = user({ id: "g1", nome: "Luca Moretti" });
  const graficoSenzaGruppo = user({ id: "g2", nome: "Alice F." });
  const graficoInattivo = user({ id: "g3", nome: "Former designer", attivo: false });
  const marco = user({ id: "d1", nome: "Marco B.", ruolo: "responsabile_ufficio_grafico" });
  const giulia = user({ id: "a1", nome: "Giulia F.", ruolo: "responsabile_produzione" });
  const users = [grafico, graficoSenzaGruppo, graficoInattivo, marco, giulia];
  const memberships: UtenteGruppo[] = [
    { userId: "g1", gruppoId: "prestampa05" },
    { userId: "d1", gruppoId: "prestampa05" },
    { userId: "g3", gruppoId: "prestampa05" },
  ];

  it("§4.3: a Design Team Lead who belongs to a team can be assigned like a designer", () => {
    expect(utentiAssegnabili(users, memberships).map((u) => u.nome)).toContain("Marco B.");
  });

  it("keeps active designers even without a team", () => {
    expect(utentiAssegnabili(users, memberships).map((u) => u.id)).toEqual(
      expect.arrayContaining(["g1", "g2"]),
    );
  });

  it("excludes inactive users and anyone who is neither a designer nor a team member", () => {
    const ids = utentiAssegnabili(users, memberships).map((u) => u.id);
    expect(ids).not.toContain("g3");
    expect(ids).not.toContain("a1");
  });
});
