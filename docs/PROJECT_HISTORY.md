# Beetcode: project history and handoff

This is a summary of the planning conversation (Nov 5–15, 2026) between the owner (WINNER03) and Claude in the Claude app, where Beetcode was designed and built. Read it before starting new work.

## What the owner wants
- **A personal LeetCode called Beetcode** with the owner's own **100 curated problems** ("My Own Battle Ground": 26 Easy, 59 Medium, 15 Hard).
- **Supabase** handles the backend: auth, database and edge functions.
- Users sign in, solve problems in the browser, and **their work is saved where they left off**.
- **"It will be exactly like LeetCode, but with our own design."** LeetCode's behaviour, Beetcode's look and copy. This is the top rule; see `CLAUDE.md`.

## Timeline of what was built
1. **Architecture.** The stack is Next.js + Monaco on Vercel, Supabase (Auth, Postgres with RLS, Edge Functions), and Judge0 to run untrusted code in a sandbox. User code is never run inside Supabase or Vercel.
2. **Scaffold** (commit `89035a8`). Login (email/password + GitHub), problem list, problem page, autosaved drafts (debounced upsert into `drafts` plus a localStorage backup), `user_progress` with `last_opened_at` for the "Continue" button, and the `run-code` edge function.
3. **All 100 problems** (commit `569decb`).
   - Each problem lives in `problems/*.txt` with an original description (never LeetCode's text), tests, and **reference solutions in Python and JavaScript**.
   - `scripts/beet.py` generates the starter code and hidden harness, runs both reference solutions on every test, and fails if they disagree. Expected outputs are computed this way, never typed by hand.
   - Comparators in `compare.ts` handle problems that accept many answers: exact, unordered, unordered_nested, topo, alien, palindrome_substring, min_remove_parens.
4. **LeetCode parity** (commit `e8958ba`).
   - Resizable panels, Description / Submissions / Result tabs, and a Testcase + Test Result console with editable custom cases. Expected output for custom cases comes from the hidden reference solution.
   - `print`/`console.log` output shows as **Stdout** (separated by the `@@BEET_RESULT@@` marker).
   - Submit shows "X / Y testcases passed" with the failing case, or runtime and memory when accepted.
   - Submissions history, Ctrl/Cmd+' to run and Ctrl/Cmd+Enter to submit, an acceptance-rate column (`problem_stats()`), and login that returns you to the page you came from.
5. **VS Code setup** (commit `ef537aa`). Recommended extensions, tasks, and an F5 debug config in `.vscode/`.

## Decisions to remember
- **Custom problems** (the owner listed them as "Custom" with no definition, so Claude defined them; confirm with the owner if they change):
  - *BST Average Less Than K*: return the average of BST values strictly less than k, or 0 if there are none.
  - *Kth Largest from K Sorted Lists*: several ascending lists plus k; return the k-th largest value overall.
- **Random Pick with Weight**: made deterministic for judging. The judge passes the random draw as `pickIndex(target)`.
- **Judge0 language ids**: default 71 (Python 3.8) and 63 (Node 12), overridable with `JUDGE0_PYTHON_ID` / `JUDGE0_JS_ID` (92 / 93 on newer Judge0). Harness and runtime code must stay compatible with Python 3.8 and Node 12.
- **Security**: hidden tests, harnesses and reference solutions are only readable by the edge function (service role). Clients can only mark progress "attempted"; a trigger blocks them from marking a problem "solved".
- **The repo is public**, so solutions and hidden tests are visible on GitHub. Suggest making it private.

## How it was verified
- `npm run problems:verify`: all 670 tests agree across the Python and JS reference solutions.
- Full end-to-end run against a real Postgres (all 3 migrations + seed): 1,340 assembled programs passed, plus the custom-testcase path, debug-print separation, and RLS checks.
- `npm run build` and `npm run lint` are clean. The UI was smoke-tested by server rendering only, **not yet viewed in a real browser**.

## Current status / next steps
1. **Supabase is not set up yet.** Follow the README: create a project, run the 3 migrations in order, then `supabase/seed.sql`. Deploy `run-code` and set `JUDGE0_URL` / `JUDGE0_KEY`. Fill in `.env.local`.
2. Run `npm run dev` and review the UI in a browser (panel dragging, console, results), then fix anything that looks off.
3. Ideas not built yet: larger generated performance tests, more languages (Java, C++), a stats/streaks page, and a deploy to Vercel.
