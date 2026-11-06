"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { createClient } from "@/lib/supabase/client";
import { compact, formatArgs } from "@/lib/format";

const LANGUAGES = [
  { id: "python", label: "Python 3" },
  { id: "javascript", label: "JavaScript" },
];
const AUTOSAVE_MS = 1500;

type TestResult = {
  passed: boolean; status: string; hidden: boolean;
  input?: string; expected?: string; stdout?: string | null; stderr?: string | null;
};
type RunResponse = {
  status: string; passed: number; total: number; runtimeMs: number;
  results: TestResult[]; error?: string;
};

type Props = {
  problemId: number;
  params: string[];
  starterCode: Record<string, string>;
  initialDrafts: Record<string, string>;
  initialLanguage: string | null;
  signedIn: boolean;
};

const localKey = (problemId: number, lang: string) => `beetcode:draft:${problemId}:${lang}`;

export default function Workspace({ problemId, params, starterCode, initialDrafts, initialLanguage, signedIn }: Props) {
  const supabase = useRef(createClient()).current;
  const [language, setLanguage] = useState(
    initialLanguage && starterCode[initialLanguage] ? initialLanguage : LANGUAGES[0].id,
  );

  // Pick the best saved version: server draft > local backup > starter code
  const loadCode = useCallback((lang: string) => {
    if (initialDrafts[lang]) return initialDrafts[lang];
    try {
      const local = localStorage.getItem(localKey(problemId, lang));
      if (local) return local;
    } catch {}
    return starterCode[lang] ?? "";
  }, [initialDrafts, problemId, starterCode]);

  const [code, setCode] = useState<string>(() => initialDrafts[language] ?? starterCode[language] ?? "");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved" | "local">("saved");
  const [running, setRunning] = useState<"run" | "submit" | null>(null);
  const [result, setResult] = useState<RunResponse | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);

  // On mount: restore local backup if no server draft, and record "last opened"
  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;
      setCode(loadCode(language));
    }
    if (signedIn) {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user) return;
        supabase.from("user_progress").upsert(
          { user_id: user.id, problem_id: problemId, last_language: language, last_opened_at: new Date().toISOString() },
          { onConflict: "user_id,problem_id" },
        ).then(() => {});
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async (lang: string, value: string) => {
    try { localStorage.setItem(localKey(problemId, lang), value); } catch {}
    if (!signedIn) return setSaveState("local");
    setSaveState("saving");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setSaveState("local");
    const now = new Date().toISOString();
    const [{ error }] = await Promise.all([
      supabase.from("drafts").upsert({ user_id: user.id, problem_id: problemId, language: lang, code: value, updated_at: now }),
      supabase.from("user_progress").upsert(
        { user_id: user.id, problem_id: problemId, last_language: lang, last_opened_at: now },
        { onConflict: "user_id,problem_id" },
      ),
    ]);
    setSaveState(error ? "unsaved" : "saved");
  }, [problemId, signedIn, supabase]);

  function onChange(value: string | undefined) {
    const v = value ?? "";
    setCode(v);
    setSaveState("unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(language, v), AUTOSAVE_MS);
  }

  // Flush pending save when leaving the page
  useEffect(() => {
    const flush = () => {
      try { localStorage.setItem(localKey(problemId, language), code); } catch {}
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [code, language, problemId]);

  function switchLanguage(lang: string) {
    if (timer.current) { clearTimeout(timer.current); save(language, code); }
    setLanguage(lang);
    setCode(loadCode(lang));
    setResult(null);
  }

  function resetCode() {
    if (!confirm("Reset to starter code? Your current code for this language will be replaced.")) return;
    const s = starterCode[language] ?? "";
    setCode(s);
    save(language, s);
  }

  async function execute(mode: "run" | "submit") {
    if (!signedIn) { window.location.href = "/login"; return; }
    if (timer.current) { clearTimeout(timer.current); save(language, code); }
    setRunning(mode);
    setResult(null);
    const { data, error } = await supabase.functions.invoke<RunResponse>("run-code", {
      body: { problemId, language, code, mode },
    });
    setRunning(null);
    if (error || !data) {
      setResult({ status: "error", passed: 0, total: 0, runtimeMs: 0, results: [], error: error?.message ?? "Something went wrong" });
    } else {
      setResult(data);
    }
  }

  const saveLabel = { saved: "Saved", saving: "Saving…", unsaved: "Unsaved changes", local: "Saved on this device" }[saveState];

  return (
    <section className="flex min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-2 text-sm">
        <select
          value={language}
          onChange={(e) => switchLanguage(e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1"
        >
          {LANGUAGES.filter((l) => starterCode[l.id] !== undefined).map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
        <button onClick={resetCode} className="text-zinc-400 hover:text-zinc-100">Reset</button>
        <span className="ml-auto text-xs text-zinc-500">{saveLabel}</span>
      </div>

      <div className="min-h-[300px] flex-1">
        <Editor
          language={language}
          value={code}
          onChange={onChange}
          theme="vs-dark"
          options={{ fontSize: 14, minimap: { enabled: false }, scrollBeyondLastLine: false, tabSize: 4 }}
        />
      </div>

      <div className="max-h-[40%] overflow-y-auto border-t border-zinc-800 p-4 text-sm">
        <div className="mb-3 flex gap-2">
          <button
            onClick={() => execute("run")} disabled={!!running}
            className="rounded-md border border-zinc-700 px-4 py-1.5 hover:bg-zinc-900 disabled:opacity-50"
          >
            {running === "run" ? "Running…" : "Run"}
          </button>
          <button
            onClick={() => execute("submit")} disabled={!!running}
            className="rounded-md bg-emerald-600 px-4 py-1.5 font-medium hover:bg-emerald-500 disabled:opacity-50"
          >
            {running === "submit" ? "Submitting…" : "Submit"}
          </button>
        </div>
        {result && <Results result={result} params={params} />}
      </div>
    </section>
  );
}

const STATUS_LABEL: Record<string, string> = {
  accepted: "Accepted",
  wrong_answer: "Wrong Answer",
  runtime_error: "Runtime Error",
  compile_error: "Compile Error",
  time_limit: "Time Limit Exceeded",
};

function Results({ result, params }: { result: RunResponse; params: string[] }) {
  if (result.error) return <p className="text-red-400">{result.error}</p>;
  const ok = result.status === "accepted";
  return (
    <div>
      <p className={`mb-1 text-base font-semibold ${ok ? "text-emerald-400" : "text-red-400"}`}>
        {STATUS_LABEL[result.status] ?? result.status}
        <span className="ml-2 text-sm font-normal text-zinc-400">
          {result.passed}/{result.total} tests passed{ok ? ` · ${result.runtimeMs} ms` : ""}
        </span>
      </p>
      <div className="mb-3 flex flex-wrap gap-1">
        {result.results.map((r, i) => (
          <span
            key={i}
            title={`${r.hidden ? "Hidden test" : "Example"} ${i + 1}: ${r.status}`}
            className={`h-2 w-5 rounded-full ${r.passed ? "bg-emerald-500" : "bg-red-500"}`}
          />
        ))}
      </div>
      {result.results.map((r, i) => r.input === undefined ? null : (
        <div key={i} className="mb-2 rounded-md border border-zinc-800 p-3 font-mono text-xs">
          <p className={r.passed ? "text-emerald-400" : "text-red-400"}>
            {r.hidden ? "Hidden test" : `Example ${i + 1}`}: {r.passed ? "passed" : r.status}
          </p>
          <p className="mt-1 text-zinc-500">Input</p>
          {formatArgs(r.input, params).map((line, j) => <pre key={j} className="whitespace-pre-wrap break-all">{line}</pre>)}
          <p className="mt-1 text-zinc-500">Expected</p><pre className="whitespace-pre-wrap break-all">{compact(r.expected)}</pre>
          <p className="mt-1 text-zinc-500">Your output</p><pre className="whitespace-pre-wrap break-all">{compact(r.stdout)}</pre>
          {r.stderr && (<><p className="mt-1 text-zinc-500">Error</p><pre className="whitespace-pre-wrap text-red-300">{r.stderr}</pre></>)}
        </div>
      ))}
    </div>
  );
}
