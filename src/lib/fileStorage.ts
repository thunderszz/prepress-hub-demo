// Job files. Binaries go to the private "commessa-files" bucket at
// <commessa_id>/<sanitised-name>, so uploading the same name again replaces
// the file. Metadata lives in file_commessa; retention runs server-side
// (migrations 0009 and 0010).

import { supabase } from "./supabase";
import { uploadFile } from "./workflowActions";
import { useFileStore } from "./store";
import type { FileCommessa, FileTipo } from "./types";

export const FILES_BUCKET = "commessa-files";

/** Validity of the signed download URL (seconds). */
const SIGNED_URL_TTL = 300;

const MIME_TO_TIPO: Record<string, FileTipo> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG",
  "image/jpg": "JPEG",
  "image/png": "PNG",
};

// Deterministic hash (djb2) of the original name: avoids collisions
// between different names that sanitise the same way (e.g. accents).
function hashNome(nome: string): string {
  let h = 5381;
  for (const ch of nome) {
    h = ((h * 33) ^ ch.codePointAt(0)!) >>> 0;
  }
  return h.toString(36);
}

/**
 * Deterministic bucket path: the first folder is the job id (required
 * by the storage policies), the rest is the name sanitised to storage-safe
 * characters + an anti-collision hash.
 */
export function storagePathForFile(commessaId: string, nome: string): string {
  const dot = nome.lastIndexOf(".");
  const rawBase = dot > 0 ? nome.slice(0, dot) : nome;
  const rawExt = dot > 0 ? nome.slice(dot + 1) : "";
  const base =
    rawBase.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 80) || "file";
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${commessaId}/${base}-${hashNome(nome)}${ext ? `.${ext}` : ""}`;
}

function hasAvailableStorageFile(commessaId: string, nome: string, storagePath: string): boolean {
  return useFileStore.getState().files.some(
    (f) =>
      f.commessaId === commessaId &&
      f.nome === nome &&
      f.storagePath === storagePath &&
      f.binarioDisponibile,
  );
}

export type UploadCommessaFileResult =
  | { ok: true; replaced?: boolean }
  | { ok: false; reason: string };

/**
 * Uploads a job file: the binary to storage first, then its metadata and a
 * history event. If storage rejects the file, no metadata is written.
 */
export async function uploadCommessaFile(
  commessaId: string,
  userId: string,
  file: File,
): Promise<UploadCommessaFileResult> {
  const tipo = MIME_TO_TIPO[file.type];
  if (!tipo) {
    return { ok: false, reason: `${file.name}: only PDF, JPEG or PNG.` };
  }

  const path = storagePathForFile(commessaId, file.name);
  const replacesExisting = hasAvailableStorageFile(commessaId, file.name, path);
  const { error } = await supabase.storage
    .from(FILES_BUCKET)
    .upload(path, file, { upsert: replacesExisting, contentType: file.type });
  if (error) {
    return { ok: false, reason: `Storage: ${error.message}` };
  }

  const res = uploadFile(commessaId, userId, {
    nome: file.name,
    tipo,
    dimensioneBytes: file.size,
    storagePath: path,
  });
  return { ok: true, replaced: res.replaced };
}

/**
 * Signed download URL for a file (private bucket). Null if the binary
 * is no longer available (retention).
 */
export async function getFileDownloadUrl(f: FileCommessa): Promise<string | null> {
  if (!f.storagePath || !f.binarioDisponibile) return null;
  const { data, error } = await supabase.storage
    .from(FILES_BUCKET)
    .createSignedUrl(f.storagePath, SIGNED_URL_TTL, { download: f.nome });
  if (error) return null;
  return data?.signedUrl ?? null;
}
