import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProjectClient from "@/components/projects/ProjectClient";

export default async function ProjectPage({ params }: { params: Promise<{ slug: string; projectId: string }> }) {
  const { slug, projectId } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: ws } = await supabase.from("workspaces").select("id").eq("slug", slug).maybeSingle();
  if (!ws) notFound();

  const { data: project } = await supabase
    .from("projects").select("id, name, description, status, deadline, created_by").eq("id", projectId).eq("workspace_id", ws.id).maybeSingle();
  if (!project) notFound();

  const [viewer, wsMembers, pMembers, tasks, files, activity] = await Promise.all([
    supabase.from("workspace_members").select("role").eq("workspace_id", ws.id).eq("user_id", auth.user!.id).single(),
    supabase.from("workspace_members").select("user_id, profiles(full_name, username, avatar_url)").eq("workspace_id", ws.id),
    supabase.from("project_members").select("user_id").eq("project_id", projectId),
    supabase.from("tasks").select("id, title, description, status, position, due_date, task_assignees(user_id)").eq("project_id", projectId).order("position"),
    supabase.from("project_files").select("id, name, path, size, uploaded_by, created_at").eq("project_id", projectId).order("created_at", { ascending: false }),
    supabase.from("project_activity").select("id, actor_id, action, meta, created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(100),
  ]);

  return (
    <ProjectClient
      slug={slug}
      workspaceId={ws.id}
      viewerId={auth.user!.id}
      viewerRole={viewer.data?.role ?? "member"}
      project={project}
      people={(wsMembers.data ?? []) as never}
      memberIds={(pMembers.data ?? []).map((m) => m.user_id)}
      tasks={(tasks.data ?? []) as never}
      files={files.data ?? []}
      activity={(activity.data ?? []) as never}
    />
  );
}
