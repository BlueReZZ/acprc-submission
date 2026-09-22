# ACPRC Submissions — project notes

## What this is

A submission and review system for ACPRC's 2027 Annual Conference, built to
replace a Monday.com Forms "portal" the committee commissioned from a third
party and were unhappy with — most importantly, Monday.com enforces a hard
**character** limit on text boxes instead of a **word** limit, and the
multi-line sections (background, methods, results, etc.) render as cramped
single-line text inputs instead of proper text areas. Monday's own guidance
text literally warns submitters that "this system will not automatically
count or cap the words... draft in Word first."

Live Monday.com form (reference only, not to be linked to or embedded):
`https://forms.monday.com/forms/48c8aede26d7f0469637ad45888dd8ef?r=euc1`

**The system now supports more than one submission type.** It started as a
single abstract-submission form; the committee then decided to pilot the
whole screening → review → programme workflow with **award nominations**
first, launching abstracts later — so the architecture (schema, auth,
screening, and as much of reviewing as sensibly possible) had to generalize
to "a submission is one of several types" rather than assuming "submission =
abstract." See "Backend" for how that's structured. A landing page
(`index.html`) now lets a visitor choose which type to submit; each type has
its own form (`abstract/`, `award/`).

## Where the abstract form's content came from

The Monday.com form is a client-rendered SPA, but it embeds its full
schema as `window.form_data` / `board_view_settings` JSON in the page
source. That JSON was extracted (not guessed) and is the source of truth
for every question, its order, help text, and validation rule reproduced
in `abstract/index.html`. It also exposed the *entire* hidden back-office
review workflow (ethics review, two-reviewer scoring rubric with 0–3 scores
across 5 criteria, final reviewer, outcome field, etc.) — useful historical
context, but the committee described a different, simpler workflow when
the backend was actually built (self-selected reviewers, a single
tick/maybe/cross verdict per reviewer, no fixed reviewer pairs), so
Monday's numeric rubric was deliberately **not** carried over. See
"Backend" for what was actually built.

The written submission guidance also comes from the live ACPRC page:
`https://www.acprc.org.uk/annual-conference/submission-details/abstract-submission/`

### Business rules that are easy to get wrong

- **The 400-word limit is a single combined total**, not 400 words per
  box. It covers Background + Aim(s)/Objectives + Methods + Results +
  Conclusions/Implications for practice — five separate fields in the UI
  that share one budget.
