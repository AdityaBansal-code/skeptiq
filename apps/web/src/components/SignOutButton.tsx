"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await createClient().auth.signOut();
        router.push("/login");
        router.refresh();
      }}
      className={`inline-flex items-center rounded-lg border border-line-strong bg-surface px-3 py-2 text-xs font-semibold text-muted-ink transition-[background-color,color,box-shadow] duration-150 hover:bg-paper hover:text-ink focus-visible:relative focus-visible:z-10 motion-reduce:transition-none ${className}`}
    >
      Sign out
    </button>
  );
}
