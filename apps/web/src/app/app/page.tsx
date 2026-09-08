import { AppOverview } from "@/components/AppOverview";
import { getUserDashboardData } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AppPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { simulations, analytics } = await getUserDashboardData(user.id);

  return <AppOverview simulations={simulations} analytics={analytics} />;
}
