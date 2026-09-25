// Small DOM helpers shared by the logged-in dashboard pages.

export function el(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function addOption(select, value, label) {
  var opt = document.createElement("option");
  opt.value = value;
  opt.textContent = label !== undefined ? label : value;
  select.appendChild(opt);
}

export function setStatus(node, msg, kind) {
  node.textContent = msg;
  node.className = "dash-status-msg" + (kind ? " " + kind : "");
}

export function buildField(label, value) {
  var frag = document.createDocumentFragment();
  frag.appendChild(el("h4", null, label));
  frag.appendChild(el("p", null, value));
  return frag;
}

// A "Show X" / "Hide X" button plus the collapsible panel it controls.
// Returns [button, panel]; the caller fills the panel.
export function buildToggle(noun) {
  var btn = el("button", "sub-body-toggle", "Show " + noun);
  btn.type = "button";
  var panel = el("div", "sub-body");
  panel.hidden = true;
  btn.addEventListener("click", function () {
    panel.hidden = !panel.hidden;
    btn.textContent = (panel.hidden ? "Show " : "Hide ") + noun;
  });
  return [btn, panel];
}
