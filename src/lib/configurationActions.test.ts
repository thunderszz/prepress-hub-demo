import { beforeEach, describe, expect, it, vi } from "vitest";

const fromMock = vi.fn();
const resetPasswordMock = vi.fn();
const invokeMock = vi.fn();

vi.mock("./supabase", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
    auth: {
      resetPasswordForEmail: (...args: unknown[]) => resetPasswordMock(...args),
    },
  },
}));

import {
  addUserProfile,
  setUserGroupMembership,
  sendPasswordReset,
  updateEmailTemplateConfig,
  updateUserProfile,
} from "./configurationActions";
import {
  useTemplatesStore,
  useUsersStore,
  useUtenteGruppiStore,
} from "./store";
import type { EmailTemplate, User } from "./types";

const user: User = {
  id: "user-1",
  nome: "Grafico Uno",
  email: "grafico1@acmeflexo.example",
  ruolo: "grafico",
  attivo: true,
  iniziali: "GU",
};

const template: EmailTemplate = {
  id: "template-1",
  kind: "pdf",
  oggetto: "",
  corpo: "",
};

function successQuery(extra: Record<string, unknown> = {}) {
  return {
    insert: vi.fn().mockResolvedValue({ error: null }),
    update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    delete: vi.fn(() => ({
      eq: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    })),
    ...extra,
  };
}

beforeEach(() => {
  fromMock.mockReset();
  invokeMock.mockReset();
  resetPasswordMock.mockReset();
  useUsersStore.setState({ users: [user] });
  useUtenteGruppiStore.setState({ utenteGruppi: [] });
  useTemplatesStore.setState({ templates: [template] });
});

describe("configurationActions", () => {
  it("updates a user in the database and then in the local store", async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn(() => ({ eq: eqMock }));
    fromMock.mockReturnValue(successQuery({ update: updateMock }));

    const res = await updateUserProfile("user-1", {
      ruolo: "controllo_qualita",
      attivo: false,
    });

    expect(res).toEqual({ ok: true });
    expect(fromMock).toHaveBeenCalledWith("utenti");
    expect(updateMock).toHaveBeenCalledWith({ ruolo: "controllo_qualita", attivo: false });
    expect(eqMock).toHaveBeenCalledWith("id", "user-1");
    expect(useUsersStore.getState().users[0]).toMatchObject({
      ruolo: "controllo_qualita",
      attivo: false,
    });
  });

  it("does not mutate the store if the database rejects the user update", async () => {
    fromMock.mockReturnValue({
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: { message: "permesso negato" } }),
      })),
    });

    const res = await updateUserProfile("user-1", { ruolo: "amministrazione" });

    expect(res).toEqual({ ok: false, reason: "permesso negato" });
    expect(useUsersStore.getState().users[0].ruolo).toBe("grafico");
  });

  it("creates an app user profile with initials derived from the name", async () => {
    invokeMock.mockResolvedValue({
      data: {
        user: {
          id: "new-user",
          nome: "Maria Rossi",
          email: "maria.rossi@acmeflexo.example",
          ruolo: "responsabile_commerciale",
          attivo: true,
          iniziali: "MR",
        },
      },
      error: null,
    });

    const res = await addUserProfile({
      nome: "Maria Rossi",
      email: "maria.rossi@acmeflexo.example",
      ruolo: "responsabile_commerciale",
    });

    expect(res.ok).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith("invite-user", expect.objectContaining({
      body: expect.objectContaining({
        nome: "Maria Rossi",
        email: "maria.rossi@acmeflexo.example",
        ruolo: "responsabile_commerciale",
      }),
    }));
    expect(useUsersStore.getState().users.at(-1)).toMatchObject({
      id: "new-user",
      nome: "Maria Rossi",
      iniziali: "MR",
    });
  });

  it("persists adding and removing team membership", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    const deleteEq2 = vi.fn().mockResolvedValue({ error: null });
    const deleteEq1 = vi.fn(() => ({ eq: deleteEq2 }));
    const deleteMock = vi.fn(() => ({ eq: deleteEq1 }));
    fromMock.mockReturnValue(successQuery({ insert: insertMock, delete: deleteMock }));

    const added = await setUserGroupMembership("user-1", "gruppo-1", true);
    const removed = await setUserGroupMembership("user-1", "gruppo-1", false);

    expect(added).toEqual({ ok: true });
    expect(removed).toEqual({ ok: true });
    expect(insertMock).toHaveBeenCalledWith({ utente_id: "user-1", gruppo_id: "gruppo-1" });
    expect(deleteEq1).toHaveBeenCalledWith("utente_id", "user-1");
    expect(deleteEq2).toHaveBeenCalledWith("gruppo_id", "gruppo-1");
    expect(useUtenteGruppiStore.getState().utenteGruppi).toHaveLength(0);
  });

  it("persists email templates and records who changed them", async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn(() => ({ eq: eqMock }));
    fromMock.mockReturnValue(successQuery({ update: updateMock }));

    const res = await updateEmailTemplateConfig("template-1", {
      oggetto: "PDF {numero_commessa}",
      corpo: "Ciao",
      userId: "user-1",
    });

    expect(res).toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      oggetto: "PDF {numero_commessa}",
      corpo: "Ciao",
      ultima_modifica_da_user_id: "user-1",
    }));
    expect(eqMock).toHaveBeenCalledWith("id", "template-1");
    expect(useTemplatesStore.getState().templates[0]).toMatchObject({
      oggetto: "PDF {numero_commessa}",
      corpo: "Ciao",
      ultimaModificaDaUserId: "user-1",
    });
  });

  it("calls Supabase Auth to send the password reset", async () => {
    resetPasswordMock.mockResolvedValue({ error: null });

    const res = await sendPasswordReset(" GRAFICO1@ACMEFLEXO.EXAMPLE ");

    expect(res).toEqual({ ok: true });
    expect(resetPasswordMock).toHaveBeenCalledWith(
      "grafico1@acmeflexo.example",
      expect.objectContaining({ redirectTo: expect.stringContaining("/reset-password") }),
    );
  });
});
