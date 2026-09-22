// Vercel serverless function (Node runtime, ESM). Public endpoint —
// the only way an abstract submission is ever created. Re-validates
// everything server-side (never trusts the client's word counts,
// category/theme choices, or submitted `submission_date`) and writes via
// the create_abstract_submission() RPC using the service-role key, since
// there is no INSERT policy for anon/authenticated callers on
// `submissions`/`abstract_details`, and EXECUTE on that RPC is revoked
// from anon/authenticated too (see
// supabase/migrations/0003_multi_submission_types.sql) — creation must
// only ever happen through this function, never a direct client call.
//
// Zero npm dependencies on purpose — talks to Supabase's REST (PostgREST)
// API directly with fetch, so the repo never needs a package.json/node_modules
// for /api to work.
import { validateSubmission } from "../js/abstract-validation.js";

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
    prev_first_author: payload.prev_first_author === true || payload.prev_first_author === "Yes",
    prev_any: payload.prev_any === true || payload.prev_any === "Yes",
    consent: payload.consent === true
  });

  var validation = validateSubmission(normalised);
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

    presenter_name: normalised.presenter_name.trim(),
    presenter_job_title: normalised.presenter_job_title.trim(),
    presenter_workplace: normalised.presenter_workplace.trim(),
    presenter_email: normalised.presenter_email.trim(),
    presenter_phone: normalised.presenter_phone.trim(),
    co_authors: normalised.co_authors.trim(),

    category: normalised.category,
    theme: normalised.theme,
    other_theme: normalised.theme === "Other" ? normalised.other_theme.trim() : null,

    abstract_title: normalised.abstract_title.trim(),
    background: normalised.background.trim(),
    aims: normalised.aims.trim(),
    methods: normalised.methods.trim(),
    results: normalised.results.trim(),
    conclusions: normalised.conclusions.trim(),
    body_word_count: validation.bodyWordCount,

    approval_details: normalised.approval_details.trim(),
    reference_list: normalised.references.trim(),

    prev_first_author: normalised.prev_first_author,
    prev_any: normalised.prev_any,
    consent: normalised.consent
  };

  // create_abstract_submission takes a single jsonb parameter (rather
  // than ~24 typed parameters) specifically so its REVOKE EXECUTE grant
  // (see the migration) has one unambiguous signature to name.
  var supabaseRes = await fetch(SUPABASE_URL + "/rest/v1/rpc/create_abstract_submission", {
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
    console.error("submit-abstract: Supabase insert failed", supabaseRes.status, errText);
    res.status(502).json({ error: "Could not save submission" });
    return;
  }

  res.status(200).json({ ok: true });
}
