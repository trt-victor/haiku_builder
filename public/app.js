const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const COL = { forge: "#ff9a3d", sort: "#ffe600", quench: "#4aa3ff", refine: "#3ee0a0", appraisal: "#b388ff" };
const POS = { sort: [468, 350], forge: [150, 350], quench: [468, 95], appraisal: [786, 350], refine: [468, 605] };
const BOX = { sort: [230, 140], forge: [250, 118], quench: [250, 118], appraisal: [250, 118], refine: [250, 118] };
const SUB = { forge: "writes · LLM", sort: "routes", quench: "counts · code", refine: "revises · LLM", appraisal: "judges · LLM" };
const THEMES = [
  ["A quiet room", "calm"], ["Morning commute", "everyday"], ["An old stone bridge", "place"], ["Missing someone", "feeling"],
  ["A raging storm over the north sea", "picks a fight with the laws", true], ["Autumn mist at dawn", "picks a fight with the laws", true],
];

// ---- stage: fixed 1080×3840 kiosk, scaled to the viewport ----
const stage = $("stage");
const DESKTOP = document.body.classList.contains("desktop");
if (!DESKTOP && Q.get("seam") !== "0") document.body.classList.add("seam-on");
function fit() {
  const [w, h] = DESKTOP ? [1920, 1080] : [1080, document.body.classList.contains("seam-on") ? 3846 : 3840];
  const s = Q.get("fit") === "0" ? 1 : Math.min(innerWidth / w, innerHeight / h);
  stage.style.transform = `scale(${s})`;
  stage.style.left = Math.max(0, (innerWidth - w * s) / 2) + "px";
  stage.style.top = DESKTOP ? Math.max(0, (innerHeight - h * s) / 2) + "px" : "0";
}
addEventListener("resize", fit); fit();
$("date").innerHTML = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace(/^(\w+) (\d+ \w+) (\d+)/, "$1<br>$2<br>$3");

