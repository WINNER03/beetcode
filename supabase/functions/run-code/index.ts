// Beetcode run-code edge function
// POST { problemId, language, code, mode: "run" | "submit" }
// "run"    -> sample tests only, nothing saved
// "submit" -> all tests (incl. hidden), saves submission + progress
import { createClient } from "npm:@supabase/supabase-js@2";

const JUDGE0_URL = Deno.env.get("JUDGE0_URL") ?? "https://judge0-ce.p.rapidapi.com";
const JUDGE0_KEY = Deno.env.get("JUDGE0_KEY") ?? ""; // RapidAPI key, empty if self-hosted
const SUBMITS_PER_MINUTE = 5;

const LANGUAGE_IDS: Record<string, number> = {
  python: 71,     // Python 3
  javascript: 63, // Node.js
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const normalize = (s: string | null) => (s ?? "").replace(/\r\n/g, "\n").trim();

async function judge(code: string, languageId: number, stdin: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (JUDGE0_KEY) {
    headers["X-RapidAPI-Key"] = JUDGE0_KEY;
    headers["X-RapidAPI-Host"] = new URL(JUDGE0_URL).host;
  }
  const res = await fetch(`${JUDGE0_URL}/submissions?base64_encoded=false&wait=true`, {
    method: "POST",
    headers,
    body: JSON.stringify({ source_code: code, language_id: languageId, stdin, cpu_time_limit: 2 }),
  });
  if (!res.ok) throw new Error(`Judge0 error ${res.status}`);
  return await res.json() as {
    stdout: string | null; stderr: string | null; compile_output: string | null;
    status: { id: number; description: string }; time: string | null;
  };
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
  if (!languageId) return json({ error: "Unsupported language" }, 400);
  if (typeof code !== "string" || code.length > 50_000) return json({ error: "Invalid code" }, 400);

  // Service role: can read hidden tests and write results
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (mode === "submit") {
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await admin.from("submissions").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).gte("created_at", since);
    if ((count ?? 0) >= SUBMITS_PER_MINUTE) return json({ error: "Slow down, try again in a minute" }, 429);
  }

  let query = admin.from("test_cases").select("input, expected_output, is_hidden")
    .eq("problem_id", problemId).order("order_index");
  if (mode !== "submit") query = query.eq("is_hidden", false);
  const { data: tests, error } = await query;
  if (error || !tests?.length) return json({ error: "No tests found" }, 404);

  const results = await Promise.all(tests.map(async (t) => {
    const r = await judge(code, languageId, t.input);
    // We compare output ourselves (status 3/4 = program ran to completion)
    const ranOk = r.status.id === 3 || r.status.id === 4;
    const passed = ranOk && normalize(r.stdout) === normalize(t.expected_output);
    return {
      passed,
      status: r.status.description,
      statusId: r.status.id,
      timeMs: r.time ? Math.round(parseFloat(r.time) * 1000) : null,
      // Only reveal details for visible tests
      ...(t.is_hidden ? {} : {
        input: t.input, expected: t.expected_output,
        stdout: r.stdout, stderr: r.stderr ?? r.compile_output,
      }),
    };
  }));

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

  return json({ status, passed: passedCount, total: results.length, runtimeMs, results });
});
