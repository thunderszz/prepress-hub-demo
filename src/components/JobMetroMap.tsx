import { Commessa } from "@/lib/types";
import { computeDisplaySteps, DisplayStep, DisplayStepState } from "@/lib/displaySteps";
import { PauseCircle, XCircle, LucideIcon } from "lucide-react";

interface Props {
  commessa: Commessa;
  sospesa?: boolean;
}

export function JobMetroMap({ commessa, sospesa = false }: Props) {
  const steps = computeDisplaySteps(commessa, sospesa);
  // Linear progress up to the last completed/current dot.
  const activeIdx = lastActiveIndex(steps);

  return (
    <div className="overflow-x-auto pb-2">
      <div className="min-w-[1040px] md:min-w-0">
        {/* Desktop horizontal */}
        <div className="hidden md:block">
          <div className="relative px-3 pt-3">
            <div className="absolute left-0 right-0 top-[34px] h-0.5 bg-border" />
            <div
              className={`absolute left-0 top-[34px] h-0.5 ${sospesa ? "bg-warning/60" : "bg-primary"}`}
              style={{ width: `${(activeIdx / Math.max(1, steps.length - 1)) * 100}%` }}
            />
            <div
              className="relative grid"
              style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}
            >
              {steps.map((step) => (
                <div key={step.key} className="flex flex-col items-center gap-2 px-1">
                  <Node state={step.state} Icon={step.Icon} />
                  <div className="text-center">
                    <div
                      className={`text-[12px] font-semibold leading-tight ${labelClass(step.state)}`}
                    >
                      {step.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile vertical */}
        <div className="md:hidden space-y-2">
          {steps.map((step, i) => (
            <div key={step.key} className="flex gap-3">
              <div className="flex flex-col items-center">
                <Node state={step.state} Icon={step.Icon} small />
                {i < steps.length - 1 && (
                  <div
                    className={`w-0.5 flex-1 mt-1 ${step.state === "done" ? "bg-primary" : step.state === "rejected" ? "bg-destructive" : "bg-border"}`}
                    style={{ minHeight: 24 }}
                  />
                )}
              </div>
              <div className="flex-1 pb-2">
                <div className={`text-[13px] font-semibold ${labelClass(step.state)}`}>
                  {step.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Index of the last "active" dot (current/blocked) or, failing that, of the last completed one. */
function lastActiveIndex(steps: DisplayStep[]): number {
  let current = -1;
  let done = -1;
  steps.forEach((s, i) => {
    if (s.state === "current" || s.state === "blocked") current = i;
    if (s.state === "done" || s.state === "rejected") done = i;
  });
  return current >= 0 ? current : done;
}

function labelClass(state: DisplayStepState): string {
  switch (state) {
    case "current":
      return "text-primary";
    case "rejected":
      return "text-destructive";
    case "done":
      return "text-foreground";
    default:
      return "text-muted-foreground";
  }
}

function Node({
  state,
  Icon,
  small,
}: {
  state: DisplayStepState;
  Icon: LucideIcon;
  small?: boolean;
}) {
  const size = small ? "h-7 w-7" : "h-[34px] w-[34px]";
  const cls =
    state === "done"
      ? "bg-primary text-primary-foreground border-primary"
      : state === "current"
        ? "bg-primary text-primary-foreground border-primary ring-4 ring-primary/15"
        : state === "rejected"
          ? "bg-destructive text-destructive-foreground border-destructive"
          : state === "blocked"
            ? "bg-card text-warning border-warning border-dashed"
            : "bg-card text-muted-foreground border-border";
  return (
    <div className={`${size} rounded-full border-2 grid place-items-center relative z-10 ${cls}`}>
      {state === "blocked" ? (
        <PauseCircle className="h-4 w-4" />
      ) : state === "rejected" ? (
        <XCircle className="h-4 w-4" />
      ) : (
        <Icon className="h-4 w-4" />
      )}
    </div>
  );
}
