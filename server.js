// Foundry haiku loop — real LLM calls (via the local `claude` CLI), streamed to the browser over SSE.
// Mirrors the gideas haiku flow: forge → sort → quench → sort → refine/appraisal → sort → COMPLETE.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lineSyllables } from "./syllables.js";

const PORT = process.env.PORT || 4173;
const MODEL = process.env.FOUNDRY_MODEL || "haiku";
const MAX_ITER = 6;
const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };

const LAWS = {
  syllables: { id: "syllables", name: "5-7-5", by: "quench", text: "Three lines of 5, 7 and 5 syllables." },
  "no-weather": { id: "no-weather", name: "no-weather", by: "appraisal", text: "No meteorological references: rain, storm, snow, wind, thunder, lightning, clouds, fog, heat, frost." },
  "no-atmosphere": { id: "no-atmosphere", name: "no-atmosphere", by: "appraisal", text: "No atmospheric or sky references: sky, air, breeze, mist, haze, sunset, dawn light, stars as weather." },
};

const llm = (system, prompt) =>
  new Promise((resolve, reject) => {
    const p = spawn("claude", ["-p", "--model", MODEL, "--tools", "", "--no-session-persistence", "--setting-sources", "", "--system-prompt", system]);
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (c) => (c === 0 ? resolve(out.trim()) : reject(new Error(err || `claude exited ${c}`))));
    p.stdin.end(prompt);
  });

const parseHaiku = (t) =>
  t.replace(/```[a-z]*/g, "").split("\n").map((l) => l.replace(/^[\s>*\-"]+|["\s]+$/g, "")).filter(Boolean).slice(0, 3);

async function run(theme, activeLaws, send, alive) {
  const laws = activeLaws.map((id) => LAWS[id]);
  const stamps = {};          // law id -> true; invalidated whenever the haiku changes
  let feedback = [];          // {id, law, text, status: open|actioned|accepted|rejected}
  let fbSeq = 0, haiku = [], iteration = 0;
  const emit = (e) => alive() && send(e);
  const node = (n, msg) => emit({ type: "node", node: n, msg, iteration });
  const state = () => emit({ type: "state", haiku, syl: haiku.map(lineSyllables), stamps: { ...stamps }, feedback: feedback.map((f) => ({ ...f })) });
  const raise = (law, text) => { feedback.push({ id: ++fbSeq, law, text, status: "open" }); };

  emit({ type: "start", laws, theme });

  // forge
  node("forge", `Forge is writing a haiku about “${theme}”`);
  haiku = parseHaiku(await llm("You are the Forge node of a governed haiku workflow. Output only the three lines of the haiku, nothing else.", `Write a haiku (3 lines) about: ${theme}`));
  state();

  while (alive()) {
    // sort — decides the route from stamps + feedback
    node("sort", "Sort inspects stamps and feedback");
    await new Promise((r) => setTimeout(r, 700));
    const open = feedback.filter((f) => f.status === "open");
    const needsQuench = !stamps.syllables;
    const needsAppraisal = laws.some((l) => l.by === "appraisal" && !stamps[l.id]);

    if (open.length) {
      if (++iteration > MAX_ITER) { emit({ type: "done", ok: false, msg: `Iteration limit (${MAX_ITER}) hit — Sort would escalate to a human.`, iteration }); return; }
      node("sort", `${open.length} unaddressed feedback → route to Refine`);
      node("refine", "Refine is triaging feedback and revising");
      const fb = open.map((f) => `- [${f.law}] ${f.text}`).join("\n");
      haiku = parseHaiku(await llm("You are the Refine node of a governed haiku workflow. Fix every feedback item. Output only the three lines of the revised haiku, nothing else.", `Theme: ${theme}\nCurrent haiku:\n${haiku.join("\n")}\n\nFeedback to fix:\n${fb}`));
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
      if (ok) { stamps.syllables = true; emit({ type: "log", node: "quench", msg: "Syllable law attested: 5-7-5" }); }
      else {
        const d = haiku.length !== 3 ? `Expected 3 lines, got ${haiku.length}.` : syl.map((s, i) => (s !== want[i] ? `line ${i + 1} has ${s}, needs ${want[i]}` : null)).filter(Boolean).join("; ") + ".";
        raise("syllables", d);
        emit({ type: "log", node: "quench", msg: `Raised feedback: ${d}` });
      }
      for (const f of feedback.filter((f) => f.law === "syllables" && f.status === "actioned")) f.status = ok ? "accepted" : "rejected";
      state();
      continue;
    }
    if (needsAppraisal) {
      node("sort", "Missing law attestations → route to Appraisal");
      node("appraisal", "Appraisal is judging the haiku against the laws");
      const judged = laws.filter((l) => l.by === "appraisal");
      const reply = await llm(
        "You are the Appraisal node of a governed haiku workflow. Judge strictly against each law. Reply with ONLY a JSON array: [{\"law\":\"<id>\",\"pass\":true|false,\"reason\":\"<short, name the offending words>\"}] — one entry per law.",
        `Haiku:\n${haiku.join("\n")}\n\nLaws:\n${judged.map((l) => `- ${l.id}: ${l.text}`).join("\n")}`
      );
      let verdicts = [];
      try { verdicts = JSON.parse(reply.match(/\[[\s\S]*\]/)[0]); } catch { verdicts = judged.map((l) => ({ law: l.id, pass: false, reason: "Appraiser returned an unreadable verdict." })); }
      for (const l of judged) {
        const v = verdicts.find((x) => x.law === l.id) || { pass: false, reason: "No verdict returned." };
        for (const f of feedback.filter((f) => f.law === l.id && f.status === "actioned")) f.status = v.pass ? "accepted" : "rejected";
        if (v.pass) { stamps[l.id] = true; emit({ type: "log", node: "appraisal", msg: `${l.name} attested — ${v.reason}` }); }
        else { raise(l.id, v.reason); emit({ type: "log", node: "appraisal", msg: `${l.name} violated — ${v.reason}` }); }
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
  if (url.pathname === "/api/run") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    let open = true;
    res.on("close", () => (open = false));
    const send = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
    const theme = (url.searchParams.get("theme") || "a quiet room").slice(0, 500);
    const ids = ["syllables", ...(url.searchParams.get("laws") === "off" ? [] : ["no-weather", "no-atmosphere"])];
    try { await run(theme, ids, send, () => open); } catch (e) { send({ type: "error", msg: String(e.message || e) }); }
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
}).listen(PORT, () => console.log(`Foundry haiku → http://localhost:${PORT}`));
