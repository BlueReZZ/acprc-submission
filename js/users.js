// Users page — admin-only invite form. The invite itself is a Supabase
// Auth Admin API call, so it goes through /api/invite-user rather than
// a direct client write.
import { supabase } from "./supabaseClient.js";
import { requireRole } from "./auth.js";
import { renderDashNav } from "./nav.js";
import { setStatus } from "./dash-util.js";

(async function () {
  var profile = await requireRole("admin");
  if (!profile) return;

  renderDashNav(profile, "users");

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
})();
