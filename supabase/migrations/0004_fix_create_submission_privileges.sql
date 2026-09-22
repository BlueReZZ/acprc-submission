-- Fixes a privilege bug in 0003_multi_submission_types.sql found via a
-- live test against the deployed project (the same kind of check used
-- to find and fix the 0002 view-privilege bug, this time against a
-- function instead of a view).
--
-- create_abstract_submission()/create_award_submission() only revoked
-- EXECUTE from `anon, authenticated` — but Postgres grants EXECUTE on
-- every new function to the PUBLIC pseudo-role by default (unlike
-- tables/views, which get no default access at all), and anon/
-- authenticated inherit that as PUBLIC members regardless of their own
-- grants. So the functions were still fully callable by anyone holding
-- just the public/publishable key: confirmed by calling
-- create_abstract_submission with an empty payload as an anonymous
-- caller and watching it reach the INSERT (failing only on a NOT NULL
-- constraint, not a permission error) — proving execution wasn't
-- actually blocked. That means anyone could have created submissions
-- directly, bypassing every validation rule (word limits, email
-- format, the honeypot spam check) enforced only in
-- api/submit-abstract.mjs / api/submit-award.mjs.
--
-- Run this once against the already-provisioned Supabase project (the
-- REVOKE statements in 0003 were also corrected in place, so a fresh
-- project created from that file going forward won't need this).

revoke execute on function create_abstract_submission(jsonb) from public, anon, authenticated;
revoke execute on function create_award_submission(jsonb) from public, anon, authenticated;
