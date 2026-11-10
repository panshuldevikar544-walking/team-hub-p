import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workspace_members")
    .select("joined_at, workspaces(slug)")
    .order("joined_at")
    .limit(1);
  const ws = data?.[0]?.workspaces as unknown as { slug: string } | null;
  redirect(ws ? `/w/${ws.slug}/dashboard` : "/onboarding");
}
