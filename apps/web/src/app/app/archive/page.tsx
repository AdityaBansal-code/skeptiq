import { redirect } from "next/navigation";
import { ArchiveWorkspaceView } from "@/components/AppWorkspaceViews";
import { getUserSimulations } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export default async function ArchivePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const simulations = await getUserSimulations(user.id);
  return <ArchiveWorkspaceView simulations={simulations} />;
}
