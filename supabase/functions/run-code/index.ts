// Beetcode run-code edge function
// POST { problemId, language, code, mode: "run" | "submit" }
// "run"    -> sample tests only, nothing saved
// "submit" -> all tests (incl. hidden), saves submission + progress
//
// The program sent to Judge0 is:
//   RUNTIME prelude + problem prelude + USER CODE + RUNTIME helpers + problem harness
// Each test's input is a JSON array of arguments on stdin; the harness prints one JSON value.
import { createClient } from "npm:@supabase/supabase-js@2";
import { RUNTIME } from "./runtime.ts";
import { check } from "./compare.ts";

const JUDGE0_URL = Deno.env.get("JUDGE0_URL") ?? "https://judge0-ce.p.rapidapi.com";
const JUDGE0_KEY = Deno.env.get("JUDGE0_KEY") ?? ""; // RapidAPI key, empty if self-hosted
const SUBMITS_PER_MINUTE = 5;

// Judge0 CE ids. Defaults: 71 = Python 3.8, 63 = Node 12 (available everywhere).
// Newer Judge0 builds offer 92 = Python 3.11 and 93 = Node 18; set the env vars to use them.
const LANGUAGE_IDS: Record<string, number> = {
  python: Number(Deno.env.get("JUDGE0_PYTHON_ID") ?? 71),
  javascript: Number(Deno.env.get("JUDGE0_JS_ID") ?? 63),
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type Judge0Result = {
  stdout: string | null; stderr: string | null; compile_output: string | null;
  status: { id: number; description: string }; time: string | null;
};

async function judge(source: string, languageId: number, stdin: string): Promise<Judge0Result> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (JUDGE0_KEY) {
    headers["X-RapidAPI-Key"] = JUDGE0_KEY;
    headers["X-RapidAPI-Host"] = new URL(JUDGE0_URL).host;
  }
  const res = await fetch(`${JUDGE0_URL}/submissions?base64_encoded=false&wait=true`, {
    method: "POST",
    headers,
    body: JSON.stringify({ source_code: source, language_id: languageId, stdin, cpu_time_limit: 3, memory_limit: 256000 }),
  });
  if (!res.ok) throw new Error(`Judge0 error ${res.status}`);
  return await res.json();
}

// Error messages should point at the user's own line numbers, not the assembled file's.
function fixLineNumbers(text: string | null, offset: number, userLines: number): string | null {
  if (!text) return text;
  const map = (n: number, fmt: (k: number) => string, orig: string) => {
    const k = n - offset;
    if (k < 1) return orig;
    return k <= userLines ? fmt(k) : "(judge harness)";
  };
  return text
    .replace(/line (\d+)/g, (m, n) => map(Number(n), (k) => `line ${k}`, m))
    .replace(/\/?[\w/.-]*script\.js:(\d+)(:\d+)?/g, (m, n, col) => map(Number(n), (k) => `solution.js:${k}${col ?? ""}`, m));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Identify the caller from their JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Not signed in" }, 401);

  const { problemId, language, code, mode } = await req.json();
  const languageId = LANGUAGE_IDS[language];
  if (!languageId || !RUNTIME[language]) return json({ error: "Unsupported language" }, 400);
  if (typeof code !== "string" || code.length > 50_000) return json({ error: "Invalid code" }, 400);

  // Service role: can read hidden tests + harness and write results
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (mode === "submit") {
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await admin.from("submissions").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).gte("created_at", since);
    if ((count ?? 0) >= SUBMITS_PER_MINUTE) return json({ error: "Slow down, try again in a minute" }, 429);
  }

  const [{ data: problem }, { data: runtime }] = await Promise.all([
    admin.from("problems").select("compare_mode").eq("id", problemId).single(),
    admin.from("problem_runtime").select("prelude, harness").eq("problem_id", problemId).eq("language", language).single(),
  ]);
  if (!problem || !runtime) return json({ error: "Problem not found" }, 404);

  let query = admin.from("test_cases").select("input, expected_output, is_hidden")
    .eq("problem_id", problemId).order("order_index");
  if (mode !== "submit") query = query.eq("is_hidden", false);
  const { data: tests, error } = await query;
  if (error || !tests?.length) return json({ error: "No tests found" }, 404);

  // Assemble exactly like scripts/beet.py assemble()
  const rt = RUNTIME[language];
  const head = rt.prelude + (runtime.prelude ? runtime.prelude + "\n" : "");
  const source = head + code + "\n" + rt.helpers + runtime.harness;
  const offset = head.split("\n").length - 1;

  let judged: Judge0Result[];
  try {
    judged = await Promise.all(tests.map((t) => judge(source, languageId, t.input)));
  } catch (e) {
    return json({ error: `Code runner unavailable: ${(e as Error).message}` }, 502);
  }

  const results = tests.map((t, i) => {
    const r = judged[i];
    const ranOk = r.status.id === 3 || r.status.id === 4; // finished; we judge the output ourselves
    const passed = ranOk && check(problem.compare_mode, t.input, t.expected_output, r.stdout);
    return {
      passed,
      hidden: t.is_hidden,
      status: passed ? "Accepted" : ranOk ? "Wrong Answer" : r.status.description,
      statusId: r.status.id,
      timeMs: r.time ? Math.round(parseFloat(r.time) * 1000) : null,
      input: t.input,
      expected: t.expected_output,
      stdout: r.stdout,
      stderr: fixLineNumbers(r.stderr ?? r.compile_output, offset, code.split("\n").length),
    };
  });

  const passedCount = results.filter((r) => r.passed).length;
  const allPassed = passedCount === results.length;
  const firstFail = results.find((r) => !r.passed);
  const status = allPassed ? "accepted"
    : firstFail?.statusId === 6 ? "compile_error"
    : firstFail?.statusId === 5 ? "time_limit"
    : (firstFail?.statusId ?? 0) >= 7 ? "runtime_error"
    : "wrong_answer";
  const runtimeMs = Math.max(0, ...results.map((r) => r.timeMs ?? 0));

  if (mode === "submit") {
    await admin.from("submissions").insert({
      user_id: user.id, problem_id: problemId, language, code,
      status, passed: passedCount, total: results.length, runtime_ms: runtimeMs,
    });
    const { data: existing } = await admin.from("user_progress").select("status")
      .eq("user_id", user.id).eq("problem_id", problemId).maybeSingle();
    const solved = allPassed || existing?.status === "solved";
    await admin.from("user_progress").upsert({
      user_id: user.id, problem_id: problemId, last_language: language,
      last_opened_at: new Date().toISOString(),
      status: solved ? "solved" : "attempted",
      ...(allPassed && existing?.status !== "solved" ? { solved_at: new Date().toISOString() } : {}),
    });
  }

  // Visible tests show everything. For hidden tests, only reveal the FIRST failing one (like LeetCode).
  const firstHiddenFail = results.findIndex((r) => r.hidden && !r.passed);
  const shown = results.map((r, i) =>
    !r.hidden || i === firstHiddenFail
      ? { passed: r.passed, status: r.status, hidden: r.hidden, input: r.input, expected: r.expected, stdout: r.stdout, stderr: r.stderr }
      : { passed: r.passed, status: r.status, hidden: true }
  );

  return json({ status, passed: passedCount, total: results.length, runtimeMs, results: shown });
});
