"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ImagePlus, Trash2, X, Film } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/components/ui/Toast";

type Kind = "image" | "video";
type Slot = "app" | "chat";
type Bg = { url: string; kind: Kind; dim: number };
type Ctx = {
  app: Bg | null;
  chat: Bg | null;
  loaded: boolean;
  setDim: (slot: Slot, dim: number) => Promise<void>;
  upload: (slot: Slot, file: File) => Promise<void>;
  remove: (slot: Slot) => Promise<void>;
  settingsOpen: boolean;
  openSettings: (open: boolean) => void;
};

const BackgroundsContext = createContext<Ctx>({
  app: null, chat: null, loaded: false, setDim: async () => {}, upload: async () => {}, remove: async () => {}, settingsOpen: false, openSettings: () => {},
});
export const useBackgrounds = () => useContext(BackgroundsContext);

type Prefs = {
  app_bg_path: string | null; app_bg_kind: Kind | null; app_bg_dim: number;
  chat_bg_path: string | null; chat_bg_kind: Kind | null; chat_bg_dim: number;
};
const EMPTY: Prefs = { app_bg_path: null, app_bg_kind: null, app_bg_dim: 60, chat_bg_path: null, chat_bg_kind: null, chat_bg_dim: 55 };
const LIMITS = { image: 10 * 1024 * 1024, video: 50 * 1024 * 1024 };
const SIGNED_SECONDS = 6 * 3600;

const col = (slot: Slot) => ({ path: `${slot}_bg_path`, kind: `${slot}_bg_kind`, dim: `${slot}_bg_dim` }) as const;

/** Personal app and chat backgrounds (image or video), stored in a private bucket and synced to the account. */
export function BackgroundsProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Prefs>(EMPTY);
  const [urls, setUrls] = useState<{ app: string | null; chat: string | null }>({ app: null, chat: null });
  const [loaded, setLoaded] = useState(false);
  const [settingsOpen, openSettings] = useState(false);

  const sign = useCallback(async (path: string | null) => {
    if (!path) return null;
    const { data } = await supabase.storage.from("backgrounds").createSignedUrl(path, SIGNED_SECONDS);
    return data?.signedUrl ?? null;
  }, [supabase]);

  const refreshUrls = useCallback(async (p: Prefs) => {
    const [app, chat] = await Promise.all([sign(p.app_bg_path), sign(p.chat_bg_path)]);
    setUrls({ app, chat });
  }, [sign]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.from("user_prefs").select("*").eq("user_id", userId).maybeSingle();
      if (!alive) return;
      if (!error && data) { setPrefs(data as Prefs); await refreshUrls(data as Prefs); }
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [supabase, userId, refreshUrls]);

  // Signed links expire: renew them well before that while the app stays open
  useEffect(() => {
    if (!prefs.app_bg_path && !prefs.chat_bg_path) return;
    const t = setInterval(() => refreshUrls(prefs), (SIGNED_SECONDS - 600) * 1000);
    return () => clearInterval(t);
  }, [prefs, refreshUrls]);

  const persist = useCallback(async (next: Prefs) => {
    const { error } = await supabase.from("user_prefs").upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() });
    if (error) { toast(error.message, "error"); return false; }
    setPrefs(next);
    return true;
  }, [supabase, userId, toast]);

  const setDim = useCallback(async (slot: Slot, dim: number) => {
    await persist({ ...prefs, [col(slot).dim]: dim });
  }, [persist, prefs]);

  const upload = useCallback(async (slot: Slot, file: File) => {
    const kind: Kind | null = file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : null;
    if (!kind) return toast("Choose an image (PNG, JPG, WebP, GIF) or a video (MP4, WebM).", "error");
    if (kind === "video" && !["video/mp4", "video/webm"].includes(file.type)) return toast("Videos must be MP4 or WebM.", "error");
    if (file.size > LIMITS[kind]) return toast(`${kind === "video" ? "Videos" : "Images"} must be under ${LIMITS[kind] / 1048576} MB.`, "error");

    const ext = (file.name.split(".").pop() ?? (kind === "video" ? "mp4" : "jpg")).toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${userId}/${slot}-${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("backgrounds").upload(path, file, { contentType: file.type });
    if (up.error) return toast(up.error.message, "error");

    const old = prefs[col(slot).path];
    const ok = await persist({ ...prefs, [col(slot).path]: path, [col(slot).kind]: kind });
    if (!ok) { await supabase.storage.from("backgrounds").remove([path]); return; }
    if (old) await supabase.storage.from("backgrounds").remove([old]);
    const signed = await sign(path);
    setUrls((u) => ({ ...u, [slot]: signed }));
    toast(slot === "app" ? "App background updated" : "Chat background updated");
  }, [supabase, userId, prefs, persist, sign, toast]);

  const remove = useCallback(async (slot: Slot) => {
    const old = prefs[col(slot).path];
    const ok = await persist({ ...prefs, [col(slot).path]: null, [col(slot).kind]: null });
    if (!ok) return;
    if (old) await supabase.storage.from("backgrounds").remove([old]);
    setUrls((u) => ({ ...u, [slot]: null }));
    toast("Background removed");
  }, [supabase, prefs, persist, toast]);

  const mk = (slot: Slot): Bg | null => {
    const url = urls[slot];
    const kind = prefs[col(slot).kind];
    return url && kind ? { url, kind, dim: prefs[col(slot).dim] } : null;
  };
  const app = mk("app");
  const chat = mk("chat");

  // Tell the stylesheet to make surfaces translucent while an app background is set
  useEffect(() => {
    if (app) document.documentElement.dataset.hasBg = "true";
    else delete document.documentElement.dataset.hasBg;
  }, [app]);

  const value = useMemo(
    () => ({ app, chat, loaded, setDim, upload, remove, settingsOpen, openSettings }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [urls, prefs, loaded, setDim, upload, remove, settingsOpen]
  );

  return (
    <BackgroundsContext.Provider value={value}>
      {app && <div className="fixed inset-0 -z-10"><BgMedia bg={app} /></div>}
      {children}
      {settingsOpen && <BackgroundSettings />}
    </BackgroundsContext.Provider>
  );
}

/** Fills its (relatively positioned) parent with the image/video and a dimming layer for legibility. */
export function BgMedia({ bg }: { bg: Bg }) {
  const [reduceMotion] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {bg.kind === "video" ? (
        <video src={bg.url} className="h-full w-full object-cover" autoPlay={!reduceMotion} muted loop playsInline preload="metadata" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={bg.url} alt="" className="h-full w-full object-cover" />
      )}
      <div className="absolute inset-0" style={{ background: "var(--background)", opacity: bg.dim / 100 }} />
    </div>
  );
}

