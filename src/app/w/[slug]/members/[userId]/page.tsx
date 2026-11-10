import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProfileClient from "@/components/profile/ProfileClient";
import IndividualCharts from "@/components/analytics/IndividualCharts";
import { loadAnalyticsData } from "@/lib/analytics-data";

export default async function ProfilePage({ params }: { params: Promise<{ slug: string; userId: string }> }) {
  const { slug, userId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: ws } = await supabase.from("workspaces").select("id").eq("slug", slug).maybeSingle();
  if (!ws) notFound();

  const [profile, membership, viewer, skills, events, learning, achievements, certificates] = await Promise.all([
    supabase.from("profiles").select("id, full_name, username, bio, avatar_url").eq("id", userId).maybeSingle(),
    supabase.from("workspace_members").select("role, team_role").eq("workspace_id", ws.id).eq("user_id", userId).maybeSingle(),
    supabase.from("workspace_members").select("role").eq("workspace_id", ws.id).eq("user_id", auth.user!.id).single(),
    supabase.from("member_skills").select("id, level, verified_by, verified_at, updated_at, skills(id, name, category)").eq("workspace_id", ws.id).eq("user_id", userId).order("updated_at", { ascending: false }),
    supabase.from("skill_progress_events").select("id, old_level, new_level, created_at, skills(name)").eq("workspace_id", ws.id).eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    supabase.from("learning_items").select("id, title, url, progress, completed_at").eq("workspace_id", ws.id).eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("achievements").select("id, title, description, achieved_at").eq("workspace_id", ws.id).eq("user_id", userId).order("achieved_at", { ascending: false }),
    supabase.from("certificates").select("id, title, issuer, issued_on, file_path").eq("workspace_id", ws.id).eq("user_id", userId).order("issued_on", { ascending: false }),
  ]);
  if (!profile.data || !membership.data) notFound();

  // Resolve verifier names
  const verifierIds = [...new Set((skills.data ?? []).map((s) => s.verified_by).filter(Boolean))] as string[];
  const verifiers: Record<string, string> = {};
  if (verifierIds.length) {
    const { data } = await supabase.from("profiles").select("id, full_name, username").in("id", verifierIds);
    (data ?? []).forEach((p) => (verifiers[p.id] = p.full_name || p.username));
  }

  const analytics = await loadAnalyticsData(supabase, ws.id);

  return (
    <div className="max-w-4xl space-y-8">
    <ProfileClient
      workspaceId={ws.id}
      viewerId={auth.user!.id}
      viewerRole={viewer.data?.role ?? "member"}
      profile={profile.data}
      teamRole={membership.data.team_role ?? ""}
      role={membership.data.role}
      skills={(skills.data ?? []) as never}
      events={(events.data ?? []) as never}
      learning={learning.data ?? []}
      achievements={achievements.data ?? []}
      certificates={certificates.data ?? []}
      verifiers={verifiers}
    />
    <section className="space-y-3">
      <h2 className="font-medium text-lg">Progress analytics</h2>
      <IndividualCharts data={analytics} userId={userId} />
    </section>
    </div>
  );
}
