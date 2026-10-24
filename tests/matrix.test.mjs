import assert from "node:assert/strict";
import test from "node:test";
import { selectMatrixTeams } from "../dist/src/matrix/select.js";
import { TWO_VIGOR, vigorKey, vigorLimit } from "../dist/src/matrix/rules.js";
import { matrixState } from "../dist/src/matrix/state.js";
import { matrixLineup } from "../dist/src/matrix/lineup.js";
import { TEAMS, teamWanted, teamRows, storeSolved, filters, resonatorFilters, pinnedRows } from "../dist/src/page/model.js";
import { hasBuild, solveTeam } from "../dist/src/solve/solver.js";
import { ownership } from "../dist/src/ownership.js";

const member = (name, limited = true, sequence = 0) => ({ name, limited, sequence });
const team = (id, dps, names) => ({ id, dps, members: names.map((name) => typeof name === "string" ? member(name) : name) });

function legal(teams, extra = null) {
  const used = new Map();
  const levels = new Map();
  for (const t of teams) for (const m of t.members) {
    const key = vigorKey(m.name);
    used.set(key, (used.get(key) ?? 0) + 1);
    if (used.get(key) > vigorLimit(key, extra)) return false;
    if (key !== "Rover") {
      if (levels.has(key) && levels.get(key) !== m.sequence) return false;
      levels.set(key, m.sequence);
    }
  }
  return true;
}

test("whole-lineup selection preserves separate Sigrika and Phrolova teams", async () => {
  const teams = [
    team("combined", 150, ["Phrolova", "Sigrika", "Qiuyuan"]),
    team("sigrika", 140, ["Sigrika", "Qiuyuan", "Shorekeeper"]),
    team("phrolova", 120, ["Phrolova", "Cantarella", "Verina"]),
  ];
  const selected = await selectMatrixTeams(teams, null);
  assert.deepEqual(selected.ids, ["sigrika", "phrolova"]);
  assert.equal(selected.dps, 260);
  assert.equal(selected.exact, true);
});

test("support allowances and the optional phase character each stop at two deployments", async () => {
  for (const name of [...TWO_VIGOR, "Lynae"]) {
    const teams = [3, 2, 1].map((n) => team(`${n}`, n, [name, `DPS ${n}`, `Sub ${n}`]));
    const selected = await selectMatrixTeams(teams, "Lynae");
    assert.deepEqual(selected.ids, ["3", "2"], name);
    assert.equal(legal(teams.filter((t) => selected.ids.includes(t.id)), "Lynae"), true);
  }
  const teams = [team("a", 3, ["Lynae", "A", "B"]), team("b", 2, ["Lynae", "C", "D"])];
  assert.deepEqual((await selectMatrixTeams(teams, null)).ids, ["a"]);
  assert.deepEqual((await selectMatrixTeams(teams, "Lynae")).ids, ["a", "b"]);
});

test("Rover forms, rotations and builds consume their character's shared vigor", async () => {
  const teams = [
    team("aero", 100, ["Aero Rover", "A", "B"]),
    team("spectro", 90, ["Spectro Rover", "C", "D"]),
    team("weak-build", 80, ["Aero Rover", "A", "B"]),
    team("invalid", 200, ["Havoc Rover", "Electro Rover", "E"]),
  ];
  assert.deepEqual((await selectMatrixTeams(teams, null)).ids, ["aero"]);
  teams[1].members[0].sequence = 6;
  assert.deepEqual((await selectMatrixTeams(teams.slice(0, 3), "Aero Rover")).ids, ["aero", "spectro"]);
  const supportTeams = [
    team("s0", 100, [member("Shorekeeper", true, 0), "A", "B"]),
    team("s6", 90, [member("Shorekeeper", true, 6), "C", "D"]),
    team("s0-alt", 80, [member("Shorekeeper", true, 0), "C", "D"]),
  ];
  assert.deepEqual((await selectMatrixTeams(supportTeams, null)).ids, ["s0", "s0-alt"]);
});

test("distinct limited coverage breaks DPS ties without overriding stronger lineups", async () => {
  const teams = [
    team("standard", 100, ["A", member("Standard", false), member("Four-star", false)]),
    team("limited", 100, ["A", "B", "C"]),
  ];
  assert.deepEqual((await selectMatrixTeams(teams, null)).ids, ["limited"]);
  teams[0].dps = 101;
  assert.deepEqual((await selectMatrixTeams(teams, null)).ids, ["standard"]);
});

test("small searches match exhaustive legal lineups", async () => {
  let seed = 42;
  const random = (n) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed >>> 8) % n;
  };
  const names = ["A", "B", "C", "D", "E", "F", "Shorekeeper", "Lynae"];
  for (let sample = 0; sample < 20; sample++) {
    const teams = Array.from({ length: 9 }, (_, i) => {
      const members = new Set();
      while (members.size < 3) members.add(names[random(names.length)]);
      return team(`${i}`, random(100) + 1, [...members]);
    });
    let bestDps = 0, bestLimited = 0;
    for (let mask = 0; mask < 1 << teams.length; mask++) {
      const selected = teams.filter((_, i) => mask & (1 << i));
      if (!legal(selected, "Lynae")) continue;
      const dps = selected.reduce((sum, t) => sum + t.dps, 0);
      const limited = new Set(selected.flatMap((t) => t.members.filter((m) => m.limited).map((m) => m.name))).size;
      if (dps > bestDps || (dps === bestDps && limited > bestLimited)) [bestDps, bestLimited] = [dps, limited];
    }
    const selected = await selectMatrixTeams(teams, "Lynae", { width: 1024 });
    assert.equal(selected.dps, bestDps);
    assert.equal(selected.limited, bestLimited);
    assert.equal(selected.exact, true);
  }
});

