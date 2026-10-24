import assert from "node:assert/strict";
import test from "node:test";
import { ALL_TEAMS, teamKey } from "../dist/src/resonators/teams.js";
import { ENCORE } from "../dist/src/resonators/fusion/encore.js";
import { ROVER_HAVOC } from "../dist/src/resonators/havoc/rover_havoc.js";
import { DEFAULT_TEAM_COST, MAKAN_COST_OVERRIDES, makanCost } from "../dist/src/costs.js";
import {
  TEAM_COSTS, defaultFilters, member, hasBuild, eligibleWeapons, sequenceLevels,
  solveTeam, comboOf, weaponBase, isSignature, bestKey, picksKey, filterSignature,
} from "../dist/src/solve/solver.js";
import { applyHash, syncHash, filters, solveFits, storeSolved, picksCache, bestPicks } from "../dist/src/page/model.js";

const loadouts = [...new Set([...ALL_TEAMS.flatMap((t) => t.loadouts), ROVER_HAVOC, ENCORE])];
const membersNamed = (name) => loadouts.filter((l) => l.resonator.name === name).map((l) => member(l));

test("the custom default resolves every named override in all its loadout variants", () => {
  assert.equal(defaultFilters().cost, "makan");
  assert.ok(TEAM_COSTS.includes(DEFAULT_TEAM_COST));
  for (const [name, cost] of Object.entries(MAKAN_COST_OVERRIDES)) {
    const variants = membersNamed(name);
    assert.ok(variants.length > 0, `${name} matches an existing character`);
    for (const m of variants) {
      assert.ok(hasBuild(m, defaultFilters()), `${name} supports the requested level and weapon`);
      assert.deepEqual(sequenceLevels(m, defaultFilters()), [cost.sequence]);
      const options = eligibleWeapons(m, defaultFilters());
      assert.equal(options.length, 1);
      const weapon = m.loadout.weapons[options[0]];
      assert.equal(weapon.weaponType, m.loadout.resonator.weapon);
      if (cost.weapon) {
        assert.equal(weaponBase(weapon), cost.weapon);
      } else if (cost.signature) {
        assert.equal(options[0], 0);
      } else {
        assert.equal(isSignature(m.loadout, options[0]), false);
      }
    }
  }
});

test("unlisted standard and limited characters use S0 without a limited weapon", () => {
  for (const name of ["Changli", "Encore", "Suoming", "Lucilla"]) {
    const m = membersNamed(name)[0];
    assert.ok(m);
    assert.deepEqual(sequenceLevels(m, defaultFilters()), [0]);
    const [weapon] = eligibleWeapons(m, defaultFilters());
    assert.equal(isSignature(m.loadout, weapon), false);
  }
  const builtIn = { ...defaultFilters(), cost: "s0r0" };
  assert.deepEqual(sequenceLevels(membersNamed("Sanhua")[0], builtIn), [6]);
  assert.deepEqual(sequenceLevels(membersNamed("Jianxin")[0], builtIn), [2]);
});

test("Makan's costs runs Verina at S2 and four-stars and all Rover elements at S6", () => {
  for (const [name, level] of [["Verina", 2], ["Sanhua", 6], ["Buling", 6], ["Danjin", 6], ["Mortefi", 6], ["Aero Rover", 6], ["Electro Rover", 6], ["Havoc Rover", 6], ["Spectro Rover", 6]]) {
    const variants = membersNamed(name);
    assert.ok(variants.length > 0, `${name} matches an existing loadout`);
    for (const m of variants) {
      assert.ok(hasBuild(m, defaultFilters()), `${name} has a valid build`);
      assert.deepEqual(sequenceLevels(m, defaultFilters()), [level]);
      assert.equal(isSignature(m.loadout, eligibleWeapons(m, defaultFilters())[0]), false);
    }
  }
});

test("personal preset cache keys cannot reuse solves from its earlier S0 defaults", () => {
  const f = defaultFilters();
  const ms = membersNamed("Verina");
  assert.notEqual(bestKey("t0", ms, f), "t0|makan|000000");
  assert.notEqual(picksKey("t0", ms, f), "t0|makan|0");
  assert.notEqual(filterSignature(f), ",makan,,,,,,,");
});

test("S0 omits loadouts whose declared rotations require higher sequences", () => {
  for (const name of ["Jianxin", "Roccia"]) {
    const unsupported = membersNamed(name).filter((m) => m.loadout.minSequence > 0);
    assert.ok(unsupported.length > 0);
    for (const m of unsupported) {
      assert.deepEqual(sequenceLevels(m, defaultFilters()), []);
      assert.equal(hasBuild(m, defaultFilters()), false);
    }
  }
});

test("S6 Buling makes the Brant/Carlotta team energy-feasible", () => {
  const index = ALL_TEAMS.findIndex((t) => t.loadouts.map((l) => l.resonator.name).join(",") === "Buling,Brant,Carlotta");
  assert.ok(index >= 0);
  const team = ALL_TEAMS[index];
  const ms = team.loadouts.map((l, i) => member(l, team.mdps[i]));
  const f = defaultFilters();
  const solved = solveTeam(teamKey(index), ms, f);
  assert.equal(solved.unavailable, undefined);
  assert.ok(solved.rows.length > 0);
  assert.equal(solved.picks[0].sequence, 6);
  assert.ok(solved.scores.every((score) => Number.isFinite(score.total) && score.total > 0));
  assert.equal(solveFits(bestKey(teamKey(index), ms, f), solved, f), true);
});

