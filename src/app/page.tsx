import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const diffColor = {
  easy: "text-emerald-400",
  medium: "text-amber-400",
  hard: "text-red-400",
} as const;

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: problems } = await supabase
    .from("problems")
    .select("id, slug, title, difficulty, tags")
    .order("order_index");

  const { data: progress } = user
    ? await supabase
        .from("user_progress")
        .select("problem_id, status, last_opened_at")
        .order("last_opened_at", { ascending: false })
    : { data: [] };

  const statusById = new Map((progress ?? []).map((p) => [p.problem_id, p.status]));
  const solvedCount = (progress ?? []).filter((p) => p.status === "solved").length;
  const last = progress?.[0];
  const lastProblem = last && problems?.find((p) => p.id === last.problem_id);

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Problems</h1>
          <p className="mt-1 text-zinc-400">
            {user
              ? `${solvedCount} / ${problems?.length ?? 0} solved`
              : "Sign in to save your progress."}
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

      <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
        {problems?.map((p, i) => {
          const status = statusById.get(p.id);
          return (
            <li key={p.id}>
              <Link
                href={`/problems/${p.slug}`}
                className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-900"
              >
                <span className="w-5 text-center">
                  {status === "solved" ? "✅" : status === "attempted" ? "🟡" : ""}
                </span>
                <span className="w-8 text-zinc-500">{i + 1}.</span>
                <span className="flex-1">{p.title}</span>
                <span className="hidden text-xs text-zinc-500 sm:inline">{p.tags.join(" · ")}</span>
                <span className={`w-16 text-right text-sm capitalize ${diffColor[p.difficulty as keyof typeof diffColor]}`}>
                  {p.difficulty}
                </span>
              </Link>
            </li>
          );
        })}
        {!problems?.length && (
          <li className="px-4 py-6 text-zinc-500">
            No problems yet. Run the migration and seed in Supabase (see README).
          </li>
        )}
      </ul>
    </main>
  );
}