test("bounded searches report pruning, preserve a legal baseline and can be cancelled", async () => {
  const teams = [team("a", 100, ["A", "B", "C"]), team("b", 90, ["D", "E", "F"])];
  const selected = await selectMatrixTeams(teams, null, { width: 1 });
  assert.equal(selected.exact, false);
  assert.equal(selected.dps, 190);
  assert.equal(legal(teams.filter((t) => selected.ids.includes(t.id))), true);
  assert.deepEqual((await selectMatrixTeams(teams, null, { cancelled: () => true })).ids, []);
  assert.deepEqual(await selectMatrixTeams([], null), { ids: [], dps: 0, limited: 0, exact: true });
});

test("Matrix mode opens support alternatives while retaining ownership and character filters", () => {
  const previous = { ...matrixState };
  const owned = ownership.onlyOwned;
  const saved = [...resonatorFilters];
  const wanted = () => Object.entries(TEAMS).filter(([key, ms]) => teamWanted(key, ms));
  try {
    resonatorFilters.clear();
    ownership.onlyOwned = true;
    matrixState.enabled = false;
    const normal = new Set(wanted().map(([key]) => key));
    matrixState.enabled = true;
    const expanded = wanted();
    assert.ok(expanded.length > normal.size);
    assert.ok(expanded.some(([key, ms]) => !normal.has(key) && ms.some((m) => m.name === "Verina")));
    assert.ok(expanded.every(([, ms]) => ms.every((m) => m.name !== "Qingxiao")));
    resonatorFilters.set("Shorekeeper", "exclude");
    assert.ok(wanted().every(([, ms]) => ms.every((m) => m.name !== "Shorekeeper")));
  } finally {
    Object.assign(matrixState, previous);
    ownership.onlyOwned = owned;
    resonatorFilters.clear();
    for (const [key, value] of saved) resonatorFilters.set(key, value);
  }
});

test("the table adapter selects by DPS and invalidates its cache when vigor changes", async () => {
  const previous = { ...matrixState };
  const rows = ["a", "b"].map((key, i) => ({
    key,
    members: ["Lynae", `DPS ${i}`, `Sub ${i}`].map((name) => ({ name, loadout: { resonator: { tier: 0 } } })),
    combo: [{ sequence: 0 }, { sequence: 0 }, { sequence: 0 }],
  }));
  const runs = new Map([["a", { total: 100 }], ["b", { total: 90 }]]);
  try {
    Object.assign(matrixState, { enabled: true, extraVigor: null });
    assert.deepEqual((await matrixLineup(rows, runs, () => false)).rows.map((r) => r.key), ["a"]);
    matrixState.extraVigor = "Lynae";
    assert.equal((await matrixLineup(rows, runs, () => false)).rows.length, 2);
    runs.set("b", { total: 110 });
    matrixState.extraVigor = null;
    assert.deepEqual((await matrixLineup(rows, runs, () => false)).rows.map((r) => r.key), ["b"]);
    matrixState.enabled = false;
    assert.equal((await matrixLineup(rows, runs, () => false)).rows, rows);
  } finally {
    Object.assign(matrixState, previous);
  }
});

test("pins cannot add filtered-out teams to a Matrix lineup", () => {
  const previous = { ...matrixState };
  const saved = [...resonatorFilters];
  const pins = [...pinnedRows];
  try {
    resonatorFilters.clear();
    pinnedRows.clear();
    matrixState.enabled = false;
    const [key, members] = Object.entries(TEAMS).find(([key, ms]) => teamWanted(key, ms)
      && ms.every((m) => hasBuild(m, filters))
      && ms.some((m) => m.name === "Phrolova") && ms.some((m) => m.name === "Shorekeeper"));
    storeSolved(key, solveTeam(key, members, filters));
    const row = teamRows().find((r) => r.teamKey === key);
    assert.ok(row);
    pinnedRows.add(row.key);
    resonatorFilters.set("Phrolova", "exclude");
    assert.ok(teamRows().some((r) => r.key === row.key));
    matrixState.enabled = true;
    assert.ok(teamRows().every((r) => r.key !== row.key));
  } finally {
    Object.assign(matrixState, previous);
    resonatorFilters.clear();
    for (const [key, value] of saved) resonatorFilters.set(key, value);
    pinnedRows.clear();
    for (const key of pins) pinnedRows.add(key);
  }
});

test("Matrix preferences survive reload, malformed data and unavailable storage", async () => {
  const previous = globalThis.localStorage;
  const saved = new Map([["wuwa.matrixLineup.v1", JSON.stringify({ enabled: true, extraVigor: null })]]);
  try {
    globalThis.localStorage = { getItem: (key) => saved.get(key), setItem: (key, value) => saved.set(key, value) };
    const restored = await import("../dist/src/matrix/state.js?restored");
    assert.deepEqual(restored.matrixState, { enabled: true, extraVigor: null });
    restored.matrixState.extraVigor = "Denia";
    restored.saveMatrixPreference();
    assert.equal(JSON.parse(saved.get("wuwa.matrixLineup.v1")).extraVigor, "Denia");
    saved.set("wuwa.matrixLineup.v1", "broken");
    assert.deepEqual((await import("../dist/src/matrix/state.js?broken")).matrixState, { enabled: false, extraVigor: "Lynae" });
    globalThis.localStorage = { getItem() { throw Error("unavailable"); }, setItem() { throw Error("unavailable"); } };
    const unavailable = await import("../dist/src/matrix/state.js?unavailable");
    assert.equal(unavailable.matrixState.enabled, false);
    assert.doesNotThrow(() => unavailable.saveMatrixPreference());
  } finally {
    globalThis.localStorage = previous;
  }
});
