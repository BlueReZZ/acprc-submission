(function () {
  "use strict";

  var CATEGORIES = ["Research", "Education", "Clinical Practice", "Leadership"];
  var THEMES = [
    "Critical Care", "Long Term Conditions", "Home Ventilation", "Surgery",
    "Paediatrics", "Education", "Professionalism and fundamentals of practice",
    "Leadership & Innovation", "Other"
  ];
  var SUBHEADING_WORDS = 9; // "Background" + "Aim(s)/ Objectives" + "Methods" + "Results" + "Conclusions / Implications for practice"
  var BODY_LIMIT = 400;
  var TITLE_LIMIT = 20;
  var STORAGE_KEY = "acprc_abstract_draft_v1";

  function wordCount(str) {
    if (!str) return 0;
    var tokens = str.trim().split(/\s+/);
    var n = 0;
    for (var i = 0; i < tokens.length; i++) {
      if (/[a-zA-Z0-9]/.test(tokens[i])) n++;
    }
    return n;
  }

  function buildChipGroup(container, name, options) {
    options.forEach(function (opt, i) {
      var id = name + "_" + i;
      var wrap = document.createElement("span");
      var input = document.createElement("input");
      input.type = "radio";
      input.name = name;
      input.id = id;
      input.value = opt;
      var label = document.createElement("label");
      label.setAttribute("for", id);
      label.textContent = opt;
      wrap.appendChild(input);
      wrap.appendChild(label);
      container.appendChild(wrap);
    });
  }

  buildChipGroup(document.getElementById("categoryGroup"), "category", CATEGORIES);
  buildChipGroup(document.getElementById("themeGroup"), "theme", THEMES);
  buildChipGroup(document.getElementById("prevFirstAuthorGroup"), "prev_first_author", ["Yes", "No"]);
  buildChipGroup(document.getElementById("prevAnyGroup"), "prev_any", ["Yes", "No"]);

  var form = document.getElementById("abstractForm");
  var dateField = document.getElementById("submission_date");
  if (!dateField.value) {
    dateField.value = new Date().toISOString().slice(0, 10);
  }

  // Other theme reveal
  var otherThemeField = document.getElementById("otherThemeField");
  var otherThemeInput = document.getElementById("other_theme");
  document.getElementById("themeGroup").addEventListener("change", function (e) {
    var isOther = e.target.value === "Other";
    otherThemeField.hidden = !isOther;
    otherThemeInput.required = isOther;
    if (!isOther) otherThemeInput.value = "";
  });

  // Title counter
  var titleInput = document.getElementById("abstract_title");
  var titleCount = document.getElementById("titleCount");
  function refreshTitle() {
    var n = wordCount(titleInput.value);
    titleCount.textContent = n;
    titleCount.classList.toggle("warn", n > TITLE_LIMIT - 4 && n <= TITLE_LIMIT);
    titleCount.classList.toggle("danger", n > TITLE_LIMIT);
  }
  titleInput.addEventListener("input", refreshTitle);

  // Body fields + combined budget
  var bodyIds = ["background", "aims", "methods", "results", "conclusions"];
  var budgetFill = document.getElementById("budgetFill");
  var budgetCount = document.getElementById("budgetCount");

  function refreshBudget() {
    var total = SUBHEADING_WORDS;
    bodyIds.forEach(function (id) {
      var el = document.getElementById(id);
      var n = wordCount(el.value);
      document.getElementById("count_" + id).textContent = n;
      total += n;
    });
    var pct = Math.min(100, (total / BODY_LIMIT) * 100);
    budgetFill.style.width = pct + "%";
    budgetCount.textContent = total + " / " + BODY_LIMIT + " words";

    budgetFill.classList.remove("warn", "danger");
    budgetCount.classList.remove("warn", "danger");
    if (total > BODY_LIMIT) {
      budgetFill.classList.add("danger");
      budgetCount.classList.add("danger");
    } else if (total > BODY_LIMIT * 0.9) {
      budgetFill.classList.add("warn");
      budgetCount.classList.add("warn");
    }
    return total;
  }
  bodyIds.forEach(function (id) {
    document.getElementById(id).addEventListener("input", refreshBudget);
  });
  refreshBudget();
  refreshTitle();

  // ---------- Autosave (this browser only) ----------
  var FIELD_IDS = [
    "your_name", "your_email", "submission_date", "presenter_name", "presenter_job_title",
    "presenter_workplace", "presenter_email", "presenter_phone", "co_authors", "other_theme",
    "abstract_title", "background", "aims", "methods", "results", "conclusions",
    "approval_details", "references"
  ];
  var RADIO_NAMES = ["category", "theme", "prev_first_author", "prev_any"];

  var toast = document.getElementById("toast");
  var toastTimer, saveTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("show");
    }, 1600);
  }

  function saveDraft() {
    try {
      var data = {};
      FIELD_IDS.forEach(function (id) {
        data[id] = document.getElementById(id).value;
      });
      RADIO_NAMES.forEach(function (name) {
        var checked = form.querySelector('input[name="' + name + '"]:checked');
        data[name] = checked ? checked.value : "";
      });
      data.consent = document.getElementById("consent").checked;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      showToast("Draft saved");
    } catch (e) {
      /* storage unavailable, ignore */
    }
  }

  function loadDraft() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      FIELD_IDS.forEach(function (id) {
        if (data[id] !== undefined) document.getElementById(id).value = data[id];
      });
      RADIO_NAMES.forEach(function (name) {
        if (data[name]) {
          var input = form.querySelector('input[name="' + name + '"][value="' + CSS.escape(data[name]) + '"]');
          if (input) input.checked = true;
        }
      });
      if (data.theme === "Other") {
        otherThemeField.hidden = false;
        otherThemeInput.required = true;
      }
      if (data.consent) document.getElementById("consent").checked = true;
      refreshBudget();
      refreshTitle();
      showToast("Draft restored");
    } catch (e) {
      /* storage unavailable or corrupt, ignore */
    }
  }

  loadDraft();

  form.addEventListener("input", function () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 700);
  });
  form.addEventListener("change", function () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 200);
  });

  document.getElementById("clearDraft").addEventListener("click", function () {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    form.reset();
    dateField.value = new Date().toISOString().slice(0, 10);
    otherThemeField.hidden = true;
    otherThemeInput.required = false;
    refreshBudget();
    refreshTitle();
    showToast("Draft cleared");
  });

  // ---------- Validation & submit preview ----------
  var errorBanner = document.getElementById("errorBanner");
  var confirmPanel = document.getElementById("confirmPanel");

  function setInvalid(el, invalid) {
    el.classList.toggle("invalid", invalid);
    var msg = el.parentElement.querySelector(".err-msg");
    if (msg) msg.classList.toggle("show", invalid);
  }

  function toggleGroupError(containerId, invalid) {
    var container = document.getElementById(containerId);
    container.classList.toggle("invalid", invalid);
    var msg = container.parentElement.querySelector(".err-msg");
    if (msg) msg.classList.toggle("show", invalid);
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    confirmPanel.classList.remove("show");
    var firstInvalid = null;
    var invalidCount = 0;

    function check(el, isValid) {
      setInvalid(el, !isValid);
      if (!isValid) {
        invalidCount++;
        if (!firstInvalid) firstInvalid = el;
      }
    }

    [
      "your_name", "your_email", "submission_date", "presenter_name", "presenter_job_title",
      "presenter_workplace", "presenter_email", "presenter_phone", "co_authors",
      "approval_details", "references"
    ].forEach(function (id) {
      var el = document.getElementById(id);
      check(el, el.value.trim().length > 0 && el.checkValidity());
    });

    var categoryChecked = form.querySelector('input[name="category"]:checked');
    toggleGroupError("categoryGroup", !categoryChecked);
    if (!categoryChecked) {
      invalidCount++;
      if (!firstInvalid) firstInvalid = document.getElementById("categoryGroup");
    }

    var themeChecked = form.querySelector('input[name="theme"]:checked');
    toggleGroupError("themeGroup", !themeChecked);
    if (!themeChecked) {
      invalidCount++;
      if (!firstInvalid) firstInvalid = document.getElementById("themeGroup");
    }

    if (themeChecked && themeChecked.value === "Other") {
      check(otherThemeInput, otherThemeInput.value.trim().length > 0);
    }

    var titleWords = wordCount(titleInput.value);
    check(titleInput, titleInput.value.trim().length > 0 && titleWords <= TITLE_LIMIT);

    bodyIds.forEach(function (id) {
      var el = document.getElementById(id);
      check(el, el.value.trim().length > 0);
    });
    var bodyTotal = refreshBudget();
    if (bodyTotal > BODY_LIMIT) {
      invalidCount++;
      if (!firstInvalid) firstInvalid = document.getElementById("background");
    }

    var prevFirst = form.querySelector('input[name="prev_first_author"]:checked');
    toggleGroupError("prevFirstAuthorGroup", !prevFirst);
    if (!prevFirst) {
      invalidCount++;
      if (!firstInvalid) firstInvalid = document.getElementById("prevFirstAuthorGroup");
    }

    var prevAny = form.querySelector('input[name="prev_any"]:checked');
    toggleGroupError("prevAnyGroup", !prevAny);
    if (!prevAny) {
      invalidCount++;
      if (!firstInvalid) firstInvalid = document.getElementById("prevAnyGroup");
    }

    var consent = document.getElementById("consent");
    check(consent, consent.checked);

    if (invalidCount > 0) {
      errorBanner.classList.add("show");
      if (firstInvalid) firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    errorBanner.classList.remove("show");
    saveDraft();

    var summary = document.getElementById("confirmSummary");
    summary.innerHTML = "";
    function row(k, v) {
      var dt = document.createElement("dt");
      dt.textContent = k;
      var dd = document.createElement("dd");
      dd.textContent = v;
      summary.appendChild(dt);
      summary.appendChild(dd);
    }
    row("Title", titleInput.value.trim());
    row("Category", categoryChecked.value);
    row("Theme", themeChecked.value === "Other" ? otherThemeInput.value.trim() + " (Other)" : themeChecked.value);
    row("Presenter", document.getElementById("presenter_name").value.trim());
    row("Main body word count", bodyTotal + " / " + BODY_LIMIT);

    confirmPanel.classList.add("show");
    confirmPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // clear invalid state as the user fixes things
  form.addEventListener("input", function (e) {
    if (e.target.classList && e.target.classList.contains("invalid")) {
      if (e.target.value && e.target.value.trim().length > 0) {
        setInvalid(e.target, false);
      }
    }
  });
  form.addEventListener("change", function (e) {
    if (e.target.name) {
      var group = e.target.closest(".chip-grid");
      if (group) toggleGroupError(group.id, false);
    }
  });
})();
