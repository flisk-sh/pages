/* DevEx Roadmap: draws the four views from assets/data.json.
   Hovering or focusing anything shows a tooltip; nothing on a chart navigates.
   Sub-tabs are real links. They swap in place with history.pushState, so the
   address bar always holds a link someone else can open. */
(function () {
  "use strict";

  var app = document.getElementById("app");
  if (!app) return;
  var stage = document.getElementById("stage");
  var tip = document.getElementById("tip");
  var qInput = document.getElementById("q");
  var base = app.dataset.base || "";
  var repo = app.dataset.repo || "";
  var NS = "http://www.w3.org/2000/svg";
  var TRACK_COLORS = ["#0ea5e9", "#f97316", "#a855f7", "#22c55e", "#ec4899"];

  var D = null;
  var TOOLS = [];
  var BY_ID = {};
  var FAM = {};
  var state = { view: app.dataset.view, sub: app.dataset.sub || "", q: "", cmp: [] };
  var firstPaint = true;

  // ---------- small helpers ----------

  function el(tag, attrs, parent) {
    var n = document.createElement(tag);
    set(n, attrs);
    if (parent) parent.appendChild(n);
    return n;
  }
  function sv(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    set(n, attrs);
    if (parent) parent.appendChild(n);
    return n;
  }
  function set(n, attrs) {
    if (!attrs) return;
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "text") n.textContent = v;
      else n.setAttribute(k, v);
    });
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // The data is community-edited, so only https links make it into the page.
  function safeUrl(u) {
    return /^https:\/\/[^\s"'<>]+$/.test(u || "") ? u : "";
  }
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967296;
  }
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }
  function ringOf(id) {
    return D.rubric.rings.filter(function (r) { return r.id === id; })[0] || { id: id, label: id };
  }
  function trackColor(id) {
    var i = D.journeys.tracks.map(function (t) { return t.id; }).indexOf(id);
    return TRACK_COLORS[Math.max(0, i) % TRACK_COLORS.length];
  }
  var LIC_SHORT = { oss: "OS", free: "Fr", freemium: "Fm", paid: "Pd" };

  // ---------- data ----------

  // Logos live in assets/logos/<tool id>.svg or .png. An SVG is drawn as a CSS mask, so it takes
  // the text color and works on both themes; a PNG (the project's GitHub org avatar) is drawn as is.
  // A tool without a file keeps its symbol.
  var LOGO = {};
  function logoUrl(id) {
    return base + "/assets/logos/" + encodeURIComponent(id) + "." + LOGO[id];
  }
  function logoClass(id) {
    return "logo" + (LOGO[id] === "png" ? " logo-img" : "");
  }
  function logoSpan(id) {
    return LOGO[id] ? '<span class="' + logoClass(id) + '" style="--logo:url(' + logoUrl(id) + ')"></span>' : "";
  }

  function prep(d) {
    D = d;
    (d.logos || []).forEach(function (file) {
      var m = /^(.+)\.(svg|png)$/.exec(file);
      if (m) LOGO[m[1]] = m[2];
    });
    var n = 0;
    d.families.forEach(function (f, i) {
      f.index = i;
      FAM[f.id] = f;
      var list = (d.tools[f.id] || []).slice();
      list.sort(function (a, b) {
        var ca = f.cats.indexOf(a.cat), cb = f.cats.indexOf(b.cat);
        if (ca !== cb) return ca - cb;
        return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
      });
      list.forEach(function (t) {
        t.fam = f.id;
        t.dx = t.dx || [];
        t.parity = t.parity || [];
        t.x = t.dx.length * 10;
        t.y = t.parity.length * 10;
        t.n = ++n;
        TOOLS.push(t);
        BY_ID[t.id] = t;
      });
    });
  }

  function matches(t) {
    if (!state.q) return true;
    var q = state.q.toLowerCase();
    return (t.name + " " + t.id + " " + t.cat + " " + (t.tagline || "")).toLowerCase().indexOf(q) !== -1;
  }

  // ---------- tooltip ----------

  var hideTimer = null;
  var activeId = null;
  var lastNode = null;

  function critChips(ids, list) {
    return list.criteria
      .filter(function (c) { return ids.indexOf(c.id) !== -1; })
      .map(function (c) { return '<li title="' + esc(c.help) + '">' + esc(c.label) + "</li>"; })
      .join("");
  }
  function bar(label, v, crit) {
    return (
      '<div class="tt-bar"><span>' + label + "</span><b>" + v + '</b><i style="--v:' + v + '%"></i></div>' +
      (crit ? '<ul class="tt-crit">' + crit + "</ul>" : "")
    );
  }
  function links(pairs) {
    return (
      '<p class="tt-links">' +
      pairs
        .filter(function (p) { return safeUrl(p[1]); })
        .map(function (p) { return '<a href="' + esc(p[1]) + '" target="_blank" rel="noopener">' + p[0] + " ↗</a>"; })
        .join("") +
      "</p>"
    );
  }
  // cmd.flisk.sh compares the commands of tools side by side. Its Pick page keeps Flisk first and
  // takes the rest from ?tools=, so a link there is "these tools, command by command".
  function cmdIds(ids) {
    var map = (D.cmd && D.cmd.tools) || {};
    return ids.map(function (id) { return map[id]; }).filter(Boolean);
  }
  function cmdUrl(ids) {
    var site = D.cmd && D.cmd.site;
    var found = cmdIds(ids);
    if (!site || !found.length) return "";
    if (found.length === 1 && found[0] === "flisk") return site + "/";
    var list = found.indexOf("flisk") === -1 ? ["flisk"].concat(found) : found;
    return site + "/pick/?tools=" + list.map(encodeURIComponent).join(",");
  }
  function editUrl(t) {
    return repo + "/edit/main/_data/tools/" + t.fam + ".yml";
  }
  function reportUrl(t) {
    return repo + "/issues/new?labels=data&title=" + encodeURIComponent("Data: " + t.name + " (" + t.id + ")");
  }

  // Live numbers from GitHub (scripts/fetch-github.rb), next to the hand-written data.
  function fmtStars(n) {
    return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k" : String(n);
  }
  function ago(iso) {
    if (!iso) return "";
    var days = Math.floor((Date.now() - Date.parse(iso)) / 86400000);
    if (days < 1) return "today";
    if (days < 14) return days + " day" + (days === 1 ? "" : "s") + " ago";
    if (days < 60) return Math.round(days / 7) + " weeks ago";
    if (days < 730) return Math.round(days / 30) + " months ago";
    return Math.round(days / 365) + " years ago";
  }
  function gh(t) {
    return (D.github && D.github[t.id]) || null;
  }
  function ghLine(t) {
    var g = gh(t);
    if (!g) return "";
    var bits = ["★ " + fmtStars(g.stars)];
    if (g.release) bits.push("last release " + ago(g.release) + (g.version ? " (" + esc(g.version) + ")" : ""));
    else if (g.pushed) bits.push("last commit " + ago(g.pushed));
    var warn = g.archived && t.ring !== "hold"
      ? '<p class="tt-warn">GitHub says this repo is archived, but it is not in Hold. <a href="' + esc(reportUrl(t)) + '" target="_blank" rel="noopener">Report it</a>.</p>'
      : "";
    return '<p class="tt-gh">' + bits.join(" · ") + "</p>" + warn;
  }
  function toolTip(t) {
    var f = FAM[t.fam];
    var r = ringOf(t.ring);
    return (
      '<div class="tt-head" style="--c:' + esc(f.color) + '">' +
      (LOGO[t.id]
        ? '<span class="tt-sym tt-has-logo" title="' + esc(t.sym) + '">' + logoSpan(t.id) + "</span>"
        : '<span class="tt-sym">' + esc(t.sym) + "</span>") +
      "<div><strong>" + esc(t.name) + "</strong><span>" + esc(f.name) + " · " + esc(t.cat) + "</span></div>" +
      '<span class="tt-ring ring-' + esc(t.ring) + '" title="' + esc(r.help || "") + '">' + esc(r.label) + "</span>" +
      "</div>" +
      '<p class="tt-tag">' + esc(t.tagline) + "</p>" +
      bar("Easy to use", t.x, critChips(t.dx, D.rubric.dx)) +
      bar("Big real systems", t.y, critChips(t.parity, D.rubric.parity)) +
      (t.note ? '<p class="tt-note">' + esc(t.note) + "</p>" : "") +
      ghLine(t) +
      '<p class="tt-meta">#' + t.n + " · " + esc(D.rubric.licenses[t.license] || t.license) + (t.repo ? " · " + esc(t.repo) : "") + "</p>" +
      pickLine(t) +
      links([["Site", t.url], ["Evidence", t.evidence], ["Commands", cmdUrl([t.id])], ["Edit", editUrl(t)], ["Report", reportUrl(t)]])
    );
  }

  function levelById(id) {
    return D.journeys.levels.filter(function (l) { return l.id === id; })[0];
  }
  function levelTip(lv) {
    return (
      '<div class="tt-head"><span class="tt-sym tt-lvl">' + lv.n + "</span><div><strong>" + esc(lv.name) +
      "</strong><span>Level " + lv.n + " of " + D.journeys.levels.length + "</span></div></div>" +
      '<p class="tt-tag">' + esc(lv.goal) + "</p>" +
      '<ul class="tt-crit">' + (lv.skills || []).map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ul>"
    );
  }
  var FL_LABEL = { yes: "Does it today", partial: "Partly", soon: "Coming soon" };
  function fliskTip(lv) {
    var st = lv.flisk.status;
    return (
      '<div class="tt-head" style="--c:#22c55e"><span class="tt-sym">Fl</span><div><strong>Flisk at level ' + lv.n +
      "</strong><span>" + esc(lv.name) + '</span></div><span class="tt-ring fl-' + esc(st) + '">' + FL_LABEL[st] + "</span></div>" +
      '<p class="tt-tag">' + esc(lv.flisk.text) + "</p>" +
      (st === "soon" ? '<p class="tt-note">Flisk does not do this yet. The gap is tracked in the Flisk repo, and this stop updates when it ships.</p>' : "") +
      links([["Flisk", "https://flisk.sh"], ["Tracking issue", D.journeys.flisk_issue]])
    );
  }

  function tipHtml(node) {
    var kind = node.getAttribute("data-tip");
    if (kind === "tool") return toolTip(BY_ID[node.getAttribute("data-id")]);
    if (kind === "level") return levelTip(levelById(node.getAttribute("data-level")));
    if (kind === "flisk") return fliskTip(levelById(node.getAttribute("data-level")));
    if (kind === "text") return '<p class="tt-tag">' + esc(node.getAttribute("data-text")) + "</p>";
    if (kind === "skill") return skillTip(SKILL_BY_ID[node.getAttribute("data-skill")]);
    if (kind === "role") return roleTip(ROLE_BY_ID[node.getAttribute("data-role")]);
    return "";
  }

  function place(node) {
    var r = node.getBoundingClientRect();
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var vw = document.documentElement.clientWidth, vh = window.innerHeight;
    var x = r.right + 14;
    var y = r.top + r.height / 2 - h / 2;
    if (x + w > vw - 8) x = r.left - w - 14;
    if (x < 8) {
      x = clamp(r.left + r.width / 2 - w / 2, 8, vw - w - 8);
      y = r.bottom + 12;
      if (y + h > vh - 8) y = r.top - h - 12;
    }
    y = clamp(y, 8, Math.max(8, vh - h - 8));
    tip.style.left = Math.round(x) + "px";
    tip.style.top = Math.round(y) + "px";
  }

  function activate(node) {
    var html = tipHtml(node);
    if (!html) return;
    clearTimeout(hideTimer);
    clearHot();
    var id = node.getAttribute("data-id");
    if (id) {
      activeId = id;
      stage.classList.add("has-hot");
      stage.querySelectorAll('[data-id="' + id + '"]').forEach(function (n) { n.classList.add("is-hot"); });
    } else {
      node.classList.add("is-hot");
    }
    lastNode = node;
    tip.innerHTML = html;
    tip.hidden = false;
    place(node);
    requestAnimationFrame(function () { tip.classList.add("on"); });
  }
  function clearHot() {
    activeId = null;
    stage.classList.remove("has-hot");
    stage.querySelectorAll(".is-hot").forEach(function (n) { n.classList.remove("is-hot"); });
  }
  function hideSoon() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideNow, 160);
  }
  function hideNow() {
    tip.classList.remove("on");
    tip.hidden = true;
    clearHot();
  }

  function target(e) {
    var n = e.target.closest && e.target.closest("[data-tip]");
    return n && stage.contains(n) ? n : null;
  }
  stage.addEventListener("pointerover", function (e) {
    var n = target(e);
    if (n) activate(n);
  });
  stage.addEventListener("pointerout", function (e) {
    var n = target(e);
    if (n && !(e.relatedTarget && n.contains(e.relatedTarget))) hideSoon();
  });
  stage.addEventListener("focusin", function (e) {
    var n = target(e);
    if (n) activate(n);
  });
  stage.addEventListener("focusout", hideSoon);
  tip.addEventListener("pointerenter", function () { clearTimeout(hideTimer); });
  tip.addEventListener("pointerleave", hideSoon);
  tip.addEventListener("focusin", function () { clearTimeout(hideTimer); });
  tip.addEventListener("focusout", hideSoon);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") hideNow();
  });
  window.addEventListener("scroll", function () { if (!tip.hidden) hideNow(); }, { passive: true });

  // ---------- labels that do not overlap ----------

  function labeler() {
    var boxes = [];
    return function (x, y, text, size) {
      var w = text.length * size * 0.56 + 4, h = size + 3;
      var tries = [[x + 10, y + size * 0.35], [x - 10 - w, y + size * 0.35], [x - w / 2, y - 10], [x - w / 2, y + size + 8]];
      for (var i = 0; i < tries.length; i++) {
        var bx = tries[i][0], by = tries[i][1] - size;
        var hit = boxes.some(function (b) { return bx < b[0] + b[2] && bx + w > b[0] && by < b[1] + b[3] && by + h > b[1]; });
        if (!hit) {
          boxes.push([bx, by, w, h]);
          return { x: tries[i][0], y: tries[i][1], anchor: "start" };
        }
      }
      return null;
    };
  }

  // ---------- Compass ----------

  function renderCompass() {
    var W = 1000, H = 700, m = { l: 92, r: 92, t: 54, b: 66 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    // Scores run 0 to 100; the frame runs a little wider so a dot at 0 never sits on the axis labels.
    var sx = function (v) { return m.l + ((v + 6) / 112) * iw; };
    var sy = function (v) { return m.t + (1 - (v + 6) / 112) * ih; };
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, class: "compass" }, stage);

    var defs = sv("defs", null, svg);
    var mk = sv("marker", { id: "arrow", viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" }, defs);
    sv("path", { d: "M0 0 L10 5 L0 10 z", class: "axis-head" }, mk);
    var glow = sv("radialGradient", { id: "rose-glow" }, defs);
    sv("stop", { offset: "0%", "stop-color": "var(--accent)", "stop-opacity": "0.35" }, glow);
    sv("stop", { offset: "100%", "stop-color": "var(--accent)", "stop-opacity": "0" }, glow);

    // The four zones, named like the screenshots people share.
    // Each corner gets a plain name, with the two axis words under it as a smaller line.
    var zones = [
      ["nw", 0, 50, "Powerful but hard", "Hard to use, big real systems"],
      ["ne", 50, 50, "Best of both", "Easy to use, big real systems"],
      ["sw", 0, 0, "Rough and basic", "Hard to use, small and simple"],
      ["se", 50, 0, "Easy wins", "Easy to use, small and simple"]
    ];
    zones.forEach(function (z) {
      var east = z[1] === 50, north = z[2] === 50;
      sv("rect", {
        x: east ? sx(50) : m.l, y: north ? m.t : sy(50),
        width: east ? m.l + iw - sx(50) : sx(50) - m.l, height: north ? sy(50) - m.t : m.t + ih - sy(50),
        class: "zone zone-" + z[0]
      }, svg);
      // Labels sit outside the frame, so they never cover a dot.
      var tx = east ? m.l + iw : m.l;
      var ty = north ? m.t - 24 : m.t + ih + 36;
      var lab = sv("text", { x: tx, y: ty, class: "zone-label zone-label-" + z[0], "text-anchor": east ? "end" : "start" }, svg);
      sv("tspan", { x: tx, class: "zone-title", text: z[3] }, lab);
      sv("tspan", { x: tx, dy: 15, class: "zone-sub", text: z[4] }, lab);
    });

    for (var g = 0; g <= 100; g += 10) {
      sv("line", { x1: sx(g), y1: sy(0), x2: sx(g), y2: sy(100), class: g % 50 ? "grid" : "grid grid-strong" }, svg);
      sv("line", { x1: sx(0), y1: sy(g), x2: sx(100), y2: sy(g), class: g % 50 ? "grid" : "grid grid-strong" }, svg);
      sv("text", { x: sx(g), y: m.t + ih + 16, class: "tick", "text-anchor": "middle", text: g }, svg);
      sv("text", { x: m.l - 8, y: sy(g) + 4, class: "tick", "text-anchor": "end", text: g }, svg);
    }

    // Axes through the middle, arrows at both ends: the compass.
    sv("line", { x1: sx(0), y1: sy(50), x2: sx(100), y2: sy(50), class: "axis", "marker-start": "url(#arrow)", "marker-end": "url(#arrow)" }, svg);
    sv("line", { x1: sx(50), y1: sy(0), x2: sx(50), y2: sy(100), class: "axis", "marker-start": "url(#arrow)", "marker-end": "url(#arrow)" }, svg);
    var cx = sx(50), cy = sy(50);
    sv("circle", { cx: cx, cy: cy, r: 56, fill: "url(#rose-glow)" }, svg);
    sv("path", {
      d: "M" + cx + " " + (cy - 30) + " L" + (cx + 6) + " " + (cy - 6) + " L" + (cx + 30) + " " + cy + " L" + (cx + 6) + " " + (cy + 6) +
        " L" + cx + " " + (cy + 30) + " L" + (cx - 6) + " " + (cy + 6) + " L" + (cx - 30) + " " + cy + " L" + (cx - 6) + " " + (cy - 6) + " z",
      class: "rose"
    }, svg);
    sv("circle", { cx: cx, cy: cy, r: 3.5, class: "rose-pin" }, svg);

    var dx = D.rubric.dx, pa = D.rubric.parity;
    var cardinal = [
      ["N", cx, m.t - 22, "middle", pa.high],
      ["S", cx, H - 12, "middle", pa.low],
      ["E", W - 12, cy - 10, "end", dx.high],
      ["W", 12, cy - 10, "start", dx.low]
    ];
    cardinal.forEach(function (c) {
      var t = sv("text", { x: c[1], y: c[2], "text-anchor": c[3], class: "cardinal" }, svg);
      sv("tspan", { class: "cardinal-letter", text: c[0] + " " }, t);
      sv("tspan", { text: c[4] }, t);
    });
    sv("text", { x: W - 12, y: cy + 24, "text-anchor": "end", class: "axis-name", text: "Easier →" }, svg);
    sv("text", { x: 12, y: cy + 24, "text-anchor": "start", class: "axis-name", text: "← Harder" }, svg);
    sv("text", { x: cx + 10, y: m.t + 14, "text-anchor": "start", class: "axis-name", text: "↑ Bigger, more real" }, svg);

    // Dots. Tools with the same score sit on a small sunflower spiral around the point,
    // laid out over every tool so a dot never moves when you switch sub-tabs.
    var groups = {};
    TOOLS.forEach(function (t) {
      var k = t.x + ":" + t.y;
      (groups[k] = groups[k] || []).push(t);
    });
    var pos = {};
    Object.keys(groups).forEach(function (k) {
      groups[k].forEach(function (t, i) {
        var r = 8.2 * Math.sqrt(i), a = i * 2.39996 + hash(k) * 6.28;
        pos[t.id] = [sx(t.x) + r * Math.cos(a), sy(t.y) + r * Math.sin(a)];
      });
    });

    var dots = sv("g", { class: "dots" }, svg);
    var focus = state.sub;
    TOOLS.slice()
      .sort(function (a, b) { return (a.fam === focus) - (b.fam === focus); })
      .forEach(function (t) {
        var f = FAM[t.fam];
        var on = (!focus || t.fam === focus) && matches(t);
        var p = pos[t.id];
        var gEl = sv("g", {
          class: "dot" + (on ? "" : " is-dim") + (focus && t.fam === focus ? " is-focus" : ""),
          "data-id": t.id,
          "data-tip": "tool",
          tabindex: on ? 0 : -1,
          "aria-label": t.name + ", easy to use " + t.x + ", big real systems " + t.y,
          style: "--c:" + f.color + ";--d:" + Math.round(hash(t.id) * 500) + "ms"
        }, dots);
        gEl.style.transform = firstPaint ? "translate(" + cx + "px," + cy + "px) scale(0.2)" : "translate(" + p[0] + "px," + p[1] + "px)";
        sv("circle", { r: 13, class: "hit" }, gEl);
        sv("circle", { r: 6, class: "core" }, gEl);
        if (firstPaint) {
          requestAnimationFrame(function () {
            requestAnimationFrame(function () { gEl.style.transform = "translate(" + p[0] + "px," + p[1] + "px)"; });
          });
        }
      });

    // Names only where they help: the sub-tab's tools, or what you searched for.
    var labelled = TOOLS.filter(function (t) {
      return (focus ? t.fam === focus : !!state.q) && matches(t);
    });
    if (labelled.length && labelled.length <= 80) {
      var lab = labeler();
      var lg = sv("g", { class: "labels" }, svg);
      labelled.forEach(function (t) {
        var p = pos[t.id], spot = lab(p[0], p[1], t.name, 11);
        if (spot) sv("text", { x: spot.x, y: spot.y, class: "dot-label", text: t.name }, lg);
      });
    }
  }

  // ---------- Adoption Radar ----------

  function arcPath(r, a0, a1, reverse) {
    var x0 = 500 + r * Math.cos(a0), y0 = 500 + r * Math.sin(a0);
    var x1 = 500 + r * Math.cos(a1), y1 = 500 + r * Math.sin(a1);
    var large = a1 - a0 > Math.PI ? 1 : 0;
    return reverse
      ? "M" + x1 + " " + y1 + " A" + r + " " + r + " 0 " + large + " 0 " + x0 + " " + y0
      : "M" + x0 + " " + y0 + " A" + r + " " + r + " 0 " + large + " 1 " + x1 + " " + y1;
  }

  function shape(t, size, parent) {
    if (t.license === "oss") return sv("circle", { r: size, class: "core" }, parent);
    if (t.license === "paid") {
      var s = size * 1.25;
      return sv("path", { d: "M0 " + -s + " L" + s + " 0 L0 " + s + " L" + -s + " 0 z", class: "core" }, parent);
    }
    var q = size * 0.9;
    return sv("rect", { x: -q, y: -q, width: q * 2, height: q * 2, rx: 2, class: "core" }, parent);
  }

  function renderRadar() {
    var R = [0, 205, 318, 388, 446];
    var rings = D.rubric.rings;
    var focus = state.sub ? FAM[state.sub] : null;
    var sectors = focus
      ? focus.cats.map(function (c) {
          return { name: c, color: focus.color, tools: TOOLS.filter(function (t) { return t.fam === focus.id && t.cat === c; }) };
        }).filter(function (s) { return s.tools.length; })
      : D.families.map(function (f) {
          return { name: f.name, color: f.color, tools: TOOLS.filter(function (t) { return t.fam === f.id; }) };
        });

    var layout = el("div", { class: "radar-layout" }, stage);
    var svg = sv("svg", { viewBox: "0 0 1000 1000", class: "radar" + (focus ? " radar-focus" : "") }, layout);
    var defs = sv("defs", null, svg);

    for (var i = rings.length - 1; i >= 0; i--) {
      sv("circle", { cx: 500, cy: 500, r: R[i + 1], class: "ring-band ring-band-" + i }, svg);
    }

    var span = (Math.PI * 2) / sectors.length;
    var start = -Math.PI / 2;
    var dotSize = focus ? 9 : 6.2;
    var placed = [];

    sectors.forEach(function (s, si) {
      var a0 = start + si * span, a1 = a0 + span;
      sv("path", {
        d: "M500 500 L" + (500 + R[4] * Math.cos(a0)) + " " + (500 + R[4] * Math.sin(a0)) + " A" + R[4] + " " + R[4] + " 0 " + (span > Math.PI ? 1 : 0) + " 1 " + (500 + R[4] * Math.cos(a1)) + " " + (500 + R[4] * Math.sin(a1)) + " z",
        class: "sector",
        style: "--c:" + s.color
      }, svg);
      sv("line", { x1: 500, y1: 500, x2: 500 + R[4] * Math.cos(a0), y2: 500 + R[4] * Math.sin(a0), class: "sector-line" }, svg);

      // Sector name on a curve outside the circle, flipped on the bottom half so it reads upright.
      var mid = (a0 + a1) / 2;
      var bottom = Math.sin(mid) > 0.05;
      var pid = "sec-" + si;
      sv("path", { id: pid, d: arcPath(bottom ? 478 : 466, a0 + 0.02, a1 - 0.02, bottom), fill: "none" }, defs);
      var tx = sv("text", { class: "sector-label", style: "--c:" + s.color }, svg);
      var tp = sv("textPath", { href: "#" + pid, startOffset: "50%", "text-anchor": "middle" }, tx);
      tp.textContent = s.name.toUpperCase() + "  " + s.tools.length;

      rings.forEach(function (ring, ri) {
        var cell = s.tools.filter(function (t) { return t.ring === ring.id; });
        if (!cell.length) return;
        var r0 = Math.max(R[ri] + dotSize + 4, 28), r1 = R[ri + 1] - dotSize - 4;
        var pad = (dotSize + 4) / ((r0 + r1) / 2);
        var b0 = a0 + pad, b1 = a1 - pad;
        var pts = cell.map(function (t) {
          var a = b0 + (b1 - b0) * hash(t.id + ring.id);
          var r = Math.sqrt(r0 * r0 + (r1 * r1 - r0 * r0) * hash(t.id + "r"));
          return { t: t, x: 500 + r * Math.cos(a), y: 500 + r * Math.sin(a) };
        });
        // Push overlapping dots apart, keeping each one inside its ring and sector.
        var min = dotSize * 2 + 3;
        for (var it = 0; it < 120; it++) {
          for (var p = 0; p < pts.length; p++) {
            for (var q = p + 1; q < pts.length; q++) {
              var ddx = pts[q].x - pts[p].x, ddy = pts[q].y - pts[p].y;
              var dd = Math.sqrt(ddx * ddx + ddy * ddy) || 0.01;
              if (dd < min) {
                var push = (min - dd) / 2, ux = ddx / dd, uy = ddy / dd;
                pts[p].x -= ux * push; pts[p].y -= uy * push;
                pts[q].x += ux * push; pts[q].y += uy * push;
              }
            }
          }
          pts.forEach(function (pt) {
            var vx = pt.x - 500, vy = pt.y - 500;
            var rr = clamp(Math.sqrt(vx * vx + vy * vy), r0, r1);
            var aa = Math.atan2(vy, vx);
            while (aa < b0 - 0.0001) aa += Math.PI * 2;
            while (aa > b0 + Math.PI * 2) aa -= Math.PI * 2;
            aa = clamp(aa, b0, b1);
            pt.x = 500 + rr * Math.cos(aa);
            pt.y = 500 + rr * Math.sin(aa);
          });
        }
        pts.forEach(function (pt) { placed.push(pt); });
      });
    });

    // Ring names up the north line.
    rings.forEach(function (ring, ri) {
      var y = 500 - (R[ri] + R[ri + 1]) / 2;
      sv("text", { x: 500, y: y + 4, class: "ring-label ring-" + ring.id, "text-anchor": "middle", text: ring.label.toUpperCase() }, svg);
    });

    var dots = sv("g", { class: "dots" }, svg);
    placed.forEach(function (pt, i) {
      var t = pt.t, f = FAM[t.fam];
      var on = matches(t);
      var g = sv("g", {
        class: "dot" + (on ? "" : " is-dim"),
        "data-id": t.id,
        "data-tip": "tool",
        tabindex: on ? 0 : -1,
        "aria-label": t.name + ", " + ringOf(t.ring).label,
        style: "--c:" + f.color + ";--d:" + Math.min(i * 3, 700) + "ms"
      }, dots);
      g.style.transform = "translate(" + pt.x + "px," + pt.y + "px)";
      sv("circle", { r: dotSize + 6, class: "hit" }, g);
      shape(t, dotSize, g);
    });
    if (focus || state.q) {
      var lab = labeler();
      placed.forEach(function (pt) {
        if (!matches(pt.t)) return;
        var spot = lab(pt.x, pt.y, pt.t.name, focus ? 13 : 11);
        if (spot) sv("text", { x: spot.x, y: spot.y, class: "dot-label" + (focus ? " dot-label-lg" : ""), text: pt.t.name }, svg);
      });
    }

    // A ring-by-ring list beside the radar. Hover a name to find its dot.
    // Beside the circle on wide windows; a closed "Tools by ring" section on narrow ones, so the
    // card never grows taller than the circle.
    var listWrap = el("details", { class: "radar-list-wrap" }, layout);
    el("summary", { text: "Tools by ring" }, listWrap);
    listWrap.open = window.matchMedia("(min-width: 900px)").matches;
    var aside = el("aside", { class: "radar-list" }, listWrap);
    var pool = focus ? TOOLS.filter(function (t) { return t.fam === focus.id; }) : TOOLS;
    rings.forEach(function (ring) {
      var inRing = pool.filter(function (t) { return t.ring === ring.id; });
      var sec = el("section", { class: "rl rl-" + ring.id }, aside);
      var h = el("h3", null, sec);
      el("span", { text: ring.label }, h);
      el("small", { text: inRing.length }, h);
      el("p", { class: "rl-help", text: ring.help }, sec);
      var ul = el("ul", null, sec);
      inRing
        .slice()
        .sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1; })
        .forEach(function (t) {
          var chip = el("li", {
            class: "chip" + (matches(t) ? "" : " is-dim"),
            "data-id": t.id,
            "data-tip": "tool",
            tabindex: 0,
            style: "--c:" + FAM[t.fam].color
          }, ul);
          if (LOGO[t.id]) chip.innerHTML = logoSpan(t.id);
          chip.appendChild(document.createTextNode(t.name));
        });
    });
  }

  // ---------- Lab ----------

  function renderLab() {
    // One grid, family by family. A family sub-tab shows only that family, so its tiles get bigger.
    var tools = state.sub ? TOOLS.filter(function (t) { return t.fam === state.sub; }) : TOOLS;
    var lab = el("div", { class: "lab" }, stage);
    tools.forEach(function (t, i) {
      var tile = el("div", {
        class: "tile ring-" + t.ring + (matches(t) ? "" : " is-dim") + (LOGO[t.id] ? " has-logo" : ""),
        "data-id": t.id,
        "data-tip": "tool",
        tabindex: 0,
        "aria-label": t.name + ", element " + t.n,
        style: "--c:" + FAM[t.fam].color + ";--d:" + Math.min(i * 3, 500) + "ms"
      }, lab);
      el("span", { class: "t-n", text: t.n }, tile);
      el("span", { class: "t-lic", text: LIC_SHORT[t.license] || "" }, tile);
      el("span", { class: "t-sym" + (t.sym.length > 2 ? " t-sym-3" : ""), text: t.sym }, tile);
      if (LOGO[t.id]) el("span", { class: logoClass(t.id) + " t-logo", style: "--logo:url(" + logoUrl(t.id) + ")" }, tile);
      el("span", { class: "t-name", text: t.name }, tile);
      el("span", { class: "t-formula", text: "E" + t.x / 10 + "·B" + t.y / 10 }, tile);
    });
    fitLab();
  }

  // Choose the column count that makes the tiles biggest while every tile still fits in the room
  // under the header, then show only as much detail as a tile of that size can hold.
  function fitLab() {
    var lab = stage.querySelector(".lab");
    if (!lab) return;
    var n = lab.children.length;
    var wrap = stage.parentNode;
    var cs = getComputedStyle(wrap);
    var w = wrap.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var top = wrap.getBoundingClientRect().top + window.scrollY;
    var h = window.innerHeight - top - 84 - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var gap = 4, best = { s: 0, c: 1 };
    for (var c = 1; c <= n; c++) {
      var rows = Math.ceil(n / c);
      var side = Math.min((w - (c - 1) * gap) / c, (h - (rows - 1) * gap) / rows);
      if (side > best.s) best = { s: side, c: c };
    }
    // Capped so a small family does not blow up into huge tiles.
    var size = Math.max(28, Math.min(64, Math.floor(best.s)));
    lab.style.setProperty("--tile", size + "px");
    lab.style.gridTemplateColumns = "repeat(" + best.c + ", " + size + "px)";
    lab.className = "lab " + (size < 42 ? "lab-xs" : size < 56 ? "lab-sm" : "lab-md");
  }

  // ---------- Journeys ----------

  function pill(id, kind, parent) {
    var t = BY_ID[id];
    if (!t) return el("span", { class: "pill pill-missing", text: id }, parent);
    var p = el("span", {
      class: "pill pill-" + kind + (matches(t) ? "" : " is-dim"),
      "data-id": t.id,
      "data-tip": "tool",
      tabindex: 0,
      style: "--fc:" + FAM[t.fam].color
    }, parent);
    var badge = el("b", LOGO[t.id] ? null : { text: t.sym }, p);
    if (LOGO[t.id]) badge.innerHTML = logoSpan(t.id);
    el("span", { text: t.name }, p);
    return p;
  }

  function renderJourneys() {
    var tracks = D.journeys.tracks;
    var tr = tracks.filter(function (t) { return t.id === state.sub; })[0] || tracks[0];
    var metro = el("div", { class: "metro", style: "--c:" + trackColor(tr.id) }, stage);
    var head = el("div", { class: "metro-head" }, metro);
    el("span", { class: "metro-badge", text: tr.name + " line" }, head);
    el("p", { text: tr.blurb }, head);

    D.journeys.levels.forEach(function (lv, i) {
      var stop = (tr.stops && tr.stops[lv.id]) || { main: [], side: [] };
      var row = el("section", { class: "station", style: "--d:" + i * 70 + "ms" }, metro);
      var rail = el("div", { class: "rail" }, row);
      el("span", {
        class: "node",
        "data-tip": "level",
        "data-level": lv.id,
        tabindex: 0,
        "aria-label": "Level " + lv.n + ": " + lv.name,
        text: lv.n
      }, rail);

      var body = el("div", { class: "station-body" }, row);
      el("p", { class: "lvl", text: "Level " + lv.n }, body);
      el("h3", { text: lv.name }, body);
      el("p", { class: "goal", text: lv.goal }, body);

      var line = el("div", { class: "line line-main" }, body);
      el("span", { class: "line-label", text: "On the line" }, line);
      (stop.main || []).forEach(function (id) { if (id !== "flisk") pill(id, "main", line); });
      // Flisk is on the line only where it does the job today (or part of it).
      var st = lv.flisk.status;
      if (st !== "soon") {
        var fl = el("span", {
          class: "pill pill-flisk fl-" + st,
          "data-tip": "flisk",
          "data-level": lv.id,
          tabindex: 0
        }, line);
        el("b", { text: "Fl" }, fl);
        el("span", { text: st === "partial" ? "Flisk · partly" : "Flisk" }, fl);
      }

      if (stop.side && stop.side.length) {
        var side = el("div", { class: "line line-side" }, body);
        el("span", { class: "line-label", text: "Branches" }, side);
        stop.side.forEach(function (id) { if (id !== "flisk") pill(id, "side", side); });
      }
      if (stop.tip) el("p", { class: "track-tip", text: stop.tip }, body);
    });
    var end = el("div", { class: "metro-end" }, metro);
    el("span", { class: "node node-end", text: "★" }, end);
    el("p", { text: "End of the line: you can design the paths other people walk." }, end);
  }

  // ---------- Roles: one loadout card per job ----------

  var ROLE_BY_ID = {};
  var SKILL_BY_ID = {};
  var SKILL_COLORS = ["#a78bfa", "#60a5fa", "#34d399", "#f87171", "#fbbf24", "#f472b6", "#22d3ee", "#fb923c", "#f43f5e", "#a3e635", "#2dd4bf", "#c084fc"];

  function prepExtra() {
    ((D.roles && D.roles.roles) || []).forEach(function (r) { ROLE_BY_ID[r.id] = r; });
    (D.skill_categories || []).forEach(function (c, i) { c.color = SKILL_COLORS[i % SKILL_COLORS.length]; });
    (D.skills || []).forEach(function (sk) { SKILL_BY_ID[sk.id] = sk; });
  }

  function roleTools(r) {
    return [].concat(r.core || [], r.daily || [], r.nice || []);
  }
  function roleMatches(r) {
    if (!state.q) return true;
    var q = state.q.toLowerCase();
    if ((r.name + " " + r.what).toLowerCase().indexOf(q) !== -1) return true;
    return roleTools(r).some(function (id) { var t = BY_ID[id]; return t && matches(t); });
  }
  function roleTip(r) {
    var g = (D.roles.groups || []).filter(function (x) { return x.id === r.group; })[0];
    return '<div class="tt-head"><div><strong>' + esc(r.name) + "</strong><span>" + esc(g ? g.name : "") + "</span></div></div>" +
      '<p class="tt-tag">' + esc(r.what) + "</p>" +
      '<p class="tt-sub">A normal day:</p><ul class="tt-day">' + (r.day || []).map(function (d) { return "<li>" + esc(d) + "</li>"; }).join("") + "</ul>";
  }

  function renderRoles() {
    var roles = ((D.roles && D.roles.roles) || []).filter(function (r) { return !state.sub || r.group === state.sub; });
    var grid = el("div", { class: "roles" }, stage);
    roles.forEach(function (r, i) {
      var card = el("article", { class: "role" + (roleMatches(r) ? "" : " is-dim"), style: "--d:" + Math.min(i * 30, 600) + "ms" }, grid);
      var head = el("header", { class: "role-head", "data-tip": "role", "data-role": r.id, tabindex: 0 }, card);
      el("h3", { text: r.name }, head);
      el("p", { text: r.what }, head);

      // The strip: which families this job leans on, weighted 3 / 2 / 1 for must have / daily / nice.
      var weight = {};
      [["core", 3], ["daily", 2], ["nice", 1]].forEach(function (k) {
        (r[k[0]] || []).forEach(function (id) { var t = BY_ID[id]; if (t) weight[t.fam] = (weight[t.fam] || 0) + k[1]; });
      });
      var total = Object.keys(weight).reduce(function (a, k) { return a + weight[k]; }, 0) || 1;
      var strip = el("div", { class: "role-strip", "aria-hidden": "true" }, card);
      D.families.forEach(function (f) {
        if (!weight[f.id]) return;
        el("span", { style: "--c:" + f.color + ";flex:" + weight[f.id], "data-tip": "text", "data-text": f.name + ": " + Math.round((weight[f.id] / total) * 100) + "% of this job's tools" }, strip);
      });

      [["core", "Must have"], ["daily", "Every day"], ["nice", "Good to know"]].forEach(function (k) {
        var ids = r[k[0]] || [];
        if (!ids.length) return;
        var row = el("div", { class: "slot slot-" + k[0] }, card);
        el("span", { class: "slot-label", text: k[1] }, row);
        var list = el("div", { class: "slot-items" }, row);
        ids.forEach(function (id) {
          var t = BY_ID[id];
          if (!t) return;
          var tok = el("span", { class: "tok" + (matches(t) ? "" : " is-dim"), "data-id": t.id, "data-tip": "tool", tabindex: 0, style: "--c:" + FAM[t.fam].color }, list);
          if (LOGO[t.id]) tok.innerHTML = logoSpan(t.id); else el("b", { text: t.sym }, tok);
          el("span", { text: t.name }, tok);
        });
      });
    });
    if (!roles.length) el("p", { class: "stage-error", text: "No roles yet." }, grid);
  }

  // ---------- Skills: a swarm, one lane per category, placed by the Haiku score ----------

  function skillMatches(sk) {
    if (!state.q) return true;
    var q = state.q.toLowerCase();
    return (sk.name + " " + sk.source + " " + sk.what).toLowerCase().indexOf(q) !== -1;
  }
  function skillScore(sk) {
    return sk.result ? sk.result.score : null;
  }
  function skillUrl(sk) {
    return "https://github.com/" + sk.source + "/blob/HEAD/" + sk.path;
  }
  function scoreClass(v) {
    return v == null ? "sc-none" : v >= 80 ? "sc-good" : v >= 50 ? "sc-mid" : "sc-bad";
  }
  function skillTip(sk) {
    if (!sk) return "";
    var cat = (D.skill_categories || []).filter(function (c) { return c.id === sk.cat; })[0];
    var r = sk.result;
    var stars = sk.repo_info && sk.repo_info.stars;
    var out = '<div class="tt-head" style="--c:' + esc(cat ? cat.color : "var(--accent)") + '"><div><strong>' + esc(sk.name) + "</strong><span>" + esc(sk.source) + (stars ? " · ★ " + fmtStars(stars) : "") + "</span></div>" +
      '<span class="tt-ring ' + scoreClass(skillScore(sk)) + '">' + (r ? r.score + "/100" : "not tested") + "</span></div>" +
      '<p class="tt-tag">' + esc(sk.what) + "</p>";
    if (r) {
      out += '<p class="tt-sub">Picked right: ' + r.picked + "/" + r.picked_of + "</p><ul class=\"tt-tests\">" +
        (r.routes || []).map(function (x) {
          return '<li class="' + (x.ok ? "ok" : "bad") + '">' + (x.ok ? "✓" : "✗") + " " + esc(x.prompt) +
            ' <span class="muted">' + (x.expect === "this" ? "should use it" : "should not") + (x.ok ? "" : ", Haiku picked " + esc(x.got || "none")) + "</span></li>";
        }).join("") + "</ul>" +
        '<p class="tt-sub">Followed right: ' + r.followed + "/" + r.followed_of + "</p>" +
        (r.follow ? '<ul class="tt-tests"><li class="' + (r.follow.ok ? "ok" : "bad") + '">' + (r.follow.ok ? "✓" : "✗") + " Haiku: " + esc(r.follow.answer) + '</li><li class="muted">Skill says: ' + esc(sk.eval && sk.eval.first_step) + "</li></ul>" : "");
    } else {
      out += '<p class="tt-note">Not tested yet. The next eval run will score it.</p>';
    }
    out += links([["SKILL.md", skillUrl(sk)], ["Repo", "https://github.com/" + sk.source]]);
    return out;
  }

  // Scores come in steps (points out of 5), so skills are drawn as tidy groups per score,
  // not a loose swarm: dot clusters per lane for all skills, a leaderboard for one category.
  function scoreBuckets(list) {
    var by = {};
    list.forEach(function (sk) { var k = skillScore(sk); k = k == null ? "none" : String(k); (by[k] = by[k] || []).push(sk); });
    Object.keys(by).forEach(function (k) {
      by[k].sort(function (a, b) { return ((b.repo_info && b.repo_info.stars) || 0) - ((a.repo_info && a.repo_info.stars) || 0) || (a.name < b.name ? -1 : 1); });
    });
    return by;
  }

  function renderSkills() {
    var all = (D.skills || []).filter(function (sk) { return !state.sub || sk.cat === state.sub; });
    if (!all.length) { el("p", { class: "stage-error", text: "No skills here yet." }, stage); return; }
    if (state.sub) { renderSkillBoard(all); return; }

    var cats = D.skill_categories || [];
    var tested = all.some(function (sk) { return skillScore(sk) != null; });
    var W = 1000, left = 150, right = 24, top = 30, laneH = 52, r = 4.2, step = 2 * r + 2.2;
    var H = top + cats.length * laneH + 30;
    var x0 = left + (tested ? 70 : 0), x1 = W - right - 40;
    var sx = function (v) { return x0 + (v / 100) * (x1 - x0); };
    var noneX = left + 30;
    var svg = sv("svg", { viewBox: "0 0 " + W + " " + H, class: "swarm" }, stage);

    for (var g = 0; g <= 100; g += 20) {
      sv("line", { x1: sx(g), y1: top - 4, x2: sx(g), y2: H - 24, class: "grid" + (g % 100 ? "" : " grid-strong") }, svg);
      sv("text", { x: sx(g), y: H - 8, class: "tick", "text-anchor": "middle", text: g }, svg);
    }
    sv("text", { x: W - right, y: 16, class: "axis-name", "text-anchor": "end", text: "Haiku used it right more often →" }, svg);
    var someUntested = all.some(function (sk) { return skillScore(sk) == null; });
    if (tested && someUntested) sv("text", { x: noneX, y: 16, class: "axis-name", "text-anchor": "middle", text: "not tested" }, svg);
    if (!tested) sv("text", { x: (x0 + x1) / 2, y: top + cats.length * laneH / 2, class: "swarm-wait", "text-anchor": "middle", text: "Scores are on their way: the Haiku test is running." }, svg);

    var dots = sv("g", { class: "dots" }, svg), n = 0;
    cats.forEach(function (c, li) {
      var y0 = top + li * laneH, rows = Math.max(1, Math.floor((laneH - 8) / step));
      sv("rect", { x: 0, y: y0, width: W, height: laneH, class: "lane" + (li % 2 ? " lane-alt" : "") }, svg);
      var mine = all.filter(function (sk) { return sk.cat === c.id; });
      var lab = sv("text", { x: 10, y: y0 + laneH / 2 + 4, class: "lane-label", style: "--c:" + c.color }, svg);
      lab.textContent = c.name;
      sv("text", { x: left - 8, y: y0 + laneH / 2 + 4, class: "tick", "text-anchor": "end", text: mine.length }, svg);
      if (!tested) return;
      var by = scoreBuckets(mine);
      Object.keys(by).forEach(function (k) {
        var list = by[k], cx = k === "none" ? noneX : sx(+k);
        var cols = Math.ceil(list.length / rows), usedRows = Math.min(rows, list.length);
        list.forEach(function (sk, i) {
          var col = Math.floor(i / rows), row = i % rows;
          var x = cx + (col - (cols - 1) / 2) * step;
          var y = y0 + laneH / 2 + (row - (usedRows - 1) / 2) * step;
          var on = skillMatches(sk);
          var gEl = sv("g", {
            class: "dot sdot " + scoreClass(skillScore(sk)) + (on ? "" : " is-dim"),
            "data-tip": "skill", "data-skill": sk.id, "data-id": "skill:" + sk.id, tabindex: on ? 0 : -1,
            "aria-label": sk.name + ", score " + (skillScore(sk) == null ? "not tested" : skillScore(sk)),
            style: "--c:" + c.color + ";--d:" + Math.min(n++ * 2, 700) + "ms"
          }, dots);
          gEl.style.transform = "translate(" + x + "px," + y + "px)";
          sv("circle", { r: r + 2.5, class: "hit" }, gEl);
          sv("circle", { r: r, class: "core" }, gEl);
        });
        if (list.length > 2 && k !== "none") sv("text", { x: cx + (cols / 2) * step + 6, y: y0 + laneH / 2 + 4, class: "tick", text: list.length }, svg);
      });
    });
  }

  // One category: a column per score, best first, each skill a readable chip.
  function renderSkillBoard(all) {
    var by = scoreBuckets(all);
    var keys = Object.keys(by).sort(function (a, b) { return (b === "none" ? -1 : +b) - (a === "none" ? -1 : +a); });
    var board = el("div", { class: "board" }, stage);
    keys.forEach(function (k, ci) {
      var col = el("section", { class: "board-col " + scoreClass(k === "none" ? null : +k), style: "--d:" + ci * 60 + "ms" }, board);
      var h = el("h3", null, col);
      el("b", { text: k === "none" ? "Not tested" : k }, h);
      el("span", { text: k === "none" ? "" : "/100 · " + by[k].length }, h);
      var list = el("div", { class: "board-list" }, col);
      // While searching, matches go to the top of each column so you don't have to scroll for them.
      var rows = state.q ? by[k].filter(skillMatches).concat(by[k].filter(function (sk) { return !skillMatches(sk); })) : by[k];
      rows.forEach(function (sk) {
        var on = skillMatches(sk);
        var chip = el("div", { class: "skill-chip" + (on ? "" : " is-dim"), "data-tip": "skill", "data-skill": sk.id, "data-id": "skill:" + sk.id, tabindex: 0 }, list);
        el("strong", { text: sk.name }, chip);
        el("span", { text: sk.source.split("/")[0] + (sk.repo_info && sk.repo_info.stars ? " · ★ " + fmtStars(sk.repo_info.stars) : "") }, chip);
      });
    });
  }

  // ---------- Ask: type a question, get a comparison from the data ----------

  var ASK_EXAMPLES = [
    "compare yarn vs npm vs bun",
    "tilt vs skaffold vs garden",
    "langgraph or mastra or crewai?",
    "best package manager",
    "docker desktop vs orbstack vs colima",
    "terraform vs opentofu vs pulumi",
    "agent framework for a small team",
    "flisk vs tilt vs docker compose",
    "best tool to run many services locally"
  ];
  var ALIAS = {
    k8s: "kubernetes", compose: "docker-compose", gha: "github-actions", tf: "terraform", tofu: "opentofu",
    claude: "claude-code", copilot: "github-copilot", node: "npm", "docker desktop": "docker-desktop",
    "gh actions": "github-actions", "github actions": "github-actions", argo: "argo-cd", argocd: "argo-cd",
    "vs code": "dev-containers", devcontainer: "dev-containers", devcontainers: "dev-containers", gemini: "gemini-cli"
  };
  var STOP = /^(compare|comparison|vs|versus|or|and|with|which|what|is|are|the|a|an|for|to|of|me|my|i|we|should|use|better|best|good|tool|tools|than|between|team|small|big|local|locally|please|show|run|many|services|\?)$/;

  function norm(x) {
    return String(x || "").toLowerCase().replace(/\.js\b/g, "js").replace(/[^a-z0-9+]+/g, " ").trim();
  }
  var NAME_INDEX = null;
  function nameIndex() {
    if (NAME_INDEX) return NAME_INDEX;
    NAME_INDEX = {};
    TOOLS.forEach(function (t) {
      [t.name, t.id, t.id.replace(/-/g, " "), t.name.replace(/\(.*?\)/g, "")].forEach(function (k) {
        var n = norm(k);
        if (n && !NAME_INDEX[n]) NAME_INDEX[n] = t.id;
      });
    });
    Object.keys(ALIAS).forEach(function (k) { if (BY_ID[ALIAS[k]]) NAME_INDEX[norm(k)] = ALIAS[k]; });
    return NAME_INDEX;
  }
  // Words in a question that point at a checklist item, so "for laptops" or "new hires" change the ranking.
  var NEEDS = [
    [/laptop|ram|memory|lightweight|light\b|battery|slow machine/, "dx", "light"],
    [/onboard|new hire|junior|day one|beginner|learn/, "dx", "docs"],
    [/onboard|new hire|zero.?config|quick setup|easy setup/, "dx", "zero-config"],
    [/windows|cross.?platform|mixed team/, "dx", "cross-platform"],
    [/hot reload|live reload|fast feedback|inner loop|iterate/, "dx", "fast-feedback"],
    [/\bui\b|dashboard|visual/, "dx", "ui"],
    [/offline|no account|air.?gap|privacy/, "dx", "offline"],
    [/\bmcp\b|ai can drive|agent.?ready|for (my |our )?(coding )?agents? to use|drive it with (an )?ai/, "dx", "agent-ready"],
    [/kubernetes|k8s|helm|cluster/, "parity", "k8s"],
    [/microservice|many services|multi.?service/, "parity", "multi-service"],
    [/database|postgres|mysql|queue|state|durable/, "parity", "state"],
    [/\baws\b|gcp|azure|cloud/, "parity", "cloud-apis"],
    [/secret|config|compliance/, "parity", "config-secrets"],
    [/observab|tracing|metrics|logs\b/, "parity", "observability"],
    [/big team|large team|enterprise|\d{2,} (engineers|devs|developers|people)|org\b|organization/, "parity", "team-scale"]
  ];
  function needsOf(q) {
    var t = " " + String(q || "").toLowerCase() + " ", out = [];
    NEEDS.forEach(function (n) {
      if (n[0].test(t) && !out.some(function (o) { return o.id === n[2]; })) {
        var c = D.rubric[n[1]].criteria.filter(function (x) { return x.id === n[2]; })[0];
        if (c) out.push({ axis: n[1], id: n[2], label: c.label });
      }
    });
    return out;
  }
  function has(t, need) {
    return (need.axis === "dx" ? t.dx : t.parity).indexOf(need.id) !== -1;
  }

  // Edit distance, for typos like "scaffol" or "terrafrom".
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    var d = [];
    for (var i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (var j = 1; j <= b.length; j++) d[0][j] = j;
    for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  function fuzzy(word) {
    if (word.length < 4 || STOP.test(word)) return null;
    var idx = nameIndex(), limit = word.length <= 5 ? 1 : 2, best = null, bd = limit + 1;
    Object.keys(idx).forEach(function (k) {
      if (k.indexOf(" ") !== -1 || k.length < 3) return;
      var d = lev(word, k);
      if (d < bd) { bd = d; best = idx[k]; }
    });
    return bd <= limit ? best : null;
  }

  // Longest match first: "docker compose watch" beats "docker compose" beats "docker".
  // Words after "for" are context ("for k8s dev", "for our monorepo"), not more tools to compare.
  function findTools(text) {
    var main = text;
    var m = /^(.*?\S)\s+(?:for|on|in|with|at)\s+(.+)$/i.exec(text);
    if (m && scan(m[1], false).length >= 1) main = m[1];
    var found = scan(main, true);
    return found;
  }
  function scan(text, allowFuzzy) {
    var words = norm(text).split(" ").filter(Boolean), idx = nameIndex(), found = [];
    for (var i = 0; i < words.length;) {
      var hit = null, len = 0;
      for (var n = Math.min(4, words.length - i); n >= 1; n--) {
        var key = words.slice(i, i + n).join(" ");
        if (idx[key] && !(n === 1 && STOP.test(key))) { hit = idx[key]; len = n; break; }
      }
      if (!hit && allowFuzzy) { hit = fuzzy(words[i]); len = 1; }
      if (hit) { if (found.indexOf(hit) === -1) found.push(hit); i += len; } else i++;
    }
    return found;
  }
  // "package manager", "local kubernetes", "agent framework": match a category (singular or plural).
  function findCategory(text) {
    var q = " " + norm(text) + " ", best = null;
    D.families.forEach(function (f) {
      f.cats.forEach(function (c) {
        var n = norm(c), sing = n.replace(/s\b/g, "");
        if (q.indexOf(" " + n + " ") !== -1 || q.indexOf(" " + sing + " ") !== -1 || q.indexOf(" " + sing) !== -1) {
          if (!best || n.length > best.n.length) best = { fam: f, cat: c, n: n };
        }
      });
    });
    if (!best && /many services|multi.?service|microservice/.test(q)) best = { fam: FAM["inner-loop"], cat: "Live-update loops", n: "" };
    if (!best && /\bmcp\b/.test(q)) best = { fam: FAM.agents, cat: "Agent tools and MCP", n: "" };
    if (!best && /coding (agent|assistant)|ai (coding|editor)/.test(q)) best = { fam: FAM.agents, cat: "Coding agents", n: "" };
    return best;
  }
  function rank(t, needs) {
    var ring = { adopt: 30, trial: 15, assess: 5, hold: -40 }[t.ring] || 0;
    var fit = (needs || []).filter(function (n) { return has(t, n); }).length * 25;
    return t.x + t.y + ring + fit - (t.reference ? 1000 : 0);
  }

  // Verdict cards that say who wins, or who is tied and at what.
  function verdicts(tools) {
    function top(key, label, fmt) {
      var vals = tools.map(key), best = Math.max.apply(null, vals);
      var winners = tools.filter(function (t) { return key(t) === best; });
      var who = winners.length === tools.length ? (tools.length === 2 ? "Both" : "All " + tools.length) : winners.map(function (t) { return esc(t.name); }).join(" = ");
      return "<li><span>" + label + "</span><b>" + who + "</b> <span class=\"muted\">" + fmt(winners[0]) + (winners.length > 1 ? " each" : "") + "</span></li>";
    }
    var ringOrder = { adopt: 3, trial: 2, assess: 1, hold: 0 };
    var out = [
      top(function (t) { return t.x; }, "Easiest to use", function (t) { return t.x + "/100"; }),
      top(function (t) { return t.y; }, "Made for the biggest systems", function (t) { return t.y + "/100"; }),
      top(function (t) { return ringOrder[t.ring] || 0; }, "Safest to adopt", function (t) { return ringOf(t.ring).label + ": " + ringWord(t.ring); })
    ];
    if (tools.every(gh)) out.push(top(function (t) { return gh(t).stars; }, "Most GitHub stars", function (t) { return "★ " + fmtStars(gh(t).stars); }));
    return '<ul class="ask-verdicts">' + out.join("") + "</ul>";
  }
  function ringWord(r) {
    return { adopt: "use it", trial: "try it", assess: "watch it", hold: "avoid for now" }[r] || "";
  }
  function labelsOf(t, axis, ids) {
    return D.rubric[axis].criteria.filter(function (c) { return ids.indexOf(c.id) !== -1; }).map(function (c) { return c.label; });
  }
  // What only this tool has, among the ones shown: the honest "pick it if".
  function edges(t, tools) {
    var others = tools.filter(function (o) { return o !== t; });
    var only = function (axis, list) {
      return list.filter(function (id) { return others.every(function (o) { return (axis === "dx" ? o.dx : o.parity).indexOf(id) === -1; }); });
    };
    return labelsOf(t, "dx", only("dx", t.dx)).concat(labelsOf(t, "parity", only("parity", t.parity)));
  }
  function watchOut(t) {
    var w = [];
    if (t.ring === "hold") w.push("in Hold: avoid for now");
    if (t.license === "paid") w.push("paid");
    else if (t.license === "freemium") w.push("free tier, paid plans");
    var g = gh(t);
    if (g && g.archived) w.push("repo archived on GitHub");
    return w;
  }

  // The bottom line: a best match for the question when it names a need, then one line per tool.
  function bottomLine(tools, needs, question) {
    var html = '<div class="ask-bottom"><h3>Bottom line</h3>';
    // Overall on the checklist: who leads, and by how much, so a 5-point lead does not read like a 50-point one.
    var total = function (t) { return t.x + t.y; };
    var byTotal = tools.slice().sort(function (a, b) { return total(b) - total(a); });
    var lead = total(byTotal[0]) - total(byTotal[1] || byTotal[0]);
    var cats = tools.map(function (t) { return t.cat; }).filter(function (c, i, a) { return a.indexOf(c) === i; });
    // Tools that do different jobs: a summed score would crown a "winner" that does not replace the other.
    if (cats.length > 1) html += '<p class="ask-overall ask-mixed">These do different jobs (' + cats.map(function (c) { return esc(c.toLowerCase()); }).join(", ") + "), so one does not replace the other. Use the score to see what each is built for, not who wins.</p>";
    else html += '<p class="ask-overall">' + (tools.length < 2 ? "" : lead === 0
      ? "On the checklist, <b>" + esc(byTotal[0].name) + "</b> and <b>" + esc(byTotal[1].name) + "</b> are level at " + total(byTotal[0]) + " of 200. Decide on the lines below."
      : "On the checklist, <b>" + esc(byTotal[0].name) + "</b> leads with " + total(byTotal[0]) + " of 200, " + lead + " ahead of " + esc(byTotal[1].name) +
        (lead <= 10 ? ": a close call, so the lines below matter more than the score." : lead <= 30 ? ": a clear but not huge lead." : ": a big lead.")) + "</p>";
    if (needs.length) {
      var scored = tools.map(function (t) { return { t: t, n: needs.filter(function (n) { return has(t, n); }).length }; });
      var max = Math.max.apply(null, scored.map(function (x) { return x.n; }));
      var best = scored.filter(function (x) { return x.n === max; }).map(function (x) { return x.t; }).sort(function (a, b) { return rank(b) - rank(a); });
      html += '<p class="ask-fit">You asked about <b>' + needs.map(function (n) { return esc(n.label.toLowerCase()); }).join(", ") + "</b>. " +
        (max === 0 ? "None of these tools checks that box." :
          "Best fit: <b>" + esc(best[0].name) + "</b>" + (best.length > 1 ? " (tied with " + best.slice(1).map(function (t) { return esc(t.name); }).join(", ") + ", ahead on overall score)" : "") + ", " + max + " of " + needs.length + ".") + "</p>";
    }
    html += '<ul class="ask-picks">' + tools.map(function (t) {
      var e = edges(t, tools), w = watchOut(t);
      return '<li><b>' + esc(t.name) + '</b> <span class="tt-ring ring-' + esc(t.ring) + '">' + ringOf(t.ring).label + "</span> " +
        (e.length ? "Pick it if you want: " + e.slice(0, 4).map(esc).join(", ") + "." : '<span class="muted">Nothing on the checklist that the others lack.</span>') +
        (w.length ? ' <span class="ask-warn">Watch out: ' + w.map(esc).join(", ") + ".</span>" : "") +
        (t.note ? ' <span class="muted">' + esc(t.note) + "</span>" : "") + "</li>";
    }).join("") + "</ul>";
    html += '<p class="ask-legend">Scores are out of 100: 10 points per check, from a public checklist. Adopt = use it, Trial = try it, Assess = watch it, Hold = avoid for now. ' +
      "Not covered here: pricing, benchmarks, migration effort. Ask your AI below with this data for those.</p></div>";
    return html;
  }

  // "Should we move from A to B": what you gain and what you lose.
  function switchView(from, to) {
    var gain = labelsOf(to, "dx", to.dx.filter(function (id) { return from.dx.indexOf(id) === -1; }))
      .concat(labelsOf(to, "parity", to.parity.filter(function (id) { return from.parity.indexOf(id) === -1; })));
    var lose = labelsOf(from, "dx", from.dx.filter(function (id) { return to.dx.indexOf(id) === -1; }))
      .concat(labelsOf(from, "parity", from.parity.filter(function (id) { return to.parity.indexOf(id) === -1; })));
    var li = function (x) { return "<li>" + esc(x) + "</li>"; };
    return '<div class="ask-switch"><div class="gain"><h3>You gain</h3><ul>' + (gain.length ? gain.map(li).join("") : "<li class=\"muted\">Nothing new on the checklist</li>") + "</ul></div>" +
      '<div class="lose"><h3>You lose</h3><ul>' + (lose.length ? lose.map(li).join("") : "<li class=\"muted\">Nothing on the checklist</li>") + "</ul></div></div>" +
      (to.note ? '<p class="ask-legend"><b>' + esc(to.name) + ":</b> " + esc(to.note) + "</p>" : "");
  }

  function aiPrompt(question, tools, needs) {
    var lines = tools.map(function (t) {
      return "- " + t.name + ": " + t.tagline + ". Ring: " + ringOf(t.ring).label + ". Easy to use " + t.x + "/100 (" + labelsOf(t, "dx", t.dx).join(", ") + "). Made for big, real systems " + t.y + "/100 (" + labelsOf(t, "parity", t.parity).join(", ") + ")." + (t.note ? " Caveat: " + t.note : "");
    });
    return question + "\n\nData from roadmap.flisk.si (community-edited, checklist scores):\n" + lines.join("\n") +
      (needs && needs.length ? "\nWhat I care about: " + needs.map(function (n) { return n.label; }).join(", ") + "." : "") +
      "\n\nAs a tech lead, which should my team pick, and why? Cover what this data does not: pricing, performance, migration effort. Ask me about our team size, stack and constraints if it changes the answer.";
  }
  function aiRow(prompt) {
    return '<div class="ask-ai"><span>Want an opinion? Ask your AI:</span>' +
      '<a class="btn" target="_blank" rel="noopener" href="https://chatgpt.com/?q=' + encodeURIComponent(prompt) + '">ChatGPT</a>' +
      '<a class="btn" target="_blank" rel="noopener" href="https://claude.ai/new?q=' + encodeURIComponent(prompt) + '">Claude</a>' +
      '<button type="button" class="btn" data-copy="' + esc(prompt) + '">Copy prompt</button></div>';
  }

  function answer(question) {
    var box = document.getElementById("ask-out");
    if (!box) return;
    question = String(question || "").trim();
    if (!question) { box.innerHTML = ""; return; }
    var needs = needsOf(question);
    var ids = findTools(question);
    var cat = findCategory(question);
    // "best local kubernetes": a category asked as a question beats one tool that happens to match a word of it.
    if (ids.length === 1 && cat && /\b(best|top|which|good|recommend|pick)\b/i.test(question)) ids = [];
    var isSwitch = ids.length === 2 && /\b(from|move|moving|migrate|migrating|switch|switching|replace|leave)\b/i.test(question);
    var cmdLink = function (list) {
      var u = cmdUrl(list);
      return u ? '<a class="btn" target="_blank" rel="noopener" href="' + esc(u) + '">Compare their commands ↗</a>' : "";
    };
    var compassLink = function (list) {
      return '<a class="btn" href="' + base + "/compass/?compare=" + list.map(encodeURIComponent).join(",") + '">See them on the Compass</a>';
    };
    var tools, head, sub = "";
    if (ids.length >= 2) {
      tools = ids.slice(0, 5).map(function (id) { return BY_ID[id]; });
      head = isSwitch ? "Moving from " + esc(tools[0].name) + " to " + esc(tools[1].name)
        : tools.map(function (t) { return esc(t.name); }).join(" <span>vs</span> ");
      if (ids.length > 5) sub = "Showing the first 5 tools you named.";
    } else if (ids.length === 1) {
      var t0 = BY_ID[ids[0]];
      tools = [t0].concat(TOOLS.filter(function (x) { return x.cat === t0.cat && x.id !== t0.id; }).sort(function (a, b) { return rank(b, needs) - rank(a, needs); }).slice(0, 4));
      head = esc(t0.name) + " <span>and its closest alternatives</span>";
      sub = "Same category: " + esc(t0.cat) + ". Name two or more tools to compare only those.";
    } else if (cat) {
      tools = TOOLS.filter(function (x) { return x.cat === cat.cat; }).sort(function (a, b) { return rank(b, needs) - rank(a, needs); }).slice(0, 5);
      head = "Top " + esc(cat.cat.toLowerCase());
      sub = "Ranked by easy to use + made for big systems, plus a bonus for Adopt" + (needs.length ? " and for " + needs.map(function (n) { return esc(n.label.toLowerCase()); }).join(", ") : "") + ". Tools in Hold sink.";
    } else {
      box.innerHTML = '<p class="ask-none">No tools found in that. Name them, like <b>yarn vs npm</b>, or a kind of tool, like <b>agent framework</b>.</p>';
      return;
    }
    var list = tools.map(function (t) { return t.id; });
    var html = '<h2 class="ask-title">' + head + "</h2>" + (sub ? '<p class="muted">' + sub + "</p>" : "");
    html += isSwitch ? switchView(tools[0], tools[1]) : "";
    html += verdicts(tools) + bottomLine(tools, needs, question);
    html += '<div class="ask-actions">' + compassLink(list) + cmdLink(list) +
      '<label class="cmp-diff"><input type="checkbox" id="ask-all"> Show every check, not only differences</label></div>';
    html += '<div class="cmp-scroll ask-table only-diff" id="ask-table">' + panelTable(tools) + "</div>";
    html += aiRow(aiPrompt(question, tools, needs));
    box.innerHTML = html;
    box.querySelectorAll(".cmp-rm").forEach(function (b) { b.remove(); });
    var all = box.querySelector("#ask-all");
    if (all) all.addEventListener("change", function () { box.querySelector("#ask-table").classList.toggle("only-diff", !all.checked); });
  }

  function typewriter(input, phrases) {
    var still = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still) { input.placeholder = phrases[0]; return; }
    var i = 0, n = 0, deleting = false, timer = null;
    function idle() { return document.activeElement !== input && !input.value; }
    function tick() {
      if (!document.body.contains(input)) return;
      if (!idle()) { timer = null; input.placeholder = phrases[i % phrases.length]; return; }
      var word = phrases[i % phrases.length];
      n += deleting ? -1 : 1;
      input.placeholder = word.slice(0, n) + (deleting || n < word.length ? "|" : "");
      var wait = deleting ? 28 : 55 + Math.random() * 55;
      if (!deleting && n >= word.length) { deleting = true; wait = 1600; input.placeholder = word; }
      else if (deleting && n <= 0) { deleting = false; i++; wait = 350; }
      timer = setTimeout(tick, wait);
    }
    input.addEventListener("focus", function () { clearTimeout(timer); timer = null; input.placeholder = phrases[i % phrases.length]; });
    input.addEventListener("blur", function () { if (!timer && !input.value) { n = 0; deleting = false; timer = setTimeout(tick, 600); } });
    timer = setTimeout(tick, 500);
  }

  function askFromUrl() {
    var q = "";
    try { q = new URLSearchParams(location.search).get("q") || ""; } catch (e) {}
    var input = document.getElementById("ask-q");
    if (input) input.value = q;
    answer(q);
  }

  function renderAsk() {
    var wrap = el("div", { class: "ask" }, stage);
    var form = el("form", { class: "ask-form", role: "search" }, wrap);
    el("span", { class: "ask-spark", "aria-hidden": "true", text: "✦" }, form);
    var input = el("input", { id: "ask-q", type: "search", autocomplete: "off", spellcheck: "false", "aria-label": "Ask: what do you want to compare?" }, form);
    el("button", { type: "submit", class: "ask-go", text: "Compare" }, form);
    var chips = el("div", { class: "ask-chips" }, wrap);
    ASK_EXAMPLES.slice(0, 6).forEach(function (ex) { el("button", { type: "button", class: "ask-chip", "data-ask": ex, text: ex }, chips); });
    el("div", { id: "ask-out", class: "ask-out", "aria-live": "polite" }, wrap);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      history.replaceState(history.state, "", location.pathname + (input.value.trim() ? "?q=" + encodeURIComponent(input.value.trim()) : ""));
      answer(input.value);
    });
    chips.addEventListener("click", function (e) {
      var b = e.target.closest("[data-ask]");
      if (!b) return;
      input.value = b.getAttribute("data-ask");
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit"));
    });
    wrap.addEventListener("click", function (e) {
      var c = e.target.closest("[data-copy]");
      if (!c) return;
      var text = c.getAttribute("data-copy");
      var done = function () { c.textContent = "Copied"; setTimeout(function () { c.textContent = "Copy prompt"; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { window.prompt("Copy this prompt", text); });
      else window.prompt("Copy this prompt", text);
    });
    typewriter(input, ASK_EXAMPLES);
    askFromUrl();
  }

  // ---------- Portfolio: rate the tools you know, get a role and a shareable page ----------

  var LEVELS = ["Don't know", "Used it", "Use it often", "Expert"];
  var ME = {};          // tool id -> 1..3 (0 is not stored)
  var ME_NAME = "";
  // pages.flisk.si publishes through a pull request to flisk-sh/pages: the button opens GitHub's
  // prefilled "new file" page for spaces/<login>/<slug>/index.md, and a bot publishes it at
  // https://pages.flisk.si/@<login>/<slug>/. Flip PAGES_LIVE once that repo and its workflow are live.
  var PAGES_LIVE = true;
  var PAGES_REPO = "flisk-sh/pages";
  var ME_LOGIN = "", ME_SLUG = "portfolio";

  function loadMe() {
    var p;
    try { p = new URLSearchParams(location.search); } catch (e) { p = null; }
    ME = {};
    var fromUrl = p && p.get("me");
    var raw = fromUrl;
    if (!raw) { try { raw = localStorage.getItem("roadmap-me") || ""; } catch (e) { raw = ""; } }
    String(raw || "").split(",").forEach(function (pair) {
      var m = /^([a-z0-9-]+?)([1-3])$/.exec(pair.trim());
      if (m && BY_ID[m[1]]) ME[m[1]] = +m[2];
    });
    ME_NAME = (p && p.get("name")) || (function () { try { return localStorage.getItem("roadmap-me-name") || ""; } catch (e) { return ""; } })();
    try { ME_LOGIN = localStorage.getItem("roadmap-me-login") || ""; ME_SLUG = localStorage.getItem("roadmap-me-slug") || "portfolio"; } catch (e) {}
  }
  function meString() {
    return Object.keys(ME).sort().map(function (id) { return id + ME[id]; }).join(",");
  }
  var saveTimer = null;
  function saveMe() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveMeNow, 250);
  }
  function saveMeNow() {
    try {
      localStorage.setItem("roadmap-me", meString()); localStorage.setItem("roadmap-me-name", ME_NAME);
      localStorage.setItem("roadmap-me-login", ME_LOGIN); localStorage.setItem("roadmap-me-slug", ME_SLUG);
    } catch (e) {}
    var qs = [];
    if (ME_NAME) qs.push("name=" + encodeURIComponent(ME_NAME));
    if (meString()) qs.push("me=" + meString());
    history.replaceState(history.state, "", location.pathname + (qs.length ? "?" + qs.join("&") : ""));
  }
  function shareUrl() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; saveMeNow(); }
    var qs = [];
    if (ME_NAME) qs.push("name=" + encodeURIComponent(ME_NAME));
    qs.push("me=" + meString());
    return location.origin + base + "/portfolio/?" + qs.join("&");
  }

  // How well your ratings fit each role: must have counts 3, every day 2, good to know 1,
  // each scaled by your level out of 3.
  function roleFit() {
    return ((D.roles && D.roles.roles) || []).map(function (r) {
      var got = 0, max = 0, gaps = [];
      [["core", 3], ["daily", 2], ["nice", 1]].forEach(function (k) {
        (r[k[0]] || []).forEach(function (id) {
          if (!BY_ID[id]) return;
          max += k[1] * 3;
          got += k[1] * (ME[id] || 0);
          if (k[0] === "core" && !ME[id]) gaps.push(id);
        });
      });
      return { r: r, pct: max ? Math.round((got / max) * 100) : 0, gaps: gaps };
    }).sort(function (a, b) { return b.pct - a.pct; });
  }
  function familyShape() {
    return D.families.map(function (f) {
      var tools = TOOLS.filter(function (t) { return t.fam === f.id; });
      var sum = tools.reduce(function (a, t) { return a + (ME[t.id] || 0); }, 0);
      var known = tools.filter(function (t) { return ME[t.id]; }).length;
      return { f: f, sum: sum, known: known };
    });
  }

  // A spider chart of the 8 families; the shape is the point, so it is scaled to your strongest one.
  function spiderSvg(shape, size) {
    var c = size / 2, R = size / 2 - 34, n = shape.length;
    var max = Math.max(3, Math.max.apply(null, shape.map(function (s) { return s.sum; })));
    var pt = function (i, v) { var a = -Math.PI / 2 + (i / n) * Math.PI * 2; return [c + Math.cos(a) * R * v, c + Math.sin(a) * R * v]; };
    var out = '<svg viewBox="0 0 ' + size + " " + size + '" class="spider" role="img" aria-label="Skill shape across tool families">';
    [0.25, 0.5, 0.75, 1].forEach(function (k) {
      out += '<polygon class="spider-ring" points="' + shape.map(function (s, i) { return pt(i, k).join(","); }).join(" ") + '"/>';
    });
    shape.forEach(function (s, i) {
      var e = pt(i, 1), l = pt(i, 1.16);
      out += '<line class="spider-axis" x1="' + c + '" y1="' + c + '" x2="' + e[0] + '" y2="' + e[1] + '"/>';
      out += '<text class="spider-label" x="' + l[0] + '" y="' + (l[1] + 4) + '" text-anchor="middle" style="fill:' + esc(s.f.color) + '">' + esc(s.f.name.split(" ")[0]) + "</text>";
    });
    out += '<polygon class="spider-shape" points="' + shape.map(function (s, i) { return pt(i, s.sum / max).join(","); }).join(" ") + '"/>';
    shape.forEach(function (s, i) {
      var p = pt(i, s.sum / max);
      if (s.sum) out += '<circle class="spider-dot" cx="' + p[0] + '" cy="' + p[1] + '" r="4" style="fill:' + esc(s.f.color) + '"/>';
    });
    return out + "</svg>";
  }

  var meLoaded = false;
  function renderPortfolio() {
    // Read the link (or this browser's saved ratings) once; after that the ratings in memory are the truth,
    // so a re-render never brings back ratings from a URL the delayed save has not rewritten yet.
    if (!meLoaded) { loadMe(); meLoaded = true; }
    var wrap = el("div", { class: "pf" }, stage);
    var left = el("section", { class: "pf-rate" }, wrap);
    var head = el("div", { class: "pf-rate-head" }, left);
    el("p", { class: "pf-help", text: "Click a tool to rate it: 1 used it, 2 use it often, 3 expert. Click again to go up; after 3 it resets. Or focus a tile and press 0 to 3." }, head);
    var legend = el("div", { class: "pf-legend" }, head);
    LEVELS.forEach(function (l, i) { var s = el("span", { class: "pf-lv lv" + i }, legend); el("b", { text: i }, s); el("span", { text: l }, s); });
    var grid = el("div", { class: "pf-grid" }, left);
    var list = (state.sub ? TOOLS.filter(function (t) { return t.fam === state.sub; }) : TOOLS).slice()
      .sort(function (a, b) { return (gh(b) ? gh(b).stars : 0) - (gh(a) ? gh(a).stars : 0); });
    list.forEach(function (t) {
      var lv = ME[t.id] || 0;
      var tile = el("button", {
        type: "button", class: "pf-tile lv" + lv + (matches(t) ? "" : " is-dim"),
        "data-id": t.id, "data-tip": "tool", "data-rate": t.id, style: "--c:" + FAM[t.fam].color,
        "aria-label": t.name + ": " + LEVELS[lv]
      }, grid);
      if (LOGO[t.id]) tile.insertAdjacentHTML("beforeend", logoSpan(t.id)); else el("b", { text: t.sym }, tile);
      el("span", { class: "pf-name", text: t.name }, tile);
      var pips = el("span", { class: "pf-pips", "aria-hidden": "true" }, tile);
      for (var i = 1; i <= 3; i++) el("i", { class: i <= lv ? "on" : "" }, pips);
    });
    el("aside", { class: "pf-card", id: "pf-card" }, wrap);
    drawCard();

    grid.addEventListener("click", function (e) {
      var b = e.target.closest("[data-rate]");
      if (!b) return;
      setLevel(b.getAttribute("data-rate"), ((ME[b.getAttribute("data-rate")] || 0) + 1) % 4);
    });
    grid.addEventListener("keydown", function (e) {
      var b = e.target.closest("[data-rate]");
      if (!b || !/^[0-3]$/.test(e.key)) return;
      e.preventDefault();
      setLevel(b.getAttribute("data-rate"), +e.key);
    });
  }

  function setLevel(id, lv) {
    if (lv) ME[id] = lv; else delete ME[id];
    var b = stage.querySelector('[data-rate="' + id + '"]');
    if (b) {
      b.className = b.className.replace(/\blv\d\b/, "lv" + lv);
      b.setAttribute("aria-label", BY_ID[id].name + ": " + LEVELS[lv]);
      b.querySelectorAll(".pf-pips i").forEach(function (p, i) { p.className = i < lv ? "on" : ""; });
    }
    saveMe();
    drawCard();
  }

  function drawCard() {
    var card = document.getElementById("pf-card");
    if (!card) return;
    var rated = Object.keys(ME).length;
    var html = '<label class="pf-namebox">Your name <input id="pf-name" type="text" maxlength="60" autocomplete="name" placeholder="Shown on your page" value="' + esc(ME_NAME) + '"></label>';
    if (!rated) {
      html += '<div class="pf-empty"><h3>Your developer profile</h3><p>Rate the tools you know on the left. Your best-fit role, your skill shape and a page you can share appear here as you go.</p>' +
        '<button type="button" class="btn" data-pf="example">Show me an example</button></div>';
      card.innerHTML = html;
      return;
    }
    var fit = roleFit(), top = fit[0], shape = familyShape();
    var experts = Object.keys(ME).filter(function (id) { return ME[id] === 3; }).map(function (id) { return BY_ID[id]; });
    html += '<h3 class="pf-role-label">Best fit</h3>';
    html += '<p class="pf-role"><b>' + esc(top.r.name) + "</b> <span>" + top.pct + "% match</span></p>";
    html += '<p class="pf-role-what">' + esc(top.r.what) + "</p>";
    html += '<ol class="pf-roles">' + fit.slice(1, 4).map(function (x) { return "<li>" + esc(x.r.name) + " <span>" + x.pct + "%</span></li>"; }).join("") + "</ol>";
    if (top.gaps.length) {
      html += '<p class="pf-sub">Must-haves to learn for ' + esc(top.r.name) + ":</p><div class=\"pf-gaps\">" +
        top.gaps.map(function (id) { return '<span class="tok" data-id="' + esc(id) + '" data-tip="tool" tabindex="0" style="--c:' + esc(FAM[BY_ID[id].fam].color) + '">' + (LOGO[id] ? logoSpan(id) : "<b>" + esc(BY_ID[id].sym) + "</b>") + "<span>" + esc(BY_ID[id].name) + "</span></span>"; }).join("") + "</div>";
    }
    html += '<h3 class="pf-sub">Your skill shape</h3>' + spiderSvg(shape, 280);
    if (experts.length) html += '<p class="pf-sub">Expert in</p><p class="pf-experts">' + experts.map(function (t) { return esc(t.name); }).join(" · ") + "</p>";
    html += '<p class="pf-count">' + rated + " tools rated</p>";
    html += '<div class="pf-actions">' +
      '<button type="button" class="ask-go" data-pf="copy">Copy my page link</button>' +
      (PAGES_LIVE
        ? '<div class="pf-publish"><label>GitHub login <input id="pf-login" type="text" maxlength="39" autocomplete="username" spellcheck="false" placeholder="octocat" value="' + esc(ME_LOGIN) + '"></label>' +
          '<label>Page name <input id="pf-slug" type="text" maxlength="63" spellcheck="false" value="' + esc(ME_SLUG) + '"></label>' +
          '<p class="pf-url" id="pf-url"></p><button type="button" class="btn" data-pf="publish">Publish to pages.flisk.si</button>' +
          '<p class="pf-note">Opens GitHub with your page ready. Click "Propose new file", then "Create pull request". It goes live in about 2 minutes.</p></div>'
        : '<button type="button" class="btn" disabled title="Publishing to pages.flisk.si is almost ready">Publish to pages.flisk.si: coming soon</button>') +
      '<button type="button" class="btn" data-pf="download">Download as a web page</button>' +
      '<button type="button" class="btn" data-pf="clear">Start over</button></div><p class="pf-msg" id="pf-msg" role="status"></p>';
    card.innerHTML = html;
    showPagesUrl();
  }

  // The page people share: self-contained HTML, no scripts, so it works anywhere.
  function cvHtml() {
    var fit = roleFit(), top = fit[0], shape = familyShape();
    var byLv = function (lv) { return Object.keys(ME).filter(function (id) { return ME[id] === lv; }).map(function (id) { return BY_ID[id]; }).sort(function (a, b) { return a.name < b.name ? -1 : 1; }); };
    var row = function (title, list) {
      return list.length ? "<h2>" + title + "</h2><ul>" + list.map(function (t) { return '<li style="--c:' + esc(FAM[t.fam].color) + '">' + esc(t.name) + " <small>" + esc(FAM[t.fam].name) + "</small></li>"; }).join("") + "</ul>" : "";
    };
    var name = ME_NAME || "A developer";
    return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
      "<title>" + esc(name) + " · " + esc(top.r.name) + "</title><meta name=\"description\" content=\"" + esc(name + ": " + top.r.name + ". Tools rated on roadmap.flisk.si.") + "\">" +
      "<style>body{margin:0;font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;background:#0b0b10;color:#ececf1}main{max-width:46rem;margin:0 auto;padding:2.5rem 1.2rem}" +
      "h1{font-size:2.2rem;margin:0;letter-spacing:-.03em}.role{font-size:1.2rem;color:#6ee7a0;margin:.2rem 0 .3rem}.what{color:#b7b7c2;margin:0 0 1.2rem}" +
      "h2{font-size:.8rem;text-transform:uppercase;letter-spacing:.1em;color:#8a8a96;margin:1.6rem 0 .5rem}ul{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:.35rem}" +
      "li{border:1px solid color-mix(in srgb,var(--c) 55%,transparent);background:color-mix(in srgb,var(--c) 14%,transparent);border-radius:8px;padding:.2rem .6rem}li small{color:#8a8a96}" +
      ".spider{width:100%;max-width:320px;display:block;margin:.5rem 0}.spider-ring{fill:none;stroke:rgba(255,255,255,.1)}.spider-axis{stroke:rgba(255,255,255,.08)}.spider-label{font-size:11px;font-weight:700}" +
      ".spider-shape{fill:rgba(34,197,94,.22);stroke:#22c55e;stroke-width:2}footer{margin-top:2.5rem;color:#8a8a96;font-size:.8rem}a{color:#6ee7a0}</style></head><body><main>" +
      "<h1>" + esc(name) + "</h1><p class=\"role\">" + esc(top.r.name) + " · " + top.pct + "% match</p><p class=\"what\">" + esc(top.r.what) + "</p>" +
      "<h2>Skill shape</h2>" + spiderSvg(shape, 300) +
      row("Expert", byLv(3)) + row("Use often", byLv(2)) + row("Have used", byLv(1)) +
      "<footer>Ratings are self-reported. Made with <a href=\"" + esc(shareUrl()) + "\">roadmap.flisk.si</a>, where every tool is scored by a public checklist.</footer>" +
      "</main></body></html>";
  }

  // The pages.flisk.si version: Markdown, rendered like a GitHub README, kept under ~6 KB for the URL.
  function cvMarkdown() {
    var fit = roleFit(), top = fit[0], shape = familyShape();
    var max = Math.max(1, Math.max.apply(null, shape.map(function (x) { return x.sum; })));
    var md = "# " + (ME_NAME || "A developer") + "\n\n**" + top.r.name + "** · " + top.pct + "% match\n\n" + top.r.what + "\n\n";
    md += "Also fits: " + fit.slice(1, 4).map(function (x) { return x.r.name + " (" + x.pct + "%)"; }).join(", ") + "\n\n";
    md += "## Skill shape\n\n| Family | | Tools known |\n| --- | --- | --- |\n" + shape.map(function (x) {
      var n = Math.round((x.sum / max) * 10);
      return "| " + x.f.name + " | `" + "█".repeat(n) + "░".repeat(10 - n) + "` | " + x.known + " |";
    }).join("\n") + "\n";
    [[3, "Expert"], [2, "Use often"], [1, "Have used"]].forEach(function (lv) {
      var list = Object.keys(ME).filter(function (id) { return ME[id] === lv[0]; }).map(function (id) { return BY_ID[id].name; }).sort();
      if (list.length) md += "\n## " + lv[1] + "\n\n" + list.join(" · ") + "\n";
    });
    md += "\n---\n\nRatings are self-reported. Made with [roadmap.flisk.si](" + shareUrl() + "), where every tool is scored by a public checklist.\n";
    return md;
  }
  function cleanLogin(x) { return String(x || "").trim().replace(/^@/, "").toLowerCase(); }
  function validLogin(x) { return /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/.test(x); }
  function validSlug(x) { return /^[a-z0-9][a-z0-9-]{0,62}$/.test(x); }
  function showPagesUrl() {
    var u = document.getElementById("pf-url");
    if (!u) return;
    u.textContent = validLogin(ME_LOGIN) && validSlug(ME_SLUG) ? "Your page: https://pages.flisk.si/@" + ME_LOGIN + "/" + ME_SLUG + "/" : "Type your GitHub login to see your page address.";
  }

  function pfMsg(t) { var m = document.getElementById("pf-msg"); if (m) m.textContent = t; }

  stage.addEventListener("input", function (e) {
    if (e.target.id === "pf-name") ME_NAME = e.target.value.trim().slice(0, 60);
    else if (e.target.id === "pf-login") ME_LOGIN = cleanLogin(e.target.value);
    else if (e.target.id === "pf-slug") ME_SLUG = String(e.target.value).trim().toLowerCase();
    else return;
    saveMe();
    showPagesUrl();
  });
  stage.addEventListener("click", function (e) {
    var b = e.target.closest("[data-pf]");
    if (!b || state.view !== "portfolio") return;
    var act = b.getAttribute("data-pf");
    if (act === "example") {
      ["docker-desktop3", "docker-compose3", "kubectl2", "helm2", "terraform2", "github-actions3", "prometheus2", "grafana2", "k9s3", "argo-cd1", "tilt1", "vault1", "opentelemetry1", "pnpm2"]
        .forEach(function (p) { var m = /^(.+?)([1-3])$/.exec(p); if (BY_ID[m[1]]) ME[m[1]] = +m[2]; });
      saveMe(); render();
    } else if (act === "copy") {
      var url = shareUrl();
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { pfMsg("Link copied. Anyone who opens it sees your profile."); }, function () { window.prompt("Copy this link", url); });
      else window.prompt("Copy this link", url);
    } else if (act === "download") {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([cvHtml()], { type: "text/html" }));
      a.download = (ME_NAME || "my-dev-profile").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".html";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      pfMsg("Saved as a single web page. Put it anywhere: it needs nothing else.");
    } else if (act === "publish" && PAGES_LIVE) {
      if (!validLogin(ME_LOGIN)) { pfMsg("Type your GitHub login first. It must be the account that opens the pull request."); return; }
      if (!validSlug(ME_SLUG)) { pfMsg("Page name: lowercase letters, digits and dashes, starting with a letter or digit."); return; }
      var md = cvMarkdown();
      if (md.length > 6000) { pfMsg("Your page is too long to send through GitHub's link. Rate fewer tools at level 1, or download it instead."); return; }
      window.open("https://github.com/" + PAGES_REPO + "/new/main?filename=" + encodeURIComponent("spaces/" + ME_LOGIN + "/" + ME_SLUG + "/index.md") + "&value=" + encodeURIComponent(md), "_blank", "noopener");
      pfMsg("GitHub is open in a new tab. Propose the file, create the pull request, and your page goes live at pages.flisk.si/@" + ME_LOGIN + "/" + ME_SLUG + "/ in about 2 minutes.");
    } else if (act === "clear") {
      ME = {}; saveMe(); render();
    }
  });

  // ---------- compare: click up to 5 tools, then see them side by side ----------

  var MAX_CMP = 5;
  var tray = document.getElementById("tray");
  var panel = document.getElementById("cmp");
  var flashTimer;

  function isPicked(id) {
    return state.cmp.indexOf(id) !== -1;
  }
  function pickLine(t) {
    var text = isPicked(t.id)
      ? "✓ In your comparison. Click to remove."
      : state.cmp.length >= MAX_CMP
        ? "Comparison is full (" + MAX_CMP + "). Remove one first."
        : "Click to compare (" + state.cmp.length + "/" + MAX_CMP + ")";
    return '<p class="tt-pick' + (isPicked(t.id) ? " on" : "") + '">' + text + "</p>";
  }
  function syncUrl() {
    history.replaceState(history.state, "", location.pathname + query());
  }

  function toggleTool(id) {
    var i = state.cmp.indexOf(id);
    if (i !== -1) state.cmp.splice(i, 1);
    else if (state.cmp.length >= MAX_CMP) {
      flashTray("You can compare up to " + MAX_CMP + " tools. Remove one first.");
      return;
    } else state.cmp.push(id);
    syncUrl();
    markPicked();
    renderTray();
    if (!tip.hidden && lastNode && lastNode.getAttribute("data-tip") === "tool") tip.innerHTML = tipHtml(lastNode);
  }

  // Picked tools get a ring everywhere, and a number on the Compass and Radar that matches the tray.
  function markPicked() {
    stage.querySelectorAll("[data-id]").forEach(function (n) {
      n.classList.toggle("is-picked", isPicked(n.getAttribute("data-id")));
    });
    stage.classList.toggle("has-picked", state.cmp.length > 0);
    stage.querySelectorAll("g.dot").forEach(function (g) {
      g.querySelectorAll(".pick-ring, .pick-num").forEach(function (n) { n.remove(); });
      var i = state.cmp.indexOf(g.getAttribute("data-id"));
      if (i === -1) return;
      sv("circle", { r: 12, class: "pick-ring" }, g);
      sv("text", { y: -17, "text-anchor": "middle", class: "pick-num", text: i + 1 }, g);
    });
  }

  function flashTray(msg) {
    var m = tray.querySelector(".tray-msg");
    if (!m) return;
    m.textContent = msg;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { m.textContent = ""; }, 2600);
  }

  function renderTray() {
    document.body.classList.toggle("has-tray", state.cmp.length > 0);
    tray.hidden = !state.cmp.length;
    tray.innerHTML = "";
    if (!state.cmp.length) return;
    el("span", { class: "tray-label", text: "Compare " + state.cmp.length + "/" + MAX_CMP }, tray);
    var list = el("ul", { class: "tray-list" }, tray);
    state.cmp.forEach(function (id, i) {
      var t = BY_ID[id];
      var li = el("li", { class: "tray-chip", "data-hot": id, style: "--c:" + FAM[t.fam].color }, list);
      el("b", { text: i + 1 }, li);
      if (LOGO[id]) li.insertAdjacentHTML("beforeend", logoSpan(id));
      el("span", { text: t.name }, li);
      el("button", { type: "button", class: "tray-x", "data-remove": id, "aria-label": "Remove " + t.name, text: "×" }, li);
    });
    var acts = el("div", { class: "tray-actions" }, tray);
    var go = el("button", { type: "button", class: "tray-go", "data-act": "open", text: "Compare" }, acts);
    if (state.cmp.length < 2) { go.disabled = true; go.title = "Pick at least two tools"; }
    el("button", { type: "button", "data-act": "copy", text: "Copy link" }, acts);
    el("button", { type: "button", "data-act": "clear", text: "Clear" }, acts);
    el("p", { class: "tray-msg", role: "status" }, tray);
  }

  function copyLink(btn) {
    var url = location.origin + location.pathname + query();
    var done = function () { btn.textContent = "Copied"; setTimeout(function () { btn.textContent = "Copy link"; }, 1600); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { window.prompt("Copy this link", url); });
    else window.prompt("Copy this link", url);
  }

  tray.addEventListener("click", function (e) {
    var rm = e.target.closest("[data-remove]");
    if (rm) { toggleTool(rm.getAttribute("data-remove")); return; }
    var act = e.target.closest("[data-act]");
    if (!act || act.disabled) return;
    var what = act.getAttribute("data-act");
    if (what === "open") openPanel();
    else if (what === "copy") copyLink(act);
    else if (what === "clear") { state.cmp = []; syncUrl(); markPicked(); renderTray(); }
  });
  // Hovering a tray chip lights up that tool on the chart.
  tray.addEventListener("pointerover", function (e) {
    var c = e.target.closest("[data-hot]");
    clearHot();
    if (!c) return;
    stage.classList.add("has-hot");
    stage.querySelectorAll('[data-id="' + c.getAttribute("data-hot") + '"]').forEach(function (n) { n.classList.add("is-hot"); });
  });
  tray.addEventListener("pointerleave", clearHot);

  stage.addEventListener("click", function (e) {
    if (state.view === "portfolio") return;
    var n = target(e);
    if (n && n.getAttribute("data-tip") === "tool") toggleTool(n.getAttribute("data-id"));
  });
  stage.addEventListener("keydown", function (e) {
    if (state.view === "portfolio") return;
    if (e.key !== "Enter" && e.key !== " ") return;
    var n = e.target.closest && e.target.closest('[data-tip="tool"]');
    if (!n || !stage.contains(n)) return;
    e.preventDefault();
    toggleTool(n.getAttribute("data-id"));
  });

  // The side-by-side table: one column per tool, one row per rubric criterion.
  function cell(html, cls) {
    return "<td" + (cls ? ' class="' + cls + '"' : "") + ">" + html + "</td>";
  }
  function mark(yes) {
    return yes ? '<span class="yes" aria-label="Yes">✓</span>' : '<span class="no" aria-label="No">–</span>';
  }

  function panelTable(tools) {
    var rows = [];
    function row(label, cells, same, cls) {
      rows.push('<tr class="' + (cls || "") + (same ? " same" : "") + '"><th scope="row">' + label + "</th>" + cells.join("") + "</tr>");
    }
    function allSame(vals) {
      return vals.every(function (v) { return v === vals[0]; });
    }
    function section(title) {
      rows.push('<tr class="sec"><th colspan="' + (tools.length + 1) + '">' + title + "</th></tr>");
    }

    row("What it is", tools.map(function (t) { return cell(esc(t.tagline)); }), false);
    row("License", tools.map(function (t) { return cell(esc(D.rubric.licenses[t.license] || t.license)); }),
      allSame(tools.map(function (t) { return t.license; })));
    if (tools.some(gh)) {
      row("GitHub stars", tools.map(function (t) { var g = gh(t); return cell(g ? "★ " + fmtStars(g.stars) : '<span class="muted">no repo</span>'); }), false);
      row("Last release", tools.map(function (t) { var g = gh(t); return cell(g && g.release ? ago(g.release) + (g.version ? " <span class=\"muted\">" + esc(g.version) + "</span>" : "") : '<span class="muted">none on GitHub</span>'); }), false);
    }
    row("Ring", tools.map(function (t) {
      return cell('<span class="tt-ring ring-' + esc(t.ring) + '" title="' + esc(ringOf(t.ring).help || "") + '">' + esc(ringOf(t.ring).label) + '</span> <span class="muted">' + ringWord(t.ring) + "</span>");
    }), allSame(tools.map(function (t) { return t.ring; })));

    [["dx", "Easy to use?", "x"], ["parity", "Made for big, real systems?", "y"]].forEach(function (ax) {
      var key = ax[0], rub = D.rubric[key];
      section(ax[1] + " <small>" + esc(rub.low) + " → " + esc(rub.high) + "</small>");
      row("Score", tools.map(function (t) {
        var v = t[ax[2]];
        return cell('<span class="cmp-score"><b>' + v + '</b><i style="--v:' + v + '%"></i></span>');
      }), allSame(tools.map(function (t) { return t[ax[2]]; })), "score");
      rub.criteria.forEach(function (c) {
        var vals = tools.map(function (t) { return t[key].indexOf(c.id) !== -1; });
        row('<span title="' + esc(c.help) + '">' + esc(c.label) + "</span>", vals.map(function (v) { return cell(mark(v), v ? "has" : ""); }), allSame(vals));
      });
    });

    section("Good to know");
    row("Caveat", tools.map(function (t) { return cell(t.note ? esc(t.note) : '<span class="muted">None noted</span>'); }), false);
    row("Links", tools.map(function (t) {
      var out = [];
      if (safeUrl(t.url)) out.push('<a href="' + esc(t.url) + '" target="_blank" rel="noopener">Site ↗</a>');
      if (safeUrl(t.evidence)) out.push('<a href="' + esc(t.evidence) + '" target="_blank" rel="noopener">Evidence ↗</a>');
      return cell(out.join(" "));
    }), false);

    var head = "<tr><th scope=\"col\" class=\"corner\"></th>" + tools.map(function (t, i) {
      var f = FAM[t.fam];
      return '<th scope="col" style="--c:' + esc(f.color) + '"><span class="cmp-n">' + (i + 1) + "</span>" +
        (LOGO[t.id] ? logoSpan(t.id) : '<span class="cmp-sym">' + esc(t.sym) + "</span>") +
        "<strong>" + esc(t.name) + "</strong><span class=\"cmp-fam\">" + esc(f.name) + " · " + esc(t.cat) + "</span>" +
        '<button type="button" class="cmp-rm" data-remove="' + esc(t.id) + '" aria-label="Remove ' + esc(t.name) + '">×</button></th>';
    }).join("") + "</tr>";

    return "<table><thead>" + head + "</thead><tbody>" + rows.join("") + "</tbody></table>";
  }

  function openPanel() {
    if (state.cmp.length < 2) return;
    hideNow();
    var tools = state.cmp.map(function (id) { return BY_ID[id]; });
    panel.innerHTML =
      '<div class="cmp-box" role="dialog" aria-modal="true" aria-label="Compare tools">' +
      '<div class="cmp-top"><h2>Compare ' + tools.length + " tools</h2>" +
      (cmdUrl(state.cmp) ? '<a class="cmp-cmd" href="' + esc(cmdUrl(state.cmp)) + '" target="_blank" rel="noopener">Compare their commands ↗</a>' : "") +
      '<label class="cmp-diff"><input type="checkbox" id="cmp-diff"> Only differences</label>' +
      '<button type="button" class="cmp-close" data-close aria-label="Close comparison">Close</button></div>' +
      '<div class="cmp-scroll" id="cmp-table">' + panelTable(tools) + "</div>" +
      '<p class="cmp-foot">Scores are 10 points per checklist item. See <a href="' + base + '/about/">how it works</a>.</p></div>';
    panel.hidden = false;
    document.body.classList.add("cmp-open");
    panel.querySelector(".cmp-close").focus();
  }
  function closePanel() {
    panel.hidden = true;
    panel.innerHTML = "";
    document.body.classList.remove("cmp-open");
  }
  panel.addEventListener("click", function (e) {
    if (e.target === panel || e.target.closest("[data-close]")) { closePanel(); return; }
    var rm = e.target.closest("[data-remove]");
    if (rm) {
      toggleTool(rm.getAttribute("data-remove"));
      if (state.cmp.length < 2) closePanel(); else openPanel();
    }
  });
  panel.addEventListener("change", function (e) {
    if (e.target.id === "cmp-diff") panel.querySelector("#cmp-table").classList.toggle("only-diff", e.target.checked);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !panel.hidden) closePanel();
  });

  // ---------- render and routing ----------

  // The radar is as tall as the room left under the header, so the whole circle is on screen.
  function fitRadar() {
    var wrap = stage.parentNode;
    var top = wrap.getBoundingClientRect().top + window.scrollY;
    // The card padding and the compare tray both need room too.
    var room = window.innerHeight - top - 84;
    stage.style.setProperty("--radar-max", Math.max(320, Math.round(room)) + "px");
  }
  window.addEventListener("resize", function () {
    if (state.view === "radar" || state.view === "compass" || state.view === "skills") fitRadar();
    if (state.view === "lab") fitLab();
    var lw = stage.querySelector(".radar-list-wrap");
    if (lw) lw.open = window.matchMedia("(min-width: 900px)").matches;
  });

  function render() {
    hideNow();
    stage.innerHTML = "";
    stage.classList.remove("is-in");
    if (state.view === "radar" || state.view === "compass" || state.view === "skills") fitRadar();
    if (state.view === "compass") renderCompass();
    else if (state.view === "radar") renderRadar();
    else if (state.view === "lab") renderLab();
    else if (state.view === "roles") renderRoles();
    else if (state.view === "skills") renderSkills();
    else if (state.view === "ask") renderAsk();
    else if (state.view === "portfolio") renderPortfolio();
    else renderJourneys();
    void stage.offsetWidth;
    stage.classList.add("is-in");
    markPicked();
    renderTray();
    firstPaint = false;
  }

  function viewInfo() {
    return D.views.filter(function (v) { return v.id === state.view; })[0];
  }
  // Where a view's sub-tabs come from; matches subtab_list in _plugins/view_pages.rb.
  function subList(v) {
    switch (v.subtabs) {
      case "families": return D.families;
      case "tracks": return D.journeys.tracks;
      case "roles": return (D.roles && D.roles.groups) || [];
      case "skills": return D.skill_categories || [];
      default: return [];
    }
  }
  function subName() {
    if (!state.sub) return "";
    var s = subList(viewInfo()).filter(function (x) { return x.id === state.sub; })[0];
    return s ? s.name : "";
  }

  function syncChrome() {
    document.querySelectorAll("#subtabs .subtab").forEach(function (a) {
      if ((a.getAttribute("data-sub") || "") === state.sub) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    var v = viewInfo(), name = subName();
    document.title = v.title + (name ? ": " + name : "") + " | DevEx Roadmap";
    var filters = v.subtabs === "families" || v.subtabs === "roles" || v.subtabs === "skills";
    document.querySelectorAll(".all-list tbody tr[data-sub]").forEach(function (tr) {
      tr.hidden = filters && !!state.sub && tr.getAttribute("data-sub") !== state.sub;
    });
  }

  function pathFor(sub) {
    return base + "/" + state.view + "/" + (sub ? sub + "/" : "");
  }
  function query() {
    var p = [];
    if (state.q) p.push("q=" + encodeURIComponent(state.q));
    if (state.cmp.length) p.push("compare=" + state.cmp.map(encodeURIComponent).join(","));
    return p.length ? "?" + p.join("&") : "";
  }

  var subtabsEl = document.getElementById("subtabs");
  if (subtabsEl) subtabsEl.addEventListener("click", function (e) {
    var a = e.target.closest("a.subtab");
    if (!a || !D || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;
    e.preventDefault();
    var sub = a.getAttribute("data-sub") || "";
    if (sub === state.sub) return;
    state.sub = sub;
    history.pushState({ sub: sub }, "", pathFor(sub) + query());
    syncChrome();
    render();
  });

  // Keep the search when you jump between views.
  document.querySelectorAll(".views .view-tab").forEach(function (a) {
    a.addEventListener("click", function () {
      var qs = query();
      if (qs) a.href = a.href.split("?")[0] + qs;
    });
  });

  window.addEventListener("popstate", function () {
    var parts = location.pathname.slice(base.length).split("/").filter(Boolean);
    if (parts[0] && parts[0] !== state.view) {
      location.reload();
      return;
    }
    state.sub = parts[1] || (viewInfo().subtabs === "tracks" ? D.journeys.tracks[0].id : "");
    if (state.view === "ask") askFromUrl();
    syncChrome();
    render();
  });

  if (qInput) {
    var qTimer;
    qInput.addEventListener("input", function () {
      clearTimeout(qTimer);
      qTimer = setTimeout(function () {
        state.q = qInput.value.trim();
        history.replaceState(history.state, "", location.pathname + query());
        render();
      }, 120);
    });
  }

  var tb = document.querySelector(".toolbar");
  if (tb) tb.hidden = false;
  try {
    var params = new URLSearchParams(location.search);
    state.q = params.get("q") || "";
    state.cmp = (params.get("compare") || "").split(",").filter(Boolean).slice(0, 5);
    if (qInput) qInput.value = state.q;
  } catch (e) {}

  // The build time in the URL keeps a deploy from being paired with the previous deploy's data.
  fetch(base + "/assets/data.json?v=" + encodeURIComponent(app.dataset.v || ""))
    .then(function (r) { return r.json(); })
    .then(function (d) {
      prep(d);
      prepExtra();
      // Drop ids from a shared link that no longer exist, and any repeats.
      state.cmp = state.cmp.filter(function (id, i, a) { return BY_ID[id] && a.indexOf(id) === i; });
      syncChrome();
      render();
    })
    .catch(function () {
      stage.innerHTML = '<p class="stage-error">The chart could not load. The table below has every tool.</p>';
    });
})();
