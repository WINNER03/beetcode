import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { createClient } from "@/lib/supabase/server";
import { compact, formatArgs } from "@/lib/format";
import ProblemShell from "@/components/ProblemShell";

export const dynamic = "force-dynamic";

const diffColor: Record<string, string> = {
  easy: "text-emerald-400 bg-emerald-400/10",
  medium: "text-amber-400 bg-amber-400/10",
  hard: "text-red-400 bg-red-400/10",
};

export default async function ProblemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: problem } = await supabase
    .from("problems")
    .select("id, slug, title, difficulty, description, starter_code, tags, params, order_index")
    .eq("slug", slug)
    .single();
  if (!problem) notFound();

  // Only sample tests are readable by clients (RLS); hidden ones never leave the server.
  const [{ data: samples }, { data: neighbors }] = await Promise.all([
    supabase.from("test_cases").select("input, expected_output").eq("problem_id", problem.id).order("order_index"),
    supabase.from("problems").select("slug, order_index").in("order_index", [problem.order_index - 1, problem.order_index + 1]),
  ]);

  // Restore where the user left off: last language + saved drafts
  let drafts: Record<string, string> = {};
  let lastLanguage: string | null = null;
  let solved = false;
  if (user) {
    const [{ data: d }, { data: prog }] = await Promise.all([
      supabase.from("drafts").select("language, code").eq("problem_id", problem.id),
      supabase.from("user_progress").select("last_language, status").eq("problem_id", problem.id).maybeSingle(),
    ]);
    drafts = Object.fromEntries((d ?? []).map((r) => [r.language, r.code]));
    lastLanguage = prog?.last_language ?? null;
    solved = prog?.status === "solved";
  }

  const description = (
    <>
      <h1 className="text-2xl font-semibold">{problem.order_index}. {problem.title}</h1>
      <div className="mb-5 mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-2.5 py-0.5 capitalize ${diffColor[problem.difficulty]}`}>{problem.difficulty}</span>
        {problem.tags.map((t: string) => (
          <span key={t} className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-zinc-400">{t}</span>
        ))}
      </div>
      <div className="prose-beet text-zinc-300">
        <ReactMarkdown>{problem.description}</ReactMarkdown>
      </div>
      {samples?.map((s, i) => (
        <div key={i} className="mt-5">
          <p className="mb-1.5 font-semibold text-zinc-100">Example {i + 1}</p>
          <div className="border-l-2 border-zinc-700 pl-4 font-mono text-sm">
            <p><span className="text-zinc-500">Input: </span><span className="break-all text-zinc-200">{formatArgs(s.input, problem.params).join(", ")}</span></p>
            <p className="mt-1"><span className="text-zinc-500">Output: </span><span className="break-all text-zinc-200">{compact(s.expected_output)}</span></p>
          </div>
        </div>
      ))}
    </>
  );

  return (
    <ProblemShell
      problemId={problem.id}
      slug={problem.slug}
      title={problem.title}
      params={problem.params}
      samples={(samples ?? []).map((s) => s.input)}
      starterCode={problem.starter_code as Record<string, string>}
      initialDrafts={drafts}
      initialLanguage={lastLanguage}
      initiallySolved={solved}
      signedIn={!!user}
      prevSlug={neighbors?.find((n) => n.order_index === problem.order_index - 1)?.slug ?? null}
      nextSlug={neighbors?.find((n) => n.order_index === problem.order_index + 1)?.slug ?? null}
      description={description}
    />
  );
}
