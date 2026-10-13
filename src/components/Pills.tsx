import { cn } from "@/lib/utils";
import { EsitoProvaColore, StatoCommessa, STATO_LABELS } from "@/lib/types";

type Tone = "todo" | "progress" | "done" | "late" | "urgent" | "ready" | "neutral";

const toneClasses: Record<Tone, string> = {
  todo: "bg-status-todo-bg text-status-todo-fg",
  progress: "bg-status-progress-bg text-status-progress-fg",
  done: "bg-status-done-bg text-status-done-fg",
  late: "bg-status-late-bg text-status-late-fg",
  urgent: "bg-status-urgent-bg text-status-urgent-fg",
  ready: "bg-status-ready-bg text-status-ready-fg",
  neutral: "bg-muted text-muted-foreground",
};

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STATO_TONE: Record<StatoCommessa, Tone> = {
  disponibile: "todo",
  assegnata: "ready",
  in_lavorazione: "progress",
  in_attesa_approvazione_pdf: "progress",
  in_attesa_prova_colore: "progress",
  in_attesa_approvazione_caduta: "progress",
  in_produzione_matrice: "progress",
  spedito: "done",
};

function statoLabel({
  stato,
  esitoProvaColore,
}: {
  stato: StatoCommessa;
  esitoProvaColore?: EsitoProvaColore;
}): string {
  if (stato === "in_attesa_prova_colore" && esitoProvaColore === "spedita_approvata") {
    return "Colour proof approved";
  }
  return STATO_LABELS[stato];
}

export function StatoCommessaPill({
  stato,
  sospesa,
  esitoProvaColore,
}: {
  stato: StatoCommessa;
  sospesa?: boolean;
  esitoProvaColore?: EsitoProvaColore;
}) {
  if (sospesa) return <Pill tone="late">On hold</Pill>;
  return <Pill tone={STATO_TONE[stato]}>{statoLabel({ stato, esitoProvaColore })}</Pill>;
}
