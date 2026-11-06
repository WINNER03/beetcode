-- Beetcode: LeetCode-style function harness
-- Users write only the function/class; the hidden harness handles input/output.

alter table public.problems
  add column if not exists params text[] not null default '{}',        -- argument names, for showing examples
  add column if not exists compare_mode text not null default 'exact'; -- how output is judged (see run-code/compare.ts)

-- Hidden per-problem code: prelude goes before the user's code, harness after.
-- RLS on with NO policies = only the service role (edge function) can read it.
create table if not exists public.problem_runtime (
  problem_id int  not null references public.problems(id) on delete cascade,
  language   text not null,
  prelude    text not null default '',
  harness    text not null,
  primary key (problem_id, language)
);
alter table public.problem_runtime enable row level security;
