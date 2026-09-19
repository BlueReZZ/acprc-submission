// Shared session/role guard for the admin and review pages.
// import { requireRole, signOut } from "../js/auth.js";
import { supabase } from "./supabaseClient.js";

// Redirects to /login/ (optionally with an ?error= reason) unless the
// current session belongs to a profile with the given role. Resolves
// with the profile row ({ id, email, full_name, role }) on success —
// callers should await this before rendering anything sensitive.
export async function requireRole(requiredRole) {
  var sessionResult = await supabase.auth.getSession();
  var session = sessionResult.data && sessionResult.data.session;
  if (!session) {
    window.location.href = "/login/";
    return null;
  }

  var profileResult = await supabase
    .from("profiles")
    .select("id, email, full_name, role")
    .eq("id", session.user.id)
    .single();

  if (profileResult.error || !profileResult.data) {
    await supabase.auth.signOut();
    window.location.href = "/login/?error=not_authorised";
    return null;
  }

  if (requiredRole && profileResult.data.role !== requiredRole) {
    window.location.href = "/login/?error=wrong_role";
    return null;
  }

  return profileResult.data;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = "/login/";
}
