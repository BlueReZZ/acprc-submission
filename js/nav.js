// Tab bar shared by every logged-in page: one tab per submission type's
// workflow (awards first — they're the pilot), plus Users for admins.
// Renders into <nav id="dashNav"> once the caller has a profile.
import { signOut } from "./auth.js";
import { el } from "./dash-util.js";

export function renderDashNav(profile, current) {
  var nav = document.getElementById("dashNav");
  var tabs = [
    ["awards", "Award nominations", "/nominations/"],
    ["abstracts", "Abstracts", profile.role === "admin" ? "/admin/" : "/review/"]
  ];
  if (profile.role === "admin") tabs.push(["users", "Users", "/admin/users/"]);

  var list = el("div", "dash-tabs-list");
  tabs.forEach(function (t) {
    var a = el("a", "dash-tab" + (t[0] === current ? " active" : ""), t[1]);
    a.href = t[2];
    if (t[0] === current) a.setAttribute("aria-current", "page");
    list.appendChild(a);
  });
  nav.appendChild(list);

  var right = el("div", "dash-tabs-right");
  right.appendChild(el("span", "dash-who", profile.full_name + " (" + profile.role + ")"));
  var home = el("a", "dash-signout", "Submissions home");
  home.href = "/";
  right.appendChild(home);
  var out = el("button", "dash-signout", "Log out");
  out.type = "button";
  out.addEventListener("click", signOut);
  right.appendChild(out);
  nav.appendChild(right);
}