test("an unfulfillable energy requirement is cached as unavailable without invalid picks", () => {
  const index = ALL_TEAMS.findIndex((t) => t.loadouts.map((l) => l.resonator.name).join(",") === "Buling,Brant,Carlotta");
  assert.ok(index >= 0);
  const team = ALL_TEAMS[index];
  const ms = team.loadouts.map((l, i) => member(l, team.mdps[i]));
  const key = teamKey(index);
  const f = defaultFilters();
  const loadout = ms.find((m) => m.name === "Carlotta").loadout;
  const previous = loadout.minEr;
  try {
    loadout.minEr = 1000;
    const solved = solveTeam(key, ms, f);
    assert.match(solved.unavailable, /Carlotta.*cannot fill their Energy bar/);
    assert.deepEqual(solved.rows, []);
    assert.deepEqual(solved.scores, []);
    assert.equal(solveFits(bestKey(key, ms, f), solved, f), true);
    const restored = JSON.parse(JSON.stringify(solved));
    assert.equal(solveFits(bestKey(key, ms, f), restored, f), true);
    storeSolved(key, solved, f);
    assert.equal(picksCache.has(picksKey(key, ms, f)), false);
  } finally {
    loadout.minEr = previous;
    bestPicks.delete(bestKey(key, ms, f));
  }
});

test("comparison axes expose alternatives without altering the other preset constraints", () => {
  const denia = membersNamed("Denia")[0];
  const weapons = { ...defaultFilters(), weapons: ["Denia"] };
  assert.equal(eligibleWeapons(denia, weapons).length, denia.loadout.weapons.length);
  assert.deepEqual(sequenceLevels(denia, weapons), [0]);
  const lucy = membersNamed("Lucy")[0];
  const sequences = { ...defaultFilters(), sequences: ["Lucy"] };
  assert.deepEqual(sequenceLevels(lucy, sequences), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(eligibleWeapons(lucy, sequences), [0]);
  assert.deepEqual(sequenceLevels(membersNamed("Verina")[0], { ...defaultFilters(), sequences: ["Verina"] }), [0, 1, 2, 3, 4, 5, 6]);
});

test("custom and built-in cost results have distinct solve and precompute keys", () => {
  const ms = membersNamed("Denia");
  const custom = defaultFilters();
  const builtIn = { ...defaultFilters(), cost: "s0r0" };
  assert.notEqual(bestKey("t0", ms, custom), bestKey("t0", ms, builtIn));
  assert.notEqual(picksKey("t0", ms, custom), picksKey("t0", ms, builtIn));
  assert.notEqual(filterSignature(custom), filterSignature(builtIn));
});

test("URL state defaults to Makan's costs and round-trips every explicit preset", () => {
  const originalLocation = globalThis.location;
  const originalHistory = globalThis.history;
  globalThis.location = { hash: "", pathname: "/index.html", search: "" };
  globalThis.history = {
    state: null,
    replaceState(_state, _unused, url) {
      globalThis.location.hash = new URL(url, "https://example.invalid").hash;
    },
  };
  try {
    applyHash();
    assert.equal(filters.cost, "makan");
    for (const cost of TEAM_COSTS) {
      filters.cost = cost;
      syncHash(null);
      assert.ok(globalThis.location.hash.includes("tc="));
      filters.cost = cost === "makan" ? "s0r1" : "makan";
      applyHash();
      assert.equal(filters.cost, cost);
    }
  } finally {
    globalThis.location = originalLocation;
    globalThis.history = originalHistory;
    filters.cost = DEFAULT_TEAM_COST;
  }
});

for (const name of ["Denia", "Lucy", "Phrolova", "Suoming", "Lucilla"]) {
  test(`a real ${name} team solve uses the requested equipment and sequence levels`, () => {
    const index = ALL_TEAMS.findIndex((t) => t.loadouts.some((l) => l.resonator.name === name)
      && t.loadouts.every((l) => hasBuild(member(l), defaultFilters())));
    assert.ok(index >= 0);
    const team = ALL_TEAMS[index];
    const ms = team.loadouts.map((l, i) => member(l, team.mdps[i]));
    const solved = solveTeam(teamKey(index), ms, defaultFilters());
    assert.ok(solved.rows.length > 0);
    assert.ok(solved.scores.every((score) => Number.isFinite(score.total) && score.total > 0));
    for (const picks of [solved.picks, ...solved.rows]) {
      ms.forEach((m, i) => {
        const cost = makanCost(m.name, m.loadout.resonator.tier);
        assert.equal(picks[i].sequence, cost.sequence);
        const combo = comboOf(m.loadout, picks[i]);
        assert.equal(combo.weapon.refinement, 1);
        if (cost?.weapon) {
          assert.equal(weaponBase(combo.weapon), cost.weapon);
        } else if (!cost?.signature) {
          assert.equal(isSignature(m.loadout, picks[i].weapon), false);
        }
      });
    }
    if (name === "Lucy") {
      const compared = { ...defaultFilters(), sequences: ["Lucy"] };
      const result = solveTeam(teamKey(index), ms, compared);
      const slot = ms.findIndex((m) => m.name === "Lucy");
      assert.equal(result.picks[slot].sequence, 3);
      assert.deepEqual([...new Set(result.rows.map((p) => p[slot].sequence))].sort(), [0, 1, 2, 3, 4, 5, 6]);
    }
  });
}
