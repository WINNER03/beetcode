"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${location.origin}/auth/callback` },
        });
    setLoading(false);
    if (error) return setError(error.message);
    router.push("/");
    router.refresh();
  }

  async function github() {
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  }

  return (
    <main className="mx-auto mt-20 max-w-sm px-5">
      <h1 className="mb-6 text-2xl font-semibold">
        {mode === "signin" ? "Welcome back" : "Create your account"}
      </h1>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="email" required placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-rose-500"
        />
        <input
          type="password" required minLength={6} placeholder="Password" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none focus:border-rose-500"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          disabled={loading}
          className="w-full rounded-md bg-rose-600 py-2 font-medium hover:bg-rose-500 disabled:opacity-50"
        >
          {loading ? "..." : mode === "signin" ? "Sign in" : "Sign up"}
        </button>
      </form>
      <button onClick={github} className="mt-3 w-full rounded-md border border-zinc-700 py-2 hover:bg-zinc-900">
        Continue with GitHub
      </button>
      <p className="mt-5 text-center text-sm text-zinc-400">
        {mode === "signin" ? "New here? " : "Already have an account? "}
        <button className="text-rose-400" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "Create an account" : "Sign in"}
        </button>
      </p>
    </main>
  );
}
