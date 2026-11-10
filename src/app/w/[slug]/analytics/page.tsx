import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadAnalyticsData } from "@/lib/analytics-data";
import AnalyticsClient from "@/components/analytics/AnalyticsClient";

export default async function AnalyticsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { data: ws } = await supabase.from("workspaces").select("id").eq("slug", slug).maybeSingle();
  if (!ws) notFound();

  const data = await loadAnalyticsData(supabase, ws.id);
  return <AnalyticsClient viewerId={auth.user!.id} slug={slug} data={data} />;
}
