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

Current goal: **get the single-page submission form right first.** What
happens on submit (where the data goes) and the reviewer/back-office side
are deliberately out of scope for now — see "Not yet built" below.

## Where the form's content came from

The Monday.com form is a client-rendered SPA, but it embeds its full
schema as `window.form_data` / `board_view_settings` JSON in the page
source. That JSON was extracted (not guessed) and is the source of truth
for every question, its order, help text, and validation rule reproduced
in `index.html`. It also exposed the *entire* hidden back-office review
workflow (ethics review, two-reviewer scoring rubric with 0–3 scores
across 5 criteria, final reviewer, outcome field, etc.) — useful context
for whenever the "reviewer portal" phase starts, but not built yet.

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
index.html        page markup, sourced field-for-field from the Monday.com schema
css/style.css      hand-written stylesheet using ACPRC's real brand tokens
js/form.js         all client-side behaviour (see below)
assets/            ACPRC's real logo + favicons
```

No build step, no dependencies — plain HTML/CSS/JS so it can be dropped
straight onto GitHub Pages.

## What js/form.js does

- Builds the Category/Theme/Yes-No chip groups from JS arrays (so the
  option lists live in one place)
- Live word counters: per-box, plus one combined running total for the
  five main-body boxes shown in a sticky bar at the top of the page
- Reveals "Other Theme" only when Theme = Other
- Client-side validation on submit: highlights invalid fields, scrolls to
  the first one, shows an error banner
- On a fully valid submit: shows a **preview/confirmation panel** only —
  there is no backend. This is intentional; see "Not yet built."
- Autosaves the draft to `localStorage` (per-browser only, not shared
  between devices/viewers) so a refresh doesn't lose work, with a "clear
  draft" link in the footer

## Not yet built (by design — deferred)

- **What happens on submit** — nothing is sent anywhere yet. The
  committee hasn't decided where submissions should land (email? a
  spreadsheet? a lightweight backend?). The "Review submission" button
  currently just validates and shows a summary panel.
- **The reviewer/back-office portal** — Monday's hidden columns reveal
  what that workflow currently looks like: ethical review, two
  independent reviewers scoring 5 criteria 0–3 each, a final reviewer,
  automatic rejection on low scores, final outcome. Worth revisiting this
  JSON dump if/when that phase starts (not currently saved as a file
  anywhere — worth re-extracting from the live Monday form if needed, or
  ask Claude to re-run the extraction it did in this project's first
  session).
- **Deployment** — not yet a git repo. Plan is GitHub Pages. Nothing has
  been pushed anywhere.

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

## Known-fixed issues (so they don't get reintroduced)

- **Chip alignment bug**: the hidden radio `<input>` inside each
  chip needs `position: relative` on its wrapping `<span>` and the input
  itself sized `inset: 0` (top/left/width/height 100%) — without that,
  the browser's CSS "static position" fallback misplaces it once a chip
  group wraps onto multiple lines (only visible with the 9-option Theme
  selector, not the shorter Category/Yes-No groups). Fixed in
  `css/style.css` under `.chip-grid`.
