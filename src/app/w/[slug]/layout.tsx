import { notFound, redirect } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import NotificationBell from "@/components/layout/NotificationBell";
import MobileTabBar from "@/components/layout/MobileTabBar";
import CommandPalette from "@/components/layout/CommandPalette";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import { UnreadProvider } from "@/components/layout/Unread";
import { ToastProvider } from "@/components/ui/Toast";
import { PresenceProvider } from "@/components/layout/Presence";
import { BackgroundsProvider } from "@/components/layout/Backgrounds";
import { createClient } from "@/lib/supabase/server";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: ws } = await supabase.from("workspaces").select("id, name").eq("slug", slug).maybeSingle();
  if (!ws) notFound();

  const [{ data: me }, { data: membership }, { data: mine }] = await Promise.all([
    supabase.from("profiles").select("full_name, username, avatar_url").eq("id", auth.user.id).single(),
    supabase.from("workspace_members").select("role").eq("workspace_id", ws.id).eq("user_id", auth.user.id).single(),
    supabase.from("workspace_members").select("workspaces(slug, name)").eq("user_id", auth.user.id),
  ]);
  const workspaces = ((mine ?? []) as unknown as { workspaces: { slug: string; name: string } | null }[])
    .map((r) => r.workspaces)
    .filter((w): w is { slug: string; name: string } => !!w);
  const isAdmin = membership?.role === "admin";

  return (
    <ToastProvider>
      <PresenceProvider workspaceId={ws.id} userId={auth.user.id}>
      <BackgroundsProvider userId={auth.user.id}>
      <UnreadProvider workspaceId={ws.id} userId={auth.user.id}>
        <div className="flex min-h-screen">
          <Sidebar
            slug={slug}
            workspaceName={ws.name}
            workspaces={workspaces}
            userName={me?.full_name || me?.username || "you"}
            avatarUrl={me?.avatar_url ?? null}
            userId={auth.user.id}
            isAdmin={isAdmin}
          />
          <NotificationBell userId={auth.user.id} workspaceId={ws.id} slug={slug} />
          <CommandPalette slug={slug} workspaceId={ws.id} userId={auth.user.id} isAdmin={isAdmin} />
          <main className="flex-1 min-w-0 p-4 pt-16 pb-20 md:p-8 md:pt-16 md:pb-8">
            <Breadcrumbs slug={slug} workspaceName={ws.name} />
            {children}
          </main>
          <MobileTabBar slug={slug} userId={auth.user.id} />
        </div>
      </UnreadProvider>
      </BackgroundsProvider>
      </PresenceProvider>
    </ToastProvider>
  );
}
