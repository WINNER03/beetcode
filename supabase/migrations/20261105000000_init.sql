-- Beetcode initial schema
-- Tables: problems, test_cases, drafts, submissions, user_progress

create type difficulty as enum ('easy', 'medium', 'hard');
create type submission_status as enum ('accepted', 'wrong_answer', 'runtime_error', 'compile_error', 'time_limit');
create type progress_status as enum ('attempted', 'solved');

-- ---------- problems (public read) ----------
create table public.problems (
  id            serial primary key,
  slug          text unique not null,
  title         text not null,
  difficulty    difficulty not null,
  description   text not null,               -- markdown
  starter_code  jsonb not null default '{}',  -- { "python": "...", "javascript": "..." }
  tags          text[] not null default '{}',
  order_index   int not null default 0,
  created_at    timestamptz not null default now()
);

-- ---------- test cases (hidden ones never leave the server) ----------
create table public.test_cases (
  id              serial primary key,
  problem_id      int not null references public.problems(id) on delete cascade,
  input           text not null,   -- passed to stdin
  expected_output text not null,
  is_hidden       boolean not null default true,
  order_index     int not null default 0
);
create index on public.test_cases(problem_id);

-- ---------- drafts: autosaved code, one row per user/problem/language ----------
create table public.drafts (
  user_id     uuid not null references auth.users(id) on delete cascade,
  problem_id  int  not null references public.problems(id) on delete cascade,
  language    text not null,
  code        text not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, problem_id, language)
);

-- ---------- submissions ----------
create table public.submissions (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  problem_id  int  not null references public.problems(id) on delete cascade,
  language    text not null,
  code        text not null,
  status      submission_status not null,
  passed      int not null default 0,
  total       int not null default 0,
  runtime_ms  int,
  created_at  timestamptz not null default now()
);
create index on public.submissions(user_id, problem_id, created_at desc);

-- ---------- progress: where the user left off ----------
create table public.user_progress (
  user_id         uuid not null references auth.users(id) on delete cascade,
  problem_id      int  not null references public.problems(id) on delete cascade,
  status          progress_status not null default 'attempted',
  last_language   text,
  last_opened_at  timestamptz not null default now(),
  solved_at       timestamptz,
  primary key (user_id, problem_id)
);
create index on public.user_progress(user_id, last_opened_at desc);

-- ---------- Row Level Security ----------
alter table public.problems      enable row level security;
alter table public.test_cases    enable row level security;
alter table public.drafts        enable row level security;
alter table public.submissions   enable row level security;
alter table public.user_progress enable row level security;

-- Anyone (even logged out) can browse problems
create policy "problems are public" on public.problems
  for select using (true);

-- Only sample (non-hidden) test cases are readable by clients
create policy "sample tests are public" on public.test_cases
  for select using (is_hidden = false);

-- Drafts: owner full access
create policy "own drafts" on public.drafts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Submissions: owner can read; inserts come only from the edge function (service role)
create policy "read own submissions" on public.submissions
  for select using (auth.uid() = user_id);

-- Progress: owner can read and upsert "attempted"/last_opened; "solved" is set by the edge function
create policy "read own progress" on public.user_progress
  for select using (auth.uid() = user_id);
create policy "insert own progress" on public.user_progress
  for insert with check (auth.uid() = user_id and status = 'attempted');
create policy "update own progress" on public.user_progress
  for update using (auth.uid() = user_id);

-- Prevent clients from marking themselves solved
create or replace function public.guard_progress_status()
returns trigger language plpgsql as $$
begin
  if auth.role() <> 'service_role' then
    new.status := old.status;
    new.solved_at := old.solved_at;
  end if;
  return new;
end $$;

create trigger guard_progress_status
  before update on public.user_progress
  for each row execute function public.guard_progress_status();