function SlotEditor({ slot, title, hint }: { slot: Slot; title: string; hint: string }) {
  const ctx = useBackgrounds();
  const bg = ctx[slot];
  const [dim, setDimLocal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = dim ?? bg?.dim ?? (slot === "app" ? 60 : 55);

  return (
    <section className="card p-3 space-y-3">
      <div>
        <h3 className="font-medium">{title}</h3>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <div className="relative h-36 rounded-lg overflow-hidden bg-surface-2 flex items-center justify-center text-muted text-sm">
        {bg ? <BgMedia bg={{ ...bg, dim: shown }} /> : "No background"}
        {bg && (
          <div className="relative text-xs bg-black/50 text-white rounded px-2 py-1">Preview text</div>
        )}
      </div>
      <label className="block text-xs text-muted">
        Dimming ({shown}%). Raise it if text is hard to read.
        <input
          type="range" min={0} max={95} step={5} value={shown} disabled={!bg}
          className="w-full accent-[var(--accent)]"
          onChange={(e) => setDimLocal(Number(e.target.value))}
          onPointerUp={async () => { if (dim != null) { await ctx.setDim(slot, dim); setDimLocal(null); } }}
          onKeyUp={async () => { if (dim != null) { await ctx.setDim(slot, dim); setDimLocal(null); } }}
        />
      </label>
      <div className="flex gap-2">
        <label className={`btn flex-1 text-center cursor-pointer text-sm flex items-center justify-center gap-2 ${busy ? "opacity-60 pointer-events-none" : ""}`}>
          <ImagePlus size={16} /> {bg ? "Replace" : "Upload image or video"}
          <input
            type="file" className="hidden" accept="image/png,image/jpeg,image/webp,image/gif,image/avif,video/mp4,video/webm"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setBusy(true);
              await ctx.upload(slot, f);
              setBusy(false);
            }}
          />
        </label>
        {bg && (
          <button className="px-3 rounded-lg border border-border text-muted hover:text-red-400" onClick={() => ctx.remove(slot)} aria-label="Remove background" title="Remove">
            <Trash2 size={16} />
          </button>
        )}
      </div>
      {busy && <p className="text-xs text-muted flex items-center gap-1"><Film size={12} /> Uploading… large videos can take a moment.</p>}
    </section>
  );
}

function BackgroundSettings() {
  const { openSettings, loaded } = useBackgrounds();
  return (
    <div className="fixed inset-0 z-[65] bg-black/60 flex items-center justify-center p-4 overflow-y-auto" onClick={() => openSettings(false)}>
      <div className="card w-full max-w-2xl p-5 space-y-4 my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Backgrounds</h2>
          <button onClick={() => openSettings(false)} aria-label="Close"><X size={18} /></button>
        </div>
        <p className="text-sm text-muted">
          Only you see these. Images up to 10 MB, videos (MP4 or WebM) up to 50 MB. They are saved to your account and follow you to other devices.
        </p>
        {!loaded ? <p className="text-muted">Loading…</p> : (
          <div className="grid gap-3 sm:grid-cols-2">
            <SlotEditor slot="app" title="App background" hint="Behind every page." />
            <SlotEditor slot="chat" title="Chat theme" hint="Behind your messages in every channel and DM." />
          </div>
        )}
      </div>
    </div>
  );
}
