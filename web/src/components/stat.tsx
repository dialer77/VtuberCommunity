export function Stat({
  label,
  value,
  unit,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-surface px-4 py-3">
      <span className="text-xs text-muted-2">{label}</span>
      <span
        className={`text-xl font-extrabold tabular-nums tracking-tight ${
          accent ? "text-accent" : "text-foreground"
        }`}
      >
        {value}
        {unit ? (
          <span className="text-sm font-semibold text-muted-2 ml-0.5">
            {unit}
          </span>
        ) : null}
      </span>
    </div>
  );
}
