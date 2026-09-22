import { NOMINATION_CATEGORIES, JUSTIFICATION_WORD_LIMIT, wordCount } from "./award-validation.js";

(function () {
  "use strict";

  var STORAGE_KEY = "acprc_award_draft_v1";

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

  buildChipGroup(document.getElementById("categoryGroup"), "nomination_category", NOMINATION_CATEGORIES);

  var form = document.getElementById("awardForm");

  // Justification word counter
  var justificationInput = document.getElementById("justification");
  var justificationCount = document.getElementById("justificationCount");
  function refreshJustificationCount() {
    var n = wordCount(justificationInput.value);
    justificationCount.textContent = n;
    justificationCount.classList.toggle("warn", n > JUSTIFICATION_WORD_LIMIT - 40 && n <= JUSTIFICATION_WORD_LIMIT);
    justificationCount.classList.toggle("danger", n > JUSTIFICATION_WORD_LIMIT);
  }
  justificationInput.addEventListener("input", refreshJustificationCount);
  refreshJustificationCount();

  // ---------- Autosave (this browser only) ----------
  var FIELD_IDS = [
    "your_name", "your_email",
    "nominee_name", "nominee_email", "nominee_workplace", "nominee_job_title", "nominee_specialty",
    "justification"
  ];
  var RADIO_NAMES = ["nomination_category"];

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
      if (data.consent) document.getElementById("consent").checked = true;
      refreshJustificationCount();
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
    refreshJustificationCount();
    showToast("Draft cleared");
  });

  // ---------- Validation & submit ----------
  var errorBanner = document.getElementById("errorBanner");
  var confirmPanel = document.getElementById("confirmPanel");
  var defaultErrorText = errorBanner.textContent;
  var submitBtn = form.querySelector("button.submit");
  var submitBtnDefaultText = submitBtn.textContent;

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

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    confirmPanel.classList.remove("show");
    errorBanner.textContent = defaultErrorText;
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
      "your_name", "your_email",
      "nominee_name", "nominee_email", "nominee_workplace", "nominee_job_title"
    ].forEach(function (id) {
      var el = document.getElementById(id);
      check(el, el.value.trim().length > 0 && el.checkValidity());
    });

    var categoryChecked = form.querySelector('input[name="nomination_category"]:checked');
    toggleGroupError("categoryGroup", !categoryChecked);
    if (!categoryChecked) {
      invalidCount++;
      if (!firstInvalid) firstInvalid = document.getElementById("categoryGroup");
    }

    var justificationWords = wordCount(justificationInput.value);
    check(justificationInput, justificationWords > 0 && justificationWords <= JUSTIFICATION_WORD_LIMIT);

    var consent = document.getElementById("consent");
    check(consent, consent.checked);

    if (invalidCount > 0) {
      errorBanner.classList.add("show");
      if (firstInvalid) firstInvalid.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    errorBanner.classList.remove("show");
    saveDraft();

    var payload = {
      your_name: document.getElementById("your_name").value.trim(),
      your_email: document.getElementById("your_email").value.trim(),
      nominee_name: document.getElementById("nominee_name").value.trim(),
      nominee_email: document.getElementById("nominee_email").value.trim(),
      nominee_workplace: document.getElementById("nominee_workplace").value.trim(),
      nominee_job_title: document.getElementById("nominee_job_title").value.trim(),
      nominee_specialty: document.getElementById("nominee_specialty").value.trim(),
      nomination_category: categoryChecked.value,
      justification: justificationInput.value.trim(),
      consent: consent.checked,
      hp_website: document.getElementById("hp_website").value
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";

    var submitOk = false;
    try {
      var response = await fetch("/api/submit-award", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      submitOk = response.ok;
    } catch (err) {
      submitOk = false;
    }

    submitBtn.disabled = false;
    submitBtn.textContent = submitBtnDefaultText;

    if (!submitOk) {
      errorBanner.textContent = "Something went wrong sending your nomination. Please try again — your draft is still saved.";
      errorBanner.classList.add("show");
      errorBanner.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      /* storage unavailable, ignore */
    }

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
    row("Nominee", document.getElementById("nominee_name").value.trim());
    row("Category", categoryChecked.value);
    row("Justification word count", justificationWords + " / " + JUSTIFICATION_WORD_LIMIT);

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
