import { supabase } from "./supabaseClient.js";
import { requireRole, signOut } from "./auth.js";
import { CATEGORIES, THEMES } from "./abstract-validation.js";
import { NOMINATION_CATEGORIES } from "./award-validation.js";

var ABSTRACT_BODY_FIELDS = [
  ["Background", "background"],
  ["Aim(s)/Objectives", "aims"],
  ["Methods", "methods"],
  ["Results", "results"],
  ["Conclusions/Implications for practice", "conclusions"]
];
var FORMAT_LABELS = {
  digital_poster: "Digital poster",
  moderated_poster: "Moderated poster discussion",
  oral_10min: "10-minute oral"
};
var TYPE_LABELS = { abstract: "Abstract", award: "Award" };

function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function addOption(select, value, label) {
  var opt = document.createElement("option");
  opt.value = value;
  opt.textContent = label !== undefined ? label : value;
  select.appendChild(opt);
}

function setStatus(node, msg, kind) {
  node.textContent = msg;
  node.className = "dash-status-msg" + (kind ? " " + kind : "");
}

function buildField(label, value) {
  var frag = document.createDocumentFragment();
  frag.appendChild(el("h4", null, label));
  frag.appendChild(el("p", null, value));
  return frag;
}

(async function () {
  var profile = await requireRole("admin");
  if (!profile) return;

  document.getElementById("signOutBtn").addEventListener("click", signOut);

  // ==========================================================
  // Screening queue — shared across every submission type. Two
  // parallel embedded queries (one per type, using the FK relationship
  // to abstract_details/award_details, the same PostgREST embedding
  // mechanism already used below for reviewer:profiles(...)), merged
  // and sorted client-side. Adding a third type later means adding a
  // third parallel query here, not a schema/query redesign.
  // ==========================================================
  var screeningList = document.getElementById("screeningList");
  var screeningStatusFilter = document.getElementById("screeningStatusFilter");

  function buildScreeningActions(s, card, statusMsgExtra) {
    var actions = el("div", "sub-actions");
    var notes = document.createElement("textarea");
    notes.placeholder = "Screening notes (e.g. reason for failing)…";
    actions.appendChild(notes);

    var passBtn = el("button", "btn-small", "Pass");
    passBtn.type = "button";
    var failBtn = el("button", "btn-outline", "Fail");
    failBtn.type = "button";
    var statusMsg = el("span", "dash-status-msg");

    function doScreen(status) {
      return async function () {
        passBtn.disabled = true;
        failBtn.disabled = true;
        var result = await supabase.rpc("screen_submission", {
          p_submission_id: s.id,
          p_status: status,
          p_notes: notes.value.trim() || null
        });
        passBtn.disabled = false;
        failBtn.disabled = false;
        if (result.error) {
          setStatus(statusMsg, "Could not save. Try again.", "error");
          return;
        }
        s.screening_status = status;
        setStatus(statusMsg, "Saved as " + status + ".", "success");
        loadScreening();
      };
    }
    passBtn.addEventListener("click", doScreen("passed"));
    failBtn.addEventListener("click", doScreen("failed"));

    actions.appendChild(passBtn);
    actions.appendChild(failBtn);
    actions.appendChild(statusMsg);
    card.appendChild(actions);
  }

  function buildAbstractScreeningCard(s) {
    var d = s.abstract_details;
    var card = el("div", "sub-card screened-" + s.screening_status);

    var head = el("div", "sub-card-head");
    head.appendChild(el("h3", null, d.abstract_title));
    head.appendChild(el("span", "sub-tag", TYPE_LABELS.abstract));
    head.appendChild(el("span", "sub-tag", d.category));
    head.appendChild(el("span", "sub-tag", d.theme === "Other" && d.other_theme ? d.other_theme + " (Other)" : d.theme));
    card.appendChild(head);

    var wordsOver = d.body_word_count > 400;
    var meta = el("span", "sub-meta",
      "Presenter: " + d.presenter_name + " (" + d.presenter_workplace + ") — " +
      "Body word count: " + d.body_word_count + "/400" + (wordsOver ? " (OVER LIMIT)" : "") +
      " — Submitted " + new Date(s.created_at).toLocaleDateString("en-GB"));
    if (wordsOver) meta.style.color = "var(--danger)";
    card.appendChild(meta);

    var toggleBtn = el("button", "sub-body-toggle", "Show full submission");
    toggleBtn.type = "button";
    var body = el("div", "sub-body");
    body.hidden = true;
    body.appendChild(buildField("Your name / email", d.your_name + " — " + d.your_email));
    body.appendChild(buildField("Presenter", d.presenter_name + ", " + d.presenter_job_title + ", " + d.presenter_workplace));
    body.appendChild(buildField("Presenter contact", d.presenter_email + " — " + d.presenter_phone));
    body.appendChild(buildField("Co-authors", d.co_authors));
    body.appendChild(buildField("Previously submitted (1st author) / any", (d.prev_first_author ? "Yes" : "No") + " / " + (d.prev_any ? "Yes" : "No")));
    ABSTRACT_BODY_FIELDS.forEach(function (pair) {
      body.appendChild(buildField(pair[0], d[pair[1]]));
    });
    body.appendChild(buildField("Approval details", d.approval_details));
    body.appendChild(buildField("References", d.reference_list));
    toggleBtn.addEventListener("click", function () {
      body.hidden = !body.hidden;
      toggleBtn.textContent = body.hidden ? "Show full submission" : "Hide full submission";
    });
    card.appendChild(toggleBtn);
    card.appendChild(body);

    buildScreeningActions(s, card);
    return card;
  }

  function buildAwardScreeningCard(s) {
    var d = s.award_details;
    var card = el("div", "sub-card screened-" + s.screening_status);

    var wordsOver = d.justification_word_count > 500;

    var head = el("div", "sub-card-head");
    head.appendChild(el("h3", null, "Nomination: " + d.nominee_name));
    head.appendChild(el("span", "sub-tag", TYPE_LABELS.award));
    head.appendChild(el("span", "sub-tag", d.nomination_category));
    card.appendChild(head);

    var meta = el("span", "sub-meta",
      "Nominated by: " + d.your_name + " (" + d.your_email + ") — " +
      "Justification word count: " + d.justification_word_count + "/500" + (wordsOver ? " (OVER LIMIT)" : "") +
      " — Submitted " + new Date(s.created_at).toLocaleDateString("en-GB"));
    if (wordsOver) meta.style.color = "var(--danger)";
    card.appendChild(meta);

    var toggleBtn = el("button", "sub-body-toggle", "Show full submission");
    toggleBtn.type = "button";
    var body = el("div", "sub-body");
    body.hidden = true;
    body.appendChild(buildField("Nominee", d.nominee_name + ", " + d.nominee_job_title + ", " + d.nominee_workplace));
    body.appendChild(buildField("Nominee email", d.nominee_email));
    body.appendChild(buildField("Nominee specialty", d.nominee_specialty || "—"));
    body.appendChild(buildField("Justification", d.justification));
    toggleBtn.addEventListener("click", function () {
      body.hidden = !body.hidden;
      toggleBtn.textContent = body.hidden ? "Show full submission" : "Hide full submission";
    });
    card.appendChild(toggleBtn);
    card.appendChild(body);

    buildScreeningActions(s, card);
    return card;
  }

  async function fetchScreeningRows(statusFilter) {
    var abstractQuery = supabase.from("submissions").select("*, abstract_details(*)").eq("submission_type", "abstract");
    var awardQuery = supabase.from("submissions").select("*, award_details(*)").eq("submission_type", "award");
    if (statusFilter) {
      abstractQuery = abstractQuery.eq("screening_status", statusFilter);
      awardQuery = awardQuery.eq("screening_status", statusFilter);
    }
    var results = await Promise.all([abstractQuery, awardQuery]);
    if (results[0].error) return { error: results[0].error };
    if (results[1].error) return { error: results[1].error };
    var rows = results[0].data.concat(results[1].data);
    rows.sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); });
    return { data: rows };
  }

  async function loadScreening() {
    var result = await fetchScreeningRows(screeningStatusFilter.value);

    screeningList.textContent = "";
    if (result.error) {
      screeningList.appendChild(el("p", "dash-empty", "Could not load submissions."));
      return;
    }
    if (result.data.length === 0) {
      screeningList.appendChild(el("p", "dash-empty", "Nothing here."));
      return;
    }
    result.data.forEach(function (s) {
      screeningList.appendChild(s.submission_type === "abstract" ? buildAbstractScreeningCard(s) : buildAwardScreeningCard(s));
    });
  }
  screeningStatusFilter.addEventListener("change", loadScreening);

  // ==========================================================
  // Programme
  // ==========================================================
  var progTypeFilter = document.getElementById("progTypeFilter");
  var progCategoryFilter = document.getElementById("progCategoryFilter");
  var progThemeFilter = document.getElementById("progThemeFilter");
  var progAwardCategoryFilter = document.getElementById("progAwardCategoryFilter");
  var progSort = document.getElementById("progSort");
  var programmeList = document.getElementById("programmeList");

  CATEGORIES.forEach(function (c) { addOption(progCategoryFilter, c); });
  THEMES.forEach(function (t) { addOption(progThemeFilter, t); });
  NOMINATION_CATEGORIES.forEach(function (c) { addOption(progAwardCategoryFilter, c); });

  function refreshProgFilterVisibility() {
    var type = progTypeFilter.value;
    progCategoryFilter.hidden = type !== "abstract";
    progThemeFilter.hidden = type !== "abstract";
    progAwardCategoryFilter.hidden = type !== "award";
  }
  refreshProgFilterVisibility();

  function buildReviewsPanel(submissionId) {
    var panel = el("div", "sub-body");
    panel.textContent = "Loading reviews…";
    supabase
      .from("reviews")
      .select("verdict, comment, created_at, reviewer:profiles(full_name, email)")
      .eq("submission_id", submissionId)
      .then(function (result) {
        panel.textContent = "";
        if (result.error || result.data.length === 0) {
          panel.appendChild(el("p", null, "No reviews yet."));
          return;
        }
        result.data.forEach(function (r) {
          var reviewerName = r.reviewer ? r.reviewer.full_name + " (" + r.reviewer.email + ")" : "Unknown reviewer";
          panel.appendChild(el("h4", null, reviewerName + " — " + r.verdict));
          panel.appendChild(el("p", null, r.comment));
        });
      });
    return panel;
  }

  function buildVerdictTally(s) {
    var tally = el("div", "verdict-tally");
    tally.appendChild(el("span", "tick", "✓ " + (s.tick_count || 0)));
    tally.appendChild(el("span", "maybe", "? " + (s.maybe_count || 0)));
    tally.appendChild(el("span", "cross", "✗ " + (s.cross_count || 0)));
    tally.appendChild(el("span", null, "Score: " + (s.review_score === null || s.review_score === undefined ? "—" : s.review_score) +
      " (" + (s.review_count || 0) + " review" + (s.review_count === 1 ? "" : "s") + ")"));
    return tally;
  }

  // Rows come flat off abstract_submissions_with_review_summary /
  // award_submissions_with_review_summary (a plain SELECT with real
  // joins, not PostgREST embedding — see the migration's comment on
  // why), so s.category/s.abstract_title/etc are directly on the row
  // here, unlike the screening queue's s.abstract_details.X shape.
  function buildProgrammeCard(s) {
    var isAbstract = s.submission_type === "abstract";
    var card = el("div", "sub-card outcome-" + s.final_outcome);

    var head = el("div", "sub-card-head");
    head.appendChild(el("h3", null, isAbstract ? s.abstract_title : "Nomination: " + s.nominee_name));
    head.appendChild(el("span", "sub-tag", TYPE_LABELS[s.submission_type]));
    if (isAbstract) {
      head.appendChild(el("span", "sub-tag", s.category));
      head.appendChild(el("span", "sub-tag", s.theme === "Other" && s.other_theme ? s.other_theme + " (Other)" : s.theme));
    } else {
      head.appendChild(el("span", "sub-tag", s.nomination_category));
    }
    card.appendChild(head);

    card.appendChild(el("p", "sub-meta",
      isAbstract
        ? "Presenter: " + s.presenter_name + " (" + s.presenter_workplace + ")"
        : "Nominee: " + s.nominee_name + " (" + s.nominee_workplace + ") — nominated by " + s.your_name));

    card.appendChild(buildVerdictTally(s));

    var reviewsToggle = el("button", "sub-body-toggle", "Show reviews");
    reviewsToggle.type = "button";
    var reviewsPanel = null;
    reviewsToggle.addEventListener("click", function () {
      if (!reviewsPanel) {
        reviewsPanel = buildReviewsPanel(s.id);
        card.insertBefore(reviewsPanel, reviewsToggle.nextSibling);
      }
      reviewsPanel.hidden = !reviewsPanel.hidden;
      reviewsToggle.textContent = reviewsPanel.hidden ? "Show reviews" : "Hide reviews";
    });
    card.appendChild(reviewsToggle);

    var actions = el("div", "sub-actions");

    var outcomeSelect = document.createElement("select");
    addOption(outcomeSelect, "pending", "Pending");
    addOption(outcomeSelect, "accepted", "Accepted");
    addOption(outcomeSelect, "rejected", "Rejected");
    outcomeSelect.value = s.final_outcome;
    actions.appendChild(outcomeSelect);

    var formatSelect = null;
    if (isAbstract) {
      formatSelect = document.createElement("select");
      addOption(formatSelect, "", "— choose format —");
      Object.keys(FORMAT_LABELS).forEach(function (key) {
        addOption(formatSelect, key, FORMAT_LABELS[key]);
      });
      formatSelect.value = s.presentation_format || "";
      formatSelect.disabled = outcomeSelect.value !== "accepted";
      outcomeSelect.addEventListener("change", function () {
        formatSelect.disabled = outcomeSelect.value !== "accepted";
        if (formatSelect.disabled) formatSelect.value = "";
      });
      actions.appendChild(formatSelect);
    }

    var saveBtn = el("button", "btn-small", "Save decision");
    saveBtn.type = "button";
    var statusMsg = el("span", "dash-status-msg");

    saveBtn.addEventListener("click", async function () {
      saveBtn.disabled = true;
      var result = await supabase.rpc("record_decision", {
        p_submission_id: s.id,
        p_outcome: outcomeSelect.value,
        p_format: isAbstract && outcomeSelect.value === "accepted" ? (formatSelect.value || null) : null
      });
      saveBtn.disabled = false;
      if (result.error) {
        setStatus(statusMsg, "Could not save. Try again.", "error");
        return;
      }
      s.final_outcome = outcomeSelect.value;
      if (isAbstract) s.presentation_format = formatSelect.value || null;
      card.className = "sub-card outcome-" + s.final_outcome;
      setStatus(statusMsg, "Saved.", "success");
    });

    actions.appendChild(saveBtn);
    actions.appendChild(statusMsg);
    card.appendChild(actions);

    return card;
  }

  function progSortComparator(sortValue) {
    return function (a, b) {
      if (sortValue === "created_asc") {
        return new Date(a.created_at) - new Date(b.created_at);
      }
      var aScore = a.review_score === null || a.review_score === undefined ? null : a.review_score;
      var bScore = b.review_score === null || b.review_score === undefined ? null : b.review_score;
      if (sortValue === "score_asc") {
        if (aScore === null && bScore === null) return 0;
        if (aScore === null) return -1; // nulls first when sorting ascending
        if (bScore === null) return 1;
        return aScore - bScore;
      }
      // score_desc (default): nulls last, tie-break on review_count
      if (aScore === null && bScore === null) return 0;
      if (aScore === null) return 1;
      if (bScore === null) return -1;
      var diff = bScore - aScore;
      if (diff !== 0) return diff;
      return (b.review_count || 0) - (a.review_count || 0);
    };
  }

  async function loadProgramme() {
    var type = progTypeFilter.value;
    var queries = [];

    if (!type || type === "abstract") {
      var abstractQuery = supabase.from("abstract_submissions_with_review_summary").select("*").eq("screening_status", "passed");
      if (type === "abstract") {
        if (progCategoryFilter.value) abstractQuery = abstractQuery.eq("category", progCategoryFilter.value);
        if (progThemeFilter.value) abstractQuery = abstractQuery.eq("theme", progThemeFilter.value);
      }
      queries.push(abstractQuery);
    }
    if (!type || type === "award") {
      var awardQuery = supabase.from("award_submissions_with_review_summary").select("*").eq("screening_status", "passed");
      if (type === "award" && progAwardCategoryFilter.value) {
        awardQuery = awardQuery.eq("nomination_category", progAwardCategoryFilter.value);
      }
      queries.push(awardQuery);
    }

    var results = await Promise.all(queries);
    var errored = results.find(function (r) { return r.error; });

    programmeList.textContent = "";
    if (errored) {
      programmeList.appendChild(el("p", "dash-empty", "Could not load submissions."));
      return;
    }

    var rows = [];
    results.forEach(function (r) { rows = rows.concat(r.data); });
    rows.sort(progSortComparator(progSort.value));

    if (rows.length === 0) {
      programmeList.appendChild(el("p", "dash-empty", "Nothing here — submissions appear once screening has passed them."));
      return;
    }
    rows.forEach(function (s) {
      programmeList.appendChild(buildProgrammeCard(s));
    });
  }
  progTypeFilter.addEventListener("change", function () {
    refreshProgFilterVisibility();
    loadProgramme();
  });
  progCategoryFilter.addEventListener("change", loadProgramme);
  progThemeFilter.addEventListener("change", loadProgramme);
  progAwardCategoryFilter.addEventListener("change", loadProgramme);
  progSort.addEventListener("change", loadProgramme);

  // ==========================================================
  // Invite user
  // ==========================================================
  var inviteEmail = document.getElementById("inviteEmail");
  var inviteName = document.getElementById("inviteName");
  var inviteRole = document.getElementById("inviteRole");
  var inviteBtn = document.getElementById("inviteBtn");
  var inviteStatus = document.getElementById("inviteStatus");

  inviteBtn.addEventListener("click", async function () {
    var email = inviteEmail.value.trim();
    var fullName = inviteName.value.trim();
    var role = inviteRole.value;
    if (!email || !fullName) {
      setStatus(inviteStatus, "Enter an email and a full name.", "error");
      return;
    }

    inviteBtn.disabled = true;
    var sessionResult = await supabase.auth.getSession();
    var token = sessionResult.data.session.access_token;

    var response = await fetch("/api/invite-user", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ email: email, full_name: fullName, role: role })
    });
    inviteBtn.disabled = false;

    if (!response.ok) {
      setStatus(inviteStatus, "Could not send invite. Check the details and try again.", "error");
      return;
    }

    setStatus(inviteStatus, "Invite sent to " + email + ".", "success");
    inviteEmail.value = "";
    inviteName.value = "";
  });

  await loadScreening();
  await loadProgramme();
})();
