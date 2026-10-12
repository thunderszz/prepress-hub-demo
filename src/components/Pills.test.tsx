import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatoCommessaPill } from "./Pills";

describe("StatoCommessaPill", () => {
  it("shows 'Colour proof approved' once the colour proof is approved", () => {
    render(
      <StatoCommessaPill
        stato="in_attesa_prova_colore"
        esitoProvaColore="spedita_approvata"
      />,
    );

    expect(screen.getByText("Colour proof approved")).toBeInTheDocument();
    expect(screen.queryByText("Awaiting colour proof")).not.toBeInTheDocument();
  });
});
