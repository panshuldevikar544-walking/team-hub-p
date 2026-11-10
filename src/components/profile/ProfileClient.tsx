"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Trash2 } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/client";

const LEVELS = ["", "Beginner", "Basic", "Intermediate", "Advanced", "Expert"];

type SkillRow = {
  id: string;
  level: number;
  verified_by: string | null;
  verified_at: string | null;
  updated_at: string;
  skills: { id: string; name: string; category: string | null } | null;
};
type EventRow = { id: string; old_level: number | null; new_level: number; created_at: string; skills: { name: string } | null };
type Learning = { id: string; title: string; url: string | null; progress: number | null; completed_at: string | null };
type Achievement = { id: string; title: string; description: string | null; achieved_at: string };
type Certificate = { id: string; title: string; issuer: string | null; issued_on: string | null; file_path: string | null };

type Props = {
  workspaceId: string;
  viewerId: string;
  viewerRole: string;
  profile: { id: string; full_name: string; username: string; bio: string | null; avatar_url: string | null };
  teamRole: string;
  role: string;
  skills: SkillRow[];
  events: EventRow[];
  learning: Learning[];
  achievements: Achievement[];
  certificates: Certificate[];
  verifiers: Record<string, string>;
};

const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export default function ProfileClient(p: Props) {
  const router = useRouter();
  const supabase = createClient();
  const isSelf = p.viewerId === p.profile.id;
  const canVerify = p.viewerRole === "admin" || p.viewerRole === "lead";
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const [fullName, setFullName] = useState(p.profile.full_name);
  const [username, setUsername] = useState(p.profile.username);
  const [bio, setBio] = useState(p.profile.bio ?? "");
  const [teamRole, setTeamRole] = useState(p.teamRole);

  const [skillName, setSkillName] = useState("");
  const [skillLevel, setSkillLevel] = useState(1);
  const [learnTitle, setLearnTitle] = useState("");
  const [learnUrl, setLearnUrl] = useState("");
  const [achTitle, setAchTitle] = useState("");
  const [achDesc, setAchDesc] = useState("");
  const [certTitle, setCertTitle] = useState("");
  const [certIssuer, setCertIssuer] = useState("");
  const [certDate, setCertDate] = useState("");
  const [certFile, setCertFile] = useState<File | null>(null);

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setError(null);
    const { error } = await fn();
    if (error) setError(error.message);
    else router.refresh();
    return !error;
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    const ok1 = await run(() =>
      supabase.from("profiles").update({ full_name: fullName.trim(), username: username.trim().toLowerCase(), bio }).eq("id", p.profile.id)
    );
    if (!ok1) return;
    const ok2 = await run(() =>
      supabase.from("workspace_members").update({ team_role: teamRole.trim() }).eq("workspace_id", p.workspaceId).eq("user_id", p.profile.id)
    );
    if (ok2) setEditing(false);
  }

  async function uploadAvatar(file: File) {
    setError(null);
    if (file.size > 3 * 1024 * 1024) return setError("Image must be under 3 MB.");
    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${p.profile.id}/avatar-${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (up.error) return setError(up.error.message);
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    await run(() => supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", p.profile.id));
  }

  async function addSkill(e: React.FormEvent) {
    e.preventDefault();
    const name = skillName.trim();
    if (!name) return;
    setError(null);
    let skillId: string | undefined;
    const existing = await supabase.from("skills").select("id").eq("workspace_id", p.workspaceId).ilike("name", name).maybeSingle();
    skillId = existing.data?.id;
    if (!skillId) {
      const created = await supabase.from("skills").insert({ workspace_id: p.workspaceId, name }).select("id").single();
      if (created.error) return setError(created.error.message);
      skillId = created.data.id;
    }
    const ok = await run(() =>
      supabase.from("member_skills").insert({ workspace_id: p.workspaceId, user_id: p.profile.id, skill_id: skillId, level: skillLevel })
    );
    if (ok) setSkillName("");
  }

  const setLevel = (id: string, level: number) => run(() => supabase.from("member_skills").update({ level }).eq("id", id));
  const verify = (id: string) =>
    run(() => supabase.from("member_skills").update({ verified_by: p.viewerId, verified_at: new Date().toISOString() }).eq("id", id));
  const removeSkill = (id: string) => run(() => supabase.from("member_skills").delete().eq("id", id));

  async function addLearning(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run(() =>
      supabase.from("learning_items").insert({ workspace_id: p.workspaceId, user_id: p.profile.id, title: learnTitle.trim(), url: learnUrl.trim() || null })
    );
    if (ok) { setLearnTitle(""); setLearnUrl(""); }
  }
  const setProgress = (l: Learning, progress: number) =>
    run(() =>
      supabase.from("learning_items").update({ progress, completed_at: progress === 100 ? new Date().toISOString() : null }).eq("id", l.id)
    );
  const removeLearning = (id: string) => run(() => supabase.from("learning_items").delete().eq("id", id));

  async function addAchievement(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run(() =>
      supabase.from("achievements").insert({
        workspace_id: p.workspaceId, user_id: p.profile.id, title: achTitle.trim(), description: achDesc.trim() || null,
        awarded_by: isSelf ? null : p.viewerId,
      })
    );
    if (ok) { setAchTitle(""); setAchDesc(""); }
  }
  const removeAchievement = (id: string) => run(() => supabase.from("achievements").delete().eq("id", id));

  async function addCertificate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let file_path: string | null = null;
    if (certFile) {
      if (certFile.size > 10 * 1024 * 1024) return setError("Certificate file must be under 10 MB.");
      const safe = certFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      file_path = `${p.workspaceId}/${p.profile.id}/${crypto.randomUUID()}-${safe}`;
      const up = await supabase.storage.from("certificates").upload(file_path, certFile);
      if (up.error) return setError(up.error.message);
    }
    const ok = await run(() =>
      supabase.from("certificates").insert({
        workspace_id: p.workspaceId, user_id: p.profile.id, title: certTitle.trim(),
        issuer: certIssuer.trim() || null, issued_on: certDate || null, file_path,
      })
    );
    if (ok) { setCertTitle(""); setCertIssuer(""); setCertDate(""); setCertFile(null); }
  }
  async function openCertificate(path: string) {
    const { data, error } = await supabase.storage.from("certificates").createSignedUrl(path, 60);
    if (error) return setError(error.message);
    window.open(data.signedUrl, "_blank", "noopener");
  }
  async function removeCertificate(c: Certificate) {
    if (c.file_path) await supabase.storage.from("certificates").remove([c.file_path]);
    await run(() => supabase.from("certificates").delete().eq("id", c.id));
  }

  const name = p.profile.full_name || p.profile.username;
  const learningNow = p.learning.filter((l) => !l.completed_at);
  const learningDone = p.learning.filter((l) => l.completed_at);

  return (
    <div className="max-w-4xl space-y-6">
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Header */}
      <section className="card p-5 flex flex-col sm:flex-row gap-4 sm:items-center backdrop-blur">
        <Avatar url={p.profile.avatar_url} name={name} size={72} />
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold truncate">{name}</h1>
          <div className="text-muted">@{p.profile.username} · {p.teamRole || "No team role set"} · <span className="capitalize">{p.role}</span></div>
          {p.profile.bio && <p className="mt-2 text-sm whitespace-pre-wrap">{p.profile.bio}</p>}
        </div>
        {isSelf && (
          <div className="flex gap-2">
            <label className="btn !bg-surface-2 cursor-pointer text-sm">
              Change photo
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadAvatar(e.target.files[0])} />
            </label>
            <button className="btn text-sm" onClick={() => setEditing(!editing)}>{editing ? "Cancel" : "Edit profile"}</button>
          </div>
        )}
      </section>

      {editing && (
        <form onSubmit={saveProfile} className="card p-5 grid gap-3 sm:grid-cols-2">
          <input className="input" placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <input className="input" placeholder="username" pattern="[a-z0-9_]{3,40}" title="3-40 lowercase letters, numbers or underscores" value={username} onChange={(e) => setUsername(e.target.value)} required />
          <input className="input sm:col-span-2" placeholder="Team role (e.g. Frontend Engineer)" value={teamRole} onChange={(e) => setTeamRole(e.target.value)} />
          <textarea className="input sm:col-span-2" rows={3} placeholder="Bio" value={bio} onChange={(e) => setBio(e.target.value)} />
          <button className="btn sm:col-span-2 w-fit">Save</button>
        </form>
      )}

      {/* Skills */}
      <section className="space-y-3">
        <h2 className="font-medium">Skills</h2>
        <div className="card divide-y divide-border">
          {p.skills.length === 0 && <p className="p-4 text-muted">No skills yet.</p>}
          {p.skills.map((s) => (
            <div key={s.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate">{s.skills?.name}</span>
                  {s.verified_by && (
                    <span title={`Verified by ${p.verifiers[s.verified_by] ?? "a lead"} on ${fmt(s.verified_at!)}`} className="text-emerald-400 flex items-center gap-1 text-xs">
                      <BadgeCheck size={14} /> Verified
                    </span>
                  )}
                </div>
                <div className="flex gap-1 mt-2" aria-label={`Level ${s.level} of 5`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      disabled={!isSelf && !canVerify}
                      onClick={() => n !== s.level && setLevel(s.id, n)}
                      title={LEVELS[n]}
                      className={`h-2 w-8 rounded-full ${n <= s.level ? "bg-accent" : "bg-surface-2"} ${isSelf || canVerify ? "hover:opacity-80" : "cursor-default"}`}
                    />
                  ))}
                  <span className="text-xs text-muted ml-2">{LEVELS[s.level]}</span>
                </div>
              </div>
              <div className="flex gap-3 text-sm shrink-0">
                {canVerify && !s.verified_by && <button className="text-emerald-400" onClick={() => verify(s.id)}>Verify</button>}
                {isSelf && <button className="text-muted hover:text-red-400" onClick={() => removeSkill(s.id)} aria-label="Remove skill"><Trash2 size={15} /></button>}
              </div>
            </div>
          ))}
        </div>
        {isSelf && (
          <form onSubmit={addSkill} className="flex flex-col sm:flex-row gap-2">
            <input className="input" placeholder="Add a skill (e.g. TypeScript)" value={skillName} onChange={(e) => setSkillName(e.target.value)} required />
            <select className="input sm:w-44" value={skillLevel} onChange={(e) => setSkillLevel(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{LEVELS[n]}</option>)}
            </select>
            <button className="btn">Add skill</button>
          </form>
        )}
        {isSelf && <p className="text-muted text-xs">Changing a level removes its verification until a lead verifies it again.</p>}
      </section>

      {/* History */}
      <section className="space-y-3">
        <h2 className="font-medium">Skill progress history</h2>
        <div className="card divide-y divide-border">
          {p.events.length === 0 && <p className="p-4 text-muted">No history yet. It is recorded whenever a skill level changes.</p>}
          {p.events.map((e) => (
            <div key={e.id} className="p-3 flex justify-between text-sm">
              <span>
                <span className="font-medium">{e.skills?.name}</span>{" "}
                <span className="text-muted">
                  {e.old_level == null ? `added at ${LEVELS[e.new_level]}` : `${LEVELS[e.old_level]} → ${LEVELS[e.new_level]}`}
                </span>
              </span>
              <span className="text-muted">{fmt(e.created_at)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Learning */}
      <section className="space-y-3">
        <h2 className="font-medium">Currently learning</h2>
        <div className="card divide-y divide-border">
          {learningNow.length === 0 && <p className="p-4 text-muted">Nothing in progress.</p>}
          {learningNow.map((l) => (
            <div key={l.id} className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                {l.url ? <a className="text-accent truncate block" href={l.url} target="_blank" rel="noopener noreferrer">{l.title}</a> : <div className="truncate">{l.title}</div>}
                <div className="h-1.5 bg-surface-2 rounded-full mt-2"><div className="h-1.5 bg-accent rounded-full" style={{ width: `${l.progress ?? 0}%` }} /></div>
              </div>
              {isSelf ? (
                <select className="input !w-24 !py-1" value={l.progress ?? 0} onChange={(e) => setProgress(l, Number(e.target.value))}>
                  {[0, 25, 50, 75, 100].map((n) => <option key={n} value={n}>{n === 100 ? "Done" : `${n}%`}</option>)}
                </select>
              ) : <span className="text-xs text-muted">{l.progress ?? 0}%</span>}
              {isSelf && <button className="text-muted hover:text-red-400" onClick={() => removeLearning(l.id)} aria-label="Remove"><Trash2 size={15} /></button>}
            </div>
          ))}
        </div>
        {learningDone.length > 0 && (
          <p className="text-muted text-xs">Completed: {learningDone.map((l) => l.title).join(", ")}</p>
        )}
        {isSelf && (
          <form onSubmit={addLearning} className="flex flex-col sm:flex-row gap-2">
            <input className="input" placeholder="What are you learning?" value={learnTitle} onChange={(e) => setLearnTitle(e.target.value)} required />
            <input className="input" type="url" placeholder="Link (optional)" value={learnUrl} onChange={(e) => setLearnUrl(e.target.value)} />
            <button className="btn">Add</button>
          </form>
        )}
      </section>

      {/* Achievements */}
      <section className="space-y-3">
        <h2 className="font-medium">Achievements</h2>
        <div className="card divide-y divide-border">
          {p.achievements.length === 0 && <p className="p-4 text-muted">No achievements yet.</p>}
          {p.achievements.map((a) => (
            <div key={a.id} className="p-3 flex justify-between gap-3">
              <div>
                <div className="font-medium">{a.title}</div>
                {a.description && <div className="text-muted text-sm">{a.description}</div>}
                <div className="text-muted text-xs">{fmt(a.achieved_at)}</div>
              </div>
              {(isSelf || canVerify) && <button className="text-muted hover:text-red-400 self-start" onClick={() => removeAchievement(a.id)} aria-label="Remove"><Trash2 size={15} /></button>}
            </div>
          ))}
        </div>
        {(isSelf || canVerify) && (
          <form onSubmit={addAchievement} className="flex flex-col sm:flex-row gap-2">
            <input className="input" placeholder="Achievement" value={achTitle} onChange={(e) => setAchTitle(e.target.value)} required />
            <input className="input" placeholder="Details (optional)" value={achDesc} onChange={(e) => setAchDesc(e.target.value)} />
            <button className="btn">{isSelf ? "Add" : "Award"}</button>
          </form>
        )}
      </section>

      {/* Certificates */}
      <section className="space-y-3">
        <h2 className="font-medium">Certificates</h2>
        <div className="card divide-y divide-border">
          {p.certificates.length === 0 && <p className="p-4 text-muted">No certificates yet.</p>}
          {p.certificates.map((c) => (
            <div key={c.id} className="p-3 flex justify-between gap-3">
              <div>
                <div className="font-medium">{c.title}</div>
                <div className="text-muted text-xs">{[c.issuer, c.issued_on && fmt(c.issued_on)].filter(Boolean).join(" · ")}</div>
              </div>
              <div className="flex gap-3 text-sm self-start">
                {c.file_path && <button className="text-accent" onClick={() => openCertificate(c.file_path!)}>View file</button>}
                {isSelf && <button className="text-muted hover:text-red-400" onClick={() => removeCertificate(c)} aria-label="Remove"><Trash2 size={15} /></button>}
              </div>
            </div>
          ))}
        </div>
        {isSelf && (
          <form onSubmit={addCertificate} className="grid gap-2 sm:grid-cols-2">
            <input className="input" placeholder="Certificate title" value={certTitle} onChange={(e) => setCertTitle(e.target.value)} required />
            <input className="input" placeholder="Issuer" value={certIssuer} onChange={(e) => setCertIssuer(e.target.value)} />
            <input className="input" type="date" value={certDate} onChange={(e) => setCertDate(e.target.value)} />
            <input className="input" type="file" accept=".pdf,image/*" onChange={(e) => setCertFile(e.target.files?.[0] ?? null)} />
            <button className="btn w-fit">Add certificate</button>
          </form>
        )}
      </section>

    </div>
  );
}
