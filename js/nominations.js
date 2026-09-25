// Award nominations dashboard — the award-specific workflow. There's
// no screening step for awards: nominations go straight to review.
//   1. Review nominations (reviewer AND admin, self-selected): eligible
//      yes/no + shortlist yes/no + notes. Shortlist is stored in the
//      shared reviews.verdict column as accept/reject; eligibility in
//      reviews.eligible (see 0005_award_review_process.sql).
//   2. Shortlist & winners (admin): per-category board with combined
//      answers, recording pending/not_shortlisted/shortlisted/winner via
//      record_decision(). Joint winners are allowed.
import { supabase } from "./supabaseClient.js";
import { requireRole } from "./auth.js";
import { renderDashNav } from "./nav.js";
import { el, addOption, setStatus, buildField, buildToggle } from "./dash-util.js";
import { NOMINATION_CATEGORIES } from "./award-validation.js";

var OUTCOME_LABELS = {
  pending: "Not yet decided",
  not_shortlisted: "Not shortlisted",
  shortlisted: "Shortlisted",
  winner: "Winner"
};

function yesNo(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "—";
}

function nomineeLine(s) {
  return s.nominee_job_title + ", " + s.nominee_workplace + (s.nominee_specialty ? " — " + s.nominee_specialty : "");
}

