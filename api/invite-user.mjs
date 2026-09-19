// Vercel serverless function (Node runtime, ESM). Lets an existing
// admin provision a new admin or reviewer account. This has to be a
// serverless function, not a direct client call: inviting a user is a
// Supabase Auth Admin API operation, not a database write, so it can
// never be expressed as an RLS-protected table policy — it requires
// the service-role secret.
//
// Zero npm dependencies on purpose — talks to Supabase's REST (Auth +
// PostgREST) APIs directly with fetch.
var SUPABASE_URL = process.env.SUPABASE_URL;
var SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getCallerProfile(accessToken) {
  var userRes = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: "Bearer " + accessToken
    }
  });
  if (!userRes.ok) return null;
  var user = await userRes.json();

  var profileRes = await fetch(
    SUPABASE_URL + "/rest/v1/profiles?id=eq." + user.id + "&select=id,role",
    { headers: { apikey: SERVICE_ROLE_KEY, Authorization: "Bearer " + SERVICE_ROLE_KEY } }
  );
  if (!profileRes.ok) return null;
  var profiles = await profileRes.json();
  return profiles[0] || null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: "Server is not configured" });
    return;
  }

  var authHeader = req.headers.authorization || "";
  var accessToken = authHeader.replace(/^Bearer\s+/i, "");
  if (!accessToken) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  var callerProfile = await getCallerProfile(accessToken);
  if (!callerProfile || callerProfile.role !== "admin") {
    res.status(403).json({ error: "Only admins can invite users" });
    return;
  }

  var payload = req.body || {};
  var email = typeof payload.email === "string" ? payload.email.trim() : "";
  var fullName = typeof payload.full_name === "string" ? payload.full_name.trim() : "";
  var role = payload.role;

  if (!email || !fullName || (role !== "admin" && role !== "reviewer")) {
    res.status(400).json({ error: "email, full_name and a valid role are required" });
    return;
  }

  var inviteRes = await fetch(SUPABASE_URL + "/auth/v1/invite", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: "Bearer " + SERVICE_ROLE_KEY
    },
    body: JSON.stringify({ email: email })
  });

  if (!inviteRes.ok) {
    var inviteErr = await inviteRes.text();
    console.error("invite-user: Supabase invite failed", inviteRes.status, inviteErr);
    res.status(502).json({ error: "Could not send invite" });
    return;
  }

  var invitedUser = await inviteRes.json();

  var profileRes = await fetch(SUPABASE_URL + "/rest/v1/profiles", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SERVICE_ROLE_KEY,
      Authorization: "Bearer " + SERVICE_ROLE_KEY,
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      id: invitedUser.id,
      email: email,
      full_name: fullName,
      role: role
    })
  });

  if (!profileRes.ok) {
    var profileErr = await profileRes.text();
    console.error("invite-user: profile insert failed", profileRes.status, profileErr);
    res.status(502).json({ error: "Invite sent, but the profile record could not be created" });
    return;
  }

  res.status(200).json({ ok: true });
}
