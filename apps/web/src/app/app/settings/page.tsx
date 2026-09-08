import { redirect } from "next/navigation";
import { SettingsView } from "@/components/SettingsView";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <SettingsView userEmail={user.email ?? "Account"} />;
}
