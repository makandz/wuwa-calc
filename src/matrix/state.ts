const STORAGE_KEY = "wuwa.matrixLineup.v1";

function savedPreference(): { enabled: boolean; extraVigor: string | null } {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (saved && typeof saved === "object" && "enabled" in saved && "extraVigor" in saved) {
      return {
        enabled: saved.enabled === true,
        extraVigor: typeof saved.extraVigor === "string" && saved.extraVigor ? saved.extraVigor : null,
      };
    }
  } catch { /* unavailable storage or an old preference */ }
  return { enabled: false, extraVigor: "Lynae" };
}

export const matrixState = savedPreference();

export function saveMatrixPreference(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(matrixState));
  } catch { /* unavailable storage */ }
}
