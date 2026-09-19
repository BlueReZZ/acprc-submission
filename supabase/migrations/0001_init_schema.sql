-- ACPRC abstract submission — initial backend schema
-- Run once against the Supabase project (SQL editor, or `supabase db push`).

create extension if not exists pgcrypto;

-- ============================================================
-- profiles — maps auth.users -> app role.
-- No self-signup: rows are only ever inserted by the
-- service-role /api/invite-user function.
-- ============================================================
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text not null,
  role        text not null check (role in ('admin', 'reviewer')),
  created_at  timestamptz not null default now()
);

-- ============================================================
-- submissions — one row per abstract submission.
-- Mirrors every field in index.html/js/form.js exactly, plus
-- server-computed and workflow columns.
-- ============================================================
create table submissions (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  submission_date       date not null, -- stamped server-side at insert; never client-trusted

  your_name             text not null,
  your_email            text not null,

  presenter_name        text not null,
  presenter_job_title   text not null,
  presenter_workplace   text not null,
  presenter_email       text not null,
  presenter_phone       text not null, -- never exposed to reviewers; admin/emergency only
  co_authors            text not null, -- "Name: Place of work" per line, or "None"

  category              text not null check (category in
                          ('Research', 'Education', 'Clinical Practice', 'Leadership')),
  theme                 text not null check (theme in
                          ('Critical Care', 'Long Term Conditions', 'Home Ventilation', 'Surgery',
                           'Paediatrics', 'Education', 'Professionalism and fundamentals of practice',
                           'Leadership & Innovation', 'Other')),
  other_theme           text,

  abstract_title        text not null,
  background            text not null,
  aims                  text not null,
  methods               text not null,
  results               text not null,
  conclusions           text not null,
  body_word_count       int not null, -- server-computed: SUBHEADING_WORDS offset + the 5 boxes

  approval_details      text not null,
  reference_list        text not null, -- "references" is a reserved SQL word

  prev_first_author     boolean not null,
  prev_any              boolean not null,
  consent               boolean not null check (consent = true),

  screening_status      text not null default 'pending'
                          check (screening_status in ('pending', 'passed', 'failed')),

  final_outcome         text not null default 'pending'
                          check (final_outcome in ('pending', 'accepted', 'rejected')),
  presentation_format   text
                          check (presentation_format in ('digital_poster', 'moderated_poster', 'oral_10min')),
  decided_by            uuid references profiles(id),
  decided_at            timestamptz,

  constraint other_theme_required_if_other
    check (theme <> 'Other' or (other_theme is not null and length(trim(other_theme)) > 0)),
  constraint format_only_if_accepted
    check (presentation_format is null or final_outcome = 'accepted')
);

create index submissions_category_idx on submissions (category);
create index submissions_theme_idx on submissions (theme);
create index submissions_screening_status_idx on submissions (screening_status);
create index submissions_final_outcome_idx on submissions (final_outcome);

-- ============================================================
-- screening_log — append-only audit trail behind
-- submissions.screening_status (the fast, indexed current-state
-- column). Supports re-screening history.
-- ============================================================
create table screening_log (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references submissions(id) on delete cascade,
  screened_by    uuid not null references profiles(id),
  status         text not null check (status in ('passed', 'failed')),
  notes          text,
  created_at     timestamptz not null default now()
);
create index screening_log_submission_id_idx on screening_log (submission_id);

-- ============================================================
-- reviews — one row per (submission, reviewer). Multiple
-- reviewers per submission supported; the unique constraint
-- gives natural upsert semantics for "edit my own review".
-- ============================================================
create table reviews (
  id             uuid primary key default gen_random_uuid(),
  submission_id  uuid not null references submissions(id) on delete cascade,
  reviewer_id    uuid not null references profiles(id),
  verdict        text not null check (verdict in ('accept', 'maybe', 'reject')),
  comment        text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (submission_id, reviewer_id)
);
create index reviews_submission_id_idx on reviews (submission_id);

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger reviews_set_updated_at
  before update on reviews
  for each row execute function set_updated_at();

