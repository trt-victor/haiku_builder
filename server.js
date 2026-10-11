// Foundry haiku loop — real LLM calls (via the local `claude` CLI), streamed to the browser over SSE.
// Mirrors the gideas haiku flow: forge → sort → quench → sort → refine/appraisal → sort → COMPLETE.
import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lineSyllables } from "./syllables.js";

const PORT = process.env.PORT || 4175;
const HOST = process.env.HOST || "0.0.0.0";   // reachable from other screens on the LAN
const BACKEND = process.env.FOUNDRY_BACKEND || "ollama"; // "ollama" (local) or "claude" (CLI)
const OLLAMA = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const MODEL = process.env.FOUNDRY_MODEL || (BACKEND === "ollama" ? "mistral" : "haiku");
const MAX_ITER = 8;
const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };

// Laws mirror the gideas Law CRD: goal, tier 1-5, group, appliesTo, and a markdown representation.
// Seeds are the real haiku laws from nodes/haiku-manifests; custom laws are appraised by the LLM like the originals.
const SEED = [
  { id: "haiku-syllable", tag: "5-7-5", goal: "Haiku must follow the 5-7-5 syllable pattern", tier: 3, group: "content", by: "quench", locked: true,
    text: "Line 1: 5 syllables\nLine 2: 7 syllables\nLine 3: 5 syllables\n\nValid:\n  an old silent pond (5)\n  a frog jumps into the pond (7)\n  splash! silence again (5)\n\nChecked deterministically by Quench (code, not an LLM)." },
  { id: "no-weather", tag: "Weather", goal: "Absolutely no references to the weather or meteorological phenomena", tier: 3, group: "content", by: "appraisal",
    text: "Haiku must not reference weather or meteorological phenomena of any kind.\n\nProhibited: rain, snow, sleet, hail, thunder, lightning, storms, tempest, squall, wind, breeze, gale, temperature (hot, cold, warm), humidity.\n\nExamples:\n- \"winter rain\" — weather reference\n- \"cold wind blows\" — temperature + wind\n\nThe governing body tolerates zero weather." },
  { id: "no-atmosphere", tag: "Sky", goal: "Absolutely no references to atmospheric conditions, sky, or seasonal imagery", tier: 3, group: "content", by: "appraisal",
    text: "Haiku must not reference atmospheric conditions, the sky, or seasonal imagery of any kind.\n\nProhibited: sun, moon, stars, sky, clouds, fog, mist, frost, dew, dawn, dusk, twilight, seasons (spring, summer, autumn, winter), seasonal markers (cherry blossoms, falling leaves, snow on branches).\n\nThe haiku must stay earthbound." },
];
const LAWS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "laws.json");
let saved = { enabled: {}, custom: [] };   // laws.json: {enabled:{id:bool}, custom:[law]}
try { saved = { ...saved, ...JSON.parse(await readFile(LAWS_FILE, "utf8")) }; } catch {}
const allLaws = () => [...SEED, ...saved.custom].map((l) => ({ ...l, appliesTo: ["haiku"], enabled: l.locked || saved.enabled[l.id] !== false }));
const persist = () => writeFile(LAWS_FILE, JSON.stringify(saved, null, 2));
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "law";

