Matrix lineup selection is isolated here. `select.ts` accepts character names, chain levels and DPS without depending on the app's model or engine.

The selector maximizes combined DPS, breaking ties by distinct limited characters. It retains up to 2048 vigor states per step, preserves a strongest-first baseline, and reports whether pruning prevented an optimality guarantee. Reused characters must use the same chain level; Rover forms have independent chains. Gear inventory, circuits, encounter effects and Matrix scores are outside its scope.

Integration points:
- `page/model.ts`: include interchangeable support alternatives when enabled.
- `page/filterbar.ts`: render the controls.
- `page/table.ts`: handle control changes and display the selected lineup by DPS. Pins do not override vigor.

Preferences use local storage, like the owned-roster checkbox. Update the permanent allowances in `rules.ts` if the game changes them; the phase's extra-vigor character is selected in the UI.

Rules: https://wuthering.th.gl/db/endstate-matrix/matrix_8 and https://gachaflex.com/wuwa/matrix-planner
