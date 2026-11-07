# 🟥 Beetcode: My Own Battle Ground

**100 hand-picked coding problems** (26 Easy, 59 Medium, 15 Hard). You solve them in the browser, LeetCode style, and your code autosaves so you can pick up right where you left off.

**Stack:** Next.js 15 (App Router) · Tailwind · Monaco editor · Supabase (Auth, Postgres, Edge Functions) · Judge0 (sandboxed code execution)

```
Browser (Next.js + Monaco)
   │  read problems, autosave drafts      ┌──────────────┐
   ├────────────────────────────────────▶ │  Supabase    │
   │                                      │  Auth        │
   │  Run / Submit                        │  Postgres    │
   └────────────────────────────────────▶ │  Edge fn ────┼──▶ Judge0 sandbox
                                          └──────────────┘
```

## Exactly like LeetCode, with our own design

Beetcode follows LeetCode's behaviour so nothing surprises you, but the look is ours (beet rose on zinc). See `CLAUDE.md` for the rule.

- **Problem page:** Description / Submissions tabs on the left, code editor on the right, and a console below the editor with **Testcase** and **Test Result** tabs. All panels can be resized by dragging.
- **Testcase tab:** each parameter gets its own editable field (`nums =`, `target =`). Add up to 8 cases with **+** or remove them. **Run** checks your code against these cases, and the expected output is computed by the hidden reference solution, so your own custom cases work too.
- **Debug output:** anything you `print()` / `console.log()` shows up as **Stdout**, separate from your returned answer.
- **Submit:** runs every hidden test. You see **Accepted** with runtime and memory, or e.g. **Wrong Answer · 41 / 58 testcases passed** with the failing input, your output and the expected output.
- **Submissions tab:** your history with status, language, runtime and memory. Open one to view its code or load it back into the editor.
- **Shortcuts:** `Ctrl/Cmd + '` runs, `Ctrl/Cmd + Enter` submits.
- **Problem list:** acceptance rate, difficulty, status, filters and search.

## How solving works

Like LeetCode, you only write the function or class, for example `def twoSum(self, nums, target)`. The `run-code` edge function wraps your code in a hidden **harness** that:

1. reads the test's arguments as JSON from stdin,
2. turns them into the right types (linked lists, trees, graphs, design-class calls),
3. calls your code and prints the result as JSON.

```
runtime prelude  (imports, ListNode, TreeNode, PriorityQueue)
problem prelude  (e.g. a custom Node class)
YOUR CODE
runtime helpers  (list/tree builders and serializers)
problem harness  (calls your function, prints JSON)
```

Output is checked by `supabase/functions/run-code/compare.ts`, which understands problems that accept more than one answer:

| mode | used for |
|---|---|
| `exact` | most problems (floats within 1e-5) |
| `unordered` | "return in any order" (Two Sum, Top K, N-Queens…) |
| `unordered_nested` | groups in any order (Group Anagrams, 3Sum, Subsets…) |
| `topo` | Course Schedule II: any valid order |
| `alien` | Alien Dictionary: any valid order |
| `palindrome_substring` | Longest Palindromic Substring: any longest |
| `min_remove_parens` | Minimum Remove to Make Valid Parentheses: any valid |

Error messages are remapped so line numbers match **your** code.

**JavaScript note:** `PriorityQueue`, `MinPriorityQueue` and `MaxPriorityQueue` are built in (`enqueue`, `dequeue`, `front`, `size`, `isEmpty`), just like on LeetCode. Example: `new MinPriorityQueue(node => node.val)`.

## How "resume where you left off" works

- While you type, the editor waits 1.5 s after you stop, then upserts your code into `drafts` (one row per user, problem, and language). It also keeps a backup copy in `localStorage`.
- `user_progress.last_opened_at` and `last_language` update whenever you open or edit a problem.
- The home page shows **Continue: <last problem>**, your solved count by difficulty, filters, and search.

## Project layout

