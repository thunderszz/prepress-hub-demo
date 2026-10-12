import { beforeEach, describe, expect, it } from "vitest";

import {
  useAssegnatariStore,
  useCommesseStore,
  useEventiStore,
  useFileStore,
  useNoteForzaturaStore,
  useUsersStore,
} from "./store";
import type { Commessa, CommessaAssegnatario, User } from "./types";
import {
  advanceTo,
  aggiungiNotaSottopassaggio,
  registraWeTransfer,
  setEsitoCaduta,
  setEsitoProvaColore,
  uploadFile,
} from "./workflowActions";

const now = "2026-06-07T12:00:00.000Z";

const grafico: User = {
  id: "user-grafico",
  nome: "Designer Test",
  email: "grafico@example.test",
  ruolo: "grafico",
  attivo: true,
  iniziali: "GT",
};

const cq: User = {
  id: "user-cq",
  nome: "CQ Test",
  email: "cq@example.test",
  ruolo: "controllo_qualita",
  attivo: true,
  iniziali: "CQ",
};

const fullAccess: User = {
  id: "user-full",
  nome: "Full Access",
  email: "full@example.test",
  ruolo: "responsabile_produzione",
  attivo: true,
  iniziali: "FA",
};

function makeCommessa(patch: Partial<Commessa> = {}): Commessa {
  return {
    id: "commessa-1",
    numeroCommessa: "TEST-001",
    clienteId: "cliente-1",
    nomeLavoro: "Test workflow",
    stato: "in_produzione_matrice",
    revisioniPdf: 0,
    creataIl: now,
    aggiornataIl: now,
    ...patch,
  };
}

const assegnazioneGrafico: CommessaAssegnatario = {
  commessaId: "commessa-1",
  userId: grafico.id,
  assegnatoIl: now,
  assegnatoDaUserId: fullAccess.id,
};

describe("advanceTo", () => {
  beforeEach(() => {
    useUsersStore.setState({ users: [grafico, cq, fullAccess] });
    useCommesseStore.setState({ commesse: [makeCommessa()] });
    useAssegnatariStore.setState({ assegnatari: [assegnazioneGrafico] });
    useEventiStore.setState({ eventi: [] });
    useFileStore.setState({ files: [] });
    useNoteForzaturaStore.setState({ noteForzatura: [] });
  });

  it("does not let an assigned designer force Shipped", () => {
    const res = advanceTo("commessa-1", grafico.id, "spedito", {
      forzaturaNota: "Customer asked for direct shipping",
    });

    expect(res).toEqual({
      ok: false,
      reason: "Only Quality Control or full-access roles can mark a job as Shipped.",
    });
    expect(useCommesseStore.getState().commesse[0].stato).toBe("in_produzione_matrice");
    expect(useNoteForzaturaStore.getState().noteForzatura).toHaveLength(0);
    expect(useEventiStore.getState().eventi).toHaveLength(0);
  });

  it("lets Quality Control mark a job as Shipped", () => {
    const res = advanceTo("commessa-1", cq.id, "spedito");

    expect(res).toEqual({ ok: true });
    expect(useCommesseStore.getState().commesse[0].stato).toBe("spedito");
  });

  it("keeps intermediate overrides available to the assigned designer", () => {
    useCommesseStore.setState({
      commesse: [makeCommessa({ stato: "in_attesa_prova_colore" })],
    });

    const res = advanceTo("commessa-1", grafico.id, "in_attesa_approvazione_caduta", {
      forzaturaNota: "Colour proof not needed",
    });

    expect(res).toEqual({ ok: true });
    expect(useCommesseStore.getState().commesse[0].stato).toBe("in_attesa_approvazione_caduta");
    expect(useNoteForzaturaStore.getState().noteForzatura).toHaveLength(1);
  });

  it("blocks outcomes and operational notes locally if the user cannot edit", () => {
    useCommesseStore.setState({
      commesse: [makeCommessa({ stato: "in_attesa_prova_colore" })],
    });

    const prova = setEsitoProvaColore("commessa-1", cq.id, "spedita_approvata");
    const caduta = setEsitoCaduta("commessa-1", cq.id, "approvata");
    const nota = aggiungiNotaSottopassaggio("commessa-1", cq.id, "Unauthorised note");

    expect(prova.ok).toBe(false);
    expect(caduta.ok).toBe(false);
    expect(nota.ok).toBe(false);
    expect(useCommesseStore.getState().commesse[0].esitoProvaColore).toBeUndefined();
    expect(useCommesseStore.getState().commesse[0].esitoCaduta).toBeUndefined();
    expect(useEventiStore.getState().eventi).toHaveLength(0);
  });

  it("resets esitoProvaColore when the job goes back to artwork from the colour proof", () => {
    useCommesseStore.setState({
      commesse: [
        makeCommessa({
          stato: "in_attesa_prova_colore",
          esitoProvaColore: "spedita_approvata",
        }),
      ],
    });

    const res = advanceTo("commessa-1", grafico.id, "in_lavorazione");

    expect(res).toEqual({ ok: true });
    const c = useCommesseStore.getState().commesse[0];
    expect(c.stato).toBe("in_lavorazione");
    expect(c.esitoProvaColore).toBeUndefined();
  });

  it("also resets the 'da_rifare' outcome when going back to artwork from the colour proof", () => {
    useCommesseStore.setState({
      commesse: [
        makeCommessa({
          stato: "in_attesa_prova_colore",
          esitoProvaColore: "da_rifare",
        }),
      ],
    });

    const res = advanceTo("commessa-1", grafico.id, "in_lavorazione");

    expect(res).toEqual({ ok: true });
    expect(useCommesseStore.getState().commesse[0].esitoProvaColore).toBeUndefined();
  });

  it("blocks files and WeTransfer locally if the user cannot edit", () => {
    const file = uploadFile("commessa-1", cq.id, {
      nome: "prova.pdf",
      tipo: "PDF",
      dimensioneBytes: 1200,
    });
    const wetransfer = registraWeTransfer("commessa-1", cq.id, "External delivery");

    expect(file.ok).toBe(false);
    expect(wetransfer.ok).toBe(false);
    expect(useFileStore.getState().files).toHaveLength(0);
    expect(useEventiStore.getState().eventi).toHaveLength(0);
  });
});
