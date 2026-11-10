import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ChatClient from "@/components/chat/ChatClient";

export default async function ChatPage({ params }: { params: Promise<{ slug: string; channelId: string }> }) {
  const { slug, channelId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: ws } = await supabase.from("workspaces").select("id").eq("slug", slug).maybeSingle();
  if (!ws) notFound();

  const [channels, people, viewer] = await Promise.all([
    supabase.from("channels").select("id, kind, name, topic, project_id").eq("workspace_id", ws.id).order("created_at"),
    supabase.from("workspace_members").select("user_id, profiles(full_name, username, avatar_url)").eq("workspace_id", ws.id),
    supabase.from("workspace_members").select("role").eq("workspace_id", ws.id).eq("user_id", auth.user!.id).single(),
  ]);
  const all = channels.data ?? [];
  const active = all.find((c) => c.id === channelId);
  if (!active) notFound();

  // Who is on the other end of each DM
  const dmIds = all.filter((c) => c.kind === "dm").map((c) => c.id);
  const dmOther: Record<string, string> = {};
  if (dmIds.length) {
    const { data } = await supabase.from("channel_members").select("channel_id, user_id").in("channel_id", dmIds);
    (data ?? []).forEach((m) => { if (m.user_id !== auth.user!.id) dmOther[m.channel_id] = m.user_id; });
  }

  return (
    <ChatClient
      slug={slug}
      workspaceId={ws.id}
      viewerId={auth.user!.id}
      viewerRole={viewer.data?.role ?? "member"}
      channels={all}
      dmOther={dmOther}
      people={(people.data ?? []) as never}
      activeId={channelId}
    />
  );
}
