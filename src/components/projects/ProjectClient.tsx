"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, Calendar, X, LayoutGrid, List, Search, MessageSquare, CheckSquare, Paperclip, Activity } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import EmptyState from "@/components/ui/EmptyState";
import { createClient } from "@/lib/supabase/client";

type Status = "todo" | "in_progress" | "review" | "completed";
const COLUMNS: { id: Status; label: string }[] = [
  { id: "todo", label: "To Do" },
  { id: "in_progress", label: "In Progress" },
  { id: "review", label: "Review" },
  { id: "completed", label: "Completed" },
];

type Person = { user_id: string; profiles: { full_name: string; username: string; avatar_url: string | null } | null };
type Task = {
  id: string; title: string; description: string | null; status: Status; position: number; due_date: string | null;
  task_assignees: { user_id: string }[];
};
type FileRow = { id: string; name: string; path: string; size: number | null; uploaded_by: string; created_at: string };
type Activity = { id: string; actor_id: string | null; action: string; meta: Record<string, string> | null; created_at: string };

type Props = {
  slug: string;
  workspaceId: string;
  viewerId: string;
  viewerRole: string;
  project: { id: string; name: string; description: string | null; status: string; deadline: string | null; created_by: string };
  people: Person[];
  memberIds: string[];
  tasks: Task[];
  files: FileRow[];
  activity: Activity[];
};

