import assert from "node:assert";
import { lineSyllables as n } from "./syllables.js";
assert.equal(n("an old silent pond"), 5);
assert.equal(n("a frog jumps into the pond"), 7);
assert.equal(n("splash silence again"), 5);
assert.equal(n("the wind in the trees"), 5);
assert.equal(n("quiet room"), 3);
console.log("syllables ok");
