import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppTabsContainer } from "@/components/AppTabsContainer";
import { createClient } from "@/lib/supabase/server";

export default async function AuthenticatedAppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <AppTabsContainer userEmail={user.email ?? "Account"}>{children}</AppTabsContainer>;
}
