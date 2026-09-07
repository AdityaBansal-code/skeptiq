import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { IdeaForm } from "@/components/IdeaForm";
import { SignOutButton } from "@/components/SignOutButton";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Idea Validation Panel</h1>
        <SignOutButton />
      </div>
      <p className="mb-6 text-sm text-neutral-600">
        Describe an idea. A panel of AI personas reacts independently, debates the objections, and
        you get back a segmented report — which parts of the market adopt it, which reject it, and
        why. Not a single score.
      </p>
      <IdeaForm />
    </main>
  );
}