```
problems/                    ← the 100 problems (source of truth)
  easy.txt  medium1-3.txt  hard.txt
scripts/beet.py              ← verifies problems, generates seed.sql + runtime.ts
src/
  app/page.tsx               problem list, progress, continue button
  app/problems/[slug]/       statement, examples, workspace
  app/login/                 email/password + GitHub sign-in
  components/Workspace.tsx   Monaco editor, autosave, run/submit, results
  components/ProblemList.tsx filters, search, stats
supabase/
  migrations/                schema + Row Level Security
  seed.sql                   GENERATED: 100 problems, 670 tests, harnesses
  functions/run-code/        index.ts, compare.ts, runtime.ts (generated)
```

## Setup

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run these files in order:
   1. `supabase/migrations/20261105000000_init.sql`
   2. `supabase/migrations/20261106000000_harness.sql`
   3. `supabase/migrations/20261107000000_leetcode_parity.sql`
   4. `supabase/seed.sql`, which is safe to re-run whenever problems change

   Or use the CLI: `npx supabase link`, then `npx supabase db push`, then run the seed.
3. Optional: enable GitHub sign-in under **Authentication → Providers**, and add `http://localhost:3000/auth/callback` to the redirect URLs.

### 2. Judge0 (code runner)
- **Quick start:** subscribe to [Judge0 CE on RapidAPI](https://rapidapi.com/judge0-official/api/judge0-ce). The free tier is fine for development.
- **Production:** self-host Judge0 with Docker on a small VM.

### 3. Deploy the edge function
```bash
npx supabase functions deploy run-code
npx supabase secrets set JUDGE0_URL=https://judge0-ce.p.rapidapi.com JUDGE0_KEY=your-rapidapi-key
# optional: newer runtimes if your Judge0 has them (default 71 = Python 3.8, 63 = Node 12)
npx supabase secrets set JUDGE0_PYTHON_ID=92 JUDGE0_JS_ID=93
```

### 4. Run the app
```bash
cp .env.example .env.local   # fill in your Supabase URL + anon key
npm install
npm run dev
```
Then open http://localhost:3000.

## Adding or editing problems

Edit `problems/*.txt`. Each problem has a header (`title`, `difficulty`, `tags`, `sig` or `design`, `compare`), a markdown description, tests (one JSON array of arguments per line), and **reference solutions in Python and JavaScript**. The full format is documented at the top of `scripts/beet.py`.

```bash
npm run problems:verify   # runs both reference solutions on every test and cross-checks them
npm run problems:build    # verify + regenerate supabase/seed.sql and runtime.ts
```

Expected outputs are **computed** from the Python reference and must agree with the JavaScript one (and any `=> answer` pinned in the test line), so a typo in a test cannot slip through. The first 2 tests of each problem are shown as examples, and the rest are hidden.

## Security model
- RLS is on for every table, and users can only read and write their own drafts, submissions, and progress.
- Hidden tests, harnesses and reference solutions (`problem_runtime`) have **no** client policies, so only the edge function (service role) can read them.
- Acceptance rates come from a `security definer` function that returns only per-problem totals, never anyone's submissions.
- Only the edge function can mark a problem `solved`, and a trigger blocks clients from setting it themselves.
- Submissions are rate-limited to 5 per minute per user.
- ⚠️ This repo contains the reference solutions and hidden tests (`problems/`). Make the repo **private** if you don't want them public.

## Notes on specific problems
- **Random Pick with Weight:** the judge passes the random draw in as `pickIndex(target)`, so results are deterministic.
- **BST Average Less Than K** and **Kth Largest from K Sorted Lists** are Beetcode originals; their statements are in the problem descriptions.
- **Sort an Array** asks for quicksort without the built-in sort. That rule is honor-system.

## Roadmap
- [ ] Submission history tab per problem
- [ ] Larger performance tests (generated inputs) for O(n²) vs O(n log n) problems
- [ ] More languages (Java, C++)
- [ ] Streaks and stats page
