export default function JobLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-pulse pb-12 pt-6">
      <div className="h-4 w-32 rounded bg-zinc-200" />
      
      <div className="rounded-3xl border border-zinc-200/80 bg-surface p-6 space-y-4">
        <div className="flex justify-between items-center">
          <div className="flex gap-2">
            <div className="h-6 w-24 rounded-lg bg-zinc-200" />
            <div className="h-6 w-28 rounded-full bg-zinc-200" />
          </div>
          <div className="h-8 w-28 rounded-xl bg-zinc-200" />
        </div>
        <div className="h-4 w-64 rounded bg-zinc-100" />
      </div>

      <div className="rounded-2xl border border-zinc-200/80 bg-surface p-5 space-y-3">
        <div className="h-4 w-32 rounded bg-zinc-200" />
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-16 rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 space-y-2">
              <div className="h-3 w-6 rounded bg-zinc-200" />
              <div className="h-3 w-16 rounded bg-zinc-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
