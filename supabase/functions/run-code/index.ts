// Beetcode run-code edge function (behaves like LeetCode's Run / Submit)
//
// POST { problemId, language, code, mode: "run", tests?: string[] }
//   Runs the user's code on the given test inputs (the editable "Testcase" tab; defaults to the
//   examples). Expected output is computed by the hidden reference solution, so custom cases work.
//   Nothing is saved.
// POST { problemId, language, code, mode: "submit" }
//   Runs every test (including hidden ones), stops reporting at the first failure like LeetCode,
//   saves the submission and progress.
//
// Program sent to Judge0:
//   RUNTIME prelude + problem prelude + USER CODE + RUNTIME helpers + problem harness
// Each test's input is a JSON array of arguments on stdin. The harness prints the user's own debug
// output first, then a marker line, then the judged JSON result.
import { createClient } from "npm:@supabase/supabase-js@2";
import { RUNTIME } from "./runtime.ts";
import { check, splitOutput } from "./compare.ts";

const JUDGE0_URL = Deno.env.get("JUDGE0_URL") ?? "https://judge0-ce.p.rapidapi.com";
const JUDGE0_KEY = Deno.env.get("JUDGE0_KEY") ?? ""; // RapidAPI key, empty if self-hosted
const SUBMITS_PER_MINUTE = 5;
const MAX_CUSTOM_TESTS = 8;
const MAX_TEST_CHARS = 20_000;

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
  status: { id: number; description: string }; time: string | null; memory: number | null;
};

type Runtime = { prelude: string; harness: string; reference: string };

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

