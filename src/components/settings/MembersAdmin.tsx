"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Role = "admin" | "lead" | "member";
type Member = { user_id: string; role: Role; profiles: { full_name: string; username: string } | null };
type Invite = { id: string; email: string; role: Role; token: string; expires_at: string };

export default function MembersAdmin(props: {
  workspaceId: string;
  currentUserId: string;
  members: Member[];
  invites: Invite[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const link = (t: string) => `${process.env.NEXT_PUBLIC_SITE_URL || window.location.origin}/invite/${t}`;
  const isLocal = typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase
      .from("invitations")
      .insert({ workspace_id: props.workspaceId, email: email.trim().toLowerCase(), role, invited_by: props.currentUserId });
    if (error) return setError(error.message);
    setEmail("");
    router.refresh();
  }

  async function changeRole(userId: string, newRole: Role) {
    setError(null);
    const { error } = await supabase
      .from("workspace_members").update({ role: newRole }).eq("workspace_id", props.workspaceId).eq("user_id", userId);
    if (error) setError(error.message);
    router.refresh();
  }

  async function remove(userId: string) {
    if (!confirm("Remove this member from the workspace?")) return;
    const { error } = await supabase
      .from("workspace_members").delete().eq("workspace_id", props.workspaceId).eq("user_id", userId);
    if (error) setError(error.message);
    router.refresh();
  }

  async function revoke(id: string) {
    const { error } = await supabase.from("invitations").delete().eq("id", id);
    if (error) setError(error.message);
    router.refresh();
  }

  async function copy(token: string) {
    const text = link(token);
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); ok = true; }
    } catch { /* fall through */ }
    if (!ok) {
      // Plain-http pages have no clipboard API: use the legacy copy, else let the user copy by hand
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand("copy"); } catch { ok = false; }
      document.body.removeChild(ta);
    }
    if (!ok) { window.prompt("Copy this invite link:", text); return; }
    setCopied(token);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold">Members & invites</h1>
      {error && <p className="text-red-400 text-sm">{error}</p>}

      <section className="space-y-3">
        <h2 className="font-medium">Invite someone</h2>
        <form onSubmit={invite} className="flex flex-col sm:flex-row gap-2">
          <input className="input" type="email" placeholder="teammate@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <select className="input sm:w-36" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="member">Member</option>
            <option value="lead">Lead</option>
            <option value="admin">Admin</option>
          </select>
          <button className="btn">Create invite</button>
        </form>
        <p className="text-muted text-xs">
          Copy the invite link and send it to them. They must sign up or log in with that same email.
        </p>
        {isLocal && (
          <p className="text-amber-400 text-xs">
            You opened the app as localhost, so these links only work on this computer. To invite someone on another device, open the app at your network
            address (for example http://192.168.29.65:3000) before copying the link, or deploy the app.
          </p>
        )}
        {props.invites.length > 0 && (
          <div className="card divide-y divide-border">
            {props.invites.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <div className="truncate">{i.email}</div>
                  <div className="text-muted text-xs capitalize">
                    {i.role} · expires {new Date(i.expires_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex gap-3 shrink-0 text-sm">
                  <button className="text-accent" onClick={() => copy(i.token)}>{copied === i.token ? "Copied" : "Copy link"}</button>
                  <button className="text-red-400" onClick={() => revoke(i.id)}>Revoke</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Members</h2>
        <div className="card divide-y divide-border">
          {props.members.map((m) => (
            <div key={m.user_id} className="flex items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <div className="truncate">{m.profiles?.full_name || m.profiles?.username}</div>
                <div className="text-muted text-xs">@{m.profiles?.username}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <select
                  className="input !w-28 !py-1"
                  value={m.role}
                  disabled={m.user_id === props.currentUserId}
                  onChange={(e) => changeRole(m.user_id, e.target.value as Role)}
                >
                  <option value="member">Member</option>
                  <option value="lead">Lead</option>
                  <option value="admin">Admin</option>
                </select>
                {m.user_id !== props.currentUserId && (
                  <button className="text-red-400 text-sm" onClick={() => remove(m.user_id)}>Remove</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
