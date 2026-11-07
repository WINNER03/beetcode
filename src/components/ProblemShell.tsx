"use client";

// The problem page workspace. Behaves like LeetCode (panels, Testcase / Test Result console,
// Run vs Submit, Submissions history, shortcuts) but uses Beetcode's own look.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { createClient } from "@/lib/supabase/client";
import { compact, formatArgs } from "@/lib/format";

const LANGUAGES = [
  { id: "python", label: "Python3" },
  { id: "javascript", label: "JavaScript" },
];
const AUTOSAVE_MS = 1500;
const MAX_CASES = 8;

type Case = {
  passed: boolean; status: string; input: string; expected: string;
  output: string; stdout: string; stderr: string | null; timeMs: number | null; memoryKb: number | null;
};
type RunResult = { mode: "run"; status: string; cases: Case[] };
type SubmitResult = {
  mode: "submit"; status: string; passed: number; total: number; runtimeMs: number; memoryKb: number | null;
  failedCase: Case | null; submission: { id: number; created_at: string } | null;
};
type ApiError = { error: string };
type Submission = {
  id: number; status: string; language: string; runtime_ms: number | null; memory_kb: number | null;
  passed: number; total: number; created_at: string; code: string;
};

const STATUS_LABEL: Record<string, string> = {
  accepted: "Accepted",
  wrong_answer: "Wrong Answer",
  runtime_error: "Runtime Error",
  compile_error: "Compile Error",
  time_limit: "Time Limit Exceeded",
  invalid_testcase: "Invalid Testcase",
};
const statusColor = (s: string) => (s === "accepted" ? "text-emerald-400" : "text-red-400");

type Props = {
  problemId: number;
  slug: string;
  title: string;
  params: string[];
  samples: string[];
  starterCode: Record<string, string>;
  initialDrafts: Record<string, string>;
  initialLanguage: string | null;
  initiallySolved: boolean;
  signedIn: boolean;
  prevSlug: string | null;
  nextSlug: string | null;
  description: React.ReactNode;
};

const draftKey = (id: number, lang: string) => `beetcode:draft:${id}:${lang}`;
const casesKey = (id: number) => `beetcode:cases:${id}`;

// "[[2,7,11,15], 9]" -> ["[2,7,11,15]", "9"]  (one editable line per parameter, like LeetCode)
function splitInput(input: string): string[] {
  try { return (JSON.parse(input) as unknown[]).map((v) => JSON.stringify(v)); } catch { return [input]; }
}
function joinInput(values: string[]): { ok: true; input: string } | { ok: false; error: string } {
  const parsed: unknown[] = [];
  for (const v of values) {
    try { parsed.push(JSON.parse(v)); } catch { return { ok: false, error: `Not valid JSON: ${v.slice(0, 40) || "(empty)"}` }; }
  }
  return { ok: true, input: JSON.stringify(parsed) };
}

function timeAgo(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

// Draggable split between two panes. Returns [percent, handle props].
function useSplit(initial: number, axis: "x" | "y") {
  const [pct, setPct] = useState(initial);
  const ref = useRef<HTMLDivElement>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const rect = ref.current!.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const p = axis === "x" ? ((ev.clientX - rect.left) / rect.width) * 100 : ((ev.clientY - rect.top) / rect.height) * 100;
      setPct(Math.min(80, Math.max(20, p)));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); document.body.style.userSelect = ""; };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return { pct, ref, onPointerDown };
}