function assemble(language: string, rt: Runtime, code: string) {
  const base = RUNTIME[language];
  const head = base.prelude + (rt.prelude ? rt.prelude + "\n" : "");
  return { source: head + code + "\n" + base.helpers + rt.harness, offset: head.split("\n").length - 1 };
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

const STATUS_KEY = (id: number, ranOk: boolean, passed: boolean) =>
  passed ? "accepted" : ranOk ? "wrong_answer" : id === 6 ? "compile_error" : id === 5 ? "time_limit" : "runtime_error";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Identify the caller from their JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Please sign in to run code." }, 401);

  const body = await req.json();
  const { problemId, language, code, mode } = body;
  const languageId = LANGUAGE_IDS[language];
  if (!languageId || !RUNTIME[language]) return json({ error: "Unsupported language" }, 400);
  if (typeof code !== "string" || code.length > 50_000) return json({ error: "Invalid code" }, 400);
  if (mode !== "run" && mode !== "submit") return json({ error: "Invalid mode" }, 400);

  // Service role: can read hidden tests, harnesses and reference solutions
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (mode === "submit") {
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await admin.from("submissions").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).gte("created_at", since);
    if ((count ?? 0) >= SUBMITS_PER_MINUTE) return json({ error: "Too many submissions. Wait a minute and try again." }, 429);
  }

  const [{ data: problem }, { data: runtimes }] = await Promise.all([
    admin.from("problems").select("compare_mode, params").eq("id", problemId).single(),
    admin.from("problem_runtime").select("language, prelude, harness, reference").eq("problem_id", problemId),
  ]);
  const rt = runtimes?.find((r) => r.language === language) as Runtime | undefined;
  const pyRt = runtimes?.find((r) => r.language === "python") as Runtime | undefined;
  if (!problem || !rt || !pyRt) return json({ error: "Problem not found" }, 404);

  const user_ = assemble(language, rt, code);
  const userLines = code.split("\n").length;

  const grade = (r: Judge0Result, input: string, expected: string) => {
    const [stdout, result] = splitOutput(r.stdout);
    const ranOk = (r.status.id === 3 || r.status.id === 4) && result !== ""; // finished; we judge output ourselves
    const passed = ranOk && check(problem.compare_mode, input, expected, result);
    return {
      passed,
      status: STATUS_KEY(r.status.id, ranOk, passed),
      input, expected,
      output: result,
      stdout,
      stderr: fixLineNumbers(r.stderr ?? r.compile_output, user_.offset, userLines),
      timeMs: r.time ? Math.round(parseFloat(r.time) * 1000) : null,
      memoryKb: r.memory,
    };
  };
  const runOne = async (input: string, expected: string) => grade(await judge(user_.source, languageId, input), input, expected);

  try {
    // ------------------------------------------------------------------ RUN
    if (mode === "run") {
      let inputs: string[];
      if (Array.isArray(body.tests) && body.tests.length) {
        inputs = body.tests.slice(0, MAX_CUSTOM_TESTS).map(String);
      } else {
        const { data } = await admin.from("test_cases").select("input").eq("problem_id", problemId)
          .eq("is_hidden", false).order("order_index");
        inputs = (data ?? []).map((t) => t.input);
      }

      // Validate shape: a JSON array with one value per parameter
      const nParams = (problem.params as string[]).length;
      for (const [i, inp] of inputs.entries()) {
        if (inp.length > MAX_TEST_CHARS) return json({ error: `Case ${i + 1} is too large.` }, 400);
        let parsed: unknown;
        try { parsed = JSON.parse(inp); } catch { return json({ error: `Case ${i + 1}: every value must be valid JSON.` }, 400); }
        if (!Array.isArray(parsed) || parsed.length !== nParams) return json({ error: `Case ${i + 1}: expected ${nParams} value(s).` }, 400);
      }

      // Expected output comes from the hidden reference solution (Python), run alongside the user's code
      const ref = assemble("python", pyRt, pyRt.reference);
      const cases = await Promise.all(inputs.map(async (inp) => {
        const [e, u] = await Promise.all([judge(ref.source, LANGUAGE_IDS.python, inp), judge(user_.source, languageId, inp)]);
        const expected = splitOutput(e.stdout)[1];
        if (!(e.status.id === 3 || e.status.id === 4) || !expected) {
          return { passed: false, status: "invalid_testcase", input: inp, expected: "", output: "", stdout: "",
            stderr: "This test case isn't valid for this problem. Check the constraints.", timeMs: null, memoryKb: null };
        }
        return grade(u, inp, expected);
      }));
      const firstBad = cases.find((c) => !c.passed);
      return json({ mode, status: firstBad ? firstBad.status : "accepted", cases });
    }

    // --------------------------------------------------------------- SUBMIT
    const { data: tests, error } = await admin.from("test_cases").select("input, expected_output")
      .eq("problem_id", problemId).order("order_index");
    if (error || !tests?.length) return json({ error: "No tests found" }, 404);

    const results = await Promise.all(tests.map((t) => runOne(t.input, t.expected_output)));
    const passedCount = results.filter((r) => r.passed).length;
    const firstFail = results.find((r) => !r.passed) ?? null;
    const status = firstFail ? firstFail.status : "accepted";
    const runtimeMs = Math.max(0, ...results.map((r) => r.timeMs ?? 0));
    const memoryKb = Math.max(0, ...results.map((r) => r.memoryKb ?? 0)) || null;

    const { data: saved } = await admin.from("submissions").insert({
      user_id: user.id, problem_id: problemId, language, code,
      status, passed: passedCount, total: results.length, runtime_ms: runtimeMs, memory_kb: memoryKb,
    }).select("id, created_at").single();

    const { data: existing } = await admin.from("user_progress").select("status")
      .eq("user_id", user.id).eq("problem_id", problemId).maybeSingle();
    const solved = !firstFail || existing?.status === "solved";
    await admin.from("user_progress").upsert({
      user_id: user.id, problem_id: problemId, last_language: language,
      last_opened_at: new Date().toISOString(),
      status: solved ? "solved" : "attempted",
      ...(!firstFail && existing?.status !== "solved" ? { solved_at: new Date().toISOString() } : {}),
    });

    // Like LeetCode: on failure show only the first failing case ("last executed input")
    return json({
      mode, status, passed: passedCount, total: results.length, runtimeMs, memoryKb,
      failedCase: firstFail, submission: saved,
    });
  } catch (e) {
    return json({ error: `Code runner unavailable: ${(e as Error).message}` }, 502);
  }
});
