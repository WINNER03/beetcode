"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type ProblemRow = {
  id: number;
  slug: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  order_index: number;
  status: string | null;
  acceptance: number | null;
};

const DIFFS = [
  { id: "easy", label: "Easy", text: "text-emerald-400", bar: "bg-emerald-500" },
  { id: "medium", label: "Medium", text: "text-amber-400", bar: "bg-amber-500" },
  { id: "hard", label: "Hard", text: "text-red-400", bar: "bg-red-500" },
] as const;

export default function ProblemList({ problems, signedIn }: { problems: ProblemRow[]; signedIn: boolean }) {
  const [diff, setDiff] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return problems.filter((p) =>
      (diff === "all" || p.difficulty === diff) &&
      (status === "all" || (status === "todo" ? p.status !== "solved" : p.status === "solved")) &&
      (!term || p.title.toLowerCase().includes(term) || p.tags.some((t) => t.includes(term))),
    );
  }, [problems, diff, status, q]);

  const solved = problems.filter((p) => p.status === "solved").length;

  return (
    <div>
      {signedIn && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Solved" value={`${solved} / ${problems.length}`} pct={solved / problems.length} bar="bg-rose-500" text="text-zinc-100" />
          {DIFFS.map((d) => {
            const all = problems.filter((p) => p.difficulty === d.id);
            const done = all.filter((p) => p.status === "solved").length;
            return <Stat key={d.id} label={d.label} value={`${done} / ${all.length}`} pct={all.length ? done / all.length : 0} bar={d.bar} text={d.text} />;
          })}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {[{ id: "all", label: "All" }, ...DIFFS].map((d) => (
          <button
            key={d.id}
            onClick={() => setDiff(d.id)}
            className={`rounded-full px-3 py-1 ${diff === d.id ? "bg-zinc-100 text-zinc-900" : "bg-zinc-900 text-zinc-400 hover:text-zinc-100"}`}
          >
            {d.label}
          </button>
        ))}
        {signedIn && (
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-zinc-300"
          >
            <option value="all">Any status</option>
            <option value="todo">Not solved</option>
            <option value="solved">Solved</option>
          </select>
        )}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title or tag…"
          className="ml-auto w-full rounded-md border border-zinc-800 bg-zinc-900 px-3 py-1.5 outline-none focus:border-rose-500 sm:w-56"
        />
      </div>

      <div className="flex items-center gap-3 px-4 pb-1.5 text-xs text-zinc-500">
        <span className="w-5" /><span className="w-8">#</span><span className="flex-1">Title</span>
        <span className="hidden w-14 text-right sm:inline">Acceptance</span><span className="w-16 text-right">Difficulty</span>
      </div>
      <ul className="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
        {shown.map((p) => {
          const d = DIFFS.find((x) => x.id === p.difficulty)!;
          return (
            <li key={p.id}>
              <Link href={`/problems/${p.slug}`} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-900">
                <span className="w-5 text-center text-sm">
                  {p.status === "solved" ? "✅" : p.status === "attempted" ? "🟡" : ""}
                </span>
                <span className="w-8 text-sm text-zinc-500">{p.order_index}.</span>
                <span className="flex-1">{p.title}</span>
                <span className="hidden max-w-[35%] truncate text-xs text-zinc-500 md:inline">{p.tags.join(" · ")}</span>
                <span className="hidden w-14 text-right text-sm text-zinc-400 sm:inline" title="Acceptance rate">
                  {p.acceptance == null ? "–" : `${p.acceptance.toFixed(1)}%`}
                </span>
                <span className={`w-16 text-right text-sm ${d.text}`}>{d.label}</span>
              </Link>
            </li>
          );
        })}
        {!shown.length && <li className="px-4 py-6 text-zinc-500">No problems match.</li>}
      </ul>
    </div>
  );
}

function Stat({ label, value, pct, bar, text }: { label: string; value: string; pct: number; bar: string; text: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 p-3">
      <p className={`text-xs ${text}`}>{label}</p>
      <p className="mt-0.5 text-lg font-semibold">{value}</p>
      <div className="mt-2 h-1.5 rounded-full bg-zinc-800">
        <div className={`h-1.5 rounded-full ${bar}`} style={{ width: `${Math.round(pct * 100)}%` }} />
      </div>
    </div>
  );
}
