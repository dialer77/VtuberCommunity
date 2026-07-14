export function PageHeader({
  title,
  description,
  live,
}: {
  title: string;
  description?: string;
  live?: boolean;
}) {
  return (
    <header className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2.5">
        {live ? (
          <span className="relative flex h-2.5 w-2.5" aria-hidden>
            <span className="absolute inline-flex h-full w-full rounded-full bg-live opacity-60 animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-live" />
          </span>
        ) : null}
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      </div>
      {description ? (
        <p className="text-sm text-muted">{description}</p>
      ) : null}
    </header>
  );
}
