# ACPRC Abstract Submission — project notes

## What this is

A replacement for ACPRC's abstract submission form for the 2027 Annual
Conference. The committee (Paul's wife chairs it) commissioned a "portal"
from a third party built on Monday.com Forms, and are unhappy with the
usability — most importantly, Monday.com enforces a hard **character**
limit on text boxes instead of a **word** limit, and the multi-line
sections (background, methods, results, etc.) render as cramped
single-line text inputs instead of proper text areas. Monday's own
guidance text literally warns submitters that "this system will not
automatically count or cap the words... draft in Word first."

Live Monday.com form (reference only, not to be linked to or embedded):
`https://forms.monday.com/forms/48c8aede26d7f0469637ad45888dd8ef?r=euc1`

The single-page submission form (`index.html`) is done. The backend — real
persistence, admin screening, peer review, and programme organisation — is
now built too (see "Backend" below); what's left is mostly one-time manual
setup (creating the Supabase/Vercel projects) rather than more code. See
"Not yet built" for what's still genuinely deferred.

## Where the form's content came from

The Monday.com form is a client-rendered SPA, but it embeds its full
schema as `window.form_data` / `board_view_settings` JSON in the page
source. That JSON was extracted (not guessed) and is the source of truth
for every question, its order, help text, and validation rule reproduced
in `index.html`. It also exposed the *entire* hidden back-office review
workflow (ethics review, two-reviewer scoring rubric with 0–3 scores
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
  of **9 words** for this reason (`SUBHEADING_WORDS` in `js/form.js`):
  "Background"(1) + "Aim(s)/ Objectives"(2) + "Methods"(1) + "Results"(1)
  + "Conclusions / Implications for practice"(4) = 9. This is our best
  literal-word-count interpretation of their rule, not an ACPRC-supplied
  number — if the committee has a different official count, update the
  constant.
- **Abstract Title** has its own separate 20-word limit (not shared with
  the 400).
- **Approval Details** and **References** are explicitly excluded from
  the word count.
- References: maximum of three, Vancouver style.
- Word counting logic (`wordCount()` in `js/form.js`) splits on
  whitespace and drops tokens with no alphanumeric character, so stray
  punctuation (e.g. a lone "/") isn't counted as a word.

### Field list, in order (matches the live form exactly)

1. **Your contact details** — your name, your email. Submission date is a
   hidden field (`#submission_date`), not shown in the UI — it's stamped
   with the current date at submit time (`js/form.js`, in the `submit`
   handler), not on page load. The live Monday form exposes this as a
   visible date picker defaulting to today; the committee confirmed that's
   unwanted here — it should just record the actual submission date
   automatically.
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

## Brand

Colours and type were extracted from ACPRC's live site
(`https://www.acprc.org.uk/css/main.min.css`), not invented:

- Navy `#293556` (primary — header bar, buttons, footer), hover/active
  `#1b2238`
- Cyan accent `#05d5e5` (secondary), lighter hover `#5ce4ee`
- Body text `#222`, border grey `#d9d9d9`
- Typeface: **Lato** throughout (loaded from Google Fonts in
  `index.html`)
- Sharp corners: 2px border-radius on buttons/inputs — deliberately not
  rounded/pill-shaped
- Logo and favicons are ACPRC's real assets, copied into `assets/`
  (`logo.png` at 400×400, `favicon-32.png`, `favicon-16.png`)

The header/footer chrome (`index.html`) is a lightweight approximation of
ACPRC's real header/footer (navy account bar, white header with logo,
navy footer) — not a pixel clone of their full CMS markup/mega-nav, which
would be unnecessary complexity for a standalone form page.

## Project structure

```
index.html                              public submission form, sourced field-for-field from the Monday.com schema
login/index.html                        shared magic-link log in page (admin + reviewer)
admin/index.html                        screening queue, programme view, invite-user form
review/index.html                       blinded reviewer dashboard
css/style.css                           hand-written stylesheet using ACPRC's real brand tokens (public form + shared header/footer/card shell)
css/admin.css                           dashboard/table layout for admin + review pages, built on style.css's tokens
js/form.js                              public form's client-side behaviour (see below)
js/validation.js                        shared, DOM-free submission rules (word limits, enums) — imported by js/form.js AND api/submit-abstract.mjs, so the two copies can't drift
js/supabaseClient.js                    configured Supabase client (anon key — safe to ship; RLS does the real protection)
js/auth.js                              shared session/role guard + sign-out, used by admin.js and review.js
js/auth-login.js                        login page behaviour (magic-link send + redirect-on-session)
js/admin.js                             admin page behaviour (screening, programme, invite)
js/review.js                            reviewer page behaviour
api/submit-abstract.mjs                 serverless function (Vercel): the ONLY way a submission is created; re-validates everything server-side
api/invite-user.mjs                     serverless function (Vercel): admin-only, provisions a new admin/reviewer account
supabase/migrations/0001_init_schema.sql   full schema: tables, RLS policies, views, RPC functions
assets/                                 ACPRC's real logo + favicons
```

No build step, no npm dependencies anywhere in the repo (browser pages load
`@supabase/supabase-js` from the `esm.sh` CDN as an ES module; the two `api/`
functions use plain `fetch` against Supabase's REST/Auth endpoints, no SDK).
Plain HTML/CSS/JS throughout, deliberately, so it can be dropped straight
onto static hosting — see "Backend" for why hosting is moving to Vercel.

## What js/form.js does

- Builds the Category/Theme/Yes-No chip groups from JS arrays (so the
  option lists live in one place)
- Live word counters: per-box, plus one combined running total for the
  five main-body boxes shown in a sticky bar at the top of the page
- Reveals "Other Theme" only when Theme = Other
- Client-side validation on submit: highlights invalid fields, scrolls to
  the first one, shows an error banner
- On a fully valid submit: `POST`s to `/api/submit-abstract` (see
  "Backend"), and only shows the **preview/confirmation panel** and clears
  the `localStorage` draft once that save actually succeeds — a failed
  request keeps the draft and shows an error banner instead
- Autosaves the draft to `localStorage` (per-browser only, not shared
  between devices/viewers) so a refresh doesn't lose work, with a "clear
  draft" link in the footer
- Imports its word-count constants and `wordCount()` from
  `js/validation.js` rather than defining them locally, so the browser and
  the server (`api/submit-abstract.mjs`) can't drift apart — loaded as
  `<script type="module">` for this reason

## Backend

Three workflows sit behind the public form, backed by **Supabase** (hosted
Postgres + Auth + Row Level Security + auto-REST API) with **Vercel**
(static hosting + two serverless functions) replacing GitHub Pages as the
deployment target. Full reasoning for every decision below was captured in
an approved implementation plan in the session that built this; the
essentials:

- **Screening** (`admin/`, "Screening queue" section) — admin confirms a
  submission is real, has an appropriate approval statement, and meets the
  word limit, before it's visible to reviewers. `submissions.screening_status`
  (`pending|passed|failed`) is the current-state column; every screening
  action also appends to `screening_log` (who/when/notes) via the
  `screen_submission()` RPC, so status changes have an audit trail.
- **Reviewing** (`review/`) — reviewers log in and self-select which
  *passed* submissions to review. **Review is blind**: the
  `submissions_for_review` Postgres view exposes only category, theme,
  title, the five body fields, approval details and references — never
  `co_authors` or any name/workplace/contact field (an admin sees
  everything; a reviewer querying the base `submissions` table directly
  gets zero rows, so blinding can't be bypassed). Each reviewer's verdict
  (`accept`/`maybe`/`reject`) and comment lives in its own row in
  `reviews` (one row per submission×reviewer, `unique(submission_id,
  reviewer_id)` gives upsert-to-edit-your-own-review semantics).
  **Reviewers never see each other's verdicts or comments** — only admin
  sees all reviews on a submission together.
- **Programme organisation** (`admin/`, "Programme" section) — filters
  screened-and-reviewed submissions by category/theme, sorts by a
  `review_score` (accept=+1, maybe=0, reject=−1, summed — not averaged —
  across all reviews, via the `submissions_with_review_summary` view;
  unreviewed submissions sort last, distinct from an all-"maybe" score of
  0), and records the final outcome (accepted/rejected) plus, if accepted,
  the assigned presentation format. This is the single source of truth for
  the programme, not just a read-only view.

**Roles**: only two — `admin` (covers both screening and programme
organisation; same small volunteer group does both) and `reviewer`. No
self-signup: `profiles.role` rows are only ever created by the admin-only
`/api/invite-user` function, and Supabase Auth's magic-link sign-in is
called with `shouldCreateUser: false` so an uninvited email simply can't
log in. Auth is passwordless (magic-link email) throughout — no passwords,
no reset flows, chosen for a non-technical, infrequent, volunteer audience.

**Why two serverless functions and nothing else**: everything except
submission-creation and user-invitation is a direct
`@supabase/supabase-js` call from the browser, protected entirely by Row
Level Security (see the policies and helper functions —`is_admin()`,
`is_reviewer()`, `submission_is_reviewable()` — in
`supabase/migrations/0001_init_schema.sql`). Those two operations
genuinely need a server: submission validation can't be trusted to the
client (`/api/submit-abstract.mjs` re-runs `js/validation.js`'s rules and
computes `submission_date`/`body_word_count` itself, ignoring whatever the
client sent), and inviting a user is a Supabase Auth *Admin* API call, not
a database write, so it can never be expressed as an RLS policy.

**What's NOT resurrected**: Monday.com's hidden rubric (two assigned
reviewers scoring 5 criteria 0–3 each) — structurally incompatible with
"reviewers self-select what to review" and the simpler tick/maybe/cross
verdict the committee actually asked for.

**Deploying this for real** (one-time, manual — not codeable):
1. Create a free Supabase project; run `supabase/migrations/0001_init_schema.sql`
   against it (SQL editor or `supabase db push`); note the project URL,
   anon key, and service-role key.
2. Replace the placeholder `SUPABASE_URL`/`SUPABASE_ANON_KEY` constants in
   `js/supabaseClient.js` with the real ones (the anon key is safe to
   commit — RLS is what actually protects the data).
3. Create a Vercel project, import this repo from GitHub
   (`BlueReZZ/acprc-submission`), and set `SUPABASE_URL` +
   `SUPABASE_SERVICE_ROLE_KEY` as server-only environment variables (used
   only by the two files under `api/`, never shipped to the browser).
4. **Bootstrap the first admin** by hand: invite one real email via the
   Supabase dashboard's Auth → Invite user, then run one `insert into
   profiles (id, email, full_name, role) values (...)` in the SQL editor —
   this has to be manual because `/api/invite-user` itself requires an
   existing admin caller to invoke it.
5. Once verified end-to-end on a Vercel preview deployment, point the real
   submission link at the new Vercel URL and retire the GitHub Pages one.

## Not yet built (by design — deferred)

- **Emailing authors their outcome** — no notification is sent when
  `final_outcome` changes. Natural future addition via a Supabase Database
  Webhook + a transactional email provider (e.g. Resend); not built now.
- **Exporting/printing the final programme** — the admin programme view is
  on-screen only; a client-side CSV/print export could be added later with
  no backend changes.
- **CAPTCHA / IP rate-limiting** — `/api/submit-abstract.mjs` only has a
  honeypot field (`#hp_website` in `index.html`, styled off-screen in
  `css/style.css`'s `.hp-field`) as spam defence; the human screening step
  is the primary line of defence per the screening workflow above.
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
  take real screenshots and click-test the form. That's not part of the
  project itself, just how verification was done — repeat the same
  approach if the extension still isn't available.
- The backend pages (`login/`, `admin/`, `review/`) were syntax-checked
  (`node --input-type=module --check`), unit-tested for `js/validation.js`
  directly in Node, and click/screenshot-tested against the local static
  server for the parts that don't need live infrastructure: chip groups
  and word counters still work through the `validation.js` extraction,
  the public form fails gracefully (draft kept, error banner shown) when
  `/api/submit-abstract` isn't reachable, and `admin`/`review` correctly
  redirect to `login` when there's no session. The full logged-in flow
  (magic link → screening → review → programme) needs a real Supabase
  project and can't be exercised until the manual setup steps in
  "Backend" are done.

## Known-fixed issues (so they don't get reintroduced)

- **Chip alignment bug**: the hidden radio `<input>` inside each
  chip needs `position: relative` on its wrapping `<span>` and the input
  itself sized `inset: 0` (top/left/width/height 100%) — without that,
  the browser's CSS "static position" fallback misplaces it once a chip
  group wraps onto multiple lines (only visible with the 9-option Theme
  selector, not the shorter Category/Yes-No groups). Fixed in
  `css/style.css` under `.chip-grid`.
