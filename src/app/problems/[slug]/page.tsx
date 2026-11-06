import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { createClient } from "@/lib/supabase/server";
import Workspace from "@/components/Workspace";

export const dynamic = "force-dynamic";

export default async function ProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: problem } = await supabase
    .from("problems")
    .select("id, slug, title, difficulty, description, starter_code")
    .eq("slug", slug)
    .single();
  if (!problem) notFound();

  // Restore where the user left off: last language + all saved drafts
  let drafts: Record<string, string> = {};
  let lastLanguage: string | null = null;
  if (user) {
    const [{ data: d }, { data: prog }] = await Promise.all([
      supabase.from("drafts").select("language, code").eq("problem_id", problem.id),
      supabase.from("user_progress").select("last_language").eq("problem_id", problem.id).maybeSingle(),
    ]);
    drafts = Object.fromEntries((d ?? []).map((r) => [r.language, r.code]));
    lastLanguage = prog?.last_language ?? null;
  }

  return (
    <main className="grid h-[calc(100vh-3.5rem)] grid-cols-1 lg:grid-cols-2">
      <section className="overflow-y-auto border-r border-zinc-800 p-6">
        <h1 className="text-2xl font-semibold">{problem.title}</h1>
        <p className="mb-4 mt-1 text-sm capitalize text-zinc-400">{problem.difficulty}</p>
        <div className="prose-beet text-zinc-300">
          <ReactMarkdown>{problem.description}</ReactMarkdown>
        </div>
      </section>
      <Workspace
        problemId={problem.id}
        starterCode={problem.starter_code as Record<string, string>}
        initialDrafts={drafts}
        initialLanguage={lastLanguage}
        signedIn={!!user}
      />
    </main>
  );
}
