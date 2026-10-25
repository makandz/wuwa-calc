import { vigorKey, vigorLimit } from "./rules.js";

export interface MatrixMember {
  name: string;
  limited: boolean;
  sequence: number;
}

export interface MatrixTeam {
  id: string;
  dps: number;
  members: readonly MatrixMember[];
}

export interface MatrixSelection {
  ids: string[];
  dps: number;
  limited: number;
  exact: boolean;
}

interface Candidate {
  team: MatrixTeam;
  mask: bigint;
  singles: bigint;
  levels: bigint;
  levelMask: bigint;
}

interface Lineup {
  first: bigint;
  second: bigint;
  levels: bigint;
  levelMask: bigint;
  dps: number;
  limited: number;
  teams: Candidate[];
}

const compare = (a: Lineup, b: Lineup): number => b.dps - a.dps || b.limited - a.limited;
const bitCount = (bits: bigint): number => {
  let count = 0;
  for (; bits; bits &= bits - 1n) count++;
  return count;
};

/** Search whole lineups, retaining the best result per vigor state and a bounded frontier. */
export async function selectMatrixTeams(
  teams: readonly MatrixTeam[], extraVigor: string | null,
  { width = 2048, cancelled = () => false }: { width?: number; cancelled?: () => boolean } = {},
): Promise<MatrixSelection> {
  if (!Number.isInteger(width) || width < 1) throw new RangeError("Matrix search width must be positive");
  const names = [...new Set(teams.flatMap((t) => t.members.map((m) => vigorKey(m.name))))].sort();
  const bits = new Map(names.map((name, i) => [name, 1n << BigInt(i)]));
  const levelBits = new Map(names.map((name, i) => [name, BigInt(i * 4)]));
  let limitedMask = 0n;
  const distinct = new Map<string, Candidate>();
  for (const team of [...teams].sort((a, b) => b.dps - a.dps || a.id.localeCompare(b.id))) {
    if (!Number.isFinite(team.dps) || team.dps <= 0 || team.members.length !== 3) continue;
    if (new Set(team.members.map((m) => vigorKey(m.name))).size !== 3) continue;
    let mask = 0n, singles = 0n, levels = 0n, levelMask = 0n;
    for (const member of team.members) {
      const name = vigorKey(member.name);
      const bit = bits.get(name)!;
      mask |= bit;
      if (member.limited) limitedMask |= bit;
      if (vigorLimit(name, extraVigor) === 1) singles |= bit;
      else if (name !== "Rover") {
        const shift = levelBits.get(name)!;
        levels |= BigInt(member.sequence + 1) << shift;
        levelMask |= 15n << shift;
      }
    }
    // A weaker rotation/build of the same trio cannot improve a lineup. Reused chains must agree.
    const key = `${mask}:${levels}`;
    if (!distinct.has(key)) distinct.set(key, { team, mask, singles, levels, levelMask });
  }
  const candidates = [...distinct.values()];
  const empty: Lineup = { first: 0n, second: 0n, levels: 0n, levelMask: 0n, dps: 0, limited: 0, teams: [] };
  const add = (lineup: Lineup, candidate: Candidate): Lineup | null => {
    if ((lineup.first & candidate.singles) || (lineup.second & candidate.mask)) return null;
    if ((lineup.levels ^ candidate.levels) & lineup.levelMask & candidate.levelMask) return null;
    return {
      first: lineup.first | candidate.mask,
      second: lineup.second | (lineup.first & candidate.mask),
      levels: lineup.levels | candidate.levels,
      levelMask: lineup.levelMask | candidate.levelMask,
      dps: lineup.dps + candidate.team.dps,
      limited: lineup.limited + bitCount(candidate.mask & limitedMask & ~lineup.first),
      teams: [...lineup.teams, candidate],
    };
  };
  // Keep the strongest-first baseline even if a bounded frontier later prunes its path.
  let greedy = empty;
  for (const candidate of candidates) greedy = add(greedy, candidate) ?? greedy;
  let frontier = [empty];
  let exact = true;
  for (let i = 0; i < candidates.length; i++) {
    if (cancelled()) return { ids: [], dps: 0, limited: 0, exact: false };
    const next = new Map<string, Lineup>();
    const keep = (lineup: Lineup): void => {
      const key = `${lineup.first}:${lineup.second}:${lineup.levels}`;
      const previous = next.get(key);
      if (!previous || compare(lineup, previous) < 0) next.set(key, lineup);
    };
    for (const lineup of frontier) {
      keep(lineup);
      const expanded = add(lineup, candidates[i]!);
      if (expanded) keep(expanded);
    }
    frontier = [...next.values()].sort(compare);
    if (frontier.length > width) {
      exact = false;
      frontier.length = width;
    }
    // Let input and paint events interrupt a large roster search.
    if (i % 16 === 15) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  const best = [greedy, frontier[0]!].sort(compare)[0]!;
  return {
    ids: best.teams.map((c) => c.team.id), dps: best.dps, limited: best.limited, exact,
  };
}
