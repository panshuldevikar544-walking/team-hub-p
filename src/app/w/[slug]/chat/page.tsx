import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ChatIndex({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: ws } = await supabase.from("workspaces").select("id").eq("slug", slug).maybeSingle();
  if (!ws) notFound();
  const { data: ch } = await supabase
    .from("channels").select("id").eq("workspace_id", ws.id).eq("kind", "text").order("created_at").limit(1).maybeSingle();
  if (!ch) notFound();
  redirect(`/w/${slug}/chat/${ch.id}`);
}
