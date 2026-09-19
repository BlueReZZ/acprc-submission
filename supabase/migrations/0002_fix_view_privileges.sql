-- Fixes a privilege bug in 0001_init_schema.sql's three views, found
-- via a read-only check against the live project after initial setup.
--
-- submission_review_summary and submissions_with_review_summary were
-- created as plain (owner-privileged) views, which bypass Row Level
-- Security on the tables they read rather than respecting the calling
-- user's — meaning any authenticated reviewer, not just admin, could
-- query them directly and see every submission unblinded plus every
-- other reviewer's verdicts. security_invoker = true makes Postgres
-- re-apply RLS as the calling user instead, so a non-admin querying
-- them now correctly gets zero rows.
--
-- Separately, Supabase grants SELECT on every new table/view to `anon`
-- by default, so without an explicit revoke, submissions_for_review
-- (deliberately a plain view, so it CAN show reviewers a blinded
-- version of a table they otherwise have no access to) was readable
-- by anyone with just the public anon key, no login at all.
--
-- Run this once against the already-provisioned Supabase project (the
-- CREATE VIEW statements in 0001 were also corrected in place, so a
-- fresh project created from that file going forward won't need this).

alter view submission_review_summary set (security_invoker = true);
alter view submissions_with_review_summary set (security_invoker = true);

revoke all on submissions_for_review from anon;
revoke all on submission_review_summary from anon;
revoke all on submissions_with_review_summary from anon;
