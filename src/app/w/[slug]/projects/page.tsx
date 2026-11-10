import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FolderKanban } from "lucide-react";
import NewProject from "@/components/projects/NewProject";
import EmptyState from "@/components/ui/EmptyState";

export default async function Projects({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: ws } = await supabase.from("workspaces").select("id").eq("slug", slug).maybeSingle();
  if (!ws) notFound();

  const [{ data: projects }, { data: tasks }] = await Promise.all([
    supabase.from("projects").select("id, name, description, status, deadline").eq("workspace_id", ws.id).order("created_at", { ascending: false }),
    supabase.from("tasks").select("project_id, status").eq("workspace_id", ws.id),
  ]);

  const counts = new Map<string, { total: number; done: number }>();
  (tasks ?? []).forEach((t) => {
    const c = counts.get(t.project_id) ?? { total: 0, done: 0 };
    c.total++;
    if (t.status === "completed") c.done++;
    counts.set(t.project_id, c);
  });

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <NewProject workspaceId={ws.id} slug={slug} />
      </div>
      {(projects ?? []).length === 0 && <div className="card"><EmptyState icon={FolderKanban} title="No projects yet" hint="Create the first one to start planning tasks with your team." /></div>}
      <div className="grid gap-3 sm:grid-cols-2">
        {(projects ?? []).map((p) => {
          const c = counts.get(p.id) ?? { total: 0, done: 0 };
          const pct = c.total ? Math.round((c.done / c.total) * 100) : 0;
          return (
            <Link key={p.id} href={`/w/${slug}/projects/${p.id}`} className="card p-4 space-y-3 hover:border-white/20 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium">{p.name}</div>
                <span className="text-xs rounded-full bg-surface-2 px-2 py-1 text-muted capitalize">{p.status}</span>
              </div>
              {p.description && <p className="text-muted text-sm line-clamp-2">{p.description}</p>}
              <div>
                <div className="h-1.5 bg-surface-2 rounded-full"><div className="h-1.5 bg-accent rounded-full" style={{ width: `${pct}%` }} /></div>
                <div className="flex justify-between text-xs text-muted mt-1">
                  <span>{c.done}/{c.total} tasks</span>
                  {p.deadline && <span>Due {new Date(p.deadline + "T00:00").toLocaleDateString()}</span>}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
