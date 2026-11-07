-- Beetcode: LeetCode parity
-- 1. Hidden reference solution, used to compute the expected output of user-written custom test cases.
alter table public.problem_runtime
  add column if not exists reference text not null default '';

-- 2. Memory usage on submissions (like LeetCode's "Memory" stat)
alter table public.submissions
  add column if not exists memory_kb int;

-- 3. Acceptance rate per problem, computed over everyone's submissions.
--    security definer so it can aggregate across users without exposing any individual rows.
create or replace function public.problem_stats()
returns table (problem_id int, submissions bigint, accepted bigint)
language sql stable security definer set search_path = public as $$
  select s.problem_id, count(*), count(*) filter (where s.status = 'accepted')
  from public.submissions s
  group by s.problem_id
$$;
grant execute on function public.problem_stats() to anon, authenticated;
