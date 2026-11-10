import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MembersAdmin from "@/components/settings/MembersAdmin";

export default async function Settings({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: ws } = await supabase.from("workspaces").select("id, name").eq("slug", slug).single();
  if (!ws) notFound();

  const { data: me } = await supabase
    .from("workspace_members").select("role").eq("workspace_id", ws.id).eq("user_id", auth.user!.id).single();
  if (me?.role !== "admin") notFound();

  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.from("workspace_members").select("user_id, role, profiles(full_name, username)").eq("workspace_id", ws.id),
    supabase.from("invitations").select("id, email, role, token, expires_at").eq("workspace_id", ws.id).is("accepted_at", null),
  ]);

  return (
    <MembersAdmin
      workspaceId={ws.id}
      currentUserId={auth.user!.id}
      members={(members ?? []) as never}
      invites={(invites ?? []) as never}
    />
  );
}