// Two-button Yes/No picker. get() returns true, false, or null (unanswered).
function buildYesNo(label, initial) {
  var value = initial === true || initial === false ? initial : null;
  var wrap = el("div", "yn-field");
  wrap.appendChild(el("span", "yn-label", label));
  var group = el("div", "yn-group");
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", label);
  var buttons = [];
  [[true, "Yes"], [false, "No"]].forEach(function (opt) {
    var btn = el("button", "yn-btn", opt[1]);
    btn.type = "button";
    btn.dataset.yes = String(opt[0]);
    btn.addEventListener("click", function () {
      value = opt[0];
      sync();
    });
    buttons.push(btn);
    group.appendChild(btn);
  });
  function sync() {
    buttons.forEach(function (b) {
      var on = b.dataset.yes === String(value);
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  sync();
  wrap.appendChild(group);
  return { node: wrap, get: function () { return value; } };
}

(async function () {
  var profile = await requireRole();
  if (!profile) return;
  var isAdmin = profile.role === "admin";

  renderDashNav(profile, "awards");

  // ==========================================================
  // 1. Review nominations (reviewers and admins)
  // ==========================================================
  var reviewList = document.getElementById("reviewList");
  var reviewCategoryFilter = document.getElementById("reviewCategoryFilter");
  var reviewMineFilter = document.getElementById("reviewMineFilter");
  var reviewCount = document.getElementById("reviewCount");
  var reviewRows = [];

  NOMINATION_CATEGORIES.forEach(function (c) { addOption(reviewCategoryFilter, c); });

  function buildReviewCard(s) {
    var card = el("div", "sub-card" + (s.my_verdict ? " reviewed-mine" : ""));

    var head = el("div", "sub-card-head");
    head.appendChild(el("h3", null, s.nominee_name));
    head.appendChild(el("span", "sub-tag", s.nomination_category));
    var mineTag = el("span", "sub-tag sub-tag-done", "Reviewed by you");
    mineTag.hidden = !s.my_verdict;
    head.appendChild(mineTag);
    card.appendChild(head);

    card.appendChild(el("p", "sub-meta", nomineeLine(s) + " — nominated by " + s.your_name + " (" + s.your_email + ")"));

    var toggle = buildToggle("justification");
    toggle[1].appendChild(buildField("Justification", s.justification));
    card.appendChild(toggle[0]);
    card.appendChild(toggle[1]);

    var form = el("div", "award-review-form");
    var answers = el("div", "yn-row");
    var eligible = buildYesNo("Eligible?", s.my_eligible);
    var shortlist = buildYesNo("Shortlist?", s.my_verdict ? s.my_verdict === "accept" : null);
    answers.appendChild(eligible.node);
    answers.appendChild(shortlist.node);
    form.appendChild(answers);

    var actions = el("div", "sub-actions");
    var notes = document.createElement("textarea");
    notes.placeholder = "Notes — why is this nominee eligible (or not), and why should they be shortlisted (or not)?";
    notes.value = s.my_comment || "";
    actions.appendChild(notes);
    var saveBtn = el("button", "btn-small", s.my_verdict ? "Update review" : "Save review");
    saveBtn.type = "button";
    var statusMsg = el("span", "dash-status-msg");
    actions.appendChild(saveBtn);
    actions.appendChild(statusMsg);
    form.appendChild(actions);
    card.appendChild(form);

    saveBtn.addEventListener("click", async function () {
      setStatus(statusMsg, "");
      if (eligible.get() === null || shortlist.get() === null) {
        setStatus(statusMsg, "Answer both questions first.", "error");
        return;
      }
      if (!notes.value.trim()) {
        setStatus(statusMsg, "Add a note first.", "error");
        return;
      }

      saveBtn.disabled = true;
      var result = await supabase.from("reviews").upsert({
        submission_id: s.id,
        reviewer_id: profile.id,
        eligible: eligible.get(),
        verdict: shortlist.get() ? "accept" : "reject",
        comment: notes.value.trim()
      }, { onConflict: "submission_id,reviewer_id" });
      saveBtn.disabled = false;

      if (result.error) {
        setStatus(statusMsg, "Could not save your review. Try again.", "error");
        return;
      }
      s.my_eligible = eligible.get();
      s.my_verdict = shortlist.get() ? "accept" : "reject";
      s.my_comment = notes.value.trim();
      saveBtn.textContent = "Update review";
      mineTag.hidden = false;
      card.classList.add("reviewed-mine");
      setStatus(statusMsg, "Saved.", "success");
      updateReviewCount();
      if (isAdmin) loadShortlist();
    });

    return card;
  }

  function updateReviewCount() {
    var done = reviewRows.filter(function (s) { return s.my_verdict; }).length;
    reviewCount.textContent = reviewRows.length + " nomination" + (reviewRows.length === 1 ? "" : "s") +
      " · " + done + " reviewed by you";
  }

  function renderReview() {
    var cat = reviewCategoryFilter.value;
    var mine = reviewMineFilter.value;
    var rows = reviewRows.filter(function (s) {
      if (cat && s.nomination_category !== cat) return false;
      if (mine === "todo" && s.my_verdict) return false;
      if (mine === "done" && !s.my_verdict) return false;
      return true;
    });

    reviewList.textContent = "";
    if (rows.length === 0) {
      reviewList.appendChild(el("p", "dash-empty", reviewRows.length === 0
        ? "No nominations to review yet."
        : "No nominations match this filter."));
      return;
    }
    rows.forEach(function (s) { reviewList.appendChild(buildReviewCard(s)); });
  }

  async function loadReview() {
    var result = await supabase.from("award_submissions_for_review").select("*")
      .order("created_at", { ascending: true });
    if (result.error) {
      reviewList.textContent = "";
      reviewList.appendChild(el("p", "dash-empty", "Could not load nominations."));
      return;
    }
    reviewRows = result.data;
    updateReviewCount();
    renderReview();
  }
  reviewCategoryFilter.addEventListener("change", renderReview);
  reviewMineFilter.addEventListener("change", renderReview);

  // ==========================================================
  // 2. Shortlist & winners (admin only)
  // ==========================================================
  var shortlistSection = document.getElementById("shortlistSection");
  var shortlistList = document.getElementById("shortlistList");
  var shortlistCategoryFilter = document.getElementById("shortlistCategoryFilter");
  var shortlistOutcomeFilter = document.getElementById("shortlistOutcomeFilter");
  var shortlistRows = [];

  NOMINATION_CATEGORIES.forEach(function (c) { addOption(shortlistCategoryFilter, c); });

  function categorySummary(rows) {
    var count = function (outcomes) {
      return rows.filter(function (s) { return outcomes.indexOf(s.final_outcome) !== -1; }).length;
    };
    var winners = count(["winner"]);
    return rows.length + " nomination" + (rows.length === 1 ? "" : "s") +
      " · " + count(["shortlisted", "winner"]) + " on shortlist" +
      " · " + winners + " winner" + (winners === 1 ? "" : "s") +
      " · " + count(["pending"]) + " not yet decided";
  }

  function buildReviewsPanel(submissionId) {
    var panel = el("div", "sub-body", "Loading reviews…");
    supabase
      .from("reviews")
      .select("verdict, eligible, comment, reviewer:profiles(full_name, email)")
      .eq("submission_id", submissionId)
      .order("created_at", { ascending: true })
      .then(function (result) {
        panel.textContent = "";
        if (result.error) {
          panel.appendChild(el("p", null, "Could not load reviews."));
          return;
        }
        if (result.data.length === 0) {
          panel.appendChild(el("p", null, "No reviews yet."));
          return;
        }
        result.data.forEach(function (r) {
          var who = r.reviewer ? r.reviewer.full_name : "Unknown reviewer";
          panel.appendChild(el("h4", null, who + " — eligible: " + yesNo(r.eligible) +
            ", shortlist: " + (r.verdict === "accept" ? "Yes" : "No")));
          panel.appendChild(el("p", null, r.comment));
        });
      });
    return panel;
  }

  function buildTally(s) {
    var tally = el("div", "verdict-tally award-tally");
    var elig = el("span", null, "Eligible: ");
    elig.appendChild(el("span", "tick", "✓ " + (s.eligible_yes_count || 0)));
    elig.appendChild(document.createTextNode(" "));
    elig.appendChild(el("span", "cross", "✗ " + (s.eligible_no_count || 0)));
    tally.appendChild(elig);
    var sl = el("span", null, "Shortlist: ");
    sl.appendChild(el("span", "tick", "✓ " + (s.tick_count || 0)));
    sl.appendChild(document.createTextNode(" "));
    sl.appendChild(el("span", "cross", "✗ " + (s.cross_count || 0)));
    tally.appendChild(sl);
    var n = s.review_count || 0;
    tally.appendChild(el("span", "tally-count", n + " review" + (n === 1 ? "" : "s")));
    return tally;
  }

  function buildShortlistCard(s, onDecided) {
    var card = el("div", "sub-card outcome-" + s.final_outcome);

    var head = el("div", "sub-card-head");
    head.appendChild(el("h3", null, s.nominee_name));
    var outcomeTag = el("span", "sub-tag outcome-tag-" + s.final_outcome, OUTCOME_LABELS[s.final_outcome]);
    head.appendChild(outcomeTag);
    card.appendChild(head);

    card.appendChild(el("p", "sub-meta", nomineeLine(s) + " — nominated by " + s.your_name));
    card.appendChild(buildTally(s));

    var justToggle = buildToggle("justification");
    justToggle[1].appendChild(buildField("Justification", s.justification));

    var reviewsToggle = el("button", "sub-body-toggle", "Show reviews");
    reviewsToggle.type = "button";
    var reviewsPanel = null;
    reviewsToggle.addEventListener("click", function () {
      if (!reviewsPanel) {
        reviewsPanel = buildReviewsPanel(s.id);
        reviewsPanel.hidden = true;
        toggles.after(reviewsPanel);
      }
      reviewsPanel.hidden = !reviewsPanel.hidden;
      reviewsToggle.textContent = reviewsPanel.hidden ? "Show reviews" : "Hide reviews";
    });

    var toggles = el("div", "sub-toggles");
    toggles.appendChild(justToggle[0]);
    toggles.appendChild(reviewsToggle);
    card.appendChild(toggles);
    card.appendChild(justToggle[1]);

    var actions = el("div", "sub-actions");
    var outcomeSelect = document.createElement("select");
    ["pending", "not_shortlisted", "shortlisted", "winner"].forEach(function (k) {
      addOption(outcomeSelect, k, OUTCOME_LABELS[k]);
    });
    outcomeSelect.value = s.final_outcome;
    actions.appendChild(outcomeSelect);
    var saveBtn = el("button", "btn-small", "Save decision");
    saveBtn.type = "button";
    var statusMsg = el("span", "dash-status-msg");
    actions.appendChild(saveBtn);
    actions.appendChild(statusMsg);
    card.appendChild(actions);

    saveBtn.addEventListener("click", async function () {
      saveBtn.disabled = true;
      var result = await supabase.rpc("record_decision", {
        p_submission_id: s.id,
        p_outcome: outcomeSelect.value,
        p_format: null
      });
      saveBtn.disabled = false;
      if (result.error) {
        setStatus(statusMsg, "Could not save. Try again.", "error");
        return;
      }
      s.final_outcome = outcomeSelect.value;
      card.className = "sub-card outcome-" + s.final_outcome;
      outcomeTag.className = "sub-tag outcome-tag-" + s.final_outcome;
      outcomeTag.textContent = OUTCOME_LABELS[s.final_outcome];
      setStatus(statusMsg, "Saved.", "success");
      onDecided();
    });

    return card;
  }

  // Most shortlist "yes" answers first, then most "eligible" answers,
  // then most reviewed; nominations nobody has reviewed sink to the
  // bottom of their category.
  function shortlistOrder(a, b) {
    return (b.tick_count || 0) - (a.tick_count || 0) ||
      (b.eligible_yes_count || 0) - (a.eligible_yes_count || 0) ||
      (b.review_count || 0) - (a.review_count || 0) ||
      new Date(a.created_at) - new Date(b.created_at);
  }

  function renderShortlist() {
    var catFilter = shortlistCategoryFilter.value;
    var outcomeFilter = shortlistOutcomeFilter.value;

    shortlistList.textContent = "";
    if (shortlistRows.length === 0) {
      shortlistList.appendChild(el("p", "dash-empty", "No nominations yet."));
      return;
    }

    var shownAny = false;
    NOMINATION_CATEGORIES.forEach(function (cat) {
      if (catFilter && cat !== catFilter) return;
      var inCat = shortlistRows.filter(function (s) { return s.nomination_category === cat; });
      var shown = inCat.filter(function (s) { return !outcomeFilter || s.final_outcome === outcomeFilter; });
      if (shown.length === 0 && !catFilter) return;

      var group = el("div", "cat-group");
      var groupHead = el("div", "cat-group-head");
      groupHead.appendChild(el("h3", null, cat));
      var summary = el("span", "sub-meta", categorySummary(inCat));
      groupHead.appendChild(summary);
      group.appendChild(groupHead);

      if (shown.length === 0) {
        group.appendChild(el("p", "dash-empty", "No nominations match this filter."));
      }
      shown.sort(shortlistOrder).forEach(function (s) {
        group.appendChild(buildShortlistCard(s, function () {
          summary.textContent = categorySummary(inCat);
        }));
      });
      shortlistList.appendChild(group);
      shownAny = true;
    });

    if (!shownAny) shortlistList.appendChild(el("p", "dash-empty", "No nominations match this filter."));
  }

  async function loadShortlist() {
    var result = await supabase.from("award_submissions_with_review_summary").select("*");
    if (result.error) {
      shortlistList.textContent = "";
      shortlistList.appendChild(el("p", "dash-empty", "Could not load nominations."));
      return;
    }
    shortlistRows = result.data;
    renderShortlist();
  }
  shortlistCategoryFilter.addEventListener("change", renderShortlist);
  shortlistOutcomeFilter.addEventListener("change", renderShortlist);

  // ==========================================================
  if (isAdmin) {
    shortlistSection.hidden = false;
    document.getElementById("reviewStepNum").hidden = false;
    // Reviewers only ever see section 1; the shortlist loader never runs
    // for them (and RLS would give them zero rows anyway).
    await Promise.all([loadReview(), loadShortlist()]);
  } else {
    await loadReview();
  }
})();
