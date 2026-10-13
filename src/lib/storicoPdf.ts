// PDF export of a job's history.
// Generated client-side with jsPDF: no data leaves the browser.

import { jsPDF } from "jspdf";
import { Cliente, Commessa, EmailInviata, Evento, STATO_LABELS, User } from "./types";
import { fmtDateTime } from "./format";

interface StoricoPdfInput {
  commessa: Commessa;
  cliente?: Cliente;
  eventi: Evento[];
  users: User[];
  emailInviate: EmailInviata[];
}

const MARGIN = 15;
const PAGE_W = 210;
const PAGE_H = 297;
const BODY_W = PAGE_W - MARGIN * 2;

function buildStoricoPdf({ commessa, cliente, eventi, users, emailInviate }: StoricoPdfInput): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  let y = MARGIN;

  const ensureSpace = (needed: number) => {
    if (y + needed > PAGE_H - MARGIN) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const line = (text: string, opts: { size?: number; bold?: boolean; gray?: boolean; indent?: number } = {}) => {
    const { size = 9, bold = false, gray = false, indent = 0 } = opts;
    doc.setFontSize(size);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setTextColor(gray ? 110 : 20);
    const rows = doc.splitTextToSize(text, BODY_W - indent) as string[];
    const h = rows.length * size * 0.42;
    ensureSpace(h);
    doc.text(rows, MARGIN + indent, y);
    y += h + 1;
  };

  // ---- header ------------------------------------------------------
  line(`Job history ${commessa.numeroCommessa}`, { size: 15, bold: true });
  line(commessa.nomeLavoro, { size: 11 });
  if (cliente) line(`Customer: ${cliente.nome}`, { gray: true });
  line(`Current status: ${STATO_LABELS[commessa.stato]}`, { gray: true });
  line(`Exported on ${fmtDateTime(new Date().toISOString())}`, { size: 8, gray: true });
  y += 2;
  doc.setDrawColor(180);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 5;

  // ---- events in chronological order -------------------------------
  const ordinati = [...eventi].sort((a, b) => a.data.localeCompare(b.data));
  if (ordinati.length === 0) line("No events recorded.", { gray: true });

  for (const e of ordinati) {
    const u = e.userId ? users.find((x) => x.id === e.userId) : undefined;
    ensureSpace(14);
    line(`${fmtDateTime(e.data)}${u ? ` — ${u.nome}` : ""}`, { size: 8, gray: true });
    line(e.titolo, { size: 10, bold: true });
    if (e.dettaglio) line(e.dettaglio, { gray: true, indent: 2 });

    // for email sends, include a summary of the archived message
    if (e.refType === "email" && e.refId) {
      const em = emailInviate.find((m) => m.id === e.refId);
      if (em) {
        line(`From: ${em.mittente || "—"}   To: ${em.destinatari.join(", ")}`, { size: 8, gray: true, indent: 2 });
        if (em.cc && em.cc.length > 0) line(`CC: ${em.cc.join(", ")}`, { size: 8, gray: true, indent: 2 });
        line(`Subject: ${em.oggetto}${em.stato === "errore" ? "   [SEND ERROR]" : ""}`, { size: 8, gray: true, indent: 2 });
      }
    }
    y += 2;
  }

  // ---- page numbers ------------------------------------------------
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`${commessa.numeroCommessa} — page ${i} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
  }

  return doc;
}

export function exportStoricoPdf(input: StoricoPdfInput): void {
  const doc = buildStoricoPdf(input);
  const safeNum = input.commessa.numeroCommessa.replace(/[^\w-]+/g, "-");
  doc.save(`history-${safeNum}.pdf`);
}