- **The five subheading words themselves count towards that 400** (per
  ACPRC's own guidance text). The word counter starts at a fixed offset
  of **9 words** for this reason (`SUBHEADING_WORDS` in
  `js/abstract-validation.js`): "Background"(1) + "Aim(s)/ Objectives"(2) +
  "Methods"(1) + "Results"(1) + "Conclusions / Implications for
  practice"(4) = 9. This is our best literal-word-count interpretation of
  their rule, not an ACPRC-supplied number — if the committee has a
  different official count, update the constant.
- **Abstract Title** has its own separate 20-word limit (not shared with
  the 400).
- **Approval Details** and **References** are explicitly excluded from
  the word count.
- References: maximum of three, Vancouver style.
- Word counting logic (`wordCount()` in `js/word-count.js`, shared by
  every submission type) splits on whitespace and drops tokens with no
  alphanumeric character, so stray punctuation (e.g. a lone "/") isn't
  counted as a word.

### Field list, in order (matches the live Monday form exactly)

1. **Your contact details** — your name, your email. Submission date is a
   hidden field (`#submission_date`), not shown in the UI — it's stamped
   with the current date server-side at submit time
   (`api/submit-abstract.mjs`), never trusting whatever the client sends.
   The live Monday form exposes this as a visible date picker defaulting
   to today; the committee confirmed that's unwanted here — it should
   just record the actual submission date automatically.
2. **Presenter's details** — name, job title, place of work, email,
   phone (not published, emergencies only), co-author(s) names & places
   of work
3. **Abstract details** — category, theme, other-theme (conditional),
   abstract title (20-word cap)
4. **Main body** — background, aims/objectives, methods, results,
   conclusions (400-word combined cap, see above)
5. **Approval** — approval details (ethics/governance, R&D/audit, or
   justification for none — not word-counted)
6. **References** (not word-counted, max 3, Vancouver style)
7. **Declarations** — submitted before as 1st author? / submitted
   before at all? (Yes/No each), consent to store data (required)

**Submission Category** options, in Monday's intended order: Research,
Education, Clinical Practice, Leadership.

**Submission Theme** options, in Monday's intended order: Critical Care,
Long Term Conditions, Home Ventilation, Surgery, Paediatrics, Education,
Professionalism and fundamentals of practice, Leadership & Innovation,
Other (selecting Other reveals a free-text "Other Theme" field).

## Where the award nomination form's content came from

`docs/ACPRC-award-2025-nomination-form.docx` — last year's paper/Word
nomination form, extracted field-by-field (not guessed) as the source of
truth for `award/index.html`. Unlike the abstract form, the source document
has **no section headings**, no explicit "required" markers, and (being a
print-era form) no consent/data-protection field — those choices in the
digital version are this project's own, made for consistency with the
abstract form and basic data-protection practice, not taken from the docx.

### Business rules (award-specific, different from the abstract form's)

- **Justification has its own flat 500-word limit** — no subheading offset,
  no combined multi-field budget like the abstract form's. It's a single
  field, counted directly against `JUSTIFICATION_WORD_LIMIT` in
  `js/award-validation.js`.
- **Nomination category** is a single choice from exactly 5 options (see
  below) — eligibility note from the docx, worth keeping as guidance text
  on the form: *"All categories are open to any member of the ACPRC, apart
  from newcomer, which is open to those who have qualified in the last 3
  years."* (Not programmatically enforced — membership/qualification
  isn't data this system has.)
- **Specialty is the only optional field** — "if applicable" in the source
  form.
- The docx's own timeline (nominations open 1 Feb, close 28 Feb, subgroup
  meets 11 March, shortlist notified 1 April) was for 2025 and doesn't
  apply to this pilot — `award/index.html` currently shows the same shape
  transposed to 2027 as a placeholder (nominations open 1 Feb 2027, close
  28 Feb 2027, subgroup meets 11 March 2027, shortlist notified 1 April
  2027) **pending real dates from the committee** — find/replace these
  once given.

### Field list, in order

