export default function ReportsLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-pulse pb-12">
      <div className="space-y-2 border-b border-zinc-200/80 pb-6">
        <div className="h-8 w-44 rounded-lg bg-zinc-200/70" />
        <div className="h-4 w-72 rounded-md bg-zinc-100" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-48 rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-5 space-y-3">
            <div className="h-4 w-20 rounded bg-zinc-200" />
            <div className="h-6 w-3/4 rounded bg-zinc-200" />
            <div className="h-12 w-full rounded bg-zinc-100" />
            <div className="h-4 w-1/2 rounded bg-zinc-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
