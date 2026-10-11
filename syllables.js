// Heuristic English syllable counter — the deterministic "quench" check.
// shortcut: rule-based, ~95% on common words; swap for a CMU-dict lookup if it misjudges.
const EXC = { fire: 1, hour: 1, our: 1, every: 2, evening: 2, poem: 2, quiet: 2, being: 2, area: 3, idea: 3, real: 1, people: 2, business: 2, different: 2, family: 3, camera: 3, chocolate: 2, beautiful: 3, lion: 2, ruin: 2, fluid: 2, science: 2, diamond: 2, seas: 1, ocean: 2, violet: 3, flower: 2, shower: 2, power: 2, tower: 2, mirror: 2, silent: 2, lonely: 2, whisper: 2, heaven: 2, even: 2, fading: 2, orange: 2, wednesday: 2, though: 1, through: 1, thought: 1, bright: 1, light: 1, night: 1, eyes: 1, ice: 1, wire: 1, tire: 1, choir: 1, buoy: 1, rhythm: 2, prism: 2, chasm: 2, poet: 2, create: 2, dying: 2, flying: 2, trying: 2, crying: 2 };
export function syllables(word) {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (EXC[w] != null) return EXC[w];
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const m = w.match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
}
export const lineSyllables = (line) => line.split(/[\s—-]+/).filter(Boolean).reduce((n, w) => n + syllables(w), 0);
