-- Award-specific review process. The committee is piloting the
-- review → decision workflow with award nominations first, and awards
-- work differently from abstracts:
--
--   * No screening step: a nomination is reviewable as soon as it's
--     submitted (the committee confirmed they don't need one — the
--     reviewers' eligibility answer covers it). screening_status is
--     simply ignored for awards; it stays 'pending'.
--   * Any reviewer OR admin can self-select to review a nomination
--     (abstracts stay reviewer-only).
--   * Each award review records two yes/no answers — "is the nominee
--     eligible?" and "should they be shortlisted?" — plus notes.
--     Shortlist yes/no is stored in the existing shared `verdict`
--     column as accept/reject (awards were already 2-state), so
--     `reviews` stays one table for every type; eligibility is a new
--     nullable `eligible` column, required for awards and always null
--     for abstracts (enforced by review_allowed() in the RLS policies,
--     since submission_type lives on a different table and a
--     same-table CHECK can't see it).
--   * Outcomes are not_shortlisted / shortlisted / winner rather than
--     accepted / rejected. Joint winners are allowed, so there's no
--     one-winner-per-category constraint.
--
-- Abstracts are untouched: same outcomes, same 3-state verdict, same
-- reviewer-only access.
--
-- Run once, after 0001–0004.

-- ============================================================
-- Award outcomes. submission_type and final_outcome are both on
-- submissions, so a plain CHECK can tie the allowed values to the
-- type. Any award rows already decided under the old accepted/rejected
-- model (e.g. test data) are mapped across first so the new
-- constraint can be added.
-- ============================================================
alter table submissions drop constraint if exists submissions_final_outcome_check;

update submissions
  set final_outcome = case final_outcome when 'accepted' then 'shortlisted' else 'not_shortlisted' end
  where submission_type = 'award' and final_outcome in ('accepted', 'rejected');

alter table submissions add constraint submissions_final_outcome_check check (
  (submission_type = 'abstract' and final_outcome in ('pending', 'accepted', 'rejected'))
  or (submission_type = 'award' and final_outcome in ('pending', 'not_shortlisted', 'shortlisted', 'winner'))
);

-- record_decision() needs no change: it writes whatever p_outcome it's
-- given (now validated by the CHECK above) and already rejects
-- p_format for anything but an accepted abstract.

-- ============================================================
-- Eligibility on reviews.
-- ============================================================
alter table reviews add column eligible boolean;

-- ============================================================
-- review_allowed() — replaces submission_is_reviewable() +
-- verdict_allowed_for_submission() in the reviews insert/update
-- policies with one per-type rule:
--   abstract: caller is a reviewer, no eligibility answer, and the
--             abstract has passed screening
--   award:    caller is a reviewer or admin, verdict is accept/reject
--             (shortlist yes/no), eligibility answered — no screening
--             requirement, since awards have no screening step. Boolean-only
-- and security definer (like the other RLS helpers), so it keeps the
-- default EXECUTE grant — the policies need authenticated callers to
-- be able to run it.
-- ============================================================
create or replace function review_allowed(p_submission_id uuid, p_verdict text, p_eligible boolean)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from submissions s
    where s.id = p_submission_id
      and case s.submission_type
        when 'abstract' then is_reviewer() and p_eligible is null
                             and s.screening_status = 'passed'
        when 'award' then (is_reviewer() or is_admin())
                          and p_verdict in ('accept', 'reject')
                          and p_eligible is not null
        else false
      end
  );
$$;

drop policy if exists reviews_insert on reviews;
drop policy if exists reviews_update on reviews;
create policy reviews_insert on reviews for insert
  with check (
    reviewer_id = auth.uid()
    and review_allowed(submission_id, verdict, eligible)
  );
create policy reviews_update on reviews for update
  using (reviewer_id = auth.uid())
  with check (
    reviewer_id = auth.uid()
    and review_allowed(submission_id, verdict, eligible)
  );

drop function if exists verdict_allowed_for_submission(uuid, text);
drop function if exists submission_is_reviewable(uuid);

-- ============================================================
-- Views. CREATE OR REPLACE VIEW can change a view's query but only
-- append columns, which is all that's needed here — and it keeps each view's existing owner,
-- security_invoker setting and grants (so the deliberate
-- security-definer behaviour of award_submissions_for_review, and the
-- revokes from anon, carry over unchanged).
-- ============================================================

-- Eligibility tallies. Always 0 for abstracts (eligible is null there).
create or replace view submission_review_summary
with (security_invoker = true)
as
select
  submission_id,
  count(*) as review_count,
  count(*) filter (where verdict = 'accept') as tick_count,
  count(*) filter (where verdict = 'maybe')  as maybe_count,
  count(*) filter (where verdict = 'reject') as cross_count,
  sum(case verdict when 'accept' then 1 when 'maybe' then 0 when 'reject' then -1 end) as review_score,
  count(*) filter (where eligible = true)  as eligible_yes_count,
  count(*) filter (where eligible = false) as eligible_no_count
from reviews
group by submission_id;

-- The caller's own eligibility answer, alongside my_verdict/my_comment,
-- and every nomination rather than only screened-and-passed ones (no
-- screening step for awards).
create or replace view award_submissions_for_review as
select
  s.id, s.created_at,
  ad.your_name, ad.your_email,
  ad.nominee_name, ad.nominee_email, ad.nominee_workplace, ad.nominee_job_title, ad.nominee_specialty,
  ad.nomination_category, ad.justification,
  (select verdict from reviews r where r.submission_id = s.id and r.reviewer_id = auth.uid()) as my_verdict,
  (select comment from reviews r where r.submission_id = s.id and r.reviewer_id = auth.uid()) as my_comment,
  (select eligible from reviews r where r.submission_id = s.id and r.reviewer_id = auth.uid()) as my_eligible
from submissions s
join award_details ad on ad.submission_id = s.id
where s.submission_type = 'award';

-- Eligibility tallies for the admin shortlisting board.
create or replace view award_submissions_with_review_summary
with (security_invoker = true)
as
select
  s.id, s.submission_type, s.created_at, s.screening_status, s.final_outcome, s.decided_by, s.decided_at,
  ad.*,
  rs.review_count, rs.tick_count, rs.maybe_count, rs.cross_count, rs.review_score,
  rs.eligible_yes_count, rs.eligible_no_count
from submissions s
join award_details ad on ad.submission_id = s.id
left join submission_review_summary rs on rs.submission_id = s.id
where s.submission_type = 'award';
