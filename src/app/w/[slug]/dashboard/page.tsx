import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DashboardLayout, { type Section } from "@/components/dashboard/DashboardLayout";
import { HeroCard, TeamPulse, ListeningNow, WeekActivity, Leaderboard, SkillSpotlight } from "@/components/dashboard/Widgets";

const STATUS_LABEL: Record<string, string> = { todo: "To Do", in_progress: "In Progress", review: "Review", completed: "Completed" };

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

export default async function Dashboard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: ws } = await supabase.from("workspaces").select("id, name").eq("slug", slug).single();
  const wsId = ws!.id;

  const weekAgo = daysAgo(7);
  const [members, projects, myTaskLinks, openTasks, activity, people, upcoming, roster, weekMsgs, weekActs, skillEvents] = await Promise.all([
    supabase.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", wsId),
    supabase.from("projects").select("id, name, deadline").eq("workspace_id", wsId).eq("status", "active").order("created_at", { ascending: false }),
    supabase.from("task_assignees").select("task_id").eq("user_id", auth.user!.id),
    supabase.from("tasks").select("id, title, status, due_date, project_id, projects(name)").eq("workspace_id", wsId).neq("status", "completed"),
    supabase.from("project_activity").select("id, actor_id, action, meta, created_at, project_id, projects(name)").eq("workspace_id", wsId).order("created_at", { ascending: false }).limit(8),
    supabase.from("profiles").select("id, full_name, username"),
    supabase.from("events").select("id, title, kind, starts_at, all_day").eq("workspace_id", wsId).gte("ends_at", new Date().toISOString()).order("starts_at").limit(5),
    supabase.from("workspace_members").select("user_id, profiles(full_name, username, avatar_url)").eq("workspace_id", wsId),
    supabase.from("messages").select("author_id, created_at").eq("workspace_id", wsId).gte("created_at", weekAgo).limit(2000),
    supabase.from("project_activity").select("actor_id, created_at").eq("workspace_id", wsId).gte("created_at", weekAgo).limit(2000),
    supabase.from("skill_progress_events").select("id, user_id, new_level, old_level, created_at, skills(name)").eq("workspace_id", wsId).order("created_at", { ascending: false }).limit(6),
  ]);

  type Prof = { full_name: string | null; username: string | null; avatar_url: string | null } | null;
  const peopleLite = ((roster.data ?? []) as unknown as { user_id: string; profiles: Prof }[]).map((r) => ({
    user_id: r.user_id,
    name: r.profiles?.full_name || r.profiles?.username || "Member",
    avatar_url: r.profiles?.avatar_url ?? null,
  }));
  const byId = new Map(peopleLite.map((p) => [p.user_id, p]));
  const counts = new Map<string, number>();
  [...(weekMsgs.data ?? []).map((m) => m.author_id), ...(weekActs.data ?? []).map((a) => a.actor_id)].forEach((id) => {
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  });
  const leaders = [...counts.entries()]
    .map(([id, count]) => ({ user_id: id, count, name: byId.get(id)?.name ?? "Member", avatar_url: byId.get(id)?.avatar_url ?? null }))
    .sort((a, b) => b.count - a.count).slice(0, 5);
  const spotlight = ((skillEvents.data ?? []) as unknown as { id: string; user_id: string; new_level: number; old_level: number | null; created_at: string; skills: { name: string } | null }[]).map((e) => ({
    id: e.id, user_id: e.user_id, name: byId.get(e.user_id)?.name ?? "Member", when: e.created_at,
    text: e.old_level == null ? `started ${e.skills?.name ?? "a skill"} (level ${e.new_level})` : `${e.new_level > e.old_level ? "levelled up" : "updated"} ${e.skills?.name ?? "a skill"} to ${e.new_level}`,
  }));
  const me = byId.get(auth.user!.id);

  const mine = new Set((myTaskLinks.data ?? []).map((l) => l.task_id));
  const pending = ((openTasks.data ?? []) as unknown as { id: string; title: string; status: string; due_date: string | null; project_id: string; projects: { name: string } | null }[])
    .filter((t) => mine.has(t.id))
    .sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  const names = new Map((people.data ?? []).map((p) => [p.id, p.full_name || p.username]));

  const stats = [
    { label: "Members", value: members.count ?? 0 },
    { label: "Active projects", value: projects.data?.length ?? 0 },
    { label: "Open tasks", value: openTasks.data?.length ?? 0 },
    { label: "My pending tasks", value: pending.length },
  ];

  const verb: Record<string, string> = {
    "project.created": "created the project", "task.created": "created a task", "task.moved": "moved a task",
    "task.assigned": "assigned a task", "task.updated": "updated a task", "task.deleted": "deleted a task",
    "member.added": "added a member", "member.removed": "removed a member", "file.uploaded": "uploaded a file",
    "file.deleted": "deleted a file", "project.status": "changed the project status",
  };

  const sections: Section[] = [
    {
      id: "hero", title: "Welcome", wide: true,
      node: <HeroCard slug={slug} name={me?.name ?? "there"} openTasks={pending.length}
        dueDates={pending.map((t) => t.due_date).filter((d): d is string => !!d)}
        eventStarts={(upcoming.data ?? []).map((e) => e.starts_at)} />,
    },
    { id: "pulse", title: "Team pulse", node: <TeamPulse slug={slug} people={peopleLite} viewerId={auth.user!.id} /> },
    { id: "listening", title: "Listening now", node: <ListeningNow slug={slug} people={peopleLite} /> },
    {
      id: "week", title: "This week", wide: true,
      node: <WeekActivity messages={(weekMsgs.data ?? []).map((m) => m.created_at)} actions={(weekActs.data ?? []).map((a) => a.created_at)} />,
    },
    { id: "leaders", title: "Top contributors", node: <Leaderboard slug={slug} leaders={leaders} /> },
    { id: "skills", title: "Skill spotlight", node: <SkillSpotlight slug={slug} items={spotlight} /> },
    {
      id: "stats", title: "Key numbers", wide: true,
      node: (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="card p-4">
              <div className="text-muted text-xs uppercase tracking-wide">{s.label}</div>
              <div className="text-3xl font-semibold tabular-nums">{s.value}</div>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "tasks", title: "My pending tasks",
      node: (
        <section className="space-y-2">
          <h2 className="font-medium">My pending tasks</h2>
          <div className="card divide-y divide-border">
            {pending.length === 0 && <p className="p-4 text-muted">Nothing assigned to you.</p>}
            {pending.slice(0, 8).map((t) => (
              <Link key={t.id} href={`/w/${slug}/projects/${t.project_id}`} className="p-3 flex justify-between gap-3 hover:bg-surface-2">
                <div className="min-w-0">
                  <div className="truncate">{t.title}</div>
                  <div className="text-xs text-muted truncate">{t.projects?.name} · {STATUS_LABEL[t.status]}</div>
                </div>
                {t.due_date && <span className="text-xs text-muted shrink-0">{new Date(t.due_date + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
              </Link>
            ))}
          </div>
        </section>
      ),
    },
    {
      id: "projects", title: "Active projects",
      node: (
        <section className="space-y-2">
          <h2 className="font-medium">Active projects</h2>
          <div className="card divide-y divide-border">
            {(projects.data ?? []).length === 0 && <p className="p-4 text-muted">No active projects.</p>}
            {(projects.data ?? []).slice(0, 8).map((p) => (
              <Link key={p.id} href={`/w/${slug}/projects/${p.id}`} className="p-3 flex justify-between gap-3 hover:bg-surface-2">
                <span className="truncate">{p.name}</span>
                {p.deadline && <span className="text-xs text-muted shrink-0">Due {new Date(p.deadline + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
              </Link>
            ))}
          </div>
        </section>
      ),
    },
    {
      id: "events", title: "Upcoming events",
      node: (
        <section className="space-y-2">
          <h2 className="font-medium">Upcoming events</h2>
          <div className="card divide-y divide-border">
            {(upcoming.data ?? []).length === 0 && <p className="p-4 text-muted">No upcoming events.</p>}
            {(upcoming.data ?? []).map((e) => (
              <Link key={e.id} href={`/w/${slug}/calendar`} className="p-3 flex justify-between gap-3 hover:bg-surface-2">
                <span className="truncate">{e.title}</span>
                <span className="text-xs text-muted shrink-0">{new Date(e.starts_at).toLocaleString(undefined, e.all_day ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              </Link>
            ))}
          </div>
        </section>
      ),
    },
    {
      id: "activity", title: "Recent activity",
      node: (
        <section className="space-y-2">
          <h2 className="font-medium">Recent activity</h2>
          <div className="card divide-y divide-border">
            {(activity.data ?? []).length === 0 && <p className="p-4 text-muted">No activity yet.</p>}
            {((activity.data ?? []) as unknown as { id: string; actor_id: string | null; action: string; created_at: string; project_id: string; projects: { name: string } | null }[]).map((a) => (
              <Link key={a.id} href={`/w/${slug}/projects/${a.project_id}`} className="p-3 flex justify-between gap-3 text-sm hover:bg-surface-2">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{names.get(a.actor_id ?? "") ?? "Someone"}</span>{" "}
                  <span className="text-muted">{verb[a.action] ?? a.action} in {a.projects?.name}</span>
                </span>
                <span className="text-xs text-muted shrink-0">{new Date(a.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
              </Link>
            ))}
          </div>
        </section>
      ),
    },
  ];

  return (
    <div className="max-w-5xl space-y-2">
      <DashboardLayout sections={sections} storageKey={`th-dashboard-${wsId}`} />
    </div>
  );
}
