import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CalendarClient from "@/components/calendar/CalendarClient";

export default async function CalendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: ws } = await supabase.from("workspaces").select("id").eq("slug", slug).maybeSingle();
  if (!ws) notFound();

  const [events, projects, people, viewer, reminders] = await Promise.all([
    supabase.from("events")
      .select("id, title, description, kind, starts_at, ends_at, all_day, project_id, is_personal, created_by, event_attendees(user_id, status)")
      .eq("workspace_id", ws.id),
    supabase.from("projects").select("id, name, deadline").eq("workspace_id", ws.id).eq("status", "active").not("deadline", "is", null),
    supabase.from("workspace_members").select("user_id, profiles(full_name, username)").eq("workspace_id", ws.id),
    supabase.from("workspace_members").select("role").eq("workspace_id", ws.id).eq("user_id", auth.user!.id).single(),
    supabase.from("reminders").select("id, event_id, remind_at").eq("user_id", auth.user!.id).is("sent_at", null),
  ]);

  return (
    <CalendarClient
      slug={slug}
      workspaceId={ws.id}
      viewerId={auth.user!.id}
      viewerRole={viewer.data?.role ?? "member"}
      events={(events.data ?? []) as never}
      projects={projects.data ?? []}
      people={(people.data ?? []) as never}
      reminders={reminders.data ?? []}
    />
  );
}
