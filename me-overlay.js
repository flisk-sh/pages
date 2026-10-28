// Marks the tools in ?me= (id + level 1-3) on roadmap's views, which on their own only use the ratings on the
// Portfolio tab: a ring per rated dot on the Radar and Compass, sized by level, and the rest dimmed.
(function () {
  var p = new URLSearchParams(location.search), me = {}, name = p.get("name") || "";
  (p.get("me") || "").split(",").forEach(function (pair) {
    var m = /^([a-z0-9-]+?)([1-3])$/.exec(pair.trim());
    if (m) me[m[1]] = +m[2];
  });
  var count = Object.keys(me).length, stage = document.getElementById("stage");
  if (!count || !stage) return;
  var NS = "http://www.w3.org/2000/svg", on = true;

  function mark() {
    stage.classList.toggle("me-mode", on);
    stage.querySelectorAll("[data-id]").forEach(function (n) {
      var lv = me[n.getAttribute("data-id")];
      if (lv) n.setAttribute("data-me", lv); else n.removeAttribute("data-me");
      if (lv && n.matches("g.dot") && !n.querySelector(".me-ring")) {
        var c = document.createElementNS(NS, "circle");
        c.setAttribute("class", "me-ring");
        c.setAttribute("r", String(7 + lv * 2.5));
        n.appendChild(c);
      }
    });
  }
  var pending = false;
  new MutationObserver(function () {
    if (pending) return;
    pending = true;
    requestAnimationFrame(function () { pending = false; mark(); });
  }).observe(stage, { childList: true, subtree: true });

  var bar = document.createElement("div");
  bar.className = "me-bar";
  bar.innerHTML = '<b></b><span>1 used · 2 often · 3 expert</span><button type="button"></button>';
  bar.querySelector("b").textContent = (name ? name + ": " : "") + count + " tools rated";
  var btn = bar.querySelector("button");
  btn.textContent = "Show all tools";
  btn.onclick = function () { on = !on; btn.textContent = on ? "Show all tools" : "Show my tools"; mark(); };
  document.body.appendChild(bar);
  mark();
})();