-- ============================================================
-- Role-check helpers (SECURITY DEFINER, boolean-only — never
-- leak row data) — avoid RLS-recursion when a policy needs to
-- check profiles.
-- ============================================================
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function is_reviewer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'reviewer');
$$;

create or replace function submission_is_reviewable(sub_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from submissions where id = sub_id and screening_status = 'passed');
$$;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table profiles enable row level security;
create policy profiles_select on profiles for select
  using (id = auth.uid() or is_admin());

alter table submissions enable row level security;
create policy submissions_admin_select on submissions for select
  using (is_admin());
create policy submissions_admin_update on submissions for update
  using (is_admin()) with check (is_admin());
-- Deliberately no INSERT policy: creation only via the
-- service-role /api/submit-abstract function. Deliberately no
-- policy at all for the 'reviewer' role: a reviewer querying
-- this base table directly gets zero rows.

alter table reviews enable row level security;
create policy reviews_select on reviews for select
  using (reviewer_id = auth.uid() or is_admin());
create policy reviews_insert on reviews for insert
  with check (reviewer_id = auth.uid() and is_reviewer() and submission_is_reviewable(submission_id));
create policy reviews_update on reviews for update
  using (reviewer_id = auth.uid())
  with check (reviewer_id = auth.uid() and submission_is_reviewable(submission_id));

alter table screening_log enable row level security;
create policy screening_log_admin_all on screening_log for all
  using (is_admin()) with check (is_admin() and screened_by = auth.uid());

-- ============================================================
-- Atomic screening RPC — updates current state + audit log in
-- one transaction. SECURITY INVOKER is sufficient: the caller
-- already has legitimate admin rights to both underlying writes.
-- ============================================================
create or replace function screen_submission(p_submission_id uuid, p_status text, p_notes text)
returns void language plpgsql security invoker as $$
begin
  if not is_admin() then
    raise exception 'only admins can screen submissions';
  end if;
  update submissions set screening_status = p_status where id = p_submission_id;
  insert into screening_log (submission_id, screened_by, status, notes)
    values (p_submission_id, auth.uid(), p_status, p_notes);
end;
$$;

-- ============================================================
-- submissions_for_review — the blind-review mechanism. A plain
-- view (owner-privileged), so it can read the base table
-- (bypassing its RLS internally) while exposing only a safe
-- column allowlist and a "passed screening" row filter.
-- Deliberately excludes every identifying field, including
-- co_authors (see plan notes: free text mixes name + workplace,
-- can't be safely partially redacted).
-- ============================================================
create view submissions_for_review as
select
  s.id, s.category, s.theme, s.other_theme, s.abstract_title,
  s.background, s.aims, s.methods, s.results, s.conclusions,
  s.approval_details, s.reference_list, s.created_at,
  (select verdict from reviews r where r.submission_id = s.id and r.reviewer_id = auth.uid()) as my_verdict,
  (select comment from reviews r where r.submission_id = s.id and r.reviewer_id = auth.uid()) as my_comment
from submissions s
where s.screening_status = 'passed';

grant select on submissions_for_review to authenticated;

-- ============================================================
-- Verdict aggregation for the programme view. accept = +1,
-- maybe = 0, reject = -1, summed (not averaged) per submission,
-- alongside raw counts. Admin-only in practice: base-table RLS
-- means a reviewer querying this still yields zero submission
-- rows joined.
-- ============================================================
create view submission_review_summary as
select
  submission_id,
  count(*) as review_count,
  count(*) filter (where verdict = 'accept') as tick_count,
  count(*) filter (where verdict = 'maybe')  as maybe_count,
  count(*) filter (where verdict = 'reject') as cross_count,
  sum(case verdict when 'accept' then 1 when 'maybe' then 0 when 'reject' then -1 end) as review_score
from reviews
group by submission_id;

create view submissions_with_review_summary as
select s.*, rs.review_count, rs.tick_count, rs.maybe_count, rs.cross_count, rs.review_score
from submissions s
left join submission_review_summary rs on rs.submission_id = s.id;

grant select on submissions_with_review_summary to authenticated;