const fmtDate = (d: string) => new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const fmtDay = (d: string) => new Date(d + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fmtSize = (n: number | null) => (n == null ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function ProjectClient(p: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [tab, setTab] = useState<"board" | "files" | "activity" | "members">("board");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [newTitles, setNewTitles] = useState<Record<string, string>>({});
  const [addMember, setAddMember] = useState("");
  const { toast } = useToast();
  const [view, setView] = useState<"board" | "list">("board");
  const [q, setQ] = useState("");
  const [fAssignee, setFAssignee] = useState("");
  const [fDue, setFDue] = useState("");
  const [extras, setExtras] = useState<Record<string, { done: number; total: number; comments: number }>>({});

  const nameOf = (id: string | null) => {
    const pr = p.people.find((x) => x.user_id === id)?.profiles;
    return pr?.full_name || pr?.username || "Someone";
  };
  const isCreator = p.viewerId === p.project.created_by;
  const isLead = p.viewerRole === "admin" || p.viewerRole === "lead";
  const canManage = isCreator || isLead;
  const canDelete = isCreator || p.viewerRole === "admin";
  const members = p.people.filter((x) => p.memberIds.includes(x.user_id));

  // Live task updates from teammates
  useEffect(() => {
    const ch = supabase
      .channel(`project-${p.project.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${p.project.id}` }, () => router.refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.project.id]);

  // Checklist progress and comment counts shown on cards (quietly skipped if migration 0008 is not applied yet)
  const taskIds = p.tasks.map((t) => t.id).join(",");
  useEffect(() => {
    const ids = taskIds ? taskIds.split(",") : [];
    if (ids.length === 0) return;
    let alive = true;
    const load = async () => {
      const [k, c] = await Promise.all([
        supabase.from("task_checklist").select("task_id, done").in("task_id", ids),
        supabase.from("task_comments").select("task_id").in("task_id", ids),
      ]);
      if (!alive || k.error || c.error) return;
      const next: Record<string, { done: number; total: number; comments: number }> = {};
      const slot = (id: string) => (next[id] ??= { done: 0, total: 0, comments: 0 });
      k.data?.forEach((r) => { const s = slot(r.task_id); s.total++; if (r.done) s.done++; });
      c.data?.forEach((r) => { slot(r.task_id).comments++; });
      setExtras(next);
    };
    load();
    const ch = supabase
      .channel(`extras-${p.project.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_checklist" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_comments" }, load)
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIds, p.project.id]);

  const [todayStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [weekStr] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const visible = p.tasks.filter((t) => {
    if (q.trim() && !`${t.title} ${t.description ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
    if (fAssignee === "me" && !t.task_assignees.some((a) => a.user_id === p.viewerId)) return false;
    if (fAssignee === "none" && t.task_assignees.length > 0) return false;
    if (fAssignee && fAssignee !== "me" && fAssignee !== "none" && !t.task_assignees.some((a) => a.user_id === fAssignee)) return false;
    if (fDue === "overdue" && !(t.due_date && t.due_date < todayStr && t.status !== "completed")) return false;
    if (fDue === "week" && !(t.due_date && t.due_date >= todayStr && t.due_date <= weekStr)) return false;
    if (fDue === "none" && t.due_date) return false;
    return true;
  });
  const filtering = !!(q.trim() || fAssignee || fDue);

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setError(null);
    const { error } = await fn();
    if (error) setError(error.message);
    return !error;
  }
  const log = (action: string, meta: Record<string, string> = {}) =>
    supabase.from("project_activity").insert({ project_id: p.project.id, workspace_id: p.workspaceId, actor_id: p.viewerId, action, meta });

  async function addTask(status: Status) {
    const title = (newTitles[status] ?? "").trim();
    if (!title) return;
    const last = p.tasks.filter((t) => t.status === status).reduce((m, t) => Math.max(m, t.position), 0);
    const ok = await run(() =>
      supabase.from("tasks").insert({
        project_id: p.project.id, workspace_id: p.workspaceId, title, status, position: last + 1, created_by: p.viewerId,
        completed_at: status === "completed" ? new Date().toISOString() : null,
      })
    );
    if (ok) {
      await log("task.created", { title });
      toast("Task added");
      setNewTitles({ ...newTitles, [status]: "" });
      router.refresh();
    }
  }

  async function moveTask(t: Task, status: Status) {
    if (t.status === status) return;
    const last = p.tasks.filter((x) => x.status === status).reduce((m, x) => Math.max(m, x.position), 0);
    const ok = await run(() =>
      supabase.from("tasks").update({ status, position: last + 1, completed_at: status === "completed" ? new Date().toISOString() : null }).eq("id", t.id)
    );
    if (ok) {
      await log("task.moved", { title: t.title, to: status });
      router.refresh();
    }
  }

  async function saveTask(t: Task, patch: { title: string; description: string; due_date: string; status: Status; assignees: string[] }) {
    const ok = await run(() =>
      supabase.from("tasks").update({
        title: patch.title.trim(), description: patch.description, due_date: patch.due_date || null, status: patch.status,
        completed_at: patch.status === "completed" ? (t.status === "completed" ? undefined : new Date().toISOString()) : null,
      }).eq("id", t.id)
    );
    if (!ok) return;
    const before = t.task_assignees.map((a) => a.user_id);
    const added = patch.assignees.filter((u) => !before.includes(u));
    const removed = before.filter((u) => !patch.assignees.includes(u));
    if (removed.length) await supabase.from("task_assignees").delete().eq("task_id", t.id).in("user_id", removed);
    if (added.length) {
      await supabase.from("task_assignees").insert(added.map((user_id) => ({ task_id: t.id, user_id })));
      const others = added.filter((u) => u !== p.viewerId);
      if (others.length) {
        await supabase.from("notifications").insert(
          others.map((user_id) => ({
            user_id, workspace_id: p.workspaceId, type: "task_assigned", title: "You were assigned a task",
            body: `${patch.title.trim()} in ${p.project.name}`, link: `/w/${p.slug}/projects/${p.project.id}`,
          }))
        );
      }
      await log("task.assigned", { title: patch.title.trim(), to: added.map(nameOf).join(", ") });
    }
    await log("task.updated", { title: patch.title.trim() });
    toast("Task saved");
    setEditing(null);
    router.refresh();
  }

  async function deleteTask(t: Task) {
    if (!confirm(`Delete task "${t.title}"?`)) return;
    if (await run(() => supabase.from("tasks").delete().eq("id", t.id))) {
      await log("task.deleted", { title: t.title });
      toast("Task deleted");
      setEditing(null);
      router.refresh();
    }
  }

  async function setProjectStatus(status: string) {
    if (await run(() => supabase.from("projects").update({ status, completed_at: status === "completed" ? new Date().toISOString() : null }).eq("id", p.project.id))) {
      await log("project.status", { status });
      toast(`Project marked ${status}`);
      router.refresh();
    }
  }

  async function openDiscussion() {
    setError(null);
    const found = await supabase.from("channels").select("id").eq("project_id", p.project.id).maybeSingle();
    let id = found.data?.id;
    if (!id) {
      const created = await supabase.from("channels").insert({ workspace_id: p.workspaceId, kind: "project", name: p.project.name, project_id: p.project.id, created_by: p.viewerId }).select("id").single();
      if (created.error) return setError(created.error.message);
      id = created.data.id;
    }
    router.push(`/w/${p.slug}/chat/${id}`);
  }

  async function deleteProject() {
    if (!confirm("Delete this project and all its tasks and files? This cannot be undone.")) return;
    if (await run(() => supabase.from("projects").delete().eq("id", p.project.id))) router.push(`/w/${p.slug}/projects`);
  }

  async function addProjectMember() {
    if (!addMember) return;
    if (await run(() => supabase.from("project_members").insert({ project_id: p.project.id, user_id: addMember }))) {
      await log("member.added", { name: nameOf(addMember) });
      if (addMember !== p.viewerId) {
        await supabase.from("notifications").insert({
          user_id: addMember, workspace_id: p.workspaceId, type: "project_added", title: "Added to a project",
          body: p.project.name, link: `/w/${p.slug}/projects/${p.project.id}`,
        });
      }
      setAddMember("");
      router.refresh();
    }
  }
  async function removeProjectMember(id: string) {
    if (await run(() => supabase.from("project_members").delete().eq("project_id", p.project.id).eq("user_id", id))) {
      await log("member.removed", { name: nameOf(id) });
      router.refresh();
    }
  }

  async function uploadFile(file: File) {
    if (file.size > 25 * 1024 * 1024) return setError("File must be under 25 MB.");
    setError(null);
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${p.workspaceId}/projects/${p.project.id}/${Date.now()}-${safe}`;
    const up = await supabase.storage.from("attachments").upload(path, file);
    if (up.error) return setError(up.error.message);
    if (await run(() => supabase.from("project_files").insert({
      project_id: p.project.id, workspace_id: p.workspaceId, name: file.name, path, size: file.size, mime: file.type, uploaded_by: p.viewerId,
    }))) {
      await log("file.uploaded", { name: file.name });
      toast("File uploaded");
      router.refresh();
    }
  }
  async function openFile(f: FileRow) {
    const { data, error } = await supabase.storage.from("attachments").createSignedUrl(f.path, 60, { download: f.name });
    if (error) return setError(error.message);
    window.open(data.signedUrl, "_blank", "noopener");
  }
  async function deleteFile(f: FileRow) {
    if (!confirm(`Delete ${f.name}?`)) return;
    if (await run(() => supabase.from("project_files").delete().eq("id", f.id))) {
      await supabase.storage.from("attachments").remove([f.path]);
      await log("file.deleted", { name: f.name });
      router.refresh();
    }
  }

  const describe = (a: Activity) => {
    const m = a.meta ?? {};
    switch (a.action) {
      case "project.created": return `created the project`;
      case "project.status": return `marked the project ${m.status}`;
      case "task.created": return `created task "${m.title}"`;
      case "task.moved": return `moved "${m.title}" to ${COLUMNS.find((c) => c.id === m.to)?.label ?? m.to}`;
      case "task.assigned": return `assigned "${m.title}" to ${m.to}`;
      case "task.updated": return `updated "${m.title}"`;
      case "task.deleted": return `deleted task "${m.title}"`;
      case "member.added": return `added ${m.name} to the project`;
      case "member.removed": return `removed ${m.name} from the project`;
      case "file.uploaded": return `uploaded ${m.name}`;
      case "file.deleted": return `deleted ${m.name}`;
      default: return a.action;
    }
  };

  const today = todayStr;

  return (
    <div className="space-y-5">
      <Link href={`/w/${p.slug}/projects`} className="text-muted text-sm hover:text-foreground">← Projects</Link>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{p.project.name}</h1>
          {p.project.description && <p className="text-muted mt-1 max-w-2xl whitespace-pre-wrap">{p.project.description}</p>}
          {p.project.deadline && <p className="text-xs text-muted mt-2 flex items-center gap-1"><Calendar size={13} /> Deadline {fmtDay(p.project.deadline)}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button className="btn !bg-surface-2 text-sm" onClick={openDiscussion}>Discussion</button>
          {canManage ? (
            <select className="input !w-36 !py-1.5" value={p.project.status} onChange={(e) => setProjectStatus(e.target.value)}>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </select>
          ) : <span className="text-xs rounded-full bg-surface-2 px-2 py-1 text-muted capitalize">{p.project.status}</span>}
          {canDelete && <button className="text-muted hover:text-red-400" onClick={deleteProject} aria-label="Delete project"><Trash2 size={17} /></button>}
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="flex gap-1 border-b border-border">
        {(["board", "files", "activity", "members"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 capitalize border-b-2 -mb-px ${tab === t ? "border-accent text-foreground" : "border-transparent text-muted hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "board" && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-40 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input !pl-8 !py-1.5 text-sm" placeholder="Filter tasks…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input !w-auto !py-1.5 text-sm" value={fAssignee} onChange={(e) => setFAssignee(e.target.value)} aria-label="Filter by assignee">
            <option value="">Everyone</option>
            <option value="me">Assigned to me</option>
            <option value="none">Unassigned</option>
            {members.filter((m) => m.user_id !== p.viewerId).map((m) => <option key={m.user_id} value={m.user_id}>{m.profiles?.full_name || m.profiles?.username}</option>)}
          </select>
          <select className="input !w-auto !py-1.5 text-sm" value={fDue} onChange={(e) => setFDue(e.target.value)} aria-label="Filter by due date">
            <option value="">Any due date</option>
            <option value="overdue">Overdue</option>
            <option value="week">Due in 7 days</option>
            <option value="none">No due date</option>
          </select>
          {filtering && <button className="text-sm text-accent" onClick={() => { setQ(""); setFAssignee(""); setFDue(""); }}>Clear ({visible.length}/{p.tasks.length})</button>}
          <div className="ml-auto flex rounded-lg border border-border overflow-hidden">
            <button className={`px-2.5 py-1.5 ${view === "board" ? "bg-surface-2 text-foreground" : "text-muted"}`} onClick={() => setView("board")} aria-label="Board view" title="Board"><LayoutGrid size={15} /></button>
            <button className={`px-2.5 py-1.5 ${view === "list" ? "bg-surface-2 text-foreground" : "text-muted"}`} onClick={() => setView("list")} aria-label="List view" title="List"><List size={15} /></button>
          </div>
        </div>
      )}

      {tab === "board" && view === "list" && (
        <div className="card divide-y divide-border overflow-x-auto">
          {visible.length === 0 && <p className="p-4 text-muted">{filtering ? "No tasks match these filters." : "No tasks yet. Switch to the board to add some."}</p>}
          {visible.map((t) => {
            const ex = extras[t.id];
            return (
              <div key={t.id} className="flex items-center gap-3 p-3 hover:bg-[var(--hover)] cursor-pointer min-w-[32rem]" onClick={() => setEditing(t)}>
                <span className="flex-1 min-w-0 truncate">{t.title}</span>
                {ex && ex.total > 0 && <span className="text-xs text-muted flex items-center gap-1"><CheckSquare size={12} />{ex.done}/{ex.total}</span>}
                {ex && ex.comments > 0 && <span className="text-xs text-muted flex items-center gap-1"><MessageSquare size={12} />{ex.comments}</span>}
                <select className="input !w-32 !py-1 text-sm" value={t.status} onClick={(e) => e.stopPropagation()} onChange={(e) => moveTask(t, e.target.value as Status)} aria-label="Status">
                  {COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <div className="flex -space-x-1 w-24 shrink-0">
                  {t.task_assignees.slice(0, 4).map((a) => {
                    const pr = p.people.find((x) => x.user_id === a.user_id)?.profiles;
                    return <Avatar key={a.user_id} url={pr?.avatar_url} name={pr?.full_name || pr?.username || "?"} size={22} />;
                  })}
                </div>
                <span className={`w-16 text-right text-xs shrink-0 ${t.due_date && t.due_date < today && t.status !== "completed" ? "text-red-400" : "text-muted"}`}>{t.due_date ? fmtDay(t.due_date) : ""}</span>
              </div>
            );
          })}
        </div>
      )}

      {tab === "board" && view === "board" && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 items-start">
          {COLUMNS.map((col) => {
            const list = visible.filter((t) => t.status === col.id);
            return (
              <div key={col.id} className="card p-3 space-y-2 min-h-32"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { const t = p.tasks.find((x) => x.id === dragId); if (t) moveTask(t, col.id); setDragId(null); }}>
                <div className="flex justify-between text-sm font-medium px-1">
                  <span>{col.label}</span><span className="text-muted">{list.length}</span>
                </div>
                {list.map((t) => (
                  <div key={t.id} draggable onDragStart={() => setDragId(t.id)} onClick={() => setEditing(t)}
                    className="bg-surface-2 rounded-lg p-3 cursor-pointer hover:ring-1 hover:ring-white/15 space-y-2">
                    <div className="text-sm">{t.title}</div>
                    {extras[t.id] && (extras[t.id].total > 0 || extras[t.id].comments > 0) && (
                      <div className="flex items-center gap-3 text-xs text-muted">
                        {extras[t.id].total > 0 && <span className="flex items-center gap-1"><CheckSquare size={12} />{extras[t.id].done}/{extras[t.id].total}</span>}
                        {extras[t.id].comments > 0 && <span className="flex items-center gap-1"><MessageSquare size={12} />{extras[t.id].comments}</span>}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex -space-x-1">
                        {t.task_assignees.slice(0, 4).map((a) => {
                          const pr = p.people.find((x) => x.user_id === a.user_id)?.profiles;
                          return <Avatar key={a.user_id} url={pr?.avatar_url} name={pr?.full_name || pr?.username || "?"} size={22} />;
                        })}
                      </div>
                      {t.due_date && (
                        <span className={`text-xs ${t.due_date < today && t.status !== "completed" ? "text-red-400" : "text-muted"}`}>{fmtDay(t.due_date)}</span>
                      )}
                    </div>
                  </div>
                ))}
                <form onSubmit={(e) => { e.preventDefault(); addTask(col.id); }}>
                  <input className="input !py-1.5 text-sm" placeholder="+ Add task" value={newTitles[col.id] ?? ""}
                    onChange={(e) => setNewTitles({ ...newTitles, [col.id]: e.target.value })} />
                </form>
              </div>
            );
          })}
        </div>
      )}

      {tab === "files" && (
        <section className="space-y-3">
          <label className="btn inline-block cursor-pointer">
            Upload file
            <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }} />
          </label>
          <div className="card divide-y divide-border">
            {p.files.length === 0 && <EmptyState icon={Paperclip} title="No files yet" hint="Upload specs, designs or anything the team needs." compact />}
            {p.files.map((f) => (
              <div key={f.id} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <button className="text-accent truncate block max-w-full text-left" onClick={() => openFile(f)}>{f.name}</button>
                  <div className="text-xs text-muted">{fmtSize(f.size)} · {nameOf(f.uploaded_by)} · {fmtDate(f.created_at)}</div>
                </div>
                {(f.uploaded_by === p.viewerId || isLead) && (
                  <button className="text-muted hover:text-red-400" onClick={() => deleteFile(f)} aria-label="Delete file"><Trash2 size={15} /></button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === "activity" && (
        <div className="card divide-y divide-border">
          {p.activity.length === 0 && <EmptyState icon={Activity} title="No activity yet" hint="Changes to tasks, files and members show up here." compact />}
          {p.activity.map((a) => (
            <div key={a.id} className="p-3 flex justify-between gap-3 text-sm">
              <span><span className="font-medium">{nameOf(a.actor_id)}</span> <span className="text-muted">{describe(a)}</span></span>
              <span className="text-xs text-muted shrink-0">{fmtDate(a.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      {tab === "members" && (
        <section className="space-y-3 max-w-2xl">
          <div className="card divide-y divide-border">
            {members.map((m) => (
              <div key={m.user_id} className="p-3 flex items-center gap-3">
                <Avatar url={m.profiles?.avatar_url} name={m.profiles?.full_name || m.profiles?.username || "?"} size={32} />
                <Link className="flex-1 hover:underline" href={`/w/${p.slug}/members/${m.user_id}`}>{m.profiles?.full_name || m.profiles?.username}</Link>
                {canManage && m.user_id !== p.project.created_by && (
                  <button className="text-muted hover:text-red-400 text-sm" onClick={() => removeProjectMember(m.user_id)}>Remove</button>
                )}
              </div>
            ))}
          </div>
          {canManage && (
            <div className="flex gap-2">
              <select className="input" value={addMember} onChange={(e) => setAddMember(e.target.value)}>
                <option value="">Add a team member…</option>
                {p.people.filter((x) => !p.memberIds.includes(x.user_id)).map((x) => (
                  <option key={x.user_id} value={x.user_id}>{x.profiles?.full_name || x.profiles?.username}</option>
                ))}
              </select>
              <button className="btn" onClick={addProjectMember} disabled={!addMember}>Add</button>
            </div>
          )}
        </section>
      )}

      {editing && (
        <TaskModal
          task={p.tasks.find((t) => t.id === editing.id) ?? editing}
          members={members}
          workspaceId={p.workspaceId}
          viewerId={p.viewerId}
          canModerate={isLead}
          nameOf={nameOf}
          onClose={() => setEditing(null)}
          onSave={saveTask}
          onDelete={deleteTask}
        />
      )}
    </div>
  );
}

type Comment = { id: string; author_id: string; body: string; created_at: string };
type CheckItem = { id: string; text: string; done: boolean; position: number };

function TaskModal({ task, members, workspaceId, viewerId, canModerate, nameOf, onClose, onSave, onDelete }: {
  task: Task; members: Person[]; workspaceId: string; viewerId: string; canModerate: boolean; nameOf: (id: string | null) => string;
  onClose: () => void;
  onSave: (t: Task, patch: { title: string; description: string; due_date: string; status: Status; assignees: string[] }) => void;
  onDelete: (t: Task) => void;
}) {
  const supabase = createClient();
  const { toast } = useToast();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [due, setDue] = useState(task.due_date ?? "");
  const [status, setStatus] = useState<Status>(task.status);
  const [assignees, setAssignees] = useState<string[]>(task.task_assignees.map((a) => a.user_id));
  const [items, setItems] = useState<CheckItem[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newItem, setNewItem] = useState("");
  const [newComment, setNewComment] = useState("");
  const [extrasError, setExtrasError] = useState<string | null>(null);

  const loadExtras = async () => {
    const [c, k] = await Promise.all([
      supabase.from("task_comments").select("id, author_id, body, created_at").eq("task_id", task.id).order("created_at"),
      supabase.from("task_checklist").select("id, text, done, position").eq("task_id", task.id).order("position"),
    ]);
    if (c.error || k.error) return setExtrasError("Checklists and comments need the latest database update (migration 0008).");
    setExtrasError(null);
    setComments((c.data ?? []) as Comment[]);
    setItems((k.data ?? []) as CheckItem[]);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadExtras();
    const ch = supabase
      .channel(`task-${task.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_comments", filter: `task_id=eq.${task.id}` }, loadExtras)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_checklist", filter: `task_id=eq.${task.id}` }, loadExtras)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    const text = newItem.trim();
    if (!text) return;
    const pos = items.reduce((m, i) => Math.max(m, i.position), 0) + 1;
    const { error } = await supabase.from("task_checklist").insert({ task_id: task.id, workspace_id: workspaceId, text, position: pos });
    if (error) return toast(error.message, "error");
    setNewItem("");
    loadExtras();
  }
  async function toggleItem(i: CheckItem) {
    setItems(items.map((x) => (x.id === i.id ? { ...x, done: !x.done } : x)));
    const { error } = await supabase.from("task_checklist").update({ done: !i.done }).eq("id", i.id);
    if (error) toast(error.message, "error");
    loadExtras();
  }
  async function removeItem(i: CheckItem) {
    const { error } = await supabase.from("task_checklist").delete().eq("id", i.id);
    if (error) toast(error.message, "error");
    loadExtras();
  }
  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    const body = newComment.trim();
    if (!body) return;
    const { error } = await supabase.from("task_comments").insert({ task_id: task.id, workspace_id: workspaceId, author_id: viewerId, body });
    if (error) return toast(error.message, "error");
    setNewComment("");
    loadExtras();
  }
  async function removeComment(c: Comment) {
    const { error } = await supabase.from("task_comments").delete().eq("id", c.id);
    if (error) toast(error.message, "error");
    loadExtras();
  }

  const done = items.filter((i) => i.done).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex justify-end" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="card w-full max-w-md h-full rounded-none p-5 space-y-5 overflow-y-auto backdrop-blur">
        <form onSubmit={(e) => { e.preventDefault(); onSave(task, { title, description, due_date: due, status, assignees }); }} className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">Task</h2>
            <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <textarea className="input" rows={4} placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              {COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div>
            <div className="text-sm text-muted mb-1">Assignees</div>
            {members.map((m) => (
              <label key={m.user_id} className="flex items-center gap-2 py-1 cursor-pointer">
                <input type="checkbox" checked={assignees.includes(m.user_id)}
                  onChange={(e) => setAssignees(e.target.checked ? [...assignees, m.user_id] : assignees.filter((x) => x !== m.user_id))} />
                {m.profiles?.full_name || m.profiles?.username}
              </label>
            ))}
          </div>
          <div className="flex justify-between pt-1">
            <button type="button" className="text-red-400 text-sm" onClick={() => onDelete(task)}>Delete task</button>
            <button className="btn">Save</button>
          </div>
        </form>

        {extrasError ? <p className="text-amber-400 text-xs">{extrasError}</p> : (
          <>
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Checklist</h3>
                {items.length > 0 && <span className="text-xs text-muted">{done}/{items.length}</span>}
              </div>
              {items.length > 0 && (
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full bg-accent transition-all" style={{ width: `${(done / items.length) * 100}%` }} /></div>
              )}
              {items.map((i) => (
                <div key={i.id} className="flex items-center gap-2 group">
                  <input type="checkbox" checked={i.done} onChange={() => toggleItem(i)} />
                  <span className={`flex-1 text-sm ${i.done ? "line-through text-muted" : ""}`}>{i.text}</span>
                  <button className="text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => removeItem(i)} aria-label="Remove item"><X size={14} /></button>
                </div>
              ))}
              <form onSubmit={addItem}><input className="input !py-1.5 text-sm" placeholder="+ Add checklist item" value={newItem} onChange={(e) => setNewItem(e.target.value)} /></form>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-medium">Comments {comments.length > 0 && <span className="text-muted font-normal">({comments.length})</span>}</h3>
              {comments.length === 0 && <p className="text-xs text-muted">No comments yet.</p>}
              {comments.map((c) => (
                <div key={c.id} className="bg-surface-2 rounded-lg p-2.5 text-sm">
                  <div className="flex justify-between gap-2 text-xs text-muted mb-0.5">
                    <span className="font-medium text-foreground">{nameOf(c.author_id)}</span>
                    <span className="flex items-center gap-2">
                      {fmtDate(c.created_at)}
                      {(c.author_id === viewerId || canModerate) && (
                        <button className="hover:text-red-400" onClick={() => removeComment(c)} aria-label="Delete comment"><Trash2 size={12} /></button>
                      )}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap break-words">{c.body}</div>
                </div>
              ))}
              <form onSubmit={addComment} className="flex gap-2">
                <input className="input !py-1.5 text-sm" placeholder="Write a comment…" value={newComment} onChange={(e) => setNewComment(e.target.value)} />
                <button className="btn !py-1.5 text-sm" disabled={!newComment.trim()}>Post</button>
              </form>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
