import { Tier } from "../engine/stats.js";
import type { TeamRow } from "../page/model.js";
import type { TeamRun } from "../solve/teamrun.js";
import { selectMatrixTeams } from "./select.js";
import { matrixState } from "./state.js";

let cached: { signature: string; ids: Set<string>; summary: string } | null = null;

export async function matrixLineup(
  rows: TeamRow[], runs: ReadonlyMap<string, TeamRun>, cancelled: () => boolean,
): Promise<{ rows: TeamRow[]; summary: string }> {
  if (!matrixState.enabled) return { rows, summary: "" };
  const teams = rows.map((row) => {
    const run = runs.get(row.key)!;
    return {
      id: row.key, dps: run.total,
      members: row.members.map((member, i) => ({
        name: member.name, limited: member.loadout.resonator.tier === Tier.Limited,
        sequence: row.combo[i]!.sequence,
      })),
    };
  });
  const signature = JSON.stringify([matrixState.extraVigor, teams.map((t) => [t.id, t.dps])]);
  if (cached?.signature !== signature) {
    const selected = await selectMatrixTeams(teams, matrixState.extraVigor, { cancelled });
    if (cancelled()) return { rows: [], summary: "" };
    cached = {
      signature, ids: new Set(selected.ids),
      summary: `${selected.exact ? "Optimal lineup" : "Best lineup found (bounded search)"}`
        + ` · ${Math.floor(selected.dps).toLocaleString("en-US")} combined DPS`
        + ` · ${selected.limited} distinct limited characters`,
    };
  }
  return { rows: rows.filter((row) => cached!.ids.has(row.key)), summary: cached.summary };
}
