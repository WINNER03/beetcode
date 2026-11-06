# 🟥 Beetcode

100 curated coding problems. Solve them in the browser, and your code is autosaved, so you can pick up right where you left off.

**Stack:** Next.js 15 (App Router) · Tailwind · Monaco editor · Supabase (Auth, Postgres, Edge Functions) · Judge0 (sandboxed code execution)

```
Browser (Next.js + Monaco)
   │  autosave drafts, read problems      ┌──────────────┐
   ├────────────────────────────────────▶ │  Supabase    │
   │                                      │  Auth        │
   │  Run / Submit                        │  Postgres    │
   └────────────────────────────────────▶ │  Edge fn ────┼──▶ Judge0 sandbox
                                          └──────────────┘
```

## How "resume where you left off" works

- While you type, the editor waits 1.5 s after you stop, then upserts your code into `drafts` (one row per user, problem, and language). It also keeps a backup copy in `localStorage`.
- `user_progress.last_opened_at` and `last_language` update whenever you open or edit a problem.
- The home page shows a **Continue: <last problem>** button and your solved count.

## Project layout

```
src/
  app/
    page.tsx                 problem list, progress, continue button
    login/page.tsx           email/password + GitHub sign-in
    auth/callback/route.ts   OAuth / email confirm redirect
    problems/[slug]/page.tsx problem statement + workspace
  components/Workspace.tsx   Monaco editor, autosave, run/submit, results
  lib/supabase/              browser + server clients
  middleware.ts              keeps the auth session fresh
supabase/
  migrations/                schema + Row Level Security
  seed.sql                   first 5 problems with test cases
  functions/run-code/        grades code against tests via Judge0
```

## Setup

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run `supabase/migrations/20261105000000_init.sql`, then `supabase/seed.sql`.
   (Or use the CLI: `supabase link` then `supabase db push`.)
3. Optional: enable GitHub sign-in under **Authentication → Providers**, and add `http://localhost:3000/auth/callback` to the redirect URLs.

### 2. Judge0 (code runner)
- **Quick start:** subscribe to [Judge0 CE on RapidAPI](https://rapidapi.com/judge0-official/api/judge0-ce). The free tier is fine for development.
- **Production:** self-host Judge0 with Docker on a small VM, and set `JUDGE0_URL` to it.

### 3. Deploy the edge function
```bash
npx supabase functions deploy run-code
npx supabase secrets set JUDGE0_URL=https://judge0-ce.p.rapidapi.com JUDGE0_KEY=your-rapidapi-key
```

### 4. Run the app
```bash
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm install
npm run dev
```
Then open http://localhost:3000.

## Security model
- RLS is on for every table, and users can only read and write their own drafts and progress.
- Hidden test cases are only readable by the edge function, which uses the service role. The browser only ever sees sample tests.
- Only the edge function can mark a problem `solved`, and a trigger blocks clients from setting it themselves.
- Submissions are rate-limited to 5 per minute per user.

## Adding problems
Add a row to `problems` (markdown `description`, plus `starter_code` as JSON keyed by language) and its rows in `test_cases`. Mark the first test `is_hidden = false` so it shows as the sample. Programs read from stdin and print to stdout.

## Roadmap
- [ ] Remaining 95 problems
- [ ] Submission history tab per problem
- [ ] More languages (Java, C++)
- [ ] Topic filters and search
- [ ] Streaks and stats page
