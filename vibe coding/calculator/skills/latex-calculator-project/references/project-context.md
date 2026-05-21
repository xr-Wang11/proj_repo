# Project Context

## Repo Map

- `core/`: parser, evaluator, math, formatting, function definitions
- `cli/`: command-line entry path from earlier project stages
- `web/`: legacy native web frontend and runtime entry
- `web-vue/`: active Vue 3 frontend
- `scripts/`: project utility scripts
- `tests/`: existing tests

## Active Frontend

- Primary app: `web-vue/`
- Important files:
  - `web-vue/src/App.vue`
  - `web-vue/src/composables/useEquationSystem.js`
  - `web-vue/src/solver/linear-system.js`
  - `web-vue/src/utils/result-display.js`
  - `web-vue/src/utils/equation-plot.js`
  - `web-vue/src/components/EquationSystemResultPanel.vue`
  - `web-vue/src/components/EquationPlotPanel.vue`

## Current Functional Scope

- Standard calculator input with LaTeX/result display
- Complex number support
- rectangular/polar conversion
- saved user-defined functions
- Chinese UI
- diagnostic log panel
- equation mode with variable declaration
- single-variable polynomial equation solving
- two-variable polynomial system solving
- linear system solving for multi-variable cases
- decimal/fraction result switching
- significant-digits slider
- 2D plotting for two-variable systems

## Equation Solving Behavior

- One declared variable:
  - treat as polynomial root finding
  - allow complex roots
  - show multiplicity when clustered
- Two declared variables:
  - try two-variable polynomial solving
  - if all equations are linear, keep exact linear solving path
  - plotting is only shown in this mode
- Three or more declared variables:
  - keep linear-system behavior
  - nonlinear higher-dimensional solving is not yet supported

## Plotting Behavior

- Plotting is driven from `web-vue/src/utils/equation-plot.js`
- UI is in `web-vue/src/components/EquationPlotPanel.vue`
- Default behavior:
  - use declared variables for axes
  - only draw real-plane curves
  - real solutions appear as red points
- There is a reserved plotting port/model so later a standalone plot window can reuse the same model

## UI / Product Constraints

- Keep visible interface text in Chinese unless the user asks otherwise.
- Do not update `web/index.standalone.html` unless explicitly requested.
- Preserve existing cursor/input behavior unless the user asks to change it.
- Prefer incremental changes over re-architecting the app.

## Build / Run Notes

- Build command:
  - run `npm.cmd run build` inside `web-vue/`
- Known warning:
  - Vite may warn that `calculator-runtime.js` in `index.html` is not bundled as a module
  - this warning has been treated as non-blocking
- Local batch helpers already exist in `web-vue/` for open/build flows

## Common Development Pattern

1. Inspect affected files in `web-vue/src/`
2. Keep core logic in utilities/composables/solver files
3. Update Vue panel/component to expose the feature
4. Run `npm.cmd run build`
5. Summarize changed behavior and remaining limitations

## Known Limitations

- Numerical solving can still show floating-point artifacts
- Non-polynomial nonlinear systems such as `sin(x) + y = 0` are not generally supported in equation mode
- Plotting is currently real-plane only
- Infinite-solution cases are still mostly surfaced as errors rather than fully parameterized solution sets
