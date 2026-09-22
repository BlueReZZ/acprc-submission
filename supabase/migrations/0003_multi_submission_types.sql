-- Generalizes the schema from "every submission is an abstract" to
-- multiple submission types (abstract, award nomination, more later).
-- Confirmed with the user: no real data exists in submissions/
-- screening_log/reviews yet (abstracts never launched), so this is a
-- clean rebuild rather than a data-preserving ALTER — much simpler and
-- safer than in-place surgery on tables nobody's used.
--
-- Run once against the Supabase project's SQL editor, after 0001 and
-- 0002. profiles and its helper functions/policies are untouched.

-- ============================================================
-- Drop the old shape. Views first (hard dependencies on
-- submissions), then tables (screening_log/reviews CASCADE brings
-- their policies with them, which we recreate below).
--
-- Of the plpgsql/sql functions from 0001, screen_submission() and
-- set_updated_at() are `language plpgsql` — Postgres doesn't parse a
-- plpgsql body at creation time, so it records no hard dependency on
-- the tables the body happens to reference, and both survive this
-- DROP untouched. is_admin()/is_reviewer()/submission_is_reviewable()
-- are `language sql`, which Postgres DOES parse and dependency-track
-- at creation time — is_admin()/is_reviewer() only reference
-- `profiles` (untouched here, so they survive), but
-- submission_is_reviewable() reads `submissions`, so `DROP TABLE
-- submissions CASCADE` below silently drops it too. All three
-- `language sql` helpers are redefined below regardless, to be
-- self-contained and not rely on this being remembered correctly.
-- ============================================================
drop view if exists submissions_with_review_summary;
drop view if exists submissions_for_review;
drop view if exists submission_review_summary;
drop table if exists reviews cascade;
drop table if exists screening_log cascade;
drop table if exists submissions cascade;

-- ============================================================
-- submissions — slim, generic base table shared by every type.
-- ============================================================
create table submissions (
  id                uuid primary key default gen_random_uuid(),
  submission_type   text not null check (submission_type in ('abstract', 'award')),
  created_at        timestamptz not null default now(),

  screening_status  text not null default 'pending'
                      check (screening_status in ('pending', 'passed', 'failed')),

  final_outcome     text not null default 'pending'
                      check (final_outcome in ('pending', 'accepted', 'rejected')),
  decided_by        uuid references profiles(id),
  decided_at        timestamptz
);

create index submissions_type_idx on submissions (submission_type);
create index submissions_screening_status_idx on submissions (screening_status);
create index submissions_final_outcome_idx on submissions (final_outcome);

-- ============================================================
-- abstract_details — 1:1 with submissions where submission_type =
-- 'abstract'. Same columns/constraints as the old flat submissions
-- table, minus format_only_if_accepted (it can no longer reference
-- final_outcome, which now lives on a different table — that
-- guarantee moves into record_decision() below).
-- ============================================================
create table abstract_details (
  submission_id         uuid primary key references submissions(id) on delete cascade,
  submission_date       date not null,

  your_name             text not null,
  your_email            text not null,

  presenter_name        text not null,
  presenter_job_title   text not null,
  presenter_workplace   text not null,
  presenter_email       text not null,
  presenter_phone       text not null,
  co_authors            text not null,

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
  body_word_count       int not null,

  approval_details      text not null,
  reference_list        text not null,

  prev_first_author     boolean not null,
  prev_any              boolean not null,
  consent               boolean not null check (consent = true),

  presentation_format   text
                          check (presentation_format in ('digital_poster', 'moderated_poster', 'oral_10min')),

  constraint other_theme_required_if_other
    check (theme <> 'Other' or (other_theme is not null and length(trim(other_theme)) > 0))
);

create index abstract_details_category_idx on abstract_details (category);
create index abstract_details_theme_idx on abstract_details (theme);

-- ============================================================
-- award_details — 1:1 with submissions where submission_type =
-- 'award'. Fields from docs/ACPRC-award-2025-nomination-form.docx.
-- ============================================================
create table award_details (
  submission_id          uuid primary key references submissions(id) on delete cascade,
  submission_date        date not null,

  your_name               text not null,  -- nominator
  your_email              text not null,  -- nominator

  nominee_name            text not null,
  nominee_email           text not null,
  nominee_workplace       text not null,
  nominee_job_title       text not null,
  nominee_specialty       text,  -- optional ("if applicable" in the source form)

  nomination_category     text not null check (nomination_category in
                            ('Connecting People', 'Sharing Knowledge and Skills',
                             'Research and Best Practice', 'Newcomer of the Year',
                             'Leadership and Innovation')),

  justification            text not null,
  justification_word_count int not null,

  consent                  boolean not null check (consent = true)
);

