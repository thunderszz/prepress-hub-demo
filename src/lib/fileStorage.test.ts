import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock of the Supabase client: tests must not touch the network.
const uploadMock = vi.fn();
const createSignedUrlMock = vi.fn();
vi.mock("./supabase", () => ({
  hasSupabaseConfig: true,
  supabase: {
    // Tables: metadata writes succeed without a network.
    from: () => ({
      upsert: () => Promise.resolve({ error: null }),
      insert: () => Promise.resolve({ error: null }),
    }),
    storage: {
      from: () => ({ upload: uploadMock, createSignedUrl: createSignedUrlMock }),
    },
  },
}));

import { storagePathForFile, uploadCommessaFile, getFileDownloadUrl, FILES_BUCKET } from "./fileStorage";
import { setDemoMode } from "./supabaseWrites";
import { useFileStore, useEventiStore, useUsersStore } from "./store";

const COMMESSA_ID = "11111111-2222-3333-4444-555555555555";
const USER_ID = "99999999-8888-7777-6666-555555555555";

function makeFile(name: string, type = "application/pdf"): File {
  return new File(["%PDF-fake"], name, { type });
}

beforeEach(() => {
  uploadMock.mockReset().mockResolvedValue({ data: { path: "x" }, error: null });
  createSignedUrlMock.mockReset();
  useUsersStore.setState({
    users: [{
      id: USER_ID,
      nome: "Responsabile",
      email: "resp@example.test",
      ruolo: "responsabile_produzione",
      attivo: true,
      iniziali: "RP",
    }],
  });
  useFileStore.setState({ files: [] });
  useEventiStore.setState({ eventi: [] });
  setDemoMode(false);
});

afterEach(() => {
  setDemoMode(false);
});

describe("storagePathForFile", () => {
  it("uses the job id as the first folder (required by the storage policies)", () => {
    const path = storagePathForFile(COMMESSA_ID, "prova.pdf");
    expect(path.startsWith(`${COMMESSA_ID}/`)).toBe(true);
  });

  it("is deterministic: same name → same path (FILE-02 overwrite)", () => {
    expect(storagePathForFile(COMMESSA_ID, "etichetta vino.pdf")).toBe(
      storagePathForFile(COMMESSA_ID, "etichetta vino.pdf"),
    );
  });

  it("sanitises unsafe characters but avoids collisions between different names", () => {
    const a = storagePathForFile(COMMESSA_ID, "città à.pdf");
    const b = storagePathForFile(COMMESSA_ID, "città è.pdf");
    expect(a).not.toBe(b);
    // Only storage-safe characters after the job id.
    expect(a.slice(COMMESSA_ID.length + 1)).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});

describe("uploadCommessaFile", () => {
  it("uploads the binary to storage and records metadata with storagePath", async () => {
    const res = await uploadCommessaFile(COMMESSA_ID, USER_ID, makeFile("prova.pdf"));
    expect(res.ok).toBe(true);
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [path, , opts] = uploadMock.mock.calls[0];
    expect(path).toBe(storagePathForFile(COMMESSA_ID, "prova.pdf"));
    expect(opts).toMatchObject({ upsert: false, contentType: "application/pdf" });
    const row = useFileStore.getState().files.find((f) => f.nome === "prova.pdf");
    expect(row?.storagePath).toBe(path);
  });

  it("uses upsert only when replacing an available file", async () => {
    const first = await uploadCommessaFile(COMMESSA_ID, USER_ID, makeFile("prova.pdf"));
    const second = await uploadCommessaFile(COMMESSA_ID, USER_ID, makeFile("prova.pdf"));

    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: true, replaced: true });
    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(uploadMock.mock.calls[0][2]).toMatchObject({ upsert: false });
    expect(uploadMock.mock.calls[1][2]).toMatchObject({ upsert: true });
    expect(useFileStore.getState().files).toHaveLength(1);
  });

  it("if storage rejects, writes NO metadata or events and returns ok:false", async () => {
    uploadMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await uploadCommessaFile(COMMESSA_ID, USER_ID, makeFile("ko.pdf"));
    expect(res.ok).toBe(false);
    expect(useFileStore.getState().files).toHaveLength(0);
    expect(useEventiStore.getState().eventi).toHaveLength(0);
  });

  it("in QA demo mode never calls storage but updates the UI", async () => {
    setDemoMode(true);
    const res = await uploadCommessaFile(COMMESSA_ID, USER_ID, makeFile("demo.pdf"));
    expect(res.ok).toBe(true);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(useFileStore.getState().files).toHaveLength(1);
  });

  it("rejects formats not allowed (PDF/JPEG/PNG only, §9)", async () => {
    const res = await uploadCommessaFile(COMMESSA_ID, USER_ID, makeFile("x.gif", "image/gif"));
    expect(res.ok).toBe(false);
    expect(uploadMock).not.toHaveBeenCalled();
  });
});

describe("getFileDownloadUrl", () => {
  const baseRow = {
    id: "f1",
    commessaId: COMMESSA_ID,
    nome: "prova.pdf",
    tipo: "PDF" as const,
    dimensioneBytes: 10,
    caricatoIl: new Date().toISOString(),
    caricatoDaUserId: USER_ID,
    binarioDisponibile: true,
    storagePath: `${COMMESSA_ID}/prova.pdf`,
  };

  it("asks the bucket for a signed URL with download=original name", async () => {
    createSignedUrlMock.mockResolvedValue({ data: { signedUrl: "https://x/signed" }, error: null });
    const url = await getFileDownloadUrl(baseRow);
    expect(url).toBe("https://x/signed");
    expect(createSignedUrlMock).toHaveBeenCalledWith(
      baseRow.storagePath,
      expect.any(Number),
      { download: "prova.pdf" },
    );
    expect(FILES_BUCKET).toBe("commessa-files");
  });

  it("returns null if the binary is gone (retention) or the path is missing", async () => {
    expect(await getFileDownloadUrl({ ...baseRow, binarioDisponibile: false })).toBeNull();
    expect(await getFileDownloadUrl({ ...baseRow, storagePath: null })).toBeNull();
    expect(createSignedUrlMock).not.toHaveBeenCalled();
  });
});