// ---- flowing ribbon backgrounds (one palette per panel) ----
const NS = "http://www.w3.org/2000/svg";
const el = (n, a = {}, p) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); p?.append(e); return e; };
function ribbons(panel, [c1, c2, c3]) {
  const bg = document.createElement("div"); bg.className = "bg";
  const s = el("svg", { viewBox: "0 0 1080 1920", preserveAspectRatio: "none" }, bg);
  const defs = el("defs", {}, s);
  [c1, c2, c3].forEach((c, i) => {
    const g = el("linearGradient", { id: `${panel.id}g${i}`, x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
    el("stop", { offset: 0, "stop-color": c, "stop-opacity": 0 }, g); el("stop", { offset: 0.5, "stop-color": c }, g); el("stop", { offset: 1, "stop-color": c, "stop-opacity": 0 }, g);
  });
  el("path", { d: "M-100 1700 C 200 1100, 700 1500, 640 800 S 1000 200, 1200 100", stroke: `url(#${panel.id}g0)`, "stroke-width": 120 }, s);
  el("path", { d: "M-100 400 C 300 700, 400 100, 800 500 S 700 1300, 1200 1500", stroke: `url(#${panel.id}g1)`, "stroke-width": 90 }, s);
  el("path", { d: "M300 -100 C 100 500, 900 700, 500 1200 S 900 1800, 700 2000", stroke: `url(#${panel.id}g2)`, "stroke-width": 70 }, s);
  panel.prepend(bg);
}
ribbons($("top"), ["#7b2ff7", "#e040fb", "#2a6bff"]);
ribbons($("bottom"), ["#ff8a3d", "#7b2ff7", "#19d3da"]);

// ---- chat / themes ----
THEMES.forEach(([t, s, fight]) => {
  const b = document.createElement("button");
  b.className = fight ? "fight" : "";
  b.innerHTML = `${t}<small>${s}</small>`;
  b.onclick = () => go(t); // quick start: skip the chat
  $("themes").append(b);
});
const msgs = []; let brief = "";
const say = (role, text, cls = "") => {
  const d = document.createElement("div"); d.className = `bubble glass ${role === "user" ? "me" : ""} ${cls}`; d.textContent = text;
  $("chat").append(d); $("chat").scrollTop = 1e6; return d;
};
function resetChat() {
  msgs.length = 0; brief = ""; $("chat").innerHTML = ""; $("go").hidden = true; $("themes").hidden = false;
  const hi = "Hi! Tell me a little about what you'd like the haiku to be about — or just tap a theme below.";
  say("bot", hi); msgs.push({ role: "bot", text: hi });
}
$("ask").onsubmit = async (e) => {
  e.preventDefault();
  const text = $("theme").value.trim(); if (!text) return;
  $("theme").value = ""; $("themes").hidden = true; $("go").hidden = true;
  say("user", text); msgs.push({ role: "user", text });
  const t = say("bot", "…", "typing");
  try {
    const r = await (await fetch("/api/chat", { method: "POST", body: JSON.stringify({ messages: msgs }) })).json();
    if (r.error) throw new Error(r.error);
    t.className = "bubble glass"; t.textContent = r.reply; msgs.push({ role: "bot", text: r.reply });
    if (r.ready) { brief = r.brief; $("go").hidden = false; }
    else if (msgs.filter((m) => m.role === "user").length >= 2) { brief ||= msgs.filter((m) => m.role === "user").map((m) => m.text).join(". "); $("go").hidden = false; }
  } catch (err) { t.className = "bubble glass"; t.textContent = "Sorry, I lost my train of thought. Tap “Forge my haiku” to use what you've told me."; brief ||= text; $("go").hidden = false; }
  $("chat").scrollTop = 1e6;
};
$("go").onclick = () => go(brief || msgs.filter((m) => m.role === "user").map((m) => m.text).join(". ") || "a quiet room");
$("again").onclick = () => { es?.close(); $("run").hidden = true; $("start").hidden = false; $("again").hidden = true; resetChat(); idle(); };
resetChat();

// ---- loop diagram ----
const svg = $("loopsvg");
el("circle", { cx: 468, cy: 350, r: 255, fill: "none", stroke: "rgba(255,255,255,.1)", "stroke-width": 2, "stroke-dasharray": "4 10" }, svg);
const spokes = {}, boxes = {};
for (const n of ["forge", "quench", "appraisal", "refine"]) {
  const [x1, y1] = POS.sort, [x2, y2] = POS[n];
  spokes[n] = el("line", { x1, y1, x2, y2, stroke: COL[n], "stroke-width": 4, "stroke-dasharray": "10 10", opacity: 0.3 }, svg);
}
for (const n in POS) {
  const [x, y] = POS[n], [w, h] = BOX[n], g = el("g", {}, svg);
  boxes[n] = el("rect", { x: x - w / 2, y: y - h / 2, width: w, height: h, rx: 28, fill: "rgba(20,12,45,.82)", stroke: COL[n], "stroke-width": 2.5, opacity: 0.6 }, g);
  el("text", { x, y: y + 2, "text-anchor": "middle", "font-size": n === "sort" ? 42 : 38, "font-weight": 700, fill: "#fff" }, g).textContent = n[0].toUpperCase() + n.slice(1);
  el("text", { x, y: y + 38, "text-anchor": "middle", "font-size": 22, fill: "rgba(255,255,255,.6)" }, g).textContent = SUB[n];
}
const home = (n) => [POS[n][0] - BOX[n][0] / 2 + 26, POS[n][1] - BOX[n][1] / 2 + 26];
let [tx, ty] = home("sort"), raf;
const token = el("circle", { r: 15, fill: COL.sort, cx: tx, cy: ty }, svg);
const halo = el("circle", { r: 26, fill: "none", stroke: COL.sort, "stroke-width": 3, opacity: 0.6, cx: tx, cy: ty }, svg);
function moveTo(n) {
  const [px, py] = home(n), [fx, fy] = [tx, ty], t0 = performance.now();
  cancelAnimationFrame(raf);
  (function step(t) {
    const k = Math.min(1, (t - t0) / 700), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    tx = fx + (px - fx) * e; ty = fy + (py - fy) * e;
    for (const c of [token, halo]) { c.setAttribute("cx", tx); c.setAttribute("cy", ty); }
    if (k < 1) raf = requestAnimationFrame(step);
  })(t0);
}
(function pulse(t) { halo.setAttribute("r", 24 + 7 * Math.sin(t / 220)); requestAnimationFrame(pulse); })(0);
function activate(n) {
  for (const k in boxes) {
    boxes[k].setAttribute("opacity", k === n ? 1 : 0.6); boxes[k].setAttribute("stroke-width", k === n ? 7 : 2.5);
    boxes[k].style.filter = k === n ? `drop-shadow(0 0 22px ${COL[k]})` : "none";
  }
  for (const k in spokes) { spokes[k].setAttribute("opacity", k === n ? 1 : 0.3); spokes[k].setAttribute("stroke-dasharray", k === n ? "0" : "10 10"); }
  token.setAttribute("fill", COL[n]); halo.setAttribute("stroke", COL[n]); $("where-dot").style.background = COL[n];
  moveTo(n);
}

// ---- laws (top panel) ----
const LAW_TAGS = { syllables: "5-7-5", "no-weather": "Weather", "no-atmosphere": "Sky" };
function drawLaws(laws, stamps = {}, feedback = [], approved = false) {
  const ul = $("lawlist"); ul.innerHTML = "";
  const row = (cls, tag, st, title, desc) => {
    const li = document.createElement("li"); li.className = cls;
    li.innerHTML = `<div class="tag">${tag}<small>${st}</small></div><div><b></b><span></span></div>`;
    li.querySelector("b").textContent = title; li.querySelector("span").textContent = desc; ul.append(li);
  };
  for (const l of laws) {
    const open = feedback.filter((f) => f.law === l.id && f.status === "open");
    const st = stamps[l.id] ? "ok" : open.length ? "bad" : "";
    row(st, LAW_TAGS[l.id] || l.name, st === "ok" ? "attested" : st === "bad" ? "violated" : "pending", l.name, open[0]?.text || l.text);
  }
  row("approval" + (approved ? " ok" : ""), "Approval", approved ? "stamped" : "waiting", "Exit contract", "Sort stamps approval once every law is attested.");
}
const DEFAULT_LAWS = () => [
  { id: "syllables", name: "5-7-5", text: "Three lines of 5, 7 and 5 syllables." },
  ...($("laws").checked ? [{ id: "no-weather", name: "no-weather", text: "No meteorological references." }, { id: "no-atmosphere", name: "no-atmosphere", text: "No atmospheric or sky references." }] : []),
];
function idle() {
  activate("sort"); $("where-kicker").textContent = "Waiting for a theme"; $("where-msg").textContent = "Chat or pick a theme below to start the loop.";
  drawLaws(DEFAULT_LAWS());
}
$("laws").onchange = () => $("run").hidden && drawLaws(DEFAULT_LAWS());

// ---- run ----
let es;
function go(theme) {
  es?.close();
  $("start").hidden = true; $("run").hidden = false; $("again").hidden = true;
  $("theme-chip").textContent = theme;
  $("lines").innerHTML = $("verdict").innerHTML = $("trail").innerHTML = $("fb").innerHTML = "";
  $("verdict").className = ""; $("where-msg").textContent = "Starting…"; $("where-kicker").textContent = "Iteration 0"; $("iter").textContent = "Iteration 0";
  let laws = [];
  es = new EventSource(`/api/run?theme=${encodeURIComponent(theme)}&laws=${$("laws").checked ? "on" : "off"}`);
  es.onmessage = ({ data }) => {
    const e = JSON.parse(data);
    if (e.type === "start") { laws = e.laws; drawLaws(laws); }
    else if (e.type === "node") {
      activate(e.node); $("where-msg").textContent = e.msg; $("where-kicker").textContent = `Iteration ${e.iteration} · ${e.node}`; $("iter").textContent = `Iteration ${e.iteration}`;
      if (e.node !== "sort" || !/inspects/.test(e.msg)) trail(e.node, e.msg);
    } else if (e.type === "log") trail(e.node, e.msg);
    else if (e.type === "state") render(e, laws);
    else if (e.type === "done") {
      es.close(); $("where-kicker").textContent = e.ok ? "Complete" : "Stopped"; $("where-msg").textContent = e.msg; $("again").hidden = false;
      $("verdict").className = e.ok ? "ok" : "bad"; $("verdict").textContent = e.ok ? "✓ Approved — all laws attested" : "✕ " + e.msg;
      if (e.ok) drawLaws(laws, last.stamps, last.feedback, true);
    } else if (e.type === "error") { es.close(); $("where-msg").textContent = "Error: " + e.msg; $("again").hidden = false; }
  };
  es.onerror = () => es.readyState === 2 || ($("where-msg").textContent === "Starting…" && ($("where-msg").textContent = "Can't reach the server — is `npm start` running?"));
}
function trail(n, msg) {
  const li = document.createElement("li");
  li.innerHTML = `<span class="t" style="color:${COL[n]}">${n}</span><span></span>`;
  li.lastChild.textContent = msg; $("trail").append(li);
}
let last = { stamps: {}, feedback: [] };
function render(s, laws) {
  last = s;
  const key = s.haiku.join("|"), fresh = key !== render.last; render.last = key;
  $("lines").innerHTML = "";
  s.haiku.forEach((l, i) => {
    const want = [5, 7, 5][i], d = document.createElement("div");
    d.className = "hline" + (fresh ? " fresh" : "");
    d.innerHTML = `<span></span><span class="n ${s.syl[i] === want ? "ok" : "bad"}">${s.syl[i]}/${want}</span>`;
    d.firstChild.textContent = l; $("lines").append(d);
  });
  $("fb").innerHTML = "";
  if (!s.feedback.length) $("fb").innerHTML = `<li class="none">None yet.</li>`;
  s.feedback.slice(-4).forEach((f) => {
    const li = document.createElement("li"); li.className = f.status === "accepted" ? "done" : "";
    li.innerHTML = `<b></b> <span></span>`; li.querySelector("b").textContent = `${f.law} · ${f.status}`; li.querySelector("span").textContent = f.text; $("fb").append(li);
  });
  drawLaws(laws, s.stamps, s.feedback);
}
idle();
