# Foundry haiku loop — touch visual

Top: the Foundry loop (Forge · Sort · Quench · Refine · Appraisal) with a token showing where the AI is right now.
Bottom: the haiku being forged, the laws with their stamps, and a live trail of every routing decision.

Modelled on the haiku flow in https://github.com/really-knows-ai/gideas (5-7-5 + `no-weather` / `no-atmosphere` laws).

## Run
```bash
cd foundry-haiku && npm start     # http://localhost:4173 — open full screen on the touch display
npm test                          # syllable counter self-check
```
Needs the `claude` CLI logged in (no API key). `FOUNDRY_MODEL=sonnet npm start` changes the model (default `haiku`); `PORT=...` changes the port.

## What is real
- **Forge, Refine, Appraisal** — real LLM calls (`claude -p`, no tools).
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
