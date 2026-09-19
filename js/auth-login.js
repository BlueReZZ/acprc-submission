import { supabase } from "./supabaseClient.js";

var emailInput = document.getElementById("login_email");
var emailStep = document.getElementById("emailStep");
var sendBtn = document.getElementById("sendLinkBtn");
var loginErr = document.getElementById("loginErr");
var sentMsg = document.getElementById("sentMsg");
var introText = document.getElementById("introText");

function showError(msg) {
  loginErr.textContent = msg;
  loginErr.classList.add("show");
}

function clearError() {
  loginErr.textContent = "";
  loginErr.classList.remove("show");
}

// Supabase's AuthApiError carries a machine-readable `code` (mirrors the
// API's error_code) on recent supabase-js versions, plus always a
// `status` and `message` — check all three so this keeps working even
// if `code` isn't present on whatever version esm.sh serves.
function describeOtpError(error) {
  var code = error.code || "";
  var status = error.status;
  var message = (error.message || "").toLowerCase();

  if (code === "over_email_send_rate_limit" || status === 429) {
    return "Too many login attempts right now. Wait a few minutes and try again.";
  }
  if (code === "otp_disabled" || message.indexOf("signups not allowed") !== -1) {
    return "That email hasn't been invited yet. Contact the committee for an invite.";
  }
  return "Couldn't send a login link. Check the email address and try again.";
}

async function redirectSignedInUser() {
  var sessionResult = await supabase.auth.getSession();
  var session = sessionResult.data && sessionResult.data.session;
  if (!session) return false;

  var profileResult = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.user.id)
    .single();

  if (profileResult.error || !profileResult.data) {
    await supabase.auth.signOut();
    showError("That account isn't set up yet. Contact the committee for an invite.");
    return false;
  }

  window.location.href = profileResult.data.role === "admin" ? "/admin/" : "/review/";
  return true;
}

(async function init() {
  var params = new URLSearchParams(window.location.search);
  var errorParam = params.get("error");
  if (errorParam === "not_authorised") {
    introText.textContent = "That account isn't set up yet. Contact the committee for an invite.";
  } else if (errorParam === "wrong_role") {
    introText.textContent = "You're logged in, but not authorised to view that page.";
  }

  await redirectSignedInUser();
})();

sendBtn.addEventListener("click", async function () {
  clearError();
  var email = emailInput.value.trim();
  if (!email) {
    showError("Enter your email address.");
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = "Sending…";

  var result = await supabase.auth.signInWithOtp({
    email: email,
    options: {
      emailRedirectTo: window.location.origin + "/login/",
      shouldCreateUser: false // no self-signup — only pre-invited accounts can log in
    }
  });

  sendBtn.disabled = false;
  sendBtn.textContent = "Send me a login link";

  if (result.error) {
    showError(describeOtpError(result.error));
    return;
  }

  emailStep.hidden = true;
  sendBtn.hidden = true;
  sentMsg.hidden = false;
});
