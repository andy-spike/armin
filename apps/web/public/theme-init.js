// Resolve and apply the saved theme before first paint to avoid a flash.
// Kept as an external classic script (not inline) so the renderer can run under
// a strict `script-src 'self'` Content-Security-Policy. The cache it reads is
// written by `src/lib/theme.ts`; keep the two in sync.
(function () {
  var root = document.documentElement;
  function apply(theme) {
    root.dataset.theme = theme.scheme;
    root.dataset.themeId = theme.id;
    root.style.colorScheme = theme.scheme;
    var tokens = theme.tokens || {};
    for (var name in tokens) root.style.setProperty("--armin-" + name, tokens[name]);
  }
  var light = { id: "flexoki-light", scheme: "light" };
  var dark = { id: "flexoki-dark", scheme: "dark" };
  try {
    var systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var cached = JSON.parse(localStorage.getItem("armin-appearance") || "null");
    if (cached && cached.appearance && cached.light && cached.dark) {
      var mode = cached.appearance.mode;
      apply(mode === "dark" || (mode !== "light" && systemDark) ? cached.dark : cached.light);
      return;
    }
    // The setting from before themes were synced to the account.
    var pref = localStorage.getItem("armin-theme-preference");
    var useDark =
      pref === "flexoki-dark" || (pref !== "flexoki-light" && pref !== "light" && systemDark);
    apply(useDark ? dark : light);
  } catch {
    apply(light);
  }
})();
