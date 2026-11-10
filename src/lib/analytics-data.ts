import type { SupabaseClient } from "@supabase/supabase-js";
import type { AnalyticsData } from "@/components/analytics/IndividualCharts";

/** Loads everything the analytics charts need for one workspace. RLS limits it to workspace members. */
export async function loadAnalyticsData(supabase: SupabaseClient, w: string): Promise<AnalyticsData> {
  const since = new Date(Date.now() - 100 * 86400000).toISOString();
  const [people, skills, memberSkills, events, tasks, projects, projectMembers, activity, messages, learning, achievements, certificates] =
    await Promise.all([
      supabase.from("workspace_members").select("user_id, profiles(full_name, username)").eq("workspace_id", w),
      supabase.from("skills").select("id, name").eq("workspace_id", w),
      supabase.from("member_skills").select("user_id, skill_id, level, verified_by").eq("workspace_id", w),
      supabase.from("skill_progress_events").select("user_id, skill_id, old_level, new_level, created_at").eq("workspace_id", w).order("created_at"),
      supabase.from("tasks").select("id, status, completed_at, task_assignees(user_id)").eq("workspace_id", w),
      supabase.from("projects").select("id, status, completed_at").eq("workspace_id", w),
      supabase.from("project_members").select("project_id, user_id, projects!inner(workspace_id)").eq("projects.workspace_id", w),
      supabase.from("project_activity").select("actor_id, created_at").eq("workspace_id", w).gte("created_at", since).limit(5000),
      supabase.from("messages").select("author_id, created_at").eq("workspace_id", w).gte("created_at", since).limit(5000),
      supabase.from("learning_items").select("user_id, title, completed_at").eq("workspace_id", w).not("completed_at", "is", null),
      supabase.from("achievements").select("user_id, title, achieved_at").eq("workspace_id", w),
      supabase.from("certificates").select("user_id, title, issued_on").eq("workspace_id", w),
    ]);

  return {
    people: (people.data ?? []) as never,
    skills: skills.data ?? [],
    memberSkills: memberSkills.data ?? [],
    events: events.data ?? [],
    tasks: (tasks.data ?? []) as never,
    projects: projects.data ?? [],
    projectMembers: (projectMembers.data ?? []).map((m) => ({ project_id: m.project_id as string, user_id: m.user_id as string })),
    activity: activity.data ?? [],
    messages: messages.data ?? [],
    learning: learning.data ?? [],
    achievements: achievements.data ?? [],
    certificates: certificates.data ?? [],
  };
}
