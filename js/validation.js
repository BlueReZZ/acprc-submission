// Pure, DOM-free submission rules shared by the browser (js/form.js,
// via <script type="module">) and the server (api/submit-abstract.mjs,
// via a plain ES module import) so the two copies of the rules can
// never drift apart. Do not reference `document`/`window` in this file.

export var CATEGORIES = ["Research", "Education", "Clinical Practice", "Leadership"];
export var THEMES = [
  "Critical Care", "Long Term Conditions", "Home Ventilation", "Surgery",
  "Paediatrics", "Education", "Professionalism and fundamentals of practice",
  "Leadership & Innovation", "Other"
];
export var SUBHEADING_WORDS = 9; // "Background" + "Aim(s)/ Objectives" + "Methods" + "Results" + "Conclusions / Implications for practice"
export var BODY_LIMIT = 400;
export var TITLE_LIMIT = 20;

var BODY_FIELD_KEYS = ["background", "aims", "methods", "results", "conclusions"];
var REQUIRED_TEXT_KEYS = [
  "your_name", "your_email", "presenter_name", "presenter_job_title",
  "presenter_workplace", "presenter_email", "presenter_phone", "co_authors",
  "abstract_title", "background", "aims", "methods", "results", "conclusions",
  "approval_details", "references"
];
var EMAIL_KEYS = ["your_email", "presenter_email"];
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function wordCount(str) {
  if (!str) return 0;
  var tokens = String(str).trim().split(/\s+/);
  var n = 0;
  for (var i = 0; i < tokens.length; i++) {
    if (/[a-zA-Z0-9]/.test(tokens[i])) n++;
  }
  return n;
}

export function bodyWordTotal(payload) {
  var total = SUBHEADING_WORDS;
  BODY_FIELD_KEYS.forEach(function (key) {
    total += wordCount(payload[key]);
  });
  return total;
}

// Validates a submission payload (plain object keyed by form field
// names, e.g. { your_name, your_email, ..., references, prev_first_author,
// prev_any, consent }). prev_first_author/prev_any/consent are expected
// as real booleans, not "Yes"/"No" strings — convert before calling.
// Returns { ok: true, bodyWordCount } or { ok: false, errors: string[] }.
export function validateSubmission(payload) {
  var errors = [];
  payload = payload || {};

  REQUIRED_TEXT_KEYS.forEach(function (key) {
    var val = payload[key];
    if (typeof val !== "string" || val.trim().length === 0) {
      errors.push("Missing or empty field: " + key);
    }
  });

  EMAIL_KEYS.forEach(function (key) {
    var val = payload[key];
    if (typeof val === "string" && val.trim().length > 0 && !EMAIL_RE.test(val.trim())) {
      errors.push("Invalid email address: " + key);
    }
  });

  if (CATEGORIES.indexOf(payload.category) === -1) {
    errors.push("Invalid category");
  }

  if (THEMES.indexOf(payload.theme) === -1) {
    errors.push("Invalid theme");
  } else if (payload.theme === "Other") {
    if (typeof payload.other_theme !== "string" || payload.other_theme.trim().length === 0) {
      errors.push("Other theme is required when theme is \"Other\"");
    }
  }

  var titleWords = wordCount(payload.abstract_title);
  if (titleWords === 0) {
    errors.push("Abstract title is required");
  } else if (titleWords > TITLE_LIMIT) {
    errors.push("Abstract title exceeds " + TITLE_LIMIT + " words");
  }

  var bodyWordCount = bodyWordTotal(payload);
  if (bodyWordCount > BODY_LIMIT) {
    errors.push("Main body exceeds " + BODY_LIMIT + " words (counted " + bodyWordCount + ")");
  }

  if (typeof payload.prev_first_author !== "boolean") {
    errors.push("prev_first_author must be a boolean");
  }
  if (typeof payload.prev_any !== "boolean") {
    errors.push("prev_any must be a boolean");
  }
  if (payload.consent !== true) {
    errors.push("Consent is required");
  }

  if (errors.length > 0) {
    return { ok: false, errors: errors };
  }
  return { ok: true, bodyWordCount: bodyWordCount };
}