const llmOllama = async (system, prompt) => {
  const r = await fetch(`${OLLAMA}/api/chat`, {
    method: "POST",
    body: JSON.stringify({ model: MODEL, stream: false, options: { temperature: 0.7 }, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }),
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return ((await r.json()).message?.content || "").trim();
};
const llmClaude = (system, prompt) =>
  new Promise((resolve, reject) => {
    const p = spawn("claude", ["-p", "--model", MODEL, "--tools", "", "--no-session-persistence", "--setting-sources", "", "--system-prompt", system]);
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (c) => (c === 0 ? resolve(out.trim()) : reject(new Error(err || `claude exited ${c}`))));
    p.stdin.end(prompt);
  });
const llm = BACKEND === "ollama" ? llmOllama : llmClaude;

async function checkBackend() {
  if (BACKEND !== "ollama") return console.log(`LLM backend: claude CLI (${MODEL})`);
  try {
    const tags = (await (await fetch(`${OLLAMA}/api/tags`)).json()).models.map((m) => m.name);
    if (!tags.some((n) => n === MODEL || n.startsWith(MODEL + ":"))) console.warn(`! Ollama is running but model "${MODEL}" is not pulled. Run: ollama pull ${MODEL}`);
    else console.log(`LLM backend: Ollama · ${MODEL}`);
  } catch { console.warn(`! Can't reach Ollama at ${OLLAMA}. Start the Ollama app, or run with FOUNDRY_BACKEND=claude.`); }
}

const parseHaiku = (t) =>
  t.replace(/```[a-z]*/g, "").split("\n").map((l) => l.replace(/^[\s>*\-"]+|["\s]+$/g, "")).filter(Boolean).slice(0, 3);

async function run(theme, laws, send, alive) {
  const stamps = {};          // law id -> true; invalidated whenever the haiku changes
  let feedback = [];          // {id, law, text, status: open|actioned|accepted|rejected}
  let fbSeq = 0, haiku = [], iteration = 0;
  const emit = (e) => alive() && send(e);
  const node = (n, msg) => emit({ type: "node", node: n, msg, iteration });
  const state = () => emit({ type: "state", haiku, syl: haiku.map(lineSyllables), stamps: { ...stamps }, feedback: feedback.map((f) => ({ ...f })) });
  const raise = (law, text) => { feedback.push({ id: ++fbSeq, law, text, status: "open" }); };

  emit({ type: "start", laws: laws.map(({ id, tag, goal, tier, group, text, by }) => ({ id, tag, goal, tier, group, text, by, name: id })), theme });

  // forge
  node("forge", `Forge is writing a haiku about “${theme}”`);
  haiku = parseHaiku(await llm("You are the Forge node of a governed haiku workflow. Output only the three lines of the haiku, nothing else. Use short, simple words: line 1 exactly 5 syllables, line 2 exactly 7, line 3 exactly 5.", `Write a haiku (3 lines) about: ${theme}`));
  state();

  while (alive()) {
    // sort — decides the route from stamps + feedback
    node("sort", "Sort inspects stamps and feedback");
    await new Promise((r) => setTimeout(r, 700));
    const open = feedback.filter((f) => f.status === "open");
    const needsQuench = !stamps["haiku-syllable"];
    const needsAppraisal = laws.some((l) => l.by === "appraisal" && !stamps[l.id]);

    if (open.length) {
      if (++iteration > MAX_ITER) { emit({ type: "done", ok: false, msg: `Iteration limit (${MAX_ITER}) hit — Sort would escalate to a human.`, iteration }); return; }
      node("sort", `${open.length} unaddressed feedback → route to Refine`);
      node("refine", "Refine is triaging feedback and revising");
      const fb = open.map((f) => `- [${f.law}] ${f.text}`).join("\n");
      haiku = parseHaiku(await llm("You are the Refine node of a governed haiku workflow. Fix every feedback item, changing as little as possible — keep every line or word that already works. Output only the three lines of the revised haiku, nothing else. Use short, simple words so syllables are easy to count: line 1 exactly 5 syllables, line 2 exactly 7, line 3 exactly 5.", `Theme: ${theme}\nCurrent haiku (syllables per line: ${haiku.map(lineSyllables).join(", ")}):\n${haiku.join("\n")}\n\nFeedback to fix:\n${fb}`));
      for (const f of open) f.status = "actioned";
      for (const k of Object.keys(stamps)) delete stamps[k]; // changed artefact → attestations void
      state();
      continue;
    }
    if (needsQuench) {
      node("sort", "No syllable attestation → route to Quench");
      node("quench", "Quench is counting syllables (deterministic)");
      await new Promise((r) => setTimeout(r, 900));
      const syl = haiku.map(lineSyllables), want = [5, 7, 5];
      const ok = haiku.length === 3 && syl.every((s, i) => s === want[i]);
      if (ok) { stamps["haiku-syllable"] = true; emit({ type: "log", node: "quench", msg: "Syllable law attested: 5-7-5" }); }
      else {
        const d = haiku.length !== 3 ? `Expected 3 lines, got ${haiku.length}.` : syl.map((s, i) => (s !== want[i] ? `line ${i + 1} has ${s}, needs ${want[i]}` : null)).filter(Boolean).join("; ") + ".";
        raise("haiku-syllable", d);
        emit({ type: "log", node: "quench", msg: `Raised feedback: ${d}` });
      }
      for (const f of feedback.filter((f) => f.law === "haiku-syllable" && f.status === "actioned")) f.status = ok ? "accepted" : "rejected";
      state();
      continue;
    }
    if (needsAppraisal) {
      node("sort", "Missing law attestations → route to Appraisal");
      node("appraisal", "Appraisal is judging the haiku against the laws");
      const judged = laws.filter((l) => l.by === "appraisal");
      const reply = await llm(
        "You are the Appraisal node of a governed haiku workflow. Judge strictly against each law. Reply with ONLY a JSON array, one entry per law: [{\"law\":\"<id>\",\"offending\":[\"<every word or phrase in the haiku that breaks the law, exactly as written; empty if none>\"],\"pass\":true|false,\"reason\":\"<one short sentence>\"}]. Apply each law exactly as written, including its prohibited lists and examples.",
        `Haiku:\n${haiku.join("\n")}\n\nLaws:\n${judged.map((l) => `## ${l.id} — ${l.goal}\n${l.text}`).join("\n\n")}`
      );
      let verdicts = [];
      try { verdicts = JSON.parse(reply.match(/\[[\s\S]*\]/)[0]); } catch { verdicts = judged.map((l) => ({ law: l.id, pass: false, reason: "Appraiser returned an unreadable verdict." })); }
      for (const l of judged) {
        const v0 = verdicts.find((x) => x.law === l.id) || { pass: false, reason: "No verdict returned." };
        const bad = Array.isArray(v0.offending) ? v0.offending.filter(Boolean) : [];
        const v = { pass: !!v0.pass && !bad.length, reason: v0.reason || (bad.length ? `Offending: ${bad.join(", ")}` : "No violations found.") };
        if (bad.length && !v0.reason?.includes(bad[0])) v.reason = `${v.reason} (${bad.join(", ")})`;
        for (const f of feedback.filter((f) => f.law === l.id && f.status === "actioned")) f.status = v.pass ? "accepted" : "rejected";
        if (v.pass) { stamps[l.id] = true; emit({ type: "log", node: "appraisal", msg: `${l.id} attested — ${v.reason}` }); }
        else { raise(l.id, v.reason); emit({ type: "log", node: "appraisal", msg: `${l.id} violated — ${v.reason}` }); }
      }
      state();
      continue;
    }
    // all stamps, no open feedback
    node("sort", "All stamps present, no open feedback → stamp approval");
    emit({ type: "done", ok: true, msg: "Exit contract satisfied — approval stamped.", iteration, haiku });
    return;
  }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/laws") {
    res.setHeader("Content-Type", "application/json");
    try {
      if (req.method === "POST") {
        let raw = ""; for await (const c of req) { raw += c; if (raw.length > 20000) break; }
        const b = JSON.parse(raw);
        if (b.toggle) { if (!SEED.find((l) => l.id === b.toggle && l.locked)) saved.enabled[b.toggle] = !!b.enabled; }
        else {
          const goal = String(b.goal || "").trim().slice(0, 200), text = String(b.text || "").trim().slice(0, 4000);
          if (!goal || !text) { res.statusCode = 400; return res.end(JSON.stringify({ error: "A law needs a goal and a description." })); }
          const ids = new Set(allLaws().map((l) => l.id)); let id = slug(goal), n = 2; while (ids.has(id)) id = `${slug(goal)}-${n++}`;
          const tier = Math.min(5, Math.max(1, parseInt(b.tier) || 3));
          saved.custom.push({ id, tag: goal.split(/\s+/)[0].slice(0, 10), goal, tier, group: "content", by: "appraisal", text, custom: true });
        }
        await persist();
      } else if (req.method === "DELETE") {
        const id = url.searchParams.get("id"); saved.custom = saved.custom.filter((l) => l.id !== id); delete saved.enabled[id]; await persist();
      }
      res.end(JSON.stringify(allLaws()));
    } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e.message || e) })); }
    return;
  }
  if (url.pathname === "/api/run") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    let open = true;
    res.on("close", () => (open = false));
    const send = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
    const theme = (url.searchParams.get("theme") || "a quiet room").slice(0, 500);
    const laws = allLaws().filter((l) => l.enabled);
    try { await run(theme, laws, send, () => open); } catch (e) { send({ type: "error", msg: String(e.message || e) }); }
    return res.end();
  }
  if (url.pathname === "/api/chat" && req.method === "POST") {
    let raw = "";
    for await (const c of req) { raw += c; if (raw.length > 20000) break; }
    res.setHeader("Content-Type", "application/json");
    try {
      const msgs = (JSON.parse(raw).messages || []).slice(-12);
      const asks = msgs.filter((m) => m.role === "user").length;
      const out = await llm(
        `You are the friendly intake chatbot for a haiku-writing kiosk. Learn what the visitor wants the haiku to capture: subject, feeling, a specific image or memory. Ask ONE short, warm question per turn (max 2 sentences). After at most 3 visitor answers, or sooner if you already have enough, set ready=true and write a one-sentence brief that a poet could write from. Reply with ONLY JSON: {"reply":"<what you say>","ready":true|false,"brief":"<one-sentence brief, only when ready>"}.`,
        msgs.map((m) => `${m.role === "user" ? "Visitor" : "Bot"}: ${m.text}`).join("\n") + `\n(visitor answers so far: ${asks})`
      );
      let j; try { j = JSON.parse(out.match(/\{[\s\S]*\}/)[0]); } catch { j = { reply: out || "Tell me more?", ready: asks >= 3 }; }
      if (j.ready && !j.brief) j.brief = msgs.filter((m) => m.role === "user").map((m) => m.text).join(". ");
      res.end(JSON.stringify({ reply: String(j.reply || ""), ready: !!j.ready, brief: j.brief || "" }));
    } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e.message || e) })); }
    return;
  }
  const file = path.join(PUB, url.pathname === "/" ? "index.html" : path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, ""));
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404).end("not found"); }
}).listen(PORT, HOST, async () => {
  const lan = Object.values((await import("node:os")).networkInterfaces()).flat().find((i) => i.family === "IPv4" && !i.internal)?.address;
  console.log(`Foundry haiku → http://localhost:${PORT}  (desktop: /desktop.html)${lan ? `\n   on your network → http://${lan}:${PORT}` : ""}`);
  checkBackend();
});