1. **Your details** (nominator) — your name, your email.
2. **Nominee's details** — name of nominee, nominee email address, place
   of work, job title, specialty (optional — "if applicable", with the
   docx's own example text: "critical care, community, HEI education
   etc.").
3. **Nomination category** — single-select, exactly 5 options (see below).
4. **Justification** — long text, ≤500 words, with the docx's own
   guidance paragraph reproduced verbatim as hint text on the form.
5. **Declarations** — consent to store data (required; not in the
   original docx, added for consistency — see above).

**Nomination category** options (Title Case, matching the abstract form's
category/theme capitalisation convention — the docx itself is
inconsistent between Title Case and sentence case across its two listings
of the same 5 names): Connecting People, Sharing Knowledge and Skills,
Research and Best Practice, Newcomer of the Year, Leadership and
Innovation.

## Brand

Colours and type were extracted from ACPRC's live site
(`https://www.acprc.org.uk/css/main.min.css`), not invented:

- Navy `#293556` (primary — header bar, buttons, footer), hover/active
  `#1b2238`
- Cyan accent `#05d5e5` (secondary), lighter hover `#5ce4ee`
- Body text `#222`, border grey `#d9d9d9`
- Typeface: **Lato** throughout (loaded from Google Fonts)
- Sharp corners: 2px border-radius on buttons/inputs — deliberately not
  rounded/pill-shaped
- Logo and favicons are ACPRC's real assets, copied into `assets/`
  (`logo.png` at 400×400, `favicon-32.png`, `favicon-16.png`)

The header/footer chrome is a lightweight approximation of ACPRC's real
header/footer (navy account bar, white header with logo, navy footer) —
not a pixel clone of their full CMS markup/mega-nav, which would be
unnecessary complexity for a standalone system. Every page (landing,
both forms, login, admin, review) reuses the same header/footer/`.card`
shell and `css/style.css` tokens — no per-page design system drift.

## Project structure

```
index.html                              landing page — two large cards ("Abstract" / "Award Nomination"), each linking to its own form
abstract/index.html                     abstract submission form (moved verbatim from the old root index.html when award nominations became a second type)
award/index.html                        award nomination form
login/index.html                        shared magic-link log in page (admin + reviewer)
admin/index.html                        screening queue, programme view, invite-user form — works across every submission type
review/index.html                       reviewer dashboard — a Type toggle switches between blinded abstract review and open award review
css/style.css                           hand-written stylesheet using ACPRC's real brand tokens — shared by every page, incl. the landing page's card grid
css/admin.css                           dashboard/table layout for admin + review pages, built on style.css's tokens
js/word-count.js                        wordCount() — the one genuinely type-agnostic piece of validation, shared by every type's validation module
js/abstract-form.js                     abstract form's client-side behaviour (renamed from js/form.js)
js/abstract-validation.js               shared, DOM-free abstract rules (word limits, enums) — imported by js/abstract-form.js AND api/submit-abstract.mjs, so the two copies can't drift (renamed from js/validation.js)
js/award-form.js                        award form's client-side behaviour
js/award-validation.js                  shared, DOM-free award rules — imported by js/award-form.js AND api/submit-award.mjs
js/supabaseClient.js                    configured Supabase client (publishable key — safe to ship; RLS does the real protection)
js/auth.js                              shared session/role guard + sign-out, used by admin.js and review.js — has no submission-type awareness at all
js/auth-login.js                        login page behaviour (magic-link send + redirect-on-session)
js/admin.js                             admin page behaviour (screening, programme, invite) — type-aware: separate query/render logic per type, merged for a combined view
js/review.js                            reviewer page behaviour — a Type toggle switches the query, card renderer, and verdict options (3-state blind vs 2-state open)
api/submit-abstract.mjs                 serverless function (Vercel): the ONLY way an abstract submission is created; re-validates everything server-side
api/submit-award.mjs                    serverless function (Vercel): the ONLY way an award nomination is created; mirrors submit-abstract.mjs's shape
api/invite-user.mjs                     serverless function (Vercel): admin-only, provisions a new admin/reviewer account — no submission-type awareness
supabase/migrations/0001_init_schema.sql            original single-type schema (historical — superseded by 0003, kept for the record of how RLS/views were first established)
supabase/migrations/0002_fix_view_privileges.sql    fixes a view-privilege bug found after first deploying 0001 (historical, same caveat)
supabase/migrations/0003_multi_submission_types.sql full rebuild into the current multi-type schema — this is the one that matters; see "Backend"
supabase/migrations/0004_fix_create_submission_privileges.sql   fixes a function-privilege bug found after first deploying 0003 (see "Backend")
docs/ACPRC-award-2025-nomination-form.docx          source document for the award form's fields (see above)
assets/                                 ACPRC's real logo + favicons
```

No build step, no npm dependencies anywhere in the repo (browser pages load
`@supabase/supabase-js` from the `esm.sh` CDN as an ES module; the `api/`
functions use plain `fetch` against Supabase's REST/Auth endpoints, no SDK).
Plain HTML/CSS/JS throughout, deliberately, so it can be dropped straight
onto static hosting — see "Backend" for why hosting is Vercel, not GitHub
Pages.

## What the public forms do

`js/abstract-form.js` and `js/award-form.js` follow the same shape (the
award form was built to match the abstract form's behaviour, not just its
look):

- Build any chip-group (category/theme/nomination-category/Yes-No) from a
  plain JS array via a small local `buildChipGroup()` helper, so option
  lists live in one place per form.
- Live word counters — the abstract form has one combined running total
  across five boxes (`SUBHEADING_WORDS` + 400-word budget) shown in a
  sticky bar; the award form has one simple counter on its single
  justification field against a flat 500-word limit. Both import
  `wordCount()` from `js/word-count.js`.
- Reveals conditional fields where relevant (abstract form only: "Other
  theme" when Theme = Other).
- Client-side validation on submit: highlights invalid fields, scrolls to
  the first one, shows an error banner.
- On a fully valid submit: `POST`s to `/api/submit-abstract` or
  `/api/submit-award` (see "Backend"), and only shows the
  **preview/confirmation panel** and clears the `localStorage` draft once
  that save actually succeeds — a failed request keeps the draft and
  shows an error banner instead.
- Autosaves the draft to `localStorage` (per-browser only, not shared
  between devices/viewers) under its own key (`acprc_abstract_draft_v1` /
  `acprc_award_draft_v1`) so a refresh doesn't lose work, with a "clear
  draft" link in the footer.
- Imports its word-count constants/rules from its own `js/*-validation.js`
  module rather than defining them locally, so the browser and the server
  (`api/submit-*.mjs`) can't drift apart — loaded as `<script
  type="module">` for this reason.

## Backend

Three workflows sit behind the public forms, backed by **Supabase** (hosted
Postgres + Auth + Row Level Security + auto-REST API) with **Vercel**
(static hosting + serverless functions) as the deployment target. Full
reasoning for every decision below was captured in two approved
implementation plans across the sessions that built this (the original
single-type backend, then the multi-type generalization); the essentials:

- **Screening** (`admin/`, "Screening queue" section) — admin confirms a
  submission is real and complete (approval statement/word limit for
  abstracts) before it's visible to reviewers. Applies identically to
  every type. `submissions.screening_status` (`pending|passed|failed`) is
  the current-state column; every screening action also appends to
  `screening_log` (who/when/notes) via the `screen_submission()` RPC, so
  status changes have an audit trail.
- **Reviewing** (`review/`) — reviewers log in and self-select which
  *passed* submissions to review, via a Type toggle that switches which
  queue they're browsing. **Abstract review is blind**: the
  `abstract_submissions_for_review` view exposes only category, theme,
  title, the five body fields, approval details and references — never
  `co_authors` or any name/workplace/contact field. **Award review is
  NOT blind** (confirmed with the committee: awards recognise a specific
  named person, there's nothing to blind) — `award_submissions_for_review`
  exposes nominee and nominator identity alongside the nomination content.
  Both views share the same underlying mechanism: a reviewer has zero RLS
  grant on the base tables at all, so blinding (where it applies) can't
  be bypassed by querying the base tables directly. Each reviewer's
  verdict and comment lives in its own row in `reviews` — one shared
  table for every type (one row per submission×reviewer,
  `unique(submission_id, reviewer_id)` gives upsert-to-edit-your-own-review
  semantics). **Abstract verdicts are 3-state** (accept/maybe/reject);
  **award verdicts are 2-state** (accept/reject only — awards "just get an
  approval or rejection," per the committee) — enforced not by a
  type-specific column but by an RLS check (`verdict_allowed_for_submission()`)
  on the one shared `verdict` column, so review storage stays genuinely
  unified across types. **Reviewers never see each other's verdicts or
  comments** — only admin sees all reviews on a submission together.
- **Programme organisation** (`admin/`, "Programme" section) — a Type
  filter (All/Abstract/Award) drives which per-type view(s) are queried;
  selecting a specific type reveals that type's own secondary filters
  (category+theme for abstracts, nomination category for awards) — "All"
  runs both and merges them into one combined, sortable list (the "team
  can easily see abstracts and awards together" requirement), sorted by a
  shared `review_score` (accept=+1, maybe=0, reject=−1, summed — not
  averaged — across all reviews; unreviewed submissions sort last,
  distinct from an all-"maybe"/all-"reject" score). Records the final
  outcome (accepted/rejected) plus, for abstracts only, the assigned
  presentation format, via the `record_decision()` RPC. This is the
  single source of truth for the programme, not just a read-only view.

### Multi-type data model

One `submissions` table per row of *any* type, holding only the columns
every type shares (`id`, `submission_type` text `check in ('abstract',
'award')`, `created_at`, `screening_status`, `final_outcome`,
`decided_by`, `decided_at`) — plus one **1:1 detail table per type**
(`abstract_details`, `award_details`), each keyed by `submission_id`
referencing `submissions(id)`, holding that type's actual content fields
and its own `CHECK` constraints. `screening_log` and `reviews` reference
`submissions.id` only and needed **no changes at all** to support a second
type — that's the "single review storage" property: reviews are one
table, one shape, regardless of how many submission types exist.

This shape (slim shared base + a detail table per type) is the template
for any future third type, not a generic/pluggable "submission type
system" built ahead of need — adding a type means adding one detail table,
one pair of `*_for_review`/`*_with_review_summary` views, one
`create_<type>_submission()` RPC, and the UI branches in `admin.js`/
`review.js`/`award-form.js`'s siblings, following the exact pattern
already there for abstract vs award.

**Why `abstract_details`/`award_details` aren't just nullable columns on
one wide `submissions` table** (the simpler-looking alternative): the two
types' fields don't overlap much, `NOT NULL` per-type constraints stay
genuinely enforced at the column level rather than turning into a pile of
cross-column `CHECK`s, and — now proven necessary by a real bug found this
session (see `0003_multi_submission_types.sql`'s comments) — RLS and
PostgREST embedding both work far more predictably against real per-type
tables than against a single table where "which columns are meaningful"
depends on a `submission_type` value.

**RPCs added for the multi-type rebuild** (all in
`supabase/migrations/0003_multi_submission_types.sql`):
- `create_abstract_submission(p_data jsonb)` / `create_award_submission(p_data jsonb)`
  — atomic 2-table inserts (`submissions` + the type's detail table), same
  "one transaction per multi-table write" pattern as `screen_submission()`.
  Take a single `jsonb` parameter rather than one parameter per field,
  specifically so `REVOKE EXECUTE` has exactly one unambiguous signature
  to name — Supabase grants `EXECUTE` on every new function to
  `anon`/`authenticated` by default (the same default-grant behaviour
  that caused the `0002` view-privilege bug), revoked immediately after
  creation. Creation must only ever happen through
  `api/submit-abstract.mjs`/`api/submit-award.mjs` (service role), never
  a direct client call, so the shared JS validation those files run can't
  be bypassed.
- `verdict_allowed_for_submission(p_submission_id, p_verdict)` — boolean
  helper backing the award-only "no `maybe`" restriction, used in
  `reviews`' RLS `insert`/`update` policies alongside the existing
  `submission_is_reviewable()`.
- `record_decision(p_submission_id, p_outcome, p_format)` — replaces the
  old direct `.update()` on `submissions` from `admin.js`, since recording
  a decision now needs to write both `submissions.final_outcome` and
  (abstract only) `abstract_details.presentation_format` atomically.
  Raises if `p_format` is set for a non-abstract or non-accepted
  submission — this is where the original schema's `format_only_if_accepted`
  `CHECK` constraint's guarantee moved to, now that the two columns live
  on different tables and a same-table `CHECK` can no longer express it.

**Roles**: only two — `admin` (covers screening and programme
organisation for every type; same small volunteer group does both) and
`reviewer`. No self-signup: `profiles.role` rows are only ever created by
the admin-only `/api/invite-user` function, and Supabase Auth's
magic-link sign-in is called with `shouldCreateUser: false` so an
uninvited email simply can't log in. Auth is passwordless (magic-link
email) throughout — no passwords, no reset flows, chosen for a
non-technical, infrequent, volunteer audience.

**Why so few serverless functions**: everything except
submission-creation and user-invitation is a direct
`@supabase/supabase-js` call from the browser, protected entirely by Row
Level Security (see the policies and helper functions — `is_admin()`,
`is_reviewer()`, `submission_is_reviewable()`, `verdict_allowed_for_submission()`
— in `supabase/migrations/0003_multi_submission_types.sql`). Those
operations genuinely need a server: submission validation can't be
trusted to the client (`api/submit-*.mjs` re-run their type's `*-validation.js`
rules and compute `submission_date`/word counts themselves, ignoring
whatever the client sent), and inviting a user is a Supabase Auth *Admin*
API call, not a database write, so it can never be expressed as an RLS
policy.

**What's NOT resurrected**: Monday.com's hidden rubric (two assigned
reviewers scoring 5 criteria 0–3 each) — structurally incompatible with
"reviewers self-select what to review" and the simpler tick/maybe/cross
(or, for awards, accept/reject) verdict the committee actually asked for.

**Deploying this for real** (one-time, manual — not codeable):
1. Create a free Supabase project; run `0001_init_schema.sql`, then
   `0002_fix_view_privileges.sql`, then `0003_multi_submission_types.sql`,
   then `0004_fix_create_submission_privileges.sql` against it in order
   (SQL editor or `supabase db push`); note the
   project URL, publishable key, and secret key (Settings → API → API
   Keys — Supabase's current recommended key format, replacing the older
   anon/service_role JWTs; independently revocable rather than sharing
   one project-wide JWT secret, otherwise behaves identically for RLS
   purposes).
2. Replace the placeholder `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY`
   constants in `js/supabaseClient.js` with the real ones (the
   publishable key is safe to commit — RLS is what actually protects the
   data).
3. Create a Vercel project, import this repo from GitHub
   (`BlueReZZ/acprc-submission`), and set `SUPABASE_URL` +
   `SUPABASE_SERVICE_ROLE_KEY` (the secret key) as server-only
   environment variables (used only by the files under `api/`, never
   shipped to the browser).
4. **Bootstrap the first admin** by hand: invite one real email via the
   Supabase dashboard's Auth → Invite user, then run one `insert into
   profiles (id, email, full_name, role) values (...)` in the SQL editor —
   this has to be manual because `/api/invite-user` itself requires an
   existing admin caller to invoke it.
5. Once verified end-to-end on a Vercel preview deployment, point the real
   submission link at the new Vercel URL.

## Not yet built (by design — deferred)

- **Real award-pilot deadline dates** — currently 2027-transposed
  placeholders per the docx's timeline shape (see "Where the award
  nomination form's content came from"); update once the committee
  confirms actual dates.
- **A third submission type** — the base-table + detail-table pattern
  established for abstract/award is the template to repeat, not built
  generically ahead of need.
- **Emailing submitters their outcome** — no notification is sent when
  `final_outcome` changes. Natural future addition via a Supabase Database
  Webhook + a transactional email provider (e.g. Resend); not built now.
- **Exporting/printing the final programme** — the admin programme view is
  on-screen only; a client-side CSV/print export could be added later with
  no backend changes.
- **CAPTCHA / IP rate-limiting** — both `api/submit-*.mjs` only have a
  honeypot field (`#hp_website`, styled off-screen in `css/style.css`'s
  `.hp-field`) as spam defence; the human screening step is the primary
  line of defence per the screening workflow above.
- **A third role / separating "screening admin" from "programme
  committee"** — deliberately merged into one `admin` role for now (see
  "Backend"); `profiles.role`'s `CHECK` constraint is a one-line change if
  that's ever needed.
- **Multiple roles per person** (e.g. an admin who also reviews) — one
  role per `profiles` row currently.

## Testing notes

- No JS framework/build — just open `index.html`, or serve the folder:
  `python3 -m http.server 8934` then visit `http://localhost:8934/`.
- The **Claude in Chrome** extension was not connected in this
  environment as of the last session (`/chrome` didn't surface it to the
  agent). If it's connected in a future session, prefer it for visual
  checks.
- As a fallback with no extension, a headless Chromium was installed
  locally via `npx playwright@1.47.0 install chromium` (~165MB, cached at
  `~/.cache/ms-playwright/`) and driven with a throwaway Playwright
  script (`npm install playwright@1.47.0 --no-save` in a scratch dir) to
  take real screenshots and click-test the forms. That's not part of the
  project itself, just how verification was done — repeat the same
  approach if the extension still isn't available.
- No `psql`/local Postgres is available in this environment — new
  migrations (`0003_multi_submission_types.sql` and any future ones)
  can't be syntax-checked locally before running them against the real
  Supabase project; they've only had careful manual review plus, once
  run, read-only `curl` checks against the live REST API (confirming
  expected `permission denied`/`200 []` responses — see "Known, accepted
  lint warnings" and the git history for the exact checks used after
  `0001`/`0002`/`0003`).
- All backend pages (`login/`, `admin/`, `review/`, and both forms) are
  syntax-checked (`node --input-type=module --check`) and
  click/screenshot-tested against the local static server for the parts
  that don't need live infrastructure: chip groups and word counters work
  through the `*-validation.js` extraction, both public forms fail
  gracefully (draft kept, error banner shown) when their `/api/submit-*`
  endpoint isn't reachable, and `admin`/`review` correctly redirect to
  `login` when there's no session. The full logged-in flow (magic link →
  screening → review → programme, for both submission types) needs a real
  Supabase project and can't be exercised until the manual setup steps in
  "Backend" are done.

