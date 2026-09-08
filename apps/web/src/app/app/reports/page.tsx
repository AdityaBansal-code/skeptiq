import { redirect } from "next/navigation";
import { ReportsWorkspaceView } from "@/components/AppWorkspaceViews";
import { getUserDashboardData } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";

export default async function ReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { reports } = await getUserDashboardData(user.id);
  return <ReportsWorkspaceView reports={reports} />;
}
