// Matrix S2: permanent allowances, plus the phase's optional Emergency Agent.
export const TWO_VIGOR: ReadonlySet<string> = new Set([
  "Shorekeeper", "Verina", "Mornye", "Suisui", "Baizhi", "Buling",
]);

export const vigorKey = (name: string): string =>
  name === "Rover" || name.endsWith(" Rover") || name.startsWith("Rover: ") ? "Rover" : name;

export const vigorLimit = (name: string, extraVigor: string | null): number =>
  TWO_VIGOR.has(name) || (extraVigor !== null && vigorKey(name) === vigorKey(extraVigor)) ? 2 : 1;
