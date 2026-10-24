/** Makan's roster and the main screen's ownership preference. */
import { Tier } from "./engine/stats.js";
import type { Resonator } from "./engine/gear.js";
import { primaryTeamsWhere, teamKey } from "./resonators/teams.js";

/** Standard characters, four-stars and Rovers are included by their existing tier below. */
export const OWNED_LIMITED_CHARACTERS: ReadonlySet<string> = new Set([
  "Phrolova", "Cantarella", "Qiuyuan", "Hsin", "Suisui", "Lucy", "Rebecca", "Denia",
  "Hiyuki", "Sigrika", "Aemeath", "Mornye", "Lynae", "Chisa", "Iuno", "Augusta",
  "Cartethyia", "Ciaccona", "Phoebe", "Carlotta", "Shorekeeper", "Jinhsi", "Yinlin", "Jiyan",
  "Suoming", "Lucilla",
]);

export const ownsCharacter = (r: Pick<Resonator, "name" | "tier">): boolean =>
  r.tier !== Tier.Limited || OWNED_LIMITED_CHARACTERS.has(r.name);

export const teamOwned = (members: { loadout: { resonator: Resonator } }[]): boolean =>
  members.every((m) => ownsCharacter(m.loadout.resonator));

/** Choose an owned support when a group's usual first choice is unowned. */
export const OWNED_PRIMARY_TEAMS = new Set(primaryTeamsWhere((team) =>
  team.loadouts.every((l) => ownsCharacter(l.resonator)))
  .flatMap((primary, i) => primary ? [teamKey(i)] : []));

const STORAGE_KEY = "wuwa.onlyOwned.v1";
function savedPreference(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
}
export const ownership = { onlyOwned: savedPreference() };
export function saveOwnershipPreference(): void {
  try { localStorage.setItem(STORAGE_KEY, ownership.onlyOwned ? "1" : "0"); } catch { /* no storage */ }
}
