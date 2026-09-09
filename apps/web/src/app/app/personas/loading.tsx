export default function PersonasLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-pulse pb-12">
      <div className="space-y-2 border-b border-zinc-200/80 pb-6">
        <div className="h-8 w-44 rounded-lg bg-zinc-200/70" />
        <div className="h-4 w-72 rounded-md bg-zinc-100" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-44 rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-5 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-zinc-200" />
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-28 rounded bg-zinc-200" />
                <div className="h-3 w-20 rounded bg-zinc-100" />
              </div>
            </div>
            <div className="h-12 w-full rounded bg-zinc-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
