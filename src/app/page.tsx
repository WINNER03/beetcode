import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ProblemList, { type ProblemRow } from "@/components/ProblemList";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: problems } = await supabase
    .from("problems")
    .select("id, slug, title, difficulty, tags, order_index")
    .order("order_index");

  const { data: progress } = user
    ? await supabase
        .from("user_progress")
        .select("problem_id, status, last_opened_at")
        .order("last_opened_at", { ascending: false })
    : { data: [] };

  // Acceptance rate across everyone's submissions (aggregated server-side, no individual rows exposed)
  const { data: stats } = await supabase.rpc("problem_stats");
  const rateById = new Map(((stats ?? []) as { problem_id: number; submissions: number; accepted: number }[])
    .map((s) => [s.problem_id, s.submissions ? (100 * s.accepted) / s.submissions : null]));

  const statusById = new Map((progress ?? []).map((p) => [p.problem_id, p.status as string]));
  const rows: ProblemRow[] = (problems ?? []).map((p) => ({
    ...p, status: statusById.get(p.id) ?? null, acceptance: rateById.get(p.id) ?? null,
  }));
  const last = progress?.[0];
  const lastProblem = last && problems?.find((p) => p.id === last.problem_id);

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">My Own Battle Ground</h1>
          <p className="mt-1 text-zinc-400">
            100 hand-picked problems.{" "}
            {user ? "Your code saves as you type." : "Sign in to save your progress."}
          </p>
        </div>
        {lastProblem && (
          <Link
            href={`/problems/${lastProblem.slug}`}
            className="rounded-md bg-rose-600 px-4 py-2 font-medium hover:bg-rose-500"
          >
            Continue: {lastProblem.title} →
          </Link>
        )}
      </div>

      {rows.length ? (
        <ProblemList problems={rows} signedIn={!!user} />
      ) : (
        <p className="rounded-lg border border-zinc-800 px-4 py-6 text-zinc-500">
          No problems yet. Run the migrations and seed in Supabase (see README).
        </p>
      )}
    </main>
  );
}
