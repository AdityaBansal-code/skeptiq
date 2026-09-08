import { redirect } from "next/navigation";
import { PersonasWorkspaceView } from "@/components/AppWorkspaceViews";
import { getUserDashboardData } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export default async function PersonasPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { personas } = await getUserDashboardData(user.id);
  return <PersonasWorkspaceView personas={personas} />;
}