## Known-fixed issues (so they don't get reintroduced)

- **Chip alignment bug**: the hidden radio `<input>` inside each
  chip needs `position: relative` on its wrapping `<span>` and the input
  itself sized `inset: 0` (top/left/width/height 100%) — without that,
  the browser's CSS "static position" fallback misplaces it once a chip
  group wraps onto multiple lines (only visible with the 9-option Theme
  selector or the 5-option nomination-category selector, not the shorter
  Category/Yes-No groups). Fixed in `css/style.css` under `.chip-grid`.
- **Function-privilege gotcha (a recurring class of bug, twice now)**:
  Postgres does **not** grant default access to `anon`/`authenticated`
  on new tables/views — but it **does** grant `EXECUTE` on every new
  *function* to the `PUBLIC` pseudo-role by default, which those roles
  inherit as PUBLIC members regardless of their own explicit grants. A
  `REVOKE ... FROM anon, authenticated` on a function is therefore not
  enough on its own — `public` must be named too, or the revoke is a
  no-op in practice (confirmed by a live test after `0003`: an anon
  caller reached `create_abstract_submission`'s `INSERT` statement
  instead of being blocked). Fixed in
  `0004_fix_create_submission_privileges.sql`; the `0002` view-privilege
  bug was the table/view version of the same underlying lesson
  ("Supabase's default grants are broader than they look — always
  verify a REVOKE with a live, unauthenticated test, don't just read the
  SQL"). When adding any future function that must be callable only by
  the service role (not self-checking `is_admin()`/`is_reviewer()`
  internally like `screen_submission()`/`record_decision()` do), revoke
  from `public` explicitly.

## Known, accepted lint warnings (do not "fix" these)

- **Supabase's database linter flags `abstract_submissions_for_review`
  and `award_submissions_for_review` as "Security Definer View."** This
  is intentional, not an oversight — see the comment directly above
  `abstract_submissions_for_review` in
  `supabase/migrations/0003_multi_submission_types.sql` for the full
  reasoning (the same reasoning applies to the award view). Short
  version: reviewers have no RLS grant on `submissions`/`abstract_details`/
  `award_details` at all, so these views have to bypass RLS internally to
  hand them a redacted (abstract) or open (award) subset of rows they
  otherwise can't see — adding `security_invoker = true` here (the
  linter's implied fix) would make every reviewer see zero submissions,
  not fewer columns. Acknowledge/dismiss this specific finding in the
  Supabase dashboard rather than changing either view. (The
  `*_with_review_summary` views originally had this same pattern by
  mistake, not by design, in the very first schema — that was a real bug,
  fixed in `0002_fix_view_privileges.sql`, and the `0003` rebuild carries
  the fix forward with `security_invoker = true` on both
  `abstract_submissions_with_review_summary` and
  `award_submissions_with_review_summary`; don't confuse the two
  patterns.)
