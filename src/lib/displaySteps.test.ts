import { describe, expect, it } from "vitest";

import { computeDisplaySteps, DisplayStep } from "./displaySteps";
import type { Commessa } from "./types";

const now = "2026-07-07T10:00:00.000Z";

function makeCommessa(patch: Partial<Commessa> = {}): Commessa {
  return {
    id: "commessa-1",
    numeroCommessa: "TEST-001",
    clienteId: "cliente-1",
    nomeLavoro: "Test display steps",
    stato: "disponibile",
    revisioniPdf: 0,
    creataIl: now,
    aggiornataIl: now,
    ...patch,
  };
}

const byKey = (steps: DisplayStep[]) =>
  Object.fromEntries(steps.map((s) => [s.key, s.state]));
const keys = (steps: DisplayStep[]) => steps.map((s) => s.key);

describe("computeDisplaySteps — requested sequence", () => {
  it("shows the requested sequence (no PDF revisions)", () => {
    const steps = computeDisplaySteps(makeCommessa({ stato: "in_lavorazione" }));
    expect(keys(steps)).toEqual([
      "disponibile",
      "assegnata",
      "presa_in_carico",
      "inizio_lavorazione",
      "pdf_1",
      "prova_colore",
      "lavoro_approvato",
      "caduta",
      "produzione_lastre",
      "spedito",
    ]);
  });

  it("labels the dots with the agreed wording", () => {
    const steps = computeDisplaySteps(makeCommessa({ stato: "in_lavorazione" }));
    const labels = Object.fromEntries(steps.map((s) => [s.key, s.label]));
    expect(labels.pdf_1).toBe("PDF_01 sent");
    expect(labels.lavoro_approvato).toBe("JOB APPROVED");
    expect(labels.produzione_lastre).toBe("Plate production");
  });
});

describe("computeDisplaySteps — status progression", () => {
  it("disponibile: first dot current, the rest to do", () => {
    const s = byKey(computeDisplaySteps(makeCommessa({ stato: "disponibile" })));
    expect(s.disponibile).toBe("current");
    expect(s.assegnata).toBe("todo");
    expect(s.spedito).toBe("todo");
  });

  it("in_lavorazione: claimed green, artwork started current", () => {
    const s = byKey(computeDisplaySteps(makeCommessa({ stato: "in_lavorazione" })));
    expect(s.disponibile).toBe("done");
    expect(s.assegnata).toBe("done");
    expect(s.presa_in_carico).toBe("done");
    expect(s.inizio_lavorazione).toBe("current");
    expect(s.pdf_1).toBe("todo");
  });

  it("in_attesa_approvazione_pdf: PDF_01 current (awaiting outcome)", () => {
    const s = byKey(
      computeDisplaySteps(makeCommessa({ stato: "in_attesa_approvazione_pdf" })),
    );
    expect(s.inizio_lavorazione).toBe("done");
    expect(s.pdf_1).toBe("current");
    expect(s.prova_colore).toBe("todo");
  });

  it("in_produzione_matrice: 'Plate production' dot current", () => {
    const s = byKey(
      computeDisplaySteps(
        makeCommessa({
          stato: "in_produzione_matrice",
          esitoProvaColore: "spedita_approvata",
          esitoCaduta: "approvata",
        }),
      ),
    );
    expect(s.lavoro_approvato).toBe("done");
    expect(s.caduta).toBe("done");
    expect(s.produzione_lastre).toBe("current");
    expect(s.spedito).toBe("todo");
  });

  it("spedito: every dot green", () => {
    const steps = computeDisplaySteps(
      makeCommessa({
        stato: "spedito",
        esitoProvaColore: "spedita_approvata",
        esitoCaduta: "approvata",
      }),
    );
    expect(steps.every((x) => x.state === "done")).toBe(true);
  });
});

describe("computeDisplaySteps — JOB APPROVED", () => {
  it("turns green as soon as the colour proof is approved (before the press proof)", () => {
    const s = byKey(
      computeDisplaySteps(
        makeCommessa({
          stato: "in_attesa_prova_colore",
          esitoProvaColore: "spedita_approvata",
        }),
      ),
    );
    expect(s.prova_colore).toBe("current");
    expect(s.lavoro_approvato).toBe("done");
    expect(s.caduta).toBe("todo");
  });

  it("stays to-do until the colour proof is approved", () => {
    const s = byKey(
      computeDisplaySteps(makeCommessa({ stato: "in_attesa_prova_colore" })),
    );
    expect(s.lavoro_approvato).toBe("todo");
  });
});

describe("computeDisplaySteps — rejected PDF branch", () => {
  it("one revision: PDF_01 red + PDF_02 waiting to be resent", () => {
    const steps = computeDisplaySteps(
      makeCommessa({ stato: "in_lavorazione", revisioniPdf: 1 }),
    );
    const pdf = steps.filter((s) => s.key.startsWith("pdf_"));
    expect(pdf.map((p) => p.short)).toEqual(["PDF_01", "PDF_02"]);
    expect(pdf[0].state).toBe("rejected");
    expect(pdf[1].state).toBe("todo");
  });

  it("PDF_02 resent and pending: PDF_01 red, PDF_02 current", () => {
    const steps = computeDisplaySteps(
      makeCommessa({ stato: "in_attesa_approvazione_pdf", revisioniPdf: 1 }),
    );
    const pdf = steps.filter((s) => s.key.startsWith("pdf_"));
    expect(pdf[0].state).toBe("rejected");
    expect(pdf[1].state).toBe("current");
  });

  it("several revisions: all previous PDFs red, the last one approved", () => {
    const steps = computeDisplaySteps(
      makeCommessa({ stato: "in_attesa_prova_colore", revisioniPdf: 2 }),
    );
    const pdf = steps.filter((s) => s.key.startsWith("pdf_"));
    expect(pdf.map((p) => p.short)).toEqual(["PDF_01", "PDF_02", "PDF_03"]);
    expect(pdf[0].state).toBe("rejected");
    expect(pdf[1].state).toBe("rejected");
    expect(pdf[2].state).toBe("done");
  });
});

describe("computeDisplaySteps — on hold", () => {
  it("paints the current dot as 'blocked'", () => {
    const s = byKey(
      computeDisplaySteps(makeCommessa({ stato: "in_lavorazione" }), true),
    );
    expect(s.inizio_lavorazione).toBe("blocked");
  });

  it("blocks the last PDF when it is awaiting an outcome and the job is on hold", () => {
    const steps = computeDisplaySteps(
      makeCommessa({ stato: "in_attesa_approvazione_pdf", revisioniPdf: 1 }),
      true,
    );
    const pdf = steps.filter((s) => s.key.startsWith("pdf_"));
    expect(pdf[1].state).toBe("blocked");
  });
});
