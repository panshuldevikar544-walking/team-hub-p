import Link from "next/link";
import { notFound } from "next/navigation";
import Avatar from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/server";

type Row = {
  user_id: string;
  role: string;
  team_role: string | null;
  profiles: { full_name: string; username: string; avatar_url: string | null } | null;
};

export default async function Members({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: ws } = await supabase.from("workspaces").select("id").eq("slug", slug).maybeSingle();
  if (!ws) notFound();

  const [{ data: members }, { data: skills }] = await Promise.all([
    supabase.from("workspace_members").select("user_id, role, team_role, profiles(full_name, username, avatar_url)").eq("workspace_id", ws.id),
    supabase.from("member_skills").select("user_id, skills(name)").eq("workspace_id", ws.id),
  ]);

  const byUser = new Map<string, string[]>();
  (skills ?? []).forEach((s) => {
    const name = (s.skills as unknown as { name: string } | null)?.name;
    if (!name) return;
    byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), name]);
  });

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold">Members</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {((members ?? []) as unknown as Row[]).map((m) => {
          const name = m.profiles?.full_name || m.profiles?.username || "Member";
          const tags = byUser.get(m.user_id) ?? [];
          return (
            <Link key={m.user_id} href={`/w/${slug}/members/${m.user_id}`} className="card p-4 hover:border-white/20 transition-colors space-y-3">
              <div className="flex items-center gap-3">
                <Avatar url={m.profiles?.avatar_url} name={name} size={44} />
                <div className="min-w-0">
                  <div className="font-medium truncate">{name}</div>
                  <div className="text-muted text-xs truncate">{m.team_role || `@${m.profiles?.username}`}</div>
                </div>
                <span className="ml-auto text-xs rounded-full bg-surface-2 px-2 py-1 text-muted capitalize">{m.role}</span>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tags.slice(0, 5).map((t) => (
                    <span key={t} className="text-xs rounded-md bg-surface-2 px-2 py-0.5 text-muted">{t}</span>
                  ))}
                  {tags.length > 5 && <span className="text-xs text-muted">+{tags.length - 5}</span>}
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