export default function ProblemShell(props: Props) {
  const { problemId, params, samples, starterCode, initialDrafts, signedIn } = props;
  const supabase = useRef(createClient()).current;

  // ---------------------------------------------------------------- editor + autosave
  const [language, setLanguage] = useState(
    props.initialLanguage && starterCode[props.initialLanguage] ? props.initialLanguage : LANGUAGES[0].id,
  );
  const loadCode = useCallback((lang: string) => {
    if (initialDrafts[lang]) return initialDrafts[lang];
    try { const local = localStorage.getItem(draftKey(problemId, lang)); if (local) return local; } catch {}
    return starterCode[lang] ?? "";
  }, [initialDrafts, problemId, starterCode]);

  const [code, setCode] = useState<string>(() => initialDrafts[language] ?? starterCode[language] ?? "");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved" | "local">("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userId = useRef<string | null>(null);

  useEffect(() => {
    setCode(loadCode(language));
    if (!signedIn) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      userId.current = user.id;
      supabase.from("user_progress").upsert(
        { user_id: user.id, problem_id: problemId, last_language: language, last_opened_at: new Date().toISOString() },
        { onConflict: "user_id,problem_id" },
      ).then(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async (lang: string, value: string) => {
    try { localStorage.setItem(draftKey(problemId, lang), value); } catch {}
    if (!signedIn || !userId.current) return setSaveState("local");
    setSaveState("saving");
    const now = new Date().toISOString();
    const [{ error }] = await Promise.all([
      supabase.from("drafts").upsert({ user_id: userId.current, problem_id: problemId, language: lang, code: value, updated_at: now }),
      supabase.from("user_progress").upsert(
        { user_id: userId.current, problem_id: problemId, last_language: lang, last_opened_at: now },
        { onConflict: "user_id,problem_id" },
      ),
    ]);
    setSaveState(error ? "unsaved" : "saved");
  }, [problemId, signedIn, supabase]);

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; save(language, code); }
  }, [code, language, save]);

  function onChange(value: string | undefined) {
    const v = value ?? "";
    setCode(v);
    setSaveState("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; save(language, v); }, AUTOSAVE_MS);
  }

  useEffect(() => {
    const backup = () => { try { localStorage.setItem(draftKey(problemId, language), code); } catch {} };
    window.addEventListener("beforeunload", backup);
    return () => window.removeEventListener("beforeunload", backup);
  }, [code, language, problemId]);

  function switchLanguage(lang: string) {
    flush();
    setLanguage(lang);
    setCode(loadCode(lang));
  }

  function resetCode() {
    if (!confirm("Reset to the default code? Your current code for this language will be replaced.")) return;
    const s = starterCode[language] ?? "";
    setCode(s);
    save(language, s);
  }

  // ---------------------------------------------------------------- test cases (editable)
  const defaultCases = samples.map(splitInput);
  const [cases, setCases] = useState<string[][]>(defaultCases);
  const [activeCase, setActiveCase] = useState(0);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(casesKey(problemId)) ?? "null");
      if (Array.isArray(saved) && saved.length && saved.every((c) => Array.isArray(c) && c.length === params.length)) setCases(saved);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const updateCases = (next: string[][]) => {
    setCases(next);
    try { localStorage.setItem(casesKey(problemId), JSON.stringify(next)); } catch {}
  };

  // ---------------------------------------------------------------- run / submit
  const [running, setRunning] = useState<"run" | "submit" | null>(null);
  const [consoleTab, setConsoleTab] = useState<"testcase" | "result">("testcase");
  const [runResult, setRunResult] = useState<RunResult | ApiError | null>(null);
  const [resultCase, setResultCase] = useState(0);
  const [submitResult, setSubmitResult] = useState<SubmitResult | ApiError | null>(null);
  const [leftTab, setLeftTab] = useState<"description" | "submissions" | "result">("description");
  const [solved, setSolved] = useState(props.initiallySolved);
  const [subsVersion, setSubsVersion] = useState(0);

  const requireLogin = () => { window.location.href = `/login?next=/problems/${props.slug}`; };

  async function run() {
    if (running) return;
    if (!signedIn) return requireLogin();
    const inputs: string[] = [];
    for (const [i, c] of cases.entries()) {
      const j = joinInput(c);
      if (!j.ok) { setConsoleTab("result"); setRunResult({ error: `Case ${i + 1}: ${j.error}` }); return; }
      inputs.push(j.input);
    }
    flush();
    setRunning("run"); setConsoleTab("result"); setRunResult(null);
    const { data, error } = await supabase.functions.invoke<RunResult>("run-code", {
      body: { problemId, language, code, mode: "run", tests: inputs },
    });
    setRunning(null);
    setResultCase(0);
    setRunResult(error || !data ? { error: await errorMessage(error) } : data);
  }

  async function submit() {
    if (running) return;
    if (!signedIn) return requireLogin();
    flush();
    setRunning("submit"); setLeftTab("result"); setSubmitResult(null);
    const { data, error } = await supabase.functions.invoke<SubmitResult>("run-code", {
      body: { problemId, language, code, mode: "submit" },
    });
    setRunning(null);
    setSubmitResult(error || !data ? { error: await errorMessage(error) } : data);
    if (data?.status === "accepted") setSolved(true);
    setSubsVersion((v) => v + 1);
  }

  // Keyboard shortcuts: Ctrl/Cmd + ' runs, Ctrl/Cmd + Enter submits (same as LeetCode)
  const actions = useRef({ run, submit });
  actions.current = { run, submit };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "'") { e.preventDefault(); actions.current.run(); }
      else if (e.key === "Enter") { e.preventDefault(); actions.current.submit(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const onMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Quote, () => actions.current.run());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => actions.current.submit());
  };

  // ---------------------------------------------------------------- layout
  const h = useSplit(45, "x");
  const v = useSplit(62, "y");
  const saveLabel = { saved: "Saved", saving: "Saving…", unsaved: "Unsaved", local: "Saved on this device" }[saveState];

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col bg-zinc-950">
      {/* toolbar */}
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-zinc-800 px-3 text-sm">
        <Link href="/" className="text-zinc-400 hover:text-zinc-100">☰ Problems</Link>
        <div className="flex gap-1 text-zinc-500">
          {props.prevSlug ? <Link href={`/problems/${props.prevSlug}`} className="rounded px-1.5 hover:bg-zinc-800 hover:text-zinc-100" title="Previous">‹</Link> : <span className="px-1.5 opacity-30">‹</span>}
          {props.nextSlug ? <Link href={`/problems/${props.nextSlug}`} className="rounded px-1.5 hover:bg-zinc-800 hover:text-zinc-100" title="Next">›</Link> : <span className="px-1.5 opacity-30">›</span>}
        </div>
        <div className="mx-auto flex gap-2">
          <button
            onClick={run} disabled={!!running} title="Run (Ctrl/Cmd + ')"
            className="flex items-center gap-1.5 rounded-md bg-zinc-800 px-4 py-1.5 hover:bg-zinc-700 disabled:opacity-50"
          >
            {running === "run" ? <Spinner /> : "▶"} Run
          </button>
          <button
            onClick={submit} disabled={!!running} title="Submit (Ctrl/Cmd + Enter)"
            className="flex items-center gap-1.5 rounded-md bg-rose-600 px-4 py-1.5 font-medium text-white hover:bg-rose-500 disabled:opacity-50"
          >
            {running === "submit" ? <Spinner /> : "⇪"} Submit
          </button>
        </div>
        <span className="hidden text-xs text-zinc-500 sm:inline">{saveLabel}</span>
      </div>

      {/* panels */}
      <div ref={h.ref} className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* LEFT: description / submissions / result */}
        <section className="flex min-h-[50vh] flex-col lg:min-h-0" style={{ flexBasis: `${h.pct}%` }}>
          <Tabs
            value={leftTab}
            onChange={(t) => setLeftTab(t as typeof leftTab)}
            tabs={[
              { id: "description", label: "Description" },
              { id: "submissions", label: "Submissions" },
              ...(submitResult || running === "submit" ? [{ id: "result", label: "Result" }] : []),
            ]}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {leftTab === "description" && (
              <div className="p-5">
                {solved && <p className="mb-2 text-xs font-medium text-emerald-400">✓ Solved</p>}
                {props.description}
              </div>
            )}
            {leftTab === "submissions" && (
              <SubmissionsPanel
                key={subsVersion} problemId={problemId} signedIn={signedIn}
                onLoad={(s) => { flush(); setLanguage(s.language); setCode(s.code); save(s.language, s.code); }}
              />
            )}
            {leftTab === "result" && <SubmitPanel result={submitResult} running={running === "submit"} params={params} />}
          </div>
        </section>

        <div onPointerDown={h.onPointerDown} className="hidden w-1.5 shrink-0 cursor-col-resize bg-zinc-900 hover:bg-rose-600/60 lg:block" />

        {/* RIGHT: editor + console */}
        <section ref={v.ref} className="flex min-h-[80vh] flex-1 flex-col lg:min-h-0">
          <div className="flex min-h-0 flex-col" style={{ flexBasis: `${v.pct}%` }}>
            <div className="flex h-9 shrink-0 items-center gap-3 border-b border-zinc-800 px-3 text-sm">
              <span className="text-zinc-400">{"</>"} Code</span>
              <select
                value={language} onChange={(e) => switchLanguage(e.target.value)}
                className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-zinc-200"
              >
                {LANGUAGES.filter((l) => starterCode[l.id] !== undefined).map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
              </select>
              <button onClick={resetCode} className="ml-auto text-zinc-500 hover:text-zinc-100" title="Reset to default code">↺</button>
            </div>
            <div className="min-h-0 flex-1">
              <Editor
                language={language} value={code} onChange={onChange} onMount={onMount} theme="vs-dark"
                options={{ fontSize: 14, minimap: { enabled: false }, scrollBeyondLastLine: false, tabSize: 4, automaticLayout: true }}
              />
            </div>
          </div>

          <div onPointerDown={v.onPointerDown} className="h-1.5 shrink-0 cursor-row-resize bg-zinc-900 hover:bg-rose-600/60" />

          <div className="flex min-h-[180px] flex-1 flex-col">
            <Tabs
              value={consoleTab}
              onChange={(t) => setConsoleTab(t as typeof consoleTab)}
              tabs={[{ id: "testcase", label: "Testcase" }, { id: "result", label: "Test Result" }]}
            />
            <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm">
              {consoleTab === "testcase" ? (
                <TestcaseEditor
                  params={params} cases={cases} active={activeCase} setActive={setActiveCase}
                  onChange={updateCases} onReset={() => { updateCases(defaultCases); setActiveCase(0); }}
                />
              ) : (
                <RunPanel result={runResult} running={running === "run"} params={params} active={resultCase} setActive={setResultCase} />
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

async function errorMessage(error: unknown): Promise<string> {
  // supabase-js FunctionsHttpError keeps the response in `context`
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try { const body = await ctx.json(); if (body?.error) return body.error; } catch {}
  }
  return (error as Error)?.message ?? "Something went wrong";
}

// ------------------------------------------------------------------ pieces

function Spinner() {
  return <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />;
}

function Tabs({ tabs, value, onChange }: { tabs: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="flex h-9 shrink-0 items-end gap-1 border-b border-zinc-800 px-2">
      {tabs.map((t) => (
        <button
          key={t.id} onClick={() => onChange(t.id)}
          className={`rounded-t-md px-3 py-1.5 text-sm ${value === t.id ? "border-b-2 border-rose-500 text-zinc-100" : "text-zinc-500 hover:text-zinc-200"}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function CaseChips({ count, active, setActive, colors, onRemove, onAdd }: {
  count: number; active: number; setActive: (i: number) => void;
  colors?: (boolean | null)[]; onRemove?: (i: number) => void; onAdd?: () => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="group relative">
          <button
            onClick={() => setActive(i)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1 ${active === i ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:bg-zinc-900"}`}
          >
            {colors && colors[i] !== null && <span className={`h-1.5 w-1.5 rounded-full ${colors[i] ? "bg-emerald-400" : "bg-red-400"}`} />}
            Case {i + 1}
          </button>
          {onRemove && count > 1 && (
            <button
              onClick={() => onRemove(i)} title="Remove case"
              className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-zinc-700 text-[10px] leading-none text-zinc-200 group-hover:flex"
            >×</button>
          )}
        </div>
      ))}
      {onAdd && count < MAX_CASES && (
        <button onClick={onAdd} className="rounded-md px-2 py-1 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100" title="Add a case">+</button>
      )}
    </div>
  );
}

function TestcaseEditor({ params, cases, active, setActive, onChange, onReset }: {
  params: string[]; cases: string[][]; active: number; setActive: (i: number) => void;
  onChange: (c: string[][]) => void; onReset: () => void;
}) {
  const a = Math.min(active, cases.length - 1);
  const current = cases[a] ?? [];
  return (
    <div>
      <CaseChips
        count={cases.length} active={a} setActive={setActive}
        onRemove={(i) => { const next = cases.filter((_, k) => k !== i); onChange(next); setActive(Math.max(0, Math.min(a, next.length - 1))); }}
        onAdd={() => { onChange([...cases, [...cases[a]]]); setActive(cases.length); }}
      />
      {params.map((p, i) => (
        <label key={p + i} className="mb-3 block">
          <span className="mb-1 block text-xs text-zinc-500">{p} =</span>
          <textarea
            value={current[i] ?? ""} spellCheck={false} rows={Math.min(6, Math.max(1, Math.ceil((current[i] ?? "").length / 70)))}
            onChange={(e) => { const next = cases.map((c) => [...c]); next[a][i] = e.target.value; onChange(next); }}
            className="w-full resize-y rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-[13px] text-zinc-100 outline-none focus:border-rose-500"
          />
        </label>
      ))}
      <button onClick={onReset} className="text-xs text-zinc-500 hover:text-zinc-200">Reset to examples</button>
    </div>
  );
}

function Field({ label, value, tone }: { label: string; value: string; tone?: "error" }) {
  return (
    <div className="mb-3">
      <p className="mb-1 text-xs text-zinc-500">{label}</p>
      <pre className={`whitespace-pre-wrap break-all rounded-md px-3 py-2 font-mono text-[13px] ${tone === "error" ? "bg-red-500/10 text-red-300" : "bg-zinc-900 text-zinc-100"}`}>{value}</pre>
    </div>
  );
}

function CaseDetail({ c, params }: { c: Case; params: string[] }) {
  return (
    <div>
      <Field label="Input" value={formatArgs(c.input, params).join("\n")} />
      {c.stdout && <Field label="Stdout" value={c.stdout} />}
      {c.status !== "invalid_testcase" && <Field label="Output" value={compact(c.output) || "(no output)"} />}
      {c.expected && <Field label="Expected" value={compact(c.expected)} />}
    </div>
  );
}

function RunPanel({ result, running, params, active, setActive }: {
  result: RunResult | ApiError | null; running: boolean; params: string[]; active: number; setActive: (i: number) => void;
}) {
  if (running) return <p className="flex items-center gap-2 text-zinc-400"><Spinner /> Running…</p>;
  if (!result) return <p className="text-zinc-500">Run your code (Ctrl/Cmd + &apos;) to see results here.</p>;
  if ("error" in result) return <p className="text-red-400">{result.error}</p>;
  const crashed = result.cases.find((c) => c.status === "compile_error" || c.status === "runtime_error" || c.status === "time_limit");
  const a = Math.min(active, result.cases.length - 1);
  const c = result.cases[a];
  return (
    <div>
      <p className={`mb-3 text-lg font-semibold ${statusColor(result.status)}`}>
        {STATUS_LABEL[result.status] ?? result.status}
        {result.status === "accepted" && c?.timeMs != null && <span className="ml-3 text-sm font-normal text-zinc-500">Runtime: {c.timeMs} ms</span>}
      </p>
      {crashed?.stderr && <Field label="" value={crashed.stderr} tone="error" />}
      <CaseChips count={result.cases.length} active={a} setActive={setActive} colors={result.cases.map((x) => x.passed)} />
      {c && (c.status === "invalid_testcase" ? <><Field label="Input" value={formatArgs(c.input, params).join("\n")} /><Field label="" value={c.stderr ?? ""} tone="error" /></> : <CaseDetail c={c} params={params} />)}
    </div>
  );
}

function SubmitPanel({ result, running, params }: { result: SubmitResult | ApiError | null; running: boolean; params: string[] }) {
  if (running || !result) return <p className="flex items-center gap-2 p-5 text-zinc-400"><Spinner /> Judging against all test cases…</p>;
  if ("error" in result) return <p className="p-5 text-red-400">{result.error}</p>;
  const ok = result.status === "accepted";
  return (
    <div className="p-5">
      <p className={`text-2xl font-semibold ${statusColor(result.status)}`}>{STATUS_LABEL[result.status] ?? result.status}</p>
      <p className="mb-5 mt-1 text-sm text-zinc-400">{result.passed} / {result.total} testcases passed</p>
      {ok ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-zinc-800 p-4">
            <p className="text-xs text-zinc-500">Runtime</p>
            <p className="mt-1 text-xl font-semibold">{result.runtimeMs} <span className="text-sm font-normal text-zinc-400">ms</span></p>
          </div>
          <div className="rounded-lg border border-zinc-800 p-4">
            <p className="text-xs text-zinc-500">Memory</p>
            <p className="mt-1 text-xl font-semibold">{result.memoryKb ? (result.memoryKb / 1024).toFixed(1) : "–"} <span className="text-sm font-normal text-zinc-400">MB</span></p>
          </div>
        </div>
      ) : result.failedCase && (
        <div>
          {result.failedCase.stderr && <Field label="" value={result.failedCase.stderr} tone="error" />}
          {result.status === "wrong_answer"
            ? <CaseDetail c={result.failedCase} params={params} />
            : <Field label="Last executed input" value={formatArgs(result.failedCase.input, params).join("\n")} />}
        </div>
      )}
    </div>
  );
}

function SubmissionsPanel({ problemId, signedIn, onLoad }: { problemId: number; signedIn: boolean; onLoad: (s: Submission) => void }) {
  const [subs, setSubs] = useState<Submission[] | null>(null);
  const [open, setOpen] = useState<Submission | null>(null);
  useEffect(() => {
    if (!signedIn) return;
    createClient().from("submissions")
      .select("id, status, language, runtime_ms, memory_kb, passed, total, created_at, code")
      .eq("problem_id", problemId).order("created_at", { ascending: false }).limit(50)
      .then(({ data }) => setSubs((data as Submission[]) ?? []));
  }, [problemId, signedIn]);

  if (!signedIn) return <p className="p-5 text-zinc-500"><Link href="/login" className="text-rose-400">Sign in</Link> to see your submissions.</p>;
  if (!subs) return <p className="flex items-center gap-2 p-5 text-zinc-400"><Spinner /> Loading…</p>;
  if (!subs.length) return <p className="p-5 text-zinc-500">No submissions yet. Submit your code (Ctrl/Cmd + Enter) when you are ready.</p>;

  if (open) {
    return (
      <div className="p-5">
        <button onClick={() => setOpen(null)} className="mb-3 text-sm text-zinc-500 hover:text-zinc-200">← All submissions</button>
        <p className={`text-xl font-semibold ${statusColor(open.status)}`}>{STATUS_LABEL[open.status] ?? open.status}</p>
        <p className="mb-3 text-sm text-zinc-500">
          {open.passed} / {open.total} testcases passed · {LANGUAGES.find((l) => l.id === open.language)?.label} · {new Date(open.created_at).toLocaleString()}
        </p>
        <button onClick={() => onLoad(open)} className="mb-3 rounded-md bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700">Load into editor</button>
        <pre className="overflow-x-auto rounded-md bg-zinc-900 p-3 font-mono text-[13px] text-zinc-200">{open.code}</pre>
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-zinc-500">
        <tr><th className="px-4 py-2 font-normal">Status</th><th className="font-normal">Language</th><th className="font-normal">Runtime</th><th className="font-normal">Memory</th></tr>
      </thead>
      <tbody>
        {subs.map((s) => (
          <tr key={s.id} onClick={() => setOpen(s)} className="cursor-pointer border-t border-zinc-900 hover:bg-zinc-900">
            <td className="px-4 py-2.5">
              <p className={`font-medium ${statusColor(s.status)}`}>{STATUS_LABEL[s.status] ?? s.status}</p>
              <p className="text-xs text-zinc-500">{timeAgo(s.created_at)}</p>
            </td>
            <td className="text-zinc-300">{LANGUAGES.find((l) => l.id === s.language)?.label ?? s.language}</td>
            <td className="text-zinc-400">{s.status === "accepted" && s.runtime_ms != null ? `${s.runtime_ms} ms` : "N/A"}</td>
            <td className="text-zinc-400">{s.status === "accepted" && s.memory_kb ? `${(s.memory_kb / 1024).toFixed(1)} MB` : "N/A"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
