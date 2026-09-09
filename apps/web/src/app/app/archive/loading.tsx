export default function ArchiveLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-pulse pb-12">
      <div className="space-y-2 border-b border-zinc-200/80 pb-6">
        <div className="h-8 w-44 rounded-lg bg-zinc-200/70" />
        <div className="h-4 w-72 rounded-md bg-zinc-100" />
      </div>

      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-20 rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-4 flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-4 w-48 rounded bg-zinc-200" />
              <div className="h-3 w-80 rounded bg-zinc-100" />
            </div>
            <div className="h-6 w-20 rounded-full bg-zinc-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
