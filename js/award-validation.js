// Pure, DOM-free award-nomination rules shared by the browser
// (js/award-form.js, via <script type="module">) and the server
// (api/submit-award.mjs, via a plain ES module import) so the two
// copies of the rules can never drift apart. Do not reference
// `document`/`window` in this file.
//
// Mirrors js/abstract-validation.js's shape, but the two rulesets are
// deliberately kept separate rather than merged — awards have a single
// flat word limit (no subheading-offset/combined-budget logic) and an
// entirely different field set.

export { wordCount } from "./word-count.js";
import { wordCount } from "./word-count.js";

export var NOMINATION_CATEGORIES = [
  "Connecting People",
  "Sharing Knowledge and Skills",
  "Research and Best Practice",
  "Newcomer of the Year",
  "Leadership and Innovation"
];
export var JUSTIFICATION_WORD_LIMIT = 500;

var REQUIRED_TEXT_KEYS = [
  "your_name", "your_email",
  "nominee_name", "nominee_email", "nominee_workplace", "nominee_job_title",
  "justification"
];
var EMAIL_KEYS = ["your_email", "nominee_email"];
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Validates an award nomination payload (plain object keyed by form
// field names). `consent` is expected as a real boolean — convert
// before calling. `nominee_specialty` is optional ("if applicable" in
// the source form) and not checked for presence.
// Returns { ok: true, justificationWordCount } or { ok: false, errors: string[] }.
export function validateAwardSubmission(payload) {
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

  if (NOMINATION_CATEGORIES.indexOf(payload.nomination_category) === -1) {
    errors.push("Invalid nomination category");
  }

  var justificationWordCount = wordCount(payload.justification);
  if (justificationWordCount === 0) {
    errors.push("Justification is required");
  } else if (justificationWordCount > JUSTIFICATION_WORD_LIMIT) {
    errors.push("Justification exceeds " + JUSTIFICATION_WORD_LIMIT + " words");
  }

  if (payload.consent !== true) {
    errors.push("Consent is required");
  }

  if (errors.length > 0) {
    return { ok: false, errors: errors };
  }
  return { ok: true, justificationWordCount: justificationWordCount };
}
