// FORMAL validation of email addresses (customer record and send wizard).
// Whether the mailbox really exists cannot be checked client-side: we
// validate the shape (local@domain.tld) to catch typos before sending.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Returns the INVALID addresses of an (already split) list. */
export function invalidEmails(values: string[]): string[] {
  return values.map((v) => v.trim()).filter((v) => v.length > 0 && !isValidEmail(v));
}

export interface ParsedEmailList {
  /** Valid addresses, de-duplicated (case-insensitive), in pasted order. */
  emails: string[];
  /** Chunks that are not a valid address (typos, names without an address). */
  invalid: string[];
}

// Splits on , ; and newlines, but not inside "…" or <…>: Outlook pastes
// `"Smith, John" <john@x.com>; Luke <luke@y.com>`.
function splitSegments(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  let inAngle = false;
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === "<" && !inQuotes) inAngle = true;
    else if (ch === ">" && !inQuotes) inAngle = false;
    if (!inQuotes && !inAngle && (ch === "," || ch === ";" || ch === "\n" || ch === "\r")) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * Parses a list of addresses typed by hand or pasted from a mail client
 * ("Name <address>", separated by , ; newlines or spaces). A chunk with no
 * address at all (e.g. just a name) ends up among the invalid ones.
 */
export function parseEmailList(text: string): ParsedEmailList {
  const emails: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const segment of splitSegments(text)) {
    const angled = [...segment.matchAll(/<([^<>]*)>/g)].map((m) => m[1]);
    let candidates: string[];
    if (angled.length > 0) {
      candidates = angled;
    } else {
      const tokens = segment.split(/\s+/).map((t) => t.replace(/^['"]+|['"]+$/g, ""));
      const withAt = tokens.filter((t) => t.includes("@"));
      candidates = withAt.length > 0 ? withAt : [segment];
    }
    for (const raw of candidates) {
      const value = raw.trim();
      if (!value) continue;
      if (!isValidEmail(value)) {
        if (!invalid.includes(value)) invalid.push(value);
        continue;
      }
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      emails.push(value);
    }
  }
  return { emails, invalid };
}
