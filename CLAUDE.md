# Beetcode: project rules

## Product principle (from the owner)
**Beetcode works exactly like LeetCode, with our own design.**

- **Behaviour = LeetCode.** Users should never be surprised. Match LeetCode's workflow and features: function-only solutions with a hidden harness, the problem description / editor / console layout, the Testcase and Test Result tabs, editable custom test cases, Run vs Submit, a Submissions history, "X / Y testcases passed" with the failing case, debug `print`/`console.log` output shown as Stdout, the same keyboard shortcuts (Ctrl/Cmd + ' to run, Ctrl/Cmd + Enter to submit), the same input format (`nums = [2,7,11,15], target = 9`), and the same JS helpers (`MinPriorityQueue`, etc.).
- **Look = ours.** Never copy LeetCode's logo, name, colors, icons or wording. Beetcode branding is the beet rose (`rose-500/600`) on zinc dark, with our own copy. Problem statements are written in our own words. Never paste LeetCode text.

When adding a feature, ask: "How does LeetCode behave here?" Then build that behaviour in Beetcode's style.

## Architecture quick facts
- Next.js 15 App Router + Tailwind (`src/`), Supabase (Auth, Postgres, Edge Functions), Judge0 for code execution.
- Problems live in `problems/*.txt`. **Never edit `supabase/seed.sql` or `supabase/functions/run-code/runtime.ts` by hand**: run `npm run problems:build` (it verifies the Python and JS reference solutions agree on every test, then regenerates both).
- The program sent to Judge0 is runtime prelude + problem prelude + user code + runtime helpers + harness. The harness prints the result after a `@@BEET_RESULT@@` marker line, and anything before it is the user's Stdout.
- Hidden tests, harnesses and reference solutions live in `problem_runtime` / hidden `test_cases`. They are readable only by the edge function (service role), never by the client.
- Judge0 defaults are Python 3.8 (id 71) and Node 12 (id 63), so runtime and harness code must stay compatible with them.
