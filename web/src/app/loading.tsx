export default function Loading() {
  return (
    <div className="flex flex-col gap-10 animate-pulse">
      <div className="flex flex-col gap-4">
        <div className="h-7 w-40 rounded-lg bg-surface-2" />
        <div className="grid grid-cols-3 gap-3 max-w-md">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-surface-2" />
          ))}
        </div>
      </div>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border overflow-hidden"
          >
            <div className="aspect-video bg-surface-2" />
            <div className="p-3 flex flex-col gap-2">
              <div className="h-4 w-full rounded bg-surface-2" />
              <div className="h-3 w-2/3 rounded bg-surface-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
