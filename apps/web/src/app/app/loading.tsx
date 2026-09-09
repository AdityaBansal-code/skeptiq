export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 animate-pulse pb-12">
      <div className="flex flex-col gap-4 border-b border-zinc-200/80 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 rounded-lg bg-zinc-200/70" />
          <div className="h-4 w-80 rounded-md bg-zinc-100" />
        </div>
        <div className="h-10 w-36 rounded-xl bg-zinc-200/70" />
      </div>

      <div className="space-y-4">
        <div className="h-5 w-40 rounded-md bg-zinc-200/70" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-40 rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-5 space-y-3">
              <div className="flex justify-between items-center">
                <div className="h-4 w-24 rounded bg-zinc-200" />
                <div className="h-4 w-12 rounded bg-zinc-200" />
              </div>
              <div className="h-10 w-full rounded bg-zinc-100" />
              <div className="h-3 w-3/4 rounded bg-zinc-100" />
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4 pt-4">
        <div className="h-5 w-48 rounded-md bg-zinc-200/70" />
        <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/50 p-6 space-y-4">
          <div className="h-6 w-1/3 rounded bg-zinc-200" />
          <div className="h-16 w-full rounded bg-zinc-100" />
        </div>
      </div>
    </div>
  );
}
