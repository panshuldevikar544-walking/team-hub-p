"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export default function Onboarding() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const slug = slugify(name);
    if (slug.length < 3) {
      setError("Name needs at least 3 letters or numbers.");
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.rpc("create_workspace", { p_name: name.trim(), p_slug: slug });
    if (error) {
      setError(error.message.includes("duplicate") ? "That workspace name is taken." : error.message);
      setLoading(false);
      return;
    }
    router.replace(`/w/${slug}/dashboard`);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={create} className="card w-full max-w-sm p-6 space-y-4">
        <h1 className="text-xl font-semibold">Create a workspace</h1>
        <p className="text-muted text-sm">
          Have an invite link? Open it instead and you will join that workspace.
        </p>
        <input className="input" placeholder="Workspace name" value={name} onChange={(e) => setName(e.target.value)} required />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button className="btn w-full" disabled={loading}>{loading ? "Creating…" : "Create workspace"}</button>
      </form>
    </div>
  );
}
