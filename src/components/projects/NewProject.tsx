"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewProject({ workspaceId, slug }: { workspaceId: string; slug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user!.id;
    const { data, error } = await supabase
      .from("projects")
      .insert({ workspace_id: workspaceId, name: name.trim(), description, deadline: deadline || null, created_by: uid })
      .select("id")
      .single();
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    await supabase.from("project_members").insert({ project_id: data.id, user_id: uid });
    await supabase.from("channels").insert({ workspace_id: workspaceId, kind: "project", name: name.trim(), project_id: data.id, created_by: uid });
    await supabase.from("project_activity").insert({
      project_id: data.id, workspace_id: workspaceId, actor_id: uid, action: "project.created", meta: { name: name.trim() },
    });
    router.push(`/w/${slug}/projects/${data.id}`);
  }

  if (!open) return <button className="btn" onClick={() => setOpen(true)}>New project</button>;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <form onSubmit={create} onClick={(e) => e.stopPropagation()} className="card w-full max-w-md p-5 space-y-3 backdrop-blur">
        <h2 className="font-semibold text-lg">New project</h2>
        <input className="input" placeholder="Project name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        <textarea className="input" rows={3} placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <label className="block text-sm text-muted">Deadline (optional)
          <input className="input mt-1" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
        </label>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button type="button" className="px-3 py-2 text-muted" onClick={() => setOpen(false)}>Cancel</button>
          <button className="btn" disabled={loading}>{loading ? "Creating…" : "Create"}</button>
        </div>
      </form>
    </div>
  );
}
