"use client";

import { useEffect, useState } from "react";
import { Music2, Eye, EyeOff } from "lucide-react";
import { ACTIVITIES, activityOf, nowPlaying, usePresence, type Activity } from "@/components/layout/Presence";
import { useToast } from "@/components/ui/Toast";

/** Set what you are doing and what you are listening to. Opens from the sidebar or the Ctrl+K palette. */
export default function StatusMenu({ userName, collapsed }: { userName: string; collapsed: boolean }) {
  const { mine, saveStatus } = usePresence();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [activity, setActivity] = useState<Activity>("available");
  const [emoji, setEmoji] = useState("");
  const [message, setMessage] = useState("");
  const [track, setTrack] = useState("");
  const [artist, setArtist] = useState("");
  const [share, setShare] = useState(true);

  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener("open-status", on);
    return () => window.removeEventListener("open-status", on);
  }, []);

  // Load the current values whenever the menu opens
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActivity(mine.activity); setEmoji(mine.emoji); setMessage(mine.message);
    setTrack(nowPlaying(mine)?.track ?? mine.track); setArtist(mine.artist); setShare(mine.share_activity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cur = activityOf(mine.activity);
  const playing = nowPlaying(mine);

  async function save() {
    const trackChanged = track.trim() !== mine.track || artist.trim() !== mine.artist;
    const hasTrack = track.trim().length > 0;
    const err = await saveStatus({
      activity: hasTrack && trackChanged && activity === "available" ? "listening" : activity,
      emoji: emoji.trim(), message: message.trim(),
      track: track.trim(), artist: artist.trim(),
      track_set_at: hasTrack ? (trackChanged || !mine.track_set_at ? new Date().toISOString() : mine.track_set_at) : null,
      share_activity: share,
    });
    if (err) return toast(err.includes("user_status") ? "Status needs the latest database update (migration 0009)." : err, "error");
    toast("Status updated");
    setOpen(false);
  }
  async function clearAll() {
    const err = await saveStatus({ activity: "available", emoji: "", message: "", track: "", artist: "", track_set_at: null });
    if (err) return toast(err, "error");
    toast("Status cleared");
    setOpen(false);
  }

  return (
    <div className="relative min-w-0 flex-1">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 min-w-0 w-full text-left rounded-lg px-1 py-0.5 hover:bg-surface-2" aria-label="Set status" title="Set your status">
        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${cur.dot}`} />
        {!collapsed && (
          <span className="min-w-0 flex-1">
            <span className="block text-sm truncate">{userName}</span>
            <span className="block text-[11px] text-muted truncate">
              {playing ? `🎵 ${playing.track}` : mine.message ? `${mine.emoji} ${mine.message}`.trim() : cur.label}
            </span>
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="card absolute bottom-full left-0 mb-2 w-72 max-w-[calc(100vw-2rem)] p-3 space-y-3 z-50 shadow-lg">
            <div className="text-sm font-medium">Your status</div>
            <div className="grid grid-cols-2 gap-1">
              {ACTIVITIES.map((a) => (
                <button key={a.id} onClick={() => setActivity(a.id)}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-left border ${activity === a.id ? "border-accent bg-accent/10" : "border-border hover:bg-surface-2"}`}>
                  <span>{a.emoji}</span><span className="truncate">{a.label}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="input !w-12 text-center" maxLength={4} placeholder="😀" value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label="Emoji" />
              <input className="input" maxLength={80} placeholder="What are you up to?" value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs text-muted"><Music2 size={13} /> Now playing (shown for 3 hours)</div>
              <input className="input !py-1.5 text-sm" maxLength={120} placeholder="Song" value={track} onChange={(e) => setTrack(e.target.value)} />
              <input className="input !py-1.5 text-sm" maxLength={120} placeholder="Artist" value={artist} onChange={(e) => setArtist(e.target.value)} />
            </div>
            <button onClick={() => setShare(!share)} className="flex items-center gap-2 text-xs text-muted hover:text-foreground">
              {share ? <Eye size={14} className="text-accent" /> : <EyeOff size={14} />}
              {share ? "Teammates can see my status and which page I am on" : "Private: teammates only see that I am online"}
            </button>
            <div className="flex justify-between">
              <button className="text-sm text-muted hover:text-foreground" onClick={clearAll}>Clear</button>
              <button className="btn !py-1.5 text-sm" onClick={save}>Save</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
