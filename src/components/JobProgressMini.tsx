import { Commessa } from "@/lib/types";
import { computeDisplaySteps } from "@/lib/displaySteps";

interface Props {
  commessa: Commessa;
  sospesa?: boolean;
  className?: string;
}

export function JobProgressMini({ commessa, sospesa, className }: Props) {
  const steps = computeDisplaySteps(commessa, !!sospesa);
  const currentPos = steps.findIndex((s) => s.state === "current" || s.state === "blocked");
  return (
    <div
      className={`inline-flex items-center gap-0.5 ${className ?? ""}`}
      aria-label={`Progress: step ${(currentPos < 0 ? steps.length : currentPos + 1)} of ${steps.length}`}
    >
      {steps.map((step) => {
        const cls =
          step.state === "blocked"
            ? "bg-warning"
            : step.state === "rejected"
              ? "bg-destructive"
              : step.state === "current"
                ? "bg-primary ring-2 ring-primary/25"
                : step.state === "done"
                  ? "bg-primary/70"
                  : "bg-border";
        return <span key={step.key} className={`h-2 w-2 rounded-full ${cls}`} />;
      })}
    </div>
  );
}
