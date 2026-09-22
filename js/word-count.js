// The one genuinely type-agnostic piece of submission validation —
// shared by every form's validation module (abstract, award, and any
// future type), on both the browser and server side. Do not reference
// `document`/`window` in this file.

export function wordCount(str) {
  if (!str) return 0;
  var tokens = String(str).trim().split(/\s+/);
  var n = 0;
  for (var i = 0; i < tokens.length; i++) {
    if (/[a-zA-Z0-9]/.test(tokens[i])) n++;
  }
  return n;
}