create index award_details_category_idx on award_details (nomination_category);

-- ============================================================
-- screening_log — unchanged shape, fully generic already.
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
-- reviews — unchanged shape, fully generic already. verdict stays a
-- single shared enum for both types (one table, one format, satisfies
-- "single review storage") — the award-only restriction against
-- 'maybe' is enforced via RLS (verdict_allowed_for_submission below),
-- not by narrowing this column.
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

create trigger reviews_set_updated_at
  before update on reviews
  for each row execute function set_updated_at();

-- ============================================================
-- Helper functions used by the RLS policies below (a policy can't
-- reference a function that doesn't exist yet, so these come first).
-- All `language sql`, `security definer`, boolean-only — never leak
-- row data, safe with default broad EXECUTE grants.
--
-- is_admin()/is_reviewer() are unchanged from 0001 — redefined here
-- only so this migration is self-contained (see the note on the DROP
-- statements above about why that matters for the `language sql`
-- ones specifically). submission_is_reviewable() is likewise
-- unchanged in behaviour, just needs restating since 0001's copy was
-- silently dropped along with the old `submissions` table.
-- verdict_allowed_for_submission() is new: awards only get a 2-state
-- verdict (approve/reject) — 'maybe' is a 3-state-review-only concept.
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

create or replace function verdict_allowed_for_submission(p_submission_id uuid, p_verdict text)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_verdict <> 'maybe'
    or (select submission_type from submissions where id = p_submission_id) = 'abstract';
$$;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table submissions enable row level security;
create policy submissions_admin_select on submissions for select
  using (is_admin());
create policy submissions_admin_update on submissions for update
  using (is_admin()) with check (is_admin());
-- No INSERT policy: creation only via the service-role
-- create_abstract_submission()/create_award_submission() RPCs. No
-- policy at all for 'reviewer': querying this base table directly
-- gets zero rows, same as before.

alter table abstract_details enable row level security;
create policy abstract_details_admin_select on abstract_details for select
  using (is_admin());
create policy abstract_details_admin_update on abstract_details for update
  using (is_admin()) with check (is_admin());
-- No INSERT policy (RPC-only, SECURITY DEFINER bypasses this
-- entirely). No policy for 'reviewer': the blind-review view below is
-- how reviewers see a redacted subset of this table's data instead.

alter table award_details enable row level security;
create policy award_details_admin_select on award_details for select
  using (is_admin());
-- No UPDATE policy: admin never edits nomination content, only
-- submissions.final_outcome via record_decision(). No INSERT policy
-- (RPC-only). No policy for 'reviewer': award_submissions_for_review
-- (below) is how reviewers see this table's data instead — it's not
-- blind, but it's still only for logged-in reviewers, not the public.

alter table screening_log enable row level security;
create policy screening_log_admin_all on screening_log for all
  using (is_admin()) with check (is_admin() and screened_by = auth.uid());

alter table reviews enable row level security;
create policy reviews_select on reviews for select
  using (reviewer_id = auth.uid() or is_admin());
create policy reviews_insert on reviews for insert
  with check (
    reviewer_id = auth.uid()
    and is_reviewer()
    and submission_is_reviewable(submission_id)
    and verdict_allowed_for_submission(submission_id, verdict)
  );
create policy reviews_update on reviews for update
  using (reviewer_id = auth.uid())
  with check (
    reviewer_id = auth.uid()
    and submission_is_reviewable(submission_id)
    and verdict_allowed_for_submission(submission_id, verdict)
  );

-- ============================================================
-- create_abstract_submission / create_award_submission — atomic
-- 2-table inserts (submissions + the type's detail table), mirroring
-- screen_submission()'s "one transaction per multi-table write"
-- pattern. SECURITY DEFINER because these run for anonymous public
-- submitters with no admin/reviewer identity to rely on — unlike
-- screen_submission()/record_decision(), there's no real caller
-- identity here to check against, so the function itself must be
-- privileged rather than relying on the (nonexistent) caller's RLS
-- rights.
--
-- Each takes a single jsonb parameter rather than one parameter per
-- field, specifically so the REVOKE EXECUTE below has exactly one,
-- unambiguous signature to name (Postgres requires exact argument
-- types for GRANT/REVOKE ON FUNCTION — trivial with one jsonb param,
-- fragile and easy to get subtly wrong with ~20+ typed params).
--
-- Postgres grants EXECUTE on every new function to the PUBLIC
-- pseudo-role by default (a different default than tables/views, which
-- get no default access at all) — anon/authenticated inherit this as
-- PUBLIC members regardless of their own grants, so the REVOKE below
-- must name `public` explicitly, not just anon/authenticated (an
-- earlier version of this migration got this wrong; caught by a live
-- test against the deployed project — see that REVOKE's comment).
-- Creation must only ever happen through api/submit-abstract.mjs /
-- api/submit-award.mjs (using the service-role key, which isn't
-- subject to this revoke), so the shared JS validation those files run
-- can't be bypassed by a direct client call.
-- ============================================================
create or replace function create_abstract_submission(p_data jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into submissions (submission_type) values ('abstract') returning id into v_id;

  insert into abstract_details (
    submission_id, submission_date, your_name, your_email,
    presenter_name, presenter_job_title, presenter_workplace, presenter_email, presenter_phone, co_authors,
    category, theme, other_theme,
    abstract_title, background, aims, methods, results, conclusions, body_word_count,
    approval_details, reference_list,
    prev_first_author, prev_any, consent
  ) values (
    v_id,
    (p_data->>'submission_date')::date,
    p_data->>'your_name', p_data->>'your_email',
    p_data->>'presenter_name', p_data->>'presenter_job_title', p_data->>'presenter_workplace',
    p_data->>'presenter_email', p_data->>'presenter_phone', p_data->>'co_authors',
    p_data->>'category', p_data->>'theme', p_data->>'other_theme',
    p_data->>'abstract_title', p_data->>'background', p_data->>'aims', p_data->>'methods',
    p_data->>'results', p_data->>'conclusions', (p_data->>'body_word_count')::int,
    p_data->>'approval_details', p_data->>'reference_list',
    (p_data->>'prev_first_author')::boolean, (p_data->>'prev_any')::boolean, (p_data->>'consent')::boolean
  );

  return v_id;
end;
$$;
-- Revoking from `public` is essential here, not optional: unlike
-- tables/views, Postgres grants EXECUTE on every new function to the
-- PUBLIC pseudo-role by default, which anon/authenticated inherit
-- regardless of their own named grants — revoking only `anon,
-- authenticated` (as an earlier version of this migration did) leaves
-- the function fully callable via that PUBLIC grant. Confirmed by a
-- live test: an anon caller reached the INSERT and failed only on a
-- NOT NULL constraint, proving execution wasn't actually blocked.
revoke execute on function create_abstract_submission(jsonb) from public, anon, authenticated;

create or replace function create_award_submission(p_data jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into submissions (submission_type) values ('award') returning id into v_id;

  insert into award_details (
    submission_id, submission_date, your_name, your_email,
    nominee_name, nominee_email, nominee_workplace, nominee_job_title, nominee_specialty,
    nomination_category, justification, justification_word_count, consent
  ) values (
    v_id,
    (p_data->>'submission_date')::date,
    p_data->>'your_name', p_data->>'your_email',
    p_data->>'nominee_name', p_data->>'nominee_email', p_data->>'nominee_workplace', p_data->>'nominee_job_title',
    nullif(p_data->>'nominee_specialty', ''),
    p_data->>'nomination_category', p_data->>'justification', (p_data->>'justification_word_count')::int,
    (p_data->>'consent')::boolean
  );

  return v_id;
end;
$$;
revoke execute on function create_award_submission(jsonb) from public, anon, authenticated;

-- ============================================================
-- record_decision — replaces the old direct .update() on submissions
-- from admin.js, since recording a decision may now need to write
-- both submissions.final_outcome and (abstract only)
-- abstract_details.presentation_format atomically. SECURITY INVOKER
-- (like screen_submission()): relies on the calling admin's own RLS
-- rights on submissions/abstract_details, self-checks is_admin()
-- first as a clear, fast-failing guard. This is where the old
-- format_only_if_accepted CHECK's guarantee moves to, now that the
-- two columns live on different tables.
-- ============================================================
create or replace function record_decision(p_submission_id uuid, p_outcome text, p_format text)
returns void
language plpgsql security invoker as $$
declare
  v_type text;
begin
  if not is_admin() then
    raise exception 'only admins can record a decision';
  end if;

  select submission_type into v_type from submissions where id = p_submission_id;
  if v_type is null then
    raise exception 'submission not found';
  end if;

  if p_format is not null and (p_outcome <> 'accepted' or v_type <> 'abstract') then
    raise exception 'presentation_format may only be set for an accepted abstract';
  end if;

  update submissions
    set final_outcome = p_outcome, decided_by = auth.uid(), decided_at = now()
    where id = p_submission_id;

  if v_type = 'abstract' then
    update abstract_details set presentation_format = p_format where submission_id = p_submission_id;
  end if;
end;
$$;

-- ============================================================
-- submission_review_summary — unchanged, already fully generic
-- (aggregates reviews only, no submission columns at all).
-- ============================================================
create view submission_review_summary
with (security_invoker = true)
as
select
  submission_id,
  count(*) as review_count,
  count(*) filter (where verdict = 'accept') as tick_count,
  count(*) filter (where verdict = 'maybe')  as maybe_count,
  count(*) filter (where verdict = 'reject') as cross_count,
  sum(case verdict when 'accept' then 1 when 'maybe' then 0 when 'reject' then -1 end) as review_score
from reviews
group by submission_id;
revoke all on submission_review_summary from anon;

-- ============================================================
-- abstract_submissions_for_review — the blind-review mechanism,
-- renamed from submissions_for_review (0001/0002), now joining
-- abstract_details instead of reading columns directly off
-- submissions. Same deliberate RLS-bypass reasoning as before (see
-- CLAUDE.md's "Known, accepted lint warnings" — reviewers have no RLS
-- grant on submissions/abstract_details at all, so this view must run
-- with elevated privilege to hand them a redacted subset of rows they
-- otherwise can't see). Deliberately excludes every identifying
-- field, including co_authors.
-- ============================================================
create view abstract_submissions_for_review as
select
  s.id, ad.category, ad.theme, ad.other_theme, ad.abstract_title,
  ad.background, ad.aims, ad.methods, ad.results, ad.conclusions,
  ad.approval_details, ad.reference_list, s.created_at,
  (select verdict from reviews r where r.submission_id = s.id and r.reviewer_id = auth.uid()) as my_verdict,
  (select comment from reviews r where r.submission_id = s.id and r.reviewer_id = auth.uid()) as my_comment
from submissions s
join abstract_details ad on ad.submission_id = s.id
where s.submission_type = 'abstract' and s.screening_status = 'passed';
revoke all on abstract_submissions_for_review from anon;
grant select on abstract_submissions_for_review to authenticated;

-- ============================================================
-- award_submissions_for_review — same mechanism, but award review is
-- NOT blind (confirmed this session: awards recognise a specific
-- named person, there's nothing to blind), so this exposes nominee/
-- nominator identity. Still restricted to logged-in reviewers/admin
-- only, not the public.
-- ============================================================
create view award_submissions_for_review as
select
  s.id, s.created_at,
  ad.your_name, ad.your_email,
  ad.nominee_name, ad.nominee_email, ad.nominee_workplace, ad.nominee_job_title, ad.nominee_specialty,
  ad.nomination_category, ad.justification,
  (select verdict from reviews r where r.submission_id = s.id and r.reviewer_id = auth.uid()) as my_verdict,
  (select comment from reviews r where r.submission_id = s.id and r.reviewer_id = auth.uid()) as my_comment
from submissions s
join award_details ad on ad.submission_id = s.id
where s.submission_type = 'award' and s.screening_status = 'passed';
revoke all on award_submissions_for_review from anon;
grant select on award_submissions_for_review to authenticated;

-- ============================================================
-- abstract_submissions_with_review_summary /
-- award_submissions_with_review_summary — replace the old single
-- submissions_with_review_summary (which can no longer usefully
-- return `s.*` now the base table is slim). security_invoker = true:
-- admin-only in practice via submissions_admin_select/
-- abstract_details_admin_select/award_details_admin_select RLS — a
-- non-admin querying these gets zero rows, same as querying the base
-- tables directly. Give the admin programme view real, named,
-- filterable/sortable columns per type (category/theme for abstracts,
-- nomination_category for awards) without relying on PostgREST
-- view-embedding, which doesn't reliably support embedding through
-- views.
-- ============================================================
create view abstract_submissions_with_review_summary
with (security_invoker = true)
as
select
  s.id, s.submission_type, s.created_at, s.screening_status, s.final_outcome, s.decided_by, s.decided_at,
  ad.*,
  rs.review_count, rs.tick_count, rs.maybe_count, rs.cross_count, rs.review_score
from submissions s
join abstract_details ad on ad.submission_id = s.id
left join submission_review_summary rs on rs.submission_id = s.id
where s.submission_type = 'abstract';
revoke all on abstract_submissions_with_review_summary from anon;

create view award_submissions_with_review_summary
with (security_invoker = true)
as
select
  s.id, s.submission_type, s.created_at, s.screening_status, s.final_outcome, s.decided_by, s.decided_at,
  ad.*,
  rs.review_count, rs.tick_count, rs.maybe_count, rs.cross_count, rs.review_score
from submissions s
join award_details ad on ad.submission_id = s.id
left join submission_review_summary rs on rs.submission_id = s.id
where s.submission_type = 'award';
revoke all on award_submissions_with_review_summary from anon;
