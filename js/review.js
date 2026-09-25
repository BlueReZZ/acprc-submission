import { supabase } from "./supabaseClient.js";
import { requireRole } from "./auth.js";
import { renderDashNav } from "./nav.js";
import { CATEGORIES, THEMES } from "./abstract-validation.js";

var ABSTRACT_BODY_FIELDS = [
  ["Background", "background"],
  ["Aim(s)/Objectives", "aims"],
  ["Methods", "methods"],
  ["Results", "results"],
  ["Conclusions/Implications for practice", "conclusions"],
  ["Approval details", "approval_details"],
  ["References", "reference_list"]
];
var ABSTRACT_VERDICTS = [["accept", "✓"], ["maybe", "?"], ["reject", "✗"]];

function addOption(select, value) {
  var opt = document.createElement("option");
  opt.value = value;
  opt.textContent = value;
  select.appendChild(opt);
}

function buildField(label, value) {
  var frag = document.createDocumentFragment();
  var h4 = document.createElement("h4");
  h4.textContent = label;
  var p = document.createElement("p");
  p.textContent = value;
  frag.appendChild(h4);
  frag.appendChild(p);
  return frag;
}

(async function () {
  var profile = await requireRole("reviewer");
  if (!profile) return;

  var categorySelect = document.getElementById("filterCategory");
  var themeSelect = document.getElementById("filterTheme");
  var listEl = document.getElementById("submissionList");

  renderDashNav(profile, "abstracts");

  CATEGORIES.forEach(function (c) { addOption(categorySelect, c); });
  THEMES.forEach(function (t) { addOption(themeSelect, t); });

  var allSubmissions = [];

  // Verdict buttons + comment + save row. Award nominations are
  // reviewed on /nominations/ instead (eligible + shortlist yes/no).
  function buildReviewActions(s, verdictOptions) {
    var actions = document.createElement("div");
    actions.className = "sub-actions";

    var verdictGroup = document.createElement("div");
    verdictGroup.className = "verdict-btn-group";
    var selectedVerdict = s.my_verdict || null;
    verdictOptions.forEach(function (v) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "verdict-btn";
      btn.dataset.verdict = v[0];
      btn.textContent = v[1];
      btn.title = v[0];
      if (v[0] === selectedVerdict) btn.classList.add("active");
      btn.addEventListener("click", function () {
        selectedVerdict = v[0];
        Array.prototype.forEach.call(verdictGroup.querySelectorAll(".verdict-btn"), function (b) {
          b.classList.remove("active");
        });
        btn.classList.add("active");
      });
      verdictGroup.appendChild(btn);
    });
    actions.appendChild(verdictGroup);

    var commentBox = document.createElement("textarea");
    commentBox.placeholder = "A paragraph or two of justification…";
    commentBox.value = s.my_comment || "";
    actions.appendChild(commentBox);

    var saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn-small";
    saveBtn.textContent = s.my_verdict ? "Update review" : "Save review";
    actions.appendChild(saveBtn);

    var statusMsg = document.createElement("span");
    statusMsg.className = "dash-status-msg";
    actions.appendChild(statusMsg);

    saveBtn.addEventListener("click", async function () {
      statusMsg.textContent = "";
      statusMsg.className = "dash-status-msg";

      if (!selectedVerdict) {
        statusMsg.textContent = "Choose a verdict first.";
        statusMsg.classList.add("error");
        return;
      }
      if (!commentBox.value.trim()) {
        statusMsg.textContent = "Add a comment first.";
        statusMsg.classList.add("error");
        return;
      }

      saveBtn.disabled = true;
      var result = await supabase.from("reviews").upsert({
        submission_id: s.id,
        reviewer_id: profile.id,
        verdict: selectedVerdict,
        comment: commentBox.value.trim()
      }, { onConflict: "submission_id,reviewer_id" });
      saveBtn.disabled = false;

      if (result.error) {
        statusMsg.textContent = "Could not save your review. Try again.";
        statusMsg.classList.add("error");
        return;
      }

      statusMsg.textContent = "Saved.";
      statusMsg.classList.add("success");
      saveBtn.textContent = "Update review";
      s.my_verdict = selectedVerdict;
      s.my_comment = commentBox.value.trim();
    });

    return actions;
  }

  function buildAlreadyReviewedNote(s) {
    if (!s.my_verdict) return null;
    var already = document.createElement("p");
    already.className = "sub-meta";
    already.textContent = "You've already reviewed this submission — you can update your review below.";
    return already;
  }

  function buildAbstractCard(s) {
    var card = document.createElement("div");
    card.className = "sub-card";

    var head = document.createElement("div");
    head.className = "sub-card-head";
    var h3 = document.createElement("h3");
    h3.textContent = s.abstract_title;
    head.appendChild(h3);
    var catTag = document.createElement("span");
    catTag.className = "sub-tag";
    catTag.textContent = s.category;
    head.appendChild(catTag);
    var themeTag = document.createElement("span");
    themeTag.className = "sub-tag";
    themeTag.textContent = s.theme === "Other" && s.other_theme ? s.other_theme + " (Other)" : s.theme;
    head.appendChild(themeTag);
    card.appendChild(head);

    var already = buildAlreadyReviewedNote(s);
    if (already) card.appendChild(already);

    var toggleBtn = document.createElement("button");
    toggleBtn.type = "button";
    toggleBtn.className = "sub-body-toggle";
    toggleBtn.textContent = "Show abstract";
    var body = document.createElement("div");
    body.className = "sub-body";
    body.hidden = true;
    ABSTRACT_BODY_FIELDS.forEach(function (pair) {
      body.appendChild(buildField(pair[0], s[pair[1]]));
    });
    toggleBtn.addEventListener("click", function () {
      body.hidden = !body.hidden;
      toggleBtn.textContent = body.hidden ? "Show abstract" : "Hide abstract";
    });
    card.appendChild(toggleBtn);
    card.appendChild(body);

    card.appendChild(buildReviewActions(s, ABSTRACT_VERDICTS));
    return card;
  }

  function render() {
    var cat = categorySelect.value;
    var theme = themeSelect.value;
    var filtered = allSubmissions.filter(function (s) {
      return (!cat || s.category === cat) && (!theme || s.theme === theme);
    });

    listEl.textContent = "";
    if (filtered.length === 0) {
      var empty = document.createElement("p");
      empty.className = "dash-empty";
      empty.textContent = "No submissions match this filter.";
      listEl.appendChild(empty);
      return;
    }
    filtered.forEach(function (s) {
      listEl.appendChild(buildAbstractCard(s));
    });
  }

  async function load() {
    var result = await supabase.from("abstract_submissions_for_review").select("*").order("created_at", { ascending: true });

    if (result.error) {
      listEl.textContent = "";
      var errEl = document.createElement("p");
      errEl.className = "dash-empty";
      errEl.textContent = "Could not load submissions.";
      listEl.appendChild(errEl);
      return;
    }

    allSubmissions = result.data;
    render();
  }

  categorySelect.addEventListener("change", render);
  themeSelect.addEventListener("change", render);

  await load();
})();
