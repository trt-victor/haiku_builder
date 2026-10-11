# Foundry haiku loop — touch visual

Top: the Foundry loop (Forge · Sort · Quench · Refine · Appraisal) with a token showing where the AI is right now.
Bottom: the haiku being forged, the laws with their stamps, and a live trail of every routing decision.

Modelled on the haiku flow in https://github.com/really-knows-ai/gideas (5-7-5 + `no-weather` / `no-atmosphere` laws).

## Run
```bash
cd foundry-haiku && npm start     # http://localhost:4175 — open full screen on the touch display
npm test                          # syllable counter self-check
```
Default backend is local **Ollama + Mistral** (`ollama pull mistral`), served on port **4175**, bound to `0.0.0.0` so another screen on the network can open `http://<this-mac-ip>:4175`. The server prints both URLs and warns at startup if Ollama or the model is missing.
`FOUNDRY_MODEL=gemma4:12b npm start` swaps the model; `FOUNDRY_BACKEND=claude` uses the `claude` CLI instead (model default `haiku`); `PORT`, `HOST`, `OLLAMA_URL` are also honoured.

## What is real
- **Forge, Refine, Appraisal, chat** — real LLM calls (Ollama by default).
- **Quench** — deterministic syllable counter (`syllables.js`), as in the real flow.
- **Sort** — real routing logic in `server.js`: open feedback → Refine; no syllable stamp → Quench; missing law stamps → Appraisal; all stamps + no feedback → approval. Any revision voids all stamps. Iteration limit 6.
- Not real: the Kubernetes runtime, cryptographic stamps, multi-appraiser quorum.

## Display
Built for the 1080 × 3840 kiosk (two 1080 × 1920 panels, seam between): top panel = the loop, laws and where the AI is; bottom panel = theme chat and the haiku being forged.
The page scales to fit any window. Options: `?fit=0` shows it 1:1, `?seam=0` hides the seam line.
Font is Roboto from Google Fonts — an offline kiosk needs the Roboto file self-hosted.

## Two screens, one server
- `/` — portrait kiosk (1080 × 3840, two stacked panels).
- `/desktop.html` — normal computer screen (16:9, 1920 × 1080): loop on the left, chat + haiku workbench on the right.
Both share `app.js`, `style.css` and `server.js`; `body.desktop` switches the layout.

## Chat
The bottom/right panel starts as a chatbot (`POST /api/chat`, same model). It asks up to ~3 short questions, then a "Forge my haiku" button appears and the one-sentence brief it distilled becomes the theme for the loop. The theme buttons skip the chat.

## Laws
Laws follow the gideas `Law` CRD: goal, tier 1–5 (Finding · Ruling · Local Statute · State Constitution · Federal Accord), group, appliesTo, and a markdown representation. The three seeds are the real haiku laws from `nodes/haiku-manifests/`.
- Tap a law row in the top panel to read it (and its status in the current run).
- **Laws** button in the chat: expand a law to read it, switch it off, or **write your own** (goal + description + tier). Custom laws are judged by the Appraisal LLM against exactly the text you wrote, and are saved in `laws.json` (git-ignored). The 5-7-5 law is locked on because Quench checks it in code.

## How this compares with the real Foundry flow (audit of gideas @ main)
Checked against `nodes/sort`, `nodes/haiku-quench`, `nodes/refine`, `nodes/internal/handlers` and `nodes/haiku-manifests/flow.yaml`.
- **Quench never regenerates anything.** It reads the current haiku, counts syllables in code, accepts/rejects earlier fixes, raises feedback if invalid, stamps, and routes to Sort. Only **Forge** (once, at the start) and **Refine** (only when there is feedback) write the haiku — and Refine rewrites the whole haiku via an LLM, so a "fix" can change more than one line. (This demo's Refine prompt adds "change as little as possible"; the real one doesn't.)
- **Stamps belong to a version.** A revised haiku is a new version with no stamps, so it must pass Quench and Appraisal again. Same here.
- **Sort is a decision tree over stamps + feedback**, not an LLM: deadlock check first, then walk `nodeOrder` (quench, appraisal, hitl-approval): missing stamp → that node; stamp present but NEW/REJECTED feedback from it → Refine; ACTIONED fixes → Appraisal; then Complete.
- **Enforcement:** the exit contract only lists `appraisal` and `approval`. Every law with `appliesTo: [haiku]` automatically adds a required attestation (`VerifyLawAttestations`), so a new law is enforced with no flow change. Law tier, group mode (law-by-law/bundle) and passes are CRD fields.
- **Differences in this demo:** (1) Quench attests *evaluated* even when the haiku is invalid in the real flow; here a green stamp means *passed*. (2) Real flow has a human `hitl-approval` node; here Sort stamps approval itself. (3) Real deadlock threshold (feedback depth 3) escalates to a human arbiter; here an iteration cap of 8 ends the run. (4) Real Appraisal fans out to several appraiser personas; here one LLM call. (5) Law changes aren't versioned/hash-addressed.
