import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: wsId, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error || !wsId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card p-6 max-w-sm space-y-3">
          <h1 className="text-lg font-semibold">Invitation problem</h1>
          <p className="text-muted">{error?.message ?? "Could not accept this invitation."}</p>
          <Link className="text-accent" href="/">Go home</Link>
        </div>
      </div>
    );
  }
  const { data: ws } = await supabase.from("workspaces").select("slug").eq("id", wsId).single();
  redirect(ws ? `/w/${ws.slug}/dashboard` : "/");
}
