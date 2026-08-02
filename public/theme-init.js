(function () {
  try {
    var stored = localStorage.getItem("armin:theme");
    document.documentElement.dataset.theme =
      stored === "dark" ? "dark" : "light";
  } catch {}
})();
