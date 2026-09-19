import { supabase } from "./supabaseClient.js";
import { requireRole, signOut } from "./auth.js";
import { CATEGORIES, THEMES } from "./validation.js";

var BODY_FIELDS = [
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

(async function () {
  var profile = await requireRole("admin");
  if (!profile) return;

  document.getElementById("signOutBtn").addEventListener("click", signOut);

  // ==========================================================
  // Screening queue
  // ==========================================================
  var screeningList = document.getElementById("screeningList");
  var screeningStatusFilter = document.getElementById("screeningStatusFilter");

  function buildScreeningCard(s) {
    var card = el("div", "sub-card screened-" + s.screening_status);

    var head = el("div", "sub-card-head");
    head.appendChild(el("h3", null, s.abstract_title));
    head.appendChild(el("span", "sub-tag", s.category));
    head.appendChild(el("span", "sub-tag", s.theme === "Other" && s.other_theme ? s.other_theme + " (Other)" : s.theme));
    card.appendChild(head);

    var wordsOver = s.body_word_count > 400;
    var meta = el("span", "sub-meta",
      "Presenter: " + s.presenter_name + " (" + s.presenter_workplace + ") — " +
      "Body word count: " + s.body_word_count + "/400" + (wordsOver ? " (OVER LIMIT)" : "") +
      " — Submitted " + new Date(s.created_at).toLocaleDateString("en-GB"));
    if (wordsOver) meta.style.color = "var(--danger)";
    card.appendChild(meta);

    var toggleBtn = el("button", "sub-body-toggle", "Show full submission");
    toggleBtn.type = "button";
    var body = el("div", "sub-body");
    body.hidden = true;

    body.appendChild(buildField("Your name / email", s.your_name + " — " + s.your_email));
    body.appendChild(buildField("Presenter", s.presenter_name + ", " + s.presenter_job_title + ", " + s.presenter_workplace));
    body.appendChild(buildField("Presenter contact", s.presenter_email + " — " + s.presenter_phone));
    body.appendChild(buildField("Co-authors", s.co_authors));
    body.appendChild(buildField("Previously submitted (1st author) / any", (s.prev_first_author ? "Yes" : "No") + " / " + (s.prev_any ? "Yes" : "No")));
    BODY_FIELDS.forEach(function (pair) {
      body.appendChild(buildField(pair[0], s[pair[1]]));
    });
    body.appendChild(buildField("Approval details", s.approval_details));
    body.appendChild(buildField("References", s.reference_list));

    toggleBtn.addEventListener("click", function () {
      body.hidden = !body.hidden;
      toggleBtn.textContent = body.hidden ? "Show full submission" : "Hide full submission";
    });
    card.appendChild(toggleBtn);
    card.appendChild(body);

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

    return card;
  }

  function buildField(label, value) {
    var frag = document.createDocumentFragment();
    frag.appendChild(el("h4", null, label));
    frag.appendChild(el("p", null, value));
    return frag;
  }

  async function loadScreening() {
    var query = supabase
      .from("submissions")
      .select("*")
      .order("created_at", { ascending: true });
    if (screeningStatusFilter.value) {
      query = query.eq("screening_status", screeningStatusFilter.value);
    }
    var result = await query;

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
      screeningList.appendChild(buildScreeningCard(s));
    });
  }
  screeningStatusFilter.addEventListener("change", loadScreening);

  // ==========================================================
  // Programme
  // ==========================================================
  var progCategoryFilter = document.getElementById("progCategoryFilter");
  var progThemeFilter = document.getElementById("progThemeFilter");
  var progSort = document.getElementById("progSort");
  var programmeList = document.getElementById("programmeList");

  CATEGORIES.forEach(function (c) { addOption(progCategoryFilter, c); });
  THEMES.forEach(function (t) { addOption(progThemeFilter, t); });

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

  function buildProgrammeCard(s) {
    var card = el("div", "sub-card outcome-" + s.final_outcome);

    var head = el("div", "sub-card-head");
    head.appendChild(el("h3", null, s.abstract_title));
    head.appendChild(el("span", "sub-tag", s.category));
    head.appendChild(el("span", "sub-tag", s.theme === "Other" && s.other_theme ? s.other_theme + " (Other)" : s.theme));
    card.appendChild(head);

    card.appendChild(el("p", "sub-meta", "Presenter: " + s.presenter_name + " (" + s.presenter_workplace + ")"));

    var tally = el("div", "verdict-tally");
    tally.appendChild(el("span", "tick", "✓ " + (s.tick_count || 0)));
    tally.appendChild(el("span", "maybe", "? " + (s.maybe_count || 0)));
    tally.appendChild(el("span", "cross", "✗ " + (s.cross_count || 0)));
    tally.appendChild(el("span", null, "Score: " + (s.review_score === null || s.review_score === undefined ? "—" : s.review_score) +
      " (" + (s.review_count || 0) + " review" + (s.review_count === 1 ? "" : "s") + ")"));
    card.appendChild(tally);

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

    var formatSelect = document.createElement("select");
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

    var saveBtn = el("button", "btn-small", "Save decision");
    saveBtn.type = "button";
    var statusMsg = el("span", "dash-status-msg");

    saveBtn.addEventListener("click", async function () {
      saveBtn.disabled = true;
      var result = await supabase
        .from("submissions")
        .update({
          final_outcome: outcomeSelect.value,
          presentation_format: outcomeSelect.value === "accepted" ? (formatSelect.value || null) : null,
          decided_by: profile.id,
          decided_at: new Date().toISOString()
        })
        .eq("id", s.id);
      saveBtn.disabled = false;
      if (result.error) {
        setStatus(statusMsg, "Could not save. Try again.", "error");
        return;
      }
      s.final_outcome = outcomeSelect.value;
      s.presentation_format = formatSelect.value || null;
      card.className = "sub-card outcome-" + s.final_outcome;
      setStatus(statusMsg, "Saved.", "success");
    });

    actions.appendChild(outcomeSelect);
    actions.appendChild(formatSelect);
    actions.appendChild(saveBtn);
    actions.appendChild(statusMsg);
    card.appendChild(actions);

    return card;
  }

  async function loadProgramme() {
    var query = supabase
      .from("submissions_with_review_summary")
      .select("*")
      .eq("screening_status", "passed");

    if (progCategoryFilter.value) query = query.eq("category", progCategoryFilter.value);
    if (progThemeFilter.value) query = query.eq("theme", progThemeFilter.value);

    if (progSort.value === "score_desc") {
      query = query.order("review_score", { ascending: false, nullsFirst: false })
                   .order("review_count", { ascending: false });
    } else if (progSort.value === "score_asc") {
      query = query.order("review_score", { ascending: true, nullsFirst: true });
    } else {
      query = query.order("created_at", { ascending: true });
    }

    var result = await query;

    programmeList.textContent = "";
    if (result.error) {
      programmeList.appendChild(el("p", "dash-empty", "Could not load submissions."));
      return;
    }
    if (result.data.length === 0) {
      programmeList.appendChild(el("p", "dash-empty", "Nothing here — submissions appear once screening has passed them."));
      return;
    }
    result.data.forEach(function (s) {
      programmeList.appendChild(buildProgrammeCard(s));
    });
  }
  progCategoryFilter.addEventListener("change", loadProgramme);
  progThemeFilter.addEventListener("change", loadProgramme);
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
