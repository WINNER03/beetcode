import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { createClient } from "@/lib/supabase/server";
import { compact, formatArgs } from "@/lib/format";
import Workspace from "@/components/Workspace";

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
    supabase.from("problems").select("slug, order_index")
      .in("order_index", [problem.order_index - 1, problem.order_index + 1]),
  ]);
  const prev = neighbors?.find((n) => n.order_index === problem.order_index - 1);
  const next = neighbors?.find((n) => n.order_index === problem.order_index + 1);

  // Restore where the user left off: last language + all saved drafts
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

  return (
    <main className="grid h-[calc(100vh-3.5rem)] grid-cols-1 lg:grid-cols-2">
      <section className="overflow-y-auto border-r border-zinc-800 p-6">
        <div className="mb-4 flex items-center justify-between text-sm text-zinc-500">
          <Link href="/" className="hover:text-zinc-200">← All problems</Link>
          <div className="flex gap-3">
            {prev && <Link href={`/problems/${prev.slug}`} className="hover:text-zinc-200">‹ Prev</Link>}
            {next && <Link href={`/problems/${next.slug}`} className="hover:text-zinc-200">Next ›</Link>}
          </div>
        </div>
        <h1 className="text-2xl font-semibold">
          {problem.order_index}. {problem.title} {solved && <span title="Solved">✅</span>}
        </h1>
        <div className="mb-5 mt-2 flex flex-wrap items-center gap-2 text-xs">
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
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 font-mono text-sm">
              <p className="text-zinc-500">Input</p>
              {formatArgs(s.input, problem.params).map((line, j) => (
                <p key={j} className="break-all text-zinc-200">{line}</p>
              ))}
              <p className="mt-2 text-zinc-500">Output</p>
              <p className="break-all text-zinc-200">{compact(s.expected_output)}</p>
            </div>
          </div>
        ))}
      </section>
      <Workspace
        problemId={problem.id}
        params={problem.params}
        starterCode={problem.starter_code as Record<string, string>}
        initialDrafts={drafts}
        initialLanguage={lastLanguage}
        signedIn={!!user}
      />
    </main>
  );
}
