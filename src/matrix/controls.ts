import { TWO_VIGOR } from "./rules.js";
import { matrixState, saveMatrixPreference } from "./state.js";

export function matrixControls(names: Iterable<string>, escape: (value: string) => string): string {
  const options = [...new Set(names)].filter((name) => !TWO_VIGOR.has(name)).sort();
  return `<div class="tcopt">`
    + `<label class="tcopt-role" title="Choose a lineup by combined DPS within character vigor limits.">`
    + `<input id="matrixVigor" type="checkbox"${matrixState.enabled ? " checked" : ""}>Respect Matrix vigor</label>`
    + `<div class="tcopt-desc"${matrixState.enabled ? "" : " hidden"}>`
    + `<label class="tcopt-head" for="matrixExtraVigor">Extra-vigor character (optional)`
    + `<select id="matrixExtraVigor" class="tcselect"><option value="">None</option>`
    + options.map((name) => `<option value="${escape(name)}"${matrixState.extraVigor === name ? " selected" : ""}>${escape(name)}</option>`).join("")
    + `</select></label>`
    + `<p>Shorekeeper, Verina, Mornye, Suisui, Baizhi and Buling get 2 vigor; others get 1. Rover forms share vigor.</p>`
    + `<p>Chooses teams by combined DPS. Pins may be omitted. Gear inventory and Matrix scores are not checked.</p>`
    + `</div></div>`;
}

/** The host applies its row cap before calling the commit callback. */
export function changeMatrixControl(target: EventTarget | null, commit: (change: () => () => void) => void): boolean {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return false;
  if (target.id !== "matrixVigor" && target.id !== "matrixExtraVigor") return false;
  commit(() => {
    const previous = { ...matrixState };
    if (target instanceof HTMLInputElement) matrixState.enabled = target.checked;
    else matrixState.extraVigor = target.value || null;
    return () => {
      Object.assign(matrixState, previous);
      if (target instanceof HTMLInputElement) target.checked = previous.enabled;
      else target.value = previous.extraVigor ?? "";
    };
  });
  saveMatrixPreference();
  return true;
}
