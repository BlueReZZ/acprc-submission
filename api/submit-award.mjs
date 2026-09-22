// Vercel serverless function (Node runtime, ESM). Public endpoint —
// the only way an award nomination is ever created. Mirrors
// api/submit-abstract.mjs's shape exactly: re-validates everything
// server-side (never trusts the client's word count or submitted
// `submission_date`) and writes via the create_award_submission() RPC
// using the service-role key, since there is no INSERT policy for
// anon/authenticated callers on `submissions`/`award_details`, and
// EXECUTE on that RPC is revoked from anon/authenticated too (see
// supabase/migrations/0003_multi_submission_types.sql) — creation must
// only ever happen through this function, never a direct client call.
//
// Zero npm dependencies on purpose — talks to Supabase's REST (PostgREST)
// API directly with fetch, so the repo never needs a package.json/node_modules
// for /api to work.
import { validateAwardSubmission } from "../js/award-validation.js";

var SUPABASE_URL = process.env.SUPABASE_URL;
var SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  var payload = req.body || {};

  // Honeypot: a real submitter never sees or fills this hidden field.
  // Reply as if the submission succeeded so a bot gets no signal that
  // it was filtered.
  if (typeof payload.hp_website === "string" && payload.hp_website.trim().length > 0) {
    res.status(200).json({ ok: true });
    return;
  }

  var normalised = Object.assign({}, payload, {
    consent: payload.consent === true
  });

  var validation = validateAwardSubmission(normalised);
  if (!validation.ok) {
    res.status(400).json({ error: "Invalid submission", details: validation.errors });
    return;
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Server is not configured" });
    return;
  }

  var data = {
    submission_date: new Date().toISOString().slice(0, 10),

    your_name: normalised.your_name.trim(),
    your_email: normalised.your_email.trim(),

    nominee_name: normalised.nominee_name.trim(),
    nominee_email: normalised.nominee_email.trim(),
    nominee_workplace: normalised.nominee_workplace.trim(),
    nominee_job_title: normalised.nominee_job_title.trim(),
    nominee_specialty: normalised.nominee_specialty ? normalised.nominee_specialty.trim() : "",

    nomination_category: normalised.nomination_category,
    justification: normalised.justification.trim(),
    justification_word_count: validation.justificationWordCount,

    consent: normalised.consent
  };

  // create_award_submission takes a single jsonb parameter (rather than
  // one-per-field) specifically so its REVOKE EXECUTE grant (see the
  // migration) has one unambiguous signature to name.
  var supabaseRes = await fetch(SUPABASE_URL + "/rest/v1/rpc/create_award_submission", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: "Bearer " + SERVICE_ROLE_KEY
    },
    body: JSON.stringify({ p_data: data })
  });

  if (!supabaseRes.ok) {
    var errText = await supabaseRes.text();
    console.error("submit-award: Supabase insert failed", supabaseRes.status, errText);
    res.status(502).json({ error: "Could not save submission" });
    return;
  }

  res.status(200).json({ ok: true });
}
