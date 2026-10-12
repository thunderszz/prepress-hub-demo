import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  accent,
  className,
}: {
  label: string;
  value: React.ReactNode;
  accent?: "default" | "danger" | "primary" | "muted";
  className?: string;
}) {
  const border =
    accent === "danger" ? "border-l-4 border-l-destructive" :
    accent === "primary" ? "border-l-4 border-l-primary" :
    accent === "muted" ? "border-l-4 border-l-muted-foreground/40" :
    "";
  const valueColor = accent === "danger" ? "text-destructive" : accent === "primary" ? "text-primary" : "text-foreground";

  return (
    <div className={cn("bg-card rounded-md border border-border p-4", border, className)}>
      <div className="label-caps mb-2">{label}</div>
      <div className={cn("text-3xl font-semibold tabular-nums", valueColor)}>{value}</div>
    </div>
  );
}
