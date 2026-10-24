import assert from "node:assert/strict";
import test from "node:test";
import { ALL_TEAMS, PRIMARY_TEAM, INTERCHANGEABLE, primaryTeamsWhere } from "../dist/src/resonators/teams.js";
import { ENCORE } from "../dist/src/resonators/fusion/encore.js";
import { TEAMS, teamWanted, resonatorFilters } from "../dist/src/page/model.js";
import { OWNED_LIMITED_CHARACTERS, ownsCharacter, ownership, teamOwned } from "../dist/src/ownership.js";

const roster = new Map([...ALL_TEAMS.flatMap((t) => t.loadouts), ENCORE].map((l) => [l.resonator.name, l.resonator]));
const wanted = () => Object.entries(TEAMS).filter(([key, ms]) => teamWanted(key, ms));

test("the supplied limited roster matches the app's names, with standards and free characters included", () => {
  assert.equal(OWNED_LIMITED_CHARACTERS.size, 26);
  for (const name of OWNED_LIMITED_CHARACTERS) {
    assert.ok(roster.has(name), `${name} exists in the calculator`);
    assert.equal(ownsCharacter(roster.get(name)), true);
  }
  for (const name of ["Verina", "Encore", "Jianxin", "Sanhua", "Buling", "Aero Rover"]) {
    assert.equal(ownsCharacter(roster.get(name)), true, name);
  }
  for (const name of ["Changli", "Roccia", "Qingxiao", "Zani"]) {
    assert.equal(ownsCharacter(roster.get(name)), false, name);
  }
});

test("ownership requires every teammate and combines with the existing character filters", () => {
  const previous = ownership.onlyOwned;
  const saved = [...resonatorFilters];
  try {
    ownership.onlyOwned = false;
    resonatorFilters.clear();
    const original = wanted().map(([key]) => key);
    ownership.onlyOwned = true;
    const owned = wanted();
    assert.ok(owned.length > 0);
    assert.ok(owned.length < original.length);
    assert.ok(owned.every(([, ms]) => teamOwned(ms)));
    assert.ok(owned.some(([, ms]) => ms.some((m) => m.name === "Phrolova")));
    for (const name of ["Suoming", "Lucilla"]) {
      assert.ok(owned.some(([, ms]) => ms.some((m) => m.name === name)), `${name} appears with ownership filtering enabled`);
    }
    resonatorFilters.set("Phrolova", "exclude");
    assert.ok(wanted().length > 0);
    assert.ok(wanted().every(([, ms]) => ms.every((m) => m.name !== "Phrolova")));
    resonatorFilters.clear();
    ownership.onlyOwned = false;
    assert.deepEqual(wanted().map(([key]) => key), original);
  } finally {
    ownership.onlyOwned = previous;
    resonatorFilters.clear();
    for (const [name, mode] of saved) resonatorFilters.set(name, mode);
  }
});

test("support groups fall back to an eligible support when their default is unavailable", () => {
  const eligible = (t) => t.loadouts.every((l) => l.resonator.name !== "Shorekeeper");
  const primary = primaryTeamsWhere(eligible);
  const replacement = ALL_TEAMS.findIndex((t, i) => primary[i] && !PRIMARY_TEAM[i]);
  assert.ok(replacement >= 0, "at least one group needed a replacement support");
  const team = ALL_TEAMS[replacement];
  const sameGroup = (other) => other.from === team.from && other.loadouts.every((l, slot) =>
    INTERCHANGEABLE.has(l) ? INTERCHANGEABLE.has(team.loadouts[slot]) : l === team.loadouts[slot]);
  const alternatives = ALL_TEAMS.filter((t) => sameGroup(t) && eligible(t));
  assert.equal(team.lead, Math.min(...alternatives.map((t) => t.lead)));
  assert.ok(primary.every((selected, i) => !selected || eligible(ALL_TEAMS[i])));
});

test("the checkbox preference survives reload and unavailable storage", async () => {
  const previous = globalThis.localStorage;
  const saved = new Map([["wuwa.onlyOwned.v1", "1"]]);
  try {
    globalThis.localStorage = { getItem: (key) => saved.get(key), setItem: (key, value) => saved.set(key, value) };
    const restored = await import("../dist/src/ownership.js?restored");
    assert.equal(restored.ownership.onlyOwned, true);
    restored.ownership.onlyOwned = false;
    restored.saveOwnershipPreference();
    assert.equal(saved.get("wuwa.onlyOwned.v1"), "0");
    globalThis.localStorage = { getItem() { throw Error("unavailable"); }, setItem() { throw Error("unavailable"); } };
    const unavailable = await import("../dist/src/ownership.js?unavailable");
    assert.equal(unavailable.ownership.onlyOwned, false);
    assert.doesNotThrow(() => unavailable.saveOwnershipPreference());
  } finally {
    globalThis.localStorage = previous;
  }
});
